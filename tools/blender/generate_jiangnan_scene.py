"""Generate the Jiangnan waterside collection in a separate Blender process.

    blender -b --factory-startup -t 8 --python-exit-code 1 -P tools/blender/generate_jiangnan_scene.py --

Use --seed to change the texture weathering and canopy scatter, and --output-root
to render into an isolated directory. The preview compositor uses system Pillow
when it is not installed in Blender's Python.
"""

import argparse
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
ASSETS = Path("public/assets/scenes/jiangnan")
PREVIEW = Path("tools/blender/preview_jiangnan_assets.png")
TAU = 2 * math.pi

if "--compose-preview" not in sys.argv:
    import bpy
    import numpy as np
    from mathutils import Vector

    sys.dont_write_bytecode = True
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from generate_stones import Glb, catalog_lock, fresh_scene, material, require, select_only, sun, write_json


@dataclass(frozen=True)
class Asset:
    name: str
    title: str
    caption: str
    use: str
    triangles: tuple[int, int]
    size: int
    bottom: tuple[float, float]
    top: tuple[float, float]
    camera: tuple[float, float, float]


PACK = (
    Asset("pavilion", "江南六角水榭", "Hexagonal water pavilion", "水中近岸主建筑，原点对齐静水面", (8000, 14000), 1024, (-1.201, -1.199), (5.55, 5.65), (4.0, -9.5, 1.6)),
    Asset("wupeng_boat", "乌篷木船", "Wupeng boat", "近中景漂浮船，船头朝 +X，原点对齐吃水线", (4500, 8000), 1024, (-.60, -.35), (.61, .75), (3.7, -7, 3.6)),
    Asset("distant_pagoda", "五层八角古塔", "Five-storey pagoda", "距视点 75–95 m 的远岸轮廓，原点为基座接地面", (1500, 3000), 1024, (-.02, .02), (17.8, 18.2), (5, -9, 3.0)),
    Asset("willow_tree", "岸边垂柳", "Weeping willow", "近中景岸边树冠与柳丝，原点为根颈接地面", (5000, 9000), 1024, (-.151, -.149), (7.35, 7.65), (4, -10, 3.1)),
    Asset("lotus_leaf_flat", "贴水荷叶", "Floating lotus leaf", "水面大片荷叶，适合沿塘岸成簇放置", (300, 600), 512, (-.60, -.35), (.015, .075), (2.5, -7, 6)),
    Asset("lotus_leaf_tall", "挺水荷叶", "Raised lotus leaf", "挺水高茎荷叶，放在贴水荷叶与花之间", (400, 700), 512, (-.46, -.44), (.35, .50), (2.5, -7, 5.5)),
    Asset("lotus_leaf_curled", "半卷嫩荷", "Curled young leaf", "半卷嫩叶，用于荷叶群边缘与高低过渡", (350, 600), 512, (-.60, -.35), (.18, .25), (3, -7, 5)),
    Asset("lotus_flower_open", "粉白盛荷", "Open lotus flower", "近景花冠及中央莲蓬，原点对齐静水面", (800, 1400), 512, (-.60, -.35), (.47, .53), (2.5, -7, 6.5)),
    Asset("lotus_flower_bud", "胭脂荷苞", "Lotus bud", "荷塘含苞点缀，原点对齐静水面", (350, 600), 512, (-.60, -.35), (.37, .40), (2.7, -7, 4.5)),
)

TIMBER, DECK, TILE, STONE, PLASTER, PAPER, METAL, WICKER = range(8)
LEAF, STEM, PETAL, POD, POLLEN, BARK, WILLOW, BRICK = range(8, 16)
ATLAS_SIDE = 4


def v3(p):
    return np.asarray(p, dtype=float)


def polar(radius, angle, z):
    return (radius*math.cos(angle), radius*math.sin(angle), z)


def mix(a, b, t):
    return (1-t)*v3(a)+t*v3(b)


def smooth(x):
    x = np.clip(x, 0., 1.)
    return x*x*(3-2*x)


