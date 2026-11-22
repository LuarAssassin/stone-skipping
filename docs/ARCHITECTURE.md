# 代码结构与公开仓库迁移

## 已发布确认 · 2026-11-15

已合并到 `LuarAssassin/stone-skipping` 的main：`1dd7efc1b041d13f8d1cb463a1fcd695e241fe80`（PR #1，squash合并）。下方迁移与18个旧文件删除均已实际完成；远端38个文件逐一核对Git blob SHA，与本地公开文件集合完全一致，无遗留旧扁平文件，无研究docs。下方“没有提交或push”描述仅指实施代理交接时，主会话随后已完成发布。

主会话最终重新跑43/43测试、类型检查、构建，全部通过；预览保持localhost:5173可操作。

## 目录职责

```text
src/
  main.ts                 # 只加载样式并调用 boot（4行）
  app/
    bootstrap.ts          # 生命周期、控件接线、resize、RAF编排
    session.ts            # 投掷快照、重放、暂停、播放倍率与两种时钟
  simulation/
    physics.ts            # 原物理积分、接触、计数；不依赖DOM/相机
    launch-randomness.ts   # 原seed抽样、快照校验；算法未改
    visual-variation.ts    # 纯视觉快照schema、校验、默认值与寻址seed/hash工具
  rendering/
    world.ts              # Three场景、资产、纯视觉岸沿
    feedback.ts           # 石子、轨迹、实例水滴与效果场的逐帧同步
    effects.ts            # 原确定性接触效果状态
    water.ts              # 原水面shader与波包
    sheets.ts             # 原薄片网格
  camera/rig.ts            # 纯机位计算、平滑过渡、固定/跟随/低机位环绕
  input/
    gesture.ts            # 原纯手势状态机
    bind.ts               # PointerEvent接线、捕获与各种取消路径
  ui/
    panel.ts              # 页面骨架与手势HUD
    launch-panel.ts       # 投掷目标与温度开发控件
    camera-panel.ts       # 视角、播放倍率、全景参数与重置
    telemetry.ts          # 中文状态与诊断
    style.css             # 桌面/手机响应式布局
tests/
  *.test.ts               # 原36项 + 镜头/回放7项
  fixtures/contact-before.json
tools/
  prepare-assets.mjs
  sweep.ts
  variation-sweep.ts
  contact-calibration.ts
public/assets/            # 运行资产及可恢复GLB编码源
```

不引入ECS、容器或DI框架。Session只依赖确定性物理/效果；CameraRig只接收位置、播放状态和独立展示时间，不回写物理。输入控件不会修改飞行中的Launch。app编排各层，不把原main全文换名塞进另一文件。

水花视觉snapshot是Session/domain协议，纯数据与seed工具归属`src/simulation/visual-variation.ts`；rendering/effects消费该协议，simulation不反向依赖rendering。旧`src/rendering/water-variation.ts`已删除，不保留兼容转发；physics与sampleThrow算法不变。

## 时序

- RAF真实时间（上限0.1s）→ Session.tick。
- presentationTime只受暂停影响，不乘播放倍率；供相机环绕使用。
- 真实时间 × 1 / 0.25 / 0.05 → 固定物理外步与效果采样。
- 沉水后物理停止，visualTime继续让已有水花消散；暂停时两个时钟都停。
- 新投掷生成seed并使用当前开发温度（初始T1），重置为1x；重放只使用现有快照，不调用seed源。
- 相机指数平滑切换，不改模拟步长。子弹模式为临时覆盖，用户视角和全景参数保留；暂停冻结环绕轨道。

## 命令

| 命令 | 实际入口 |
| --- | --- |
| `npm test` | `tsx --test tests/*.test.ts` |
| `npm run typecheck` | src、tests、tools一起检查 |
| `npm run build` | 恢复资产、类型检查、Vite构建 |
| `npm run sweep` | `tools/sweep.ts` |
| `npm run sweep:variation -- 64` | `tools/variation-sweep.ts` |
| `npm run calibrate -- /tmp/contact-report.json 64` | 显式输出新报告；测试不覆盖旧报告 |

fixture从测试文件通过`new URL('./fixtures/contact-before.json', import.meta.url)`读取，不依赖当前shell目录。资产恢复脚本迁到tools后仍以import.meta.url定位`../public/assets/`。

## 新旧路径映射

| 旧路径 | 新路径 |
| --- | --- |
| `src/main.ts` | 保留，缩为启动入口；旧职责拆到app/input/ui/rendering |
| `src/physics.ts` | `src/simulation/physics.ts` |
| `src/launch-randomness.ts` | `src/simulation/launch-randomness.ts` |
| `src/gesture.ts` | `src/input/gesture.ts` |
| `src/effects.ts` | `src/rendering/effects.ts` |
| `src/rendering/water-variation.ts` | `src/simulation/visual-variation.ts`（纯协议/seed工具，旧文件删除） |
| `src/water.ts` | `src/rendering/water.ts` |
| `src/sheets.ts` | `src/rendering/sheets.ts` |
| `src/style.css` | `src/ui/style.css` |
| `src/sweep.ts` | `tools/sweep.ts` |
| `src/variation-sweep.ts` | `tools/variation-sweep.ts` |
| `src/contact-calibration.ts` | `tools/contact-calibration.ts` |
| `src/physics.test.ts` | `tests/physics.test.ts` |
| `src/contact-calibration.test.ts` | `tests/contact-calibration.test.ts` |
| `src/effects.test.ts` | `tests/effects.test.ts` |
| `src/gesture.test.ts` | `tests/gesture.test.ts` |
| `src/launch-randomness.test.ts` | `tests/launch-randomness.test.ts` |
| `src/sheets.test.ts` | `tests/sheets.test.ts` |
| `scripts/prepare-assets.mjs` | `tools/prepare-assets.mjs` |
| `test-fixtures/contact-before.json` | `tests/fixtures/contact-before.json` |

## 公开仓库删除清单

上传新目录、更新package.json/tsconfig.json并用PUBLIC_README.md的内容替换公开README后，**删除下面旧文件**，避免扁平入口与旧测试并存；不要删除src/main.ts或资产编码源。

```text
src/physics.ts
src/launch-randomness.ts
src/gesture.ts
src/effects.ts
src/water.ts
src/sheets.ts
src/style.css
src/sweep.ts
src/variation-sweep.ts
src/contact-calibration.ts
src/physics.test.ts
src/contact-calibration.test.ts
src/effects.test.ts
src/gesture.test.ts
src/launch-randomness.test.ts
src/sheets.test.ts
scripts/prepare-assets.mjs
test-fixtures/contact-before.json
```

空目录scripts/和test-fixtures/可删除。新增代码目录app/camera/input/rendering/simulation/ui、tests、tools必须整组上传。公开短README不依赖研究docs；本地实验记录、完整JSON、node_modules、dist不必公开。本轮没有git提交或push。
