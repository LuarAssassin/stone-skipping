# Blender + MCP 真实河岸石子参数化生产规范

> **适用对象**：Codex / Blender MCP 资产生产代理  
> **配套参考**：[docs/STONE_DESIGN.md](STONE_DESIGN.md)、[src/simulation/stones.ts](../src/simulation/stones.ts)  
> **核心目标**：用一套可复用的 Blender Python (`bpy`) 参数化工厂脚本，批量产出 **9 大类 × 每类 4 个变体 = 共 36 块真实米制河岸石子 `.glb`**、一份带精确几何/物理测量值的 `manifest.json`，以及一张供人工验收的 `contact-sheet.png` 全家福渲染图。

---

## 一、输出目录与文件结构（必须严格遵守）

```text
public/assets/stones/
  manifest.json                  # 36 块石子的自动测量物理元数据清单（见第五节 Schema）
  plunge_boulder_01.glb .. _04.glb
  chunky_cobble_01.glb  .. _04.glb
  jagged_gravel_01.glb  .. _04.glb
  small_wafer_01.glb    .. _04.glb
  standard_01.glb       .. _04.glb
  thin_shale_01.glb     .. _04.glb
  heavy_basalt_01.glb   .. _04.glb
  willow_leaf_01.glb    .. _04.glb
  master_disc_01.glb    .. _04.glb

tools/blender/
  generate_stones.py             # 可一键重复运行的参数化工厂脚本（支持按 seed 复现或扩量生成）

deliverables/stone-assets/
  contact-sheet.png              # 36 块石子按 9 行 × 4 列排布的俯视+侧视厚度验收图（带标注或整齐网格）
  validation-report.json         # 自动几何校验报告（闭合流形、包围盒、体积、质心误差、三角面数、文件大小）
```

> **禁止事项**：
> - **不要修改** `src/`、`tests/` 或现有的 `public/assets/stone.glb.base64`；
> - **不要提交**几十 MB 的 `.blend` 工程文件进 `public/`（如需暂存请放在系统 `/tmp` 并在导出后清理）。

---

## 二、9 大类真实河岸石子谱系（共 36 块，参差不齐）

真实河岸不可能全是完美扁石：必须覆盖**“纯砸大水花的笨重圆石 → 歪瓜裂枣的烂碎石 → 寻常河石 → 各有偏科的精良技巧石 → 可遇不可求的吉尼斯纪录级极品圆盘”**。

每类通过参数化脚本生成 **4 个变体（`_01` ~ `_04`）**，同类别内的 4 个变体必须在**轮廓微变形、表面岩纹/矿脉/色相、厚薄起伏（±8%）**上有肉眼可辨的自然差异，绝不能只是同一模型的均匀缩放！

