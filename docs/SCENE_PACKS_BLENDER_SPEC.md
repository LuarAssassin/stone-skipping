# 掠水 · 多主题 3D 场景资产 Blender 制作规范（Scene Packs Spec）

本文档用于离线生成 4 套风格迥异的 Three.js WebGL 场景资产包（与已完成的 `jiangnan` 江南水榭荷塘保持完全一致的技术标准）。所有资产均通过 Blender Python (`bpy`) 生成、烘焙 PBR 贴图、导出 `.glb` 并通过 Three.js `GLTFLoader` 回读验收。

---

## 一、全局硬性技术规范（4 套通用）

1. **单位与坐标**：
   - `1 Blender unit = 1 meter`，导出 `.glb` 严格使用 glTF 2.0 `Y-up`（`export_yup=True`），应用全部 Scale / Rotation。
   - **原点（Origin）规则**：
     - **水上漂浮物与涉水结构**（船、独木舟、码头、鸟居、高脚屋、浮冰、水面落叶、水礁石）：原点 `(0, 0, 0)` 严格对齐**静水面 / 吃水线**；船底与浮冰下探 `-0.30 ~ -0.50 m`，水桩/石墩下探 `-1.20 m`，确保 Three.js 随波起伏或浅水观察绝不露底悬空。
     - **岸上树木 / 灌木 / 远山体**：原点对齐地面接触面 `y = 0`，根部或山脚下探 `-0.15 ~ -0.60 m` 以自然贴合起伏岸滩或湖面。
2. **PBR 贴图烘焙与色彩审美**：
   - 严禁依赖未烘焙的 Blender 程序节点；全部资产展开干净 UV，生成并内嵌真实 `BaseColor + Roughness + Normal`（WEBP，大件 `1024×1024`，小件 `512×512`）。
   - 发光窗口/灯笼使用独立 `Emissive` 材质（纯暖黄/暖橘，供 Three.js Selective Bloom 触发微光）。
   - 树叶/针叶/枫叶/棕榈叶使用精细分层卡片 + `alphaMode='MASK'` 透明遮罩贴图，**禁止用圆球或光秃圆锥代替树冠**。
   - 色彩遵循电影级实拍克制色域，避免塑料高饱和感。
3. **交付物与验收**：
   - 每套场景包输出到 `public/assets/scenes/<packId>/`：
     - 全部 `.glb` 文件（单件大建筑/远山 ≤ `1.5 MB`，船/树 ≤ `800 KB`，小物件 ≤ `250 KB`）
     - `manifest.json`（格式与 `public/assets/scenes/jiangnan/manifest.json` 完全一致，含 `version: 1`, `packId`, `seed`, `assets[]` 及每件的 `file`, `bboxMeters`, `boundsMeters`, `triangles`, `fileBytes`, `sha256`）
   - 每套对应独立生成脚本 `tools/blender/generate_<packId>_scene.py` 与 Cycles 验收网格图 `tools/blender/preview_<packId>_assets.png`（固定 seed，可复现）。

---

## 二、4 套差异化场景资产清单

### Pack 1：`tahoe` — 北美太浩松涛（Alpine Glacier Lake）
- **输出目录**：`public/assets/scenes/tahoe/`
- **脚本与预览**：`tools/blender/generate_tahoe_scene.py` · `tools/blender/preview_tahoe_assets.png`
- **风格基调**：美国内华达山脉太浩湖 / 班夫冰川湖；风化红雪松原木、浅灰冰川花岗岩、深翠针叶林、积雪锯齿花岗岩峰。

| 文件名 | 资产描述 | 目标尺寸 (X×Y×Z m) | 原点 | 面数预算 | 特殊材质 |
|---|---|---:|---|---:|---|
| `wooden_dock.glb` | 北美风化雪松木栈桥（长条木板、原木桩下探 `-1.2m`、系船铁柱、桥头铜灯柱） | `6.4 × 3.4 × 2.2`（沿 `+X` 延伸） | 水面 `y=0`（桥面 `+0.55m`） | 6k–11k | 桥头灯芯 `Emissive` |
| `cedar_canoe.glb` | 经典红雪松木条拼接独木舟（船头朝 `+X`、编织藤座、木桨） | `4.6 × 0.85 × 0.92` | 吃水线 `y=0`（底 `-0.28m`） | 4k–7k | 清漆木纹粗糙度变化 |
| `alpine_pine_tall.glb` | 高耸道格拉斯冷杉/雪松（笔直略曲深褐树干 + 多层垂枝针叶簇） | `4.8 × 11.2 × 4.8` | 树根 `y=0` | 6k–9k | 针叶 `MASK` |
| `alpine_pine_mid.glb` | 中等海岸松（略向湖倾斜、疏朗松枝层） | `4.6 × 7.6 × 4.2` | 树根 `y=0` | 5k–8k | 针叶 `MASK` |
| `granite_boulder_large.glb` | 冰川磨蚀浅灰花岗岩巨石（水线以下深色湿润带 + 上部干爽淡灰斑岩） | `3.4 × 2.1 × 2.8` | 水面 `y=0`（底 `-0.65m`） | 1.5k–3k | 湿润水线粗糙度渐变 |
| `granite_boulder_cluster.glb` | 浅滩花岗岩礁石簇（3–4 块高低错落半浸水面） | `2.6 × 1.1 × 2.2` | 水面 `y=0`（底 `-0.45m`） | 1.5k–3k | 同上 |
| `snow_peak_ridge.glb` | 远景锯齿状花岗岩雪山主峰（陡峭灰黑岩壁 + 脊线与沟谷覆雪） | `44 × 26 × 18` | 山脚 `y=0`（底 `-0.5m`） | 3k–5k | 岩雪法线与反照率对比 |

