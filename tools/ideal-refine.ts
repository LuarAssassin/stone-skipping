import {writeFileSync} from 'node:fs';
import {Simulation,DT} from '../src/simulation/physics';
const rows=[];
for(const speed of [22,24,26])for(const spin of [45,50,55])for(const tilt of [8,10,12,14]){
 const launch={speed,spin,tilt,elevation:0,direction:0},s=new Simulation(launch,DT/2,true,true,16).run();
 rows.push({launch,skips:s.skips,distance:s.p.x,time:s.time});
}
rows.sort((a,b)=>Math.abs(a.skips-90)-Math.abs(b.skips-90));
const verified=rows.slice(0,5).map(row=>{const q=new Simulation(row.launch,DT/4,true,true,16).run();const e=new Simulation(row.launch,DT/8,true,true,16).run();return {...row,quarter:{skips:q.skips,distance:q.p.x},eighth:{skips:e.skips,distance:e.p.x}};});
writeFileSync(new URL('../deliverables/water-optimization/ideal-refine.json',import.meta.url),JSON.stringify({rows,verified},null,2));console.log(JSON.stringify(verified,null,2));
