import type { Simulation } from './physics';
import { visualHash } from './visual-variation';
import type {WaterMomentum} from './water-grid';

export interface SprayDrop {
 birth:number; origin:readonly [number,number,number]; velocity:readonly [number,number,number];
 radius:number; landing:number; energy:number; detach?:number;
}
export interface WaterRibbon {
 contact:number; birth:number; origin:readonly [number,number,number];
 direction:readonly [number,number]; width:number; forward:number; lift:number; spread:number;
 detach:number; volume:number; cant:number; phase:number;
}
export const MAX_SPRAY=4096, MAX_RIBBONS=1024;
export function sprayPosition(drop:SprayDrop,time:number):[number,number,number] {
 const t=time-drop.birth;
 return [drop.origin[0]+drop.velocity[0]*t,drop.origin[1]+drop.velocity[1]*t-4.905*t*t,drop.origin[2]+drop.velocity[2]*t];
}
// The bank of the disk favours one shoulder. The same velocity field carries
// the attached lip and every drop released from its edge.
function lipVelocity(r:WaterRibbon,u:number):[number,number,number]{
 const fold=Math.sin(6.2*u+r.phase)+.42*Math.sin(13.1*u-r.phase*.7)+.16*Math.sin(23.*u+r.phase);
 const forward=r.forward*(1-.42*u*u+.22*r.cant*u+.12*fold);
 const side=r.spread*(u*(.90+.29*r.cant*u)+.16*fold);
 const up=r.lift*Math.max(.14,.83-.26*u*u+.60*r.cant*u+.28*fold);
 const [dx,dz]=r.direction;
 return [dx*forward-dz*side,up,dz*forward+dx*side];
}
export function lipDetach(r:WaterRibbon,u:number){
 const fold=Math.cos(7.7*u+r.phase)*.25+Math.cos(15.2*u-r.phase)*.10;
 return r.detach*(1.02-.32*u*r.cant-.24*u*u+fold);
}
export function ribbonPoint(r:WaterRibbon,time:number,u:number):[number,number,number]{
 const t=Math.max(0,time-r.birth),[dx,dz]=r.direction;
 const v=lipVelocity(r,u),side=u*r.width;
 return [r.origin[0]-dz*side+v[0]*t,r.origin[1]+v[1]*t-4.905*t*t,r.origin[2]+dx*side+v[2]*t];
}
/** A contact-driven visual closure, sharing one water budget between its
 * connected ribbon and detached drops. Not a volume-conserving fluid solver. */
