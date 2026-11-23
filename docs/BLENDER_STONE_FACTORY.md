# Blender + MCP 真实河岸石子参数化生产规范（v2 · 96 块独一无二全谱系）

> **适用对象**：Codex / Blender MCP 资产生产代理  
> **配套参考**：[docs/STONE_DESIGN.md](STONE_DESIGN.md)、[src/simulation/stones.ts](../src/simulation/stones.ts)、现有工厂脚本 [tools/blender/generate_stones.py](../tools/blender/generate_stones.py)  
> **核心目标**：在现有 36 块石子工厂脚本的基础上，扩产为 **12 大类 × 每类 8 个独一无二变体 = 共 96 块真实米制河岸石子 `.glb`**、一份带精确几何/物理测量值的 `manifest.json`，以及一张供人工验收的 `contact-sheet.png` 全家福渲染图。
>
> **前端无缝兼容**：游戏前端每次会在暮色浅滩随机无放回铺开 34 块完全不重样的真石子，并按需懒加载当前岸滩上的 `.glb`；点击「往前再走走」时会自动避开上一批已出现过的石子。只要 `manifest.json` 保持 Schema 兼容，**无需改动 `src/` 或 `tests/` 即可直接吃满全部 96 块新石头**。

---

## 一、输出目录与文件结构（必须严格遵守）

```text
public/assets/stones/
  manifest.json                  # 96 块石子的自动测量物理元数据清单（见第五节 Schema）
  plunge_boulder_01.glb .. _08.glb
  chunky_cobble_01.glb  .. _08.glb
  quartz_cobble_01.glb  .. _08.glb   # 新增：白脉溪卵石
  jagged_gravel_01.glb  .. _08.glb
  small_wafer_01.glb    .. _08.glb
  standard_01.glb       .. _08.glb
  red_sandstone_01.glb  .. _08.glb   # 新增：丹砂河扁石
  thin_shale_01.glb     .. _08.glb
  heavy_basalt_01.glb   .. _08.glb
  willow_leaf_01.glb    .. _08.glb
  jade_river_flat_01.glb .. _08.glb  # 新增：润玉青溪扁石
  master_disc_01.glb    .. _08.glb

tools/blender/
  generate_stones.py             # 升级后的参数化工厂脚本（默认产出 12×8 = 96 块，支持 --variants / --seed）

deliverables/stone-assets/
  contact-sheet.png              # 96 块石子按 12 行 × 8 列排布的俯视+侧视厚度验收图
  validation-report.json         # 自动几何校验报告（96/96 通过：闭合流形、质心误差、三角面数、文件大小）
```

> **禁止事项**：
> - **不要修改** `src/`、`tests/` 或现有的 `public/assets/stone.glb.base64`；
> - **不要提交**几十 MB 的 `.blend` 工程文件进 `public/`（如需暂存请放在系统 `/tmp` 并在导出后清理）；
> - 导出前请清理旧目录中残留的孤儿 `.glb`（如有），确保 `public/assets/stones/*.glb` 与 `manifest.json` 严格一一对应（共 96 个 `.glb`）。

---

## 二、12 大类真实河岸石子谱系（共 96 块，每类 8 变体，绝无复刻）

真实河滩的寻宝乐趣在于**“在一片真河石里靠眼力淘出好石头”**：既要有笨重圆石与看似漂亮却太厚的白脉卵石，也要有歪瓜裂枣的碎石、顺手的红褐/青灰扁石，以及极少数可遇不可求的润玉溪石与黑曜圆盘。

### 关键升级要求：彻底打破旧脚本 `% 4` 循环！
现有 [generate_stones.py](../tools/blender/generate_stones.py) 中 `self.style = (variant - 1) % 4` 且每类只配了 4 个色板与 4 组 `patterns`。扩产到 **每类 8 变体（`_01` ~ `_08`）** 时，必须把 `style`、色板、轴向比例偏移、矿脉/斑块/缺口特征扩展为 **完整的 8 套差异化基因**，保证同一类别的 8 块石子放在一起时，**轮廓、长宽厚比例、色调、矿脉走向、表面磨损度肉眼一看就完全不同**！

