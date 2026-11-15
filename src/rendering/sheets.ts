import * as THREE from 'three';
import { MAX_SHEETS, sheetPoint, type Sheet } from './effects';

export function createSheets(){
 const columns=24,rows=8,vertices=(columns+1)*(rows+1);
 const position=new Float32Array(MAX_SHEETS*vertices*3),uv=new Float32Array(MAX_SHEETS*vertices*2),ages=new Float32Array(MAX_SHEETS*vertices);
 const indices:number[]=[];
 for(let slot=0;slot<MAX_SHEETS;slot++)for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
  const vertex=slot*vertices+row*(columns+1)+column;
  uv[vertex*2]=column/columns;uv[vertex*2+1]=row/rows;
  if(row<rows&&column<columns){const next=vertex+columns+1;indices.push(vertex,next,vertex+1,vertex+1,next,next+1);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(position,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setAttribute('age',new THREE.BufferAttribute(ages,1).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{},vertexShader:`attribute float age; varying vec2 sheetUV; varying float phase; varying vec3 world;
 void main(){sheetUV=uv;phase=age;world=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
 fragmentShader:`varying vec2 sheetUV; varying float phase; varying vec3 world;
 void main(){
 float edge=sheetUV.y;
 float noise=sin(sheetUV.x*93.0+sin(sheetUV.x*37.0)*4.0)*.5+.5;
 float holes=smoothstep(.35,.8,phase)*smoothstep(.5,1.0,edge);
 if(noise<holes*.85)discard;
 vec3 normal=normalize(cross(dFdx(world),dFdy(world)));
 float fresnel=pow(1.0-abs(dot(normal,normalize(cameraPosition-world))),3.0);
 float thickness=(1.0-edge)*.24+.24;
 float fade=smoothstep(0.0,.12,phase)*(1.0-smoothstep(.55,1.0,phase));
 gl_FragColor=vec4(mix(vec3(.19,.48,.51),vec3(.70,.83,.84),fresnel*.6),fade*(thickness+fresnel*.28));
 }`});
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
 return {mesh,update(sheets:readonly Sheet[],time:number){
  sheets.forEach((sheet,slot)=>{for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
   const vertex=slot*vertices+row*(columns+1)+column;
   position.set(sheetPoint(sheet,time,column/columns,row/rows),vertex*3);ages[vertex]=(time-sheet.birth)/sheet.life;
  }});
  geometry.setDrawRange(0,sheets.length*columns*rows*6);geometry.attributes.position.needsUpdate=true;geometry.attributes.age.needsUpdate=true;
 },dispose(){geometry.dispose();material.dispose();}};
}
