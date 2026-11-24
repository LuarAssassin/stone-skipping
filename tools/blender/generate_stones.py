"""Build the 12 × 8 riverbank stone collection with Blender 4.5+/Cycles.

    blender -b --factory-startup --python-exit-code 1 -P tools/blender/generate_stones.py --
    blender -b --factory-startup --python-exit-code 1 -P tools/blender/generate_stones.py -- --seed 42 --variants 8 --output-root /tmp/river
    blender -b --factory-startup --python-exit-code 1 -P tools/blender/generate_stones.py -- --sheet-only

The sheet compositor uses Pillow, either in Blender or in the system python3.
Each specimen has its own random stream, independent of batch size and order.
"""

import argparse
import hashlib
import json
import math
import os
import random
import shutil
import struct
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path

if "--compose-sheet" not in sys.argv:
    import bmesh
    import bpy
    import numpy as np
    from mathutils import Vector, noise
    from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SEED = 20261122
SIZE = 512
TAU = 2 * math.pi
ASSETS = Path("public/assets/stones")
DELIVERY = Path("deliverables/stone-assets")
RARITY = {"common": "钝石", "usable": "寻常", "fine": "精良", "rare": "稀珍"}


@dataclass(frozen=True)
class Habit:
    feature: str
    label: str
    axes: tuple       # Offsets expressed as fractions of the lithology's tolerance.
    squareness: float
    taper: float      # Difference between the two shoulders, along the long axis.
    dome: float       # Change in meridian fullness, independent of the bounding box.
    wear: float
    strike: float     # Azimuth of the mineral plane, in degrees.
    vein_width: float


HABITS = (
    Habit("type",    "典型", (0., 0., 0.),         .00,  .02,  .00, 1.00,  12, 1.00),
    Habit("long",    "修长", (.64, -.78, .22),    -.30,  .23, -.14,  .72,  66,  .72),
    Habit("seam",    "露脉", (.02, .32, -.34),     .23, -.15,  .12, 1.13, -44, 1.56),
    Habit("rim",     "厚薄变体", (.64, .24, .91), .55,  .08, -.08,  .83,  86,  .86),
    Habit("round",   "阔圆", (-.48, .77, .14),   -.19, -.04,  .26,  .63, -73, 1.18),
    Habit("bank",    "偏磨", (.22, -.20, .54),    .32, -.28,  .04, 1.33,  39,  .68),
    Habit("current", "水纹", (.79, .66, -.10),   -.42,  .14, -.16,  .84, -24,  .82),
    Habit("pocket",  "蚀斑", (-.72, -.64, -.28), .36, -.12,  .23, 1.18,  -4, 1.29),
)


@dataclass(frozen=True)
class Rock:
    id: str
    name: str
    rarity: str
    lithology: str
    mm: tuple
    tolerance: float
    density: int
    grams: tuple
    drag: float
    wobble: float
    rough: tuple
    # Outline exponent, meridian exponents, outline wear, crown irregularity.
    form: tuple
    segments: int
    bands: int
    colors: tuple
    feel: str


ROCKS = (
    Rock("plunge_boulder", "重拳河卵石", "common", "含石英花岗岩", (76, 66, 48), .10, 2680, (220, 420), 1.48, .06, (.58, .72),
         (2.26, 2.05, 2.05, .060, .093), 36, 15, ("665448", "79513b", "545b59", "706452", "434951", "744535", "796d56", "554645"),
         "圆肩饱满，整块压在掌心，入水时沉沉一声，水花高高翻起。"),
    Rock("chunky_cobble", "圆滚鹅卵石", "common", "水磨杂色河卵石", (58, 52, 32), .08, 2650, (115, 160), 1.38, .08, (.48, .62),
         (2.10, 2.15, 2.05, .052, .075), 32, 15, ("69665c", "81634b", "566e69", "716058", "465b64", "6d4d3a", "807a62", "5a535e"),
         "指腹沿着圆背滑落，很难捏出平稳的出手角度。"),
    Rock("quartz_cobble", "白脉溪卵石", "common", "乳白石英脉卵石", (66, 54, 28), .09, 2660, (110, 175), 1.30, .09, (.46, .60),
         (2.17, 2.16, 2.14, .055, .070), 36, 15, ("344447", "534033", "364b58", "514c43", "2c393d", "553b32", "455242", "443e4c"),
         "转动时白脉绕过石背，拿起来才觉出厚度和分量，落水声沉。"),
    Rock("jagged_gravel", "棱角碎石", "common", "风化花岗碎砾", (74, 48, 21), .10, 2600, (75, 115), 1.28, .24, (.80, .92),
         (2.60, 2.70, 2.35, .085, .17), 36, 16, ("6b6860", "836747", "656e71", "79695b", "495760", "794c34", "797a66", "5c5353"),
         "断口顶手，两翼分量不匀，稍偏一点就容易侧翻。"),
    Rock("small_wafer", "小薄碎瓦片", "usable", "风化泥质砂岩", (56, 45, 5.5), .08, 2400, (15, 32), 1.04, .06, (.72, .84),
         (2.30, 2.75, 2.60, .080, .13), 32, 14, ("825b4c", "96543d", "76705d", "80514b", "5d5859", "894b35", "95745a", "664b49"),
         "轻薄得能在两指间轻轻一翻，贴水声清脆，后劲也收得快。"),
    Rock("standard", "河岸标准扁石", "usable", "水磨沉积河石", (80, 60, 9), .07, 2650, (52, 68), 1., 0., (.62, .75),
         (2.14, 2.05, 2.08, .055, .08), 36, 15, ("556763", "7a6550", "536b78", "70685b", "434f55", "6d5046", "797a6c", "565360"),
         "拇指贴住平缓石面，圆边恰好勾手，是一块顺手的练习石。"),
    Rock("red_sandstone", "丹砂河扁石", "usable", "赤铁矿层状砂岩", (82, 62, 8.2), .07, 2480, (46, 64), 1.02, .03, (.68, .80),
         (2.23, 2.20, 2.28, .059, .082), 36, 15, ("92523e", "a66341", "7f473c", "976449", "714339", "903f2d", "a07053", "84504a"),
         "赤褐细砂在指腹下略有涩感，圆边好捏，轻甩就能贴着水面弹起。"),
    Rock("thin_shale", "青灰薄页岩", "fine", "含云母层状页岩", (84, 64, 5.2), .07, 2550, (36, 48), .90, .02, (.55, .68),
         (2.32, 3.75, 3.52, .055, .080), 32, 20, ("495b63", "686056", "52667b", "56655f", "344454", "65534d", "6a7371", "494b5b"),
         "指甲能摸到层层错落的薄边，低掠水面时接连轻弹。"),
    Rock("heavy_basalt", "玄武重圆饼", "fine", "微孔玄武岩", (88, 85, 11), .06, 2950, (110, 145), .96, 0., (.58, .70),
         (2.08, 2.13, 2.09, .024, .046), 36, 16, ("454b49", "574a40", "475461", "56524b", "303d49", "504039", "58615b", "413e49"),
         "石面细密有孔，圆饼压手；送足力气，第一跳就能拉得很长。"),
    Rock("willow_leaf", "柳叶长扁石", "fine", "流纹浅绿溪石", (104, 44, 7.5), .07, 2650, (44, 60), .93, .03, (.52, .64),
         (2.24, 2.50, 2.25, .043, .087), 40, 14, ("68796e", "84745a", "62817e", "757a65", "465f60", "736451", "829082", "586c71"),
         "一端丰圆，一端顺着石纹收尖，侧倾出手便能带出一道弧线。"),
    Rock("jade_river_flat", "润玉青溪扁石", "fine", "云雾状青玉质溪石", (88, 74, 6.8), .05, 2720, (56, 76), .86, .01, (.42, .54),
         (2.25, 2.26, 2.22, .036, .047), 40, 15, ("456f60", "687755", "376157", "558377", "304f4e", "52664a", "6e8d73", "42666d"),
         "阔扁的青绿石面水磨得细润，圆肩贴住指腹，掠水时走得稳。"),
    Rock("master_disc", "溪磨黑曜圆盘", "rare", "金褐细脉黑曜石", (92, 88, 6.2), .04, 2750, (62, 90), .78, 0., (.38, .48),
         (2.00, 2.05, 2.12, .006, .012), 40, 16, ("303d40", "493c34", "344958", "425044", "293441", "493937", "505554", "383748"),
         "双面微鼓，细边圆滑，捏在指间几乎感不到偏心，适合冲击极限纪录。"),
)


def require(ok, message):
    if not ok:
        raise ValueError(message)


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def fresh_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    require(scene.unit_settings.system == "METRIC" and scene.unit_settings.scale_length == 1., "Invalid scene units")
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.seed = 17
    scene.render.bake.margin = 8
    return scene


def smoothstep(low, high, value):
    t = max(0., min(1., (value - low) / (high - low)))
    return t * t * (3 - 2 * t)


def n3(x, y, z):
    return noise.noise(Vector((x, y, z)), noise_basis="PERLIN_NEW")


