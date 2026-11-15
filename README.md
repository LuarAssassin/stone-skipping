# 掠水 · Stone Skipping

TypeScript / Three.js / Vite网页打水漂实验。石子姿态、自旋、有限水面接触与自然续跳由模拟计算，不预设成绩。

- 有种子的出手扰动、完整JSON快照与确定性重放。
- 接触驱动水舌、薄片、细滴与波纹，真实米制石子。
- 鼠标/触屏按住蓄力、拖动瞄准、松手投掷；Esc取消。
- 默认岸后抬高固定全景，可调高度、距离、方位、注视点与FOV，支持重置及近景跟随。
- 正常1x、慢放0.25x、贴水环绕子弹时间0.05x；暂停冻结轨道，退出恢复所选视角。新投恢复1x，重放不重新抽seed。

## 运行

需要Node.js 20.19+或22.12+。

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
```

在湖面按住约0.7秒，横拖调整方向、上下拖调整仰角，松手投掷；快捷滑块调整石面倾角。视角与速度菜单常驻；开发详情保留全部出手参数、温度（默认T1）、辅助轨迹、单步、诊断和JSON重放。空格暂停，R新投。

predev/prebuild通过tools/prepare-assets.mjs从public/assets/stone.glb.base64恢复Blender原创GLB。构建后的dist/可独立静态部署，不需要外部工作区资产。

## 结构与验证

src/main.ts只负责启动；simulation、rendering、camera、input、ui与app/session分工。测试位于tests/，必要基线位于tests/fixtures/；tools/包含资产准备、参数扫描与显式校准工具。

```sh
npm run sweep
npm run sweep:variation -- 64
npm run calibrate -- /tmp/contact-report.json 64
```

43项测试覆盖物理/24组难例与64种子校准/手势/效果/镜头/三倍率快照重放；测试不覆写基准。类型检查与生产构建通过，Three.js主包仍有约605kB的体积提示。

这是持续开发的工程近似，尚有极端末段接触收敛问题；水体为单向视觉反馈，不是完整流体求解。没有实体手机性能或实物标定结论。本轮不含准备阶段放大、顺逆自旋、游标力度及水滴次级波纹。研究笔记、完整实验日志、node_modules及dist不包含在公开源码中。

仓库公开可见；当前未授予额外开源许可证。
