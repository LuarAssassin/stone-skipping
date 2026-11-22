import {Simulation,DT,wetGeometry} from '../src/simulation/physics';
import {writeFileSync} from 'node:fs';
const launch={speed:24,spin:55,tilt:14,elevation:0,direction:0};
const rows=[];
for(const dt of [DT,DT/2,DT/4,DT/8]){
 const s=new Simulation(launch,dt,true,true,16);let peak=0,last=-1;const flights:{after:number;peak:number;duration:number}[]=[];
 while(!s.ended){s.step();if(s.active){if(last>=0){flights.push({after:last,peak,duration:s.active.time-s.contacts[last].end!});last=-1;peak=0;}}else{const c=s.contacts.at(-1);if(c?.bounced){last=c.id;peak=Math.max(peak,wetGeometry(s.p.y,s.q).lowest);}}}
 rows.push({dt,skips:s.skips,distance:s.p.x,flights});
}
writeFileSync(new URL('../deliverables/water-optimization/contact-gaps.json',import.meta.url),JSON.stringify(rows,null,2));
console.log(rows.map(r=>({dt:r.dt,skips:r.skips,min:Math.min(...r.flights.map(f=>f.peak)),under1um:r.flights.filter(f=>f.peak<1e-6).length,under01mm:r.flights.filter(f=>f.peak<1e-4).length,over1mm:r.flights.filter(f=>f.peak>=.001).length})));
