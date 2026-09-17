const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Player}=require('../lib/log-playback.js');
function log(){return {metadata:{samplingIntervalMs:20},samples:Array.from({length:101},(_,i)=>({time:i*.02,actual:{cp:i<60?i/10:(i-60)/10,mu:i<60?i:0,hold:i>=20&&i<80?2:0,leaves:[i,-i]},expected:{leaves:[999,999]}}))};}
test('playback selects original actual snapshots, keeps holds and resets, and never interpolates',()=>{
 const input=log(),p=new Player(input);
 assert.equal(p.seek(.415).sample,input.samples[20]);assert.equal(p.snapshot().sample.actual.hold,2);
 assert.equal(p.seek(1.21).sample.actual.mu,0);
 assert.equal(p.snapshot().sample,input.samples[60]);assert.equal(p.duration,2);
});
test('wall-clock playback catches up after slow frames without accumulating segment delay',()=>{
 const p=new Player(log());p.play(1000);
 assert.equal(p.tick(1021).index,1);assert.equal(p.tick(1717).index,35);
 assert.equal(p.tick(2999).index,99);assert.equal(p.tick(4100).index,100);
 assert.equal(p.time,2);assert.equal(p.playing,false);
});
test('pause, resume, seek while playing, reset and replay preserve recorded time',()=>{
 const p=new Player(log());p.play(100);p.pause(605);assert.equal(p.time,.505);
 p.tick(9000);assert.equal(p.time,.505);
 p.play(10000);assert.equal(p.tick(10100).index,30);
 p.seek(1.5,11000);assert.equal(p.tick(11100).index,80);
 p.pause(11100);p.seek(0);assert.equal(p.snapshot().index,0);assert.equal(p.playing,false);
 p.seek(99);p.play(15000);assert.equal(p.tick(15000).index,0);
});

test('visual replay maps native banks/jaws into the existing BEV without using expected values',()=>{
 const {buildReplay}=require('../lib/log-playback.js');
 const sample={time:0,actual:{gantry:180,collimator:170,couch:180,cp:4,mu:2,hold:2,jaws:[2,3,4,5],leaves:[...Array(60).fill(12),...Array(60).fill(8)]},expected:{leaves:Array(120).fill(999)}};
 const log={metadata:{samplingIntervalMs:20,axisScale:1,mlcModel:2},leafCount:120,samples:[sample,{...sample,time:.02}]};
 const replay=buildReplay(log),cp=replay.data[0].cp;
 assert.equal(cp.gantryAngle,0);assert.equal(cp.collimatorAngle,10);assert.equal(cp.couchAngle,0);
 assert.deepEqual(cp.asymx,[-2,3]);assert.deepEqual(cp.asymy,[-4,5]);
 assert.deepEqual(cp.mlcPositionData[0].positions,[...Array(60).fill(-8),...Array(60).fill(12)]);
 assert.equal(replay.beam.mlcDefinitions[0].boundaries[0],-200);assert.equal(replay.beam.mlcDefinitions[0].boundaries[60],200);
 assert.equal(replay.data[0].beamHold,2);assert.equal(replay.data[1].cumulativeSimTime,.02);
 assert.equal(sample.actual.leaves[60],8);
 log.metadata.axisScale=2;log.metadata.mlcModel=3;
 const hd=buildReplay(log);assert.equal(hd.data[0].cp.gantryAngle,180);assert.equal(hd.data[0].cp.mlcPositionData[0].positions[0],8);
 assert.equal(hd.beam.mlcDefinitions[0].boundaries[0],-110);assert.equal(hd.beam.mlcDefinitions[0].boundaries[60],110);
 log.metadata.mlcModel=99;assert.throws(()=>buildReplay(log),/MLC models/);
});
