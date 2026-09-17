const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
module.exports=function harness(htmlOverride){
 const html=htmlOverride??fs.readFileSync(path.join(__dirname,'../RP_Delivery_Simulator.html'),'utf8');
 const C=require('../lib/timing-calibration.js');
 const inputs=new Map();
 const get=id=>{if(!inputs.has(id)) inputs.set(id,{value:'',textContent:'',checked:false,children:[],replaceChildren(){this.children=[];},appendChild(child){this.children.push(child);},disabled:false,files:[],events:{},addEventListener(name,fn){this.events[name]=fn;},click(){this.events.click?.();},querySelectorAll(){return [];},showModal(){this.open=true;},close(){this.open=false;}});return inputs.get(id);};
 get('calibrationAverage').value='0.4';get('calibrationPreview').checked=true;
 Object.entries(C.DEFAULT_LIMITS).forEach(([id,v])=>get(id).value=String(v));
 const context=vm.createContext({console,LegacyTiming:require('../lib/legacy-timing.js'),CalibrationPlots:require('../lib/calibration-plots.js'),TimingCalibration:C,document:{getElementById:get,createElement:()=>({click(){}})},setTimeout,Blob,URL,
  ...Object.fromEntries(Object.keys(C.DEFAULT_LIMITS).map(id=>[id,get(id)])),
  timingModelStatus:get('timingModelStatus'),applySpeedLimitsBtn:get('applySpeedLimitsBtn'),totalPlanSimTimeSpan:get('totalPlanSimTime'),
  isPlaying:false,fullPlanToggle:get('fullPlanToggle'),beamSelector:get('beamSelector'),
  calculateApertureArea:()=>0,calculateAAVAtCP:()=>0,calculateModulationIndex:()=>0,prepareBeamDerivedData(){},updateMiniMetricScales(){},
  updateBeamDetailsSummary(){},computePlanCpOffsets(){},renderCpTrackBar(){},initVisualizationForSelectedBeam(){},renderStampStrips(){}
 });
 const run=code=>vm.runInContext(code,context);
 const extract=(start,end)=>{const a=html.indexOf(start),b=html.indexOf(end,a);if(a<0||b<a)throw Error(start);run(html.slice(a,b));};
 run('let rtPlanData=null, loadedTimingProfile=null, activeTimingMetadata={},allBeamsProcessedData=[]; let currentMaxGantrySpeed,currentMaxMlcSpeedMMPS,currentMaxCollimatorSpeed,currentMaxGantryAccelDecel,currentMaxMlcAccelDecelMMPS2,currentMaxCollimatorAccelDecel,currentBeamStartOverheadSec,currentSegmentOverheadSec;');
 extract('            const DEFAULTS_RDS','            const COMPONENT_COLORS');
 extract('            function updateCurrentSpeedLimits()',"            applySpeedLimitsBtn.addEventListener");
 extract('            function calibrationSettings()', '            function getBankPositions(');
 extract('            function getEffectiveMLCPositionsForCP(', '            function calculateLSVForBankAtCP(');
 extract('            function normalizeGantryAngleDiff(', '            function calculateStdDev(');
 extract('            function calculateInterBeamTime(', '            function calculateCpDensity(');
 run('updateCurrentSpeedLimits()');
 return {run,get,context,extract,baseline(beam,dose=600){context.testBeam=beam;context.testDose=dose;return run('calculateSegmentTimes(testBeam,testBeam.controlPoints,[],testDose)');}};
};
