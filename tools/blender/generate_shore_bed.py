"""Bake the riverbed and six background specimens with Blender/Cycles.

    blender -b --factory-startup -t 12 --python-exit-code 1 -P tools/blender/generate_shore_bed.py --
    blender -b --factory-startup -t 8 --python-exit-code 1 -P tools/blender/generate_shore_bed.py -- --seed 42 --output-root /tmp/shore

Requires Pillow in Blender or system python3. --draft uses a 512 px bake for inspection
and requires a separate --output-root. The default produces the release assets.
"""

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
ASSETS = Path("public/assets/shore")
DELIVERY = Path("deliverables/shore-assets")
TILE = 1.2
SEED = 20261125
COUNT = 2640
AO_DISTANCE = .035
MAPS = {
    "albedo": ("shore_albedo.webp", "RGB", 88, 350_000, 750_000),
    "normal": ("shore_normal.png", "RGB", None, 0, 2_500_000),
    "roughness": ("shore_roughness.webp", "L", "lossless", 150_000, 350_000),
    "ao": ("shore_ao.webp", "L", 83, 150_000, 350_000),
}
# Outline, height, lobe strength and sRGB palette. The last two columns of the
# outline parameters distinguish water-worn surfaces from bedding and break faces.
FORMS = (
    (2.12, (1.05, .97, .97), .052, (.565, .570, .564), "Rounded river pebble"),
    (2.25, (1.02, 1.01, .88), .067, (.616, .588, .538), "Flat stream pebble"),
    (2.58, (1.06, .95, 1.00), .118, (.475, .489, .504), "Weathered gravel"),
    (2.04, (1.05, .94, .98), .158, (.565, .541, .507), "Bean-shaped cobble"),
    (2.57, (1.03, 1.00, .89), .089, (.535, .536, .516), "Chipped bedding"),
    (2.75, (1.01, 1.04, 1.00), .063, (.649, .643, .617), "Rounded block"),
)

if "--image-io" not in sys.argv:
    import bpy
    import bmesh
    import numpy as np
    from mathutils import Matrix, Vector

    sys.dont_write_bytecode = True
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from generate_stones import (Glb, Shader, catalog_lock, fresh_scene, geometry,
                                 material, mesh_object, require, select_only, sun, uv_mask, write_json)


def image_io(mode, *args):
    from PIL import Image, ImageDraw, ImageFont

    if mode == "encode":
        raw, width, channels, dest, quality = args
        width = int(width)
        image = Image.frombytes(channels, (width, width), Path(raw).read_bytes())
        if quality == "lossless":
            options = {"lossless": True, "quality": 100, "method": 6}
        elif quality == "None":
            options = {"optimize": True}
        else:
            options = {"quality": int(quality), "method": 6}
        image.save(dest, **options)
    elif mode == "decode":
        src, channels, dest = args
        with Image.open(src) as image:
            Path(dest).write_bytes(image.convert(channels).tobytes())
            print(json.dumps({"size": image.size, "mode": image.mode, "format": image.format}))
    elif mode == "plates":
        overview, closeup, pebbles, destination = args
        path = Path(destination)
        paper, ink, muted = "#e9e4d9", "#292e2d", "#545b57"
        def font(name, size):
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                return ImageFont.load_default()
        title = font("DejaVuSerif.ttf", 31)
        small = font("DejaVuSansMono.ttf", 16)
        with Image.open(overview) as source, Image.open(closeup) as detail:
            width = source.width+detail.width+72
            plate = Image.new("RGB", (width, source.height+125), paper)
            draw = ImageDraw.Draw(plate)
            draw.text((24, 21), "Riverbed at dusk", fill=ink, font=title)
            draw.text((24, 69), "2 × 2  /  2.4 × 2.4 m", fill=muted, font=small)
            draw.text((48+source.width, 69), "Detail  /  150 mm across", fill=muted, font=small)
            plate.paste(source, (24, 98))
            plate.paste(detail, (48+source.width, 98))
            plate.save(path/"shore-preview.png", optimize=True)
        with Image.open(pebbles) as source:
            plate = Image.new("RGB", (source.width+48, source.height+130), paper)
            draw = ImageDraw.Draw(plate)
            draw.text((24, 20), "Riverbed pebbles", fill=ink, font=title)
            draw.text((24, 65), "Plan above · profile below · same unit scale", fill=muted, font=small)
            rgba = source.convert("RGBA")
            plate.paste(rgba, (24, 88), rgba.getchannel("A"))
            for index, (_, _, _, _, label) in enumerate(FORMS):
                x = 24+(index+.5)*source.width/len(FORMS)
                draw.text((x, source.height+101), f"{index+1:02d}  {label}", fill=ink, font=small, anchor="mt")
            plate.save(path/"pebbles-preview.png", optimize=True)


def pillow(mode, *args):
    try:
        import PIL
    except ImportError:
        python = shutil.which("python3")
        require(python, "Pillow is required in Blender or system python3")
        result = subprocess.run([python, str(Path(__file__).resolve()), "--image-io", mode, *map(str, args)],
                                check=True, capture_output=True, text=True)
        return json.loads(result.stdout) if result.stdout else None
    if mode == "decode":
        from contextlib import redirect_stdout
        from io import StringIO
        with redirect_stdout(StringIO()) as output:
            image_io(mode, *map(str, args))
        return json.loads(output.getvalue())
    image_io(mode, *map(str, args))
    return None


def srgb_to_linear(rgb):
    return np.where(rgb <= .04045, rgb/12.92, ((rgb+.055)/1.055)**2.4)


