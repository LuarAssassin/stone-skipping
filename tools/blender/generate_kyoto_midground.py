"""Build the Arashiyama bridge, machiya row and maple shrine in background Blender."""

import math
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

import scene_pack_factory as factory
from scene_pack_factory import (
    Asset, Surface, BLOOM, COVER, DETAIL, GLOW, LEAF, LEAF2, METAL, PANEL,
    ROCK, ROOF, TRIM, WEAVE, WOOD, beam, rock, section,
)
from generate_jiangnan_midground import (
    flowering_tree, generate, hanging_lantern, opposing_facades, pavilion, rail,
    stone_pier, tiled_roof,
)


def palette():
    return factory.basic_palette() | {
        WOOD: Surface((.28,.189,.142),.75,"wood",(.17,.113,.091)),
        TRIM: Surface((.62,.393,.22),.71,"wood"),
        WEAVE: Surface((.55,.298,.166),.78,"wood"),
        PANEL: Surface((.83,.76,.64),.83,"plaster"),
        METAL: Surface((.39,.37,.23),.47,"bronze"),
        ROOF: Surface((.19,.206,.237),.73,"brick",(.094,.107,.123)),
        ROCK: Surface((.38,.42,.43),.84,"basalt"),
        DETAIL: Surface((.58,.54,.466),.86,"brick",(.38,.36,.32)),
        COVER: Surface((.36,.42,.27),.87,"moss",(.26,.32,.19)),
        BLOOM: Surface((.83,.328,.135),.78,"forest",(.70,.22,.087)),
        LEAF: Surface((.76,.262,.153),.79,"forest",(.61,.154,.086)),
        LEAF2: Surface((.92,.652,.224),.76,"forest",(.90,.56,.14)),
        GLOW: Surface((.95,.67,.284),.59,"paper"),
    }


def bridge_deck(x):
    return 2.16+1.30*max(0,1-(x/14.4)**2)**1.55


def bridge(m,rng):
    for x in (-14.2,-5.05,5.30,14.2):
        end = abs(x)>12
        stone_pier(m,x,.04,-1.10,bridge_deck(x)-.62,3.23 if end else 1.55,6.75 if end else 4.92)
        if end:
            for i in range(5):
                m.box((x+math.copysign(.20*i,x),0,.39+.30*i),
                      (2.96-.21*i,6.20-.17*i,.35),DETAIL)
        for y in (-2.23,2.23):
            m.box((x,y,bridge_deck(x)-.45),(1.05,.73,.74),WOOD)
            for shift in (-1,1):
                beam(m,(x+shift*.25,y,bridge_deck(x)-1.06),
                     (x+shift*1.43,y,bridge_deck(x)-.21),.25,.27,WOOD)

    xs = np.linspace(-14.25,14.25,66)
    for i,(a,b) in enumerate(zip(xs,xs[1:])):
        x = (a+b)/2
        z = bridge_deck(x)+.015*math.sin(i*2.27)
        m.box((x,0,z),(.414,4.62,.225),TRIM if i%5 else WEAVE)
    segments = np.linspace(-14.23,14.23,11)
    for side in (-1,1):
        y = side*2.17
        for lift,w,h in ((-.24,.21,.39),(.54,.16,.16),(1.07,.20,.24)):
            spine = [(x,y,bridge_deck(x)+lift) for x in segments]
            section(m,spine,[w]*len(spine),[h]*len(spine),WOOD if lift<0 else TRIM,bevel=.11)
        for i,x in enumerate(np.linspace(-14.18,14.18,28)):
            z = bridge_deck(x)
            m.box((x,y,z+.56),(.24 if i%3 else .32,.29,1.12),TRIM)
            if i%3==0:
                m.stack(x,y,[(z+1.14,.111),(z+1.23,.174),(z+1.30,.127),(z+1.39,.038)],7,METAL)
        for x in (-8.6,.3,8.9):
            z = bridge_deck(x)
            m.box((x,y,z+1.24),(.25,.27,2.57),WOOD)
            m.beam((x,y,z+2.49),(x+.44,y-side*.41,z+2.49),.17,.17,TRIM)
            hanging_lantern(m,x+.43,y-side*.41,z+1.88,radius=.25,drop=.30)

    for x in (-14.49,14.49):
        for y in (-2.94,2.94):
            for j in range(2):
                rock(m,(x-math.copysign(j*.78,x),y+.15*j,-.25),
                     (1.54,1.27,1.24+j*.20),3,8,rng,ROCK,"basalt",COVER)


def machiya(m, x, y, z, w, d, h, *, upper, tilt):
    top = z+h
    bays = tuple((u,w*.179,i!=0 or tilt>0,2,1) for i,u in enumerate(np.linspace(-w*.325,w*.325,3)))
    levels = [(z+.54,z+2.34,bays)]
    if upper:
        small = tuple((u,w*.17,True,2,1) for u in np.linspace(-w*.27,w*.27,2))
        levels.append((z+3.42,top-.46,small))
    rear = [(z+.58,z+2.30,((0,w*.33,True,1,1),))]
    opposing_facades(m,x,y,w,d,z,top,levels,PANEL,WOOD,rear=rear)
    for side in (-1,1):
        face = y+side*d/2
        for u in np.linspace(-w*.478,w*.478,5):
            m.box((x+u,face+side*.105,(top+z)/2),(.24,.31,h+.09),WOOD)
        for height in (.34,) if side<0 else ():
            m.box((x,face+side*.72,z+height),(w*.98,1.56,.33),WOOD)
            half = w*.46
            rail(m,(x-half,face+side*1.36),(x+half,face+side*1.36),
                 4,base=z+height+.18,height=.63,slot=TRIM)
        m.box((x+.03,face+side*.11,top-.20),(w+.10,.38,.36),WOOD)
        for z2 in (z+.17,z+2.61):
            m.box((x,face+side*.14,z2),(w*.964,.43,.22),WEAVE)
    roof_angle = .18+tilt*.04
    tiled_roof(m,x,y,top+.08,w+1.18,d+1.43,1.58+tilt*.18,hip=roof_angle,curl=.31,gable=True,columns=6,rows=3)
    # Long rain canopy breaks up the tall charred-cedar wall at the first story.
    if upper:
        a,b = x-w*.54,x+w*.54
        m.beam((a,y-d*.51,z+2.93),(b,y-d*.51,z+2.93),1.69,.22,ROOF)
        m.beam((a+.05,y-d*.53,z+2.81),(b-.05,y-d*.53,z+2.81),1.72,.14,TRIM)
    for u in (-w*.37,w*.37):
        hanging_lantern(m,x+u,y-d*.54,z+2.01,radius=.155,drop=.34)