| # | `archetypeId` | 中文名 | 档位 (`rarity`) | 目标包围盒全长×全宽×全厚 (mm) | 岩性密度 (`kg/m³`) | 物理定位与手感 | 形态雕刻与 PBR 材质要点（给 Blender） |
| :-: | :--- | :--- | :---: | :--- | :-: | :--- | :--- |
| 1 | `plunge_boulder` | **重拳河卵石** | `common` (钝石) | `76 × 66 × 48` (±10%) | `2680` | **扑通砸大水花神器**（约 260–380 g）：完全打不起漂，一扔就是巨大水坑、高冠水花和浑厚“咕咚” | 饱满厚重卵形/微方圆河石；暖棕灰/赭褐花岗岩带细白石英斑点与水流冲刷微凹；粗糙度 `0.58–0.72` |
| 2 | `chunky_cobble` | **圆滚鹅卵石** | `common` (钝石) | `58 × 52 × 32` (±8%) | `2650` | **厚圆钝石**（约 115–160 g）：极难起漂（高速勉强弹 0–1 下），砸水解压、水波深 | 高度水磨圆滑的厚卵石；暖灰/浅褐/淡青灰随机变色，带柔和乳白石英脉纹；粗糙度 `0.48–0.62` |
| 3 | `jagged_gravel` | **棱角碎石** | `common` (钝石) | `74 × 48 × 21` (±10%) | `2600` | **岸边烂石头/翻车石**（约 75–115 g）：轮廓歪斜、缺口棱角、重心不匀，触水容易歪飞侧翻 | 非对称多面体 + Voronoi 碎裂切面 + 局部磕碰缺口；浅灰/灰黄粗糙花岗岩与风化砂砾；粗糙度 `0.80–0.92` |
| 4 | `small_wafer` | **小薄碎瓦片** | `usable` (寻常) | `56 × 45 × 5.5` (±8%) | `2400` | **轻脆小薄片**（约 18–28 g）：起跳门槛极低、声音清脆，但惯性太小飞不远 | 小巧轻薄、边缘略带不规则脆裂与微弧度；风化红褐砂岩/灰黄泥岩/淡砖红瓦片色调；粗糙度 `0.72–0.84` |
| 5 | `standard` | **河岸标准扁石** | `usable` (寻常) | `80 × 60 × 9.0` (±7%) | `2650` | **经典均衡基准石**（约 52–68 g）：4–12 跳手感最自然稳定 | 经典微扁椭圆河石，顶底平缓、边缘经溪水打磨圆润；青灰/冷灰褐带细微沉积斑纹；粗糙度 `0.62–0.75` |
| 6 | `thin_shale` | **青灰薄页岩** | `fine` (精良) | `84 × 64 × 5.2` (±7%) | `2550` | **密集连跳之王**（约 36–48 g）：极薄、升重比极高，轻松拉出薄而高的金色水幕与密集连跳 | 极扁片状、侧面有清晰的**阶梯状页岩层理剥落（Layered Cleavage）**；深青灰/板岩蓝带微弱云母颗粒反光；粗糙度 `0.55–0.68` |
| 7 | `heavy_basalt` | **玄武重圆饼** | `fine` (精良) | `88 × 85 × 11.0` (±6%) | `2950` | **大力破浪远投石**（约 110–145 g）：近正圆高密度，转动惯量极大、陀螺稳如钟表，发力够大单跳跨度惊人 | 厚实近正圆饼状、边缘高度圆滑；深墨黑/炭灰微孔玄武岩（带极细微气孔法线凹凸）；粗糙度 `0.58–0.70` |
| 8 | `willow_leaf` | **柳叶长扁石** | `fine` (精良) | `104 × 44 × 7.5` (±7%) | `2650` | **弧线切旋技巧石**（约 44–60 g）：高长宽比，配合左右侧倾 `roll` 与高自旋滑出飘逸弧线 | 狭长梭形扁石（一端略修尖、一端圆润），表面带纵向溪水冲刷条纹；青白/浅灰绿溪石；粗糙度 `0.52–0.64` |
| 9 | `master_disc` | **溪磨黑曜圆盘** | `rare` (稀珍) | `92 × 88 × 6.2` (±4%) | `2750` | **冲刺吉尼斯纪录极品**（约 68–84 g）：黄金长宽厚比、极低水阻、近乎完美的轴对称流线双凸圆盘 | 高度对称的双凸飞碟形扁圆溪石（中心微厚、周缘平滑收薄但不割手）；深墨玉/黑板岩丝滑光泽，带极淡金褐矿纹，在低角度落日下泛出高级暖金边缘反光；粗糙度 `0.38–0.48` |

> **4 个变体的差异化策略（以每类 `_01` ~ `_04` 为例）**：
> - `_01`：该类别最典型的标准形态与代表岩色；
> - `_02`：略偏修长或略偏圆润的轮廓变体 + 偏暖/偏褐岩色；
> - `_03`：带明显天然石英脉纹 / 浅色风化斑块或层理剥落细节的变体；
> - `_04`：微偏厚/微偏薄的真实河滩个体差异（如 `master_disc_04` 做成极限薄圆盘 `96×92×5.6 mm`，`plunge_boulder_04` 做成超大重拳石 `84×72×54 mm`）。

---

## 三、Blender 建模、坐标系与 PBR 烘焙硬规范

请务必在 `generate_stones.py` 里用代码严格执行并自动断言以下每一条，否则放进 Three.js 会出现尺码错乱、方向倒置或穿水偏移：

