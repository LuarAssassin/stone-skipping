import type { Launch } from './physics';

export interface GestureRect { left:number; top:number; width:number; height:number }
export interface GesturePoint { pointerId:number; clientX:number; clientY:number; timeStamp:number }
export const MIN_HOLD_MS=120;
export const FULL_CHARGE_MS=1400;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function normalizePoint(point:Pick<GesturePoint,'clientX'|'clientY'>,rect:GestureRect){
 return {x:clamp((point.clientX-rect.left)/rect.width,0,1),y:clamp((point.clientY-rect.top)/rect.height,0,1)};
}
export class ThrowGesture {
 private active?:{id:number; rect:GestureRect; origin:{x:number;y:number}; point:{x:number;y:number}; start:number; time:number; base:Launch};
 get pointerId(){return this.active?.id;}
 begin(event:GesturePoint,rect:GestureRect,base:Launch):boolean {
  if(this.active||rect.width<=0||rect.height<=0)return false;
  const point=normalizePoint(event,rect);
  this.active={id:event.pointerId,rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},origin:point,point,start:event.timeStamp,time:event.timeStamp,base:{...base}};
  return true;
 }
 move(event:GesturePoint){
  if(!this.active||this.active.id!==event.pointerId)return;
  this.active.point=normalizePoint(event,this.active.rect);
  this.active.time=Math.max(this.active.time,event.timeStamp);
 }
 preview(timeStamp:number){
  const active=this.active;if(!active)return undefined;
  const duration=Math.max(0,Math.max(active.time,timeStamp)-active.start);
  const power=clamp((duration-100)/(FULL_CHARGE_MS-100),0,1);
  const target:Launch={...active.base,speed:8+6*power,
   direction:clamp(active.base.direction+(active.point.x-active.origin.x)*70,-35,35),
   elevation:clamp(active.base.elevation-(active.point.y-active.origin.y)*24,-8,14)};
  return {target,power,duration};
 }
 release(event:GesturePoint):Launch|undefined {
  if(this.active?.id!==event.pointerId)return undefined;
  this.move(event);const preview=this.preview(event.timeStamp);this.cancel();
  return preview&&preview.duration>=MIN_HOLD_MS?{...preview.target}:undefined;
 }
 cancel(){this.active=undefined;}
}
