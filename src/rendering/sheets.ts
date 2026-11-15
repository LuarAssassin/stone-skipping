import * as THREE from 'three';
import { BREAKUP_NOISE_GLSL } from './breakup-noise';
import { MAX_SHEETS, sheetPoint, type Sheet } from './effects';

export function createSheets(){
 const columns=48,rows=24,vertices=(columns+1)*(rows+1);
 const position=new Float32Array(MAX_SHEETS*vertices*3),uv=new Float32Array(MAX_SHEETS*vertices*2),ages=new Float32Array(MAX_SHEETS*vertices);
 const profiles=new Float32Array(MAX_SHEETS*vertices*2);
 const indices:number[]=[];
 for(let slot=0;slot<MAX_SHEETS;slot++)for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
  const vertex=slot*vertices+row*(columns+1)+column;
  uv[vertex*2]=column/columns;uv[vertex*2+1]=row/rows;
  if(row<rows&&column<columns){const next=vertex+columns+1;indices.push(vertex,next,vertex+1,vertex+1,next,next+1);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(position,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setAttribute('age',new THREE.BufferAttribute(ages,1).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('profile',new THREE.BufferAttribute(profiles,2).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{mirrorSampler:{value:null},transmission:{value:null},transmissionDepth:{value:null},cameraRange:{value:new THREE.Vector2(.01,180)},textureMatrix:{value:new THREE.Matrix4()}},vertexShader:`attribute vec2 profile; varying vec2 shape; attribute float age; varying vec2 sheetUV; varying float phase; varying vec3 world; varying vec4 screenPosition;
 void main(){shape=profile;sheetUV=uv;phase=age;world=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);screenPosition=gl_Position;}`,
 fragmentShader:`varying vec2 shape; varying vec2 sheetUV; varying float phase; varying vec3 world; varying vec4 screenPosition; uniform sampler2D mirrorSampler; uniform sampler2D transmission; uniform sampler2D transmissionDepth; uniform vec2 cameraRange; uniform mat4 textureMatrix;
 ${BREAKUP_NOISE_GLSL}
 void main(){
 float edge=sheetUV.y;
 float noise=breakupField(sheetUV,shape);
 float holes=smoothstep(.08,.65,phase)*smoothstep(.5,1.0,edge);
 if(noise<max(holes*.85,smoothstep(.38,.9,edge)*.54))discard;
 vec3 normal=normalize(cross(dFdx(world),dFdy(world)));
 float fresnel=.0204+.9796*pow(1.0-abs(dot(normal,normalize(cameraPosition-world))),5.0);
 float thickness=((1.0-edge)*.24+.18)*(.65+.35*sin(sheetUV.x*3.14159))*(.85+.15*noise);
 float fade=smoothstep(0.0,.12,phase)*(1.0-smoothstep(.55,1.0,phase));
 vec4 reflected=textureMatrix*vec4(world,1.0);
 vec3 reflection=texture2D(mirrorSampler,clamp(reflected.xy/reflected.w+normal.xz*.004,vec2(.001),vec2(.999))).rgb;
 vec2 screenUV=screenPosition.xy/screenPosition.w*.5+.5;
 vec3 transmitted=texture2D(transmission,clamp(screenUV+normal.xz*.006*(1.0-edge),vec2(.001),vec2(.999))).rgb;
 float rawDepth=texture2D(transmissionDepth,clamp(screenUV,vec2(.001),vec2(.999))).r;
 float behind=cameraRange.x*cameraRange.y/(cameraRange.y-rawDepth*(cameraRange.y-cameraRange.x));
 float surface=cameraRange.x*cameraRange.y/(cameraRange.y-gl_FragCoord.z*(cameraRange.y-cameraRange.x));
 float thicknessMeters=mix(.0004,.0025,thickness);
 vec3 absorption=exp(-vec3(.8,.32,.21)*thicknessMeters);
 float contactFade=smoothstep(0.0,.008,max(0.0,behind-surface));
 vec3 color=mix(transmitted*absorption+vec3(.075,.12,.105)*(1.0-absorption),reflection,fresnel);
 float sideWidth=.035+.06*smoothstep(.12,.65,phase);
 float edgeFade=smoothstep(0.0,sideWidth,sheetUV.x)*(1.0-smoothstep(1.0-sideWidth,1.0,sheetUV.x));
 float strands=smoothstep(.24,.7,noise);
 float brokenEdge=mix(1.0,strands,smoothstep(.08,.5,edge));
 float tipFade=1.0-smoothstep(.72,.99,edge);
 gl_FragColor=vec4(color,fade*(.5+fresnel*.25)*edgeFade*brokenEdge*tipFade*contactFade);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
 return {mesh,material,update(sheets:readonly Sheet[],time:number){
  sheets.forEach((sheet,slot)=>{for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
   const vertex=slot*vertices+row*(columns+1)+column;
   position.set(sheetPoint(sheet,time,column/columns,row/rows),vertex*3);ages[vertex]=(time-sheet.birth)/sheet.life;profiles[vertex*2]=sheet.holePhase??0;profiles[vertex*2+1]=sheet.holeScale??1;
  }});
  geometry.setDrawRange(0,sheets.length*columns*rows*6);geometry.attributes.position.needsUpdate=true;geometry.attributes.age.needsUpdate=true;geometry.attributes.profile.needsUpdate=true;
 },dispose(){geometry.dispose();material.dispose();}};
}
