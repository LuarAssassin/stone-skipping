import {writeFileSync} from 'node:fs';
import {Simulation,DT} from '../src/simulation/physics';
const rows=[];
for(const speed of [11,19.2,24])for(const tilt of [4,6,10,15,20])for(const elevation of [-8,0,2]){
 const launch={speed,tilt,elevation,spin:36.7,direction:0};
 const sim=new Simulation(launch).run();
 const hits=sim.contacts.filter(c=>c.bounced);
 rows.push({launch,skips:sim.skips,distance:sim.p.x,time:sim.time,reason:sim.reason,spacing:hits.slice(1).map((c,i)=>c.point.distanceTo(hits[i].point)),contacts:hits.map(c=>({time:c.time,end:c.end,x:c.point.x,z:c.point.z}))});
}
rows.sort((a,b)=>b.skips-a.skips);
const best=rows[0];const fine=new Simulation(best.launch,DT/2).run();
writeFileSync(new URL('../deliverables/reference-alignment/sweep.json',import.meta.url),JSON.stringify({target:{skips:90,distance:50,distanceStatus:'provisional design target, not measured record distance'},rows,halfStep:{launch:best.launch,skips:fine.skips,distance:fine.p.x}},null,2));
console.log(JSON.stringify({top:rows.slice(0,5).map(({launch,skips,distance})=>({launch,skips,distance})),halfStep:{skips:fine.skips,distance:fine.p.x}},null,2));
