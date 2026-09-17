const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('../lib/axis-response-timing.js'),C=require('../lib/timing-calibration.js'),L=require('../lib/legacy-timing.js'),P=require('../lib/calibration-plots.js');
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
function beam(reversal=false,n=40){
 return {totalMeterset:30,mlcDefinitions:[],controlPoints:Array.from({length:n+1},(_,i)=>({gantryAngle:i*2,collimatorAngle:0,doseRateSet:600,cumulativeMetersetWeight:i/n,
  mlcPositionData:[{type:'MLCX',positions:[reversal?(i%2?7.5:0):i*7.5,400]}]}))};
}
function pair(b,group=0){
 const baseline=L.predict(b,C.DEFAULT_LIMITS,600),actual=A.predict(b,C.DEFAULT_LIMITS,{leafResponseAcceleration:76});
 return {beam:b,baselineData:baseline.data,baselineSeconds:baseline.totalTime,measuredSeconds:actual.totalTime,
  measuredCpTimes:actual.data.map(r=>r.cumulativeSimTime),source:'log-commanded-control-points',group};
}

test('constant demands retain axis speed limits instead of globally slowing the timeline',()=>{
 const b=beam(),p=A.predict(b,C.DEFAULT_LIMITS,{leafResponseAcceleration:76});
 near(p.data[10].deltaGantryAngle/p.data[10].segmentDuration,6);
 near(p.totalTime,40/3);
 near(p.data[10].maxLeafTravel/p.data[10].segmentDuration,22.5);
});

test('signed leaf reversals create local response delay without forced stops at every CP',()=>{
 const straight=A.predict(beam(false),C.DEFAULT_LIMITS,{leafResponseAcceleration:76});
 const reversal=A.predict(beam(true),C.DEFAULT_LIMITS,{leafResponseAcceleration:76});
 assert.ok(reversal.totalTime>straight.totalTime);
 assert.ok(reversal.totalTime<straight.totalTime*2);
 reversal.data.slice(0,-1).forEach(row=>{
  assert.ok(row.deltaGantryAngle/row.segmentDuration<=6+1e-8);
  assert.ok(row.maxLeafTravel/row.segmentDuration<=25+1e-8);
 });
});

test('dose-limited segments respect prescribed MU/min and changing dose demand',()=>{
 const b=beam();b.totalMeterset=1000;
 const p=A.predict(b,C.DEFAULT_LIMITS,{leafResponseAcceleration:76});
 for(const row of p.data.slice(0,-1))assert.ok(row.muInSegment/row.segmentDuration*60<=600+1e-7);
 assert.ok(p.totalTime>=100-1e-8);
});

test('fit learns one portable parameter with held-out validation and no replay trajectory',()=>{
 const pairs=[pair(beam(true,40)),pair(beam(true,50))],p=A.fit(pairs,C.DEFAULT_LIMITS);
 assert.equal(p.model,C.LOCAL_MODEL);assert.equal(p.parameters.leafResponseAcceleration,76);
 assert.equal(p.calibration.deliveryCount,2);assert.match(p.calibration.validation,/arc-out/);
 near(p.calibration.heldOut.windowMaeSeconds,0);
 const encoded=JSON.stringify(p);assert.ok(!encoded.includes('measuredCpTimes'));assert.ok(!encoded.includes('mlcPositionData'));
 const b=beam(true,60),result=A.predict(b,p.nominalLimits,p.parameters);assert.ok(result.totalTime>pairs[1].measuredSeconds);
});

test('profile application retimes locally, round-trips JSON, and preserves uncalibrated data copies',()=>{
 const training=pair(beam(true)),profile=C.validateProfile(JSON.parse(JSON.stringify(A.fit([training],C.DEFAULT_LIMITS))));
 assert.match(profile.calibration.validation,/Contiguous-window/);
 assert.equal(profile.calibration.heldOut.arrivalMaeSeconds,null);
 const copy=training.baselineData.map(row=>({...row})),original=JSON.stringify(training.baselineData);
 const total=C.apply(copy,training.baselineSeconds,profile,training.beam);
 near(total,training.measuredSeconds);assert.equal(JSON.stringify(training.baselineData),original);
 assert.throws(()=>C.validateProfile({...profile,parameters:{leafResponseAcceleration:NaN}}),/Invalid local/);
 assert.throws(()=>C.validateProfile(profile,{...C.DEFAULT_LIMITS,maxGantrySpeedInput:5}),/Restore profile/);
 assert.throws(()=>C.apply(copy,total,profile),/beam is required/);
});

test('unsupported layouts and missing arrival targets fail before a profile is fitted',()=>{
 assert.throws(()=>A.fit([{...pair(beam()),measuredCpTimes:null}],C.DEFAULT_LIMITS),/arrival/);
 assert.throws(()=>A.predict({...beam(),isRDSMachine:true},C.DEFAULT_LIMITS,{leafResponseAcceleration:76}),/single-layer/);
 const b=beam();b.controlPoints.at(-1).cumulativeMetersetWeight=100;
 assert.throws(()=>A.prepare(b,C.DEFAULT_LIMITS),/normalized/);
});

test('predicted smoothing weights elapsed time rather than duplicate CP endpoints',()=>{
 const step=[{x:0,y:0},{x:1,y:0},{x:1,y:10},{x:4,y:10}];
 const smooth=P.averagePrediction(step,2,.25);
 near(smooth.find(p=>p.x===1).y,5);
 near(smooth.find(p=>p.x===2).y,10);
 near(smooth.find(p=>p.x===.5).y,10/3);
});

test('simulator applies local profile and rejects a beam incompatible with it',()=>{
 const h=require('./legacy-harness.cjs')(),b=beam(true),profile=A.fit([pair(b)],C.DEFAULT_LIMITS);
 h.context.testPlan={primaryDoseRate:600,beams:[b]};h.context.testProfile=profile;
 h.run('rtPlanData=testPlan;loadedTimingProfile=testProfile;');h.get('calibrationEnabled').checked=true;
 h.run('processAllBeamsForTimings()');
 near(h.run('rtPlanData.beams[0].totalTime'),A.predict(b,C.DEFAULT_LIMITS,profile.parameters).totalTime);
 assert.equal(h.run('activeTimingMetadata.model'),C.LOCAL_MODEL);
 h.run('rtPlanData.beams[0].isRDSMachine=true;processAllBeamsForTimings()');
 assert.equal(h.get('calibrationEnabled').checked,false);
});
