#!/usr/bin/env python3
"""
Render photorealistic 360° seamless, film-transparent RGBA 4096x512 distant horizon
skyline panoramas in Blender Cycles using 8-octave ridged-multifractal eroded terrain,
multi-depth atmospheric bands, fine canopy silhouettes, and PBR geological shaders.
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "public" / "assets" / "horizons"
PREVIEW_DIR = ROOT / "tools" / "blender" / "horizon_previews"


def hash_2d(ix: np.ndarray, iy: np.ndarray, seed: int) -> np.ndarray:
    n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) & 0x7FFFFFFF
    n = (n ^ (n >> 13)) * 1274126177
    n = (n ^ (n >> 16)) & 0x7FFFFFFF
    return n.astype(np.float64) / 2147483647.0


def periodic_value_noise(theta: np.ndarray, r_norm: np.ndarray, freq_th: int, freq_r: int, seed: int) -> np.ndarray:
    """Seamlessly periodic in theta (0..2pi), smooth value noise in 2D."""
    u = (theta / math.tau) * freq_th
    v = r_norm * freq_r
    iu = np.floor(u).astype(np.int64)
    iv = np.floor(v).astype(np.int64)
    fu = u - iu
    fv = v - iv
    su = fu * fu * (3.0 - 2.0 * fu)
    sv = fv * fv * (3.0 - 2.0 * fv)
    iu0 = np.mod(iu, freq_th)
    iu1 = np.mod(iu + 1, freq_th)
    n00 = hash_2d(iu0, iv, seed)
    n10 = hash_2d(iu1, iv, seed)
    n01 = hash_2d(iu0, iv + 1, seed)
    n11 = hash_2d(iu1, iv + 1, seed)
    return (n00 * (1.0 - su) + n10 * su) * (1.0 - sv) + (n01 * (1.0 - su) + n11 * su) * sv


def ridged_multifractal(theta: np.ndarray, r_norm: np.ndarray, base_freq: int, octaves: int,
                        sharpness: float = 1.65, seed: int = 11) -> np.ndarray:
    """True sharp alpine/volcanic ridged multifractal heightfield (periodic in theta)."""
    total = np.zeros_like(theta, dtype=np.float64)
    amp = 1.0
    norm = 0.0
    weight = np.ones_like(theta, dtype=np.float64)
    for o in range(octaves):
        f_th = base_freq * (2 ** o)
        f_r = max(2, int(2 * (2 ** o)))
        n = periodic_value_noise(theta, r_norm, f_th, f_r, seed + o * 37)
        ridge = 1.0 - np.abs(2.0 * n - 1.0)
        ridge = np.power(np.clip(ridge, 0.0, 1.0), sharpness) * weight
        weight = np.clip(ridge * 1.85, 0.15, 1.0)
        total += ridge * amp
        norm += amp
        amp *= 0.48
    return total / max(norm, 1e-6)


def fbm_2d(theta: np.ndarray, r_norm: np.ndarray, base_freq: int, octaves: int, seed: int = 99) -> np.ndarray:
    total = np.zeros_like(theta, dtype=np.float64)
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        f_th = base_freq * (2 ** o)
        f_r = max(2, int(2 * (2 ** o)))
        total += periodic_value_noise(theta, r_norm, f_th, f_r, seed + o * 53) * amp
        norm += amp
        amp *= 0.52
    return total / max(norm, 1e-6)


def setup_cycles(width: int = 4096, height: int = 512, samples: int = 24):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 1
    scene.cycles.transparent_max_bounces = 4
    scene.render.film_transparent = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"

    cam_data = bpy.data.cameras.new("PanoCam")
    cam_data.type = "PANO"
    cam_data.panorama_type = "EQUIRECTANGULAR"
    cam_data.longitude_min = -math.pi
    cam_data.longitude_max = math.pi
    cam_data.latitude_min = math.radians(-1.0)
    cam_data.latitude_max = math.radians(17.5)
    cam_data.clip_start = 1.0
    cam_data.clip_end = 600.0
    cam_obj = bpy.data.objects.new("PanoCam", cam_data)
    cam_obj.location = (0.0, 0.0, 2.1)
    cam_obj.rotation_euler = (math.pi / 2, 0.0, -math.pi / 2)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    return scene


def setup_lighting(sun_dir_three, sun_rgb, sun_strength, sky_rgb, sky_strength=0.75):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("Sky")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (*sky_rgb, 1.0)
    bg.inputs["Strength"].default_value = sky_strength
    scene.world = world

    sx, sy, sz = sun_dir_three
    bdir = Vector((sx, -sz, sy)).normalized()
    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = sun_strength
    sun_data.color = sun_rgb
    sun_data.angle = math.radians(1.2)
    sun_obj = bpy.data.objects.new("Sun", sun_data)
    sun_obj.rotation_euler = bdir.to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(sun_obj)


def build_terrain_band(name, radius, depth, z_grid: np.ndarray, mat, base_z=-2.5):
    """Create a high-resolution periodic 360° displaced mountain/dune ring from a (segs_th, segs_r) Z array."""
    segs_th, segs_r = z_grid.shape
    thetas = np.linspace(0.0, math.tau, segs_th, endpoint=False)
    rs = np.linspace(radius, radius + depth, segs_r)
    ct = np.cos(thetas)[:, None]
    st = np.sin(thetas)[:, None]
    xs = ct * rs[None, :]
    ys = st * rs[None, :]

    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = []
    for i in range(segs_th):
        row = []
        for j in range(segs_r):
            z = float(z_grid[i, j])
            if j == 0:
                z = base_z
            row.append(bm.verts.new((float(xs[i, j]), float(ys[i, j]), z)))
        verts.append(row)

    for i in range(segs_th):
        ni = (i + 1) % segs_th
        for j in range(segs_r - 1):
            bm.faces.new((verts[i][j], verts[ni][j], verts[ni][j + 1], verts[i][j + 1]))

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_geology_mat(name, low_rgb, cliff_rgb, snow_rgb, snow_z, snow_slope=0.58,
                     haze_rgb=None, haze_mix=0.0, bump_str=0.85, noise_scale=0.14, roughness=0.88):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = roughness
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    geom = nt.nodes.new("ShaderNodeNewGeometry")
    sep_p = nt.nodes.new("ShaderNodeSeparateXYZ")
    sep_n = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geom.outputs["Position"], sep_p.inputs["Vector"])
    nt.links.new(geom.outputs["Normal"], sep_n.inputs["Vector"])

    # Stratified rock / forest micro-noise
    n_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_macro.inputs["Scale"].default_value = noise_scale
    n_macro.inputs["Detail"].default_value = 12.0
    n_macro.inputs["Roughness"].default_value = 0.68
    nt.links.new(geom.outputs["Position"], n_macro.inputs["Vector"])

    n_micro = nt.nodes.new("ShaderNodeTexNoise")
    n_micro.inputs["Scale"].default_value = noise_scale * 4.5
    n_micro.inputs["Detail"].default_value = 8.0
    n_micro.inputs["Roughness"].default_value = 0.72
    nt.links.new(geom.outputs["Position"], n_micro.inputs["Vector"])

    # Blend low biome (forest/sand) -> steep cliff rock by height & slope
    h_rock = nt.nodes.new("ShaderNodeMapRange")
    h_rock.inputs["From Min"].default_value = snow_z * 0.28
    h_rock.inputs["From Max"].default_value = snow_z * 0.85
    nt.links.new(sep_p.outputs["Z"], h_rock.inputs["Value"])

    # Steepness mask (1 on cliffs, 0 on flat)
    steep = nt.nodes.new("ShaderNodeMapRange")
    steep.inputs["From Min"].default_value = 0.84
    steep.inputs["From Max"].default_value = 0.45
    nt.links.new(sep_n.outputs["Z"], steep.inputs["Value"])

    rock_fac = nt.nodes.new("ShaderNodeMath")
    rock_fac.operation = "MAXIMUM"
    nt.links.new(h_rock.outputs["Result"], rock_fac.inputs[0])
    nt.links.new(steep.outputs["Result"], rock_fac.inputs[1])

    mix_low_cliff = nt.nodes.new("ShaderNodeMix")
    mix_low_cliff.data_type = "RGBA"
    nt.links.new(rock_fac.outputs["Value"], mix_low_cliff.inputs["Factor"])
    mix_low_cliff.inputs[6].default_value = (*low_rgb, 1.0)
    mix_low_cliff.inputs[7].default_value = (*cliff_rgb, 1.0)

    # Snow clings to higher elevations & less-vertical faces, broken up by macro noise for realistic snow gullies!
    h_plus_n = nt.nodes.new("ShaderNodeMath")
    h_plus_n.operation = "MULTIPLY_ADD"
    h_plus_n.inputs[1].default_value = 9.0
    nt.links.new(n_macro.outputs["Fac"], h_plus_n.inputs[0])
    nt.links.new(sep_p.outputs["Z"], h_plus_n.inputs[2])

    s_h = nt.nodes.new("ShaderNodeMapRange")
    s_h.inputs["From Min"].default_value = snow_z * 0.82
    s_h.inputs["From Max"].default_value = snow_z * 1.18
    nt.links.new(h_plus_n.outputs["Value"], s_h.inputs["Value"])

    s_n = nt.nodes.new("ShaderNodeMapRange")
    s_n.inputs["From Min"].default_value = snow_slope - 0.14
    s_n.inputs["From Max"].default_value = snow_slope + 0.14
    nt.links.new(sep_n.outputs["Z"], s_n.inputs["Value"])

    s_fac = nt.nodes.new("ShaderNodeMath")
    s_fac.operation = "MULTIPLY"
    nt.links.new(s_h.outputs["Result"], s_fac.inputs[0])
    nt.links.new(s_n.outputs["Result"], s_fac.inputs[1])

    mix_snow = nt.nodes.new("ShaderNodeMix")
    mix_snow.data_type = "RGBA"
    nt.links.new(s_fac.outputs["Value"], mix_snow.inputs["Factor"])
    nt.links.new(mix_low_cliff.outputs[2], mix_snow.inputs[6])
    mix_snow.inputs[7].default_value = (*snow_rgb, 1.0)

    # Micro tonal variation so surfaces look photographic, never flat CG plastic
    tone = nt.nodes.new("ShaderNodeMix")
    tone.data_type = "RGBA"
    tone.blend_type = "MULTIPLY"
    tone.inputs["Factor"].default_value = 0.28
    nt.links.new(mix_snow.outputs[2], tone.inputs[6])
    nt.links.new(n_micro.outputs["Color"], tone.inputs[7])

    final_col = tone.outputs[2]
    if haze_rgb is not None and haze_mix > 0.001:
        hz = nt.nodes.new("ShaderNodeMix")
        hz.data_type = "RGBA"
        hz.inputs["Factor"].default_value = haze_mix
        nt.links.new(final_col, hz.inputs[6])
        hz.inputs[7].default_value = (*haze_rgb, 1.0)
        final_col = hz.outputs[2]

    nt.links.new(final_col, bsdf.inputs["Base Color"])

    # Dual-scale bump for sharp craggy rock crevices & tree-line grit
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_str
    bump.inputs["Distance"].default_value = 2.2
    nt.links.new(n_macro.outputs["Fac"], bump.inputs["Height"])
    bump2 = nt.nodes.new("ShaderNodeBump")
    bump2.inputs["Strength"].default_value = bump_str * 0.45
    bump2.inputs["Distance"].default_value = 0.6
    nt.links.new(n_micro.outputs["Fac"], bump2.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bump2.inputs["Normal"])
    nt.links.new(bump2.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def make_emissive_mat(name, rgb, strength=5.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*rgb, 1.0)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def make_solid_mat(name, rgb, roughness=0.82):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def add_mesh_batch(name, mat, builder_fn):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    builder_fn(bm)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def bm_box(bm, loc, scale, rot_z=0.0):
    res = bmesh.ops.create_cube(bm, size=1.0)
    cz, sz = math.cos(rot_z), math.sin(rot_z)
    sx, sy, sz_s = scale
    lx, ly, lz = loc
    for v in res["verts"]:
        x, y, z = v.co.x * sx, v.co.y * sy, v.co.z * sz_s
        v.co.x = x * cz - y * sz + lx
        v.co.y = x * sz + y * cz + ly
        v.co.z = z + lz


def bm_cone(bm, loc, r1, r2, depth, segs=6):
    res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
    lx, ly, lz = loc
    for v in res["verts"]:
        v.co.x += lx; v.co.y += ly; v.co.z += lz


def add_pine_forest_skirt(rng, radius, th_ranges_deg, leaf_mat, density=220):
    """Dense jagged conifer treeline silhouette along shoreline (hundreds of narrow varied firs)."""
    def build(bm):
        for lo_deg, hi_deg in th_ranges_deg:
            span = (hi_deg - lo_deg) / 360.0
            n = max(12, int(density * span))
            for _ in range(n):
                th = math.radians(rng.uniform(lo_deg, hi_deg))
                r = radius + rng.uniform(-2.5, 9.0)
                h = rng.uniform(3.2, 7.6)
                w = h * rng.uniform(0.14, 0.22)
                x, y = math.cos(th) * r, math.sin(th) * r
                bm_cone(bm, (x, y, h * 0.45), w, 0.04, h, segs=5)
    add_mesh_batch("ConiferTreeline", leaf_mat, build)


def add_palm_grove(rng, radius, centers_deg, trunk_mat, frond_mat, per_grove=18):
    """Arching coconut/date palm silhouettes with real radial drooping fronds (zero blocky cones!)."""
    trunks = []
    fronds = []
    for c_deg in centers_deg:
        for _ in range(per_grove):
            th = math.radians(c_deg + rng.uniform(-4.5, 4.5))
            r = radius + rng.uniform(-2.0, 7.0)
            h = rng.uniform(4.2, 8.2)
            lean = rng.uniform(-0.8, 0.8)
            x0, y0 = math.cos(th) * r, math.sin(th) * r
            xt = x0 - math.sin(th) * lean
            yt = y0 + math.cos(th) * lean
            trunks.append((x0, y0, xt, yt, h))
            fronds.append((xt, yt, h))

    def build_trunks(bm):
        for x0, y0, xt, yt, h in trunks:
            bm_cone(bm, ((x0 + xt) * 0.5, (y0 + yt) * 0.5, h * 0.45), 0.22, 0.10, h, segs=5)

    def build_fronds(bm):
        for xt, yt, h in fronds:
            for k in range(7):
                ang = k * (math.tau / 7.0) + (xt * 0.37)
                flen = 2.1 + 0.5 * math.sin(k * 2.1)
                fx = xt + math.cos(ang) * flen * 0.55
                fy = yt + math.sin(ang) * flen * 0.55
                bm_box(bm, (fx, fy, h - 0.15), (flen, 0.42, 0.18), rot_z=ang)
            bm_cone(bm, (xt, yt, h + 0.15), 1.4, 0.25, 0.75, segs=6)

    add_mesh_batch("PalmTrunks", trunk_mat, build_trunks)
    add_mesh_batch("PalmFronds", frond_mat, build_fronds)


def add_village_clusters(rng, radius, centers_deg, wall_mat, roof_mat, glow_mat, steeple=False):
    walls, roofs, glows = [], [], []
    for c_deg in centers_deg:
        n = int(rng.integers(7, 14))
        for _ in range(n):
            th = math.radians(c_deg + rng.uniform(-3.0, 3.0))
            r = radius + rng.uniform(-2.5, 4.5)
            w = rng.uniform(1.6, 3.4)
            d = rng.uniform(1.4, 2.6)
            h = rng.uniform(1.4, 2.9)
            x, y = math.cos(th) * r, math.sin(th) * r
            rot = th + math.pi / 2
            walls.append(((x, y, h * 0.45), (w, d, h), rot))
            roofs.append(((x, y, h * 0.92 + 0.55), w * 0.74, 0.08, 1.35))
            if glow_mat and rng.random() < 0.8:
                gx, gy = math.cos(th) * (r - d * 0.54), math.sin(th) * (r - d * 0.54)
                glows.append(((gx, gy, h * 0.52), (w * 0.35, 0.22, 0.38), rot))
        if steeple:
            th = math.radians(c_deg)
            r = radius - 1.0
            x, y = math.cos(th) * r, math.sin(th) * r
            walls.append(((x, y, 2.8), (1.35, 1.35, 5.6), th))
            roofs.append(((x, y, 7.6), 0.92, 0.04, 4.2))

    add_mesh_batch("VillageWalls", wall_mat, lambda bm: [bm_box(bm, l, s, rz) for l, s, rz in walls])
    add_mesh_batch("VillageRoofs", roof_mat, lambda bm: [bm_cone(bm, l, r1, r2, d, 4) for l, r1, r2, d in roofs])
    if glow_mat:
        add_mesh_batch("VillageGlows", glow_mat, lambda bm: [bm_box(bm, l, s, rz) for l, s, rz in glows])


def make_grid(segs_th=1024, segs_r=36):
    th = np.linspace(0.0, math.tau, segs_th, endpoint=False)[:, None]
    u = np.linspace(0.0, 1.0, segs_r)[None, :]
    th_2d = np.broadcast_to(th, (segs_th, segs_r))
    u_2d = np.broadcast_to(u, (segs_th, segs_r))
    prof = np.sin(u_2d * math.pi) ** 0.78
    return th_2d, u_2d, prof


def build_alps():
    rng = np.random.default_rng(101)
    setup_lighting((0.78, 0.38, -0.49), (1.0, 0.96, 0.88), 4.6, (0.50, 0.72, 0.92), 0.82)
    th, u, prof = make_grid(1024, 36)

    # Valley saddle at az = -8° (Blender th = +8°) for hero 3D Matterhorn peak
    d = np.arctan2(np.sin(th - math.radians(8)), np.cos(th - math.radians(8)))
    notch = 1.0 - 0.68 * np.exp(-(d * d) / 0.11)

    # Far high snowy Alpine range (craggy ridged multifractal!)
    r_far = ridged_multifractal(th, u, base_freq=7, octaves=6, sharpness=1.85, seed=11)
    macro_far = 0.55 + 0.45 * fbm_2d(th, u, base_freq=4, octaves=3, seed=21)
    z_far = (4.0 + 52.0 * r_far * macro_far) * prof * notch
    mat_far = make_geology_mat(
        "AlpsFar", (0.10, 0.18, 0.13), (0.20, 0.25, 0.32), (0.94, 0.96, 1.00),
        snow_z=17.0, snow_slope=0.46, haze_rgb=(0.56, 0.72, 0.86), haze_mix=0.22, bump_str=1.1,
    )
    build_terrain_band("AlpsFar", 185.0, 72.0, z_far, mat_far)

    # Mid pine-covered Alpine foothills
    r_mid = ridged_multifractal(th, u, base_freq=9, octaves=5, sharpness=1.35, seed=31)
    z_mid = (2.0 + 21.0 * r_mid) * prof * (0.42 + 0.58 * notch)
    mat_mid = make_geology_mat(
        "AlpsMid", (0.06, 0.15, 0.08), (0.16, 0.22, 0.19), (0.85, 0.90, 0.95),
        snow_z=22.0, snow_slope=0.62, bump_str=0.9, noise_scale=0.18,
    )
    build_terrain_band("AlpsMid", 144.0, 42.0, z_mid, mat_mid)
    add_pine_forest_skirt(rng, 143.0, [(-180, -14), (24, 180)], make_solid_mat("AlpsSpruce", (0.05, 0.12, 0.06)), density=340)
    add_village_clusters(
        rng, 141.0, [-38, -19, 28, 56, 128, -118],
        make_solid_mat("ChaletWall", (0.82, 0.77, 0.68)),
        make_solid_mat("ChaletRoof", (0.30, 0.19, 0.14)),
        make_emissive_mat("ChaletGlow", (1.0, 0.80, 0.42), 2.5),
        steeple=True,
    )


def build_nile():
    rng = np.random.default_rng(202)
    setup_lighting((0.87, 0.155, -0.46), (1.0, 0.62, 0.25), 5.2, (0.58, 0.38, 0.30), 0.62)
    th, u, prof = make_grid(1024, 34)

    d = np.arctan2(np.sin(th - math.radians(9)), np.cos(th - math.radians(9)))
    notch = 1.0 - 0.62 * np.exp(-(d * d) / 0.14)

    # Sharp wind-sculpted Sahara dune crests & desert sandstone mesas (far)
    r_dune = ridged_multifractal(th, u, base_freq=5, octaves=5, sharpness=1.95, seed=41)
    mesa = np.clip(fbm_2d(th, u, base_freq=6, octaves=4, seed=47) * 1.45 - 0.25, 0.0, 0.72)
    z_far = (1.5 + 18.0 * r_dune + 8.0 * mesa) * prof * notch
    mat_far = make_geology_mat(
        "SaharaFar", (0.42, 0.24, 0.12), (0.66, 0.42, 0.20), (0.90, 0.66, 0.36),
        snow_z=12.0, snow_slope=0.52, haze_rgb=(0.76, 0.48, 0.28), haze_mix=0.20, bump_str=0.65, noise_scale=0.07,
    )
    build_terrain_band("SaharaFar", 174.0, 62.0, z_far, mat_far)

    # Near rocky Aswan granite riverbank & mudbrick shoreline terrace
    r_near = fbm_2d(th, u, base_freq=10, octaves=5, seed=55)
    z_near = (1.0 + 7.5 * r_near) * prof * (0.55 + 0.45 * notch)
    mat_near = make_geology_mat(
        "AswanBank", (0.28, 0.18, 0.12), (0.48, 0.30, 0.18), (0.70, 0.48, 0.26),
        snow_z=9.0, snow_slope=0.65, bump_str=0.95, noise_scale=0.16,
    )
    build_terrain_band("AswanBank", 142.0, 32.0, z_near, mat_near)
    add_palm_grove(
        rng, 141.0, [-42, -22, 24, 46, 95, -95, 148],
        make_solid_mat("DateTrunk", (0.28, 0.19, 0.12)),
        make_solid_mat("DateFrond", (0.12, 0.22, 0.09)),
        per_grove=20,
    )
    # Distant sandstone pylon temples + obelisks on flanks
    stone_m = make_solid_mat("TempleSandstone", (0.64, 0.44, 0.24))
    glow_m = make_emissive_mat("TempleBrazier", (1.0, 0.60, 0.20), 6.0)
    def build_temples(bm):
        for deg in (-25, 34, 145):
            t = math.radians(deg)
            x, y = math.cos(t) * 139.0, math.sin(t) * 139.0
            bm_box(bm, (x - 2.8 * math.sin(t), y + 2.8 * math.cos(t), 4.0), (4.6, 2.2, 8.0), t + math.pi / 2)
            bm_box(bm, (x + 2.8 * math.sin(t), y - 2.8 * math.cos(t), 4.0), (4.6, 2.2, 8.0), t + math.pi / 2)
            bm_cone(bm, (x + 6.8 * math.sin(t), y - 6.8 * math.cos(t), 6.6), 0.62, 0.15, 13.2, 4)
    add_mesh_batch("NileTemples", stone_m, build_temples)
    add_mesh_batch("NileBraziers", glow_m, lambda bm: [bm_box(bm, (math.cos(math.radians(d))*137.5, math.sin(math.radians(d))*137.5, 2.0), (1.1, 1.1, 1.1)) for d in (-25, 34, 145)])


def build_tahoe():
    rng = np.random.default_rng(303)
    setup_lighting((0.80, 0.34, -0.49), (1.0, 0.93, 0.82), 4.5, (0.48, 0.70, 0.90), 0.82)
    th, u, prof = make_grid(1024, 36)

    d = np.arctan2(np.sin(th - math.radians(10)), np.cos(th - math.radians(10)))
    notch = 1.0 - 0.48 * np.exp(-(d * d) / 0.14)

    # Jagged Sierra Nevada granite range with snow-filled cirques
    r_far = ridged_multifractal(th, u, base_freq=8, octaves=6, sharpness=1.75, seed=61)
    z_far = (3.5 + 42.0 * r_far) * prof * notch
    mat_far = make_geology_mat(
        "SierraCrest", (0.07, 0.14, 0.08), (0.28, 0.34, 0.42), (0.92, 0.95, 0.99),
        snow_z=16.5, snow_slope=0.50, haze_rgb=(0.56, 0.72, 0.86), haze_mix=0.20, bump_str=1.05,
    )
    build_terrain_band("SierraCrest", 182.0, 68.0, z_far, mat_far)

    # Dense dark ponderosa-pine shoreline slopes
    r_mid = fbm_2d(th, u, base_freq=10, octaves=5, seed=71)
    z_mid = (2.0 + 17.5 * r_mid) * prof
    mat_mid = make_geology_mat(
        "TahoeSlope", (0.05, 0.12, 0.06), (0.14, 0.21, 0.15), (0.42, 0.48, 0.54),
        snow_z=24.0, snow_slope=0.65, bump_str=0.95, noise_scale=0.20,
    )
    build_terrain_band("TahoeSlope", 144.0, 38.0, z_mid, mat_mid)
    add_pine_forest_skirt(rng, 142.5, [(-180, 180)], make_solid_mat("TahoePine", (0.04, 0.11, 0.05)), density=520)


def build_nordic():
    rng = np.random.default_rng(404)
    setup_lighting((0.82, 0.24, -0.52), (0.50, 0.94, 0.86), 3.4, (0.08, 0.20, 0.30), 0.68)
    th, u, prof = make_grid(1024, 36)

    # Wide arctic fjord mouth dead ahead (+X) so animated emerald aurora shines unimpeded!
    d = np.arctan2(np.sin(th), np.cos(th))
    aurora_window = 1.0 - 0.82 * np.exp(-(d * d) / 0.15)

    # Razor-sharp jagged Lofoten knife-edge glacial arêtes
    r_fjord = ridged_multifractal(th, u, base_freq=9, octaves=6, sharpness=2.20, seed=81)
    macro = 0.50 + 0.50 * fbm_2d(th, u, base_freq=5, octaves=3, seed=87)
    z_far = (2.0 + 56.0 * r_fjord * macro) * prof * aurora_window
    mat_fjord = make_geology_mat(
        "LofotenCliffs", (0.03, 0.06, 0.10), (0.07, 0.11, 0.17), (0.76, 0.88, 0.95),
        snow_z=14.0, snow_slope=0.44, haze_rgb=(0.08, 0.18, 0.26), haze_mix=0.16, bump_str=1.2, noise_scale=0.12,
    )
    build_terrain_band("LofotenCliffs", 168.0, 62.0, z_far, mat_fjord)

    add_village_clusters(
        rng, 141.0, [-38, -22, 23, 45, 112, -112],
        make_solid_mat("RorbuRed", (0.48, 0.10, 0.08)),
        make_solid_mat("RorbuSnowRoof", (0.74, 0.84, 0.90)),
        make_emissive_mat("RorbuWarmGlow", (1.0, 0.72, 0.28), 7.5),
        steeple=False,
    )
    lh_wall = make_solid_mat("NordicLH", (0.86, 0.88, 0.90))
    lh_glow = make_emissive_mat("NordicLHGlow", (1.0, 0.86, 0.48), 16.0)
    add_mesh_batch("Lighthouses", lh_wall, lambda bm: [bm_cone(bm, (math.cos(math.radians(a))*138, math.sin(math.radians(a))*138, 4.2), 1.0, 0.55, 8.4, 10) for a in (-28, 30)])
    add_mesh_batch("LHBeacons", lh_glow, lambda bm: [bm_cone(bm, (math.cos(math.radians(a))*138, math.sin(math.radians(a))*138, 8.8), 0.68, 0.68, 0.9, 10) for a in (-28, 30)])


def build_lagoon():
    rng = np.random.default_rng(505)
    setup_lighting((0.85, 0.23, -0.47), (1.0, 0.76, 0.44), 4.8, (0.44, 0.72, 0.74), 0.82)
    th, u, prof = make_grid(1024, 34)

    # Dramatic eroded Moorea/Bora-Bora jagged volcanic islands spaced across open turquoise ocean!
    r_jagged = ridged_multifractal(th, u, base_freq=11, octaves=6, sharpness=2.05, seed=91)
    env_volc = np.zeros_like(th)
    for center_deg, width_rad, peak_h in ((-46, 0.18, 42.0), (28, 0.21, 46.0), (114, 0.22, 38.0), (-132, 0.20, 34.0)):
        d = np.arctan2(np.sin(th - math.radians(center_deg)), np.cos(th - math.radians(center_deg)))
        env_volc = np.maximum(env_volc, peak_h * np.exp(-(d * d) / (width_rad * width_rad)))
    z_volc = np.where(env_volc > 0.6, (env_volc * (0.35 + 0.85 * r_jagged)) * prof, -3.5)
    mat_volc = make_geology_mat(
        "PacificVolcano", (0.06, 0.20, 0.08), (0.14, 0.26, 0.14), (0.24, 0.30, 0.20),
        snow_z=38.0, snow_slope=0.70, haze_rgb=(0.68, 0.68, 0.58), haze_mix=0.18, bump_str=1.15, noise_scale=0.16,
    )
    build_terrain_band("PacificVolcanoes", 174.0, 52.0, z_volc, mat_volc, base_z=-3.5)

    # Low sandy coral motu islets with arching coconut palm groves
    env_motu = np.zeros_like(th)
    for center_deg, width_rad, peak_h in ((-20, 0.09, 2.2), (64, 0.11, 2.5), (-86, 0.10, 2.3), (156, 0.11, 2.2)):
        d = np.arctan2(np.sin(th - math.radians(center_deg)), np.cos(th - math.radians(center_deg)))
        env_motu = np.maximum(env_motu, peak_h * np.exp(-(d * d) / (width_rad * width_rad)))
    z_motu = np.where(env_motu > 0.25, env_motu * prof, -3.5)
    mat_motu = make_geology_mat(
        "CoralMotu", (0.86, 0.78, 0.60), (0.12, 0.28, 0.11), (0.14, 0.30, 0.12),
        snow_z=6.0, snow_slope=0.70, bump_str=0.5, noise_scale=0.22,
    )
    build_terrain_band("CoralMotus", 142.0, 20.0, z_motu, mat_motu, base_z=-3.5)
    add_palm_grove(
        rng, 141.0, [-20, -46, 28, 64, -86, 114, 156],
        make_solid_mat("CocoTrunk", (0.32, 0.22, 0.14)),
        make_solid_mat("CocoFrond", (0.10, 0.28, 0.10)),
        per_grove=22,
    )


WORLDS = {
    "alps": ("alps_skyline.webp", build_alps),
    "nile": ("nile_skyline.webp", build_nile),
    "tahoe": ("tahoe_skyline.webp", build_tahoe),
    "nordic": ("nordic_skyline.webp", build_nordic),
    "lagoon": ("lagoon_skyline.webp", build_lagoon),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    targets = argv if argv else list(WORLDS.keys())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for wid in targets:
        if wid in WORLDS:
            scene = setup_cycles(width=4096, height=512, samples=22)
            WORLDS[wid][1]()
            tmp_png = PREVIEW_DIR / f"{wid}_raw.png"
            scene.render.filepath = str(tmp_png)
            bpy.ops.render.render(write_still=True)
            print(f"Rendered {wid}: {tmp_png}")


if __name__ == "__main__":
    main()
