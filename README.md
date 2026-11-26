# 掠水 · Stone Skipping

Web-first 物理打水漂模拟与风格化小游戏（TypeScript / Three.js / Vite）。  
不预设跳数、不画死抛物线：真实米制石子在 4000 Hz 定步长刚体水动力与 `64×32 m` 连续 GPU 高度场之间自然演化飞行、擦水、飞溅、声景与沉水。

---

## 核心特性

### 1. 真实米制刚体与接触物理
- **4000 Hz 零分配标量 RK4 物理**（[src/simulation/physics.ts](src/simulation/physics.ts)）：解析椭圆平面裁剪计算连续湿面积与压力形心，入水/离水/受压跃迁自动二分细化，完整保留三维姿态演化与陀螺进动（全量 24+64 种子校准回归提速 ~4.7×）。
- **全自由度出手参数**：水平方向 `direction`、初速 `speed`、出手抛角 `elevation`、石面攻角 `tilt`、左右侧倾 `roll`（自然产生侧向弧线轨迹）、正负自旋 `spin`，以及显式 seed 的有界随机温度与 v1 JSON 确定性快照重放。
- **12 大类 × 8 变体 = 96 块独一无二 Blender PBR 河岸石子**（[src/simulation/stones.ts](src/simulation/stones.ts)、[docs/BLENDER_STONE_FACTORY.md](docs/BLENDER_STONE_FACTORY.md)）：从 340g 纯砸大水花的重拳河卵石、醒目白脉溪卵石、歪斜磕碰的棱角碎石，到丹砂河扁石、轻薄页岩、玄武重圆饼、柳叶长扁石、润玉青溪扁石与 75g 溪磨黑曜圆盘；每块 `.glb` 的真实尺寸 `(a, b, h)`、实测闭合体积 × 岩性密度质量、水阻与重心偏心直接联动物理轨迹、GPU 排水深度、水花能量预算与声音响度/音高。

### 2. 64×32 m 连续 GPU 高度场与水幕闭环
- **固定全域 GPU 水波求解 + Cauchy–Poisson 色散多环涟漪**（[src/rendering/coherent.ts](src/rendering/coherent.ts)、[src/simulation/water-grid.ts](src/simulation/water-grid.ts)、[src/simulation/ripples.ts](src/simulation/ripples.ts)）：`4096×1024 RGBA32F` 双缓冲负责近场压坑、滑移尾迹、落滴次级波、鼠标拨水与焦散；叠加真实接触冲量驱动的深水色散多环波包（波速 `0.46–0.74 m/s`，360° 全向扩散带前向动量加强，持续 6–9 秒无网格锯齿）。
- **连续水幕 → 细滴 → 回落次级波**（[src/simulation/spray.ts](src/simulation/spray.ts)、[src/rendering/spray.ts](src/rendering/spray.ts)）：按接触做功预算生成短寿命连续 `WaterRibbon`，沿同一速度场无缝脱滴并在水滴解析穿水时回注至多 4 簇次级动量源；辅以沿湿迹沉积的微气泡尾迹层（[src/rendering/surface-churn.ts](src/rendering/surface-churn.ts)）。
- **落日电影光影与后处理**（[src/rendering/sunset-env.ts](src/rendering/sunset-env.ts)、[src/rendering/water.ts](src/rendering/water.ts)、[src/rendering/post.ts](src/rendering/post.ts)）：偏侧低角度黄金时刻程序化大气穹顶、PMREM 环境反射、层叠远山剪影、曲面湿润岸沿与风摆芦苇、自然渐深卵石河床、双瓣碎金高光与选择性 Bloom/暗角调色。

### 3. 混合电影声景（ElevenLabs 采样 + Web Audio 物理混音）
- **零延迟物理声学引擎**（[src/audio/engine.ts](src/audio/engine.ts)）：解码时自动检测采样瞬态起音点，结合 3D 距离衰减、空气高频低通吸收、开阔湖面混响与耳机左右声像。
- **物理联动层次**：第一跳清脆拍水，后续连跳切换柔和水面掠滑采样并随跳数渐收；沉水声与**入水角、竖直速度、石子质量及已跳次数**挂钩（直接砸水饱满“咕咚”，多跳浅滑落水几乎无声）；切换 `0.25×` / `0.05×` 子弹时间自动压低主总线滤波并拉慢环境音。

### 4. 直觉键鼠体验、岸边拣石与实验室双态
- **全屏沉浸玩家态 + `Tab` 实验室抽屉**：默认全屏暮色湖面与悬浮玻璃 HUD；按 `Tab` 或点击右上角「实验室」呼出完整参数滑块、SI 接触诊断、JSON 快照与鼠标拨水验证。
- **3D 暮色岸滩真实拣石与 8 格随身石匣**（[src/rendering/shore-foraging.ts](src/rendering/shore-foraging.ts)）：按 `F` 丝滑俯身转向 Blender Cycles 2K 无缝沙砾 PBR 暮色岸滩，视野内**所见即所拾**（全部 3D 石子皆可拾取，无干扰性假石），每片浅滩自然半埋、覆瓦微斜地融入 **52 块严格不重样**的真实 Blender `.glb` 河石（从 96 块全谱系石库中避重轮换，经同流域低饱和岩色融合与贴地接触阴影处理）；无需 WASD 走动，纯鼠标悬停预览、点击拾起 **360° 翻转端详薄厚与纹理**，一键「拿去投」「收入石匣」「放回岸滩」或「换一片浅滩」。
- **手边 3D 握石调姿 + 湖面回拉甩投**：左下角独立 3D 视口实时展示手中石子姿态并支持直接拖拽旋转；湖面向下拉蓄力（`6.5–25.5 m/s`）、左右瞄准（淡金色第一落水点引导弧，不剧透后续跳数）并配合手腕切旋甜蜜区游标。

