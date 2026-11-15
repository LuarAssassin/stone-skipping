import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three';
import { calibrate } from './contact-calibration';
import { DEFAULT, DT, Simulation, wetGeometry } from './physics';

test('接触边界：亚子步入水时刻及切点形心不退回质心',()=>{
 const q=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),6*Math.PI/180);
 const support=-wetGeometry(0,q).lowest;
 const expected=DT*.37;
 const runs=[DT,DT/2].map(dt=>{
  const sim=new Simulation({...DEFAULT,spin:0},dt,false,false);
  sim.water=true;sim.q.copy(q);sim.momentum.set(0,0,0);sim.v.set(0,-1,0);
  sim.p.y=support+expected+9.81*expected**2/2;
  while(sim.time<DT*2)sim.step();
  const contact=sim.contacts[0];assert.ok(contact);
  assert.ok(Math.abs(contact.time-expected)<DT/8/1024*2);
  assert.ok(Math.abs(contact.point.x)>.039);
  assert.ok(contact.netImpulse!.length()<=contact.impulse+1e-12);
  assert.ok(Math.abs(contact.normal!.length()-1)<1e-12);
  return sim;
 });
 assert.ok(runs[1].minInternalDt<runs[0].minInternalDt);
});

test('临界浅掠水：小于旧外步的真实接触仍被保留而非间隙合并',()=>{
 const runs=[DT,DT/2].map(dt=>{
  const sim=new Simulation({...DEFAULT,spin:0,tilt:6},dt,true,false);
  const support=-wetGeometry(0,sim.q).lowest;
  sim.momentum.set(0,0,0);sim.omega.set(0,0,0);
  sim.p.y=support-1e-7;sim.v.set(1,.02,0);
  while(sim.time<.001)sim.step();
  const contact=sim.contacts[0];assert.ok(contact&&contact.end!==undefined);
  assert.ok(contact.end-contact.time<DT/8);
  assert.ok(contact.impulse>0&&contact.maxArea>0);
  assert.equal(sim.skips,1);
  return contact;
 });
 assert.ok(Math.abs(runs[0].end!-runs[1].end!)<DT/8/1024*2);
});

test('固定24+64种子DT/半步最终回归且不覆盖已保存报告',()=>{
 const before=JSON.parse(readFileSync(new URL('../test-fixtures/contact-before.json',import.meta.url),'utf8'));
 const after=calibrate(64);
 console.log('contact/calibration',JSON.stringify(after.summary));
 assert.ok(after.summary.controls.disagreements<=1);
 assert.ok(after.summary.controls.totalSkipDelta<before.summary.controls.totalSkipDelta);
 assert.ok(after.summary.controls.maxDistanceDelta<before.summary.controls.maxDistanceDelta);
 assert.equal(after.summary.seeds.disagreements,0);
 assert.ok(after.summary.seeds.maxDistanceDelta<=before.summary.seeds.maxDistanceDelta);
 assert.ok(after.summary.seeds.meanDistanceDelta<=before.summary.seeds.meanDistanceDelta);
 assert.equal(after.controls.length,24);assert.equal(after.seeds.length,64);
 for(const row of [...after.controls,...after.seeds]){
  assert.ok(row.fine.minInternalDt<row.coarse.minInternalDt);
  for(const run of [row.coarse,row.fine])for(const contact of run.contacts){
   assert.ok(contact.end!>=contact.time);
   assert.ok(contact.impulse>=0&&Number.isFinite(contact.impulse));
  }
 }
 const histogram=new Set(after.seeds.map(row=>row.coarse.skips));
 assert.ok(histogram.size>1);
});
