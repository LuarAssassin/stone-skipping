"""Build the spring Kawaguchi Lake pack with the shared Blender scene factory."""
from pathlib import Path
import math
import sys
sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))

import numpy as np
from scene_pack_factory import (
    Asset, Surface, MASK, WOOD, TRIM, BARK, ROCK, COVER, ROOF, LEAF, LEAF2, BLOOM,
    DETAIL, PANEL, TAU, basic_palette, beam, frond, generate, mix, polar, rock, twig, v3, watercraft,
)
from scene_pack_landmarks import gabled_roof, pier, radial_mountain, second_paddle


def fuji(m,rng):
    radial_mountain(m,rng,"fuji")


def viewing_pier(m,rng):
    pier(m,rng,6.2,2.31,.5,1.84,boards=40)
    group = len(m.xyz)
    for x in (-.79,.79):
        for y in (-.92,.92):
            m.stack(x,y,[(.49,.142),(.63,.124),(.79,.082),(.96,.070),(1.94,.064),(2.10,.071)],
                    12,WOOD,shade=True)
            beam(m,(x,y,1.66),(x,y*.65,2.10),.073,.072,TRIM)
        beam(m,(x,-.985,2.115),(x,.985,2.115),.113,.134,ROOF)
    for y in (-.93,.93):
        beam(m,(-.98,y,2.12),(.98,y,2.12),.107,.141,ROOF)
        beam(m,(-.79,y,.909),(.79,y,.909),.073,.093,TRIM)
        for x in np.linspace(-.72,.72,9):
            beam(m,(x,y,.51),(x,y,.864),.031,.038,TRIM)
    gabled_roof(m,2.26,2.38,2.178,2.527,nu=19,nv=6,sweep=.102)
    m.xyz[group:] = [(x-1.11,y,z) for x,y,z in m.xyz[group:]]


def rowboat(m,rng):
    watercraft(m,4.2,1.14,-.32,.52,"rowboat")
    second_paddle(m,4.15,.99)


def flowering_tree(m,rng,lean):
    def trunk(t):
        return v3(((1.76*t**1.6 if lean else .52*t)+.19*math.sin(8*t)*t,
                   .36*math.sin(3.1*t)*t,-.28+5.18*t))
    twig(m,[trunk(t) for t in np.linspace(0,1,14)],np.linspace(.292,.027,14),15,BARK)
    for i in range(6):
        a=TAU*i/6+.23
        twig(m,[trunk(.09),polar(.22,a,.04),polar(.57,a,-.19)],[.13,.080,.031],8,BARK)
    for k in range(10):
        t=.41+.355*rng.random()
        a=TAU*k/10+rng.uniform(-.28,.29)
        start=trunk(t)
        sweep=1.75+1.12*rng.random()
        end=start+polar(sweep,a,rng.uniform(.51,1.69))
        if lean:
            end[0] += .81
            end[2] -= .13*(1+math.cos(a))
        joint=mix(start,end,.57)+(0,0,.017)
        twig(m,[start,mix(start,joint,.43),joint,mix(joint,end,.66),end],
             [.103,.080,.054,.031,.012],9,BARK)
        for j in range(4):
            base=mix(joint,end,(j+.25)/4.3)
            branch_angle=a+(.49 if j%2 else -.56)+rng.uniform(-.31,.31)
            tip=base+polar(rng.uniform(.64,1.12),branch_angle,rng.uniform(-.33,.63))
            twig(m,[base,mix(base,tip,.49)+(0,0,.15),tip],[.029,.017,.007],7,BARK)
            for i in range(5):
                origin=mix(base,tip,(i+.51)/5.35)
                origin+=v3((rng.uniform(-.16,.16),rng.uniform(-.13,.13),rng.uniform(-.15,.16)))
                arc=.79+1.05*rng.random()
                heading=branch_angle+rng.uniform(-1.38,1.38)
                frond(m,origin,heading,arc,arc*.89,LEAF if (k+j+i)%4 else LEAF2,
                      drop=.42 if lean else .22,arch=.21,segments=5,transverse=2)
    leader=trunk(.96)
    for i in range(11):
        angle=TAU*i/11
        frond(m,leader+polar(.24,angle,.097),angle,1.21,.86,LEAF,drop=.14,arch=.34,segments=5,transverse=2)


