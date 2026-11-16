import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BASE_GRID,FINE_GRID,WATER_DT,WATER_SPEED,WATER_DENSITY,WATER_PARTICIPATION_DEPTH,waterGrid,momentumSource,reactionFraction,displacedVolume,displacementScale,cellDisplacement,interpolateFootprint,redistributedDisplacement} from '../src/simulation/water-grid';
import {Session} from '../src/app/session';
import {DEFAULT} from '../src/simulation/physics';

test('fine cells resolve the real stone and preserve physical wave speed, CFL and second-based damping',()=>{
 assert.equal(FINE_GRID.dx,.0078125);assert.equal(FINE_GRID.dz,.0078125);assert.ok(.08/FINE_GRID.dx>=10);
 for(const g of [BASE_GRID,waterGrid(1024,512),FINE_GRID]){
  assert.ok(g.cfl<=.85);assert.equal(g.speed,WATER_SPEED);assert.ok(Math.abs(g.dt*g.substeps-WATER_DT)<1e-15);
  assert.ok(Math.abs(g.damping**g.substeps-.995)<1e-14);
  assert.ok(Math.abs(g.wx*g.dx*g.dx/(g.dt*g.dt)-WATER_SPEED**2)<1e-12);
 }
 assert.equal(FINE_GRID.substeps,5);
});
test('same wet footprint keeps a metre-defined pressure support and normalized impulse at each resolution',()=>{
 const input={x:4.013,z:.017,impulseY:-.02,wetArea:.001};let sigma:number|undefined;
 for(const g of [BASE_GRID,waterGrid(1024,512),FINE_GRID]){
  const s=momentumSource(input,g,g.dt);if(sigma!==undefined)assert.equal(s.sigma,sigma);sigma=s.sigma;
  let impulse=0,cells=0;
  for(let row=Math.floor((input.z+4-3*s.sigma)/g.dz);row<=Math.ceil((input.z+4+3*s.sigma)/g.dz);row++)for(let col=Math.floor((input.x-3*s.sigma)/g.dx);col<=Math.ceil((input.x+3*s.sigma)/g.dx);col++){
   const r=(((col+.5)*g.dx-input.x)**2+((row+.5)*g.dz-4-input.z)**2)/s.sigma**2;
   if(r<=9){impulse+=s.increment/g.dt*Math.exp(-r/2)*g.dx*g.dz*WATER_DENSITY*WATER_PARTICIPATION_DEPTH;cells++;}
  }
  assert.ok(Math.abs(impulse-input.impulseY)<1e-12);assert.ok(Number.isFinite(s.energy)&&s.energy>0);
  if(g===FINE_GRID)assert.ok(cells>=50);
 }
});
test('GPU source normalisation uses the exact uploaded cell-space centre and metre support',()=>{
 const input={x:4.013,z:.017,impulseY:-.02,wetArea:.001};
 for(const g of [BASE_GRID,waterGrid(1024,512),FINE_GRID]){
  const s=momentumSource(input,g,g.dt,true);
  assert.equal(s.x/g.dx,Math.fround(input.x/g.dx));assert.equal((s.z+4)/g.dz,Math.fround((input.z+4)/g.dz));
  let impulse=0;
  for(let row=Math.floor((s.z+4-3*s.sigma)/g.dz);row<=Math.ceil((s.z+4+3*s.sigma)/g.dz);row++)for(let col=Math.floor((s.x-3*s.sigma)/g.dx);col<=Math.ceil((s.x+3*s.sigma)/g.dx);col++){
   const r=(((col+.5)*g.dx-s.x)**2+((row+.5)*g.dz-4-s.z)**2)/s.sigma**2;
   if(r<=9)impulse+=s.increment/g.dt*Math.exp(-r/2)*g.dx*g.dz*WATER_DENSITY*WATER_PARTICIPATION_DEPTH;
  }
  assert.ok(Math.abs(impulse-input.impulseY)<1e-12);
 }
});
test('cell-integrated kinematic source preserves analytic displaced volume as the grid changes',()=>{
 for(const g of [BASE_GRID,waterGrid(1024,512),FINE_GRID])for(const y of [-.003,0,.003]){
  const p={x:3.217,z:-.031,y,radius:.04,depth:.0045,aspect:.75,angle:.73};
  const scale=displacementScale(p,g);let volume=0;
  for(let row=Math.floor((p.z+4-.04)/g.dz);row<=Math.ceil((p.z+4+.04)/g.dz);row++)for(let col=Math.floor((p.x-.04)/g.dx);col<=Math.ceil((p.x+.04)/g.dx);col++)volume+=scale*cellDisplacement(p,col,row,g)*g.dx*g.dz;
  assert.ok(Math.abs(volume-displacedVolume(p))<1e-16);
 }
});
test('oriented displacement returns its cavity volume to a continuous raised rim',()=>{
 for(const g of [BASE_GRID,FINE_GRID]){
  const p={x:3.217,z:-.031,y:-.002,radius:.04,depth:.0045,aspect:.75,angle:.73};
  let volume=0,low=0,high=0;
  for(let row=Math.floor((p.z+4-.09)/g.dz);row<=Math.ceil((p.z+4+.09)/g.dz);row++)for(let col=Math.floor((p.x-.09)/g.dx);col<=Math.ceil((p.x+.09)/g.dx);col++){
   const value=redistributedDisplacement(p,col,row,g);volume+=value*g.dx*g.dz;low=Math.min(low,value);high=Math.max(high,value);
  }
  assert.ok(Math.abs(volume)<1e-16);assert.ok(low<0);assert.ok(high>0);
  assert.equal(redistributedDisplacement({...p,y:-.3},Math.floor(p.x/g.dx),Math.floor((p.z+4)/g.dz),g),0);
 }
});
test('substep reaction fractions sum once and do not begin before their measured interval',()=>{
 const m={x:2,z:0,impulseY:-.02,from:.27,to:.91};
 for(let n=1;n<=12;n++){
  let sum=0;for(let i=0;i<n;i++){const f=reactionFraction(m,i,n);sum+=f;if((i+1)/n<=m.from)assert.equal(f,0);}
  assert.ok(Math.abs(sum-1)<1e-14);
 }
});
test('continuous footprint interpolation preserves endpoint volumes and shortest ellipse orientation',()=>{
 const a={x:2,z:0,y:.01,radius:.04,depth:.0045,aspect:.75,angle:1.5},b={...a,x:2.08,y:-.001,angle:-1.5};
 assert.deepEqual(interpolateFootprint(a,b,0),a);assert.deepEqual(interpolateFootprint(a,b,1),b);
 const middle=interpolateFootprint(a,b,.5);assert.ok(middle.angle!==undefined);
 assert.ok(Math.abs(middle.angle-1.5)<.15);
});
test('retained command timing carries real wet area and consumes exactly the actual reaction',()=>{
 const s=new Session(()=>271);s.start(DEFAULT,0);s.advance(4);
 const packets=s.waterTicks.flatMap(t=>t.momentum?[t.momentum]:[]);assert.ok(packets.length>0);
 for(const m of packets){assert.ok(m.wetArea!>=0&&Number.isFinite(m.wetArea));assert.ok(m.from!>=0&&m.from!<=1);assert.ok(m.to!>=m.from!&&m.to!<=1);}
 const reaction=s.sim.contacts.reduce((sum,c)=>sum+(c.netImpulse?.y??0),0);
 assert.ok(Math.abs(packets.reduce((sum,m)=>sum+m.impulseY,0)+reaction)<1e-12);
});
