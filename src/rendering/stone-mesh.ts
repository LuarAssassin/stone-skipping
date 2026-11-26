import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { StoneSpec } from '../simulation/stones';

const loader = new GLTFLoader();
const glbCache = new Map<string, THREE.Group | null>();
const glbInFlight = new Map<string, Promise<THREE.Group | null>>();
let grainTexture: THREE.DataTexture | undefined;

function getRockGrainTexture(): THREE.DataTexture {
    if (grainTexture) return grainTexture;
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        const x = i % size;
        const y = Math.floor(i / size);
        const h1 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const n1 = h1 - Math.floor(h1);
        const strata = 0.5 + 0.5 * Math.sin(y * 0.42 + Math.sin(x * 0.18) * 1.4);
        const tone = Math.round((0.76 + 0.16 * strata + 0.12 * n1) * 255);
        data.set([tone, tone, tone, 255], i * 4);
    }
    grainTexture = new THREE.DataTexture(data, size, size);
    grainTexture.wrapS = grainTexture.wrapT = THREE.RepeatWrapping;
    grainTexture.repeat.set(3, 3);
    grainTexture.colorSpace = THREE.SRGBColorSpace;
    grainTexture.needsUpdate = true;
    return grainTexture;
}

function hash3(x: number, y: number, z: number, seed: number): number {
    const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
    return v - Math.floor(v);
}

/** Build a realistic metric-scaled procedural stone mesh matching StoneSpec (a, h, b). */
export function buildProceduralStoneMesh(stone: StoneSpec): THREE.Mesh {
    const geom = new THREE.IcosahedronGeometry(1, 3);
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const dir = new THREE.Vector3();
    const irr = stone.irregularity;
    const seed = (stone.seed % 997) * 0.13;
    const isFlatSlate = stone.h / Math.max(stone.a, stone.b) < 0.11;
    const isJagged = stone.archetypeId === 'jagged_gravel';

    for (let i = 0; i < pos.count; i++) {
        dir.fromBufferAttribute(pos, i).normalize();
        // Low-frequency organic silhouette undulation
        const low =
            Math.sin(dir.x * 2.7 + seed) * Math.cos(dir.z * 2.3 - seed * 0.7) * 0.55 +
            Math.sin(dir.y * 3.1 + dir.x * 1.9 + seed * 1.3) * 0.45;
        const mid =
            Math.sin(dir.x * 5.9 - dir.z * 5.1 + seed * 2.1) * 0.5 +
            (hash3(Math.round(dir.x * 4), Math.round(dir.y * 4), Math.round(dir.z * 4), seed) - 0.5) * 0.6;
        const radial = 1 + irr * (low * 0.75 + mid * (isJagged ? 0.65 : 0.25));

        let x = dir.x * stone.a * radial;
        let z = dir.z * stone.b * radial;
        let y = dir.y * stone.h * (1 + irr * 0.45 * low);

        // Flatten top/bottom subtly on thin skipping slates & master disc
        if (isFlatSlate) {
            const flatY = Math.sign(dir.y) * Math.pow(Math.abs(dir.y), 0.78);
            y = flatY * stone.h * (1 + irr * 0.25 * low);
        }

        // Willow-leaf slight taper along +X/-X tips
        if (stone.archetypeId === 'willow_leaf') {
            const taper = 1 - 0.22 * Math.pow(Math.abs(dir.x), 2.2);
            z *= taper;
        }

        pos.setXYZ(i, x, y, z);
    }
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(stone.colorHex),
        map: getRockGrainTexture(),
        roughness: stone.roughness,
        metalness: stone.archetypeId === 'master_disc' ? 0.08 : 0.03,
        envMapIntensity: 1.15,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.userData.baseRoughness = stone.roughness;
    mesh.userData.baseColor = new THREE.Color(stone.colorHex);
    return mesh;
}

function disposeGroupChildren(group: THREE.Group) {
    for (const child of [...group.children]) {
        group.remove(child);
        child.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
                if (!obj.userData.sharedGeometry) obj.geometry.dispose();
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (const m of mats) {
                    if (m && m !== undefined) m.dispose();
                }
            }
        });
    }
}

function loadGlbTemplate(path: string): Promise<THREE.Group | null> {
    if (glbCache.has(path)) return Promise.resolve(glbCache.get(path) ?? null);
    const pending = glbInFlight.get(path);
    if (pending) return pending;
    const promise = new Promise<THREE.Group | null>(resolve => {
        loader.load(
            path,
            gltf => {
                glbCache.set(path, gltf.scene);
                glbInFlight.delete(path);
                resolve(gltf.scene);
            },
            undefined,
            () => {
                glbCache.set(path, null);
                glbInFlight.delete(path);
                resolve(null);
            }
        );
    });
    glbInFlight.set(path, promise);
    return promise;
}

