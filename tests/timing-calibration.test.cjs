const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../lib/timing-calibration.js');
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
function beam(mu=100,angle=0,n=2){return {totalMeterset:mu,controlPoints:Array.from({length:n},(_,i)=>({gantryAngle:angle*i/(n-1),collimatorAngle:0,cumulativeMetersetWeight:i/(n-1),doseRateSet:600,mlcPositionData:[]}))};}
function csv({scale=1,interval=20,subbeams=1,reverse=false,truncate=0,partial=false,leafCount=2}={}){
 const h=['Sampling Inteval:','Number of Subbeams:','Axis Scale:','Is Truncated?','Number of Snapshots:','Control Point Actual','Control Point Expected','MU Actual in units of MU','MU Expected in units of MU','Beam Hold Actual','Gantry Actual in units of degrees','Gantry Expected in units of degrees','Collimator Actual in units of degrees','Collimator Expected in units of degrees','Leaf 1 Actual in units of cm','Leaf 1 Expected in units of cm','Leaf 2 Actual in units of cm','Leaf 2 Expected in units of cm'];
 for(const j of ['X1','X2','Y1','Y2'])h.push(`Jaws ${j} Actual in units of cm`,`Jaws ${j} Expected in units of cm`);
 const rows=Array.from({length:102},(_,i)=>{
  const progress=Math.min(i,100)/100,cp=partial?progress*.7:progress;
  return [i===0?interval:'',i===0?subbeams:'',i===0?scale:'',i===0?truncate:'',i===0?102:'',cp,cp,progress*20,progress*20,i>100?2:0,(scale===1||scale===3)?180-2*progress:2*progress,(scale===1||scale===3)?180-2*progress:2*progress,(scale===1||scale===3)?180:0,(scale===1||scale===3)?180:0,progress,progress+.1,2,2,0,0,1,1,0,0,1,1];
 });
 for(let leaf=3;leaf<=leafCount;leaf++){h.push(`Leaf ${leaf} Actual in units of cm`,`Leaf ${leaf} Expected in units of cm`);rows.forEach(row=>row.push(2,2));}
 let order=h.map((_,i)=>i);if(reverse)order.reverse();
 return [order.map(i=>h[i]).join(','),...rows.map(r=>order.map(i=>r[i]).join(','))].join('\r\n');
}

test('CSV maps headers, expected/actual leaves and units without fixed offsets',()=>{
 const log=C.parseCsv(csv({reverse:true,interval:40}));
 near(log.samples[50].time,2);
 near(log.samples[50].actual.leaves[0],5);
 near(log.samples[50].expected.leaves[0],6);
 near(log.samples[50].actual.leaves[1],20);
 near(log.samples[50].actual.gantry,1);
 assert.equal(log.leafCount,2);
 assert.deepEqual(C.parseCsv(csv({scale:3})).samples,C.parseCsv(csv({scale:1})).samples);
 const iec=C.parseCsv(csv({scale:2}));near(iec.samples[50].actual.gantry,1);
});

test('subbeam reconstruction uses commanded knots and measured elapsed time',()=>{
 const log=C.parseCsv(csv()),pairs=C.reconstruct(log,600);
 assert.equal(pairs.length,1);near(pairs[0].beam.totalMeterset,20);near(pairs[0].measuredSeconds,2.02);
 near(pairs[0].beam.controlPoints[0].mlcPositionData[0].positions[0],1);
 assert.equal(pairs[0].source,'log-commanded-control-points');
});

test('truncated, partial, ambiguous and malformed logs are rejected',()=>{
 assert.throws(()=>C.parseCsv(csv({truncate:1})),/Truncated/);
 assert.throws(()=>C.parseCsv(csv({scale:99})),/axis scales/);
 assert.throws(()=>C.deliveryWindows(C.parseCsv(csv({subbeams:2}))),/header declares/);
 assert.throws(()=>C.deliveryWindows(C.parseCsv(csv({partial:true}))),/boundaries/);
 assert.throws(()=>C.parseCsv(csv().replace('Leaf 1 Actual in units of cm','Unexpected leaf')),/Missing CSV|Invalid|layout|leaf/i);
 const bad=csv().split('\r\n');const cells=bad[10].split(',');cells[7]='-5';bad[10]=cells.join(',');
 assert.throws(()=>C.parseCsv(bad.join('\r\n')),/Invalid|resets|CSV/);
});