def specimen_habit(rock, variant, rng):
    """Use the eight authored habits first; later finds recombine them continuously."""
    def palette(i):
        code = rock.colors[i]
        return tuple(int(code[j:j+2], 16)/255 for j in (0, 2, 4))

    if variant <= len(HABITS):
        return HABITS[variant-1], palette(variant-1)
    a, b = rng.sample(range(len(HABITS)), 2)
    first, second = HABITS[a], HABITS[b]
    weight = rng.uniform(.24, .70)
    def blend(x, y):
        return x+(y-x)*weight
    mixed = replace(first, axes=tuple(map(blend, first.axes, second.axes)),
                    squareness=blend(first.squareness, second.squareness),
                    taper=blend(first.taper, second.taper), dome=blend(first.dome, second.dome),
                    wear=blend(first.wear, second.wear), strike=rng.uniform(-90, 90),
                    vein_width=blend(first.vein_width, second.vein_width))
    return mixed, tuple(map(blend, palette(a), palette(b)))


class Specimen:
    def __init__(self, rock, variant, seed, attempt=0):
        self.rock = rock
        self.variant = variant
        self.id = f"{rock.id}_{variant:02d}"
        stream = f"{seed}/{self.id}"
        rng = random.Random(stream if attempt == 0 else f"{stream}/{attempt}")
        self.habit, self.color = specimen_habit(rock, variant, random.Random(stream+"/habit"))
        habit = self.habit
        self.feature = habit.feature
        # Near-axial discs retain their balance; discarded gravel and wafers can be cut much deeper.
        response = {"master_disc": .115, "heavy_basalt": .43, "jade_river_flat": .72}.get(rock.id, 1.)
        outline, p, q, wear, crown = rock.form
        fullness = habit.dome*response+rng.uniform(-.12, .12)
        self.form = (outline+habit.squareness*response, p+fullness, q+fullness*.72,
                     wear*habit.wear, crown)
        self.taper = habit.taper*response
        self.relief_scale = habit.wear*rng.uniform(.87, 1.13)
        self.chip = {"seam": .09, "bank": .22, "pocket": .13}.get(self.feature, 0.)*response
        self.pocket_depth = (.18 if self.feature == "pocket" else .035)*response
        self.pocket = (rng.uniform(-.55,.55), rng.uniform(-.55,.55), rng.uniform(.13,.24))
        self.shoulder = rng.uniform(-1.05, 1.05) + (math.pi if rng.random() < .5 else 0.)
        self.phase = [rng.uniform(-math.pi, math.pi) for _ in range(8)]
        self.cleft = {"seam": .10, "rim": .065, "bank": .14, "pocket": .08}.get(self.feature, .022)
        self.offset = tuple(rng.uniform(1, 15) for _ in range(3))
        family_bearing = random.Random(f"{seed}/{rock.id}/bedding").uniform(-32, 32)
        self.strike = math.radians(habit.strike + family_bearing + rng.uniform(-3., 3.))
        self.vein_shift = rng.uniform(-.28, .28)
        self.dip = rng.uniform(.28, .75)
        self.branch_gap = rng.uniform(.18, .39)
        self.branch_angle = rng.choice((-1, 1))*rng.uniform(.30, .72)
        self.wear = rng.uniform(.83, 1.18)
        self.curve = rng.uniform(.14, .26) + abs(habit.taper)*.95
        if self.feature in ("seam", "bank", "pocket"):
            self.curve *= -1
        self.cuts = []
        for i in range(7):
            theta = TAU * (i + rng.uniform(-.22, .22)) / 7
            self.cuts.append((math.cos(theta), math.sin(theta), rng.uniform(.76, 1.04)))
        self.fractures = []
        for side in (-1, 1):
            for i in range(4):
                theta = TAU * (i + rng.uniform(-.28, .28)) / 4
                slope = rng.uniform(.28, .80)
                self.fractures.append((slope * math.cos(theta), slope * math.sin(theta),
                                       side, rng.uniform(.76, .99)))
        # Fractions of each archetype's stated tolerance, independently per axis.
        relative = list(habit.axes)
        if self.feature == "rim":
            if rock.id in ("master_disc", "small_wafer", "thin_shale", "willow_leaf", "jade_river_flat"):
                relative[2] *= -1
            if rock.id in ("heavy_basalt", "chunky_cobble", "standard", "red_sandstone"):
                relative[:2] = (.04, -.14)
        if rock.id == "thin_shale" and self.feature == "pocket":
            # The compact find keeps an extra lamina below the weathered upper surface.
            relative[2] = .77
        length, width, thickness = (d*(1+rock.tolerance*(f+rng.uniform(-.065,.065)))
                                    for d, f in zip(rock.mm, relative))
        self.mm = (length, min(width, .995*length), thickness)

    def point(self, theta, latitude, high):
        rock = self.rock
        outline, p, q, wear, crown = self.form
        k = rock.id
        ph = self.phase
        t = math.sin(latitude)
        r = max(0., 1 - abs(t) ** p) ** (1 / q)
        c, s = math.cos(theta), math.sin(theta)
        rim = (abs(c) ** outline + abs(s) ** outline) ** (-1 / outline)
        harmonics = (.61 * math.cos(3*theta + ph[0]) + .34 * math.sin(4*theta + ph[1])
                     + .28 * math.cos(5*theta + ph[2]) + .16 * math.cos(8*theta + ph[3]))
        rim *= 1 + wear * self.wear * harmonics
        if k in ("jagged_gravel", "small_wafer", "thin_shale"):
            boundary = min(d / max(.001, nx*c + ny*s) for nx, ny, d in self.cuts)
            angular = {"jagged_gravel": .95, "small_wafer": .64, "thin_shale": .63}[k]
            rim = (1 - angular) * rim + angular * boundary
            bite = math.atan2(math.sin(theta - ph[4]), math.cos(theta - ph[4]))
            rim *= 1 - (.18 if k == "jagged_gravel" else .073) * self.wear * math.exp(-(bite/.16)**2)
        if self.chip:
            # The face exposed to the current is planed back; the sheltered shoulder stays rounded.
            facing = math.cos(theta-self.shoulder)
            plane = (1-self.chip)/max(.01, facing)
            rim = min(rim, plane)
        if k == "jade_river_flat":
            # Some specimens have a cleft between two soft shoulders. Others have an
            # uninterrupted oval rim. Its bearing follows this stone's upstream face.
            delta = math.atan2(math.sin(theta-self.shoulder), math.cos(theta-self.shoulder))
            rim *= 1-self.cleft*math.exp(-(delta/.31)**2)
        if k == "thin_shale":
            # Several overlapping sheets. Each lip projects beyond the undercut below it.
            for bed in (-.48, -.16, .16, .48):
                exposure = math.cos(theta-ph[0]+bed*6) + .31*math.sin(3*theta+ph[2])
                depth = .008 + .080*smoothstep(-.62, .86, exposure)
                rim += depth * (smoothstep(bed-.07, bed-.012, t) - smoothstep(bed, bed+.06, t))
            rim += .058 * t * math.cos(theta - ph[1])
        x, y = r * rim * c, r * rim * s
        y *= 1-self.taper*x
        if k == "willow_leaf":
            y = y * (1 - .38*x - .12*x*x) + self.curve * (x*x - .38)
        if k in ("chunky_cobble", "plunge_boulder", "quartz_cobble"):
            y *= 1 - (.13 if k == "chunky_cobble" else .08) * x
        warp = n3(x*1.65 + ph[1], y*1.65 + ph[2], t*.8 + ph[3])
        z = t * (1 + crown * (.8*warp + .5*x*math.cos(ph[4]) + .45*y*math.sin(ph[5])))
        z += crown * (.72 * (x*x - y*y) + .42*x*y + .36*warp)
        px, py, breadth = self.pocket
        z -= self.pocket_depth*smoothstep(.20, .75, t)*math.exp(-((x-px)**2+(y-py)**2)/breadth**2)
        if k == "jagged_gravel":
            # Intersect the weathered body with oblique break planes on both faces.
            for nx, ny, side, d in self.fractures:
                depth = d - nx*x - ny*y
                z = min(z, depth) if side > 0 else max(z, -depth)
        if k == "thin_shale":
            # A missing upper lamina exposes a lower terrace even in the plan view.
            seam = .75*x + .60*y + .13*warp + .12*math.sin(4*y+ph[1])
            z -= smoothstep(.15, .75, t) * .24 * smoothstep(.17, .22, seam)
        if high:
            ox, oy, oz = self.offset
            broad = n3(4*x+ox, 4*y+oy, 3*t+oz)
            grain = n3(31*x+ox, 31*y+oy, 12*t+oz)
            relief = {"master_disc": .0018, "jade_river_flat": .0035, "quartz_cobble": .008,
                      "jagged_gravel": .034, "thin_shale": .022, "small_wafer": .024,
                      "red_sandstone": .014, "plunge_boulder": .017}.get(k, .010)
            displacement = relief * self.relief_scale * (.76*broad + .24*grain)
            if k in ("heavy_basalt", "jagged_gravel"):
                cell = noise.voronoi(Vector((13*x+ox, 13*y+oy, 5*t+oz)))[0]
                if k == "heavy_basalt":
                    displacement -= .029 * (1 - smoothstep(.18, .46, cell[0]))
                else:
                    displacement -= .016 * (1 - smoothstep(.015, .16, cell[1]-cell[0]))
            x *= 1 + displacement
            y *= 1 + displacement
            z += t * displacement
        return (x, y, z)


