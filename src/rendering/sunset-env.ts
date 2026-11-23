import * as THREE from 'three';

/** Off-axis low golden-hour sun (~9.5° elevation, ~-26.5° azimuth off +X throw axis).
 *  Keeps the main throw corridor clear of blinding glare while raking ripples & sheets in warm gold. */
export const SUN_DIRECTION = new THREE.Vector3(0.88, 0.165, -0.44).normalize();
export const SUN_COLOR = new THREE.Color('#ffad60');
export const FOG_COLOR = new THREE.Color('#7f5253');

function hash2(x: number, y: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
}

function createSkyMaterial() {
    return new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
            uSunDir: { value: SUN_DIRECTION.clone() },
            uTime: { value: 0 },
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

                // Twilight palette: Prussian indigo zenith -> dusty plum -> rose-coral -> golden apricot horizon
                vec3 zenith = vec3(0.045, 0.078, 0.165);
                vec3 upperMid = vec3(0.145, 0.135, 0.255);
                vec3 lowerMid = vec3(0.46, 0.24, 0.27);
                vec3 horizon = vec3(0.92, 0.52, 0.30);

                vec3 sky = mix(horizon, lowerMid, smoothstep(0.0, 0.14, up));
                sky = mix(sky, upperMid, smoothstep(0.10, 0.38, up));
                sky = mix(sky, zenith, smoothstep(0.32, 0.85, up));

                // Directional sunset glow (azimuthal warmth toward sun)
                float sunDot = dot(dir, uSunDir);
                float sunAlign = max(0.0, sunDot);
                float horizonBand = exp(-abs(h) * 8.5);
                sky += vec3(0.72, 0.32, 0.12) * pow(sunAlign, 3.0) * (0.42 + 0.58 * horizonBand);
                sky += vec3(1.15, 0.62, 0.26) * pow(sunAlign, 18.0) * 0.62;

                // Crisp HDR solar disk + soft Mie corona (triggers selective bloom cleanly)
                float sunDisk = smoothstep(0.9986, 0.99955, sunDot);
                float sunHalo = pow(sunAlign, 160.0) * 1.45;
                sky += vec3(2.8, 1.75, 0.92) * sunDisk + vec3(1.35, 0.72, 0.34) * sunHalo;

                // Subtle high-altitude sunset cirrus clouds
                if (dir.y > 0.018) {
                    vec2 cloudUV = dir.xz / (dir.y + 0.14) * vec2(0.55, 1.35);
                    cloudUV += vec2(uTime * 0.0035, -uTime * 0.0012);
                    float c1 = fbm(cloudUV * 1.45);
                    float c2 = fbm(cloudUV * 3.1 + vec2(c1 * 1.35, 4.2));
                    float mask = smoothstep(0.48, 0.82, c1 * 0.62 + c2 * 0.48);
                    mask *= smoothstep(0.018, 0.11, dir.y) * smoothstep(0.72, 0.18, dir.y);

                    // Lit warm underside near sun, muted plum shadow away from sun
                    float silver = pow(sunAlign, 4.0);
                    vec3 cloudDark = vec3(0.14, 0.11, 0.19);
                    vec3 cloudLit = mix(vec3(0.86, 0.45, 0.32), vec3(1.45, 0.88, 0.48), silver);
                    vec3 cloudColor = mix(cloudDark, cloudLit, smoothstep(0.25, 0.78, c2 + silver * 0.45));
                    sky = mix(sky, cloudColor, mask * 0.62);
                }

                // Below horizon: dark twilight water bounce for clean PMREM/reflections
                if (h < 0.0) {
                    vec3 below = mix(horizon * 0.55, vec3(0.03, 0.05, 0.08), smoothstep(0.0, -0.35, h));
                    sky = mix(sky, below, smoothstep(0.0, -0.04, h));
                }

                gl_FragColor = vec4(sky, 1.0);
            }
        `,
    });
}

function createMountainRings(): THREE.Group {
    const group = new THREE.Group();
    const layers = [
        { radius: 148, baseHeight: 16.5, ridgeScale: 1.0, seed: 1.7, topColor: '#3a2d44', bottomColor: '#a46350' },
        { radius: 132, baseHeight: 10.5, ridgeScale: 1.35, seed: 4.3, topColor: '#292237', bottomColor: '#7a4a4e' },
        { radius: 116, baseHeight: 5.8, ridgeScale: 1.85, seed: 8.9, topColor: '#1b1a2c', bottomColor: '#4c3442' },
    ];

    const sunAzimuth = Math.atan2(SUN_DIRECTION.z, SUN_DIRECTION.x);

    for (const layer of layers) {
        const segments = 160;
        const positions = new Float32Array((segments + 1) * 2 * 3);
        const heights = new Float32Array((segments + 1) * 2);
        const indices: number[] = [];

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = t * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            // Gentle mountain saddle right around the sun so the golden sun shines through cleanly
            const dSun = Math.atan2(Math.sin(angle - sunAzimuth), Math.cos(angle - sunAzimuth));
            const sunGap = 1.0 - 0.68 * Math.exp(-(dSun * dSun) / 0.14);

            // Multi-octave ridge profile
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
                uTop: { value: new THREE.Color(layer.topColor) },
                uBottom: { value: new THREE.Color(layer.bottomColor) },
                uSunDir: { value: SUN_DIRECTION.clone() },
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
                uniform vec3 uTop, uBottom, uSunDir;
                varying float vHeight;
                varying vec3 vDir;
                void main() {
                    float sunGlow = pow(max(0.0, dot(normalize(vDir), uSunDir)), 5.0);
                    vec3 col = mix(uBottom, uTop, smoothstep(0.0, 0.85, vHeight));
                    col += vec3(0.42, 0.21, 0.11) * sunGlow * (1.0 - 0.55 * vHeight);
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        group.add(mesh);
    }

    return group;
}

export function shoreElevation(x: number, z: number): number {
    // Organic curved shoreline near x ≈ -0.45..-1.25
    const curve = -0.58 - 0.34 * Math.sin(z * 0.24 + 0.6) - 0.18 * Math.cos(z * 0.57 - 0.4);
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

function createShoreAndReeds() {
    const group = new THREE.Group();

    // 1. Contoured natural gravel/pebble shoreline bank
    const cols = 48, rows = 96;
    const widthX = 24, widthZ = 56;
    const shoreGeom = new THREE.PlaneGeometry(widthX, widthZ, cols, rows);
    shoreGeom.rotateX(-Math.PI / 2);
    const pos = shoreGeom.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const dryColor = new THREE.Color('#5a4e46');
    const wetColor = new THREE.Color('#272223');
    const pebbleTint = new THREE.Color('#6f5d52');
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
        // Shift plane so x ranges from -23.7 to +0.3
        const x = pos.getX(i) - widthX / 2 + 0.3;
        const z = pos.getZ(i);
        const y = shoreElevation(x, z);
        pos.setXYZ(i, x, y, z);

        const grain = hash2(Math.floor(x * 7), Math.floor(z * 7));
        tmp.copy(dryColor).lerp(pebbleTint, grain * 0.45);
        // Dark wet waterline band near y = 0..0.065m
        const wetness = 1 - THREE.MathUtils.smoothstep(y, -0.02, 0.085);
        tmp.lerp(wetColor, wetness * 0.78);
        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
    }
    shoreGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    shoreGeom.computeVertexNormals();

    const shoreMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.86,
        metalness: 0.04,
    });
    const shoreMesh = new THREE.Mesh(shoreGeom, shoreMat);
    group.add(shoreMesh);

    // 2. Scattered shoreline pebbles & river stones
    const pebbleGeom = new THREE.IcosahedronGeometry(1, 1);
    const pebbleMat = new THREE.MeshStandardMaterial({
        color: '#524844',
        roughness: 0.74,
        metalness: 0.06,
    });
    const pebbleCount = 110;
    const pebbles = new THREE.InstancedMesh(pebbleGeom, pebbleMat, pebbleCount);
    const dummy = new THREE.Object3D();
    const colorAttr = new THREE.Color();
    for (let i = 0; i < pebbleCount; i++) {
        const r1 = hash2(i * 1.37, 11.4);
        const r2 = hash2(i * 2.13, 29.8);
        const r3 = hash2(i * 3.71, 53.2);
        const r4 = hash2(i * 5.19, 71.6);
        const z = (r1 - 0.5) * 34;
        const x = -0.68 - r2 * 6.8;
        const y = shoreElevation(x, z);
        const sx = 0.05 + r3 * 0.16;
        const sy = sx * (0.28 + r4 * 0.24);
        const sz = sx * (0.68 + hash2(i, 91.3) * 0.5);
        dummy.position.set(x, y + sy * 0.35, z);
        dummy.rotation.set((r4 - 0.5) * 0.3, r1 * Math.PI * 2, (r3 - 0.5) * 0.3);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        pebbles.setMatrixAt(i, dummy.matrix);
        const shade = 0.52 + 0.48 * hash2(i, 103.7);
        colorAttr.setRGB(shade * 0.95, shade * 0.86, shade * 0.82);
        pebbles.setColorAt(i, colorAttr);
    }
    pebbles.instanceMatrix.needsUpdate = true;
    if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
    group.add(pebbles);

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
            uniform vec3 uSunDir;
            varying float vHeight;
            varying vec3 vWorldPos;
            void main() {
                vec3 baseCol = vec3(0.065, 0.068, 0.062);
                vec3 tipCol = vec3(0.32, 0.21, 0.13);
                vec3 col = mix(baseCol, tipCol, smoothstep(0.35, 1.0, vHeight));
                // Warm sunset backlit rim on reed tips
                vec3 viewDir = normalize(cameraPosition - vWorldPos);
                float backlit = pow(max(0.0, dot(-viewDir, uSunDir)), 3.0);
                col += vec3(0.55, 0.30, 0.12) * backlit * smoothstep(0.45, 1.0, vHeight);
                float dist = length(cameraPosition - vWorldPos);
                float fogFactor = smoothstep(28.0, 145.0, dist);
                col = mix(col, vec3(0.498, 0.322, 0.325), fogFactor * 0.85);
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

    return { group, reedsMaterial };
}

export function createSunsetEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const skyMaterial = createSkyMaterial();
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(165, 48, 32), skyMaterial);
    skyMesh.frustumCulled = false;
    scene.add(skyMesh);

    const mountains = createMountainRings();
    scene.add(mountains);

    const { group: shoreGroup, reedsMaterial } = createShoreAndReeds();
    scene.add(shoreGroup);

    // Bake PMREM environment map once from the procedural sunset sky for PBR reflections on stone & spray
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), skyMaterial);
    envScene.add(envSky);
    const envTarget = pmrem.fromScene(envScene, 0.02);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.85;
    envSky.geometry.dispose();
    pmrem.dispose();

    return {
        skyMesh,
        mountains,
        shoreGroup,
        update(time: number) {
            skyMaterial.uniforms.uTime.value = time;
            reedsMaterial.uniforms.uTime.value = time;
        },
        dispose() {
            envTarget.dispose();
            skyMesh.geometry.dispose();
            skyMaterial.dispose();
        },
    };
}