def set_attributes(mesh, color, roughness, local=None):
    rgba = np.c_[srgb_to_linear(color), np.ones(len(color), dtype=np.float32)]
    mesh.attributes.new("bed_color", "FLOAT_COLOR", "POINT").data.foreach_set("color", rgba.astype(np.float32).ravel())
    mesh.attributes.new("bed_roughness", "FLOAT", "POINT").data.foreach_set("value", np.asarray(roughness, dtype=np.float32))
    if local is not None:
        mesh.attributes.new("pebble_space", "FLOAT_VECTOR", "POINT").data.foreach_set(
            "vector", local.astype(np.float32).ravel())


def attribute(shader, name):
    node = shader.node("ShaderNodeAttribute", name)
    node.attribute_name = name
    return node.outputs


def bed_material(name, stone=False, standalone=False):
    mat, bsdf = material(name)
    g = Shader(mat)
    base = attribute(g, "bed_color")["Color"]
    rough = attribute(g, "bed_roughness")["Fac"]
    if stone:
        local = attribute(g, "pebble_space")["Vector"]
        grains = g.noise(local, 15, 2., "Fine lithic grains", .23)
        mottling = g.noise(local, 3.8, 2., "Weathering in the stone matrix", .42)
        tone = g.math("MULTIPLY_ADD", mottling, .55)
        tone.node.inputs[2].default_value = .725
        tint = g.node("ShaderNodeVectorMath", "Subtle weathering of the matrix")
        tint.operation = "SCALE"
        g.input(tint.inputs[0], base)
        g.input(tint.inputs["Scale"], tone)
        base = tint.outputs[0]
        rough = g.math("ADD", rough, g.math("MULTIPLY", g.math("SUBTRACT", grains, .5), .052))
        bump = g.node("ShaderNodeBump", "Stone grain relief")
        bump.inputs["Distance"].default_value = .013 if standalone else .00007
        bump.inputs["Strength"].default_value = .56
        g.input(bump.inputs["Height"], grains)
        g.input(bsdf.inputs["Normal"], bump.outputs["Normal"])
    g.input(bsdf.inputs["Base Color"], base)
    g.input(bsdf.inputs["Roughness"], rough)
    return mat


def periodic_field(rng, n, cycles_low, cycles_high):
    frequencies = np.fft.fftfreq(n)*n
    k = np.hypot(frequencies[:, None], frequencies[None, :])
    band = np.exp(-.5*(k/cycles_high)**4)*(1-np.exp(-.5*(k/cycles_low)**4))
    field = np.fft.ifft2(np.fft.fft2(rng.normal(size=(n, n)))*band).real
    return np.tanh(field/(field.std()*1.75))


def make_sand(rng):
    n = 640
    axis = np.arange(n)*math.tau/n
    x, y = np.meshgrid(axis, axis)
    coarse = periodic_field(rng, n, 2, 9)
    grit = periodic_field(rng, n, 64, 168)
    fines = periodic_field(rng, n, 155, 271)
    pockets = periodic_field(rng, n, 12, 38)
    ripples = np.sin(4*x+56*y+3.2*coarse) * (.56+.33*np.cos(5*x-3*y))
    z = .0015*coarse + .00035*pockets + .00021*ripples + .00013*grit + .000045*fines
    # Duplicate wrapped sample values and wrap the numerical derivatives too.
    # Border vertices share the same smooth normals once the tile is repeated.
    dzdx = (np.roll(z, -1, 1)-np.roll(z, 1, 1))/(2*TILE/n)
    dzdy = (np.roll(z, -1, 0)-np.roll(z, 1, 0))/(2*TILE/n)
    def edges(field):
        return np.pad(field, ((0, 1), (0, 1)), mode="wrap")
    points = np.column_stack([a.ravel() for a in (*np.meshgrid(np.arange(n+1)*TILE/n,
                                                              np.arange(n+1)*TILE/n), edges(z))])
    corners = np.arange((n+1)**2).reshape(n+1, n+1)
    faces = np.stack((corners[:-1, :-1], corners[:-1, 1:], corners[1:, 1:], corners[1:, :-1]), axis=-1)
    mesh = bpy.data.meshes.new("Periodic coarse sand")
    # Populate the regular grid directly to keep memory down with a dense metric sand mesh.
    mesh.vertices.add(len(points))
    mesh.vertices.foreach_set("co", points.astype(np.float32).ravel())
    mesh.loops.add(faces.size)
    mesh.loops.foreach_set("vertex_index", faces.astype(np.int32).ravel())
    mesh.polygons.add(n*n)
    mesh.polygons.foreach_set("loop_start", np.arange(0, faces.size, 4, dtype=np.int32))
    mesh.polygons.foreach_set("use_smooth", np.ones(n*n, dtype=bool))
    mesh.update(calc_edges=True)
    nx, ny = edges(-dzdx), edges(-dzdy)
    normals = np.stack((nx, ny, np.ones_like(nx)), axis=-1).reshape(-1, 3)
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    mesh.normals_split_custom_set_from_vertices(normals.tolist())
    assert np.array_equal(edges(z)[0], edges(z)[-1]) and np.array_equal(edges(z)[:, 0], edges(z)[:, -1])
    tone = edges(.051*coarse + .032*pockets + .056*grit + .032*fines + .012*ripples).ravel()
    palette = np.array((.593, .570, .528))
    set_attributes(mesh, palette+tone[:, None], edges(.908+.036*grit+.013*fines).ravel())
    mesh.materials.append(bed_material("River sand · diffuse and roughness"))
    return mesh, z


