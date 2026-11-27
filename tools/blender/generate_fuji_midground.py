"""Build the Kawaguchiko ryokan, torii cape and retro lake boat in background Blender."""

import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

import scene_pack_factory as factory
from scene_pack_factory import (
    Asset, Surface, BLOOM, COVER, DETAIL, EMIT, GLOW, LEAF, LEAF2,
    METAL, PANEL, ROCK, ROOF, SNOW, TRIM, WEAVE, WOOD, rock,
)
from generate_jiangnan_midground import (
    boat_railings, box, end_lamps, flowering_tree, generate, hull, opposing_facades,
    rail, stone_pier, tiled_roof,
)


def palette():
    return factory.basic_palette() | {
        WOOD: Surface((.34,.24,.17),.73,"wood"),
        TRIM: Surface((.66,.416,.237),.72,"wood"),
        PANEL: Surface((.81,.765,.65),.87,"plaster"),
        ROOF: Surface((.17,.248,.31),.70,"brick",(.071,.129,.191)),
        ROCK: Surface((.30,.33,.37),.84,"basalt"),
        COVER: Surface((.38,.45,.28),.91,"moss",(.27,.33,.21)),
        DETAIL: Surface((.44,.465,.43),.85,"brick",(.29,.347,.32)),
        BLOOM: Surface((.98,.63,.76),.66,"petal",(.94,.37,.54)),
        LEAF: Surface((.76,.45,.56),.71,"forest",(.88,.57,.69)),
        LEAF2: Surface((.94,.78,.83),.69,"forest",(.98,.70,.78)),
        METAL: Surface((.78,.224,.104),.74,"wood",(.58,.142,.095)),
        SNOW: Surface((.91,.87,.71),.72,"wood"),
        WEAVE: Surface((.50,.34,.19),.70,"wood"),
        GLOW: Surface((.98,.728,.339),.61,"paper"),
    }


def ryokan_wing(m,x,y,z,w,d,h,rise,*,second=False):
    top = z+h
    if second:
        levels = [(z+.65,z+2.37),(z+3.46,top-.37)]
        balcony_heights = (z+.25,z+3.18)
    else:
        levels = [(z+.56,top-.46)]
        balcony_heights = (z+.23,)
    offsets = np.linspace(-w*.34,w*.34,4)
    rows = [(a,b,tuple((u,w*.156, i!=j-2,2,1) for i,u in enumerate(offsets)))
            for j,(a,b) in enumerate(levels)]
    rear = [(a,b,((-w*.22,w*.20,True,1,1),(w*.22,w*.20,True,1,1))) for a,b in levels]
    opposing_facades(m,x,y,w,d,z,top,rows,PANEL,WOOD,rear=rear)
    for side in (-1,1):
        face = y+side*d/2
        for u in np.linspace(-w*.454,w*.454,5):
            m.box((x+u,face+side*.072,(z+top)/2),(.24,.28,h+.11),WOOD)
        for balcony in balcony_heights if side<0 else ():
            m.box((x,face+side*.73,balcony),(w*.957,1.49,.28),TRIM)
            rail(m,(x-w*.452,face+side*1.35),(x+w*.452,face+side*1.35),
                 8,base=balcony+.137,height=.75,slot=TRIM)
            for u in np.linspace(-w*.42,w*.42,5):
                m.beam((x+u,face-side*.10,balcony-.16),(x+u,face+side*1.26,balcony-.16),.17,.31,WOOD)
        m.box((x,face+side*.11,top-.26),(w+.12,.44,.37),WOOD)
    tiled_roof(m,x,y,top+.10,w+1.23,d+1.75,rise,hip=.27,curl=.35,gable=True,columns=9)
    if second:
        tiled_roof(m,x+.27,y,top+rise*.78,w*.41,d*.46,rise*.42,hip=.24,curl=.24,columns=7,rows=4)


def ryokan(m,rng):
    stone_pier(m,0,.4,-1.06,.54,23.2,9.2)
    m.box((-.05,.45,.64),(23.77,9.56,.31),DETAIL)
    for side in (-1,1):
        for course in range(3):
            for i,x in enumerate(np.linspace(-10.57,10.57,11)):
                m.box((x+.33*(course%2),.45+side*(4.56-.14*course),-.53+course*.39+.014*i),
                      (1.56,.65+rng.uniform(0,.17),.36), ROCK if (course+i)%4 else COVER,
                      angle=rng.uniform(-.036,.036))
    ryokan_wing(m,-5.46,1.06,.75,9.35,5.50,6.75,2.17,second=True)
    ryokan_wing(m,4.87,.12,.78,9.52,5.97,4.85,2.10)
    m.box((-.45,-1.30,.94),(2.25,1.7,.26),TRIM)
    for x,y,h,s,lean in ((-10.29,-2.64,5.38,3.80,-.64),(10.25,-1.64,6.55,4.93,.49)):
        flowering_tree(m,rng,x,y,.72,h,s,leaves=(LEAF2,BLOOM,LEAF),lean=lean)


def toro(m,x,y,z):
    m.stack(x,y,[(z-.08,.44),(z+.16,.49),(z+.34,.29),
                 (z+.94,.22),(z+1.11,.36),(z+1.22,.43)],8,DETAIL)
    box(m,x-.23,x+.23,y-.23,y+.23,z+1.19,z+1.64,GLOW,EMIT)
    for a in (-.31,.31):
        for b in (-.29,.29):
            m.box((x+a,y+b,z+1.42),(.19,.19,.56),DETAIL)
    m.stack(x,y,[(z+1.64,.59),(z+1.76,.64),(z+1.88,.39),
                 (z+2.12,.14),(z+2.24,.07)],8,ROCK)
    m.stack(x+.02,y,[(z+2.20,.10),(z+2.34,.16),(z+2.49,.036)],8,COVER)


