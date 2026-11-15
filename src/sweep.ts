import { Simulation, DEFAULT, DT, type Launch } from './physics';
export const CASES: Launch[] = [
 ...[4,8,11,14].flatMap(speed=>[6,10,14,20].map(tilt=>({...DEFAULT,speed,tilt}))),
 ...[35,60,85].map(tilt=>({...DEFAULT,speed:14,tilt})),
 ...[0,.5,2].map(spin=>({...DEFAULT,speed:11,tilt:20,spin})),
 {...DEFAULT,direction:180}, {...DEFAULT,tilt:0,spin:0},
];
export function measure(launch:Launch, dt:number) {
 const sim=new Simulation({...launch},dt), path:number[][]=[];
 const interval=Math.round(.01/dt), start=performance.now();
 while(!sim.ended&&sim.time<15){sim.step();if(sim.ticks%interval===0)path.push(sim.p.toArray());}
 return {sim,path,ms:performance.now()-start};
}
export function compare(launch:Launch, dt=DT) {
 const coarse=measure(launch,dt), fine=measure(launch,dt/2);
 const trajectory=Math.max(0,...coarse.path.slice(0,fine.path.length).map((point,index)=>Math.hypot(...point.map((value,axis)=>value-fine.path[index][axis]))));
 return {launch,skips:[coarse.sim.skips,fine.sim.skips],distance:[coarse.sim.p.x,fine.sim.p.x],distanceDelta:Math.abs(coarse.sim.p.x-fine.sim.p.x),trajectory,time:[coarse.sim.time,fine.sim.time],ms:[coarse.ms,fine.ms]};
}
if(process.argv[1]?.endsWith('sweep.ts')) {
 const results=CASES.map(launch=>compare(launch));
 for(const result of results)console.log(JSON.stringify(result));
 console.log(JSON.stringify({cases:results.length,skipDisagreements:results.filter(result=>result.skips[0]!==result.skips[1]).length,maxDistanceDelta:Math.max(...results.map(result=>result.distanceDelta)),maxTrajectoryDelta:Math.max(...results.map(result=>result.trajectory)),physicsMs:results.reduce((sum,result)=>sum+result.ms[0]+result.ms[1],0)}));
}
