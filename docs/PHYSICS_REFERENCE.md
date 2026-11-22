# 首版接触物理依据

2026-11-14，开始实现时补充。此文为研究输入，实际采用的公式、系数与测试结果由 `PHYSICS_MODEL.md` 另行记录。

## 优先原始来源

- L. Bocquet, *The physics of stone skipping*, 2002 预印本 / American Journal of Physics 71, 150–155 (2003)：https://arxiv.org/html/physics/0210015 。研究代理已读取正文。
- Clanet、Hersen、Bocquet, *Secrets of successful stone-skipping*, Nature 427, 29 (2004)：https://doi.org/10.1038/427029a 。本轮没有取得可读正文，不用常见“20°最优”报道代替完整方程与适用范围。

## Bocquet 简化模型与工程落地

坐标取向上为正。前端抬起的薄盘，盘面向前切向 t、向上法向 n。原文简化受力可写为：

`F_water = 0.5 * rho * |v_relative|² * A_wet * (C_l * n - C_f * t)`

`m * dv/dt = F_water + m * gravity`

这里支撑方向以盘面法向定义；不能误写成世界竖直恒力。C_l、C_f 是经验参数，原文约为1的数量级估计不是通用标定。模型适用于薄扁石、浅入射、部分浸水、高雷诺数的简化研究。

- 浸水面积由有限盘面与水面相交求得，不能把质心低于水面直接判为整个石头浸没。
- 固定倾角的圆盘可用圆弓面积；近水平和动态姿态建议离散盘面裁剪水下部分，求面积及质心。后者是工程几何近似。
- 接触从初次浸水持续到完全出水；竖直速度转正不等于接触结束。
- 完全浸没后进入独立的下沉/水下状态，不继续沿用自由表面支撑制造水下跳跃。
- 水动力矩可近似为 `(wet_centroid - COM) cross F_water`，这是简化作用点假设，不是已校准压力分布。
- 四元数姿态与世界角动量积分，`omega = inverse(I_world) * L`；自旋沿石面法向初始化。自旋衰减属于另行标定的经验项。
- 固定时间步，接触期局部子步；用步长减半实验检查结果是否收敛。初始建议0.25–1 ms仅为实现试验范围。
- 同一接触输出驱动水波与飞溅。先实现单向视觉反馈，不让装饰粒子凭空给石头补能。

## 专项源码核对

- https://github.com/nkabbra/Skipping-Stones-Simulation-GUI ：研究代理读取到法向压力模型含 `sin(theta + beta)`，没有独立切向摩擦项；部分完全浸没逻辑不适合作本项目模型。未确认可复用许可证，不复制源码。
- https://github.com/efondere/Stone-Skipping-Simulation ：MIT；实际是瞬时速度投影与出水高度能量扣减，不是有限接触力与自旋模型。不作为核心算法直接移植。

## 原创石头资产

`../../blender-output/stone-skipping/stone.blend`、`stone.glb`、`stone.asset.json` 已在 Blender 创建并导出。

- 名义尺寸：0.08 × 0.06 × 0.009 米；glTF 为 Y-up，扁石法向 Y、长轴 X，原点居中。
- 名义密度2650 kg/m³，椭球近似质量约0.05994 kg；不是不规则渲染网格的精确体积测量。
- 源资产保持在根项目输出目录，网页构建应将 GLB 复制到自身静态资源目录，不依赖外部绝对路径。

## 用户最新优先级

按2026-11-14 05:50:27 America/Los_Angeles 指示，本轮专注真实运动、入水弹跳、水花和波纹。景观、音效、商店和多端包装延后；音效与未来 Windows UE 景观可由用户后续提供。不为这些后续内容拖延首个可运行原型。