def surface(specimen, factor):
    rock = specimen.rock
    if rock.id == "thin_shale":
        levels = [math.asin(t) for t in (-1, -.94, -.76, -.56, -.49, -.42, -.24, -.17, -.10,
                                         .08, .15, .22, .40, .47, .54, .74, .91, 1)]
    else:
        levels = [math.pi * (j / rock.bands - .5) for j in range(rock.bands+1)]
    lats = [a+(b-a)*i/factor for a, b in zip(levels, levels[1:]) for i in range(factor)]
    lats.append(levels[-1])
    count = rock.segments * factor
    high = factor > 1
    # A single vertex at each pole; shared geometric vertices across the meridian.
    points = [specimen.point(0., lats[0], high)]
    for lat in lats[1:-1]:
        points.extend(specimen.point(TAU*i/count, lat, high) for i in range(count))
    points.append(specimen.point(0., lats[-1], high))
    faces = []
    for i in range(count):
        n = (i+1) % count
        faces.append((0, 1+n, 1+i))
        for j in range(len(lats)-3):
            a, b = 1+j*count+i, 1+j*count+n
            if (i+j) % 2:
                faces.extend(((a, b, a+count), (b, b+count, a+count)))
            else:
                faces.extend(((a, b, b+count), (a, b+count, a+count)))
        end = len(points)-1-count
        faces.append((end+i, end+n, len(points)-1))
    return np.array(points), faces


def mesh_object(name, points, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points.tolist(), [], faces)
    mesh.update()
    mesh.polygons.foreach_set("use_smooth", np.ones(len(faces), dtype=bool))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def unwrap(low, stone):
    """Smart-project both caps; unfold the chipped equator into four short strips.

    Projecting a horizontal shale ledge on its own leaves a large empty ring in the
    atlas. Keeping adjacent ledges together also makes the bedding continuous.
    """
    mesh = low.data
    count = stone.rock.segments
    last = (len(mesh.vertices)-2)//count + 1
    ring = [0] + [1+i//count for i in range(len(mesh.vertices)-2)] + [last]
    lower = 3 if stone.rock.id == "thin_shale" else round(last*.32)
    upper = last-lower
    side = []
    for face in mesh.polygons:
        levels = [ring[i] for i in face.vertices]
        is_cap = max(levels) <= lower or min(levels) >= upper
        face.select = is_cap
        if not is_cap:
            side.append(face.index)
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(83), island_margin=.03)
    bpy.ops.object.mode_set(mode="OBJECT")
    uv = mesh.uv_layers.active.data
    xyz = np.array([v.co[:] for v in mesh.vertices])[1:-1].reshape(last-1, count, 3)
    equator = xyz[last//2-1]
    perimeter = np.r_[0, np.cumsum(np.linalg.norm(np.roll(equator, -1, axis=0)-equator, axis=1))]
    meridian = np.r_[0, np.cumsum(np.linalg.norm(np.diff(xyz, axis=0), axis=2).mean(axis=1))]
    for index in side:
        face = mesh.polygons[index]
        columns = [(v-1) % count for v in face.vertices]
        if max(columns)-min(columns) > 1:
            columns = [count if c == 0 else c for c in columns]
        quarter = min(columns)*4//count
        for corner, v, col in zip(face.loop_indices, face.vertices, columns):
            uv[corner].uv = (2+quarter+perimeter[col], meridian[ring[v]-1])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=.03)
    bpy.ops.object.mode_set(mode="OBJECT")


def make_meshes(rock, variant, seed):
    for attempt in range(64):
        specimen = Specimen(rock, variant, seed, attempt)
        points, faces = surface(specimen, 1)
        scale = np.array(specimen.mm) * .001 / np.ptp(points, axis=0)
        low = mesh_object(specimen.id, points*scale, faces)
        bm = bmesh.new()
        try:
            bm.from_mesh(low.data)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            grams = abs(bm.calc_volume())*rock.density*1000
            bm.to_mesh(low.data)
        finally:
            bm.free()
        if rock.grams[0] <= grams <= rock.grams[1]:
            break
        mesh = low.data
        bpy.data.objects.remove(low, do_unlink=True)
        bpy.data.meshes.remove(mesh)
    else:
        raise ValueError(f"{specimen.id}: could not form a specimen in the mass envelope")
    select_only(low)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.origin_set(type="ORIGIN_CENTER_OF_VOLUME", center="MEDIAN")
    displacement = np.array(low.location)
    low.location = (0, 0, 0)
    unwrap(low, specimen)
    fine, triangles = surface(specimen, 6)
    high = mesh_object(specimen.id + "_sculpt", fine*scale-displacement, triangles)
    return specimen, low, high


def linear(rgb):
    return tuple(c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in rgb)


class Shader:
    """Small socket helpers for the source material. All distances are in stone space."""

    def __init__(self, material):
        self.tree = material.node_tree

    def node(self, kind, label):
        node = self.tree.nodes.new(kind)
        node.label = label
        return node

    def input(self, socket, source):
        if isinstance(source, bpy.types.NodeSocket):
            self.tree.links.new(source, socket)
        else:
            socket.default_value = source

    def math(self, op, a, b, label=""):
        node = self.node("ShaderNodeMath", label)
        node.operation = op
        self.input(node.inputs[0], a)
        self.input(node.inputs[1], b)
        return node.outputs[0]

    def vector(self, op, value, other):
        node = self.node("ShaderNodeVectorMath", op)
        node.operation = op
        self.input(node.inputs[0], value)
        self.input(node.inputs[1], other)
        return node.outputs["Value" if op in ("DOT_PRODUCT", "DISTANCE") else "Vector"]

    def noise(self, vector, scale, detail, label, distortion=0.):
        node = self.node("ShaderNodeTexNoise", label)
        self.input(node.inputs["Vector"], vector)
        for name, value in (("Scale", scale), ("Detail", detail), ("Roughness", .62), ("Distortion", distortion)):
            node.inputs[name].default_value = value
        return node.outputs["Fac"]

    def voronoi(self, vector, scale, label):
        node = self.node("ShaderNodeTexVoronoi", label)
        self.input(node.inputs["Vector"], vector)
        node.inputs["Scale"].default_value = scale
        return node.outputs["Distance"]

    def ramp(self, source, stops, label):
        node = self.node("ShaderNodeValToRGB", label)
        items = node.color_ramp.elements
        for i, (pos, value) in enumerate(stops):
            element = items[i] if i < 2 else items.new(pos)
            element.position = pos
            rgb = (value, value, value) if isinstance(value, (int, float)) else linear(value)
            element.color = (*rgb, 1)
        node.color_ramp.interpolation = "EASE"
        self.input(node.inputs[0], source)
        return node.outputs[0]

    def mix(self, factor, a, b):
        node = self.node("ShaderNodeMixRGB", "Mineral inclusion")
        self.input(node.inputs[0], factor)
        self.input(node.inputs[1], a)
        self.input(node.inputs[2], b)
        return node.outputs[0]


def material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat, next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def dry_tone(rgb, gain=1., ceiling=.450):
    # Bound perceived brightness while retaining the red of hematite and the green of jade.
    y = sum(c*w for c, w in zip(rgb, (.2126, .7152, .0722)))
    scale = max(.168, min(ceiling, y*gain))/y
    return tuple(min(1., c*scale) for c in rgb)


def mineral_veins(g, stone, coord, cloud):
    k = stone.rock.id
    angle = stone.strike
    if k == "willow_leaf":
        angle *= .17
    def plane(bearing):
        return g.vector("DOT_PRODUCT", coord, (math.sin(bearing), math.cos(bearing), stone.dip))
    def band(field, width):
        distance = g.math("ABSOLUTE", field, 0)
        return g.ramp(distance, [(0., 1.), (.53*width, .96), (width, .48), (1.65*width, 0.)],
                      "Mineral seam with an alteration halo")
    phase = plane(angle)
    warp = g.math("MULTIPLY", g.math("SUBTRACT", cloud, .5), .35 if k == "quartz_cobble" else .63)
    seam = g.math("ADD", g.math("ADD", phase, warp), stone.vein_shift)
    width = (.060 if k == "quartz_cobble" else .021)*stone.habit.vein_width
    mask = band(seam, width)
    if k == "quartz_cobble":
        # One or two through-going filled fractures, with an oblique subsidiary stringer
        # that tapers away in the matrix. All are 3D fields and continue over the rim.
        if stone.feature in ("seam", "round", "current"):
            parallel = g.math("ADD", seam, stone.branch_gap)
            mask = g.math("MAXIMUM", mask, band(parallel, width*.59))
        cross = g.math("ADD", plane(angle+stone.branch_angle), warp)
        branch = band(g.math("ADD", cross, stone.vein_shift+.12), width*.28)
        taper = g.ramp(cloud, [(.30, .05), (.58, .84)], "Discontinuous quartz stringer")
        mask = g.math("MAXIMUM", mask, g.math("MULTIPLY", branch, taper))
    return mask