| # | `archetypeId` | 中文名 | 档位 (`rarity`) | 目标包围盒全长×全宽×全厚 (mm) | 岩性密度 (`kg/m³`) | 物理定位与手感 | 形态雕刻与 PBR 材质要点（给 Blender） |
| :-: | :--- | :--- | :---: | :--- | :-: | :--- | :--- |
| 1 | `plunge_boulder` | **重拳河卵石** | `common` (钝石) | `76 × 66 × 48` (±10%) | `2680` | **扑通砸大水花神器**（约 220–420 g）：完全打不起漂，一扔就是巨大水坑、高冠水花和浑厚“咕咚” | 饱满厚重卵形/微方圆河石；暖棕灰/赭褐花岗岩带细白石英斑点与水流冲刷微凹；粗糙度 `0.58–0.72` |
| 2 | `chunky_cobble` | **圆滚鹅卵石** | `common` (钝石) | `58 × 52 × 32` (±8%) | `2650` | **厚圆钝石**（约 115–160 g）：极难起漂（高速勉强弹 0–1 下），砸水解压、水波深 | 高度水磨圆滑的厚卵石；暖灰/浅褐/淡青灰/浅赭多色变体，带柔和矿斑；粗糙度 `0.48–0.62` |
| 3 | `quartz_cobble` *(新)* | **白脉溪卵石** | `common` (钝石) | `66 × 54 × 28` (±9%) | `2660` | **岸边显眼“迷惑石”**（约 110–175 g）：暗灰石身横贯醒目白石英带，远看很诱人，上手太厚难起漂 | 椭圆微扁厚卵石，表面有 1–2 条**清晰贯穿的乳白色石英脉（White Quartz Vein）**与细微交错支脉；底色深青灰/褐黑/暗灰绿；粗糙度 `0.46–0.60` |
| 4 | `jagged_gravel` | **棱角碎石** | `common` (钝石) | `74 × 48 × 21` (±10%) | `2600` | **岸边烂石头/翻车石**（约 75–115 g）：轮廓歪斜、缺口棱角、重心不匀，触水容易歪飞侧翻 | 非对称多面体 + 斜向断口 + 局部磕碰缺口；浅灰/灰黄/锈褐粗糙花岗岩与风化砂砾；粗糙度 `0.80–0.92` |
| 5 | `small_wafer` | **小薄碎瓦片** | `usable` (寻常) | `56 × 45 × 5.5` (±8%) | `2400` | **轻脆小薄片**（约 15–32 g）：起跳门槛极低、声音清脆，但惯性小飞不远 | 小巧轻薄、边缘略带不规则脆裂与微弧度；风化红褐砂岩/灰黄泥岩/淡砖红/浅陶瓦色；粗糙度 `0.72–0.84` |
| 6 | `standard` | **河岸标准扁石** | `usable` (寻常) | `80 × 60 × 9.0` (±7%) | `2650` | **经典均衡基准石**（约 52–68 g）：4–12 跳手感最自然稳定 | 经典微扁椭圆河石，顶底平缓、边缘经溪水打磨圆润；青灰/冷灰褐/暖石灰带细微沉积斑纹；粗糙度 `0.62–0.75` |
| 7 | `red_sandstone` *(新)* | **丹砂河扁石** | `usable` (寻常) | `82 × 62 × 8.2` (±7%) | `2480` | **夕阳暖色轻扁石**（约 46–64 g）：密度略轻、颗粒感温润，轻甩好起跳，在落日河滩上极具辨识度 | 略呈圆角椭圆/不规则扁鹅卵轮廓，表面带**温润细砂岩颗粒与淡淡层状赤铁矿色带**；铁锈红/赭红/赤褐/暖陶土色系（注意反照率不超标，自然写实）；粗糙度 `0.68–0.80` |
| 8 | `thin_shale` | **青灰薄页岩** | `fine` (精良) | `84 × 64 × 5.2` (±7%) | `2550` | **密集连跳之王**（约 36–48 g）：极薄、升重比极高，轻松拉出薄而高的金色水幕与密集连跳 | 极扁片状、侧面有清晰的**阶梯状页岩层理剥落（Layered Cleavage）**；深青灰/板岩蓝/炭蓝灰带微弱云母颗粒反光；粗糙度 `0.55–0.68` |
| 9 | `heavy_basalt` | **玄武重圆饼** | `fine` (精良) | `88 × 85 × 11.0` (±6%) | `2950` | **大力破浪远投石**（约 110–145 g）：近正圆高密度，转动惯量极大、陀螺稳如钟表，发力够大单跳跨度惊人 | 厚实近正圆饼状、边缘高度圆滑；深墨黑/炭灰/蓝黑微孔玄武岩（带极细微气孔法线凹凸）；粗糙度 `0.58–0.70` |
| 10 | `willow_leaf` | **柳叶长扁石** | `fine` (精良) | `104 × 44 × 7.5` (±7%) | `2650` | **弧线切旋技巧石**（约 44–60 g）：高长宽比，配合左右侧倾 `roll` 与高自旋滑出飘逸弧线 | 狭长梭形/微弧月牙扁石（一端略修尖、一端圆润），表面带纵向溪水冲刷条纹；青白/浅灰绿/溪水灰绿；粗糙度 `0.52–0.64` |
| 11 | `jade_river_flat` *(新)* | **润玉青溪扁石** | `fine` (精良) | `88 × 74 × 6.8` (±5%) | `2720` | **高水磨润泽技巧盘**（约 56–76 g）：圆润扁阔、阻力低、重心稳，在暮色水边泛出温润青绿微光 | 高度水磨圆滑的阔扁椭圆/微心形圆角溪石，表面细腻如玉带柔和云雾状浅青/苍绿/墨玉晕染与细微水润光泽；粗糙度 `0.42–0.54` |
| 12 | `master_disc` | **溪磨黑曜圆盘** | `rare` (稀珍) | `92 × 88 × 6.2` (±4%) | `2750` | **冲刺吉尼斯纪录极品**（约 62–90 g）：黄金长宽厚比、极低水阻、近乎完美的轴对称流线双凸圆盘 | 高度对称的双凸飞碟形扁圆溪石（中心微厚、周缘平滑收薄但不割手）；深墨玉/黑板岩/幽蓝黑丝滑光泽，带极淡金褐或银灰矿纹，落日下泛出高级边缘反光；粗糙度 `0.38–0.48` |

