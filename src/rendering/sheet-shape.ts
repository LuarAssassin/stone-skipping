import type { Sheet } from './effects';
import { correlated } from '../simulation/visual-variation';
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
  const travel=Math.max(0,time-root.time),attachment=v**.7,lift=Math.max(0,root.vy*travel-4.905*travel*travel)*(1-.42*lateral*lateral)*v**.65;
  const split=root.variationEnvelope*correlated(sheet.seed,11,sampleTime*18);
  const scallop=1-root.variationEnvelope*.8*(.5+.5*correlated(sheet.seed,lateral<0?31:32,sampleTime*45));
  const width=lateral*root.width*(1+Math.sign(lateral)*split)*scallop*(.5+.5*Math.sin(v*Math.PI*.8));
  return [root.x+root.vx*travel*attachment-sheet.direction[1]*width,sheet.origin[1]+lift*(1+variation*.5*lateral*correlated(sheet.seed,12,v*3)),root.z+root.vz*travel*attachment+sheet.direction[0]*width];
 }
 return [sheet.origin[0]+sheet.direction[0]*forward-sheet.direction[1]*side*rim*profile*asymmetry,sheet.origin[1]+Math.max(0,arch-.035*phase*phase*v),sheet.origin[2]+sheet.direction[1]*forward+sheet.direction[0]*side*rim*profile*asymmetry];
}
