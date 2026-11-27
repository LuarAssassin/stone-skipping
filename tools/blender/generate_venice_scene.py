"""Venetian brick-and-stone landmarks, gondola and working canal furniture."""
from pathlib import Path
import math
import sys
sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))

import numpy as np
from scene_pack_factory import (
    Asset, Surface, TAU, BARK, COVER, DETAIL, GLOW, METAL, PANEL, ROCK, ROOF, TRIM, WEAVE, WOOD,
    basic_palette, beam, cylinder, generate, glass_lamp, polar, section, twig, watercraft,
)
from scene_pack_landmarks import lit_arch


def villa_roof(m,x,y,z,w,d,rise):
    for side in (-1,1):
        m.grid(lambda u,v:(x+w*(u-.5),y+side*d*v/2,z+rise*(1-v)),8,4,ROOF,flip=side<0)
        beam(m,(x-w*.51,y+side*d*.505,z),(x+w*.51,y+side*d*.505,z),.085,.044,TRIM)
    cylinder(m,(x-w/2,y,z+rise),(x+w/2,y,z+rise),.062,8,ROOF)


def island(m,rng):
    m.box((0,0,-.29),(50,17.8,.62),ROCK)
    for i in range(16):
        x=-23.3+3.12*i
        beam(m,(x-1.56,-8.89,.048),(x+1.56,-8.89,.048),.27,.32,COVER)
    # Waterfront's low brick roofline frames a Palladian facade and pale dome.
    for i,x in enumerate((-21.8,-17.4,-13.5,6.1,10.8,15.4,19.5,22.2)):
        y=2.26+1.2*math.sin(i*1.43)
        w=4.11 if i<6 else 3.27
        base_h=rng.uniform(3.05,4.62)
        m.box((x,y,base_h/2),(w,5.8,base_h),COVER if i%3==1 else WOOD)
        villa_roof(m,x,y,base_h,w+.22,6.0,.80)
        for k in range(3):
            m.box((x+(k-1)*w*.25,y-2.926,base_h*.57),(.36,.12,base_h*.30),DETAIL)
    m.box((-.23,-.41,3.63),(12.5,12.5,7.22),ROCK)
    m.box((.02,-5.22,3.72),(9.87,3.15,7.38),TRIM)
    for x in (-4.61,-3.32,3.32,4.61):
        m.stack(x,-6.90,[(.14,.28),(.27,.31),(.45,.242),(6.31,.23),(6.47,.29),(6.66,.322)],
                13,ROCK,shade=True)
    for side in (-1,1):
        beam(m,(0,-6.8,8.08),(side*5.45,-6.8,6.69),.41,.27,ROCK)
    beam(m,(-5.57,-6.85,6.707),(5.57,-6.85,6.707),.47,.21,ROCK)
    for x in (-2.17,0,2.17):
        lit_arch(m,(x,-6.81,.10),1.08,3.15 if x else 4.37,.67,frame=ROCK,mullions=False)
    m.stack(.41,-.30,[(6.99,3.69),(7.37,3.54),(8.91,3.14),(9.43,3.24)],28,ROCK)
    for i in range(14):
        a=TAU*i/14
        x,y,_=polar(3.14,a,0)
        cylinder(m,(x+.41,y-.30,7.53),(x+.41,y-.30,9.24),.109,6,TRIM)
    dome=[(9.38+4.66*math.sin(t*1.55),3.13*math.cos(t*1.55)+.055) for t in np.linspace(0,1,17)]
    m.stack(.41,-.30,dome,38,DETAIL,shade=True)
    m.stack(.41,-.30,[(13.98,.367),(14.37,.315),(14.90,.243),(15.22,.166),(15.49,.082)],12,ROCK)
    # San Giorgio's tall square brick campanile, open stone belfry and sharply pointed spire.
    x,y=-7.43,2.54
    for z,h,w,slot in ((.64,1.24,3.30,ROCK),(10.21,18.21,2.84,WOOD),(19.37,.49,3.21,ROCK),
                       (19.84,.36,3.36,COVER),(22.84,.44,3.42,ROCK),(23.24,.35,3.08,ROCK)):
        m.box((x,y,z),(w,w,h),slot)
    for dx in (-1.19,1.19):
        for dy in (-1.19,1.19):
            beam(m,(x+dx,y+dy,19.88),(x+dx,y+dy,22.67),.42,.43,ROCK)
    m.box((x,y,21.3),(1.28,1.28,2.51),DETAIL)
    for dx in (-.61,.61):
        lit_arch(m,(x+dx,y-1.36,20.13),.67,2.23,.66,frame=ROCK,mullions=False)
    for z in (6.2,9.1,12.06,15.17):
        m.box((x,y-1.43,z),(.35,.08,.71),DETAIL)
    m.stack(x,y,[(23.33,2.07),(23.56,1.97),(24.07,1.78),(27.61,.39),(28.39,.022)],
            4,BARK,phase=math.pi/4)


