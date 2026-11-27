"""Build the Jiangnan midground and share solid construction with the other Wave 1 packs.

Run with Blender in background mode and --python-exit-code 1. The pack's
manifest and earlier GLBs must already exist under --output-root.
"""

import argparse
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

def compose(job):
    from PIL import Image, ImageDraw, ImageFont

    width,height,gap = 720,560,16
    margin,top = 36,121
    paper,ink,accent = "#eee7d8","#243838","#77513c"
    assets = job["assets"]
    canvas = Image.new("RGB",(2*margin+len(assets)*width+(len(assets)-1)*gap,top+height+96),paper)
    draw = ImageDraw.Draw(canvas)
    title = ImageFont.truetype("DejaVuSerif.ttf",46)
    mono = ImageFont.truetype("DejaVuSansMono.ttf",16)
    cjk = Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")
    label = ImageFont.truetype(str(cjk) if cjk.exists() else "DejaVuSans.ttf",27)
    draw.text((margin,17),"WAVE 1   /   WATERLINE ASSETS",fill=accent,font=mono)
    draw.text((margin-2,42),job["title"],fill=ink,font=title)
    for i,(entry,english) in enumerate(zip(assets,job["labels"])):
        x = margin+i*(width+gap)
        plate = Image.new("RGB",(width,height))
        gradient = ImageDraw.Draw(plate)
        for y in range(height):
            t = y/height
            gradient.line((0,y,width,y),fill=(round(196+39*t),round(209+19*t),round(211+3*t)))
        with Image.open(Path(job["work"])/(entry["name"]+".png")) as rendered:
            rgba = rendered.convert("RGBA")
            plate.paste(rgba,mask=rgba.getchannel("A"))
        canvas.paste(plate,(x,top))
        draw.text((x,top+height+7),entry["title"] if cjk.exists() else english,fill=ink,font=label)
        info = " × ".join(f"{d:.1f}" for d in entry["bboxMeters"])
        draw.text((x,top+height+54),entry["file"],fill=accent,font=mono)
        draw.text((x+width,top+height+54),f"{info} m  /  {entry['triangles']:,} tris",
                  fill=ink,font=mono,anchor="ra")
    canvas.save(job["target"],optimize=True)


if __name__=="__main__" and "--compose-midground" in sys.argv:
    compose(json.loads(Path(sys.argv[-1]).read_text(encoding="utf-8")))
    raise SystemExit


import bpy
import numpy as np
from mathutils import Vector

import scene_pack_factory as factory
from generate_venice_midground import materials, prism, quad, strip
from generate_stones import sun
from scene_pack_factory import (
    Asset, Surface, BARK, BLOOM, DETAIL, EMIT, GLOW, LEAF, LEAF2,
    PANEL, ROCK, ROOF, TRIM, WEAVE, WOOD, beam, rock,
)


def box(m, x0, x1, y0, y1, z0, z1, slot, group=0):
    """A closed axis-aligned block, expressed in bounds to make joins explicit."""
    if group:
        prism(m, [(x0,z0),(x1,z0),(x1,z1),(x0,z1)], y0, y1, slot, group)
    else:
        m.box(((x0+x1)/2,(y0+y1)/2,(z0+z1)/2), (x1-x0,y1-y0,z1-z0), slot)


def window(m, x, face, z, width, height, *, lit=True, bars=3, rails=2, frame=TRIM):
    """Build a hollow timber jamb, a lattice and a solid screen within a true opening.

    The facade plane is face, looking from negative Y. The paper starts
    0.29 m behind that plane and 0.35 m behind the lattice's front face.
    """
    a,b = x-width/2,x+width/2
    c,d = z-height/2,z+height/2
    rail = min(.17, width*.19, height*.23)
    # Surround legs and rails meet edge-to-edge to keep their faces disjoint.
    for lo,hi in ((a,a+rail),(b-rail,b)):
        box(m,lo,hi,face-.30,face+.35,c,d,frame)
    for lo,hi in ((c,c+rail),(d-rail,d)):
        box(m,a+rail,b-rail,face-.30,face+.35,lo,hi,frame)
    box(m,a+rail-.012,b-rail+.012,face+.29,face+.54,c+rail-.012,d-rail+.012,
        GLOW if lit else WOOD,EMIT if lit else 0)
    mullions = np.linspace(a+rail,b-rail,bars+2)[1:-1]
    half = min(.043, (b-a-2*rail)/(5*max(1,bars)))
    for u in mullions:
        box(m,u-half,u+half,face-.06,face+.20,c+rail,d-rail,frame)
    for v in np.linspace(c+rail,d-rail,rails+2)[1:-1]:
        box(m,a+rail,b-rail,face+.008,face+.25,v-.033,v+.033,frame)


