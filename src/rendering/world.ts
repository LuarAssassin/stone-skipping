import * as THREE from 'three';
import { createWater } from './water';
import { COURSE_GRID } from '../simulation/water-grid';
import { createSpray } from './spray';
import { SurfaceChurn } from './surface-churn';
import { createSunsetEnvironment, FOG_COLOR, SUN_COLOR, SUN_DIRECTION } from './sunset-env';
import { getSceneTheme, themeSunDirection, type SceneTheme } from './themes';
import { createPostPipeline } from './post';
import { STANDARD_STONE, type StoneSpec } from '../simulation/stones';
import { populateStoneGroup, setStoneWetness } from './stone-mesh';
import { createAimGuide } from './aim-guide';

function bedNoise(seed: number, index: number): number {
    let v = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(index + 1, 0xc2b2ae35)) >>> 0;
    v = Math.imul(v ^ (v >>> 16), 0x21f0aaad);
    v = Math.imul(v ^ (v >>> 15), 0x735a2d97);
    return ((v ^ (v >>> 15)) >>> 0) / 4294967296;
}

function createNaturalBedTexture(): THREE.DataTexture {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const idx = row * size + col;
            const u = col / size * Math.PI * 2;
            const v = row / size * Math.PI * 2;
            // Seamless organic sand ripples + warm river pebble variation
            const ripple = 0.5 + 0.5 * Math.sin(u * 6 + Math.sin(v * 3) * 0.9);
            const patch = 0.5 + 0.5 * Math.sin(u * 2 - v * 2 + 1.1) * Math.cos(u * 3 + v * 4);
            const grain = bedNoise(271, idx);
            const pebble = grain > 0.92 ? 0.82 : grain < 0.08 ? 1.12 : 0.96 + grain * 0.08;
            const tone = (0.78 + ripple * 0.14 + patch * 0.08) * pebble;
            data.set([
                Math.min(255, Math.round(138 * tone)),
                Math.min(255, Math.round(118 * tone)),
                Math.min(255, Math.round(100 * tone)),
                255,
            ], idx * 4);
        }
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(36, 14);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
}

function createCalibrationBedTexture(): THREE.DataTexture {
    const sandData = new Uint8Array(128 * 128 * 4);
    for (let index = 0; index < 128 * 128; index++) {
        const grain = bedNoise(271, index);
        const col = index % 128, row = Math.floor(index / 128);
        const seam = col % 32 < 2 || row % 32 < 2;
        const tone = seam ? .97 : ((Math.floor(col / 32) + Math.floor(row / 32)) % 2 ? .985 : 1) + grain * .008;
        sandData.set([150 * tone, 181 * tone, 171 * tone, 255], index * 4);
    }
    const sand = new THREE.DataTexture(sandData, 128, 128);
    sand.wrapS = sand.wrapT = THREE.RepeatWrapping;
    sand.repeat.set(75, 25);
    sand.colorSpace = THREE.SRGBColorSpace;
    sand.generateMipmaps = true;
    sand.minFilter = THREE.LinearMipmapLinearFilter;
    sand.magFilter = THREE.LinearFilter;
    sand.needsUpdate = true;
    return sand;
}

