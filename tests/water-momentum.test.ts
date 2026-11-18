import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Session} from '../src/app/session';
import {DEFAULT} from '../src/simulation/physics';
import {momentumSource,WATER_DT,WATER_CELL,WATER_DENSITY,WATER_PARTICIPATION_DEPTH} from '../src/rendering/coherent';
test('reaction increments are consumed once, including final unbounced sinking contact',()=>{
 const session=new Session(()=>271);session.start(DEFAULT,0);session.advance(4);
 const measured=session.sim.contacts.reduce((sum,contact)=>sum+(contact.netImpulse?.y??0),0);
 const delivered=session.waterTicks.reduce((sum,tick)=>sum+(tick.momentum?.impulseY??0),0);
 assert.ok(Math.abs(delivered+measured)<1e-12);
 const final=session.sim.contacts.at(-1)!;assert.equal(final.bounced,false);
 assert.ok(session.waterTicks.slice(Math.ceil(final.time*120)).some(tick=>tick.momentum));
 session.waterTicks=[];session.advance(1);assert.ok(session.waterTicks.every(tick=>!tick.momentum));
 session.replay();session.advance(4);assert.ok(Math.abs(session.waterTicks.reduce((sum,tick)=>sum+(tick.momentum?.impulseY??0),0)-delivered)<1e-12);
});
test('normalized resolved reaction preserves N s at subcell offsets and finite bounded energy',()=>{
 for(const x of [0,.017,4.001,15.999]){
  const impulseY=-.02,source=momentumSource({x,z:.013,impulseY});let impulse=0,energy=0,cells=0;
  for(let row=0;row<256;row++)for(let col=0;col<512;col++){
   const radial=(((col+.5)*WATER_CELL-x)**2+((row+.5)*WATER_CELL-4-.013)**2)/source.sigma**2;
   const velocity=radial<=9?source.increment/WATER_DT*Math.exp(-radial/2):0;
   if(velocity)cells++;
   impulse+=WATER_DENSITY*WATER_PARTICIPATION_DEPTH*WATER_CELL**2*velocity;
   energy+=.5*WATER_DENSITY*WATER_PARTICIPATION_DEPTH*WATER_CELL**2*velocity**2;
  }
  assert.ok(Math.abs(impulse-impulseY)<1e-12);assert.ok(cells>=20);
  assert.ok(Math.abs(energy-source.energy)<1e-12);assert.ok(energy<.001);
 }
});
test('zero optional impulse and kinematic mouse produce no extra momentum',()=>{
 assert.equal(momentumSource().increment,0);assert.equal(momentumSource({x:2,z:0,impulseY:0}).increment,0);
 const session=new Session(()=>271);session.start(DEFAULT,0);session.mouseMode=true;session.mouse={x:2,z:0,y:0,radius:.04,depth:.0045,aspect:.75};session.advance(1);
 assert.ok(session.waterTicks.every(tick=>!tick.momentum));
});
