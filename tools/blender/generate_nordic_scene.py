"""Build the Lofoten fjord models, material atlases, and Cycles contact sheet.

blender -b --factory-startup -P tools/blender/generate_nordic_scene.py --
"""
import math
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import numpy as np
from scene_pack_factory import (
    Asset, Surface, WOOD, TRIM, BARK, WEAVE, METAL, GLOW, ROCK, COVER, ROOF, SNOW, NEEDLE,
    PANEL, DETAIL, LEAF2, EMIT, basic_palette, beam, cuboid, evergreen, generate, glass_lamp,
    rock, section, terrain, twig, watercraft,
)


def cabin_window(m,x,y,z,w,h,face=0):
    """White outer frame, recessed warm glass and individually profiled sash bars."""
    def p(a,b,depth):
        return (x+a,y+depth,z+b) if face==0 else (x+depth,y+a,z+b)
    inside = .053*((1 if y>0 else -1) if face==0 else face)
    glass = p(0,0,inside)
    dim = (w-.096,.034,h-.11) if face==0 else (.034,w-.096,h-.11)
    cuboid(m,glass,dim,GLOW,EMIT)
    for a in (-w*.515,0,w*.515):
        beam(m,p(a,-h*.56,inside*.4),p(a,h*.56,inside*.4),.076,.076,TRIM)
    for b in (-h*.52,.08*h,h*.52):
        beam(m,p(-w*.56,b,inside*.63),p(w*.56,b,inside*.63),.080,.069,TRIM)
    beam(m,p(-w*.63,-h*.60,inside*1.5),p(w*.63,-h*.60,inside*1.5),.142,.066,TRIM)


def rorbu(m,rng):
    for x in (-2.48,0,2.48):
        for y in (-1.93,1.81):
            m.stack(x,y,[(-1.2,.104),(-1.14,.129),(-.68,.126),(.191,.123),(.52,.112)],
                    14,BARK,shade=True)
            beam(m,(x,y,-.20),(x,0,.36),.11,.148,WOOD)
    for y in (-2.09,-1.10,0,1.09,2.09):
        beam(m,(-2.89,y,.493),(2.89,y,.493),.144,.188,WOOD)
    for i in range(40):
        x=(i-19.5)*.144
        beam(m,(x,-2.25,.626),(x,2.25,.626),.141,.047,PANEL if i%4 else BARK)
    for x in (-2.65,-1.74,-.86,.23,1.45,2.67):
        for y in (-2.136,2.136):
            beam(m,(x,y,.63),(x,y,1.381),.081,.081,TRIM)
    for y in (-2.136,2.136):
        for z in (.89,1.371):
            beam(m,(-2.70,y,z),(2.70,y,z),.091,.077,TRIM)
    for x in (-1.90,1.90):
        for y in (-1.48,1.48):
            beam(m,(x,y,.65),(x,y,3.398),.149,.149,TRIM)
    # Clapboards read as real timber at grazing light. The gable is a second stack.
    for i in range(26):
        z=.695+i*.104
        for y in (-1.50,1.50):
            beam(m,(-1.958,y,z),(1.958,y,z),.094,.116,WOOD)
        for x in (-1.957,1.957):
            beam(m,(x,-1.49,z),(x,1.49,z),.102,.116,WOOD)
    for i in range(14):
        z=3.38+i*.103
        w=1.52*(1-i/14)
        for x in (-1.96,1.96):
            beam(m,(x,-w,z),(x,w,z),.089,.110,WOOD)
    for x in (-1.23,1.02):
        cabin_window(m,x,-1.54,2.36,.655,.787)
    for x in (-.98,1.01):
        cabin_window(m,x,1.54,2.23,.62,.72)
    for side in (-1,1):
        cabin_window(m,side*2.015,-.39,2.41,.56,.80,side)
    m.box((-.06,-1.57,1.467),(.501,.12,1.64),ROOF)
    for x in (-.333,.231):
        beam(m,(x,-1.67,.65),(x,-1.67,2.33),.102,.089,TRIM)
    beam(m,(-.36,-1.67,2.30),(.255,-1.67,2.30),.116,.101,TRIM)
    m.stack(.138,-1.674,[(1.52,.031),(1.57,.026)],10,METAL)
    twig(m,[(.356,-1.58,2.78),(.356,-1.76,2.77),(.356,-1.80,2.70)],
         [.016,.014,.010],7,METAL)
    glass_lamp(m,.356,-1.80,2.56,.075,.143)
    for side in (-1,1):
        def roof(u,v,layer):
            thick = .12+.068*math.sin(25*u+3*v)*math.sin(math.pi*v)**2 if layer else 0
            y=side*(1.94*v+.025*math.sin(38*u)*v**5*layer)
            z=4.971-1.566*v+.041*math.sin(6*u)*v+thick-.040*layer*v**7
            return np.array((-2.32+4.64*u,y,z))
        m.grid(lambda u,v:roof(u,v,0),28,8,ROOF,flip=side<0)
        m.grid(lambda u,v:roof(u,v,1),30,9,SNOW,flip=side<0)
        m.grid(lambda u,v:roof(u,1,v),30,1,SNOW,flip=side>0)
        for x in (0.,1.):
            section(m,[roof(x,v,0)+(0,0,-.068) for v in np.linspace(0,1,13)],
                    [.089]*13,[.128]*13,TRIM)
        for i in range(17):
            u=(i+.6)/18
            if rng.random() > .66:
                continue
            p=roof(u,1,.8)
            twig(m,[p,p+(0,.008*side,-.09-rng.uniform(0,.075))],[.013,.0025],5,SNOW)
    # A low chimney sits through the snow on the rear slope.
    m.box((1.42,.29,4.79),(.338,.285,.51),DETAIL)
    beam(m,(1.22,.29,5.168),(1.62,.29,5.168),.376,.063,ROOF)


