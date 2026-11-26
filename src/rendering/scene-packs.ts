import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { shoreElevation } from './sunset-env';

export type ScenePackId = 'none' | 'jiangnan';

export interface ScenePropPlacement {
    asset: string;
    position: [number, number, number];
    rotationY: number;
    scale: number;
    /** Optional animation behavior on water/wind */
    motion?: 'boat' | 'lotus' | 'willow' | 'static';
    /** Optional warm lantern light offset in local coordinates */
    lanternLightOffset?: [number, number, number];
    /** Snap Y to shoreElevation(x, z) + offset */
    snapToShore?: number;
}

export interface ScenePackManifest {
    packId: string;
    assets?: Array<{ file?: string; name?: string }>;
}

function hash2(a: number, b: number): number {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
    return s - Math.floor(s);
}

/**
 * Curated postcard composition for 「曲院荷风 · 江南水榭」 calibrated to the default
 * lakeside overview frustum (camera (-2.28, 2.10, 0.74) -> (2.8, 0, 0), FOV 42°)
 * and course-replay sweep.
 *
 * Strictly keeps the throwing corridor (x ∈ [0, 64], z ∈ [-5.5, +5.5])
 * and the shore foraging patch (x ∈ [-3.5, 0], z ∈ [-3.5, +3.5]) 100% unobstructed.
 */
export function buildJiangnanPlacements(): ScenePropPlacement[] {
    const placements: ScenePropPlacement[] = [
        // 1. Hexagonal lakeside water pavilion framing the upper-left rule-of-thirds (~-27° off center)
        {
            asset: 'pavilion.glb',
            position: [22.4, 0, -12.0],
            rotationY: 0.48,
            scale: 1.04,
            motion: 'static',
            lanternLightOffset: [0, 2.85, 0],
        },
        // 2. Moored Jiangnan Wupeng wooden boat gently bobbing on the mid-right (~+16° off center)
        {
            asset: 'wupeng_boat.glb',
            position: [26.2, 0, 9.2],
            rotationY: 2.68,
            scale: 1.05,
            motion: 'boat',
            lanternLightOffset: [1.95, 0.64, 0],
        },
        // 3. Distant 5-tier octagonal Jiangnan pagoda on a misty far-bank headland (~-13° horizon)
        {
            asset: 'distant_pagoda.glb',
            position: [86.0, 0.85, -19.5],
            rotationY: 0.25,
            scale: 1.08,
            motion: 'static',
        },
        // 4. Graceful weeping willows: one framing near-left shore, one beside pavilion embankment, one on outer right bank
        {
            asset: 'willow_tree.glb',
            position: [-0.8, 0, -7.2],
            rotationY: -0.32,
            scale: 0.92,
            motion: 'willow',
            snapToShore: -0.06,
        },
        {
            asset: 'willow_tree.glb',
            position: [17.4, 0.25, -15.0],
            rotationY: -0.58,
            scale: 1.08,
            motion: 'willow',
        },
        {
            asset: 'willow_tree.glb',
            position: [-1.4, 0, 9.6],
            rotationY: 0.42,
            scale: 0.95,
            motion: 'willow',
            snapToShore: -0.06,
        },
    ];

    // 5. Four natural lotus coves framing both sides of the lake corridor (left & right foreground + pavilion & boat edges)
    interface LotusCluster {
        cx: number;
        cz: number;
        rx: number;
        rz: number;
        leaves: number;
        flowers: number;
        seed: number;
    }
    const clusters: LotusCluster[] = [
        { cx: 10.2, cz: -7.0, rx: 4.2, rz: 1.5, leaves: 18, flowers: 6, seed: 11 },
        { cx: 12.8, cz: 7.0, rx: 4.2, rz: 1.5, leaves: 18, flowers: 6, seed: 29 },
        { cx: 20.6, cz: -9.4, rx: 4.6, rz: 1.9, leaves: 16, flowers: 5, seed: 47 },
        { cx: 24.4, cz: 10.4, rx: 4.4, rz: 1.8, leaves: 14, flowers: 4, seed: 73 },
    ];
    const leafAssets = ['lotus_leaf_flat.glb', 'lotus_leaf_tall.glb', 'lotus_leaf_curled.glb'] as const;

    for (const c of clusters) {
        for (let i = 0; i < c.leaves; i++) {
            const angle = hash2(c.seed + i * 3, 1.7) * Math.PI * 2;
            const radius = Math.sqrt(hash2(c.seed + i * 5, 4.3));
            const x = c.cx + Math.cos(angle) * c.rx * radius;
            const rawZ = c.cz + Math.sin(angle) * c.rz * radius;
            // Hard safety clamp keeping throwing corridor z ∈ [-5.5, +5.5] crystal clear
            const z = rawZ < 0 ? Math.min(-5.68, rawZ) : Math.max(5.68, rawZ);
            const pick = hash2(c.seed + i * 7, 9.1);
            const asset = pick < 0.48 ? leafAssets[0] : pick < 0.78 ? leafAssets[1] : leafAssets[2];
            placements.push({
                asset,
                position: [x, 0, z],
                rotationY: hash2(c.seed + i * 11, 2.3) * Math.PI * 2,
                scale: 0.90 + hash2(c.seed + i * 13, 6.7) * 0.42,
                motion: 'lotus',
            });
        }
        for (let j = 0; j < c.flowers; j++) {
            const angle = hash2(c.seed + j * 17, 13.1) * Math.PI * 2;
            const radius = Math.sqrt(hash2(c.seed + j * 19, 17.9)) * 0.80;
            const x = c.cx + Math.cos(angle) * c.rx * radius;
            const rawZ = c.cz + Math.sin(angle) * c.rz * radius;
            const z = rawZ < 0 ? Math.min(-5.85, rawZ) : Math.max(5.85, rawZ);
            const isOpen = hash2(c.seed + j * 23, 21.7) < 0.66;
            placements.push({
                asset: isOpen ? 'lotus_flower_open.glb' : 'lotus_flower_bud.glb',
                position: [x, 0, z],
                rotationY: hash2(c.seed + j * 29, 5.1) * Math.PI * 2,
                scale: 0.95 + hash2(c.seed + j * 31, 8.9) * 0.30,
                motion: 'lotus',
            });
        }
    }

    return placements;
}

