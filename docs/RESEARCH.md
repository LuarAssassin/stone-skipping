# 底层技术与调研索引

整理于 2026-11-14，依据本线程 2026-11-11 至 2026-11-14 的网页研究与工具实测。本文不是一次新的联网复查；链接、版本和依赖在实际选用时确认。

证据标签：**已读原始说明**＝读过作者 README、官方文档或项目页；**代理调研**＝专门研究返回并引用原始页面，主会话未另行打开该原页；**本机实测**＝确实在本机执行并观察；**实现建议**＝尚未落地的设计选择。

## 1. 建议的技术分工

| 层 | 起步选择 | 用途与选择状态 |
|---|---|---|
| 工程与语言 | TypeScript + Vite | 推荐；快速迭代网页原型，尚未安装 |
| 场景与渲染 | Three.js | 推荐；相机、材质、GLB、光照和水面展示 |
| GPU 计算 | WebGPU / WGSL，或 Three.js TSL | 推荐探索；局部波纹、飞溅等适合并行的计算，具体后端在第一阶段选择 |
| 石子运动 | 独立 TypeScript 物理模块 | 推荐；固定时间步、自旋姿态、入水受力，不依赖渲染帧率 |
| 刚体设施 | Rapier | 候选；需要岸边碰撞或更多物体时引入，不要求它负责流体求解 |
| 水体 | 基础波面 + 局部高度场 + 局部飞溅粒子 | 推荐起点；把算力集中在触水附近 |
| 声音 | Web Audio API | 推荐；接触强弱、速度和距离驱动声音 |
| 资产 | Blender → GLB + 贴图 | 推荐；模型、动画、烘焙纹理，不直接迁移整个 Blender 材质节点图 |
| 桌面与移动 | 网页/触屏先行；PWA、Tauri、Capacitor 后评估 | 候选；不预建多端工程 |

Three.js 是图形库，WebGPU 是 GPU 图形/计算接口，它们不互相替代。水面求解、刚体运动和流体渲染也是独立职责。

## 2. 水体技术：按需要的现象选算法

### 2.1 基础水面与高度场

用波函数或二维网格表示水面高度，求出局部法线；用波动更新传播接触扰动。适合湖面、涟漪、反射折射与浮动。

**已读原始说明：Three.js Compute Water**

- 在线示例与内嵌源码：https://threejs.org/examples/webgpu_compute_water.html
- 本次读取的源码为 128×128 模拟网格、100 只小鸭；使用 Three.js、TSL、WebGPU，双缓冲更新水面高度。
- 小鸭根据高度和坡度更新位置，是简化漂浮，不是完整三维流体与刚体双向耦合。
- 这些是读源码得到的配置，不是本机帧率测试；示例可能随上游更新。
- 对我们的价值：局部扰动、法线计算、GPU 存储缓冲和波面反馈的直接参考。

**已读原始说明：Evan Wallace / WebGL Water**

- 演示与说明：https://madebyevan.com/webgl-water/
- 页面列出高度场、反射折射、软阴影、焦散和可拖动球体。
- 对我们的价值：水面的视觉质量不只取决于求解规模，光照、折射、焦散与接触反馈同样关键。

**代理调研：jeantimex 的改作**

- Three.js：https://github.com/jeantimex/threejs-water
- 演示：https://jeantimex.github.io/threejs-water/
- WebGPU：https://github.com/jeantimex/webgpu-water
- 演示：https://jeantimex.github.io/webgpu-water/
- 研究返回的实现包括高度场、简化浮力、模型排水近似；适合后续读代码，不将其参数直接作为我们的物理结论。

### 2.2 体积流体：SPH、PIC/FLIP、MLS-MPM

| 方法 | 核心表示 | 对本项目的价值 |
|---|---|---|
| SPH | 粒子通过邻域相互作用求密度、压力等 | 学习局部液体；邻域搜索是重要成本 |
| PIC/FLIP | 粒子与网格交换速度信息 | 参考体积流动与飞溅，不是首版前置依赖 |
| MLS-MPM | 粒子—网格混合，P2G/G2P 传递物理量 | 参考高性能局部水团、飞溅与后续更真实接触实验 |

不要把这些案例概括为“必须安装一个很重的物理引擎”。多数作者自行实现 GPU 求解器，再单独完成流体渲染。

### 2.3 matsuoka-601：WebGPU-Ocean → WaterBall → Splash

以下三个项目的 README、作者作品集和相关技术文章已在主会话读取。推文内容通过作者作品集中的原帖引用交叉确认，没有假定用户之前看到的就是其中一条。

**WebGPU-Ocean**

