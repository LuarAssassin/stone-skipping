"""Wulingyuan sandstone pillars, Tujia gallery and Baofeng Lake vegetation."""
from pathlib import Path
import math
import sys
sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))

import numpy as np
from scene_pack_factory import (
    Asset, Surface, BARK, BLOOM, COVER, DETAIL, EMIT, LEAF, METAL, NEEDLE,
    ROCK, ROOF, TRIM, WEAVE, WOOD, TAU, basic_palette, beam, frond,
    generate, glass_lamp, mix, polar, rock, twig, v3,
)
from scene_pack_landmarks import gabled_roof, lit_arch


def sandstone_pillar(m,rng,position,w,d,h,rings,sides):
    cx,cy,base=position
    phase=rng.uniform(0,TAU,5)
    column=[]
    for j in range(rings+1):
        t=j/rings
        # Rounded, joint-bounded columns have a ledge where softer beds erode.
        body=1-.29*t+.08*math.sin(16*t+phase[0])+.05*math.cos(37*t+phase[1])
        ring=[]
        for i in range(sides):
            a=TAU*i/sides
            cr,si=math.cos(a),math.sin(a)
            outline=(abs(cr)**2.66+abs(si)**2.66)**(-1/2.66)
            channel=1+.115*math.sin(5*a+phase[2])+.057*math.cos(11*a+phase[3])
            r=body*outline*channel
            ring.append(m.vertex((cx+w*.5*(r*cr+.16*t*t),cy+d*.5*r*si,
                                  base+h*(t+.013*math.cos(4*a+phase[4])*math.sin(math.pi*t)))))
        column.append(ring)
    for j in range(rings):
        for i in range(sides):
            k=(i+1)%sides
            v1,v2=.13+.82*j/rings,.13+.82*(j+1)/rings
            m.face((column[j][i],column[j][k],column[j+1][k],column[j+1][i]),
                   ((i/sides,v1),((i+1)/sides,v1),((i+1)/sides,v2),(i/sides,v2)),COVER,
                   shade=i%6 not in (0,1))
    uv=[(.5+.47*math.cos(TAU*i/sides),.5+.47*math.sin(TAU*i/sides)) for i in range(sides)]
    m.face(column[0][::-1],uv[::-1],ROCK,shade=False)
    m.face(column[-1],uv,DETAIL,shade=False)
    return v3((cx+w*.08,cy,base+h))


def crag_tuft(m,rng,base,size,full):
    a=rng.uniform(0,TAU)
    tip=base+polar(size*.39,a,size*.80)
    fork=mix(base,tip,.52)+polar(size*.13,a+.8,0)
    twig(m,[base,fork,tip],[size*.053,size*.035,size*.018],6,BARK)
    for j in range(14 if full else 9):
        b=TAU*j/9+a
        start=mix(fork,tip,(j%3)*.43)
        frond(m,start,b,size*rng.uniform(.62,1.03),size*.48,NEEDLE,
              drop=.28,arch=.11,segments=5,transverse=2 if full else 1)


def pillar_cluster(m,rng):
    for x,y,w,d,h in ((-22,4,8.7,9.5,19.6),(-15,-1,7.7,8.8,28.3),(-5,4,9.5,10.5,34),
                       (4,-5,7.0,8.9,25.2),(14,1,9.1,10.2,29.6),(22,4,6.7,7.6,21.1)):
        top=sandstone_pillar(m,rng,(x,y,-.8),w,d,h,14,26)
        for dx,dy in ((-1.24,-.52),(.98,.92)):
            crag_tuft(m,rng,top+(dx,dy,-.052),rng.uniform(.98,1.72),False)


def pillar_tall(m,rng):
    top=sandstone_pillar(m,rng,(0,0,-1.2),6.1,5.6,20.9,28,48)
    for x,y,s in ((-1.18,.33,1.28),(.26,-.58,1.48),(1.27,.22,1.27),(-.34,1.04,1.06)):
        crag_tuft(m,rng,top+(x,y,-.036),s,True)
    for x,y,z in ((-2.11,.44,.42),(1.76,-1.15,-.17)):
        rock(m,(x,y,z),(1.88,1.63,2.20),7,20,rng,COVER,"column")


def red_lantern(m,x,y,z):
    m.stack(x,y,[(z-.18,.093),(z-.13,.154),(z-.05,.172),(z+.073,.168),(z+.145,.142),(z+.174,.093)],
            16,BLOOM,group=EMIT,shade=True)
    for h in (-.177,.168):
        m.stack(x,y,[(z+h-.019,.095),(z+h+.021,.109)],12,METAL)
    twig(m,[(x,y,z+.171),(x,y,z+.431)],[.011,.010],7,METAL)
    twig(m,[(x,y,z-.181),(x+.025,y,z-.289),(x+.030,y,z-.349)],[.016,.026,.013],8,ROOF)


