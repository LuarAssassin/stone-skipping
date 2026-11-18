import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
const directory=new URL('../deliverables/coherent-water-baseline/',import.meta.url).pathname;
const cli=(...args)=>execFileSync('alma',['iab',...args],{encoding:'utf8',maxBuffer:8*1024*1024});
const evaluate=expression=>JSON.parse(cli('eval',expression));
const preserve=(name,extension)=>{const path=directory+name+'.'+extension,previous=directory+name+'.previous.'+extension;if(existsSync(path)&&!existsSync(previous))copyFileSync(path,previous);};
const snapshot=JSON.parse(readFileSync(directory+'last-contact.previous.json')).snapshot;
evaluate(`(()=>{const r=waterReview;r.session.paused=true;window.momentumTick=r.session.tick;r.session.tick=()=>{};r.side=false;window.momentumSnapshot=${JSON.stringify(snapshot)};return true;})()`);
const capture=(name,time,{camera,mouse}={})=>{
 for(const extension of ['png','json'])preserve(name,extension);
 const state=evaluate(`(()=>{const r=waterReview,s=r.session;s.mouseMode=false;s.replay(window.momentumSnapshot);s.mouseMode=${!!mouse};${mouse?`s.mouse=${JSON.stringify(mouse)};`:''}s.advance(${time});s.paused=true;r.rig.view='follow';const commands=structuredClone(s.waterTicks);r.render();${camera?`r.world.camera.position.fromArray(${JSON.stringify(camera)});r.world.camera.lookAt(${mouse?mouse.x+'+.5':'s.sim.p.x+.5'},${mouse?'.03':'Math.max(.03,s.sim.p.y)'},${mouse?mouse.z:'s.sim.p.z'});r.world.renderer.render(r.world.scene,r.world.camera);`:''}const data=r.world.waterField.solver.read(r.world.renderer);let peak=0,min=0,max=0,sum=0,hash=2166136261;const heights=[];for(const byte of new Uint8Array(data.buffer))hash=Math.imul(hash^byte,16777619)>>>0;for(let row=0;row<256;row++)for(let col=0;col<512;col++){const h=data[(row*512+col)*4];peak=Math.max(peak,Math.abs(h));min=Math.min(min,h);max=Math.max(max,h);sum+=h*h;if(row%4===0&&col%4===0)heights.push(h);}return {visualTime:s.visualTime,simTime:s.sim.time,ended:s.sim.ended,skips:s.sim.skips,position:s.sim.p.toArray(),snapshot:s.snapshot,mouse:s.mouse,mouseMode:s.mouseMode,contacts:s.sim.contacts,camera:r.world.camera.position.toArray(),cameraQuaternion:r.world.camera.quaternion.toArray(),cameraFov:r.world.camera.fov,commands,gpu:{hash,peak,min,max,rms:Math.sqrt(sum/(512*256)),sampledHeightSize:[128,64],sampledHeights:heights},glError:r.world.renderer.getContext().getError()};})()`);
 writeFileSync(directory+name+'.json',JSON.stringify(state,null,2));cli('screenshot','--out',directory+name+'.png');
 return {name,time:state.visualTime,peak:state.gpu.peak,min:state.gpu.min,max:state.gpu.max,rms:state.gpu.rms,impulseY:state.commands.reduce((sum,tick)=>sum+(tick.momentum?.impulseY??0),0)};
};
const results=[];
for(const name of ['last-contact','final-sink','post-sink']){const old=JSON.parse(readFileSync(directory+name+'.previous.json'));results.push(capture(name,old.visualTime,{camera:old.camera}));}
for(const time of [.266,.3,.57,.635,.8,1.99,2.5,4])results.push(capture('stone-'+String(Math.round(time*1000)).padStart(4,'0'),time));
results.push(capture('mouse-matched-0100',.1,{mouse:{x:6.58,z:-.093,y:0,radius:.04,aspect:.75,depth:.0045,angle:0},camera:JSON.parse(readFileSync(directory+'last-contact.previous.json')).camera}));
evaluate(`(()=>{const r=waterReview;r.session.mouseMode=false;r.session.replay(window.momentumSnapshot);r.session.advance(.72675);r.session.paused=true;r.rig.view='follow';r.session.tick=window.momentumTick;delete window.momentumTick;r.render();return true;})()`);
writeFileSync(directory+'momentum-capture-index.json',JSON.stringify({method:'Same retained physical snapshot. Close views retain old exact camera positions; old quaternion was not recorded, look target reconstructed from follow rule; new quaternion/fov stored. Matched mouse is explicit kinematic 8cm x 6cm proxy, NOT measured physical impulse. Other stone views use follow.',results},null,2));
console.log(JSON.stringify(results,null,2));