export class ContactSpray {
 drops:SprayDrop[]=[];
 ribbons:WaterRibbon[]=[];
 emittedEnergy=0;
 availableEnergy=0;
 private contact=-1;
 private previous=[0,0,0];
 private budget=0;
 private ordinal=0;
 private lastEmission=-Infinity;
 reset(){this.drops=[];this.ribbons=[];this.emittedEnergy=this.availableEnergy=0;this.contact=-1;this.previous=[0,0,0];this.budget=0;this.ordinal=0;this.lastEmission=-Infinity;}
 /** Called at the water clock, including after the stone has sunk. Each
  * ballistic water crossing is consumed exactly once, independently of RAF. */
 advance(time:number,from:number):WaterMomentum[]{
  const landings:WaterMomentum[]=[];
  this.drops=this.drops.filter(drop=>{
   if(drop.landing>time)return true;
   const p=sprayPosition(drop,drop.landing),mass=4/3*Math.PI*drop.radius**3*1000;
   landings.push({x:p[0],z:p[2],impulseY:mass*(drop.velocity[1]-9.81*(drop.landing-drop.birth)),wetArea:Math.PI*drop.radius**2,from:Math.max(0,(drop.landing-from)*120),to:Math.min(1,(drop.landing-from)*120+.01)});
   return false;
  });
  this.ribbons=this.ribbons.filter(r=>time-r.birth<r.detach*1.7+.005);
  // A bounded number of spatial clusters preserves impulse while avoiding a
  // separate full-water render pass for every small falling drop.
  const clusters:WaterMomentum[]=[];
  for(const impact of landings){
   let nearest=clusters.find(c=>Math.hypot(c.x-impact.x,c.z-impact.z)<.06);
   if(!nearest&&clusters.length<4){clusters.push({...impact});continue;}
   nearest??=clusters.reduce((a,b)=>Math.hypot(a.x-impact.x,a.z-impact.z)<Math.hypot(b.x-impact.x,b.z-impact.z)?a:b);
   const a=Math.abs(nearest.impulseY),b=Math.abs(impact.impulseY),w=a+b;
   nearest.x=(nearest.x*a+impact.x*b)/w;nearest.z=(nearest.z*a+impact.z*b)/w;
   nearest.impulseY+=impact.impulseY;nearest.wetArea=(nearest.wetArea??0)+(impact.wetArea??0);
   nearest.from=Math.min(nearest.from??0,impact.from??0);nearest.to=Math.max(nearest.to??1,impact.to??1);
  }
  return clusters;
 }
 sample(sim:Simulation,seed:number){
  const c=sim.contacts.at(-1);if(!c?.netImpulse)return;
  if(c.id!==this.contact){this.contact=c.id;this.previous=[0,0,0];this.budget=0;this.lastEmission=-Infinity;}
  const impulse=c.netImpulse.toArray();
  const work=Math.max(0,-impulse.reduce((sum,j,i)=>sum+(j-this.previous[i])*sim.v.getComponent(i),0));
  this.previous=impulse;
  this.budget+=work*.025;this.availableEnergy+=work*.025;
  if(!sim.active||sim.submerged||this.budget<.00004||sim.time-this.lastEmission<.0005-1e-10)return;
  this.lastEmission=sim.time;
  const point=c.centroid??c.point;
  const speed=Math.hypot(sim.v.x,sim.v.z),dx=sim.v.x/(speed||1),dz=sim.v.z/(speed||1);
  const incoming=Math.max(.1,-c.velocity.dot(c.normal??sim.v.clone().set(0,1,0)));
  const width=Math.sqrt(sim.area/Math.PI);
  const crossSlope=c.normal?c.normal.z*dx-c.normal.x*dz:0;
  const rimSpeed=c.normal?sim.omega.dot(c.normal)*width:0;
  const cant=Math.tanh(crossSlope*4.5+1.7*rimSpeed/Math.max(1,speed)+(visualHash(seed,c.id,42)-.5)*.5);
  const phase=visualHash(seed,c.id,43)*Math.PI*2+(sim.time-c.time)*speed*31;
  const wetLoad=1-Math.exp(-((width/.012)**2));
  const r:WaterRibbon={contact:c.id,birth:sim.time,origin:[point.x,.001,point.z],direction:[dx,dz],width,
      forward:Math.min(3.8,speed*.15)*(.38+.62*wetLoad),lift:Math.min(2.6,incoming*.65+.22)*(.19+.91*wetLoad),
      spread:Math.min(2.7,incoming*.78+.45)*(.20+.95*wetLoad),detach:.016+.70*width,volume:0,cant,phase};
  const lanes=3+Math.round(4*wetLoad);
  for(let i=0;i<lanes&&this.drops.length<MAX_SPRAY;i++){
   const rand=(channel:number)=>visualHash(seed,c.id,channel,this.ordinal);
   const u=-1+2*(i+.12+.76*rand(1))/lanes;
   const velocity=lipVelocity(r,u),lift=velocity[1];
   const energy=Math.min(this.budget/(lanes-i),.0007),v2=velocity[0]**2+lift**2+velocity[2]**2;
   const radius=Math.min(.00038+.00205*rand(5)**1.55,Math.cbrt(3*(2*energy/v2)/(4*Math.PI*1000)));
   this.ordinal++;if(radius<.00025)continue;
   const volume=4/3*Math.PI*radius**3,actualEnergy=.5*volume*1000*v2;
   const origin:[number,number,number]=[point.x-dz*u*r.width,.001,point.z+dx*u*r.width];
   const birth=sim.time,landing=birth+(lift+Math.sqrt(lift*lift+19.62*origin[1]))/9.81;
   this.drops.push({birth,origin,velocity,radius,landing,energy:actualEnergy,detach:lipDetach(r,u)});
   this.budget-=actualEnergy;this.emittedEnergy+=actualEnergy;r.volume+=volume;
  }
  if(r.volume>0&&this.ribbons.length<MAX_RIBBONS)this.ribbons.push(r);
 }
}
