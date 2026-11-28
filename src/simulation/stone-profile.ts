import type { StoneSpec } from './stones';

export interface StoneFeelProfile {
    /** 0..100: how effortlessly this stone planes & lifts on gentle-to-medium throws */
    lift: number;
    /** 0..100: how well it retains speed and momentum across long chains of skips */
    glide: number;
    /** 0..100: gyroscopic steadiness & resistance to wobbling / tumbling */
    stability: number;
    /** Short style tag summarizing how the stone plays */
    styleTag: string;
    /** Concrete one-line usage guidance for the player */
    guide: string;
}

export interface StoneProfileComparison {
    profile: StoneFeelProfile;
    deltaLift: number;
    deltaGlide: number;
    deltaStability: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const STD_A = 0.04;
const STD_B = 0.03;
const STD_H = 0.0045;
const STD_FLATNESS = STD_H / Math.sqrt(STD_A * STD_B);

/** Compute intuitive 0..100 handling metrics directly from the stone's real physics constants. */
export function computeStoneProfile(stone: StoneSpec): StoneFeelProfile {
    const area = Math.PI * stone.a * stone.b;
    const flatness = stone.h / Math.sqrt(Math.max(1e-8, stone.a * stone.b));
    const bluntExcess = Math.max(0, flatness - STD_FLATNESS);
    const planingLift = 1 / (1 + 5.5 * bluntExcess);
    const thicknessRatio = stone.h / STD_H;
    const thicknessDrag = thicknessRatio > 1 ? 1 + 0.42 * (thicknessRatio - 1) : 1;

    // 1. Lift / forgiveness: driven by planingLift and surface-area-to-mass ratio
    const areaToMass = area / Math.max(0.01, stone.mass); // standard ≈ 0.0629 m²/kg
    const liftRatio = clamp(areaToMass / 0.095, 0.12, 1.15);
    const lift = Math.round(clamp((planingLift * 0.62 + Math.min(1, liftRatio) * 0.38) * 96, 8, 99));

    // 2. Glide endurance: low effective hydrodynamic drag + enough momentum to carry far
    const effectiveDrag = stone.dragScale * thicknessDrag; // master ≈ 0.78, std = 1.0, cobble ≈ 2.86
    const dragScore = clamp((1.52 - effectiveDrag) / 0.80, 0, 1);
    const momentumScore = clamp(Math.log(Math.max(0.015, stone.mass) / 0.015) / Math.log(0.11 / 0.015), 0.15, 1.0);
    const glide = Math.round(clamp(planingLift * (dragScore * 0.68 + momentumScore * 0.32) * 98, 6, 99));

    // 3. Stability: symmetry (b/a), low eccentricity wobble, and rotational inertia Iy
    const symmetry = clamp(Math.min(stone.a, stone.b) / Math.max(stone.a, stone.b), 0.3, 1);
    const wobblePenalty = clamp(stone.wobble / 0.26, 0, 1);
    const iy = stone.mass * (stone.a * stone.a + stone.b * stone.b) / 5;
    const inertiaScore = clamp(Math.pow(iy / 1.5e-4, 0.38), 0.25, 1.0);
    const stability = Math.round(clamp(((1 - wobblePenalty) * 0.56 + symmetry * 0.24 + inertiaScore * 0.20) * 98, 12, 99));

    // Style tag & practical guidance derived from physical traits
    let styleTag = '均衡顺手';
    let guide = '8°–12° 攻角、中等力度即可稳定连跳';

    if (flatness > 0.28) {
        styleTag = '厚重砸水';
        guide = '几乎无法起漂，适合听沉重落水声与大水花';
    } else if (stone.wobble >= 0.16) {
        styleTag = '偏心野性';
        guide = '重心偏斜易翻滚，需盯紧甜蜜区高自旋才能压稳';
    } else if (symmetry < 0.55) {
        styleTag = '弧线灵动';
        guide = '狭长石身适合带 6°–12° 侧倾切旋划出弧线';
    } else if (stone.mass >= 0.10 && glide >= 65) {
        styleTag = '重饼稳远';
        guide = '需拉满蓄力与高自旋，起漂后陀螺极稳、后段耐力足';
    } else if (stone.mass <= 0.048 && lift >= 75) {
        styleTag = '轻薄易跳';
        guide = '轻中力度就能贴水连跳，推荐 6°–10° 浅攻角';
    } else if (glide >= 85 && stability >= 82) {
        styleTag = '极限冲榜';
        guide = '低阻匀称薄盘，8°–12° 攻角配满蓄力最容易刷新纪录';
    } else if (glide >= 74) {
        styleTag = '顺滑耐滑';
        guide = '水阻低、容错高，适合在 8°–12° 攻角连打长漂';
    }

    return { lift, glide, stability, styleTag, guide };
}

export function compareStoneProfiles(candidate: StoneSpec, baseline: StoneSpec): StoneProfileComparison {
    const profile = computeStoneProfile(candidate);
    const base = computeStoneProfile(baseline);
    return {
        profile,
        deltaLift: profile.lift - base.lift,
        deltaGlide: profile.glide - base.glide,
        deltaStability: profile.stability - base.stability,
    };
}
