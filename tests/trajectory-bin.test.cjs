const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../lib/timing-calibration.js');
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
// Synthetic format fixtures only. No patient logs or metadata are stored here.
function fixture({version='4.0',scale=2,subbeams=1,reverseAxes=false,leaves=120}={}) {
 let axes=[0,1,2,3,4,5,6,7,8,9,...(version==='2.1'?[]:[10,11]),40,41,42,50];
 if(reverseAxes)axes.reverse();
 const counts=axes.map(id=>id===50?leaves+2:1),stride=counts.reduce((a,b)=>a+b,0)*8;
 const recordSize=version==='2.1'?80:560,snapshots=102,start=1024+subbeams*recordSize;
 const b=Buffer.alloc(start+snapshots*stride+2);
 b.write('VOSTL');b.write(version,16);b.writeInt32LE(1024,32);b.writeInt32LE(20,36);b.writeInt32LE(axes.length,40);
 axes.forEach((id,i)=>{b.writeInt32LE(id,44+4*i);b.writeInt32LE(counts[i],44+4*axes.length+4*i);});
 const tail=44+axes.length*8;
 [scale,subbeams,0,snapshots,2].forEach((v,i)=>b.writeInt32LE(v,tail+4*i));
 // Skipped metadata/name fields deliberately contain synthetic identifiers.
 if(Number(version)>=4)b.write('Patient ID:\tSYNTHETIC-NOT-FOR-EXPORT',tail+20);
 for(let i=0;i<subbeams;i++){const offset=1024+i*recordSize;b.writeInt32LE(0,offset);b.writeFloatLE(20,offset+4);b.write('SYNTHETIC-BEAM-NAME',offset+16);}
 for(let i=0;i<snapshots;i++){
  const cp=Math.min(i,100)/100;let pos=start+i*stride;
  for(let j=0;j<axes.length;j++)for(let channel=0;channel<counts[j];channel++)for(let side=0;side<2;side++){
   const id=axes[j];let value=0;
   if(id===0||id===1){value=id===1?cp*2:3; if(scale===1||scale===3)value=180-value;}
   if(id>=2&&id<=5)value=id;
   if(id===40)value=cp*20;
   if(id===41)value=i===101?2:0;
   if(id===42)value=cp;
   if(id===50)value=channel<2?90+channel:channel===2?cp+(side===0?.1:0):channel;
   b.writeFloatLE(value,pos);pos+=4;
  }
 }
 return {b,tail,start,stride,axes};
}

test('BIN versions 2.1, 3.0, 4.0 and 5.0 decode paired snapshots and skip carriages',()=>{
 for(const version of ['2.1','3.0','4.0','5.0'])for(const scale of [1,2,3]){
  const log=C.parseBin(fixture({version,scale}).b);
  assert.equal(log.metadata.version,version);assert.equal(log.samples.length,102);assert.equal(log.leafCount,120);
  near(log.samples[50].actual.gantry,1);near(log.samples[50].actual.collimator,3);
  near(log.samples[50].actual.leaves[0],5);near(log.samples[50].expected.leaves[0],6);
  near(log.samples[50].actual.leaves[119],1210);
  assert.deepEqual(log.samples[50].actual.jaws,[40,50,20,30]);
  near(log.samples[50].time,1);near(log.samples[50].actual.mu,10);
  near(C.reconstruct(log)[0].measuredSeconds,2.02);
  assert.ok(!JSON.stringify(log).includes('SYNTHETIC'));
 }
});

test('axis enums and sample counts define offsets, including sliced typed arrays',()=>{
 const a=C.parseBin(fixture().b),f=fixture({reverseAxes:true});
 const wrapped=Buffer.concat([Buffer.alloc(7),f.b,Buffer.alloc(13)]).subarray(7,-13);
 assert.deepEqual(C.parseBin(wrapped).samples,a.samples);
 assert.deepEqual(C.parseBin(Uint8Array.from(f.b).buffer).samples,a.samples);
});

test('non-autosequenced BIN without subbeam records is one delivery',()=>{
 const log=C.parseBin(fixture({subbeams:0}).b);
 assert.equal(log.metadata.subbeams,1);assert.equal(log.subbeamHeaders.length,0);
 assert.equal(C.reconstruct(log).length,1);
});