> **每类 8 个变体（`_01` ~ `_08`）的差异化基因建议**：
> - `_01` ~ `_04`：保持经典基准、偏修长、带明显矿脉/剥落、偏厚/偏薄极端个体；
> - `_05`：微偏阔圆（高宽长比）+ 冷色调或深风化底色；
> - `_06`：自然不对称河水偏磨（一侧更圆润、一侧略平直）+ 暖褐/铁锈矿斑；
> - `_07`：带清晰水流冲刷细纹/层理色带 + 略偏大一圈的饱满个体；
> - `_08`：略偏紧凑小巧的精致个体 + 独特矿脉角度与高辨识度表面微瑕（如浅色斑驳或细微水蚀浅坑）。

---

## 三、Blender 建模、坐标系与 PBR 烘焙硬规范

请务必在 `generate_stones.py` 里用代码严格执行并自动断言以下每一条（沿用 v1 已验证标准）：

### 1. 单位、姿态与质心（严格对齐 `src/simulation/physics.ts`）
- **单位制**：`scene.unit_settings.system = 'METRIC'`，`scale_length = 1.0`（`1 Blender Unit = 1 Meter`）。
- **Blender 建模轴向（Z-Up）→ glTF 导出后（Y-Up）**：
  - **最长轴沿 `X`**（对应导出后的 `+X` 前进方向）；
  - **次长轴（宽度）沿 `Y`**（对应导出后的 `±Z` 宽度方向）；
  - **最薄厚度（盘面法向）沿 `Z`**（对应导出后的 `+Y` 朝天法向）。
  - 导出 `export_yup=True` 后自动满足：`bbox.x ≈ 2a`、`bbox.y ≈ 2h`、`bbox.z ≈ 2b`，且严格 `a >= b >= h`。
- **质心与变换归零**：
  - 体积质心归零偏差 `< 0.5 mm`，Scale 严格 `(1, 1, 1)`，Rotation 严格 `(0, 0, 0)`。

