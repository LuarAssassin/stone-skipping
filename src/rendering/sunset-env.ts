import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getSceneTheme, themeSunDirection, type SceneTheme } from './themes';
import { getWeatherPreset, type WeatherPreset } from './weather';

const defaultTheme = getSceneTheme('sunset');

/** Off-axis low golden-hour sun (~9.5° elevation, ~-26.5° azimuth off +X throw axis).
 *  Keeps the main throw corridor clear of blinding glare while raking ripples & sheets in warm gold. */
export const SUN_DIRECTION = themeSunDirection(defaultTheme);
export const SUN_COLOR = new THREE.Color(defaultTheme.sunColor);
export const FOG_COLOR = new THREE.Color(defaultTheme.fogColor);

function hash2(x: number, y: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
}

function createSkyMaterial(theme: SceneTheme) {
    const sky = theme.sky;
    return new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
            uSunDir: { value: themeSunDirection(theme) },
            uTime: { value: 0 },
            uZenith: { value: new THREE.Vector3(...sky.zenith) },
            uUpperMid: { value: new THREE.Vector3(...sky.upperMid) },
            uLowerMid: { value: new THREE.Vector3(...sky.lowerMid) },
            uHorizon: { value: new THREE.Vector3(...sky.horizon) },
            uGlowWide: { value: new THREE.Vector3(...sky.glowWide) },
            uGlowTight: { value: new THREE.Vector3(...sky.glowTight) },
            uDisk: { value: new THREE.Vector3(...sky.disk) },
            uHalo: { value: new THREE.Vector3(...sky.halo) },
            uCloudDark: { value: new THREE.Vector3(...sky.cloudDark) },
            uCloudLit: { value: new THREE.Vector3(...sky.cloudLit) },
            uCloudSilver: { value: new THREE.Vector3(...sky.cloudSilver) },
            uBelowDark: { value: new THREE.Vector3(...sky.belowDark) },
            uCloudBoost: { value: 0 },
            uOvercast: { value: 0 },
            uAuroraStrength: { value: theme.auroraStrength ?? 0 },
        },
        vertexShader: /* glsl */ `
            varying vec3 vDir;
            void main() {
                vDir = normalize(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: /* glsl */ `
            uniform vec3 uSunDir;
            uniform float uTime;
            uniform vec3 uZenith, uUpperMid, uLowerMid, uHorizon;
            uniform vec3 uGlowWide, uGlowTight, uDisk, uHalo;
            uniform vec3 uCloudDark, uCloudLit, uCloudSilver, uBelowDark;
            uniform float uCloudBoost, uOvercast, uAuroraStrength;
            varying vec3 vDir;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
                    f.y
                );
            }
            float fbm(vec2 p) {
                float v = 0.0, a = 0.5;
                mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
                for (int i = 0; i < 4; i++) {
                    v += a * noise(p);
                    p = rot * p * 2.04;
                    a *= 0.5;
                }
                return v;
            }

            void main() {
                vec3 dir = normalize(vDir);
                float h = clamp(dir.y, -1.0, 1.0);
                float up = max(h, 0.0);

                vec3 sky = mix(uHorizon, uLowerMid, smoothstep(0.0, 0.14, up));
                sky = mix(sky, uUpperMid, smoothstep(0.10, 0.38, up));
                sky = mix(sky, uZenith, smoothstep(0.32, 0.85, up));

                // Directional sun/moon glow
                float sunDot = dot(dir, uSunDir);
                float sunAlign = max(0.0, sunDot);
                float horizonBand = exp(-abs(h) * 8.5);
                sky += uGlowWide * pow(sunAlign, 3.0) * (0.42 + 0.58 * horizonBand);
                sky += uGlowTight * pow(sunAlign, 18.0) * 0.62;

                // Crisp HDR solar/lunar disk + soft Mie corona (softened under mist/rain overcast)
                float sunVis = 1.0 - uOvercast * 0.78;
                float sunDisk = smoothstep(0.9986, 0.99955, sunDot) * sunVis;
                float sunHalo = pow(sunAlign, 160.0) * 1.45 * (1.0 - uOvercast * 0.55);
                sky += uDisk * sunDisk + uHalo * sunHalo;

                // Subtle high-altitude cirrus clouds (thickens smoothly under mist / rain)
                if (dir.y > 0.018) {
                    vec2 cloudUV = dir.xz / (dir.y + 0.14) * vec2(0.55, 1.35);
                    cloudUV += vec2(uTime * 0.0035, -uTime * 0.0012);
                    float c1 = fbm(cloudUV * 1.45);
                    float c2 = fbm(cloudUV * 3.1 + vec2(c1 * 1.35, 4.2));
                    float mask = smoothstep(max(0.18, 0.48 - uCloudBoost * 0.42), 0.82, c1 * 0.62 + c2 * 0.48);
                    mask *= smoothstep(0.018, 0.11, dir.y) * smoothstep(0.76, 0.18, dir.y);

                    float silver = pow(sunAlign, 4.0) * (1.0 - uOvercast * 0.65);
                    vec3 cloudLit = mix(uCloudLit, uCloudSilver, silver);
                    vec3 cloudColor = mix(uCloudDark, cloudLit, smoothstep(0.25, 0.78, c2 + silver * 0.45));
                    float cover = clamp(0.62 + uCloudBoost * 0.34, 0.0, 0.94);
                    sky = mix(sky, cloudColor, mask * cover);
                }

                // Soft overcast atmospheric veil for mist & rain moods
                if (uOvercast > 0.001) {
                    vec3 veil = mix(uHorizon, uCloudDark * 1.25 + uLowerMid * 0.45, smoothstep(0.0, 0.45, up));
                    sky = mix(sky, veil, uOvercast * 0.42);
                }

                // Live animated Aurora Borealis curtains (emerald-cyan -> arctic violet) for Nordic Fjord
                if (uAuroraStrength > 0.001 && dir.y > 0.04) {
                    float az = atan(dir.z, dir.x);
                    float wave1 = sin(az * 3.2 + uTime * 0.18) * 0.12 + sin(az * 7.5 - uTime * 0.27) * 0.045;
                    float band1 = exp(-pow((dir.y - (0.26 + wave1)) * 7.5, 2.0));
                    float ray1 = 0.55 + 0.45 * fbm(vec2(az * 9.5 + uTime * 0.11, dir.y * 2.2 - uTime * 0.06));
                    float wave2 = cos(az * 4.4 - uTime * 0.14 + 1.3) * 0.10;
                    float band2 = exp(-pow((dir.y - (0.38 + wave2)) * 6.0, 2.0));
                    float ray2 = 0.50 + 0.50 * fbm(vec2(az * 13.0 - uTime * 0.09, dir.y * 2.6 + 4.1));
                    float curtain = (band1 * ray1 + band2 * ray2 * 0.72) * smoothstep(0.04, 0.16, dir.y) * smoothstep(0.76, 0.34, dir.y);
                    // Focus aurora across the forward lake sky dome (+X hemisphere)
                    float frontArc = smoothstep(-0.25, 0.55, dir.x);
                    vec3 auroraCol = mix(vec3(0.10, 0.96, 0.62), vec3(0.46, 0.24, 0.92), smoothstep(0.20, 0.48, dir.y));
                    sky += auroraCol * curtain * frontArc * uAuroraStrength * (1.0 - uOvercast * 0.55) * 0.92;
                }

                // Below horizon: water bounce for clean PMREM/reflections
                if (h < 0.0) {
                    vec3 below = mix(uHorizon * 0.55, uBelowDark, smoothstep(0.0, -0.35, h));
                    sky = mix(sky, below, smoothstep(0.0, -0.04, h));
                }

                gl_FragColor = vec4(sky, 1.0);
            }
        `,
    });
}

function createMountainRings(theme: SceneTheme) {
    const group = new THREE.Group();
    const specs = [
        { radius: 148, baseHeight: 16.5, ridgeScale: 1.0, seed: 1.7 },
        { radius: 132, baseHeight: 10.5, ridgeScale: 1.35, seed: 4.3 },
        { radius: 116, baseHeight: 5.8, ridgeScale: 1.85, seed: 8.9 },
    ];
    const materials: THREE.ShaderMaterial[] = [];
    const sunDir = themeSunDirection(theme);
    const sunAzimuth = Math.atan2(sunDir.z, sunDir.x);

    for (let layerIdx = 0; layerIdx < specs.length; layerIdx++) {
        const layer = specs[layerIdx];
        const palette = theme.mountains[layerIdx];
        const segments = 160;
        const positions = new Float32Array((segments + 1) * 2 * 3);
        const heights = new Float32Array((segments + 1) * 2);
        const indices: number[] = [];

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = t * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const dSun = Math.atan2(Math.sin(angle - sunAzimuth), Math.cos(angle - sunAzimuth));
            const sunGap = 1.0 - 0.68 * Math.exp(-(dSun * dSun) / 0.14);

            const ridge =
                0.52 * (0.5 + 0.5 * Math.sin(angle * 3.0 * layer.ridgeScale + layer.seed)) +
                0.28 * (0.5 + 0.5 * Math.sin(angle * 7.0 * layer.ridgeScale - layer.seed * 1.4)) +
                0.14 * (0.5 + 0.5 * Math.sin(angle * 15.0 * layer.ridgeScale + layer.seed * 2.1)) +
                0.06 * (0.5 + 0.5 * Math.sin(angle * 29.0 * layer.ridgeScale - layer.seed * 0.7));

            const peakY = Math.max(0.45, layer.baseHeight * (0.28 + 0.92 * ridge * ridge) * sunGap);

            const bottomIdx = i * 2;
            const topIdx = i * 2 + 1;
            positions[bottomIdx * 3] = cos * layer.radius;
            positions[bottomIdx * 3 + 1] = -0.8;
            positions[bottomIdx * 3 + 2] = sin * layer.radius;
            heights[bottomIdx] = 0;

            positions[topIdx * 3] = cos * layer.radius;
            positions[topIdx * 3 + 1] = peakY;
            positions[topIdx * 3 + 2] = sin * layer.radius;
            heights[topIdx] = 1;

            if (i < segments) {
                const a = bottomIdx;
                const b = topIdx;
                const c = bottomIdx + 2;
                const d = topIdx + 2;
                indices.push(a, c, b, b, c, d);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aHeight', new THREE.BufferAttribute(heights, 1));
        geometry.setIndex(indices);

        const material = new THREE.ShaderMaterial({
            side: THREE.DoubleSide,
            fog: false,
            uniforms: {
                uTop: { value: new THREE.Color(palette.top) },
                uBottom: { value: new THREE.Color(palette.bottom) },
                uGlow: { value: new THREE.Vector3(...palette.glow) },
                uSunDir: { value: sunDir.clone() },
            },
            vertexShader: /* glsl */ `
                attribute float aHeight;
                varying float vHeight;
                varying vec3 vDir;
                void main() {
                    vHeight = aHeight;
                    vDir = normalize(position);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                uniform vec3 uTop, uBottom, uGlow, uSunDir;
                varying float vHeight;
                varying vec3 vDir;
                void main() {
                    float sunGlow = pow(max(0.0, dot(normalize(vDir), uSunDir)), 5.0);
                    vec3 col = mix(uBottom, uTop, smoothstep(0.0, 0.85, vHeight));
                    col += uGlow * sunGlow * (1.0 - 0.55 * vHeight);
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
        });

        materials.push(material);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        group.add(mesh);
    }

    return { group, materials };
}

