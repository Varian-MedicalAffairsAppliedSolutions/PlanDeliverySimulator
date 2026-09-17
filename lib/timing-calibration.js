/* Offline trajectory BIN/CSV calibration. Profiles contain aggregate model settings,
 * never patient identifiers, raw leaf positions, or per-beam replay times. */
(function(root) {
    'use strict';
    const MODEL = 'legacy-calibrated-v1';
    const LOCAL_MODEL = 'legacy-axis-response-v1';
    const axisResponse = () => typeof module!=='undefined' && module.exports ? require('./axis-response-timing.js') : root.AxisResponseTiming;
    const DEFAULT_LIMITS = { maxGantrySpeedInput:6, maxGantryAccelDecelInput:4.8, maxMlcSpeedInput:2.5, maxMlcAccelDecelInput:2.5, maxCollimatorSpeedInput:9, maxCollimatorAccelDecelInput:9, beamStartOverheadMsInput:0, segmentOverheadMsInput:20 };
    const angleDelta = (a,b) => ((b-a+540)%360+360)%360-180;
    function positive(x, label) { if (!Number.isFinite(x) || x <= 0) throw new Error(`${label} must be positive and finite.`); return x; }
    function quantile(values, q) {
        if (!values.length) return null;
        const a = values.slice().sort((x,y)=>x-y), n=(a.length-1)*q, i=Math.floor(n);
        return a[i] + (a[Math.min(i+1,a.length-1)]-a[i])*(n-i);
    }
    function* csvRows(text) {
        let row=[], cell='', quoted=false;
        for(let i=0;i<text.length;i++) {
            const ch=text[i];
            if(ch==='"') { if(quoted && text[i+1]==='"'){cell+='"';i++;} else quoted=!quoted; }
            else if(!quoted && ch===','){row.push(cell);cell='';}
            else if(!quoted && (ch==='\n'||ch==='\r')) { if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(c=>c.trim()!==''))yield row;row=[];cell=''; }
            else cell+=ch;
        }
        if(quoted)throw new Error('Unclosed CSV quote.');
        if(cell.length||row.length){row.push(cell);yield row;}
    }
    function parseCsv(text, options={}) {
        const iterator=csvRows(text.replace(/^\uFEFF/,'')), headers=iterator.next().value;
        if(!headers)throw new Error('CSV is empty.');
        const names=headers.map(s=>s.trim());
        const index=name=>names.indexOf(name);
        const required=name=>{const i=index(name);if(i<0)throw new Error(`Missing CSV column: ${name}`);return i;};
        const numeric=(row,i,label)=>{const x=i<0||row[i]?.trim()===''?NaN:Number(row[i]);if(!Number.isFinite(x)||Math.abs(x)>1e30)throw new Error(`Invalid ${label} in CSV.`);return x;};
        const maps={cp:required('Control Point Actual'),mu:required('MU Actual in units of MU'),hold:required('Beam Hold Actual'),gantry:required('Gantry Actual in units of degrees'),collimator:required('Collimator Actual in units of degrees')};
        const expected={cp:required('Control Point Expected'),mu:required('MU Expected in units of MU'),gantry:required('Gantry Expected in units of degrees'),collimator:required('Collimator Expected in units of degrees')};
        const leafNames=names.filter(n=>/^Leaf \d+ Actual in units of (cm|mm)$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
        if(!leafNames.length)throw new Error('No actual leaf-position columns found.');
        if(leafNames.length%2 || leafNames.some((name,i)=>Number(name.match(/\d+/)[0])!==i+1))throw new Error('Missing or inconsistent actual leaf-position columns.');
        const leaves=leafNames.map(name=>({a:index(name),e:required(name.replace(' Actual ',' Expected ')),factor:name.endsWith('cm')?10:1}));
        const jaws=['X1','X2','Y1','Y2'].map(j=>({a:required(`Jaws ${j} Actual in units of cm`),e:required(`Jaws ${j} Expected in units of cm`)}));
        let metadata=null, samples=[];
        for(const row of iterator) {
            if(row.length!==names.length)throw new Error(`CSV row ${samples.length+2} has ${row.length} cells; expected ${names.length}.`);
            if(!metadata) {
                const value=name=>row[index(name)];
                metadata={samplingIntervalMs:Number(value('Sampling Inteval:')??value('Sampling Interval:')??options.samplingIntervalMs),subbeams:Number(value('Number of Subbeams:')||1),axisScale:Number(value('Axis Scale:')),truncated:Number(value('Is Truncated?')||0),snapshots:Number(value('Number of Snapshots:')||0)};
                positive(metadata.samplingIntervalMs,'Sampling interval (ms)');
                if(![1,2,3].includes(metadata.axisScale))throw new Error('Supported CSV axis scales: 1 (machine), 2 (modified IEC), 3 (machine/isocentric couch).');
                if(metadata.truncated)throw new Error('Truncated log: a complete delivery is required for calibration.');
            }
            const sample={time:samples.length*metadata.samplingIntervalMs/1000,actual:{},expected:{}};
            for(const [key,i]of Object.entries(maps))sample.actual[key]=numeric(row,i,key);
            for(const [key,i]of Object.entries(expected))sample.expected[key]=numeric(row,i,key);
            for(const which of ['actual','expected']) {
                const side=which==='actual'?'a':'e';
                sample[which].leaves=leaves.map(l=>numeric(row,l[side],'leaf')*l.factor);
                sample[which].jaws=jaws.map(j=>numeric(row,j[side],'jaw')*10);
                if(metadata.axisScale===1 || metadata.axisScale===3) {
                    for(const axis of ['gantry','collimator'])sample[which][axis]=((180-sample[which][axis])%360+360)%360;
                }
            }
            const prev=samples.at(-1);
            if(prev && (sample.actual.cp<prev.actual.cp-.05 || sample.actual.mu<prev.actual.mu-.01))throw new Error('CSV CP/MU resets detected. Split the export into monotonic delivery sessions first.');
            samples.push(sample);
        }
        if(samples.length<3)throw new Error('Not enough log samples.');
        if(metadata.snapshots && metadata.snapshots!==samples.length)throw new Error('CSV row count differs from Number of Snapshots.');
        return {metadata,samples,leafCount:leaves.length};
    }
    // Format reference: pylinac TrajectoryLogHeader, Subbeam and
    // TrajectoryLogAxisData (2.1/3.0/4.0). Browser-native reader, no Python runtime.
    // https://pylinac.readthedocs.io/en/latest/_modules/pylinac/log_analyzer.html
    // v5 uses the same paired-float layout. Scale 3 has machine-scale head axes
    // and isocentric couch coordinates (couch is unused here). Cross-reference:
    // https://github.com/anmcgrath/TrajectoryLogReader/blob/main/TrajectoryLogReader/Log/AxisScale.cs
    // https://github.com/anmcgrath/TrajectoryLogReader/blob/main/TrajectoryLogReader/Util/VarianNativeScaleConverter.cs
    function parseBin(input, options={}) {
        const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) :
            ArrayBuffer.isView(input) ? new Uint8Array(input.buffer,input.byteOffset,input.byteLength) : null;
        if (!bytes || bytes.length < 64) throw new Error('Incomplete trajectory BIN header.');
        const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
        const int = offset => view.getInt32(offset,true);
        const str = (offset,length) => String.fromCharCode(...bytes.subarray(offset,offset+length)).split('\0')[0].trim();
        if (str(0,16) !== 'VOSTL') throw new Error('Not a Varian trajectory BIN (VOSTL signature missing).');
        const version = str(16,16);
        if (!['2.1','3.0','4.0','5.0'].includes(version)) throw new Error(`Unsupported trajectory BIN version ${version}. Supported: 2.1, 3.0, 4.0, 5.0.`);
        const headerSize=int(32),samplingIntervalMs=int(36),axisCount=int(40);
        if (headerSize!==1024 || bytes.length<headerSize || axisCount<1 || 64+8*axisCount>headerSize) throw new Error('Invalid or incomplete trajectory BIN header layout.');
        positive(samplingIntervalMs,'Sampling interval (ms)');
        const axes=new Map(); let channels=0;
        for(let i=0;i<axisCount;i++) {
            const id=int(44+4*i),count=int(44+4*axisCount+4*i);
            if (axes.has(id) || count<1 || count>1024) throw new Error('Invalid trajectory BIN axis/sample layout.');
            axes.set(id,{offset:channels*8,count}); channels+=count;
        }
        const tail=44+8*axisCount,axisScale=int(tail),subbeams=int(tail+4),truncated=int(tail+8),snapshots=int(tail+12),mlcModel=int(tail+16);
        if (![1,2,3].includes(axisScale)) throw new Error('Supported BIN axis scales: 1 (machine), 2 (modified IEC), 3 (machine/isocentric couch).');
        if (truncated && !options.playback) throw new Error('Truncated log: a complete delivery is required for calibration.');
        if (subbeams<0 || snapshots<3) throw new Error('Invalid trajectory BIN subbeam/snapshot count.');
        const recordSize=Number(version)>=3?560:80;
        const dataStart=headerSize+subbeams*recordSize,stride=channels*8,dataEnd=dataStart+snapshots*stride;
        if (!Number.isSafeInteger(dataEnd) || dataEnd>bytes.length) throw new Error('Incomplete trajectory BIN: snapshot payload is shorter than declared.');
        // Varian logs normally end with a two-byte CRC. Like pylinac's reader,
        // decode the payload without using the trailer as snapshot data.
        if (![0,2].includes(bytes.length-dataEnd)) throw new Error('Unexpected trailing data in trajectory BIN; unsupported layout.');
        const required=(id,label)=>{const axis=axes.get(id);if(!axis || axis.count!==1)throw new Error(`Missing or invalid BIN ${label} axis.`);return axis.offset;};
        const offsets={collimator:required(0,'collimator'),gantry:required(1,'gantry'),mu:required(40,'MU'),hold:required(41,'beam hold'),cp:required(42,'control point')};
        const jaws=[required(4,'X1'),required(5,'X2'),required(2,'Y1'),required(3,'Y2')];
        const mlc=axes.get(50),leafCount=(mlc?.count??0)-2;
        if (!mlc || leafCount<2 || leafCount%2) throw new Error('Missing or invalid BIN MLC axis.');
        // Keep numeric subbeam metadata only. Skip names and the entire v4
        // patient/plan metadata region; neither is needed for calibration.
        const subbeamHeaders=Array.from({length:subbeams},(_,i)=>{
            const offset=headerSize+i*recordSize;
            const cp=int(offset),mu=view.getFloat32(offset+4,true),seconds=view.getFloat32(offset+8,true),sequence=int(offset+12);
            if(cp<0 || !Number.isFinite(mu) || mu<0 || !Number.isFinite(seconds) || seconds<0 || sequence<0) throw new Error('Invalid BIN subbeam record.');
            return {cp,mu,seconds,sequence};
        });
        const samples=[];
        for(let i=0;i<snapshots;i++) {
            const base=dataStart+i*stride;
            const read=offset=>{const x=view.getFloat32(base+offset,true);if(!Number.isFinite(x)||Math.abs(x)>1e30)throw new Error(`Invalid BIN axis value at snapshot ${i}.`);return x;};
            const sample={time:i*samplingIntervalMs/1000,actual:{},expected:{}};
            for(const which of ['expected','actual']) {
                const side=which==='actual'?4:0,target=sample[which];
                for(const [key,offset] of Object.entries(offsets)) {
                    if(key!=='hold' || which==='actual') target[key]=read(offset+side);
                }
                if(options.playback && axes.has(9)) target.couch=read(axes.get(9).offset+side);
                target.jaws=jaws.map(offset=>read(offset+side)*10);
                // First two MLC samples are carriage A/B, not leaf positions.
                target.leaves=Array.from({length:leafCount},(_,j)=>read(mlc.offset+(j+2)*8+side)*10);
                if(!options.playback && (axisScale===1 || axisScale===3))for(const axis of ['gantry','collimator'])target[axis]=((180-target[axis])%360+360)%360;
            }
            const prev=samples.at(-1);
            if(!options.playback && prev && (sample.actual.cp<prev.actual.cp-.05 || sample.actual.mu<prev.actual.mu-.01))throw new Error('BIN CP/MU resets detected. Split the log into monotonic delivery sessions first.');
            samples.push(sample);
        }
        // Non-autosequenced logs may declare zero subbeam records.
        return {metadata:{samplingIntervalMs,subbeams:Math.max(1,subbeams),axisScale,truncated,snapshots,version,mlcModel,format:'bin'},samples,leafCount,subbeamHeaders};
    }
    async function readFile(file) {
        const name=String(file.name??'log.csv').toLowerCase();
        if(name.endsWith('.bin'))return parseBin(await file.arrayBuffer());
        if(name.endsWith('.csv'))return parseCsv(await file.text());
        throw new Error('Select a trajectory .bin file or pylinac .csv export.');
    }
    function deliveryWindows(log) {
        const s=log.samples, dt=log.metadata.samplingIntervalMs/1000;
        const runs=[];let start=null;
        for(let i=0;i<=s.length;i++) {
            const normal=i<s.length&&s[i].actual.hold===0;
            if(normal&&start===null)start=i;
            if(!normal&&start!==null) {
                if(s[i-1].actual.mu-s[start].actual.mu>.01)runs.push({start,end:i-1});
                start=null;
            }
        }
        if(!runs.length)throw new Error('No complete beam-on delivery windows found.');
        // Single-subbeam exports can contain internal automatic holds. Keep their
        // elapsed time; do not turn every MU plateau into a separate arc.
        if(log.metadata.subbeams===1 && runs.length>1)runs.splice(0,runs.length,{start:runs[0].start,end:runs.at(-1).end});
        if(runs.length!==log.metadata.subbeams)throw new Error(`Found ${runs.length} delivery windows but the header declares ${log.metadata.subbeams} subbeams. Resolve internal holds/split logs before fitting.`);
        return runs.map((r,i)=>{
            const first=s[r.start],last=s[r.end], next=runs[i+1];
            const cpStart=Math.round(first.actual.cp);
            const cpEnd=next?Math.round(s[next.start].actual.cp)-1:Math.round(last.actual.cp);
            if(Math.abs(first.actual.cp-cpStart)>.05 || Math.abs(last.actual.cp-Math.round(last.actual.cp))>.05 || cpEnd<=cpStart)throw new Error('Ambiguous subbeam CP boundaries.');
            const holdSeconds=s.slice(r.start,r.end+1).filter(p=>p.actual.hold!==0).length*dt;
            return {...r,cpStart,cpEnd,seconds:(r.end-r.start+1)*dt,holdSeconds,mu:last.actual.mu-first.actual.mu};
        });
    }
    function interpolate(log, cp, window) {
        const s=log.samples; let lo=window.start,hi=window.end;
        while(lo<hi){const mid=(lo+hi)>>1;if(s[mid].actual.cp<cp)lo=mid+1;else hi=mid;}
        const right=s[lo],left=s[Math.max(window.start,lo-1)];
        const span=right.actual.cp-left.actual.cp;
        const f=span>1e-10?Math.max(0,Math.min(1,(cp-left.actual.cp)/span)):0;
        const lerp=(a,b)=>a+(b-a)*f;
        const angle=(a,b)=>a+angleDelta(a,b)*f;
        return {time:lerp(left.time,right.time)-s[window.start].time,mu:lerp(left.expected.mu,right.expected.mu),gantry:angle(left.expected.gantry,right.expected.gantry),collimator:angle(left.expected.collimator,right.expected.collimator),leaves:left.expected.leaves.map((x,i)=>lerp(x,right.expected.leaves[i])),jaws:left.expected.jaws.map((x,i)=>lerp(x,right.expected.jaws[i]))};
    }
    function reconstruct(log, nominalDoseRate=600) {
        positive(nominalDoseRate,'Nominal dose rate');
        return deliveryWindows(log).map((w,number)=>{
            const points=Array.from({length:w.cpEnd-w.cpStart+1},(_,i)=>interpolate(log,w.cpStart+i,w));
            const first=points[0].mu,last=points.at(-1).mu;
            positive(last-first,'Subbeam MU');
            const cps=points.map((p,i)=>({controlPointIndex:i,gantryAngle:p.gantry,collimatorAngle:p.collimator,doseRateSet:nominalDoseRate,cumulativeMetersetWeight:(p.mu-first)/(last-first),mlcPositionData:[{type:'MLCX',positions:p.leaves}],asymx:p.jaws.slice(0,2),asymy:p.jaws.slice(2)}));
            return {beam:{beamNumber:number+1,beamName:`Log subbeam ${number+1}`,totalMeterset:last-first,controlPoints:cps,mlcDefinitions:[],finalCumulativeMetersetWeight:1},measuredSeconds:w.seconds,measuredCpTimes:points.map(p=>p.time),window:w,source:'log-commanded-control-points'};
        });
    }
    function checkedLimits(input) {
        const l={...input};
        for(const key of Object.keys(DEFAULT_LIMITS)) {
            if (!Number.isFinite(l[key]) || (key.includes('Overhead') ? l[key]<0 : l[key]<=0)) throw new Error(`Invalid baseline setting: ${key}`);
        }
        return l;
    }
    function apply(data, totalTime, profile, beam=null) {
        if (!profile) return totalTime;
        validateProfile(profile);
        if(profile.model===LOCAL_MODEL){
            if(!beam)throw new Error('A beam is required to apply local axis-response calibration.');
            const result=axisResponse().predict(beam,profile.nominalLimits,profile.parameters);
            if(result.data.length!==data.length)throw new Error('Local prediction does not match beam CPs.');
            result.data.forEach((row,i)=>Object.assign(data[i],row,{calibrationExtra:row.segmentDuration-(data[i].segmentDuration||0)}));
            return result.totalTime;
        }
        const scale=profile.parameters.timeScale;
        for(const row of data) {
            row.cumulativeSimTime *= scale;
            if(Number.isFinite(row.segmentDuration)) {
                row.calibrationExtra=row.segmentDuration*(scale-1);
                row.segmentDuration *= scale;
            }
            for(const key of ['gantryCapability','mlcCapability','collimatorCapability','doseRateCapability']) {
                if(Number.isFinite(row[key]))row[key]/=scale;
            }
        }
        return totalTime*scale;
    }
    function validateProfile(profile, limits=null) {
        if(profile?.schema!=='delivery-timing-profile'||profile.version!==1||![MODEL,LOCAL_MODEL].includes(profile.model))throw new Error('This calibration profile is unsupported. Refit it using the current calibrator.');
        if(profile.model===LOCAL_MODEL){
            const response=profile.parameters?.leafResponseAcceleration;
            if(!Number.isFinite(response)||response<20||response>180)throw new Error('Invalid local leaf-response parameter (20–180 mm/s²).');
        }else{
            positive(profile.parameters?.timeScale,'Profile time scale');
            if(profile.parameters.timeScale<.5||profile.parameters.timeScale>3)throw new Error('Profile scale is outside supported bounds (0.5–3).');
        }
        if(!profile.nominalLimits || Object.keys(DEFAULT_LIMITS).some(k=>!Object.prototype.hasOwnProperty.call(profile.nominalLimits,k)))throw new Error('Profile baseline limits are incomplete.');
        const saved=checkedLimits(profile.nominalLimits);
        if(limits)for(const key of Object.keys(DEFAULT_LIMITS)) {
            if((saved[key]??null)!==(limits[key]??null))throw new Error(`Calibration was fitted with ${key}=${saved[key]}. Restore profile settings or unload it before changing limits.`);
        }
        return profile;
    }
    function fit(pairs, input={}, label='Local delivery calibration') {
        if(!pairs.length)throw new Error('Add at least one complete delivery.');
        const limits=checkedLimits(input);
        const rows=pairs.map(p=>({baseline:positive(p.baselineSeconds,'Baseline duration'),actual:positive(p.measuredSeconds,'Measured duration')}));
        rows.forEach(r=>positive(r.baseline,'Predicted baseline duration'));
        const ratios=rows.map(r=>r.actual/r.baseline),scale=quantile(ratios,.5);
        if(scale<.5||scale>3)throw new Error('Fitted correction is outside 0.5–3. Check pairing, units, and endpoints before calibrating.');
        const errors=rows.map(r=>r.baseline*scale-r.actual);
        const groups=new Set(pairs.map(p=>p.group??0)), grouped=groups.size>1;
        const loo=rows.length>1?rows.map((r,i)=>{const training=ratios.filter((_,j)=>grouped?(pairs[j].group??0)!==(pairs[i].group??0):i!==j);return r.baseline*quantile(training,.5)-r.actual;}):[];
        return {schema:'delivery-timing-profile',version:1,model:MODEL,label:String(label).slice(0,120),parameters:{timeScale:scale},nominalLimits:Object.fromEntries(Object.keys(DEFAULT_LIMITS).map(k=>[k,limits[k]])),
            calibration:{method:'median whole-delivery time ratio',source: pairs.every(p=>p.source==='log-commanded-control-points')?'log-commanded-control-points':'paired-plan',deliveryCount:rows.length,
                scaleIqr:[quantile(ratios,.25),quantile(ratios,.75)],trainingBiasSeconds:errors.reduce((a,b)=>a+b,0)/errors.length,trainingMaeSeconds:errors.reduce((a,b)=>a+Math.abs(b),0)/errors.length,
                heldOutMaeSeconds:loo.length?loo.reduce((a,b)=>a+Math.abs(b),0)/loo.length:null,
                validation:grouped?'Leave-one-log-out validation':'Leave-one-subbeam-out validation within the same log',perDelivery:rows.map((r,i)=>({baselineSeconds:r.baseline,measuredSeconds:r.actual,calibratedSeconds:r.baseline*scale,heldOutErrorSeconds:loo[i]??null}))}};
    }
    function validateBeam(profile,beam){
        if(profile?.model===LOCAL_MODEL)axisResponse().prepare(beam,profile.nominalLimits);
    }
    function fitForMethod(pairs,limits,label,method){
        checkedLimits(limits);
        return method==='local'?axisResponse().fit(pairs,limits,label):fit(pairs,limits,label);
    }
    function description(profile){
        return profile.model===LOCAL_MODEL?`Local axis response (${profile.parameters.leafResponseAcceleration.toFixed(0)} mm/s² response parameter)`:`${profile.parameters.timeScale.toFixed(4)}× baseline beam time`;
    }
    function report(profile,files,outside){
        const c=profile.calibration,local=profile.model===LOCAL_MODEL;
        let text=`${c.deliveryCount} arcs from ${files} logs · ${local?description(profile):'correction '+profile.parameters.timeScale.toFixed(4)+'×'}\n`+
            c.perDelivery.map((r,i)=>`Arc ${i+1}: baseline ${r.baselineSeconds.toFixed(2)} s → calibrated ${r.calibratedSeconds.toFixed(2)} s; measured ${r.measuredSeconds.toFixed(2)} s`).join('\n')+
            `\nTotal-time fit MAE: ${c.trainingMaeSeconds.toFixed(2)} s`;
        if(local){
            const fmt=v=>v==null?'not available':v.toFixed(3)+' s';
            text+=`\n${c.validation}\n~1 s window MAE: uniform ${fmt(c.uniformHeldOut.windowMaeSeconds)} → local ${fmt(c.heldOut.windowMaeSeconds)}`;
            if(c.heldOut.arrivalMaeSeconds!=null)text+=`\nCP-arrival MAE: uniform ${fmt(c.uniformHeldOut.arrivalMaeSeconds)} → local ${fmt(c.heldOut.arrivalMaeSeconds)}\nWhole-delivery MAE: uniform ${fmt(c.uniformHeldOut.totalMaeSeconds)} → local ${fmt(c.heldOut.totalMaeSeconds)}`;
            text+='\nThe local response model replaces manual startup/per-CP overheads. Its fitted parameter is empirical, not measured motor acceleration.';
        }else text+=`\n${c.validation}: ${c.heldOutMaeSeconds==null?'not available (one arc)':c.heldOutMaeSeconds.toFixed(2)+' s MAE'}`;
        return text+`\nTime outside delivery: ${outside.toFixed(2)} s (excluded).\nInternal validation only; check independent matched plans/logs before transferring profiles.`;
    }
    function comparePlan(plan, pairs) {
        const beams=plan.beams||[];const issues=[];
        if(beams.length!==pairs.length)issues.push(`Plan has ${beams.length} beams; log has ${pairs.length} subbeams.`);
        const rows=beams.slice(0,pairs.length).map((b,i)=>{
            const log=pairs[i].beam,muDifference=log.totalMeterset-b.totalMeterset;
            const cps=b.controlPoints.length, logCps=log.controlPoints.length;
            if(Math.abs(muDifference)>Math.max(.5,.01*b.totalMeterset))issues.push(`Beam ${i+1}: plan ${b.totalMeterset.toFixed(2)} MU versus log ${log.totalMeterset.toFixed(2)} MU.`);
            if(cps!==logCps)issues.push(`Beam ${i+1}: plan/log CP counts differ (${cps}/${logCps}).`);
            let maxAngle=0;
            if(cps===logCps)b.controlPoints.forEach((cp,j)=>{maxAngle=Math.max(maxAngle,Math.abs(angleDelta(cp.gantryAngle,log.controlPoints[j].gantryAngle)));});
            if(maxAngle>1)issues.push(`Beam ${i+1}: gantry mismatch reaches ${maxAngle.toFixed(1)}° after coordinate conversion.`);
            return {beam:i+1,planMu:b.totalMeterset,logMu:log.totalMeterset,muDifference,planCp:cps,logCp:logCps,maxAngleDifference:maxAngle};
        });
        // CSV lacks a reliable plan UID. Passing these checks is not proof of
        // identical leaf sequences; this tool fits commanded-log paths only.
        return {consistent:!issues.length,issues,rows,note:'MU/CP/gantry checks only. CSV does not establish plan identity; fitting uses log-commanded paths.'};
    }
    function diagnostics(log, windowSeconds=.4) {
        positive(windowSeconds,'Moving window');
        const dt=log.metadata.samplingIntervalMs/1000,n=Math.max(1,Math.round(windowSeconds/dt)),stride=Math.max(1,Math.floor(n/2)),g=[],dose=[],mlc=[];
        const s=log.samples;
        for(let i=n;i<s.length;i+=stride) {
            if(s.slice(i-n,i+1).some(p=>p.actual.hold!==0))continue;
            const duration=n*dt,first=s[i-n].actual,last=s[i].actual;
            const deltaMu=last.mu-first.mu;if(deltaMu<=.001)continue;
            // Sum signed unwrapped increments before averaging across 0/360.
            let angle=0;for(let j=i-n+1;j<=i;j++)angle+=angleDelta(s[j-1].actual.gantry,s[j].actual.gantry);
            g.push(Math.abs(angle)/duration);dose.push(60*deltaMu/duration);
            mlc.push(Math.max(...last.leaves.map((x,j)=>Math.abs(x-first.leaves[j])/duration)));
        }
        const summarize=a=>({median:quantile(a,.5),p95:quantile(a,.95),p99:quantile(a,.99)});
        const windows=deliveryWindows(log);
        const loggedSeconds=s.length*dt,deliverySeconds=windows.reduce((a,w)=>a+w.seconds,0);
        return {windowSeconds:n*dt,loggedSeconds,deliverySeconds,outsideDeliverySeconds:loggedSeconds-deliverySeconds,gantryDegPerSec:summarize(g),doseMuPerMin:summarize(dose),fastestLeafMmPerSec:summarize(mlc)};
    }
    const api={MODEL,LOCAL_MODEL,description,report,fitForMethod,validateBeam,DEFAULT_LIMITS,parseCsv,parseBin,readFile,deliveryWindows,reconstruct,apply,fit,validateProfile,comparePlan,diagnostics,quantile};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TimingCalibration=api;
})(typeof globalThis!=='undefined'?globalThis:this);
