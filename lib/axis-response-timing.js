/* Empirical local timing correction. Fits window durations, never replays log times. */
(function(root){
'use strict';
const MODEL='legacy-axis-response-v1';
const angle=(a,b)=>((b-a+540)%360+360)%360-180;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const median=a=>{const b=a.slice().sort((x,y)=>x-y),i=(b.length-1)/2;return(b[Math.floor(i)]+b[Math.ceil(i)])/2;};
function prepare(beam,limits){
    for(const key of ['maxGantrySpeedInput','maxMlcSpeedInput','maxCollimatorSpeedInput','maxGantryAccelDecelInput','maxCollimatorAccelDecelInput'])if(!Number.isFinite(limits[key])||limits[key]<=0)throw new Error('Invalid axis limit for local timing.');
    if(beam.isRDSMachine)throw new Error('Local axis-response profiles require single-layer MLC beams.');
    const cps=beam.controlPoints;
    if(!cps||cps.length<2||!Number.isFinite(beam.totalMeterset)||beam.totalMeterset<=0)throw new Error('Local timing requires a complete beam with absolute MU.');
    if(Math.abs(cps[0].cumulativeMetersetWeight)>1e-6||Math.abs(cps.at(-1).cumulativeMetersetWeight-1)>1e-4)throw new Error('Local timing requires normalized cumulative MU weights from 0 to 1.');
    const rows=cps.slice(1).map((cp,i)=>{
        const prev=cps[i],a=prev.mlcPositionData,b=cp.mlcPositionData;
        if(a?.length!==1||b?.length!==1||a[0].positions.length!==b[0].positions.length)throw new Error('Local timing requires consistent single-layer MLC positions.');
        const leaves=b[0].positions.map((v,j)=>v-a[0].positions[j]);
        const g=angle(prev.gantryAngle,cp.gantryAngle),c=angle(prev.collimatorAngle,cp.collimatorAngle);
        const mu=beam.totalMeterset*(cp.cumulativeMetersetWeight-prev.cumulativeMetersetWeight);
        const rate=Number(cp.doseRateSet)||Number(prev.doseRateSet)||600;
        if(mu < -1e-6 || !Number.isFinite(rate)||rate<=0 || ![g,c,mu,...leaves].every(Number.isFinite))throw new Error('Invalid CP geometry or dose for local timing.');
        const leaf=Math.max(...leaves.map(Math.abs));
        const components={Gantry:Math.abs(g)/limits.maxGantrySpeedInput,MLC:leaf/(limits.maxMlcSpeedInput*10),Collimator:Math.abs(c)/limits.maxCollimatorSpeedInput,'Dose Rate':Math.max(0,mu)*60/rate};
        const dominant=Object.keys(components).reduce((a,b)=>components[a]>=components[b]?a:b);
        return {cp:prev,g,c,leaves,leaf,mu,rate,components,dominant,base:Math.max(1e-6,components[dominant])};
    });
    return {beam,limits,rows};
}
function durations(prepared,acceleration){
    const {rows:r,limits:l}=prepared,t=r.map(row=>row.base),causes=r.map(row=>row.dominant);
    // CP-average velocity changes over neighboring midpoint intervals. This is
    // an empirical controller-response proxy, NOT an exact motor trajectory or
    // a requirement to stop at each leaf reversal.
    for(let pass=0;pass<6;pass++){
        const next=t.slice();
        for(let i=1;i<r.length;i++){
            let leafJump=0;
            for(let j=0;j<r[i].leaves.length;j++)leafJump=Math.max(leafJump,Math.abs(r[i].leaves[j]/t[i]-r[i-1].leaves[j]/t[i-1]));
            const half=(t[i]+t[i-1])/2;
            const demands={'Leaf response':leafJump/(acceleration*half),
                'Gantry response':Math.abs(r[i].g/t[i]-r[i-1].g/t[i-1])/(l.maxGantryAccelDecelInput*half),
                'Collimator response':Math.abs(r[i].c/t[i]-r[i-1].c/t[i-1])/(l.maxCollimatorAccelDecelInput*half)};
            const cause=Object.keys(demands).reduce((a,b)=>demands[a]>=demands[b]?a:b),factor=Math.sqrt(Math.max(1,demands[cause]));
            for(const j of [i-1,i])if(t[j]*factor>next[j]+1e-12){next[j]=t[j]*factor;causes[j]=cause;}
        }
        for(let i=0;i<t.length;i++)t[i]=next[i];
    }
    return {times:t,causes};
}
function predict(beam,limits,parameters){
    if(!Number.isFinite(parameters?.leafResponseAcceleration)||parameters.leafResponseAcceleration<20||parameters.leafResponseAcceleration>180)throw new Error('Invalid local leaf-response parameter.');
    const p=prepare(beam,limits),{times,causes}=durations(p,parameters.leafResponseAcceleration);let total=0;
    const data=p.rows.map((r,i)=>{
        const duration=times[i],row={cp:r.cp,cumulativeSimTime:total,segmentDuration:duration,
            deltaGantryAngle:Math.abs(r.g),deltaCollAngle:Math.abs(r.c),maxLeafTravel:r.leaf,muInSegment:r.mu,
            limitingComponent:causes[i],componentTimes:r.components,
            gantryCapability:100*Math.abs(r.g)/duration/limits.maxGantrySpeedInput,
            mlcCapability:100*r.leaf/duration/(limits.maxMlcSpeedInput*10),
            collimatorCapability:100*Math.abs(r.c)/duration/limits.maxCollimatorSpeedInput,
            doseRateCapability:6000*r.mu/duration/r.rate};total+=duration;return row;
    });
    data.push({cp:beam.controlPoints.at(-1),cumulativeSimTime:total,segmentDuration:0});
    return {data,totalTime:total};
}
function windows(pair,seconds=1){
    const times=pair.measuredCpTimes;
    if(!times || times.length!==pair.beam.controlPoints.length || times.some((t,i)=>!Number.isFinite(t)||t<0||(i&&t<times[i-1])))throw new Error('Local fitting needs measured CP arrival times from a complete log.');
    const result=[];let start=0;
    for(let end=1;end<times.length;end++)if(times[end]-times[start]>=seconds || end===times.length-1){
        const actual=times[end]-times[start];
        if(actual>0)result.push({start,end,actual});start=end;
    }
    if(!result.length)throw new Error('No timed CP windows for local calibration.');
    return result;
}
function evaluate(pair,times,selected=null){
    const ws=selected||windows(pair),arrival=[];let sum=0;
    const cumulative=[0];for(const t of times){sum+=t;cumulative.push(sum);}
    for(let i=1;i<cumulative.length;i++)arrival.push(Math.abs(cumulative[i]-pair.measuredCpTimes[i]));
    const errors=ws.map(w=>cumulative[w.end]-cumulative[w.start]-w.actual);
    return {windowMaeSeconds:mean(errors.map(Math.abs)),arrivalMaeSeconds:mean(arrival),
        totalErrorSeconds:sum-pair.measuredSeconds,selectedErrorSeconds:errors.reduce((s,x)=>s+x,0),windowCount:ws.length};
}
function fit(pairs,limits,label='Local axis-response calibration'){
    if(!pairs.length)throw new Error('Add a complete delivery for local calibration.');
    for(const [key,value]of Object.entries(limits))if(!Number.isFinite(value)||(key.includes('Overhead')?value<0:value<=0))throw new Error('Invalid machine settings for local calibration.');
    const prepared=pairs.map(p=>prepare(p.beam,limits)),ws=pairs.map(p=>windows(p));
    // Fixed candidate range and objective: 1-second-window MAE + modest total
    // bias penalty. No beam-specific coefficients or recorded times in profile.
    const candidates=Array.from({length:161},(_,i)=>20+i);
    const predictions=candidates.map(a=>prepared.map(p=>durations(p,a).times));
    function choose(selections){
        let best=0,bestScore=Infinity;
        candidates.forEach((a,k)=>{
            const stats=selections.map(s=>evaluate(pairs[s.index],predictions[k][s.index],s.windows));
            const score=mean(stats.map(s=>s.windowMaeSeconds))+.04*mean(stats.map(s=>Math.abs(s.selectedErrorSeconds)));
            if(score<bestScore){bestScore=score;best=k;}
        });return best;
    }
    const all=pairs.map((p,index)=>({index,windows:ws[index]})),best=choose(all),held=[],oldHeld=[];
    const groupIds=[...new Set(pairs.map(p=>p.group??0))];
    let validation;
    if(pairs.length>1){
        const groups=groupIds.length>1?groupIds:pairs.map((_,i)=>i);
        const key=i=>groupIds.length>1?(pairs[i].group??0):i;
        for(const group of groups){
            const training=all.filter(s=>key(s.index)!==group),test=all.filter(s=>key(s.index)===group),k=choose(training);
            const ratios=training.map(s=>pairs[s.index].measuredSeconds/pairs[s.index].baselineSeconds),scale=median(ratios);
            for(const s of test){held.push(evaluate(pairs[s.index],predictions[k][s.index]));
                if(pairs[s.index].baselineData)oldHeld.push(evaluate(pairs[s.index],pairs[s.index].baselineData.slice(0,-1).map(r=>r.segmentDuration*scale)));}
        }
        validation=groupIds.length>1?'Leave-one-log-out':'Leave-one-arc-out within the same log';
    }else{
        // Contiguous blocks, not shuffled samples. Exclude entire held-out
        // windows from both fit loss and aggregate training-time penalty.
        const folds=Math.min(5,ws[0].length);
        if(folds>=2)for(let fold=0;fold<folds;fold++){
            const test=ws[0].filter((w,i)=>Math.floor(i*folds/ws[0].length)===fold),train=ws[0].filter((w,i)=>Math.floor(i*folds/ws[0].length)!==fold);
            const k=choose([{index:0,windows:train}]);held.push(evaluate(pairs[0],predictions[k][0],test));
            if(pairs[0].baselineData){const base=pairs[0].baselineData.slice(0,-1).map(r=>r.segmentDuration),baseSum=train.reduce((s,w)=>s+base.slice(w.start,w.end).reduce((a,b)=>a+b,0),0),scale=train.reduce((s,w)=>s+w.actual,0)/baseSum;
                oldHeld.push(evaluate(pairs[0],base.map(t=>t*scale),test));}
        }
        validation='Contiguous-window holdout within one arc (not independent delivery validation)';
    }
    const stats=all.map(s=>evaluate(pairs[s.index],predictions[best][s.index]));
    const summary=a=>({windowMaeSeconds:a.length?mean(a.map(s=>s.windowMaeSeconds)):null,
        arrivalMaeSeconds:pairs.length>1&&a.length?mean(a.map(s=>s.arrivalMaeSeconds)):null,
        totalMaeSeconds:pairs.length>1&&a.length?mean(a.map(s=>Math.abs(s.totalErrorSeconds))):null});
    return {schema:'delivery-timing-profile',version:1,model:MODEL,label:String(label).slice(0,120),nominalLimits:{...limits},
        parameters:{leafResponseAcceleration:candidates[best]},
        calibration:{method:'Local coupled axis response',source:'log-commanded-control-points',deliveryCount:pairs.length,targetWindowSeconds:1,
            validation,heldOut:summary(held),uniformHeldOut:summary(oldHeld),trainingWindowMaeSeconds:mean(stats.map(s=>s.windowMaeSeconds)),
            trainingMaeSeconds:mean(stats.map(s=>Math.abs(s.totalErrorSeconds))),
            perDelivery:pairs.map((p,i)=>({baselineSeconds:p.baselineSeconds,measuredSeconds:p.measuredSeconds,calibratedSeconds:predictions[best][i].reduce((s,t)=>s+t,0),windowMaeSeconds:stats[i].windowMaeSeconds,arrivalMaeSeconds:stats[i].arrivalMaeSeconds})),
            note:'Empirical CP-average response, not measured motor acceleration. Replaces manual per-CP/start overheads. One-second windows end at CP boundaries.'}};
}
const api={MODEL,prepare,durations,predict,windows,evaluate,fit};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AxisResponseTiming=api;
})(typeof globalThis!=='undefined'?globalThis:this);
