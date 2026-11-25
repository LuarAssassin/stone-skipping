# 代码结构与公开仓库迁移

## 已发布确认 · 2026-11-15

已合并到 `LuarAssassin/stone-skipping` 的main：`1dd7efc1b041d13f8d1cb463a1fcd695e241fe80`（PR #1，squash合并）。下方迁移与18个旧文件删除均已实际完成；远端38个文件逐一核对Git blob SHA，与本地公开文件集合完全一致，无遗留旧扁平文件，无研究docs。下方“没有提交或push”描述仅指实施代理交接时，主会话随后已完成发布。

主会话最终重新跑43/43测试、类型检查、构建，全部通过；预览保持localhost:5173可操作。

## 目录职责（当前主线）

```text
src/
  main.ts                 # 只加载样式并调用 boot（4行）
  app/
    bootstrap.ts          # 生命周期、键鼠/石匣/音频接线、resize、RAF编排
    dev-review.ts         # 开发期 waterReview / ?reference / ?audit / ?benchmark 钩子
    session.ts            # 投掷快照、重放、暂停、播放倍率、120Hz 水命令打包与双时钟
  simulation/
    physics.ts            # 4000Hz 零分配标量RK4刚体水动力、解析椭圆湿几何、roll/signed spin 与 StoneSpec
    stones.ts             # 8种物理石子图鉴、岸边随机刷石与本地持久化8格石匣 (StoneBox)
    ripples.ts            # 真实Contact驱动的Cauchy-Poisson深水色散多环波包提取与CPU解析校验
    launch-randomness.ts  # 显式seed抽样、roll/stone 快照校验
    visual-variation.ts   # 纯视觉快照schema、校验与确定性hash工具
    water-grid.ts         # 纯数学网格参数、四点Gauss排水归一与冲量/滑移源计算
    spray.ts              # 接触做功预算驱动的连续水幕条、脱滴弹道与解析回落聚合
  rendering/
    world.ts              # Three场景、落日灯光、自然渐深河床、焦散与石子/瞄准引导接线
    sunset-env.ts         # 程序化Rayleigh/Mie落日天空穹顶、PMREM、远山剪影、自然岸沿与风摆芦苇
    post.ts               # EffectComposer + 选择性UnrealBloom + 电影暗角/冷暖调色 + OutputPass
    coherent.ts           # GPU RGBA32F 双缓冲高度场与焦散求解器
    water.ts              # Three Water 反射/裁剪透射、高度场位移、解析色散涟漪与暮色双瓣高光
    surface-churn.ts      # 沿湿迹沉积的微气泡/白沫光学厚度纹理
    spray.ts              # 逆光水幕网格 (WaterRibbon) 与毛细缩颈细滴 (SprayDrop)
    stone-mesh.ts         # Blender 36石GLB热插拔/程序化回退、触水变湿、暖金高亮与3D握石预览台
    shore-foraging.ts     # 3D暮色岸滩固定俯视视野散落、纯鼠标射线直拾与360°悬空端详交互
    aim-guide.ts          # 回拉瞄准时的淡金色第一落水点引导弧与着水环
    feedback.ts           # 石子、轨迹、水面、色散波包与飞溅的逐帧同步
  audio/
    engine.ts             # Web Audio + 离线采样混合电影声学引擎（物理沉水、石子清脆碰撞、3D衰减、慢放滤波）
  camera/rig.ts           # 岸后全景、高速长投航道、近景跟随、岸滩低头寻石与缓慢微转 (15°–30°) 子弹镜头
  input/
    pull-gesture.ts       # 湖面回拉蓄力、方向瞄准与手腕切旋甜蜜区状态机
    gesture.ts            # 原纯按住手势状态机（保留兼容测试）
  ui/
    panel.ts              # 全屏电影HUD、左下角握石台与可折叠实验室抽屉骨架
    bounce-markers.ts     # 水面空间跳数微标投影层
    launch-panel.ts       # 实验室投掷参数（含roll/signed spin）与快照控件
    camera-panel.ts       # 视角、播放倍率与全景参数控件
    telemetry.ts          # 个人最佳纪录持久化、跳数动画与SI诊断
    style.css             # 暮色磨砂玻璃全屏样式与移动端响应式
tests/
  *.test.ts               # 13个现役测试文件（0失败 / 0历史跳过）
  fixtures/contact-before.json
tools/                    # 资产恢复、物理扫描、接触校准与浏览器采集脚本
public/assets/            # 原始GLB编码源与离线生成的7条音频素材
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
