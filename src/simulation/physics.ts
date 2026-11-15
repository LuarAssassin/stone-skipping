import { Vector3, Quaternion } from 'three';
export const DT = 1 / 4000;
export const MASS = 0.05994;
const A = .04, B = .03, H = .0045;
const AREA = Math.PI * A * B;
const inertia = new Vector3(MASS * (B*B+H*H)/5, MASS*(A*A+B*B)/5, MASS*(A*A+H*H)/5);
export interface Launch { speed:number; elevation:number; tilt:number; spin:number; direction:number }
export const DEFAULT: Launch = { speed:11, elevation:2, tilt:6, spin:18, direction:0 };
export interface Contact { id:number; time:number; end?:number; point:Vector3; velocity:Vector3; impulse:number; maxArea:number; bounced:boolean; energyIn:number; energyOut?:number; normal?:Vector3; centroid?:Vector3; netImpulse?:Vector3; exitVelocity?:Vector3 }
export function wetGeometry(height:number, q:Quaternion) {
 const axisX=new Vector3(1,0,0).applyQuaternion(q), axisZ=new Vector3(0,0,1).applyQuaternion(q);
 const normal=new Vector3(0,1,0).applyQuaternion(q);
 const gradientX=A*axisX.y, gradientZ=B*axisZ.y;
 const radius=Math.hypot(gradientX,gradientZ), thickness=H*Math.abs(normal.y);
 const bottom=height-thickness, lowest=bottom-radius, highest=height+thickness+radius;
 const centroid=new Vector3();
 if(lowest>=0)return {area:0,centroid,lowest,highest};
 if(bottom<=-radius)return {area:AREA,centroid,lowest,highest};
 const cut=Math.max(-1,Math.min(1,-bottom/radius));
 const root=Math.sqrt(Math.max(0,1-cut*cut));
 const angle=Math.atan2(root,-cut);
 const segment=angle<.01?angle**3*(2/3-angle**2*2/15+angle**4*4/315):angle+cut*root;
 const moment=-2/3*root**3;
 centroid.addScaledVector(axisX,A*gradientX/radius*moment/segment).addScaledVector(axisZ,B*gradientZ/radius*moment/segment);
 return {area:A*B*segment,centroid,lowest,highest};
}
export class Simulation {
 p=new Vector3(0,.24,0); v:Vector3; q:Quaternion; momentum:Vector3;
 time=0; ticks=0; skips=0; ended=false; reason='飞行'; submerged=false;
 internalSteps=0; refinements=0; minInternalDt=Infinity;
 contacts:Contact[]=[]; active?:Contact; area=0; force=new Vector3(); omega=new Vector3();
 constructor(public launch:Launch={...DEFAULT},public dt=DT,public water=true,public air=true) {
  const rad=Math.PI/180, direction=launch.direction*rad, elevation=launch.elevation*rad;
  this.v=new Vector3(Math.cos(direction)*Math.cos(elevation),Math.sin(elevation),Math.sin(direction)*Math.cos(elevation)).multiplyScalar(launch.speed);
  this.q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-direction).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),launch.tilt*rad));
  this.momentum=new Vector3(0,inertia.y*launch.spin*2*Math.PI,0).applyQuaternion(this.q);
  this.omega.copy(new Vector3(0,launch.spin*2*Math.PI,0).applyQuaternion(this.q));
 }
 energy() { const local=this.momentum.clone().applyQuaternion(this.q.clone().invert()); return .5*MASS*this.v.lengthSq()+MASS*9.81*this.p.y+.5*(local.x**2/inertia.x+local.y**2/inertia.y+local.z**2/inertia.z); }
 step() {
  if(this.ended)return;
  const start=this.time;
  const clearance=wetGeometry(this.p.y,this.q).lowest;
  const substeps=!this.water||clearance>2*(this.v.length()+.04*this.omega.length()+9.81*this.dt)*this.dt?1:4;
  for(let substep=0;substep<substeps&&!this.ended;substep++)this.integrate(this.dt/substeps,start+substep*this.dt/substeps);
  this.ticks++;
 }
 private dynamics(p:Vector3,v:Vector3,q:Quaternion,momentum:Vector3,submerged:boolean) {
  q=q.clone().normalize();
  const geometry=wetGeometry(p.y,q), force=new Vector3(), torque=new Vector3();
  const touching=this.water&&geometry.lowest<0;
  const pressureActive=touching&&!submerged&&v.dot(new Vector3(0,1,0).applyQuaternion(q))<0;
  submerged=submerged||(this.water&&geometry.highest<0);
  if(touching) {
   const speed=v.length();
   if(submerged) {
    force.copy(v).multiplyScalar(-.5*1000*AREA*.8*speed);
    force.y+=1000*9.81*(MASS/2650);
   } else {
    const normal=new Vector3(0,1,0).applyQuaternion(q);
    force.copy(normal).multiplyScalar(Math.max(0,-v.dot(normal))*speed*1000*geometry.area*.65).addScaledVector(v,-.5*1000*geometry.area*.075*speed);
    torque.crossVectors(geometry.centroid,force).multiplyScalar(.025);
   }
  }
  const waterVector=force.clone(),waterForce=force.length();
  if(this.air)force.addScaledVector(v,-.00012*v.length());
  const acceleration=force.clone().multiplyScalar(1/MASS).add(new Vector3(0,-9.81,0));
  if(touching)torque.addScaledVector(momentum,-(submerged?5:.35));
  const omega=momentum.clone().applyQuaternion(q.clone().invert()).divide(inertia).applyQuaternion(q);
  return {geometry,force,waterForce,waterVector,acceleration,torque,omega,submerged,touching,pressureActive};
 }
 private integrate(dt:number,time:number,depth=0) {
  this.time=time;
  const initial=this.dynamics(this.p,this.v,this.q,this.momentum,this.submerged);
  const derivative=(q:Quaternion,omega:Vector3)=>new Quaternion(omega.x,omega.y,omega.z,0).multiply(q).toArray().map(value=>value*.5);
  const shifted=(rate:number[],scale:number)=>new Quaternion(...this.q.toArray().map((value,index)=>value+rate[index]*scale) as [number,number,number,number]);
  const firstQ=derivative(this.q,initial.omega);
  const halfP=this.p.clone().addScaledVector(this.v,dt/2);
  const halfV=this.v.clone().addScaledVector(initial.acceleration,dt/2);
  const halfL=this.momentum.clone().addScaledVector(initial.torque,dt/2);
  const halfQ=shifted(firstQ,dt/2);
  const second=this.dynamics(halfP,halfV,halfQ,halfL,this.submerged);
  const secondQ=derivative(halfQ,second.omega);
  const thirdV=this.v.clone().addScaledVector(second.acceleration,dt/2);
  const thirdQ=shifted(secondQ,dt/2);
  const mid=this.dynamics(this.p.clone().addScaledVector(halfV,dt/2),thirdV,thirdQ,this.momentum.clone().addScaledVector(second.torque,dt/2),this.submerged);
  const midQ=derivative(thirdQ,mid.omega);
  const lastV=this.v.clone().addScaledVector(mid.acceleration,dt);
  const lastQ=shifted(midQ,dt);
  const last=this.dynamics(this.p.clone().addScaledVector(thirdV,dt),lastV,lastQ,this.momentum.clone().addScaledVector(mid.torque,dt),this.submerged);
  const lastRate=derivative(lastQ,last.omega);
  const nextP=this.p.clone().addScaledVector(this.v,dt/6).addScaledVector(halfV,dt/3).addScaledVector(thirdV,dt/3).addScaledVector(lastV,dt/6);
  const nextQ=new Quaternion(...this.q.toArray().map((value,index)=>value+dt/6*(firstQ[index]+2*secondQ[index]+2*midQ[index]+lastRate[index])) as [number,number,number,number]).normalize();
  const endGeometry=wetGeometry(nextP.y,nextQ);
  const stages=[initial,second,mid,last];
  const endTouching=this.water&&endGeometry.lowest<0;
  const endSubmerged=this.submerged||(this.water&&endGeometry.highest<0);
  if(depth<11&&(stages.some(stage=>stage.touching!==endTouching)||stages.some(stage=>stage.submerged!==endSubmerged)||stages.some(stage=>stage.pressureActive!==initial.pressureActive))) {
   this.refinements++;
   this.integrate(dt/2,time,depth+1);
   if(!this.ended)this.integrate(dt/2,time+dt/2,depth+1);
   return;
  }
  this.internalSteps++;
  this.minInternalDt=Math.min(this.minInternalDt,dt);
  this.submerged=endSubmerged;
  const touching=stages.some(stage=>stage.touching);
  this.area=this.water?mid.geometry.area:0;
  if(touching&&!this.active) {
   const entry=initial.geometry.area>0?initial.geometry:wetGeometry(this.p.y-Math.max(0,initial.geometry.lowest)-1e-12,this.q);
   this.active={id:this.contacts.length,time,point:this.p.clone().add(entry.centroid).setY(0),velocity:this.v.clone(),impulse:0,maxArea:0,bounced:false,energyIn:this.energy(),normal:new Vector3(0,1,0).applyQuaternion(this.q),centroid:this.p.clone().add(entry.centroid),netImpulse:new Vector3()};
   this.contacts.push(this.active);
  }
  if(touching&&this.active) {
   this.active.impulse+=(initial.waterForce+2*second.waterForce+2*mid.waterForce+last.waterForce)*dt/6;
   this.active.maxArea=Math.max(this.active.maxArea,...stages.map(stage=>stage.geometry.area));
   this.active.netImpulse?.addScaledVector(initial.waterVector,dt/6).addScaledVector(second.waterVector,dt/3).addScaledVector(mid.waterVector,dt/3).addScaledVector(last.waterVector,dt/6);
   this.active.centroid=this.p.clone().addScaledVector(halfV,dt/2).add(mid.geometry.centroid);
   this.active.normal=new Vector3(0,1,0).applyQuaternion(thirdQ.clone().normalize());
  }
  if(!touching&&this.active) {
   this.active.end=time;this.active.energyOut=this.energy();this.active.exitVelocity=this.v.clone();
   if(this.v.y>0&&!this.submerged){this.skips++;this.active.bounced=true;}
   this.active=undefined;
  }
  this.force.copy(initial.force).addScaledVector(second.force,2).addScaledVector(mid.force,2).add(last.force).multiplyScalar(1/6);
  this.p.copy(nextP);
  this.v.addScaledVector(initial.acceleration,dt/6).addScaledVector(second.acceleration,dt/3).addScaledVector(mid.acceleration,dt/3).addScaledVector(last.acceleration,dt/6);
  this.momentum.addScaledVector(initial.torque,dt/6).addScaledVector(second.torque,dt/3).addScaledVector(mid.torque,dt/3).addScaledVector(last.torque,dt/6);
  this.q.copy(nextQ);
  this.omega.copy(this.momentum).applyQuaternion(this.q.clone().invert()).divide(inertia).applyQuaternion(this.q);
  this.time=time+dt;
  this.reason=this.submerged?'沉水':touching?'接触':'飞行';
  if(this.water&&(this.p.y<-.3||this.time>=15||Math.abs(this.p.x)>75||Math.abs(this.p.z)>25)) {this.ended=true;this.reason=this.p.y<-.3?'已沉水':this.time>=15?'超时结束':'离开水域';if(this.active){this.active.end=this.time;this.active.energyOut=this.energy();this.active=undefined;}}
 }
 run() {while(!this.ended&&this.time<15)this.step();return this;}
}
export class Clock {
 accumulator=0;
 constructor(public sim:Simulation){}
 advance(seconds:number) {this.accumulator+=seconds;while(this.accumulator+1e-12>=this.sim.dt&&!this.sim.ended){this.sim.step();this.accumulator-=this.sim.dt;} }
}