def facade(m, x, face, width, low, high, depth, rows, slot=PANEL, frame=TRIM):
    """Partition a wall into masonry above, below and between its screen apertures."""
    a,b = x-width/2,x+width/2
    previous_z = low
    for bottom,top,bays in rows:
        if bottom>previous_z:
            box(m,a,b,face,face+depth,previous_z,bottom,slot)
        previous_x = a
        for offset,size,lit,bars,rails in bays:
            cx = x+offset
            left,right = cx-size/2,cx+size/2
            factory.require(left>previous_x and right<b,"Window bay exceeds its wall course")
            box(m,previous_x,left,face,face+depth,bottom,top,slot)
            window(m,cx,face,(bottom+top)/2,size,top-bottom,lit=lit,bars=bars,rails=rails,frame=frame)
            previous_x = right
        box(m,previous_x,b,face,face+depth,bottom,top,slot)
        previous_z = top
    if previous_z<high:
        box(m,a,b,face,face+depth,previous_z,high,slot)


def opposing_facades(m, x, y, w, d, low, high, rows, slot=PANEL, frame=TRIM, *, rear=None):
    """Two perforated facades with solid return walls at the gable ends."""
    depth = .65
    for side in (1,-1):
        start = len(m.xyz)
        facade(m,x,y-d/2,w,low,high,depth,rows if side>0 or rear is None else rear,slot,frame)
        # Rotate the second facade 180 degrees around the footprint center.
        if side<0:
            m.xyz[start:] = [(2*x-a,2*y-b,c) for a,b,c in m.xyz[start:]]
    for side in (-1,1):
        m.box((x+side*(w/2-.26),y,(low+high)/2),(.52,d-2*depth,high-low),slot)


