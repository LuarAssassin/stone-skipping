import * as THREE from 'three';
import type { ScenePackId } from './scene-packs';

export type SceneThemeId =
    | 'sunset'
    | 'jiangnan_lotus'
    | 'tahoe_alpine'
    | 'kyoto_autumn'
    | 'nordic_aurora'
    | 'tropical_lagoon'
    | 'mist_dawn'
    | 'moonlight';

export interface MountainLayerPalette {
    top: string;
    bottom: string;
    glow: [number, number, number];
}

export interface SceneTheme {
    id: SceneThemeId;
    name: string;
    shortLabel: string;
    subtitle: string;
    /** Optional 3D Blender scenery pack mounted alongside this theme */
    scenePack: ScenePackId;
    /** Optional animated Aurora Borealis curtains in sky shader (0..1) */
    auroraStrength?: number;
    /** Normalized sun/moon directional vector */
    sunDirection: [number, number, number];
    sunColor: string;
    sunIntensity: number;
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    fillColor: string;
    fillIntensity: number;
    fogColor: string;
    exposure: number;
    envIntensity: number;
    bloomStrength: number;
    bloomThreshold: number;
    gradeShadow: [number, number, number];
    gradeHighlight: [number, number, number];
    sky: {
        zenith: [number, number, number];
        upperMid: [number, number, number];
        lowerMid: [number, number, number];
        horizon: [number, number, number];
        glowWide: [number, number, number];
        glowTight: [number, number, number];
        disk: [number, number, number];
        halo: [number, number, number];
        cloudDark: [number, number, number];
        cloudLit: [number, number, number];
        cloudSilver: [number, number, number];
        belowDark: [number, number, number];
    };
    mountains: [MountainLayerPalette, MountainLayerPalette, MountainLayerPalette];
    water: {
        sunColor: string;
        waterColor: string;
        scatter: [number, number, number];
        rimCatch: [number, number, number];
        foamDark: [number, number, number];
        foamLit: [number, number, number];
        fogBase: [number, number, number];
        fogSun: [number, number, number];
    };
    reeds: {
        base: [number, number, number];
        tip: [number, number, number];
        rim: [number, number, number];
    };
}

export const THEME_STORAGE_KEY = 'stone-skipping-theme-v1';

/** Extensible registry of full-scene visual & UI themes.
 *  Adding a new theme requires only appending an entry here (and optional CSS accent overrides in style.css). */