### 1. 单位、姿态与质心（严格对齐 `src/simulation/physics.ts`）
- **单位制**：`scene.unit_settings.system = 'METRIC'`，`scale_length = 1.0`（`1 Blender Unit = 1 Meter`）。
- **Blender 建模轴向（Z-Up）→ glTF 导出后（Y-Up）**：
  - 在 Blender 场景中建模时：
    - **最长轴沿 `X`**（对应导出后的 `+X` 前进方向）；
    - **次长轴（宽度）沿 `Y`**（对应导出后的 `±Z` 宽度方向）；
    - **最薄厚度（盘面法向）沿 `Z`**（对应导出后的 `+Y` 朝天法向）。
  - 导出 `bpy.ops.export_scene.gltf(..., export_yup=True)` 后，Three.js 载入时自动满足：`bbox.x ≈ 2a`（长）、`bbox.y ≈ 2h`（厚）、`bbox.z ≈ 2b`（宽），且 `bbox.x >= bbox.z >= bbox.y`。
- **质心与变换归零**：
  - 对最终低模执行 `bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)`；
  - 执行 `bpy.ops.object.origin_set(type='ORIGIN_CENTER_OF_VOLUME', center='MEDIAN')`；
  - 将物体移到 `(0, 0, 0)`：`obj.location = (0, 0, 0)`。
  - **断言**：物体世界原点与体积质心偏差 `< 0.5 mm`，Scale 严格 `(1, 1, 1)`，Rotation 严格 `(0, 0, 0)`。

### 2. 高模程序化雕刻 → 低模 PBR 烘焙管线（发挥 Blender 最大优势）
为了兼顾**特写端详时的电影级岩石微质感**与**60 FPS 实时渲染性能**，推荐采用「程序化高模 → 低模烘焙」管线：
1. **高模生成**：以细分球/扁椭球为基底，叠加：
   - 类别专属轮廓整形（双凸盘面、梭形收尖、多面碎裂、页岩层理台阶）；
   - 多频 3D Noise / Voronoi 位移（真实岩石凹凸、水磨钝化边缘、碎石棱角与局部磕碰）；
   - 程序化节点材质（岩体底色变化 + 细石英脉 / 矿物斑点 / 凹槽积垢 AO 暗化 + 细砂粒 Bump + 局部粗糙度变化）。
2. **低模与 UV**：
   - 生成干净闭合流形低模，单石三角面控制在 **`500 ~ 1,200 tris`**（`jagged_gravel` / `thin_shale` 可到 `1,400 tris` 上限，绝不超过 `2,000 tris`）；
   - 开启平滑着色（Shade Smooth），智能 UV 展开（`smart_project`，岛屿边距 `0.03`，避免烘焙接缝）。
3. **纹理烘焙与 PBR 规范**：
   - 使用 Cycles（CPU/GPU 均可）烘焙 **`512 × 512`** 贴图：
     - `BaseColor`（sRGB，反照率亮度控制在自然写实的 `0.14 ~ 0.48`，避免在落日强光和 Bloom 下过曝发白）；
     - `Normal`（切线空间 Tangent Space OpenGL 法线，完整保留高模岩层、石英纹与水磨微坑）；
     - `Roughness`（按上表岩性区间烘焙局部粗糙度变化，让引擎入水变湿时反光层次极真实）。
   - `Metallic` 保持 `0.0`（仅 `thin_shale` / `master_disc` 允许 `<= 0.05`）。
   - 烘焙完成后移除高模，只把绑定了 Baked `Principled BSDF` 的低模导出为 `.glb`。

### 3. glTF Binary (`.glb`) 导出规范
- 每次仅导出**单个石子 Mesh**（无灯光、无相机、无空父节点、无多余动画）：
  - `export_format='GLB'`
  - `use_selection=True`
  - `export_yup=True`
  - `export_apply=True`
  - `export_normals=True`
  - `export_texcoords=True`
  - `export_materials='EXPORT'`
  - `export_image_format='WEBP'`（若 Blender 版本不支持 WebP 内嵌则退回 `'JPEG'`/`'AUTO'`，Normal Map 保持高质量避免压缩噪点）
- **单文件体积预算**：每块 `.glb` 目标 **`80 KB ~ 320 KB`**（36 块总计控制在 `~5–9 MB` 以内）。

---

## 四、自动几何物理测量与校验脚本要求

`generate_stones.py` 在导出每一块 `.glb` 时，必须用 `bmesh` 计算真实几何属性，并写入 `public/assets/stones/manifest.json` 和 `deliverables/stone-assets/validation-report.json`：