def pebble_surface(form, seed, segments, bands):
    exponent, axes, lobes, _, _ = FORMS[form]
    rng = np.random.default_rng(seed)
    phase = rng.uniform(-math.pi, math.pi, 5)
    offset = rng.uniform(4, 21, 3)
    cuts = ((.85, .43, .57), (-.41, .91, .76), (.34, -.94, .83))
    def point(theta, latitude):
        t = math.sin(latitude)
        c, s = math.cos(theta), math.sin(theta)
        r = max(0., 1-abs(t)**exponent)**(1/exponent)
        outline = (abs(c)**exponent+abs(s)**exponent)**(-1/exponent)
        outline *= 1+lobes*(math.cos(3*theta+phase[0])+.47*math.sin(5*theta+phase[1]))
        if form in (2, 4):
            plane = min(d/max(.01, a*c+b*s) for a, b, d in cuts)
            outline = .48*outline+.52*min(outline, plane)
        u, v = r*outline*c, r*outline*s
        if form == 3:
            v = v*(1-.23*u)+.30*(u*u-.38)
        w = t*(1+.10*u+.068*v)+.09*(u*u-v*v)
        if form == 4:
            w -= .24*max(0., min(1., (u+.38*v)/.36))*max(0., t)
        # Several oblique harmonics keep the erosion continuous on the surface,
        # including at the poles, with phases drawn solely from this pebble's seed.
        erosion = (.58*math.sin(4.8*u+2.9*v+5.1*w+offset[0]) +
                   .28*math.sin(9.1*u-3.3*v+6.6*w+offset[1]) +
                   .14*math.sin(12.4*v+7.3*w+offset[2]))
        return np.array((u, v, w))*(1+(.033 if form in (2, 4) else .021)*erosion)
    vertices = [point(0, -math.pi/2)]
    for j in range(1, bands):
        vertices.extend(point(math.tau*i/segments, math.pi*(j/bands-.5)) for i in range(segments))
    vertices.append(point(0, math.pi/2))
    faces = []
    for i in range(segments):
        next_i = (i+1) % segments
        faces.append((0, 1+next_i, 1+i))
        for j in range(bands-2):
            a, b = 1+j*segments+i, 1+j*segments+next_i
            if (i+j)%2:
                faces.extend(((a,b,a+segments),(b,b+segments,a+segments)))
            else:
                faces.extend(((a,b,b+segments),(a,b+segments,a+segments)))
        last = len(vertices)-1-segments
        faces.append((last+i,last+next_i,len(vertices)-1))
    return np.asarray(vertices)*axes, np.asarray(faces, dtype=np.int32)


def graded_sizes(rng):
    def power_law(n, low, high, exponent):
        power = 1-exponent
        return (low**power+rng.random(n)*(high**power-low**power))**(1/power)
    fine = round(COUNT*.72)
    diameters = np.sort(np.r_[power_law(fine, .004, .014, 1.20),
                              power_law(COUNT-fine, .014, .028, 1.62)])[::-1]
    return diameters


def sample_bed(height, x, y):
    n = len(height)
    fx, fy = x*n/TILE,y*n/TILE
    i, j = int(fx),int(fy)
    u,v = fx-i,fy-j
    a,b = height[j%n,i%n], height[j%n,(i+1)%n]
    c,d = height[(j+1)%n,i%n], height[(j+1)%n,(i+1)%n]
    return (1-v)*((1-u)*a+u*b)+v*((1-u)*c+u*d)


def scatter_gravel(rng, heights, seed):
    # Larger grains settle first. The spatial hash uses periodic neighbour distances,
    # so a seed near a border excludes the same area as one in the centre.
    cells = 48
    buckets = {}
    points, faces, colors, roughness, coordinates = [], [], [], [], []
    templates = [[pebble_surface(form, seed+43*form+211*j, 16, 9) for j in range(4)] for form in range(6)]
    deposits = rng.uniform(0, math.tau, 3)
    crossings_x = crossings_y = corners = vcount = 0
    sizes = graded_sizes(rng)
    for i, diameter in enumerate(sizes):
        radius = diameter/2
        for attempt in range(1200):
            # The first coarse pebble deliberately straddles a corner, exercising
            # the diagonal copies in every seed as well as the four edge copies.
            x, y = rng.uniform(0, TILE, 2) if i else (.0025,.0035)
            p, q = math.tau*x/TILE, math.tau*y/TILE
            current = .76+.12*math.sin(3*p+2*q+deposits[0])+.10*math.sin(5*q-2*p+deposits[1])
            if rng.random() > current and i:
                continue
            cell_x,cell_y = int(x*cells/TILE),int(y*cells/TILE)
            nearby = (entry for dx in (-1,0,1) for dy in (-1,0,1)
                      for entry in buckets.get(((cell_x+dx)%cells,(cell_y+dy)%cells), ()))
            if any(math.hypot(min(abs(x-u),TILE-abs(x-u)), min(abs(y-v),TILE-abs(y-v)))
                   < .73*(radius+r) for u,v,r in nearby):
                continue
            break
        else:
            raise ValueError("Could not place the specified gravel distribution")
        buckets.setdefault((cell_x,cell_y),[]).append((x,y,radius))
        form = int(rng.choice(6, p=(.22,.20,.18,.15,.17,.08)))
        shape, topology = templates[form][int(rng.integers(4))]
        burial = rng.uniform(-.31, .06)
        pitch, roll = rng.uniform(-.27,.27,2)
        azimuth = rng.uniform(-math.pi,math.pi)
        orient = (Matrix.Rotation(azimuth,3,"Z") @ Matrix.Rotation(pitch,3,"Y") @ Matrix.Rotation(roll,3,"X"))
        local = shape*np.array((1.,rng.uniform(.76,1.0),rng.uniform(.39,.66)))
        local = local @ np.asarray(orient).T
        local *= diameter/max(np.ptp(local,axis=0)[:2])
        metric = local + (x,y,sample_bed(heights,x,y)+burial*radius)
        mn,mx = metric.min(axis=0),metric.max(axis=0)
        cross_x,cross_y = mn[0]<0 or mx[0]>TILE, mn[1]<0 or mx[1]>TILE
        crossings_x += cross_x
        crossings_y += cross_y
        corners += cross_x and cross_y
        rock_color = np.array(FORMS[form][3])+rng.uniform(-.052,.044)
        if i%119 == 0:
            rock_color = np.array((.668,.674,.668))
        blemishes = .046*np.sin(shape[:,0]*2+shape[:,1]*3+deposits[2]+i)
        colors.append(np.clip(rock_color+blemishes[:,None], .408, .687))
        roughness.append(np.full(len(shape), rng.uniform(.646,.746)) + .016*shape[:,1])
        coordinates.append(shape+rng.uniform(1,50,3))
        points.append(metric)
        faces.append(topology+vcount)
        vcount += len(shape)
    obj = mesh_object("River gravel · tile geometry", np.concatenate(points), np.concatenate(faces))
    obj.data.materials.append(bed_material("Low-saturation drift gravel", stone=True))
    set_attributes(obj.data, np.concatenate(colors), np.concatenate(roughness), np.concatenate(coordinates))
    report = dict(count=len(sizes), diametersMm=[float(sizes.min()*1000),float(sizes.max()*1000)],
                  countsUnder14Mm=int((sizes<.014).sum()), countsAtLeast14Mm=int((sizes>=.014).sum()),
                  diameterPowerLawExponents=[1.20,1.62], crossesX=int(crossings_x), crossesY=int(crossings_y),
                  crossesCorner=int(corners), periodicCopiesPerMesh=8, gravelTriangles=len(obj.data.polygons),
                  positionsSha256=hashlib.sha256(np.asarray(points,dtype="<f4").tobytes()).hexdigest())
    require(crossings_x > 0 and crossings_y > 0 and corners > 0,"Expected physical gravel across both seams and a corner")
    return obj, report


