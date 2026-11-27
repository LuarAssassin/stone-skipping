"""Build the Wulingyuan natural arch, cliff plankway and canopy boat in background Blender."""

import math
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

import scene_pack_factory as factory
from scene_pack_factory import (
    Asset, Surface, BARK, BLOOM, COVER, DETAIL, GLOW, LEAF, LEAF2, NEEDLE,
    PANEL, ROCK, ROOF, TRIM, WEAVE, WOOD, beam, rock,
)
from generate_jiangnan_midground import (
    boat_railings, end_lamps, generate, hanging_lantern, hull, pavilion, rail, tiled_roof,
)


def palette():
    return factory.basic_palette() | {
        WOOD: Surface((.37,.229,.158),.75,"wood"),
        TRIM: Surface((.55,.299,.171),.73,"carved"),
        WEAVE: Surface((.57,.445,.296),.79,"wood"),
        PANEL: Surface((.55,.25,.167),.72,"lacquer"),
        ROOF: Surface((.15,.202,.21),.78,"slate"),
        ROCK: Surface((.639,.583,.499),.81,"sandstone"),
        DETAIL: Surface((.48,.429,.349),.86,"sandstone"),
        COVER: Surface((.50,.479,.372),.88,"sand_moss",(.29,.348,.235)),
        NEEDLE: Surface((.198,.339,.258),.88,"forest"),
        LEAF: Surface((.266,.409,.285),.82,"forest"),
        LEAF2: Surface((.355,.473,.290),.84,"forest"),
        GLOW: Surface((.96,.599,.201),.62,"paper"),
        BLOOM: Surface((.92,.353,.098),.68,"paper"),
    }


def shelf(m, bands, *, seed, cap=ROCK):
    """Closed layered sandstone volume. Each course shares its rings with the next."""
    rng = np.random.default_rng(seed)
    # Four long faces and four chamfers. Vary the chamfers and bed edges
    # by course while keeping the outline within its specified limits.
    angles = np.arange(12)*math.tau/12 + math.pi/12
    rings = []
    for z,x0,x1,y0,y1 in bands:
        row = []
        for i,angle in enumerate(angles):
            c,s = math.cos(angle),math.sin(angle)
            x = (x0+x1)/2+(x1-x0)/2*math.copysign(abs(c)**.53,c)
            y = (y0+y1)/2+(y1-y0)/2*math.copysign(abs(s)**.64,s)
            row.append(m.vertex((x+rng.uniform(-.08,.08),y+rng.uniform(-.09,.09),
                                 z+rng.uniform(-.15,.15))))
        rings.append(row)
    for i,(a,b) in enumerate(zip(rings,rings[1:])):
        slot = (DETAIL,ROCK,ROCK,COVER,ROCK,DETAIL,ROCK,ROCK)[i%8]
        for j in range(len(a)):
            k = (j+1)%len(a)
            m.face((a[j],a[k],b[k],b[j]),((0,.18),(1,.21),(1,.83),(0,.81)),slot,shade=False)
    uv = [(.5+.45*math.cos(a),.5+.45*math.sin(a)) for a in angles]
    for ring,flip,slot in ((rings[0],True,DETAIL),(rings[-1],False,cap)):
        # A fan seals the uneven cap without using a non-planar n-gon.
        center = m.vertex(np.mean([m.xyz[i] for i in ring],axis=0))
        for i in range(len(ring)):
            j = (i+1)%len(ring)
            face = (center,ring[i],ring[j])
            mapped = ((.5,.5),uv[i],uv[j])
            m.face(face[::-1] if flip else face, mapped[::-1] if flip else mapped, slot,shade=False)


def cliff_pine(m,rng,x,y,z,h,w,direction):
    trunk = [(x,y,z-.42),(x+direction*.32,y+.15,z+h*.35),
             (x+direction*.88,y+.29,z+h*.62),(x+direction*1.28,y+.35,z+h*.96)]
    m.tube(trunk,[h*.080,h*.058,h*.038,h*.010],8,BARK)
    for i in range(5):
        dx = direction*(.63+.29*i)+math.cos(i*3.4)*w*.31
        dy = math.sin(i*3.4)*w*.33
        zz = z+h*(.38+.145*i)
        m.tube([(x+direction*.51,y+.14,zz-h*.21),(x+dx*.68,y+dy*.54,zz-.14),
                (x+dx,y+dy,zz)],[h*.032,h*.019,h*.010],6,BARK)
        span = w*(.56-.051*i)
        rock(m,(x+dx,y+dy,zz+.10),(span,span*.82,h*.19),3,9,rng,(NEEDLE,LEAF,LEAF2)[i%3],cap=LEAF)