class Model:
    """Collect mesh faces with conventional per-corner UVs and a shared material atlas."""

    def __init__(self, name):
        self.name = name
        self.xyz = []
        self.faces = []
        self.corners = []
        self.groups = []
        self.smoothed = []

    def vertex(self, p):
        self.xyz.append(tuple(p))
        return len(self.xyz)-1

    def face(self, verts, uv, slot, group=0, shade=True):
        self.faces.append(tuple(verts))
        self.corners.extend((slot, u, v) for u, v in uv)
        self.groups.append(group)
        self.smoothed.append(shade)

    def grid(self, point, nu, nv, slot, uv=None, group=0, flip=False, shade=True):
        coords = [(i/nu, j/nv) for i in range(nu+1) for j in range(nv+1)]
        verts = [self.vertex(point(u, v)) for u,v in coords]
        tex = [uv(u,v) for u,v in coords] if uv else coords
        for i in range(nu):
            for j in range(nv):
                k = i*(nv+1)+j
                order = (k, k+nv+1, k+nv+2, k+1)
                if flip:
                    order = order[::-1]
                self.face([verts[a] for a in order], [tex[a] for a in order], slot, group, shade)

    def tube(self, path, radii, sides, slot, group=0, shade=True, phase=0.):
        path = np.asarray(path, dtype=float)
        rings = []
        for i, (p, radius) in enumerate(zip(path, radii)):
            tangent = Vector(path[min(i+1,len(path)-1)]-path[max(i-1,0)]).normalized()
            reference = Vector((0,0,1)) if abs(tangent.z)<.94 else Vector((0,1,0))
            x = v3(reference.cross(tangent).normalized())
            y = v3(tangent.cross(Vector(x)))
            rings.append([self.vertex(p+radius*(x*math.cos(a)+y*math.sin(a)))
                          for a in (TAU*j/sides+phase for j in range(sides))])
        for i in range(len(rings)-1):
            v, w = i/(len(rings)-1), (i+1)/(len(rings)-1)
            for j in range(sides):
                k = (j+1)%sides
                a, b = j/sides, (j+1)/sides
                self.face((rings[i][j], rings[i][k], rings[i+1][k], rings[i+1][j]),
                          ((a,v),(b,v),(b,w),(a,w)), slot, group, shade)
        cap = [(.5+.46*math.cos(TAU*i/sides),.5+.46*math.sin(TAU*i/sides)) for i in range(sides)]
        self.face(rings[0][::-1],cap[::-1],slot,group,False)
        self.face(rings[-1],cap,slot,group,False)

    def stack(self, x, y, profile, sides, slot, group=0, shade=False, phase=0.):
        self.tube([(x,y,z) for z,_ in profile], [r for _,r in profile], sides, slot, group, shade, phase)

    def box(self, center, dimensions, slot, angle=0.):
        x,y,z = v3(dimensions)*.5
        c,s = math.cos(angle), math.sin(angle)
        center = v3(center)
        pts = [self.vertex(center+(c*a-s*b,s*a+c*b,h)) for a,b,h in
               ((-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z))]
        for j, face in enumerate(((3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7))):
            uv = ((0,0),(0,1),(1,1),(1,0)) if j in (0,1,2,4) and x>=y else ((0,0),(1,0),(1,1),(0,1))
            self.face([pts[k] for k in face],uv,slot,shade=False)

    def beam(self, a, b, width, height, slot):
        center = mix(a,b,.5)
        dx,dy,dz = v3(b)-v3(a)
        require(abs(dz)<1e-5, "Use a tube for inclined joinery")
        self.box(center,(math.hypot(dx,dy),width,height),slot,math.atan2(dy,dx))

    def object(self, size, materials):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.xyz, [], self.faces)
        mesh.update()
        for mat in materials:
            mesh.materials.append(mat)
        layer = mesh.uv_layers.new(name="Surface atlas")
        padding = 5/(size/ATLAS_SIDE)
        for i, (slot,u,v) in enumerate(self.corners):
            inset_u = padding+(1-2*padding)*u
            inset_v = padding+(1-2*padding)*v
            layer.data[i].uv = ((slot%ATLAS_SIDE+inset_u)/ATLAS_SIDE, (slot//ATLAS_SIDE+inset_v)/ATLAS_SIDE)
        for i, polygon in enumerate(mesh.polygons):
            polygon.material_index = self.groups[i]
            polygon.use_smooth = self.smoothed[i]
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        return obj


def diffuse_noise(rng, size, low, high):
    a = np.fft.fftfreq(size)*size
    ky,kx = np.meshgrid(a,a,indexing="ij")
    k = np.hypot(kx,ky)
    band = np.exp(-.5*(k/high)**4)*(1-np.exp(-.5*(k/low)**4))
    q = np.fft.ifft2(np.fft.fft2(rng.normal(size=(size,size)))*band).real
    return np.tanh(q/(q.std()*1.65))


def willow_leaves(u,v,rng):
    """A photographed-scale frond silhouette with alternately placed lanceolate blades."""
    alpha = np.zeros_like(u)
    veins = np.zeros_like(u)
    hue = np.full_like(u,.48)
    for variant in range(2):
        center = .25+.50*variant
        wiggle = .021*np.sin(v*7+variant*1.5)
        twig = ((v>.035)&(v<.978)&(np.abs(u-center-wiggle)<.0045*(.36+v)))
        alpha = np.maximum(alpha,twig)
        hue[twig] = .31
        for i in range(19):
            age = .08+i*.046
            side = 1 if i%2==variant else -1
            anchor = center+.021*math.sin(age*7+variant*1.5)
            length = rng.uniform(.11,.18)*(.68+.32*age)
            width = rng.uniform(.018,.028)*(.83+.17*age)
            dx, dy = (u-anchor)*side, v-age
            angle = .37+.32*rng.random()
            t = (dx*math.cos(angle)-dy*math.sin(angle))/length
            across = (dx*math.sin(angle)+dy*math.cos(angle)-.020*np.sin(t*math.pi))/width
            edge = np.abs(across)-(np.sin(np.pi*np.clip(t,0,1))**.76)*(1.06-.26*t)
            leaf = (t>0)&(t<1)&(edge<0)
            alpha = np.maximum(alpha,leaf)
            veins = np.maximum(veins,leaf*np.exp(-24*across**2))
            hue[leaf] = (.50+.21*t-.08*np.abs(across)+rng.uniform(-.11,.11))[leaf]
    return alpha, veins, hue


def surface_maps(slot, n, seed):
    rng = np.random.default_rng(seed+slot*1703)
    edge = 5/n
    v,u = np.meshgrid((np.arange(n)/n-edge)/(1-2*edge),
                      (np.arange(n)/n-edge)/(1-2*edge),indexing="ij")
    cloud = diffuse_noise(rng,n,1.6,7)
    grain = diffuse_noise(rng,n,15,55)
    fine = diffuse_noise(rng,n,39,105)
    alpha = np.ones_like(u)
    pal = {
        TIMBER: ((.286,.186,.140),.66), DECK: ((.345,.253,.189),.68),
        TILE: ((.206,.253,.254),.74), STONE: ((.355,.387,.380),.81),
        PLASTER: ((.665,.641,.565),.87), PAPER: ((.894,.690,.395),.76),
        METAL: ((.265,.228,.158),.61), WICKER: ((.270,.211,.156),.76),
        LEAF: ((.318,.410,.253),.41), STEM: ((.344,.427,.266),.59),
        PETAL: ((.873,.800,.744),.54), POD: ((.557,.602,.342),.68),
        POLLEN: ((.757,.615,.294),.69), BARK: ((.324,.291,.240),.86),
        WILLOW: ((.387,.469,.259),.64), BRICK: ((.371,.334,.287),.82),
    }
    color, dry = pal[slot]
    shade = .027*cloud+.011*grain+.005*fine
    height = .085*grain+.035*fine
    if slot in (TIMBER, DECK, BARK, STEM):
        grain_coord = u+.012*np.sin(8*v+3*u)+.010*cloud
        rings = np.sin(TAU*11*grain_coord+2.1*np.sin(TAU*3*grain_coord))
        pores = np.maximum(0,np.sin(TAU*31*grain_coord+2*fine))**7
        knots = np.exp(-((u-.42)/.10)**2-((v-.68)/.16)**2)
        height += .43*rings+.28*pores+.35*knots
        shade += .022*rings-.018*pores-.021*knots
        if slot == BARK:
            cracked = abs(np.sin(TAU*8*(u+.024*np.sin(11*v)+.021*grain)))
            height -= .85*np.exp(-12*cracked)
            shade -= .047*np.exp(-9*cracked)
    elif slot == TILE:
        courses = abs((v*11+.015*grain)%1-.51)
        lip = np.exp(-((courses-.45)/.051)**2)
        height += .55*lip+.24*cloud
        shade += .036*lip-.014*cloud
    elif slot in (STONE, PLASTER, BRICK):
        specks = np.clip((fine-.52)*2.6,0,1)
        beds = np.sin(TAU*(4*v+.06*cloud+.035*u))
        height += .37*specks+.26*beds
        shade += .019*beds-.053*specks
        if slot == BRICK:
            row = np.floor(v*7)
            mortar = np.minimum(abs((v*7)%1-.5),abs((u*4+row*.5)%1-.5))
            strike = 1-smooth((mortar-.021)/.042)
            height -= .63*strike
            shade -= .053*strike
    elif slot == WICKER:
        a,b = u*18+v*7, v*19-u*6
        stripes = lambda t: .5+.5*np.cos(TAU*t)
        crossing = (np.floor(a+.5)+np.floor(b+.5))%2
        strips = stripes(a)*crossing+stripes(b)*(1-crossing)
        interstices = np.minimum(stripes(a),stripes(b))**3
        height += .85*strips+.26*interstices
        shade += .044*strips-.043*interstices
    elif slot == PAPER:
        pleat = np.cos(TAU*u*6)
        height += .23*pleat
        shade += .020*pleat+.009*np.sin(28*v+2*u)
    elif slot == LEAF:
        radius = np.hypot(u-.5,v-.5)*2
        angle = np.arctan2(v-.5,u-.5)
        sine = abs(np.sin(9*angle+1.55*radius+cloud*.25))
        veins = np.exp(-13*sine)*smooth(radius/.12)
        branches = np.exp(-10*abs(np.sin(17*angle+9.5*radius+.25*cloud)))*smooth((radius-.18)/.55)
        margin = smooth((radius-.74)/.24)
        height = height*.40 + 1.18*veins+.39*branches
        shade += .059*veins+.017*branches-.045*margin+.011*np.sin(13*radius)
    elif slot == PETAL:
        pulse = abs(np.sin(TAU*(4.5*u+.16*v+.07*cloud)))
        highlight = np.exp(-11*pulse)
        pigment = smooth((v-.40)/.62)**1.52
        base = np.asarray(color)[None,None,:]
        tip = np.asarray((.729,.430,.475))
        color = base*(1-pigment[:,:,None])+tip*pigment[:,:,None]
        height = height*.31+.39*highlight*smooth(v/.30)
        shade += .014*highlight+.014*np.sin(math.pi*v)
    elif slot == WILLOW:
        alpha, veins, hue = willow_leaves(u,v,rng)
        height += .38*veins
        shade = (hue-.55)*.22+.012*grain+.017*veins
    elif slot in (POD,POLLEN,METAL):
        dots = np.maximum(0,grain-.28)
        height -= .39*dots
        shade -= .050*dots
    rgb = np.clip(np.asarray(color)+shade[:,:,None], .04,.97)
    roughness = np.clip(dry+.072*cloud+.041*grain, .31,.98)
    dy,dx = np.gradient(height)
    normal = np.stack((-dx*.74,-dy*.74,np.ones_like(dx)),axis=-1)
    normal /= np.linalg.norm(normal,axis=2,keepdims=True)
    return rgb, roughness, normal*.5+.5, alpha


def packed_image(name, channels, data_map):
    n = len(channels)
    image = bpy.data.images.new(name, n, n, alpha=channels.shape[-1]==4, is_data=data_map)
    rgba = channels if channels.shape[-1]==4 else np.dstack((channels,np.ones((n,n))))
    image.pixels.foreach_set(np.ascontiguousarray(rgba,dtype=np.float32).ravel())
    image.update()
    image.pack()
    return image


def atlas(model, spec, seed):
    n = spec.size
    step = n//ATLAS_SIDE
    rgb = np.zeros((n,n,4 if 2 in model.groups else 3), dtype=np.float32)
    if rgb.shape[-1]==4:
        rgb[:,:,3] = 1.
    rough = np.full((n,n,3),.68,dtype=np.float32)
    normals = np.empty((n,n,3),dtype=np.float32)
    normals[:] = (.5,.5,1.)
    for slot in {c[0] for c in model.corners}:
        region = np.s_[(slot//ATLAS_SIDE)*step:(slot//ATLAS_SIDE+1)*step,
                       (slot%ATLAS_SIDE)*step:(slot%ATLAS_SIDE+1)*step]
        albedo, r, norm, mask = surface_maps(slot,step,seed)
        rgb[region][:,:,:3] = albedo
        if rgb.shape[-1]==4:
            rgb[region][:,:,3] = mask
        rough[region] = r[:,:,None]
        normals[region] = norm
    base = packed_image(spec.name+"_basecolor",rgb,False)
    grit = packed_image(spec.name+"_roughness",rough,True)
    detail = packed_image(spec.name+"_normal",normals,True)
    return base, grit, detail


def materials_for(model, spec, seed):
    images = atlas(model,spec,seed)
    materials = []
    max_group = max(model.groups)
    for group, name in enumerate(("Surface","Warm lantern paper","Willow leaves")):
        if group > max_group:
            break
        mat, shader = material(spec.name+" / "+name)
        mat.use_backface_culling = not (spec.size==512 or group==2)
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bc, rough, norm = [nodes.new("ShaderNodeTexImage") for _ in images]
        for tex, image in zip((bc,rough,norm),images):
            tex.image = image
            tex.extension = "EXTEND"
        normal = nodes.new("ShaderNodeNormalMap")
        normal.space = "TANGENT"
        links.new(norm.outputs["Color"],normal.inputs["Color"])
        links.new(normal.outputs["Normal"],shader.inputs["Normal"])
        links.new(bc.outputs["Color"],shader.inputs["Base Color"])
        links.new(rough.outputs["Color"],shader.inputs["Roughness"])
        shader.inputs["Metallic"].default_value = 0.
        if group==1:
            links.new(bc.outputs["Color"],shader.inputs["Emission Color"])
            shader.inputs["Emission Strength"].default_value = 2.1
        if group==2:
            mask = nodes.new("ShaderNodeMath")
            mask.operation = "GREATER_THAN"
            mask.inputs[1].default_value = .48
            links.new(bc.outputs["Alpha"],mask.inputs[0])
            links.new(mask.outputs[0],shader.inputs["Alpha"])
            mat.surface_render_method = "DITHERED"
        materials.append(mat)
    return materials


def lantern(m, x, y, z, radius, half):
    # Paper around a bamboo frame. The metal bands and thread use the unlit atlas material.
    m.stack(x,y,[(z-half,radius*.58),(z-half*.78,radius*.86),(z-half*.38,radius),
                (z+half*.35,radius),(z+half*.78,radius*.86),(z+half,radius*.58)],12,PAPER,1,True)
    for h in (-1,1):
        cap_z = z+h*half
        m.stack(x,y,[(cap_z-.011,radius*.59),(cap_z,radius*.68),(cap_z+.011,radius*.58)],12,METAL)
    m.tube([(x,y,z+half+.009),(x,y,z+half+.145)],[.0065,.0065],5,METAL)
    m.tube([(x,y,z-half-.006),(x+.007,y,z-half-.083),(x+.013,y+.009,z-half-.143)],
           [radius*.08,radius*.13,radius*.054],6,TIMBER)


def pavilion(m, rng):
    angle = -math.pi/2-math.pi/6
    angles = [angle+TAU*i/6 for i in range(6)]
    deck = [v3(polar(2.03,a,.45)) for a in angles]
    columns = [v3(polar(1.82,a,0)) for a in angles]
    for i, (x,y,_) in enumerate(columns):
        m.stack(x,y,[(-1.20,.25),(-1.13,.27),(-.85,.25),(.18,.22),(.22,.25),(.30,.25)],8,STONE,phase=math.pi/8)
        m.stack(x,y,[(.30,.18),(.341,.17),(.37,.14)],12,STONE)
        m.stack(x,y,[(.37,.116),(.53,.126),(1.35,.119),(2.43,.113),(2.97,.117)],14,TIMBER,shade=True)
        m.stack(x,y,[(2.90,.138),(2.95,.151),(3.015,.144)],10,DECK)
        # Layered dougong arms follow the radial direction under the main eave.
        a = angles[i]
        direction = v3((math.cos(a),math.sin(a),0))
        for j in range(4):
            p = v3((x,y,2.98+.068*j))+direction*.042*j
            m.box(p,(.25+.11*j,.18-.015*j,.065),TIMBER if j%2==0 else DECK,a)
        m.tube([(x,y,2.83),v3((x,y,2.96))+direction*.17,v3((x,y,3.18))+direction*.41],
               [.051,.048,.029],8,TIMBER)
    # A narrow shadow line separates the apron from the chamfered platform.
    m.stack(0,0,[(.255,1.97),(.300,2.03),(.376,2.075),(.405,2.06)],6,TIMBER,phase=angle)
    for i, a in enumerate(deck):
        b = deck[(i+1)%6]
        m.beam(a+(0,0,-.084),b+(0,0,-.084),.095,.12,DECK)
    # Straight planks clipped against the exact six-sided floor boundary.
    vlist = [tuple(p[:2]) for p in deck]
    def intersections(y):
        result = []
        for (x1,y1),(x2,y2) in zip(vlist,vlist[1:]+vlist[:1]):
            if min(y1,y2)<=y<=max(y1,y2) and abs(y1-y2)>1e-6:
                result.append(x1+(x2-x1)*(y-y1)/(y2-y1))
        return min(result),max(result)
    base = min(y for _,y in vlist)+.002
    top = max(y for _,y in vlist)-.002
    for i in range(31):
        ya = base + (top-base)*i/31 + .002
        yb = base + (top-base)*(i+1)/31 - .002
        la,ra = intersections(ya)
        lb,rb = intersections(yb)
        m.grid(lambda u,v:mix((la+(ra-la)*u,ya,.45),(lb+(rb-lb)*u,yb,.45),v),
               1,1,DECK,uv=lambda u,v:(v,.06+.88*u),shade=False)
    for i, a in enumerate(columns):
        b = columns[(i+1)%6]
        def rail(t,h,spread):
            mid = mix(a,b,t)
            return mid*(1+spread)+(0,0,h)
        m.beam(rail(.01,2.90,0),rail(.99,2.90,0),.151,.19,TIMBER)
        m.beam(rail(.025,2.74,0),rail(.975,2.74,0),.096,.045,DECK)
        # Border bars and a simple screen below the spandrel.
        for t in (.14,.29,.43,.57,.71,.86):
            mid = rail(t,2.825,0)
            m.box(mid,(.04,.047,.14),TIMBER,angle+i*TAU/6)
        if i == 0:
            # Open entrance and shallow boarding stair.
            for j in range(2):
                p = rail(.5,.30-.12*j,.124+.07*j)
                tangent = b-a
                m.box(p,(1.26-.06*j,.28,.096),DECK,math.atan2(tangent[1],tangent[0]))
            continue
        m.beam(rail(.02,.79,.028),rail(.98,.79,.028),.24,.077,DECK)
        m.beam(rail(.02,1.13,.10),rail(.98,1.13,.10),.113,.077,TIMBER)
        for j in range(1,10):
            t = j/10
            m.tube([rail(t,.55,0),rail(t,.81,.024),rail(t,.99,.050),rail(t,1.095,.097)],
                   [.025,.023,.019,.021],4,TIMBER,shade=False)
    corners = [v3(polar(2.31,a,0)) for a in angles]
    def roof(i,r,s,lift=0.):
        p = mix(corners[i],corners[(i+1)%6],s)*r
        p[2] = 3.18+2.04*(1-r)**1.42+.276*r**6*abs(2*s-1)**2.8+lift
        return p
    for i in range(6):
        m.grid(lambda u,v:roof(i,.025+.975*u,v),9,4,TILE)
        m.grid(lambda u,v:roof(i,.070+.93*u,v,-.110),6,4,TIMBER,flip=True)
        for j in range(16):
            # Raised semicircular cover tiles define the courses at real silhouette scale.
            span = .47/16
            s = (j+.5)/16
            m.grid(lambda u,v:roof(i,.085+.915*u,s+span*(v*2-1),
                                 .015+.049*math.sin(math.pi*v)*(.4+.6*u)),
                   6,3,TILE,uv=lambda u,v:(v,.04+.92*u))
        m.tube([roof(i,r,0,.076) for r in np.linspace(.045,1,16)],
               [.054]*14+[.062,.042],7,TILE)
        m.tube([roof(i,1,s,-.066) for s in np.linspace(0,1,12)],[.051]*12,6,DECK)
        m.tube([roof(i,.96,s,-.126) for s in np.linspace(0,1,9)],[.040]*9,6,TIMBER)
        tip = roof(i,1,0)
        m.tube([tip+(0,0,.037),tip+polar(.061,angles[i],.087),tip+polar(.093,angles[i],.148)],
               [.046,.030,.009],7,TILE)
    m.stack(0,0,[(5.07,.195),(5.16,.18),(5.23,.133),(5.29,.12),(5.33,.083)],12,TILE,shade=True)
    m.stack(0,0,[(5.31,.084),(5.35,.065),(5.39,.096),(5.45,.076),(5.50,.039),(5.60,.011)],12,METAL,shade=True)
    for i in (0,2,4):
        x,y,_ = polar(1.35,angles[i]+math.pi/6,0)
        lantern(m,x,y,2.575,.117,.146)
        m.tube([(x,y,2.865),(x,y,2.966)],[.0065,.0065],5,METAL)


def boat(m, rng):
    def hull(u, theta, inner=False):
        x = 4.40*(u-.5)
        profile = max(0,math.sin(math.pi*u))
        width = .023+.574*profile**.68
        if inner:
            width = max(.014,width-.036)
        sheer = .138+.118*abs(2*u-1)**3
        depth = .083+.515*profile**.77
        if inner:
            depth -= .069
        y = width*math.sin(theta)
        z = sheer-depth*max(0,math.cos(theta))**.81+(.011 if inner else 0.)
        return np.array((x,y,z))
    m.grid(lambda u,v:hull(u,math.pi*(v-.5)),32,16,TIMBER,uv=lambda u,v:(v,u),flip=True)
    m.grid(lambda u,v:hull(u,math.pi*(v-.5),True),22,12,DECK,uv=lambda u,v:(v,u))
    for side in (-1,1):
        theta = side*math.pi/2
        m.tube([hull(u,theta)+(0,0,.010) for u in np.linspace(0,1,29)],[.029]*29,6,DECK)
        for j,degrees in enumerate((35,52,71)):
            line = []
            for u in np.linspace(.026,.974,22):
                p = hull(u,side*math.radians(degrees))+(0,side*.004,0)
                line.append(p)
            m.tube(line,[.0095-.001*j]*len(line),5,DECK if j==2 else TIMBER)
    for u in (0.,1.):
        x = hull(u,0)[0]
        m.box((x,0,.193),(.016,.047,.136),TIMBER)
    for j in range(13):
        y = (j-6)*.063
        length = 3.38-1.12*abs(y)/.4
        m.box((-.09,y,-.024+.024*(abs(y)/.40)**2),(length,.059,.037),DECK if j%4 else TIMBER)
    for x in (-1.63,1.32):
        m.box((x,0,.109),(.26,.74,.054),DECK)
        for y in (-.26,.26):
            m.box((x,y,.059),(.078,.054,.127),TIMBER)
    def cover(u,v,layer=0.):
        x = -1.19+1.78*u
        theta = math.pi*(v-.5)
        width = .498+.052*math.sin(math.pi*u)
        height = .405+.087*math.sin(math.pi*u)**.72
        return (x,(width+layer)*math.sin(theta),.161+(height+layer)*max(0,math.cos(theta))**.75)
    m.grid(cover,20,18,WICKER)
    m.grid(lambda u,v:cover(u,v,-.019),12,14,WICKER,flip=True)
    for u in np.linspace(0,1,7):
        m.tube([cover(u,v,.008) for v in np.linspace(0,1,18)],[.012 if u not in (0,1) else .022]*18,6,TIMBER)
    for side in (0.,1.):
        m.tube([cover(u,side) for u in np.linspace(0,1,22)],[.025]*22,7,DECK)
    # Steering oar laid across the stern thwart. The shaped blade is broad only at its tip.
    m.tube([(-2.10,-.42,.236),(-1.61,-.27,.200),(-.79,-.005,.218)],
           [.023,.020,.016],8,DECK)
    m.grid(lambda t,v:(-2.13+.37*t,-.46+.16*t+(2*v-1)*(.018+.051*math.sin(math.pi*t)),
                       .216+.017*math.sin(math.pi*t)*math.sin(math.pi*v)),
           8,4,DECK)
    m.tube([(1.73,-.19,.15),(1.82,-.17,.45),(1.86,-.11,.643),(1.93,-.018,.642)],
           [.019,.018,.015,.011],8,DECK)
    lantern(m,1.923,-.018,.468,.063,.079)


def stem(m, top, radius, depth):
    x,y,z = top
    path = [
        (-.023,.012,depth),(-.025,.005,depth*.63),(-.012,-.005,depth*.24),
        (0,0,0),(.35*x,.55*y,z*.34),(.77*x,.72*y,z*.70),top,
    ]
    if z < .06:
        path = path[:4]+[top]
    m.tube(path,[radius*(1.15-.35*i/(len(path)-1)) for i in range(len(path))],6,STEM)


def lotus_leaf(m, kind):
    radius, z, depth, lean, curl, rings, count = {
        "flat": (.241,.019,-.472, .004,.014,5,42),
        "tall": (.210,.411,-.450, .045,.025,6,44),
        "curled": (.140,.178,-.413,.024,.044,6,36),
    }[kind]
    center = v3((0.,0.,z-(.017 if kind=="curled" else .010)))
    if kind != "flat":
        center[:2] += (.027,-.018)
    middle = m.vertex(center)
    ids, tex = [], []
    for j in range(1,rings+1):
        row, uv = [], []
        r = j/rings
        for i in range(count):
            theta = TAU*i/count
            c,s = math.cos(theta),math.sin(theta)
            lobe = 1+.029*math.sin(theta*5+.46)+.018*math.cos(theta*9)+.017*math.sin(theta*2+.8)
            edge = math.sin(theta*11+.5)*r**5*.006
            raised = max(0,math.cos(theta+.70))**3 * r**3
            fold = curl*raised
            width = r*radius*lobe*(1-2.8*fold if kind=="curled" else 1)
            p = center + (width*c,width*s,lean*c*r+.021*r**1.8+edge+fold-.006*r*(1-r))
            row.append(m.vertex(p))
            uv.append((.5+.49*r*c,.5+.49*r*s))
        ids.append(row)
        tex.append(uv)
    for i in range(count):
        j = (i+1)%count
        m.face((middle,ids[0][i],ids[0][j]),((.5,.5),tex[0][i],tex[0][j]),LEAF)
        for k in range(rings-1):
            m.face((ids[k][i],ids[k+1][i],ids[k+1][j],ids[k][j]),
                   (tex[k][i],tex[k+1][i],tex[k+1][j],tex[k][j]),LEAF)
    stem(m,center-(0,0,.001),.007 if kind=="curled" else .009,depth)


def petal(m, center, theta, length, width, rise, cup, nu, nv, slot=PETAL):
    c,s = math.cos(theta),math.sin(theta)
    def point(t,u):
        v = u*2-1
        cross = width*(.038+.96*math.sin(math.pi*t)**.69)*(1-.15*t)*v
        radius = .010+length*t
        z = rise*t+.020*math.sin(math.pi*t)+cup*v*v*math.sin(math.pi*t)
        sway = .010*math.sin(theta*2)*t*t
        return v3(center)+(radius*c-(cross+sway)*s,radius*s+(cross+sway)*c,z)
    m.grid(point,nu,nv,slot,uv=lambda u,v:(v,u))


def flower_open(m, rng):
    center = (.028,-.016,.443)
    stem(m,(center[0],center[1],.414),.0068,-.468)
    m.stack(center[0],center[1],[(.407,.013),(.421,.024),(.440,.021)],12,POD,shade=True)
    for i in range(4):
        petal(m,(center[0],center[1],.425),TAU*i/4,.043,.012,-.020,.010,3,2,STEM)
    for layer, (count,length,width,rise,cup) in enumerate(((11,.108,.031,-.010,.010),
                                                            (9,.085,.030,.004,.015),
                                                            (7,.058,.023,.027,.016))):
        for j in range(count):
            theta = TAU*(j+.38*layer)/count + rng.uniform(-.035,.035)
            petal(m,center,theta,length*rng.uniform(.94,1.06),width,rise+rng.uniform(-.007,.007),cup,6-layer,3)
    # Lotus seed receptacle and individual recessed seed marks among the stamens.
    x,y,z = center
    m.stack(x,y,[(z-.010,.013),(z+.003,.017),(z+.020,.026),(z+.024,.024)],14,POD,shade=True)
    for i in range(8):
        a = TAU*i/7
        dx,dy,_ = polar(.016 if i<7 else 0,a,0)
        m.stack(x+dx,y+dy,[(z+.023,.0027),(z+.0249,.0016)],5,STEM)
    for i in range(16):
        theta = TAU*i/16
        radius = .030+rng.uniform(-.003,.004)
        height = z+.024+rng.uniform(-.006,.008)
        a = v3(polar(radius-.010,theta,z+.002))+(x,y,0)
        b = v3(polar(radius,theta,height))+(x,y,0)
        m.tube([a,b],[.00135,.0018],3,POLLEN)


def flower_bud(m, rng):
    cx,cy = .019,-.024
    stem(m,(cx,cy,.274),.0069,-.481)
    m.stack(cx,cy,[(.263,.011),(.272,.024),(.292,.027)],10,POD,shade=True)
    # Highly overlapped convex tepals follow the closed teardrop, with alternating seams.
    for j in range(10):
        theta = TAU*j/10
        length = .096 + .0036*math.sin(theta*3+.68)
        def point(t,u):
            wave = math.sin(math.pi*t)
            r = (.022*(1-t)+.035*wave**.88+.002*t)
            b = theta+(u-.5)*TAU/8.0
            r *= 1+.096*math.cos((u-.5)*math.pi)*wave
            x,y,z = polar(r,b,.284+length*t-.003*math.sin(math.pi*u)*t)
            return (cx+x+.013*t*t,cy+y+.003*t*t,z)
        m.grid(point,6,3,PETAL,uv=lambda u,v:(v,u),flip=True)
    for i in range(5):
        a = TAU*i/5+.3
        def sepal(t,v):
            x,y,z = polar(.019+.019*math.sin(math.pi*t),a+(v-.5)*(.65-.52*t),.265+.051*t)
            return (x+cx,y+cy,z)
        m.grid(sepal,4,2,STEM,flip=True)


def willow_tree(m, rng):
    trunk = [(0.,0.,-.15),(.008,0,.03),(.07,-.018,.40),(.24,.012,1.33),(.51,.08,2.28),
             (.67,.08,3.14),(.61,.17,4.24),(.91,.19,5.23),(1.38,.31,6.23)]
    m.tube(trunk,[.23,.311,.242,.189,.153,.133,.107,.070,.021],14,BARK)
    def hanging_frond(base, growth, direction, length, radial, width, sway, phase, variant):
        x,y = math.cos(direction),math.sin(direction)
        sx,sy = growth
        def point(t,v):
            reach = radial*(1-math.exp(-4*t))+sway*t*t
            bend = .16*math.sin(t*math.pi)*math.sin(t*4+phase)
            span = width*(.45+.61*math.sin(math.pi*t)**.40)*(v-.5)
            return base+(sx*reach+y*(bend+span),sy*reach-x*(bend+span),
                         .23*math.sin(t*math.pi)-length*t**1.17)
        m.grid(point,8,1,WILLOW,uv=lambda t,u:(.5*(variant+u),1-t),group=2)

    trunk_x,trunk_y,trunk_z = np.array(trunk).T
    for j in range(6):
        a = TAU*j/6+.31
        end = rng.uniform(.51,.78)
        m.tube([(.08,0,.33),polar(.25,a,.10),polar(end*.71,a,-.04),polar(end,a,-.133)],
               [.115,.095,.042,.012],7,BARK)
    for j in range(13):
        phi = TAU*j/13 + rng.uniform(-.30,.30)
        sx,sy = math.cos(phi),math.sin(phi)
        base_z = rng.uniform(2.40,4.58)+(0.27 if j%3==0 else 0)
        top = 5.38+1.90*rng.random()
        width = rng.uniform(1.62,3.28)+(0.18 if sx>0 else 0.)
        root = v3((np.interp(base_z,trunk_z,trunk_x),np.interp(base_z,trunk_z,trunk_y),base_z))
        elbow = v3((.70+.33*width*sx,.08+.30*width*sy,base_z+.70))
        crown = v3((.87+.72*width*sx,.13+.69*width*sy,top-.56))
        end = v3((1.08+width*sx,.20+width*sy,top))
        m.tube([root,mix(root,elbow,.46),elbow,mix(elbow,crown,.59),crown,end],
               [.10,.084,.067,.048,.029,.010],9,BARK)
        for k in range(3):
            a = phi+rng.uniform(-.69,.69)
            mast = mix(crown,end,(k+.17)/3)
            tip = end+polar(rng.uniform(.38,.94),a,rng.uniform(-.56,.16))
            if tip[2]>7.48:
                tip[2] = 7.48
            middle = mix(mast,tip,.50)+(0,0,.16)
            m.tube([mast,middle,tip],[.028,.018,.006],6,BARK)
            # Groups of hanging fronds fan organically off each fine branch.
            for f in range(6):
                t = (f+.6)/6.8
                base = mix(middle,tip,t)+v3((rng.uniform(-.21,.21),rng.uniform(-.19,.19),rng.uniform(-.20,.04)))
                base[2] = min(base[2],7.50)
                length = rng.uniform(1.22,2.87)+.23*k
                radial = rng.uniform(.18,.74)
                ribbon_width = rng.uniform(.25,.43)
                variant = (f+k+j)%2
                sway = rng.uniform(-.46,.45)
                for plane_index in range(1 if (f+k)%3 else 2):
                    direction = a + (plane_index*.5+rng.uniform(-.20,.20))*math.pi
                    hanging_frond(base,(sx,sy),direction,length,radial,ribbon_width,sway,phi,variant)
        if j in (1,6,10):
            tip = v3((end[0]-.10,end[1]+.14,7.5))
            fork = mix(crown,end,.75)+(0,0,.45)
            m.tube([crown,fork,tip],[.024,.013,.004],6,BARK)
            for f in range(5):
                base = mix(fork,tip,.45+.135*f)
                hanging_frond(base,(sx,sy),phi+f*1.23,1.16+.23*f,.31+.075*f,.34,.10,phi,f%2)
    m.xyz = [(x,y,max(-.15,z)) for x,y,z in m.xyz]


def pagoda(m, rng):
    phase = math.pi/8
    m.stack(0,0,[(0,2.42),(.12,2.55),(.28,2.55),(.40,2.35),(.62,2.30)],8,STONE,phase=phase)
    m.stack(0,0,[(.60,2.33),(.71,2.32),(.84,2.17)],8,BRICK,phase=phase)
    levels = ((.79,3.42,2.10,3.10),(3.87,6.49,1.83,2.72),(6.93,9.46,1.57,2.39),
              (9.96,12.26,1.33,2.05),(12.76,15.02,1.08,1.84))
    angles = [phase+i*TAU/8 for i in range(8)]
    for level,(z,eave,r,span) in enumerate(levels):
        m.stack(0,0,[(z,r+.10),(z+.15,r+.10),(z+.20,r),(eave-.20,r),(eave-.10,r+.09)],8,PLASTER,phase=phase)
        m.stack(0,0,[(eave-.27,r+.06),(eave-.18,r+.24),(eave-.09,r+.30),(eave-.045,r+.23)],8,TIMBER,phase=phase)
        for i,a in enumerate(angles):
            b = angles[(i+1)%8]
            p = v3(polar(r,a,0))
            q = v3(polar(r,b,0))
            m.stack(p[0],p[1],[(z+.19,.085),(eave-.225,.067)],4,TIMBER)
            middle = mix(p,q,.5)*1.008
            angle = math.atan2(q[1]-p[1],q[0]-p[0])
            m.box(middle+(0,0,(z+eave)*.5),(.55-.043*level,.122,1.07-.096*level),TIMBER,angle)
            def roof(u,v,under=0):
                p = mix(polar(span,a,0),polar(span,b,0),v)*u
                lift = (1.52 if level==4 else .89)*(1-u)**1.42
                p[2] = eave+lift+.27*abs(2*v-1)**3*u**6+under
                return p
            start = .026 if level==4 else .30
            m.grid(lambda u,v:roof(start+(1-start)*u,v),2,2,TILE)
            m.grid(lambda u,v:roof(.68+.32*u,v,-.11),1,1,TIMBER,flip=True)
            m.tube([roof(u,0,.051) for u in (.28,.74,1)],[.052,.071,.030],3,TILE)
    m.stack(0,0,[(16.30,.22),(16.54,.24),(16.78,.14),(17.10,.13),(17.27,.22),(17.44,.11),
                (17.52,.13),(17.72,.076),(18.0,.046)],9,METAL,shade=True)


def leaf_flat(model,rng):
    lotus_leaf(model,"flat")


def leaf_tall(model,rng):
    lotus_leaf(model,"tall")


def leaf_curled(model,rng):
    lotus_leaf(model,"curled")


BUILDERS = (pavilion, boat, pagoda, willow_tree, leaf_flat, leaf_tall, leaf_curled, flower_open, flower_bud)


def inspect_glb(path, spec, source, scratch):
    glb = Glb(path)
    doc = glb.doc
    require(len(doc["nodes"])==len(doc["meshes"])==1 and
            doc["nodes"][0]=={"mesh":0,"name":spec.name},f"{spec.name}: expected an identity root mesh")
    require(len(doc["scenes"])==1 and doc["scenes"][0]["nodes"]==[0]
            and not any(key in doc for key in ("animations","skins","cameras")),
            f"{spec.name}: extra exported scene entities")
    primitives = doc["meshes"][0]["primitives"]
    exported = []
    triangles = 0
    for prim in primitives:
        att = prim["attributes"]
        pos = glb.accessor(att["POSITION"])
        uv = glb.accessor(att["TEXCOORD_0"])
        normal = glb.accessor(att["NORMAL"])
        tangent = glb.accessor(att["TANGENT"])
        indices = glb.accessor(prim["indices"]).reshape(-1,3)
        dim = pos[indices].astype(np.float64)
        area = np.linalg.norm(np.cross(dim[:,1]-dim[:,0],dim[:,2]-dim[:,0]),axis=1)
        require(np.isfinite(pos).all() and np.all(area>1e-11), f"{spec.name}: degenerate triangle")
        require(uv.min()>=0 and uv.max()<=1 and np.isfinite(uv).all()
                and np.allclose(np.linalg.norm(normal,axis=1),1,atol=1e-4)
                and np.allclose(np.linalg.norm(tangent[:,:3],axis=1),1,atol=3e-4)
                and np.all(np.abs(tangent[:,3])==1),f"{spec.name}: bad UV or tangent frames")
        exported.append(pos)
        triangles += len(indices)
    coords = np.concatenate(exported).astype(float)
    world = source[:,[0,2,1]]*(1,1,-1)
    lo,hi = coords.min(axis=0),coords.max(axis=0)
    require(np.allclose(lo,world.min(axis=0),rtol=0,atol=2e-6)
            and np.allclose(hi,world.max(axis=0),rtol=0,atol=2e-6),
            f"{spec.name}: glTF axis conversion or scale mismatch")
    size = path.stat().st_size
    bands = np.asarray(spec.bottom),np.asarray(spec.top)
    require(bands[0][0]<=lo[1]<=bands[0][1] and bands[1][0]<=hi[1]<=bands[1][1],
            f"{spec.name}: bottom or top invalid: {lo[1]:.4f} / {hi[1]:.4f}")
    require(spec.triangles[0]<=triangles<=spec.triangles[1],
            f"{spec.name}: triangles {triangles} outside {spec.triangles}")
    require(0<size<(300_000 if spec.size==512 else 1_500_000),
            f"{spec.name}: {size} bytes out of budget")
    wide = max(hi[0]-lo[0],hi[2]-lo[2])
    if spec.name.startswith("lotus_leaf"):
        ideal = {"flat":.48,"tall":.42,"curled":.28}[spec.name.split("_")[-1]]
        require(abs(wide-ideal)<ideal*.13,f"{spec.name}: incorrect leaf diameter")
    if spec.name=="lotus_flower_open":
        require(.215<=wide<=.269,"Open flower diameter")
    if spec.name=="pavilion":
        require(4.66<=wide<=5.06,"Pavilion diameter")
    if spec.name=="wupeng_boat":
        require(4.31<=hi[0]-lo[0]<=4.49 and 1.18<=hi[2]-lo[2]<=1.35 and 1.08<=hi[1]-lo[1]<=1.27,
                f"Boat bbox {hi-lo}")
    image_meta = []
    require(len(doc["images"])==3 and len(doc["buffers"])==1 and "uri" not in doc["buffers"][0],
            f"{spec.name}: expected three embedded atlas maps")
    for record in doc["images"]:
        require(record["mimeType"]=="image/webp" and "uri" not in record,
                f"{spec.name}: map missing or external")
        temp = scratch/"verify.webp"
        temp.write_bytes(glb.view(record["bufferView"]))
        image = bpy.data.images.load(str(temp),check_existing=False)
        try:
            require(list(image.size)==[spec.size,spec.size],f"{spec.name}: atlas size mismatch")
            image_meta.append(dict(name=record["name"],size=list(image.size),mimeType=record["mimeType"]))
        finally:
            bpy.data.images.remove(image)
    for mat in doc["materials"]:
        textures = mat["pbrMetallicRoughness"]
        require("baseColorTexture" in textures and "metallicRoughnessTexture" in textures and "normalTexture" in mat
                and textures.get("metallicFactor",1)==0,
                f"{spec.name}: missing baked PBR channel")
    emits = [mat for mat in doc["materials"] if mat.get("emissiveTexture") and max(mat.get("emissiveFactor",[]), default=0)>0]
    cutouts = [mat for mat in doc["materials"] if mat.get("alphaMode")=="MASK" and mat.get("doubleSided")]
    if spec.name in ("pavilion","wupeng_boat"):
        require(len(emits)==1 and len(doc["materials"])==2, f"{spec.name}: lanterns must have one isolated emissive material")
    if spec.name=="willow_tree":
        require(len(cutouts)==1 and len(doc["materials"])==2, f"Willow foliage must export alpha MASK: {[(m['name'],m.get('alphaMode')) for m in doc['materials']]}")
    return dict(file=path.name,name=spec.name,title=spec.title,use=spec.use,
                bboxMeters=(hi-lo).tolist(),boundsMeters=dict(min=lo.tolist(),max=hi.tolist()),
                origin="waterline" if spec.name.startswith(("lotus_","pavilion","wupeng_")) else "groundContact",
                triangles=triangles,fileBytes=size,textureMaps=image_meta,materialCount=len(doc["materials"]),
                emissive=bool(emits),alphaMask=bool(cutouts),sha256=glb.digest)


def export(spec, build, seed, assets, work):
    fresh_scene()
    model = Model(spec.name)
    build(model,np.random.default_rng(seed))
    mat = materials_for(model,spec,seed)
    obj = model.object(spec.size,mat)
    select_only(obj)
    # MikkTSpace needs triangles/quads. Triangulate caps explicitly and retain
    # the face-corner UVs used by the shared atlas.
    triangulate = obj.modifiers.new("Tangents on explicit triangles","TRIANGULATE")
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    require(tuple(obj.location)==(0.,0.,0.) and tuple(obj.rotation_euler)==(0.,0.,0.)
            and tuple(obj.scale)==(1.,1.,1.), f"{spec.name}: non-identity Blender object")
    path = assets/(spec.name+".glb")
    print(f"Exporting {spec.name}: {sum(len(f)-2 for f in model.faces)} source triangles",flush=True)
    status = bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,
               export_yup=True,export_apply=True,export_normals=True,export_tangents=True,
               export_image_format="WEBP",export_image_quality=92,export_cameras=False,
               export_lights=False,export_animations=False)
    require("FINISHED" in status,f"Export failed for {spec.name}")
    return inspect_glb(path,spec,np.array(model.xyz),work)


def preview_image(spec, info, assets, work):
    scene = fresh_scene()
    status = bpy.ops.import_scene.gltf(filepath=str(assets/info["file"]))
    require("FINISHED" in status and len(bpy.context.selected_objects)==1,
            f"Failed to reimport {spec.name} for preview")
    stone, = bpy.context.selected_objects
    assert stone.type=="MESH"
    bpy.context.view_layer.update()
    points = np.asarray([stone.matrix_world @ Vector(p) for p in stone.bound_box])
    mn,mx = points.min(axis=0),points.max(axis=0)
    center = Vector((mn+mx)/2)
    width,height = 720,575
    data = bpy.data.cameras.new("Jiangnan specimen")
    data.type = "ORTHO"
    data.clip_start = .003
    data.clip_end = 1000
    cam = bpy.data.objects.new("Jiangnan specimen",data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    direction = Vector(spec.camera).normalized()
    cam.location = center+direction*max(max(mx-mn)*3,1.2)
    cam.rotation_euler = (-direction).to_track_quat("-Z","Y").to_euler()
    basis = cam.rotation_euler.to_matrix()
    right,up = np.asarray(basis.col[0]),np.asarray(basis.col[1])
    x_extent = np.ptp(points @ right)
    y_extent = np.ptp(points @ up)
    data.ortho_scale = max(x_extent*1.12,y_extent*width/height*1.13)
    scene.world = bpy.data.worlds.new("A little blue in evening light")
    scene.world.use_nodes = True
    sky = next(n for n in scene.world.node_tree.nodes if n.type=="BACKGROUND")
    sky.inputs["Color"].default_value = (.68,.76,1.,1.)
    sky.inputs["Strength"].default_value = .36
    sun("Warm light over water",(-.65,-.62,1.20),(1.,.80,.60),2.35,15)
    sun("Silk sky soft fill",(.80,-.23,.90),(.70,.84,1.),1.06,29)
    sun("Pale distant reflection",(.37,.91,.74),(.77,.90,.93),.8,19)
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "AgX"
    scene.render.resolution_x,scene.render.resolution_y = width,height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.filepath = str(work/(spec.name+".png"))
    require("FINISHED" in bpy.ops.render.render(write_still=True),f"Preview failed for {spec.name}")


def compose_preview(rows, work, target):
    from PIL import Image, ImageDraw, ImageFont

    sans = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
    serif = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc"
    cjk = Path(sans).exists() and Path(serif).exists()
    def font(file,size):
        try:
            return ImageFont.truetype(file,size)
        except OSError:
            return ImageFont.load_default()
    title = font(serif if cjk else "DejaVuSerif.ttf",63)
    name = font(serif if cjk else "DejaVuSerif.ttf",33)
    body = font(sans if cjk else "DejaVuSans.ttf",20)
    mono = font("DejaVuSansMono.ttf",18)
    margin,gap,top,card_x,card_y = 46,19,177,720,675
    width = 2*margin+3*card_x+2*gap
    height = top+3*card_y+2*gap+39
    paper, ink, muted, accent = "#ece8db", "#262f2c", "#5a6760", "#814d3d"
    plate = Image.new("RGB",(width,height),paper)
    draw = ImageDraw.Draw(plate)
    draw.text((margin,15),"QUYUAN LOTUS POND   /   JIANGNAN",font=mono,fill=accent)
    draw.text((margin-3,49),"曲院荷风 · 江南水榭" if cjk else "Jiangnan · The lotus pond",font=title,fill=ink)
    draw.text((margin,133),"黄昏散光   /   九件米制资产   /   依据各件尺寸独立取景" if cjk else
              "Soft dusk  /  Nine metric assets  /  Individual framing",font=body,fill=muted)
    draw.line((margin,top-13,width-margin,top-13),fill="#9a9e90",width=2)
    for i,(row,spec) in enumerate(zip(rows,PACK)):
        x = margin+(i%3)*(card_x+gap)
        y = top+(i//3)*(card_y+gap)
        draw.rectangle((x,y,x+card_x-1,y+574),fill="#d7dbd0")
        with Image.open(work/(spec.name+".png")) as image:
            rgba = image.convert("RGBA")
            plate.paste(rgba,(x,y),rgba.getchannel("A"))
        draw.text((x+13,y+582),spec.title if cjk else spec.caption,font=name,fill=ink)
        draw.text((x+14,y+635),spec.name+".glb",font=mono,fill=accent)
        dimensions = " × ".join(f"{d:.2f}" for d in row["bboxMeters"])
        draw.text((x+card_x-14,y+635),f"{dimensions} m",font=mono,fill=muted,anchor="ra")
        draw.line((x,y+card_y-5,x+card_x,y+card_y-5),fill="#bfc0af")
    plate.save(target,optimize=True)


def make_preview(rows, assets, work):
    for spec,info in zip(PACK,rows):
        preview_image(spec,info,assets,work)
    target = work/PREVIEW.name
    try:
        import PIL
    except ImportError:
        system = shutil.which("python3")
        require(system,"Install Pillow in Blender or for system python3")
        args = work/"preview-layout.json"
        write_json(args,rows)
        subprocess.run([system,str(Path(__file__).resolve()),"--compose-preview",str(args)],check=True)
    else:
        compose_preview(rows,work,target)
    require(target.is_file() and target.stat().st_size>100_000,"Missing or empty preview")
    return target


def publish(root, output, preview, work):
    # Commit the verified pack and its preview together, returning both to their
    # previous locations if either move fails.
    pairs = ((output,root/ASSETS),(preview,root/PREVIEW))
    with catalog_lock(root/ASSETS):
        completed = []
        try:
            for source,dest in pairs:
                dest.parent.mkdir(parents=True,exist_ok=True)
                old = work/(dest.name+".previous")
                if dest.exists():
                    dest.replace(old)
                completed.append((source,dest,old))
                source.replace(dest)
        except OSError:
            for source,dest,old in reversed(completed):
                if dest.exists():
                    dest.replace(source)
                if old.exists():
                    old.replace(dest)
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed",type=int,default=20261126)
    parser.add_argument("--output-root",type=Path,default=ROOT)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    require(bpy.app.background,"Run the Jiangnan factory in background Blender (-b)")
    require(args.seed>=0,"Seed must be non-negative")
    root = args.output_root.resolve()
    root.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".jiangnan-",dir=root) as temporary:
        work = Path(temporary)
        assets = work/"jiangnan"
        assets.mkdir()
        rows = []
        for i,(spec,build) in enumerate(zip(PACK,BUILDERS)):
            row = export(spec,build,args.seed+113*i,assets,work)
            rows.append(row)
            print(f"Verified {row['file']}: bbox {row['bboxMeters']}, {row['triangles']} tris, {row['fileBytes']} bytes",flush=True)
        manifest = dict(version=1,packId="jiangnan",units="metres",gltfAxes=["X","Y up","Z"],
                        seed=args.seed,assets=rows)
        write_json(assets/"manifest.json",manifest)
        preview = make_preview(rows,assets,work)
        publish(root,assets,preview,work)
        print(f"Published {len(rows)} Jiangnan assets and {PREVIEW.name}",flush=True)


if __name__ == "__main__":
    if "--compose-preview" in sys.argv:
        layout = Path(sys.argv[sys.argv.index("--compose-preview")+1])
        compose_preview(json.loads(layout.read_text(encoding="utf-8")),layout.parent,layout.parent/PREVIEW.name)
    else:
        main()