def plane(name, width, repeats=1):
    points = np.array([(0,0,0),(width,0,0),(width,width,0),(0,width,0)])
    obj = mesh_object(name, points, [(0,1,2,3)])
    layer = obj.data.uv_layers.new(name="Tile UV")
    for loop, uv in zip(layer.data, ((0,0),(repeats,0),(repeats,repeats),(0,repeats))):
        loop.uv = uv
    return obj


def build_source(seed):
    rng = np.random.default_rng(seed)
    sand_mesh, heights = make_sand(rng)
    sand = bpy.data.objects.new("River sand · central tile", sand_mesh)
    bpy.context.collection.objects.link(sand)
    gravel, report = scatter_gravel(rng, heights, seed)
    originals = [sand, gravel]
    sources = originals.copy()
    offsets = [(dx,dy) for dx in (-1,0,1) for dy in (-1,0,1) if (dx,dy)!=(0,0)]
    for dx, dy in offsets:
        for obj in originals:
            copy = bpy.data.objects.new(f"{obj.name} ({dx:+d}, {dy:+d})", obj.data)
            copy.location = (dx*TILE, dy*TILE, 0)
            bpy.context.collection.objects.link(copy)
            sources.append(copy)
    bpy.context.view_layer.update()
    require(all(sources[2+2*i+j].data == originals[j].data
                and np.allclose(sources[2+2*i+j].location, (dx*TILE,dy*TILE,0), atol=1e-7)
                for i,(dx,dy) in enumerate(offsets) for j in range(2)), "Invalid periodic copies")
    top = max(v.co.z for v in gravel.data.vertices)
    require(top < .033, f"Stone top above projection cage: {top}")
    report.update(sandVertices=len(sand_mesh.vertices), sandQuads=len(sand_mesh.polygons),
                  sandHeightMm=[float(heights.min()*1000),float(heights.max()*1000)],
                  sourceMeshInstances=len(sources), northSouthAndEastWestIdentical=True,
                  maximumGravelElevationMm=float(top*1000))
    return sources, report


def bake_maps(target, sources, size, cage, distance, passes, draft=False):
    scene = bpy.context.scene
    mat, bsdf = material(target.name+" · baked")
    target.data.materials.append(mat)
    g = Shader(mat)
    result = {}
    select_only(target)
    for source in sources:
        source.select_set(True)
    for channel, bake_type in passes:
        scene.cycles.samples = 1
        if channel == "ao":
            # Cast at the actual hit on the high mesh, including occlusion from both meshes
            # and from the eight periodic neighbours. No lighting gets baked into albedo.
            for source_mat in {m for obj in sources for m in obj.data.materials}:
                h = Shader(source_mat)
                ao = h.node("ShaderNodeAmbientOcclusion", "Ray-traced contact at 35 mm")
                ao.samples = 8 if draft else 32
                ao.inputs["Distance"].default_value = AO_DISTANCE
                emit = h.node("ShaderNodeEmission", "Ambient occlusion only")
                h.input(emit.inputs["Color"], ao.outputs["AO"])
                output = next(n for n in h.tree.nodes if n.type == "OUTPUT_MATERIAL")
                h.input(output.inputs["Surface"], emit.outputs[0])
        img = bpy.data.images.new(target.name+"_"+channel, width=size, height=size,
                                  alpha=False, float_buffer=True, is_data=True)
        tex = g.node("ShaderNodeTexImage", channel)
        tex.image = img
        mat.node_tree.nodes.active = tex
        options = {"pass_filter":{"COLOR"}} if bake_type == "DIFFUSE" else {}
        print(f"Baking {target.name} {channel} at {size}²", flush=True)
        status = bpy.ops.object.bake(type=bake_type, use_selected_to_active=True,
                                     cage_extrusion=cage, max_ray_distance=distance,
                                     margin=0 if channel == "ao" or size >= 512 else 12,
                                     normal_space="TANGENT", normal_g="POS_Y", **options)
        require("FINISHED" in status, f"{target.name}: {channel} bake failed")
        result[channel] = tex
    return result, g, bsdf


