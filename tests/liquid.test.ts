import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Session } from '../src/app/session';
import { DEFAULT } from '../src/simulation/physics';
import { attachedPoint, liquidBudget, ligamentPoint, ligamentSpec, ligamentRadius, bulbRadius, detachedDrop, rimRadius, ligamentCount, WATER_DENSITY } from '../src/rendering/liquid';
import { createSheets } from '../src/rendering/sheets';
import { particlePosition } from '../src/rendering/effects';
function fixture(time=.29) { const session=new Session(()=>271);session.start(DEFAULT,0);session.advance(time);return {session,sheet:session.effects.sheets[0]}; }
const distance=(first:number[],second:number[])=>Math.hypot(...first.map((value,index)=>value-second[index]));
test('root uses the rendered heightfield triangle at every sampled lateral coordinate',()=>{
 const {session,sheet}=fixture();let maximum=0;
 for(let index=0;index<=48;index++){const point=attachedPoint(sheet,session.visualTime,index/48,0,session.effects.field);maximum=Math.max(maximum,Math.abs(point[1]-session.effects.field.sample(point[0],point[2],session.visualTime)));}
 assert.ok(maximum<1e-12);
 const field=session.effects.field;field.height.fill(0);const left=100,top=100;field.height[top*512+left]=1;field.height[(top+1)*512+left+1]=4;
 assert.ok(Math.abs(field.sample((left+.25)/511*16,((top+.25)/255-.5)*8)-.5)<1e-10);
});
test('film and thick rim have disjoint bounded volume budgets in SI units',()=>{
 const {session,sheet}=fixture();const budget=liquidBudget(sheet);
 assert.ok(Math.abs(budget.film+budget.rim+budget.ligaments-budget.volume)<1e-18);
 for(const node of sheet.path!){
  assert.ok(node.volume!<=.55*node.wetArea!*node.normalSpeed!*node.dt!+1e-18);
  assert.ok(node.volume!*WATER_DENSITY*Math.max(.35,Math.hypot(node.vx,node.vy,node.vz)+.5)<=node.momentum!+1e-18);
 }
 const rendering=createSheets();rendering.update([sheet],session.visualTime,session.effects.field);
 const geometry=rendering.mesh.geometry,position=geometry.getAttribute('position'),indices=geometry.index!;
 let area=0;const first=new Vector3(),second=new Vector3(),origin=new Vector3();
 for(let index=0;index<48*24*6;index+=3){origin.fromBufferAttribute(position,indices.getX(index));first.fromBufferAttribute(position,indices.getX(index+1)).sub(origin);second.fromBufferAttribute(position,indices.getX(index+2)).sub(origin);area+=first.cross(second).length()*.5;}
 const thickness=geometry.getAttribute('profile').getX(0);
 assert.ok(area*thickness<=budget.film*1.000001);assert.ok(rimRadius(sheet,session.visualTime)>thickness*2);
 let length=0;for(let index=0;index<48;index++)length+=distance(attachedPoint(sheet,session.visualTime,index/48,1),attachedPoint(sheet,session.visualTime,(index+1)/48,1))*(.35+1.3*Math.sin(Math.PI*(index+.5)/48)**2);
 assert.ok(Math.abs(Math.PI*rimRadius(sheet,session.visualTime)**2*length-budget.rim)<1e-15);rendering.dispose();
});
test('ligaments thin while their lost cross-section feeds terminal bulbs, not random holes',()=>{
 const {sheet}=fixture();for(let index=0;index<ligamentCount(sheet);index++){
  const spec=ligamentSpec(sheet,index);let previous=Infinity;
  for(let step=0;step<=10;step++){const time=spec.start+(spec.pinch-spec.start)*step/10,radius=ligamentRadius(sheet,index,time),length=spec.initialLength+spec.stretch*(time-spec.start),bulb=bulbRadius(sheet,index,time);assert.ok(radius<=previous+1e-15);previous=radius;assert.ok(Math.abs(Math.PI*radius**2*length+4*Math.PI*bulb**3/3-spec.volume)<1e-18);}
 }
});
test('pinch position, velocity, radius and ballistic handoff are continuous',()=>{
 const {sheet}=fixture();let energy=0,totalVolume=0;
 for(let index=0;index<ligamentCount(sheet);index++){const spec=ligamentSpec(sheet,index),drop=detachedDrop(sheet,index),before=ligamentPoint(sheet,index,spec.pinch-1e-6,1),point=ligamentPoint(sheet,index,spec.pinch,1);
  assert.deepEqual(drop.origin,point);assert.deepEqual(particlePosition(drop,drop.birth),point);assert.ok(Math.abs(drop.size-bulbRadius(sheet,index,spec.pinch))<1e-15);
  for(let axis=0;axis<3;axis++)assert.ok(Math.abs(drop.velocity[axis]-(point[axis]-before[axis])/1e-6)<1e-10);
  energy+=.5*WATER_DENSITY*spec.volume*drop.velocity.reduce((sum,value)=>sum+value*value,0);totalVolume+=spec.volume;
 }
 assert.ok(energy<liquidBudget(sheet).energy);assert.ok(Math.abs(totalVolume-liquidBudget(sheet).ligaments)<1e-18);
});
test('after exit rim keeps its birth velocity and lags the real stone',()=>{
 const {session,sheet}=fixture(.31),history=JSON.stringify(sheet.path![0]);const first=attachedPoint(sheet,.31,.5,1);session.advance(.02);const second=attachedPoint(sheet,.33,.5,1);
 assert.equal(JSON.stringify(sheet.path![0]),history);assert.ok(session.sim.p.x-second[0]>.1);assert.ok((second[0]-first[0])/.02<DEFAULT.speed*.4);
});
test('actual renderer has bounded instances, no shader hole discard, and reusable resources',()=>{
 const {session,sheet}=fixture();const rendering=createSheets(),geometries=rendering.mesh.children.map(child=>(child as any).geometry);
 for(let index=0;index<100;index++)rendering.update([sheet],sheet.birth+index/4000,session.effects.field);
 assert.ok(!rendering.material.fragmentShader.includes('discard'));assert.equal(rendering.mesh.children.length,2);
 assert.deepEqual(rendering.mesh.children.map(child=>(child as any).geometry),geometries);
 for(const child of rendering.mesh.children)assert.ok((child as any).count<=(child as any).instanceMatrix.count);
 rendering.update([],1,session.effects.field);assert.equal(rendering.mesh.geometry.drawRange.count,0);for(const child of rendering.mesh.children)assert.equal((child as any).count,0);rendering.dispose();
});
test('complete snapshot liquid replay survives temperatures, pause, playback rates and RAF grouping',()=>{
 for(const temperature of [0,.8,2]){
  const initial=fixture();initial.session.snapshot!.visual={seed:17,surface:temperature,sheet:temperature,breakup:temperature};
  const states=[];
  for(const [mode,groups] of [['normal',[1/60]],['slow',[.02,.08]],['bullet',[.12,.2]]] as const){const session=new Session();session.replay(initial.session.snapshot);session.mode=mode;const rate=mode==='normal'?1:mode==='slow'?.25:.05;let frame=0;while(session.visualTime<.45-1e-8)session.tick(Math.min(groups[frame++%groups.length],(.45-session.visualTime)/rate));session.paused=true;const before=JSON.stringify(session.effects.particles);session.tick(1);assert.equal(JSON.stringify(session.effects.particles),before);states.push({particles:session.effects.particles,sheets:session.effects.sheets,sources:session.effects.sources});}
  assert.deepEqual(states[0],states[1]);assert.deepEqual(states[0],states[2]);
 }
});
test('causal inflow grows during contact, freezes old cohorts and stops at exit',()=>{
 const {session}=fixture(.264),early=session.effects.sheets[0],before=liquidBudget(early).volume;
 const frozen=JSON.stringify(early.path),spec=ligamentSpec(early,0),point=ligamentPoint(early,0,.282,1);
 session.advance(.01);const later=session.effects.sheets[0];
 assert.ok(liquidBudget(later).volume>before);
 assert.equal(JSON.stringify(later.path!.slice(0,early.path!.length)),frozen);
 assert.deepEqual(ligamentSpec(later,0),spec);assert.deepEqual(ligamentPoint(later,0,.282,1),point);
 session.advance(.01);const exited=JSON.stringify(session.effects.sheets[0].path),volume=liquidBudget(session.effects.sheets[0]).volume;
 session.advance(.02);assert.equal(JSON.stringify(session.effects.sheets[0].path),exited);assert.equal(liquidBudget(session.effects.sheets[0]).volume,volume);
});
test('DEV single contact diagnosis leaves physical trajectory unchanged',()=>{const first=fixture(.7).session,second=new Session();second.diagnosticContact=0;second.replay(first.snapshot);second.advance(.7);assert.deepEqual(second.sim.p,first.sim.p);assert.equal(second.sim.skips,first.sim.skips);assert.ok(second.effects.sources.every(source=>source.kind==='drop'||source.contactId===0));});
