import type { Contact } from '../simulation/physics';

export const MAX_SHEETS=24;
export interface Sheet { birth:number; life:number; origin:[number,number,number]; direction:[number,number]; spread:number; length:number; height:number; seed:number }
export function makeSheet(contact:Contact,batch:number,birth:number):Sheet {
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
 return {birth,life:.24+strength*.16,origin:[point.x,.004,point.z],direction:[reactionX/norm,reactionZ/norm],spread:.65+steep*2.5+tilt*.2,length:.12+strength*.45+Math.min(1,area)*.1,height:.025+strength*(.07+steep*.23),seed:contact.id*101+batch};
}
export function sheetPoint(sheet:Sheet,time:number,u:number,v:number):[number,number,number] {
 const age=Math.max(0,time-sheet.birth),phase=Math.min(1,age/sheet.life);
 const angle=(u-.5)*sheet.spread;
 const distance=sheet.length*(.15+.85*Math.sin(phase*Math.PI/2))*v;
 const forward=Math.cos(angle)*distance,side=Math.sin(angle)*distance;
 const arch=Math.sin(v*Math.PI*.9)*sheet.height*Math.sin(Math.PI*phase)**.65;
 const rim=1+.08*Math.sin(u*43+sheet.seed)*v*v;
 return [sheet.origin[0]+sheet.direction[0]*forward-sheet.direction[1]*side*rim,sheet.origin[1]+Math.max(0,arch-.035*phase*phase*v),sheet.origin[2]+sheet.direction[1]*forward+sheet.direction[0]*side*rim];
}
export const MAX_PARTICLES=768;
export const MAX_CONTACTS=16;
export const WAVE_LIFE=5;
export interface Particle { birth:number; life:number; origin:[number,number,number]; velocity:[number,number,number]; size:number }
export function randomAt(seed:number,index:number){let value=(seed^Math.imul(index+1,0x9e3779b9))>>>0;value=Math.imul(value^(value>>>16),0x21f0aaad);value=Math.imul(value^(value>>>15),0x735a2d97);return ((value^(value>>>15))>>>0)/4294967296;}
export function makeParticle(contact:Contact,batch:number,index:number,birth:number):Particle {
 const rand=(offset:number)=>randomAt(contact.id+271,batch*97+index*7+offset);
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
 particles:Particle[]=[];
 sheets:Sheet[]=[];
 private batches=new Map<number,number>();
 update(contacts:readonly Contact[],time:number){
  this.particles=this.particles.filter(particle=>time-particle.birth<particle.life);
  for(const contact of contacts.slice(-MAX_CONTACTS)) {
   if(time-contact.time>WAVE_LIFE)continue;
   const count=Math.min(48,1+Math.floor(contact.impulse/.012));
   const previous=this.batches.get(contact.id)??0;
   for(let batch=previous;batch<count;batch++)for(let index=0;index<6;index++)this.particles.push(makeParticle(contact,batch,index,previous===0&&batch===0?contact.time:time));
   for(let batch=previous;batch<count;batch++)if(batch%4===1){
    const sheet=makeSheet(contact,batch,time);this.sheets.push(sheet);
    for(let index=0;index<12;index++){
     const delay=sheet.life*(.4+randomAt(sheet.seed,index)*.22),birth=sheet.birth+delay;
     const origin=sheetPoint(sheet,birth,index/11,.94);
     const later=sheetPoint(sheet,birth+.001,index/11,.94);
     this.particles.push({birth,life:.3+randomAt(sheet.seed,index+20)*.2,origin,velocity:[(later[0]-origin[0])*500,.15+randomAt(sheet.seed,index+40)*.4,(later[2]-origin[2])*500],size:.0015+randomAt(sheet.seed,index+60)*.002});
    }
   }
   this.batches.set(contact.id,count);
  }
  this.sheets=this.sheets.filter(sheet=>time-sheet.birth<sheet.life).slice(-MAX_SHEETS);
  if(this.particles.length>MAX_PARTICLES)this.particles.splice(0,this.particles.length-MAX_PARTICLES);
  const live=new Set(contacts.slice(-MAX_CONTACTS).filter(contact=>time-contact.time<WAVE_LIFE).map(contact=>contact.id));
  for(const id of this.batches.keys())if(!live.has(id))this.batches.delete(id);
 }
 clear(){this.particles=[];this.sheets=[];this.batches.clear();}
}