def pixels(image):
    width, height = image.size
    data = np.empty(width*height*4, dtype=np.float32)
    image.pixels.foreach_get(data)
    return np.flipud(data.reshape(height,width,4)).copy()[:,:,:3]


def linear_to_srgb(data):
    return np.where(data <= .0031308, data*12.92, 1.055*np.maximum(data,0)**(1/2.4)-.055)


def albedo_headroom(data):
    # Leave a few code values on either side for overshoot in the WebP encoder.
    luma = data @ np.array((.2126,.7152,.0722),dtype=np.float32)
    return data+(np.clip(luma,.428,.675)-luma)[:,:,None]


def blur_repeat(data, weight):
    horizontal = (1-2*weight)*data + weight*(np.roll(data,1,1)+np.roll(data,-1,1))
    return (1-2*weight)*horizontal + weight*(np.roll(horizontal,1,0)+np.roll(horizontal,-1,0))


def edge_stats(pix):
    values = pix.astype(np.float32)
    report = {}
    for axis, label in ((0,"topBottom"),(1,"leftRight")):
        v = np.moveaxis(values, axis, 0)
        rmse = lambda diff: float(np.sqrt(np.mean(np.square(diff))))
        report[label] = dict(rmse8Bit=rmse(v[0]-v[-1]),
                             referenceAdjacentRmse8Bit=rmse(v[1]-v[0])*.5+rmse(v[-1]-v[-2])*.5)
    return report


def reconcile_edges(data, guard):
    # Opposite edge samples straddle the same boundary by half a texel. Store
    # their midpoint at both ends, leaving the rest of the projected bake intact.
    for axis in (0,1):
        edge = np.moveaxis(data,axis,0)
        edge[0] = edge[-1] = (edge[0]+edge[-1])*.5
        for offset in range(1,guard):
            strength = .5*(1-offset/guard)**2
            delta = strength*(edge[-1-offset]-edge[offset])
            edge[offset] += delta
            edge[-1-offset] -= delta
    return data


def write_tile(asset, work, textures, size, draft):
    report = {}
    scratch = work/"pixels.raw"
    for name, (file,mode,quality,floor,limit) in MAPS.items():
        tex = textures[name].image
        data = pixels(tex)
        if name == "albedo":
            data = albedo_headroom(linear_to_srgb(data))
        if mode == "L":
            data = data[:,:,0]
        raw = edge_stats(data*255)
        for axis, stats in raw.items():
            require(stats["rmse8Bit"] <= 1.6*stats["referenceAdjacentRmse8Bit"]+1.1,
                    f"{name} {axis}: discontinuity in the raw periodic bake {stats}")
        if name == "ao":
            # Suppress sampling grain while keeping millimetre-scale contact shadows.
            data = blur_repeat(data, .22)
        if name == "roughness":
            # Filter the sub-texel sand/pebble transition before the WebP encode.
            data = blur_repeat(data, .28)
        dest = asset/file
        # The normal map is encoded losslessly. Bound any quantization required by
        # the size budget, preserving unit normals and preserving the original UVs.
        steps = (1,) if draft or name != "normal" else (5,6,7,8)
        if name == "roughness":
            steps = (12,14,15)
        qualities = [quality]
        if name == "ao":
            qualities = [quality, 76, 70, 65, 60, 55, 88, 94, 100]
        candidates = []
        for step in steps:
            clipped = np.clip(reconcile_edges(data.copy(), 1 if name in ("normal","roughness") else 5),0,1)
            if name == "roughness":
                # Preserve the quantized linear values in WebP without ringing at a
                # contact edge. Keep the codes inside the dry mineral range.
                clipped = np.clip(np.rint((clipped*255-160)/step)*step+160,159,244)/255
            if name == "normal" and step > 1:
                xy = np.clip(np.rint((clipped[:,:,:2]*255-128)/step)*step+128,0,255)
                vec = xy/255*2-1
                z = np.sqrt(np.maximum(0,1-np.sum(vec**2,axis=2)))
                blue = 255 - np.rint((1-z)*127.5/step)*step
                clipped = np.dstack((xy/255, np.maximum(128,blue)/255))
            scratch.write_bytes(np.rint(clipped*255).astype(np.uint8).tobytes())
            for q in qualities:
                pillow("encode", scratch, size, mode, dest, q)
                count = dest.stat().st_size
                candidates.append((abs(count-min(max(count,floor),limit)),step,q,dest.read_bytes()))
                if draft or floor <= count <= limit:
                    break
            if draft or floor <= dest.stat().st_size <= limit:
                break
        if not draft:
            best = min(candidates,key=lambda it:it[0])
            if not floor <= dest.stat().st_size <= limit:
                dest.write_bytes(best[3])
                step,q = best[1:3]
        meta = pillow("decode", dest, mode, scratch)
        pic = np.frombuffer(scratch.read_bytes(),dtype=np.uint8).reshape(data.shape)
        edges = edge_stats(pic)
        require(meta["size"] == [size,size] and meta["format"] == ("PNG" if name == "normal" else "WEBP"),
                f"Incorrect {file} format or size")
        require(name != "normal" or meta["mode"] == "RGB", "Normal PNG must be 8-bit RGB")
        for axis, stats in edges.items():
            require(stats["rmse8Bit"] <= (0 if name == "normal" else 4), f"{file} {axis}: {stats}")
        report[name] = dict(path=file, **meta, fileBytes=dest.stat().st_size, quality=q,
                            normalQuantization8BitStep=step if name=="normal" else None,
                            rawEdges=raw, encodedEdges=edges, sha256=hashlib.sha256(dest.read_bytes()).hexdigest())
        if name == "albedo":
            luma = pic @ np.array((.2126,.7152,.0722))/255
            require(luma.min()>=.38 and luma.max()<=.72,
                    f"Albedo outside the natural sRGB brightness envelope: {luma.min():.4f}–{luma.max():.4f}")
            chroma = (pic.max(axis=2).astype(float)-pic.min(axis=2))/255
            require(float(np.max(chroma)) <= .18,"Stone palette is too saturated")
            report[name].update(srgbLuminanceMinMax=[float(luma.min()),float(luma.max())],
                                maxChannelSpread=float(chroma.max()))
        elif name == "normal":
            vectors = pic.astype(np.float32)/127.5-1
            require(float(pic[:,:,2].min()) >= 127 and np.std(vectors[:,:,:2],axis=(0,1)).min()>.055,
                    "Flat or inverted tangent-space normal bake")
            raw_vectors = data*2-1
            cosine = np.sum(vectors*raw_vectors,axis=2)/np.maximum(
                1e-6,np.linalg.norm(vectors,axis=2)*np.linalg.norm(raw_vectors,axis=2))
            normal_error = np.degrees(np.arccos(np.clip(cosine,-1,1)))
            report[name].update(openGL=True, angularErrorP99Deg=float(np.quantile(normal_error,.99)))
            require(report[name]["angularErrorP99Deg"] <= 2.5,"Excessive normal quantization")
        else:
            report[name]["valueMinMax"] = [float(pic.min()/255),float(pic.max()/255)]
            if name == "roughness":
                report[name]["roughnessQuantization8BitStep"] = step
                require(float(pic.min()/255)>=.60 and float(pic.max()/255)<=.97,
                        f"Roughness outside rock/sand ranges: {pic.min()/255:.4f}–{pic.max()/255:.4f}")
                require(float(np.mean(pic<.79*255))>.10 and float(np.mean(pic>.85*255))>.40,"Roughness map lacks rock/sand separation")
            else:
                require(np.quantile(pic,.05)<212 and np.quantile(pic,.90)>246,"AO lacks contact contrast or open sand")
        print("Texture",name,report[name],flush=True)
    return report


