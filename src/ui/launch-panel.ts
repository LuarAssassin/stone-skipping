import { DEFAULT, type Launch } from '../simulation/physics';
import { DEFAULT_TEMPERATURE } from '../simulation/launch-randomness';
export function mountLaunchPanel() {
    const fields: [
        keyof Launch,
        string,
        number,
        number,
        number,
        string
    ][] = [['direction', '方向', -35, 35, 1, '°'], ['speed', '速度', 2, 20, .5, 'm/s'], ['elevation', '出手仰角', -12, 20, 1, '°'], ['tilt', '石面倾角', 0, 50, 1, '°'], ['spin', '自旋', 0, 30, 1, '转/s']];
    const parameters = { ...DEFAULT };
    for (const [key, label, min, max, step, unit] of fields) {
        const element = document.createElement('label');
        element.className = 'slider';
        element.innerHTML = `<span>${label}<output>${parameters[key]} ${unit}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${parameters[key]}" aria-label="${label}">`;
        element.querySelector('input')!.oninput = event => { parameters[key] = +(event.target as HTMLInputElement).value; element.querySelector('output')!.value = `${parameters[key]} ${unit}`; };
        document.querySelector('#controls')!.append(element);
    }
    function syncControls() {
        fields.forEach(([key, , , , , unit], index) => { const label = document.querySelectorAll<HTMLLabelElement>('#controls > .slider')[index]; label.querySelector('input')!.value = String(parameters[key]); label.querySelector('output')!.value = `${parameters[key]} ${unit}`; });
        document.querySelector<HTMLInputElement>('#posture')!.value = String(parameters.tilt);
        document.querySelector('#tilt-value')!.textContent = `${parameters.tilt}°`;
    }
    document.querySelector<HTMLInputElement>('#posture')!.oninput = event => { parameters.tilt = +(event.target as HTMLInputElement).value; syncControls(); };
    document.querySelector('#controls')!.addEventListener('input', syncControls);
    let temperature = DEFAULT_TEMPERATURE;
    const variation = document.createElement('div');
    variation.innerHTML = `<label class="slider"><span>投掷扰动温度 / 随机强度 <output id="temperature-value">1</output></span><input id="temperature" aria-label="投掷扰动温度" type="range" min="0" max="2" step="0.1" value="1"></label><p class="note">0 实验（无扰动） · 1 自然微扰；只扰动出手，不模拟风浪。上方滑块为目标值。</p><pre id="launch-summary">尚未投掷</pre><details><summary>完整投掷快照 / JSON</summary><textarea id="snapshot" aria-label="投掷快照 JSON" rows="8" style="width:100%;box-sizing:border-box"></textarea><button id="copy-snapshot">复制快照</button><button id="load-snapshot">载入并重放</button><span id="snapshot-message"></span></details>`;
    document.querySelector('#controls')!.append(variation);
    document.querySelector<HTMLInputElement>('#temperature')!.oninput = event => { temperature = +(event.target as HTMLInputElement).value; document.querySelector('#temperature-value')!.textContent = String(temperature); };
    const visual={surface:.35,sheet:.8,breakup:1.1};
    const details=document.createElement('details');details.innerHTML='<summary>水体细节扰动</summary><p class="note">仅下一次新投掷生效；0 无该层扰动，2 上限。不改变出手与跳数。</p>';
    for(const [key,label] of [['surface','基础水面'],['sheet','接触水舌'],['breakup','破碎细滴']] as const){
        const control=document.createElement('label');control.className='slider';control.innerHTML=`<span>${label}<output>${visual[key]}</output></span><input type="range" min="0" max="2" step="0.05" value="${visual[key]}" aria-label="${label}扰动">`;
        control.querySelector('input')!.oninput=event=>{visual[key]=+(event.target as HTMLInputElement).value;control.querySelector('output')!.value=String(visual[key]);};details.append(control);
    }
    variation.prepend(details);
    return { parameters, fields, syncControls, visual, get temperature() { return temperature; } };
}
