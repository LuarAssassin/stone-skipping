"""Build the Lucerne midground pack and provide the shared Wave 2 geometry pipeline.

Run each pack with Blender in background mode, using -t 4 and --python-exit-code 1.
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


def compose(layout):
    from PIL import Image, ImageDraw, ImageFont

    work = Path(layout["work"])
    sheet = Image.new("RGB",(2068,698),"#e9e5da")
    draw = ImageDraw.Draw(sheet)
    title = ImageFont.truetype("DejaVuSerif.ttf",47)
    text = ImageFont.truetype("DejaVuSans.ttf",23)
    mono = ImageFont.truetype("DejaVuSansMono.ttf",15)
    draw.text((32,21),layout["title"],fill="#26343a",font=title)
    draw.line((34,94,2034,94),fill="#989d92",width=2)
    for i,(row,label) in enumerate(zip(layout["rows"],layout["labels"],strict=True)):
        x = 34+i*675
        card = Image.new("RGB",(650,478),layout["sky"])
        with Image.open(work/(row["name"]+".png")) as im:
            rgba = im.convert("RGBA").resize(card.size,Image.Resampling.LANCZOS)
        card.paste(rgba,mask=rgba.getchannel("A"))
        sheet.paste(card,(x,112))
        draw.text((x,605),label,fill="#25343a",font=text)
        draw.text((x,645),row["file"],fill="#4b625c",font=mono)
        dims = " × ".join(f"{value:.2f}" for value in row["bboxMeters"])
        draw.text((x+650,645),dims+" m",fill="#4b625c",font=mono,anchor="ra")
    sheet.save(layout["target"],optimize=True)


if __name__=="__main__" and "--compose-wave-two" in sys.argv:
    layout = Path(sys.argv[sys.argv.index("--compose-wave-two")+1])
    compose(json.loads(layout.read_text(encoding="utf-8")))
    raise SystemExit(0)


import bpy
import numpy as np
from mathutils import Vector

import scene_pack_factory as factory
from scene_pack_factory import (
    Asset, Surface, BARK, BLOOM, COVER, DETAIL, EMIT, GLOW, LEAF, LEAF2,
    METAL, NEEDLE, PANEL, ROCK, ROOF, SNOW, TRIM, WEAVE, WOOD, beam, cuboid, rock,
)
from generate_stones import sun
from generate_venice_midground import prism, quad


def block(m, x0, x1, y0, y1, z0, z1, slot, group=0):
    cuboid(m, ((x0+x1)/2, (y0+y1)/2, (z0+z1)/2), (x1-x0, y1-y0, z1-z0), slot, group)


def turn(m, start, x, y, angle):
    c, s = math.cos(angle), math.sin(angle)
    m.xyz[start:] = [(x+c*(u-x)-s*(v-y), y+s*(u-x)+c*(v-y), z) for u,v,z in m.xyz[start:]]


def room(m, x, y, z, width, depth, height, walls, trim, rows, *, shutters=False, rear=True):
    """Perforated walls, solid 0.36 m recessed glazing, sills and projecting shutters.

    Rows are (bottom, top, [(local centre, opening width), ...]), measured
    from the room floor. Rotate the result to put glazing on other elevations.
    """
    w, d = width/2, depth/2
    for side in (1, -1):
        start = len(m.xyz)
        face = y-d
        left, right = x-w, x+w
        last = z
        for bottom, top, openings in rows if side > 0 or rear else ():
            a, b = z+bottom, z+top
            block(m,left,right,face,face+.57,last,a,walls)
            end = left
            for u, size in openings:
                cx = x+u
                lo, hi = cx-size/2, cx+size/2
                factory.require(end < lo < hi < right, "Opening exceeds room wall")
                block(m,end,lo,face,face+.57,a,b,walls)
                frame = min(.13,size*.18)
                block(m,lo,hi,face+.36,face+.51,a,b,GLOW,EMIT)
                for l,r in ((lo-frame*.08,lo+frame),(hi-frame,hi+frame*.08)):
                    block(m,l,r,face-.255,face+.32,a-.028,b+.018,trim)
                block(m,lo+frame,hi-frame,face-.26,face+.31,b-.09,b+.046,trim)
                block(m,lo+.11*frame,hi-.17*frame,face-.31,face+.29,a-.084,a+.085,trim)
                block(m,cx-.039,cx+.039,face-.061,face+.34,a+.031,b-.024,trim)
                if shutters:
                    for sign in (-1,1):
                        sx = cx+sign*(size/2+.082)
                        m.box((sx,face-.197,(a+b)/2),(.117,.23,b-a-.12),trim,angle=sign*.24)
                        for t in (.25,.73):
                            m.box((sx+sign*.015,face-.314,a+t*(b-a)),
                                  (.104,.088,.041),walls,angle=sign*.24)
                end = hi
            block(m,end,right,face,face+.57,a,b,walls)
            last = b
        block(m,left,right,face,face+.57,last,z+height,walls)
        if side < 0:
            turn(m,start,x,y,math.pi)
    for side in (-1,1):
        cx = x+side*(w-.24)
        block(m,cx-.24,cx+.24,y-d+.57,y+d-.57,z+.012,z+height-.012,walls)


def roof(m, x, y, z, width, depth, rise, slot, *, nx=9, courses=5, ridge_slot=None, warp=.12,
         tile_relief=(.019,.085)):
    """Closed pitched roof with lapped tile courses, full eaves and rounded ridge."""
    half = width/2
    for side in (-1, 1):
        def surf(t,u,drop=0):
            return (x+side*half*t, y+(u-.5)*depth,
                    z+rise*(1-t)**1.14+warp*(2*u-1)**6*(.3+.7*t)-drop)

        m.grid(surf,courses,nx,slot,flip=side<0,shade=False)
        m.grid(lambda t,u:surf(t,u,.23),courses,nx,TRIM,flip=side>0,shade=False)
        for end in (0,1):
            m.grid(lambda t,v:surf(t,end,.23*v),courses,1,TRIM,flip=(side<0)==(end==1),shade=False)
        m.grid(lambda u,v:surf(1,u,.23*v),nx,1,TRIM,flip=side>0,shade=False)
        for j in range(courses):
            a = (j+.14)/courses
            b = (j+.94)/courses
            for k in range(nx):
                u = (k+.033)/nx
                v = (k+.967)/nx
                entry,lip = tile_relief
                coords = [surf(t,s,-h) for t,s,h in ((a,u,entry),(b,u,lip),(b,v,lip),(a,v,entry))]
                if side < 0:
                    coords.reverse()
                top = [m.vertex(p) for p in coords]
                base = [m.vertex((px,py,pz-.101)) for px,py,pz in coords]
                tile = slot if k%5!=3 or ridge_slot is None else ridge_slot
                quad(m,top,tile)
                for i in range(4):
                    q = (i+1)%4
                    quad(m,(base[i],base[q],top[q],top[i]),tile)
    points = [(x,y+(u-.5)*depth,z+rise+.038+warp*.3*(2*u-1)**6)
              for u in np.linspace(-.008,1.008,nx+2)]
    m.tube(points,[.125]*len(points),8,ridge_slot if ridge_slot is not None else slot)


def gable(m, x, y, z, width, depth, rise, slot):
    half = width/2
    prism(m,[(x-half,z-.07),(x+half,z-.07),(x,z+rise)],y-depth/2+.041,y+depth/2-.041,slot)


def rock_cluster(m, rng, x, y, bottom, top, width, depth, slot=ROCK, *, style="granite",
                 cap=None, stones=9):
    """Broad bedrock with a usable upper shelf and overlapping irregular shore fragments."""
    rock(m,(x,y,(bottom+top)/2),(width,depth,top-bottom),7,19,rng,slot,style,cap)
    for i in range(stones):
        a = 2*math.pi*i/stones+rng.uniform(-.14,.14)
        px, py = x+math.cos(a)*width*.38, y+math.sin(a)*depth*.37
        size = rng.uniform(.17,.29)*width
        hi = rng.uniform(.39,.81)*top+.14
        lo = bottom+.067+(i%5)*.091
        rock(m,(px,py,(lo+hi)/2),(size,size*rng.uniform(.62,1.02),hi-lo),
             4,9+i%3,rng,slot if i%4 else DETAIL,style,cap if i%3==0 else None)


def quay(m, x, y, w, d, top, *, slot=ROCK, bottom=-1.06, courses=3, blocks=12):
    """Battered quay with solid ring courses and relief-cut shore masonry."""
    levels = (bottom, -.49, .03, top)
    for k, (lo,hi) in enumerate(zip(levels, levels[1:])):
        factor = 1-k*.035
        m.box((x+.024*k,y+.017*k,(lo+hi)/2),(w*factor,d*factor,hi-lo),slot if k!=2 else DETAIL)
    for k in range(courses):
        for i in range(blocks):
            a = (i+.5+.22*(k%2))/blocks-.5
            z = -.74+k*.44+i*.003
            m.box((x+a*w*.96,y-d*.497+.079*k,z),
                  (w*.89/blocks,.27+(i%4)*.044,.35),slot if i%4 else DETAIL,
                  angle=math.sin(i*9+k)*.019)
    m.box((x+.03,y+.028,top+.074),(w*.987,d*.987,.202),DETAIL)


def rails(m, points, z, height, slot, *, rope=False):
    for i, (x,y) in enumerate(points):
        m.stack(x,y,[(z-.085,.112),(z+height,.10),(z+height+.07,.059)],6,slot,phase=i*.11)
    for (x,y),(a,b) in zip(points,points[1:]):
        dx,dy = a-x,b-y
        if rope:
            cut = .060/math.hypot(dx,dy)
            path = [(x+(a-x)*t,y+(b-y)*t,z+height*.77-.17*math.sin(math.pi*t))
                    for t in np.linspace(cut,1-cut,4)]
            m.tube(path,[.048]*len(path),5,WEAVE)
        else:
            cut = .052/math.hypot(dx,dy)
            for part in (.44,.90):
                h = z+height*part
                m.beam((x+dx*cut,y+dy*cut,h),(a-dx*cut,b-dy*cut,h),.116,.107,slot)


def lamp(m, x, y, z, scale=1., *, mount=True, metal=METAL):
    if mount:
        m.stack(x,y,[(z-.53*scale,.058*scale),(z-.15*scale,.084*scale)],8,metal)
    def core(profile, sides, material, group=0):
        m.stack(x,y,[(z+h*scale,r*scale) for h,r in profile],sides,material,group=group)

    core(((-.20,.11),(-.15,.19),(.16,.175),(.20,.11)),8,GLOW,EMIT)
    core(((-.25,.126),(-.193,.202),(-.173,.169)),8,metal)
    core(((.174,.17),(.225,.203),(.324,.07)),8,metal)
    for j in range(4):
        a = (j+.5)*math.pi/2
        dx,dy = math.cos(a)*.174*scale, math.sin(a)*.174*scale
        m.tube([(x+dx,y+dy,z-.182*scale),(x+dx*.94,y+dy*.94,z+.207*scale)],
               [.022*scale]*2,5,metal)


def pine(m, rng, x, y, z, height, width, *, ponderosa=False):
    """Stacked asymmetrical evergreen tiers with real sculpted boughs."""
    lean = rng.uniform(-.37,.37)
    m.tube([(x,y,z-.17),(x+.17*lean,y,z+height*.35),
            (x+.63*lean,y+.09,z+height*.74),(x+lean,y+.19,z+height)],
           [.23,.15,.079,.024],9,BARK)
    for j in range(5):
        t = j/5
        h = z+height*((.34+.13*j) if ponderosa else (.24+.15*j))
        r = width*.5*(1-(.52 if ponderosa else .77)*t)
        for k in range(5):
            a = k*math.tau/5+j*.49
            px,py = x+lean*t+math.cos(a)*r*.54, y+math.sin(a)*r*.54
            rock(m,(px,py,h+r*.18),(r*1.31,r*1.39,r*1.43),2,5,rng,
                 NEEDLE if (k+j)%3 else LEAF)
        tip = z+height if j==4 else h+r*1.33
        m.stack(x+lean*t,y+.03*j,[(h-.11,r*.55),(h+.14,r*.62),(tip,.055)],9,
                NEEDLE,phase=j*.29)


def palm(m, rng, x, y, z, h, spread, lean, *, coconut=False, fronds=7):
    """Bent ringed trunks and feather-shaped, arched, solid leaf blades."""
    path = [(x+lean*t*t,y+.22*lean*t*t,z+h*t) for t in np.linspace(0,1,10)]
    radius = .266 if coconut else .315
    m.tube(path,np.linspace(radius,radius*.52,len(path)),9,BARK)
    tip = np.asarray(path[-1])
    m.stack(tip[0],tip[1],[(tip[2]-.34,.265),(tip[2]-.03,.30),(tip[2]+.27,.18)],9,TRIM)
    for i in range(fronds):
        a = i*math.tau/fronds+rng.uniform(-.15,.15)
        outward = np.array((math.cos(a),math.sin(a),0.))
        across = np.array((-math.sin(a),math.cos(a),0.))
        span = spread*rng.uniform(.8,1.2)
        root = tip + (.0,.0,rng.uniform(-.07,.17))
        def spine(t):
            return root+outward*(span*t)+(0,0,span*(.29*math.sin(math.pi*t)-(.37 if coconut else .25)*t*t))
        ts = np.linspace(0,1,7)
        m.tube([spine(t) for t in ts],np.linspace(.055,.012,len(ts)),5,LEAF2)
        for k in range(1,7):
            t = k/7
            for sign in (-1,1):
                p = spine(t)+(.0,.0,.008*sign)
                fan = across*(sign*span*(.193 if coconut else .171)*math.sin(math.pi*t)**.58)
                q = p+fan+outward*(.163*span)+(0,0,-.142*span)
                r = p+.49*fan+outward*(.089*span)+(0,0,-.010*span)
                s = p+.58*fan+outward*(.192*span)+(0,0,-.068*span)
                ids = [m.vertex(v) for v in (p,r,q,s)]
                # Give leaflets a ridged cross section so both faces read in the water.
                ridge = m.vertex((p+q)/2+(0,0,.042))
                for j in range(4):
                    n = (j+1)%4
                    m.face((ids[j],ids[n],ridge),((0,0),(1,0),(.54,1)),
                           LEAF if (i+k)%4 else LEAF2,shade=False)
                m.face(ids[::-1],((0,0),(1,0),(1,1),(0,1)),LEAF,shade=False)
    if coconut:
        for i in range(4):
            a = i*math.tau/4
            rock(m,tip+(.22*math.cos(a),.22*math.sin(a),-.29-i*.03),
                 (.29,.31,.34),3,8,rng,WOOD)


def hull(m, length, width, *, body=WOOD, boot=TRIM, rail_slot=DETAIL, y=0.,
         draft=1.06, sheer=.55, stations=23, rounded=False):
    """Sealed planked displacement hull, with the bow at +X and a cambered deck."""
    rings = []
    profile = ((0,-1.),(.31,-.88),(.54,-.66),(.72,-.37),(.86,-.09),
               (.94,.09),(.99,.33),(1.,.56))
    slots = (body,body,body,boot,boot,body,rail_slot)
    u = np.linspace(-1,1,stations)
    for t in u:
        full = max(.035,(1-abs(t)**(3.2 if rounded else 2.55))**(.49 if t<0 else .70))
        stem = (.47 if t>0 else .21)*abs(t)**5
        keel = draft*.91*abs(t)**2.9
        port = [(length*t/2,y-width*.5*w*full,
                 (z*draft+keel*(1-w) if z<0 else z/.56*sheer)+stem)
                for w,z in profile]
        plank = port+[(x,2*y-v,z) for x,v,z in port[1:][::-1]]
        x,_,z = port[-1]
        plank.insert(len(port),(x,y,z+.063))
        rings.append([m.vertex(p) for p in plank])

    bands = slots+(WEAVE,WEAVE)+slots[::-1]
    for j,(a,b) in enumerate(zip(rings,rings[1:])):
        for k,slot in enumerate(bands):
            n = (k+1)%len(a)
            m.face((a[k],b[k],b[n],a[n]),((j/(stations-1),0),((j+1)/(stations-1),0),
                   ((j+1)/(stations-1),1),(j/(stations-1),1)),slot,shade=k not in (7,8))
    for j,row in enumerate((rings[0],rings[-1][::-1])):
        xy = [(m.xyz[p][1],m.xyz[p][2]) for p in row]
        bounds = np.asarray(xy)
        uv = ((bounds-bounds.min(axis=0))/np.ptp(bounds,axis=0)).tolist()
        m.face(row,uv,body,shade=False)


def boat_rails(m, length, width, slot, *, top=.92):
    for side in (-1,1):
        for lo,hi in ((-.42,-.22),(.24,.44)):
            pts = [(t*length,side*width*(.469-.44*abs(2*t)**2.4)) for t in np.linspace(lo,hi,4)]
            rails(m,pts,top-.37,.45,slot)


def sail(m, rings, slots, *, panels=12, belly=.37, thickness=.067):
    """Closed cambered cloth. Rings are (luff, leech) pairs from bottom to head."""
    ribs = len(rings)-1
    shape = np.asarray(rings,dtype=float)
    chord = shape[0,1]-shape[0,0]
    rise = shape[-1].mean(axis=0)-shape[0].mean(axis=0)
    reverse = np.cross(chord,rise)[1] > 0

    def seam(ids, slot):
        quad(m,ids[::-1] if reverse else ids,slot)

    slices = []
    for surface in (-1,1):
        lattice = []
        for i,(a,b) in enumerate(shape):
            t = i/ribs
            row = []
            for j in range(panels+1):
                u = j/panels
                point = a*(1-u)+b*u
                point[1] += belly*math.sin(math.pi*u)*(.21+.79*math.sin(math.pi*t)**.72)
                point[1] += surface*thickness/2
                row.append(m.vertex(point))
            lattice.append(row)
        slices.append(lattice)
    for side, grid in enumerate(slices):
        for i in range(ribs):
            for j in range(panels):
                ids = (grid[i][j],grid[i][j+1],grid[i+1][j+1],grid[i+1][j])
                uv = ((j/panels,i/ribs),((j+1)/panels,i/ribs),
                      ((j+1)/panels,(i+1)/ribs),(j/panels,(i+1)/ribs))
                if bool(side) != reverse:
                    ids,uv = ids[::-1],uv[::-1]
                m.face(ids,uv,slots(i,j),shade=True)
    front,back = slices
    for i in range(ribs):
        seam((front[i][0],front[i+1][0],back[i+1][0],back[i][0]),slots(i,0))
        seam((back[i][-1],back[i+1][-1],front[i+1][-1],front[i][-1]),slots(i,panels-1))
    for j in range(panels):
        seam((front[0][j],back[0][j],back[0][j+1],front[0][j+1]),slots(0,j))
        seam((front[-1][j],front[-1][j+1],back[-1][j+1],back[-1][j]),slots(ribs-1,j))


def triangular_sail(m, corners, slots, *, belly=.38, rows=15, panels=13):
    a,b,c = np.asarray(corners,dtype=float)
    rings = [(a*(1-t)+c*t,b*(1-t)+c*t) for t in np.linspace(0,.991,rows+1)]
    sail(m,rings,slots,panels=panels,belly=belly)
    for p,q in ((a,b),(a,c),(b,c)):
        m.tube([p+(0,-.046,0),q+(0,-.046,0)],[.035,.023],7,TRIM)


def overlap_pairs(glb, distance=1e-5):
    """Find positive-area, same-facing coplanar overlap in the exported mesh.

    AABB sweep in X, normal and plane tests, then a 2D separating-axis test.
    Shared edges/vertices are intentionally excluded. Positions are in metres.
    """
    triangles = []
    for mesh in glb.doc["meshes"]:
        for part in mesh["primitives"]:
            xyz = glb.accessor(part["attributes"]["POSITION"]).astype(np.float64)
            indices = glb.accessor(part["indices"]).reshape(-1,3)
            triangles.extend(xyz[indices])
    t = np.asarray(triangles)
    lo,hi = t.min(axis=1),t.max(axis=1)
    n = np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0])
    n /= np.linalg.norm(n,axis=1)[:,None]
    order = np.argsort(lo[:,0])
    end = np.searchsorted(lo[order,0],hi[order,0]+distance,side="right")
    for k,i in enumerate(order):
        js = order[k+1:end[k]]
        keep = ((hi[js]>=lo[i]-distance)&(lo[js]<=hi[i]+distance)).all(axis=1)
        js = js[keep & (np.abs(n[js]-n[i]).max(axis=1)<1e-5)]
        js = js[(np.abs((t[js]-t[i,0]) @ n[i]).max(axis=1)<distance)]
        if not len(js):
            continue
        axes = [a for a in range(3) if a!=np.argmax(abs(n[i]))]
        a = t[i][:,axes]
        b = t[js][:,:,axes]
        sides = np.concatenate((np.broadcast_to(a,(len(js),3,2)),b),axis=1)
        edges = sides[:,[1,2,0,4,5,3]]-sides
        normals = edges[:,:,[1,0]] * (-1,1)
        edge_len = np.linalg.norm(normals,axis=2)
        pa = np.einsum("ik,jlk->jil",a,normals)
        pb = np.einsum("jik,jlk->jil",b,normals)
        width = np.minimum(pa.max(axis=1),pb.max(axis=1))-np.maximum(pa.min(axis=1),pb.min(axis=1))
        for j in js[(width > distance*edge_len).all(axis=1)]:
            yield t[i], t[j]


def preview(spec, row, stage, work, water_color):
    """Render the delivered GLB at its origin, with a real reflected silhouette."""
    scene = factory.fresh_scene()
    bpy.ops.import_scene.gltf(filepath=str(stage/row["file"]))
    obj, = bpy.context.selected_objects
    points = np.asarray([obj.matrix_world@v.co for v in obj.data.vertices])
    direction = Vector(spec.camera).normalized()
    rot = (-direction).to_track_quat("-Z","Y").to_euler()
    right,up = rot.to_matrix().col[:2]
    xp, yp = points@np.asarray(right), points@np.asarray(up)
    reflected = points[points[:,2]>0] * (1,1,-.46)
    floor = min(yp.min(), (reflected@np.asarray(up)).min())
    center = right*((xp.min()+xp.max())*.5)+up*((yp.max()+floor)*.5)
    width,height = 720,530
    cam = bpy.data.cameras.new("Specimen camera")
    cam.type = "ORTHO"
    cam.ortho_scale = max(np.ptp(xp)*1.14, (yp.max()-floor)*width/height*1.16)
    camera = bpy.data.objects.new("Specimen camera",cam)
    scene.collection.objects.link(camera)
    camera.location = center+direction*max(spec.bbox)*3.4
    camera.rotation_euler = rot
    scene.camera = camera

    scene.world = bpy.data.worlds.new("Evening sky")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (.58,.71,.93,1)
    background.inputs["Strength"].default_value = .45
    sun("Peach light",(-.66,-.60,1.05),(1,.80,.64),2.18,15)
    sun("Cool fill",(.8,-.36,.83),(.65,.77,1),.76,28)
    sun("Rim",(.4,.79,.76),(.92,.90,.83),1.10,20)

    away = Vector((-direction.x,-direction.y,0)).normalized()
    extent = max(spec.bbox)
    far = float((points@np.asarray(away)).max())+extent*.42
    length = extent*8
    bpy.ops.mesh.primitive_plane_add(size=1,location=away*(far-length/2))
    plane = bpy.context.object
    plane.rotation_euler.z = math.atan2(right.y,right.x)
    plane.scale = (length,length,1)
    mat, shader = factory.material("Lake surface")
    shader.inputs["Base Color"].default_value = (*water_color,1)
    shader.inputs["Metallic"].default_value = .60
    shader.inputs["Roughness"].default_value = .105
    plane.data.materials.append(mat)
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "AgX"
    scene.render.resolution_x, scene.render.resolution_y = width,height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.render.filepath = str(work/(spec.name+".png"))
    factory.require("FINISHED" in bpy.ops.render.render(write_still=True),f"Preview failed for {spec.name}")


def generate(pack, title, entries, palette, water, sky, *, originals, seed):
    parser = argparse.ArgumentParser(description=f"Build {title} midground assets.")
    parser.add_argument("--seed",type=int,default=seed)
    parser.add_argument("--output-root",type=Path,default=factory.ROOT)
    opts = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    factory.require(bpy.app.background and opts.seed>=0,"Use background Blender and a nonnegative seed")
    root = opts.output_root.resolve()
    dest = root/"public/assets/scenes"/pack
    manifest = dest/"manifest.json"
    output = root/"tools/blender"/f"preview_{pack}_midground.png"
    with tempfile.TemporaryDirectory(prefix=f".{pack}-midground-",dir=root) as tmp:
        work = Path(tmp)
        stage = work/pack
        stage.mkdir()
        rows = []
        for i,(spec,build,label) in enumerate(entries):
            def build_model(model, rng):
                light = build(model,rng)
                if light is not None:
                    xyz = np.asarray(model.xyz)
                    minimum = xyz.min(axis=0)
                    scale = np.asarray((spec.bbox[0],spec.bbox[2],spec.bbox[1]))/np.ptp(xyz,axis=0)
                    delta = (np.asarray(light)-minimum)*scale
                    offset = [delta[0]-spec.bbox[0]/2,delta[2]+spec.base,spec.bbox[2]/2-delta[1]]
                    print(f"{spec.name} lanternLightOffset {[round(float(v),3) for v in offset]}",flush=True)
            row = factory.export(spec,build_model,palette,opts.seed+113*i,stage,work)
            overlaps = list(overlap_pairs(factory.Glb(stage/row["file"])))
            for a,b in overlaps[:12]:
                print(f"Coplanar overlap centroids: {a.mean(axis=0).round(4)}, {b.mean(axis=0).round(4)}")
            factory.require(not overlaps,f"{row['file']}: {len(overlaps)} coplanar triangle overlaps")
            if spec.kind=="boat":
                row["motion"] = "boat"
            print(f"{row['file']}: {row['triangles']} triangles, {row['fileBytes']} bytes, 0 coplanar overlaps",flush=True)
            rows.append(row)
        for (spec,_,_),row in zip(entries,rows,strict=True):
            preview(spec,row,stage,work,water)
        contact_sheet = work/output.name
        layout = work/"layout.json"
        factory.write_json(layout,dict(work=tmp,title=title,sky=sky,rows=rows,
                                      labels=[entry[2] for entry in entries],target=str(contact_sheet)))
        subprocess.run(["python3",__file__,"--compose-wave-two",str(layout)],check=True)
        output.parent.mkdir(parents=True,exist_ok=True)
        with factory.catalog_lock(dest):
            data = json.loads(manifest.read_text(encoding="utf-8"))
            names = {row["name"] for row in rows}
            old = [row for row in data["assets"] if row["name"] not in names]
            factory.require(data["packId"]==pack and len(old)==originals,"Unexpected base catalogue")
            for row in old:
                (stage/row["file"]).symlink_to(dest/row["file"])
            data["assets"] = old+rows
            staged_manifest = stage/manifest.name
            factory.write_json(staged_manifest,data)
            validator = Path(__file__).with_name("validate_scene_pack.mjs")
            subprocess.run(["node",str(validator),str(staged_manifest)],check=True)
            publish([(stage/row["file"],dest/row["file"]) for row in rows]+
                    [(contact_sheet,output),(staged_manifest,manifest)],work)


def publish(files, work):
    """Install only the new assets, catalogue and sheet, with rollback on I/O failure."""
    import shutil

    replaced = []
    try:
        for src,dest in files:
            backup = work/(dest.name+".previous")
            if dest.exists():
                shutil.copyfile(dest,backup)
            src.replace(dest)
            replaced.append((dest,backup))
    except OSError:
        for dest,backup in reversed(replaced):
            if backup.exists():
                backup.replace(dest)
            else:
                dest.unlink()
        raise


def lantern_storey(m, x, y, radius, low, high, sides, body, trim, *, opening=.50):
    """Polygonal masonry storey with true wall openings and a recessed lantern core."""
    apothem = radius*math.cos(math.pi/sides)
    half = radius*math.sin(math.pi/sides)
    for i in range(sides):
        start = len(m.xyz)
        left, right = x-half+.018, x+half-.018
        face = y-apothem
        a, b = low+.15*(high-low), high-.17*(high-low)
        wide = half*opening
        # Adjacent faces taper inward to meet at the octagon corners.
        for l,r,z0,z1 in ((left,right,low,a),(left,x-wide,a,b),
                          (x+wide,right,a,b),(left,right,b,high)):
            front = [m.vertex((u,face,z)) for u,z in ((l,z0),(r,z0),(r,z1),(l,z1))]
            inner = [m.vertex((x+(u-x)*(1-.61/apothem),face+.61,z))
                     for u,z in ((l,z0),(r,z0),(r,z1),(l,z1))]
            quad(m,front,body)
            quad(m,inner[::-1],body)
            for j in range(4):
                k = (j+1)%4
                quad(m,(front[k],front[j],inner[j],inner[k]),body)
        block(m,x-wide*.83,x+wide*.83,face+.38,face+.55,a+.021,b-.022,GLOW,EMIT)
        block(m,x-wide-.063,x+wide+.073,face-.24,face+.29,a-.057,a+.068,trim)
        block(m,x-wide-.067,x+wide+.069,face-.253,face+.26,b-.072,b+.063,trim)
        for sign in (-1,1):
            u = x+sign*(wide-.035)
            block(m,u-.059,u+.059,face-.25,face+.30,a+.077,b-.077,trim)
        turn(m,start,x,y,math.tau*i/sides)


def kapell(m, rng):
    quay(m,-12.48,.28,4.45,5.5,.55,blocks=7)
    x, y = 9.58, .66
    m.stack(x,y,[(-1.06,4.88),(-.26,4.8),(.67,4.60),(1.11,4.48),
                 (1.41,4.11),(6.64,3.86),(6.87,3.95)],8,ROCK,phase=math.pi/8)
    for j in range(4):
        for i in range(8):
            a = math.tau*i/8
            r = 3.78-j*.036
            m.box((x+r*math.sin(a),y-r*math.cos(a),1.74+j*1.14+i*.016),
                  (1.87+(i%3)*.24,.32,.62), DETAIL if (i+j)%4 else ROCK, angle=a)
    lantern_storey(m,x,y,3.93,6.85,8.65,8,ROCK,TRIM,opening=.31)
    m.stack(x,y,[(8.62,3.97),(8.79,4.13),(9.02,4.32),(9.18,4.22),
                 (9.42,3.93),(10.05,3.13),(10.94,2.27),(11.72,1.27),(12.24,.105)],8,ROOF,
            phase=math.pi/8)
    for i in range(8):
        a = math.tau*i/8+math.pi/8
        path = [(x+r*math.cos(a),y+r*math.sin(a),z) for z,r in
                ((9.09,4.24),(9.42,3.96),(10.05,3.17),(10.94,2.29),(11.72,1.29),(12.25,.13))]
        m.tube(path,[.079,.07,.061,.055,.055,.039],6,TRIM)
    m.stack(x,y,[(12.21,.14),(12.31,.20),(12.46,.13),(12.55,.07)],10,METAL)

    left, right, bridge_y = -11.47, 6.7, -.64
    for i, u in enumerate((-9.0,-4.4,.26,4.66)):
        for sign in (-1,1):
            fy = bridge_y+sign*1.24
            m.tube([(u-.03,fy+sign*.17,-1.033+i*.011),(u,fy,.41)],(.26,.21),10,
                   WOOD,phase=i*.22)
            beam(m,(u-1.23,fy+.031,-.43),(u+.16,fy,.43),.21,.28,TRIM)
        m.beam((u,bridge_y-1.46,.36),(u,bridge_y+1.47,.36),.38,.36,WOOD)
    for j in range(44):
        u = left+(right-left)*(j+.5)/44
        m.box((u,bridge_y+.009*math.sin(j),.591+.012*math.sin(j*6)),((right-left)/44-.017,3.17,.218),
              TRIM if j%4 else WOOD)
    for side in (-1,1):
        fy = bridge_y+side*1.38
        points = [(u,fy) for u in np.linspace(left+.09,right-.27,8)]
        rails(m,points,.716,.81,WOOD)
        for i,(u,v) in enumerate(points):
            m.box((u,v+.013,2.23),(.244,.27,3.08),WOOD)
            beam(m,(u+.015,v,2.99),(u+(.63 if i<7 else -.64),v,3.55),.15,.21,TRIM)
        m.box(((left+right)/2,fy,3.61),(right-left+.44,.41,.391),WOOD)
    mid = (left+right)/2
    start = len(m.xyz)
    roof(m,mid,bridge_y,3.80,4.05,right-left+.70,1.61,ROOF,nx=12,courses=4,ridge_slot=BLOOM)
    turn(m,start,mid,bridge_y,math.pi/2)
    for u in (-9.22,-4.44,.25,4.12):
        lamp(m,u,bridge_y-1.17,2.74,.79,mount=False)
    for i in range(5):
        rock(m,(12.82+i*.12,2.27-i*.74,-.17+i*.08),(1.99,.93,.87),
             3,8,rng,ROCK,"granite")
    return (x,y-3.66,7.83)


def chalet(m, x, y, z, w, d, h, rise):
    rows = ((.62,2.15,((-w*.29,1.08),(w*.29,1.08))),
            (h-2.24,h-.61,((-w*.27,1.20),(w*.27,1.20))))
    room(m,x,y,z,w,d,h,WOOD,TRIM,rows,shutters=True,rear=False)
    gable(m,x,y,z+h,w,d,rise*.79,WOOD)
    roof(m,x,y,z+h+.045,w+1.46,d+1.55,rise,ROOF,nx=6,courses=3,ridge_slot=BLOOM)
    for side in (-1,):
        face = y+side*d/2
        rail_y = face+side*.89
        m.box((x,face+side*.46,z+h-2.48),(w+.15,1.13,.262),TRIM)
        rails(m,[(u,rail_y) for u in np.linspace(x-w*.47,x+w*.47,5)],z+h-2.33,.73,TRIM)
        for i in (-1,1):
            u = x+i*w*.27
            m.box((u,rail_y+side*.022,z+h-1.65),(1.07,.36,.26),WOOD)
            for j in range(4):
                m.stack(u+(j-1.5)*.24,rail_y+side*.032,
                        [(z+h-1.56,.092),(z+h-1.42+.021*j,.147),(z+h-1.31+.026*j,.093)],
                        6,BLOOM if j!=2 else LEAF,phase=.23*j)
        for i in (-1,1):
            m.box((x+i*(w/2-.19),face+side*.19,z+h*.5),(.28,.43,h+.035),TRIM)
    m.box((x+w*.27,y+.51,z+h+rise*.55),(.62,.64,1.69),DETAIL)


def village(m, rng):
    quay(m,0,.05,25.48,10.52,.56,blocks=16)
    chalet(m,-8.13,.70,.738,7.45,6.0,5.19,2.26)
    chalet(m,-.23,1.42,.744,6.23,5.85,4.88,2.07)
    room(m,7.35,.90,.74,5.82,6.84,4.21,PANEL,DETAIL,((1.28,3.03,((-1.45,.84),(1.41,.89))),),rear=False)
    gable(m,7.35,.90,4.98,5.82,6.84,2.27,PANEL)
    roof(m,7.35,.90,4.98,6.63,7.46,2.56,ROOF,nx=5,courses=3,ridge_slot=METAL)
    x, y = 7.87, -2.29
    room(m,x,y,.75,2.97,2.77,7.76,PANEL,TRIM,
         ((.04,2.88,((0,1.22),)),(4.13,5.54,((0,.68),))),rear=False)
    m.box((x,y,8.53),(3.18,3.05,.38),DETAIL)
    lantern_storey(m,x,y,1.57,8.72,10.03,8,PANEL,TRIM,opening=.66)
    m.stack(x,y,[(9.98,1.62),(10.19,1.75),(10.43,1.56),(11.1,1.10),
                 (12.46,.73),(13.42,.22),(13.55,.058)],8,METAL,phase=math.pi/8)
    m.stack(x,y,[(13.51,.052),(13.83,.041)],8,TRIM)
    m.beam((x-.146,y,13.716),(x+.147,y,13.716),.042,.042,TRIM)
    for u,v in ((-12.01,3.47),(11.8,2.9),(4.06,3.8)):
        rock(m,(u,v,.91),(1.56,1.31,.83),3,8,rng,COVER,"granite")
    for u,v in ((3.71,-3.66),):
        lamp(m,u,v,1.5)
    return (7.87,-3.71,2.09)


def steamer(m, _rng):
    hull(m,15,3.38,body=SNOW,boot=ROOF,rail_slot=TRIM,stations=27,rounded=True)
    rows = ((.20,1.25,tuple((u,.79) for u in (-2.97,-1.52,0,1.50,2.91))),)
    room(m,-.34,0,.58,7.52,2.36,1.60,SNOW,METAL,rows)
    m.box((-.34,0,2.21),(7.82,2.79,.24),TRIM)
    m.box((-.344,.017,2.33),(7.66,2.71,.095),PANEL)
    for side in (-1,1):
        y = side*1.37
        rails(m,[(x,y) for x in np.linspace(-3.91,3.32,6)],2.37,.51,SNOW)
        for i,x in enumerate((-2.94,-1.5,.53,1.81)):
            m.stack(x,side*(1.04+i*.011),[(2.34,.068),(2.48,.077),(3.25,.055),(3.43,.086)],8,METAL)
        block(m,-1.63,.73,side*1.76-.17,side*1.76+.17,.39,.61,TRIM)
        # Closed paddle boxes with scalloped brass-inlaid side plates.
        points = [(-1.64,.40),(.72,.40),(.74,.72)]
        points.extend((-.46+1.2*math.cos(a),.72+1.18*math.sin(a)) for a in np.linspace(.051,math.pi-.047,19))
        points.append((-1.67,.73))
        a,b = sorted((side*1.02,side*2.10))
        prism(m,points,a,b,SNOW)
        center = (-.46,side*2.115,.75)
        m.tube([(-.46,side*2.08,.75),center,(center[0],side*2.15,center[2])],
               (.21,.27,.215),14,METAL)
        for j in range(11):
            theta = math.pi*j/10
            px,pz = -.46+.78*math.cos(theta),.75+.80*math.sin(theta)
            m.tube([(-.46,side*(2.108+j*.006),.75),(px,side*(2.118+j*.004),pz)],[.035,.028],6,TRIM)
    start = len(m.xyz)
    roof(m,-.82,0,3.36,2.72,5.92,.215,SNOW,nx=5,courses=2,ridge_slot=TRIM,
         tile_relief=(.012,.043))
    turn(m,start,-.82,0,math.pi/2)
    m.tube([(2.97,0,2.38),(2.93,0,2.66),(2.63,0,4.06),(2.61,0,4.15)],
           (.33,.29,.236,.278),16,METAL)
    m.tube([(2.69,0,3.78),(2.655,0,3.94)],(.264,.261),16,TRIM,phase=.09)
    boat_rails(m,15,3.36,SNOW)
    for x,y,z in ((-6.19,-.53,1.28),(6.15,-.34,1.34)):
        lamp(m,x,y,z,.79)
    return (6.15,-.34,1.34)


def main():
    palette = factory.basic_palette() | {
        WOOD: Surface((.54,.306,.145),.73,"wood"),
        TRIM: Surface((.715,.432,.204),.60,"carved"),
        ROCK: Surface((.48,.49,.49),.82,"slate"),
        DETAIL: Surface((.55,.53,.48),.84,"brick",(.32,.33,.33)),
        COVER: Surface((.37,.41,.33),.86,"granite"),
        ROOF: Surface((.46,.18,.106),.78,"seams"),
        BLOOM: Surface((.57,.235,.135),.75,"petal",(.78,.31,.25)),
        PANEL: Surface((.887,.839,.741),.83,"stone"),
        METAL: Surface((.151,.207,.195),.51,"seams"),
        SNOW: Surface((.91,.897,.80),.65,"lacquer"),
    }
    entries = (
        (Asset("alps_kapell_bridge_mid","琉森卡佩尔木廊桥与八角水塔","廊桥、水塔和石堤，临水面朝 +Z",
               (30,13.5,9),-1.06,(5000,8200),camera=(2.7,-10,3.03)),kapell,"Kapellbrücke and Wasserturm"),
        (Asset("alps_chalet_village_mid","瑞士湖畔尖顶教堂与木屋村落","湖畔木屋、挑檐、花箱和教堂，临水面朝 +Z",
               (26,14.5,11),-1.06,(4800,8000),camera=(2.5,-10,3.1)),village,"Lakeside chalets and church"),
        (Asset("alps_steam_paddleboat_mid","琉森湖百年蒸汽明轮游船","双层明轮游船，船首朝 +X",
               (15,5.2,4.2),-1.06,(3800,6500),"boat",camera=(3.2,-10,2.54)),steamer,"Lucerne paddle steamer"),
    )
    generate("alps","Lake Lucerne · Midground",entries,palette,(.19,.31,.34),"#c4d4df",originals=6,seed=20261207)


if __name__=="__main__":
    main()