test('robust whole-beam fit resists an outlier and does not memorize individual arc times',()=>{
 const pairs=[1.2,1.21,1.19,2].map((ratio,i)=>({baselineSeconds:10+i,measuredSeconds:(10+i)*ratio,source:'log-commanded-control-points'}));
 const profile=C.fit(pairs,C.DEFAULT_LIMITS);near(profile.parameters.timeScale,1.205);
 near(C.apply([],25,profile),25*1.205);
 assert.equal(profile.model,'legacy-calibrated-v1');
 assert.ok(profile.calibration.heldOutMaeSeconds>0);
 assert.ok(!JSON.stringify(profile).includes('mlcPositionData'));
});

test('whole-log holdout excludes every arc from the held-out file',()=>{
 const pairs=[{group:0,r:1},{group:0,r:1},{group:1,r:2},{group:1,r:2}].map(p=>({...p,baselineSeconds:10,measuredSeconds:10*p.r}));
 const profile=C.fit(pairs,C.DEFAULT_LIMITS);near(profile.calibration.heldOutMaeSeconds,10);
 assert.match(profile.calibration.validation,/log-out/);
});

test('moving window affects diagnostics, not calibration totals',()=>{
 const log=C.parseCsv(csv());
 const before=C.fit(C.reconstruct(log).map(p=>({...p,baselineSeconds:2})),C.DEFAULT_LIMITS);C.diagnostics(log,.1);C.diagnostics(log,.8);
 const after=C.fit(C.reconstruct(log).map(p=>({...p,baselineSeconds:2})),C.DEFAULT_LIMITS);near(before.parameters.timeScale,after.parameters.timeScale);
 near(C.diagnostics(log,.4).loggedSeconds,2.04);
 near(C.diagnostics(log,.4).outsideDeliverySeconds,.02);
});

test('mismatched MU cannot be presented as a verified plan/log pair',()=>{
 const pairs=C.reconstruct(C.parseCsv(csv()));
 const report=C.comparePlan({beams:[beam(100,2)]},pairs);
 assert.equal(report.consistent,false);assert.match(report.issues.join(' '),/MU/);
});

test('profile compatibility prevents applying an old model or changed baseline',()=>{
 const p=C.fit([{baselineSeconds:10,measuredSeconds:12}],C.DEFAULT_LIMITS);
 assert.throws(()=>C.validateProfile(p,{...C.DEFAULT_LIMITS,maxGantrySpeedInput:5.25}),/Restore profile/);
 assert.throws(()=>C.validateProfile(p,{...C.DEFAULT_LIMITS,segmentOverheadMsInput:0}),/Restore profile/);
 assert.throws(()=>C.validateProfile({...p,model:'throughput-v2'}),/calibration profile is unsupported/);
 assert.throws(()=>C.validateProfile({...p,nominalLimits:{}}),/Profile baseline/);
 assert.throws(()=>C.fit([{baselineSeconds:NaN,measuredSeconds:12}],C.DEFAULT_LIMITS),/baseline/i);
});