export interface StoneVisualOptions {
    /** 0 = dry upper bank, 1 = dark wet waterline. Omit when in-hand / flying. */
    shoreWetness?: number;
}

interface WatershedUniforms {
    uShoreRoughMin: { value: number };
    uShoreDryLift: { value: number };
}

/** Harmonize every stone material into one cohesive low-saturation natural riverbank watershed palette
 *  and prevent grazing-angle sunset reflections from blowing out into white Bloom blobs on the shore. */
function applyWatershedMaterialGrading(mat: THREE.MeshStandardMaterial, shoreWetness?: number) {
    const isOnShore = shoreWetness !== undefined;
    const w = isOnShore ? THREE.MathUtils.clamp(shoreWetness, 0, 1) : 0;

    const uniforms: WatershedUniforms = {
        // Resting shore stones stay tactile matte-to-damp; never mirror-flat sun reflectors
        uShoreRoughMin: { value: isOnShore ? (0.64 - w * 0.18) : 0.42 },
        uShoreDryLift: { value: isOnShore ? (0.34 - w * 0.24) : 0.10 },
    };

    mat.envMapIntensity = isOnShore ? (0.36 + w * 0.10) : 0.68;
    if (isOnShore) {
        // Damp stones near the waterline darken naturally like real wet creek rocks
        mat.color.multiplyScalar(1 - 0.34 * w);
    }

    mat.userData.watershedUniforms = uniforms;
    mat.userData.shoreWetness = shoreWetness;
    mat.customProgramCacheKey = () => 'river-stone-watershed-v1';
    mat.onBeforeCompile = shader => {
        shader.uniforms.uShoreRoughMin = uniforms.uShoreRoughMin;
        shader.uniforms.uShoreDryLift = uniforms.uShoreDryLift;
        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
                uniform float uShoreRoughMin;
                uniform float uShoreDryLift;`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
                {
                    float stoneLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
                    vec3 desat = mix(vec3(stoneLum), diffuseColor.rgb, 0.44);
                    vec3 riverSilt = vec3(0.31, 0.30, 0.29) * (0.48 + 0.96 * stoneLum);
                    diffuseColor.rgb = mix(desat, riverSilt, 0.28);
                }`
            )
            .replace(
                '#include <roughnessmap_fragment>',
                `#include <roughnessmap_fragment>
                roughnessFactor = clamp(mix(roughnessFactor, 1.0, uShoreDryLift), uShoreRoughMin, 0.96);`
            );
    };
}

/** Populate a THREE.Group with the exact metric procedural stone immediately,
 *  and hot-swap with Blender GLB if available at stone.glbPath. */
export function populateStoneGroup(
    group: THREE.Group,
    stone: StoneSpec,
    onStatus?: (text: string) => void,
    options?: StoneVisualOptions
) {
    disposeGroupChildren(group);
    const procedural = buildProceduralStoneMesh(stone);
    if (procedural.material instanceof THREE.MeshStandardMaterial) {
        applyWatershedMaterialGrading(procedural.material, options?.shoreWetness);
    }
    group.add(procedural);
    const token = Symbol('stone-load');
    group.userData.loadToken = token;
    group.userData.shoreWetness = options?.shoreWetness;

    if (!stone.glbPath) {
        onStatus?.(`✓ 程序化米制模型 · ${stone.name}`);
        return;
    }

    const applyGlb = (template: THREE.Group) => {
        if (group.userData.loadToken !== token) return;
        disposeGroupChildren(group);
        const clone = template.clone(true);
        // Legacy /assets/stone.glb is a single base shape; /assets/stones/*.glb are exact metric exports (scale 1:1:1)
        if (stone.glbPath === '/assets/stone.glb') {
            clone.scale.set(stone.a / 0.04, stone.h / 0.0045, stone.b / 0.03);
        }
        clone.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
                // BufferGeometry is shared with glbCache template; keep it alive across shore re-scatters
                obj.userData.sharedGeometry = true;
                if (obj.material instanceof THREE.MeshStandardMaterial) {
                    obj.material = obj.material.clone();
                    applyWatershedMaterialGrading(obj.material, group.userData.shoreWetness as number | undefined);
                    obj.userData.baseRoughness = obj.material.roughness;
                    obj.userData.baseColor = obj.material.color.clone();
                }
            }
        });
        group.add(clone);
        onStatus?.(`✓ Blender GLB · ${stone.name}`);
    };

    if (glbCache.has(stone.glbPath)) {
        const cached = glbCache.get(stone.glbPath);
        if (cached) applyGlb(cached);
        else onStatus?.(`✓ 程序化米制模型 · ${stone.name}`);
        return;
    }

    void loadGlbTemplate(stone.glbPath).then(template => {
        if (template) {
            applyGlb(template);
        } else if (group.userData.loadToken === token) {
            onStatus?.(`✓ 程序化米制模型（待 Blender 替换）· ${stone.name}`);
        }
    });
}