### 2. 高模雕刻 → 低模 PBR 烘焙与体积预算
- **单石三角面**：`500 ~ 1,300 tris`（`jagged_gravel` / `thin_shale` 最高 `1,500 tris`，绝不超过 `2,000 tris`）。
- **纹理烘焙**：Cycles 烘焙 `512 × 512` 的 `BaseColor`（sRGB，写实反照率 `0.14 ~ 0.48`，`quartz_cobble` 的局部白石英脉可到 `0.62` 但底石保持深暗以防 Bloom 过曝）、Tangent Space OpenGL `Normal`、`Roughness`。
- **单文件体积预算（96 块总包控体积）**：
  - 内嵌 WebP 贴图，每块 `.glb` 控制在 **`80 KB ~ 240 KB`**（目标均值 `~150–175 KB`，96 块总计约 `14 ~ 18 MB`，单块绝不超过 `350 KB`）。
  - 每次仅导出单个石子 Mesh（无灯光、无相机、无空节点）。

---

## 四、自动几何物理测量与校验脚本要求

对全部 **96 块** `.glb` 执行与 v1 相同的 `bmesh` 实测校验并写入 `manifest.json` 和 `validation-report.json`：
1. 100% 闭合 2-manifold、零退化面、法线统一朝外；
2. `volume_m3 = abs(bm.calc_volume())`，`mass = volume_m3 * density` 且落在合理物理克重区间；
3. `a >= b >= h`（实测局部包围盒半轴），质心误差 `< 0.5 mm`。

---

## 五、`public/assets/stones/manifest.json` 数据协议（严格保持 v1 Schema 兼容）

```json
{
  "version": 1,
  "generatedAt": "2026-11-23T00:00:00Z",
  "count": 96,
  "stones": [
    {
      "id": "jade_river_flat_01",
      "archetypeId": "jade_river_flat",
      "variant": 1,
      "name": "润玉青溪扁石",
      "rarity": "fine",
      "rarityLabel": "精良",
      "feel": "水磨润泽如玉，阔扁沉稳，贴水滑行时手感极顺滑。",
      "glbPath": "/assets/stones/jade_river_flat_01.glb",
      "a": 0.0441,
      "b": 0.0372,
      "h": 0.0034,
      "volumeM3": 0.0000242,
      "density": 2720,
      "mass": 0.06582,
      "dragScale": 0.86,
      "wobble": 0.01,
      "roughness": 0.48,
      "colorHex": "#4d675c",
      "triangles": 1020,
      "fileBytes": 162400
    }
  ]
}
```

全 12 类物理基准（允许按变体不规则度微调 ±8%）：
- `plunge_boulder`: `dragScale: 1.48`, `wobble: 0.06`
- `chunky_cobble`: `dragScale: 1.38`, `wobble: 0.08`
- `quartz_cobble`: `dragScale: 1.30`, `wobble: 0.09`
- `jagged_gravel`: `dragScale: 1.28`, `wobble: 0.24`
- `small_wafer`: `dragScale: 1.04`, `wobble: 0.06`
- `standard`: `dragScale: 1.00`, `wobble: 0.00`
- `red_sandstone`: `dragScale: 1.02`, `wobble: 0.03`
- `thin_shale`: `dragScale: 0.90`, `wobble: 0.02`
- `heavy_basalt`: `dragScale: 0.96`, `wobble: 0.00`
- `willow_leaf`: `dragScale: 0.93`, `wobble: 0.03`
- `jade_river_flat`: `dragScale: 0.86`, `wobble: 0.01`
- `master_disc`: `dragScale: 0.78`, `wobble: 0.00`

---

## 六、验收标准（交付前自检）

1. `public/assets/stones/` 下存在全部 **96 个 `.glb` 文件** 与合法的 **`manifest.json`**（`count: 96`），无孤儿文件、无空文件、单文件 `<= 350 KB`；
2. `deliverables/stone-assets/validation-report.json` 中 96 块石子 **100% 通过**：闭合流形、质心偏差 `< 0.5 mm`、三角面 `<= 2000`、严格米制 `a >= b >= h`；
3. `deliverables/stone-assets/contact-sheet.png` 按 **12 行 × 8 列**清晰展示全部 96 块石子的**俯视轮廓与侧面薄厚**，同类 8 个变体肉眼明显各不相同，新增的 `quartz_cobble`（醒目白石英脉）、`red_sandstone`（暖铁锈红砂岩扁石）、`jade_river_flat`（青绿润玉溪扁石）一眼可辨；
4. 运行 `npm run typecheck && npm test && npm run build` 全量通过（无需修改 `src/` 或 `tests/`）。
