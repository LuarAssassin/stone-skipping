import { CameraRig, type OverviewSettings, type ViewMode } from '../camera/rig';
import { Session, type ReplayMode } from '../app/session';
export function mountCameraPanel(rig: CameraRig, session: Session) {
    const section = document.createElement('section');
    section.id = 'camera-panel';
    section.innerHTML = `
    <label class="choice">观察视角 <select id="view" aria-label="观察视角">
      <option value="overview">岸后全景 · 固定</option><option value="follow">近景跟随</option>
    </select></label>
    <label class="choice">播放速度 <select id="playback" aria-label="播放速度">
      <option value="normal">正常 · 1×</option><option value="slow">普通慢放 · 0.25×</option>
      <option value="bullet">子弹时间 · 0.05× 环绕</option>
    </select></label>
    <p class="note">子弹时间贴水环绕；退出后回到所选视角。</p>
    <details id="camera-settings"><summary>全景构图参数</summary><div id="view-fields"></div>
      <button id="reset-camera">重置全景参数</button>
    </details>`;
    const panel = document.querySelector('aside')!;
    panel.insertBefore(section, document.querySelector('#developer'));
    section.querySelector<HTMLSelectElement>('#view')!.onchange = event => {
        rig.view = (event.target as HTMLSelectElement).value as ViewMode;
    };
    section.querySelector<HTMLSelectElement>('#playback')!.onchange = event => {
        session.mode = (event.target as HTMLSelectElement).value as ReplayMode;
    };
    const fields: [
        keyof OverviewSettings,
        string,
        number,
        number,
        number,
        string
    ][] = [
        ['height', '机位高度', 2, 20, 0.5, 'm'],
        ['distance', '岸后距离', 2, 25, 0.5, 'm'],
        ['azimuth', '观察方位', -65, 65, 1, '°'],
        ['target', '湖面注视距离', 3, 30, 0.5, 'm'],
        ['fov', '视野 FOV', 30, 75, 1, '°'],
    ];
    for (const [key, name, min, max, step, unit] of fields) {
        const label = document.createElement('label');
        label.className = 'slider';
        label.innerHTML = `<span>${name}<output></output></span><input id="camera-${key}" aria-label="${name}" type="range" min="${min}" max="${max}" step="${step}">`;
        const input = label.querySelector('input')!;
        input.oninput = () => { rig.settings[key] = Number(input.value); sync(); };
        section.querySelector('#view-fields')!.append(label);
        function sync() {
            input.value = String(rig.settings[key]);
            label.querySelector('output')!.value = `${rig.settings[key]} ${unit}`;
        }
        sync();
    }
    section.querySelector<HTMLButtonElement>('#reset-camera')!.onclick = () => {
        rig.reset();
        for (const [key] of fields) {
            const input = section.querySelector<HTMLInputElement>(`#camera-${key}`)!;
            input.value = String(rig.settings[key]);
            input.dispatchEvent(new Event('input'));
        }
    };
}