---

## 快速开始

需要 Node.js 20.19+ 或 22.x：

```sh
npm ci
npm run dev -- --port 5173
```

本地完整验证：

```sh
npm run typecheck
npm test
npm run build
```

---

## 操作指南

| 操作 | 功能 |
| :--- | :--- |
| **湖面按住向下拉 + 左右移 + 松手** | 回拉蓄力（`6.5–25.5 m/s`）+ 瞄准方向 + 松手甩出（金色甜蜜区强化切旋与稳度） |
| **拖动左下角 3D 石子** | 直接旋转调整石面攻角（上下）与左右侧倾（左右） |
| **鼠标滚轮 / `Shift + 滚轮`** | 快捷调整石面攻角 `tilt` / 左右侧倾 `roll` |
| **`W` / `S` · `A` / `D` · `Q` / `E`** | 调整出手抛角 `elevation` · 左右侧倾 `roll` · 切换逆/顺自旋方向 |
| **`F` · `1`–`8`** | 打开岸边拣石与随身石匣 · 快捷切换石匣中已收藏的石子 |
| **`Space` · `R` · `M` · `Tab`** | 暂停/继续 · 重投 · 静音切换 · 展开/收起物理实验室抽屉 |

> 开发模式调试入口：`window.waterReview.surfaceOnly(true/false)`、`window.waterReview.calibrationBed(true/false)`，以及 URL 审计参数 `?reference=0.28`、`?reference=1.8&long=1&audit=1`、`?benchmark=1`。

---

## 项目结构与文档导航

```text
src/
  main.ts                 # 极简启动入口
  app/                    # Session 双时钟/120Hz 水命令打包、应用编排 (bootstrap.ts) 与开发审查 (dev-review.ts)
  simulation/             # 零分配物理引擎 (physics.ts)、8 种石子与石匣 (stones.ts)、色散波包 (ripples.ts)、水网数学、飞溅与随机快照
  rendering/              # GPU 高度场 (coherent.ts)、水体光学、落日环境、后处理、程序化石子、水幕与瞄准引导
  audio/                  # Web Audio + 离线采样混合电影声学引擎 (engine.ts)
  camera/                 # 岸后全景、高速长投航道、近景跟随与缓慢微转 (15°–30°) 子弹回放相机
  input/                  # 湖面回拉甩投 (pull-gesture.ts) 与原手势状态机 (gesture.ts)
  ui/                     # 全屏电影 HUD、岸边拣石石匣抽屉、水面空间跳数微标与实验室面板
tests/                    # 13 个现役测试文件（零跳过，物理收敛、水场守恒、色散涟漪、石子/手势/音频/镜头回放）
tools/                    # 资产恢复 (prepare-assets.mjs)、物理扫描、接触校准与浏览器抓图脚本
public/assets/            # 原始石子 GLB 编码源与离线生成的暮色湖畔/水花音频
docs/                     # 架构、石子 Blender 建模规范、物理模型、水体研究与阶段进展
deliverables/             # 历史水体与接触解析的浏览器验证截图、JSON 读数与对比页
```

主要文档：
- [docs/STONE_DESIGN.md](docs/STONE_DESIGN.md) — 8 种石子图鉴、Blender 建模/导出规范与拣石收集设计
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 模块边界、时序与测试命令
- [docs/LONG_COURSE_WATER.md](docs/LONG_COURSE_WATER.md) — `64×32 m` 长域水场、水幕与性能/分辨率权衡
- [docs/PHYSICS_MODEL.md](docs/PHYSICS_MODEL.md) — 刚体水动力与数值积分模型
- [docs/PROGRESS.md](docs/PROGRESS.md) — 分阶段演进记录
- [CONTRIBUTING.md](CONTRIBUTING.md) — 分支、PR 流程与本地验证约定
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — 第三方算法改编与资源许可说明

---

## 当前验证状态与已知限制

- **自动化验证**：全量测试 0 失败 / 0 跳过（已彻底清理历史退役渲染器与跳过用例），`tsc --noEmit` 与 Vite 生产构建通过，GitHub Actions CI (`verify`) 自动运行。
- **长投基准**：桌面长投练习预设（`24 m/s`、`2°`、`10°`、`36.7 r/s`）可稳定跑出 **55 跳 / 45.8 m**；更高频的 **90 跳**实拍标定在步长加密下仍存在亚毫米接触收敛敏感性，尚未宣称达标（见 [docs/LONG_COURSE_WATER.md](docs/LONG_COURSE_WATER.md)）。
- **流体与硬件边界**：水场为线性高度场 + 经验动量源的单向耦合，非三维体积守恒多相流体；`4096×1024 RGBA32F` 状态双缓冲约占 `128 MiB` 显存，尚未做移动端真机分级优化。项目整体未另授予开源许可证。
