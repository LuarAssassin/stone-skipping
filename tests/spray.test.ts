import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Session} from '../src/app/session';
import {DEFAULT} from '../src/simulation/physics';
import {sprayPosition,MAX_SPRAY} from '../src/simulation/spray';
function run(groups:number[]){const s=new Session(()=>271);s.start(DEFAULT,0);let i=0;while(s.visualTime<.4-1e-10)s.advance(Math.min(groups[i++%groups.length],.4-s.visualTime));return s;}
test('spray is contact-born, energy bounded, and ballistic to its water crossing',()=>{
 const s=run([.02]);assert.ok(s.spray.drops.length>0);assert.ok(s.spray.drops.length<=MAX_SPRAY);
 assert.ok(s.spray.emittedEnergy<=s.spray.availableEnergy+1e-12);
 for(const d of s.spray.drops){assert.ok(d.birth>=s.sim.contacts[0].time);assert.ok(Math.abs(sprayPosition(d,d.landing)[1])<1e-12);assert.ok(d.radius>0&&d.radius<=.0025);}
});
test('spray replay is independent of RAF groups and pause; stone trajectory unchanged',()=>{
 const a=run([.02]),b=run([.001,.017,.033]);assert.deepEqual(a.spray.drops,b.spray.drops);assert.deepEqual(a.sim.p,b.sim.p);
 const saved=JSON.stringify(a.spray.drops);a.paused=true;a.tick(1);assert.equal(JSON.stringify(a.spray.drops),saved);
 a.replay();a.advance(.4);assert.equal(JSON.stringify(a.spray.drops),saved);
 const naked=run([.02]);naked.replay();naked.spray.sample=()=>{};naked.advance(.4);assert.deepEqual(a.sim.p,naked.sim.p);assert.equal(a.sim.skips,naked.sim.skips);
});
