import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Session,PLAYBACK_RATE,type ReplayMode} from '../src/app/session';
import {DEFAULT} from '../src/simulation/physics';
import {displaced,dryFootprint,CoherentWater,BASE_GRID} from '../src/rendering/coherent';
import * as THREE from 'three';
import {createWater} from '../src/rendering/water';
test('full sink and after-sink command replay survives normal slow bullet and irregular RAF',()=>{
 const reference=run([1/60],4);
 for(const mode of ['normal','slow','bullet'] as ReplayMode[]){
  const session=new Session();session.replay(reference.snapshot);session.mode=mode;let frame=0;
  while(session.visualTime<4-1e-8)session.tick(Math.min([.003,.031,.007][frame++%3],(4-session.visualTime)/PLAYBACK_RATE[mode]));
  assert.deepEqual(session.waterTicks,reference.waterTicks);assert.deepEqual(session.sim.p,reference.sim.p);assert.equal(session.sim.time,reference.sim.time);assert.equal(session.waterTicks.length,480);
 }
});
test('real projected stone footprint has finite physical horizontal and vertical bounds',()=>{
 const session=run([.02],.8);
 for(const {next} of session.waterTicks){assert.ok(next.radius>=.03&&next.radius<=.040001);assert.ok(next.aspect!>0&&next.aspect!<=1);assert.ok(next.depth>=.0045&&next.depth<=.041);assert.ok(Number.isFinite(next.angle));}
 assert.ok(session.waterTicks.some(({next})=>next.aspect!<.9));
});
test('GPU source uniforms receive orientation and reject zero NaN shape commands',()=>{
 const solver=new CoherentWater(BASE_GRID),captured:THREE.Vector4[]=[];
 const renderer={getRenderTarget:()=>null,setRenderTarget:()=>{},render:(scene:THREE.Scene)=>{const material=(scene.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;captured.push(material.uniforms.shapes.value.clone());}} as unknown as THREE.WebGLRenderer;
 solver.step(renderer,{old:dryFootprint(),next:{x:2,z:0,y:0,radius:.04,depth:.01,aspect:.5,angle:1.2}});
 assert.deepEqual(captured[0].toArray().slice(0,2),[1,0]);
 assert.deepEqual(captured[BASE_GRID.substeps].toArray().slice(2),[.5,1.2]);
 solver.step(renderer,{old:dryFootprint(),next:{x:2,z:0,y:0,radius:0,depth:NaN,aspect:0,angle:NaN}});
 assert.deepEqual(captured[3].toArray(),[1,0,1,0]);solver.dispose();
});
test('generation clears both targets once, drains queue once and keeps target resources stable',()=>{
 const water=createWater(),targets=[...water.solver.targets];let clears=0,steps=0;
 water.solver.clear=()=>{clears++;};water.solver.step=()=>{steps++;};water.solver.updateCaustics=()=>{};
 const queue=[{old:dryFootprint(),next:dryFootprint()}];
 water.update(null as unknown as THREE.WebGLRenderer,queue,1);water.update(null as unknown as THREE.WebGLRenderer,queue,1);
 assert.equal(queue.length,0);assert.equal(steps,1);assert.equal(clears,1);
 water.update(null as unknown as THREE.WebGLRenderer,queue,2);assert.equal(clears,2);assert.deepEqual(water.solver.targets,targets);water.solver.dispose();
});
function run(groups:number[],time=2){const session=new Session(()=>271);session.start(DEFAULT,0);let index=0;while(session.visualTime<time-1e-8)session.advance(Math.min(groups[index++%groups.length],time-session.visualTime));return session;}
test('shared source footprint returns old displaced volume and vanishes when sunk',()=>{
 const source={x:2,z:0,y:0,radius:.075,depth:.009};
 assert.ok(displaced(source,2,0)>0);
 assert.equal(displaced(dryFootprint(),2,0),0);
 assert.equal(displaced({...source,y:-.3},2,0),0);
 let oldVolume=0,newVolume=0;
 for(let row=-50;row<=50;row++)for(let col=0;col<=400;col++){oldVolume+=displaced(source,col*.01,row*.01);newVolume+=displaced({...source,x:2.2},col*.01,row*.01);}
 assert.ok(Math.abs(oldVolume-newVolume)<1e-10);
});
test('complete snapshot shared source commands replay identically across frame grouping and pause',()=>{
 const first=run([1/60]),second=run([.003,.031,.007]);assert.deepEqual(first.waterTicks,second.waterTicks);assert.deepEqual(first.sim.p,second.sim.p);
 const before=structuredClone(first.waterTicks);first.paused=true;first.tick(2);assert.deepEqual(first.waterTicks,before);
 const snapshot=structuredClone(first.snapshot!);first.replay(snapshot);assert.equal(first.waterTicks.length,0);first.advance(2);assert.deepEqual(first.waterTicks,before);
 assert.equal(first.effects.sheets.length,0);assert.equal(first.effects.particles.length,0);
});
test('water remains scheduled through real final sinking and scoring end',()=>{
 const session=run([.02],4);assert.ok(session.sim.ended);assert.ok(session.sim.skips>0);
 const wet=session.waterTicks.filter(tick=>displaced(tick.next,tick.next.x,tick.next.z)>1e-7);
 assert.ok(wet.length>0);assert.ok(wet.some(tick=>tick.next.y<-.009));
 const last=wet.at(-1)!;assert.ok(last.next.y<0);
 const before=session.waterTicks.length;session.advance(1);assert.equal(session.waterTicks.length-before,120);
 assert.ok(session.waterTicks.slice(before).every(tick=>tick.next.y<-.1));
 assert.equal(session.effects.sources.length,0);
});
test('mouse movement and release use the same displacement command type, not independent splashes',()=>{
 const session=new Session(()=>271);session.start(DEFAULT,0);session.mouseMode=true;
 session.mouse={x:2,z:0,y:0,radius:.22,depth:.075};session.advance(.1);
 session.mouse={...session.mouse,x:2.4};session.advance(.1);session.mouse=undefined;session.advance(.1);
 assert.ok(session.waterTicks.some(tick=>tick.old.x===2&&tick.next.x===2.4));
 assert.ok(session.waterTicks.some(tick=>tick.old.x===2.4&&tick.next.y===1));
 assert.equal(session.sim.time,0);assert.equal(session.effects.sheets.length,0);
});
