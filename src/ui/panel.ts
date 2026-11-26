import { SCENE_THEMES } from '../rendering/themes';
import { WEATHER_PRESETS } from '../rendering/weather';

export function mountUI() {
    const app = document.querySelector<HTMLDivElement>('#app')!;
    const themeItems = SCENE_THEMES.map(
        t => `<button class="theme-option" data-theme-id="${t.id}" type="button" role="menuitemradio">
            <span class="theme-swatch theme-swatch-${t.id}"></span>
            <span>${t.name}</span>
          </button>`
    ).join('');
    const weatherItems = WEATHER_PRESETS.map(
        w => `<button class="weather-option" data-weather-id="${w.id}" type="button" role="menuitemradio">
            <span class="weather-icon" aria-hidden="true">${w.icon}</span>
            <span>${w.name}</span>
          </button>`
    ).join('');
    app.innerHTML = `
<header class="cinema-header">
  <div class="title-row">
    <h1>掠水</h1>
    <span class="title-rule"></span>
    <span class="subtitle" id="scene-subtitle">暮色湖畔 · 真实水漂</span>
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
  <div class="theme-switcher" id="theme-switcher">
    <button id="theme-toggle" class="glass-pill" type="button" aria-haspopup="menu" aria-expanded="false" title="切换湖畔场景主题">
      <span class="theme-swatch theme-swatch-sunset" id="theme-active-swatch"></span>
      <span id="theme-label">落日暮色</span>
      <span class="theme-caret" aria-hidden="true">▾</span>
    </button>
    <div class="theme-menu" id="theme-menu" role="menu" aria-label="选择湖畔主题">
      ${themeItems}
    </div>
  </div>
  <div class="weather-switcher" id="weather-switcher">
    <button id="weather-toggle" class="glass-pill" type="button" aria-haspopup="menu" aria-expanded="false" title="切换湖面天气">
      <span class="weather-icon" id="weather-active-icon" aria-hidden="true">☀</span>
      <span id="weather-label">晴朗</span>
      <span class="theme-caret" aria-hidden="true">▾</span>
    </button>
    <div class="weather-menu" id="weather-menu" role="menu" aria-label="选择天气">
      ${weatherItems}
    </div>
  </div>
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
  <div class="result-replay-bar" role="group" aria-label="回放视角">
    <button id="result-replay-course" class="seg active" type="button">航道回放 · 0.25×</button>
    <button id="result-replay-bullet" class="seg" type="button">子弹跟随 · 0.25×</button>
  </div>
  <div class="result-actions">
    <button id="result-throw-again" class="primary" type="button">再投一次</button>
    <button id="result-change-stone" type="button">换个石头</button>
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
