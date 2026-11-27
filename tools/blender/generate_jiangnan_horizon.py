"""Append three Cycles-baked, metre-scale West Lake horizon GLBs to Jiangnan.

    /snap/bin/blender -b --factory-startup -t 8 --python-exit-code 1 \
        -P tools/blender/generate_jiangnan_horizon.py --

The existing nine GLBs are inputs to validation only. Use --output-root to
stage the horizon alongside a copy of the original pack, or --seed to vary
the weathering and tree shapes.
"""

import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
ASSETS = Path("public/assets/scenes/jiangnan")
PREVIEW = Path("tools/blender/preview_jiangnan_horizon.png")
RESOLUTION = (1440, 480)
SKIRT = -.60

if "--compose-horizon" not in sys.argv:
    import bpy
    import numpy as np

    sys.dont_write_bytecode = True
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from scene_pack_factory import (
        Asset, Surface, BARK, COVER, DETAIL, EMIT, GLOW, LEAF, LEAF2,
        NEEDLE, PANEL, ROCK, ROOF, TRIM, WOOD, basic_palette, catalog_lock,
        export, material, pbr_materials, preview_image, require, rock, twig, write_json,
    )


def specs():
    return (
        Asset("jiangnan_watertown_horizon", "粉墙黛瓦 · 江南水镇",
              "江南水镇远岸，临水立面朝 +Z", (64., 13.8, 16.), SKIRT,
              (4000, 8000), camera=(1.4, -10., 2.0)),
        Asset("jiangnan_su_causeway_horizon", "苏堤 · 柳岸石桥",
              "西湖苏堤远岸，双座单孔石拱桥，堤岸朝 +Z", (74., 9.7, 14.), SKIRT,
              (4000, 8000), camera=(-1.8, -10., 1.75)),
        Asset("jiangnan_misty_hills_horizon", "烟岚 · 西湖群山",
              "渐没入湖的青绿远山群脊，主坡朝 +Z", (94., 22.4, 24.), SKIRT,
              (3500, 6500), camera=(.9, -10., 1.9)),
    )


def palette():
    return basic_palette() | {
        PANEL: Surface((.83, .80, .715), .86, "plaster"),
        ROOF: Surface((.204, .222, .224), .69, "brick", (.090, .112, .116)),
        TRIM: Surface((.27, .243, .216), .72, "wood"),
        WOOD: Surface((.315, .237, .186), .77, "wood"),
        ROCK: Surface((.615, .584, .517), .84, "brick", (.33, .343, .311)),
        DETAIL: Surface((.45, .461, .397), .91, "moss", (.27, .33, .235)),
        COVER: Surface((.23, .312, .271), .91, "moss", (.285, .405, .33)),
        BARK: Surface((.247, .213, .166), .93, "bark"),
        NEEDLE: Surface((.146, .246, .199), .90, "forest"),
        LEAF: Surface((.244, .369, .254), .87, "forest"),
        LEAF2: Surface((.303, .43, .275), .86, "forest"),
        GLOW: Surface((.86, .50, .197), .72, "paper"),
    }