def weathered_surface(g, stone, body, coord, pos, cloud):
    """Local deposits and abrasion vary independently of the matrix colour and silhouette."""
    feature, k = stone.feature, stone.rock.id
    delicate = .48 if k in ("master_disc", "jade_river_flat") else 1.
    if feature == "bank":
        mask = g.ramp(cloud, [(.46, 0.), (.55, .16), (.68, .80*delicate)], "Patchy iron oxide rind")
        tint = (.407, .267, .201) if k != "jade_river_flat" else (.402, .379, .259)
    elif feature == "current":
        rotate = g.node("ShaderNodeVectorRotate", "Orientation of current scratches")
        rotate.rotation_type = "Z_AXIS"
        rotate.inputs["Angle"].default_value = 0. if k == "willow_leaf" else stone.strike
        g.input(rotate.inputs["Vector"], pos)
        stretched = g.vector("MULTIPLY", rotate.outputs[0], (.30, 7.6, 2.5))
        striae = g.noise(stretched, 5.1, 2.7, "Water-polished streaks", .65)
        mask = g.ramp(striae, [(.42, 0.), (.59, .15), (.71, .72*delicate)], "Pale streaks")
        tint = dry_tone(stone.color, 1.38)
    elif feature == "pocket":
        px, py, breadth = stone.pocket
        xy = g.vector("MULTIPLY", coord, (2000/(24*stone.mm[0]), 2000/(24*stone.mm[1]), 0.))
        distance = g.vector("DISTANCE", xy, (px, py, 0.))
        rind = g.noise(pos, 8.3, 3., "Granular edge of the weathering rind", .38)
        broken = g.math("ADD", distance, g.math("MULTIPLY", g.math("SUBTRACT", cloud, .50), .64))
        broken = g.math("ADD", broken, g.math("MULTIPLY", g.math("SUBTRACT", rind, .5), .19))
        mask = g.ramp(broken, [(0., .66*delicate), (breadth*.85, .46*delicate),
                              (breadth*1.65, 0.)], "Bleached margin of a shallow erosion pocket")
        mask = g.math("MULTIPLY", mask, g.ramp(rind, [(.29, .24), (.69, 1.)], "Broken patina"))
        tint = dry_tone(tuple(c+.09 for c in stone.color), 1.18)
    else:
        return body
    return g.mix(mask, body, (*linear(tint), 1))


def rock_material(stone):
    rock = stone.rock
    k = rock.id
    mat, bsdf = material(stone.id + "_outcrop")
    g = Shader(mat)
    local = g.node("ShaderNodeTexCoord", "Metric 3D coordinates").outputs["Object"]
    coord = g.vector("MULTIPLY", local, (24, 24, 24))
    pos = g.vector("ADD", coord, stone.offset)
    cloud = g.noise(pos, 2.5, 4., "Weathering and mineral clouds", .25)
    grain = g.noise(pos, 53/stone.relief_scale, 2., "Fine sand and crystalline grain")
    medium = g.noise(pos, 13, 3., "Groundmass")
    vein = mineral_veins(g, stone, coord, cloud)
    cell = g.voronoi(pos, 31 if k == "heavy_basalt" else 38, "Vesicles / mineral grains")
    pits = g.ramp(cell, [(.12, 1.), (.24, .84), (.40, 0.)], "Recessed pores")
    crystals = g.ramp(medium, [(.47, 0.), (.61, .10), (.72, .90), (.81, 1.)], "Mineral grains")
    if k in ("plunge_boulder", "jagged_gravel"):
        habit = g.vector("MULTIPLY", pos, (1.32, .73, 1.04))
        feldspar = g.voronoi(habit, 22, "Elongated feldspar crystals")
        pale = g.ramp(feldspar, [(.15, 1.), (.27, .90), (.38, .04), (.43, 0.)], "Pale crystalline inclusions")
        crystals = g.math("MAXIMUM", pale, crystals)
    if k == "heavy_basalt":
        bubbles = g.voronoi(pos, 15, "Larger vesicles")
        sparse = g.ramp(bubbles, [(.11, 1.), (.23, .68), (.37, 0.)], "Walls of broken gas bubbles")
        porosity = g.ramp(cloud, [(.30, .22), (.65, 1.)], "Clusters of pinholes")
        pits = g.math("MAXIMUM", sparse, g.math("MULTIPLY", pits, porosity))
    # Some bands are strongly directional: shale has bedding planes, willow has flow lineation.
    if k in ("willow_leaf", "thin_shale", "small_wafer", "standard", "red_sandstone", "jade_river_flat"):
        if k == "willow_leaf":
            u = g.vector("MULTIPLY", pos, (.31, 7.3, 2.1))
            bands = g.noise(u, 3.4, 3.5, "Longitudinal fluvial streaks", .58)
        elif k == "thin_shale":
            # Near-horizontal beds intersect the chipped top obliquely. Narrow, broken
            # partings read differently from the broad stochastic fields in sandstone.
            strike = stone.strike
            normal = (.41*math.cos(strike), .41*math.sin(strike), 4.6)
            bedding = g.vector("DOT_PRODUCT", coord, normal)
            bedding = g.math("ADD", bedding, g.math("MULTIPLY", cloud, .32))
            wave = g.math("SINE", g.math("MULTIPLY", bedding, 60), 0)
            bands = g.ramp(wave, [(.35, .25), (.78, .45), (.95, .95)], "Broken mica laminae")
        elif k == "red_sandstone":
            normal = (.73*math.sin(stone.strike), .73*math.cos(stone.strike), 2.3)
            bed = g.vector("DOT_PRODUCT", coord, normal)
            bed = g.math("ADD", bed, g.math("MULTIPLY", cloud, .30))
            # Unequal bands of fine ferruginous sediment bend over the crown.
            wave = g.math("SINE", g.math("MULTIPLY", bed, 16/stone.habit.vein_width), 0.)
            bands = g.ramp(wave, [(0., .12), (.37, .30), (.80, .73), (.97, .92)], "Hematite-rich beds")
        elif k == "jade_river_flat":
            fog = g.vector("MULTIPLY", pos, (.88, 1.45, 1.15))
            bands = g.noise(fog, 1.9, 4., "Clouds of pale green mineral", 1.65)
        else:
            rotation = g.node("ShaderNodeVectorRotate", "Strike of sediment")
            rotation.rotation_type = "Z_AXIS"
            g.input(rotation.inputs["Vector"], pos)
            rotation.inputs["Angle"].default_value = stone.strike
            bed_pos = g.vector("MULTIPLY", rotation.outputs[0], (.60, 3.40, 1.75))
            bands = g.noise(bed_pos, 3.7, 3.2, "Irregular sediment lenses", .82)
    else:
        bands = medium
    bed_weight = {"thin_shale": .10, "willow_leaf": .44, "red_sandstone": .17, "jade_river_flat": .48}.get(k, .27)
    matrix = g.math("ADD", g.math("MULTIPLY", cloud, .69-bed_weight), g.math("MULTIPLY", medium, .31))
    matrix = g.math("ADD", matrix, g.math("MULTIPLY", bands, bed_weight))
    # Reserve headroom in pale jade for its celadon clouds and current scratches.
    matrix_tone = dry_tone(stone.color, ceiling=.40) if k == "jade_river_flat" else stone.color
    def tone(gain):
        return dry_tone(matrix_tone, gain)
    gains = (.88, .94, 1., 1.05, 1.12) if k == "master_disc" else (.68, .84, 1.01, 1.17, 1.28)
    body = g.ramp(matrix, [(pos, tone(gain)) for pos, gain in zip((.20, .39, .53, .65, .80), gains)],
                  "Dry matrix / weathered rind")
    if k == "red_sandstone":
        oxide = g.math("MULTIPLY", bands, .43)
        body = g.mix(oxide, body, (*linear(dry_tone((.52, .244, .166), .94)), 1))
    if k == "jade_river_flat":
        fog = g.ramp(bands, [(.30, 0.), (.47, .07), (.60, .53), (.73, .86)], "Celadon clouding")
        celadon = dry_tone(tuple(c+s for c,s in zip(stone.color, (.14,.17,.14))))
        body = g.mix(fog, body, (*linear(celadon), 1))
    body = weathered_surface(g, stone, body, coord, pos, cloud)
    # In granite the light feldspar crystals and dark mafic minerals coexist. In basalt the
    # dark features are cavities; in obsidian the occasional inclusion is an iron-gold thread.
    fleck_amount = {"plunge_boulder": .95, "jagged_gravel": .85, "thin_shale": .43,
                    "master_disc": .065, "heavy_basalt": .22, "jade_river_flat": .075,
                    "quartz_cobble": .13, "red_sandstone": .24}.get(k, .39)
    body = g.mix(g.math("MULTIPLY", crystals, fleck_amount), body, (*linear((.458, .448, .424)), 1))
    hole_amount = {"heavy_basalt": .90, "plunge_boulder": .64, "jagged_gravel": .61,
                   "master_disc": .065, "jade_river_flat": .085, "quartz_cobble": .18}.get(k, .25)
    body = g.mix(g.math("MULTIPLY", pits, hole_amount), body, (*linear(tone(.54)), 1))
    vein_amount = {"quartz_cobble": 1., "chunky_cobble": .10, "master_disc": .18, "heavy_basalt": .13,
                   "thin_shale": .17, "willow_leaf": .27, "jade_river_flat": .17, "red_sandstone": .10}.get(k, .32)
    if stone.feature == "seam":
        vein_amount = min(1., vein_amount*1.65)
    mineral = (.462, .452, .425)
    if k == "quartz_cobble":
        mineral = (.590, .583, .568)
    elif k == "master_disc":
        mineral = (.405,.422,.426) if stone.feature in ("seam","round","pocket") else (.425,.365,.275)
    body = g.mix(g.math("MULTIPLY", vein, vein_amount), body, (*linear(mineral), 1))
    if k == "thin_shale":
        # A fresh edge exposes the section through the beds. Use physical height so
        # the stripes follow the projecting laminae around the entire specimen.
        xyz = g.node("ShaderNodeSeparateXYZ", "Bedding elevation")
        g.input(xyz.inputs[0], local)
        elevation = g.math("ADD", .5, g.math("MULTIPLY", xyz.outputs["Z"], 1000/stone.mm[2]))
        elevation = g.math("ADD", elevation, g.math("MULTIPLY", g.math("SUBTRACT", cloud, .5), .11))
        strata = g.ramp(elevation, [(t, tone(v)) for t, v in (
            (0., .74), (.18, .76), (.255, 1.45), (.30, .70), (.37, .75), (.42, 1.43),
            (.48, .71), (.54, .74), (.59, 1.45), (.65, .70), (.70, .74), (.75, 1.42),
            (.81, .77), (1., .94))], "Silt and mica at the broken edge")
        xy = g.vector("MULTIPLY", local, (2000/stone.mm[0], 2000/stone.mm[1], 0))
        radius = g.node("ShaderNodeVectorMath", "Distance to worn perimeter")
        radius.operation = "LENGTH"
        g.input(radius.inputs[0], xy)
        edge = g.ramp(radius.outputs["Value"], [(.79, 0.), (.94, .93)], "Where beds break the surface")
        body = g.mix(edge, body, strata)
    g.input(bsdf.inputs["Base Color"], body)
    rmin, rmax = rock.rough
    micro = g.math("ADD", g.math("MULTIPLY", grain, .58), g.math("MULTIPLY", medium, .42))
    middle = (rmin+rmax)/2 + .14*(rmax-rmin)*(stone.relief_scale-1.)
    spread = .36*(rmax-rmin)
    rough = g.ramp(micro, [(.22, middle-spread), (.78, middle+spread)], "Dry local roughness")
    g.input(bsdf.inputs["Roughness"], rough)
    height = g.math("ADD", g.math("MULTIPLY", medium, .45), g.math("MULTIPLY", grain, .28))
    height = g.math("ADD", height, g.math("MULTIPLY", bands, .065 if k == "thin_shale" else .22))
    height = g.math("SUBTRACT", height, g.math("MULTIPLY", pits, hole_amount))
    height = g.math("ADD", height, g.math("MULTIPLY", vein, .13))
    bump = g.node("ShaderNodeBump", "Crystal relief, bedding and pinholes in metres")
    distances = {"plunge_boulder": .00029, "jagged_gravel": .00040, "thin_shale": .00023,
                 "heavy_basalt": .00036, "master_disc": .000048, "jade_river_flat": .000070,
                 "red_sandstone": .00022, "quartz_cobble": .00012}
    bump.inputs["Distance"].default_value = distances.get(k, .00018)*stone.relief_scale
    bump.inputs["Strength"].default_value = .75
    g.input(bump.inputs["Height"], height)
    g.input(bsdf.inputs["Normal"], bump.outputs["Normal"])
    bsdf.inputs["Metallic"].default_value = 0
    return mat


