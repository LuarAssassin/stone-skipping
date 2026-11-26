import * as THREE from 'three';
import type { SceneTheme } from './themes';

export type WeatherId = 'clear' | 'mist' | 'rain' | 'fireflies';

export interface WeatherPreset {
    id: WeatherId;
    name: string;
    icon: string;
    fogNearScale: number;
    fogFarScale: number;
    cloudBoost: number;
    overcast: number;
    rainIntensity: number;
    breezeScale: number;
    mistOpacity: number;
    fireflyOpacity: number;
    sunDim: number;
}

export const WEATHER_STORAGE_KEY = 'stone-skipping-weather-v1';

export const WEATHER_PRESETS: readonly WeatherPreset[] = [
    {
        id: 'clear',
        name: '晴朗',
        icon: '☀',
        fogNearScale: 1.0,
        fogFarScale: 1.0,
        cloudBoost: 0.0,
        overcast: 0.0,
        rainIntensity: 0.0,
        breezeScale: 1.0,
        mistOpacity: 0.0,
        fireflyOpacity: 0.0,
        sunDim: 1.0,
    },
    {
        id: 'mist',
        name: '薄雾',
        icon: '🌫',
        fogNearScale: 0.56,
        fogFarScale: 0.72,
        cloudBoost: 0.24,
        overcast: 0.22,
        rainIntensity: 0.0,
        breezeScale: 0.72,
        mistOpacity: 0.34,
        fireflyOpacity: 0.0,
        sunDim: 0.84,
    },
    {
        id: 'rain',
        name: '烟雨',
        icon: '🌧',
        fogNearScale: 0.50,
        fogFarScale: 0.68,
        cloudBoost: 0.52,
        overcast: 0.46,
        rainIntensity: 0.88,
        breezeScale: 1.65,
        mistOpacity: 0.22,
        fireflyOpacity: 0.0,
        sunDim: 0.62,
    },
    {
        id: 'fireflies',
        name: '萤火',
        icon: '✦',
        fogNearScale: 0.92,
        fogFarScale: 0.96,
        cloudBoost: 0.04,
        overcast: 0.04,
        rainIntensity: 0.0,
        breezeScale: 0.85,
        mistOpacity: 0.12,
        fireflyOpacity: 1.0,
        sunDim: 0.94,
    },
];

export const DEFAULT_WEATHER_ID: WeatherId = 'clear';

export function getWeatherPreset(id?: string): WeatherPreset {
    return WEATHER_PRESETS.find(w => w.id === id) ?? WEATHER_PRESETS[0];
}

export function loadSavedWeatherId(): WeatherId {
    try {
        if (typeof localStorage === 'undefined') return DEFAULT_WEATHER_ID;
        const saved = localStorage.getItem(WEATHER_STORAGE_KEY);
        if (saved && WEATHER_PRESETS.some(w => w.id === saved)) {
            return saved as WeatherId;
        }
    } catch {
        // ignore storage errors
    }
    return DEFAULT_WEATHER_ID;
}

export function saveWeatherId(id: WeatherId) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(WEATHER_STORAGE_KEY, id);
        }
    } catch {
        // ignore storage errors
    }
}

function hash1(n: number): number {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
}

/**
 * Modular dynamic weather renderer:
 * - GPU-animated slanting rain streaks that follow the camera seamlessly
 * - Soft drifting lake-surface mist sheets
 * - Gentle bobbing luminous fireflies / sunlit lake motes
 */
