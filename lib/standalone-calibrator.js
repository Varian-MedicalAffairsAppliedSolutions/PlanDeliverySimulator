/* Standalone UI; the timing equations and plots are shared with the simulator. */
(function(){
    'use strict';
    const get=id=>document.getElementById(id),report=get('calibrationReport');
    if(typeof TimingCalibration==='undefined'||typeof LegacyTiming==='undefined'||typeof CalibrationPlots==='undefined'){
        report.textContent='A required local script could not load. Keep the HTML beside its lib folder.';return;
    }
    const panel=new CalibrationPlots.Panel(document,typeof Chart==='undefined'?null:Chart);
    let profile=null;
    const settings=()=>Object.fromEntries(Object.keys(TimingCalibration.DEFAULT_LIMITS).map(id=>[id,get(id).value.trim()===''?NaN:Number(get(id).value)]));
    function invalidate(){profile=null;get('downloadCalibration').disabled=true;panel.clear();report.textContent='Inputs changed. Analyze logs to refresh the predictions and calibration.';}
    for(const id of ['calibrationLogs','calibrationDoseRate','calibrationLabel','calibrationMethod',...Object.keys(TimingCalibration.DEFAULT_LIMITS)])get(id).addEventListener('change',invalidate);
    get('loadCalibrationSettings').addEventListener('click',()=>get('calibrationSettingsFile').click());
    get('calibrationSettingsFile').addEventListener('change',async event=>{
        const file=event.target.files[0];if(!file)return;
        try{
            const imported=TimingCalibration.validateProfile(JSON.parse(await file.text()));
            for(const id of Object.keys(TimingCalibration.DEFAULT_LIMITS))get(id).value=imported.nominalLimits[id];
            get('calibrationLabel').value=imported.label||'Delivery calibration';
            get('calibrationMethod').value=imported.model===TimingCalibration.LOCAL_MODEL?'local':'uniform';
            const dose=imported.calibration?.nominalLogDoseRate;
            if(Number.isFinite(dose)&&dose>0)get('calibrationDoseRate').value=dose;
            invalidate();report.textContent='Profile settings loaded. Select logs and analyze to generate comparison plots.';
        }catch(error){report.textContent=error.message;}
        finally{event.target.value='';}
    });
    get('analyzeCalibration').addEventListener('click',async()=>{
        const files=Array.from(get('calibrationLogs').files),dose=Number(get('calibrationDoseRate').value),limits=settings();
        const controls=Array.from(document.querySelectorAll('input,button,select'));
        const previous=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
        profile=null;panel.clear();report.textContent='Reading logs…';
        try{
            if(!files.length)throw new Error('Select at least one trajectory .bin or .csv file.');
            if(!Number.isFinite(dose)||dose<=0)throw new Error('Enter a positive nominal dose rate.');
            // Validate the full baseline before invoking Legacy's fallback rules.
            TimingCalibration.fit([{baselineSeconds:1,measuredSeconds:1}],limits);
            const pairs=[],comparisons=[];let outside=0;
            for(let group=0;group<files.length;group++){
                const log=await TimingCalibration.readFile(files[group]);
                if(![80,120].includes(log.leafCount))throw new Error('Automatic calibration supports 80- or 120-leaf single-layer MLC logs only.');
                for(const pair of TimingCalibration.reconstruct(log,dose)){
                    const predicted=LegacyTiming.predict(pair.beam,limits,dose);
                    pair.baselineData=predicted.data;pair.baselineSeconds=predicted.totalTime;pair.group=group;pairs.push(pair);
                    comparisons.push({label:`Log ${group+1} · arc ${pair.beam.beamNumber}`,comparison:CalibrationPlots.buildComparison(log,pair,predicted.data)});
                }
                outside+=TimingCalibration.diagnostics(log).outsideDeliverySeconds;
            }
            panel.set(comparisons);
            profile=TimingCalibration.fitForMethod(pairs,limits,get('calibrationLabel').value||'Delivery calibration',get('calibrationMethod').value);
            profile.calibration.nominalLogDoseRate=dose;
            CalibrationPlots.calibrate(comparisons,pairs,profile,TimingCalibration);
            panel.set(comparisons,profile.parameters.timeScale??1);
            report.textContent=TimingCalibration.report(profile,files.length,outside);
        }catch(error){profile=null;report.textContent=error.message;}
        finally{controls.forEach((el,i)=>el.disabled=previous[i]);get('downloadCalibration').disabled=!profile;}
    });
    get('downloadCalibration').addEventListener('click',()=>{
        if(!profile)return;
        const url=URL.createObjectURL(new Blob([JSON.stringify(profile,null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='delivery-calibration.json';a.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
})();
