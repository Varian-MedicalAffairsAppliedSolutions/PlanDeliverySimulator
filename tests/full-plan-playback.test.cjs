const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../RP_Delivery_Simulator.html'),'utf8');
function playback(dual,transitionSeconds){
 const queue=[],visits=[],transitions=[];
 const beams=[2,4,3].map((count,b)=>({isRDSMachine:dual,interBeamTransitionTime:transitionSeconds,interBeamTransitionDetails:{totalTime:transitionSeconds},controlPoints:Array.from({length:count},(_,i)=>({gantryAngle:b*30+i,collimatorAngle:0,couchAngle:0,mlcPositionData:dual?[{type:'MLCX1',positions:Array(56).fill(i+b)},{type:'MLCX2',positions:Array(58).fill(i-b)}]:[{type:'MLCX',positions:Array(120).fill(i+b)}]}))}));
 const c={rtPlanData:{beams},allBeamsProcessedData:beams.map(b=>b.controlPoints.map(cp=>({cp,segmentDuration:.02}))),processedData:[],planCpOffsets:[],isPlaying:true,isSimulatingAllBeams:true,currentCP:0,selectedBeamIndex:0,currentBeamIndexForFullSim:0,globalCPIndex:0,totalPlanElapsedTime:0,totalMuDeliveredForBeeps_currentBeam:0,animationFrameId:null,
 segmentStartTime:null,currentSegmentIndex:0,beamSelector:{},cpSlider:{value:0},totalCPsSpan:{},cpTrack:null,xyTimePlotsContainer:{style:{}},playPauseBtn:{},
 setTimeout(fn){queue.push(fn);return queue.length;},clearTimeout(){},
 updateCurrentSpeedLimits(){},prepareBeamDerivedData(){},renderCpTrackBar(){},drawAllStaticParameterPlots(){},drawAllXYTimePlots(){},setupRadialPlotInteractions(){},triggerBeeps(){},
 updateParamDisplay(state){if(state){transitions.push(c.currentBeamIndexForFullSim);assert.equal(state.mlcPositionData.length,dual?2:1);}else {c.globalCPIndex=c.mapLocalToGlobal(c.currentBeamIndexForFullSim,c.currentCP);c.cpSlider.value=c.globalCPIndex;visits.push([c.currentBeamIndexForFullSim,c.currentCP]);}}
 };
 vm.createContext(c);
 function extract(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a);vm.runInContext(html.slice(a,b),c);}
 extract('            function computePlanCpOffsets()', '            function prepareBeamDerivedData(');
 extract('            function initVisualization()', '            // Axis presets affect display');
 extract('function animateAllBeams()', '            function lerp(');
 extract('function interpolateAngle(start,', '\t            function interpolateAngleDirected');
 extract('            function animateTransition(', '            function triggerBeeps(');
 c.initVisualization();c.animateAllBeams();
 let steps=0;while(queue.length&&steps++<1000)queue.shift()();
 assert.ok(steps<1000,'Playback repeated the transition instead of reaching the next beam');
 assert.equal(c.isPlaying,false);assert.equal(c.currentBeamIndexForFullSim,2);assert.equal(c.currentCP,2);assert.equal(c.globalCPIndex,8);
 assert.equal(c.cpSlider.value,8);assert.equal(c.playPauseBtn.textContent,'Play Full Plan');
 assert.deepEqual([...new Set(visits.map(v=>v[0]))],[0,1,2]);
 if(transitionSeconds)assert.deepEqual([...new Set(transitions)],[0,1]);
 assert.ok(Math.abs(c.totalPlanElapsedTime-(9*.02+2*transitionSeconds))<1e-8);
}
for(const dual of [true,false])for(const seconds of [0,.1])test(`${dual?'Dual':'Single'}-layer full plan completes all beams with ${seconds}s transitions`,()=>playback(dual,seconds));
