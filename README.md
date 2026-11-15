# 掠水 · Stone Skipping

网页打水漂物理实验：TypeScript、Three.js、Vite。

- 石子姿态、自旋、有限水面接触与自然续跳。
- 有种子的出手扰动、完整快照与重放。
- 接触驱动的水舌、薄片、细滴与波纹。
- 鼠标/触屏拖动、蓄力、释放投掷，支持暂停、慢放和诊断。

## 运行

Node.js 20.19+ 或 22.12+。

```sh
npm ci
npm run dev
```

在湖面按住约0.7秒，横拖调整方向、上下拖调整仰角，松手投掷；Esc取消。开发面板保留参数、温度和JSON重放。

```sh
npm test
npm run typecheck
npm run build
```

`predev`、`prebuild`会自动从`public/assets/stone.glb.base64`恢复Blender原创GLB；构建后可部署`dist/`。`test-fixtures/`只包含回归测试需要的基线摘要。

这是持续开发的工程近似模型，当前尚有极端末段接触收敛问题；水体为接触驱动的单向视觉反馈，不是完整流体求解。研究笔记、完整实验日志、依赖目录与构建产物不包含在本仓库。

仓库公开可见；当前未授予额外开源许可证。
