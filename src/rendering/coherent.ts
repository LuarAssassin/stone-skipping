import * as THREE from 'three';
export interface Footprint { x:number; z:number; y:number; radius:number; depth:number; aspect?:number; angle?:number }
export interface WaterMomentum { x:number; z:number; impulseY:number }
export interface WaterTick { old:Footprint; next:Footprint; momentum?:WaterMomentum }
export const WATER_DT=1/120, WATER_CELL=16/512, WATER_DENSITY=1000, WATER_PARTICIPATION_DEPTH=.04;
export function momentumSource(momentum?:WaterMomentum) {
 const sigma=WATER_CELL*1.25;
 if(!momentum||![momentum.x,momentum.z,momentum.impulseY].every(Number.isFinite))return {x:0,z:0,sigma,increment:0,normalization:0,energy:0};
 let normalization=0,squared=0;
 for(let row=Math.max(0,Math.floor((momentum.z+4-3*sigma)/WATER_CELL));row<=Math.min(255,Math.ceil((momentum.z+4+3*sigma)/WATER_CELL));row++)for(let col=Math.max(0,Math.floor((momentum.x-3*sigma)/WATER_CELL));col<=Math.min(511,Math.ceil((momentum.x+3*sigma)/WATER_CELL));col++){
  const radial=(((col+.5)*WATER_CELL-momentum.x)**2+((row+.5)*WATER_CELL-4-momentum.z)**2)/sigma**2;
  const weight=radial<=9?Math.exp(-.5*radial):0;normalization+=weight*WATER_CELL**2;squared+=weight**2*WATER_CELL**2;
 }
 const velocity=normalization>0?momentum.impulseY/(WATER_DENSITY*WATER_PARTICIPATION_DEPTH*normalization):0;
 return {x:momentum.x,z:momentum.z,sigma,increment:velocity*WATER_DT,normalization,energy:.5*WATER_DENSITY*WATER_PARTICIPATION_DEPTH*velocity**2*squared};
}
export const dryFootprint = ():Footprint => ({x:0,z:0,y:1,radius:.075,depth:.009});
export function displaced(point:Footprint,x:number,z:number) {
 const angle=point.angle??0,dx=x-point.x,dz=z-point.z;
 const along=dx*Math.cos(angle)+dz*Math.sin(angle),across=(-dx*Math.sin(angle)+dz*Math.cos(angle))/(point.aspect??1);
 const weight=Math.sqrt(Math.max(0,1-(along/point.radius)**2-(across/point.radius)**2))*Math.exp(-Math.pow(Math.max(0,Math.abs(point.y)/point.depth-1)*1.5,6));
 return Math.max(0,Math.min(0,point.y+point.depth*weight)-Math.min(0,point.y-point.depth*weight));
}
export class CoherentWater {
 readonly targets=[0,1].map(()=>new THREE.WebGLRenderTarget(512,256,{type:THREE.FloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false}));
 readonly caustics=new THREE.WebGLRenderTarget(1024,512,{type:THREE.HalfFloatType,depthBuffer:false});
 private causticScene=new THREE.Scene();
 private causticMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,side:THREE.DoubleSide,uniforms:{state:{value:null}},vertexShader:`uniform sampler2D state;varying vec3 oldPos,newPos;void main(){vec4 info=texture2D(state,uv);vec3 normal=vec3(info.b,sqrt(max(.001,1.-dot(info.ba,info.ba))),info.a);vec3 light=normalize(vec3(-.15,-1.,.1));vec3 flatRay=refract(light,vec3(0.,1.,0.),1./1.333);vec3 ray=refract(light,normal,1./1.333);vec3 origin=vec3(uv.x*16.,0.,uv.y*8.-4.);oldPos=origin+flatRay*(-.65/flatRay.y);origin.y=info.r;newPos=origin+ray*((-.65-origin.y)/ray.y);gl_Position=vec4(newPos.x/8.-1.,newPos.z/4.,0.,1.);}`,fragmentShader:`varying vec3 oldPos,newPos;void main(){float oldArea=length(dFdx(oldPos))*length(dFdy(oldPos));float newArea=length(dFdx(newPos))*length(dFdy(newPos));gl_FragColor=vec4(clamp(oldArea/max(newArea,1e-9),0.,8.),0.,0.,1.);}`});
 private index=0;
 private scene=new THREE.Scene();
 private camera=new THREE.Camera();
 private material=new THREE.ShaderMaterial({uniforms:{state:{value:null},oldSource:{value:new THREE.Vector4()},newSource:{value:new THREE.Vector4()},depths:{value:new THREE.Vector2()},shapes:{value:new THREE.Vector4(1,0,1,0)},reaction:{value:new THREE.Vector4()},mode:{value:0}},vertexShader:'varying vec2 coord; void main(){coord=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
 varying vec2 coord; uniform sampler2D state; uniform vec4 oldSource,newSource,reaction; uniform vec2 depths; uniform vec4 shapes; uniform int mode;
 float volume(vec4 source,float depth,vec2 shape){vec2 point=coord*vec2(16.,8.)-vec2(0.,4.)-source.xy;float along=dot(point,vec2(cos(shape.y),sin(shape.y)));float across=dot(point,vec2(-sin(shape.y),cos(shape.y)))/shape.x;float radial=dot(vec2(along,across)/source.w,vec2(along,across)/source.w);float dy=depth*sqrt(max(0.,1.-radial))*exp(-pow(max(0.,abs(source.z)/depth-1.)*1.5,6.));float ymin=min(0.,source.z-dy);float ymax=min(0.,source.z+dy);return max(0.,ymax-ymin);}
 void main(){vec2 delta=vec2(1./512.,1./256.);vec4 info=texture2D(state,coord);
 if(mode==0){info.r+=volume(oldSource,depths.x,shapes.xy)-volume(newSource,depths.y,shapes.zw);vec2 offset=(coord*vec2(16.,8.)-vec2(0.,4.)-reaction.xy)/max(reaction.z,.0001);float radial=dot(offset,offset);if(radial<=9.)info.g+=reaction.w*exp(-.5*radial);}
 if(mode==1){float average=(texture2D(state,coord-vec2(delta.x,0.)).r+texture2D(state,coord+vec2(delta.x,0.)).r+texture2D(state,coord-vec2(0.,delta.y)).r+texture2D(state,coord+vec2(0.,delta.y)).r)*.25;info.g+=(average-info.r)*2.;info.g*=.995;info.r+=info.g;}
 if(mode==2){vec3 dx=vec3(16.*delta.x,texture2D(state,coord+vec2(delta.x,0.)).r-info.r,0.);vec3 dz=vec3(0.,texture2D(state,coord+vec2(0.,delta.y)).r-info.r,8.*delta.y);info.ba=normalize(cross(dz,dx)).xz;}
 gl_FragColor=info;}`});
 constructor(){this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));this.causticScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2,511,255),this.causticMaterial));}
 updateCaustics(renderer:THREE.WebGLRenderer){const target=renderer.getRenderTarget();this.causticMaterial.uniforms.state.value=this.texture;renderer.setRenderTarget(this.caustics);renderer.clear();renderer.render(this.causticScene,this.camera);renderer.setRenderTarget(target);}
 get texture(){return this.targets[this.index].texture;}
 dispose(){for(const target of this.targets)target.dispose();this.caustics.dispose();for(const scene of [this.scene,this.causticScene])scene.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});this.material.dispose();this.causticMaterial.dispose();}
 clear(renderer:THREE.WebGLRenderer){const target=renderer.getRenderTarget();const color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();renderer.setClearColor(0,0);for(const buffer of this.targets){renderer.setRenderTarget(buffer);renderer.clear();}renderer.setRenderTarget(target);renderer.setClearColor(color,alpha);this.index=0;}
 private pass(renderer:THREE.WebGLRenderer,mode:number){const target=renderer.getRenderTarget();this.material.uniforms.state.value=this.texture;this.material.uniforms.mode.value=mode;this.index=1-this.index;renderer.setRenderTarget(this.targets[this.index]);renderer.render(this.scene,this.camera);renderer.setRenderTarget(target);}
 step(renderer:THREE.WebGLRenderer,tick:WaterTick){
  const sources=[tick.old,tick.next].map(source=>{
   if(![source.x,source.z,source.y,source.radius,source.depth,source.aspect??1,source.angle??0].every(Number.isFinite)||source.radius<=0||source.depth<=0||(source.aspect??1)<=0)return dryFootprint();
   return source;
  });
  const [old,next]=sources;
  this.material.uniforms.oldSource.value.set(old.x,old.z,old.y,old.radius);
  this.material.uniforms.newSource.value.set(next.x,next.z,next.y,next.radius);
  this.material.uniforms.depths.value.set(old.depth,next.depth);
  this.material.uniforms.shapes.value.set(old.aspect??1,old.angle??0,next.aspect??1,next.angle??0);
  const reaction=momentumSource(tick.momentum);
  this.material.uniforms.reaction.value.set(reaction.x,reaction.z,reaction.sigma,reaction.increment);
  this.pass(renderer,0);this.pass(renderer,1);this.pass(renderer,2);
 }
 read(renderer:THREE.WebGLRenderer){const data=new Float32Array(512*256*4);renderer.readRenderTargetPixels(this.targets[this.index],0,0,512,256,data);return data;}
}