def arch(m,rng):
    # The inner edges flare from a 14 m clear foot to the crown. The lintel
    # closes at 13 m, leaving a continuous lake sightline through the rock.
    courses = ((-1.08,6.93),(-.42,7.13),(.18,7.36),(1.18,7.55),(2.49,7.67),(3.03,7.53),
               (4.35,7.34),(4.98,7.46),(6.22,7.09),(7.47,6.97),(8.14,6.96),(9.52,6.78),
               (10.31,6.47),(11.33,6.19),(11.89,5.82),(12.47,4.95),(12.90,3.74),(13.50,2.13))
    for sign in (-1,1):
        bands = []
        for i,(z,inner) in enumerate(courses):
            outer = 13.60-.90*math.sin(i*.196)+.55*math.sin(i*1.66+sign)
            left,right = sorted((sign*inner,sign*outer))
            side = sign*.47
            bands.append((z+sign*.045*max(z,0),left,right,
                          -5.7+side+.48*math.sin(i*.88),4.86+side+.36*math.sin(i*.72)))
        shelf(m,bands,seed=114+sign,cap=DETAIL)

    shelf(m,[
        (12.99,-2.87,2.94,-3.9,4.1),(13.34,-7.77,7.78,-4.63,4.65),
        (13.78,-10.4,10.29,-5.14,5.08),(14.36,-12.73,12.29,-5.65,5.67),
        (15.15,-12.96,11.52,-5.45,5.71),(15.89,-12.52,11.98,-5.25,5.67),
        (16.21,-11.96,11.22,-5.71,5.21),(17.23,-11.11,10.59,-5.37,4.72),
        (17.71,-10.68,10.09,-4.65,4.89),(18.34,-8.56,9.0,-4.49,4.53),
        (18.77,-7.28,7.68,-3.68,3.98),
    ],seed=240,cap=COVER)

    for i,(x,y,z,w,d,h) in enumerate(((-10.36,2.95,4.36,5.13,5.11,9.61),
                                     (10.33,3.94,4.26,4.36,4.52,8.76),
                                     (-11.18,-2.81,2.37,4.06,4.45,5.70),
                                     (10.82,-3.89,2.87,4.22,4.49,6.13))):
        rock(m,(x,y,z),(w,d,h),7,10,rng,DETAIL if i%2 else ROCK,"column",COVER)
    for x,y,z,w,d in ((-11.96,-3.25,-.35,2.72,2.15),(11.14,-4.18,-.33,2.92,2.31),
                      (12.29,3.44,-.26,3.12,3.03),(-11.52,4.58,-.31,2.54,3.52),
                      (-6.57,-.71,-.28,1.45,2.45),(7.39,3.87,-.29,1.62,1.87)):
        rock(m,(x,y,z),(w,d,1.57),4,11,rng,DETAIL,"basalt",COVER)
    for x,y,z,h,w,direction in ((-5.54,.17,18.63,2.85,3.44,-1),
                                 (1.93,-.77,18.62,3.22,3.51,1),
                                 (6.28,1.97,18.35,2.44,3.17,1),
                                 (-2.29,2.75,18.53,2.46,2.69,-1)):
        cliff_pine(m,rng,x,y,z,h,w,direction)


