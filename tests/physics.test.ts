import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { Simulation, Clock, DEFAULT, DT, wetGeometry } from '../src/simulation/physics';
import { CASES, compare } from '../tools/sweep';
test('连续椭圆裁剪：全干、全湿、半盘面积及真实形心',()=>{
 const area=Math.PI*.04*.03;
 for(const tilt of [0,1e-8,6,35,90,179]) {
  const q=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),tilt*Math.PI/180);
  assert.equal(wetGeometry(.1,q).area,0);
  assert.equal(wetGeometry(-.1,q).area,area);
  const half=wetGeometry(.0045*Math.abs(Math.cos(tilt*Math.PI/180)),q);
  if(tilt>1e-7) {
   assert.ok(Math.abs(half.area-area/2)<1e-14);
   const expected=new Vector3(-4*.04/(3*Math.PI),0,0).applyQuaternion(q);
   assert.ok(half.centroid.distanceTo(expected)<1e-12);
  }
 }
});
test('临界触水连续无1.5mm平滑带，近水平不产生NaN',()=>{
 const q=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/6);
 const tangent=.0045*Math.cos(Math.PI/6)+.04*Math.sin(Math.PI/6);
 let previous=0;
 for(const depth of [0,1e-14,1e-12,1e-10,1e-8,1e-6,.0001]) {
  const wet=wetGeometry(tangent-depth,q);
  assert.ok(wet.area>=previous&&Number.isFinite(wet.area));
  assert.ok(wet.centroid.toArray().every(Number.isFinite));
  if(depth>0)assert.ok(wet.area>0);
  previous=wet.area;
 }
 for(const tilt of [0,1e-14,-1e-14]) {
  const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),tilt);
  for(const height of [-.0045,0,.0045]) {
   const wet=wetGeometry(height,rotation);
   assert.ok(Number.isFinite(wet.area)&&wet.centroid.toArray().every(Number.isFinite));
  }
 }
});
test('固定24组步长对照：保留难例，分歧与轨迹误差低于before',()=>{
 const results=CASES.map(launch=>compare(launch));
 const disagreements=results.filter(result=>result.skips[0]!==result.skips[1]).length;
 assert.ok(disagreements<=1,`skip disagreements ${disagreements}/24 (calibration before 5)`);
 assert.ok(Math.max(...results.map(result=>result.distanceDelta))<.02);
 assert.ok(Math.max(...results.map(result=>result.trajectory))<.06);
 console.log('matrix/convergence',JSON.stringify({cases:results.length,disagreements,maxDistanceDelta:Math.max(...results.map(result=>result.distanceDelta)),maxTrajectoryDelta:Math.max(...results.map(result=>result.trajectory))}));
});
test('全部参数每次接触唯一、冲量单调且无额外计分',()=>{
 for(const launch of CASES) {
  const sim=new Simulation({...launch});
  let lastId=-1, impulse=0, skips=0;
  while(!sim.ended) {
   sim.step();
   if(sim.active) {
    if(sim.active.id===lastId)assert.ok(sim.active.impulse>=impulse);
    lastId=sim.active.id;impulse=sim.active.impulse;
   }
   assert.ok(sim.skips===skips||sim.skips===skips+1);
   skips=sim.skips;
   assert.equal(skips,sim.contacts.filter(contact=>contact.bounced).length);
  }
  sim.contacts.forEach((contact,index)=>{
   assert.equal(contact.id,index);
   assert.ok(contact.end!>=contact.time);
   if(index>0)assert.ok(contact.time>=sim.contacts[index-1].end!);
   assert.ok(Number.isFinite(contact.impulse)&&contact.impulse>=0);
  });
  const completed=signature(sim);
  for(let step=0;step<10;step++)sim.step();
  assert.equal(signature(sim),completed);
 }
});
test('完全浸没零自旋与反向yaw有限且不制造水下弹跳',()=>{
 for(const direction of [0,180,-120]) {
  const sim=new Simulation({...DEFAULT,spin:0,tilt:0,direction});
  sim.p.y=-.1;
  sim.run();
  assert.equal(sim.submerged,true);assert.equal(sim.skips,0);
  assert.ok([...sim.p.toArray(),...sim.v.toArray(),...sim.q.toArray(),sim.energy()].every(Number.isFinite));
 }
 const forward=new Simulation().run(), reverse=new Simulation({...DEFAULT,direction:180}).run();
 assert.equal(forward.skips,reverse.skips);
 assert.ok(Math.abs(forward.p.x+reverse.p.x)<1e-8);
});
function signature(sim:Simulation){return JSON.stringify({p:sim.p.toArray(),v:sim.v.toArray(),q:sim.q.toArray(),momentum:sim.momentum.toArray(),omega:sim.omega.toArray(),force:sim.force.toArray(),area:sim.area,time:sim.time,submerged:sim.submerged,ended:sim.ended,skips:sim.skips,contacts:sim.contacts,ticks:sim.ticks});}
test('无水无阻力的解析抛体基线与四元数',()=>{const sim=new Simulation({...DEFAULT},DT,false,false);const initial=sim.v.clone();for(let step=0;step<4000;step++)sim.step();assert.ok(Math.abs(sim.p.y-(.24+initial.y-9.81/2))<1e-9);assert.ok(Math.abs(sim.p.x-initial.x)<1e-9);assert.ok(Math.abs(sim.q.length()-1)<1e-12);});
test('确定性重放：完整状态与接触记录相同',()=>{for(const launch of [DEFAULT,{...DEFAULT,speed:14,tilt:60},{...DEFAULT,tilt:20,spin:0}])assert.equal(signature(new Simulation({...launch}).run()),signature(new Simulation({...launch}).run()));});
test('30/60/144 Hz 与不规则 render 调度一致',()=>{const states=[30,60,144,0].map(rate=>{const sim=new Simulation();const clock=new Clock(sim);let frame=0;while(!sim.ended){clock.advance(rate?1/rate:[.003,.041,.007,.017][frame++%4]);}return signature(sim);});assert.ok(states.every(state=>state===states[0]));});
test('默认自然续跳至少两次并沉水，差参数首次失败',()=>{const good=new Simulation().run();const bad=new Simulation({...DEFAULT,speed:4,tilt:6}).run();assert.ok(good.skips>=2);assert.equal(good.reason,'已沉水');assert.equal(bad.skips,0);assert.equal(bad.reason,'已沉水');});
test('独立接触只计一次，结束后不能重复得分',()=>{const sim=new Simulation().run();assert.equal(sim.skips,sim.contacts.filter(contact=>contact.bounced).length);assert.equal(new Set(sim.contacts.map(c=>c.id)).size,sim.contacts.length);for(const contact of sim.contacts.filter(c=>c.bounced)){assert.ok(contact.end!>contact.time);assert.ok(contact.maxArea>0);}const before=signature(sim);for(let count=0;count<100;count++)sim.step();assert.equal(signature(sim),before);});
test('静水无持续能量增长，接触耗散且状态有限',()=>{for(const launch of CASES){const {speed,tilt}=launch;const sim=new Simulation({...launch});const initial=sim.energy();let peak=initial;while(!sim.ended){sim.step();peak=Math.max(peak,sim.energy());assert.ok(Number.isFinite(sim.energy()));assert.ok(Math.abs(sim.q.length()-1)<1e-10);}assert.ok(peak<initial*1.02,`${speed}/${tilt} energy ${peak}/${initial}`);for(const contact of sim.contacts)if(contact.energyOut!==undefined)assert.ok(contact.energyOut<contact.energyIn+.02);}});
test('步长减半对照：默认跳数相同，距离差<1%，接触时间差<20ms',()=>{const coarse=new Simulation().run(),fine=new Simulation({...DEFAULT},DT/2).run();assert.equal(coarse.skips,fine.skips);assert.ok(Math.abs(coarse.p.x-fine.p.x)/fine.p.x<.01);assert.equal(coarse.contacts.length,fine.contacts.length);coarse.contacts.forEach((contact,index)=>assert.ok(Math.abs(contact.time-fine.contacts[index].time)<.02));console.log('default/convergence',JSON.stringify({skips:coarse.skips,distance:coarse.p.x,fineDistance:fine.p.x,time:coarse.time,fineTime:fine.time}));});
