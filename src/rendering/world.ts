import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MAX_PARTICLES } from './effects';
import { createWater } from './water';
import { createSheets } from './sheets';
export function createWorld() {
    const waterField = createWater();
    const sheetField = createSheets();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#bed7da');
    scene.fog = new THREE.Fog('#bed7da', 35, 115);
    const camera = new THREE.PerspectiveCamera(48, 1, .01, 180);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.setClearColor('#bed7da');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.prepend(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x274943, 2.6));
    const sun = new THREE.DirectionalLight(0xffeed6, 3);
    sun.position.set(-4, 10, 5);
    scene.add(sun);
    scene.add(waterField.mesh, sheetField.mesh);
    const shore = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 50),
        new THREE.MeshStandardMaterial({ color: 0xa9aa8e, roughness: 1 })
    );
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(-15.4, 0.012, 0);
    scene.add(shore);
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
    const dropGeometry = new THREE.SphereGeometry(1, 5, 4);
    const drops = new THREE.InstancedMesh(dropGeometry, new THREE.MeshPhysicalMaterial({ color: 0xd1edef, roughness: .18, metalness: .1, transparent: true, opacity: .78 }), MAX_PARTICLES);
    drops.frustumCulled = false;
    drops.count = 0;
    scene.add(drops);
    return { scene, camera, renderer, waterField, sheetField, stone, halo, trail, trailGeometry, drops };
}