export function shorelineCurveX(z: number): number {
    return -0.58 - 0.34 * Math.sin(z * 0.24 + 0.6) - 0.18 * Math.cos(z * 0.57 - 0.4);
}

export function shoreElevation(x: number, z: number): number {
    // Organic curved shoreline near x ≈ -0.45..-1.25
    const curve = shorelineCurveX(z);
    const inland = curve - x; // positive inland, negative toward lake
    const micro = 0.028 * Math.sin(x * 1.9 + z * 1.3) * Math.cos(z * 0.8 - x * 0.7);
    if (inland <= 0) {
        return Math.max(-0.36, inland * 0.28 + micro * 0.35);
    }
    return Math.min(0.92, Math.pow(inland, 0.76) * 0.19 + micro);
}

/** Approximate upward surface normal of the contoured shoreline at (x, z). */
export function shoreNormal(x: number, z: number): THREE.Vector3 {
    const eps = 0.04;
    const dx = (shoreElevation(x + eps, z) - shoreElevation(x - eps, z)) / (2 * eps);
    const dz = (shoreElevation(x, z + eps) - shoreElevation(x, z - eps)) / (2 * eps);
    return new THREE.Vector3(-dx, 1, -dz).normalize();
}

/** Generate seamless procedural river sand + fine embedded gravel PBR textures (albedo, normal, roughness). */
function createShoreGravelTextures() {
    const size = 256;
    const height = new Float32Array(size * size);
    const tone = new Float32Array(size * size);
    const rough = new Float32Array(size * size);

    // Periodic integer hash for seamless tiling across 0..size
    const tileHash = (ix: number, iy: number, seed: number) => {
        const x = ((ix % size) + size) % size;
        const y = ((iy % size) + size) % size;
        return hash2(x * 1.13 + seed * 17.3, y * 1.71 + seed * 31.7);
    };
    const periodicNoise = (x: number, y: number, freq: number, seed: number) => {
        const fx = (x / size) * freq;
        const fy = (y / size) * freq;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const wrap = (n: number) => ((n % freq) + freq) % freq;
        const n00 = hash2(wrap(ix) + seed * 13.7, wrap(iy) + seed * 29.1);
        const n10 = hash2(wrap(ix + 1) + seed * 13.7, wrap(iy) + seed * 29.1);
        const n01 = hash2(wrap(ix) + seed * 13.7, wrap(iy + 1) + seed * 29.1);
        const n11 = hash2(wrap(ix + 1) + seed * 13.7, wrap(iy + 1) + seed * 29.1);
        return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
    };

    // 1. Multi-scale coarse river sand base
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = y * size + x;
            const n1 = periodicNoise(x, y, 8, 1);
            const n2 = periodicNoise(x, y, 24, 2);
            const grit = tileHash(x, y, 3);
            height[idx] = n1 * 0.28 + n2 * 0.22 + grit * 0.14;
            tone[idx] = 0.72 + n1 * 0.14 + (grit - 0.5) * 0.18;
            rough[idx] = 0.86 + (grit - 0.5) * 0.12;
        }
    }

    // 2. Stamp 260 toroidal embedded micro-pebbles (3..11 px) into the heightfield for tactile grit relief
    for (let p = 0; p < 260; p++) {
        const cx = hash2(p * 1.7, 4.1) * size;
        const cy = hash2(p * 2.9, 13.7) * size;
        const rx = 2.6 + Math.pow(hash2(p * 3.3, 27.4), 1.6) * 8.5;
        const ry = rx * (0.62 + hash2(p * 4.7, 51.2) * 0.52);
        const ang = hash2(p * 5.1, 73.8) * Math.PI * 2;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const pebbleTone = 0.58 + hash2(p * 6.3, 91.5) * 0.44;
        const pebbleRough = 0.66 + hash2(p * 7.1, 108.2) * 0.20;
        const maxR = Math.ceil(Math.max(rx, ry)) + 2;

        for (let dy = -maxR; dy <= maxR; dy++) {
            const py = (((Math.floor(cy) + dy) % size) + size) % size;
            for (let dx = -maxR; dx <= maxR; dx++) {
                const px = (((Math.floor(cx) + dx) % size) + size) % size;
                const lx = dx * ca + dy * sa;
                const ly = -dx * sa + dy * ca;
                const d2 = (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry);
                if (d2 < 1.25) {
                    const idx = py * size + px;
                    if (d2 < 1.0) {
                        const dome = Math.sqrt(1 - d2);
                        const h = 0.34 + dome * 0.64;
                        if (h > height[idx]) {
                            height[idx] = h;
                            tone[idx] = pebbleTone * (0.86 + 0.18 * dome);
                            rough[idx] = pebbleRough;
                        }
                    } else {
                        // Subtle crevice AO ring around each embedded pebble
                        const rim = 1 - (d2 - 1.0) / 0.25;
                        tone[idx] *= 1 - 0.16 * rim;
                    }
                }
            }
        }
    }

    const albedoData = new Uint8Array(size * size * 4);
    const normalData = new Uint8Array(size * size * 4);
    const roughData = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
        const ym = (y - 1 + size) % size;
        const yp = (y + 1) % size;
        for (let x = 0; x < size; x++) {
            const xm = (x - 1 + size) % size;
            const xp = (x + 1) % size;
            const idx = y * size + x;
            const o = idx * 4;

            // Neutral cool-warm river silt albedo (multiplied by shore vertexColors)
            const t = THREE.MathUtils.clamp(tone[idx], 0.35, 1.15);
            const warmShift = (tileHash(x, y, 9) - 0.5) * 10;
            albedoData[o] = THREE.MathUtils.clamp(Math.round(188 * t + warmShift), 0, 255);
            albedoData[o + 1] = THREE.MathUtils.clamp(Math.round(183 * t + warmShift * 0.5), 0, 255);
            albedoData[o + 2] = THREE.MathUtils.clamp(Math.round(177 * t - warmShift * 0.4), 0, 255);
            albedoData[o + 3] = 255;

            // Tangent-space normal from height gradient
            const dhx = (height[y * size + xp] - height[y * size + xm]) * 2.4;
            const dhy = (height[yp * size + x] - height[ym * size + x]) * 2.4;
            const invLen = 1 / Math.hypot(dhx, dhy, 1);
            normalData[o] = Math.round(((-dhx * invLen) * 0.5 + 0.5) * 255);
            normalData[o + 1] = Math.round(((-dhy * invLen) * 0.5 + 0.5) * 255);
            normalData[o + 2] = Math.round(((invLen) * 0.5 + 0.5) * 255);
            normalData[o + 3] = 255;

            const rByte = THREE.MathUtils.clamp(Math.round(rough[idx] * 255), 110, 250);
            roughData[o] = rByte;
            roughData[o + 1] = rByte;
            roughData[o + 2] = rByte;
            roughData[o + 3] = 255;
        }
    }

    const setupTex = (data: Uint8Array, isSrgb: boolean) => {
        const tex = new THREE.DataTexture(data, size, size);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        // Three.js DataTexture defaults to NearestFilter (blocky pixels); enable linear filtering + mipmaps!
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.repeat.set(22, 52);
        tex.anisotropy = 8;
        if (isSrgb) tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        return tex;
    };

    return {
        map: setupTex(albedoData, true),
        normalMap: setupTex(normalData, false),
        roughnessMap: setupTex(roughData, false),
    };
}