test('BIN rejects unknown versions, scales, malformed headers and incomplete payloads',()=>{
 const reject=(mutate,pattern)=>{const f=fixture();mutate(f);assert.throws(()=>C.parseBin(f.b),pattern);};
 reject(f=>f.b.write('WRONG'),/signature/);
 reject(f=>f.b.write('6.0',16),/version/);
 reject(f=>f.b.writeInt32LE(99,f.tail),/axis scales/);
 reject(f=>f.b.writeInt32LE(1,f.tail+8),/Truncated/);
 reject(f=>f.b.writeInt32LE(200,f.tail+12),/Incomplete/);
 reject(f=>f.b.writeInt32LE(-1,f.tail+4),/count/);
 reject(f=>f.b.writeInt32LE(99999,40),/header layout/);
 reject(f=>f.b.writeInt32LE(0,44+4*f.axes.length),/axis\/sample/);
 reject(f=>f.b.writeInt32LE(0,48),/axis\/sample/);
 reject(f=>f.b.writeInt32LE(99,44+4*f.axes.indexOf(40)),/MU axis/);
 reject(f=>f.b.writeFloatLE(NaN,f.start+4),/axis value/);
 assert.throws(()=>C.parseBin(fixture().b.subarray(0,45)),/header/);
 assert.throws(()=>C.parseBin(Buffer.concat([fixture().b,Buffer.alloc(1)])),/trailing/);
});

test('BIN reset detection and partial-delivery rejection match CSV constraints',()=>{
 const f=fixture(),muOffset=f.axes.indexOf(40)*8,cpOffset=f.axes.indexOf(42)*8;
 f.b.writeFloatLE(-5,f.start+50*f.stride+muOffset+4);
 assert.throws(()=>C.parseBin(f.b),/resets/);
 const g=fixture();for(let i=0;i<102;i++)g.b.writeFloatLE(Math.min(i,100)/100*.7,g.start+i*g.stride+cpOffset+4);
 assert.throws(()=>C.reconstruct(C.parseBin(g.b)),/boundaries/);
});

test('binary modal upload uses the same Legacy fitter; mixed BIN/CSV routes are supported',async()=>{
 const h=require('./legacy-harness.cjs')();const b=fixture().b;
 const file={name:'test.BIN',arrayBuffer:async()=>Uint8Array.from(b).buffer};
 h.get('calibrationDoseRate').value='600';h.get('calibrationLabel').value='Synthetic BIN';h.get('calibrationLogs').files=[file];
 await h.get('fitCalibration').events.click();
 const profile=h.run('loadedTimingProfile');assert.equal(profile.model,C.LOCAL_MODEL);
 assert.ok(profile.parameters.leafResponseAcceleration >= 20);
 assert.equal(profile.parameters.timeScale,undefined);
 assert.equal(profile.calibration.deliveryCount,1);assert.equal(h.get('calibrationEnabled').checked,false);
 // A CSV must route through the CSV parser, not binary decoding.
 await assert.rejects(()=>C.readFile({name:'x.csv',text:async()=>''}),/CSV is empty/);
 await assert.rejects(()=>C.readFile({name:'x.txt'}),/Select a trajectory/);
});


test('v5 scale 3 and v4 machine scale yield identical normalized paths and calibration',()=>{
 const older=C.parseBin(fixture({version:'4.0',scale:1}).b);
 const newer=C.parseBin(fixture({version:'5.0',scale:3}).b);
 assert.deepEqual(newer.samples,older.samples);
 assert.deepEqual(C.reconstruct(newer),C.reconstruct(older));
});

test('playback BIN reader preserves native actual axes, holds, resets and flagged partial logs',()=>{
 const f=fixture({scale:3});
 f.b.writeInt32LE(1,f.tail+8);
 f.b.writeFloatLE(0,f.start+50*f.stride+f.axes.indexOf(40)*8+4);
 f.b.writeFloatLE(0,f.start+50*f.stride+f.axes.indexOf(42)*8+4);
 assert.throws(()=>C.parseBin(f.b),/Truncated/);
 f.b.writeFloatLE(37,f.start+50*f.stride+f.axes.indexOf(9)*8+4);
 const log=C.parseBin(f.b,{playback:true});
 near(log.samples[50].actual.couch,37);
 assert.equal(log.samples.length,102);near(log.samples[50].actual.gantry,179);
 assert.equal(log.samples[50].actual.mu,0);assert.equal(log.samples[50].actual.cp,0);
 assert.equal(log.samples[101].actual.hold,2);near(log.samples[101].time,2.02);
 near(log.samples[50].actual.leaves[0],5);near(log.samples[50].expected.leaves[0],6);
 assert.throws(()=>C.parseBin(f.b.subarray(0,-10),{playback:true}),/Incomplete/);
});
