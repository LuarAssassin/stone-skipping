import { test } from 'node:test';
import { breakupField } from '../src/rendering/breakup-noise';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Session } from '../src/app/session';
import { DEFAULT } from '../src/simulation/physics';
import { sampleThrow, parseSnapshot } from '../src/simulation/launch-randomness';
import { HeightField } from '../src/rendering/heightfield';
import { makeParticle, makeSheet, sheetPoint } from '../src/rendering/effects';
import { VISUAL_DEFAULTS, validateVisual, visualHash } from '../src/simulation/visual-variation';
const snapshot=sampleThrow(DEFAULT,0,271);
test('breakup field is frozen, spatially correlated and has no old sine period',()=>{
 const samples=Array.from({length:256},(_,index)=>breakupField(index/255,.73,2.1,1.07));
 assert.ok(samples.every(value=>value>=0&&value<=1));
 const nearby=samples.reduce((sum,value,index)=>sum+Math.abs(value-breakupField(index/255+.0001,.73,2.1,1.07)),0)/samples.length;
 assert.ok(nearby<.003);
 assert.deepEqual(samples,Array.from({length:256},(_,index)=>breakupField(index/255,.73,2.1,1.07)));
 assert.ok(samples.some((value,index)=>Math.abs(value-breakupField(index/255+2*Math.PI/61,.73,2.1,1.07))>.1));
});
test('new throws have separate visual identity; per-tick physics is identical under visual replacement',()=>{
 const session=new Session(()=>271);session.start(DEFAULT,0);const first=session.snapshot!.visual!.seed;session.start(DEFAULT,0);assert.notEqual(session.snapshot!.visual!.seed,first);
 const left=new Session(),right=new Session();left.replay({...snapshot,visual:{seed:0,surface:0,sheet:0,breakup:0}});right.replay({...snapshot,visual:{seed:15,surface:2,sheet:2,breakup:2}});
 for(let tick=0;tick<2800;tick++){left.advance(1/4000);right.advance(1/4000);assert.deepEqual(left.sim.p,right.sim.p);assert.deepEqual(left.sim.v,right.sim.v);assert.deepEqual(left.sim.q,right.sim.q);assert.equal(left.sim.skips,right.sim.skips);}
});
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function run(seed:number,temperatures:{surface:number;sheet:number;breakup:number}=VISUAL_DEFAULTS,groups=[64]){
 const session=new Session();session.replay({...snapshot,visual:{seed,...temperatures}});
 let frame=0;const trajectory:number[][]=[];
 while(session.visualTime<.4-1e-10){session.advance(Math.min(groups[frame++%groups.length]/4000,.4-session.visualTime));}
 trajectory.push([...session.sim.p.toArray(),...session.sim.v.toArray(),...session.sim.q.toArray(),session.sim.skips]);
 return {session,trajectory};
}
test('visual metadata v1 legacy compatibility, validated preservation and bounds',()=>{
 assert.deepEqual(parseSnapshot(JSON.stringify(snapshot)),snapshot);
 const complete={...snapshot,visual:{seed:4294967295,surface:0,sheet:1.35,breakup:2}};
 assert.deepEqual(parseSnapshot(JSON.stringify(complete)),complete);
 for(const key of ['surface','sheet','breakup'] as const)for(const value of [-.01,2.01,NaN,Infinity])assert.throws(()=>validateVisual({...complete.visual,[key]:value}));
 for(const seed of [-1,.5,4294967296])assert.throws(()=>validateVisual({...complete.visual,seed}));
 assert.throws(()=>parseSnapshot(JSON.stringify({...complete,visual:{...complete.visual,sheet:'1'}})));
});
test('source moment integrates only actual duration, with no birth height or impulse boost',()=>{
 const field=new HeightField(),birth=.00625,index=128*field.width+128;
 field.advance(birth);assert.equal(field.displayHeight(index,birth),0);
 field.disturb({time:birth,x:128*16/511,z:128*8/255-4,radius:.09,strength:.02});
 const jump=field.velocity[index];assert.ok(jump<0);
 assert.ok(Math.abs(field.displayHeight(index,birth))<1e-16);
 for(let offset=.00025;offset<.002;offset+=.00025)assert.ok(Math.abs(field.displayHeight(index,birth+offset)-jump*offset)<1e-16);
 const expected=jump*(field.dt-birth)*Math.exp(-.65*field.dt);field.step();assert.ok(Math.abs(field.height[index]-expected)<1e-10);
 field.clear();assert.equal(field.displayHeight(index,0),0);
});
test('actual first contact 0–50ms: no precontact h; first h and normal next physics tick at 1x and .05x',()=>{
 const observations=[];
 for(const rate of [1,.05]){
  const session=new Session();session.replay({...snapshot,visual:{seed:7,...VISUAL_DEFAULTS}});session.mode=rate===1?'normal':'bullet';let before=0;
  while(!session.sim.contacts.length){assert.equal(session.effects.sources.length,0);before=session.effects.field.height.reduce((maximum,value)=>Math.max(maximum,Math.abs(value)),0);session.tick(1/4000/rate);}
  assert.equal(before,0);const contact=session.sim.contacts[0],born=session.visualTime,field=session.effects.field;
  const col=Math.round((contact.centroid??contact.point).x/16*511),row=Math.round(((contact.centroid??contact.point).z+4)/8*255),index=row*512+col;
  const frames=[];let firstH:number|undefined,firstNormal:number|undefined;
  for(let tick=0;tick<=200;tick++){
   const time=session.visualTime,h=field.displayHeight(index,time),slope=(field.displayHeight(index+1,time)-field.displayHeight(index-1,time))/(32/511);
   if(Math.abs(h)>1e-12&&firstH===undefined)firstH=time-born;
   if(Math.abs(slope)>1e-12&&firstNormal===undefined)firstNormal=time-born;
   frames.push({simulationMs:(time-born)*1000,wallMs:(time-born)*1000/rate,h,slope});session.tick(1/4000/rate);
  }
  assert.ok(firstH!==undefined&&firstH<=.000251);assert.ok(firstNormal!==undefined&&firstNormal<=.000251);
  observations.push({rate,contactTime:contact.time,sourceRegistered:born,firstH,firstNormal,eventToFirstHMs:((firstH??0)+born-contact.time)*1000,eventToFirstHWallMs:((firstH??0)+born-contact.time)*1000/rate,frames});
 }
 if(process.env.WATER_VARIATION_REPORT){mkdirSync('deliverables/water-variation',{recursive:true});writeFileSync('deliverables/water-variation/early-contact.json',JSON.stringify(observations,null,2));}
});
test('16 real seed outputs / T0 default high: unique profiles, bounded energy, isolated channels and repeatable complete replay',()=>{
 const report=[];let physics:string|undefined;
 for(const [tier,temperatures] of [['zero',{surface:0,sheet:0,breakup:0}],['default',VISUAL_DEFAULTS],['high',{surface:2,sheet:2,breakup:2}]] as const){
  const rows=[];
  for(let seed=0;seed<16;seed++){
   const {session,trajectory}=run(seed,temperatures);const contact=session.sim.contacts[0];assert.ok(contact);
   const sheet=session.effects.sheets[0];assert.ok(sheet);
   const vertices=Array.from({length:49},(_,index)=>sheetPoint(sheet,session.visualTime,index/48,.65));
   const center=sheetPoint(sheet,session.visualTime,.5,.65),left=sheetPoint(sheet,session.visualTime,0,.65),right=sheetPoint(sheet,session.visualTime,1,.65);
   const width=(point:number[])=>Math.hypot(point[0]-center[0],point[2]-center[2]);
   const mask:boolean[]=[];const smooth=(low:number,high:number,value:number)=>{const weight=Math.max(0,Math.min(1,(value-low)/(high-low)));return weight*weight*(3-2*weight);};let holes=0;for(let row=0;row<24;row++)for(let col=0;col<48;col++){const u=col/47,v=row/23,scale=sheet.holeScale??1,phase=sheet.holePhase??0;const noise=breakupField(u,v,phase,scale);const age=(session.visualTime-sheet.birth)/sheet.life;const removed=noise<Math.max(smooth(.08,.65,age)*smooth(.5,1,v)*.85,smooth(.38,.9,v)*.54);mask.push(removed);if(removed)holes++;}
   const particleEnergy=session.effects.particles.reduce((sum,particle)=>sum+particle.size**3*particle.velocity.reduce((total,value)=>total+value*value,0),0);
   assert.ok(vertices.flat().every(Number.isFinite));assert.ok(particleEnergy<.002);
   for(let index=1;index<vertices.length;index++){const deltaX=vertices[index][0]-vertices[index-1][0],deltaZ=vertices[index][2]-vertices[index-1][2];assert.ok(-sheet.direction[1]*deltaX+sheet.direction[0]*deltaZ>0);}
   const nodes=sheet.path??[];
   assert.ok(nodes.length>2);assert.ok(nodes.every(Object.isFrozen));
   assert.ok(Math.max(...nodes.map(node=>node.width))-Math.min(...nodes.map(node=>node.width))>.01);
   assert.ok(Math.max(...nodes.map(node=>node.vy))-Math.min(...nodes.map(node=>node.vy))>.1);
   const actual={vertices,particles:session.effects.particles,sources:session.effects.sources,mask};
   rows.push({seed,nodeWidthRange:[Math.min(...nodes.map(node=>node.width)),Math.max(...nodes.map(node=>node.width))],nodeLiftRange:[Math.min(...nodes.map(node=>node.vy)),Math.max(...nodes.map(node=>node.vy))],leftWidth:width(left),rightWidth:width(right),holes,particleCount:session.effects.particles.length,particleEnergy,shapeSignature:digest(vertices),holeSignature:digest(mask),dropSignature:digest(session.effects.particles),signature:digest(actual)});
   if(!physics)physics=digest(trajectory);assert.equal(digest(trajectory),physics);
   assert.deepEqual(makeSheet(contact,1,.1,{seed,...temperatures}),makeSheet(contact,1,.1,{seed,...temperatures}));
   const sheetBefore=makeSheet(contact,1,.1,{seed,...temperatures});for(let index=0;index<100;index++)makeParticle(contact,4,index,.1,{seed,...temperatures});assert.deepEqual(makeSheet(contact,1,.1,{seed,...temperatures}),sheetBefore);
  }
  const unique=new Set(rows.map(row=>row.signature)).size;assert.equal(unique,tier==='zero'?1:16);
  for(const key of ['shapeSignature','holeSignature','dropSignature'] as const)assert.equal(new Set(rows.map(row=>row[key])).size,tier==='zero'?1:16);
  report.push({tier,temperatures,unique,repeats:16-unique,rows});
 }
 const first=run(7),repeat=run(7,VISUAL_DEFAULTS,[1,120,17]);
 const contact=first.session.sim.contacts[0];
 const base=makeSheet(contact,1,.1,{seed:7,...VISUAL_DEFAULTS});
 for(const channel of ['surface','sheet'] as const){
  const changed=makeSheet(contact,1,.1,{seed:7,...VISUAL_DEFAULTS,[channel]:2});
  assert.equal(changed.holePhase,base.holePhase);assert.equal(changed.holeScale,base.holeScale);
 }
 const zeroProfiles=Array.from({length:16},(_,seed)=>{const sheet=makeSheet(contact,1,.1,{seed,surface:0,sheet:0,breakup:0});return [sheet.holePhase,sheet.holeScale];});
 assert.ok(zeroProfiles.every(profile=>JSON.stringify(profile)===JSON.stringify(zeroProfiles[0])));
 assert.deepEqual(first.session.effects.sources,repeat.session.effects.sources);assert.deepEqual(first.session.effects.particles,repeat.session.effects.particles);assert.deepEqual(first.session.effects.sheets,repeat.session.effects.sheets);assert.deepEqual(first.session.effects.field.height,repeat.session.effects.field.height);
 first.session.advance(.8);repeat.session.advance(.8);assert.ok(first.session.effects.sources.some(source=>source.kind==='drop'));assert.deepEqual(first.session.effects.sources,repeat.session.effects.sources);assert.deepEqual(first.session.effects.sheets,repeat.session.effects.sheets);assert.deepEqual(first.session.effects.particles,repeat.session.effects.particles);
 assert.equal(visualHash(7,1,2),visualHash(7,1,2));assert.notEqual(visualHash(7,1,2),visualHash(7,1,3));
 if(process.env.WATER_VARIATION_REPORT){mkdirSync('deliverables/water-variation',{recursive:true});writeFileSync('deliverables/water-variation/diversity.json',JSON.stringify({physicalSeed:271,physicalTemperature:0,time:.4,physicsDigest:physics,report},null,2));}
});
