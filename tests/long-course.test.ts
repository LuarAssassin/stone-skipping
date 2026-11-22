import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COURSE_GRID as grid,momentumSource,slipSources,sweptPressure,WATER_DENSITY,WATER_PARTICIPATION_DEPTH,displacedVolume,displacementScale,cellDisplacement} from '../src/simulation/water-grid';
import {ContactSpray,sprayPosition,ribbonPoint,lipDetach} from '../src/simulation/spray';
import {Session} from '../src/app/session';
import {DEFAULT,Simulation} from '../src/simulation/physics';
test('long course retains metre scales and normalized small contact impulses at subcell offsets',()=>{
 assert.equal(grid.sizeX,64);assert.equal(grid.sizeZ,32);assert.ok(grid.cfl<=.85);
 for(const x of [16.001,32.037,50.012,60.003])for(const z of [-.003,.01,.02]){
  const m=momentumSource({x,z,impulseY:-.01,wetArea:.000001},grid,grid.dt,true);assert.ok(m.cells!>0);
  let impulse=0;
  for(let row=Math.floor((m.z+grid.sizeZ/2-3*m.sigma)/grid.dz);row<=Math.ceil((m.z+grid.sizeZ/2+3*m.sigma)/grid.dz);row++)for(let col=Math.floor((m.x-3*m.sigma)/grid.dx);col<=Math.ceil((m.x+3*m.sigma)/grid.dx);col++){
   const r=(((col+.5)*grid.dx-m.x)**2+((row+.5)*grid.dz-grid.sizeZ/2-m.z)**2)/m.sigma**2;
   if(r<=9)impulse+=m.increment/grid.dt*Math.exp(-r/2)*grid.dx*grid.dz*WATER_DENSITY*WATER_PARTICIPATION_DEPTH;
  }
  assert.ok(Math.abs(impulse+.01)<1e-12);
 }
});
test('far contact displacement retains its real ellipsoid volume',()=>{
 const p={x:48.123,z:6.039,y:0,radius:.04,depth:.0045,aspect:.75,angle:.3};let volume=0;
 for(let row=Math.floor((p.z+16-.05)/grid.dz);row<=Math.ceil((p.z+16+.05)/grid.dz);row++)for(let col=Math.floor((p.x-.05)/grid.dx);col<=Math.ceil((p.x+.05)/grid.dx);col++)volume+=cellDisplacement(p,col,row,grid)*grid.dx*grid.dz;
 assert.ok(Math.abs(volume*displacementScale(p,grid)-displacedVolume(p))<1e-16);
});
test('a moving contact keeps its measured impulse and centroid across clipped water substeps',()=>{
 const old={x:36,z:-.5,y:0,radius:.04,depth:.005};
 const momentum={x:36.10,z:-.48,impulseY:-.07,impulseX:.033,impulseZ:-.01,from:.20,to:.85};
 const tick={old,next:{...old,x:36.20,z:-.47},momentum};
 const pieces=Array.from({length:8},(_,i)=>sweptPressure(tick,i,8)).filter(p=>p!==undefined);
 assert.equal(pieces.length,6);
 for(const axis of ['impulseX','impulseY','impulseZ'] as const){
  assert.ok(Math.abs(pieces.reduce((sum,p)=>sum+p.center[axis],0)-momentum[axis])<1e-12);
 }
 for(const axis of ['x','z'] as const){
  const center=pieces.reduce((sum,p)=>sum+p.center[axis]*p.center.impulseY,0)/momentum.impulseY;
  assert.ok(Math.abs(center-momentum[axis])<1e-12);
 }
 const combinedTravel=pieces.reduce((sum,p)=>sum+p.dx,0);
 assert.ok(Math.abs(combinedTravel-(tick.next.x-old.x)*(momentum.to-momentum.from))<1e-12);
});
test('horizontal contact transfers equal volumes across the travel direction',()=>{
 const impact={x:36.123,z:-.479,impulseY:0,impulseX:.032,impulseZ:-.024,wetArea:.0007};
 const [back,front]=slipSources(impact,grid,.12);
 const displaced=(source:typeof front)=>source.increment*source.normalization;
 assert.ok(displaced(front)>0 && displaced(back)<0);
 assert.ok(Math.abs(displaced(front)+displaced(back))<1e-16);
 const dx=front.x-back.x,dz=front.z-back.z;
 assert.ok(Math.abs(Math.hypot(dx,dz)-.12)<1e-5);
 assert.ok(Math.abs(dx*impact.impulseZ-dz*impact.impulseX)<1e-6);
 assert.ok(dx*impact.impulseX+dz*impact.impulseZ>0);
 assert.equal(slipSources({...impact,impulseX:0,impulseZ:0},grid,.12).length,0);
});
test('falling drops return their downward momentum only once; reset cancels old returns',()=>{
 const s=new ContactSpray(),d={birth:0,origin:[2,.001,0] as const,velocity:[1,1,0] as const,radius:.001,landing:(1+Math.sqrt(1+.01962))/9.81,energy:.00001};
 s.drops=[d];assert.equal(s.advance(d.landing-.0001,0).length,0);
 const impacts=s.advance(d.landing+.0001,d.landing-.001);assert.equal(impacts.length,1);assert.ok(impacts[0].impulseY<0);
 assert.ok(Math.abs(impacts[0].x-sprayPosition(d,d.landing)[0])<1e-12);
 assert.ok(Math.abs(impacts[0].impulseY-4/3*Math.PI*d.radius**3*1000*(1-9.81*d.landing))<1e-14);
 assert.equal(s.advance(1,0).length,0);s.drops=[d];s.reset();assert.equal(s.advance(1,0).length,0);
});
test('ribbon and detached drop occupy the same ballistic trajectory at handoff',()=>{
 const s=new Session(()=>271);s.start(DEFAULT,0);s.advance(.28);assert.ok(s.spray.ribbons.length>2);
 for(const r of s.spray.ribbons){
  const drops=s.spray.drops.filter(d=>Math.abs(d.birth-r.birth)<1e-12);
  assert.ok(drops.length>0);assert.ok(Math.abs(drops.reduce((v,d)=>v+4/3*Math.PI*d.radius**3,0)-r.volume)<1e-16);
  assert.ok(new Set(drops.map(d=>d.detach)).size>1);
  for(const d of drops){
   const u=((d.origin[0]-r.origin[0])*(-r.direction[1])+(d.origin[2]-r.origin[2])*r.direction[0])/r.width;
   assert.ok(d.detach!==undefined && Math.abs(d.detach-lipDetach(r,u))<1e-12);
   const handoff=d.birth+d.detach;
   const a=ribbonPoint(r,handoff,u),b=sprayPosition(d,handoff);
   assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-12);
  }
 }
});
test('session ends when the stone leaves the simulated lake',()=>{
 const s=new Session(()=>271);s.start(DEFAULT,0);s.sim.p.set(64.1,.2,0);s.advance(.001);assert.ok(s.sim.ended);assert.equal(s.sim.reason,'离开水域');
});