interface ShoreBedManifest {
    tileSizeMeters?: number;
    textures?: {
        albedo?: string;
        normal?: string;
        roughness?: string;
        ao?: string;
    };
    pebbles?: Array<{
        id: string;
        glbPath: string;
    }>;
}

/** Hot-upgrade the procedural shore bed with Codex's Blender Cycles 2K seamless PBR gravel textures
 *  and use the 6 baked-PBR pebble meshes ONLY for distant outer-bank framing cobbles (never in the
 *  clickable foraging foreground, so every 3D stone within reach is 100% pickable). */
function hydrateBlenderShoreBed(
    shoreMat: THREE.MeshStandardMaterial,
    widthX: number,
    widthZ: number,
    group: THREE.Group,
    fallbackOuterCobbles: THREE.InstancedMesh,
    outerMatrices: THREE.Matrix4[],
    outerColors: THREE.Color[]
) {
    if (typeof fetch === 'undefined') return;
    void fetch('/assets/shore/manifest.json')
        .then(res => (res.ok ? (res.json() as Promise<ShoreBedManifest>) : null))
        .then(manifest => {
            if (!manifest) return;
            const tileMeters = Math.max(0.4, manifest.tileSizeMeters ?? 1.2);
            const repX = widthX / tileMeters;
            const repZ = widthZ / tileMeters;
            const texLoader = new THREE.TextureLoader();

            const loadTile = (url: string | undefined, isSrgb: boolean, apply: (t: THREE.Texture) => void) => {
                if (!url) return;
                texLoader.load(url, tex => {
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.RepeatWrapping;
                    tex.repeat.set(repX, repZ);
                    tex.magFilter = THREE.LinearFilter;
                    tex.minFilter = THREE.LinearMipmapLinearFilter;
                    tex.anisotropy = 8;
                    if (isSrgb) tex.colorSpace = THREE.SRGBColorSpace;
                    tex.needsUpdate = true;
                    apply(tex);
                    shoreMat.needsUpdate = true;
                });
            };

            if (manifest.textures) {
                loadTile(manifest.textures.albedo, true, t => {
                    shoreMat.map?.dispose();
                    shoreMat.map = t;
                });
                loadTile(manifest.textures.normal, false, t => {
                    shoreMat.normalMap?.dispose();
                    shoreMat.normalMap = t;
                    shoreMat.normalScale.set(1.25, 1.25);
                });
                loadTile(manifest.textures.roughness, false, t => {
                    shoreMat.roughnessMap?.dispose();
                    shoreMat.roughnessMap = t;
                    shoreMat.roughness = 0.96;
                });
                loadTile(manifest.textures.ao, false, t => {
                    shoreMat.aoMap?.dispose();
                    shoreMat.aoMap = t;
                    shoreMat.aoMapIntensity = 0.85;
                });
            }

            if (Array.isArray(manifest.pebbles) && manifest.pebbles.length > 0 && outerMatrices.length > 0) {
                const gltfLoader = new GLTFLoader();
                Promise.all(
                    manifest.pebbles.map(
                        p =>
                            new Promise<{ geom: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial } | null>(resolve => {
                                gltfLoader.load(
                                    p.glbPath,
                                    gltf => {
                                        let found: { geom: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial } | null = null;
                                        gltf.scene.traverse(obj => {
                                            if (!found && obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
                                                const mat = obj.material.clone();
                                                mat.color.setHex(0xffffff);
                                                mat.envMapIntensity = 0.36;
                                                mat.roughness = Math.max(0.76, mat.roughness);
                                                found = { geom: obj.geometry, mat };
                                            }
                                        });
                                        resolve(found);
                                    },
                                    undefined,
                                    () => resolve(null)
                                );
                            })
                    )
                ).then(loaded => {
                    const valid = loaded.filter((v): v is { geom: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial } => v !== null);
                    if (valid.length === 0) return;

                    const buckets: number[][] = valid.map(() => []);
                    for (let i = 0; i < outerMatrices.length; i++) {
                        buckets[i % valid.length].push(i);
                    }

                    const tint = new THREE.Color();
                    for (let b = 0; b < valid.length; b++) {
                        const indices = buckets[b];
                        if (indices.length === 0) continue;
                        const inst = new THREE.InstancedMesh(valid[b].geom, valid[b].mat, indices.length);
                        for (let k = 0; k < indices.length; k++) {
                            const srcIdx = indices[k];
                            inst.setMatrixAt(k, outerMatrices[srcIdx]);
                            const c = outerColors[srcIdx];
                            const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
                            const factor = THREE.MathUtils.clamp(lum * 2.1, 0.42, 1.08);
                            tint.setRGB(factor, factor * 0.99, factor * 0.98);
                            inst.setColorAt(k, tint);
                        }
                        inst.instanceMatrix.needsUpdate = true;
                        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
                        group.add(inst);
                    }
                    fallbackOuterCobbles.visible = false;
                });
            }
        })
        .catch(() => {
            // Optional Blender shore pack not generated yet; smooth procedural shore remains active
        });
}

