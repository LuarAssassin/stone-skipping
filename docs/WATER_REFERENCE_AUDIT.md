# 水体原始源码审计（共享交接）

状态：原始源码核对完成（2026-11-15）；预计阅读 7–9 分钟。已先落确认笔记，再补以下联网证据。仅本文件由研究代理写入，不操作预览。实现代理并行修改中，以下“当前”指本次读取快照，不代表后续实现状态。

## 已确认：此前研究并不等于已采用

- `docs/WATER_REWORK.md` 已记录：本机 WebGL2 与 float color targets 可用；这是已有实测记录，本审计没有重新测试。不强制迁移 WebGPU。
- 读取到的 `src/rendering/water.ts`：`waterHeight()` 是时间驱动解析波包，只改片元法线；`PlaneGeometry(150,50)` 未位移，无高度/速度纹理双缓冲。反射是 reflected.y 插值天空色，不渲染真实场景，无场景折射。
- `effects.ts::sheetPoint` 用统一角度、长度、正弦拱高生成扇片；`sheets.ts` 用网格和片元遮罩显示。重复轮廓、固定直边、相似出生时序不是网格精度问题。增加顶点或噪声只能修饰轮廓，不能产生液片输运、拉伸、破裂与回落耦合。
- 因此不能声称已经采用鸭子示例的状态传播、Evan 的水下光学，或 Splash 的 MLS-MPM；已有调研索引只是参考来源。

## 实施约束（研究建议，不是已实现）

优先 WebGL2 全屏 fragment pass + 两个浮点 render targets：状态存高度 h 和速度 v（或 h 与上一时刻高度），每步读 A 写 B 后交换，禁止同纹理读写。高度场只能表示单值水面，不能替代三维翻卷液片。下文将原码事实与移植建议分开。

## 1. 原始源码事实与入口

### A. Three.js 鸭子 Compute Water

- [官方 dev 原码](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_compute_water.html)；[raw](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgpu_compute_water.html)。本次确实读取内嵌 TSL，不只是演示说明；dev 是可变分支，复用时应另锁 commit。
- `WIDTH=128, BOUNDS=6, NUM_DUCKS=100`；`createComputeHeight()` 读 HeightA 写 HeightB，下一步反向，另有 PrevHeight 存上一时刻。用四邻点夹取索引模拟 ClampToEdge，无周期绕回。
- 原式（S 为四邻高度之和）：`hNext = viscosity*(0.5*S - hPrev) + source`，随后 `hPrev=h`。默认 viscosity=.96，是每次迭代的高度衰减，不是 SI 黏度。
- `source=(cos(clamp(pi*r/mouseSize,0,pi))+1)*mouseDeep*length(mouseSpeed)`；原式加号，不能因注释写 indent 就误报为负压水。移植时需明确项目 y 轴正负及入水/排水的符号。
- `positionNode` 真正将高度写入顶点局部 z，再将平面绕 x 转 -pi/2；`normalNode` 取左右/上下差，乘 WIDTH/BOUNDS，转换到视空间。它的差分幅度不是下面建议的严格中心差分，不应不加说明当物理斜率。
- `computeDucks()` 只读取水高/坡度：y 向目标高度松弛（.98），水平速度阻尼 .92 加坡度推力 .015，碰池壁反弹 -.4；没有在该函数向高度场写鸭子排水。是简化随波运动，不是三维流固双向耦合。
- 真实视觉来源还包括 HDR `scene.environment/background`，MeshStandardNodeMaterial（金属度 .9、粗糙度 0、opacity .8），不是鸭子求解器自动产生反射折射。高金属度是示例风格参数，不是清水物性。
- 动画以 `frame >= 7-speed` 决定迭代，默认 speed=5，即隔两渲染帧更新；无物理 dt。源码明确 TODO WebGL backend 且检测 WebGPU。**迁移数学和数据流到 WebGL2，不是把当前 TSL 示例直接导入 r180 WebGLRenderer。**

### B. Evan Wallace WebGL Water

