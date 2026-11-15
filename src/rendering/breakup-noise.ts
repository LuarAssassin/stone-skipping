const fract=(value:number)=>value-Math.floor(value);
function lattice(x:number,y:number){
 let px=fract(x*.1031),py=fract(y*.1031),pz=fract(x*.1031);
 const dot=px*(py+33.33)+py*(pz+33.33)+pz*(px+33.33);
 px+=dot;py+=dot;pz+=dot;
 return fract((px+py)*pz);
}
function valueNoise(x:number,y:number){
 const cellX=Math.floor(x),cellY=Math.floor(y),fx=x-cellX,fy=y-cellY;
 const wx=fx*fx*(3-2*fx),wy=fy*fy*(3-2*fy);
 const low=lattice(cellX,cellY)*(1-wx)+lattice(cellX+1,cellY)*wx;
 const high=lattice(cellX,cellY+1)*(1-wx)+lattice(cellX+1,cellY+1)*wx;
 return low*(1-wy)+high*wy;
}
export function breakupField(u:number,v:number,phase:number,scale:number){
 const x=u*11*scale+phase*2.13,y=v*9*scale-phase*1.71;
 const warpX=valueNoise(x*.43+17.1,y*.43+9.2)-.5;
 const warpY=valueNoise(x*.43-8.3,y*.43+31.7)-.5;
 const warpedX=x+warpX*.85,warpedY=y+warpY*.85;
 return .72*valueNoise(warpedX,warpedY)+.28*valueNoise(warpedX*2.07+43.2,warpedY*2.07-19.1);
}
export const BREAKUP_NOISE_GLSL=`
float breakupHash(vec2 cell){
 vec3 p=fract(vec3(cell.x,cell.y,cell.x)*.1031);
 p+=dot(p,p.yzx+33.33);
 return fract((p.x+p.y)*p.z);
}
float breakupValue(vec2 point){
 vec2 cell=floor(point),weight=fract(point);
 weight=weight*weight*(3.0-2.0*weight);
 return mix(mix(breakupHash(cell),breakupHash(cell+vec2(1,0)),weight.x),mix(breakupHash(cell+vec2(0,1)),breakupHash(cell+vec2(1,1)),weight.x),weight.y);
}
float breakupField(vec2 uv,vec2 profile){
 vec2 point=uv*vec2(11,9)*profile.y+profile.x*vec2(2.13,-1.71);
 vec2 warp=vec2(breakupValue(point*.43+vec2(17.1,9.2)),breakupValue(point*.43+vec2(-8.3,31.7)))-.5;
 point+=warp*.85;
 return .72*breakupValue(point)+.28*breakupValue(point*2.07+vec2(43.2,-19.1));
}`;
