import * as THREE from 'three';
import { attachedPoint, ligamentPoint, ligamentRadius, ligamentSpec, ligamentCount, rimRadius, liquidBudget, bulbRadius, LIGAMENT_COUNT } from './liquid';
import type { HeightField } from './heightfield';
import { MAX_SHEETS, type Sheet } from './effects';

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
 
 void main(){
 float edge=sheetUV.y;
 float noise=1.0;
 vec3 normal=normalize(cross(dFdx(world),dFdy(world)));
 float fresnel=.0204+.9796*pow(1.0-abs(dot(normal,normalize(cameraPosition-world))),5.0);
 float thickness=((1.0-edge)*.24+.18)*(.65+.35*sin(sheetUV.x*3.14159))*(.85+.15*noise);
 float fade=1.0;
 vec4 reflected=textureMatrix*vec4(world,1.0);
 vec3 reflection=texture2D(mirrorSampler,clamp(reflected.xy/reflected.w+normal.xz*.004,vec2(.001),vec2(.999))).rgb;
 vec2 screenUV=screenPosition.xy/screenPosition.w*.5+.5;
 vec3 transmitted=texture2D(transmission,clamp(screenUV+normal.xz*.006*(1.0-edge),vec2(.001),vec2(.999))).rgb;
 float rawDepth=texture2D(transmissionDepth,clamp(screenUV,vec2(.001),vec2(.999))).r;
 float behind=cameraRange.x*cameraRange.y/(cameraRange.y-rawDepth*(cameraRange.y-cameraRange.x));
 float surface=cameraRange.x*cameraRange.y/(cameraRange.y-gl_FragCoord.z*(cameraRange.y-cameraRange.x));
 float thicknessMeters=shape.x;
 vec3 absorption=exp(-vec3(.8,.32,.21)*thicknessMeters);
 float contactFade=smoothstep(0.0,.008,max(0.0,behind-surface));
 vec3 color=mix(transmitted*absorption+vec3(.075,.12,.105)*(1.0-absorption),reflection,fresnel);
 float sideWidth=.035+.06*smoothstep(.12,.65,phase);
 float edgeFade=smoothstep(0.0,sideWidth,sheetUV.x)*(1.0-smoothstep(1.0-sideWidth,1.0,sheetUV.x));
 float strands=smoothstep(.24,.7,noise);
 float brokenEdge=mix(1.0,strands,smoothstep(.08,.5,edge));
 float tipFade=1.0;
 gl_FragColor=vec4(color,fade*(.38+fresnel*.5)*edgeFade*brokenEdge*tipFade*max(.35,contactFade));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
 const tubeGeometry=new THREE.CylinderGeometry(1,1,1,8,1,true);
 const tubeMaterial=new THREE.MeshPhysicalMaterial({color:0xb3d0cf,metalness:0,roughness:.075,transparent:true,opacity:.72,depthWrite:false});
 const tubes=new THREE.InstancedMesh(tubeGeometry,tubeMaterial,MAX_SHEETS*(48+LIGAMENT_COUNT*8));
 tubes.frustumCulled=false;mesh.add(tubes);
 const bulbGeometry=new THREE.SphereGeometry(1,10,8);
 const bulbs=new THREE.InstancedMesh(bulbGeometry,tubeMaterial,MAX_SHEETS*LIGAMENT_COUNT);
 bulbs.frustumCulled=false;mesh.add(bulbs);
 const dummy=new THREE.Object3D(),axis=new THREE.Vector3(0,1,0),delta=new THREE.Vector3();
 return {mesh,material,liquidMaterial:tubeMaterial,update(sheets:readonly Sheet[],time:number,field?:HeightField){
  let count=0,bulbCount=0;
  const segment=(first:number[],second:number[],radius:number)=>{
   delta.set(second[0]-first[0],second[1]-first[1],second[2]-first[2]);
   if(delta.length()<1e-8||radius<=0)return;
   dummy.position.set((first[0]+second[0])/2,(first[1]+second[1])/2,(first[2]+second[2])/2);
   dummy.scale.set(radius,delta.length(),radius);dummy.quaternion.setFromUnitVectors(axis,delta.normalize());dummy.updateMatrix();tubes.setMatrixAt(count++,dummy.matrix);
  };
  for(const sheet of sheets){
   const radius=rimRadius(sheet,time);
   for(let index=0;index<48;index++)segment(attachedPoint(sheet,time,index/48,1,field),attachedPoint(sheet,time,(index+1)/48,1,field),radius*Math.sqrt(.35+1.3*Math.sin(Math.PI*(index+.5)/48)**2));
   for(let index=0;index<ligamentCount(sheet);index++){
    const spec=ligamentSpec(sheet,index);
    if(time<spec.start||time>=spec.pinch)continue;
    dummy.position.set(...ligamentPoint(sheet,index,time,1));dummy.scale.setScalar(bulbRadius(sheet,index,time));dummy.quaternion.identity();dummy.updateMatrix();bulbs.setMatrixAt(bulbCount++,dummy.matrix);
    for(let part=0;part<8;part++)segment(ligamentPoint(sheet,index,time,part/8),ligamentPoint(sheet,index,time,(part+1)/8),ligamentRadius(sheet,index,time));
   }
  }
  tubes.count=count;tubes.instanceMatrix.needsUpdate=true;bulbs.count=bulbCount;bulbs.instanceMatrix.needsUpdate=true;
  const firstEdge=new THREE.Vector3(),secondEdge=new THREE.Vector3();
  sheets.forEach((sheet,slot)=>{
   for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
    const vertex=slot*vertices+row*(columns+1)+column;
    position.set(attachedPoint(sheet,time,column/columns,row/rows,field),vertex*3);ages[vertex]=(time-sheet.birth)/sheet.life;
   }
   let area=0;
   const start=slot*columns*rows*6;
   for(let index=start;index<start+columns*rows*6;index+=3){
    const origin=indices[index]*3,first=indices[index+1]*3,second=indices[index+2]*3;
    firstEdge.set(position[first]-position[origin],position[first+1]-position[origin+1],position[first+2]-position[origin+2]);
    secondEdge.set(position[second]-position[origin],position[second+1]-position[origin+1],position[second+2]-position[origin+2]);
    area+=firstEdge.cross(secondEdge).length()*.5;
   }
   const thickness=Math.min(.001,liquidBudget(sheet).film/Math.max(1e-10,area));
   for(let vertex=slot*vertices;vertex<(slot+1)*vertices;vertex++){profiles[vertex*2]=thickness;profiles[vertex*2+1]=1;}
  });
  geometry.setDrawRange(0,sheets.length*columns*rows*6);geometry.attributes.position.needsUpdate=true;geometry.attributes.age.needsUpdate=true;geometry.attributes.profile.needsUpdate=true;
 },dispose(){geometry.dispose();material.dispose();tubeGeometry.dispose();tubeMaterial.dispose();bulbGeometry.dispose();}};
}