def diaojiaolou(m,rng):
    for x in (-2.6,0.,2.60):
        for y in (-1.86,1.86):
            m.stack(x,y,[(-1.2,.13),(-1.13,.153),(-.26,.136),(.51,.151),(1.06,.127)],
                    15,BARK,shade=True)
            dx=.74 if x<0 else -.74
            beam(m,(x,y,-.35),(x+dx,y,.95),.101,.110,WOOD)
        beam(m,(x,-2.08,.91),(x,2.08,.91),.179,.199,WOOD)
    for y in (-2.10,-.99,0,.99,2.10):
        beam(m,(-2.81,y,.965),(2.81,y,.965),.141,.139,WOOD)
    for i in range(37):
        x=(i-18)*.149
        beam(m,(x,-2.16,1.058),(x,2.16,1.058),.144,.084,TRIM if i%4==0 else WOOD)
    # The lower veranda opens towards the water. Upper screens and bent braces
    # preserve the silhouette of a stacked timber gallery.
    for x in (-2.55,-1.32,0,1.32,2.55):
        for y in (-1.89,1.89):
            beam(m,(x,y,1.087),(x,y,4.43),.133,.138,WOOD)
            dx=.30 if x<0 else -.30
            beam(m,(x,y,4.01),(x+dx,y,4.43),.070,.075,TRIM)
    for y in (-1.91,1.91):
        for z in (1.58,2.00,3.29,3.94,4.39):
            beam(m,(-2.65,y,z),(2.65,y,z),.099,.079,TRIM)
        for i in range(18):
            x=-2.49+i*.292
            beam(m,(x,y,1.12),(x,y,1.951),.034,.040,WOOD)
            beam(m,(x,y,3.30),(x+.103,y,3.91),.037,.041,WOOD)
    m.box((0,.83,3.51),(4.53,1.86,1.71),WOOD)
    for side in (-1,1):
        m.box((side*2.29,.49,2.28),(.13,2.76,2.42),WOOD)
    for z in (3.53,3.93):
        for x in (-2.11,-1.04,0,1.04,2.11):
            lit_arch(m,(x,-.12,z),.63,.388,.97,frame=TRIM,mullions=True)
    for x in (-1.67,1.67):
        red_lantern(m,x,-1.89,3.75)
    gabled_roof(m,6.02,4.78,4.44,5.70,nu=18,nv=5,sweep=.31)


def bamboo_raft(m,rng):
    for i in range(11):
        y=(i-5)*.129
        a=.007*rng.uniform(-1,1)
        path=[(4.72*(t-.5),y+a*t,-.091+.137*abs(2*t-1)**5)
              for t in np.linspace(0,1,14)]
        radii=[.066-.006*abs(2*t-1)+(.004 if j%3==1 else 0)
               for j,t in enumerate(np.linspace(0,1,14))]
        twig(m,path,radii,12,WOOD if i%3 else TRIM)
    for x in (-1.74,-.62,.51,1.53):
        twig(m,[(x,-.699,.009),(x,.697,.009)],[.044,.047],9,TRIM)
        for y in (-.55,-.27,0,.27,.55):
            m.stack(x,y,[(.022,.052),(.044,.054),(.060,.048)],8,WEAVE,shade=True)
    for x in (-.85,-.24):
        for y in (-.41,.43):
            twig(m,[(x,y,.02),(x,y,.30)],[.027,.022],7,TRIM)
        beam(m,(x,-.41,.22),(x,.43,.22),.188,.039,WEAVE)
    for x in (-1.48,-.54):
        for y in (-.57,.57):
            twig(m,[(x,y,.01),(x,y,.55)],[.034,.024],8,WOOD)
    def top(u,v):
        return (-1.52+1.16*u,(2*v-1)*.593,.601+.137*math.sin(math.pi*v))
    m.grid(top,14,14,WEAVE)
    for i in range(5):
        twig(m,[top(i*.25,v) for v in np.linspace(0,1,13)],[.019]*13,6,TRIM)
    twig(m,[(1.79,-.38,.01),(1.94,-.39,.56),(2.12,-.40,.57)],[.041,.027,.023],8,WOOD)
    glass_lamp(m,2.07,-.40,.359,.061,.140)
    twig(m,[(-2.21,-.59,.22),(.0,-.38,.114),(2.17,-.12,.128)],[.018,.016,.012],8,TRIM)


def pine(m,rng):
    trunk=[(-.09,0,-.27),(0,0,.06),(.37,.14,.57),(.81,.10,1.31),(.72,.24,2.28),
           (1.36,.32,3.05),(1.48,.43,3.69),(2.17,.45,4.37),(2.70,.54,5.49)]
    twig(m,trunk,[.29,.31,.266,.205,.197,.164,.126,.081,.031],16,BARK)
    for j in range(6):
        a=TAU*j/6
        twig(m,[trunk[2],polar(.29,a,.12),polar(.65,a,-.13)],[.093,.061,.019],8,BARK)
    for j in range(13):
        a=TAU*j/13+rng.uniform(-.35,.35)
        start=v3(trunk[2+j%7])
        end=start+polar(rng.uniform(1.32,2.56),a,rng.uniform(.18,.95))
        mid=mix(start,end,.53)+(0,0,-.22)
        twig(m,[start,mix(start,mid,.70),mid,mix(mid,end,.63),end],
             [.115,.086,.061,.038,.018],10,BARK)
        for k in range(5):
            origin=mix(mid,end,(k+.5)/5.4)
            angle=a+(-.57 if k%2 else .54)+rng.uniform(-.28,.28)
            tip=origin+polar(rng.uniform(.57,1.06),angle,rng.uniform(.09,.36))
            twig(m,[origin,mix(origin,tip,.51),tip],[.031,.023,.008],6,BARK)
            for s in range(3):
                base=mix(origin,tip,(s+.30)/3.3)
                length=rng.uniform(.62,1.08)
                frond(m,base,angle+rng.uniform(-.73,.79),length,length*.67,NEEDLE,
                      drop=.19,arch=.16,segments=5,transverse=2)


