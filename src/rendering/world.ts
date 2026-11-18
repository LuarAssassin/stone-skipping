import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { randomAt } from './effects';
import { createWater } from './water';
import { COURSE_GRID } from '../simulation/water-grid';
import { createSpray } from './spray';
import { SurfaceChurn } from './surface-churn';

export function createWorld() {
    const churn = new SurfaceChurn(COURSE_GRID);
    const waterField = createWater(COURSE_GRID, churn.texture);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#bccfd3');
    new THREE.TextureLoader().load('/assets/lake-horizon.webp', texture => {
        texture.colorSpace = THREE.LinearSRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = scene.environment = texture;
        scene.environmentIntensity = .6;
    });
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
    const spray = createSpray(waterField.mesh.material.uniforms.heightState,COURSE_GRID);
    scene.add(spray.mesh);
    const shore = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 50),
        new THREE.MeshStandardMaterial({ color: 0xa9aa8e, roughness: 1 })
    );
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(-15.4, 0.012, 0);
    scene.add(shore);
    const sandData=new Uint8Array(128*128*4);
    for(let index=0;index<128*128;index++){const grain=randomAt(271,index);const col=index%128,row=Math.floor(index/128);const seam=col%32<2||row%32<2;const tone=seam?.97:((Math.floor(col/32)+Math.floor(row/32))%2?.985:1)+grain*.008;sandData.set([150*tone,181*tone,171*tone,255],index*4);}
    const sand=new THREE.DataTexture(sandData,128,128);sand.wrapS=sand.wrapT=THREE.RepeatWrapping;sand.repeat.set(75,25);sand.colorSpace=THREE.SRGBColorSpace;sand.generateMipmaps=true;sand.minFilter=THREE.LinearMipmapLinearFilter;sand.magFilter=THREE.LinearFilter;sand.needsUpdate=true;
    const bed=new THREE.Mesh(new THREE.PlaneGeometry(150,50,30,10),new THREE.MeshStandardMaterial({color:0xffffff,map:sand,roughness:1}));
    bed.rotation.x=-Math.PI/2;bed.position.y=-.65;scene.add(bed);
    bed.material.onBeforeCompile = shader => {
        shader.uniforms.causticState={value:waterField.solver.caustics.texture};
        shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec3 bedPoint; void main() { bedPoint=(modelMatrix*vec4(position,1.)).xyz;');
        shader.fragmentShader=shader.fragmentShader.replace('void main() {',`uniform sampler2D causticState; varying vec3 bedPoint;
        void main() {`).replace('#include <dithering_fragment>',`vec2 causticUV=vec2(bedPoint.x/${waterField.solver.grid.sizeX.toFixed(1)},bedPoint.z/${waterField.solver.grid.sizeZ.toFixed(1)}+.5);if(all(greaterThanEqual(causticUV,vec2(0.)))&&all(lessThanEqual(causticUV,vec2(1.)))){float focus=texture2D(causticState,causticUV).r;gl_FragColor.rgb*=mix(1.,clamp(focus,.5,2.),.04);}
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
    trailGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(2048*3),3).setUsage(THREE.DynamicDrawUsage));
    trailGeometry.setDrawRange(0,0);
    const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xffe3a1, transparent: true, opacity: .7 }));
    trail.frustumCulled=false;scene.add(trail);
    return { scene, camera, renderer, waterField, churn, spray, stone, halo, trail, trailGeometry };
}
