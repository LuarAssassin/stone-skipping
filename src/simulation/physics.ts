import { Vector3, Quaternion } from 'three';
import { STANDARD_STONE, type StoneSpec } from './stones';
export const DT = 1 / 4000;
export const MASS = 0.05994;
const A = .04, B = .03, H = .0045;
export interface CoreLaunch { speed:number; elevation:number; tilt:number; spin:number; direction:number }
export interface Launch extends CoreLaunch { roll?:number }
export const DEFAULT: CoreLaunch = { speed:11, elevation:2, tilt:6, spin:18, direction:0 };
export interface Contact { id:number; time:number; end?:number; point:Vector3; velocity:Vector3; impulse:number; maxArea:number; bounced:boolean; energyIn:number; energyOut?:number; normal?:Vector3; centroid?:Vector3; netImpulse?:Vector3; exitVelocity?:Vector3 }

interface WetScratch {
 area:number; cx:number; cy:number; cz:number; lowest:number; highest:number;
 nx:number; ny:number; nz:number;
}
interface StageScratch {
 area:number; cx:number; cy:number; cz:number; lowest:number; highest:number;
 fx:number; fy:number; fz:number;
 wfx:number; wfy:number; wfz:number; waterForce:number;
 ax:number; ay:number; az:number;
 tx:number; ty:number; tz:number;
 wx:number; wy:number; wz:number;
 submerged:boolean; touching:boolean; pressureActive:boolean;
}
interface DepthFrame {
 s0:StageScratch; s1:StageScratch; s2:StageScratch; s3:StageScratch;
 endWet:WetScratch;
}

function makeStage(): StageScratch {
 return {
  area:0,cx:0,cy:0,cz:0,lowest:0,highest:0,
  fx:0,fy:0,fz:0,wfx:0,wfy:0,wfz:0,waterForce:0,
  ax:0,ay:0,az:0,tx:0,ty:0,tz:0,wx:0,wy:0,wz:0,
  submerged:false,touching:false,pressureActive:false,
 };
}
function makeWet(): WetScratch {
 return {area:0,cx:0,cy:0,cz:0,lowest:0,highest:0,nx:0,ny:1,nz:0};
}

// Re-entrancy-safe scratch frames per RK4 bisection recursion depth (depth 0..11)
const FRAMES: DepthFrame[] = Array.from({length:12}, () => ({
 s0:makeStage(), s1:makeStage(), s2:makeStage(), s3:makeStage(), endWet:makeWet(),
}));
const ENTRY_WET: WetScratch = makeWet();

/** Zero-allocation analytical elliptical water-plane intersection. */
function wetGeometryInto(
 height:number, qx:number, qy:number, qz:number, qw:number,
 a:number, b:number, h:number, out:WetScratch
) {
 // Columns of rotation matrix from unit quaternion (qx, qy, qz, qw):
 // axisX = R * (1,0,0), normal = R * (0,1,0), axisZ = R * (0,0,1)
 const xx=qx*qx, yy=qy*qy, zz=qz*qz;
 const xy=qx*qy, xz=qx*qz, yz=qy*qz;
 const wx=qw*qx, wy=qw*qy, wz=qw*qz;

 const axX=1-2*(yy+zz), axY=2*(xy+wz),   axZ=2*(xz-wy);
 const nyX=2*(xy-wz),   nyY=1-2*(xx+zz), nyZ=2*(yz+wx);
 const azX=2*(xz+wy),   azY=2*(yz-wx),   azZ=1-2*(xx+yy);

 out.nx=nyX; out.ny=nyY; out.nz=nyZ;

 const gradientX=a*axY, gradientZ=b*azY;
 const radius=Math.hypot(gradientX,gradientZ), thickness=h*Math.abs(nyY);
 const bottom=height-thickness;
 out.lowest=bottom-radius;
 out.highest=height+thickness+radius;
 out.cx=0; out.cy=0; out.cz=0;

 if(out.lowest>=0){out.area=0;return;}
 if(bottom<=-radius){out.area=Math.PI*a*b;return;}
 const cut=Math.max(-1,Math.min(1,-bottom/radius));
 const root=Math.sqrt(Math.max(0,1-cut*cut));
 const angle=Math.atan2(root,-cut);
 const segment=angle<.01?angle**3*(2/3-angle**2*2/15+angle**4*4/315):angle+cut*root;
 const moment=-2/3*root**3;
 const scaleX=a*gradientX/radius*moment/segment;
 const scaleZ=b*gradientZ/radius*moment/segment;
 out.cx=axX*scaleX+azX*scaleZ;
 out.cy=axY*scaleX+azY*scaleZ;
 out.cz=axZ*scaleX+azZ*scaleZ;
 out.area=a*b*segment;
}

