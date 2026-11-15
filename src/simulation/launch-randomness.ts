import type { Launch } from './physics';
import { validateVisual, type VisualSettings } from './visual-variation';

export const DEFAULT_TEMPERATURE=1;
export const AMPLITUDES={speed:.035,direction:1.5,elevation:1.5,tilt:1.5,spin:.04};
export interface ThrowSnapshot { version:1; seed:number; temperature:number; target:Launch; sampled:Launch; visual?:VisualSettings }
export function sampleThrow(target:Launch,temperature:number,seed:number):ThrowSnapshot {
 if(!Number.isFinite(temperature)||temperature<0||temperature>2)throw new RangeError('Temperature must be 0..2');
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Seed must be uint32');
 for(const key of Object.keys(AMPLITUDES) as (keyof Launch)[])if(!Number.isFinite(target[key]))throw new RangeError('Launch must be finite');
 if(target.speed<=0||target.spin<0||target.tilt<0||target.tilt>85||Math.abs(target.elevation)>80)throw new RangeError('Invalid launch');
 let state=seed;
 const uniform=()=>{state=(state+0x6d2b79f5)>>>0;let value=state;value=Math.imul(value^(value>>>15),value|1);value^=value+Math.imul(value^(value>>>7),value|61);return ((value^(value>>>14))>>>0)/4294967296;};
 const smooth=()=>((uniform()+uniform()+uniform())*2/3-1)*temperature;
 const sampled={...target};
 if(temperature>0){
  sampled.speed=target.speed*(1+AMPLITUDES.speed*smooth());
  sampled.direction=target.direction+AMPLITUDES.direction*smooth();
  sampled.elevation=Math.max(-80,Math.min(80,target.elevation+AMPLITUDES.elevation*smooth()));
  sampled.tilt=Math.max(0,Math.min(85,target.tilt+AMPLITUDES.tilt*smooth()));
  sampled.spin=target.spin*(1+AMPLITUDES.spin*smooth());
 }
 return {version:1,seed,temperature,target:{...target},sampled};
}
export function replayLaunch(snapshot:ThrowSnapshot):Launch {return {...snapshot.sampled};}
export function parseSnapshot(json:string):ThrowSnapshot {
 const value=JSON.parse(json) as ThrowSnapshot;
 if(value.version!==1)throw new Error('Unsupported snapshot version');
 const expected=sampleThrow(value.target,value.temperature,value.seed);
 if(!value.sampled||(Object.keys(AMPLITUDES) as (keyof Launch)[]).some(key=>expected.sampled[key]!==value.sampled[key]))throw new Error('Snapshot sampled launch mismatch');
 if(value.visual!==undefined)expected.visual=validateVisual(value.visual);
 return expected;
}
