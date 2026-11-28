import type { Simulation } from './physics';
import type { ThrowSnapshot } from './launch-randomness';
import type { ReleaseTiming, WristRelease } from '../input/pull-gesture';

export interface PreviousThrowBaseline {
    skips: number;
    distance: number;
    stoneName: string;
    tilt: number;
    roll: number;
}

export interface ThrowDiagnosis {
    /** Compact factual release strip (speed, tilt, sweet-spot / zero-jitter badge) */
    metricsLine: string;
    /** One-sentence physical cause of what happened on the water */
    cause: string;
    /** One actionable tweak for the very next throw */
    nextTip: string;
    /** Optional delta string when comparing against a previous throw baseline */
    compareLine?: string;
    timing?: { label: string; cursor: number };
}

export interface DiagnoseOptions {
    snapshot?: ThrowSnapshot;
    release?: WristRelease;
    isSamePowerCompare?: boolean;
    baseline?: PreviousThrowBaseline;
}

const TIMING_COACH: Record<ReleaseTiming, { label: string; tip: string }> = {
    early: { label: '松手偏早', tip: '保持下拉深度，等白点进入金色区再松手' },
    hit: { label: '松手命中', tip: '下次继续在白点进入金色区时松手' },
    late: { label: '松手偏晚', tip: '保持下拉深度，白点一进金色区就松手' },
};