test('all authored browser scripts parse',()=>{
 for(const file of ['RP_Delivery_Simulator.html','RP_MultiPlan_Comparator.html']){
  for(const match of fs.readFileSync(path.join(__dirname,'..',file),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 }
});

test('Legacy integration scales timestamps and beams once, preserves transitions and restores original results',()=>{
 const h=require('./legacy-harness.cjs')();
 h.context.plan={primaryDoseRate:600,beams:[beam(100,0,3),beam(150,10,3)]};
 h.run('rtPlanData=plan; processAllBeamsForTimings()');
 const before=h.run('rtPlanData.beams.map(b=>b.totalTime)');
 const transition=h.run('rtPlanData.beams[0].interBeamTransitionTime');
 h.run('loadedTimingProfile=TimingCalibration.fit([{baselineSeconds:10,measuredSeconds:12}],calibrationSettings());');
 h.get('calibrationEnabled').checked=true;
 h.run('processAllBeamsForTimings()');
 near(h.run('rtPlanData.beams[0].totalTime'),before[0]*1.2);
 near(h.run('rtPlanData.beams[1].totalTime'),before[1]*1.2);
 near(h.run('rtPlanData.beams[0].interBeamTransitionTime'),transition);
 near(h.run('allBeamsProcessedData[0].at(-1).cumulativeSimTime'),before[0]*1.2);
 assert.equal(h.run('activeTimingMetadata.model'),'legacy-calibrated-v1');
 h.run('processAllBeamsForTimings()');
 near(h.run('rtPlanData.beams[0].totalTime'),before[0]*1.2);
 h.get('calibrationEnabled').checked=false;h.run('processAllBeamsForTimings()');
 near(h.run('rtPlanData.beams[0].totalTime'),before[0]);
 h.get('calibrationEnabled').checked=true;h.get('maxGantrySpeedInput').value='5.25';
 h.run('processAllBeamsForTimings()');
 assert.equal(h.get('calibrationEnabled').checked,false);
 assert.match(h.get('timingProfileStatus').textContent,/disabled/);
 assert.equal(h.run('activeTimingMetadata.model'),'legacy');
});

test('modal profile load validates before replacing state and restores saved settings',async()=>{
 const h=require('./legacy-harness.cjs')();
 const profile=C.fit([{baselineSeconds:10,measuredSeconds:11}],C.DEFAULT_LIMITS,'Test machine 6X');
 h.get('openCalibration').click();assert.equal(h.get('calibrationModal').open,true);
 h.get('maxGantrySpeedInput').value='12';
 const target={files:[{text:async()=>JSON.stringify(profile)}],value:'file'};
 await h.get('timingProfileFile').events.change({target});
 assert.equal(h.get('maxGantrySpeedInput').value,6);
 assert.equal(h.get('calibrationEnabled').checked,true);
 assert.match(h.get('timingProfileStatus').textContent,/1.1000/);
 target.files=[{text:async()=>JSON.stringify({...profile,model:'throughput-v2'})}];
 await h.get('timingProfileFile').events.change({target});
 assert.equal(h.run('loadedTimingProfile.model'),C.MODEL);
 assert.match(h.get('calibrationReport').textContent,/calibration profile is unsupported/);
 h.get('clearTimingProfile').click();assert.equal(h.run('loadedTimingProfile'),null);
 assert.equal(h.get('calibrationEnabled').checked,false);
 h.get('closeCalibration').click();assert.equal(h.get('calibrationModal').open,false);
});


test('modal analyzes CSV using real Legacy timing and enables only after review',async()=>{
 const h=require('./legacy-harness.cjs')();
 h.get('calibrationDoseRate').value='600';
 h.get('calibrationLabel').value='Synthetic 6X';
 const source=csv({leafCount:120});
 h.get('calibrationLogs').files=[{text:async()=>source}];
 await h.get('fitCalibration').events.click();
 const p=h.run('loadedTimingProfile');
 assert.equal(p.model,C.LOCAL_MODEL);
 assert.ok(p.parameters.leafResponseAcceleration >= 20);
 assert.equal(p.parameters.timeScale,undefined);
 assert.equal(h.get('calibrationEnabled').checked,false);
 assert.match(h.get('calibrationReport').textContent,/1 arcs from 1 logs/);
 assert.match(h.get('calibrationReport').textContent,/Contiguous-window holdout/);
 h.get('calibrationEnabled').checked=true;
 h.get('calibrationEnabled').events.change();
 assert.match(h.get('timingModelStatus').textContent,/Selected model: Calibrated/);
 h.get('calibrationLogs').files=[{text:async()=>csv({truncate:1,leafCount:120})}];
 await h.get('fitCalibration').events.click();
 assert.equal(h.run('loadedTimingProfile'),p);
 assert.match(h.get('calibrationReport').textContent,/Truncated/);
});

test('calibration scales startup time and segment durations consistently',()=>{
 const p=C.fit([{baselineSeconds:12,measuredSeconds:15}],C.DEFAULT_LIMITS);
 const rows=[{cumulativeSimTime:2,segmentDuration:10,gantryCapability:50},{cumulativeSimTime:12}];
 near(C.apply(rows,12,p),15);
 near(rows[0].cumulativeSimTime,2.5);near(rows[0].segmentDuration,12.5);
 near(rows[1].cumulativeSimTime,15);near(rows[0].gantryCapability,40);
});

test('accept applies the reviewed profile to this session, restores its settings and closes the modal',()=>{
 const h=require('./legacy-harness.cjs')();
 h.run('refreshCalibrationStatus()');assert.equal(h.get('acceptCalibration').disabled,true);
 const p=C.fit([{baselineSeconds:10,measuredSeconds:11}],C.DEFAULT_LIMITS,'Reviewed');
 h.run(`loadedTimingProfile=${JSON.stringify(p)}; refreshCalibrationStatus();`);
 assert.equal(h.get('acceptCalibration').disabled,false);
 h.get('maxGantrySpeedInput').value='4';
 h.get('openCalibration').click();h.get('acceptCalibration').click();
 assert.equal(h.get('calibrationEnabled').checked,true);
 assert.equal(Number(h.get('maxGantrySpeedInput').value),6);
 assert.equal(h.get('calibrationModal').open,false);
 assert.match(h.get('timingModelStatus').textContent,/Calibrated/);
 h.get('clearTimingProfile').click();assert.equal(h.get('acceptCalibration').disabled,true);
});
