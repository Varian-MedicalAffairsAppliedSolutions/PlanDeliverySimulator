/* Recorded snapshots only: no fitting, CP reconstruction, interpolation or retiming. */
(function(root){
'use strict';
class Player {
    constructor(log){
        if(!log?.samples?.length || !(log.metadata?.samplingIntervalMs>0))throw new Error('No recorded snapshots to play.');
        this.log=log;this.duration=log.samples.at(-1).time-log.samples[0].time;
        this.time=0;this.playing=false;this.anchor=0;
    }
    seek(seconds,now=0){this.time=Math.max(0,Math.min(this.duration,seconds));this.anchor=now-this.time*1000;return this.snapshot();}
    play(now){if(this.time>=this.duration)this.time=0;this.anchor=now-this.time*1000;this.playing=true;}
    pause(now){if(this.playing)this.tick(now);this.playing=false;}
    tick(now){if(this.playing){this.time=Math.min(this.duration,Math.max(0,(now-this.anchor)/1000));if(this.time>=this.duration)this.playing=false;}return this.snapshot();}
    snapshot(){
        const samples=this.log.samples,target=samples[0].time+this.time;
        let lo=0,hi=samples.length-1;
        while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(samples[mid].time<=target+1e-9)lo=mid;else hi=mid-1;}
        return {index:lo,sample:samples[lo]};
    }
}
// Native-to-IEC jaw/bank convention follows TrajectoryLogReader's
// VarianNativeScaleConverter. Simulator MLC arrays are left bank then right bank.
function buildReplay(log){
    if(log.leafCount!==120 || ![2,3].includes(log.metadata.mlcModel))throw new Error('Visual playback supports Millennium 120 and HD120 BIN logs (MLC models 2 and 3).');
    const hd=log.metadata.mlcModel===3,outer=hd?14:10,inner=hd?32:40;
    const widths=[...Array(outer).fill(hd?5:10),...Array(inner).fill(hd?2.5:5),...Array(outer).fill(hd?5:10)];
    const bounds=[-widths.reduce((a,b)=>a+b,0)/2];widths.forEach(w=>bounds.push(bounds.at(-1)+w));
    const native=log.metadata.axisScale!==2,angle=v=>native?((180-v)%360+360)%360:v;
    const dt=log.metadata.samplingIntervalMs/1000,delta=(a,b)=>((b-a+540)%360+360)%360-180;
    const data=log.samples.map((sample,i)=>{
        const a=sample.actual,prev=log.samples[Math.max(0,i-1)].actual;
        const cp={controlPointIndex:i,gantryAngle:angle(a.gantry),collimatorAngle:angle(a.collimator),
            couchAngle:a.couch==null?null:angle(a.couch),
            mlcPositionData:[{type:'MLCX',positions:[...a.leaves.slice(60).map(v=>native?-v:v),...a.leaves.slice(0,60)]}],
            asymx:[native?-a.jaws[0]:a.jaws[0],a.jaws[1]],asymy:[native?-a.jaws[2]:a.jaws[2],a.jaws[3]]};
        return {cp,cumulativeSimTime:sample.time-log.samples[0].time,segmentDuration:i<log.samples.length-1?dt:0,
            gantrySpeed:Math.abs(delta(prev.gantry,a.gantry))/dt,collimatorSpeed:Math.abs(delta(prev.collimator,a.collimator))/dt,
            mlcSpeed:Math.max(...a.leaves.map((v,j)=>Math.abs(v-prev.leaves[j])))/dt,
            doseRate:a.mu>=prev.mu?(a.mu-prev.mu)*60/dt:0,recordedMu:a.mu,recordedCp:a.cp,beamHold:a.hold};
    });
    data.forEach((row,i)=>{const prev=data[Math.max(0,i-1)];for(const axis of ['gantry','collimator','mlc'])row[axis+'Acceleration']=(row[axis+'Speed']-prev[axis+'Speed'])/dt;});
    const beam={beamNumber:1,beamName:'Recorded BIN',isRDSMachine:false,mlcDefinitions:[{type:'MLCX',boundaries:bounds}],controlPoints:data.map(r=>r.cp),totalTime:data.at(-1).cumulativeSimTime};
    const maxima={};for(const key of ['gantrySpeed','collimatorSpeed','mlcSpeed','doseRate'])maxima[key]=data.reduce((max,r)=>Math.max(max,r[key]),1);
    return {beam,data,maxima};
}
const api={Player,buildReplay};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LogPlayback=api;
})(typeof globalThis!=='undefined'?globalThis:this);
