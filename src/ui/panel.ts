export function mountUI() {
    const app = document.querySelector<HTMLDivElement>('#app')!;
    app.innerHTML = `
<header class="cinema-header">
  <div class="title-row">
    <h1>掠水</h1>
    <span class="title-rule"></span>
    <span class="subtitle">暮色湖畔 · 真实水漂</span>
  </div>
  <div class="best-badge" id="best-record">最佳 <strong>0</strong> 跳 · <span>0.0</span> m</div>
</header>

<div class="hud-score" aria-live="polite">
  <div class="metric">
    <strong id="skips">0</strong>
    <small>弹跳</small>
  </div>
  <div class="metric-divider"></div>
  <div class="metric">
    <strong id="distance">0.0</strong>
    <small>距离 / m</small>
  </div>
</div>

<div class="hud-top-right">
  <button id="audio-toggle" class="glass-pill" type="button" title="切换声音 (M)">
    <span id="audio-icon" aria-hidden="true">🔊</span><span id="audio-label">声音</span>
  </button>
  <button id="lab-toggle" class="glass-pill" type="button" title="切换物理实验室面板 (Tab)">
    <span class="pill-dot"></span>实验室 <kbd>Tab</kbd>
  </button>
</div>

<section id="hand-panel" class="stone-pill" aria-label="当前石子与快捷操作">
  <div class="stone-pill-meta">
    <div class="hand-title-row">
      <strong id="hand-stone-name">河岸标准扁石</strong>
      <span class="rarity-tag rarity-usable" id="hand-stone-rarity">寻常</span>
    </div>
    <div class="stone-pill-posture" id="hand-posture-summary">
      <span>攻角 <b id="hand-tilt">6°</b></span>
      <span>侧倾 <b id="hand-roll">0°</b></span>
      <span>抛角 <b id="hand-elev">2°</b></span>
      <button id="hand-spin-dir" class="spin-inline" type="button" title="Q/E 切换顺逆自旋">↻ 顺旋</button>
    </div>
  </div>
  <div class="stone-pill-actions">
    <button id="open-tune" class="forage-btn subtle" type="button" title="抬起当前石子放大调姿">调姿</button>
    <button id="open-stones" class="forage-btn" type="button" title="低头在暮色岸滩拣石头 (F)">
      拣石 <kbd>F</kbd>
    </button>
  </div>
</section>

<section id="result-toast" class="result-toast" aria-live="polite">
  <div class="result-head">
    <span class="result-tag" id="result-tag">本轮落水</span>
    <span class="result-record" id="result-record">★ 新纪录</span>
  </div>
  <div class="result-stats" id="result-stats">0 跳 · 0.0 m</div>
  <div class="result-actions">
    <button id="result-bullet" type="button">0.05× 子弹回看</button>
    <button id="result-replay" type="button">重放</button>
  </div>
</section>

<section id="gesture-hud">
  <div class="gesture-top">
    <strong id="gesture-title">在湖面向下拉蓄力 · 左右瞄准 · 松手甩出</strong>
    <span id="sweet-badge" class="sweet-badge">★ 切旋甜蜜区</span>
    <span id="aim-arrow" aria-hidden="true">↑</span>
  </div>
  <progress id="power" max="1" value="0" aria-label="蓄力"></progress>
  <div id="wrist-track" class="wrist-track" aria-hidden="true">
    <div class="wrist-sweet-zone"></div>
    <div id="wrist-cursor" class="wrist-cursor"></div>
  </div>
  <output id="aim">滚轮调攻角 · A/D 侧倾 · W/S 抛角 · Q/E 切旋 · Esc 取消</output>
</section>

<nav class="hud-dock" aria-label="快捷控制">
  <div class="dock-group" role="group" aria-label="视角">
    <button class="seg active" data-view="overview" type="button">岸后</button>
    <button class="seg" data-view="course" type="button">航道</button>
    <button class="seg" data-view="follow" type="button">跟随</button>
  </div>
  <div class="dock-group" role="group" aria-label="播放速度">
    <button class="seg active" data-rate="normal" type="button">1×</button>
    <button class="seg" data-rate="slow" type="button">0.25×</button>
    <button class="seg" data-rate="bullet" type="button">0.05×</button>
  </div>
  <div class="dock-actions">
    <button id="quick-throw" class="dock-btn primary" type="button" title="投出石子 (R)">投石</button>
    <button id="quick-long" class="dock-btn" type="button" title="高速长投练习预设">长投</button>
    <button id="quick-replay" class="dock-btn" type="button" title="重放上一投">重放</button>
    <button id="quick-pause" class="dock-btn" type="button" title="暂停或继续 (Space)">暂停</button>
  </div>
</nav>

<aside class="lab-drawer" aria-label="物理实验室面板">
  <div class="lab-head">
    <div>
      <span class="eyebrow">STONE / WATER LAB · 01</span>
      <h2>物理与光学实验室</h2>
    </div>
    <button id="lab-close" class="icon-btn" type="button" aria-label="关闭实验室面板">✕</button>
  </div>
  <div class="actions">
    <button id="throw" type="button">投出石子 ↗</button>
    <button id="pause" type="button">继续</button>
    <button id="replay" type="button">重放</button>
    <button id="step" type="button">单步</button>
  </div>
  <label class="slider posture">
    <span>石面攻角 <output id="tilt-value">6°</output></span>
    <input id="posture" aria-label="快捷石面倾角" type="range" min="0" max="50" step="1" value="6">
  </label>
  <details id="developer" open>
    <summary>开发参数 / 重放 JSON / 诊断</summary>
    <div id="controls"></div>
    <label class="slow">
      <input id="helpers" type="checkbox"> 轨迹 / 定位辅助
    </label>
    <details>
      <summary>接触诊断 / SI 单位</summary>
      <pre id="diagnostics"></pre>
      <div id="history"></div>
    </details>
    <p class="note">空格暂停 · R 重投 · F 拣石 · Tab 实验室 · M 静音<br>跳数仅在完整触水后离水计入；最终沉水不计。</p>
    <p id="asset">正在加载石头…</p>
  </details>
  <footer>
    <span id="status">准备投掷</span>
    <span>0.25 ms 固定步长 · GPU 连续水场</span>
  </footer>
</aside>
`;
}
