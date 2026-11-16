import type { Sheet, Particle } from './effects';
import { sheetPoint } from './sheet-shape';
import { correlated } from '../simulation/visual-variation';
import type { HeightField } from './heightfield';

export const WATER_DENSITY=1000;
export const SURFACE_TENSION=.072;
export const LIGAMENT_COUNT=8;
export function ligamentCount(sheet:Sheet){return Math.min(LIGAMENT_COUNT,Math.ceil((sheet.path?.length??0)/8));}
function cohort(sheet:Sheet,index:number){
 const end=index*8;
 return {...sheet,path:sheet.path?.slice(0,end+1)};
}
export function liquidBudget(sheet:Sheet){
 const path=sheet.path??[];
 const volume=path.reduce((sum,node)=>sum+(node.volume??0),0);
 const energy=path.reduce((sum,node)=>sum+(node.energy??0),0);
 let ligaments=0;
 for(let index=0;index<ligamentCount(sheet);index++)ligaments+=path.slice(Math.max(0,index*8-7),index*8+1).reduce((sum,node)=>sum+(node.volume??0)*.24,0);
 return {volume,film:volume*.42,rim:volume*.58-ligaments,ligaments,energy};
}
export function attachedPoint(sheet:Sheet,time:number,u:number,v:number,field?:HeightField):[number,number,number]{
 const point=sheetPoint(sheet,time,u,v);
 const surface=field?.sample(point[0],point[2],time)??0;
 const root=sheetPoint(sheet,time,u,0);
 const blend=Math.min(1,v/.32),curve=blend*blend*(3-2*blend);
 if(v<.32){
  const shoulder=sheetPoint(sheet,time,u,.32);
  point[0]=root[0]+(shoulder[0]-root[0])*blend;
  point[2]=root[2]+(shoulder[2]-root[2])*blend;
  const base=field?.sample(point[0],point[2],time)??0;
  point[1]=base*(1-v)+Math.max(0,shoulder[1]-sheet.origin[1])*curve;
 }else point[1]=surface*(1-v)+Math.max(0,point[1]-sheet.origin[1]);
 const ridge=Math.cbrt(liquidBudget(sheet).rim)*.35;
 point[1]+=ridge*Math.sin(Math.PI*Math.min(1,v/.65))**2*(1-(2*u-1)**2)*Math.max(0,1-(time-sheet.birth)/.12);
 return point;
}
export function ligamentSpec(sheet:Sheet,index:number){
 const perturb=(sheet.breakup??0)*.12*correlated(sheet.seed,71,index*1.7);
 const frozen=cohort(sheet,index),node=frozen.path?.[index*8];
 const volume=(frozen.path??[]).slice(Math.max(0,index*8-7)).reduce((sum,entry)=>sum+(entry.volume??0)*.24,0);
 const initialLength=Math.max(.0015,Math.cbrt(volume)*.8);
 const stretch=(.18+Math.min(.45,(node?.vy??0)*.35))*(1+perturb);
 const radius=Math.sqrt(volume/(Math.PI*initialLength));
 const capillary=3*Math.sqrt(WATER_DENSITY*radius**3/SURFACE_TENSION);
 const criticalLength=Math.cbrt(4*Math.PI*volume);
 const start=(node?.time??sheet.birth)+.005+index*.0007;
 const duration=Math.max(.006,capillary,(criticalLength-initialLength)/stretch);
 return {u:.16+(.61803398875*index%1)*.68,volume,initialLength,stretch,start,pinch:start+duration};
}
export function ligamentPoint(sheet:Sheet,index:number,time:number,fraction:number):[number,number,number]{
 const spec=ligamentSpec(sheet,index),age=Math.max(0,Math.min(time,spec.pinch)-spec.start);
 const base=sheetPoint(cohort(sheet,index),time,spec.u,1);
 const lateral=(spec.u-.5)*2;
 const length=spec.initialLength+spec.stretch*age;
 const rise=.72,forward=.45,side=lateral*.5;
 const norm=Math.hypot(rise,forward,side);
 const distance=length*fraction;
 return [base[0]+(sheet.direction[0]*forward-sheet.direction[1]*side)*distance/norm,Math.max(0,base[1]-sheet.origin[1])+rise*distance/norm,base[2]+(sheet.direction[1]*forward+sheet.direction[0]*side)*distance/norm];
}
export function bulbFraction(sheet:Sheet,index:number,time:number){
 const spec=ligamentSpec(sheet,index);
 const phase=Math.max(0,Math.min(1,(time-spec.start)/(spec.pinch-spec.start)));
 return phase*phase;
}
export function ligamentRadius(sheet:Sheet,index:number,time:number){
 const spec=ligamentSpec(sheet,index),length=spec.initialLength+spec.stretch*Math.max(0,Math.min(time,spec.pinch)-spec.start);
 return Math.sqrt(spec.volume*(1-bulbFraction(sheet,index,time))/(Math.PI*length));
}
export function bulbRadius(sheet:Sheet,index:number,time:number){
 return Math.cbrt(3*ligamentSpec(sheet,index).volume*bulbFraction(sheet,index,time)/(4*Math.PI));
}
export function detachedDrop(sheet:Sheet,index:number):Particle{
 const spec=ligamentSpec(sheet,index),birth=spec.pinch;
 const origin=ligamentPoint(sheet,index,birth,1),previous=ligamentPoint(sheet,index,birth-1e-6,1);
 return {birth,life:.7,origin,velocity:origin.map((value,axis)=>(value-previous[axis])/1e-6) as [number,number,number],size:Math.cbrt(3*spec.volume/(4*Math.PI)),volume:spec.volume};
}
export function rimRadius(sheet:Sheet,time:number){
 let length=0,previous=sheetPoint(sheet,time,0,1);
 for(let index=1;index<=48;index++){const next=sheetPoint(sheet,time,index/48,1);length+=Math.hypot(...next.map((value,axis)=>value-previous[axis]))*(.35+1.3*Math.sin(Math.PI*(index-.5)/48)**2);previous=next;}
 return Math.sqrt(liquidBudget(sheet).rim/(Math.PI*Math.max(.01,length)));
}
