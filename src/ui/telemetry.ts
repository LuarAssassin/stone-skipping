import type { Session } from '../app/session';

const BEST_STORAGE_KEY = 'stone-skipping-best-v1';

interface BestRecord {
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

export function commitRecord(skips: number, distance: number): boolean {
    const isNewBest = skips > bestRecord.skips || (skips === bestRecord.skips && skips > 0 && distance > bestRecord.distance + 0.05);
    if (isNewBest) {
        bestRecord = { skips, distance };
        saveBest(bestRecord);
        syncBestBadge();
    }
    return isNewBest;
}

export function updateTelemetry(session: Session, visibleDrops: number) {
    if (!initializedBest) {
        initializedBest = true;
        syncBestBadge();
    }
    const { sim, paused, visualTime } = session;
    const skipsEl = document.querySelector<HTMLElement>('#skips')!;
    if (sim.skips !== lastRenderedSkips) {
        skipsEl.textContent = String(sim.skips);
        if (sim.skips > lastRenderedSkips && sim.skips > 0) {
            skipsEl.classList.remove('pop');
            void skipsEl.offsetWidth;
            skipsEl.classList.add('pop');
        }
        lastRenderedSkips = sim.skips;
    }
    document.querySelector('#distance')!.textContent = Math.hypot(sim.p.x, sim.p.z).toFixed(1);
    document.querySelector('#status')!.textContent = `${paused ? '已暂停 · ' : ''}${sim.reason} / ${sim.time.toFixed(2)} s`;
    document.querySelector('#diagnostics')!.textContent = `速度  ${sim.v.length().toFixed(2)} m/s\n高度  ${sim.p.y.toFixed(3)} m\n湿面积 ${(sim.area * 1e4).toFixed(2)} cm²\n水动力 ${sim.force.length().toFixed(2)} N\n总能量 ${sim.energy().toFixed(3)} J\n自旋  ${(sim.omega.length() / Math.PI / 2).toFixed(1)} 转/s\n效果时钟 ${visualTime.toFixed(3)} s\n可见水滴 ${visibleDrops}`;
    document.querySelector('#history')!.innerHTML = sim.contacts.map(c => `<div class="contact">#${c.id + 1} ${c.bounced ? '↗ 离水' : c.end ? '— 结束' : '≈ 入水'} · ${(c.impulse).toFixed(3)} N·s · ${((c.end ?? sim.time) - c.time).toFixed(3)} s</div>`).join('');
    document.querySelector('#status')!.textContent += ` · ${session.mode === 'bullet' ? '子弹环绕 0.05×' : session.mode === 'slow' ? '慢放 0.25×' : '正常 1×'}`;
}