def bake_and_export(stone, low, high, path):
    high.data.materials.append(rock_material(stone))
    mat, bsdf = material(stone.id + "_riverstone")
    mat.use_backface_culling = True
    low.data.materials.append(mat)
    g = Shader(mat)
    baked = {}
    select_only(low)
    high.select_set(True)
    half_h = stone.mm[2] * .0005
    for channel, kind in (("BaseColor", "DIFFUSE"), ("Normal", "NORMAL"), ("Roughness", "ROUGHNESS")):
        img = bpy.data.images.new(stone.id+"_"+channel, width=SIZE, height=SIZE, alpha=False,
                                  is_data=channel != "BaseColor")
        tex = g.node("ShaderNodeTexImage", channel)
        tex.image = img
        mat.node_tree.nodes.active = tex
        options = {"pass_filter": {"COLOR"}} if kind == "DIFFUSE" else {}
        result = bpy.ops.object.bake(type=kind, use_selected_to_active=True, use_cage=False,
                                     cage_extrusion=min(.0016, half_h*.29),
                                     max_ray_distance=min(.0048, half_h*.83), margin=8,
                                     normal_space="TANGENT", normal_g="POS_Y", **options)
        require("FINISHED" in result, f"{stone.id}: {channel} bake failed")
        baked[channel] = tex
    g.input(bsdf.inputs["Base Color"], baked["BaseColor"].outputs["Color"])
    normal = g.node("ShaderNodeNormalMap", "OpenGL tangent space")
    g.input(normal.inputs["Color"], baked["Normal"].outputs["Color"])
    g.input(bsdf.inputs["Normal"], normal.outputs["Normal"])
    g.input(bsdf.inputs["Roughness"], baked["Roughness"].outputs["Color"])
    bsdf.inputs["Metallic"].default_value = 0.
    bpy.data.objects.remove(high, do_unlink=True)
    select_only(low)
    formats = bpy.ops.export_scene.gltf.get_rna_type().properties["export_image_format"].enum_items
    require("WEBP" in formats.keys(), "The v2 collection requires the glTF WebP exporter")
    quality = 98 if stone.rock.id == "master_disc" else 94
    while True:
        status = bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                   export_yup=True, export_apply=True, export_normals=True, export_tangents=True,
                   export_texcoords=True, export_materials="EXPORT", export_image_format="WEBP",
                   export_image_quality=quality, export_animations=False, export_cameras=False, export_lights=False)
        require("FINISHED" in status, f"{stone.id}: GLB export failed")
        if path.stat().st_size <= 240_000 or quality <= 78:
            break
        quality -= 4


def geometry(bm):
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    xyz = np.array([v.co[:] for v in bm.verts], dtype=np.float64)
    triangles = np.array([[v.index for v in f.verts] for f in bm.faces])
    p, q, r = xyz[triangles].transpose(1, 0, 2)
    six_vol = np.einsum("ij,ij->i", p, np.cross(q, r))
    centroid = (six_vol[:, None]*(p+q+r)).sum(axis=0)/(4*six_vol.sum())
    signed = bm.calc_volume(signed=True)
    non_manifold = sum(not e.is_manifold for e in bm.edges)
    bad_winding = sum(not e.is_contiguous for e in bm.edges)
    degenerate = sum(f.calc_area() <= 1e-14 for f in bm.faces)
    tree = BVHTree.FromPolygons(xyz.tolist(), triangles.tolist(), all_triangles=True)
    shared = [set(t) for t in triangles]
    intersections = sum(i < j and shared[i].isdisjoint(shared[j]) for i, j in tree.overlap(tree))
    # A closed single spherical shell has Euler characteristic 2; also count components.
    visited = {bm.verts[0]}
    stack = list(visited)
    while stack:
        v = stack.pop()
        for e in v.link_edges:
            w = e.other_vert(v)
            if w not in visited:
                visited.add(w)
                stack.append(w)
    valid_shell = len(visited) == len(bm.verts) and len(bm.verts)-len(bm.edges)+len(bm.faces) == 2
    require(valid_shell and not (non_manifold or bad_winding or degenerate or intersections),
            "Open, disconnected, degenerate or self-intersecting mesh")
    require(signed > 0 and math.isclose(six_vol.sum()/6, signed, rel_tol=.00001), "Inconsistent outward winding")
    return {"dimensionsM": np.ptp(xyz, axis=0).tolist(), "volumeM3": abs(bm.calc_volume()),
            "centroidM": centroid.tolist(), "centroidErrorMm": float(np.linalg.norm(centroid)*1000),
            "triangles": len(triangles), "vertices": len(bm.verts), "closedManifold": True,
            "outwardNormals": True, "connectedShell": True, "nonManifoldEdges": non_manifold,
            "windingErrors": bad_winding, "degenerateFaces": degenerate, "selfIntersections": intersections}


def measure_low(low):
    require(tuple(low.location) == tuple(low.rotation_euler) == (0., 0., 0.) and
            tuple(low.scale) == (1., 1., 1.), "Non-identity Blender transform")
    bm = bmesh.new()
    try:
        bm.from_mesh(low.data)
        return geometry(bm)
    finally:
        bm.free()


