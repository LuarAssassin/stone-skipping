# Blender Cycles 写实河滩沙砾垫层（2K 无缝 PBR + 立体碎石组件）生产规范

> **适用对象**：Codex / Blender Cycles 资产生产代理  
> **配套前端**：[src/rendering/sunset-env.ts](../src/rendering/sunset-env.ts)（前端已内置热加载钩子，只要按本规范把文件写入 `public/assets/shore/`，刷新页面即自动启用，**无需改动 `src/` 或 `tests/`**）  
> **核心目标**：用 Blender Python (`bpy`) + Cycles 真实三维物理建模并烘焙两样资产，把河滩底床做成 3A 写实级质感：
> 1. **一套 `2048 × 2048` 四方连续（严格无缝平铺）的河滩粗沙 + 密实细砾石 PBR 贴图四件套**（Albedo + Normal + Roughness + 光追 AO）；
> 2. **6 块极轻量化（`120 ~ 220 tris`）、带烘焙 PBR 贴图的单位半径背景河滩碎石 `.glb`**，供前端 `THREE.InstancedMesh` 密铺 2,800 颗 3D 立体垫层碎石。

---

## 一、输出目录与文件清单（必须严格遵守）

```text
public/assets/shore/
  manifest.json                  # 垫层元数据协议（见第四节 Schema）
  shore_albedo.webp              # 2048×2048 sRGB 无缝河沙+细砾漫反射贴图
  shore_normal.png               # 2048×2048 Tangent-Space OpenGL 法线贴图（PNG 无损防压缩噪点）
  shore_roughness.webp           # 2048×2048 粗糙度贴图（线性灰度）
  shore_ao.webp                  # 2048×2048 Cycles 光追环境光遮蔽贴图（缝隙暗化核心！）
  pebble_01.glb .. pebble_06.glb # 6 块低面带 PBR 贴图的单位尺度背景小卵石/碎石（供 InstancedMesh 使用）

tools/blender/
  generate_shore_bed.py          # 可复现的一键生成脚本

deliverables/shore-assets/
  shore-preview.png              # 2×2 无缝平铺验收渲染图（低角度暮色侧光，直观检查接缝、颗粒与 AO）
  pebbles-preview.png            # 6 块背景碎石的俯视+侧视验收图
  validation-report.json         # 自动校验报告（无缝边缘误差、分辨率、面数、文件大小）
```

> **禁止事项**：
> - 不要修改 `src/`、`tests/` 或 `public/assets/stones/`；
> - 不要提交 `.blend` 工程文件进仓库。

---

## 二、2K 四方连续河滩沙砾垫层（Blender Cycles 真实三维烘焙）

**关键理念**：绝不用简单的 2D 程序噪点糊弄！请在 Blender 里真正构建一块 **`1.2 m × 1.2 m`** 的物理河滩沙砾地床高模，并做**严格四方周期性边界（Toroidal Wrapping）**后用 Cycles 烘焙到 `1.2 m × 1.2 m` 的正交目标平面上：

### 1. 物理沙砾高模构建（`1.2 m × 1.2 m` 周期瓦片）
- **底层粗河沙与细砂基面**：细分网格带多频细腻波纹与毫米级沙粒微起伏（模拟水流冲刷出的细沙纹路）；
- **数千颗真实三维细砾石与小鹅卵石（Toroidal 周期铺撒）**：
  - 铺撒约 **`1,800 ~ 2,800` 颗** 多级配真实小碎石与水磨细卵石（直径 `4 mm ~ 28 mm`，幂律级配：大量 4–12 mm 细砾石填缝，适量 14–28 mm 扁圆小卵石半埋凸起）；
  - **严格无缝平铺**：任何跨越瓦片边界（`x < 0 / x > 1.2` 或 `y < 0 / y > 1.2`）的石头，必须同时在相邻 8 个周期偏移位置（`±1.2 m`）镜像复制一份，确保烘焙出的 4 张 2K 贴图在上下、左右拼接时 **100% 严丝合缝、零接缝痕迹**！
  - 石头之间允许自然半埋、微倾与轻叠，切忌整齐网格排布。

### 2. 同流域写实色彩与 PBR 材质标准
- **同流域低饱和度河滩色系**（与 96 块可拾主角石完美融为一体，切忌五颜六色！）：
  - 主色调：中性冷灰、深板岩灰、河泥褐灰、微暖风化砂灰、极少量暗石英乳灰点缀；
  - 亮部中性反照率控制在 sRGB 亮度 `0.38 ~ 0.72`（因为前端会叠加 `vertexColors` 做干岸到湿水线的压暗渐变，所以 `shore_albedo.webp` **不要做得过暗发黑**，保持中亮自然石沙基调即可，交给前端顶点色按海拔压暗出湿润水线！）；
