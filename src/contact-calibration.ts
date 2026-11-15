import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DEFAULT, DT, Simulation, type Launch } from './physics';
import { CASES } from './sweep';
import { sampleThrow } from './launch-randomness';
export function contactRun(launch:Launch,dt:number) {
 const start=performance.now(),sim=new Simulation({...launch},dt).run();
 return {skips:sim.skips,distance:Math.hypot(sim.p.x,sim.p.z),time:sim.time,ms:performance.now()-start,internalSteps:sim.internalSteps,refinements:sim.refinements,minInternalDt:sim.minInternalDt,contacts:sim.contacts.map(contact=>({...contact,point:contact.point.toArray(),velocity:contact.velocity.toArray()}))};
}
export function contactCompare(launch:Launch) {
 const coarse=contactRun(launch,DT),fine=contactRun(launch,DT/2);
 return {launch,coarse,fine,skipDelta:Math.abs(coarse.skips-fine.skips),distanceDelta:Math.abs(coarse.distance-fine.distance),contactTimeDelta:coarse.contacts.length===fine.contacts.length?Math.max(0,...coarse.contacts.map((contact,index)=>Math.abs(contact.time-fine.contacts[index].time))):null};
}
export function summarize(rows:ReturnType<typeof contactCompare>[]) {
 return {count:rows.length,disagreements:rows.filter(row=>row.skipDelta>0).length,totalSkipDelta:rows.reduce((sum,row)=>sum+row.skipDelta,0),maxDistanceDelta:Math.max(...rows.map(row=>row.distanceDelta)),meanDistanceDelta:rows.reduce((sum,row)=>sum+row.distanceDelta,0)/rows.length,matchedContactCases:rows.filter(row=>row.contactTimeDelta!==null).length,maxMatchedContactTimeDelta:Math.max(0,...rows.map(row=>row.contactTimeDelta??0)),physicsMs:rows.reduce((sum,row)=>sum+row.coarse.ms+row.fine.ms,0)};
}
export function calibrate(count=64) {
 const controls=CASES.map(contactCompare),seeds=Array.from({length:count},(_,seed)=>({seed,...contactCompare(sampleThrow(DEFAULT,1,seed).sampled)}));
 return {dt:DT,temperature:1,seedRange:[0,count-1],controls,seeds,summary:{controls:summarize(controls),seeds:summarize(seeds)}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const result=calibrate(Number(process.argv[3]??64));
 if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result.summary,null,2));
}