def normalize_pebble(verts, form):
    dims = 2*np.array(FORMS[form][1])
    return verts*(dims/np.ptp(verts,axis=0))


def export_pebble(form, seed, assets, work):
    fresh_scene()
    name = f"pebble_{form+1:02d}"
    segments = (12,14,14,16,14,12)[form]
    coarse, faces = pebble_surface(form, seed, segments, 7)
    low = mesh_object(name, normalize_pebble(coarse,form), faces)
    select_only(low)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.origin_set(type="ORIGIN_CENTER_OF_VOLUME", center="MEDIAN")
    centroid = np.array(low.location)
    low.location = (0,0,0)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=.045)
    bpy.ops.object.mode_set(mode="OBJECT")
    fine, faces = pebble_surface(form, seed, segments*6, 42)
    verts = fine*(np.array(FORMS[form][1])*2/np.ptp(coarse,axis=0))-centroid
    high = mesh_object(name+" · sculpt", verts, faces)
    base = np.array(FORMS[form][3])
    speckle = .045*np.sin(fine[:,0]*4+fine[:,1]*3+fine[:,2]*.8)
    if form == 4:
        # Follow the form's chipped edge with faint sediment lamination.
        speckle += .038*np.sin(19*fine[:,2]+2*fine[:,0])
    set_attributes(high.data, base+speckle[:,None], .69+.027*fine[:,2], fine+form*5)
    high.data.materials.append(bed_material(name+" · rock", stone=True, standalone=True))
    channels, g, bsdf = bake_maps(low, [high], 256, .32, .80,
                                  (("albedo","DIFFUSE"),("normal","NORMAL"),("roughness","ROUGHNESS")))
    for key, tex in channels.items():
        # Blender stores float bakes in linear space. Pack albedo as sRGB; leave
        # the two data maps linear when the exporter synthesizes WebP textures.
        old = tex.image
        image = bpy.data.images.new(name+"_"+key, width=256, height=256, alpha=False, is_data=key!="albedo")
        rgb = pixels(old)
        if key == "albedo":
            rgb = linear_to_srgb(rgb)
        rgba = np.dstack((rgb, np.ones(rgb.shape[:2],dtype=np.float32)))
        image.pixels.foreach_set(np.ascontiguousarray(rgba[::-1],dtype=np.float32).ravel())
        image.update()
        tex.image = image
        bpy.data.images.remove(old)
    normal = g.node("ShaderNodeNormalMap", "OpenGL tangent space")
    g.input(normal.inputs["Color"],channels["normal"].outputs["Color"])
    g.input(bsdf.inputs["Normal"],normal.outputs["Normal"])
    g.input(bsdf.inputs["Base Color"],channels["albedo"].outputs["Color"])
    g.input(bsdf.inputs["Roughness"],channels["roughness"].outputs["Color"])
    bsdf.inputs["Metallic"].default_value = 0
    bpy.data.objects.remove(high,do_unlink=True)
    select_only(low)
    path = assets/(name+".glb")
    for q in (93,88,83,78,74,97,100):
        status = bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                    export_yup=True, export_apply=True, export_normals=True, export_tangents=True,
                    export_image_format="WEBP", export_image_quality=q, export_cameras=False,
                    export_animations=False, export_lights=False)
        require("FINISHED" in status, f"Could not export {name}")
        if 25_000<=path.stat().st_size<=70_000:
            break
    return verify_pebble(path,work)