function formatSigned(value: number, digits = 0, unit = ''): string {
    const rounded = Number(value.toFixed(digits));
    if (Math.abs(rounded) < (digits > 0 ? 0.05 : 1)) return `±0${unit}`;
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(digits)}${unit}`;
}

/** Translate real RK4 contact physics & launch parameters into concise, actionable player feedback. */
export function diagnoseThrow(sim: Simulation, options: DiagnoseOptions = {}): ThrowDiagnosis {
    const launch = options.snapshot?.sampled ?? sim.launch;
    const target = options.snapshot?.target ?? sim.launch;
    const stone = sim.stone;
    const distance = Math.hypot(sim.p.x, sim.p.z);

    const speed = launch.speed;
    const tilt = target.tilt;
    const roll = target.roll ?? 0;
    const elev = target.elevation;
    const flatness = stone.h / Math.sqrt(Math.max(1e-8, stone.a * stone.b));
    const lastContact = sim.contacts.at(-1);
    const vLast = lastContact ? lastContact.velocity.length() : 0;
    const lastTiltDeg = lastContact?.normal
        ? Math.acos(Math.max(-1, Math.min(1, lastContact.normal.y))) * 180 / Math.PI
        : 0;

    // 1. Compact release telemetry line
    const chips: string[] = [
        `初速 ${speed.toFixed(1)} m/s`,
        `攻角 ${Math.round(tilt)}°`,
    ];
    if (Math.abs(roll) >= 3) chips.push(`侧倾 ${Math.round(roll)}°`);
    if (options.isSamePowerCompare || (options.snapshot && options.snapshot.temperature === 0)) {
        chips.push('无扰动定力');
    }
    const metricsLine = chips.join(' · ');

    // 2. Physical cause & actionable next-throw suggestion
    let cause = '';
    let nextTip = '';

    if (flatness > 0.28 && sim.skips <= 1) {
        cause = '石身偏厚圆钝，触水升力不足以托起连跳';
        nextTip = '点「拣石」挑一块更扁更薄的河石再试';
    } else if (sim.skips === 0) {
        if (tilt > 22) {
            cause = `攻角偏陡（${Math.round(tilt)}°），迎水面直接铲进水里`;
            nextTip = '将攻角降到 8°–12° 后再试一投';
        } else if (tilt < 3) {
            cause = `攻角过平（${Math.round(tilt)}°），石底贴水难以形成向上的升力`;
            nextTip = '将攻角略抬到 6°–12° 更容易首跳起漂';
        } else if (elev > 8 || elev < -6) {
            cause = elev > 8 ? `抛角过高（${Math.round(elev)}°），高空砸水角度太陡` : `抛角压得过低（${Math.round(elev)}°），直接扎入水面`;
            nextTip = '把抛角调回 0°–4° 贴着水面平甩出去';
        } else if (Math.abs(roll) > 18) {
            cause = `侧倾过大（${Math.round(Math.abs(roll))}°），石刃斜切水面失衡`;
            nextTip = '先将侧倾收回到 ±10° 以内稳住首跳';
        } else if (speed < 9.5) {
            cause = `初速偏轻（${speed.toFixed(1)} m/s），首跳动能不够`;
            nextTip = '向下拉得更深一些，再顺势松手';
        } else {
            cause = '首跳入水姿态失衡，未能顺利离水';
            nextTip = '先用 8°–12° 攻角、中等以上力度找准第一跳';
        }
    } else if (sim.reason === '离开水域') {
        cause = '贴水一路掠过整片水域，初速与姿态配合极稳';
        nextTip = '可以试着加 6°–10° 侧倾切旋玩弧线，或换一块不同手感的石子';
    } else if (sim.skips <= 5) {
        if (vLast > 9.5 && lastTiltDeg > 34) {
            cause = `第 ${sim.skips + 1} 跳姿态翻滚扎水（自旋稳度不足或石身偏心）`;
            nextTip = '试着提高自旋，或换更匀称的扁石';
        } else if (tilt > 17) {
            cause = `攻角偏大（${Math.round(tilt)}°），每次触水阻力消耗太快`;
            nextTip = '把攻角调低到 8°–12°，同力度下能明显多出几跳';
        } else if (Math.abs(roll) > 14) {
            cause = `侧倾偏大（${Math.round(Math.abs(roll))}°），弧线摆偏后切水停住`;
            nextTip = '收小侧倾至 ±8° 内，可把能量留在向前连跳';
        } else if (speed < 14.5) {
            cause = `姿态很稳，末端速度自然耗尽（初速 ${speed.toFixed(1)} m/s）`;
            nextTip = '保持这个角度，向下拉更深提高初速冲更多跳数';
        } else if (stone.dragScale > 1.05 || stone.wobble > 0.08) {
            cause = '当前石子表面阻力或偏心偏大，滑行掉速较快';
            nextTip = '点「换个石头」选块更薄滑的扁石，用「同力度复投」立刻对比';
        } else {
            cause = '触水连贯，末端降速后自然沉水';
            nextTip = '把攻角微调至 8°–12°，试着延长尾段';
        }
    } else {
        if (tilt > 15 || tilt < 5) {
            cause = `连跳很稳，但攻角（${Math.round(tilt)}°）略偏离黄金掠水窗`;
            nextTip = '把攻角微调到 8°–12°，用「同力度复投」对比差距';
        } else if (speed < 19.5) {
            cause = `石子连续弹跳（初速 ${speed.toFixed(1)} m/s），滑至末速收尾`;
            nextTip = '继续加深下拉力度冲纪录，或换一块石子同力度对比手感';
        } else {
            cause = '石子以较高初速完成多次弹跳';
            nextTip = '试着换不同石子同力度对比，或加一点侧倾划出弧线';
        }
    }

    // 3. Optional delta line when comparing against a baseline throw
    let compareLine: string | undefined;
    if (options.isSamePowerCompare && options.baseline) {
        const dSkips = sim.skips - options.baseline.skips;
        const dDist = distance - options.baseline.distance;
        const sameStone = options.baseline.stoneName === stone.name;
        const label = sameStone
            ? `同力度对比（攻角 ${Math.round(options.baseline.tilt)}° → ${Math.round(tilt)}°）`
            : `同力度对比「${options.baseline.stoneName}」`;
        compareLine = `${label}：${formatSigned(dSkips, 0, ' 跳')} · ${formatSigned(dDist, 1, ' m')}`;
    }

    const release = options.isSamePowerCompare ? undefined : options.release;
    const coach = release ? TIMING_COACH[release.timing] : undefined;
    const timing = release && coach ? { label: coach.label, cursor: release.cursor } : undefined;
    return { metricsLine, cause, nextTip: coach?.tip ?? nextTip, compareLine, timing };
}