def tiled_roof(m, x, y, eave, width, depth, rise, *, hip=.29, curl=.43, gable=False,
               columns=9, rows=4):
    """Closed tile shell, with continuous concave pitches and lifted ridge tips."""
    def point(u,v,face,under=0):
        shoulder = 1-v if not gable else min(1,(1-v)*1.7)
        span = width*(1-hip*shoulder)
        up = eave+rise*max(0,1-v)**1.64+curl*abs(2*u-1)**6*(.23+.77*v**3)
        return x+(u-.5)*span,y+face*depth/2*v,up-under

    for side in (-1,1):
        m.grid(lambda u,v:point(u,v,side),columns,rows,ROOF,flip=side<0)
        m.grid(lambda u,v:point(u,v,side,.23),columns,rows,WOOD,flip=side>0)
        m.grid(lambda u,v:point(u,1,side,.23*(1-v)),columns,1,TRIM,flip=side>0,shade=False)
        for u in np.linspace(.07,.93,max(4,columns//2)):
            coords = [point(u,v,side,.18) for v in (.64,.81,1.025)]
            m.tube(coords,(.066,.075,.10),5,ROOF,shade=False)
    for u in (0,1):
        for side in (-1,1):
            m.grid(lambda t,v:point(u,t,side,.23*v),rows,1,ROOF,flip=(side>0)==(u==0))
        # The hip/gable wall seals the volume beneath the tile rake.
        left = [point(u,v,-1,.23) for v in np.linspace(1,0,rows+1)]
        right = [point(u,v,1,.23) for v in np.linspace(0,1,rows+1)][1:]
        profile = left+right
        for p,q in zip(profile,profile[1:]):
            vertices = [m.vertex(r) for r in ((p[0],p[1],eave-.33),(q[0],q[1],eave-.33),q,p)]
            quad(m,vertices if u==1 else vertices[::-1],WOOD)
    ridge = width*(1-hip)*.5
    caps = (-1.055,-.97,-.84,-.57,0,.57,.84,.97,1.055)
    crest = [(x+t*ridge,y,eave+rise+.075+curl*.69*abs(t)**8) for t in caps]
    m.tube(crest,[.08 if abs(t)>1 else .14 for t in caps],8,ROOF)


def hanging_lantern(m, x, y, z, *, radius=.28, drop=.6, cap=TRIM, paper=GLOW):
    """Rounded lantern with a metal crown, a tassel and a suspension rod."""
    rz = radius*1.25
    m.stack(x,y,[(z-rz,radius*.53),(z-rz*.70,radius*.85),(z-.04,radius),
                 (z+rz*.64,radius*.92),(z+rz,radius*.57)],10,paper,EMIT)
    m.stack(x,y,[(z-rz-.11,radius*.32),(z-rz-.035,radius*.68),(z-rz+.014,radius*.55)],8,cap)
    m.stack(x,y,[(z+rz-.017,radius*.60),(z+rz+.075,radius*.68),(z+rz+.13,radius*.36)],8,cap)
    m.tube([(x,y,z+rz+.11),(x,y,z+rz+drop)],[radius*.11]*2,5,cap)
    m.stack(x,y,[(z-rz-.28,radius*.19),(z-rz-.08,radius*.11)],5,cap)


def pavilion(m, x, y, z, w, d, height, rise, *, column=WOOD, lantern_y=None, tier=False):
    """Open-sided timber hall with bracket blocks supporting the eaves."""
    eave = z+height
    for dx in (-1,1):
        for dy in (-1,1):
            px,py = x+dx*w*.39,y+dy*d*.37
            m.box((px,py,z+.19),(.61,.59,.40),ROCK)
            m.stack(px,py,[(z+.30,.165),(z+.52,.21),(eave-.47,.19),(eave-.18,.185)],8,column)
            m.box((px,py,eave-.36),(.65,.48,.28),TRIM)
            m.box((px,py,eave-.16),(.48,.60,.24),column)
            beam(m,(px,py,eave-.82),(px-dx*.70,py,eave-.29),.19,.23,column)
    for side in (-1,1):
        m.box((x,y+side*d*.371,eave-.275),(w*.89,.25,.34),column)
        m.box((x+side*w*.392,y,eave-.235),(.24,d*.88,.29),column)
    tiled_roof(m,x,y,eave,w*1.15,d*1.15,rise,hip=.37,curl=.49)
    if tier:
        tiled_roof(m,x,y,eave+rise*.73,w*.64,d*.65,rise*.64,hip=.31,curl=.37,columns=8)
    if lantern_y is not None:
        hanging_lantern(m,x,lantern_y,eave-.90,radius=.32,drop=.58)


def stone_pier(m, x, y, z0, top, width, depth, *, slot=ROCK):
    """Battered footing, shaft and ashlar coping with contrasting courses."""
    m.box((x,y,z0+.22),(width*1.12,depth*1.09,.44),DETAIL)
    for i,t in enumerate((.24,.48,.71,.91)):
        hi = z0+.35+(top-z0-.36)*t
        lo = z0+.22 if i==0 else last-.08
        w,d = width*(1.02-.075*i),depth*(1-.046*i)
        m.box((x+.018*i,y-.017*i,(hi+lo)/2),(w,d,hi-lo),slot if i%3 else DETAIL)
        last = hi
    m.box((x,y,(last+top)/2),(width*1.02,depth*1.01,top-last+.08),slot)


def rail(m, a, b, count, *, base, height, slot=WOOD, caps=None, stone=False):
    """Open parapet with solid rails and balusters anchored in the deck."""
    a,b = np.asarray(a),np.asarray(b)
    dx,dy = b-a
    angle = math.atan2(dy,dx)
    for t in np.linspace(.035,.965,count):
        x,y = a+(b-a)*t
        if stone:
            m.box((x,y,base+height*.43),(.31,.31,height*.93),slot)
            m.box((x+.008,y,base+height*.91),(.34,.39,.17),TRIM,angle=angle)
        else:
            m.stack(x,y,[(base-.04,.104),(base+.17,.13),(base+height,.101)],6,slot)
        if caps is not None:
            m.stack(x,y,[(base+height-.04,.13),(base+height+.06,.18),
                          (base+height+.14,.13),(base+height+.22,.036)],8,caps)
    for z,w,h in ((base+height*.73,.20,.23),(base+height*.30,.13,.16)):
        m.beam((*a,z),(*b,z),w,h,slot)


def flowering_tree(m, rng, x, y, z, h, spread, *, leaves=(LEAF,LEAF2,BLOOM), lean=.65):
    """Open, asymmetric branch structure with distinct clusters and silhouette buds."""
    trunk = [(x,y,z-.25),(x+lean*.20,y+.06,z+h*.28),
             (x+lean*.63,y+.12,z+h*.58),(x+lean,y+.22,z+h*.87)]
    m.tube(trunk,[h*.065,h*.048,h*.030,h*.009],8,BARK)
    for i in range(6):
        a = i*2.399+rng.uniform(-.20,.20)
        reach = spread*rng.uniform(.33,.49)*(1-i*.066)
        dx,dy = math.cos(a)*reach,math.sin(a)*reach
        t = .37+.054*i
        px,py,pz = x+lean*t+dx,y+dy,z+h*(t+.205+rng.uniform(-.035,.084))
        m.tube([(x+lean*t*.65,y+.07,z+h*t),(px-dx*.45,py-dy*.45,pz-h*.12),(px,py,pz)],
               [h*.023,h*.016,h*.007],6,BARK)
        size = spread*rng.uniform(.31,.47)
        rock(m,(px,py,pz),(size,size*.84,h*.35),2,8,rng,leaves[i%len(leaves)],cap=leaves[(i+1)%len(leaves)])
        if i%2==0:
            rock(m,(px+dx*.23,py+dy*.28,pz+.07*h),(size*.67,size*.62,h*.20),2,7,rng,leaves[i%len(leaves)])
    rock(m,(x+lean,y+.22,z+h*.88),(spread*.34,spread*.34,h*.26),3,9,rng,leaves[-1])


def hull(m, length, width, *, stripe=TRIM, body=WOOD, rubrail=DETAIL):
    """Sculpted displacement hull and sealed cambered deck, heading toward +X."""
    sections = (-1,-.955,-.88,-.77,-.64,-.48,-.28,0,.29,.54,.72,.84,.93,.98,1)
    bands = ((0,-1.0,DETAIL),(.32,-.70,body),(.63,-.36,body),(.84,-.06,stripe),
             (.97,.18,body),(1.00,.37,rubrail),(.98,.54,body))
    rings = []
    for t in sections:
        full = max(.035,(1-abs(t)**2.65)**.64)
        sheer = .44*abs(t)**4+max(t,0)*.12
        keel = .86*abs(t)**2.2
        profile = [(0,-1.01)]
        profile += [(u,z) for u,z,_ in bands[1:]]
        port = [(length/2*t,-u*width/2*full,z+sheer+(keel if j<3 else keel*.12))
                for j,(u,z) in enumerate(profile)]
        starboard = [(x,-y,z) for x,y,z in port[1:][::-1]]
        rings.append([m.vertex(p) for p in port+starboard])
    coating = [row[2] for row in bands[1:]]
    for a,b in zip(rings,rings[1:]):
        for j,slot in enumerate(coating+coating[::-1]):
            quad(m,(a[j],b[j],b[j+1],a[j+1]),slot)
        p,q = np.asarray(m.xyz[a[6]]),np.asarray(m.xyz[b[6]])
        ap = m.vertex((p[0],0,p[2]+.07))
        bp = m.vertex((q[0],0,q[2]+.07))
        quad(m,(a[6],b[6],bp,ap),WEAVE)
        quad(m,(ap,bp,b[7],a[7]),WEAVE)
    uv = lambda row: [(.5+y/width,.16+(z+1)*.34) for _,y,z in (m.xyz[i] for i in row)]
    m.face(rings[0],uv(rings[0]),body,shade=False)
    m.face(rings[-1][::-1],uv(rings[-1])[::-1],body,shade=False)


def boat_railings(m, x_pairs, width, *, height=.65, slot=TRIM):
    for left,right in x_pairs:
        for side in (-1,1):
            y = side*width
            rail(m,(left,y),(right,y*.94),5,base=.55,height=height,slot=slot)


def end_lamps(m, locations, *, paper=GLOW):
    for x,y,z in locations:
        elbow = x-math.copysign(.28,x)
        m.tube([(elbow,y,.70),(elbow,y,z+.45),(x,y,z+.57)],(.071,.062,.046),7,TRIM)
        hanging_lantern(m,x,y,z,radius=.19,drop=.33,paper=paper)


def preview(spec, row, stage, work):
    """Render the exported GLB above a water plane so the foundation and reflection are visible."""
    scene = factory.fresh_scene()
    bpy.ops.import_scene.gltf(filepath=str(stage/row["file"]))
    asset = bpy.context.selected_objects[0]
    points = np.asarray([asset.matrix_world @ v.co for v in asset.data.vertices])
    width,height,depth = spec.bbox
    image_width,image_height = 720,560
    direction = Vector(spec.camera).normalized()
    rotation = (-direction).to_track_quat("-Z","Y").to_euler()
    basis = rotation.to_matrix()
    right,up = basis.col[0],basis.col[1]
    px,py = points@np.asarray(right),points@np.asarray(up)
    deck_points = points[points[:,2]>=0].copy()
    deck_points[:,2] *= -.41
    floor = min(py.min(), (deck_points@np.asarray(up)).min())
    center = right*((px.max()+px.min())*.5)+up*((py.max()+floor)*.5)
    camera_data = bpy.data.cameras.new("Contact sheet")
    camera_data.type = "ORTHO"
    camera_data.clip_end = max(spec.bbox)*30
    camera_data.ortho_scale = max(np.ptp(px)*1.14,(py.max()-floor)*1.16*image_width/image_height)
    camera = bpy.data.objects.new("Contact sheet",camera_data)
    scene.collection.objects.link(camera)
    camera.location = center+direction*max(spec.bbox)*3
    camera.rotation_euler = rotation
    scene.camera = camera

    scene.world = bpy.data.worlds.new("Lake sky")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (.57,.68,.92,1)
    background.inputs["Strength"].default_value = .42
    sun("Peach light",(-.66,-.60,1.05),(1,.79,.61),2.1,14)
    sun("Cool sky fill",(.8,-.36,.83),(.60,.74,1),.82,29)
    sun("Rim",(.4,.79,.76),(.93,.90,.78),1.22,22)

    # Orient the far edge of the water parallel to the picture frame.
    # The plane extends past the frame at the near edge and at both sides.
    away = Vector((-direction.x,-direction.y,0)).normalized()
    shore = float((points@np.asarray(away)).max())+max(width,depth)*.44
    length = 8*max(spec.bbox)
    bpy.ops.mesh.primitive_plane_add(size=1, location=away*(shore-length/2))
    water = bpy.context.object
    water.rotation_euler.z = math.atan2(right.y,right.x)
    water.scale = (length,length,1)
    mat, shader = factory.material("Lake")
    shader.inputs["Base Color"].default_value = (.17,.28,.30,1)
    shader.inputs["Metallic"].default_value = .71
    shader.inputs["Roughness"].default_value = .12
    water.data.materials.append(mat)

    scene.render.film_transparent = True
    scene.view_settings.view_transform = "AgX"
    scene.render.resolution_x,scene.render.resolution_y = image_width,image_height
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.filepath = str(work/(spec.name+".png"))
    factory.require("FINISHED" in bpy.ops.render.render(write_still=True),f"Preview failed for {spec.name}")


def generate(pack_id, title, specs, builds, palette, labels):
    parser = argparse.ArgumentParser(description=f"Build {title} midground assets in background Blender.")
    parser.add_argument("--seed",type=int,default=20261203)
    parser.add_argument("--output-root",type=Path,default=factory.ROOT)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    factory.require(bpy.app.background and args.seed>=0,"Use background Blender with a non-negative seed")
    root = args.output_root.resolve()
    dest = root/"public/assets/scenes"/pack_id
    manifest = dest/"manifest.json"
    target = root/"tools/blender"/f"preview_{pack_id}_midground.png"
    factory.require(manifest.is_file(),f"Missing {manifest}")
    with tempfile.TemporaryDirectory(prefix=f".{pack_id}-midground-",dir=root) as temp:
        work = Path(temp)
        stage = work/pack_id
        stage.mkdir()
        rows = []
        for i,(spec,build) in enumerate(zip(specs,builds,strict=True)):
            row = factory.export(spec,build,palette,args.seed+113*i,stage,work,material_builder=materials)
            if spec.kind=="boat":
                row["motion"] = "boat"
            rows.append(row)
            print(f"{row['file']}  {row['triangles']} tris  {row['fileBytes']} bytes",flush=True)
            preview(spec,row,stage,work)

        sheet = work/target.name
        layout = work/"layout.json"
        factory.write_json(layout,dict(title=title,assets=rows,work=str(work),target=str(sheet),labels=labels))
        subprocess.run(["python3",__file__,"--compose-midground",str(layout)],check=True)
        target.parent.mkdir(parents=True,exist_ok=True)
        with factory.catalog_lock(dest):
            pack = json.loads(manifest.read_text(encoding="utf-8"))
            updated = {row["name"] for row in rows}
            originals = [row for row in pack["assets"] if row["name"] not in updated]
            for row in originals:
                (stage/row["file"]).symlink_to(dest/row["file"])
            pack["assets"] = originals+rows
            staged_manifest = stage/manifest.name
            factory.write_json(staged_manifest,pack)
            validator = Path(factory.__file__).with_name("validate_scene_pack.mjs")
            subprocess.run(["node",str(validator),str(staged_manifest)],check=True)
            publish([(stage/row["file"],dest/row["file"]) for row in rows]+
                    [(sheet,target),(staged_manifest,manifest)],work)


def publish(files, work):
    """Replace only the generated outputs, rolling back an interrupted file install."""
    import shutil

    backups = []
    try:
        for source,target in files:
            backup = work/(target.name+".previous")
            if target.exists():
                shutil.copyfile(target,backup)
            source.replace(target)
            backups.append((target,backup))
    except OSError:
        for target,backup in reversed(backups):
            if backup.exists():
                backup.replace(target)
            else:
                target.unlink(missing_ok=True)
        raise


def palette():
    return factory.basic_palette() | {
        WOOD: Surface((.42,.18,.12),.67,"wood",(.29,.115,.076)),
        TRIM: Surface((.29,.18,.116),.66,"wood"),
        ROOF: Surface((.135,.205,.229),.78,"brick",(.11,.15,.17)),
        ROCK: Surface((.60,.61,.54),.81,"brick",(.42,.47,.39)),
        DETAIL: Surface((.37,.45,.39),.86,"moss",(.32,.44,.31)),
        WEAVE: Surface((.58,.37,.23),.70,"wood"),
        PANEL: Surface((.58,.26,.19),.69,"wood"),
        BLOOM: Surface((.82,.29,.095),.64,"paper"),
        GLOW: Surface((.95,.66,.26),.57,"paper"),
    }


def zigzag_bridge(m, rng):
    # Six runs across the pond. The center landing is also the pavilion plinth.
    points = [(-11.1,-2.30),(-7.9,-2.50),(-5.5,.19),(-2.85,-.52),(2.85,-.52),
              (5.4,2.10),(7.8,1.62),(11.1,2.63)]
    for i,(x,y) in enumerate(points):
        if i in (0,7):
            stone_pier(m,x,y,-1.06,.74,2.25,2.89)
        elif i in (3,4):
            stone_pier(m,x*.65,y,-1.06,.77,2.03,3.68)
        else:
            stone_pier(m,x,y,-.96,.66,1.16,1.29)

    vertices = np.asarray(points)
    directions = np.diff(vertices, axis=0)
    directions /= np.linalg.norm(directions,axis=1)[:,None]
    sides = np.column_stack((-directions[:,1],directions[:,0]))
    # Miter the footprint at every bend, so the stone slabs cannot overlap
    # at a corner even when neighboring courses sit at the same height.
    miters = [sides[0]*1.255]
    for u,v in zip(sides,sides[1:]):
        miters.append((u+v)*(1.255/(1+u@v)))
    miters.append(sides[-1]*1.255)
    for i,(a,b) in enumerate(zip(vertices,vertices[1:])):
        if i==3:
            continue
        delta = b-a
        tangent = directions[i]
        side = sides[i]
        count = round(np.linalg.norm(delta)/.47)
        ma,mb = miters[i],miters[i+1]
        for k in range(count):
            u,v = (k+.028)/count,(k+.969)/count
            p,q = a+delta*u,a+delta*v
            left,right = ma+(mb-ma)*u,ma+(mb-ma)*v
            plan = (p-left,q-right,q+right,p+left)
            z = .80+.018*math.sin(i*3+k)
            bottom = [m.vertex((*p,z-.185)) for p in plan]
            top = [m.vertex((*p,z+.185)) for p in plan]
            quad(m,bottom[::-1],ROCK)
            quad(m,top,ROCK)
            strip(m,bottom,top,ROCK)
        for sign in (-1,1):
            p,q = a+side*sign*1.09+tangent*.17,b+side*sign*1.09-tangent*.17
            rail(m,p,q,max(4,count),base=.973+i*.009,height=.58,slot=ROCK,stone=True)

    m.box((0,-.52,.78),(5.82,4.92,.49),ROCK)
    m.box((.03,-.54,1.054),(5.67,4.71,.14),DETAIL)
    for x in np.linspace(-2.49,2.49,12):
        m.box((x,-.52,1.113+.013*math.sin(x*4)),(.411,4.35,.19),ROCK)
    pavilion(m,0,-.50,1.22,4.62,4.63,2.42,1.48,lantern_y=-1.82)
    for y in (-2.50,1.44):
        for a,b in ((-2.71,-1.04),(1.04,2.71)):
            rail(m,(a,y),(b,y),4,base=1.207,height=.60,slot=ROCK,stone=True)
    for x,y in ((-10.91,-3.47),(10.83,3.48)):
        for i in range(3):
            rock(m,(x+(.35*i if x<0 else -.36*i),y+.15*i,-.36),
                 (1.33,1.45,.86+i*.17),3,8,rng,DETAIL,cap=ROCK)


def painted_barge(m, _rng):
    hull(m,13.5,4.0,stripe=PANEL,rubrail=WEAVE)
    bays = tuple((x,.95,i!=1,2,2) for i,x in enumerate((-2.54,-1.27,0,1.27,2.54)))
    opposing_facades(m,-.18,0,6.82,2.48,.60,2.29,[(.86,2.05,bays)],WOOD,TRIM)
    for y in (-1.45,1.45):
        for x in np.linspace(-3.45,3.10,7):
            m.stack(x,y,[(.60,.117),(.80,.145),(2.18,.107),(2.35,.124)],8,PANEL)
            m.box((x,y,2.27),(.36,.35,.21),WEAVE)
    tiled_roof(m,-.18,0,2.39,7.61,3.96,.59,hip=.30,curl=.41,columns=9,rows=4)
    # The upper lantern cabin sits inside a separate clerestory roof on the main ridge.
    opposing_facades(m,-.39,0,3.62,1.53,2.54,3.18,
                     [(2.66,3.06,((-1.08,.70,True,1,0),(0,.82,True,2,0),(1.08,.70,True,1,0)))],
                     PANEL,TRIM)
    tiled_roof(m,-.39,0,3.25,4.39,2.32,.47,hip=.31,curl=.36,columns=9,rows=4)
    boat_railings(m,((-5.62,-3.99),(3.71,5.54)),1.04,height=.57,slot=PANEL)
    end_lamps(m,((-5.25,-.34,1.43),(5.48,-.43,1.58)),paper=BLOOM)
    for x in (-2.75,2.37):
        hanging_lantern(m,x,-1.67,1.78,radius=.188,drop=.31,paper=BLOOM)


def main():
    specs = (
        Asset("jiangnan_zigzag_bridge_mid","曲院九曲石桥与荷心水亭","西湖九曲石桥，暖灯水亭朝 +Z",
              (24,6.5,10),-1.06,(4500,7500),camera=(3.7,-10,3.4)),
        Asset("jiangnan_painted_barge_mid","西湖古典画舫","双层漆木船，船首朝 +X",
              (13.5,4.8,4),-1.02,(4000,6800),"boat",camera=(3,-10,2.8)),
    )
    generate("jiangnan","Jiangnan · West Lake",specs,(zigzag_bridge,painted_barge),palette(),
             ("Zigzag bridge and water pavilion","Painted pleasure barge"))


if __name__=="__main__":
    main()