function createShoreAndReeds() {
    const group = new THREE.Group();

    // 1. Contoured natural gravel/pebble shoreline bank with crisp procedural sand & micro-gravel PBR
    const cols = 96, rows = 180;
    const widthX = 24, widthZ = 56;
    const shoreGeom = new THREE.PlaneGeometry(widthX, widthZ, cols, rows);
    shoreGeom.rotateX(-Math.PI / 2);
    const pos = shoreGeom.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // Authentic muted cool-neutral river silt/gravel tones (sunset light provides natural warmth)
    const dryColor = new THREE.Color('#645e58');
    const wetColor = new THREE.Color('#232428');
    const pebbleTint = new THREE.Color('#736c64');
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
        // Shift plane so x ranges from -23.7 to +0.3
        const x = pos.getX(i) - widthX / 2 + 0.3;
        const z = pos.getZ(i);
        const y = shoreElevation(x, z);
        pos.setXYZ(i, x, y, z);

        const grain = hash2(Math.floor(x * 7), Math.floor(z * 7));
        tmp.copy(dryColor).lerp(pebbleTint, grain * 0.45);
        // Dark wet waterline band near y = -0.02..0.095 m
        const wetness = 1 - THREE.MathUtils.smoothstep(y, -0.02, 0.095);
        tmp.lerp(wetColor, wetness * 0.80);
        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
    }
    shoreGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Mirror uv to uv1 so Blender Cycles aoMap works cleanly on MeshStandardMaterial
    shoreGeom.setAttribute('uv1', shoreGeom.attributes.uv);
    shoreGeom.computeVertexNormals();

    const shoreTex = createShoreGravelTextures();
    const shoreMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: shoreTex.map,
        normalMap: shoreTex.normalMap,
        normalScale: new THREE.Vector2(1.15, 1.15),
        roughnessMap: shoreTex.roughnessMap,
        roughness: 0.92,
        metalness: 0.02,
        envMapIntensity: 0.34,
    });
    const shoreMesh = new THREE.Mesh(shoreGeom, shoreMat);
    shoreMesh.receiveShadow = true;
    group.add(shoreMesh);

    // 2. River-worn pebble base geometry (gently deformed smooth icosahedron for organic silhouettes)
    const pebbleGeom = new THREE.IcosahedronGeometry(1, 2);
    const pPos = pebbleGeom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pPos.count; i++) {
        const vx = pPos.getX(i);
        const vy = pPos.getY(i);
        const vz = pPos.getZ(i);
        const w = 1.0
            + 0.11 * Math.sin(vx * 3.1 + vy * 2.3)
            + 0.07 * Math.cos(vz * 4.2 - vx * 2.7);
        pPos.setXYZ(i, vx * w, vy * w, vz * w);
    }
    pebbleGeom.computeVertexNormals();

    const dummy = new THREE.Object3D();
    const colorAttr = new THREE.Color();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const slopeQuat = new THREE.Quaternion();
    const yawQuat = new THREE.Quaternion();
    const tiltQuat = new THREE.Quaternion();
    const tiltEuler = new THREE.Euler();
    // Cohesive low-saturation watershed rock palette (cool slate, damp charcoal, river silt, weathered grey-ochre)
    const pebblePalette = [
        new THREE.Color('#535250'), // neutral river grey
        new THREE.Color('#44484d'), // wet slate
        new THREE.Color('#5d564f'), // muted silt-ochre
        new THREE.Color('#38393c'), // dark basalt
        new THREE.Color('#69655f'), // pale smoky quartz-grey
        new THREE.Color('#524c48'), // weathered shale-brown
        new THREE.Color('#474d4c'), // dark river celadon-grey
    ];

    // 2. Distant outer-bank cobbles kept completely clear of the crouching foraging area
    //    so every 3D stone visible in Forage Mode is 100% pickable (no confusing non-pickable 3D rocks!)
    const cobbleMat = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.80,
        metalness: 0.03,
        envMapIntensity: 0.36,
    });
    const cobbleCount = 120;
    const cobbles = new THREE.InstancedMesh(pebbleGeom, cobbleMat, cobbleCount);
    const outerMatrices: THREE.Matrix4[] = new Array(cobbleCount);
    const outerColors: THREE.Color[] = new Array(cobbleCount);
    for (let i = 0; i < cobbleCount; i++) {
        const r1 = hash2(i * 1.37, 11.4);
        const r2 = hash2(i * 2.13, 29.8);
        const r3 = hash2(i * 3.71, 53.2);
        const r4 = hash2(i * 5.19, 71.6);
        const z = (r1 - 0.5) * 34;
        const edge = shorelineCurveX(z);
        const minInland = Math.abs(z) < 4.5 ? 2.45 : 0.25;
        const x = edge - minInland - r2 * 6.0;
        const y = shoreElevation(x, z);
        const sx = 0.045 + r3 * 0.11;
        const sy = sx * (0.28 + r4 * 0.28);
        const sz = sx * (0.68 + hash2(i, 91.3) * 0.42);
        dummy.position.set(x, y + sy * 0.20, z);
        slopeQuat.setFromUnitVectors(upAxis, shoreNormal(x, z));
        yawQuat.setFromAxisAngle(upAxis, r1 * Math.PI * 2);
        tiltEuler.set((r3 - 0.5) * 0.26, 0, (r4 - 0.5) * 0.26);
        tiltQuat.setFromEuler(tiltEuler);
        dummy.quaternion.copy(slopeQuat).multiply(yawQuat).multiply(tiltQuat);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        cobbles.setMatrixAt(i, dummy.matrix);
        outerMatrices[i] = dummy.matrix.clone();
        const baseCol = pebblePalette[i % pebblePalette.length];
        const shade = 0.72 + 0.34 * hash2(i, 103.7);
        const wetDark = 1 - 0.40 * (1 - THREE.MathUtils.smoothstep(y, -0.02, 0.095));
        colorAttr.copy(baseCol).multiplyScalar(shade * wetDark);
        cobbles.setColorAt(i, colorAttr);
        outerColors[i] = colorAttr.clone();
    }
    cobbles.instanceMatrix.needsUpdate = true;
    if (cobbles.instanceColor) cobbles.instanceColor.needsUpdate = true;
    group.add(cobbles);

    hydrateBlenderShoreBed(shoreMat, widthX, widthZ, group, cobbles, outerMatrices, outerColors);

    // 3. Swaying lakeside reeds along left & right shore margins (safely clear of throw corridor & camera)
    const bladeGeom = new THREE.PlaneGeometry(0.024, 1.0, 1, 6);
    bladeGeom.translate(0, 0.5, 0);
    const bPos = bladeGeom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bPos.count; i++) {
        const y = bPos.getY(i);
        const taper = 1.0 - Math.pow(y, 1.35) * 0.92;
        const curveZ = y * y * 0.14;
        bPos.setXYZ(i, bPos.getX(i) * taper, y, bPos.getZ(i) + curveZ);
    }
    bladeGeom.computeVertexNormals();

    const reedsMaterial = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uSunDir: { value: SUN_DIRECTION.clone() },
            uBaseCol: { value: new THREE.Vector3(...defaultTheme.reeds.base) },
            uTipCol: { value: new THREE.Vector3(...defaultTheme.reeds.tip) },
            uRimCol: { value: new THREE.Vector3(...defaultTheme.reeds.rim) },
            uFogCol: { value: new THREE.Color(defaultTheme.fogColor) },
        },
        vertexShader: /* glsl */ `
            uniform float uTime;
            varying float vHeight;
            varying vec3 vWorldPos;
            void main() {
                vHeight = clamp(position.y, 0.0, 1.0);
                vec4 worldBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                float phase = worldBase.x * 0.7 + worldBase.z * 0.55;
                float sway = (sin(uTime * 1.45 + phase) * 0.085 + sin(uTime * 2.9 + phase * 1.7) * 0.025) * vHeight * vHeight;
                vec3 local = position;
                local.x += sway;
                local.z += sway * 0.55;
                vec4 world = instanceMatrix * vec4(local, 1.0);
                vWorldPos = world.xyz;
                gl_Position = projectionMatrix * viewMatrix * world;
            }
        `,
        fragmentShader: /* glsl */ `
            uniform vec3 uSunDir, uBaseCol, uTipCol, uRimCol, uFogCol;
            varying float vHeight;
            varying vec3 vWorldPos;
            void main() {
                vec3 col = mix(uBaseCol, uTipCol, smoothstep(0.35, 1.0, vHeight));
                vec3 viewDir = normalize(cameraPosition - vWorldPos);
                float backlit = pow(max(0.0, dot(-viewDir, uSunDir)), 3.0);
                col += uRimCol * backlit * smoothstep(0.45, 1.0, vHeight);
                float dist = length(cameraPosition - vWorldPos);
                float fogFactor = smoothstep(28.0, 145.0, dist);
                col = mix(col, uFogCol, fogFactor * 0.85);
                gl_FragColor = vec4(col, 1.0);
            }
        `,
    });

    // Clump anchors placed along near-left (-Z) and far-right (+Z) shoreline edges, clear of overview camera & throw path
    const clumps: [number, number, number][] = [
        [-1.1, -2.5, 24],
        [-1.3, -4.4, 30],
        [-0.9, -7.2, 28],
        [-1.4, -11.5, 26],
        [-1.0, 2.7, 26],
        [-1.3, 4.9, 30],
        [-0.95, 8.2, 26],
        [-1.5, 12.6, 24],
    ];
    const totalBlades = clumps.reduce((sum, [, , n]) => sum + n, 0);
    const reeds = new THREE.InstancedMesh(bladeGeom, reedsMaterial, totalBlades);
    let idx = 0;
    for (let c = 0; c < clumps.length; c++) {
        const [cx, cz, count] = clumps[c];
        for (let i = 0; i < count; i++) {
            const a = hash2(c * 13 + i, 3.1) * Math.PI * 2;
            const r = Math.sqrt(hash2(c * 17 + i, 7.9)) * 0.85;
            const x = cx + Math.cos(a) * r * 0.55;
            const z = cz + Math.sin(a) * r;
            const y = shoreElevation(x, z) - 0.04;
            const height = 0.55 + hash2(c * 23 + i, 19.3) * 0.85;
            const lean = (hash2(c * 31 + i, 41.7) - 0.5) * 0.26;
            dummy.position.set(x, y, z);
            dummy.rotation.set(lean, hash2(c * 37 + i, 61.1) * Math.PI * 2, lean * 0.7);
            dummy.scale.set(0.8 + hash2(i, 5.5) * 0.7, height, 1);
            dummy.updateMatrix();
            reeds.setMatrixAt(idx++, dummy.matrix);
        }
    }
    reeds.instanceMatrix.needsUpdate = true;
    group.add(reeds);

    return { group, shoreMesh, reedsMaterial };
}

