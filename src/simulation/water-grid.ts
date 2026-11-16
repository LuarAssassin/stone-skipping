export interface Footprint { x:number; z:number; y:number; radius:number; depth:number; aspect?:number; angle?:number }
export interface WaterMomentum { x:number; z:number; impulseY:number; wetArea?:number; from?:number; to?:number }
export interface WaterTick { old:Footprint; next:Footprint; momentum?:WaterMomentum }
export const WATER_DT=1/120, WATER_CELL=16/512, WATER_DENSITY=1000, WATER_PARTICIPATION_DEPTH=.04;
export const WATER_SPEED=WATER_CELL/WATER_DT/Math.sqrt(2);
export function waterGrid(width=2048,height=1024){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16)throw new Error('Invalid water grid');
 const dx=16/width,dz=8/height;
 const substeps=Math.max(1,Math.ceil(WATER_SPEED*WATER_DT*Math.hypot(1/dx,1/dz)/.85));
 const dt=WATER_DT/substeps;
 return Object.freeze({width,height,dx,dz,substeps,dt,speed:WATER_SPEED,cfl:WATER_SPEED*dt*Math.hypot(1/dx,1/dz),wx:(WATER_SPEED*dt/dx)**2,wz:(WATER_SPEED*dt/dz)**2,damping:Math.pow(.995,1/substeps)});
}
export type WaterGrid=ReturnType<typeof waterGrid>;
export const BASE_GRID=waterGrid(512,256),FINE_GRID=waterGrid();
export const dryFootprint=():Footprint=>({x:0,z:0,y:1,radius:.075,depth:.009});
export function validFootprint(p:Footprint):Footprint {
 return [p.x,p.z,p.y,p.radius,p.depth,p.aspect??1,p.angle??0].every(Number.isFinite)&&p.radius>0&&p.depth>0&&(p.aspect??1)>0?p:dryFootprint();
}
export function interpolateFootprint(a:Footprint,b:Footprint,t:number):Footprint {
 if(t<=0)return {...a};if(t>=1)return {...b};
 const angleA=a.angle??0,angleB=b.angle??0;
 const angleDelta=((angleB-angleA+Math.PI/2)%Math.PI+Math.PI)%Math.PI-Math.PI/2;
 const mix=(x:number,y:number)=>x+(y-x)*t;
 return {x:mix(a.x,b.x),z:mix(a.z,b.z),y:mix(a.y,b.y),radius:mix(a.radius,b.radius),depth:mix(a.depth,b.depth),aspect:mix(a.aspect??1,b.aspect??1),angle:angleA+angleDelta*t};
}
export function displaced(p:Footprint,x:number,z:number){
 const angle=p.angle??0,dx=x-p.x,dz=z-p.z;
 const along=dx*Math.cos(angle)+dz*Math.sin(angle),across=(-dx*Math.sin(angle)+dz*Math.cos(angle))/(p.aspect??1);
 const radial=(along/p.radius)**2+(across/p.radius)**2;
 if(radial>=1||Math.abs(p.y)>p.depth*3)return 0;
 const weight=Math.sqrt(1-radial)*Math.exp(-Math.pow(Math.max(0,Math.abs(p.y)/p.depth-1)*1.5,6));
 return Math.max(0,Math.min(0,p.y+p.depth*weight)-Math.min(0,p.y-p.depth*weight));
}
export function displacedVolume(p:Footprint){
 const d=p.depth*Math.exp(-Math.pow(Math.max(0,Math.abs(p.y)/p.depth-1)*1.5,6));
 if(d<1e-30||p.y>=d)return 0;
 const q=Math.max(-1,Math.min(1,p.y/d)),fraction=.5-.75*q+.25*q*q*q;
 return 4*Math.PI/3*p.radius*p.radius*(p.aspect??1)*d*fraction;
}
const GAUSS=.5/Math.sqrt(3);
export function cellDisplacement(p:Footprint,col:number,row:number,g:WaterGrid){
 let sum=0;for(const u of [-GAUSS,GAUSS])for(const v of [-GAUSS,GAUSS])sum+=displaced(p,(col+.5+u)*g.dx,(row+.5+v)*g.dz-4);
 return sum*.25;
}
export function displacementScale(p:Footprint,g:WaterGrid){
 const target=displacedVolume(p);if(target<1e-18)return 0;
 const radius=p.radius*Math.max(1,p.aspect??1);
 if(p.x-radius<0||p.x+radius>16||p.z-radius< -4||p.z+radius>4)return 1;
 let sampled=0;
 const left=Math.max(0,Math.floor((p.x-radius)/g.dx)),right=Math.min(g.width-1,Math.ceil((p.x+radius)/g.dx));
 const top=Math.max(0,Math.floor((p.z+4-radius)/g.dz)),bottom=Math.min(g.height-1,Math.ceil((p.z+4+radius)/g.dz));
 for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++)sampled+=cellDisplacement(p,col,row,g)*g.dx*g.dz;
 return sampled>1e-30?target/sampled:0;
}
export function displacedRim(p:Footprint):Footprint {
 return {...p,radius:p.radius*2};
}
export function redistributedDisplacement(p:Footprint,col:number,row:number,g:WaterGrid){
 const rim=displacedRim(p);
 const inner=displacementScale(p,g)*cellDisplacement(p,col,row,g);
 const outer=displacementScale(rim,g)*cellDisplacement(rim,col,row,g)/4;
 return (outer-inner)*4/3;
}
export function momentumSource(m?:WaterMomentum,g:WaterGrid=BASE_GRID,dt=WATER_DT,gpuPrecision=false){
 const physicalSigma=m?.wetArea!==undefined?Math.max(.004,Math.min(.04,Math.sqrt(Math.max(0,m.wetArea)/(2*Math.PI)))):.0390625;
 const sigma=gpuPrecision?Math.fround(physicalSigma):physicalSigma;
 const x=gpuPrecision?Math.fround((m?.x??0)/g.dx)*g.dx:(m?.x??0);
 const z=gpuPrecision?Math.fround(((m?.z??0)+4)/g.dz)*g.dz-4:(m?.z??0);
 if(!m||![m.x,m.z,m.impulseY,sigma].every(Number.isFinite))return {x:0,z:0,sigma,increment:0,normalization:0,energy:0};
 let normalization=0,squared=0,cells=0;
 for(let row=Math.max(0,Math.floor((z+4-3*sigma)/g.dz));row<=Math.min(g.height-1,Math.ceil((z+4+3*sigma)/g.dz));row++)for(let col=Math.max(0,Math.floor((x-3*sigma)/g.dx));col<=Math.min(g.width-1,Math.ceil((x+3*sigma)/g.dx));col++){
  const radial=(((col+.5)*g.dx-x)**2+((row+.5)*g.dz-4-z)**2)/sigma**2;
  const k=radial<=9?Math.exp(-.5*radial):0;if(k>0)cells++;
  normalization+=k*g.dx*g.dz;squared+=k*k*g.dx*g.dz;
 }
 const velocity=normalization>0?m.impulseY/(WATER_DENSITY*WATER_PARTICIPATION_DEPTH*normalization):0;
 return {x,z,sigma,increment:velocity*dt,normalization,energy:.5*WATER_DENSITY*WATER_PARTICIPATION_DEPTH*velocity*velocity*squared,cells};
}
export function reactionFraction(m:WaterMomentum|undefined,index:number,count:number){
 if(!m)return 0;
 const from=Math.max(0,Math.min(1,m.from??0)),to=Math.max(from,Math.min(1,m.to??1));
 if(to-from<1e-12)return index===count-1?1:0;
 return Math.max(0,Math.min((index+1)/count,to)-Math.max(index/count,from))/(to-from);
}