def fishing_skiff(m,rng):
    watercraft(m,4.3,1.30,-.42,.63,"clinker")


def big_floe(m,rng):
    rock(m,(0,0,-.075),(3.1,2.5,.55),12,48,rng,ROCK,"ice",SNOW)


def small_floes(m,rng):
    for center,span in (((-.48,-.30,-.04),(.82,.68,.31)),((.29,.12,-.06),(.75,.59,.265)),
                        ((.49,-.52,-.025),(.57,.38,.227)),((-.46,.54,-.051),(.40,.43,.27)),
                        ((.53,.54,-.044),(.27,.31,.201))):
        rock(m,center,span,5,20,rng,ROCK,"ice",SNOW)


def spruce(m,rng):
    evergreen(m,rng,8.32,3.8,.30,snow=True,rows=10)


def seastack(m,rng):
    rock(m,(.17,.11,3.00),(3.08,2.71,7.60),17,41,rng,LEAF2,"column",SNOW)
    rock(m,(-1.34,.29,1.32),(1.36,1.84,4.13),9,24,rng,WEAVE,"column")
    rock(m,(.83,-1.16,.40),(1.47,1.21,2.29),9,24,rng,WEAVE,"column")


def cliff(m,rng):
    terrain(m,rng,71,27,((-.59,.78,.57),(-.23,1.05,.67),(.23,.91,.73),(.63,.72,.45)),"fjord")


SPECS=(
    Asset("rorbu_cabin","覆雪法鲁红渔屋","近景水上渔屋与栈台，窗光和门灯独立发光",(5.8,6.4,4.6),-1.2,(7000,12000),camera=(4,-9,3.3)),
    Asset("nordic_fishing_skiff","搭接木渔船","峡湾近景船，搭接木板沿 +X 船体展开",(4.3,1.05,1.32),-.42,(4000,7000),"boat"),
    Asset("ice_floe_large","覆雪大浮冰","低矮主浮冰，断边露出水线冰蓝带",(3.1,.55,2.5),-.35,(800,1800),"small",camera=(3,-8,5)),
    Asset("ice_floe_small","碎浮冰簇","五片漂浮碎冰，散布在边岸冰缘",(1.7,.36,1.5),-.22,(600,1400),"small",camera=(3,-8,6)),
    Asset("snow_spruce","挂雪峡湾云杉","堆雪针叶树，树冠背光与岸边轮廓",(3.8,8.6,3.8),-.28,(5000,8000),"tree","groundContact"),
    Asset("fjord_seastack","玄武岩海蚀柱","半浸黑岩海柱，顶端积雪保留陡壁轮廓",(4.4,7.6,3.8),-.8,(1800,3500),"small"),
    Asset("fjord_cliff_wall","峡湾雪山绝壁","远岸冰川切削岩壁，为极光天幕留出天际线",(48,28,18),-.6,(3000,5000),origin="groundContact",camera=(1,-15,3)),
)
BUILDS=(rorbu,fishing_skiff,big_floe,small_floes,spruce,seastack,cliff)
PALETTE=basic_palette()
PALETTE.update({
    WOOD: Surface((.462,.196,.155),.72,"wood"),
    TRIM: Surface((.702,.707,.660),.73,"wood"),
    BARK: Surface((.310,.267,.228),.82,"bark"),
    PANEL: Surface((.257,.323,.365),.65,"seams"),
    METAL: Surface((.232,.231,.223),.56,"seams"),
    GLOW: Surface((.930,.595,.264),.58,"paper"),
    ROCK: Surface((.546,.684,.741),.47,"ice"),
    ROOF: Surface((.238,.239,.212),.76,"seams"),
    COVER: Surface((.254,.278,.291),.80,"fjord",(.808,.845,.861)),
    DETAIL: Surface((.372,.368,.335),.83,"stone"),
    NEEDLE: Surface((.147,.239,.210),.77,"spruce",(.796,.823,.832)),
    LEAF2: Surface((.217,.240,.259),.76,"snowrock",(.817,.852,.869)),
    WEAVE: Surface((.217,.240,.259),.76,"basalt"),
})


if __name__=="__main__":
    generate("nordic","北欧极光峡湾","Lofoten Aurora Fjord",
             ("#e5e7df","#28353c","#50616d","#834942","#d3dee2"),
             SPECS,BUILDS,PALETTE,20261129)