- **四张贴图烘焙要求（Cycles，`2048 × 2048`）**：
  - `shore_albedo.webp`：Diffuse Color（sRGB，质量 88，目标 `350 ~ 750 KB`）；
  - `shore_normal.png`：Tangent-Space OpenGL Normal（+X 右 / +Y 上 / +Z 朝天，8-bit RGB PNG 无损，目标 `<= 2.5 MB`；也可做极轻微压缩优化）；
  - `shore_roughness.webp`：Roughness（粗河沙与石缝 `0.86 ~ 0.96`，水磨细卵石顶面 `0.62 ~ 0.78`，目标 `150 ~ 350 KB`）；
  - `shore_ao.webp`：Cycles Raytraced Ambient Occlusion（32~64 samples，distance `0.035 m`），让每一粒 5mm 小石子与沙地的接触缝隙都有真实的立体暗影（目标 `150 ~ 350 KB`）。

---

## 三、6 块极轻量化背景 3D 碎石 `.glb`（`pebble_01.glb` ~ `pebble_06.glb`）

前端用 `THREE.InstancedMesh` 在眼前铺了 **2,800 颗** 3D 立体小卵石，现在用的是简单二十面体，替换成 6 块真 Blender 烘焙低模后会直接质变：

1. **单位半径归一化（极重要！）**：
   - 前端 `InstancedMesh` 会直接用 `scale(sx, sy, sz)` 缩放到真实厘米级，因此每块 `pebble_0X.glb` 必须做**单位半径归一化**：
     - 质心归零 `(0, 0, 0)`，Scale `(1, 1, 1)`，Rotation `(0, 0, 0)`；
     - Y-Up 导出后包围盒半径约为 `1.0`（即 `bbox.x ≈ 2.0, bbox.y ≈ 2.0, bbox.z ≈ 2.0`，允许自然石形不规则起伏 `±15%`）。
2. **6 种互补自然形态**：
   - `pebble_01`：水磨圆卵石（微长）
   - `pebble_02`：微扁溪滩小卵石
   - `pebble_03`：略带钝棱角的风化小碎石
   - `pebble_04`：不规则豆形鹅卵石
   - `pebble_05`：微带层理缺口的小片石
   - `pebble_06`：浑圆微方河床小砾石
3. **极轻面数与贴图预算**：
   - 单块 **`120 ~ 220 tris`**（保证 2,800 颗实例化总面数轻松跑满 60 FPS！）；
   - 每块内嵌 `256 × 256` 烘焙 `BaseColor`（中亮低饱和自然灰石基色，方便前端按干湿水线做亮度调制）+ `Normal` + `Roughness`（WebP）；
   - 单文件体积 **`25 ~ 70 KB`**。

---

## 四、`public/assets/shore/manifest.json` 协议

```json
{
  "version": 1,
  "generatedAt": "2026-11-25T00:00:00Z",
  "tileSizeMeters": 1.2,
  "textures": {
    "albedo": "/assets/shore/shore_albedo.webp",
    "normal": "/assets/shore/shore_normal.png",
    "roughness": "/assets/shore/shore_roughness.webp",
    "ao": "/assets/shore/shore_ao.webp"
  },
  "pebbles": [
    { "id": "pebble_01", "glbPath": "/assets/shore/pebble_01.glb" },
    { "id": "pebble_02", "glbPath": "/assets/shore/pebble_02.glb" },
    { "id": "pebble_03", "glbPath": "/assets/shore/pebble_03.glb" },
    { "id": "pebble_04", "glbPath": "/assets/shore/pebble_04.glb" },
    { "id": "pebble_05", "glbPath": "/assets/shore/pebble_05.glb" },
    { "id": "pebble_06", "glbPath": "/assets/shore/pebble_06.glb" }
  ]
}
```

---

## 五、交付验收标准

1. `public/assets/shore/` 下全部 11 个文件齐全（`manifest.json` + 4 张 `2048×2048` PBR 贴图 + 6 个 `pebble_01..06.glb`）；
2. 自动校验 `shore_albedo.webp` / `shore_normal.png` / `shore_ao.webp` 的左-右、上-下像素边缘连续性（无缝平铺，边缘均方误差极低）；
3. `deliverables/shore-assets/shore-preview.png` 用 **2×2 平铺** 在低角度暖侧光下渲染，肉眼看不到接缝、看不到像素块，能清晰看到毫米级粗沙与密实微鹅卵石的立体光追 AO 缝隙；
4. `pebble_01..06.glb` 全部闭合流形、`<= 240 tris`、质心归零、归一化尺寸约 `2.0 × 2.0 × 2.0`；
5. 运行 `npm run typecheck && npm test && npm run build` 保持全绿。