class Glb:
    """Read the exported glTF itself, including seam-split positions and packed textures."""

    def __init__(self, path):
        blob = path.read_bytes()
        magic, version, length, json_len, kind = struct.unpack_from("<4s4I", blob)
        require((magic, version, length, kind) == (b"glTF", 2, len(blob), 0x4E4F534A), "Invalid GLB header")
        end = 20+json_len
        self.doc = json.loads(blob[20:end])
        bin_len, kind = struct.unpack_from("<I4s", blob, end)
        self.data = memoryview(blob)[end+8:]
        require(kind == b"BIN\0" and bin_len == len(self.data), "Invalid GLB BIN chunk")
        self.digest = hashlib.sha256(blob).hexdigest()

    def view(self, i):
        v = self.doc["bufferViews"][i]
        at = v.get("byteOffset", 0)
        return self.data[at:at+v["byteLength"]]

    def accessor(self, index):
        a = self.doc["accessors"][index]
        dtype = {5126: "<f4", 5125: "<u4", 5123: "<u2", 5121: "u1"}[a["componentType"]]
        size = {"VEC2": 2, "VEC3": 3, "VEC4": 4, "SCALAR": 1}[a["type"]]
        stride = self.doc["bufferViews"][a["bufferView"]].get("byteStride", np.dtype(dtype).itemsize*size)
        return np.ndarray((a["count"], size), dtype=dtype, buffer=self.view(a["bufferView"]),
                          offset=a.get("byteOffset", 0), strides=(stride, np.dtype(dtype).itemsize))

    def texture_pixels(self, info, directory):
        tex = self.doc["textures"][info["index"]]
        source = tex.get("extensions", {}).get("EXT_texture_webp", tex)["source"]
        pic = self.doc["images"][source]
        suffix = {"image/webp": ".webp", "image/png": ".png", "image/jpeg": ".jpg"}[pic["mimeType"]]
        path = directory / ("map"+suffix)
        path.write_bytes(self.view(pic["bufferView"]))
        image = bpy.data.images.load(str(path), check_existing=False)
        try:
            require(list(image.size) == [SIZE, SIZE], "Unexpected embedded texture resolution")
            # Inspect the actual encoded bytes, including sRGB albedo and glTF's linear G roughness.
            image.colorspace_settings.name = "Non-Color"
            buf = np.empty(SIZE*SIZE*4, dtype=np.float32)
            image.pixels.foreach_get(buf)
            return np.flipud(buf.reshape(SIZE, SIZE, 4))[:, :, :3], pic["mimeType"]
        finally:
            bpy.data.images.remove(image)


def uv_mask(uv, indices):
    coverage = np.zeros((SIZE, SIZE), dtype=np.uint16)
    for tri in uv[indices].astype(np.float64)*SIZE:
        a, b, c = tri
        x0, y0 = np.maximum(0, np.floor(tri.min(axis=0))).astype(int)
        x1, y1 = np.minimum(SIZE, np.ceil(tri.max(axis=0))).astype(int)
        y, x = np.ogrid[y0:y1, x0:x1]
        x = x+.5-a[0]
        y = y+.5-a[1]
        ab, ac = b-a, c-a
        det = ab[0]*ac[1]-ab[1]*ac[0]
        require(abs(det) > 1e-9, "Collapsed UV triangle")
        u = (x*ac[1]-y*ac[0])/det
        v = (ab[0]*y-ab[1]*x)/det
        coverage[y0:y1, x0:x1] += (u >= 0) & (v >= 0) & (u+v < 1)
    # Inspect island interiors without sampling the compressed transition into the UV gutter.
    inside = coverage > 0
    mask = inside.copy()
    for axis in (0, 1):
        for step in (-1, 1):
            mask &= np.roll(inside, step, axis=axis)
    return mask, float(inside.mean()), float((coverage > 1).mean())


def inspect_glb(stone, path, source, directory, sculpt_tris):
    glb = Glb(path)
    doc = glb.doc
    require(len(doc["scenes"]) == len(doc["nodes"]) == len(doc["meshes"]) == len(doc["materials"]) == 1,
            "Expected one stone, node, scene and material")
    node = doc["nodes"][0]
    require(doc["scenes"][0]["nodes"] == [0] and node["name"] == stone.id and node["mesh"] == 0
            and not any(k in node for k in ("children", "matrix", "translation", "rotation", "scale")),
            "Exported node is not an identity root")
    require(not any(doc.get(k) for k in ("animations", "cameras", "skins")) and
            "KHR_lights_punctual" not in doc.get("extensionsUsed", []), "Unexpected scene content")
    require(len(doc["buffers"]) == 1 and "uri" not in doc["buffers"][0] and len(doc["images"]) == 3
            and all("bufferView" in i and "uri" not in i for i in doc["images"]), "External data in GLB")
    prims = doc["meshes"][0]["primitives"]
    require(len(prims) == 1 and prims[0].get("mode", 4) == 4, "Expected one triangle primitive")
    prim = prims[0]
    att = prim["attributes"]
    pos = glb.accessor(att["POSITION"])
    normals, tangent = glb.accessor(att["NORMAL"]), glb.accessor(att["TANGENT"])
    require(np.isfinite(pos).all() and np.allclose(np.linalg.norm(normals, axis=1), 1, atol=.0001)
            and np.allclose(np.linalg.norm(tangent[:, :3], axis=1), 1, atol=.0002)
            and np.all(np.abs(tangent[:, 3]) == 1), "Invalid exported normal or tangent")
    uv = glb.accessor(att["TEXCOORD_0"])
    require(np.isfinite(uv).all() and uv.min() >= -1e-6 and uv.max() <= 1+1e-6, "UV outside atlas")
    idx = glb.accessor(prim["indices"]).reshape(-1, 3)
    unique, remap = np.unique(pos, axis=0, return_inverse=True)
    bm = bmesh.new()
    try:
        vertices = [bm.verts.new(p) for p in unique.tolist()]
        for a, b, c in remap.reshape(-1)[idx]:
            bm.faces.new((vertices[a], vertices[b], vertices[c]))
        bm.verts.index_update()
        bm.normal_update()
        exported = geometry(bm)
    finally:
        bm.free()
    dims = source["dimensionsM"]
    a, b, h = (d*.5 for d in dims)
    rock = stone.rock
    require(np.allclose(exported["dimensionsM"], [2*a, 2*h, 2*b], rtol=0, atol=2e-8) and a >= b >= h > 0,
            "glTF axes or scale do not match the Blender mesh")
    nominal = np.array(rock.mm)*.001
    require(np.all(np.abs(np.array(dims)-nominal) <= nominal*rock.tolerance),
            f"{stone.id}: dimensions outside archetype tolerance")
    volume = source["volumeM3"]
    require(math.isclose(exported["volumeM3"], volume, rel_tol=1e-6) and
            max(exported["centroidErrorMm"], source["centroidErrorMm"]) < .5, "Volume or centroid mismatch")
    mass = volume*rock.density
    require(rock.grams[0] <= mass*1000 <= rock.grams[1], f"{stone.id}: mass {mass*1000:.2f} g")
    tris = exported["triangles"]
    limit = 1500 if rock.id in ("jagged_gravel", "thin_shale") else 1300
    require(tris == source["triangles"] and 500 <= tris <= limit, "Triangle budget exceeded")
    size = path.stat().st_size
    require(80_000 <= size <= 240_000, f"{stone.id}: GLB size {size} outside the v2 delivery budget")
    pbr = doc["materials"][0]["pbrMetallicRoughness"]
    require(pbr.get("metallicFactor", 1.) == 0 and pbr.get("roughnessFactor", 1.) == 1. and
            pbr.get("baseColorFactor", [1]*4) == [1]*4, "Unexpected PBR factors")
    mask, occupancy, overlap = uv_mask(uv, idx)
    require(occupancy > .20 and overlap < .001, f"{stone.id}: UV occupancy {occupancy}, overlap {overlap}")
    base, base_fmt = glb.texture_pixels(pbr["baseColorTexture"], directory)
    normal, norm_fmt = glb.texture_pixels(doc["materials"][0]["normalTexture"], directory)
    orm, orm_fmt = glb.texture_pixels(pbr["metallicRoughnessTexture"], directory)
    require(base_fmt == norm_fmt == orm_fmt == "image/webp", "Expected three embedded WebP maps")
    colors, rough = base[mask], orm[:, :, 1][mask]
    luma = colors @ np.array([.2126, .7152, .0722])
    # Allow one 8-bit code step at either end of the dry roughness range for WebP quantization.
    q_lo, q_hi = np.quantile(rough, (.001, .999))
    require(rough.min() >= rock.rough[0]-1/255 and rough.max() <= rock.rough[1]+1/255 and rough.std() > .004,
            f"{stone.id}: texture roughness {rough.min():.3f}–{rough.max():.3f} or no variation")
    lo, hi = float(luma.min()), float(luma.max())
    quartz = rock.id == "quartz_cobble"
    require(lo >= .14 and hi <= (.62 if quartz else .48) and luma.std() > .006,
            f"{stone.id}: albedo {lo:.4f}–{hi:.4f}, deviation {luma.std():.4f}")
    white_fraction = float((luma > .48).mean())
    if quartz:
        require(.006 < white_fraction < .25 and hi > .53 and np.median(luma) < .33,
                f"{stone.id}: check white veins and dark host, white coverage {white_fraction:.3f}")
    require(np.all(rough > .25), f"{stone.id}: projection missed the sculpt")
    require(normal[:, :, :2][mask].std(axis=0).min() > .004, "Flat normal bake")
    color_hex = "#" + "".join(f"{int(v):02x}" for v in np.rint(colors.mean(axis=0)*255))
    record = dict(id=stone.id, archetypeId=rock.id, variant=stone.variant, name=rock.name,
                  rarity=rock.rarity, rarityLabel=RARITY[rock.rarity], feel=rock.feel,
                  glbPath=f"/assets/stones/{stone.id}.glb", a=a, b=b, h=h, volumeM3=volume,
                  density=rock.density, mass=mass, dragScale=rock.drag, wobble=rock.wobble,
                  roughness=round(float(rough.mean()), 6), colorHex=color_hex, triangles=tris, fileBytes=size)
    # Sample the support of both projected silhouettes after removing translation and all three
    # axis scales. Duplicating an outline and changing just its dimensions cannot pass this test.
    norm_pos = (unique.astype(np.float64)-unique.min(axis=0))/np.ptp(unique, axis=0)-.5
    angles = np.arange(64)*TAU/64
    directions = np.array([np.cos(angles), np.sin(angles)])
    profiles = np.concatenate([(norm_pos[:, axes]@directions).max(axis=0) for axes in ((0, 2), (0, 1))])
    contour_hash = hashlib.sha256(np.rint(profiles*400).astype("<i2").tobytes()).hexdigest()
    albedo_hash = hashlib.sha256(np.rint(base*255).astype(np.uint8).tobytes()).hexdigest()
    audit = dict(id=stone.id, passed=True, **source, gltfDimensionsM=exported["dimensionsM"],
                 gltfVolumeM3=exported["volumeM3"], gltfCentroidErrorMm=exported["centroidErrorMm"],
                 gltfClosedManifold=exported["closedManifold"], identityTransform=True,
                 a=a, b=b, h=h, density=rock.density, massKg=mass, flatness=h/math.sqrt(a*b),
                 aspect=b/a, fileBytes=size, sha256=glb.digest, highPolyTriangles=sculpt_tris,
                 habit=stone.feature, mineralAzimuthDeg=round(math.degrees(stone.strike)%180, 3),
                 normalizedContourSha256=contour_hash,
                 textures=dict(resolution=[SIZE, SIZE], embedded=[base_fmt, norm_fmt, orm_fmt],
                               normalSpace="OpenGL tangent (+Y)", metallic=0, uvCoverage=round(occupancy, 4),
                               uvOverlap=round(overlap, 6), roughnessP001P999=[float(q_lo), float(q_hi)],
                               srgbLuminanceMinMax=[lo, hi], albedoSha256=albedo_hash, quartzBrightFraction=white_fraction))
    return record, audit


