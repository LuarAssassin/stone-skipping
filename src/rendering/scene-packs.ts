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
 * Curated spatial layout for the 「曲院荷风 · 江南水榭」 scene pack.
 * Strictly keeps the throwing corridor (x ∈ [0, 64], z ∈ [-5.4, +5.4])
 * and the shore foraging patch (x ∈ [-3.5, -0.4], z ∈ [-3.4, +3.4]) 100% unobstructed.
 */
export function buildJiangnanPlacements(): ScenePropPlacement[] {
    const placements: ScenePropPlacement[] = [
        // 1. Hexagonal lakeside water pavilion framing the near-left bank
        {
            asset: 'pavilion.glb',
            position: [9.8, 0, -11.4],
            rotationY: 0.42,
            scale: 1.0,
            motion: 'static',
            lanternLightOffset: [0, 2.55, 1.35],
        },
        // 2. Moored Jiangnan Wupeng wooden boat gently bobbing in the mid-right cove
        {
            asset: 'wupeng_boat.glb',
            position: [16.6, 0, 9.8],
            rotationY: -2.42,
            scale: 1.0,
            motion: 'boat',
            lanternLightOffset: [1.85, 0.92, 0],
        },
        // 3. Distant 5-tier Jiangnan pagoda silhouette on the far misty horizon bank
        {
            asset: 'distant_pagoda.glb',
            position: [84.0, -0.25, -24.5],
            rotationY: 0.3,
            scale: 1.05,
            motion: 'static',
        },
        // 4. Three graceful weeping willows along outer shoreline banks
        {
            asset: 'willow_tree.glb',
            position: [-1.7, 0, -7.8],
            rotationY: 0.45,
            scale: 0.96,
            motion: 'willow',
            snapToShore: -0.08,
        },
        {
            asset: 'willow_tree.glb',
            position: [3.2, 0, -13.6],
            rotationY: 1.15,
            scale: 1.08,
            motion: 'willow',
            snapToShore: -0.05,
        },
        {
            asset: 'willow_tree.glb',
            position: [-2.1, 0, 8.9],
            rotationY: -0.75,
            scale: 0.92,
            motion: 'willow',
            snapToShore: -0.08,
        },
    ];

    // 5. Four natural lotus coves flanking left & right sides of the water corridor
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
        { cx: 4.8, cz: -7.1, rx: 3.0, rz: 1.5, leaves: 16, flowers: 5, seed: 11 },
        { cx: 5.6, cz: 7.4, rx: 3.2, rz: 1.6, leaves: 16, flowers: 5, seed: 29 },
        { cx: 14.2, cz: -9.2, rx: 3.4, rz: 1.8, leaves: 14, flowers: 4, seed: 47 },
        { cx: 21.8, cz: 10.6, rx: 3.6, rz: 1.9, leaves: 14, flowers: 4, seed: 73 },
    ];
    const leafAssets = ['lotus_leaf_flat.glb', 'lotus_leaf_tall.glb', 'lotus_leaf_curled.glb'] as const;

    for (const c of clusters) {
        for (let i = 0; i < c.leaves; i++) {
            const angle = hash2(c.seed + i * 3, 1.7) * Math.PI * 2;
            const radius = Math.sqrt(hash2(c.seed + i * 5, 4.3));
            const x = c.cx + Math.cos(angle) * c.rx * radius;
            const rawZ = c.cz + Math.sin(angle) * c.rz * radius;
            // Hard safety clamp keeping throwing corridor z ∈ [-5.5, +5.5] crystal clear
            const z = rawZ < 0 ? Math.min(-5.65, rawZ) : Math.max(5.65, rawZ);
            const pick = hash2(c.seed + i * 7, 9.1);
            const asset = pick < 0.50 ? leafAssets[0] : pick < 0.80 ? leafAssets[1] : leafAssets[2];
            placements.push({
                asset,
                position: [x, 0, z],
                rotationY: hash2(c.seed + i * 11, 2.3) * Math.PI * 2,
                scale: 0.82 + hash2(c.seed + i * 13, 6.7) * 0.42,
                motion: 'lotus',
            });
        }
        for (let j = 0; j < c.flowers; j++) {
            const angle = hash2(c.seed + j * 17, 13.1) * Math.PI * 2;
            const radius = Math.sqrt(hash2(c.seed + j * 19, 17.9)) * 0.78;
            const x = c.cx + Math.cos(angle) * c.rx * radius;
            const rawZ = c.cz + Math.sin(angle) * c.rz * radius;
            const z = rawZ < 0 ? Math.min(-5.85, rawZ) : Math.max(5.85, rawZ);
            const isOpen = hash2(c.seed + j * 23, 21.7) < 0.65;
            placements.push({
                asset: isOpen ? 'lotus_flower_open.glb' : 'lotus_flower_bud.glb',
                position: [x, 0, z],
                rotationY: hash2(c.seed + j * 29, 5.1) * Math.PI * 2,
                scale: 0.88 + hash2(c.seed + j * 31, 8.9) * 0.28,
                motion: 'lotus',
            });
        }
    }

    return placements;
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
                        // Ensure alpha cutout foliage (like willow leaves) renders cleanly from both sides
                        if (mat.alphaTest > 0 || mat.transparent) {
                            mat.side = THREE.DoubleSide;
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
                // Pack assets not generated yet — stay silently clean until Blender build lands
                packLoading.delete(packId);
                return;
            }
            // Validate JSON before requesting GLBs
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
                const light = new THREE.PointLight('#ffbd69', 3.4, 13.5, 1.6);
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
                const t = time * 0.95 + item.phase;
                item.object.position.y = item.basePos.y + Math.sin(t) * 0.028;
                item.object.rotation.z = Math.sin(t * 0.82 + 0.7) * 0.026 * breezeScale;
                item.object.rotation.x = Math.cos(t * 0.65) * 0.015 * breezeScale;
                item.object.rotation.y = item.baseRotY + Math.sin(t * 0.35) * 0.02;
            } else if (item.motion === 'lotus') {
                const t = time * 1.15 + item.phase;
                item.object.position.y = item.basePos.y + Math.sin(t) * 0.011;
                item.object.rotation.z = Math.sin(t * 0.9 + 1.1) * 0.042 * breezeScale;
                item.object.rotation.x = Math.cos(t * 0.75) * 0.032 * breezeScale;
            } else if (item.motion === 'willow') {
                const t = time * 0.78 + item.phase;
                item.object.rotation.z = Math.sin(t) * 0.018 * breezeScale;
                item.object.rotation.x = Math.cos(t * 0.65) * 0.012 * breezeScale;
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
