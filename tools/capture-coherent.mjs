import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const directory=new URL('../deliverables/coherent-water-baseline/',import.meta.url).pathname;
const cli=(...args)=>execFileSync('alma',['iab',...args],{encoding:'utf8',maxBuffer:4*1024*1024});
const evaluate=expression=>JSON.parse(cli('eval',expression));
const pointer=(type,x,y,buttons=0)=>cli('cdp','Input.dispatchMouseEvent',JSON.stringify({type,x,y,button:type==='mouseMoved'?'none':'left',buttons,clickCount:type==='mouseMoved'?0:1}));
const capture=name=>{
 const state=evaluate(`(()=>{const r=waterReview,s=r.session;r.render();const data=r.world.waterField.solver.read(r.world.renderer);let peak=0,sum=0,hash=2166136261;const heights=[];const bytes=new Uint8Array(data.buffer);for(const byte of bytes)hash=Math.imul(hash^byte,16777619)>>>0;for(let row=0;row<256;row++)for(let col=0;col<512;col++){const h=data[(row*512+col)*4];peak=Math.max(peak,Math.abs(h));sum+=h*h;if(row%4===0&&col%4===0)heights.push(h);}return {visualTime:s.visualTime,simTime:s.sim.time,ended:s.sim.ended,skips:s.sim.skips,position:s.sim.p.toArray(),snapshot:s.snapshot,mouse:s.mouse,mouseMode:s.mouseMode,contacts:s.sim.contacts,camera:r.world.camera.position.toArray(),gpu:{hash,peak,rms:Math.sqrt(sum/(512*256)),sampledHeightSize:[128,64],sampledHeights:heights},glError:r.world.renderer.getContext().getError()};})()`);
 writeFileSync(directory+name+'.json',JSON.stringify(state,null,2));
 cli('screenshot','--out',directory+name+'.png');
 return {name,time:state.visualTime,simTime:state.simTime,ended:state.ended,skips:state.skips,peak:state.gpu.peak,rms:state.gpu.rms,hash:state.gpu.hash};
};
const index=[];
evaluate(`(()=>{const r=waterReview;r.session.paused=true;window.savedWaterTick=r.session.tick;r.session.tick=()=>{};r.side=false;return true;})()`);
cli('click','#mouse-water');
evaluate(`(()=>{const s=waterReview.session;s.paused=true;return true;})()`);
pointer('mousePressed',330,405,1);
evaluate('(()=>{waterReview.session.advance(.1);waterReview.session.paused=true;return true;})()');index.push(capture('mouse-0100'));
pointer('mouseMoved',385,420,1);
evaluate('(()=>{waterReview.session.advance(.1);waterReview.session.paused=true;return true;})()');index.push(capture('mouse-drag-0200'));
pointer('mouseReleased',385,420,0);
pointer('mousePressed',435,390,1);
evaluate('(()=>{waterReview.session.advance(.1);waterReview.session.paused=true;return true;})()');index.push(capture('mouse-overlap-0300'));
pointer('mouseReleased',435,390,0);
evaluate('(()=>{waterReview.session.advance(.3);waterReview.session.paused=true;return true;})()');index.push(capture('mouse-release-0600'));
cli('click','#throw');
evaluate(`(()=>{const r=waterReview;r.session.paused=true;window.captureSnapshot=structuredClone(r.session.snapshot);return true;})()`);
for(const time of [.266,.3,.57,.635,.8,1.99,2.5,4]){
 evaluate(`(()=>{const r=waterReview;r.session.replay(window.captureSnapshot);r.session.advance(${time});r.session.paused=true;r.side=false;return true;})()`);
 index.push(capture('stone-'+String(Math.round(time*1000)).padStart(4,'0')));
}
evaluate(`(()=>{const r=waterReview;r.session.tick=window.savedWaterTick;delete window.savedWaterTick;r.session.replay(window.captureSnapshot);r.session.advance(.635);r.session.paused=true;r.render();return true;})()`);
writeFileSync(directory+'capture-index.json',JSON.stringify({input:'Actual CDP pointer drag/release/re-press in explicit mouse toggle; actual Throw button; replayed captured full throw snapshot at exact visual times. Tick was held during controlled input, not a substitute solver.',captures:index},null,2));
console.log(JSON.stringify(index,null,2));
