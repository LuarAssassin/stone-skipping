export function mountUI() {
    const app = document.querySelector<HTMLDivElement>('#app')!;
    app.innerHTML = `<header>
<span class="eyebrow">STONE / WATER LAB · 01</span>
<h1>掠水<span>一颗石子，一片水。</span>
</h1>
<p>不是预设的跳跃。让速度、姿态与水面决定下一刻。</p>
</header>
<aside>
<div class="stats">
<div>
<strong id="skips">0</strong>
<small>成功弹跳</small>
</div>
<div>
<strong id="distance">0.0</strong>
<small>距离 / 米</small>
</div>
</div>
<div id="controls">
</div>
<div class="actions">
<button id="throw">投出石子 ↗</button>
<button id="pause">继续</button>
<button id="replay">重放</button>
<button id="step">单步</button>
</div>
<label class="slow">
<input id="helpers" type="checkbox"> 轨迹 / 定位辅助</label>
<details>
<summary>接触诊断 / SI 单位</summary>
<pre id="diagnostics">
</pre>
<div id="history">
</div>
</details>
<p class="note">80 × 60 × 9 mm · 60 g<br>空格暂停 · R 重投 · 参数在下次投掷生效<br>跳数仅在完整触水后离水计入；最终沉水不计。</p>
<p id="asset">正在加载原始石头…</p>
</aside>
<footer>
<span id="status">准备投掷</span>
<span>固定步长 0.25 ms / 静水实验 / 无音效</span>
</footer>`;
    const developer = document.createElement('details');
    developer.id = 'developer';
    developer.innerHTML = `<summary>开发参数 / 重放 JSON / 诊断</summary>`;
    const panel = document.querySelector('aside')!;
    for (const element of Array.from(panel.children))
        if (!element.matches('.stats,.actions'))
            developer.append(element);
    panel.append(developer);
    const posture = document.createElement('label');
    posture.className = 'slider posture';
    posture.innerHTML = `<span>石面倾角 <output id="tilt-value">6°</output>
</span>
<input id="posture" aria-label="快捷石面倾角" type="range" min="0" max="50" step="1" value="6">`;
    panel.insertBefore(posture, developer);
    const hint = document.createElement('section');
    hint.id = 'gesture-hud';
    hint.innerHTML = `<strong>在湖面按住，拖动，松手投掷</strong>
<p>横拖调方向 · 上拖抬高 / 下拖压低<br>按住 0.12–1.4 秒蓄力 · Esc 取消</p>
<progress id="power" max="1" value="0" aria-label="蓄力">
</progress>
<output id="aim">准备：约按住 0.7 秒，轻拖后松手</output>
<span id="aim-arrow">↑</span>`;
    app.append(hint);
}