export function createSunsetEnvironment(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    initialTheme: SceneTheme = defaultTheme
) {
    const skyMaterial = createSkyMaterial(initialTheme);
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(165, 48, 32), skyMaterial);
    skyMesh.frustumCulled = false;
    scene.add(skyMesh);

    const { group: mountains, materials: mountainMaterials } = createMountainRings(initialTheme);
    scene.add(mountains);

    const { group: shoreGroup, shoreMesh, reedsMaterial } = createShoreAndReeds();
    scene.add(shoreGroup);

    // Bake PMREM environment map from procedural sky; rebaked cleanly whenever user switches scene theme
    let envTarget: THREE.WebGLRenderTarget | undefined;
    function rebakeEnvironment(envIntensity: number) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        const envScene = new THREE.Scene();
        const envSky = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), skyMaterial);
        envScene.add(envSky);
        const nextTarget = pmrem.fromScene(envScene, 0.02);
        envTarget?.dispose();
        envTarget = nextTarget;
        scene.environment = envTarget.texture;
        scene.environmentIntensity = envIntensity;
        envSky.geometry.dispose();
        pmrem.dispose();
    }

    let currentEnvIntensity = initialTheme.envIntensity;

    function applyTheme(theme: SceneTheme) {
        const sunDir = themeSunDirection(theme);
        const u = skyMaterial.uniforms;
        u.uSunDir.value.copy(sunDir);
        u.uZenith.value.set(...theme.sky.zenith);
        u.uUpperMid.value.set(...theme.sky.upperMid);
        u.uLowerMid.value.set(...theme.sky.lowerMid);
        u.uHorizon.value.set(...theme.sky.horizon);
        u.uGlowWide.value.set(...theme.sky.glowWide);
        u.uGlowTight.value.set(...theme.sky.glowTight);
        u.uDisk.value.set(...theme.sky.disk);
        u.uHalo.value.set(...theme.sky.halo);
        u.uCloudDark.value.set(...theme.sky.cloudDark);
        u.uCloudLit.value.set(...theme.sky.cloudLit);
        u.uCloudSilver.value.set(...theme.sky.cloudSilver);
        u.uBelowDark.value.set(...theme.sky.belowDark);
        u.uAuroraStrength.value = theme.auroraStrength ?? 0;

        for (let i = 0; i < mountainMaterials.length; i++) {
            const p = theme.mountains[i];
            const m = mountainMaterials[i].uniforms;
            m.uTop.value.set(p.top);
            m.uBottom.value.set(p.bottom);
            m.uGlow.value.set(...p.glow);
            m.uSunDir.value.copy(sunDir);
        }

        reedsMaterial.uniforms.uSunDir.value.copy(sunDir);
        reedsMaterial.uniforms.uBaseCol.value.set(...theme.reeds.base);
        reedsMaterial.uniforms.uTipCol.value.set(...theme.reeds.tip);
        reedsMaterial.uniforms.uRimCol.value.set(...theme.reeds.rim);
        reedsMaterial.uniforms.uFogCol.value.set(theme.fogColor);

        currentEnvIntensity = theme.envIntensity;
        rebakeEnvironment(currentEnvIntensity);
    }

    function applyWeather(weather: WeatherPreset = getWeatherPreset()) {
        skyMaterial.uniforms.uCloudBoost.value = weather.cloudBoost;
        skyMaterial.uniforms.uOvercast.value = weather.overcast;
        rebakeEnvironment(currentEnvIntensity * (1.0 - weather.overcast * 0.14));
    }

    rebakeEnvironment(initialTheme.envIntensity);

    return {
        skyMesh,
        mountains,
        shoreGroup,
        shoreMesh,
        applyTheme,
        applyWeather,
        update(time: number) {
            skyMaterial.uniforms.uTime.value = time;
            reedsMaterial.uniforms.uTime.value = time;
        },
        dispose() {
            envTarget?.dispose();
            skyMesh.geometry.dispose();
            skyMaterial.dispose();
        },
    };
}
