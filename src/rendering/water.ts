import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { CoherentWater, FINE_GRID, type WaterGrid, type WaterTick } from './coherent';
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
 const mesh=new Water(geometry,{textureWidth:1024,textureHeight:1024,waterNormals:normals,sunDirection:new THREE.Vector3(-.45,.82,-.35).normalize(),sunColor:0xffeedb,waterColor:0x344940,distortionScale:.35,fog:false});
 mesh.rotation.x=-Math.PI/2;
 const material=mesh.material;
 const transmission=new THREE.WebGLRenderTarget(1024,1024,{depthTexture:new THREE.DepthTexture(1024,1024)});
 Object.assign(material.uniforms,{heightState:{value:state},churnMap:{value:churn},transmission:{value:transmission.texture},transmissionDepth:{value:transmission.depthTexture},cameraRange:{value:new THREE.Vector2(.01,180)},surfaceInspection:{value:0},domainSize:{value:new THREE.Vector2(grid.sizeX,grid.sizeZ)}});
 const stateGLSL=`uniform sampler2D heightState;uniform vec2 domainSize;
 float localHeight(vec2 point){vec2 coord=vec2(point.x/domainSize.x,point.y/domainSize.y+.5);if(any(lessThan(coord,vec2(0.0)))||any(greaterThan(coord,vec2(1.0))))return 0.0;return texture2D(heightState,coord).r;}
 `;
 material.vertexShader=material.vertexShader.replace('void main() {',stateGLSL+'varying vec4 transmissionCoord;\nvoid main() {\nvec3 displaced=position; displaced.z=localHeight(vec2(position.x,-position.y));')
 .replaceAll('vec4( position, 1.0 )','vec4( displaced, 1.0 )').replace('gl_Position = projectionMatrix * mvPosition;','gl_Position = projectionMatrix * mvPosition; transmissionCoord=gl_Position;');
 material.fragmentShader=material.fragmentShader.replace('void main() {',stateGLSL+`
 float surfaceGrain(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  vec4 k=vec4(0.,1.,127.,128.)+i.x+127.*i.y;
  vec4 h=fract(sin(mod(k,8192.))*4375.47);
  return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
 }
 `+'uniform mat4 textureMatrix; uniform sampler2D churnMap; uniform sampler2D transmission; uniform sampler2D transmissionDepth; uniform vec2 cameraRange; uniform float surfaceInspection; varying vec4 transmissionCoord;\nvoid main() {')
 .replace('vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );',`vec2 spacing=vec2(${grid.dx},${grid.dz});
 vec2 point=worldPosition.xz;
 vec2 gradient=vec2(localHeight(point+vec2(spacing.x,0.0))-localHeight(point-vec2(spacing.x,0.0)),localHeight(point+vec2(0.0,spacing.y))-localHeight(point-vec2(0.0,spacing.y)))/(2.0*spacing);

 vec3 surfaceNormal=normalize(vec3(-gradient.x,1.0,-gradient.y));`)
 .replace('mirrorCoord.xy / mirrorCoord.w + distortion','reflectionUV')
 .replace('vec3 reflectionSample =', `vec4 ray=textureMatrix*vec4(reflect(-eyeDirection,surfaceNormal),0.0);
 vec2 reflectionUV=ray.w>0.001?clamp(ray.xy/ray.w,vec2(.001),vec2(.999)):mirrorCoord.xy/mirrorCoord.w;
 vec3 reflectionSample =`)
 .replace('float rf0 = 0.3;','float rf0 = 0.0204;')
 .replace('sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );',`vec3 halfDirection=normalize(sunDirection+eyeDirection);
 float viewCosine=max(dot(surfaceNormal,eyeDirection),.001);
 float lightCosine=max(dot(surfaceNormal,sunDirection),0.0);
 float halfCosine=max(dot(surfaceNormal,halfDirection),0.0);
 float sunFresnel=.0204+.9796*pow(1.0-max(dot(eyeDirection,halfDirection),0.0),5.0);
 float distribution=122.0/(2.0*3.14159265)*pow(halfCosine,120.0);
 float masking=min(1.0,min(2.0*halfCosine*viewCosine/max(dot(eyeDirection,halfDirection),.001),2.0*halfCosine*lightCosine/max(dot(eyeDirection,halfDirection),.001)));
 specularLight=sunColor*.18*sunFresnel*distribution*masking/(4.0*viewCosine)*step(.001,lightCosine);`)
 .replace('vec3 outgoingLight = albedo;',`vec2 screenUV=transmissionCoord.xy/transmissionCoord.w*.5+.5;
 vec2 bend=(mat3(viewMatrix)*(surfaceNormal-vec3(0.,1.,0.))).xy;
 vec2 refractedUV=clamp(screenUV-bend*.055,vec2(.001),vec2(.999));
 vec3 transmitted=texture2D(transmission,refractedUV).rgb;
 float bedDepth=texture2D(transmissionDepth,refractedUV).r;
 float bedDistance=cameraRange.x*cameraRange.y/(cameraRange.y-bedDepth*(cameraRange.y-cameraRange.x));
 float surfaceDistance=cameraRange.x*cameraRange.y/(cameraRange.y-gl_FragCoord.z*(cameraRange.y-cameraRange.x));
 float depth=clamp(bedDistance-surfaceDistance,0.0,8.0);
 vec3 absorption=exp(-vec3(3.8,2.4,2.1)*depth);
 vec3 waterScatter=vec3(.012,.055,.065);
 vec3 bed=transmitted*absorption+waterScatter*(1.0-absorption);
 bed=mix(bed,waterScatter,surfaceInspection);
 vec2 wetUV=vec2(point.x/domainSize.x,point.y/domainSize.y+.5);
 float opticalDepth=0.;
 if(all(greaterThanEqual(wetUV,vec2(0.)))&&all(lessThanEqual(wetUV,vec2(1.))))opticalDepth=texture2D(churnMap,wetUV).r;
 // A broken sheen over churned water. The pattern is fixed in metres and
 // disappears with the measured deposit; intact water keeps its mirror.
 vec3 outgoingLight=mix(bed,reflectionSample,reflectance)+specularLight;
 if(opticalDepth>.002){
  float coarse=surfaceGrain(point*27.+.8*gradient);
  float detail=surfaceGrain(point*91.+coarse*2.);
  float breakup=smoothstep(.04,.95,.66*coarse+.34*detail);
  float coverage=(1.-exp(-opticalDepth*(.5+1.8*breakup)))*(.24+.76*breakup);
  outgoingLight=mix(outgoingLight,vec3(.51,.63,.61),coverage*.76);
 }`);
 const reflection=mesh.onBeforeRender;
 mesh.onBeforeRender=function(renderer,scene,camera,geometry,material,group){
  reflection.call(this,renderer,scene,camera,geometry,material,group);
  const target=renderer.getRenderTarget();const visible=mesh.visible;mesh.visible=false;
  renderer.setRenderTarget(transmission);renderer.clear();renderer.render(scene,camera);
  renderer.setRenderTarget(target);mesh.visible=visible;
 };
 let generation=-1;
 return {mesh,solver,update(renderer:THREE.WebGLRenderer,ticks:WaterTick[],version:number){const changed=version!==generation||ticks.length>0;if(version!==generation){solver.clear(renderer);generation=version;}for(const tick of ticks)solver.step(renderer,tick,false);if(changed){solver.updateNormals(renderer);solver.updateCaustics(renderer);}ticks.length=0;material.uniforms.heightState.value=solver.texture;}};
}

