# 打水漂 · Stone Skipping

> 当前本地为连续水面候选版，源码已保存到[草稿 PR #5](https://github.com/LuarAssassin/stone-skipping/pull/5)，提交8ecd327b5e3ea03c2834c2d196ab6d632c5b7570；未合入main。鼠标整片波面与移除蘑菇已获独立实图确认，真实小石头冲击/沉水可读性仍未达标。上版PR #4只保留为历史实验。

## 本地表面可读性定点修正（未发布）

仅调整渲染：移除旧高光统一×.12衰减；介电Fresnel/归一微表面高光、跟随视角可采样的静态日光、平滑天空特征与ACES曝光层次；棋盘边线/格色与焦散降对比，底床仍保留。真实米制高度/坡度不放大，求解器、耦合、出手和石头尺寸不变。DEV可用 `waterReview.surfaceOnly(true)` 排除透射床纹/水下调制，`false` 恢复默认。

实读同快照同机位图：鼠标弧形波峰明确；早触/末触只能看到很细的高光缺口，沉水后有细密波脊，**真实石子强反馈仍未达标，非水花系统完成**。大竖亮带是太阳反射，不是水花。该光学管线仍为 **PARTIAL** 移植，不是完整忠实的 Evan 光线追踪泳池；高度场不支持腾空/翻卷喷溅。独立 before/after、surface-only 图和GPU同状态证据见 `deliverables/surface-readability/README.md`，未改写旧证据。以下为既有反冲与历史记录。

## 定点修正：真实接触反冲 → 水面速度

`WaterTick` 现同时接收旧/新排水与可选真实竖直反冲量：固定物理步对 `netImpulse.y` 取增量，反号后在120Hz累积一次注入。离散归一核、N·s→m/s→每步米制增量、经验参与深度与边界见 [WATER_MOMENTUM](docs/WATER_MOMENTUM.md)。石子物理尺寸/采样/事件未改；鼠标只是零测量冲量的运动学代理。没有加水片、圈贴图或蘑菇物件。

本轮 **68 pass / 0 fail / 10 显式 retired skip**，typecheck/build通过；真实GPU反冲积分误差<2e-9 N·s，正常/慢速/子弹不规则分组全通道完全一致。实际石子局部响应数值增强，但读图后末触仍淡、沉水仍偏床条纹，**视觉目标未过，不以鼠标大刷或测试冒充验收**。同快照新图/JSON及 `.previous` 保留在原交付目录。旧段落数字为历史记录。

## 当前默认：连续 GPU 水面基线（本地2026-11-15）

默认游戏和操作区 **鼠标拨水验证** 拖动模式共用 Evan 风格 RGBA32F 高度/速度求解器、512×256 / 16×8 m、120 Hz。鼠标模式显式隔离投掷手势；投掷/重放退出鼠标模式。石子真实姿态、椭圆水平范围和垂直浸深进入同一旧排水返回/新排水移除命令；物理与有种子出手采样算法未改。计分结束后水波继续运行，暂停、正常/慢速/子弹回放和镜头保留。

旧水片、厚缘、液丝、球状蘑菇及其模拟默认关闭；历史 visual seed / surface / sheet / breakup 快照字段保留但不生效，三项视觉滑块禁用。高度场不能表现翻卷、腾空流体或破碎喷溅。当前校准床和天空为自绘程序纹理；Evan MIT 全文、改编范围和 Three 通告见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)。

实际方程、时步/稳定性与限制见 [COHERENT_WATER_BASELINE](docs/COHERENT_WATER_BASELINE.md)；实测 GPU/输入/沉水证据见 `deliverables/coherent-water-baseline/README.md`。画面仍需独立视觉验收，不能用测试通过宣称真实水花。**下文为旧默认的历史 WIP 记录，不描述当前运行路径；源码已保存草稿PR #5，未merge到main。**

> 当前本地为未通过视觉验收的结构实验版，已保存到GitHub草稿PR #4（real-skip-structure-wip-20261115，33333cb581b2becc950df694b3654d9676c53a6e）；没有覆盖main。正确脱滴时标的新实图见交付页08–10，可辨局部端滴脱离，但根部连接、完整收颈与整体水感仍未通过。67项测试只证明代码合同，不证明真实感。

## 最后限定纠偏（本地 2026-11-15）

已实际替换首节点整次预算：每个新节点用当前湿面积×入流法向速度×dt及增量冲量/能量包络增加有限水量，移除出生速度对后续节点限速；离水停止追加。液丝按8节点窗口出生，冻结其体积、时刻和几何前缀，不随未来append改形或重定pinch。根部增加有限宽度曲率过渡及随预算衰减的局部隆起，厚缘改为非均匀截面积。仍是局部经验模型，不是全域守恒求解。