def palazzo(m,rng):
    for i in range(12):
        z=-1.20+(i+.5)*.244
        for j in range(7):
            x=-2.82+(j+.5)*.802
            beam(m,(x-.40,-2.341,z),(x+.40,-2.341,z),.20,.242,ROCK if i>4 else COVER,.12)
        for j in range(6):
            y=-2.28+(j+.5)*.760
            beam(m,(2.760,y-.38,z),(2.760,y+.38,z),.176,.240,ROCK if i>4 else COVER)
    m.box((0,0,3.87),(5.51,4.59,6.14),WOOD)
    for z in (1.60,3.82,6.27,6.70):
        beam(m,(-2.83,-2.33,z),(2.87,-2.33,z),.187,.133,ROCK)
        beam(m,(2.76,-2.39,z),(2.76,2.38,z),.193,.128,ROCK)
    for z in (2.1,4.29):
        for x in (-1.91,-.62,.66,1.94):
            lit_arch(m,(x,-2.324,z),.87,1.37,.72,"trefoil",frame=ROCK)
        for y in (-1.45,0,1.45):
            lit_arch(m,(2.782,y,z+.06),.76,1.32,.70,"trefoil",front=1,axis="y",frame=ROCK)
    lit_arch(m,(0,-2.478,-.08),1.115,1.56,.70,"round",frame=ROCK,mullions=False)
    for x in (-.96,.96):
        glass_lamp(m,x,-2.47,1.36,.091,.185)
    for z in (2.052,4.238):
        for x in (-1.23,1.26):
            beam(m,(x-1.002,-2.466,z),(x+1.002,-2.466,z),.394,.119,ROCK)
            for h in (.20,.52):
                beam(m,(x-.934,-2.665,z+h),(x+.934,-2.665,z+h),.045,.037,METAL)
            for j in range(8):
                pos=x-.904+j*.252
                twig(m,[(pos,-2.665,z+.083),(pos+.022,-2.691,z+.281),(pos,-2.665,z+.52)],
                     [.019,.016,.018],5,METAL)
    villa_roof(m,0,-.016,6.83,5.87,5.1,.169)


def gondola(m,rng):
    watercraft(m,5.4,1.14,-.32,.81,"gondola",lamp=False)
    # Fore iron rises into the inward hook and six horizontal comb teeth.
    outline=((2.29,.262),(2.44,.268),(2.63,.592),(2.665,.739),(2.631,.812),(2.517,.829),
             (2.449,.774),(2.498,.704),(2.469,.591),(2.407,.491))
    l,r=[],[]
    for x,z in outline:
        l.append(m.vertex((x,-.018,z)))
        r.append(m.vertex((x,.018,z)))
    uv=[((x-2.28)/.40,(z-.25)/.60) for x,z in outline]
    m.face(l,uv,METAL,shade=False);m.face(r[::-1],uv[::-1],METAL,shade=False)
    for i in range(len(outline)):
        j=(i+1)%len(outline)
        m.face((l[j],l[i],r[i],r[j]),((0,0),(1,0),(1,1),(0,1)),METAL,shade=False)
    for i in range(6):
        x=2.43+.022*i; z=.472+.049*i
        beam(m,(x,0,z),(x+.111,0,z+.017),.043,.024,METAL)
    for y in (-.24,.24):
        m.stack(-.23,y,[(.158,.048),(.191,.053),(.38,.051),(.474,.041)],9,METAL,shade=True)
    beam(m,(-.37,-.31,.323),(-.37,.31,.323),.287,.133,WEAVE)
    beam(m,(-.539,-.31,.461),(-.539,.31,.461),.087,.252,WEAVE)
    for y in (-.302,.302):
        twig(m,[(-.55,y,.51),(-.30,y,.40),(-.008,y,.33)],[.020,.018,.014],8,METAL)
    glass_lamp(m,1.91,-.24,.549,.061,.137)
    for j in range(10):
        x=-1.06+j*.19
        m.box((x,-.357,.143),(.134,.059,.069),ROCK)


