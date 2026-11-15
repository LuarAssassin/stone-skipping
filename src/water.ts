import * as THREE from 'three';
import type { Contact } from './physics';
import { MAX_CONTACTS, WAVE_LIFE } from './effects';

export function createWater(){
 const waves=Array.from({length:MAX_CONTACTS},()=>new THREE.Vector4(0,0,-100,0));
 const directions=Array.from({length:MAX_CONTACTS},()=>new THREE.Vector2(1,0));
 const uniforms={effectTime:{value:0},waves:{value:waves},directions:{value:directions}};
 const material=new THREE.MeshPhysicalMaterial({color:0x287e89,roughness:.29,metalness:.22,clearcoat:1,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 waterWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nwaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
 varying vec3 waterWorld;
 uniform float effectTime;
 uniform vec4 waves[${MAX_CONTACTS}];
 uniform vec2 directions[${MAX_CONTACTS}];
 float waterHeight(vec2 p){
  float height=.0009*sin(p.x*8.0+p.y*5.0+effectTime*.6)+.0007*sin(p.y*13.0-p.x*3.0-effectTime*.4);
  for(int i=0;i<${MAX_CONTACTS};i++){
   float age=effectTime-waves[i].z;
   if(age>=0.0 && age<${WAVE_LIFE}.0){
    vec2 delta=p-waves[i].xy;
    vec2 direction=directions[i];
    vec2 local=vec2(dot(delta,direction)/1.3,dot(delta,vec2(-direction.y,direction.x)));
    float radius=length(local);
    float front=radius-age*.75;
    float packet=exp(-pow(front/.18,2.0))+ .45*exp(-pow((front+.15)/.22,2.0));
    height+=waves[i].w*.009*exp(-age*.85)*(1.0-age/${WAVE_LIFE}.0)*sin(front*42.0)*packet/sqrt(1.0+radius*3.0);
   }
  }
  return height;
 }`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 vec2 pos=waterWorld.xz;
 float baseHeight=waterHeight(pos);
 vec2 gradient=vec2(waterHeight(pos+vec2(.006,0.0))-baseHeight,waterHeight(pos+vec2(0.0,.006))-baseHeight)/.006;
 normal=normalize(mat3(viewMatrix)*vec3(-gradient.x,1.0,-gradient.y));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`vec3 worldNormal=normalize(vec3(-gradient.x,1.0,-gradient.y));
 vec3 viewDirection=normalize(cameraPosition-waterWorld);
 vec3 reflected=reflect(-viewDirection,worldNormal);
 float fresnel=.035+.55*pow(1.0-max(0.0,dot(viewDirection,worldNormal)),5.0);
 vec3 sky=mix(vec3(.25,.48,.51),vec3(.72,.84,.85),smoothstep(-.1,.5,reflected.y));
 outgoingLight=mix(outgoingLight*(1.0+clamp((gradient.x+gradient.y)*1.8,-.35,.35)),sky,fresnel);
 #include <opaque_fragment>`);
 };
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(150,50),material);mesh.rotation.x=-Math.PI/2;
 return {mesh,update(contacts:readonly Contact[],time:number){uniforms.effectTime.value=time;const recent=contacts.filter(contact=>time-contact.time<WAVE_LIFE).slice(-MAX_CONTACTS);for(let index=0;index<MAX_CONTACTS;index++){const contact=recent[index];if(!contact){waves[index].z=-100;continue;}waves[index].set(contact.point.x,contact.point.z,contact.time,Math.min(1,.08+contact.impulse*2.2));directions[index].set(contact.velocity.x,contact.velocity.z).normalize();}}};
}