同机位02/03/04/05实图及完整节点/cohort JSON已更新，原版保留为`.previous.*`；其余阶段和CPU/RAF数据为前轮历史，未重测。全套测试、typecheck/build及实际GL链接用于代码验证，**不是视觉验收**。本会话Read四张后确认：石头前进、水体滞后成立，但根部→水缘→薄片仍读不清，液丝偏粗短块/杆，指定阶段没有可读缩颈脱滴，**视觉目标仍失败**，按限定停止调参。方法和诚实边界见[REAL_SKIP_TARGET](docs/REAL_SKIP_TARGET.md)；本地交付页在`deliverables/real-skip-target/index.html`。以下为历史记录。

> 把一颗石子掠过水面的那几秒，做到值得反复体验。

## 当前状态 · 2026-11-15

最新完成**早触相位校正与分层视觉扰动**：保留120Hz水场，用源出生时刻一阶矩重建步内高度，几何/法线同源；独立visual seed与0..2三层温度（默认.35/.8/1.1）写入兼容v1快照。新控件仅下一投生效，同物理JSON可替换visual字段做A/B；出手温度和sampleThrow数值算法未改。16连续视觉seed实测轮廓/破洞/滴群分别16种、0重复，全视觉T0完全重合；最终58/58测试、typecheck、build通过；节点按当前湿区/压力出生，破洞改为非周期相关场，不再沿用固定阈值喷速或正弦网孔。移除光学坡度×2.6，反射/透射1024²；仍无焦散，默认远些机位细波仍淡，不能把数值独特性说成视觉达标。方法/边界见[WATER_VARIATION](docs/WATER_VARIATION.md)，真实六张同机位图片和JSON见deliverables/water-variation/index.html。以下52测试与water-rework段落是前轮记录，原对照保留。

本轮完成**局部有状态水响应重做**：16×8 m、512×256 CPU高度/速度场真实位移水面，接触轨迹/离水/落滴一次事件驱动；真实场景反射、颜色/深度透射与吸收；一次接触一条带冻结出生速度节点的连续水舌，移除重复扇片。默认岸后构图收近，石头保持真实尺寸。

最后一轮小修已完成：水滴去金属并分散可见粒径/透明度，薄片改用毫米级自身厚度吸收及破碎边缘，高度场法线可读性增强、底床减黄降对比。52/52测试及typecheck/build通过，实际shader全部链接成功；截图同步更新，before保留。同次投掷的实际对照可从deliverables/water-rework/index.html打开；基线源可追溯公开提交1dd7efc1b041d13f8d1cb463a1fcd695e241fe80。临时取图脚本和旧源副本已清理。

这不是体积流体或参考案例画质达标宣告。近景残余拱形薄膜/暗珠轮廓、初触波纹偏弱、后段波纹偏软及正常桌面尾延迟仍是局限。方法、实际帧耗时和before/after见[WATER_REWORK](docs/WATER_REWORK.md)，上游许可见[THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)。可审阅实图和数据保留于deliverables/water-rework，未上传远端。

此前已完成**职责分层重构与多镜头回放**，保留随机出手校准、接触水花与鼠标/触屏手势。

- 默认岸后抬高固定全景；高度、后退、方位、注视距离、FOV可调可重置，保留近景跟随。
- 正常1x、普通慢放0.25x、贴水低机位环绕子弹时间0.05x；暂停冻结轨道，退出恢复用户镜头。
- 独立presentation clock不参与物理；新投恢复1x，初始T1；重放同快照，不抽seed。
- src/main.ts只保留4行启动；simulation/rendering/camera/input/ui/app分工，tests与tools独立。

镜头行为与实际验证见[CAMERA_REPLAY](docs/CAMERA_REPLAY.md)，结构、路径映射和公开仓库旧文件删除清单见[ARCHITECTURE](docs/ARCHITECTURE.md)。

此前已实现：

- 保留默认温度T=1，每次新投掷抽取小幅不同的实际出手；不随机最终跳数，不固定某个成绩。
- 石子受力使用解析椭圆湿面积与作用点、耦合RK4、接触边界局部二分；姿态、自旋、续跳与沉水由物理计算。
- 同一24组难例中DT/半步跳数分歧从5组降到1组，最大径向距离误差从51.495mm降到1.157mm；同一64个连续T1种子跳数全部一致，最大径向距离误差约0.00187mm。
- 接触驱动低矮水舌、短暂透明液片、破碎边缘细滴与椭圆扩散波纹；浅擦和陡入形态不同，效果不会给石子补能。
- 湖面按住蓄力、拖动瞄准、释放出手；鼠标与触屏共用状态机，操作与飞行模拟隔离。
- Blender原创GLB保持真实米制尺寸；暂停、慢放、单步、种子快照与完整重放继续保留。

