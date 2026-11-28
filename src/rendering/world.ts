import * as THREE from 'three';
import { createWater } from './water';
import { BALANCED_COURSE_GRID, COURSE_GRID, MOBILE_COURSE_GRID } from '../simulation/water-grid';
import type { GraphicsQuality, GraphicsTier } from './graphics-quality';
import { createSpray } from './spray';
import { SurfaceChurn } from './surface-churn';
import { createSunsetEnvironment, FOG_COLOR, SUN_COLOR, SUN_DIRECTION } from './sunset-env';
import { getSceneTheme, themeSunDirection, type SceneTheme } from './themes';
import { createWeatherSystem, getWeatherPreset, type WeatherPreset } from './weather';
import { createScenePackManager } from './scene-packs';
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

const GRAPHICS_TIERS = {
    high: { grid: COURSE_GRID, water: {}, shadowSize: 2048 },
    balanced: { grid: BALANCED_COURSE_GRID, water: {
        causticWidth: 512, causticHeight: 256, reflectionSize: 768, transmissionSize: 768,
        maxMeshColumns: 1024, maxMeshRows: 256,
    }, shadowSize: 1536 },
    low: { grid: MOBILE_COURSE_GRID, water: {
        causticWidth: 256, causticHeight: 128, reflectionSize: 512, transmissionSize: 512,
        maxMeshColumns: 512, maxMeshRows: 128,
    }, shadowSize: 1024 },
};

