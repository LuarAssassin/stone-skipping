import {writeFileSync} from 'node:fs';
import {Simulation,DT} from '../src/simulation/physics';
const rows=[];
for(const speed of [19.2,22,24,26])for(const spin of [36.7,45,55])for(const tilt of [4,6,8,10]){
 const launch={speed,spin,tilt,elevation:0,direction:0},s=new Simulation(launch,DT,true,true,16).run();
 rows.push({launch,skips:s.skips,distance:s.p.x,time:s.time});
}
rows.sort((a,b)=>Math.abs(a.skips-90)-Math.abs(b.skips-90));
const verified=rows.slice(0,6).map(row=>{const half=new Simulation(row.launch,DT/2,true,true,16).run(),quarter=new Simulation(row.launch,DT/4,true,true,16).run();return {...row,half:{skips:half.skips,distance:half.p.x},quarter:{skips:quarter.skips,distance:quarter.p.x}};});
writeFileSync(new URL('../deliverables/water-optimization/ideal-search.json',import.meta.url),JSON.stringify({rows,verified},null,2));console.log(JSON.stringify(verified,null,2));
