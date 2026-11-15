import { DEFAULT, Simulation } from '../src/simulation/physics';
import { sampleThrow } from '../src/simulation/launch-randomness';
export function stats(values:number[]){const mean=values[0]+values.reduce((sum,value)=>sum+(value-values[0]),0)/values.length;return {min:Math.min(...values),mean,max:Math.max(...values),sd:Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length)};}
export function sweep(count:number){
 return [0,1].map(temperature=>{
  const rows=Array.from({length:count},(_,seed)=>{const snapshot=sampleThrow(DEFAULT,temperature,seed);const sim=new Simulation(snapshot.sampled).run();return {seed,sampled:snapshot.sampled,skips:sim.skips,distance:Math.hypot(sim.p.x,sim.p.z)};});
  const histogram:Record<string,number>={};for(const row of rows)histogram[row.skips]=(histogram[row.skips]??0)+1;
  return {temperature,seeds:`0..${count-1} inclusive`,target:DEFAULT,histogram,distance:stats(rows.map(row=>row.distance)),deviations:Object.fromEntries((Object.keys(DEFAULT) as (keyof typeof DEFAULT)[]).map(key=>[key,stats(rows.map(row=>row.sampled[key]-DEFAULT[key]))])),rows};
 });
}
if(process.argv[1]?.endsWith('variation-sweep.ts'))console.log(JSON.stringify(sweep(Number(process.argv[2]??64)),null,2));