def bamboo(m,rng):
    for i in range(8):
        a=TAU*i/8+.43
        spread=.25+rng.uniform(.06,.28)
        height=rng.uniform(5.72,7.59)
        def stem(t):
            return v3(polar(spread*.62+.75*t*t,a,-.26+(height+.26)*t))
        samples=np.linspace(0,1,29)
        twig(m,[stem(t) for t in samples],
             [(.071-.034*t)*(.95+(.19 if j%3==0 else 0)) for j,t in enumerate(samples)],9,WOOD)
        for j in range(8):
            q=.45+.065*j
            angle=a+.77*j
            origin=stem(q)
            tip=origin+polar(rng.uniform(.49,1.08),angle,rng.uniform(.05,.37))
            twig(m,[origin,mix(origin,tip,.61)+(0,0,.068),tip],[.020,.012,.005],5,TRIM)
            for k in range(3):
                b=mix(origin,tip,(k+.5)/3.2)
                l=rng.uniform(.41,.78)
                frond(m,b,angle+rng.uniform(-.64,.64),l,l*.72,LEAF,drop=.32,arch=.14,segments=4,transverse=1)


def shore_ledge(m,rng):
    sandstone_pillar(m,rng,(0,0,-.60),3.06,2.39,1.80,21,46)
    rock(m,(-1.19,-.48,-.07),(1.02,1.19,.93),7,19,rng,COVER,"column")


SPECS=(
    Asset("zjj_pillar_cluster","武陵砂岩峰林","远岸六根错落峰柱和柱顶奇松，横向沿 X",(54,34,22),-.8,(5000,8500),camera=(1.4,-14,3.1)),
    Asset("zjj_pillar_tall","水上孤峰","近中景细高石英砂岩柱，崖顶生松",(6.4,22,5.8),-1.2,(3500,6000)),
    Asset("tujia_diaojiaolou","土家临水吊脚楼","高架木廊与双红灯笼，一层约 +1.1 m",(6.2,7,4.8),-1.2,(8000,13000),camera=(4.5,-10,2.4)),
    Asset("bamboo_raft","宝峰湖青竹筏","朝 +X 的捆扎竹排，配撑篙、竹篷和渔灯",(4.8,.92,1.45),-.18,(4000,7000),"boat"),
    Asset("cliff_pine_gnarled","武陵迎客崖松","朝 +X 横探水面，接地根颈与水平松盖",(6.6,6.4,5.2),-.27,(5500,8500),"tree","groundContact",anchor_xy=(0,0)),
    Asset("mountain_bamboo_clump","岸边楠竹","八根修长竹竿和分层狭长叶簇",(3.2,7.8,3),-.26,(4500,7500),"tree","groundContact",anchor_xy=(0,0)),
    Asset("wuling_cliff_rock","武陵层理岸礁","半浸阶梯砂岩，顶面覆苔",(3.2,1.8,2.5),-.6,(1500,3000),"small"),
)
BUILDS=(pillar_cluster,pillar_tall,diaojiaolou,bamboo_raft,pine,bamboo,shore_ledge)
PALETTE=basic_palette()
PALETTE.update({
    WOOD:Surface((.414,.346,.219),.74,"wood"),TRIM:Surface((.557,.432,.260),.69,"wood"),
    WEAVE:Surface((.470,.416,.280),.77,"weave"),ROOF:Surface((.230,.292,.286),.76,"seams"),
    BARK:Surface((.303,.241,.182),.85,"bark"),ROCK:Surface((.446,.421,.379),.81,"sandstone"),
    COVER:Surface((.519,.452,.383),.80,"sand_moss",(.364,.427,.285)),
    DETAIL:Surface((.359,.422,.281),.86,"stone"),
    NEEDLE:Surface((.182,.281,.207),.74,"needle",(.368,.459,.309)),
    LEAF:Surface((.219,.362,.207),.72,"bamboo_leaf",(.451,.547,.282)),
    BLOOM:Surface((.820,.342,.148),.67,"paper"),
})
if __name__=="__main__":
    generate("zhangjiajie","武陵奇峰 · 宝峰湖","Zhangjiajie Baofeng Lake",
             ("#e9e7db","#293832","#5a6860","#86604c","#d8dfd5"),SPECS,BUILDS,PALETTE,20261202)