def verify_collection(records, audits, variants, directory):
    expected = [f"{rock.id}_{v:02d}" for rock in ROCKS for v in range(1, variants+1)]
    require(expected == [r["id"] for r in records] == [a["id"] for a in audits], "Incomplete collection")
    require({p.stem for p in directory.glob("*.glb")} == set(expected), "GLB / manifest mismatch")
    families = {}
    for rock in ROCKS:
        rows = [r for r in records if r["archetypeId"] == rock.id]
        ids = {r["id"] for r in rows}
        checks = [a for a in audits if a["id"] in ids]
        contours = {a["normalizedContourSha256"] for a in checks}
        albedos = {a["textures"]["albedoSha256"] for a in checks}
        ratios = {(round(a["aspect"], 4), round(a["flatness"], 4)) for a in checks}
        swatches = {r["colorHex"] for r in rows}
        require(len(contours) == len(albedos) == len(ratios) == variants, f"{rock.id}: duplicate form or texture")
        # The authored run spans eight distinct matrix colours. With arbitrary expansion the
        # quantized average can coincide even though two rocks have different mineral maps.
        if variants <= len(HABITS):
            require(len(swatches) == variants, f"{rock.id}: duplicate measured colour swatch")
        families[rock.id] = dict(count=variants, distinctNormalizedContours=len(contours),
                                 distinctAxisRatios=len(ratios), distinctAlbedos=len(albedos),
                                 distinctMeanColors=len(swatches))
    return families


CARD_PX = 420
PX_MM = 3.55


def sun(name, direction, color, energy, angle):
    data = bpy.data.lights.new(name, "SUN")
    data.color = color
    data.energy = energy
    data.angle = math.radians(angle)
    lamp = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(lamp)
    lamp.rotation_euler = Vector(direction).to_track_quat("Z", "Y").to_euler()


def studio(width, height):
    scene = fresh_scene()
    camera = bpy.data.cameras.new("Orthographic specimen camera")
    camera.type = "ORTHO"
    camera.ortho_scale = max(width, height)/(PX_MM*1000)
    camera.clip_start = .001
    scene.camera = bpy.data.objects.new("Camera", camera)
    bpy.context.collection.objects.link(scene.camera)
    scene.camera.location = (0, 0, 1)
    scene.world = bpy.data.worlds.new("Dusk sky")
    scene.world.use_nodes = True
    bg = next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (.55, .65, .84, 1)
    bg.inputs["Strength"].default_value = .30
    sun("Grazing amber sun", (-.92, .32, .45), (1., .72, .44), 2.3, 12)
    sun("Cool sky fill", (.50, -.42, .95), (.59, .75, 1.), .9, 40)
    # Broad rectangular reflections give the polished edge a legible highlight. Distant
    # strips extend across the entire row so adjacent specimens share the same light.
    for name, location, height_m, watts, color, diffuse in (
            ("Sunset bank", (-.08, .39, .065), .09, 4.9, (1., .70, .43), 1.),
            ("Open sky", (.03, .16, .78), .26, .75, (.78, .87, 1.), 1.),
            ("Sky reflected in polished faces", (.04, .42, .72), .085, 5., (1., .81, .61), .04)):
        data = bpy.data.lights.new(name, "AREA")
        data.shape = "RECTANGLE"
        data.size = width/(PX_MM*1000)+.72
        data.size_y = height_m
        data.energy = watts*data.size
        data.color = color
        data.diffuse_factor = diffuse
        lamp = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(lamp)
        lamp.location = location
        lamp.rotation_euler = (-Vector(location)).to_track_quat("-Z", "Y").to_euler()
    scene.cycles.samples = 64
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = False
    scene.render.film_transparent = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    return scene


def render_row(stones, assets, dest):
    width = CARD_PX*len(stones)
    max_top = math.ceil(max(s["b"]*2000 for s in stones)*PX_MM)
    max_edge = math.ceil(max(s["h"]*2000 for s in stones)*PX_MM)
    top_pad, gap, bottom_pad = 12, 17, 9
    height = top_pad+max_top+gap+max_edge+bottom_pad
    scene = studio(width, height)
    top_y = top_pad+max_top/2
    side_y = top_pad+max_top+gap+max_edge/2
    for i, record in enumerate(stones):
        path = assets/(record["id"]+".glb")
        bpy.ops.import_scene.gltf(filepath=str(path))
        top = next(o for o in bpy.context.selected_objects if o.type == "MESH")
        side = top.copy()
        bpy.context.collection.objects.link(side)
        side.rotation_mode = "XYZ"
        side.rotation_euler.x = -math.pi/2
        # Align views by the midpoint of their measured silhouette; both are exact orthographic views.
        bounds = np.array(top.bound_box)
        cx, cy, cz = (bounds.min(axis=0)+bounds.max(axis=0))/2
        x = ((i+.5)*CARD_PX-width/2)/(PX_MM*1000) - cx
        top.location = (x, (height/2-top_y)/(PX_MM*1000)-cy, 0)
        side.location = (x, (height/2-side_y)/(PX_MM*1000)-cz, 0)
        bpy.context.view_layer.update()
        require(np.allclose(top.dimensions, np.array([record["a"], record["b"], record["h"]])*2,
                            rtol=0, atol=1e-7), "Imported plan-view dimensions changed")
        side_world = np.array([tuple(side.matrix_world @ Vector(v)) for v in side.bound_box])
        require(np.allclose(np.ptp(side_world, axis=0), np.array([record["a"], record["h"], record["b"]])*2,
                            rtol=0, atol=1e-7), "Incorrect side-view profile")
    scene.render.filepath = str(dest)
    bpy.ops.render.render(write_still=True)