最新总览见 [三步执行记录](docs/THREE_STEP_OPTIMIZATION.md) 与 [PROGRESS](docs/PROGRESS.md)。

## 直接试玩

**在湖面按住约0.7秒，轻拖后松手。**

- 横拖：改变方向。
- 上拖/下拖：抬高/压低出手仰角。
- 按住时长：蓄力，约1.4秒满力；力度条实时显示，不自动松手。
- 石面倾角：使用常驻的快捷滑块；自旋等参数可在开发详情中调整。
- Esc、取消触摸或第二触点：取消蓄力，不出手。

保留「投出石子」按钮、空格暂停、R重投、单步与近景跟随；常驻菜单切换1x/0.25x/0.05x环绕。开发详情可调整全部目标参数、温度、辅助轨迹、诊断及JSON快照。温度0为无扰动对照，1为默认微扰，不是摄氏度。

每次新投掷获取新seed；重放保留原target/sample/seed/温度，不受后来手势或滑块影响。滑块和拖动预览不修改正在飞行的石子。最终沉水不计成功弹跳。

## 本地运行

需要 Node.js 20.19+ 或 22.12+（本机验证 Node 24）。

```sh
npm ci
npm run dev -- --port 5173
npm test
npm run typecheck
npm run build
npm run sweep
```

开发地址 http://localhost:5173/ 。`npm run build` 生成可独立静态部署的 `dist/`；运行所需GLB与元数据包含于 `public/assets/`，不依赖工作区外绝对路径。`package-lock.json` 固定依赖。

## 验证

本轮最终统一复跑 **43/43自动测试（原36项+镜头/回放7项）**、类型检查与生产构建，全部通过；包括24组难例和64个连续随机种子的DT/半步对照，以及几何、能量、重放、效果和手势。全套约37.3秒。构建保留约605kB主包提示。

本轮侧栏浏览器实际检查五项参数/重置、固定/跟随、慢放/环绕/暂停/退出恢复与快照，读取桌面/390×844截图后恢复桌面。暂停稳定帧相隔1秒截图像素一致；鼠标拖投与Esc取消验证通过。当前侧栏touch驱动会映射为mouse，不能当作真实触屏结果；本轮触摸取消只做合成PointerEvent处理器验证，详见CAMERA_REPLAY。此前手势专项历史见手势文档。

回归测试现在只计算与断言，不覆盖已保存的校准JSON报告；已用前后SHA256验证。显式运行 `tools/contact-calibration.ts` 并提供输出路径时才写新报告。

## 下一步质量重点

剩余14m/s、10°极端末段仍有DT/半步14/20跳分歧，虽然两条最终落点很接近；仍需改进末段事件/压力积分，不能把它说成完全收敛。RK4与事件解析增加了CPU成本，后续以实际帧耗时决定优化。

液片是单向、参数化视觉模型，非真实体积流体或拓扑撕裂；物理水位仍为静水面。没有实物标定或实体手机性能测试。本轮不投入景观、声音、商店、多端壳。

## 代码与工具

- `src/main.ts`仅启动；会话位于`src/app/session.ts`，镜头位于`src/camera/rig.ts`。
- 测试位于`tests/`，基线位于`tests/fixtures/`，不再在src中混放。
- `npm run sweep:variation -- 64`运行随机种子统计；`npm run calibrate -- /tmp/contact-report.json 64`显式生成新校准报告。
- `tools/prepare-assets.mjs`在dev/build前恢复GLB；工具不依赖研究docs。

## 文档入口

- [镜头与回放](docs/CAMERA_REPLAY.md)
- [目录结构及迁移删除清单](docs/ARCHITECTURE.md)

- [三步优化执行记录](docs/THREE_STEP_OPTIMIZATION.md)
- [接触校准与逐例数据索引](docs/CONTACT_CALIBRATION.md)
- [已实现的物理模型](docs/PHYSICS_MODEL.md)
- [水舌、液片与波纹](docs/WATER_EFFECTS.md)
- [手势操作与验证](docs/GESTURE_CONTROLS.md)
- [温度扰动与快照](docs/THROW_VARIATION.md)
- [游戏目标](docs/GOALS.md)、[调研资料](docs/RESEARCH.md)、[物理原始依据](docs/PHYSICS_REFERENCE.md)
- [初始实施规划](docs/IMPLEMENTATION_PLAN.md)：保留历史，实际状态以PROGRESS为准。

## 开发原则

先打磨单次投掷，再扩充内容；不先造通用引擎，不用固定跳数冒充模拟。石头面板对应物理参数，同一次接触驱动水波与飞溅。网页优先，其他平台按实际需要推进。

Blender源资产放在 `../blender-output/stone-skipping/`，网页使用副本位于 `public/assets/`。后续景观、音效可由用户另行制作或提供，不阻塞核心模拟。