1. **流形闭合校验**：检查所有边是否为 2-manifold、无退化零面积面、法线统一朝外（`bmesh.ops.recalc_face_normals`）。
2. **真实体积与质量计算**：
   - 使用 `volume_m3 = abs(bm.calc_volume())`（单位 $\text{m}^3$）；
   - 按该类岩性真实密度算出精准物理质量：`mass_kg = volume_m3 * density`。
   - *校验*：确保 `mass_kg` 处于合理物理范围（如 `small_wafer` 约 `15–32g`，`master_disc` 约 `62–90g`，`plunge_boulder` 约 `220–420g`）。
3. **真实半轴尺寸**：
   - 从导出前（或等价 Y-Up 变换后）的局部顶点包围盒计算：
     - `a = (max_x - min_x) / 2`（半长，m）
     - `b = (max_y_blender - min_y_blender) / 2`（半宽，m，对应 glTF Z）
     - `h = (max_z_blender - min_z_blender) / 2`（半厚，m，对应 glTF Y）
4. **扁平度与对称度指标**（供游戏估算手感描述与 `wobble`）：
   - `flatness = h / sqrt(a * b)`（越小越扁平、越容易起跳）；
   - `aspect = b / a`（越接近 `1.0` 越正圆、陀螺越稳）。

---

## 五、`public/assets/stones/manifest.json` 数据协议

请严格按以下 JSON Schema 输出，方便 Three.js 前端无缝热加载全部 36 块石子并自动绑定精确物理参数：

```json
{
  "version": 1,
  "generatedAt": "2026-11-22T00:00:00Z",
  "count": 36,
  "stones": [
    {
      "id": "master_disc_01",
      "archetypeId": "master_disc",
      "variant": 1,
      "name": "溪磨黑曜圆盘",
      "rarity": "rare",
      "rarityLabel": "稀珍",
      "feel": "极度对称的双凸黑玉薄盘，边缘如水磨般顺滑，适合冲击极限纪录。",
      "glbPath": "/assets/stones/master_disc_01.glb",
      "a": 0.0462,
      "b": 0.0441,
      "h": 0.0031,
      "volumeM3": 0.0000278,
      "density": 2750,
      "mass": 0.07645,
      "dragScale": 0.78,
      "wobble": 0.0,
      "roughness": 0.42,
      "colorHex": "#2f353d",
      "triangles": 960,
      "fileBytes": 168420
    }
  ]
}
```

字段补充说明：
- `dragScale` 与 `wobble` 沿用各 `archetypeId` 的物理基准（允许按该变体的表面粗糙/不规则度在 `±8%` 内微调）：
  - `plunge_boulder`: `dragScale: 1.48`, `wobble: 0.06`
  - `chunky_cobble`: `dragScale: 1.38`, `wobble: 0.08`
  - `jagged_gravel`: `dragScale: 1.28`, `wobble: 0.24`
  - `small_wafer`: `dragScale: 1.04`, `wobble: 0.06`
  - `standard`: `dragScale: 1.00`, `wobble: 0.00`
  - `thin_shale`: `dragScale: 0.90`, `wobble: 0.02`
  - `heavy_basalt`: `dragScale: 0.96`, `wobble: 0.00`
  - `willow_leaf`: `dragScale: 0.93`, `wobble: 0.03`
  - `master_disc`: `dragScale: 0.78`, `wobble: 0.00`

---

## 六、验收标准（交付前自检）

1. `public/assets/stones/` 下存在全部 **36 个 `.glb` 文件** 与合法的 **`manifest.json`**，所有路径均可解析，无空文件或 >500 KB 的异常文件；
2. `deliverables/stone-assets/validation-report.json` 中 36 块石子 **100% 通过**：闭合流形、质心偏差 `< 0.5 mm`、三角面 `<= 2000`、长宽厚严格米制且 `a >= b >= h`；
3. `deliverables/stone-assets/contact-sheet.png` 在暮色暖侧光 + 冷补光下清晰展示全部 36 块石子的**俯视轮廓与侧面薄厚**，一眼能区分出：
   - 厚重的 `plunge_boulder` / `chunky_cobble`；
   - 磕碰歪斜的 `jagged_gravel`；
   - 极薄带层理的 `thin_shale`；
   - 狭长优雅的 `willow_leaf`；
   - 圆润光滑如玉的 `master_disc`；
4. 现有仓库 `npm run typecheck && npm test && npm run build` 保持零改动、全通过。