def compose_sheet(job):
    from PIL import Image, ImageDraw, ImageFilter, ImageFont

    # The bundled fallback is used on minimal installations without Noto CJK.
    def font(candidates, size, fallback):
        for path in candidates:
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
        try:
            return ImageFont.truetype(fallback, size)
        except OSError:
            return ImageFont.load_default()

    noto = "/usr/share/fonts/opentype/noto/"
    serif_paths = [noto+"NotoSerifCJK-Regular.ttc", "Songti.ttc", "simsun.ttc"]
    sans_paths = [noto+"NotoSansCJK-Regular.ttc", "PingFang.ttc", "msyh.ttc",
                  "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"]
    mono_paths = ["/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf",
                  "DejaVuSansMono.ttf", "consola.ttf"]
    title_font = font(serif_paths, 55, "DejaVuSerif.ttf")
    row_font = font(serif_paths+sans_paths, 28, "DejaVuSerif.ttf")
    caption_font = font(sans_paths, 17, "DejaVuSans.ttf")
    meta_font = font(mono_paths, 16, "DejaVuSansMono.ttf")
    header_font = font(mono_paths, 19, "DejaVuSansMono.ttf")
    # If the platform lacks CJK fonts the scientific IDs and English captions stay legible.
    cjk = bool(getattr(row_font, "getname", lambda: ("", ""))()[0].lower().find("cjk") >= 0
               or any(Path(p).exists() for p in sans_paths))
    margin, labels, header, cap_h = 52, 275, 228, 58
    rows = job["rows"]
    variants = len(rows[0]["stones"])
    width = margin*2+labels+CARD_PX*variants
    heights = []
    for row in rows:
        with Image.open(row["render"]) as plate:
            heights.append(plate.height+cap_h)
    height = header+sum(heights)+32
    paper, ink, muted, rule, copper = "#e9e5d9", "#252b29", "#555e58", "#c1bbaa", "#895337"
    sheet = Image.new("RGB", (width, height), paper)
    draw = ImageDraw.Draw(sheet)
    start_x = margin+labels
    draw.text((margin, 19), "RIVERBANK  /  STONE COLLECTION", font=meta_font, fill=copper)
    draw.text((margin-2, 42), "河岸石子图鉴" if cjk else "Riverbank stones", font=title_font, fill=ink)
    sub = (f"{job['count']} 件标本　·　上图俯视，下图正侧视，比例一致　·　长 × 宽 × 厚（mm） / 质量（g）"
           if cjk else f"{job['count']} specimens   /   Plan above, profile below   /   L × W × T (mm), mass (g)")
    draw.text((margin, 124), sub, font=caption_font, fill=muted)
    bar_x = width-margin-126
    draw.text((bar_x, 68), "20 mm", font=header_font, fill=ink)
    bar_y, bar_end = 112, bar_x+round(20*PX_MM)
    draw.line((bar_x, bar_y, bar_end, bar_y), fill=ink, width=3)
    for x in (bar_x, bar_end):
        draw.line((x, bar_y-6, x, bar_y+3), fill=ink, width=2)
    draw.line((margin, 168, width-margin, 168), fill=ink, width=2)
    draw.text((margin, 182), "石种  /  岩性" if cjk else "ARCHETYPE", font=caption_font, fill=muted)
    for i in range(variants):
        label = "混合个体" if cjk else "MIXED"
        if i < len(HABITS):
            label = HABITS[i].label if cjk else HABITS[i].feature.upper()
        draw.text((start_x+(i+.5)*CARD_PX, 198), f"{i+1:02d}   /   {label}",
                  font=caption_font, fill=muted, anchor="mm")
    y = header
    for row, row_height in zip(rows, heights):
        draw.line((margin, y, width-margin, y), fill=rule)
        for i in range(variants):
            x = start_x+i*CARD_PX
            draw.line((x, y+12, x, y+row_height-12), fill="#d6d1c3")
        with Image.open(row["render"]) as rendered:
            plate = rendered.convert("RGBA")
        alpha = plate.getchannel("A")
        shadow = alpha.filter(ImageFilter.GaussianBlur(4)).point(lambda p: int(p*.19))
        sheet.paste("#625b51", (start_x+1, y+6, start_x+1+plate.width, y+6+plate.height), shadow)
        sheet.paste(plate, (start_x, y+2), alpha)
        label_y = y+round((row_height-cap_h)*.38)
        first = row["stones"][0]
        row_title = first["name"] if cjk else first["archetypeId"].replace("_", " ").title()
        draw.text((margin, label_y-18), row_title, font=row_font, fill=ink)
        draw.text((margin, label_y+36), first["archetypeId"], font=meta_font, fill=copper)
        detail = f"{row['lithology']}  ·  {first['rarityLabel']}" if cjk else first["rarity"]
        draw.text((margin, label_y+70), detail, font=caption_font, fill=muted)
        for i, stone in enumerate(row["stones"]):
            dims = " × ".join(f"{stone[axis]*2000:.1f}" for axis in ("a", "b", "h"))
            text = f"{dims} mm  /  {stone['mass']*1000:.1f} g"
            draw.text((start_x+(i+.5)*CARD_PX, y+row_height-27), text, font=meta_font, fill=muted, anchor="mm")
        y += row_height
    draw.line((margin, y, width-margin, y), fill=ink, width=2)
    sheet.save(job["output"], optimize=True)


def make_sheet(records, assets, directory, dest):
    rows = []
    for rock in ROCKS:
        stones = [s for s in records if s["archetypeId"] == rock.id]
        if not stones:
            continue
        rendered = directory/(rock.id+".png")
        render_row(stones, assets, rendered)
        rows.append(dict(stones=stones, lithology=rock.lithology, render=str(rendered)))
    job = dict(rows=rows, output=str(dest), count=len(records))
    try:
        import PIL
    except ImportError:
        description = directory/"sheet-layout.json"
        write_json(description, job)
        system_python = shutil.which("python3")
        require(system_python, "Install Pillow in Blender Python or in the system python3")
        subprocess.run([system_python, str(Path(__file__).resolve()), "--compose-sheet", str(description)], check=True)
    else:
        compose_sheet(job)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False)+"\n", encoding="utf-8")


@contextmanager
def catalog_lock(root):
    # Concurrent factories may bake independently. Serialize their short publication
    # step, and give a sheet-only render one consistent set of GLBs to read.
    key = hashlib.sha256(os.fsencode(root)).hexdigest()[:24]
    with (Path(tempfile.gettempdir())/f"river-stone-catalog-{key}.lock").open("a+b") as handle:
        if os.name == "nt":
            import msvcrt
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX)
        yield


def publish(root, work, records):
    assets, delivery = root/ASSETS, root/DELIVERY
    assets.mkdir(parents=True, exist_ok=True)
    delivery.mkdir(parents=True, exist_ok=True)
    targets = [assets/(r["id"]+".glb") for r in records]
    manifest = assets/"manifest.json"
    with catalog_lock(root):
        # This dedicated directory is the public catalog, including any GLB left behind
        # by an older run that never made it into its manifest.
        obsolete = sorted(set(assets.glob("*.glb"))-set(targets))
        targets.extend((delivery/"validation-report.json", delivery/"contact-sheet.png", manifest))
        previous = work/"previous"
        previous.mkdir()
        for path in targets+obsolete:
            if path.is_file():
                shutil.copy2(path, previous/path.name)
        changed = []
        try:
            for path in obsolete:
                path.unlink()
                changed.append(path)
            for path in targets:
                (work/path.name).replace(path)
                changed.append(path)
        except OSError:
            for path in reversed(changed):
                backup = previous/path.name
                if backup.exists():
                    backup.replace(path)
                else:
                    path.unlink(missing_ok=True)
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--variants", type=int, default=len(HABITS), help="Number of specimens per archetype (default: 8)")
    parser.add_argument("--output-root", type=Path, default=ROOT, help="Root for public/ and deliverables/")
    parser.add_argument("--sheet-only", action="store_true", help="Render the existing exported catalog")
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    require(bpy.app.background, "Run the factory in a separate background Blender process (-b)")
    require(args.variants > 0, "--variants must be positive")
    root = args.output_root.resolve()
    assets, delivery = root/ASSETS, root/DELIVERY
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".river-stones-", dir=root) as staging:
        work = Path(staging)
        sheet = work/"contact-sheet.png"
        if args.sheet_only:
            with catalog_lock(root):
                records = json.loads((assets/"manifest.json").read_text(encoding="utf-8"))["stones"]
                make_sheet(records, assets, work, sheet)
                delivery.mkdir(parents=True, exist_ok=True)
                sheet.replace(delivery/sheet.name)
            return
        records, audits = [], []
        for rock in ROCKS:
            for variant in range(1, args.variants+1):
                fresh_scene()
                stone, low, high = make_meshes(rock, variant, args.seed)
                measured = measure_low(low)
                sculpt_tris = len(high.data.polygons)
                path = work/(stone.id+".glb")
                bake_and_export(stone, low, high, path)
                record, audit = inspect_glb(stone, path, measured, work, sculpt_tris)
                records.append(record)
                audits.append(audit)
                print(f"{stone.id}: {record['mass']*1000:.1f} g, {record['triangles']} triangles, "
                      f"{record['fileBytes']:,} bytes, PASS", flush=True)
        total_bytes = sum(r["fileBytes"] for r in records)
        families = verify_collection(records, audits, args.variants, work)
        if args.variants == len(HABITS):
            require(14_000_000 <= total_bytes <= 18_000_000, f"96-stone collection size: {total_bytes} bytes")
        make_sheet(records, work, work, sheet)
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        manifest = dict(version=1, generatedAt=stamp, count=len(records), stones=records)
        report = dict(version=1, generatedAt=stamp, blender=bpy.app.version_string, seed=args.seed,
                      variantsPerArchetype=args.variants, count=len(audits), passedCount=len(audits), allPassed=True,
                      units="metres", blenderAxes=["length", "width", "thickness"],
                      gltfAxes=["length", "thickness", "width"], totalFileBytes=total_bytes,
                      meanFileBytes=total_bytes/len(records), archetypes=families,
                      stones=audits)
        write_json(work/"manifest.json", manifest)
        write_json(work/"validation-report.json", report)
        publish(root, work, records)
        print(f"Published {len(records)} validated GLBs ({report['totalFileBytes']:,} bytes) and {sheet.name}", flush=True)


if __name__ == "__main__":
    if "--compose-sheet" in sys.argv:
        compose_sheet(json.loads(Path(sys.argv[sys.argv.index("--compose-sheet")+1]).read_text(encoding="utf-8")))
    else:
        main()