/** Lift specular/env clarity subtly when a stone is picked up for 360° close-up inspection. */
export function setStoneInspectLook(group: THREE.Group, inspecting: boolean) {
    if (group.userData.inspectLook === inspecting) return;
    group.userData.inspectLook = inspecting;
    const shoreWet = typeof group.userData.shoreWetness === 'number' ? group.userData.shoreWetness : 0;
    group.traverse(obj => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
            obj.material.envMapIntensity = inspecting ? 0.68 : (0.36 + shoreWet * 0.10);
            const u = obj.material.userData.watershedUniforms as WatershedUniforms | undefined;
            if (u) {
                u.uShoreRoughMin.value = inspecting ? 0.42 : (0.64 - shoreWet * 0.18);
                u.uShoreDryLift.value = inspecting ? 0.10 : (0.34 - shoreWet * 0.24);
            }
        }
    });
}

/** Subtle warm sunset rim highlight when hovering a stone on the 3D shore. */
export function setStoneHighlight(group: THREE.Group, highlighted: boolean) {
    if (group.userData.highlighted === highlighted) return;
    group.userData.highlighted = highlighted;
    group.traverse(obj => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
            if (highlighted) {
                obj.material.emissive.setHex(0x8a5120);
                obj.material.emissiveIntensity = 0.32;
            } else {
                obj.material.emissive.setHex(0x000000);
                obj.material.emissiveIntensity = 0;
            }
        }
    });
}

/** Visually darken & gloss the stone's surface once it gets wet on first contact. */
export function setStoneWetness(group: THREE.Group, wet: boolean) {
    if (group.userData.wet === wet) return;
    group.userData.wet = wet;
    group.traverse(obj => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
            const baseR = typeof obj.userData.baseRoughness === 'number' ? obj.userData.baseRoughness : obj.material.roughness;
            const baseC = obj.userData.baseColor instanceof THREE.Color ? obj.userData.baseColor : obj.material.color;
            obj.material.roughness = wet ? Math.max(0.18, baseR * 0.42) : baseR;
            obj.material.color.copy(baseC).multiplyScalar(wet ? 0.72 : 1.0);
        }
    });
}

/** Dedicated lightweight 3D foreground stage for inspecting & rotating the stone in hand. */
export function createStonePreviewStage(canvas: HTMLCanvasElement) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(164, 124, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 164 / 124, 0.005, 4);
    camera.position.set(-0.145, 0.068, 0.135);
    camera.lookAt(0, 0, 0);

    // Matching sunset lighting rig for the handheld preview stone
    scene.add(new THREE.HemisphereLight(0x889ec4, 0x5d3927, 1.55));
    const sun = new THREE.DirectionalLight(0xffb56c, 3.4);
    sun.position.set(1.6, 0.55, -0.8);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6d8bc0, 1.0);
    rim.position.set(-1.2, 0.9, 1.1);
    scene.add(rim);

    // Subtle waterline reference disc so tilt & roll angles are immediately legible
    const horizonRing = new THREE.Mesh(
        new THREE.RingGeometry(0.056, 0.0585, 48),
        new THREE.MeshBasicMaterial({ color: 0xffc682, transparent: true, opacity: 0.34, side: THREE.DoubleSide })
    );
    horizonRing.rotation.x = -Math.PI / 2;
    horizonRing.position.y = -0.022;
    scene.add(horizonRing);

    const holder = new THREE.Group();
    const spinPivot = new THREE.Group();
    holder.add(spinPivot);
    scene.add(holder);

    let spinAngle = 0;

    return {
        setStone(stone: StoneSpec) {
            populateStoneGroup(spinPivot, stone);
            const maxExtent = Math.max(stone.a, stone.b, stone.h * 2.2, 0.032);
            const dist = maxExtent * 4.4;
            camera.position.set(-dist * 0.72, dist * 0.34, dist * 0.68);
            camera.lookAt(0, 0, 0);
            const ringScale = maxExtent / 0.042;
            horizonRing.scale.set(ringScale, ringScale, 1);
            horizonRing.position.y = -Math.max(0.018, stone.h * 1.4);
        },
        render(tiltDeg: number, rollDeg: number, spinValue: number, dt: number) {
            const rad = Math.PI / 180;
            // Slow visual spin hint matching the chosen clockwise / counter-clockwise spin sign
            const visualSpinRate = Math.sign(spinValue || 1) * (0.45 + Math.min(2.2, Math.abs(spinValue) * 0.04));
            spinAngle += visualSpinRate * dt;
            holder.rotation.set(rollDeg * rad, 0, tiltDeg * rad, 'ZYX');
            spinPivot.rotation.y = spinAngle;
            renderer.render(scene, camera);
        },
        dispose() {
            disposeGroupChildren(spinPivot);
            renderer.dispose();
        },
    };
}