def verify_pebble(path,work):
    stored = Glb(path)
    doc = stored.doc
    require(len(doc["meshes"])==len(doc["nodes"])==len(doc["materials"])==1, "Expected one object per GLB")
    require(doc["nodes"][0]=={"mesh":0,"name":path.stem}, "Pebble node is not an identity root")
    primitive, = doc["meshes"][0]["primitives"]
    pos = stored.accessor(primitive["attributes"]["POSITION"])
    indices = stored.accessor(primitive["indices"]).reshape(-1,3)
    xyz, weld = np.unique(pos,axis=0,return_inverse=True)
    bm = bmesh.new()
    try:
        v = [bm.verts.new(p) for p in xyz.tolist()]
        for a,b,c in weld.reshape(-1)[indices]:
            bm.faces.new((v[a],v[b],v[c]))
        bm.verts.index_update()
        bm.normal_update()
        detail = geometry(bm)
    finally:
        bm.free()
    require(120<=detail["triangles"]<=220 and 25_000<=path.stat().st_size<=70_000, f"{path.stem}: GLB budget")
    require(all(1.70<=x<=2.30 for x in detail["dimensionsM"]) and detail["centroidErrorMm"]<.001,
            f"{path.stem}: not centred or normalized")
    mat, = doc["materials"]
    pbr = mat["pbrMetallicRoughness"]
    require(len(doc["images"]) == 3 and all(i["mimeType"]=="image/webp" and "uri" not in i for i in doc["images"]),
            f"{path.stem}: expected three embedded WebP images")
    mask, coverage, overlap = uv_mask(stored.accessor(primitive["attributes"]["TEXCOORD_0"]),indices)
    # uv_mask in the shared factory uses its own 512² rasterization.
    require(coverage>.25 and overlap<.001 and mask.any(), f"{path.stem}: insufficient UV coverage")
    report = {}
    for channel, info in (("albedo",pbr["baseColorTexture"]),("normal",mat["normalTexture"]),
                          ("roughness",pbr["metallicRoughnessTexture"])):
        tex = doc["textures"][info["index"]]
        src = tex.get("extensions",{}).get("EXT_texture_webp",tex)["source"]
        payload = work/"embedded.webp"
        payload.write_bytes(stored.view(doc["images"][src]["bufferView"]))
        raw = work/"embedded.raw"
        metadata = pillow("decode",payload,"RGB",raw)
        require(metadata["size"]==[256,256], f"{path.stem}: wrong embedded resolution")
        rgb = np.frombuffer(raw.read_bytes(),dtype=np.uint8).reshape(256,256,3)
        on_surface = mask[::2,::2]
        data = rgb[on_surface].astype(np.float32)/255
        if channel=="albedo":
            luma = data@np.array((.2126,.7152,.0722))
            require(.35<float(np.median(luma))<.72 and luma.std()>.014,f"{path.stem}: weak albedo bake {np.median(luma)}")
        if channel=="normal":
            require(data[:,:2].std(axis=0).min()>.012, f"{path.stem}: missing normal relief")
        if channel=="roughness":
            require(.60<float(np.median(data[:,1]))<.80, f"{path.stem}: wrong dry roughness")
        report[channel] = dict(size=metadata["size"],format=metadata["format"],bytes=payload.stat().st_size)
    detail["gltfDimensions"] = detail.pop("dimensionsM")
    return dict(id=path.stem, fileBytes=path.stat().st_size, sha256=stored.digest, identityTransform=True,
                textureMaps=report, **detail)


def render_setup(width,height,transparent=False,samples=32):
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.film_transparent = transparent
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.view_settings.view_transform = "AgX"
    scene.world = bpy.data.worlds.new("Cool dusk sky")
    scene.world.use_nodes = True
    background = next(n for n in scene.world.node_tree.nodes if n.type=="BACKGROUND")
    background.inputs["Color"].default_value = (.64,.74,1.,1.)
    background.inputs["Strength"].default_value = .48
    sun("Low amber evening sun", (-.95,.39,.27), (1.,.73,.48), 2.5, 8)
    sun("Blue sky bounce", (.45,.27,.85), (.60,.73,1.), .85, 34)
    return scene


def set_camera(scene, location, target, scale):
    data = bpy.data.cameras.new("Orthographic")
    data.type = "ORTHO"
    data.ortho_scale = scale
    data.clip_start = .001
    obj = bpy.data.objects.new("Orthographic", data)
    bpy.context.collection.objects.link(obj)
    scene.camera = obj
    obj.location = location
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()


def render_png(scene, path):
    scene.render.filepath = str(path)
    status = bpy.ops.render.render(write_still=True)
    require("FINISHED" in status and path.is_file(), f"Failed to render {path}")


def render_tile(assets,work,draft):
    fresh_scene()
    surface = plane("Two by two copies of the exported texture",2*TILE,2)
    mat, bsdf = material("Published 2K riverbed")
    g = Shader(mat)
    surface.data.materials.append(mat)
    maps = {}
    for channel in MAPS:
        tex = g.node("ShaderNodeTexImage", channel)
        tex.image = bpy.data.images.load(str(assets/MAPS[channel][0]))
        tex.image.colorspace_settings.name = "sRGB" if channel=="albedo" else "Non-Color"
        tex.extension = "REPEAT"
        maps[channel] = tex.outputs["Color"]
    # Apply the baked AO inside the preview shader so contacts remain visible even
    # under studio fill. The distributed albedo is the unlit diffuse bake.
    occlusion = g.math("MULTIPLY_ADD",maps["ao"],.83)
    occlusion.node.inputs[2].default_value = .17
    color = g.vector("MULTIPLY", maps["albedo"], occlusion)
    g.input(bsdf.inputs["Base Color"],color)
    normal = g.node("ShaderNodeNormalMap","OpenGL tangent space")
    normal.inputs["Strength"].default_value = 1.25
    g.input(normal.inputs["Color"],maps["normal"])
    g.input(bsdf.inputs["Normal"],normal.outputs["Normal"])
    g.input(bsdf.inputs["Roughness"],maps["roughness"])
    scene = render_setup(1450 if not draft else 760,940 if not draft else 500,samples=24 if not draft else 8)
    set_camera(scene,(1.50,-1.12,4.45),(1.2,1.2,0),4.12)
    render_png(scene,work/"tile.png")
    scene.render.resolution_x = 600 if not draft else 310
    # Detail is centred on the intersection of four independently tiled quadrants.
    set_camera(scene,(1.229,1.12,1.33),(1.2,1.2,0),.235)
    render_png(scene,work/"tile-detail.png")