def bloom(m,rng):
    flowering_tree(m,rng,False)


def leaning(m,rng):
    flowering_tree(m,rng,True)


def lava(m,rng):
    rock(m,(0,0,.12),(2.4,1.9,1.15),17,44,rng,ROCK,"column")


def petals(m,rng):
    for i in range(28):
        x=(i%7-3)*.284+rng.uniform(-.13,.13)
        y=(i//7-1.5)*.523+rng.uniform(-.16,.16)
        a=rng.uniform(0,TAU)
        c,s=math.cos(a),math.sin(a)
        radius=rng.uniform(.031,.062)
        def site(u,v):
            xx,yy=(2*u-1)*radius,(2*v-1)*radius*1.37
            return (x+xx*c-yy*s,y+xx*s+yy*c,.010+.014*(v-.36)**2+.006*math.cos(u*math.pi))
        m.grid(site,3,2,BLOOM if i%3 else DETAIL,group=MASK)


SPECS=(
    Asset("mount_fuji_peak","富士雪冠","湖对岸的对称逆富士轮廓，横向沿 X",(68,32,36),-.6,(3500,6000),origin="groundContact",camera=(1,-14,3)),
    Asset("fuji_boat_pier","河口红顶栈桥","沿 +X 的观景桥，桥面 +0.5 m，朱顶小门廊与木灯",(6.2,3.8,2.4),-1.2,(6000,10000),x_start=True),
    Asset("kawaguchi_rowboat","河口湖木划舟","浅色素木手划舟，船首朝 +X，配双桨和暖灯",(4.2,.88,1.18),-.32,(4000,6500),"boat"),
    Asset("sakura_tree_bloom","染井吉野盛樱","前岸主树，淡粉白樱花层叠树冠",(7.2,6.8,6.8),-.28,(6500,9500),"tree","groundContact",anchor_xy=(0,0)),
    Asset("sakura_tree_leaning","临水垂枝樱","朝 +X 伸向水面，根颈定位前景岸线",(7.,6.2,5.4),-.28,(6000,9000),"tree","groundContact",anchor_xy=(0,0)),
    Asset("fuji_lava_rock","多孔玄武湖石","半浸岸礁，暗黑岩架保留火山气孔",(2.4,1.15,1.9),-.45,(1200,2500),"small"),
    Asset("sakura_floating_petals","漂浮春樱花瓣","二十八片贴水粉白落瓣",(2.0,.03,1.9),0,(200,450),"small",camera=(2,-5,12)),
)
BUILDS=(fuji,viewing_pier,rowboat,bloom,leaning,lava,petals)
PALETTE=basic_palette()
PALETTE.update({
    WOOD:Surface((.476,.359,.266),.70,"wood"),TRIM:Surface((.645,.531,.390),.70,"wood"),
    ROOF:Surface((.470,.208,.151),.73,"seams"),BARK:Surface((.294,.222,.203),.85,"bark"),
    ROCK:Surface((.233,.260,.270),.77,"lava"),COVER:Surface((.362,.397,.438),.79,"fuji",(.845,.879,.902)),
    PANEL:Surface((.581,.468,.333),.66,"wood"),
    LEAF:Surface((.621,.422,.463),.77,"sakura",(.918,.791,.794)),
    LEAF2:Surface((.566,.339,.385),.73,"sakura",(.884,.721,.766)),
    BLOOM:Surface((.814,.578,.654),.70,"petal_single",(.957,.858,.866)),
    DETAIL:Surface((.727,.472,.552),.70,"petal_single",(.905,.740,.781)),
})
if __name__=="__main__":
    generate("fuji","河口富士 · 春樱","Mount Fuji and Spring Sakura",
             ("#eee9e4","#313940","#5b6267","#a36c73","#dce1e4"),SPECS,BUILDS,PALETTE,20261201)
