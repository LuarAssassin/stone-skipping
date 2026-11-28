import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { CoherentWater, FINE_GRID, type CoherentWaterOptions, type WaterGrid, type WaterTick } from './coherent';
import { SUN_DIRECTION } from './sunset-env';
import { themeSunDirection, type SceneTheme } from './themes';
import type { WeatherPreset } from './weather';
import { MAX_RIPPLE_PACKETS, RIPPLE_LIFETIME, type RipplePacket } from '../simulation/ripples';

export interface WaterQualityOptions extends CoherentWaterOptions {
 reflectionSize?: number;
 transmissionSize?: number;
 maxMeshColumns?: number;
 maxMeshRows?: number;
}

function buildWaterGeometry(grid: WaterGrid, options: WaterQualityOptions) {
 const {width,height:depth}=grid;
 // State resolution and visible mesh resolution are independent. Keep the
 // original fine mesh for the calibration domain; cap the long-course mesh.
 const columns=Math.min(width,options.maxMeshColumns??2048),rows=Math.min(depth,options.maxMeshRows??512);
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
 return geometry;
}

export function createWater(grid:WaterGrid=FINE_GRID,churn:THREE.Texture|null=null,options:WaterQualityOptions={}){
 let solver=new CoherentWater(grid,options);
 const normals=new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);normals.needsUpdate=true;

 // 48 × 2 RGBA32F table packing active physical Contact dispersive ripple packets
 const rippleBuffer=new Float32Array(MAX_RIPPLE_PACKETS*2*4);
 const rippleTexture=new THREE.DataTexture(rippleBuffer,MAX_RIPPLE_PACKETS,2,THREE.RGBAFormat,THREE.FloatType);
 rippleTexture.minFilter=THREE.NearestFilter;
 rippleTexture.magFilter=THREE.NearestFilter;
 rippleTexture.generateMipmaps=false;
 rippleTexture.needsUpdate=true;

 const reflectionSize=options.reflectionSize??1024;
 const transmissionSize=options.transmissionSize??1024;
 const mesh=new Water(buildWaterGeometry(grid,options),{
  textureWidth:reflectionSize,textureHeight:reflectionSize,waterNormals:normals,
  sunDirection:SUN_DIRECTION.clone(),sunColor:0xffb066,waterColor:0x132531,
  distortionScale:.35,fog:false
 });
 mesh.rotation.x=-Math.PI/2;
 const material=mesh.material;
 const transmission=new THREE.WebGLRenderTarget(transmissionSize,transmissionSize,{depthTexture:new THREE.DepthTexture(transmissionSize,transmissionSize)});
 Object.assign(material.uniforms,{
  heightState:{value:solver.texture},
  gridSpacing:{value:new THREE.Vector2(grid.dx,grid.dz)},
  fieldStrength:{value:1},
  churnMap:{value:churn},
  transmission:{value:transmission.texture},
  transmissionDepth:{value:transmission.depthTexture},
  cameraRange:{value:new THREE.Vector2(.01,180)},
  surfaceInspection:{value:0},
  domainSize:{value:new THREE.Vector2(grid.sizeX,grid.sizeZ)},
  uTime:{value:0},
  rippleData:{value:rippleTexture},
  rippleCount:{value:0},
  rippleTime:{value:0},
  uWaterScatter:{value:new THREE.Vector3(0.011,0.026,0.038)},
  uRimCatch:{value:new THREE.Vector3(0.42,0.25,0.13)},
  uFoamDark:{value:new THREE.Vector3(0.34,0.34,0.42)},
  uFoamLit:{value:new THREE.Vector3(1.04,0.74,0.52)},
  uFogBase:{value:new THREE.Vector3(0.49,0.32,0.32)},
  uFogSun:{value:new THREE.Vector3(0.84,0.49,0.32)},
  uRainIntensity:{value:0},
  uBreezeScale:{value:1},
  uFogRange:{value:new THREE.Vector2(34.0,152.0)},
 });

 const localHeightGLSL=`uniform sampler2D heightState;uniform vec2 domainSize;uniform float fieldStrength;
 float localHeight(vec2 point){if(fieldStrength<=0.0)return 0.0;vec2 coord=vec2(point.x/domainSize.x,point.y/domainSize.y+.5);if(any(lessThan(coord,vec2(0.0)))||any(greaterThan(coord,vec2(1.0))))return 0.0;return texture2D(heightState,coord).r*fieldStrength;}`;
 const rippleGLSL=localHeightGLSL+`uniform vec2 gridSpacing;
 uniform sampler2D rippleData;uniform int rippleCount;uniform float rippleTime;uniform float surfaceInspection;
 uniform vec3 uWaterScatter,uRimCatch,uFoamDark,uFoamLit,uFogBase,uFogSun;
 uniform float uRainIntensity,uBreezeScale;uniform vec2 uFogRange;
 // Cauchy-Poisson deep-water dispersive multi-ring wave packets driven by real Contact impulses.
 // Returns vec3(height, dh/dx, dh/dz) analytically with zero grid aliasing.
 vec3 dispersiveRipples(vec2 point){
  if(rippleCount<=0||surfaceInspection>0.5)return vec3(0.0);
  float totalH=0.0;vec2 totalG=vec2(0.0);
  float invCount=1.0/${MAX_RIPPLE_PACKETS.toFixed(1)};
  for(int i=0;i<${MAX_RIPPLE_PACKETS};i++){
   if(i>=rippleCount)break;
   float u=(float(i)+0.5)*invCount;
   vec4 p0=texture2D(rippleData,vec2(u,0.25));
   float tau=rippleTime-p0.z;
   if(tau<=0.001||tau>=${RIPPLE_LIFETIME.toFixed(1)})continue;
   vec4 p1=texture2D(rippleData,vec2(u,0.75));
   vec2 rel=point-p0.xy;
   float leadRadius=p1.w*1.48*tau+0.12;
   if(abs(rel.x)>leadRadius+0.35||abs(rel.y)>leadRadius+0.35)continue;
   float dist=length(rel);
   if(dist>leadRadius+0.35)continue;
   vec2 dir=p1.xy;
   float forwardBias=p1.z;
   float sweep=0.095*(forwardBias/0.44);
   float along=dot(rel,dir);
   vec2 q=rel-clamp(along,-sweep,sweep)*dir;
   float qDist=length(q);
   float r=sqrt(qDist*qDist+0.001024);
   vec2 radialDir=q/r;
   float tEff=tau+0.11;
   float rEff=r+0.038;
   float phase=(9.81*tEff*tEff)/(4.0*rEff);
   float k=phase/rEff;
   float viscous=exp(-0.000095*k*k*tEff);
   float front=smoothstep(leadRadius,max(0.0,leadRadius-(0.14+0.36*leadRadius)),r);
   float birthFade=smoothstep(0.0,0.045,tau);
   float decay=exp(-0.24*tau)*smoothstep(${RIPPLE_LIFETIME.toFixed(1)},${(RIPPLE_LIFETIME-1.2).toFixed(1)},tau);
   float spread=inversesqrt(1.0+2.4*r);
   float cosTheta=dist>0.005?along/dist:0.0;
   float dirWeight=1.0+forwardBias*cosTheta;
   float env=p0.w*dirWeight*viscous*front*birthFade*decay*spread;
   if(env<1e-6)continue;
   totalH+=env*sin(phase);
   float dHdr=-env*k*cos(phase)*(qDist/r);
   totalG+=dHdr*radialDir;
  }
  return vec3(totalH,totalG);
 }
 `;

 material.vertexShader=material.vertexShader
  .replace('void main() {',localHeightGLSL+'\nvarying vec4 transmissionCoord;\nvoid main() {\nvec2 wPt=vec2(position.x,-position.y); vec3 displaced=position; displaced.z=localHeight(wPt);')
  .replaceAll('vec4( position, 1.0 )','vec4( displaced, 1.0 )')
  .replace('gl_Position = projectionMatrix * mvPosition;','gl_Position = projectionMatrix * mvPosition; transmissionCoord=gl_Position;');
 material.fragmentShader=material.fragmentShader
  .replace('void main() {',rippleGLSL+`
 float surfaceGrain(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  vec4 k=vec4(0.,1.,127.,128.)+i.x+127.*i.y;
  vec4 h=fract(sin(mod(k,8192.))*4375.47);
  return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
 }
 vec2 breezeSlope(vec2 p, float t){
  // Whisper-quiet glassy lake breeze so expanding stone ripples stand out clearly
  float w1 = sin(p.x*2.4 + p.y*1.7 + t*1.15) * 0.5 + cos(p.x*1.5 - p.y*2.9 + t*0.85) * 0.5;
  float w2 = sin(p.x*6.3 - p.y*4.8 - t*1.85) * 0.5 + cos(p.x*4.9 + p.y*6.1 + t*1.45) * 0.5;
  float g1 = cos(p.x*2.4 + p.y*1.7 + t*1.15) * 1.2 - sin(p.x*1.5 - p.y*2.9 + t*0.85) * 0.75;
  float g2 = cos(p.x*2.4 + p.y*1.7 + t*1.15) * 0.85 + sin(p.x*1.5 - p.y*2.9 + t*0.85) * 1.45;
  return vec2(g1 + w2*0.6, g2 - w1*0.55) * (0.0015 * uBreezeScale);
 }
 vec2 rainLayerSlope(vec2 p, float t, float scale, float speed){
  vec2 sp = p * scale;
  vec2 cell = floor(sp);
  vec2 f = fract(sp);
  vec2 acc = vec2(0.0);
  for(int oy=-1;oy<=1;oy++){
   for(int ox=-1;ox<=1;ox++){
    vec2 c = cell + vec2(float(ox), float(oy));
    float h1 = fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
    float h2 = fract(sin(dot(c, vec2(269.5, 183.3))) * 43758.5453);
    float cycle = t * speed + h1 * 6.2831;
    float age = fract(cycle);
    float id = floor(cycle);
    vec2 jitter = vec2(
     fract(sin(dot(c + id * 1.37, vec2(41.2, 89.7))) * 43758.5453),
     fract(sin(dot(c + id * 2.19, vec2(73.4, 29.1))) * 43758.5453)
    );
    vec2 center = vec2(float(ox), float(oy)) + 0.16 + jitter * 0.68;
    vec2 rel = f - center;
    float dist = length(rel);
    float radius = age * 0.58;
    float band = dist - radius;
    float env = exp(-band * band * 260.0) * (1.0 - age) * smoothstep(0.0, 0.08, age);
    if(env > 0.002 && dist > 0.004){
     float wave = sin(band * 46.0) * env;
     acc += (rel / dist) * wave * (0.45 + 0.55 * h2);
    }
   }
  }
  return acc;
 }
 vec2 rainRippleSlope(vec2 p, float t, float distToCam){
  if(uRainIntensity <= 0.01) return vec2(0.0);
  float lod = 1.0 - smoothstep(14.0, 48.0, distToCam);
  if(lod <= 0.005) return vec2(0.0);
  vec2 r1 = rainLayerSlope(p, t, 1.45, 0.95);
  vec2 r2 = rainLayerSlope(p + vec2(17.3, 9.1), t + 0.43, 2.35, 1.30);
  return (r1 * 0.65 + r2 * 0.45) * (0.048 * uRainIntensity * lod);
 }
 `+'uniform mat4 textureMatrix; uniform sampler2D churnMap; uniform sampler2D transmission; uniform sampler2D transmissionDepth; uniform vec2 cameraRange; uniform float uTime; varying vec4 transmissionCoord;\nvoid main() {')
  .replace('vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );',`vec2 spacing=gridSpacing;
 vec2 point=worldPosition.xz;
 float camDistNow=length(cameraPosition-worldPosition.xyz);
 vec2 gradient=vec2(localHeight(point+vec2(spacing.x,0.0))-localHeight(point-vec2(spacing.x,0.0)),localHeight(point+vec2(0.0,spacing.y))-localHeight(point-vec2(0.0,spacing.y)))/(2.0*spacing);
 vec3 ripple=dispersiveRipples(point);
 vec2 calmWind=breezeSlope(point,uTime)*(1.0-surfaceInspection);
 vec2 rainSlope=rainRippleSlope(point,uTime,camDistNow)*(1.0-surfaceInspection);
 vec2 totalSlope=gradient+ripple.yz+calmWind+rainSlope;
 vec3 surfaceNormal=normalize(vec3(-totalSlope.x,1.0,-totalSlope.y));`)
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
 // Dual-lobe sunset specular: sharp golden glitter + warm broad sheen along expanding ripple crests
 float tightCore=380.0/(2.0*3.14159265)*pow(halfCosine,380.0);
 float warmSheen=36.0/(2.0*3.14159265)*pow(halfCosine,36.0);
 float masking=min(1.0,min(2.0*halfCosine*viewCosine/max(dot(eyeDirection,halfDirection),.001),2.0*halfCosine*lightCosine/max(dot(eyeDirection,halfDirection),.001)));
 float geom=sunFresnel*masking/(4.0*viewCosine)*step(.001,lightCosine);
 specularLight=(vec3(1.30,0.84,0.45)*tightCore*0.24 + sunColor*warmSheen*0.14)*geom;`)
  .replace('vec3 outgoingLight = albedo;',`vec2 screenUV=transmissionCoord.xy/transmissionCoord.w*.5+.5;
 vec2 bend=(mat3(viewMatrix)*(surfaceNormal-vec3(0.,1.,0.))).xy;
 vec2 refractedUV=clamp(screenUV-bend*.06,vec2(.001),vec2(.999));
 vec3 transmitted=texture2D(transmission,refractedUV).rgb;
 float bedDepth=texture2D(transmissionDepth,refractedUV).r;
 float bedDistance=cameraRange.x*cameraRange.y/(cameraRange.y-bedDepth*(cameraRange.y-cameraRange.x));
 float surfaceDistance=cameraRange.x*cameraRange.y/(cameraRange.y-gl_FragCoord.z*(cameraRange.y-cameraRange.x));
 float depth=clamp(bedDistance-surfaceDistance,0.0,8.0);
 vec3 absorption=exp(-vec3(2.9,1.7,1.45)*depth);
 vec3 waterScatter=uWaterScatter;
 vec3 bed=transmitted*absorption+waterScatter*(1.0-absorption);
 bed=mix(bed,waterScatter,surfaceInspection);
 vec2 wetUV=vec2(point.x/domainSize.x,point.y/domainSize.y+.5);
 float opticalDepth=0.;
 if(all(greaterThanEqual(wetUV,vec2(0.)))&&all(lessThanEqual(wetUV,vec2(1.))))opticalDepth=texture2D(churnMap,wetUV).r;
 // Crisp Fresnel reflection blending active theme sky & directional glow
 vec3 outgoingLight=mix(bed,reflectionSample,reflectance)+specularLight;
 // Subtle directional rim catch on steep ripple crests
 float rippleSlopeMag=length(ripple.yz);
 if(rippleSlopeMag>0.008){
  float rimCatch=pow(max(0.0,dot(surfaceNormal,sunDirection)),1.2)*smoothstep(0.008,0.16,rippleSlopeMag);
  outgoingLight+=uRimCatch*rimCatch*(0.25+0.75*reflectance);
 }
 if(opticalDepth>.002){
  float coarse=surfaceGrain(point*27.+.8*gradient);
  float detail=surfaceGrain(point*91.+coarse*2.);
  float breakup=smoothstep(.04,.95,.66*coarse+.34*detail);
  float coverage=(1.-exp(-opticalDepth*(.55+1.85*breakup)))*(.26+.74*breakup);
  float sunCatch=0.35+0.65*pow(max(0.0,dot(surfaceNormal,sunDirection)),0.7);
  vec3 foamColor=mix(uFoamDark,uFoamLit,sunCatch);
  outgoingLight=mix(outgoingLight,foamColor,coverage*.78);
 }
 // Soft atmospheric horizon blend over distant lake
 float viewDist=length(cameraPosition-worldPosition.xyz);
 float horizonFog=smoothstep(uFogRange.x,uFogRange.y,viewDist)*(1.0-surfaceInspection);
 vec3 fogCol=mix(uFogBase,uFogSun,pow(max(0.0,dot(-eyeDirection,sunDirection)),2.2));
 outgoingLight=mix(outgoingLight,fogCol,horizonFog*0.86);`);
 let transmissionHidden:THREE.Object3D[]=[];
 const reflection=mesh.onBeforeRender;
 mesh.onBeforeRender=function(renderer,scene,camera,geometry,material,group){
  reflection.call(this,renderer,scene,camera,geometry,material,group);
  const target=renderer.getRenderTarget();const visible=mesh.visible;mesh.visible=false;
  const saved=transmissionHidden.map(o=>o.visible);
  for(const o of transmissionHidden)o.visible=false;
  renderer.setRenderTarget(transmission);renderer.clear();renderer.render(scene,camera);
  for(let i=0;i<transmissionHidden.length;i++)transmissionHidden[i].visible=saved[i];
  renderer.setRenderTarget(target);mesh.visible=visible;
 };
 let generation=-1, sleeping=false;
 return {
  mesh,
  get solver(){return solver;},
  setQuality(nextGrid: WaterGrid, nextOptions: WaterQualityOptions) {
   const nextSolver=new CoherentWater(nextGrid,nextOptions);
   const nextGeometry=buildWaterGeometry(nextGrid,nextOptions);
   solver.dispose();
   mesh.geometry.dispose();
   solver=nextSolver;
   mesh.geometry=nextGeometry;
   generation=-1;
   material.uniforms.heightState.value=solver.texture;
   material.uniforms.domainSize.value.set(nextGrid.sizeX,nextGrid.sizeZ);
   material.uniforms.gridSpacing.value.set(nextGrid.dx,nextGrid.dz);
   const reflections=nextOptions.reflectionSize??1024;
   const refractions=nextOptions.transmissionSize??1024;
   const reflectionTexture=material.uniforms.mirrorSampler.value as THREE.Texture;
   reflectionTexture.renderTarget?.setSize(reflections,reflections);
   transmission.setSize(refractions,refractions);
  },
  setTime(time:number){material.uniforms.uTime.value=time;},
  applyTheme(theme:SceneTheme){
   material.uniforms.sunDirection.value.copy(themeSunDirection(theme));
   material.uniforms.sunColor.value.set(theme.water.sunColor);
   material.uniforms.waterColor.value.set(theme.water.waterColor);
   material.uniforms.uWaterScatter.value.set(...theme.water.scatter);
   material.uniforms.uRimCatch.value.set(...theme.water.rimCatch);
   material.uniforms.uFoamDark.value.set(...theme.water.foamDark);
   material.uniforms.uFoamLit.value.set(...theme.water.foamLit);
   material.uniforms.uFogBase.value.set(...theme.water.fogBase);
   material.uniforms.uFogSun.value.set(...theme.water.fogSun);
  },
  applyWeather(weather:WeatherPreset){
   material.uniforms.uRainIntensity.value=weather.rainIntensity;
   material.uniforms.uBreezeScale.value=weather.breezeScale;
   material.uniforms.uFogRange.value.set(34.0*weather.fogNearScale,152.0*weather.fogFarScale);
  },
  setTransmissionHidden(objects:THREE.Object3D[]){transmissionHidden=objects;},
  updateRipples(packets:readonly RipplePacket[],time:number){
   const n=Math.min(MAX_RIPPLE_PACKETS,packets.length);
   const row1Offset=MAX_RIPPLE_PACKETS*4;
   for(let i=0;i<n;i++){
    const p=packets[i],o=i*4;
    rippleBuffer[o]=p.x;rippleBuffer[o+1]=p.z;rippleBuffer[o+2]=p.birth;rippleBuffer[o+3]=p.amplitude;
    rippleBuffer[row1Offset+o]=p.dirX;rippleBuffer[row1Offset+o+1]=p.dirZ;rippleBuffer[row1Offset+o+2]=p.forwardBias;rippleBuffer[row1Offset+o+3]=p.waveSpeed;
   }
   rippleTexture.needsUpdate=true;
   material.uniforms.rippleCount.value=n;
   material.uniforms.rippleTime.value=time;
  },
  update(renderer:THREE.WebGLRenderer,ticks:WaterTick[],version:number,strength=1){
   const resting=strength===0;
   const reset=version!==generation||resting&&!sleeping;
   if(reset){solver.clear(renderer);generation=version;}
   if(!resting)for(const tick of ticks)solver.step(renderer,tick,false);
   if(reset||!resting&&ticks.length){solver.updateNormals(renderer);solver.updateCaustics(renderer);}
   sleeping=resting;
   ticks.length=0;
   material.uniforms.heightState.value=solver.texture;
   material.uniforms.fieldStrength.value=strength;
  }
 };
}
