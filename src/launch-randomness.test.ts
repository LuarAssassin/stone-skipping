import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT, Simulation } from './physics';
import { AMPLITUDES, sampleThrow, replayLaunch, parseSnapshot } from './launch-randomness';
import { ContactEffects } from './effects';
import { sweep } from './variation-sweep';
const keys=Object.keys(DEFAULT) as (keyof typeof DEFAULT)[];
test('T0严格恒等且不持有目标引用',()=>{for(let seed=0;seed<64;seed++){const target={...DEFAULT},snapshot=sampleThrow(target,0,seed);assert.deepEqual(snapshot.sampled,DEFAULT);target.speed=4;assert.deepEqual(snapshot.target,DEFAULT);}});
test('同种子可复现，不同种子多样且T0..2有界',()=>{
 const unique=new Set<string>();
 for(let seed=0;seed<256;seed++)for(const temperature of [.1,1,2]){
  const snapshot=sampleThrow(DEFAULT,temperature,seed);assert.deepEqual(snapshot,sampleThrow(DEFAULT,temperature,seed));unique.add(JSON.stringify(snapshot.sampled));
  for(const key of keys){const amplitude=AMPLITUDES[key]*(['speed','spin'].includes(key)?DEFAULT[key]:1);assert.ok(Math.abs(snapshot.sampled[key]-DEFAULT[key])<=amplitude*temperature+1e-12);}
 }
 assert.equal(unique.size,768);
 for(const target of [{...DEFAULT,speed:2,tilt:0,spin:0,elevation:-12},{...DEFAULT,speed:20,tilt:50,spin:30,elevation:20}])for(let seed=0;seed<64;seed++){const {sampled}=sampleThrow(target,2,seed);assert.ok(sampled.speed>0&&sampled.spin>=0&&sampled.tilt>=0&&sampled.tilt<=85&&Math.abs(sampled.elevation)<=80);}
});
test('温度增大输入均方扰动按T²增大',()=>{function strength(temperature:number){let sum=0;for(let seed=0;seed<256;seed++){const {sampled}=sampleThrow(DEFAULT,temperature,seed);for(const key of keys)sum+=(sampled[key]-DEFAULT[key])**2;}return sum;}assert.ok(Math.abs(strength(2)/strength(1)-4)<1e-12);assert.ok(Math.abs(strength(1)/strength(.5)-4)<1e-12);});
test('JSON快照重放隔离后续目标与温度，篡改被拒绝',()=>{
 const target={...DEFAULT},snapshot=sampleThrow(target,1,123),json=JSON.stringify(snapshot);
 target.speed=3;sampleThrow(target,2,124);
 const restored=parseSnapshot(json);assert.deepEqual(replayLaunch(restored),snapshot.sampled);
 const first=replayLaunch(restored);first.speed=100;assert.deepEqual(replayLaunch(restored),snapshot.sampled);
 assert.throws(()=>parseSnapshot(JSON.stringify({...snapshot,sampled:DEFAULT})));
 for(const temperature of [-1,3,NaN])assert.throws(()=>sampleThrow(DEFAULT,temperature,0));
});
function run(seed:number,groups:number[]){const snapshot=sampleThrow(DEFAULT,1,seed),sim=new Simulation(replayLaunch(snapshot)),effects=new ContactEffects();let frame=0;while(!sim.ended){for(let tick=0;tick<groups[frame%groups.length]&&!sim.ended;tick++){sim.step();effects.update(sim.contacts,sim.time);}frame++;}return {state:JSON.stringify(sim),particles:effects.particles};}
test('随机投掷重放物理水花完全一致且不依赖render分组',()=>{assert.deepEqual(run(7,[67]),run(7,[16,200,31,7]));});
test('固定连续64seed真实物理：T0无离散，T1距离和跳数多样',()=>{const [zero,natural]=sweep(64);assert.equal(zero.distance.sd,0);assert.equal(Object.keys(zero.histogram).length,1);assert.ok(Object.keys(natural.histogram).length>1);assert.ok(natural.distance.sd>.05);});
