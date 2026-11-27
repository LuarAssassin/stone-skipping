import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { shoreElevation } from './sunset-env';

export type ScenePackId =
    | 'none'
    | 'jiangnan'
    | 'tahoe'
    | 'kyoto'
    | 'nordic'
    | 'lagoon'
    | 'fuji'
    | 'zhangjiajie'
    | 'venice'
    | 'alps'
    | 'nile';

export interface ScenePropPlacement {
    asset: string;
    position: [number, number, number];
    rotationY: number;
    scale: number;
    /** Optional animation behavior on water/wind */
    motion?: 'boat' | 'lotus' | 'willow' | 'ice' | 'static';
    /** Optional warm lantern/window light offset in local coordinates */
    lanternLightOffset?: [number, number, number];
    /** Optional custom lantern color (defaults to warm amber #ffbd69) */
    lanternColor?: string;
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
 * Curated postcard composition for 「曲院荷风 · 江南西湖」 calibrated to the default
 * lakeside overview frustum (camera (-2.28, 2.10, 0.74) -> (2.8, 0, 0), FOV 42°)
 * and course-replay sweep.
 *
 * Strictly keeps the throwing corridor (x ∈ [0, 64], z ∈ [-5.5, +5.5])
 * and the shore foraging patch (x ∈ [-3.5, 0], z ∈ [-3.5, +3.5]) 100% unobstructed.
 */
export function buildJiangnanPlacements(): ScenePropPlacement[] {
    const placements: ScenePropPlacement[] = [
        {
            asset: 'pavilion.glb',
            position: [22.4, 0, -12.0],
            rotationY: 0.48,
            scale: 1.04,
            motion: 'static',
            lanternLightOffset: [0, 2.85, 0],
        },
        {
            asset: 'wupeng_boat.glb',
            position: [26.2, 0, 9.2],
            rotationY: 2.68,
            scale: 1.05,
            motion: 'boat',
            lanternLightOffset: [1.95, 0.64, 0],
        },
        {
            asset: 'distant_pagoda.glb',
            position: [86.0, 0.85, -19.5],
            rotationY: 0.25,
            scale: 1.08,
            motion: 'static',
        },
        // Midground West Lake zigzag bridge & lotus pavilion anchored beside the near water pavilion
        {
            asset: 'jiangnan_zigzag_bridge_mid.glb',
            position: [35.4, 0.05, -14.2],
            rotationY: -0.14,
            scale: 1.0,
            motion: 'static',
            lanternLightOffset: [0, 2.57, 2.65],
            lanternColor: '#ffbd69',
        },
        // Classical two-tier Jiangnan painted pleasure barge gliding across the right midground lake
        {
            asset: 'jiangnan_painted_barge_mid.glb',
            position: [48.5, 0, 12.4],
            rotationY: -2.68,
            scale: 1.0,
            motion: 'boat',
            lanternLightOffset: [5.48, 1.36, 0.76],
            lanternColor: '#ffad5a',
        },
        // The quay sits behind the pagoda island (lifted cleanly to waterline). The bridges face the lake on the right.
        {
            asset: 'jiangnan_watertown_horizon.glb',
            position: [94, 0.04, -35],
            rotationY: -1.214,
            scale: 1,
            lanternLightOffset: [7.54, 4.70, 5.51],
            lanternColor: '#ffbd69',
        },
        { asset: 'jiangnan_su_causeway_horizon.glb', position: [91.5, 0.04, 27.5], rotationY: -1.863, scale: 1 },
        // Submerged ridge ends overlap in plan, with a lower crest under the sun.
        { asset: 'jiangnan_misty_hills_horizon.glb', position: [64.65, -0.35, -103.46], rotationY: -0.629, scale: 0.99 },
        { asset: 'jiangnan_misty_hills_horizon.glb', position: [109.54, -0.35, -46.50], rotationY: -1.149, scale: 0.91 },
        { asset: 'jiangnan_misty_hills_horizon.glb', position: [114.00, -0.35, 26.32], rotationY: -1.838, scale: 1.03 },
        { asset: 'jiangnan_misty_hills_horizon.glb', position: [68.77, -0.35, 94.65], rotationY: -2.460, scale: 1.06 },
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

    interface LotusCluster {
        cx: number; cz: number; rx: number; rz: number;
        leaves: number; flowers: number; seed: number;
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

/** Curated postcard composition for 「太浩松涛 · 北美高山冰川湖」. */
export function buildTahoePlacements(): ScenePropPlacement[] {
    return [
        // Extending weathered cedar wooden dock anchored to the left rocky bank (extends 6.4m along local +X)
        {
            asset: 'wooden_dock.glb',
            position: [13.5, 0, -14.8],
            rotationY: -1.18,
            scale: 1.04,
            motion: 'static',
            lanternLightOffset: [5.6, 1.95, 0.0],
        },
        // Classic red-cedar canoe moored gently in the right midground cove
        {
            asset: 'cedar_canoe.glb',
            position: [25.4, 0, 8.8],
            rotationY: 2.55,
            scale: 1.05,
            motion: 'boat',
        },
        // Glacial granite shoreline boulders framing both sides of the throwing corridor
        { asset: 'granite_boulder_large.glb', position: [10.4, 0, -7.4], rotationY: 0.6, scale: 0.95, motion: 'static' },
        { asset: 'granite_boulder_cluster.glb', position: [14.2, 0, 7.2], rotationY: -1.1, scale: 1.05, motion: 'static' },
        { asset: 'granite_boulder_large.glb', position: [29.5, 0, -13.2], rotationY: 2.1, scale: 1.18, motion: 'static' },
        { asset: 'granite_boulder_cluster.glb', position: [31.0, 0, 11.4], rotationY: 0.8, scale: 1.12, motion: 'static' },
        // Alpine conifers anchoring the near shore and mid-lake rocky headlands
        { asset: 'alpine_pine_tall.glb', position: [-1.8, 0, -8.4], rotationY: 0.4, scale: 0.96, motion: 'willow', snapToShore: -0.06 },
        { asset: 'alpine_pine_mid.glb', position: [11.2, 0.25, -15.6], rotationY: -0.5, scale: 1.04, motion: 'willow' },
        { asset: 'alpine_pine_tall.glb', position: [17.8, 0.30, -16.8], rotationY: 1.2, scale: 1.08, motion: 'willow' },
        { asset: 'alpine_pine_mid.glb', position: [-2.0, 0, 10.2], rotationY: -0.8, scale: 0.95, motion: 'willow', snapToShore: -0.06 },
        { asset: 'alpine_pine_tall.glb', position: [16.8, 0.20, 15.6], rotationY: 2.3, scale: 1.02, motion: 'willow' },
        // Majestic snow-capped alpine granite massifs rotated broadside across the distant horizon
        { asset: 'snow_peak_ridge.glb', position: [96.0, -0.35, -16.0], rotationY: Math.PI / 2 - 0.18, scale: 1.24, motion: 'static' },
        { asset: 'snow_peak_ridge.glb', position: [98.0, -0.45, 24.0], rotationY: Math.PI / 2 + 0.24, scale: 1.06, motion: 'static' },
        // === MIDGROUND LAKE TAHOE ENSEMBLE (left timber lodge headland, right Emerald Bay tea-house island & mahogany sailboat) ===
        {
            asset: 'tahoe_lodge_point_mid.glb',
            position: [45.5, 0.06, -19.2],
            rotationY: -0.24,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [4.856, 4.328, 1.841],
            lanternColor: '#ffc678',
        },
        {
            asset: 'tahoe_emerald_isle_mid.glb',
            position: [52.0, 0.06, 19.5],
            rotationY: -2.64,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [1.253, 6.906, 2.819],
            lanternColor: '#ffc87e',
        },
        {
            asset: 'tahoe_wooden_cruiser_mid.glb',
            position: [44.5, 0, 9.6],
            rotationY: -2.68,
            scale: 1.0,
            motion: 'boat',
            lanternLightOffset: [-4.730, 1.159, 0.468],
            lanternColor: '#ffd296',
        },
    ];
}

/** Curated postcard composition for 「岚山枫渡 · 京都红叶溪湖」. */
export function buildKyotoPlacements(): ScenePropPlacement[] {
    const placements: ScenePropPlacement[] = [
        // Iconic vermilion lakeside Myojin Torii rising out of the mirror water (angled 3/4 toward player)
        {
            asset: 'water_torii.glb',
            position: [23.6, 0, -11.0],
            rotationY: -0.95,
            scale: 1.04,
            motion: 'static',
        },
        // Wooden Japanese river skiff gently bobbing with a warm paper bow lantern
        {
            asset: 'yakatabune_skiff.glb',
            position: [25.8, 0, 8.7],
            rotationY: 2.66,
            scale: 1.05,
            motion: 'boat',
            lanternLightOffset: [1.95, 0.68, 0],
        },
        // Mossy yukimi stone lanterns seated atop lakeside basalt boulders with warm amber glow
        {
            asset: 'stone_toro.glb',
            position: [12.0, 0.46, -7.5],
            rotationY: 0.52,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [0, 1.05, 0],
            lanternColor: '#ffa952',
        },
        {
            asset: 'stone_toro.glb',
            position: [14.8, 0.44, 7.1],
            rotationY: -0.85,
            scale: 0.98,
            motion: 'static',
            lanternLightOffset: [0, 1.05, 0],
            lanternColor: '#ffa952',
        },
        // Moss-draped basalt river stones supporting lanterns and shoreline depth
        { asset: 'mossy_river_rock.glb', position: [12.0, 0, -7.5], rotationY: 0.4, scale: 1.18, motion: 'static' },
        { asset: 'mossy_river_rock.glb', position: [14.8, 0, 7.1], rotationY: 1.9, scale: 1.14, motion: 'static' },
        { asset: 'mossy_river_rock.glb', position: [19.4, 0, -11.6], rotationY: -0.7, scale: 1.25, motion: 'static' },
        { asset: 'mossy_river_rock.glb', position: [29.2, 0, 10.8], rotationY: 2.4, scale: 1.18, motion: 'static' },
        // Crimson & amber Japanese maples framing left shore, torii headland, and right shore
        { asset: 'japanese_maple_red.glb', position: [-0.9, 0, -7.4], rotationY: -0.35, scale: 0.95, motion: 'willow', snapToShore: -0.06 },
        { asset: 'japanese_maple_gold.glb', position: [16.4, 0.25, -14.8], rotationY: 0.55, scale: 1.08, motion: 'willow' },
        { asset: 'japanese_maple_red.glb', position: [26.8, 0.28, -15.8], rotationY: -0.85, scale: 1.12, motion: 'willow' },
        { asset: 'japanese_maple_gold.glb', position: [-1.4, 0, 9.4], rotationY: 0.45, scale: 0.96, motion: 'willow', snapToShore: -0.06 },
        // === MIDGROUND ARASHIYAMA ENSEMBLE (left riverside machiya + right connected maple shrine isle -> Togetsukyo -> teahouse row) ===
        {
            asset: 'kyoto_teahouse_row_mid.glb',
            position: [48.5, 0.06, -19.2],
            rotationY: -0.20,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [2.11, 2.93, 3.12],
            lanternColor: '#ffae58',
        },
        {
            asset: 'kyoto_maple_shrine_isle_mid.glb',
            position: [38.0, 0.06, 23.4],
            rotationY: -2.84,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [1.45, 6.63, 2.84],
            lanternColor: '#ffb25c',
        },
        // Togetsukyo-inspired multi-span timber bridge anchored cleanly between the maple shrine isle and far teahouse bank
        {
            asset: 'kyoto_togetsukyo_mid.glb',
            position: [59.8, 0.06, 16.6],
            rotationY: -2.84,
            scale: 1.0,
            motion: 'static',
            lanternLightOffset: [0.73, 5.04, 2.18],
            lanternColor: '#ffba66',
        },
        {
            asset: 'kyoto_teahouse_row_mid.glb',
            position: [84.6, 0.06, 10.8],
            rotationY: -2.84,
            scale: 1.0,
            motion: 'static',
            lanternLightOffset: [2.11, 2.93, 3.12],
            lanternColor: '#ffae58',
        },
    ];

    // Drifting crimson & amber floating maple-leaf rafts along calm outer coves
    const leafSpots: [number, number][] = [
        [7.6, -6.2], [10.4, -6.8], [13.8, -7.6], [17.4, -8.5], [21.5, -9.2], [25.6, -9.8], [29.0, -10.8],
        [9.8, 6.2], [13.0, 6.9], [16.8, 7.5], [20.8, 8.3], [24.2, 9.6], [28.0, 9.9], [31.5, 11.2],
    ];
    for (let i = 0; i < leafSpots.length; i++) {
        const [x, z] = leafSpots[i];
        placements.push({
            asset: 'autumn_floating_leaves.glb',
            position: [x, 0, z],
            rotationY: hash2(i * 11 + 3, 5.7) * Math.PI * 2,
            scale: 0.88 + hash2(i * 7 + 5, 2.9) * 0.42,
            motion: 'lotus',
        });
    }
    return placements;
}

/** Curated postcard composition for 「极光峡湾 · 罗弗敦冰海」. */
export function buildNordicPlacements(): ScenePropPlacement[] {
    const placements: ScenePropPlacement[] = [
        // Falu-red Norwegian rorbu stilt fisherman's cabin with warm amber windows facing the lake
        {
            asset: 'rorbu_cabin.glb',
            position: [23.8, 0, -12.6],
            rotationY: -0.68,
            scale: 1.04,
            motion: 'static',
            lanternLightOffset: [0, 2.1, 2.2],
            lanternColor: '#ffaa55',
        },
        // Clinker-built Nordic wooden fishing skiff bobbing gently in the dark fjord
        {
            asset: 'nordic_fishing_skiff.glb',
            position: [25.4, 0, 8.9],
            rotationY: 2.58,
            scale: 1.04,
            motion: 'boat',
            lanternLightOffset: [-1.85, 0.62, 0],
            lanternColor: '#ffba66',
        },
        // Snow-dusted Nordic spruces along the embankment & shores
        { asset: 'snow_spruce.glb', position: [-1.6, 0, -8.2], rotationY: 0.3, scale: 0.94, motion: 'willow', snapToShore: -0.06 },
        { asset: 'snow_spruce.glb', position: [17.8, 0.25, -15.6], rotationY: 1.4, scale: 1.06, motion: 'willow' },
        { asset: 'snow_spruce.glb', position: [28.4, 0.28, -16.8], rotationY: -0.7, scale: 1.12, motion: 'willow' },
        { asset: 'snow_spruce.glb', position: [-1.9, 0, 9.8], rotationY: 2.2, scale: 0.96, motion: 'willow', snapToShore: -0.06 },
        // Steep basalt fjord sea stacks rising from outer mid-distance water
        { asset: 'fjord_seastack.glb', position: [44.0, 0, 15.8], rotationY: 0.7, scale: 1.08, motion: 'static' },
        { asset: 'fjord_seastack.glb', position: [56.0, 0, -19.2], rotationY: -1.2, scale: 1.18, motion: 'static' },
        // Dramatic sheer Lofoten fjord snow walls rotated broadside, leaving a center aurora V-channel
        { asset: 'fjord_cliff_wall.glb', position: [96.0, -0.45, -26.0], rotationY: Math.PI / 2 - 0.22, scale: 1.20, motion: 'static' },
        { asset: 'fjord_cliff_wall.glb', position: [98.0, -0.50, 24.0], rotationY: Math.PI / 2 + 0.26, scale: 1.10, motion: 'static' },
        // === MIDGROUND LOFOTEN FJORD ENSEMBLE (left glowing rorbu boardwalk village, right striped lighthouse skerry & trawler) ===
        {
            asset: 'nordic_rorbu_village_mid.glb',
            position: [42.5, 0.06, -18.8],
            rotationY: -0.22,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [5.941, 1.137, 3.075],
            lanternColor: '#ffaa55',
        },
        {
            asset: 'nordic_lighthouse_skerry_mid.glb',
            position: [62.0, 0.06, 18.2],
            rotationY: -2.52,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [0.733, 12.278, 0.832],
            lanternColor: '#ffd27a',
        },
        {
            asset: 'nordic_trawler_mid.glb',
            position: [49.5, 0, 9.4],
            rotationY: -2.70,
            scale: 1.0,
            motion: 'boat',
            lanternLightOffset: [1.420, 3.058, 0.938],
            lanternColor: '#ffba66',
        },
    ];

    // Drifting arctic sea-ice floes flanking left & right coves (clear of z ∈ [-5.5, +5.5])
    const floeSpecs: Array<[string, number, number, number]> = [
        ['ice_floe_large.glb', 10.6, -7.4, 0.92],
        ['ice_floe_small.glb', 8.2, -6.2, 1.00],
        ['ice_floe_small.glb', 14.4, -8.2, 0.95],
        ['ice_floe_large.glb', 18.8, -9.8, 1.06],
        ['ice_floe_small.glb', 29.8, -11.4, 1.10],
        ['ice_floe_small.glb', 11.4, 6.4, 0.90],
        ['ice_floe_large.glb', 15.2, 7.6, 1.00],
        ['ice_floe_small.glb', 20.4, 8.2, 0.96],
        ['ice_floe_large.glb', 31.2, 11.2, 1.08],
        ['ice_floe_small.glb', 35.8, 12.6, 1.15],
    ];
    for (let i = 0; i < floeSpecs.length; i++) {
        const [asset, x, z, scale] = floeSpecs[i];
        placements.push({
            asset,
            position: [x, 0, z],
            rotationY: hash2(i * 13 + 9, 4.1) * Math.PI * 2,
            scale,
            motion: 'ice',
        });
    }
    return placements;
}

/** Curated postcard composition for 「珊瑚暮湾 · 南太平洋礁湖」. */
export function buildLagoonPlacements(): ScenePropPlacement[] {
    return [
        // Thatched Polynesian overwater bungalow glowing warmly on the left turquoise cove
        {
            asset: 'overwater_bungalow.glb',
            position: [24.0, 0, -12.4],
            rotationY: -0.72,
            scale: 1.04,
            motion: 'static',
            lanternLightOffset: [0, 2.55, 0.8],
            lanternColor: '#ffc266',
        },
        // Traditional wooden outrigger canoe floating on the right midground lagoon
        {
            asset: 'outrigger_canoe.glb',
            position: [25.6, 0, 8.9],
            rotationY: 2.60,
            scale: 1.04,
            motion: 'boat',
        },
        // Leaning tropical coconut palms framing sandy shore coves & lagoon islet
        { asset: 'coconut_palm_curved.glb', position: [-1.1, 0, -7.4], rotationY: -0.35, scale: 0.96, motion: 'willow', snapToShore: -0.06 },
        { asset: 'coconut_palm_curved.glb', position: [17.4, 0.22, -15.2], rotationY: -0.45, scale: 1.06, motion: 'willow' },
        { asset: 'coconut_palm_tall.glb', position: [20.4, 0.25, -17.2], rotationY: 0.85, scale: 1.05, motion: 'willow' },
        { asset: 'coconut_palm_curved.glb', position: [-1.5, 0, 9.4], rotationY: 0.42, scale: 0.95, motion: 'willow', snapToShore: -0.06 },
        // Coastal hibiscus bushes tucked around shore & islet base
        { asset: 'tropical_hibiscus_bush.glb', position: [-1.4, 0, -6.2], rotationY: 0.6, scale: 0.95, motion: 'static', snapToShore: -0.05 },
        { asset: 'tropical_hibiscus_bush.glb', position: [16.8, 0.20, -14.6], rotationY: 1.7, scale: 1.10, motion: 'static' },
        { asset: 'tropical_hibiscus_bush.glb', position: [-1.7, 0, 8.1], rotationY: -1.1, scale: 0.98, motion: 'static', snapToShore: -0.05 },
        // Porous coral-limestone reef outcrops emerging along shallow margins
        { asset: 'coral_reef_rock.glb', position: [10.8, 0, -7.2], rotationY: 0.5, scale: 0.96, motion: 'static' },
        { asset: 'coral_reef_rock.glb', position: [14.4, 0, 7.1], rotationY: -0.9, scale: 1.02, motion: 'static' },
        { asset: 'coral_reef_rock.glb', position: [29.4, 0, 11.2], rotationY: 1.8, scale: 1.15, motion: 'static' },
        // Iconic Moorea-style jagged volcanic island peak rotated broadside across the distant lagoon
        { asset: 'volcanic_island_peak.glb', position: [96.0, -0.35, -14.5], rotationY: Math.PI / 2 - 0.15, scale: 1.22, motion: 'static' },
        // === MIDGROUND SOUTH PACIFIC ENSEMBLE (left linked overwater bungalows, right coral sea arch & Polynesian catamaran) ===
        {
            asset: 'lagoon_bungalow_walkway_mid.glb',
            position: [46.5, 0.06, -18.6],
            rotationY: -0.24,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [-0.200, 1.156, 5.127],
            lanternColor: '#ffc266',
        },
        {
            asset: 'lagoon_coral_arch_isle_mid.glb',
            position: [55.0, 0.06, 17.8],
            rotationY: -2.42,
            scale: 1.04,
            motion: 'static',
        },
        {
            asset: 'lagoon_catamaran_mid.glb',
            position: [45.0, 0, 9.4],
            rotationY: -2.72,
            scale: 1.0,
            motion: 'boat',
            lanternLightOffset: [-2.760, 1.480, 1.087],
            lanternColor: '#ffc874',
        },
    ];
}

/** Curated postcard composition for 「河口富士 · 日本河口湖」 (Mount Fuji + Spring Sakura). */
export function buildFujiPlacements(): ScenePropPlacement[] {
    const placements: ScenePropPlacement[] = [
        // Iconic symmetric snow-capped Mount Fuji centered slightly left on the horizon for "Inverted Fuji" mirror reflection
        {
            asset: 'mount_fuji_peak.glb',
            position: [92.0, -0.40, -10.5],
            rotationY: Math.PI / 2 - 0.08,
            scale: 1.18,
            motion: 'static',
        },
        // Lakeside wooden boat pier anchored on the left bank extending gracefully over the water
        {
            asset: 'fuji_boat_pier.glb',
            position: [14.2, 0, -14.6],
            rotationY: -1.16,
            scale: 1.04,
            motion: 'static',
            lanternLightOffset: [5.4, 1.85, 0.0],
            lanternColor: '#ffc884',
        },
        // Classic Kawaguchiko wooden rowboat gently bobbing in the right midground
        {
            asset: 'kawaguchi_rowboat.glb',
            position: [25.2, 0, 8.8],
            rotationY: 2.58,
            scale: 1.05,
            motion: 'boat',
            lanternLightOffset: [1.85, 0.52, 0],
            lanternColor: '#ffc67e',
        },
        // Blooming spring cherry blossom trees framing both sides of the lake
        { asset: 'sakura_tree_leaning.glb', position: [-0.9, 0, -7.4], rotationY: -0.34, scale: 0.96, motion: 'willow', snapToShore: -0.06 },
        { asset: 'sakura_tree_bloom.glb', position: [17.8, 0.25, -15.4], rotationY: 0.6, scale: 1.08, motion: 'willow' },
        { asset: 'sakura_tree_bloom.glb', position: [25.6, 0.22, -16.6], rotationY: -0.9, scale: 1.02, motion: 'willow' },
        { asset: 'sakura_tree_leaning.glb', position: [-1.4, 0, 9.4], rotationY: 0.42, scale: 0.94, motion: 'willow', snapToShore: -0.06 },
        // Dark volcanic Fuji lava shore rocks framing the foreground coves
        { asset: 'fuji_lava_rock.glb', position: [10.6, 0, -7.2], rotationY: 0.5, scale: 0.98, motion: 'static' },
        { asset: 'fuji_lava_rock.glb', position: [14.6, 0, 7.2], rotationY: -1.1, scale: 1.06, motion: 'static' },
        { asset: 'fuji_lava_rock.glb', position: [28.8, 0, 11.0], rotationY: 1.9, scale: 1.15, motion: 'static' },
        // === MIDGROUND KAWAGUCHIKO ENSEMBLE (left onsen ryokan, right vermilion torii lava cape & sightseeing boat) ===
        {
            asset: 'fuji_onsen_ryokan_mid.glb',
            position: [46.5, 0.06, -19.8],
            rotationY: -0.22,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [3.16, 3.24, 3.54],
            lanternColor: '#ffc67a',
        },
        {
            asset: 'fuji_torii_cape_mid.glb',
            position: [42.5, 0.06, 16.4],
            rotationY: -2.64,
            scale: 1.04,
            motion: 'static',
            lanternLightOffset: [2.27, 3.26, 3.65],
            lanternColor: '#ffc272',
        },
        {
            asset: 'fuji_pleasure_boat_mid.glb',
            position: [57.5, 0, 9.8],
            rotationY: -2.74,
            scale: 1.0,
            motion: 'boat',
            lanternLightOffset: [4.88, 1.27, 0.72],
            lanternColor: '#ffc67e',
        },
    ];

    // Drifting spring pink sakura petal rafts along calm outer coves
    const petalSpots: [number, number][] = [
        [7.4, -6.1], [10.8, -6.8], [14.5, -7.6], [19.2, -8.8], [24.0, -9.8],
        [9.6, 6.2], [13.2, 6.9], [17.6, 7.6], [22.4, 8.8], [27.5, 10.2],
    ];
    for (let i = 0; i < petalSpots.length; i++) {
        const [x, z] = petalSpots[i];
        placements.push({
            asset: 'sakura_floating_petals.glb',
            position: [x, 0, z],
            rotationY: hash2(i * 11 + 2, 4.7) * Math.PI * 2,
            scale: 0.92 + hash2(i * 7 + 3, 2.3) * 0.36,
            motion: 'lotus',
        });
    }
    return placements;
}

/** Curated postcard composition for 「武陵奇峰 · 中国湖南张家界宝峰湖」. */
export function buildZhangjiajiePlacements(): ScenePropPlacement[] {
    return [
        // Towering vertical quartz-sandstone Wulingyuan pillar ranges across the misty horizon
        {
            asset: 'zjj_pillar_cluster.glb',
            position: [92.0, -0.45, -18.0],
            rotationY: Math.PI / 2 - 0.16,
            scale: 1.18,
            motion: 'static',
        },
        {
            asset: 'zjj_pillar_cluster.glb',
            position: [96.0, -0.50, 24.0],
            rotationY: Math.PI / 2 + 0.28,
            scale: 1.02,
            motion: 'static',
        },
        // Dramatic lone sandstone karst pillars rising straight out of the emerald canyon lake
        { asset: 'zjj_pillar_tall.glb', position: [48.0, 0, -17.8], rotationY: 0.4, scale: 1.06, motion: 'static' },
        { asset: 'zjj_pillar_tall.glb', position: [54.0, 0, 16.5], rotationY: -1.1, scale: 1.00, motion: 'static' },
        // Traditional Tujia stilted wooden diaojiaolou tea house on the left emerald bank
        {
            asset: 'tujia_diaojiaolou.glb',
            position: [23.2, 0, -12.4],
            rotationY: -0.68,
            scale: 1.04,
            motion: 'static',
            lanternLightOffset: [0, 3.3, 1.9],
            lanternColor: '#ff8a48',
        },
        // Mountain bamboo raft with cormorant lantern gliding in the right cove
        {
            asset: 'bamboo_raft.glb',
            position: [25.6, 0, 8.9],
            rotationY: 2.64,
            scale: 1.05,
            motion: 'boat',
            lanternLightOffset: [1.9, 0.66, 0],
            lanternColor: '#ffad54',
        },
        // Cliff-clinging gnarled pines & lush emerald bamboo framing the shore
        { asset: 'cliff_pine_gnarled.glb', position: [-0.9, 0, -7.6], rotationY: -0.32, scale: 0.96, motion: 'willow', snapToShore: -0.06 },
        { asset: 'cliff_pine_gnarled.glb', position: [17.4, 0.30, -15.4], rotationY: -0.55, scale: 1.08, motion: 'willow' },
        { asset: 'mountain_bamboo_clump.glb', position: [-1.4, 0, 8.8], rotationY: 0.5, scale: 0.98, motion: 'willow', snapToShore: -0.06 },
        { asset: 'mountain_bamboo_clump.glb', position: [28.2, 0.25, -16.2], rotationY: 1.4, scale: 1.06, motion: 'willow' },
        // Stratified sandstone cliff shore rocks
        { asset: 'wuling_cliff_rock.glb', position: [10.6, 0, -7.2], rotationY: 0.5, scale: 1.00, motion: 'static' },
        { asset: 'wuling_cliff_rock.glb', position: [14.4, 0, 7.2], rotationY: -0.8, scale: 1.05, motion: 'static' },
        { asset: 'wuling_cliff_rock.glb', position: [30.2, 0, 11.4], rotationY: 2.1, scale: 1.18, motion: 'static' },
        // === MIDGROUND WULINGYUAN CANYON ENSEMBLE (left cliff plankway pavilion, right natural sandstone arch & canopy boat) ===
        {
            asset: 'zjj_cliff_pavilion_mid.glb',
            position: [38.2, 0.05, -16.8],
            rotationY: -0.32,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [3.70, 10.17, 6.24],
            lanternColor: '#ff8a48',
        },
        {
            asset: 'zjj_natural_arch_mid.glb',
            position: [65.5, 0.04, 17.0],
            rotationY: -2.28,
            scale: 1.04,
            motion: 'static',
        },
        {
            asset: 'zjj_canyon_canopy_boat_mid.glb',
            position: [44.5, 0, 10.2],
            rotationY: -2.72,
            scale: 1.0,
            motion: 'boat',
            lanternLightOffset: [0.33, 1.49, 1.51],
            lanternColor: '#ff9c48',
        },
    ];
}

/** Curated 3-tier postcard composition for 「威尼斯水巷 · 意大利威尼斯泻湖」.
 *  Every waterfront bridge and landing step physically docks into neighboring palazzo quays
 *  with waterlines cleanly above y = 0 (no floating bridges or submerged foundations). */
export function buildVenicePlacements(): ScenePropPlacement[] {
    return [
        // Iconic San Giorgio Maggiore campanile & dome silhouette across the golden lagoon
        {
            asset: 'venice_campanile_island.glb',
            position: [90.0, 0.04, -15.0],
            rotationY: Math.PI / 2 - 0.14,
            scale: 1.18,
            motion: 'static',
        },

        // === LEFT GRAND CANAL EMBANKMENT (continuous connected waterfront: steps -> palazzo -> arch bridge -> canal row) ===
        // Istrian limestone landing steps docked flush against the near-left palazzo quay
        { asset: 'venice_stone_steps.glb', position: [19.4, 0.05, -12.6], rotationY: -0.14, scale: 1.04, motion: 'static' },
        // Warm terracotta Venetian palazzetto corner anchoring the near-left canal bank
        {
            asset: 'venice_palazzo_corner.glb',
            position: [22.8, 0.06, -14.8],
            rotationY: -0.14,
            scale: 1.08,
            motion: 'static',
            lanternLightOffset: [0.4, 2.6, 2.4],
            lanternColor: '#ffbb6a',
        },
        // Istrian-stone canal arch bridge spanning directly from the palazzo corner into the midground canal row
        {
            asset: 'venice_stone_arch.glb',
            position: [29.4, 0.06, -13.9],
            rotationY: -0.14,
            scale: 1.08,
            motion: 'static',
            lanternLightOffset: [-2.6, 3.1, 0.8],
            lanternColor: '#ffc274',
        },
        // Midground Venetian waterfront palazzetti row receiving the arch bridge's far abutment cleanly
        {
            asset: 'venice_canal_row_mid.glb',
            position: [46.8, 0.06, -17.0],
            rotationY: -0.12,
            scale: 1.02,
            motion: 'static',
        },

        // === RIGHT GRAND CANAL & RIALTO EMBANKMENT (continuous connected waterfront: steps -> palazzo -> Rialto arcade -> canal row) ===
        // Landing steps docked flush against the near-right palazzo quay beside the gondola cove
        { asset: 'venice_stone_steps.glb', position: [29.0, 0.05, 16.5], rotationY: -2.86, scale: 1.04, motion: 'static' },
        // Near-right Venetian palazzo anchoring the near abutment of the Rialto arcade bridge
        {
            asset: 'venice_palazzo_corner.glb',
            position: [32.0, 0.06, 19.6],
            rotationY: -2.86,
            scale: 1.08,
            motion: 'static',
            lanternLightOffset: [0.4, 2.6, 2.4],
            lanternColor: '#ffbb6a',
        },
        // Rialto-inspired covered stone arcade bridge spanning directly between the near-right palazzo and midground row
        {
            asset: 'venice_rialto_arcade_mid.glb',
            position: [45.2, 0.06, 16.8],
            rotationY: -2.86,
            scale: 1.0,
            motion: 'static',
        },
        // Far-right midground Venetian palazzetti row receiving the Rialto bridge's far abutment flush
        {
            asset: 'venice_canal_row_mid.glb',
            position: [69.2, 0.06, 14.4],
            rotationY: -2.86,
            scale: 1.0,
            motion: 'static',
        },

        // === WATERCRAFT & CANAL NAVIGATION MARKERS ===
        // Sleek black lacquered Venetian Gondola with brass ferro bobbing in the right foreground cove
        {
            asset: 'venice_gondola.glb',
            position: [24.8, 0, 9.2],
            rotationY: 2.62,
            scale: 1.05,
            motion: 'boat',
            lanternLightOffset: [2.1, 0.65, 0],
            lanternColor: '#ffbd66',
        },
        // Striped terracotta-sailed Bragozzo boats sailing cleanly along the midground canal fairway
        {
            asset: 'venice_bragozzo_boat_mid.glb',
            position: [43.5, 0, -9.2],
            rotationY: -0.35,
            scale: 1.0,
            motion: 'boat',
            lanternLightOffset: [-4.17, 1.97, 0.58],
            lanternColor: '#ffbd66',
        },
        {
            asset: 'venice_bragozzo_boat_mid.glb',
            position: [61.5, 0, 8.6],
            rotationY: -2.62,
            scale: 1.0,
            motion: 'boat',
            lanternLightOffset: [-4.17, 1.97, 0.58],
            lanternColor: '#ffbd66',
        },
        // Candy-striped Venetian wooden mooring poles (Pali) flanking foreground coves
        { asset: 'venice_pali_cluster.glb', position: [10.4, 0, -7.0], rotationY: 0.3, scale: 1.00, motion: 'static' },
        { asset: 'venice_pali_cluster.glb', position: [16.8, 0, -9.8], rotationY: 1.8, scale: 1.04, motion: 'static' },
        { asset: 'venice_pali_cluster.glb', position: [13.8, 0, 7.0], rotationY: -0.9, scale: 1.02, motion: 'static' },
        { asset: 'venice_pali_cluster.glb', position: [27.4, 0, 11.4], rotationY: 2.4, scale: 1.04, motion: 'static' },
        // Midground Venetian lagoon Bricola channel beacons marking the fairway
        {
            asset: 'venice_bricola_beacon_mid.glb',
            position: [35.5, 0, -8.6],
            rotationY: 0.47,
            scale: 1.0,
            motion: 'static',
            lanternLightOffset: [0.04, 3.43, 0.06],
            lanternColor: '#ffbd66',
        },
        {
            asset: 'venice_bricola_beacon_mid.glb',
            position: [37.5, 0, 9.6],
            rotationY: 1.25,
            scale: 1.0,
            motion: 'static',
            lanternLightOffset: [0.04, 3.43, 0.06],
            lanternColor: '#ffbd66',
        },
        { asset: 'venice_bricola_beacon_mid.glb', position: [57.5, 0, -8.4], rotationY: -0.38, scale: 1.0, motion: 'static' },
        { asset: 'venice_bricola_beacon_mid.glb', position: [74.5, 0, 9.2], rotationY: 0.92, scale: 1.0, motion: 'static' },
    ];
}

/** Curated postcard composition for 「瑞士琉森 · 阿尔卑斯翡翠雪湖」. */
export function buildAlpsPlacements(): ScenePropPlacement[] {
    return [
        // Dramatic Matterhorn-inspired pyramidal snow peak rising over emerald glacier water
        {
            asset: 'matterhorn_peak.glb',
            position: [94.0, -0.40, -13.0],
            rotationY: Math.PI / 2 - 0.12,
            scale: 1.22,
            motion: 'static',
        },
        // Charming honey-timber Swiss chalet boathouse on the left turquoise bank
        {
            asset: 'swiss_boathouse.glb',
            position: [23.6, 0, -12.6],
            rotationY: -0.68,
            scale: 1.04,
            motion: 'static',
            lanternLightOffset: [0, 2.3, 2.4],
            lanternColor: '#ffc474',
        },
        // Light-timber Swiss lake pier with red-white mooring post
        {
            asset: 'swiss_lake_pier.glb',
            position: [13.2, 0, -14.2],
            rotationY: -1.16,
            scale: 1.04,
            motion: 'static',
            lanternLightOffset: [5.2, 1.10, 0.5],
        },
        // Classic Swiss lake wooden sailboat gently rocking in the right midground
        {
            asset: 'alpine_sailboat.glb',
            position: [26.8, 0, 9.4],
            rotationY: 2.52,
            scale: 1.04,
            motion: 'boat',
        },
        // Golden-green Alpine larches framing the rocky shorelines
        { asset: 'alpine_larch_tree.glb', position: [-1.5, 0, -8.0], rotationY: 0.3, scale: 0.96, motion: 'willow', snapToShore: -0.06 },
        { asset: 'alpine_larch_tree.glb', position: [17.4, 0.25, -15.6], rotationY: 1.2, scale: 1.08, motion: 'willow' },
        { asset: 'alpine_larch_tree.glb', position: [28.6, 0.25, -16.8], rotationY: -0.8, scale: 1.04, motion: 'willow' },
        { asset: 'alpine_larch_tree.glb', position: [-1.8, 0, 9.6], rotationY: -0.5, scale: 0.94, motion: 'willow', snapToShore: -0.06 },
        // Glacial slate shoreline rocks
        { asset: 'alpine_slate_rock.glb', position: [10.4, 0, -7.2], rotationY: 0.6, scale: 0.96, motion: 'static' },
        { asset: 'alpine_slate_rock.glb', position: [14.6, 0, 7.2], rotationY: -1.0, scale: 1.04, motion: 'static' },
        { asset: 'alpine_slate_rock.glb', position: [30.4, 0, 11.4], rotationY: 1.8, scale: 1.15, motion: 'static' },
        // === MIDGROUND LUCERNE ENSEMBLE (left chalet village, right connected Kapellbrücke -> far village & paddle steamer) ===
        {
            asset: 'alps_chalet_village_mid.glb',
            position: [46.5, 0.06, -20.5],
            rotationY: -0.22,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [8.031, 2.007, 3.770],
            lanternColor: '#ffc878',
        },
        // Iconic Kapellbrücke & octagonal Water Tower (Wasserturm) with far landing docked flush into the right chalet quay
        {
            asset: 'alps_kapell_bridge_mid.glb',
            position: [49.5, 0.06, 18.2],
            rotationY: -2.84,
            scale: 1.0,
            motion: 'static',
            lanternLightOffset: [10.073, 7.759, 3.653],
            lanternColor: '#ffc676',
        },
        {
            asset: 'alps_chalet_village_mid.glb',
            position: [75.8, 0.06, 12.2],
            rotationY: -2.84,
            scale: 1.0,
            motion: 'static',
            lanternLightOffset: [8.031, 2.007, 3.770],
            lanternColor: '#ffc878',
        },
        {
            asset: 'alps_steam_paddleboat_mid.glb',
            position: [56.0, 0, 8.4],
            rotationY: -2.74,
            scale: 1.0,
            motion: 'boat',
            lanternLightOffset: [6.150, 1.308, 0.324],
            lanternColor: '#ffca7a',
        },
    ];
}

/** Curated postcard composition for 「尼罗夕照 · 埃及阿斯旺」. */
export function buildNilePlacements(): ScenePropPlacement[] {
    return [
        // Sahara golden dunes & ancient pyramid silhouettes glowing on the distant dusk horizon
        {
            asset: 'nile_horizon_monuments.glb',
            position: [94.0, -0.35, -14.0],
            rotationY: Math.PI / 2 - 0.14,
            scale: 1.20,
            motion: 'static',
        },
        // Ancient carved sandstone Egyptian temple quay with flickering bronze braziers
        {
            asset: 'nile_temple_quay.glb',
            position: [23.4, 0, -12.6],
            rotationY: -0.70,
            scale: 1.04,
            motion: 'static',
            lanternLightOffset: [0, 1.85, 2.0],
            lanternColor: '#ff9638',
        },
        // Iconic Nile Felucca lateen-sail wooden boat gliding on the right cove
        {
            asset: 'nile_felucca.glb',
            position: [26.4, 0, 9.2],
            rotationY: 2.58,
            scale: 1.04,
            motion: 'boat',
            lanternLightOffset: [-2.1, 0.65, 0],
            lanternColor: '#ffaa4a',
        },
        // Tall Nile date palms framing both banks
        { asset: 'nile_date_palm.glb', position: [-1.2, 0, -7.8], rotationY: -0.3, scale: 0.96, motion: 'willow', snapToShore: -0.06 },
        { asset: 'nile_date_palm.glb', position: [17.2, 0.25, -15.6], rotationY: 0.8, scale: 1.08, motion: 'willow' },
        { asset: 'nile_date_palm.glb', position: [28.4, 0.25, -16.8], rotationY: -1.1, scale: 1.04, motion: 'willow' },
        { asset: 'nile_date_palm.glb', position: [-1.6, 0, 9.4], rotationY: 0.5, scale: 0.95, motion: 'willow', snapToShore: -0.06 },
        // Water-smoothed Aswan dark granite river boulders
        { asset: 'aswan_granite_boulder.glb', position: [10.6, 0, -7.4], rotationY: 0.4, scale: 0.96, motion: 'static' },
        { asset: 'aswan_granite_boulder.glb', position: [14.4, 0, 7.3], rotationY: -0.9, scale: 1.04, motion: 'static' },
        { asset: 'aswan_granite_boulder.glb', position: [30.0, 0, 11.2], rotationY: 1.7, scale: 1.15, motion: 'static' },
        // Nile papyrus reed clumps along the calm shoreline edges
        { asset: 'nile_papyrus_clump.glb', position: [6.8, 0, -6.2], rotationY: 0.2, scale: 1.00, motion: 'lotus' },
        { asset: 'nile_papyrus_clump.glb', position: [13.2, 0, -8.2], rotationY: 1.4, scale: 1.08, motion: 'lotus' },
        { asset: 'nile_papyrus_clump.glb', position: [9.4, 0, 6.2], rotationY: -0.7, scale: 0.96, motion: 'lotus' },
        { asset: 'nile_papyrus_clump.glb', position: [18.2, 0, 8.2], rotationY: 2.3, scale: 1.05, motion: 'lotus' },
        // === MIDGROUND NILE ASWAN ENSEMBLE (left temple colonnade, right granite palm-oasis Qubba island & Royal Dahabiya) ===
        {
            asset: 'nile_colonnade_ruin_mid.glb',
            position: [48.0, 0.06, -19.8],
            rotationY: -0.24,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [2.246, 1.878, 4.713],
            lanternColor: '#ff9638',
        },
        {
            asset: 'nile_granite_oasis_isle_mid.glb',
            position: [46.5, 0.06, 17.5],
            rotationY: -2.68,
            scale: 1.02,
            motion: 'static',
            lanternLightOffset: [5.964, 4.316, 1.796],
            lanternColor: '#ffa242',
        },
        {
            asset: 'nile_royal_dahabiya_mid.glb',
            position: [58.0, 0, 9.4],
            rotationY: -2.72,
            scale: 1.0,
            motion: 'boat',
            lanternLightOffset: [-6.630, 1.586, 0.511],
            lanternColor: '#ffaa4a',
        },
    ];
}

export function getPlacementsForPack(packId: ScenePackId): ScenePropPlacement[] {
    switch (packId) {
        case 'jiangnan': return buildJiangnanPlacements();
        case 'tahoe': return buildTahoePlacements();
        case 'kyoto': return buildKyotoPlacements();
        case 'nordic': return buildNordicPlacements();
        case 'lagoon': return buildLagoonPlacements();
        case 'fuji': return buildFujiPlacements();
        case 'zhangjiajie': return buildZhangjiajiePlacements();
        case 'venice': return buildVenicePlacements();
        case 'alps': return buildAlpsPlacements();
        case 'nile': return buildNilePlacements();
        default: return [];
    }
}

/** Build subtle organic earthen/rock/sand headlands anchoring mid-lake banks & distant landmarks. */
function createPackLandmarks(packId: ScenePackId): THREE.Group | undefined {
    const moundConfigs: Partial<Record<ScenePackId, Array<{ pos: [number, number, number]; scale: [number, number, number]; color: string }>>> = {
        jiangnan: [
            { pos: [17.2, -0.55, -16.8], scale: [7.5, 1.15, 4.8], color: '#344237' },
            { pos: [86.0, -0.65, -19.5], scale: [18.0, 2.25, 10.5], color: '#2d3f3c' },
        ],
        tahoe: [
            { pos: [14.8, -0.55, -16.8], scale: [9.5, 1.20, 5.2], color: '#586058' },
            { pos: [16.8, -0.60, 16.4], scale: [7.2, 1.10, 4.4], color: '#586058' },
        ],
        kyoto: [
            { pos: [21.5, -0.55, -16.6], scale: [10.5, 1.15, 4.8], color: '#3c4333' },
        ],
        nordic: [
            { pos: [23.2, -0.58, -17.2], scale: [10.8, 1.25, 5.2], color: '#2b343e' },
        ],
        lagoon: [
            { pos: [18.6, -0.60, -16.6], scale: [8.4, 1.05, 5.0], color: '#bca882' },
        ],
        fuji: [
            { pos: [19.5, -0.55, -16.8], scale: [10.2, 1.15, 5.0], color: '#424c44' },
        ],
        zhangjiajie: [
            { pos: [21.5, -0.55, -16.8], scale: [10.6, 1.22, 5.0], color: '#384b3c' },
        ],
        alps: [
            { pos: [21.0, -0.55, -16.8], scale: [10.5, 1.20, 5.0], color: '#4c5c4a' },
        ],
        nile: [
            { pos: [21.8, -0.55, -16.8], scale: [10.8, 1.18, 5.0], color: '#8f6c48' },
        ],
    };

    const list = moundConfigs[packId];
    if (!list?.length) return undefined;

    const group = new THREE.Group();
    const sphereGeo = new THREE.SphereGeometry(1, 24, 14);
    for (const m of list) {
        const mat = new THREE.MeshStandardMaterial({
            color: m.color,
            roughness: 0.95,
            metalness: 0.0,
        });
        const mesh = new THREE.Mesh(sphereGeo, mat);
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
    motion: 'boat' | 'lotus' | 'willow' | 'ice';
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
                        if (mat.alphaTest > 0 || mat.transparent) {
                            mat.side = THREE.DoubleSide;
                        }
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

        const placements = getPlacementsForPack(packId);
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
        const landmarks = createPackLandmarks(packId);
        if (landmarks) group.add(landmarks);

        const animated: AnimatedProp[] = [];
        for (let i = 0; i < placements.length; i++) {
            const p = placements[i];
            const proto = prototypes.get(p.asset);
            if (!proto) continue;

            const instance = proto.clone(true);
            const isDistant =
                p.asset.includes('distant') ||
                p.asset.includes('ridge') ||
                p.asset.includes('cliff_wall') ||
                p.asset.includes('volcanic') ||
                p.asset.includes('peak') ||
                p.asset.includes('pillar_cluster') ||
                p.asset.includes('campanile') ||
                p.asset.includes('horizon');
            prepareModel(instance, !isDistant);

            const y = p.snapToShore !== undefined
                ? shoreElevation(p.position[0], p.position[2]) + p.snapToShore
                : p.position[1];
            instance.position.set(p.position[0], y, p.position[2]);
            instance.rotation.y = p.rotationY;
            instance.scale.setScalar(p.scale);
            group.add(instance);

            if (p.lanternLightOffset) {
                const light = new THREE.PointLight(p.lanternColor ?? '#ffbd69', 3.6, 15.0, 1.55);
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
            } else if (item.motion === 'ice') {
                const t = time * 0.55 + item.phase;
                item.object.position.y = item.basePos.y + Math.sin(t) * 0.014;
                item.object.rotation.z = Math.sin(t * 0.7) * 0.014 * breezeScale;
                item.object.rotation.y = item.baseRotY + Math.sin(t * 0.25) * 0.024;
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