- 源码：https://github.com/matsuoka-601/WebGPU-Ocean
- 演示：https://webgpu-ocean.netlify.app/
- 原帖：https://x.com/matsuoka_601/status/1877570211013902497
- 技术文章：https://zenn.dev/sparkle/articles/3eb1225f891a87
- 支持 SPH 与 MLS-MPM，渲染用屏幕空间流体方法；源码依赖说明没有 Three.js 或 Rapier。
- 作者解释 SPH 邻域搜索的成本，以及 MLS-MPM 用粒子与网格传递数据避免直接粒子邻域搜索。
- P2G 采用定点整数表示配合 `atomicAdd`；这是该实现当时针对 WebGPU 原子操作限制的处理，不当作未来所有版本的通用限制。
- 作者文章展示 Ryzen 7 5825U 核显的 10 万粒子，以及 RTX 3060 Laptop 的 50 万粒子。README 的概括为核显约 10 万、较强 GPU 约 30 万；保留各自出处，不拼接成统一基准。
- 对我们的价值：粒子—网格求解、GPU 数据流与局部流体实验。没有本机性能实测。

**WaterBall**

- 源码：https://github.com/matsuoka-601/WaterBall
- 演示：https://waterball.netlify.app/
- 原帖：https://x.com/matsuoka_601/status/1886294037499695274
- 沿用 MLS-MPM 与屏幕空间流体渲染，展示球体上的流体交互。
- 对我们的价值：把流体限制在一个小范围内，同样可以形成明确、有趣的交互。

**Splash**

- 源码：https://github.com/matsuoka-601/Splash
- 演示：https://splash-fluid.netlify.app/
- 原帖：https://x.com/matsuoka_601/status/1902990065737011336
- 作者作品集：https://matsuoka-601.github.io/
- MLS-MPM + 屏幕空间流体渲染；用 Narrow-Range Filter 改善水面平滑与反射折射伪影。
- 粒子模式的阴影采用密度场 ray marching。
- 作者通过压力模型参数调整，把每帧模拟子步从两次减少到一次；这涉及稳定性与可压缩性的取舍，不照抄为我们的数值步长。
- `million` 分支最高档设为 160 万粒子，这是配置规模，不是本机实时性能结果。
- 对我们的价值：局部飞溅、连续水面视觉、滤波与模拟成本之间的权衡。

### 2.4 其他流体参考

**代理调研：David Li / Fluid Particles**

- 演示：https://david.li/fluid/
- 源码：https://github.com/dli/fluid
- WebGL GPU PIC/FLIP；适合对比 WebGL 时代的粒子—网格与渲染方案。

## 3. 打水漂专项参考

### 3.1 玩法与体验：读过作者页

**Sam Coleman / Stone Skipping**

- 页面与网页入口：https://samcoleman.itch.io/stone-skipping
- 已发布，Unity，页面标有 HTML5 及桌面平台。
- 走近石头检查/选择，靠近水面锁定石头姿态，通过力度条投出，追求距离。
- 飞行中可额外施力两次，是该作品的游戏化设计，不列入我们的初始方向。
- 参考重点：挑石、投掷的完整循环，以及低多边形、轻松氛围。没有核实到公开源码。

**Jonas Mumm / Stone Skipping**

- 作者页：https://jonasmumm.itch.io/stone-skipping
- 已发布的 Windows 小游戏；目标是让石头在起伏水面上跳得更远，支持单键操作。
- 页面有 Android 商店链接，但本轮没有确认链接对应应用当前可用性。
- 参考重点：极简操作和短回合反馈。

**Dariy / Stone Skipping**

- 页面与网页入口：https://dariy-nazarov.itch.io/stone-skipping
- 已发布 HTML5，ASCII 画面，支持鼠标与触屏；围绕陨石湖、不同石头、目标、鱼与升级展开。
- 参考重点：投掷向成长和多种石头扩展的方法；美术与真实性目标不同。

### 3.2 玩法补充：代理调研

- **Skip / the_timme**：https://the-timme.itch.io/skip 。开发中但有公开 HTML5 版；晨雾、树叶声、水花声和一键操作。参考环境音与节奏。
- **Skipping Stones / S0meI3ody**：https://s0mei3ody.itch.io/skipping-stones 。已发布 HTML5，GameMaker；打水漂与看鸭子。参考环境生命感。
- **RippleLoop**：https://distortedgamedev.itch.io/rippleloop 。有网页版，完整版开发中；偏像素与增量成长。参考纪录与升级循环。
- **Ploufeurs: Stone Skipping Party**：https://store.steampowered.com/app/5544020/Ploufeurs_Stone_Skipping_Party/ 。研究时 Steam 标为 Coming soon；偏打水漂高尔夫和多人派对。参考投掷策略与景观路线，不作为我们的第一版规格。

### 3.3 公开物理/组件代码：已读 README，尚未逐行审查

