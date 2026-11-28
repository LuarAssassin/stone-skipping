import * as THREE from 'three';
import {FINE_GRID,validFootprint,interpolateFootprint,displacementScale,displacedRim,momentumSource,slipSources,sweptPressure,reactionFraction,type WaterGrid,type Footprint,type WaterTick} from '../simulation/water-grid';
export * from '../simulation/water-grid';

export interface CoherentWaterOptions {
 targetType?: THREE.TextureDataType;
 causticWidth?: number;
 causticHeight?: number;
}

export class CoherentWater {
 readonly targets:THREE.WebGLRenderTarget[];
 readonly caustics:THREE.WebGLRenderTarget;
 private causticScene=new THREE.Scene();
 private causticMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,side:THREE.DoubleSide,uniforms:{state:{value:null},domainSize:{value:new THREE.Vector2()}},vertexShader:`uniform sampler2D state;uniform vec2 domainSize;varying vec3 oldPos,newPos;void main(){vec4 info=texture2D(state,uv);vec3 normal=vec3(info.b,sqrt(max(.001,1.-dot(info.ba,info.ba))),info.a);vec3 light=normalize(vec3(.45,-.82,.35));vec3 flatRay=refract(light,vec3(0.,1.,0.),1./1.333);vec3 ray=refract(light,normal,1./1.333);vec3 origin=vec3(uv.x*domainSize.x,0.,(uv.y-.5)*domainSize.y);oldPos=origin+flatRay*(-.65/flatRay.y);origin.y=info.r;newPos=origin+ray*((-.65-origin.y)/ray.y);gl_Position=vec4(newPos.x/domainSize.x*2.-1.,newPos.z/domainSize.y*2.,0.,1.);}`,fragmentShader:`varying vec3 oldPos,newPos;void main(){float oldArea=length(dFdx(oldPos))*length(dFdy(oldPos));float newArea=length(dFdx(newPos))*length(dFdy(newPos));gl_FragColor=vec4(clamp(oldArea/max(newArea,1e-9),0.,8.),0.,0.,1.);}`});
 private index=0;
 private scene=new THREE.Scene();
 private camera=new THREE.Camera();
 private scaleCache=new Map<string,number>();
 private material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{state:{value:null},resolution:{value:new THREE.Vector2()},domainSize:{value:new THREE.Vector2()},coefficients:{value:new THREE.Vector3()},viscosity:{value:new THREE.Vector2()},slip:{value:[new THREE.Vector4(),new THREE.Vector4()]},oldSource:{value:new THREE.Vector4()},newSource:{value:new THREE.Vector4()},depths:{value:new THREE.Vector2()},shapes:{value:new THREE.Vector4(1,0,1,0)},scales:{value:new THREE.Vector2()},rimScales:{value:new THREE.Vector2()},reaction:{value:new THREE.Vector4()},reactionEnd:{value:new THREE.Vector4()},dropReactions:{value:Array.from({length:4},()=>new THREE.Vector4())},dropCount:{value:0},mode:{value:0}},vertexShader:'varying vec2 coord; void main(){coord=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
 uniform sampler2D state;uniform vec2 domainSize,resolution,depths,scales,rimScales;uniform vec4 reactionEnd;uniform vec3 coefficients;uniform vec4 oldSource,newSource,shapes,reaction;uniform int mode;uniform vec4 dropReactions[4],slip[2];uniform vec2 viscosity;uniform int dropCount;
 float volumePoint(vec2 uv,vec4 source,float depth,vec2 shape){
  vec2 p=uv*domainSize-vec2(0.,domainSize.y*.5)-source.xy;
  if(abs(p.x)>source.w*max(1.,shape.x)||abs(p.y)>source.w*max(1.,shape.x)||abs(source.z)>depth*3.)return 0.;
  vec2 local=vec2(dot(p,vec2(cos(shape.y),sin(shape.y))),dot(p,vec2(-sin(shape.y),cos(shape.y)))/shape.x)/source.w;
  float radial=dot(local,local);if(radial>=1.)return 0.;
  float dy=depth*sqrt(1.-radial)*exp(-pow(max(0.,abs(source.z)/depth-1.)*1.5,6.));
  return max(0.,min(0.,source.z+dy)-min(0.,source.z-dy));
 }
 float volumeCell(vec2 uv,vec4 source,float depth,vec2 shape){
  vec2 d=.2886751345948129/resolution;
  return .25*(volumePoint(uv+d,source,depth,shape)+volumePoint(uv-d,source,depth,shape)+volumePoint(uv+vec2(d.x,-d.y),source,depth,shape)+volumePoint(uv+vec2(-d.x,d.y),source,depth,shape));
 }
 float displacedSurface(vec2 uv,vec4 source,float depth,vec2 shape,float scale,float rimScale){
  if(scale==0.&&rimScale==0.)return 0.;
  vec2 offset=uv*domainSize-vec2(0.,domainSize.y*.5)-source.xy;
  if(any(greaterThan(abs(offset),vec2(source.w*2.*max(1.,shape.x))+domainSize/resolution)))return 0.;
  vec4 rim=source;rim.w*=2.;
  return (rimScale*.25*volumeCell(uv,rim,depth,shape)-scale*volumeCell(uv,source,depth,shape))*(4./3.);
 }
 float change(vec2 uv){
  if(mode!=3)return 0.;
  return displacedSurface(uv,newSource,depths.y,shapes.zw,scales.y,rimScales.y)-displacedSurface(uv,oldSource,depths.x,shapes.xy,scales.x,rimScales.x);
 }
 vec2 waveAt(vec2 uv){
  vec2 wave=texture2D(state,uv).rg;
  wave.x+=change(clamp(uv,vec2(.5)/resolution,vec2(1.)-vec2(.5)/resolution));return wave;
 }
 float injected(vec4 source){
  vec2 d=(gl_FragCoord.xy-source.xy)*(domainSize/resolution)/source.z;
  float r2=dot(d,d);return r2<=9.?source.w*exp(-.5*r2):0.;
 }
 void main(){
  vec2 coord=gl_FragCoord.xy/resolution;vec2 delta=1./resolution;vec4 info=texture2D(state,coord);
  float oldVelocity=info.g;
  if(mode==0||mode==3){
   if(mode==0)info.r+=scales.x*volumeCell(coord,oldSource,depths.x,shapes.xy)-scales.y*volumeCell(coord,newSource,depths.y,shapes.zw);
   else info.r+=change(coord);
   if(reaction.w!=0.)info.g+=injected(reaction);
   if(reactionEnd.w!=0.)info.g+=injected(reactionEnd);
   if(slip[0].w!=0.||slip[1].w!=0.)info.g+=injected(slip[0])+injected(slip[1]);
  }
  if(mode==3){
   for(int i=0;i<4;i++){
    if(i>=dropCount)break;
    vec4 d=dropReactions[i];vec2 offset=(gl_FragCoord.xy-d.xy)*(domainSize/resolution)/d.z;
    if(all(lessThan(abs(offset),vec2(3.)))){float r2=dot(offset,offset);if(r2<=9.)info.g+=d.w*exp(-.5*r2);}
   }
  }
  if(mode==1||mode==3){
   vec2 center=vec2(info.r,oldVelocity);
   vec2 lapX=waveAt(coord-vec2(delta.x,0.))+waveAt(coord+vec2(delta.x,0.))-2.*center;
   vec2 lapZ=waveAt(coord-vec2(0.,delta.y))+waveAt(coord+vec2(0.,delta.y))-2.*center;
   info.g=(info.g+dot(coefficients.xy,vec2(lapX.x,lapZ.x))+dot(viscosity,vec2(lapX.y,lapZ.y)))*coefficients.z;
   info.r+=info.g;
  }
  if(mode==2){
   vec3 dx=vec3(domainSize.x*delta.x,texture2D(state,coord+vec2(delta.x,0.)).r-info.r,0.);
   vec3 dz=vec3(0.,texture2D(state,coord+vec2(0.,delta.y)).r-info.r,domainSize.y*delta.y);
   info.ba=normalize(cross(dz,dx)).xz;
  }
  gl_FragColor=info;
 }`});
 constructor(readonly grid:WaterGrid=FINE_GRID, options:CoherentWaterOptions={}){
  const targetType=options.targetType??THREE.FloatType;
  const causticWidth=options.causticWidth??1024;
  const causticHeight=options.causticHeight??512;
  this.caustics=new THREE.WebGLRenderTarget(causticWidth,causticHeight,{type:THREE.HalfFloatType,depthBuffer:false});
  this.targets=[0,1].map(()=>new THREE.WebGLRenderTarget(grid.width,grid.height,{type:targetType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false}));
  this.material.uniforms.resolution.value.set(grid.width,grid.height);
  this.material.uniforms.domainSize.value.set(grid.sizeX,grid.sizeZ);
  this.causticMaterial.uniforms.domainSize.value.set(grid.sizeX,grid.sizeZ);
  this.material.uniforms.coefficients.value.set(grid.wx,grid.wz,grid.damping);
  // Effective surface viscosity preferentially damps the shortest grid waves.
  const inverseDxSquared=1/grid.dx**2,inverseDzSquared=1/grid.dz**2;
  const stableDiffusion=.48*(1-grid.cfl**2)/(inverseDxSquared+inverseDzSquared);
  const diffusion=Math.min(.0018*grid.dt,stableDiffusion);
  this.material.uniforms.viscosity.value.set(diffusion*inverseDxSquared,diffusion*inverseDzSquared);
  this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));
  this.causticScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2,Math.max(31,Math.floor(causticWidth/2)-1),Math.max(15,Math.floor(causticHeight/2)-1)),this.causticMaterial));
 }
 updateCaustics(renderer:THREE.WebGLRenderer){const target=renderer.getRenderTarget();this.causticMaterial.uniforms.state.value=this.texture;renderer.setRenderTarget(this.caustics);renderer.clear();renderer.render(this.causticScene,this.camera);renderer.setRenderTarget(target);}
 get texture(){return this.targets[this.index].texture;}
 dispose(){for(const target of this.targets)target.dispose();this.caustics.dispose();for(const scene of [this.scene,this.causticScene])scene.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});this.material.dispose();this.causticMaterial.dispose();this.scaleCache.clear();}
 clear(renderer:THREE.WebGLRenderer){const target=renderer.getRenderTarget();const color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();renderer.setClearColor(0,0);for(const buffer of this.targets){renderer.setRenderTarget(buffer);renderer.clear();}renderer.setRenderTarget(target);renderer.setClearColor(color,alpha);this.index=0;this.scaleCache.clear();}
 private pass(renderer:THREE.WebGLRenderer,mode:number){const target=renderer.getRenderTarget();this.material.uniforms.state.value=this.texture;this.material.uniforms.mode.value=mode;this.index=1-this.index;renderer.setRenderTarget(this.targets[this.index]);renderer.render(this.scene,this.camera);renderer.setRenderTarget(target);}
 private scale(p:Footprint){
  const key=[p.x,p.z,p.y,p.radius,p.depth,p.aspect??1,p.angle??0].join(',');
  const found=this.scaleCache.get(key);if(found!==undefined)return found;
  const value=displacementScale(p,this.grid);if(this.scaleCache.size>=64)this.scaleCache.delete(this.scaleCache.keys().next().value!);this.scaleCache.set(key,value);return value;
 }
 updateNormals(renderer:THREE.WebGLRenderer){this.pass(renderer,2);}
 step(renderer:THREE.WebGLRenderer,tick:WaterTick,updateNormals=true){
  const old=validFootprint(tick.old),next=validFootprint(tick.next),n=this.grid.substeps;
  for(let i=0;i<n;i++){
   const a=interpolateFootprint(old,next,i/n),b=interpolateFootprint(old,next,(i+1)/n);
   this.material.uniforms.oldSource.value.set(a.x,a.z,a.y,a.radius);this.material.uniforms.newSource.value.set(b.x,b.z,b.y,b.radius);
   this.material.uniforms.depths.value.set(a.depth,b.depth);this.material.uniforms.shapes.value.set(a.aspect??1,a.angle??0,b.aspect??1,b.angle??0);
   this.material.uniforms.scales.value.set(this.scale(a),this.scale(b));
   this.material.uniforms.rimScales.value.set(this.scale(displacedRim(a)),this.scale(displacedRim(b)));
   const pressure=sweptPressure(tick,i,n),m=pressure?.center;
   const travel=pressure?Math.hypot(pressure.dx,pressure.dz):0;
   // Two-point Gauss quadrature keeps a fast skim continuous along its wet path.
   const split=!!m&&travel>.5*Math.min(this.grid.dx,this.grid.dz);
   const offset=.5/Math.sqrt(3);
   for(const [k,name] of ['reaction','reactionEnd'].entries()){
    const value=this.material.uniforms[name].value;
    if(!m||!pressure||(!split&&k===1)){value.set(0,0,1,0);continue;}
    const t=split?(k===0?-offset:offset):0;
    const source=momentumSource({...m,x:m.x+t*pressure.dx,z:m.z+t*pressure.dz,impulseY:m.impulseY/(split?2:1)},this.grid,this.grid.dt,true);
    value.set(source.x/this.grid.dx,(source.z+this.grid.sizeZ/2)/this.grid.dz,source.sigma,source.increment);
   }
   const slip=m?slipSources(m,this.grid,travel):[];
   for(let k=0;k<2;k++){
    const source=slip[k],uniform=this.material.uniforms.slip.value[k];
    if(source)uniform.set(source.x/this.grid.dx,(source.z+this.grid.sizeZ/2)/this.grid.dz,source.sigma,source.increment);
    else uniform.set(0,0,1,0);
   }
   const impacts=tick.impacts??[];
   this.material.uniforms.dropCount.value=Math.min(4,impacts.length);
   for(let k=0;k<Math.min(4,impacts.length);k++){
    const d=impacts[k],fraction=reactionFraction(d,i,n);
    const source=momentumSource({...d,impulseY:d.impulseY*fraction},this.grid,this.grid.dt,true);
    this.material.uniforms.dropReactions.value[k].set(source.x/this.grid.dx,(source.z+this.grid.sizeZ/2)/this.grid.dz,source.sigma,source.increment);
   }
   this.pass(renderer,3);
  }
  if(updateNormals)this.updateNormals(renderer);
 }
 read(renderer:THREE.WebGLRenderer){const data=new Float32Array(this.grid.width*this.grid.height*4);renderer.readRenderTargetPixels(this.targets[this.index],0,0,this.grid.width,this.grid.height,data);return data;}
}
