import type { Session } from '../app/session';

const BEST_STORAGE_KEY = 'stone-skipping-best-v1';

export interface BestRecord {
    skips: number;
    distance: number;
}

function loadBest(): BestRecord {
    try {
        const raw = localStorage.getItem(BEST_STORAGE_KEY);
        if (!raw) return { skips: 0, distance: 0 };
        const parsed = JSON.parse(raw) as Partial<BestRecord>;
        return {
            skips: Number.isFinite(parsed.skips) ? Math.max(0, Math.floor(parsed.skips!)) : 0,
            distance: Number.isFinite(parsed.distance) ? Math.max(0, parsed.distance!) : 0,
        };
    } catch {
        return { skips: 0, distance: 0 };
    }
}

function saveBest(record: BestRecord) {
    try {
        localStorage.setItem(BEST_STORAGE_KEY, JSON.stringify(record));
    } catch {
        // Ignore storage errors in restricted environments
    }
}

let bestRecord = loadBest();
let lastRenderedSkips = -1;
let initializedBest = false;

export function syncBestBadge() {
    const badge = document.querySelector('#best-record');
    if (!badge) return;
    badge.innerHTML = `最佳 <strong>${bestRecord.skips}</strong> 跳 · <span>${bestRecord.distance.toFixed(1)}</span> m`;
}

export function compareWithBest({ skips, distance }: BestRecord, best: BestRecord) {
    const isNewBest = skips > best.skips || (skips === best.skips && skips > 0 && distance > best.distance + 0.05);
    const gap = best.skips - skips;
    const message = isNewBest ? '刷新个人纪录'
        : gap > 0 ? `距最佳还差 ${gap} 跳`
        : skips > 0 ? '追平最佳跳数'
        : '完成首跳即可建立个人纪录';
    return { isNewBest, message };
}

export function commitRecord(skips: number, distance: number) {
    const comparison = compareWithBest({ skips, distance }, bestRecord);
    const { isNewBest } = comparison;
    if (isNewBest) {
        bestRecord = { skips, distance };
        saveBest(bestRecord);
        syncBestBadge();
    }
    return comparison;
}

export function updateTelemetry(
    session: Session,
    visibleDrops: number,
    replayScore?: BestRecord
) {
    if (!initializedBest) {
        initializedBest = true;
        syncBestBadge();
    }
    const { sim, paused, visualTime } = session;
    const scorePill = document.querySelector<HTMLElement>('#hud-score');
    const modeTag = document.querySelector<HTMLElement>('#score-mode-tag');
    const skipsEl = document.querySelector<HTMLElement>('#skips')!;
    const distEl = document.querySelector<HTMLElement>('#distance')!;

    const isReplay = Boolean(replayScore);
    const displaySkips = replayScore?.skips ?? sim.skips;
    const displayDistance = replayScore?.distance ?? Math.hypot(sim.p.x, sim.p.z);

    if (scorePill) scorePill.classList.toggle('is-replay', isReplay);
    if (modeTag) {
        if (replayScore) {
            modeTag.textContent = replayScore.skips > 0
                ? `慢镜回放 ${Math.min(sim.skips, replayScore.skips)}/${replayScore.skips}`
                : '慢镜回放';
        } else {
            modeTag.textContent = '';
        }
    }

    if (displaySkips !== lastRenderedSkips) {
        skipsEl.textContent = String(displaySkips);
        if (!isReplay && displaySkips > lastRenderedSkips && displaySkips > 0) {
            skipsEl.classList.remove('pop');
            void skipsEl.offsetWidth;
            skipsEl.classList.add('pop');
        }
        lastRenderedSkips = displaySkips;
    }
    distEl.textContent = displayDistance.toFixed(1);
    document.querySelector('#status')!.textContent = `${paused ? '已暂停 · ' : ''}${sim.reason} / ${sim.time.toFixed(2)} s`;
    document.querySelector('#diagnostics')!.textContent = `速度  ${sim.v.length().toFixed(2)} m/s\n高度  ${sim.p.y.toFixed(3)} m\n湿面积 ${(sim.area * 1e4).toFixed(2)} cm²\n水动力 ${sim.force.length().toFixed(2)} N\n总能量 ${sim.energy().toFixed(3)} J\n自旋  ${(sim.omega.length() / Math.PI / 2).toFixed(1)} 转/s\n效果时钟 ${visualTime.toFixed(3)} s\n可见水滴 ${visibleDrops}`;
    document.querySelector('#history')!.innerHTML = sim.contacts.map(c => `<div class="contact">#${c.id + 1} ${c.bounced ? '↗ 离水' : c.end ? '— 结束' : '≈ 入水'} · ${(c.impulse).toFixed(3)} N·s · ${((c.end ?? sim.time) - c.time).toFixed(3)} s</div>`).join('');
    document.querySelector('#status')!.textContent += ` · ${session.mode === 'bullet' ? '子弹环绕 0.05×' : session.mode === 'slow' ? '慢放 0.25×' : '正常 1×'}`;
}
