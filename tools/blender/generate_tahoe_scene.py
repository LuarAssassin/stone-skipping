"""Produce the Tahoe pack, its manifest, and a Cycles contact sheet.

blender -b --factory-startup -P tools/blender/generate_tahoe_scene.py --
"""
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from scene_pack_factory import (
    Asset, Surface, WOOD, TRIM, BARK, WEAVE, METAL, ROCK, COVER, NEEDLE,
    beam, basic_palette, evergreen, generate, glass_lamp, rock,
    terrain, twig, watercraft,
)


def dock(m,rng):
    for x in (-2.62,.02,2.62):
        for y in (-.86,.86):
            m.stack(x,y,[(-1.2,.142),(-1.13,.16),(-.67,.157),(-.13,.148),
                        (.18,.15),(.54,.146),(.70,.138),(.80,.12)],16,BARK,shade=True)
            for z in (.62,.722):
                m.stack(x,y,[(z-.016,.147),(z+.016,.147)],12,METAL)
        beam(m,(x,-.996,.22),(x,.996,.22),.19,.244,WOOD)
    for i in range(2):
        x=-2.61+i*2.62
        for y in (-.86,.86):
            beam(m,(x,y,-.49),(x+2.62,y,.22),.105,.111,TRIM)
            beam(m,(x,y,.22),(x+2.62,y,-.43),.093,.100,WOOD)
    for y in (-1.05,-.62,0,.62,1.05):
        beam(m,(-3.19,y,.346),(3.19,y,.346),.092,.141,WOOD)
    for i in range(46):
        x = (i-22.5)*.139
        camber = rng.uniform(-.003,.005)
        beam(m,(x,-1.10,.493+camber),(x,1.10,.493+camber),.135,.111,
             WOOD if i%4 else TRIM,.17)
        for side in (-1,1):
            z=.549+camber
            m.stack(x,side*.856,[(z,.0115),(z+.005,.012)],8,METAL)
    for x in (-1.21,1.42):
        for y in (-.91,.91):
            m.stack(x,y,[(.55,.105),(.58,.096),(.62,.062),(.73,.055),(.74,.084),(.781,.077)],
                    14,METAL,shade=True)
    m.stack(2.73,-.86,[(.55,.119),(.63,.12),(.70,.074),(.91,.050),(1.47,.037),(1.82,.041)],16,METAL,shade=True)
    twig(m,[(2.73,-.86,1.75),(2.79,-.86,1.95),(2.91,-.86,2.03),(3.05,-.86,1.97)],
         [.043,.039,.036,.032],10,METAL)
    glass_lamp(m,3.03,-.86,1.886,.120,.267)
    m.stack(3.03,-.86,[(2.04,.027),(2.105,.059),(2.16,.041),(2.20,.013)],10,METAL,shade=True)


def canoe(m,rng):
    watercraft(m,4.6,.80,-.28,.64,"cedar")


def tall_pine(m,rng):
    evergreen(m,rng,10.9,4.80,.24,rows=11)


def mid_pine(m,rng):
    evergreen(m,rng,7.30,4.60,.87,rows=9)


def boulder(m,rng):
    rock(m,(0,0,.4),(3.4,2.8,2.1),20,46,rng)


def boulder_cluster(m,rng):
    for center,span in (((-.42,.35,.05),(1.69,1.12,1.04)),((.61,-.24,-.018),(1.40,1.29,.78)),
                        ((-.61,-.76,-.12),(.82,.62,.62)),((.70,.74,-.030),(.59,.66,.63))):
        rock(m,center,span,9,26,rng)


def snow_ridge(m,rng):
    terrain(m,rng,70,24,((-.60,.73,.37),(-.16,1.0,.54),(.23,.86,.41),(.64,.59,.33)),"alpine")


SPECS = (
    Asset("wooden_dock","雪松木栈桥","近岸码头，桥面约 +0.55 m，沿 +X 伸入水面",(6.4,3.4,2.2),-1.2,(6000,11000),x_start=True),
    Asset("cedar_canoe","红雪松独木舟","湖面独木舟，船头朝 +X，编织藤座与木桨",(4.6,.85,.92),-.28,(4000,7000),"boat"),
    Asset("alpine_pine_tall","高耸冷杉","近远岸高层针叶树，根颈接地",(4.8,11.2,4.8),-.27,(6000,9000),"tree","groundContact"),
    Asset("alpine_pine_mid","疏枝海岸松","近岸疏枝松，镜头侧缘形成遮挡层次",(4.6,7.6,4.2),-.29,(5000,8000),"tree","groundContact"),
    Asset("granite_boulder_large","冰川花岗岩巨石","水线半浸主礁石，上干下湿",(3.4,2.1,2.8),-.65,(1500,3000),"small"),
    Asset("granite_boulder_cluster","浅滩花岗岩礁簇","四块高低错落的浅礁，可与滩边垫层混搭",(2.6,1.1,2.2),-.45,(1500,3000),"small"),
    Asset("snow_peak_ridge","冰川花岗岩雪脊","远岸高山主背景，锯齿脊线与积雪冲沟",(44,26,18),-.5,(3000,5000),origin="groundContact",camera=(4,-14,4)),
)
BUILDS = (dock,canoe,tall_pine,mid_pine,boulder,boulder_cluster,snow_ridge)
PALETTE = basic_palette()
PALETTE.update({
    WOOD: Surface((.532,.365,.264),.62,"wood"),
    TRIM: Surface((.603,.477,.347),.65,"wood"),
    WEAVE: Surface((.667,.544,.389),.74,"weave"),
    BARK: Surface((.294,.244,.194),.87,"bark"),
    METAL: Surface((.272,.259,.197),.57,"seams"),
    ROCK: Surface((.528,.538,.524),.80,"granite"),
    COVER: Surface((.364,.382,.397),.79,"alpine",(.819,.848,.869)),
    NEEDLE: Surface((.156,.260,.211),.72,"needle",(.338,.445,.301)),
})


if __name__ == "__main__":
    generate("tahoe","北美太浩松涛","Alpine Glacier Lake",
             ("#eae8dc","#27362f","#58675f","#796050","#d8dfd7"),
             SPECS,BUILDS,PALETTE,20261127)