def baked_materials(model, asset, surfaces, seed):
    """Bake shared, non-overlapping atlas UVs in Cycles before assigning them to the mesh."""
    mats = pbr_materials(model, asset, surfaces, seed)
    sources = {node.image.name.rsplit("_", 1)[1]: node.image
               for node in mats[0].node_tree.nodes if node.type == "TEX_IMAGE"}
    bpy.ops.mesh.primitive_plane_add()
    plane = bpy.context.object
    mat, shader = material("Cycles surface atlas")
    plane.data.materials.append(mat)
    tree = mat.node_tree
    shader.inputs["Metallic"].default_value = 0.
    for key, destination in (("basecolor", "Base Color"), ("roughness", "Roughness"), ("normal", "Normal")):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = sources[key]
        node.interpolation = "Closest"
        if key == "normal":
            normal = tree.nodes.new("ShaderNodeNormalMap")
            tree.links.new(node.outputs["Color"], normal.inputs["Color"])
            tree.links.new(normal.outputs["Normal"], shader.inputs[destination])
        else:
            tree.links.new(node.outputs["Color"], shader.inputs[destination])

    target = tree.nodes.new("ShaderNodeTexImage")
    tree.nodes.active = target
    for key, kind in (("basecolor", "DIFFUSE"), ("roughness", "ROUGHNESS"), ("normal", "NORMAL")):
        target.image = bpy.data.images.new(f"{asset.name}_baked_{key}", asset.size, asset.size,
                                           alpha=False, is_data=key != "basecolor")
        options = {"pass_filter": {"COLOR"}} if kind == "DIFFUSE" else {}
        result = bpy.ops.object.bake(type=kind, margin=0, normal_space="TANGENT", **options)
        require("FINISHED" in result, f"{asset.name}: Cycles {key} bake failed")
        target.image.pack()
        for surface in mats:
            for node in surface.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image == sources[key]:
                    node.image = target.image

    mesh = plane.data
    bpy.data.objects.remove(plane, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    bpy.data.materials.remove(mat)
    for source in sources.values():
        bpy.data.images.remove(source)
    return mats


def roof(model, x, y, width, depth, eaves, rise, *, hip=0.):
    """Clay-tile roof with eased pitch, lifted corners and a separate ridge cap."""
    def point(u, v, side, offset=0.):
        length = width*(1-hip*(1-v))
        tip = abs(2*u-1)**5
        z = eaves+rise*(1-v)**1.55+.52*tip*v**4+.12*tip*(1-v)+offset
        return x+length*(u-.5), y+side*depth*.5*v, z

    for side in (-1, 1):
        model.grid(lambda u,v:point(u,v,side),6,3,ROOF,flip=side<0)
        model.grid(lambda u,v:point(u,1.,side,-.18*(1-v)),6,1,ROOF,flip=side>0)
        model.grid(lambda u,v:point(u,v,side,-.18),6,1,TRIM,flip=side>0)
    if hip:
        for end in (0.,1.):
            tip = model.vertex(point(end,0.,1))
            model.grid(lambda u,v:point(end,(1+2*v)/3,2*u-1),1,2,ROOF,flip=end==1.)
            edge = [model.vertex(point(end,1/3,side)) for side in (-1,1)]
            order = (tip,*reversed(edge)) if end==0. else (tip,*edge)
            model.face(order,((.5,0.),(0.,1.),(1.,1.)),ROOF)
            model.grid(lambda u,v:point(end,1.,2*u-1,-.18*(1-v)),1,1,ROOF,flip=end==0.)

    a = .5*width*(1-hip)
    ridge = [(x+a*t, y, eaves+rise+.07+.20*abs(t)**8) for t in (-1.,-.82,0.,.82,1.)]
    twig(model, ridge, (.14,.12,.12,.12,.14),4,ROOF)


def horse_head(model, x, y, depth, eaves):
    for i, (span, height) in enumerate(((1.04,.9),(.74,1.8),(.43,2.75),(.19,3.5))):
        w = .40-.04*i
        bottom = eaves-.6 if i == 0 else eaves+(.9,1.8,2.75)[i-1]-.18
        top = eaves+height
        model.box((x,y,(bottom+top)*.5),(w,depth*span,top-bottom),PANEL)
        model.box((x,y,top),(w+.26,depth*span+.31,.20),ROOF)


def pane(model, x, y, z, width, height, lit):
    def rectangle(w,h,depth,offset,slot,group=0):
        model.grid(lambda u,v:(x+(u-.5)*w,y-depth,z+offset+(v-.5)*h),
                   1,1,slot,group=group,shade=False)

    rectangle(width+.26,height+.22,.015,0.,TRIM)
    rectangle(width,height,.025,0.,GLOW if lit else WOOD,EMIT if lit else 0)
    rectangle(.075,height,.039,0.,TRIM)
    rectangle(width,.07,.044,height*.19,TRIM)


def house(model, x, y, ground, w, d, height, pitch, *, gable=0, windows=3, offset=0):
    eaves = ground+height
    model.box((x,y,ground+height*.5),(w,d,height),PANEL)
    model.box((x,y,ground+.44),(w+.12,d+.12,.88),DETAIL)
    roof(model,x,y,w+.48,d+.73,eaves-.07,pitch)
    # Close the gables at the plaster wall plane under the cantilevered eaves.
    for side in (-1, 1):
        def infill(u,v):
            return (x+side*w*.5, y+d*(u-.5),
                    eaves-.12+v*(pitch*(1-abs(2*u-1))**1.55+.16))
        model.grid(infill,8,1,PANEL,flip=side<0,shade=False)
    if gable:
        horse_head(model,x+gable*(w*.5-.04),y,d,eaves)
    facade = y-d*.5
    model.box((x,facade-.06,eaves-.28),(w,.19,.26),TRIM)
    for j in range(windows):
        px = x+w*.74*((j+.5)/windows-.5)
        pane(model,px,facade,ground+height*.63,w*.55/windows,1.02,(j+offset)%3!=1)
        if (j+offset)%3 != 0:
            pane(model,px,facade,ground+1.30,w*.50/windows,1.65,(j+offset)%4==1)


def canopy(model, center, span, rng, slot, *, droop=0.):
    """A closed, uneven crown. The bottom tips hang with the direction of the branch."""
    x,y,z = center
    a,b,h = span
    phase = rng.uniform(0, math.tau)
    sides = 8
    rows = []
    for radius, level in ((.59,-.44),(1.,.04),(.76,.49)):
        row = []
        for j in range(sides):
            t = j*math.tau/sides
            sway = 1+.16*math.cos(3*t+phase)+.10*math.sin(5*t-phase)
            row.append(model.vertex((x+a*radius*sway*math.cos(t),
                                     y+b*radius*sway*math.sin(t),
                                     z+h*level+h*.12*math.sin(t*3+phase)-droop*max(0,-math.sin(t)))))
        rows.append(row)
    bottom = model.vertex((x+a*.13,y-b*.17,z-h*.70-droop*.45))
    top = model.vertex((x-a*.12,y+b*.09,z+h*.67))
    for j in range(sides):
        k = (j+1)%sides
        u,v = j/sides,(j+1)/sides
        model.face((bottom,rows[0][k],rows[0][j]),(((u+v)*.5,.01),(v,.25),(u,.25)),slot)
        for i in range(2):
            low, high = .25+i*.25, .50+i*.25
            model.face((rows[i][j],rows[i][k],rows[i+1][k],rows[i+1][j]),
                       ((u,low),(v,low),(v,high),(u,high)),slot)
        model.face((rows[-1][j],rows[-1][k],top),((u,.75),(v,.75),((u+v)*.5,.99)),slot)


def tree(model, x, y, ground, height, rng, *, willow=True, curtains=False):
    lean = rng.uniform(-.17,.17)*height
    twig(model,[(x,y,ground),(x+lean*.35,y+.18,ground+height*.42),
                (x+lean,y+.3,ground+height*.84)],[height*.045,height*.032,.055],6,BARK)
    for i in range(4):
        angle = i*2.399+rng.uniform(-.27,.27)
        dx,dy = math.cos(angle),math.sin(angle)
        r = height*rng.uniform(.17,.31)
        rise = height*(.86-.115*i if not willow else .83-.075*i)
        tip = (x+lean+dx*r,y+dy*r,ground+rise)
        twig(model,[(x+lean*.50,y,ground+rise-height*.19),tip],[height*.019,.046],4,BARK)
        canopy(model,tip,(height*.21,height*.17,height*(.28 if willow else .13)),rng,
               (LEAF if i%3 else LEAF2) if willow else NEEDLE,droop=height*.15 if willow else 0.)
        if curtains and willow and i!=2:
            skirt = (tip[0]+dx*.11*height,tip[1]+dy*.08*height,tip[2]-.26*height)
            canopy(model,skirt,(height*.077,height*.083,height*.34),rng,
                   LEAF if i==0 else LEAF2,droop=height*.08)
    canopy(model,(x+lean,y+.2,ground+height*.9),(height*.20,height*.16,height*.22),rng,
           LEAF if willow else NEEDLE,droop=height*.07 if willow else 0.)


def embankment(model, xs, center, half_width, deck, portals):
    """Sweep stone faces and earth over the waterline, with real through-arches."""
    def edge(x,v):
        return center(x)+(2*v-1)*half_width(x)
    for a,b in zip(xs,xs[1:]):
        def x_at(u):
            return a+(b-a)*u
        arch = next((p for p in portals if p[0]-p[1]<=a+1e-6 and b<=p[0]+p[1]+1e-6),None)
        def sill(x):
            if arch is None:
                return SKIRT
            mid,radius,rise = arch
            return SKIRT+rise*math.sqrt(max(0.,1-((x-mid)/radius)**2))

        steps = 1 if arch is None else 16
        model.grid(lambda u,v:(x_at(u),edge(x_at(u),v),deck(x_at(u))),steps,2,DETAIL,shade=False)
        if arch is not None:
            model.grid(lambda u,v:(x_at(u),edge(x_at(u),v),sill(x_at(u))),steps,1,ROCK,
                       flip=True,shade=False)
        for side in (0,1):
            def wall(u,v):
                x = x_at(u)
                z = sill(x)+(deck(x)-sill(x))*v
                return x, edge(x,side), z
            model.grid(wall,steps,2,ROCK,flip=bool(side),shade=False)
    for side, x in enumerate((xs[0],xs[-1])):
        model.grid(lambda u,v:(x,edge(x,u),SKIRT+(deck(x)-SKIRT)*v),2,1,ROCK,
                   flip=not side,shade=False)


def arch_band(model, x, width, center, half_width, rise, face):
    """Ashlar ring at the mouth of an open stone arch."""
    def point(u,v):
        a = math.pi*(1-u)
        radius = width+.28*v
        px = x+radius*math.cos(a)
        py = center(px)+face*(half_width(px)+.06+.045*v)
        return px,py,SKIRT+(rise+.34*v)*math.sin(a)
    model.grid(point,16,1,ROCK,flip=face>0,shade=False)


def watertown(model, rng):
    center = lambda x: .40*math.sin(x*.155)+.018*x
    half = lambda x: 6.3-.0024*x*x+.42*math.cos(x*.23)-2.1*(abs(x)/32)**16
    deck = lambda x: 2.00+.11*math.sin(x*.21)-2.3*max(0.,(abs(x)-30.)/2.)**2
    gates = ((-20.,1.62,2.10),(1.6,1.48,2.02),(22.7,1.64,1.98))
    xs = [-32.,-30.,-28.,-25.,-16.,-13.,-9.,-5.,5.,10.,14.,18.,26.,29.,30.,32.]
    xs = sorted((*xs,*(x+s*w for x,w,_ in gates for s in (-1,1))))
    embankment(model,xs,center,half,deck,gates)
    for x,w,h in gates:
        arch_band(model,x,w,center,half,h,-1)

    # Tall rear courtyards rise behind smaller warehouses and break at the quay gates.
    for i,(x,w,d,h,p,g) in enumerate(((-25.5,5.8,5.4,6.0,2.4,-1),(-16.7,8.,5.7,7.1,3.0,1),
                                     (-7.2,8.4,6.2,8.4,3.0,1),(3.0,7.1,6.2,6.6,3.1,-1),
                                     (12.0,7.3,5.8,6.1,2.6,1),(22.8,6.8,5.5,5.4,2.2,-1))):
        house(model,x,3.05,deck(x)-.04,w,d,h,p,gable=g,windows=3,offset=i)
    for i,(x,y,w,d,h,p,g) in enumerate(((-27.1,-1.7,5.8,5.1,3.9,1.9,0),(-15.8,-1.7,5.4,5.2,4.2,1.7,-1),
                                       (-9.25,-2.3,6.2,5.3,4.8,1.9,0),(-2.6,-1.9,5.1,4.7,3.7,1.9,1),
                                       (6.5,-1.8,5.6,5.4,4.5,2.25,0),(13.7,-2.1,6.8,5.2,4.1,1.8,1),
                                       (19.55,-1.7,4.3,4.9,3.1,1.5,0),(27.6,-.75,4.4,4.7,3.2,1.55,0))):
        house(model,x,y,deck(x)-.04,w,d,h,p,gable=g,windows=2,offset=i)
    for x,y,h,willow in ((-28.7,1.4,5.6,False),(-20.8,2.5,6.8,False),(-19.8,-2.8,4.8,True),
                         (.9,4.6,5.7,False),(20.3,3.65,6.65,False),(25.6,-2.9,5.15,True),
                         (29.3,2.3,5.55,True)):
        tree(model,x,y,deck(x)-.12,h,rng,willow=willow)
    for x,y in ((-30.,-3.15),(-29.,-4.6),(-23.8,-5.2),(15.,-6.1),(29.8,-3.6)):
        rock(model,(x,y,.1),(2.5,1.4,1.3),3,7,rng,slot=DETAIL)


def lantern(model, x, y, z):
    model.box((x,y,z+.24),(.68,.64,.17),ROOF)
    model.box((x,y,z-.23),(.56,.54,.15),TRIM)
    model.grid(lambda u,v:(x+(u-.5)*.46,y-.252,z+(v-.5)*.35),1,1,GLOW,group=EMIT,shade=False)
    model.grid(lambda u,v:(x+.235,y+(u-.5)*.46,z+(v-.5)*.35),1,1,GLOW,group=EMIT,shade=False)
    model.grid(lambda u,v:(x-.235,y+(u-.5)*.46,z+(v-.5)*.35),1,1,GLOW,group=EMIT,flip=True,shade=False)
    model.grid(lambda u,v:(x+(u-.5)*.46,y+.252,z+(v-.5)*.35),1,1,GLOW,group=EMIT,flip=True,shade=False)


def causeway(model, rng):
    # The water runs entirely through both arches. Land returns to the water
    # beyond the abutments while the path follows the bridge crown.
    bridges = ((-17.2,4.8,3.95),(13.1,5.4,4.35))
    center = lambda x: 2.15*math.sin((x+7.)*.072)+.064*x
    half = lambda x: 3.8+.92*math.cos(x*.125)-2.1*(abs(x)/37)**8

    def deck(x):
        edge = min(1.,max(.12,(37.-abs(x))/4))
        return edge*(1.16+.14*math.cos(x*.13))+sum(
            height*.86*max(0.,1.-((x-mid)/(2.42*w))**2)**1.8
            for mid,w,height in bridges
        )

    xs = [-37.,-35.,-32.,-29.,-26.,-11.,-8.,-4.,0.,4.,20.,23.,26.,29.,32.,35.,37.]
    xs = sorted((*xs,*(x+s*w for x,w,_ in bridges for s in (-1,1))))
    embankment(model,xs,center,half,deck,bridges)
    for x,w,rise in bridges:
        for side in (-1,1):
            arch_band(model,x,w,center,half,rise,side)
            posts = np.linspace(x-w*1.73,x+w*1.73,13)
            coords = [(p,center(p)+side*(half(p)-.28),deck(p)) for p in posts]
            for i,(px,py,z) in enumerate(coords):
                model.box((px,py,z+.33),(.24,.24,.74),ROCK)
                if i%3==0:
                    model.box((px,py,z+.77),(.35,.35,.19),ROCK)
            twig(model,[(a,b,c+.59) for a,b,c in coords],[.121]*len(coords),5,ROCK)
            a,b,c = coords[len(coords)//2]
            lantern(model,a,b,c+1.15)

    for i,(x,y,h) in enumerate(((-31.9,-1.,6.1),(-27.,2.6,6.6),(-24.05,3.25,5.8),(-10.4,2.9,5.1),
                                 (-6.0,2.9,7.4),(-2.28,-2.4,7.4),(2.1,3.7,6.3),(7.05,2.5,5.05),
                                 (20.6,2.2,6.1),(23.0,-2.1,7.2),(32.,.9,6.6))):
        tree(model,x,center(x)+y,deck(x)-.10,h,rng,willow=i!=0,curtains=True)

    x,y = 28.2,center(28.2)-1.32
    ground = deck(x)
    model.box((x,y,ground+.06),(5.12,4.25,.39),ROCK)
    for dx in (-1.85,1.85):
        for dy in (-1.42,1.42):
            model.box((x+dx,y+dy,ground+1.59),(.29,.29,2.95),WOOD)
    roof(model,x,y,5.25,4.2,ground+3.05,1.55,hip=.45)
    lantern(model,x,y-1.27,ground+2.15)
    twig(model,[(x,y-1.27,ground+2.46),(x,y-1.27,ground+3.48)],[.043,.043],4,TRIM)


def hills(model, rng):
    # Metre-scale spurs on a continuous wooded ridge. The shoulders taper both
    # vertically and in plan, allowing instances to overlap under the waterline.
    def shape(x, v):
        u = x/47.
        envelope = max(0.,1-abs(u)**5)**1.4
        depth = 12*(.09+.91*envelope)
        center = 1.5*math.sin(2.8*u)+1.3*math.sin(7.0*u)
        cape = math.exp(-((u-.41)/.24)**2)
        y = center+depth*(2*v-1)*(1+.07*math.cos(13*u+v*5)+.052*math.sin(28*u))
        y -= 2.2*cape*(1-v)**3
        spine = .58+.098*math.sin(5*u+.88)+.04*math.cos(12*u)
        across = math.sin(math.pi*v)**1.18
        crest = math.exp(-((v-spine)/(.22+.04*math.cos(4*u)))**2)
        peaks = (4.8+14.6*math.exp(-((u+.48)/.255)**2)+8.4*math.exp(-((u+.12)/.185)**2)
                 +18.8*math.exp(-((u-.31)/.295)**2)+5.3*math.exp(-((u-.64)/.135)**2))
        spurs = (1.05*math.sin(13*u+v*5)+.74*math.cos(23*u-v*7)+.42*math.sin(61*u+v*12))
        front = .25+.052*math.sin(7*u+.8)+.023*math.cos(19*u)
        shoulder = math.exp(-((v-front)/.14)**2)
        foothills = 3.25+5.3*cape+3.55*math.exp(-((u+.62)/.19)**2)+1.25*math.sin(12*u-.8)
        terrace = .34*math.sin(86*v-9*u+1.1*math.cos(14*u))
        height = envelope*across*(1.9+crest*(peaks+spurs)+shoulder*(foothills+terrace))
        return x,y,SKIRT+height

    nx,ny = 90,29
    rows = [[model.vertex(shape(94*(i/nx-.5),j/ny)) for j in range(ny+1)] for i in range(nx+1)]
    for i in range(nx):
        for j in range(ny):
            x = i/nx
            v0,v1 = j/ny,(j+1)/ny
            uv = ((x,v0),(x+1/nx,v0),(x+1/nx,v1),(x,v1))
            model.face((rows[i][j],rows[i+1][j],rows[i+1][j+1],rows[i][j+1]),uv,COVER)
        model.face((rows[i][0],rows[i][-1],rows[i+1][-1],rows[i+1][0]),
                   ((i/nx,0),(i/nx,1),((i+1)/nx,1),((i+1)/nx,0)),DETAIL,shade=False)

    for x,v,a,b,h in ((11.,.055,3.0,1.8,1.0),(16.,.052,2.45,1.32,1.3),(19.,.082,4.1,2.6,1.8),
                       (23.,.062,4.1,1.97,1.45),(26.5,.058,2.8,1.62,1.1)):
        px,py,pz = shape(x,v)
        rock(model,(px,py,pz-.22),(a,b,h),3,9,rng,slot=DETAIL)


def compose(job):
    from PIL import Image, ImageDraw, ImageFont

    fontdir = Path("/usr/share/fonts/opentype/noto")
    serif = fontdir/"NotoSerifCJK-Regular.ttc"
    sans = fontdir/"NotoSansCJK-Regular.ttc"
    cjk = serif.is_file() and sans.is_file()
    title = ImageFont.truetype(str(serif) if cjk else "DejaVuSerif.ttf",52)
    label = ImageFont.truetype(str(sans) if cjk else "DejaVuSans.ttf",26)
    mono = ImageFont.truetype("DejaVuSansMono.ttf",17)
    width,height = RESOLUTION
    gutter,top = 32,122
    row_height = height+67
    rows = job["rows"]
    canvas = Image.new("RGB",(width+2*gutter,top+row_height*len(rows)+gutter),"#ece8da")
    draw = ImageDraw.Draw(canvas)
    draw.text((gutter,15),"QUYUAN LOTUS POND  /  WEST LAKE  /  CYCLES",fill="#80533f",font=mono)
    draw.text((gutter-3,43),"曲院荷风 · 江南西湖" if cjk else "West Lake · Jiangnan at dusk",fill="#2b3c38",font=title)
    captions = ("Watertown", "Su Causeway", "Misty hills")
    work = Path(job["work"])
    for i,row in enumerate(rows):
        y = top+i*row_height
        plate = Image.new("RGB",(width,height),"#d9ddd2")
        with Image.open(work/(row["name"]+".png")) as rendered:
            rgba = rendered.convert("RGBA")
            plate.paste(rgba,mask=rgba.getchannel("A"))
        canvas.paste(plate,(gutter,y))
        draw.text((gutter,y+height+10),row["title"] if cjk else captions[i],font=label,fill="#2b3c38")
        dims = " × ".join(f"{d:.1f}" for d in row["bboxMeters"])
        draw.text((width+gutter,y+height+19),f"{dims} m   /   {row['triangles']:,} tris",font=mono,fill="#506158",anchor="ra")
    canvas.save(job["target"],optimize=True)


def publish(root, staged, work, rows, preview):
    """Update only the three generated files, the sheet and the manifest."""
    dest = root/ASSETS
    new_files = {row["file"] for row in rows}
    manifest = dest/"manifest.json"
    with catalog_lock(dest):
        current = json.loads(manifest.read_text(encoding="utf-8"))
        original = [row for row in current["assets"] if row["file"] not in new_files]
        require(current["packId"]=="jiangnan" and len(original)==9,"Expected the original nine Jiangnan assets")
        current["assets"] = original+rows
        for row in original:
            (staged/row["file"]).symlink_to(dest/row["file"])
        write_json(staged/manifest.name,current)
        node = shutil.which("node")
        require(node,"Node is required for scene-pack validation")
        subprocess.run([node,str(ROOT/"tools/blender/validate_scene_pack.mjs"),str(staged/manifest.name)],check=True)

        targets = [(staged/row["file"],dest/row["file"]) for row in rows]
        targets += [(preview,root/PREVIEW),(staged/manifest.name,manifest)]
        backups = []
        try:
            for src,path in targets:
                path.parent.mkdir(parents=True,exist_ok=True)
                backup = work/(path.name+".previous")
                if path.exists():
                    shutil.copyfile(path,backup)
                backups.append((path,backup))
                src.replace(path)
        except OSError:
            for path,backup in reversed(backups):
                if backup.exists():
                    backup.replace(path)
                else:
                    path.unlink(missing_ok=True)
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed",type=int,default=20261126)
    parser.add_argument("--output-root",type=Path,default=ROOT)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    require(bpy.app.background and args.seed>=0,"Run in background Blender with a non-negative seed")
    root = args.output_root.resolve()
    require((root/ASSETS/"manifest.json").is_file(),"Expected an existing Jiangnan pack at --output-root")
    with tempfile.TemporaryDirectory(prefix=".jiangnan-horizon-",dir=root) as temp:
        work = Path(temp)
        staged = work/"jiangnan"
        staged.mkdir()
        rows = []
        for i,(asset,build) in enumerate(zip(specs(),(watertown,causeway,hills))):
            row = export(asset,build,palette(),args.seed+113*i,staged,work,material_builder=baked_materials)
            rows.append(row)
            print(f"Verified {row['file']}: {row['triangles']} tris, {row['fileBytes']} bytes",flush=True)
            preview_image(asset,row,staged,work,resolution=RESOLUTION)
        preview = work/PREVIEW.name
        job = dict(rows=rows,work=str(work),target=str(preview))
        try:
            import PIL
        except ImportError:
            python = shutil.which("python3")
            require(python,"Pillow is required in Blender or in system Python")
            layout = work/"layout.json"
            write_json(layout,job)
            subprocess.run([python,str(Path(__file__).resolve()),"--compose-horizon",str(layout)],check=True)
        else:
            compose(job)
        require(preview.stat().st_size>100_000,"Incomplete Cycles contact sheet")
        publish(root,staged,work,rows,preview)


if __name__ == "__main__":
    if "--compose-horizon" in sys.argv:
        layout = Path(sys.argv[sys.argv.index("--compose-horizon")+1])
        compose(json.loads(layout.read_text(encoding="utf-8")))
    else:
        main()