def teahouses(m,rng):
    stone_pier(m,0,.27,-1.05,.55,22.1,8.25)
    m.box((.12,.25,.65),(22.88,8.70,.26),DETAIL)
    for i,x in enumerate(np.linspace(-10.60,10.60,15)):
        for j in range(2):
            m.box((x+.21*j,-3.98+.155*j,-.58+.52*j+.012*i),
                  (1.27,.77,.51),ROCK if (i+j)%4 else COVER,angle=.019*math.sin(i))
    machiya(m,-7.20,.65,.78,6.25,4.68,4.73,upper=True,tilt=1)
    machiya(m,-.23,.41,.81,6.82,5.13,6.23,upper=True,tilt=0)
    machiya(m,6.82,.98,.85,5.85,4.57,3.06,upper=False,tilt=-1)
    for x,y,h,w,leaves,lean in ((-9.17,-2.25,5.87,4.04,(LEAF,BLOOM),-.51),
                                  (9.32,-1.91,6.91,4.51,(LEAF2,BLOOM),.73)):
        flowering_tree(m,rng,x,y,.73,h,w,leaves=leaves,lean=lean)


def shrine(m,rng):
    for i,(x,y,z,w,d,h) in enumerate(((-3.58,.02,1.29,10.6,10.0,4.6),
                                     (2.42,1.18,2.46,11.4,10.5,6.98),
                                     (.45,-2.49,.88,7.18,6.5,3.72),
                                     (-5.43,-1.13,.22,5.92,6.19,2.47),
                                     (4.79,-1.68,.89,6.81,5.51,3.82))):
        rock(m,(x,y,z),(w,d,h),7,13,rng,ROCK if i%2 else DETAIL,"basalt",COVER)
    for i in range(4):
        x,y = rng.uniform(-6.87,6.25),rng.uniform(-4.86,4.16)
        rock(m,(x,y,.26+i*.078),(rng.uniform(1.19,2.81),rng.uniform(1.36,2.44),rng.uniform(1.36,2.23)),
             4,9,rng,ROCK,"basalt",COVER)

    x,y,z = .94,-.20,5.05
    m.box((x,y,z),(8.02,5.75,.42),WOOD)
    for i,px in enumerate(np.linspace(x-3.43,x+3.43,5)):
        for side in (-1,1):
            py = y+side*(2.39+.041*i)
            m.box((px,py,z-1.56),(.38,.42,3.04),WOOD)
            beam(m,(px,py,z-2.27),(px,py-side*1.31,z-.14),.23,.24,TRIM)
            beam(m,(px+.41,py,z-2.35),(px-.32,py,z-.18),.20,.24,WOOD)
    for side in (-1,1):
        py = y+side*2.62
        rail(m,(x-3.74,py),(x+3.74,py),12,base=z+.217,height=.78,slot=WEAVE)
    pavilion(m,x,y,z+.18,5.87,4.62,2.86,1.56,column=WEAVE,lantern_y=y-1.69)
    for side in (-1,1):
        hanging_lantern(m,x+side*1.79,y-1.63,z+2.13,radius=.207,drop=.41)
    for i in range(8):
        floor = 1.16+.474*i
        m.box((x+4.92,-4.75+.48*i,floor-.16),(1.29,.56,.39),DETAIL)
    for px,py,base,h,w,leaves,lean in (
        (-5.19,-.90,2.01,6.52,5.17,(LEAF,BLOOM),-.79),
        (4.93,.89,4.42,7.41,5.56,(LEAF2,BLOOM),.67),
        (-3.92,3.13,3.27,8.03,5.61,(LEAF,LEAF2),1.18),
    ):
        flowering_tree(m,rng,px,py,base,h,w,leaves=leaves,lean=lean)


def main():
    specs = (
        Asset("kyoto_togetsukyo_mid","岚山渡月桥","三孔桂川木栏石桥，船行水道贯通",
              (32,6.8,7.5),-1.10,(4800,7800),camera=(3.8,-10,2.15)),
        Asset("kyoto_teahouse_row_mid","岚山临水町家茶屋群","烧杉格栅、暖障子、红叶与临水缘侧",
              (24,10.5,10),-1.05,(4800,8000),camera=(3.4,-10,3.06)),
        Asset("kyoto_maple_shrine_isle_mid","红叶湖心观音亭岬角","红枫与金枫间的悬造佛堂，临水面朝 +Z",
              (18,12.5,13),-1.08,(4200,7000),camera=(2.54,-10,3.41)),
    )
    generate("kyoto","Arashiyama · Kyoto",specs,(bridge,teahouses,shrine),palette(),
             ("Togetsukyo bridge","Riverside teahouses","Maple shrine isle"))


if __name__=="__main__":
    main()