export function wetGeometry(height:number, q:Quaternion, a=A, b=B, h=H) {
 wetGeometryInto(height, q.x, q.y, q.z, q.w, a, b, h, ENTRY_WET);
 return {
  area:ENTRY_WET.area,
  centroid:new Vector3(ENTRY_WET.cx, ENTRY_WET.cy, ENTRY_WET.cz),
  lowest:ENTRY_WET.lowest,
  highest:ENTRY_WET.highest,
 };
}

export class Simulation {
 p=new Vector3(0,.24,0); v:Vector3; q:Quaternion; momentum:Vector3;
 time=0; ticks=0; skips=0; ended=false; reason='飞行'; submerged=false;
 internalSteps=0; refinements=0; minInternalDt=Infinity;
 contacts:Contact[]=[]; active?:Contact; area=0; force=new Vector3(); omega=new Vector3();
 readonly stone:StoneSpec;
 private readonly mass:number;
 private readonly invMass:number;
 private readonly areaFull:number;
 private readonly inertiaX:number;
 private readonly inertiaY:number;
 private readonly inertiaZ:number;
 private readonly invIx:number;
 private readonly invIy:number;
 private readonly invIz:number;
 private readonly buoyancy:number;
 private readonly airDrag:number;
 private readonly thicknessDrag:number;
 private readonly wobbleScale:number;
 private readonly wobbleX:number;
 private readonly wobbleZ:number;