/** Build subtle organic mossy earthen headlands anchoring lakeside willows & distant pagoda. */
function createJiangnanLandmarks(): THREE.Group {
    const group = new THREE.Group();
    const mossMat = new THREE.MeshStandardMaterial({
        color: '#344237',
        roughness: 0.94,
        metalness: 0.0,
    });
    const farBankMat = new THREE.MeshStandardMaterial({
        color: '#2d3f3c',
        roughness: 0.96,
        metalness: 0.0,
    });

    const mounds: Array<{ pos: [number, number, number]; scale: [number, number, number]; mat: THREE.Material }> = [
        // Low mossy earthen bank behind the water pavilion & supporting the mid-left willow
        { pos: [17.2, -0.55, -16.8], scale: [7.5, 1.15, 4.8], mat: mossMat },
        // Misty far-bank headland ridge elevating the distant 5-tier pagoda above the lake surface
        { pos: [86.0, -0.65, -19.5], scale: [18.0, 2.25, 10.5], mat: farBankMat },
    ];

    const sphereGeo = new THREE.SphereGeometry(1, 24, 14);
    for (const m of mounds) {
        const mesh = new THREE.Mesh(sphereGeo, m.mat);
        mesh.position.set(...m.pos);
        mesh.scale.set(...m.scale);
        mesh.receiveShadow = true;
        group.add(mesh);
    }
    return group;
}

interface AnimatedProp {
    object: THREE.Object3D;
    basePos: THREE.Vector3;
    baseRotY: number;
    motion: 'boat' | 'lotus' | 'willow';
    phase: number;
}

/**
 * Extensible Blender GLB scene-pack loader & animator.
 * Gracefully handles packs whose offline Blender assets are not yet generated,
 * and caches built packs so theme switching stays instantaneous.
 */