---

### Pack 2：`kyoto` — 京都岚山枫渡（Autumn Maple Shrine Lake）
- **输出目录**：`public/assets/scenes/kyoto/`
- **脚本与预览**：`tools/blender/generate_kyoto_scene.py` · `tools/blender/preview_kyoto_assets.png`
- **风格基调**：日本京都深秋湖畔神社；温润朱红漆鸟居、层叠绯红与琥珀金鸡爪槭、青苔石灯笼、素木和船、满湖飘零红枫叶。

| 文件名 | 资产描述 | 目标尺寸 (X×Y×Z m) | 原点 | 面数预算 | 特殊材质 |
|---|---|---:|---|---:|---|
| `water_torii.glb` | 水中朱红明神鸟居（经典反翘黑顶笠木、贯木、中央额束、下探 `-1.2m` 苔石基座） | `5.8 × 7.4 × 1.5`（面朝 `+Z`） | 水面 `y=0`（顶 `+6.2m`） | 5k–9k | 略带岁月感的朱漆与暗苔脚 |
| `yakatabune_skiff.glb` | 日式素木平底翘头和船（船头朝 `+X`、木坐席、船头竹竿暖纸提灯、撑篙） | `4.5 × 1.05 × 1.18` | 吃水线 `y=0`（底 `-0.35m`） | 4k–7k | 提灯 `Emissive` |
| `stone_toro.glb` | 日式雪见石灯笼（宽大六角石伞顶、镂空火袋、三足曲腿、青苔花岗岩） | `1.05 × 1.75 × 1.05` | 底部 `y=0` | 2.5k–4.5k | 火袋暖烛 `Emissive` |
| `japanese_maple_red.glb` | 盛红鸡爪槭（优雅横展曲干 + 多层绯红/深红枫叶簇） | `6.8 × 6.2 × 6.4` | 树根 `y=0` | 6k–9k | 掌状红枫 `MASK` |
| `japanese_maple_gold.glb` | 金橙秋枫（琥珀金黄与橘红渐变枫叶簇） | `6.2 × 5.6 × 5.8` | 树根 `y=0` | 6k–9k | 掌状金枫 `MASK` |
| `mossy_river_rock.glb` | 覆苔暗玄武湖石（石顶厚实翠绿青苔 + 下半湿润深黑玄武岩） | `2.1 × 1.1 × 1.7` | 水面 `y=0`（底 `-0.45m`） | 1k–2.2k | 顶部高粗糙苔藓 + 底部低粗糙湿岩 |
| `autumn_floating_leaves.glb` | 水面漂浮红枫落叶簇（12–18 片错落贴水的红/橙/金枫叶薄片） | `1.9 × 0.04 × 1.8` | 水面 `y=0`（略抬 `+0.015m`） | 200–500 | 枫叶 `MASK` |

---

### Pack 3：`nordic` — 北欧极光峡湾（Lofoten Aurora Fjord）
- **输出目录**：`public/assets/scenes/nordic/`
- **脚本与预览**：`tools/blender/generate_nordic_scene.py` · `tools/blender/preview_nordic_assets.png`
- **风格基调**：挪威罗弗敦极夜峡湾（Three.js 侧已配备实时极光天幕）；经典法鲁红木高脚渔屋与温暖橘黄窗光、搭接木渔船、浮冰、挂雪云杉、刀削黑岩雪壁。

