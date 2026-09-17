const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const P=require('../lib/calibration-plots.js'),C=require('../lib/timing-calibration.js'),L=require('../lib/legacy-timing.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function example(){
 const positions=[359,0,1];
 const log={metadata:{samplingIntervalMs:1000},samples:positions.map((g,i)=>({time:20+i,actual:{gantry:g,collimator:0,cp:i,mu:100+i*5,leaves:[i*2,10]}}))};
 const beam={totalMeterset:10,controlPoints:positions.map((g,i)=>({gantryAngle:g,collimatorAngle:0,cumulativeMetersetWeight:i/2,mlcPositionData:[{type:'MLCX',positions:[i*2,10]}]}))};
 const pair={beam,window:{start:0,end:2,cpStart:0},measuredSeconds:3};
 const data=beam.controlPoints.map((cp,i)=>({cp,cumulativeSimTime:1+i*2,segmentDuration:2,deltaGantryAngle:1,deltaCollAngle:0,maxLeafTravel:2}));
 return {log,pair,data};
}

test('comparison unwraps positions before averaging and derives rates from raw samples',()=>{
 const e=example(),r=P.buildComparison(e.log,e.pair,e.data);
 assert.deepEqual(r.raw.gantry.map(p=>p.y),[359,360,361,361]);
 assert.deepEqual(r.raw.gantrySpeed.map(p=>p.y),[1,1]);
 assert.deepEqual(r.raw.mlcSpeed.map(p=>p.y),[2,2]);
 assert.deepEqual(r.raw.doseRate.map(p=>p.y),[300,300]);
 assert.deepEqual(r.raw.mu.map(p=>p.y),[0,5,10,10]);
 near(r.raw.cp.at(-1).x,3);near(r.simulated.cp.at(-1).x,5);
 near(r.simulated.gantrySpeed[0].y,0); // explicit startup interval
 near(r.simulated.gantrySpeed.at(-1).y,.5);
 near(r.simulated.doseRate.at(-1).y,150);
});

test('averaging uses only one delivery and never mutates measured time or predictions',()=>{
 const e=example(),r=P.buildComparison(e.log,e.pair,e.data),before=JSON.stringify(r);
 const smoothed=P.movingAverage([{x:0,y:0},{x:1,y:9},{x:2,y:0}],2);
 assert.deepEqual(smoothed.map(p=>p.y),[4.5,3,4.5]);
 P.datasets(r,'mu',.2);P.datasets(r,'mu',2);
 assert.equal(JSON.stringify(r),before);assert.throws(()=>P.movingAverage([],0),/positive/);
});

test('calibrated preview scales its own clock and rates, not positions or measured traces',()=>{
 const e=example(),r=P.buildComparison(e.log,e.pair,e.data);
 const pos=P.datasets(r,'mu',.4,1.2),speed=P.datasets(r,'mlcSpeed',.4,1.2);
 near(pos[3].data.at(-1).x,6);near(pos[3].data.at(-1).y,10);
 near(speed[3].data.at(-1).y,1/1.2);
 assert.equal(pos[0].data,r.raw.mu);assert.equal(pos[2].data,r.simulated.mu);
 assert.equal(P.datasets(r,'cp',.4).length,3);
});

function dom(){
 const elements=new Map(),charts=[];let saved;
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,hidden:false,disabled:false,textContent:'',files:[],children:[],events:{},addEventListener(k,fn){this.events[k]=fn;},replaceChildren(){this.children=[];},appendChild(c){this.children.push(c);},click(){return this.events.click?.();}});return elements.get(id);};
 for(const [id,value]of Object.entries(C.DEFAULT_LIMITS))get(id).value=String(value);
 get('calibrationAverage').value='.4';get('calibrationPreview').checked=true;get('calibrationDoseRate').value='600';get('calibrationLabel').value='Test';
 class Chart {constructor(canvas,config){this.canvas=canvas;this.config=config;charts.push(this);}destroy(){this.destroyed=true;}resetZoom(){this.reset=true;}}
 const document={getElementById:get,createElement:()=>({click(){}}),querySelectorAll:()=>Array.from(elements.values())};
 const context=vm.createContext({document,Chart,TimingCalibration:C,LegacyTiming:L,CalibrationPlots:P,Blob,setTimeout:fn=>fn(),URL:{createObjectURL(blob){saved=blob;return 'blob:test';},revokeObjectURL(){}}});
 return {get,document,Chart,charts,context,getSaved:()=>saved};
}

test('panel renders eight charts and destroys stale charts when changing delivery or clearing',()=>{
 const d=dom(),panel=new P.Panel(d.document,d.Chart),e=example(),comparison=P.buildComparison(e.log,e.pair,e.data);
 panel.set([{label:'Arc 1',comparison},{label:'Arc 2',comparison}],1.1);
 assert.equal(d.charts.length,8);assert.equal(d.get('calibrationPlots').hidden,false);
 assert.match(d.get('calibrationPlotSummary').textContent,/Measured 3.00 s · Standard 5.00 s/);
 d.get('calibrationArc').value='1';d.get('calibrationArc').events.change();
 assert.ok(d.charts.slice(0,8).every(c=>c.destroyed));assert.equal(d.charts.length,16);
 d.get('calibrationAverage').value='0';d.get('calibrationAverage').events.change();
 assert.match(d.get('calibrationPlotSummary').textContent,/Enter an averaging/);
 panel.clear();assert.equal(d.get('calibrationPlots').hidden,true);
});

test('standalone page analysis, plots, download and stale-input handling share Legacy predictions',async()=>{
 const d=dom(),e=example();
 const beam=e.pair.beam;beam.mlcDefinitions=[];beam.controlPoints.forEach(cp=>cp.doseRateSet=600);
 const log=e.log;log.leafCount=120;
 const expected=L.predict(beam,C.DEFAULT_LIMITS,600);
 d.context.TimingCalibration={...C,readFile:async()=>log,reconstruct:()=>[{...e.pair,measuredSeconds:expected.totalTime*1.1}],diagnostics:()=>({outsideDeliverySeconds:2})};
 d.get('calibrationLogs').files=[{name:'synthetic.bin'}];
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../lib/standalone-calibrator.js'),'utf8'),d.context);
 await d.get('analyzeCalibration').click();
 assert.equal(d.get('downloadCalibration').disabled,false);assert.equal(d.charts.filter(c=>!c.destroyed).length,8);
 assert.match(d.get('calibrationReport').textContent,/correction 1.1000/);
 d.get('downloadCalibration').click();const profile=JSON.parse(await d.getSaved().text());
 near(profile.parameters.timeScale,1.1);assert.ok(!JSON.stringify(profile).includes('raw'));
 d.get('maxGantrySpeedInput').value='5';d.get('maxGantrySpeedInput').events.change();
 assert.equal(d.get('downloadCalibration').disabled,true);assert.equal(d.get('calibrationPlots').hidden,true);
});

test('standalone has local script dependencies and required accessible chart canvases',{skip:!fs.existsSync(path.join(__dirname,'../RP_Trajectory_Timing_Calibrator.html'))},()=>{
 const html=fs.readFileSync(path.join(__dirname,'../RP_Trajectory_Timing_Calibrator.html'),'utf8');
 for(const match of html.matchAll(/<script[^>]*src="([^"]+)"/g))assert.ok(fs.existsSync(path.join(__dirname,'..',match[1])));
 for(const key of Object.keys(P.METRICS))assert.ok(html.includes(`id="calibrationPlot_${key}"`));
});