def cliff_hall(m,rng):
    for i,(x,w,zmax,y) in enumerate(((-4.41,8.04,12.18,.77),(1.59,8.33,14.12,1.50),
                                      (5.17,6.72,13.01,2.06))):
        bands = []
        for j,t in enumerate(np.linspace(0,1,16)):
            width = w*(.84+.14*math.sin(t*math.pi))*(1+.088*math.sin(j*1.77+i))
            depth = (4.19+i*.07)*(1+.091*math.sin(j*1.70+i))
            z = -1.11+(zmax+1.11)*t
            lean = .49*math.sin(t*4+i)
            bands.append((z,x+lean-width/2,x+lean+width/2,y-depth,y+depth))
        shelf(m,bands,seed=288+i*19,cap=COVER)
    for x,y,z,w,d,h in ((-5.91,-2.53,2.01,5.36,5.50,6.09),
                        (3.33,-3.36,4.17,7.08,5.45,10.17),
                        (6.77,-1.84,3.33,4.63,4.16,8.26),
                        (-1.58,5.37,2.42,6.42,4.73,6.91)):
        rock(m,(x,y,z),(w,d,h),7,13,rng,ROCK,"column",COVER)

    # Plankway follows the rock's flank into a separate cantilevered pavilion bay.
    waypoints = ((-8.34,-3.58,4.89),(-4.80,-4.23,5.66),(-.80,-4.83,6.95),(2.26,-4.80,8.49))
    for j,(a,b) in enumerate(zip(waypoints,waypoints[1:])):
        a,b = np.asarray(a),np.asarray(b)
        d = b-a
        n = round(d[0]/.32)
        for i in range(n):
            x,y,z = a+d*(i+.5)/n
            m.box((x,y,z),(.947*d[0]/n,1.81,.19),TRIM if i%5 else WEAVE)
        for i in range(5):
            x,y,z = a+d*(i+.45)/5
            m.box((x,y-.78,z+.39),(.18,.20,.91),WOOD)
            if i%2==0:
                beam(m,(x,y+1.42,z-1.31),(x,y-.69,z-.05),.23,.24,WOOD)
                m.beam((x,y+.58,z-.14),(x,y-.93,z-.14),.26,.22,WOOD)
                m.box((x,y+1.38,z-1.26),(.48,.45,.37),ROOF)
        for lift in (.31,.81):
            beam(m,a+(0,-.78,lift),b+(0,-.78,lift),.16,.17,TRIM)

    x,y,z = 3.71,-3.31,8.65
    m.box((x,y,z),(6.68,4.87,.43),WEAVE)
    for side in (-1,1):
        for shift in (-1,1):
            px,py = x+shift*2.52,y+side*1.88
            m.box((px,py,z-2.0),(.40,.40,3.71),WOOD)
            beam(m,(px,py,z-2.3),(px,py-side*1.27,z-.12),.27,.24,WOOD)
    rail(m,(x-3.15,y-2.18),(x+3.15,y-2.18),9,base=z+.21,height=.76,slot=TRIM)
    pavilion(m,x,y,z+.20,5.27,4.26,2.71,1.18,column=PANEL,tier=True)
    for u in (-1.61,0,1.61):
        hanging_lantern(m,x+u,y-1.88,z+1.95,radius=.23 if u else .30,drop=.55,paper=BLOOM)
    for x,y,z,h,w,wind in ((-5.08,1.04,12.12,3.81,3.42,-1),(2.16,2.18,13.98,3.39,3.19,1)):
        cliff_pine(m,rng,x,y,z,h,w,wind)
    for i in range(4):
        x,y = rng.uniform(-7.37,7.10),rng.uniform(-4.30,-2.34)
        rock(m,(x,y,.40+.068*i),(rng.uniform(1.26,2.48),1.7,rng.uniform(1.75,2.88)),
             4,9,rng,COVER,"basalt",COVER)


def canopy_boat(m,_rng):
    hull(m,11.5,3.22,stripe=TRIM,body=WOOD,rubrail=PANEL)
    m.box((-.19,0,.68),(6.64,2.47,.24),WEAVE)
    for side in (-1,1):
        y = side*1.06
        rail(m,(-3.07,y),(2.91,y),11,base=.78,height=.66,slot=PANEL)
        for i,x in enumerate((-3.05,-1.59,.02,1.50,2.92)):
            m.stack(x,y,[(.79,.11),(1.08,.134),(2.01,.103),(2.27,.136)],8,TRIM)
            m.box((x,y,2.18),(.32,.28,.24),PANEL)
            if i%2==0 and (side<0 or i!=2):
                hanging_lantern(m,x+.31,y+side*.19,1.86,radius=.18,drop=.33,paper=BLOOM)
        m.box((-.10,y,2.24),(6.63,.24,.22),WOOD)
        m.box((-.11,side*.63,.98),(4.67,.39,.21),WEAVE)
    tiled_roof(m,-.10,0,2.31,7.34,3.19,.41,hip=.25,curl=.47,columns=10,rows=4)
    boat_railings(m,((-4.96,-3.58),(3.39,4.96)),.91,height=.58,slot=TRIM)
    end_lamps(m,((-4.73,-.29,1.28),(4.78,-.30,1.36)),paper=BLOOM)


def main():
    specs = (
        Asset("zjj_natural_arch_mid","武陵源天生石桥拱门","横向石英砂岩层、贯通水拱与山松，临水面朝 +Z",
              (28,22,13),-1.09,(4500,7500),camera=(1.7,-10,2.14)),
        Asset("zjj_cliff_pavilion_mid","崖壁悬空栈道与土家飞檐亭","悬空栈道与重檐土家观景亭，临水面朝 +Z",
              (20,18,13),-1.12,(4800,7800),camera=(3.05,-10,2.45)),
        Asset("zjj_canyon_canopy_boat_mid","宝峰湖土家画舫游船","木棚、雕栏与红灯笼，船首朝 +X",
              (11.5,3.8,3.2),-1.01,(3000,5200),"boat",camera=(3.1,-10,2.76)),
    )
    generate("zhangjiajie","Wulingyuan · Zhangjiajie",specs,(arch,cliff_hall,canopy_boat),palette(),
             ("Natural sandstone arch","Cliff plankway and pavilion","Baofeng Lake canopy boat"))


if __name__=="__main__":
    main()
