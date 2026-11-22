import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { CoherentWater, FINE_GRID, type WaterGrid, type WaterTick } from './coherent';
import { SUN_DIRECTION } from './sunset-env';

export function createWater(grid:WaterGrid=FINE_GRID,churn:THREE.Texture|null=null){
 const {width,height:depth}=grid;
 const solver=new CoherentWater(grid);
 const state=solver.texture;
 const normals=new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);normals.needsUpdate=true;
 // State resolution and visible mesh resolution are independent. Keep the
 // original fine mesh for the calibration domain; cap the long-course mesh.
 const columns=Math.min(width,2048),rows=Math.min(depth,512);
 const axesX=[-200,-30,-5,-1,0,...Array.from({length:columns},(_,i)=>(i+.5)*grid.sizeX/columns),grid.sizeX,Math.max(200,grid.sizeX+1)];
 const half=grid.sizeZ/2;
 const outerZ=Math.max(200,half+2);
 const axesZ=[-outerZ,-half-1,-half,...Array.from({length:rows},(_,i)=>-half+(i+.5)*grid.sizeZ/rows),half,half+1,outerZ];
 const count=axesX.length*axesZ.length,positions=new Float32Array(count*3),normalsData=new Float32Array(count*3),indices=new Uint32Array((axesX.length-1)*(axesZ.length-1)*6);
 let cursor=0;
 for(let row=0;row<axesZ.length;row++)for(let col=0;col<axesX.length;col++){
  const vertex=row*axesX.length+col;positions[vertex*3]=axesX[col];positions[vertex*3+1]=-axesZ[row];normalsData[vertex*3+2]=1;
  if(row<axesZ.length-1&&col<axesX.length-1){const next=vertex+axesX.length;indices[cursor++]=vertex;indices[cursor++]=next;indices[cursor++]=vertex+1;indices[cursor++]=vertex+1;indices[cursor++]=next;indices[cursor++]=next+1;}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normalsData,3));geometry.setIndex(new THREE.BufferAttribute(indices,1));
 const mesh=new Water(geometry,{
  textureWidth:1024,textureHeight:1024,waterNormals:normals,
  sunDirection:SUN_DIRECTION.clone(),sunColor:0xffb066,waterColor:0x132531,
  distortionScale:.35,fog:false
 });
 mesh.rotation.x=-Math.PI/2;
 const material=mesh.material;
 const transmission=new THREE.WebGLRenderTarget(1024,1024,{depthTexture:new THREE.DepthTexture(1024,1024)});
 Object.assign(material.uniforms,{
  heightState:{value:state},
  churnMap:{value:churn},
  transmission:{value:transmission.texture},
  transmissionDepth:{value:transmission.depthTexture},
  cameraRange:{value:new THREE.Vector2(.01,180)},
  surfaceInspection:{value:0},
  domainSize:{value:new THREE.Vector2(grid.sizeX,grid.sizeZ)},
  uTime:{value:0},
 });
 const stateGLSL=`uniform sampler2D heightState;uniform vec2 domainSize;
 float localHeight(vec2 point){vec2 coord=vec2(point.x/domainSize.x,point.y/domainSize.y+.5);if(any(lessThan(coord,vec2(0.0)))||any(greaterThan(coord,vec2(1.0))))return 0.0;return texture2D(heightState,coord).r;}
 `;
 material.vertexShader=material.vertexShader
  .replace('void main() {',stateGLSL+'varying vec4 transmissionCoord;\nvoid main() {\nvec3 displaced=position; displaced.z=localHeight(vec2(position.x,-position.y));')
  .replaceAll('vec4( position, 1.0 )','vec4( displaced, 1.0 )')
  .replace('gl_Position = projectionMatrix * mvPosition;','gl_Position = projectionMatrix * mvPosition; transmissionCoord=gl_Position;');
 material.fragmentShader=material.fragmentShader
  .replace('void main() {',stateGLSL+`
 float surfaceGrain(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  vec4 k=vec4(0.,1.,127.,128.)+i.x+127.*i.y;
  vec4 h=fract(sin(mod(k,8192.))*4375.47);
  return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
 }
 vec2 breezeSlope(vec2 p, float t){
  // Very subtle twilight wind micro-ripples (visual only, muted during surfaceInspection)
  float w1 = sin(p.x*2.4 + p.y*1.7 + t*1.15) * 0.5 + cos(p.x*1.5 - p.y*2.9 + t*0.85) * 0.5;
  float w2 = sin(p.x*6.3 - p.y*4.8 - t*1.85) * 0.5 + cos(p.x*4.9 + p.y*6.1 + t*1.45) * 0.5;
  float g1 = cos(p.x*2.4 + p.y*1.7 + t*1.15) * 1.2 - sin(p.x*1.5 - p.y*2.9 + t*0.85) * 0.75;
  float g2 = cos(p.x*2.4 + p.y*1.7 + t*1.15) * 0.85 + sin(p.x*1.5 - p.y*2.9 + t*0.85) * 1.45;
  return vec2(g1 + w2*0.6, g2 - w1*0.55) * 0.0042;
 }
 `+'uniform mat4 textureMatrix; uniform sampler2D churnMap; uniform sampler2D transmission; uniform sampler2D transmissionDepth; uniform vec2 cameraRange; uniform float surfaceInspection; uniform float uTime; varying vec4 transmissionCoord;\nvoid main() {')
  .replace('vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );',`vec2 spacing=vec2(${grid.dx},${grid.dz});
 vec2 point=worldPosition.xz;
 vec2 gradient=vec2(localHeight(point+vec2(spacing.x,0.0))-localHeight(point-vec2(spacing.x,0.0)),localHeight(point+vec2(0.0,spacing.y))-localHeight(point-vec2(0.0,spacing.y)))/(2.0*spacing);
 vec2 calmWind=breezeSlope(point,uTime)*(1.0-surfaceInspection);
 vec3 surfaceNormal=normalize(vec3(-(gradient.x+calmWind.x),1.0,-(gradient.y+calmWind.y)));`)
  .replace('mirrorCoord.xy / mirrorCoord.w + distortion','reflectionUV')
  .replace('vec3 reflectionSample =',`vec4 ray=textureMatrix*vec4(reflect(-eyeDirection,surfaceNormal),0.0);
 vec2 reflectionUV=ray.w>0.001?clamp(ray.xy/ray.w,vec2(.001),vec2(.999)):mirrorCoord.xy/mirrorCoord.w;
 vec3 reflectionSample =`)
  .replace('float rf0 = 0.3;','float rf0 = 0.0204;')
  .replace('sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );',`vec3 halfDirection=normalize(sunDirection+eyeDirection);
 float viewCosine=max(dot(surfaceNormal,eyeDirection),.001);
 float lightCosine=max(dot(surfaceNormal,sunDirection),0.0);
 float halfCosine=max(dot(surfaceNormal,halfDirection),0.0);
 float sunFresnel=.0204+.9796*pow(1.0-max(dot(eyeDirection,halfDirection),0.0),5.0);
 // Dual-lobe sunset specular: sharp golden glitter + warm broad sheen on wave slopes
 float tightCore=420.0/(2.0*3.14159265)*pow(halfCosine,420.0);
 float warmSheen=44.0/(2.0*3.14159265)*pow(halfCosine,44.0);
 float masking=min(1.0,min(2.0*halfCosine*viewCosine/max(dot(eyeDirection,halfDirection),.001),2.0*halfCosine*lightCosine/max(dot(eyeDirection,halfDirection),.001)));
 float geom=sunFresnel*masking/(4.0*viewCosine)*step(.001,lightCosine);
 specularLight=(vec3(1.28,0.82,0.44)*tightCore*0.24 + sunColor*warmSheen*0.11)*geom;`)
  .replace('vec3 outgoingLight = albedo;',`vec2 screenUV=transmissionCoord.xy/transmissionCoord.w*.5+.5;
 vec2 bend=(mat3(viewMatrix)*(surfaceNormal-vec3(0.,1.,0.))).xy;
 vec2 refractedUV=clamp(screenUV-bend*.06,vec2(.001),vec2(.999));
 vec3 transmitted=texture2D(transmission,refractedUV).rgb;
 float bedDepth=texture2D(transmissionDepth,refractedUV).r;
 float bedDistance=cameraRange.x*cameraRange.y/(cameraRange.y-bedDepth*(cameraRange.y-cameraRange.x));
 float surfaceDistance=cameraRange.x*cameraRange.y/(cameraRange.y-gl_FragCoord.z*(cameraRange.y-cameraRange.x));
 float depth=clamp(bedDistance-surfaceDistance,0.0,8.0);
 vec3 absorption=exp(-vec3(2.9,1.7,1.45)*depth);
 vec3 waterScatter=vec3(.011,.026,.038);
 vec3 bed=transmitted*absorption+waterScatter*(1.0-absorption);
 bed=mix(bed,waterScatter,surfaceInspection);
 vec2 wetUV=vec2(point.x/domainSize.x,point.y/domainSize.y+.5);
 float opticalDepth=0.;
 if(all(greaterThanEqual(wetUV,vec2(0.)))&&all(lessThanEqual(wetUV,vec2(1.))))opticalDepth=texture2D(churnMap,wetUV).r;
 // Crisp Fresnel reflection blending cool twilight sky & warm sunset glow
 vec3 outgoingLight=mix(bed,reflectionSample,reflectance)+specularLight;
 if(opticalDepth>.002){
  float coarse=surfaceGrain(point*27.+.8*gradient);
  float detail=surfaceGrain(point*91.+coarse*2.);
  float breakup=smoothstep(.04,.95,.66*coarse+.34*detail);
  float coverage=(1.-exp(-opticalDepth*(.55+1.85*breakup)))*(.26+.74*breakup);
  float sunCatch=0.35+0.65*pow(max(0.0,dot(surfaceNormal,sunDirection)),0.7);
  vec3 foamColor=mix(vec3(0.34,0.34,0.42),vec3(1.04,0.74,0.52),sunCatch);
  outgoingLight=mix(outgoingLight,foamColor,coverage*.78);
 }
 // Soft atmospheric horizon blend over distant lake
 float viewDist=length(cameraPosition-worldPosition.xyz);
 float horizonFog=smoothstep(34.0,152.0,viewDist)*(1.0-surfaceInspection);
 vec3 fogCol=mix(vec3(0.49,0.32,0.32),vec3(0.84,0.49,0.32),pow(max(0.0,dot(-eyeDirection,sunDirection)),2.2));
 outgoingLight=mix(outgoingLight,fogCol,horizonFog*0.86);`);
 const reflection=mesh.onBeforeRender;
 mesh.onBeforeRender=function(renderer,scene,camera,geometry,material,group){
  reflection.call(this,renderer,scene,camera,geometry,material,group);
  const target=renderer.getRenderTarget();const visible=mesh.visible;mesh.visible=false;
  renderer.setRenderTarget(transmission);renderer.clear();renderer.render(scene,camera);
  renderer.setRenderTarget(target);mesh.visible=visible;
 };
 let generation=-1;
 return {
  mesh,solver,
  setTime(time:number){material.uniforms.uTime.value=time;},
  update(renderer:THREE.WebGLRenderer,ticks:WaterTick[],version:number){
   const changed=version!==generation||ticks.length>0;
   if(version!==generation){solver.clear(renderer);generation=version;}
   for(const tick of ticks)solver.step(renderer,tick,false);
   if(changed){solver.updateNormals(renderer);solver.updateCaustics(renderer);}
   ticks.length=0;
   material.uniforms.heightState.value=solver.texture;
  }
 };
}