export function createWeatherSystem(scene: THREE.Scene) {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'weather-system';
    scene.add(rootGroup);

    // 1. Slanting 3D rain streaks (camera-following wrapping box in vertex shader)
    const rainCount = 900;
    const rainPositions = new Float32Array(rainCount * 2 * 3);
    const rainSeeds = new Float32Array(rainCount * 2 * 3);
    const rainTips = new Float32Array(rainCount * 2);
    for (let i = 0; i < rainCount; i++) {
        const sx = hash1(i * 3 + 1);
        const sy = hash1(i * 3 + 2);
        const sz = hash1(i * 3 + 3);
        const v0 = i * 2;
        const v1 = v0 + 1;
        rainSeeds[v0 * 3] = sx; rainSeeds[v0 * 3 + 1] = sy; rainSeeds[v0 * 3 + 2] = sz;
        rainSeeds[v1 * 3] = sx; rainSeeds[v1 * 3 + 1] = sy; rainSeeds[v1 * 3 + 2] = sz;
        rainTips[v0] = 0;
        rainTips[v1] = 1;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(rainSeeds, 3));
    rainGeo.setAttribute('aTip', new THREE.BufferAttribute(rainTips, 1));
    const rainMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0 },
            uAnchor: { value: new THREE.Vector3(6, 0, 0) },
            uColor: { value: new THREE.Color('#d2e4f0') },
        },
        vertexShader: /* glsl */ `
            attribute vec3 aSeed;
            attribute float aTip;
            uniform float uTime;
            uniform vec3 uAnchor;
            varying float vAlpha;
            void main() {
                float spanX = 28.0;
                float spanY = 14.0;
                float spanZ = 24.0;
                float speed = 11.5 + aSeed.z * 5.0;
                float fall = fract(aSeed.y - uTime * (speed / spanY));
                float driftX = fract(aSeed.x - uTime * 0.085);
                float driftZ = fract(aSeed.z + uTime * 0.025);
                vec3 local = vec3(
                    (driftX - 0.5) * spanX,
                    fall * spanY + 0.12,
                    (driftZ - 0.5) * spanZ
                );
                // Streak tail slanted gently with lake breeze
                float len = 0.24 + aSeed.x * 0.16;
                local += vec3(-0.08, 1.0, 0.03) * (aTip * len);
                vec3 worldPos = vec3(uAnchor.x, 0.0, uAnchor.z) + local;
                float edgeFade = smoothstep(0.0, 0.12, fall) * smoothstep(1.0, 0.85, fall);
                vAlpha = edgeFade * (0.35 + 0.65 * (1.0 - aTip));
                gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
            }
        `,
        fragmentShader: /* glsl */ `
            uniform float uOpacity;
            uniform vec3 uColor;
            varying float vAlpha;
            void main() {
                float a = vAlpha * uOpacity * 0.36;
                if (a < 0.005) discard;
                gl_FragColor = vec4(uColor, a);
            }
        `,
    });
    const rainLines = new THREE.LineSegments(rainGeo, rainMat);
    rainLines.frustumCulled = false;
    rainLines.visible = false;
    rootGroup.add(rainLines);

    // 2. Soft low-lying drifting lake mist bands (layered translucent quads)
    const mistGroup = new THREE.Group();
    const mistMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0 },
            uColor: { value: new THREE.Color('#c8d8dc') },
        },
        vertexShader: /* glsl */ `
            varying vec2 vUv;
            varying float vDist;
            void main() {
                vUv = uv;
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vDist = length(cameraPosition - wp.xyz);
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: /* glsl */ `
            uniform float uTime;
            uniform float uOpacity;
            uniform vec3 uColor;
            varying vec2 vUv;
            varying float vDist;
            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float noise(vec2 p) {
                vec2 i = floor(p), f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
                    f.y
                );
            }
            void main() {
                vec2 uv = vUv;
                float n1 = noise(vec2(uv.x * 3.8 + uTime * 0.045, uv.y * 2.2));
                float n2 = noise(vec2(uv.x * 7.5 - uTime * 0.032, uv.y * 4.0 + 3.1));
                float wisp = smoothstep(0.26, 0.84, n1 * 0.65 + n2 * 0.35);
                float edgeX = smoothstep(0.0, 0.24, uv.x) * smoothstep(1.0, 0.76, uv.x);
                float edgeY = smoothstep(0.0, 0.30, uv.y) * smoothstep(1.0, 0.28, uv.y);
                float nearFade = smoothstep(4.5, 11.0, vDist);
                float a = wisp * edgeX * edgeY * nearFade * uOpacity * 0.58;
                if (a < 0.004) discard;
                gl_FragColor = vec4(uColor, a);
            }
        `,
    });
    const mistSpecs: [number, number, number, number, number, number][] = [
        [16, 1.15, -7.5, 22, 2.8, 0.22],
        [24, 1.35, 8.2, 26, 3.2, -0.26],
        [36, 1.80, -3.0, 34, 4.0, 0.10],
        [52, 2.30, 5.0, 44, 5.2, -0.14],
        [68, 2.90, -8.0, 56, 6.2, 0.08],
    ];
    const mistGeo = new THREE.PlaneGeometry(1, 1);
    for (const [x, y, z, w, h, rotY] of mistSpecs) {
        const quad = new THREE.Mesh(mistGeo, mistMat);
        quad.position.set(x, y, z);
        quad.scale.set(w, h, 1);
        quad.rotation.y = Math.PI * 0.5 + rotY;
        mistGroup.add(quad);
    }
    mistGroup.visible = false;
    rootGroup.add(mistGroup);

    // 3. Fireflies / sunlit floating lake motes
    const moteCount = 140;
    const motePos = new Float32Array(moteCount * 3);
    const motePhase = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const nearShore = i < 65;
        const x = nearShore
            ? -2.2 + hash1(i * 5 + 1) * 18.0
            : 6.0 + hash1(i * 5 + 1) * 34.0;
        const z = nearShore
            ? side * (2.6 + hash1(i * 5 + 2) * 11.5)
            : (hash1(i * 5 + 2) - 0.5) * 28.0;
        const y = 0.28 + hash1(i * 5 + 3) * 2.4;
        motePos[i * 3] = x;
        motePos[i * 3 + 1] = y;
        motePos[i * 3 + 2] = z;
        motePhase[i * 3] = hash1(i * 5 + 4) * Math.PI * 2;
        motePhase[i * 3 + 1] = 0.55 + hash1(i * 5 + 5) * 0.95;
        motePhase[i * 3 + 2] = 0.7 + hash1(i * 5 + 6) * 0.8;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    moteGeo.setAttribute('aPhase', new THREE.BufferAttribute(motePhase, 3));
    const moteMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0 },
            uColor: { value: new THREE.Color('#ffe088') },
            uPixelRatio: { value: Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, 2) },
        },
        vertexShader: /* glsl */ `
            attribute vec3 aPhase;
            uniform float uTime;
            uniform float uPixelRatio;
            varying float vPulse;
            void main() {
                float t = uTime * aPhase.y + aPhase.x;
                vec3 p = position;
                p.x += sin(t * 0.7) * 0.55;
                p.y += sin(t * 1.15 + 1.3) * 0.26;
                p.z += cos(t * 0.62) * 0.55;
                vec4 mv = modelViewMatrix * vec4(p, 1.0);
                float dist = max(1.0, -mv.z);
                vPulse = 0.28 + 0.72 * pow(0.5 + 0.5 * sin(t * 1.85), 2.2);
                gl_PointSize = clamp((24.0 * aPhase.z * uPixelRatio) / dist, 2.5, 22.0);
                gl_Position = projectionMatrix * mv;
            }
        `,
        fragmentShader: /* glsl */ `
            uniform float uOpacity;
            uniform vec3 uColor;
            varying float vPulse;
            void main() {
                vec2 d = gl_PointCoord - 0.5;
                float r = length(d) * 2.0;
                if (r > 1.0) discard;
                float core = exp(-r * r * 5.5);
                float halo = (1.0 - r) * (1.0 - r) * 0.45;
                float alpha = (core + halo) * vPulse * uOpacity;
                gl_FragColor = vec4(uColor * (1.0 + core * 0.9), alpha);
            }
        `,
    });
    const motes = new THREE.Points(moteGeo, moteMat);
    motes.frustumCulled = false;
    motes.visible = false;
    rootGroup.add(motes);

    let activeWeather = getWeatherPreset();

    function applyWeather(weather: WeatherPreset, theme: SceneTheme) {
        activeWeather = weather;
        rainMat.uniforms.uOpacity.value = weather.rainIntensity;
        rainMat.uniforms.uColor.value.set(theme.fogColor).lerp(new THREE.Color('#eef5fa'), 0.55);
        rainLines.visible = weather.rainIntensity > 0.01;

        mistMat.uniforms.uOpacity.value = weather.mistOpacity;
        mistMat.uniforms.uColor.value.set(theme.fogColor).lerp(new THREE.Color(theme.hemiSky), 0.35);
        mistGroup.visible = weather.mistOpacity > 0.01;

        moteMat.uniforms.uOpacity.value = weather.fireflyOpacity;
        // Cooler lantern-gold in twilight/Jiangnan, silver-mint in moonlight, warm pollen in dawn
        const fireflyColor = theme.id === 'moonlight'
            ? '#b8f2ff'
            : theme.id === 'mist_dawn'
                ? '#fff2c2'
                : '#ffd978';
        moteMat.uniforms.uColor.value.set(fireflyColor);
        motes.visible = weather.fireflyOpacity > 0.01;
    }

    function update(time: number, camera: THREE.Camera) {
        if (rainLines.visible) {
            rainMat.uniforms.uTime.value = time;
            // Center the falling rain volume slightly ahead of camera along its look direction
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            rainMat.uniforms.uAnchor.value.set(
                camera.position.x + forward.x * 10,
                0,
                camera.position.z + forward.z * 10
            );
        }
        if (mistGroup.visible) {
            mistMat.uniforms.uTime.value = time;
        }
        if (motes.visible) {
            moteMat.uniforms.uTime.value = time;
        }
    }

    return {
        rootGroup,
        get active() { return activeWeather; },
        applyWeather,
        update,
        dispose() {
            rainGeo.dispose();
            rainMat.dispose();
            mistGeo.dispose();
            mistMat.dispose();
            moteGeo.dispose();
            moteMat.dispose();
            scene.remove(rootGroup);
        },
    };
}