| 项目 | 读取到的事实 | 下一步用途 |
|---|---|---|
| https://github.com/nkabbra/Skipping-Stones-Simulation-GUI | README 自述基于物理模型；GUI 可调初始位置、速度、角度、质量；入口 `hello.m` | 阅读具体方程、单位和模型来源，判断可借鉴部分 |
| https://github.com/efondere/Stone-Skipping-Simulation | Processing；McGill 2021 Physics Hackathon 项目 | 读取接触和弹跳代码，不仅看标题 |
| https://github.com/jokerIsPunk/skipping-stones | Unity / VRChat SDK3 的水漂石头组件 | 参考游戏运行中的投掷、接触和配置方式 |
| https://github.com/nirmie/rock-skipping-simulation | README 给出演示入口 https://sim.nirmie.co | 待读实现，暂不引用具体算法 |

公开可读不等于可以直接复制代码。实际复用前读取所选仓库的许可证与必要依赖；当前不下载、不复制第三方实现。

## 4. 物理层的实现研究重点

以下为规划，不是已经从上述仓库验证的结论。

### 4.1 石子飞行与姿态

- 位置、线速度、四元数姿态、角速度/角动量、质量与惯性张量。
- 重力为基线，空气阻力和风速使用相对气流；自旋影响姿态而不是直接“加跳数”。
- 固定物理时间步；渲染插值与慢放不改变同一输入对应的运动规律。

### 4.2 水面接触

- 接触判断同时考虑石子的尺寸、姿态、局部水面高度与法线。
- 使用相对水体速度，而不只检查石子世界坐标的竖直速度。
- 候选模型：对浸水面积/几何估计流体作用力与力矩，在接触子步中积分；调试阶段可先建立校准的接触冲量模型作对照。
- 下一跳由接触后的速度与姿态产生，不用固定反弹系数或预设抛物线作为最终效果。
- 高速擦水需要扫掠接触/连续检测或局部子步，防止一步跨过整个接触过程。
- 明确离水和再次入水状态，避免同一接触多次计分、重复生成水花。

先补充打水漂的一手论文/实验资料、核对已有开源方程，再选择参数与校准目标。20° 等常见经验数字不能未经来源核对就作为所有石头通用常量。

### 4.3 水花与波纹

- 水面高度场负责涟漪；三维粒子负责飞溅；短暂泡沫/水痕增强触水可读性。
- 同一接触记录包含时间、位置、法线、相对速度、接触面积估计、交换冲量与能量，用于渲染和声音。
- 初始局部喷溅可用弹道粒子与阻力，后续根据近景需求引入更强粒子求解或屏幕空间表面渲染。
- 避免把同一接触的全部能量同时完整赋给石子反弹、水波和每一颗飞溅粒子；记录近似的预算与校准关系。
- 先建立一致、可信的耦合，再决定是否需要全三维局部流体求解。

### 4.4 CPU/GPU 边界

基础波面函数可以在 CPU 物理与 GPU 渲染中共享参数，避免为每个物理子步回读整张 GPU 水面。局部扰动是否反过来影响石子受力，在有对照实验后决定；若采用查询，应设计小范围异步采样，不依赖逐帧大缓冲同步回读。

## 5. 美术、声音与平台

### Blender 与资产

本机已实测 Alma → Blender MCP：创建蓝色 UV 球，保存 `../../blender-output/alma_sphere_test.blend`，并通过图像回看。它验证了建模通路，尚不是游戏资产管线的验证。

当时 Blender 为 5.3.0，插件从旧 5.2 目录临时加载；这是 2026-11-11 会话中的运行状态，不视为当前进程仍在线或重启自动加载已配置。需要实际建模时再按项目技能启动。

按根目录约定，后续 `.blend`、导出 GLB、渲染放在 `../../blender-output/stone-skipping/`。网页资产通过开发时同步/导入流程接入，实际发布所需文件必须包含在游戏构建产物中，不能依赖工作区外的运行路径。

### 声景与镜头

触水音量、音色与飞溅状态联动，依据距离和方位空间化。近岸风景与光照在核心接触可玩后完善；镜头需让远处跳跃仍然可读，先不预设唯一跟随方式。

### 平台候选

- PWA：网页安装与离线资源候选。
- Tauri：复用网页内容的桌面候选；套壳不自动解决 GPU 开销。
- Capacitor：后续 iOS 包装候选，移动渲染和手势先在网页阶段考虑。
- GPUI：Rust 原生 UI 工具，适合未来原生客户端/编辑器，不当作现成网页壳。
- Babylon.js、Godot、Bevy/wgpu：保留为其他路线，目前不同时维护多份实现。

## 6. 当前最有用的下一步研究

1. 找到并阅读打水漂接触受力、姿态与自旋的一手实验/论文；记录适用条件。
2. 检查选中的专项仓库方程、单位、时间步与许可证，建立一个可复现参考案例。
3. 在我们的目标机器与浏览器运行最小水面和石子实验，记录物理与渲染分项耗时。
4. 选定接触模型和局部水体实现后，再确定依赖版本、性能预算和视觉档位。

研究服务于下一段实现，不要求先读完所有链接才开工。没有实测的性能数字不转写为项目承诺。
