import type { Session } from '../app/session';
export function updateTelemetry(session: Session, visibleDrops: number) {
    const { sim, paused, visualTime } = session;
    document.querySelector('#skips')!.textContent = String(sim.skips);
    document.querySelector('#distance')!.textContent = Math.hypot(sim.p.x, sim.p.z).toFixed(1);
    document.querySelector('#status')!.textContent = `${paused ? '已暂停 · ' : ''}${sim.reason} / ${sim.time.toFixed(2)} s`;
    document.querySelector('#diagnostics')!.textContent = `速度  ${sim.v.length().toFixed(2)} m/s\n高度  ${sim.p.y.toFixed(3)} m\n湿面积 ${(sim.area * 1e4).toFixed(2)} cm²\n水动力 ${sim.force.length().toFixed(2)} N\n总能量 ${sim.energy().toFixed(3)} J\n自旋  ${(sim.omega.length() / Math.PI / 2).toFixed(1)} 转/s\n效果时钟 ${visualTime.toFixed(3)} s\n可见水滴 ${visibleDrops}`;
    document.querySelector('#history')!.innerHTML = sim.contacts.map(c => `<div class="contact">#${c.id + 1} ${c.bounced ? '↗ 离水' : c.end ? '— 结束' : '≈ 入水'} · ${(c.impulse).toFixed(3)} N·s · ${((c.end ?? sim.time) - c.time).toFixed(3)} s</div>`).join('');
    document.querySelector('#status')!.textContent += ` · ${session.mode === 'bullet' ? '子弹环绕 0.05×' : session.mode === 'slow' ? '慢放 0.25×' : '正常 1×'}`;
}