export function createWorld() {
    const churn = new SurfaceChurn(COURSE_GRID);
    const waterField = createWater(COURSE_GRID, churn.texture);

    const scene = new THREE.Scene();
    scene.background = FOG_COLOR.clone();
    scene.fog = new THREE.Fog(FOG_COLOR, 34, 148);

    const camera = new THREE.PerspectiveCamera(48, 1, .01, 220);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.setClearColor(FOG_COLOR);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.prepend(renderer.domElement);

    const sunset = createSunsetEnvironment(renderer, scene);
    const post = createPostPipeline(renderer, scene, camera);

    // Cinematic sunset lighting: cool twilight zenith sky + warm amber reflected bounce + low golden directional sun
    const hemi = new THREE.HemisphereLight(0x7084ae, 0x4b2f24, 1.35);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(SUN_COLOR, 3.6);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(32).add(new THREE.Vector3(-1.5, 0.1, 0));
    sun.target.position.set(-1.5, 0.1, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -3.8;
    sun.shadow.camera.right = 3.8;
    sun.shadow.camera.top = 3.2;
    sun.shadow.camera.bottom = -3.2;
    sun.shadow.camera.near = 6;
    sun.shadow.camera.far = 64;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.0028;
    scene.add(sun);
    scene.add(sun.target);
    // Subtle cool sky fill from opposite side so shadowed stone faces stay legible
    const fill = new THREE.DirectionalLight(0x526b94, 0.55);
    fill.position.set(-18, 14, 22);
    scene.add(fill);

    scene.add(waterField.mesh);
    const spray = createSpray(waterField.mesh.material.uniforms.heightState, COURSE_GRID);
    scene.add(spray.mesh);
    // Underwater refraction pass only needs submerged riverbed & stone; skip sky, distant mountains & airborne spray
    const transmissionHidden: THREE.Object3D[] = [sunset.skyMesh, sunset.mountains, spray.mesh];
    waterField.setTransmissionHidden(transmissionHidden);

    // Natural gently-sloping riverbed (shallow warm pebble bank near shore -> deeper twilight basin)
    const naturalBedTex = createNaturalBedTexture();
    const calibrationBedTex = createCalibrationBedTexture();
    const bedGeometry = new THREE.PlaneGeometry(150, 52, 48, 16);
    bedGeometry.rotateX(-Math.PI / 2);
    const bedPos = bedGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bedPos.count; i++) {
        const x = bedPos.getX(i) + 55;
        const z = bedPos.getZ(i);
        const shallowFactor = THREE.MathUtils.smoothstep(x, -1.0, 11.5);
        const depth = -0.22 - shallowFactor * 0.72 + Math.sin(x * 0.35 + z * 0.28) * 0.035;
        bedPos.setXYZ(i, x, depth, z);
    }
    bedGeometry.computeVertexNormals();
    const bedMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: naturalBedTex, roughness: 0.96 });
    const bed = new THREE.Mesh(bedGeometry, bedMaterial);
    scene.add(bed);
    bed.material.onBeforeCompile = shader => {
        shader.uniforms.causticState = { value: waterField.solver.caustics.texture };
        shader.vertexShader = shader.vertexShader.replace('void main() {', 'varying vec3 bedPoint; void main() { bedPoint=(modelMatrix*vec4(position,1.)).xyz;');
        shader.fragmentShader = shader.fragmentShader.replace('void main() {', `uniform sampler2D causticState; varying vec3 bedPoint;
        void main() {`).replace('#include <dithering_fragment>', `vec2 causticUV=vec2(bedPoint.x/${waterField.solver.grid.sizeX.toFixed(1)},bedPoint.z/${waterField.solver.grid.sizeZ.toFixed(1)}+.5);if(all(greaterThanEqual(causticUV,vec2(0.)))&&all(lessThanEqual(causticUV,vec2(1.)))){float focus=texture2D(causticState,causticUV).r;float shallow=smoothstep(-0.95,-0.20,bedPoint.y);gl_FragColor.rgb*=mix(vec3(1.),vec3(1.12,0.96,0.78)*clamp(focus,.55,2.2),.06+.09*shallow);}
        #include <dithering_fragment>`);
    };

    const stone = new THREE.Group();
    scene.add(stone);
    let currentStoneKey = '';
    function setStoneMesh(spec: StoneSpec) {
        const key = `${spec.id}:${spec.a}:${spec.b}:${spec.h}:${spec.seed}`;
        if (key === currentStoneKey) return;
        currentStoneKey = key;
        stone.userData.wet = false;
        populateStoneGroup(stone, spec, text => {
            const el = document.querySelector('#asset');
            if (el) el.textContent = text;
        });
    }
    setStoneMesh(STANDARD_STONE);

    const aimGuide = createAimGuide(scene);

    const halo = new THREE.Mesh(new THREE.RingGeometry(.065, .075, 40), new THREE.MeshBasicMaterial({ color: 0xffd28a, side: THREE.DoubleSide, transparent: true, opacity: .78 }));
    halo.rotation.x = -Math.PI / 2;
    scene.add(halo);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2048 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    trailGeometry.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xffd28a, transparent: true, opacity: .72 }));
    trail.frustumCulled = false;
    scene.add(trail);

    function applyTheme(themeOrId: SceneTheme | string) {
        const theme = typeof themeOrId === 'string' ? getSceneTheme(themeOrId) : themeOrId;
        const sunDir = themeSunDirection(theme);
        const fogCol = new THREE.Color(theme.fogColor);
        scene.background = fogCol.clone();
        if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(fogCol);
        renderer.setClearColor(fogCol);
        renderer.toneMappingExposure = theme.exposure;

        hemi.color.set(theme.hemiSky);
        hemi.groundColor.set(theme.hemiGround);
        hemi.intensity = theme.hemiIntensity;

        sun.color.set(theme.sunColor);
        sun.intensity = theme.sunIntensity;
        sun.position.copy(sunDir).multiplyScalar(32).add(new THREE.Vector3(-1.5, 0.1, 0));

        fill.color.set(theme.fillColor);
        fill.intensity = theme.fillIntensity;

        sunset.applyTheme(theme);
        waterField.applyTheme(theme);
        post.bloomPass.strength = theme.bloomStrength;
        post.bloomPass.threshold = theme.bloomThreshold;
        post.gradePass.uniforms.uShadowTint.value.set(...theme.gradeShadow);
        post.gradePass.uniforms.uHighlightTint.value.set(...theme.gradeHighlight);
    }

    return {
        scene, camera, renderer, post, sunset, waterField, churn, spray, stone, halo, trail, trailGeometry, aimGuide,
        applyTheme,
        hideFromTransmission(obj: THREE.Object3D) {
            transmissionHidden.push(obj);
        },
        setStoneMesh,
        setStoneWet(wet: boolean) {
            setStoneWetness(stone, wet);
        },
        setCalibrationBed(enabled: boolean) {
            bedMaterial.map = enabled ? calibrationBedTex : naturalBedTex;
            bedMaterial.needsUpdate = true;
        },
    };
}