 constructor(public launch:Launch={...DEFAULT},public dt=DT,public water=true,public air=true,public contactSubsteps=4,stone:StoneSpec=STANDARD_STONE) {
  if(!Number.isInteger(contactSubsteps)||contactSubsteps<1||contactSubsteps>64)throw new RangeError('Invalid contact substeps');
  this.stone=stone;
  const a=stone.a, b=stone.b, h=stone.h, m=stone.mass;
  this.mass=m;
  this.invMass=1/m;
  this.areaFull=Math.PI*a*b;
  this.inertiaX=m*(b*b+h*h)/5;
  this.inertiaY=m*(a*a+b*b)/5;
  this.inertiaZ=m*(a*a+h*h)/5;
  this.invIx=1/this.inertiaX;
  this.invIy=1/this.inertiaY;
  this.invIz=1/this.inertiaZ;
  this.buoyancy=1000*9.81*(m/stone.density);
  this.airDrag=.00012*(this.areaFull/(Math.PI*A*B));
  const thicknessRatio=h/H;
  this.thicknessDrag=thicknessRatio>1?1+.42*(thicknessRatio-1):1;
  this.wobbleScale=stone.wobble>0?a*stone.wobble*.18*.04:0;
  const wAngle=(stone.seed%360)*Math.PI/180;
  this.wobbleX=Math.cos(wAngle);
  this.wobbleZ=Math.sin(wAngle);
  const rad=Math.PI/180, direction=launch.direction*rad, elevation=launch.elevation*rad, roll=(launch.roll??0)*rad;
  this.v=new Vector3(Math.cos(direction)*Math.cos(elevation),Math.sin(elevation),Math.sin(direction)*Math.cos(elevation)).multiplyScalar(launch.speed);
  this.q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-direction).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),launch.tilt*rad));
  if(roll!==0)this.q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),roll));
  this.momentum=new Vector3(0,this.inertiaY*launch.spin*2*Math.PI,0).applyQuaternion(this.q);
  this.omega.copy(new Vector3(0,launch.spin*2*Math.PI,0).applyQuaternion(this.q));
 }

 energy() {
  const qx=this.q.x, qy=this.q.y, qz=this.q.z, qw=this.q.w;
  const lx=this.momentum.x, ly=this.momentum.y, lz=this.momentum.z;
  // Rotate momentum into body frame via q^-1 = (-qx, -qy, -qz, qw)
  const tx=2*(-qy*lz+qz*ly), ty=2*(-qz*lx+qx*lz), tz=2*(-qx*ly+qy*lx);
  const bx=lx+qw*tx+(-qy*tz+qz*ty);
  const by=ly+qw*ty+(-qz*tx+qx*tz);
  const bz=lz+qw*tz+(-qx*ty+qy*tx);
  return .5*this.mass*this.v.lengthSq()+this.mass*9.81*this.p.y+.5*(bx*bx*this.invIx+by*by*this.invIy+bz*bz*this.invIz);
 }

 step() {
  if(this.ended)return;
  const start=this.time;
  wetGeometryInto(this.p.y, this.q.x, this.q.y, this.q.z, this.q.w, this.stone.a, this.stone.b, this.stone.h, ENTRY_WET);
  const maxR=Math.max(this.stone.a,this.stone.b);
  const substeps=!this.water||ENTRY_WET.lowest>2*(this.v.length()+maxR*this.omega.length()+9.81*this.dt)*this.dt?1:this.contactSubsteps;
  for(let substep=0;substep<substeps&&!this.ended;substep++)this.integrate(this.dt/substeps,start+substep*this.dt/substeps);
  this.ticks++;
 }

 private dynamicsInto(
  py:number, vx:number, vy:number, vz:number,
  qx:number, qy:number, qz:number, qw:number,
  lx:number, ly:number, lz:number,
  submergedIn:boolean, out:StageScratch
 ) {
  const qLen=Math.hypot(qx,qy,qz,qw)||1;
  qx/=qLen; qy/=qLen; qz/=qLen; qw/=qLen;

  wetGeometryInto(py, qx, qy, qz, qw, this.stone.a, this.stone.b, this.stone.h, ENTRY_WET);
  out.area=ENTRY_WET.area;
  out.cx=ENTRY_WET.cx; out.cy=ENTRY_WET.cy; out.cz=ENTRY_WET.cz;
  out.lowest=ENTRY_WET.lowest; out.highest=ENTRY_WET.highest;
  const nx=ENTRY_WET.nx, ny=ENTRY_WET.ny, nz=ENTRY_WET.nz;

  const touching=this.water&&out.lowest<0;
  const vDotN=vx*nx+vy*ny+vz*nz;
  out.pressureActive=touching&&!submergedIn&&vDotN<0;
  const submerged=submergedIn||(this.water&&out.highest<0);
  out.submerged=submerged;
  out.touching=touching;

  let fx=0, fy=0, fz=0;
  let tx=0, ty=0, tz=0;

  if(touching) {
   const speed=Math.hypot(vx,vy,vz);
   if(submerged) {
    const c=-.5*1000*this.areaFull*.8*this.stone.dragScale*speed;
    fx=vx*c; fy=vy*c+this.buoyancy; fz=vz*c;
   } else {
    const lift=Math.max(0,-vDotN)*speed*1000*out.area*.65;
    const drag=-.5*1000*out.area*.075*this.stone.dragScale*this.thicknessDrag*speed;
    fx=nx*lift+vx*drag;
    fy=ny*lift+vy*drag;
    fz=nz*lift+vz*drag;
    tx=(out.cy*fz-out.cz*fy)*.025;
    ty=(out.cz*fx-out.cx*fz)*.025;
    tz=(out.cx*fy-out.cy*fx)*.025;
    if(this.wobbleScale>0) {
     // Rotate local wobble axis (wobbleX, 0, wobbleZ) by q
     const r0x=1-2*(qy*qy+qz*qz), r0y=2*(qx*qy+qw*qz), r0z=2*(qx*qz-qw*qy);
     const r2x=2*(qx*qz+qw*qy), r2y=2*(qy*qz-qw*qx), r2z=1-2*(qx*qx+qy*qy);
     const ox=(r0x*this.wobbleX+r2x*this.wobbleZ)*this.wobbleScale;
     const oy=(r0y*this.wobbleX+r2y*this.wobbleZ)*this.wobbleScale;
     const oz=(r0z*this.wobbleX+r2z*this.wobbleZ)*this.wobbleScale;
     tx+=oy*fz-oz*fy;
     ty+=oz*fx-ox*fz;
     tz+=ox*fy-oy*fx;
    }
   }
  }

  out.wfx=fx; out.wfy=fy; out.wfz=fz;
  out.waterForce=Math.hypot(fx,fy,fz);

  if(this.air) {
   const ac=-this.airDrag*Math.hypot(vx,vy,vz);
   fx+=vx*ac; fy+=vy*ac; fz+=vz*ac;
  }
  out.fx=fx; out.fy=fy; out.fz=fz;
  out.ax=fx*this.invMass;
  out.ay=fy*this.invMass-9.81;
  out.az=fz*this.invMass;

  if(touching) {
   const td=-(submerged?5:.35)*this.stone.dragScale;
   tx+=lx*td; ty+=ly*td; tz+=lz*td;
  }
  out.tx=tx; out.ty=ty; out.tz=tz;

  // World angular velocity: omega = q * (I^-1 * (q^-1 * L))
  const utx=2*(-qy*lz+qz*ly), uty=2*(-qz*lx+qx*lz), utz=2*(-qx*ly+qy*lx);
  const blx=(lx+qw*utx+(-qy*utz+qz*uty))*this.invIx;
  const bly=(ly+qw*uty+(-qz*utx+qx*utz))*this.invIy;
  const blz=(lz+qw*utz+(-qx*uty+qy*utx))*this.invIz;
  const vtx=2*(qy*blz-qz*bly), vty=2*(qz*blx-qx*blz), vtz=2*(qx*bly-qy*blx);
  out.wx=blx+qw*vtx+(qy*vtz-qz*vty);
  out.wy=bly+qw*vty+(qz*vtx-qx*vtz);
  out.wz=blz+qw*vtz+(qx*vty-qy*vtx);
 }

 private integrate(dt:number,time:number,depth=0) {
  this.time=time;
  const frame=FRAMES[depth];
  const s0=frame.s0, s1=frame.s1, s2=frame.s2, s3=frame.s3;
  const px=this.p.x, py=this.p.y, pz=this.p.z;
  const vx=this.v.x, vy=this.v.y, vz=this.v.z;
  const qx=this.q.x, qy=this.q.y, qz=this.q.z, qw=this.q.w;
  const lx=this.momentum.x, ly=this.momentum.y, lz=this.momentum.z;
  const hdt=dt*.5;

  // Stage 1 (initial)
  this.dynamicsInto(py,vx,vy,vz,qx,qy,qz,qw,lx,ly,lz,this.submerged,s0);
  // qdot = 0.5 * (omega, 0) * q
  const dq0x=.5*( s0.wx*qw+s0.wy*qz-s0.wz*qy);
  const dq0y=.5*(-s0.wx*qz+s0.wy*qw+s0.wz*qx);
  const dq0z=.5*( s0.wx*qy-s0.wy*qx+s0.wz*qw);
  const dq0w=.5*(-s0.wx*qx-s0.wy*qy-s0.wz*qz);

  // Stage 2 (half)
  const v1x=vx+s0.ax*hdt, v1y=vy+s0.ay*hdt, v1z=vz+s0.az*hdt;
  const q1x=qx+dq0x*hdt,  q1y=qy+dq0y*hdt,  q1z=qz+dq0z*hdt, q1w=qw+dq0w*hdt;
  this.dynamicsInto(py+vy*hdt,v1x,v1y,v1z,q1x,q1y,q1z,q1w,lx+s0.tx*hdt,ly+s0.ty*hdt,lz+s0.tz*hdt,this.submerged,s1);
  const dq1x=.5*( s1.wx*q1w+s1.wy*q1z-s1.wz*q1y);
  const dq1y=.5*(-s1.wx*q1z+s1.wy*q1w+s1.wz*q1x);
  const dq1z=.5*( s1.wx*q1y-s1.wy*q1x+s1.wz*q1w);
  const dq1w=.5*(-s1.wx*q1x-s1.wy*q1y-s1.wz*q1z);

  // Stage 3 (mid)
  const v2x=vx+s1.ax*hdt, v2y=vy+s1.ay*hdt, v2z=vz+s1.az*hdt;
  const q2x=qx+dq1x*hdt,  q2y=qy+dq1y*hdt,  q2z=qz+dq1z*hdt, q2w=qw+dq1w*hdt;
  this.dynamicsInto(py+v1y*hdt,v2x,v2y,v2z,q2x,q2y,q2z,q2w,lx+s1.tx*hdt,ly+s1.ty*hdt,lz+s1.tz*hdt,this.submerged,s2);
  const dq2x=.5*( s2.wx*q2w+s2.wy*q2z-s2.wz*q2y);
  const dq2y=.5*(-s2.wx*q2z+s2.wy*q2w+s2.wz*q2x);
  const dq2z=.5*( s2.wx*q2y-s2.wy*q2x+s2.wz*q2w);
  const dq2w=.5*(-s2.wx*q2x-s2.wy*q2y-s2.wz*q2z);

  // Stage 4 (last)
  const v3x=vx+s2.ax*dt, v3y=vy+s2.ay*dt, v3z=vz+s2.az*dt;
  const q3x=qx+dq2x*dt,  q3y=qy+dq2y*dt,  q3z=qz+dq2z*dt, q3w=qw+dq2w*dt;
  this.dynamicsInto(py+v2y*dt,v3x,v3y,v3z,q3x,q3y,q3z,q3w,lx+s2.tx*dt,ly+s2.ty*dt,lz+s2.tz*dt,this.submerged,s3);
  const dq3x=.5*( s3.wx*q3w+s3.wy*q3z-s3.wz*q3y);
  const dq3y=.5*(-s3.wx*q3z+s3.wy*q3w+s3.wz*q3x);
  const dq3z=.5*( s3.wx*q3y-s3.wy*q3x+s3.wz*q3w);
  const dq3w=.5*(-s3.wx*q3x-s3.wy*q3y-s3.wz*q3z);

  const dt6=dt/6;
  const nextPx=px+dt6*(vx+2*v1x+2*v2x+v3x);
  const nextPy=py+dt6*(vy+2*v1y+2*v2y+v3y);
  const nextPz=pz+dt6*(vz+2*v1z+2*v2z+v3z);

  let nqx=qx+dt6*(dq0x+2*dq1x+2*dq2x+dq3x);
  let nqy=qy+dt6*(dq0y+2*dq1y+2*dq2y+dq3y);
  let nqz=qz+dt6*(dq0z+2*dq1z+2*dq2z+dq3z);
  let nqw=qw+dt6*(dq0w+2*dq1w+2*dq2w+dq3w);
  const nqLen=Math.hypot(nqx,nqy,nqz,nqw)||1;
  nqx/=nqLen; nqy/=nqLen; nqz/=nqLen; nqw/=nqLen;

  wetGeometryInto(nextPy,nqx,nqy,nqz,nqw,this.stone.a,this.stone.b,this.stone.h,frame.endWet);
  const endTouching=this.water&&frame.endWet.lowest<0;
  const endSubmerged=this.submerged||(this.water&&frame.endWet.highest<0);

  if(depth<11&&(
   s0.touching!==endTouching||s1.touching!==endTouching||s2.touching!==endTouching||s3.touching!==endTouching||
   s0.submerged!==endSubmerged||s1.submerged!==endSubmerged||s2.submerged!==endSubmerged||s3.submerged!==endSubmerged||
   s1.pressureActive!==s0.pressureActive||s2.pressureActive!==s0.pressureActive||s3.pressureActive!==s0.pressureActive
  )) {
   this.refinements++;
   this.integrate(dt/2,time,depth+1);
   if(!this.ended)this.integrate(dt/2,time+dt/2,depth+1);
   return;
  }

  this.internalSteps++;
  this.minInternalDt=Math.min(this.minInternalDt,dt);
  this.submerged=endSubmerged;
  const touching=s0.touching||s1.touching||s2.touching||s3.touching;
  this.area=this.water?s2.area:0;

  if(touching&&!this.active) {
   let ecx=s0.cx, ecy=s0.cy, ecz=s0.cz;
   if(s0.area<=0) {
    wetGeometryInto(py-Math.max(0,s0.lowest)-1e-12,qx,qy,qz,qw,this.stone.a,this.stone.b,this.stone.h,ENTRY_WET);
    ecx=ENTRY_WET.cx; ecy=ENTRY_WET.cy; ecz=ENTRY_WET.cz;
   }
   const n0x=2*(qx*qy-qw*qz), n0y=1-2*(qx*qx+qz*qz), n0z=2*(qy*qz+qw*qx);
   this.active={
    id:this.contacts.length,
    time,
    point:new Vector3(px+ecx,0,pz+ecz),
    velocity:this.v.clone(),
    impulse:0,
    maxArea:0,
    bounced:false,
    energyIn:this.energy(),
    normal:new Vector3(n0x,n0y,n0z),
    centroid:new Vector3(px+ecx,py+ecy,pz+ecz),
    netImpulse:new Vector3(),
   };
   this.contacts.push(this.active);
  }
  if(touching&&this.active) {
   this.active.impulse+=(s0.waterForce+2*s1.waterForce+2*s2.waterForce+s3.waterForce)*dt6;
   this.active.maxArea=Math.max(this.active.maxArea,s0.area,s1.area,s2.area,s3.area);
   this.active.netImpulse!.x+=(s0.wfx+2*s1.wfx+2*s2.wfx+s3.wfx)*dt6;
   this.active.netImpulse!.y+=(s0.wfy+2*s1.wfy+2*s2.wfy+s3.wfy)*dt6;
   this.active.netImpulse!.z+=(s0.wfz+2*s1.wfz+2*s2.wfz+s3.wfz)*dt6;
   this.active.centroid!.set(px+v1x*hdt+s2.cx, py+v1y*hdt+s2.cy, pz+v1z*hdt+s2.cz);
   const q2Len=Math.hypot(q2x,q2y,q2z,q2w)||1;
   const uqx=q2x/q2Len, uqy=q2y/q2Len, uqz=q2z/q2Len, uqw=q2w/q2Len;
   this.active.normal!.set(2*(uqx*uqy-uqw*uqz), 1-2*(uqx*uqx+uqz*uqz), 2*(uqy*uqz+uqw*uqx));
  }
  if(!touching&&this.active) {
   this.active.end=time;
   this.active.energyOut=this.energy();
   this.active.exitVelocity=this.v.clone();
   if(vy>0&&!this.submerged){this.skips++;this.active.bounced=true;}
   this.active=undefined;
  }

  this.force.set((s0.fx+2*s1.fx+2*s2.fx+s3.fx)/6,(s0.fy+2*s1.fy+2*s2.fy+s3.fy)/6,(s0.fz+2*s1.fz+2*s2.fz+s3.fz)/6);
  this.p.set(nextPx,nextPy,nextPz);
  this.v.set(vx+dt6*(s0.ax+2*s1.ax+2*s2.ax+s3.ax), vy+dt6*(s0.ay+2*s1.ay+2*s2.ay+s3.ay), vz+dt6*(s0.az+2*s1.az+2*s2.az+s3.az));
  const nlx=lx+dt6*(s0.tx+2*s1.tx+2*s2.tx+s3.tx);
  const nly=ly+dt6*(s0.ty+2*s1.ty+2*s2.ty+s3.ty);
  const nlz=lz+dt6*(s0.tz+2*s1.tz+2*s2.tz+s3.tz);
  this.momentum.set(nlx,nly,nlz);
  this.q.set(nqx,nqy,nqz,nqw);

  const utx=2*(-nqy*nlz+nqz*nly), uty=2*(-nqz*nlx+nqx*nlz), utz=2*(-nqx*nly+nqy*nlx);
  const blx=(nlx+nqw*utx+(-nqy*utz+nqz*uty))*this.invIx;
  const bly=(nly+nqw*uty+(-nqz*utx+nqx*utz))*this.invIy;
  const blz=(nlz+nqw*utz+(-nqx*uty+nqy*utx))*this.invIz;
  const vtx=2*(nqy*blz-nqz*bly), vty=2*(nqz*blx-nqx*blz), vtz=2*(nqx*bly-nqy*blx);
  this.omega.set(blx+nqw*vtx+(nqy*vtz-nqz*vty), bly+nqw*vty+(nqz*vtx-nqx*vtz), blz+nqw*vtz+(nqx*vty-nqy*vtx));

  this.time=time+dt;
  this.reason=this.submerged?'沉水':touching?'接触':'飞行';
  if(this.water&&(this.p.y<-.3||this.time>=15||Math.abs(this.p.x)>75||Math.abs(this.p.z)>25)) {
   this.ended=true;
   this.reason=this.p.y<-.3?'已沉水':this.time>=15?'超时结束':'离开水域';
   if(this.active){this.active.end=this.time;this.active.energyOut=this.energy();this.active=undefined;}
  }
 }
 finish(reason:string){this.ended=true;this.reason=reason;if(this.active){this.active.end=this.time;this.active.energyOut=this.energy();this.active=undefined;}}
 run() {while(!this.ended&&this.time<15)this.step();return this;}
}
export class Clock {
 accumulator=0;
 constructor(public sim:Simulation){}
 advance(seconds:number) {this.accumulator+=seconds;while(this.accumulator+1e-12>=this.sim.dt&&!this.sim.ended){this.sim.step();this.accumulator-=this.sim.dt;} }
}