- [water.js](https://github.com/evanw/webgl-water/blob/master/water.js)：`Water`, `dropShader`, `updateShader`, `normalShader`, `sphereShader`；[renderer.js](https://github.com/evanw/webgl-water/blob/master/renderer.js)：水面位移、光线求交、反射折射与焦散；[main.js](https://github.com/evanw/webgl-water/blob/master/main.js)：调度；[作者原页](https://madebyevan.com/webgl-water/)。均已联网读对应原码；不是移植版二手结论。
- 两张 256² 浮点纹理，RGBA 存 `(height, velocity, normal.x, normal.z)`；float render target 不可画时尝试 half float；每个 pass `textureB.drawTo` 后 `swapWith(textureA)`。
- `average=S/4; vNext=.995*(v+2*(average-h)); hNext=h+vNext`。速度以“每迭代高度增量”为单位，没有 dt；`.995` 衰减的是速度，与鸭子乘整个新高度不同。`main.js` 每次 update 连做两次 stepSimulation，再更新法线，不能照搬为帧率无关物理。
- `addDrop`：UV 距离核 `q=max(0,1-r/radius)`，`h += strength*(.5-.5*cos(pi*q))`。center 从 [-1,1] 映射 UV，而 radius 已是 UV 尺度；移植必须统一世界米制，不能混用这两个半径。
- `moveSphere`：`h += volume(oldCenter)-volume(newCenter)`；体积用平滑指数轮廓近似，不是真球排水精确积分。关键可借鉴的是旧足迹恢复、新足迹压低，沿运动轨迹形成扰动，而不是每帧在出生点加同一圆圈。
- `normalShader` 以前向差分构造切线并 cross，存 nx/nz；renderer 重建 ny。原码坐标有归一化约定，不照搬 delta 当世界长度。水面网格 detail=200，顶点采样 h 真位移。
- `renderer.js` 对反射/折射方向解析求交球、池壁，并采 cubemap 天空；不是对任意 Three 场景的通用光追。IOR 为 1 与 1.333；上水面 Fresnel 是 `mix(.25,1,(1-cosTheta)^3)` 的艺术近似，不是物理 F0。水下处理法线反转及全反射（零 refract 向量）。焦散将折射光投到底面，比较投影前后面积，不是水滴白点。

## 2. 可直接交实施代理的 WebGL2 更新合同

以下是基于原理的**项目移植建议**，不是上述原码逐字复刻，也不是已实现结论。

**状态与网格**：先局部固定世界域，不把 150m×50m 全湖塞进低分辨率纹理。若要分辨 8cm 石头，源半径至少跨 2–3 个格点（具体格距按可视范围预算）；大域 128² 的宽格无法表达接触细节。若采用移动域，必须重投影/平移状态、清空新区域，不能只改原点令旧波跟着石头走。

定义 `dx=Lx/(Nx-1), dz=Lz/(Nz-1)`（顶点网格约定；采样 UV 中心映射需与之统一），h 单位 m，v 单位 m/s，c 单位 m/s：

```text
lap = (hE-2*h+hW)/dx² + (hN-2*h+hS)/dz²
vNext = exp(-gamma(x,z)*dt) * (v + dt*(c²*lap + accelerationSource))
hNext = h + dt*vNext
```

- RG 存 h/v，两个无 depth/stencil、无 mipmap 的 float/half-float targets；计算用 nearest 或 texelFetch 精确邻点；不要把颜色转换、tone mapping、alpha blending 带入数值 pass。几何/法线可手动双线性插值，float 可渲染并不保证所有格式均支持硬件线性过滤。实际检查选定格式 framebuffer complete。
- CFL：二维显式波动需 `c*dt*sqrt(1/dx²+1/dz²) <= 1`，实际取 <=.8 留余量；等距时 `c*dt/dx <=1/sqrt(2)`。不要以“有阻尼”替代稳定条件。鸭子无阻尼原式对应等距系数 λ²=.5，已在边界量级；不是任何格距/帧率都安全的常数。
- 固定 dt（候选 1/120s，须满足 CFL），accumulator 按模拟时间推进；慢放/暂停改变累计时间，不改变 dt 或每帧注入次数。限制追赶子步，超出预算显式记录舍弃时间；重放清场、重置队列与 accumulator。gamma 单位 s^-1，可由半衰期 `gamma=ln(2)/T_half` 设置；不要固定每渲染帧乘 .96。
- 边界：ClampToEdge 近似零法向梯度，会反射，不是开阔湖。真实岸可用无通量反射；离屏域边缘设平滑增大的 gamma 海绵带（建议初始宽度 10–20 格，须验证残余反射），再 clamp；h=0 固定边也会反射。纹理不得 Repeat。
- 法线严格用世界差分 `n=normalize(-(hE-hW)/(2dx),1,-(hN-hS)/(2dz))`。渲染顶点位移与法线来自同一时刻状态；局部平面绕转时确认局部 z→世界 y、UV z 符号。材质需要视空间 normal 时再变换，不混合世界/视空间法线。细噪声只补不可解析毛细纹理，不能代替接触波。

**源与事件**：

- 一次冲量用 `v += deltaV*K(r)`，或瞬时高度 `h += deltaH*K(r)`，与连续加速度源区分；前者不再乘 dt，后者每固定步乘 dt。核可选上面的余弦紧支撑，或椭圆 Gaussian。用世界速度定义纵向/横向足迹，接触轨迹段按格距细分，按冲量**增量**分配，不反复消费累计 impulse。
- 入水压低+周缘隆起可用负中心/正外环并使离散 `sum(deltaH*dx*dz)` 约为零，避免大量接触后平均水位持续上涨；这是稳定视觉近似，不宣称严格动量/能量守恒。用交换冲量、湿面积校准幅度，设幅度/坡度安全限值。
- 落滴用下降时 `yDrop-h(x,z)` 的正→非正交叉，插值命中位置/时刻，粒子 ID 只触发一次次级波源，按下落法向速度衰减，不能仅在 y<0 隐藏。
- 不为波面读取每帧同步 GPU 全纹理。石头物理若未采样 GPU h/n，应明确反馈仍为单向；CPU 共享基线或小范围异步查询另做，不假称已双向耦合。

## 3. 反射、折射与水颜色：比加噪声更关键

- [r180 Water.js](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/objects/Water.js) 已核对：镜面相机、textureMatrix、斜裁剪投影、隐藏自身后离屏渲染真实 scene，法线扰动投影采样；但水面自身没有上述高度场求解，且其 rf0=.3、waterColor 散射是艺术混合，不是清水物性。它没有通用场景折射 pass。
- [r180 Reflector.js](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/objects/Reflector.js) 已核对：半浮点目标、镜像相机、oblique clip plane、恢复 render target/XR/shadow 状态和 viewport。可复用相机/裁剪思路；其 overlay fragment shader 不是最终水材质。防止水面或其它反射物递归渲染，离屏 pass 后恢复完整 renderer 状态并 dispose。
- 项目起步：水平平均面 planar reflection，画入天空、岸边和石头（有这些场景物体才有对应倒影）；法线使 reflection UV 局部扭曲。只有天空渐变时，反射里依旧没有物体，金属度不能补出缺失信息。planar 对大坡度/翻卷非精确，非全场景光追。
- 折射用隐藏水面后的场景颜色+深度（或独立水下裁剪 pass），依据法线/折射方向扰动采样；深度重建须同投影空间，屏幕边界及前景穿帮需深度测试、限制偏移、回退。平面法实现不了任意遮挡折射，不借用 Evan 的球/箱特例宣称通用光追。
- 更物理的空气→水混合：`F0=((1-1.333)/(1+1.333))²≈.0204; F=F0+(1-F0)*(1-dot(n,V))^5`；`C=F*Creflection+(1-F)*Ctransmission`。清水基础 metalness=0；粗糙度控制模糊与高光，别靠金属色掩盖缺少环境。
- 透射色按 Beer–Lambert：`T=exp(-sigmaRGB*pathLength); Ctrans=T*Cbottom+(1-T)*Cscatter`。路径长度来自深度/重建位置，不用屏幕深度值直接当米；浅处露底、深处吸收、掠视反射更强。水不是全表面统一青色塑料，也不是全白不透明泡沫。缺水底几何/水下颜色时先明确采用近似，不能声称已有真实折射。线性空间合成，最后统一 tone mapping/colorspace。
- 焦散留后：浅水可见底时有价值，不能修复重复扇形喷溅，也不是本轮大湖真实性的前置条件。

## 4. 为什么重复扇片假；最小实质替代

读取快照：`columns=24,rows=8`，扇片不是只有一个三角形；真正问题是 `sheetPoint()` 所有点受同一角度/径向扩张和正弦拱控制，根部固定，`max(0,arch-...)` 夹水面；`batch%4===1` 持续生成相似曲面。片元破洞只依赖 u 与 age，在多个 v 上重复条带；透明双面片重叠仍暴露直边和相似剪影。加密只把假轮廓变平滑。

比“加顶点/噪声”更实质、仍可留在 WebGL2 的混合路线：

1. **水下/水面**采用上文有状态高度场、轨迹源、真实反射/深度色，建立压水—传播—回落的因果联系。
2. **离水近场**每段接触维护一条连续发射边/水舌，而非批次复制扇片；从接触位置和速度随时间发射拉格朗日条带节点，带重力/阻力、初始方向/厚度差，产生非均匀拉伸和弯曲。固定段索引连接，寿命/拉伸阈值断开并转为液丝/碎滴；回落再注入水面。参数化混合仍是近似，不冒称体积液体或自然求解表面张力。
3. **若近景仍不够**再独立评估局部三维粒子求解+屏幕空间厚度/法线重建。SPH 用粒子邻域密度/压力；MLS-MPM 用粒子↔网格传递动量/应力；两者能表示离面体积，不是二维高度场的“高级滤镜”，也不保证薄片破裂无需分辨率。弹道粒子+网格液片不等于 SPH/MPM。此轮没有实施它们，不强制 WebGPU。

## 5. 许可证与验证交接

- [Three r180 LICENSE](https://github.com/mrdoob/three.js/blob/r180/LICENSE)：MIT，`Copyright © 2010-2025 three.js authors`，复制/实质复用须随副本保留版权与完整许可（含免责声明）。dev 示例按复用版本核对同仓 LICENSE；建议 third-party notices 记来源文件与 commit。无需宣称 MIT 强制 UI 署名，但来源记录应可追踪。
- Evan 的 water.js/renderer.js/main.js/index.html 文件头均明确 `Copyright 2011 Evan Wallace / Released under the MIT license`；根目录 `LICENSE` raw 返回 404，不能伪造存在的许可证文件。实质复用保留这些头、补随发行物的完整 MIT 文本并记原作者/源 URL；若改变代码记明改作。**MIT 不是 CC0，也不是“无需署名”。**
- 资产许可分开核对：Evan index.html 明示 tiles.jpg 来自 Flickr zooboing（链接在原页），本次未核实该照片许可；鸭子 GLB/HDR 也不因示例代码 MIT 就自动 CC0。不复制这些资产，除非另核实来源、授权与归属要求。
- 实施验收建议（本审计未运行）：同 seed/同接触时间对照；一滴扰动向外传播、叠加/衰减且均值不漂移；30/60/120 渲染帧率下固定模拟时刻结果一致；CFL 安全上限与边界回波；暂停/重放无重复源、落滴仅一次；岸/石头倒影随物体运动；近景不再出现周期性扇片。编译与单测不能替代视觉验收。
- 本次只写此文档，未运行预览、测试、GPU benchmark；不将并行实施中的文件变化算作研究成果。性能/视觉效果必须由实施代理实测再补结论。