def render_pebbles(assets,work,draft):
    fresh_scene()
    scene = render_setup(1740 if not draft else 1140,590 if not draft else 415,
                         transparent=True,samples=32 if not draft else 12)
    scale = 17.5
    set_camera(scene,(0,0,10),(0,0,0),scale)
    for i, path in enumerate(sorted(assets.glob("pebble_*.glb"))):
        status = bpy.ops.import_scene.gltf(filepath=str(path))
        require("FINISHED" in status,f"Cannot read {path}")
        top = bpy.context.selected_objects[0]
        half_height = scale*scene.render.resolution_y/scene.render.resolution_x/2
        x = (i+.5)*scale/6-scale/2
        top.location = (x,half_height*.50,0)
        side = bpy.data.objects.new(path.stem+" · side view",top.data)
        bpy.context.collection.objects.link(side)
        side.rotation_euler.x = -math.pi/2
        side.location = (x,-half_height*.50,0)
    render_png(scene,work/"pebbles.png")


def publish(root,staging):
    locations = [(root/ASSETS,staging/"assets"),(root/DELIVERY,staging/"delivery")]
    with catalog_lock(root/ASSETS):
        completed = []
        try:
            for dest,source in locations:
                dest.parent.mkdir(parents=True,exist_ok=True)
                previous = staging/(source.name+".previous")
                if dest.exists():
                    dest.replace(previous)
                completed.append((dest,source,previous))
                source.replace(dest)
        except OSError:
            for dest,source,previous in reversed(completed):
                if dest.exists():
                    dest.replace(source)
                if previous.exists():
                    previous.replace(dest)
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed",type=int,default=SEED)
    parser.add_argument("--output-root",type=Path,default=ROOT)
    parser.add_argument("--draft",action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    require(bpy.app.background,"Run in background Blender (-b)")
    root = args.output_root.resolve()
    require(not args.draft or root != ROOT,"Use a separate --output-root for draft bakes")
    require(args.seed>=0,"Seed must be non-negative")
    root.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".shore-bake-",dir=root) as temporary:
        stage = Path(temporary)
        assets,delivery = stage/"assets",stage/"delivery"
        assets.mkdir()
        delivery.mkdir()
        fresh_scene()
        sources,distribution = build_source(args.seed)
        print("Projected source",distribution,flush=True)
        target = plane("Orthographic shore tile",TILE)
        # The bake target must not block the rays from the source surface into the gaps.
        target.visible_shadow = False
        target.visible_diffuse = False
        size = 512 if args.draft else 2048
        tex,_,_ = bake_maps(target,sources,size,.035,.052,
                   (("albedo","DIFFUSE"),("normal","NORMAL"),("roughness","ROUGHNESS"),("ao","EMIT")),args.draft)
        maps = write_tile(assets,stage,tex,size,args.draft)
        if not args.draft:
            require(all(low<=maps[name]["fileBytes"]<=high for name,(_,_,_,low,high) in MAPS.items()),
                    "Shore textures outside delivery size budgets")
        pebbles = [export_pebble(i,args.seed+52483*i,assets,stage) for i in range(len(FORMS))]
        require(len({p["sha256"] for p in pebbles})==6,"Duplicate background pebble")
        render_tile(assets,stage,args.draft)
        render_pebbles(assets,stage,args.draft)
        pillow("plates",stage/"tile.png",stage/"tile-detail.png",stage/"pebbles.png",delivery)
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")
        def url(file):
            return f"/assets/shore/{file}"
        manifest = dict(version=1,generatedAt=stamp,tileSizeMeters=TILE,
                        textures={key:url(value[0]) for key,value in MAPS.items()},
                        pebbles=[dict(id=p["id"],glbPath=url(p["id"]+".glb")) for p in pebbles])
        write_json(assets/"manifest.json",manifest)
        write_json(delivery/"validation-report.json",dict(version=1,generatedAt=stamp,allPassed=True,
                   blender=bpy.app.version_string,engine="Cycles",seed=args.seed,draft=args.draft,tileSizeMeters=TILE,
                   scatter=distribution,ambientOcclusion=dict(samples=8 if args.draft else 32,distanceMeters=AO_DISTANCE,
                   rayTraced=True), textures=maps,pebbles=pebbles,
                   previews={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in delivery.glob("*.png")}))
        expected = {"manifest.json",*(v[0] for v in MAPS.values()),*(p["id"]+".glb" for p in pebbles)}
        require({p.name for p in assets.iterdir()}==expected, "Unrecognized output in shore catalog")
        publish(root,stage)
        print(f"Published {len(expected)} shoreline assets and 3 acceptance artifacts at {root}",flush=True)


if __name__ == "__main__":
    if "--image-io" in sys.argv:
        image_io(*sys.argv[sys.argv.index("--image-io")+1:])
    else:
        main()