def pali(m,rng):
    sites=((-0.39,-.20,2.6),(0.05,.339,2.25),(.42,-.28,2.43))
    for i,(x,y,top) in enumerate(sites):
        samples=np.linspace(0,1,14)
        profile=[(-1.2+(top+1.2)*t,.127+.017*math.sin(11*t)+.005*math.sin(3*i+7*t)) for t in samples]
        slot=PANEL if i==1 else ROOF
        m.stack(x,y,profile,16,slot,shade=True)
        m.stack(x,y,[(top-.091,.133),(top-.045,.145),(top-.005,.126),(top+.014,.096)],14,WOOD)
        path=[(x+.158*math.cos(t),y+.158*math.sin(t),1.77+.019*t) for t in np.linspace(i,TAU*2+i,31)]
        twig(m,path,[.028]*len(path),5,WEAVE)
    def loop(t):
        return (-.395+.82*t,-.27+.16*math.sin(math.pi*t),1.895-.48*math.sin(math.pi*t))
    twig(m,[loop(t) for t in np.linspace(0,1,30)],[.024]*30,6,WEAVE)


def arch_bridge(m,rng):
    def arch(t):
        return (-1.91*math.cos(math.pi*t),.128+1.88*math.sin(math.pi*t))
    def deck(x):
        return .74+1.84*max(0,1-abs(x)/3.61)**.87
    for side in (-1,1):
        for i in range(24):
            lo,hi=(i+.035)/24,(i+.965)/24
            def panel(u,v):
                x,z=arch(lo+(hi-lo)*u)
                return (x,side*1.354,z+(deck(x)-z)*v)
            m.grid(panel,3,3,ROCK,flip=side>0)
            path=[(arch(t)[0],side*1.382,arch(t)[1]+.109) for t in np.linspace(lo,hi,4)]
            section(m,path,[.211]*4,[.220]*4,COVER)
        for i in range(2):
            x=2.753 if i else -2.753
            m.box((x,side*1.13,.028),(1.66,.422,2.056),ROCK)
    m.grid(lambda t,v:(arch(t)[0],-1.34+2.68*v,arch(t)[1]),40,12,COVER,flip=True)
    m.box((-2.744,0,-.486),(1.70,2.71,1.025),COVER)
    m.box((2.744,0,-.486),(1.70,2.71,1.025),COVER)
    for i in range(32):
        x=-3.56+7.12*i/31
        z=deck(x)
        beam(m,(x,-1.35,z),(x,1.35,z),.222,.103,ROCK)
        for y in (-1.264,1.264):
            beam(m,(x,y,z+.066),(x,y,z+.56),.079,.081,ROCK,bevel=.26)
            if i<31:
                nx=x+7.12/31
                beam(m,(x,y,z+.61),(nx,y,deck(nx)+.61),.163,.105,ROCK)
    x,y=-2.94,-1.23
    m.stack(x,y,[(1.23,.102),(1.30,.124),(1.41,.081),(1.56,.061),(2.56,.045),(2.95,.042)],15,METAL)
    glass_lamp(m,x,y,3.183,.128,.35)
    m.stack(x,y,[(3.38,.077),(3.47,.051),(3.60,.014)],10,METAL)


