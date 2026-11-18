import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const directory=new URL('../deliverables/surface-readability/',import.meta.url).pathname;
mkdirSync(directory,{recursive:true});
const phase=process.argv[2]??'before';
const cli=(...args)=>execFileSync('alma',['iab',...args],{encoding:'utf8',maxBuffer:8*1024*1024});
const evaluate=expression=>JSON.parse(cli('eval',expression));
const baseline=new URL('../deliverables/coherent-water-baseline/',import.meta.url).pathname;
const source=JSON.parse(readFileSync(baseline+'last-contact.json'));
const cases=[['early-contact',.3,'stone-0300'],['last-contact',.72675,'last-contact'],['final-sink',2.04325,'final-sink'],['post-sink',2.54325,'post-sink'],['mouse-continuous',.3,'stone-0300']];
evaluate(`(()=>{const r=waterReview;r.session.paused=true;window.surfaceSavedTick??=r.session.tick;r.session.tick=()=>{};r.side=false;return true;})()`);
const results=[];
for(const [name,time,poseName] of cases){
 const prior=phase==='before'?JSON.parse(readFileSync(baseline+poseName+'.json')):JSON.parse(readFileSync(directory+'before-'+name+'.json'));
 const state=evaluate(`(()=>{const r=waterReview,s=r.session;s.mouseMode=false;s.diagnosticContact=undefined;s.replay(${JSON.stringify(source.snapshot)});s.mouseMode=${name==='mouse-continuous'};${name==='mouse-continuous'?`s.mouse={x:2.6,z:0,y:0,radius:.22,depth:.075};`:''}s.advance(${time});s.paused=true;r.rig.view='follow';r.render();r.world.camera.position.fromArray(${JSON.stringify(prior.camera)});${prior.cameraQuaternion?`r.world.camera.quaternion.fromArray(${JSON.stringify(prior.cameraQuaternion)});`:'r.world.camera.lookAt(s.sim.p.x+.5,Math.max(.03,s.sim.p.y),s.sim.p.z);'}r.world.camera.fov=${prior.cameraFov??48};r.world.camera.updateProjectionMatrix();window.surfacePose={position:r.world.camera.position.clone(),quaternion:r.world.camera.quaternion.clone(),fov:r.world.camera.fov};r.rig.update=()=>{r.world.camera.position.copy(window.surfacePose.position);r.world.camera.quaternion.copy(window.surfacePose.quaternion);r.world.camera.fov=window.surfacePose.fov;r.world.camera.updateProjectionMatrix();};r.render();const data=r.world.waterField.solver.read(r.world.renderer);let peak=0,hash=2166136261;for(const byte of new Uint8Array(data.buffer))hash=Math.imul(hash^byte,16777619)>>>0;for(let index=0;index<data.length;index+=4)peak=Math.max(peak,Math.abs(data[index]));return {visualTime:s.visualTime,simTime:s.sim.time,snapshot:s.snapshot,mouse:s.mouse,camera:r.world.camera.position.toArray(),cameraQuaternion:r.world.camera.quaternion.toArray(),cameraFov:r.world.camera.fov,viewport:[innerWidth,innerHeight,devicePixelRatio],gpu:{hash,peak},programs:r.programs(),shaderErrors:r.errors,glError:r.world.renderer.getContext().getError()};})()`);
 writeFileSync(directory+phase+'-'+name+'.json',JSON.stringify(state,null,2));
 cli('screenshot','--out',directory+phase+'-'+name+'.png');
 if(phase==='after'){
  evaluate('(()=>{waterReview.surfaceOnly(true);waterReview.render();return true;})()');
  cli('screenshot','--out',directory+'surface-only-'+name+'.png');
  evaluate('(()=>{waterReview.surfaceOnly(false);return true;})()');
 }
 results.push({name,...state,gpu:state.gpu,snapshot:undefined});
}
writeFileSync(directory+phase+'-index.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(({name,visualTime,gpu,glError,shaderErrors})=>({name,visualTime,gpu,glError,shaderErrors})),null,2));
