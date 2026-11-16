import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { randomAt } from './effects';
import { createWater } from './water';

export function createWorld() {
    const waterField = createWater();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#bed7da');
    const sky=new THREE.Mesh(new THREE.SphereGeometry(120,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader: 'varying vec3 skyDirection; void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader: 'varying vec3 skyDirection; void main(){vec3 direction=normalize(skyDirection);float elevation=pow(max(0.0,direction.y),.45);vec3 color=mix(vec3(.72,.79,.77),vec3(.24,.42,.53),elevation);float cloudBand=exp(-pow((direction.y-.32)/.085,2.0));float cloudMass=smoothstep(-.35,.65,sin(direction.x*9.0+direction.z*5.0)+.35*sin(direction.z*19.0-direction.x*7.0));color=mix(color,vec3(.86,.88,.84),cloudBand*cloudMass*.75);float sun=pow(max(0.0,dot(direction,normalize(vec3(-.45,.82,-.35)))),420.0);color+=vec3(1.0,.9,.7)*sun*.5;gl_FragColor=vec4(color,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));scene.add(sky);
    scene.fog = new THREE.Fog('#bed7da', 35, 115);
    const camera = new THREE.PerspectiveCamera(48, 1, .01, 180);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.setClearColor('#bed7da');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.prepend(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x274943, 2.6));
    const sun = new THREE.DirectionalLight(0xffeed6, 3);
    sun.position.set(-9, 16.4, -7);
    scene.add(sun);
    scene.add(waterField.mesh);
    const shore = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 50),
        new THREE.MeshStandardMaterial({ color: 0xa9aa8e, roughness: 1 })
    );
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(-15.4, 0.012, 0);
    scene.add(shore);
    const sandData=new Uint8Array(128*128*4);
    for(let index=0;index<128*128;index++){const grain=randomAt(271,index);const col=index%128,row=Math.floor(index/128);const seam=col%32<2||row%32<2;const tone=seam?.78:((Math.floor(col/32)+Math.floor(row/32))%2?.9:1)+grain*.015;sandData.set([150*tone,181*tone,171*tone,255],index*4);}
    const sand=new THREE.DataTexture(sandData,128,128);sand.wrapS=sand.wrapT=THREE.RepeatWrapping;sand.repeat.set(75,25);sand.colorSpace=THREE.SRGBColorSpace;sand.generateMipmaps=true;sand.minFilter=THREE.LinearMipmapLinearFilter;sand.magFilter=THREE.LinearFilter;sand.needsUpdate=true;
    const bed=new THREE.Mesh(new THREE.PlaneGeometry(150,50,30,10),new THREE.MeshStandardMaterial({color:0xffffff,map:sand,roughness:1}));
    bed.rotation.x=-Math.PI/2;bed.position.y=-.65;scene.add(bed);
    bed.material.onBeforeCompile = shader => {
        shader.uniforms.causticState={value:waterField.solver.caustics.texture};
        shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec3 bedPoint; void main() { bedPoint=(modelMatrix*vec4(position,1.)).xyz;');
        shader.fragmentShader=shader.fragmentShader.replace('void main() {',`uniform sampler2D causticState; varying vec3 bedPoint;
        void main() {`).replace('#include <dithering_fragment>',`vec2 causticUV=vec2(bedPoint.x/16.,(bedPoint.z+4.)/8.);if(all(greaterThanEqual(causticUV,vec2(0.)))&&all(lessThanEqual(causticUV,vec2(1.)))){float focus=texture2D(causticState,causticUV).r;gl_FragColor.rgb*=mix(1.,clamp(focus,.5,2.),.3);}
        #include <dithering_fragment>`);
    };
    const stone = new THREE.Group();
    scene.add(stone);
    const fallback = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: 0x565957, roughness: .8 }));
    fallback.scale.set(.04, .0045, .03);
    stone.add(fallback);
    new GLTFLoader().load('/assets/stone.glb', gltf => { stone.remove(fallback); fallback.geometry.dispose(); (fallback.material as THREE.Material).dispose(); stone.add(gltf.scene); document.querySelector('#asset')!.textContent = '✓ Blender 原始 GLB · 真实米制尺寸'; }, undefined, () => { document.querySelector('#asset')!.textContent = '模型加载失败，使用同尺寸椭球'; });
    const halo = new THREE.Mesh(new THREE.RingGeometry(.065, .075, 40), new THREE.MeshBasicMaterial({ color: 0xffe3a1, side: THREE.DoubleSide, transparent: true, opacity: .7 }));
    halo.rotation.x = -Math.PI / 2;
    scene.add(halo);
    const trailGeometry = new THREE.BufferGeometry();
    const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xffe3a1, transparent: true, opacity: .7 }));
    scene.add(trail);
    return { scene, camera, renderer, waterField, stone, halo, trail, trailGeometry };
}
