import { VISUAL_DEFAULTS, visualHash, correlated, type VisualSettings } from '../simulation/visual-variation';
import type { Contact } from '../simulation/physics';
import { HeightField, type WaterSource } from './heightfield';
export function landingTime(particle:Particle){return particle.birth+(particle.velocity[1]+Math.sqrt(particle.velocity[1]**2+19.62*particle.origin[1]))/9.81;}

export const MAX_SHEETS=16;
export interface SheetNode { time:number; x:number; z:number; vx:number; vy:number; vz:number; width:number; variationEnvelope:number; impulse:number }
export interface Sheet { birth:number; life:number; origin:[number,number,number]; direction:[number,number]; spread:number; length:number; height:number; seed:number; variation?:number; breakup?:number; holePhase?:number; holeScale?:number; contactId?:number; path?:readonly SheetNode[] }
export function makeSheet(contact:Contact,batch:number,birth:number,visual:VisualSettings={seed:0,...VISUAL_DEFAULTS}):Sheet {
 const speed=Math.hypot(contact.velocity.x,contact.velocity.z);
 const steep=Math.abs(contact.velocity.y)/(speed+Math.abs(contact.velocity.y)+.001);
 const impulse=contact.netImpulse;
 const strength=Math.min(1,Math.hypot(impulse?.x??0,impulse?.y??contact.impulse,impulse?.z??0)/.18);
 const dx=contact.velocity.x/(speed||1),dz=contact.velocity.z/(speed||1);
 const reactionX=dx*.8-(impulse?.x??0)*2, reactionZ=dz*.8-(impulse?.z??0)*2;
 const norm=Math.hypot(reactionX,reactionZ)||1;
 const point=contact.centroid??contact.point;
 const tilt=Math.min(.4,Math.hypot(contact.normal?.x??0,contact.normal?.z??0));
 const area=Math.sqrt(Math.max(0,contact.maxArea)/.00377);
 return {birth,life:.24+strength*.16,origin:[point.x,.004,point.z],direction:[reactionX/norm,reactionZ/norm],spread:.65+steep*2.5+tilt*.2,length:.12+strength*.45+Math.min(1,area)*.1,height:.025+strength*(.07+steep*.23),seed:visual.sheet===0?0:Math.floor(visualHash(visual.seed,contact.id,1,batch)*4294967296),variation:Math.min(.3,visual.sheet*.3),breakup:visual.breakup*Math.sqrt(strength),holePhase:visual.breakup===0?0:visualHash(visual.seed,contact.id,2)*6.283185*Math.min(1,visual.breakup),holeScale:1+(visualHash(visual.seed,contact.id,3)*2-1)*Math.min(1,visual.breakup)*.25};
}
function makeSheetNode(contact:Contact,sheet:Sheet,time:number,velocity:{x:number;y:number;z:number}=contact.velocity,area=contact.maxArea,last?:SheetNode):Readonly<SheetNode>{
 const point=contact.centroid??contact.point,speed=Math.hypot(velocity.x,velocity.z);
 const wet=Math.min(1,Math.sqrt(Math.max(0,area)/.00377));
 const incoming=Math.max(0,-(velocity.x*(contact.normal?.x??0)+velocity.y*(contact.normal?.y??1)+velocity.z*(contact.normal?.z??0)));
 const force=Math.max(0,contact.impulse-(last?.impulse??0))/Math.max(.00025,time-(last?.time??contact.time));
 const pressure=force/(1000*Math.max(.0001,area));
 const pressureSpeed=3*Math.sqrt(pressure/(9+pressure));
 const lift=Math.min(1.65,(incoming*.25+pressureSpeed*.3)*wet);
 const forward=Math.min(5,speed*.32)*wet;
 return Object.freeze({time,x:point.x,z:point.z,vx:sheet.direction[0]*forward,vy:lift,vz:sheet.direction[1]*forward,width:Math.min(.13,Math.sqrt(Math.max(0,area)/Math.PI)*(1+Math.min(1.5,pressureSpeed*.5))),variationEnvelope:(sheet.variation??0)*wet,impulse:contact.impulse});
}
export function sheetPoint(sheet:Sheet,time:number,u:number,v:number):[number,number,number] {
 const age=Math.max(0,time-sheet.birth),phase=Math.min(1,age/sheet.life);
 const lateral=(u-.5)*2;
 const variation=sheet.variation??0;
 const profile=1+variation*correlated(sheet.seed,10,v*3.2+u*.7);
 const asymmetry=1+variation*lateral*correlated(sheet.seed,11,v*2.4);
 const distance=sheet.length*(.15+.85*Math.sin(phase*Math.PI/2))*v;
 const forward=distance*(1-.28*lateral*lateral)+.012*variation*Math.sin(u*19+sheet.seed)*v*v;
 const side=lateral*(.025+sheet.spread*.045)*(.45+.55*Math.sin(Math.PI*v*.85));
 const arch=Math.sin(v*Math.PI*.85)*sheet.height*Math.sin(Math.PI*phase)**.65*(1-.75*lateral*lateral);
 const rim=1+variation*Math.sin(u*23+sheet.seed+v*9)*v*v;
 const path=sheet.path;const sampleTime=path?.length?path[path.length-1].time-v*(path[path.length-1].time-path[0].time):time;
 let root=path?.[0];
 if(path)for(let index=path.length-1;index>=0;index--)if(path[index].time<=sampleTime){
  const first=path[index],second=path[index+1]??first,weight=second.time>first.time?Math.min(1,(sampleTime-first.time)/(second.time-first.time)):0;
  root={time:first.time+(second.time-first.time)*weight,x:first.x+(second.x-first.x)*weight,z:first.z+(second.z-first.z)*weight,vx:first.vx+(second.vx-first.vx)*weight,vy:first.vy+(second.vy-first.vy)*weight,vz:first.vz+(second.vz-first.vz)*weight,width:first.width+(second.width-first.width)*weight,variationEnvelope:first.variationEnvelope+(second.variationEnvelope-first.variationEnvelope)*weight,impulse:first.impulse+(second.impulse-first.impulse)*weight};break;
 }
 if(root){
  const travel=Math.max(0,time-root.time),attachment=Math.sin(v*Math.PI/2),lift=Math.max(0,root.vy*travel-4.905*travel*travel)*(1-.8*lateral*lateral)*Math.sin(v*Math.PI*.85);
  const split=root.variationEnvelope*correlated(sheet.seed,11,sampleTime*18);
  const scallop=1-root.variationEnvelope*.8*(.5+.5*correlated(sheet.seed,lateral<0?31:32,sampleTime*45));
  const width=lateral*root.width*(1+Math.sign(lateral)*split)*scallop*(.5+.5*Math.sin(v*Math.PI*.8));
  return [root.x+root.vx*travel*attachment-sheet.direction[1]*width,sheet.origin[1]+lift*(1+variation*.5*lateral*correlated(sheet.seed,12,v*3)),root.z+root.vz*travel*attachment+sheet.direction[0]*width];
 }
 return [sheet.origin[0]+sheet.direction[0]*forward-sheet.direction[1]*side*rim*profile*asymmetry,sheet.origin[1]+Math.max(0,arch-.035*phase*phase*v),sheet.origin[2]+sheet.direction[1]*forward+sheet.direction[0]*side*rim*profile*asymmetry];
}
export const MAX_PARTICLES=768;
export const MAX_CONTACTS=16;
export const WAVE_LIFE=5;
export interface Particle { birth:number; life:number; origin:[number,number,number]; velocity:[number,number,number]; size:number }
export function randomAt(seed:number,index:number){let value=(seed^Math.imul(index+1,0x9e3779b9))>>>0;value=Math.imul(value^(value>>>16),0x21f0aaad);value=Math.imul(value^(value>>>15),0x735a2d97);return ((value^(value>>>15))>>>0)/4294967296;}
export function makeParticle(contact:Contact,batch:number,index:number,birth:number,visual:VisualSettings={seed:0,...VISUAL_DEFAULTS}):Particle {
 const energy=Math.min(1,Math.max(.025,Math.sqrt(contact.impulse/.18)));
 const rand=(offset:number)=>.5+(visualHash(visual.seed,contact.id,100+offset,batch*97+index)-.5)*visual.breakup*.5*energy;
 const speed=Math.hypot(contact.velocity.x,contact.velocity.z),dx=contact.velocity.x/(speed||1),dz=contact.velocity.z/(speed||1);
 const steep=Math.abs(contact.velocity.y)/(speed+Math.abs(contact.velocity.y)+.001);
 const side=(rand(0)-.5)*(.5+steep*2),forward=.35+rand(1)*Math.min(2.5,speed*.23);
 const lift=.12+rand(2)*(.3+steep*1.8);
 const point=contact.centroid??contact.point;
 return {birth,life:.35+rand(3)*.7,origin:[point.x,.008,point.z],velocity:[dx*forward-dz*side,lift, dz*forward+dx*side],size:.0015+rand(4)*.0025};
}
export function particlePosition(particle:Particle,time:number):[number,number,number] {
 const age=time-particle.birth;return [particle.origin[0]+particle.velocity[0]*age,particle.origin[1]+particle.velocity[1]*age-4.905*age*age,particle.origin[2]+particle.velocity[2]*age];
}
export function waveEnvelope(age:number,strength:number){return age<0||age>=WAVE_LIFE?0:Math.min(1,strength)*Math.exp(-age*.85)*(1-age/WAVE_LIFE);}
export class ContactEffects {
 visual:VisualSettings={seed:0,...VISUAL_DEFAULTS};
 particles:Particle[]=[];
 sheets:Sheet[]=[];
 readonly field=new HeightField();
 sources:Readonly<WaterSource>[]=[];
 private sampled=new Map<number,number>();
 private landed=new WeakSet<Particle>();
 private emitted=new Set<number>();
 private exited=new Set<number>();
 private landingBuckets=new Map<string,number>();
 private batches=new Map<number,number>();
 update(contacts:readonly Contact[],time:number,current?:{id:number;area:number;velocity:{x:number;y:number;z:number}}){
  this.field.advance(time);
  for(const particle of this.particles){
   const landing=landingTime(particle);
   if(!this.landed.has(particle)&&landing<=time&&landing>=particle.birth&&landing-particle.birth<=particle.life){
    this.landed.add(particle);
    const point=particlePosition(particle,landing);
    const bucket=[Math.floor(landing*120),Math.floor(point[0]*10),Math.floor(point[2]*10)].join(':');
    if(particle.size>=.0023&&!this.landingBuckets.has(bucket)){this.landingBuckets.set(bucket,time);this.source({time:landing,x:point[0],z:point[2],radius:.04,strength:.0015,kind:'drop'});}
   }
  }
  for(const [key,birth] of this.landingBuckets)if(time-birth>.1)this.landingBuckets.delete(key);
  this.particles=this.particles.filter(particle=>time-particle.birth<particle.life);
  for(const contact of contacts.slice(-MAX_CONTACTS)){
   if(time-contact.time>=WAVE_LIFE)continue;
   const previous=this.sampled.get(contact.id)??0,delta=Math.max(0,contact.impulse-previous);
   if(delta>0){const point=contact.centroid??contact.point,live=current?.id===contact.id?current:undefined,velocity=live?.velocity??contact.velocity;
    this.source({time:previous===0?contact.time:time,x:point.x,z:point.z,radius:Math.max(.045,Math.sqrt((live?.area??contact.maxArea)/Math.PI)),strength:Math.min(.03,delta*.8),kind:'contact',contactId:contact.id,angle:Math.atan2(velocity.z,velocity.x),aspect:1+Math.min(.5,Math.hypot(velocity.x,velocity.z)*.035)*Math.abs(contact.normal?.y??1)});
   }
   this.sampled.set(contact.id,contact.impulse);
   if(contact.end!==undefined&&!this.exited.has(contact.id)){
    this.exited.add(contact.id);const point=contact.centroid??contact.point;
    this.source({time:contact.end,x:point.x,z:point.z,radius:.08,strength:-Math.min(.025,contact.impulse*.08),kind:'exit',contactId:contact.id});
   }
   const slot=this.sheets.findIndex(sheet=>sheet.contactId===contact.id);
   if(slot>=0&&contact.end===undefined){
    const sheet=this.sheets[slot],point=contact.centroid??contact.point,path=sheet.path??[];
    const last=path[path.length-1];
    if(!last||Math.hypot(last.x-point.x,last.z-point.z)>.005){
     const live=current?.id===contact.id?current:undefined;
     const node=makeSheetNode(contact,sheet,time,live?.velocity,live?.area,last);
     const next={...sheet,path:[...path.slice(-63),node]};this.sheets[slot]=next;
     if(path.length%3===0)for(const side of [0,1]){
      const birth=time+.025,origin=sheetPoint(next,birth,side,.15),later=sheetPoint(next,birth+.001,side,.15);
      this.particles.push({birth,life:.3,origin,velocity:[(later[0]-origin[0])*1000,(later[1]-origin[1])*1000,(later[2]-origin[2])*1000],size:.0018});
     }
    }
   }
  }
  for(const contact of contacts.slice(-MAX_CONTACTS)) {
   if(time-contact.time>WAVE_LIFE)continue;
   const count=Math.min(48,1+Math.floor(contact.impulse/.012));
   const previous=this.batches.get(contact.id)??0;
   for(let batch=previous;batch<count;batch++)for(let index=0;index<6;index++)this.particles.push(makeParticle(contact,batch,index,previous===0&&batch===0?contact.time:time,this.visual));
   if(!this.emitted.has(contact.id)&&count>1){
    this.emitted.add(contact.id);
    const base=makeSheet(contact,1,time,this.visual),sheet={...base,contactId:contact.id,path:[makeSheetNode(contact,base,time,current?.id===contact.id?current.velocity:undefined,current?.id===contact.id?current.area:undefined)]};this.sheets.push(sheet);
   }
   this.batches.set(contact.id,count);
  }
  this.sheets=this.sheets.filter(sheet=>time-sheet.birth<sheet.life).slice(-MAX_SHEETS);
  if(this.particles.length>MAX_PARTICLES)this.particles.splice(0,this.particles.length-MAX_PARTICLES);
  const live=new Set(contacts.slice(-MAX_CONTACTS).filter(contact=>time-contact.time<WAVE_LIFE).map(contact=>contact.id));
  for(const map of [this.batches,this.sampled])for(const id of map.keys())if(!live.has(id))map.delete(id);
  for(const set of [this.emitted,this.exited])for(const id of set)if(!live.has(id))set.delete(id);
 }
 private source(source:WaterSource){const radius=source.radius*(1+this.visual.surface*.02*(correlated(Math.floor(visualHash(this.visual.seed,source.contactId??0,source.kind==='drop'?302:300)*4294967296),300,source.time*8+source.x*.2)*.5)*Math.min(1,Math.sqrt(Math.abs(source.strength)/.03)));const frozen=Object.freeze({...source,radius});this.sources.push(frozen);if(this.sources.length>4096)this.sources.shift();this.field.disturb(frozen);}
 clear(){this.particles=[];this.sheets=[];this.sources=[];this.batches.clear();this.sampled.clear();this.emitted.clear();this.exited.clear();this.landingBuckets.clear();this.landed=new WeakSet();this.field.clear();}
}
