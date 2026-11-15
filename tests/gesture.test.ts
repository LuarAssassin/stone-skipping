import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ThrowGesture, normalizePoint } from '../src/input/gesture';
import { DEFAULT, Simulation } from '../src/simulation/physics';
import { sampleThrow, replayLaunch } from '../src/simulation/launch-randomness';
const rect={left:20,top:30,width:800,height:600};
const point=(timeStamp:number,clientX=420,clientY=330,pointerId=1)=>({timeStamp,clientX,clientY,pointerId});
function held(duration:number){const gesture=new ThrowGesture();gesture.begin(point(100),rect,DEFAULT);return gesture.release(point(100+duration))!;}
test('normalization uses usable canvas and clamps edges',()=>{
 assert.deepEqual(normalizePoint(point(0),rect),{x:.5,y:.5});
 assert.deepEqual(normalizePoint(point(0,-100,1000),rect),{x:0,y:1});
 const gesture=new ThrowGesture();assert.equal(gesture.begin(point(0),{...rect,width:0},DEFAULT),false);
});
test('DOMRect-like inherited geometry is copied explicitly',()=>{
 const inherited=Object.create(rect) as typeof rect;const gesture=new ThrowGesture();gesture.begin(point(0),inherited,DEFAULT);
 assert.equal(gesture.release(point(700,620,230))!.direction,17.5);
});
test('hold duration changes power rather than forcing maximum',()=>{
 assert.ok(held(150).speed<held(700).speed);assert.ok(held(700).speed<held(1400).speed);assert.equal(held(9000).speed,14);
 assert.equal(held(50),undefined);
});
test('mapping is normalized, bounded and independent of move frequency',()=>{
 const sparse=new ThrowGesture(),dense=new ThrowGesture();
 for(const gesture of [sparse,dense])gesture.begin(point(100),rect,DEFAULT);
 for(let index=1;index<100;index++)dense.move(point(100+index*7,420+index*2,330-index));
 assert.deepEqual(sparse.release(point(800,620,230)),dense.release(point(800,620,230)));
 const scaled=new ThrowGesture();scaled.begin(point(100,220,180),{...rect,width:400,height:300},DEFAULT);
 assert.deepEqual(scaled.release(point(800,320,130)),held(700)&&{...held(700),direction:17.5,elevation:6});
 const gesture=new ThrowGesture();gesture.begin(point(0),rect,{...DEFAULT,tilt:50});const result=gesture.release(point(2000,9999,-9999))!;
 assert.equal(result.direction,35);assert.equal(result.elevation,14);assert.equal(result.tilt,50);
 const low=new ThrowGesture();low.begin(point(0),rect,DEFAULT);assert.deepEqual(low.release(point(2000,-999,9999)),{...DEFAULT,direction:-35,elevation:-8,speed:14});
});
test('cancel, pointer ownership and release once',()=>{
 const gesture=new ThrowGesture();gesture.begin(point(0),rect,DEFAULT);
 assert.equal(gesture.begin(point(1,0,0,2),rect,DEFAULT),false);
 gesture.move(point(600,0,0,2));assert.equal(gesture.release(point(800,0,0,2)),undefined);
 assert.equal(gesture.pointerId,1);assert.ok(gesture.release(point(700)));assert.equal(gesture.release(point(800)),undefined);
 gesture.begin(point(900),rect,DEFAULT);gesture.cancel();assert.equal(gesture.preview(1600),undefined);assert.equal(gesture.release(point(1600)),undefined);
});
test('preview, target, snapshot and in-flight launch do not alias',()=>{
 const base={...DEFAULT};const gesture=new ThrowGesture();gesture.begin(point(0),rect,base);base.tilt=40;
 const preview=gesture.preview(700)!;preview.target.tilt=45;assert.equal(gesture.preview(700)!.target.tilt,6);
 const target=gesture.release(point(700))!;const snapshot=sampleThrow(target,1,42);const sim=new Simulation(replayLaunch(snapshot));
 const original=JSON.stringify(snapshot);target.speed=20;const launchBefore={...sim.launch};
 gesture.begin(point(800),rect,base);gesture.move(point(1200,800,100));gesture.cancel();
 assert.equal(JSON.stringify(snapshot),original);assert.deepEqual(sim.launch,launchBefore);
 const replay=replayLaunch(snapshot);replay.speed=2;assert.notEqual(snapshot.sampled.speed,2);
});