def stone_steps(m,rng):
    for i in range(9):
        z=-.49+.158*i
        y=-1.14+.259*i
        for j in range(7):
            x=-1.86+.526*j
            beam(m,(x,y-.121,z),(x,y+.121,z),.506,.22,COVER if i<5 else ROCK,bevel=.21)
    for side in (-1,1):
        for i in range(6):
            y=-.98+.392*i
            m.box((side*1.82,y,-.21+i*.104),(.245,.385,.36+i*.113),ROCK)
    for x in (-1.38,1.38):
        points=[(x+.088*math.cos(t),.92,.657+.083*math.sin(t)) for t in np.linspace(0,TAU-.07,25)]
        twig(m,points,[.017]*len(points),6,METAL)
        m.stack(x,.94,[(.654,.051),(.677,.056)],10,METAL)


SPECS=(
    Asset("venice_campanile_island","圣乔治水岸剪影","远岸钟楼、古典教堂穹顶及低矮水岸街廓，横向沿 X",(50,29,18),-.6,(4500,7500),camera=(2.6,-13,4)),
    Asset("venice_palazzo_corner","水巷哥特宅角","临水宅邸的三叶拱窗、铁阳台和石水门",(5.8,8.2,5),-1.2,(8000,13000),camera=(5,-10,3)),
    Asset("venice_gondola","黑漆贡多拉","船首朝 +X，六齿船首饰、红丝绒座和铜灯",(5.4,1.15,1.28),-.32,(5000,8500),"boat",camera=(4,-9,5.5)),
    Asset("venice_pali_cluster","螺旋彩条木桩","三根系船桩与缆绳，水线保留青苔",(1.35,3.8,1.25),-1.2,(2000,3500),"small",camera=(0,-9,5)),
    Asset("venice_stone_arch","水巷白石拱桥","桥洞留空、石栏和古典铸铁路灯",(7.2,4.6,2.8),-1.,(6000,10000),camera=(2.5,-11,3.8)),
    Asset("venice_stone_steps","伊斯特拉石码头阶梯","近岸宽石阶、潮线湿藻及系船环",(3.8,1.55,2.4),-.6,(1500,3000),"small",camera=(3,-7,6)),
)
BUILDS=(island,palazzo,gondola,pali,arch_bridge,stone_steps)
BASE_PALETTE=basic_palette()
BASE_PALETTE.update({
    WOOD:Surface((.468,.222,.155),.76,"brick",(.628,.539,.440)),
    TRIM:Surface((.682,.643,.546),.78,"stone"),ROCK:Surface((.681,.651,.572),.77,"sandstone"),
    COVER:Surface((.510,.487,.377),.77,"sand_moss",(.425,.453,.325)),
    DETAIL:Surface((.358,.401,.391),.73,"stone"),ROOF:Surface((.648,.631,.525),.73,"stripe",(.245,.346,.428)),
    PANEL:Surface((.716,.674,.570),.71,"stripe",(.538,.218,.196)),
    METAL:Surface((.318,.337,.337),.49,"stone"),WEAVE:Surface((.400,.222,.184),.73,"weave"),
    GLOW:Surface((.884,.571,.255),.64,"paper"),BARK:Surface((.228,.322,.284),.80,"seams"),
})


def PALETTE(asset):
    palette = BASE_PALETTE.copy()
    if asset.name!="venice_pali_cluster":
        palette[ROOF] = Surface((.412,.218,.160),.78,"seams")
    if asset.name=="venice_gondola":
        palette.update({
            WOOD:Surface((.134,.145,.152),.36,"lacquer"),TRIM:Surface((.199,.186,.166),.48,"wood"),
            METAL:Surface((.634,.654,.656),.35,"stone"),WEAVE:Surface((.432,.154,.170),.78,"canvas"),
            ROCK:Surface((.473,.369,.225),.63,"wood"),
        })
    return palette


if __name__=="__main__":
    generate("venice","威尼斯水巷 · 泻湖暮光","Venice Grand Lagoon",
             ("#eee4d4","#353439","#6b625d","#916047","#ded9c9"),SPECS,BUILDS,PALETTE,20261203)