export const SCENE_THEMES: readonly SceneTheme[] = [
    {
        id: 'sunset',
        name: '落日暮色',
        shortLabel: '暮色',
        subtitle: '暮色湖畔 · 真实水漂',
        scenePack: 'none',
        sunDirection: [0.88, 0.165, -0.44],
        sunColor: '#ffad60',
        sunIntensity: 3.6,
        hemiSky: '#7084ae',
        hemiGround: '#4b2f24',
        hemiIntensity: 1.35,
        fillColor: '#526b94',
        fillIntensity: 0.55,
        fogColor: '#7f5253',
        exposure: 1.06,
        envIntensity: 0.85,
        bloomStrength: 0.32,
        bloomThreshold: 0.96,
        gradeShadow: [0.95, 0.98, 1.05],
        gradeHighlight: [1.05, 1.00, 0.94],
        sky: {
            zenith: [0.045, 0.078, 0.165],
            upperMid: [0.145, 0.135, 0.255],
            lowerMid: [0.46, 0.24, 0.27],
            horizon: [0.92, 0.52, 0.30],
            glowWide: [0.72, 0.32, 0.12],
            glowTight: [1.15, 0.62, 0.26],
            disk: [2.8, 1.75, 0.92],
            halo: [1.35, 0.72, 0.34],
            cloudDark: [0.14, 0.11, 0.19],
            cloudLit: [0.86, 0.45, 0.32],
            cloudSilver: [1.45, 0.88, 0.48],
            belowDark: [0.03, 0.05, 0.08],
        },
        mountains: [
            { top: '#3a2d44', bottom: '#a46350', glow: [0.42, 0.21, 0.11] },
            { top: '#292237', bottom: '#7a4a4e', glow: [0.42, 0.21, 0.11] },
            { top: '#1b1a2c', bottom: '#4c3442', glow: [0.42, 0.21, 0.11] },
        ],
        water: {
            sunColor: '#ffb066',
            waterColor: '#132531',
            scatter: [0.011, 0.026, 0.038],
            rimCatch: [0.42, 0.25, 0.13],
            foamDark: [0.34, 0.34, 0.42],
            foamLit: [1.04, 0.74, 0.52],
            fogBase: [0.49, 0.32, 0.32],
            fogSun: [0.84, 0.49, 0.32],
        },
        reeds: {
            base: [0.06, 0.055, 0.045],
            tip: [0.18, 0.14, 0.09],
            rim: [0.55, 0.30, 0.12],
        },
    },
    {
        id: 'jiangnan_lotus',
        name: '曲院荷风',
        shortLabel: '江南',
        subtitle: '江南水榭 · 荷塘掠水',
        scenePack: 'jiangnan',
        sunDirection: [0.85, 0.21, -0.47],
        sunColor: '#ffd7a3',
        sunIntensity: 3.35,
        hemiSky: '#9ec4be',
        hemiGround: '#3d4c3e',
        hemiIntensity: 1.45,
        fillColor: '#6f9b98',
        fillIntensity: 0.62,
        fogColor: '#8ba49b',
        exposure: 1.05,
        envIntensity: 0.88,
        bloomStrength: 0.28,
        bloomThreshold: 0.94,
        gradeShadow: [0.94, 1.01, 1.00],
        gradeHighlight: [1.04, 1.01, 0.95],
        sky: {
            zenith: [0.13, 0.25, 0.33],
            upperMid: [0.27, 0.40, 0.45],
            lowerMid: [0.54, 0.57, 0.53],
            horizon: [0.90, 0.77, 0.62],
            glowWide: [0.56, 0.38, 0.22],
            glowTight: [0.96, 0.72, 0.42],
            disk: [2.65, 2.20, 1.55],
            halo: [1.18, 0.88, 0.56],
            cloudDark: [0.30, 0.38, 0.42],
            cloudLit: [0.84, 0.74, 0.62],
            cloudSilver: [1.30, 1.08, 0.82],
            belowDark: [0.05, 0.09, 0.09],
        },
        mountains: [
            { top: '#435e63', bottom: '#96a89e', glow: [0.30, 0.24, 0.16] },
            { top: '#2f494f', bottom: '#6d8680', glow: [0.26, 0.21, 0.14] },
            { top: '#1e3338', bottom: '#465f5c', glow: [0.20, 0.17, 0.12] },
        ],
        water: {
            sunColor: '#ffd9a6',
            waterColor: '#13322c',
            scatter: [0.012, 0.036, 0.030],
            rimCatch: [0.36, 0.32, 0.22],
            foamDark: [0.38, 0.48, 0.44],
            foamLit: [0.98, 0.90, 0.76],
            fogBase: [0.52, 0.60, 0.57],
            fogSun: [0.84, 0.72, 0.58],
        },
        reeds: {
            base: [0.05, 0.10, 0.06],
            tip: [0.16, 0.25, 0.14],
            rim: [0.48, 0.42, 0.22],
        },
    },
    {
        id: 'tahoe_alpine',
        name: '太浩松涛',
        shortLabel: '冰川',
        subtitle: '北美高山湖 · 澄蓝掠水',
        scenePack: 'tahoe',
        sunDirection: [0.80, 0.34, -0.49],
        sunColor: '#fff0d6',
        sunIntensity: 3.55,
        hemiSky: '#98c8f0',
        hemiGround: '#3d4d46',
        hemiIntensity: 1.55,
        fillColor: '#6ca4d6',
        fillIntensity: 0.65,
        fogColor: '#98bcd4',
        exposure: 1.04,
        envIntensity: 0.92,
        bloomStrength: 0.22,
        bloomThreshold: 0.98,
        gradeShadow: [0.94, 0.99, 1.04],
        gradeHighlight: [1.03, 1.01, 0.97],
        sky: {
            zenith: [0.07, 0.24, 0.56],
            upperMid: [0.19, 0.44, 0.74],
            lowerMid: [0.46, 0.68, 0.86],
            horizon: [0.82, 0.89, 0.94],
            glowWide: [0.28, 0.32, 0.32],
            glowTight: [0.76, 0.74, 0.62],
            disk: [2.7, 2.55, 2.2],
            halo: [1.05, 0.98, 0.86],
            cloudDark: [0.45, 0.56, 0.68],
            cloudLit: [0.88, 0.92, 0.95],
            cloudSilver: [1.26, 1.24, 1.18],
            belowDark: [0.03, 0.10, 0.18],
        },
        mountains: [
            { top: '#5a748e', bottom: '#a4bed0', glow: [0.20, 0.24, 0.28] },
            { top: '#3c5770', bottom: '#7b9ab2', glow: [0.16, 0.20, 0.24] },
            { top: '#243a4d', bottom: '#4d6c80', glow: [0.12, 0.16, 0.20] },
        ],
        water: {
            sunColor: '#fff2da',
            waterColor: '#0b3854',
            scatter: [0.009, 0.044, 0.068],
            rimCatch: [0.34, 0.42, 0.48],
            foamDark: [0.44, 0.58, 0.68],
            foamLit: [0.96, 0.98, 1.00],
            fogBase: [0.56, 0.72, 0.84],
            fogSun: [0.84, 0.88, 0.90],
        },
        reeds: {
            base: [0.06, 0.09, 0.05],
            tip: [0.18, 0.24, 0.12],
            rim: [0.44, 0.48, 0.32],
        },
    },
    {
        id: 'kyoto_autumn',
        name: '岚山枫渡',
        shortLabel: '秋枫',
        subtitle: '红叶渡口 · 镜湖掠水',
        scenePack: 'kyoto',
        sunDirection: [0.86, 0.19, -0.47],
        sunColor: '#ffb76b',
        sunIntensity: 3.45,
        hemiSky: '#a89688',
        hemiGround: '#542d22',
        hemiIntensity: 1.40,
        fillColor: '#7a6c82',
        fillIntensity: 0.56,
        fogColor: '#9c6f5e',
        exposure: 1.05,
        envIntensity: 0.86,
        bloomStrength: 0.30,
        bloomThreshold: 0.94,
        gradeShadow: [0.97, 0.96, 1.02],
        gradeHighlight: [1.06, 0.99, 0.91],
        sky: {
            zenith: [0.10, 0.15, 0.28],
            upperMid: [0.28, 0.24, 0.34],
            lowerMid: [0.64, 0.38, 0.30],
            horizon: [0.95, 0.64, 0.40],
            glowWide: [0.74, 0.38, 0.18],
            glowTight: [1.14, 0.68, 0.32],
            disk: [2.75, 1.92, 1.08],
            halo: [1.30, 0.78, 0.40],
            cloudDark: [0.24, 0.18, 0.24],
            cloudLit: [0.90, 0.54, 0.36],
            cloudSilver: [1.42, 0.96, 0.56],
            belowDark: [0.05, 0.05, 0.07],
        },
        mountains: [
            { top: '#4f3338', bottom: '#b07154', glow: [0.42, 0.24, 0.12] },
            { top: '#3a252c', bottom: '#854e42', glow: [0.36, 0.20, 0.10] },
            { top: '#261a22', bottom: '#583330', glow: [0.28, 0.16, 0.09] },
        ],
        water: {
            sunColor: '#ffba72',
            waterColor: '#16282a',
            scatter: [0.018, 0.028, 0.026],
            rimCatch: [0.46, 0.28, 0.15],
            foamDark: [0.42, 0.34, 0.36],
            foamLit: [1.04, 0.80, 0.58],
            fogBase: [0.58, 0.42, 0.36],
            fogSun: [0.88, 0.58, 0.38],
        },
        reeds: {
            base: [0.09, 0.05, 0.03],
            tip: [0.28, 0.14, 0.06],
            rim: [0.64, 0.32, 0.12],
        },
    },
    {
        id: 'nordic_aurora',
        name: '极光峡湾',
        shortLabel: '极光',
        subtitle: '罗弗敦极夜 · 冰海掠水',
        scenePack: 'nordic',
        auroraStrength: 1.0,
        sunDirection: [0.82, 0.24, -0.52],
        sunColor: '#98f2dc',
        sunIntensity: 2.35,
        hemiSky: '#3c7a7c',
        hemiGround: '#131d2c',
        hemiIntensity: 1.18,
        fillColor: '#48689e',
        fillIntensity: 0.52,
        fogColor: '#132638',
        exposure: 1.06,
        envIntensity: 0.84,
        bloomStrength: 0.40,
        bloomThreshold: 0.86,
        gradeShadow: [0.90, 0.99, 1.07],
        gradeHighlight: [0.94, 1.05, 1.02],
        sky: {
            zenith: [0.010, 0.026, 0.062],
            upperMid: [0.022, 0.062, 0.125],
            lowerMid: [0.048, 0.132, 0.205],
            horizon: [0.11, 0.25, 0.34],
            glowWide: [0.08, 0.26, 0.24],
            glowTight: [0.22, 0.58, 0.52],
            disk: [1.9, 2.4, 2.7],
            halo: [0.48, 0.94, 0.92],
            cloudDark: [0.025, 0.055, 0.095],
            cloudLit: [0.12, 0.28, 0.32],
            cloudSilver: [0.46, 0.88, 0.78],
            belowDark: [0.010, 0.024, 0.042],
        },
        mountains: [
            { top: '#122234', bottom: '#27445a', glow: [0.10, 0.30, 0.26] },
            { top: '#0c1826', bottom: '#1c3246', glow: [0.08, 0.24, 0.22] },
            { top: '#07101a', bottom: '#112030', glow: [0.06, 0.18, 0.18] },
        ],
        water: {
            sunColor: '#a2f6df',
            waterColor: '#071722',
            scatter: [0.006, 0.024, 0.036],
            rimCatch: [0.18, 0.44, 0.38],
            foamDark: [0.18, 0.30, 0.38],
            foamLit: [0.68, 0.92, 0.88],
            fogBase: [0.08, 0.16, 0.23],
            fogSun: [0.16, 0.36, 0.38],
        },
        reeds: {
            base: [0.02, 0.04, 0.05],
            tip: [0.07, 0.14, 0.16],
            rim: [0.20, 0.52, 0.46],
        },
    },
    {
        id: 'tropical_lagoon',
        name: '珊瑚暮湾',
        shortLabel: '礁湖',
        subtitle: '南太平洋礁湾 · 碧水掠石',
        scenePack: 'lagoon',
        sunDirection: [0.85, 0.23, -0.47],
        sunColor: '#ffc87a',
        sunIntensity: 3.65,
        hemiSky: '#86d6d2',
        hemiGround: '#5e4630',
        hemiIntensity: 1.52,
        fillColor: '#58b4b8',
        fillIntensity: 0.64,
        fogColor: '#8eb8b0',
        exposure: 1.06,
        envIntensity: 0.92,
        bloomStrength: 0.30,
        bloomThreshold: 0.94,
        gradeShadow: [0.94, 1.01, 1.02],
        gradeHighlight: [1.05, 1.01, 0.93],
        sky: {
            zenith: [0.06, 0.30, 0.50],
            upperMid: [0.16, 0.50, 0.64],
            lowerMid: [0.54, 0.68, 0.64],
            horizon: [0.98, 0.74, 0.48],
            glowWide: [0.76, 0.46, 0.22],
            glowTight: [1.16, 0.78, 0.40],
            disk: [2.85, 2.15, 1.25],
            halo: [1.35, 0.92, 0.48],
            cloudDark: [0.30, 0.44, 0.52],
            cloudLit: [0.96, 0.74, 0.54],
            cloudSilver: [1.42, 1.12, 0.76],
            belowDark: [0.02, 0.12, 0.14],
        },
        mountains: [
            { top: '#3c5f68', bottom: '#96b4a6', glow: [0.40, 0.28, 0.16] },
            { top: '#2b4d56', bottom: '#72948a', glow: [0.32, 0.22, 0.12] },
            { top: '#1d3840', bottom: '#4d6f6a', glow: [0.24, 0.18, 0.10] },
        ],
        water: {
            sunColor: '#ffd088',
            waterColor: '#0c4c52',
            scatter: [0.012, 0.062, 0.064],
            rimCatch: [0.42, 0.42, 0.28],
            foamDark: [0.42, 0.60, 0.60],
            foamLit: [1.02, 0.94, 0.80],
            fogBase: [0.54, 0.70, 0.68],
            fogSun: [0.92, 0.72, 0.50],
        },
        reeds: {
            base: [0.05, 0.11, 0.05],
            tip: [0.16, 0.28, 0.11],
            rim: [0.52, 0.48, 0.20],
        },
    },
    {
        id: 'mist_dawn',
        name: '青岚晨雾',
        shortLabel: '晨雾',
        subtitle: '青岚晓湖 · 真实水漂',
        scenePack: 'none',
        sunDirection: [0.86, 0.24, -0.44],
        sunColor: '#ffe8ca',
        sunIntensity: 3.25,
        hemiSky: '#a8ced8',
        hemiGround: '#435453',
        hemiIntensity: 1.50,
        fillColor: '#7ba6b4',
        fillIntensity: 0.65,
        fogColor: '#8aa7ad',
        exposure: 1.04,
        envIntensity: 0.90,
        bloomStrength: 0.24,
        bloomThreshold: 0.98,
        gradeShadow: [0.94, 1.00, 1.03],
        gradeHighlight: [1.03, 1.02, 0.98],
        sky: {
            zenith: [0.15, 0.30, 0.40],
            upperMid: [0.30, 0.46, 0.54],
            lowerMid: [0.52, 0.66, 0.68],
            horizon: [0.84, 0.88, 0.84],
            glowWide: [0.34, 0.32, 0.24],
            glowTight: [0.78, 0.68, 0.50],
            disk: [2.5, 2.35, 1.95],
            halo: [1.05, 0.96, 0.78],
            cloudDark: [0.36, 0.46, 0.52],
            cloudLit: [0.76, 0.83, 0.84],
            cloudSilver: [1.18, 1.16, 1.06],
            belowDark: [0.06, 0.11, 0.13],
        },
        mountains: [
            { top: '#4e6c75', bottom: '#9db4b6', glow: [0.22, 0.24, 0.20] },
            { top: '#35525b', bottom: '#799599', glow: [0.20, 0.22, 0.18] },
            { top: '#223841', bottom: '#4d6b70', glow: [0.16, 0.19, 0.16] },
        ],
        water: {
            sunColor: '#ffeacc',
            waterColor: '#16353a',
            scatter: [0.014, 0.040, 0.044],
            rimCatch: [0.30, 0.34, 0.31],
            foamDark: [0.46, 0.56, 0.58],
            foamLit: [0.96, 0.97, 0.92],
            fogBase: [0.54, 0.65, 0.68],
            fogSun: [0.80, 0.83, 0.78],
        },
        reeds: {
            base: [0.07, 0.10, 0.08],
            tip: [0.18, 0.24, 0.17],
            rim: [0.44, 0.48, 0.38],
        },
    },
    {
        id: 'moonlight',
        name: '月下静湖',
        shortLabel: '月夜',
        subtitle: '清辉月湖 · 真实水漂',
        scenePack: 'none',
        sunDirection: [0.84, 0.28, -0.46],
        sunColor: '#c4dcff',
        sunIntensity: 2.55,
        hemiSky: '#5672a8',
        hemiGround: '#1a2234',
        hemiIntensity: 1.05,
        fillColor: '#48608f',
        fillIntensity: 0.48,
        fogColor: '#1d2b44',
        exposure: 1.02,
        envIntensity: 0.78,
        bloomStrength: 0.36,
        bloomThreshold: 0.90,
        gradeShadow: [0.92, 0.96, 1.08],
        gradeHighlight: [0.98, 1.01, 1.06],
        sky: {
            zenith: [0.015, 0.028, 0.075],
            upperMid: [0.038, 0.068, 0.155],
            lowerMid: [0.09, 0.145, 0.27],
            horizon: [0.22, 0.31, 0.48],
            glowWide: [0.14, 0.21, 0.36],
            glowTight: [0.46, 0.62, 0.88],
            disk: [2.4, 2.6, 3.0],
            halo: [0.75, 0.94, 1.25],
            cloudDark: [0.04, 0.06, 0.12],
            cloudLit: [0.22, 0.31, 0.46],
            cloudSilver: [0.78, 0.92, 1.15],
            belowDark: [0.015, 0.025, 0.05],
        },
        mountains: [
            { top: '#141e33', bottom: '#324466', glow: [0.14, 0.20, 0.34] },
            { top: '#0e1628', bottom: '#23324e', glow: [0.12, 0.18, 0.30] },
            { top: '#080e1b', bottom: '#152035', glow: [0.10, 0.15, 0.25] },
        ],
        water: {
            sunColor: '#cfe2ff',
            waterColor: '#091525',
            scatter: [0.008, 0.018, 0.038],
            rimCatch: [0.24, 0.32, 0.48],
            foamDark: [0.22, 0.28, 0.40],
            foamLit: [0.76, 0.86, 1.00],
            fogBase: [0.11, 0.17, 0.27],
            fogSun: [0.28, 0.38, 0.56],
        },
        reeds: {
            base: [0.03, 0.04, 0.06],
            tip: [0.09, 0.12, 0.17],
            rim: [0.28, 0.38, 0.58],
        },
    },
];

export const DEFAULT_THEME_ID: SceneThemeId = 'sunset';

export function getSceneTheme(id?: string): SceneTheme {
    return SCENE_THEMES.find(t => t.id === id) ?? SCENE_THEMES[0];
}

export function loadSavedThemeId(): SceneThemeId {
    try {
        if (typeof localStorage === 'undefined') return DEFAULT_THEME_ID;
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved && SCENE_THEMES.some(t => t.id === saved)) {
            return saved as SceneThemeId;
        }
    } catch {
        // ignore storage errors
    }
    return DEFAULT_THEME_ID;
}

export function saveThemeId(id: SceneThemeId) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(THEME_STORAGE_KEY, id);
        }
    } catch {
        // ignore storage errors
    }
}

export function themeSunDirection(theme: SceneTheme): THREE.Vector3 {
    return new THREE.Vector3(...theme.sunDirection).normalize();
}