| 文件名 | 资产描述 | 目标尺寸 (X×Y×Z m) | 原点 | 面数预算 | 特殊材质 |
|---|---|---:|---|---:|---|
| `rorbu_cabin.glb` | 挪威法鲁红木高脚水上渔屋（白框暖光玻璃窗、覆厚雪坡屋顶、木栈露台、水下木桩 `-1.2m`） | `5.8 × 6.4 × 4.6` | 水面 `y=0`（屋脊 `+5.2m`） | 7k–12k | 玻璃窗与门灯暖橘 `Emissive` |
| `nordic_fishing_skiff.glb` | 北欧 Clinker 搭接木渔船（船头朝 `+X`、暗蓝灰漆旧木板、船尾铁提灯与木桨） | `4.3 × 1.05 × 1.32` | 吃水线 `y=0`（底 `-0.42m`） | 4k–7k | 船尾暖灯 `Emissive` |
| `ice_floe_large.glb` | 大块不规则漂浮海冰（多面崩裂冰缘、顶部薄雪、水线冰蓝带） | `3.1 × 0.55 × 2.5` | 水面 `y=0`（底 `-0.35m`） | 800–1.8k | 低粗糙冰缘 + 高粗糙雪面 |
| `ice_floe_small.glb` | 碎浮冰块簇（4–5 块大小错落冰块） | `1.7 × 0.36 × 1.5` | 水面 `y=0`（底 `-0.22m`） | 600–1.4k | 同上 |
| `snow_spruce.glb` | 挂雪北欧云杉（深暗蓝绿垂枝 + 枝顶厚实白雪覆盖） | `3.8 × 8.6 × 3.8` | 树根 `y=0` | 5k–8k | 针叶+积雪 `MASK` |
| `fjord_seastack.glb` | 峭拔玄武岩海蚀柱（层理暗黑湿岩 + 顶部残雪） | `4.4 × 7.6 × 3.8` | 水面 `y=0`（底 `-0.8m`） | 1.8k–3.5k | 湿黑岩法线 |
| `fjord_cliff_wall.glb` | 远景刀削峡湾雪山绝壁（极陡暗岩 + 冰川雪坡，专为极光映照构图） | `48 × 28 × 18` | 山脚 `y=0`（底 `-0.6m`） | 3k–5k | 岩壁与雪坡清晰层次 |

---

### Pack 4：`lagoon` — 热带珊瑚暮湾（South Pacific Coral Lagoon）
- **输出目录**：`public/assets/scenes/lagoon/`
- **脚本与预览**：`tools/blender/generate_lagoon_scene.py` · `tools/blender/preview_lagoon_assets.png`
- **风格基调**：南太平洋波拉波拉 / 莫雷阿翡翠礁湖；茅草水上草亭与火把暖光、弧形迎风椰子树、传统舷外支架独木舟、浅礁珊瑚石灰岩、远方尖耸火山岛轮廓。

| 文件名 | 资产描述 | 目标尺寸 (X×Y×Z m) | 原点 | 面数预算 | 特殊材质 |
|---|---|---:|---|---:|---|
| `overwater_bungalow.glb` | 热带茅草顶水上草亭（厚实分层棕榈茅草顶、竹木露台栏杆、下探 `-1.2m` 原木桩、檐下藤编暖灯） | `5.4 × 6.2 × 4.8` | 水面 `y=0`（顶 `+5.0m`） | 7k–12k | 藤灯/竹火把暖金 `Emissive` |
| `outrigger_canoe.glb` | 南太平洋传统木制舷外支架独木舟（主船身朝 `+X` + 侧边双横杆与浮木支架 + 木桨） | `4.8 × 0.85 × 2.15` | 吃水线 `y=0`（底 `-0.28m`） | 4k–7k | 雕纹暖木船身 |
| `coconut_palm_curved.glb` | 优雅斜探湖面的弯干椰子树（环纹细曲树干 + 羽状垂散椰叶 + 树顶椰果，向 `+X` 弯探） | `6.8 × 7.8 × 4.6` | 树根 `y=0` | 5k–8k | 羽状椰叶 `MASK` |
| `coconut_palm_tall.glb` | 高挺海岸椰子树（略微舒展摆姿，配羽状椰叶冠） | `5.2 × 9.6 × 5.0` | 树根 `y=0` | 5k–8k | 羽状椰叶 `MASK` |
| `coral_reef_rock.glb` | 热带蜂窝状浅灰褐珊瑚石灰岩礁（潮间带微湿光泽） | `2.8 × 1.25 × 2.3` | 水面 `y=0`（底 `-0.5m`） | 1.5k–3k | 多孔珊瑚岩法线 |
| `tropical_hibiscus_bush.glb` | 海岸热带阔叶灌木丛（深绿热带叶片 + 点缀少量暖红/橘黄扶桑花） | `2.2 × 1.45 × 2.1` | 底部 `y=0` | 2.5k–4.5k | 阔叶 `MASK` |
| `volcanic_island_peak.glb` | 远景尖耸热带火山岛轮廓（如莫雷阿岛锯齿绿山峰 + 裸露深色火山岩脊） | `46 × 24 × 18` | 底部 `y=0`（底 `-0.5m`） | 2.5k–4.5k | 深绿雨林与火山岩渐变 |
