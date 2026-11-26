import * as THREE from 'three';

export type SceneThemeId = 'sunset' | 'mist_dawn' | 'moonlight';

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
        id: 'mist_dawn',
        name: '青岚晨雾',
        shortLabel: '晨雾',
        subtitle: '青岚晓湖 · 真实水漂',
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