def torii_cape(m,rng):
    # Low basalt cape opens into a ceremonial stair between the stone lamps.
    rock(m,(-3.17,.76,1.10),(9.47,9.97,4.26),6,13,rng,ROCK,"basalt",COVER)
    rock(m,(3.44,1.29,1.20),(8.13,9.54,4.16),6,12,rng,ROCK,"basalt",COVER)
    for i,(x,y,s) in enumerate(((-5.6,-2.52,3.9),(-3.53,-3.32,2.91),
                                 (4.93,-2.35,3.92),(5.93,1.10,3.18),(-1.2,4.36,3.53),
                                 (1.12,-3.18,2.89),(3.36,-2.97,3.02))):
        rock(m,(x,y,.56+.10*i),(s,s*.81,3.28),5,10,rng,ROCK,"basalt",COVER)
    for i in range(10):
        floor = .37+.226*i
        m.box((0,-4.83+.54*i,floor-.18),(2.56+.036*(9-i),.57,.47),DETAIL)
        for side in (-1,1):
            m.box((side*(1.42+.06*(9-i)),-4.84+.54*i,floor+.018),(.41,.51,.44),ROCK)
    m.box((.01,.43,2.7),(6.82,4.31,.41),DETAIL)
    for side in (-1,1):
        x = side*2.44
        m.stack(x,-.27,[(2.68,.53),(2.91,.55),(3.13,.40)],12,ROCK)
        m.tube([(x,-.27,3.02),(x*.99,-.27,4.18),(x*.94,-.27,6.50),(x*.89,-.27,8.19)],
               (.41,.39,.362,.33),14,METAL)
        m.stack(x,-.27,[(3.08,.431),(3.47,.421)],12,ROOF)
    m.box((0,-.269,6.57),(6.68,.47,.39),METAL)
    m.box((0,-.302,7.20),(.42,.53,1.07),METAL)
    m.box((0,-.65,7.29),(.57,.29,.84),WOOD)
    m.box((.007,-.823,7.29),(.43,.135,.66),TRIM)
    for j in range(3):
        m.box((.071-.066*j,-.91,7.28+j*.12),(.19-.024*j,.065,.038),METAL)
    path = [(x,-.27,8.04+.39*(abs(x)/4.52)**4) for x in np.linspace(-4.52,4.52,17)]
    factory.section(m,path,[.71]*17,[.43]*17,METAL)
    factory.section(m,[(x,y,z+.29) for x,y,z in path],[.86]*17,[.23]*17,ROOF)
    for x,y in ((-2.06,-3.04),(2.11,-2.79)):
        m.box((x,y,1.42),(.96,1.17,1.12),DETAIL)
        toro(m,x,y,2.03)
    flowering_tree(m,rng,-5.31,1.28,2.20,6.02,5.02,leaves=(BLOOM,LEAF,LEAF2),lean=-1.27)
    for i in range(12):
        x,y = rng.uniform(-6.3,6.3),rng.uniform(2.3,4.55)
        rock(m,(x,y,2.17+i*.017),(rng.uniform(.61,1.40),.86,.91+i*.011),3,8,rng,COVER,"basalt",COVER)


def pleasure_boat(m,_rng):
    hull(m,12.5,3.41,stripe=METAL,body=SNOW,rubrail=TRIM)
    bays = tuple((x,.83,True,1,1) for x in (-2.43,-1.24,-.05,1.14,2.32))
    opposing_facades(m,-.23,0,6.12,2.11,.61,2.12,[(.91,1.93,bays)],SNOW,METAL)
    for y in (-1.11,1.11):
        m.box((-.23,y,.78),(6.05,.33,.27),METAL)
        m.box((-.23,y,2.08),(6.41,.35,.21),TRIM)
    m.box((-.26,0,2.28),(6.66,2.68,.33),TRIM)
    for side in (-1,1):
        y = side*1.18
        rail(m,(-3.20,y),(2.90,y),9,base=2.45,height=.46,slot=SNOW)
        for x in (-2.70,-1.10,.88,2.30):
            m.stack(x,side*.95,[(2.42,.079),(2.53,.100),(3.18,.071),(3.33,.087)],8,METAL)
    tiled_roof(m,-.24,0,3.35,5.65,2.77,.34,hip=.11,curl=.13,columns=11,rows=4)
    boat_railings(m,((-5.03,-3.54),(3.13,5.07)),.99,height=.61,slot=SNOW)
    end_lamps(m,((-4.72,-.37,1.34),(4.88,-.36,1.48)))


def main():
    specs = (
        Asset("fuji_onsen_ryokan_mid","河口湖临水温泉旅馆","石垣、歇山瓦顶、亮障子和樱花，临水面朝 +Z",
              (26,11.5,11),-1.06,(5000,8200),camera=(3.2,-10,3.25)),
        Asset("fuji_torii_cape_mid","富士湖畔朱红鸟居岬角","火山岩、神道石阶与石灯笼，临水面朝 +Z",
              (16,9.5,11),-1.08,(3800,6500),camera=(2.8,-10,3.45)),
        Asset("fuji_pleasure_boat_mid","河口湖复古游览木船","双层湖船，船首朝 +X",
              (12.5,4.6,3.4),-1.03,(3200,5500),"boat",camera=(3,-10,2.82)),
    )
    generate("fuji","Kawaguchiko · Mount Fuji",specs,(ryokan,torii_cape,pleasure_boat),palette(),
             ("Lakeside ryokan","Torii cape","Kawaguchiko pleasure boat"))


if __name__=="__main__":
    main()
