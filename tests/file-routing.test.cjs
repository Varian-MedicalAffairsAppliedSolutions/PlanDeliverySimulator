const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../RP_Delivery_Simulator.html'),'utf8');
function setup(){
 const calls=[],ctx={logPlaybackState:null,logPlaybackLoading:false,dicomFileInput:{value:'selected'},loadTrajectoryPlayback:f=>calls.push(['bin',f.name]),handleDicomFile:f=>calls.push(['dcm',f.name]),handleJsonFile:f=>calls.push(['json',f.name]),showMessageModal:(title,message)=>calls.push(['error',message])};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('            function handleFile(file)'),html.indexOf("            dicomDropZone.addEventListener('dragover'")),ctx);return {ctx,calls};
}
test('main upload routes BIN playback and retains multi-file DICOM/JSON loading',()=>{
 const {ctx,calls}=setup();ctx.handleFiles([{name:'delivery.BIN'}]);assert.deepEqual(calls,[['bin','delivery.BIN']]);
 calls.length=0;ctx.handleFiles([{name:'plan.dcm'},{name:'structures.dcm'},{name:'plan.json'}]);assert.deepEqual(calls,[['dcm','plan.dcm'],['dcm','structures.dcm'],['json','plan.json']]);
});
test('mixed or multiple log selection fails before loading any file; playback blocks new drops',()=>{
 const {ctx,calls}=setup();
 for(const files of [[{name:'plan.dcm'},{name:'log.bin'}],[{name:'a.bin'},{name:'b.bin'}]]){calls.length=0;ctx.handleFiles(files);assert.equal(calls.length,1);assert.equal(calls[0][0],'error');}
 calls.length=0;ctx.logPlaybackLoading=true;ctx.handleFiles([{name:'log.bin'}]);assert.equal(calls.length,0);
 ctx.logPlaybackLoading=false;ctx.logPlaybackState={};ctx.handleFiles([{name:'plan.dcm'}]);assert.equal(calls.length,0);
});