export function createWorld(initialQuality: GraphicsQuality, isMobileGpu: boolean) {
    let graphicsQuality = initialQuality;

    const scene = new THREE.Scene();
    scene.background = FOG_COLOR.clone();
    scene.fog = new THREE.Fog(FOG_COLOR, 34, 148);

    const camera = new THREE.PerspectiveCamera(48, 1, .01, 220);
    const renderer = new THREE.WebGLRenderer({
        antialias: !isMobileGpu,
        powerPreference: isMobileGpu ? 'default' : 'high-performance',
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, graphicsQuality.pixelRatio));
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.setClearColor(FOG_COLOR);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.prepend(renderer.domElement);

    const supportsFloatWater =
        renderer.extensions.has('EXT_color_buffer_float') &&
        renderer.extensions.has('OES_texture_float_linear');
    const waterOptions = (tier: GraphicsTier) => ({
        ...GRAPHICS_TIERS[tier].water,
        targetType: tier === 'high' && supportsFloatWater ? THREE.FloatType : THREE.HalfFloatType,
    });
    const activeGrid = GRAPHICS_TIERS[graphicsQuality.tier].grid;
    const churn = new SurfaceChurn(activeGrid);
    const waterField = createWater(activeGrid, churn.texture, waterOptions(graphicsQuality.tier));

    const sunset = createSunsetEnvironment(renderer, scene);
    const weather = createWeatherSystem(scene);
    const scenePacks = createScenePackManager(scene);
    const post = createPostPipeline(renderer, scene, camera);
    post.setBypass(graphicsQuality.tier === 'low');

    // Cinematic sunset lighting: cool twilight zenith sky + warm amber reflected bounce + low golden directional sun
    const hemi = new THREE.HemisphereLight(0x7084ae, 0x4b2f24, 1.35);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(SUN_COLOR, 3.6);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(32).add(new THREE.Vector3(-1.5, 0.1, 0));
    sun.target.position.set(-1.5, 0.1, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(GRAPHICS_TIERS[graphicsQuality.tier].shadowSize);
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
    const spray = createSpray(waterField.mesh.material.uniforms.heightState, activeGrid);
    scene.add(spray.mesh);
    // Underwater refraction pass only needs submerged riverbed & stone; skip sky, mountains, horizon panorama, spray, weather & above-water scenery
    const transmissionHidden: THREE.Object3D[] = [sunset.skyMesh, sunset.mountains, sunset.horizonPanorama, spray.mesh, weather.rootGroup, scenePacks.rootGroup];
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
    const causticState = { value: waterField.solver.caustics.texture };
    bed.material.onBeforeCompile = shader => {
        shader.uniforms.causticState = causticState;
        shader.uniforms.causticStrength = waterField.mesh.material.uniforms.fieldStrength;
        shader.vertexShader = shader.vertexShader.replace('void main() {', 'varying vec3 bedPoint; void main() { bedPoint=(modelMatrix*vec4(position,1.)).xyz;');
        shader.fragmentShader = shader.fragmentShader.replace('void main() {', `uniform sampler2D causticState; uniform float causticStrength; varying vec3 bedPoint;
        void main() {`).replace('#include <dithering_fragment>', `vec2 causticUV=vec2(bedPoint.x/${activeGrid.sizeX.toFixed(1)},bedPoint.z/${activeGrid.sizeZ.toFixed(1)}+.5);if(all(greaterThanEqual(causticUV,vec2(0.)))&&all(lessThanEqual(causticUV,vec2(1.)))){float focus=mix(1.,texture2D(causticState,causticUV).r,causticStrength);float shallow=smoothstep(-0.95,-0.20,bedPoint.y);gl_FragColor.rgb*=mix(vec3(1.),vec3(1.12,0.96,0.78)*clamp(focus,.55,2.2),.06+.09*shallow);}
        #include <dithering_fragment>`);
    };

    const stone = new THREE.Group();
    scene.add(stone);
    let currentStoneKey = '';
    let stoneReady: Promise<void> | undefined;
    function setStoneMesh(spec: StoneSpec) {
        const key = `${spec.id}:${spec.a}:${spec.b}:${spec.h}:${spec.seed}`;
        if (key === currentStoneKey) return stoneReady;
        currentStoneKey = key;
        stone.userData.wet = false;
        const loading = populateStoneGroup(stone, spec, text => {
            const el = document.querySelector('#asset');
            if (el) el.textContent = text;
        });
        const pending: Promise<void> | undefined = loading?.finally(() => {
            if (stoneReady === pending) stoneReady = undefined;
        });
        stoneReady = pending;
        return pending;
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

    let activeTheme: SceneTheme = getSceneTheme('sunset');
    let activeWeather: WeatherPreset = getWeatherPreset('clear');

    function syncFogAndSun() {
        if (scene.fog instanceof THREE.Fog) {
            scene.fog.color.set(activeTheme.fogColor);
            scene.fog.near = 34 * activeWeather.fogNearScale;
            scene.fog.far = 148 * activeWeather.fogFarScale;
        }
        sun.intensity = activeTheme.sunIntensity * activeWeather.sunDim;
    }

    function applyTheme(themeOrId: SceneTheme | string) {
        const theme = typeof themeOrId === 'string' ? getSceneTheme(themeOrId) : themeOrId;
        activeTheme = theme;
        const sunDir = themeSunDirection(theme);
        const fogCol = new THREE.Color(theme.fogColor);
        scene.background = fogCol.clone();
        renderer.setClearColor(fogCol);
        renderer.toneMappingExposure = theme.exposure;

        hemi.color.set(theme.hemiSky);
        hemi.groundColor.set(theme.hemiGround);
        hemi.intensity = theme.hemiIntensity;

        sun.color.set(theme.sunColor);
        sun.position.copy(sunDir).multiplyScalar(32).add(new THREE.Vector3(-1.5, 0.1, 0));

        fill.color.set(theme.fillColor);
        fill.intensity = theme.fillIntensity;

        const horizonReady = sunset.applyTheme(theme);
        sunset.applyWeather(activeWeather);
        waterField.applyTheme(theme);
        waterField.applyWeather(activeWeather);
        weather.applyWeather(activeWeather, theme);
        const packReady = scenePacks.setPack(theme.scenePack);
        syncFogAndSun();
        post.bloomPass.strength = theme.bloomStrength;
        post.bloomPass.threshold = theme.bloomThreshold;
        post.gradePass.uniforms.uShadowTint.value.set(...theme.gradeShadow);
        post.gradePass.uniforms.uHighlightTint.value.set(...theme.gradeHighlight);
        if (horizonReady || packReady) return Promise.allSettled([horizonReady, packReady]);
    }

    function applyWeather(weatherOrId: WeatherPreset | string) {
        const preset = typeof weatherOrId === 'string' ? getWeatherPreset(weatherOrId) : weatherOrId;
        activeWeather = preset;
        sunset.applyWeather(preset);
        waterField.applyWeather(preset);
        weather.applyWeather(preset, activeTheme);
        syncFogAndSun();
    }

    function updateEnvironment(time: number) {
        waterField.setTime(time);
        sunset.update(time);
        weather.update(time, camera);
        scenePacks.update(time, activeWeather.breezeScale);
    }

    function resizeGraphics(width: number, height: number) {
        const ratio = Math.min(devicePixelRatio, graphicsQuality.pixelRatio);
        if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
        renderer.setSize(width, height, false);
        post.setSize(width, height);
    }

    function setGraphicsQuality(next: GraphicsQuality) {
        const tierChanged = next.tier !== graphicsQuality.tier;
        const pixelRatioChanged = renderer.getPixelRatio() !== Math.min(devicePixelRatio, next.pixelRatio);
        graphicsQuality = next;
        if (tierChanged) {
            const { grid, shadowSize } = GRAPHICS_TIERS[next.tier];
            waterField.setQuality(grid, waterOptions(next.tier));
            churn.setResolution(grid);
            causticState.value = waterField.solver.caustics.texture;
            sun.shadow.mapSize.setScalar(shadowSize);
            sun.shadow.map?.dispose();
            sun.shadow.map = null;
            post.setBypass(next.tier === 'low' || waterField.mesh.material.uniforms.surfaceInspection.value > 0);
        }
        if (pixelRatioChanged) resizeGraphics(renderer.domElement.clientWidth, renderer.domElement.clientHeight);
        return tierChanged || pixelRatioChanged;
    }

    return {
        scene, camera, renderer, post, sunset, weather, scenePacks, waterField, churn, spray, stone, halo, trail, trailGeometry, aimGuide,
        get graphicsQuality() { return graphicsQuality; },
        resizeGraphics,
        setGraphicsQuality,
        applyTheme,
        applyWeather,
        updateEnvironment,
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
