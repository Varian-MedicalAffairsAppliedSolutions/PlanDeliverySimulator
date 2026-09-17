/* Log/simulator comparison data. Raw traces are never written into profiles. */
(function(root){
    'use strict';
    const delta=(a,b)=>((b-a+540)%360+360)%360-180;
    const METRICS={
        cp:['Control-point progress','CP'], mu:['Cumulative delivered MU','MU'],
        gantry:['Gantry angle (unwrapped)','°'], collimator:['Collimator angle (unwrapped)','°'],
        gantrySpeed:['Gantry speed','°/s'], collimatorSpeed:['Collimator speed','°/s'],
        mlcSpeed:['Fastest leaf speed','mm/s'], doseRate:['Dose rate','MU/min']
    };
    const RATE_KEYS=new Set(['gantrySpeed','collimatorSpeed','mlcSpeed','doseRate']);
    function movingAverage(points,seconds){
        if(!Number.isFinite(seconds)||seconds<=0)throw new Error('Averaging window must be positive.');
        let left=0,right=0,sum=0;
        return points.map(p=>{
            while(right<points.length && points[right].x<=p.x+seconds/2){sum+=points[right].y;right++;}
            while(left<right && points[left].x<p.x-seconds/2){sum-=points[left].y;left++;}
            return {x:p.x,y:sum/(right-left)};
        });
    }
    function buildComparison(log,pair,prediction){
        if(prediction.length!==pair.beam.controlPoints.length)throw new Error('Prediction must include every reconstructed CP.');
        const raw=Object.fromEntries(Object.keys(METRICS).map(k=>[k,[]]));
        const w=pair.window,first=log.samples[w.start],dt=log.metadata.samplingIntervalMs/1000;
        let g=first.actual.gantry,c=first.actual.collimator;
        for(let i=w.start;i<=w.end;i++){
            const sample=log.samples[i],a=sample.actual,x=sample.time-first.time;
            if(i>w.start){
                const prev=log.samples[i-1].actual,dg=delta(prev.gantry,a.gantry),dc=delta(prev.collimator,a.collimator);
                g+=dg;c+=dc;
                const middle=x-dt/2;
                raw.gantrySpeed.push({x:middle,y:Math.abs(dg)/dt});
                raw.collimatorSpeed.push({x:middle,y:Math.abs(dc)/dt});
                raw.mlcSpeed.push({x:middle,y:Math.max(...a.leaves.map((v,j)=>Math.abs(v-prev.leaves[j])))/dt});
                raw.doseRate.push({x:middle,y:(a.mu-prev.mu)*60/dt});
            }
            for(const [key,y] of Object.entries({cp:a.cp-w.cpStart,mu:a.mu-first.actual.mu,gantry:g,collimator:c}))raw[key].push({x,y});
        }
        // Positions are held through the final sample's coverage interval.
        // Rates remain at actual inter-sample midpoints; no fabricated last rate.
        for(const key of ['cp','mu','gantry','collimator'])raw[key].push({x:pair.measuredSeconds,y:raw[key].at(-1).y});
        const predicted=predictionSeries(pair.beam,prediction,first.actual);
        return {raw,simulated:predicted.series,measuredSeconds:pair.measuredSeconds,predictedSeconds:predicted.totalTime,cpCount:pair.beam.controlPoints.length,samplingIntervalMs:log.metadata.samplingIntervalMs};
    }
    function predictionSeries(beam,prediction,reference){
        const simulated=Object.fromEntries(Object.keys(METRICS).map(k=>[k,[]]));
        const cps=beam.controlPoints;
        // Pick the equivalent angular turn closest to the first measured angle.
        let g=reference.gantry+delta(reference.gantry,cps[0].gantryAngle);
        let c=reference.collimator+delta(reference.collimator,cps[0].collimatorAngle);
        for(let i=0;i<prediction.length;i++){
            const cp=cps[i],row=prediction[i],x=row.cumulativeSimTime;
            if(i){g+=delta(cps[i-1].gantryAngle,cp.gantryAngle);c+=delta(cps[i-1].collimatorAngle,cp.collimatorAngle);}
            for(const [key,y] of Object.entries({cp:i,mu:cp.cumulativeMetersetWeight*beam.totalMeterset,gantry:g,collimator:c})){
                if(i===0 && x>0)simulated[key].push({x:0,y});
                simulated[key].push({x,y});
            }
            if(i+1<cps.length){
                const end=prediction[i+1].cumulativeSimTime,t=end-x;
                const values={gantrySpeed:t>0?row.deltaGantryAngle/t:0,collimatorSpeed:t>0?row.deltaCollAngle/t:0,
                    mlcSpeed:t>0?row.maxLeafTravel/t:0,doseRate:t>0?(cps[i+1].cumulativeMetersetWeight-cp.cumulativeMetersetWeight)*beam.totalMeterset*60/t:0};
                if(row.motionProfile){
                    const m=row.motionProfile,A=typeof module!=='undefined'&&module.exports?require('./axis-response-timing.js'):root.AxisResponseTiming;
                    const steps=Math.max(1,Math.ceil(t/.02));
                    const knots=[...new Set([0,m.up,m.up+m.cruise,t,...Array.from({length:steps+1},(_,j)=>t*j/steps)])].sort((a,b)=>a-b);
                    const changes={cp:1,mu:(cps[i+1].cumulativeMetersetWeight-cp.cumulativeMetersetWeight)*beam.totalMeterset,gantry:delta(cp.gantryAngle,cps[i+1].gantryAngle),collimator:delta(cp.collimatorAngle,cps[i+1].collimatorAngle)};
                    const starts={cp:i,mu:cp.cumulativeMetersetWeight*beam.totalMeterset,gantry:g,collimator:c};
                    for(const elapsed of knots){
                        const state=A.motionAt(m,elapsed);
                        if(elapsed>0&&elapsed<t)for(const key of Object.keys(changes))simulated[key].push({x:x+elapsed,y:starts[key]+changes[key]*state.fraction});
                        for(const [key,y] of Object.entries(values))simulated[key].push({x:x+elapsed,y:y*t*state.rate});
                    }
                    continue;
                }
                for(const [key,y] of Object.entries(values)){
                    if(i===0 && x>0)simulated[key].push({x:0,y:0},{x,y:0});
                    simulated[key].push({x,y},{x:end,y});
                }
            }
        }
        return {series:simulated,totalTime:prediction.at(-1).cumulativeSimTime};
    }
    function calibrate(items,pairs,profile,calibration){
        items.forEach((item,i)=>{
            const pair=pairs[i],data=pair.baselineData.map(row=>({...row}));
            calibration.apply(data,pair.baselineSeconds,profile,pair.beam);
            const reference={gantry:item.comparison.raw.gantry[0].y,collimator:item.comparison.raw.collimator[0].y};
            item.comparison.calibrated=predictionSeries(pair.beam,data,reference);
            item.comparison.calibrated.label=profile.model===calibration.LOCAL_MODEL?'Local axis response':'Calibrated';
        });
    }
    // Average a predicted rate over real elapsed time, not over CP count.
    // CP intervals have unequal lengths; averaging their vertices would bias it.
    function averagePrediction(points,seconds,sampleSeconds=.02){
        if(!points.length)return [];
        const integral=[0];
        for(let i=1;i<points.length;i++)integral.push(integral[i-1]+(points[i].x-points[i-1].x)*(points[i].y+points[i-1].y)/2);
        function area(x){
            let lo=0,hi=points.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(points[mid].x<=x)lo=mid;else hi=mid-1;}
            if(lo===points.length-1)return integral[lo];
            const a=points[lo],b=points[lo+1],dx=x-a.x,slope=b.x>a.x?(b.y-a.y)/(b.x-a.x):0;
            return integral[lo]+a.y*dx+slope*dx*dx/2;
        }
        const start=points[0].x,end=points.at(-1).x,n=Math.max(1,Math.ceil((end-start)/sampleSeconds));
        return Array.from({length:n+1},(_,i)=>{
            const x=start+(end-start)*i/n,left=Math.max(start,x-seconds/2),right=Math.min(end,x+seconds/2);
            return {x,y:right>left?(area(right)-area(left))/(right-left):points[0].y};
        });
    }
    function datasets(comparison,key,windowSeconds,scale=null){
        const rows=[
            {label:'Raw actual log',data:comparison.raw[key],borderColor:'rgba(100,116,139,0.45)',borderWidth:1},
            {label:`Actual · ${windowSeconds}s average`,data:movingAverage(comparison.raw[key],windowSeconds),borderColor:'#2563eb',borderWidth:2},
            {label:'Standard · expected CPs',data:comparison.simulated[key],borderColor:'#ea580c',borderWidth:2}
        ];
        if(scale!=null){
            if(!Number.isFinite(scale)||scale<=0)throw new Error('Invalid plot correction.');
            let predicted=comparison.calibrated?.series[key]??comparison.simulated[key].map(p=>({x:p.x*scale,y:RATE_KEYS.has(key)?p.y/scale:p.y}));
            if(RATE_KEYS.has(key))predicted=averagePrediction(predicted,windowSeconds,comparison.samplingIntervalMs/1000);
            rows.push({label:`${comparison.calibrated?.label??'Calibrated'} · ${RATE_KEYS.has(key)?windowSeconds+'s average':'fit preview'}`,data:predicted,borderColor:'#16a34a',borderWidth:2,borderDash:[6,3]});
        }
        return rows.map(row=>({...row,pointRadius:0,pointHitRadius:4,fill:false,tension:0}));
    }
    class Panel {
        constructor(doc,ChartClass){
            this.doc=doc;this.ChartClass=ChartClass;this.items=[];this.charts=[];this.scale=null;
            for(const id of ['calibrationArc','calibrationAverage','calibrationPreview'])doc.getElementById(id).addEventListener('change',()=>this.render());
            doc.getElementById('calibrationResetZoom').addEventListener('click',()=>this.charts.forEach(c=>c.resetZoom?.()));
        }
        destroyCharts(){this.charts.forEach(chart=>chart.destroy());this.charts=[];}
        clear(){this.destroyCharts();this.items=[];this.scale=null;this.doc.getElementById('calibrationPlots').hidden=true;}
        set(items,scale=null){
            this.items=items;this.scale=scale;
            const select=this.doc.getElementById('calibrationArc');select.replaceChildren();
            items.forEach((item,i)=>{const option=this.doc.createElement('option');option.value=String(i);option.textContent=item.label;select.appendChild(option);});
            select.value='0';this.doc.getElementById('calibrationPlots').hidden=!items.length;this.render();
        }
        render(){
            this.destroyCharts();
            const item=this.items[Number(this.doc.getElementById('calibrationArc').value)];if(!item)return;
            const status=this.doc.getElementById('calibrationPlotSummary');
            const window=Number(this.doc.getElementById('calibrationAverage').value);
            if(!Number.isFinite(window)||window<=0 || window>10){status.textContent='Enter an averaging window between 0 and 10 seconds.';return;}
            const comparison=item.comparison,preview=this.doc.getElementById('calibrationPreview').checked?this.scale:null;
            status.textContent=`Measured ${comparison.measuredSeconds.toFixed(2)} s · Standard ${comparison.predictedSeconds.toFixed(2)} s`+
                (preview==null?'':` · calibrated ${ (comparison.calibrated?.totalTime??comparison.predictedSeconds*preview).toFixed(2)} s`)+
                ` · ${comparison.cpCount} expected CP knots · ${comparison.samplingIntervalMs} ms samples. Each trace uses its own elapsed delivery time; predictions are not stretched to measured time.`;
            if(!this.ChartClass){status.textContent+=' Charts could not load.';return;}
            for(const [key,[title,unit]] of Object.entries(METRICS)){
                this.charts.push(new this.ChartClass(this.doc.getElementById(`calibrationPlot_${key}`),{
                    type:'line',data:{datasets:datasets(comparison,key,window,preview)},options:{
                        responsive:true,maintainAspectRatio:false,animation:false,parsing:false,
                        interaction:{mode:'nearest',intersect:false},
                        scales:{x:{type:'linear',min:0,title:{display:true,text:'Elapsed delivery time (s)'}},y:{title:{display:true,text:unit}}},
                        plugins:{title:{display:true,text:title},legend:{labels:{boxWidth:14,font:{size:10}}},
                            zoom:{zoom:{wheel:{enabled:true,modifierKey:'ctrl'},pinch:{enabled:true},mode:'x'},pan:{enabled:false}}}
                    }
                }));
            }
        }
    }
    const api={METRICS,movingAverage,averagePrediction,buildComparison,predictionSeries,calibrate,datasets,Panel};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CalibrationPlots=api;
})(typeof globalThis!=='undefined'?globalThis:this);