export function createScenePackManager(scene: THREE.Scene) {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'scene-packs';
    scene.add(rootGroup);

    const loader = new GLTFLoader();
    const packGroups = new Map<ScenePackId, THREE.Group>();
    const packAnimations = new Map<ScenePackId, AnimatedProp[]>();
    const packLoading = new Set<ScenePackId>();
    let activePack: ScenePackId = 'none';

    function prepareModel(model: THREE.Object3D, castShadow: boolean) {
        model.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = castShadow;
                child.receiveShadow = true;
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (const mat of mats) {
                    if (mat instanceof THREE.MeshStandardMaterial) {
                        // Ensure alpha-cutout willow foliage & thin petals render cleanly from both sides
                        if (mat.alphaTest > 0 || mat.transparent) {
                            mat.side = THREE.DoubleSide;
                        }
                        // Gently lift lantern emissive luminance so selective Bloom catches warm paper glow
                        if (mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.05) {
                            mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 2.2);
                        }
                    }
                }
            }
        });
    }

    async function loadPack(packId: ScenePackId) {
        if (packId === 'none' || packGroups.has(packId) || packLoading.has(packId)) return;
        packLoading.add(packId);

        const baseUrl = `/assets/scenes/${packId}`;
        try {
            const res = await fetch(`${baseUrl}/manifest.json`, { cache: 'no-cache' });
            if (!res.ok) {
                packLoading.delete(packId);
                return;
            }
            await res.json() as ScenePackManifest;
        } catch {
            packLoading.delete(packId);
            return;
        }

        const placements = packId === 'jiangnan' ? buildJiangnanPlacements() : [];
        const uniqueFiles = Array.from(new Set(placements.map(p => p.asset)));
        const prototypes = new Map<string, THREE.Object3D>();

        await Promise.all(uniqueFiles.map(async file => {
            try {
                const gltf = await loader.loadAsync(`${baseUrl}/${file}`);
                prototypes.set(file, gltf.scene);
            } catch {
                // Skip individual missing assets cleanly
            }
        }));

        const group = new THREE.Group();
        group.name = `scene-pack-${packId}`;
        if (packId === 'jiangnan') {
            group.add(createJiangnanLandmarks());
        }

        const animated: AnimatedProp[] = [];
        for (let i = 0; i < placements.length; i++) {
            const p = placements[i];
            const proto = prototypes.get(p.asset);
            if (!proto) continue;

            const instance = proto.clone(true);
            const isDistant = p.asset.includes('distant');
            prepareModel(instance, !isDistant);

            const y = p.snapToShore !== undefined
                ? shoreElevation(p.position[0], p.position[2]) + p.snapToShore
                : p.position[1];
            instance.position.set(p.position[0], y, p.position[2]);
            instance.rotation.y = p.rotationY;
            instance.scale.setScalar(p.scale);
            group.add(instance);

            if (p.lanternLightOffset) {
                const light = new THREE.PointLight('#ffbd69', 3.6, 14.5, 1.55);
                light.position.set(
                    p.lanternLightOffset[0],
                    p.lanternLightOffset[1],
                    p.lanternLightOffset[2]
                );
                instance.add(light);
            }

            if (p.motion && p.motion !== 'static') {
                animated.push({
                    object: instance,
                    basePos: instance.position.clone(),
                    baseRotY: p.rotationY,
                    motion: p.motion,
                    phase: hash2(i * 13 + 7, 3.7) * Math.PI * 2,
                });
            }
        }

        group.visible = activePack === packId;
        rootGroup.add(group);
        packGroups.set(packId, group);
        packAnimations.set(packId, animated);
        packLoading.delete(packId);
    }

    function setPack(packId: ScenePackId) {
        activePack = packId;
        for (const [id, group] of packGroups) {
            group.visible = id === packId;
        }
        if (packId !== 'none' && !packGroups.has(packId)) {
            void loadPack(packId);
        }
    }

    function update(time: number, breezeScale = 1.0) {
        if (activePack === 'none') return;
        const animated = packAnimations.get(activePack);
        if (!animated) return;

        for (const item of animated) {
            if (item.motion === 'boat') {
                const t = time * 0.92 + item.phase;
                item.object.position.y = item.basePos.y + Math.sin(t) * 0.026;
                item.object.rotation.z = Math.sin(t * 0.80 + 0.7) * 0.024 * breezeScale;
                item.object.rotation.x = Math.cos(t * 0.62) * 0.014 * breezeScale;
                item.object.rotation.y = item.baseRotY + Math.sin(t * 0.34) * 0.018;
            } else if (item.motion === 'lotus') {
                const t = time * 1.12 + item.phase;
                item.object.position.y = item.basePos.y + Math.sin(t) * 0.010;
                item.object.rotation.z = Math.sin(t * 0.88 + 1.1) * 0.038 * breezeScale;
                item.object.rotation.x = Math.cos(t * 0.74) * 0.028 * breezeScale;
            } else if (item.motion === 'willow') {
                const t = time * 0.76 + item.phase;
                item.object.rotation.z = Math.sin(t) * 0.016 * breezeScale;
                item.object.rotation.x = Math.cos(t * 0.64) * 0.011 * breezeScale;
            }
        }
    }

    return {
        rootGroup,
        get activePack() { return activePack; },
        setPack,
        update,
        dispose() {
            for (const group of packGroups.values()) {
                rootGroup.remove(group);
            }
            packGroups.clear();
            packAnimations.clear();
            scene.remove(rootGroup);
        },
    };
}
