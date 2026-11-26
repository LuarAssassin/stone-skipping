"""Build the South Pacific reef pack, meter-scale and fully textured.

blender -b --factory-startup -P tools/blender/generate_lagoon_scene.py --
"""
import math
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import numpy as np
from scene_pack_factory import (
    Asset, Surface, TAU, WOOD, TRIM, BARK, WEAVE, ROCK, COVER, ROOF, NEEDLE,
    LEAF, LEAF2, BLOOM, DETAIL, basic_palette, beam, frond, generate, glass_lamp,
    mix, polar, rock, terrain, twig, v3, watercraft,
)


def bungalow(m,rng):
    for x in (-2.17,0.,2.17):
        for y in (-1.72,1.72):
            m.stack(x,y,[(-1.2,.116),(-1.14,.128),(-.67,.12),(.16,.135),(.52,.134),(.67,.119)],
                    14,BARK,shade=True)
            for dx in (-.52,.55):
                if abs(x+dx)<2.4:
                    beam(m,(x,y,-.227),(x+dx,y,.442),.094,.089,WOOD)
    for j in range(36):
        x=(j-17.5)*.144
        beam(m,(x,-2.12,.572),(x,2.12,.572),.142,.083,WOOD if j%4 else TRIM)
    for y in (-2.08,-1.02,0,1.02,2.08):
        beam(m,(-2.58,y,.483),(2.58,y,.483),.165,.171,WOOD)
    for i,x in enumerate((-2.02,2.02)):
        for y in (-1.49,1.49):
            m.stack(x,y,[(.59,.106),(.66,.127),(1.36,.123),(2.25,.097),(3.08,.103),(3.40,.105)],
                    14,TRIM,shade=True)
            for z in (.68,1.23,2.79,3.06):
                m.stack(x,y,[(z-.024,.126),(z+.023,.126)],12,WEAVE)
            beam(m,(x,y,2.84),(x*.75,y,3.31),.11,.12,WOOD)
            beam(m,(x,y,2.85),(x,y*.71,3.31),.11,.115,WOOD)
        beam(m,(x,-1.82,3.303),(x,1.82,3.303),.235,.175,WOOD)
    for y in (-1.52,1.52):
        beam(m,(-2.46,y,3.296),(2.46,y,3.296),.145,.193,WOOD)
    for x in (-2.40,2.40):
        for j in range(9):
            y=-1.96+.49*j
            twig(m,[(x,y,.603),(x,y,1.473)],[.044,.041],8,TRIM)
        for h in (1.039,1.465):
            beam(m,(x,-2.04,h),(x,2.04,h),.095,.068,TRIM)
    for x in (-1.51,-.78,0,.78,1.51):
        twig(m,[(x,2.03,.602),(x,2.03,1.439)],[.046,.042],8,TRIM)
    for h in (1.031,1.441):
        beam(m,(-2.46,2.03,h),(2.46,2.03,h),.105,.069,TRIM)
    # Open towards the water, with a small rear woven wind screen and bench.
    m.box((0,1.57,1.83),(2.76,.081,1.52),WEAVE)
    for x in (-1.39,-.70,0.,.70,1.39):
        beam(m,(x,1.524,1.03),(x,1.524,2.59),.064,.059,TRIM)
    for z in (1.10,1.76,2.57):
        beam(m,(-1.48,1.527,z),(1.48,1.527,z),.070,.077,WOOD)
    beam(m,(-1.36,1.12,1.036),(1.36,1.12,1.036),.455,.092,TRIM)
    for x in (-1.22,1.22):
        beam(m,(x,1.12,.619),(x,1.12,1.01),.099,.109,WOOD)
    edge = [(-2.61,-2.32),(2.61,-2.32),(2.61,2.32),(-2.61,2.32)]
    ridge = [(-.93,0),(.93,0),(.93,0),(-.93,0)]
    phase = rng.uniform(0,TAU,4)
    for i in range(4):
        j=(i+1)%4
        def roof(r,s,height):
            a=mix(ridge[i],ridge[j],s)
            b=mix(edge[i],edge[j],s)
            x,y=mix(a,b,r)
            z=3.42+1.49*max(0,1-r)**1.41+.055*r*math.sin(math.pi*s)
            z+=r**6*.039*math.sin(59*s+phase[i])
            return np.array((x,y,z+height))
        m.grid(lambda u,v:roof(.035+.965*u,v,-.105),10,13,WEAVE,flip=True)
        for row in range(6):
            lo=.028+row*.16
            hi=min(lo+.215,1.027)
            def layer(u,v):
                hair = (u**4)*(.021*math.sin(69*v+phase[i])+.010*math.sin(113*v))
                return roof(lo+(hi-lo)*u+u**4*.009*math.sin(33*v),v,.101-.078*u+hair)
            m.grid(layer,3,20,ROOF,uv=lambda u,v:(v,u))
            m.grid(lambda u,v:layer(1,v)+(0,0,-.067*u),1,20,DETAIL,flip=True)
        twig(m,[roof(r,0,.084) for r in np.linspace(.026,1.006,15)],[.057]*15,7,ROOF)
    twig(m,[(-.99,0,4.958),(-.56,0,4.995),(.52,0,4.978),(.99,0,4.982)],
         [.07,.077,.072,.071],10,ROOF)
    for x,y in ((-1.27,-1.40),(1.28,-1.40)):
        twig(m,[(x,y,3.305),(x,y,2.908)],[.012,.009],6,WEAVE)
        glass_lamp(m,x,y,2.714,.135,.285,slot=WEAVE)


def outrigger(m,rng):
    watercraft(m,4.8,.79,-.28,.57,"outrigger")


def palm(m,rng,h,reach,spread):
    def trunk(t):
        return v3((reach*t**1.66-.10*math.sin(6*t),.31*math.sin(2.2*t)*t,-.22+(h+.22)*t))
    points=[trunk(t) for t in np.linspace(0,1,56)]
    radii=[.216-.091*t+.074*math.exp(-24*t)+.014*(i%2) for i,t in enumerate(np.linspace(0,1,56))]
    twig(m,points,radii,14,BARK)
    for k in range(5):
        angle=TAU*k/5+.2
        twig(m,[trunk(.044),polar(.225,angle,.017),polar(.48,angle,-.107)],
             [.073,.051,.018],7,BARK)
    p=trunk(1)
    for k in range(7):
        center = p+polar(.205,TAU*k/7,-.20-.13*(k%2))
        rock(m,center,(.24,.238,.30),6,10,rng,DETAIL,"granite")
    for i in range(23):
        angle = TAU*i/23+rng.uniform(-.15,.15)
        l = spread*rng.uniform(.80,1.14)*(.76 if i%4==0 else 1)
        arch = rng.uniform(.17,.25) if i%4 else rng.uniform(.26,.32)
        drop = rng.uniform(.36,.65) if i%4 else rng.uniform(.18,.33)
        base = p+polar(.09,angle,.08 if i%4==0 else -.087)
        frond(m,base,angle,l,l*rng.uniform(.34,.45),NEEDLE,drop,arch,segments=14,transverse=4)
        path = [base+polar(l*t,angle,l*(arch*math.sin(math.pi*t)-drop*t*t)) for t in np.linspace(0,1,11)]
        twig(m,path,np.linspace(.023,.0026,11),4,TRIM)


def curved(m,rng):
    palm(m,rng,6.89,2.50,2.79)


def tall(m,rng):
    palm(m,rng,8.81,.50,2.69)


def coral(m,rng):
    rock(m,(0,.08,.10),(2.57,2.06,1.26),16,49,rng,ROCK,"coral")
    rock(m,(-1.,-.49,-.04),(.91,.83,.81),7,24,rng,ROCK,"coral")


def hibiscus(m,rng):
    for j in range(11):
        a=TAU*j/11+rng.uniform(-.21,.24)
        height=rng.uniform(.76,1.22)
        p=polar(rng.uniform(.44,.81),a,height)
        twig(m,[(.02,-.02,-.153),polar(.121,a,.24),polar(.47,a,height*.67),p],
             [.051,.042,.023,.011],7,BARK)
        for k in range(9):
            t=(k+.57)/10
            phi=a+rng.uniform(-1,1)
            p0=v3(p)*t+(0,0,.075)
            length=rng.uniform(.28,.57)
            frond(m,p0,phi,length,length*.97,LEAF if (j+k)%4 else LEAF2,
                  drop=.30,arch=.29,segments=4,transverse=3)
        if j in (0,2,4,6,8,10):
            center=v3(p)+(0,0,.029)
            lean=polar(.075,a,0)
            center+=lean
            for k in range(5):
                angle=TAU*k/5+a*.29
                def petal(t,v):
                    r=.012+.103*t
                    swell=.049*math.sin(math.pi*t)**.70+.010
                    offset=(2*v-1)*swell
                    c,s=math.cos(angle),math.sin(angle)
                    return center+(r*c-offset*s,r*s+offset*c,.025+.057*t**2+.026*abs(2*v-1)*t)
                m.grid(petal,4,3,BLOOM,uv=lambda t,v:(v,1-t))
            twig(m,[center,center+(.006,.012,.079),center+(.015,.019,.102)],
                 [.0058,.0048,.0084],6,DETAIL)


def island(m,rng):
    terrain(m,rng,69,23,((-.61,.60,.48),(-.34,1.,.61),(.20,.84,.45),(.48,.91,.29),(.68,.55,.31)),"volcano")


SPECS=(
    Asset("overwater_bungalow","茅草水上草亭","礁湖水上主景，檐下暖灯与竹木露台",(5.4,6.2,4.8),-1.2,(7000,12000),camera=(4.5,-9,2.0)),
    Asset("outrigger_canoe","舷外支架独木舟","近中景漂浮 canoe，主船身首端朝 +X",(4.8,.85,2.15),-.28,(4000,7000),"boat",camera=(3.6,-9,7.4)),
    Asset("coconut_palm_curved","弯干迎风椰子树","岸边横探水面，弯干朝 +X",(6.8,7.8,4.6),-.23,(5000,8000),"tree","groundContact"),
    Asset("coconut_palm_tall","高挺海岸椰子树","近远岸挺立的羽状叶冠与椰果",(5.2,9.6,5.0),-.23,(5000,8000),"tree","groundContact"),
    Asset("coral_reef_rock","蜂窝珊瑚礁石","潮间带青浅色石灰岩，半浸水线",(2.8,1.25,2.3),-.5,(1500,3000),"small"),
    Asset("tropical_hibiscus_bush","海岸扶桑灌木","岸边低灌木层，少量暖色扶桑花",(2.2,1.45,2.1),-.15,(2500,4500),"small","groundContact"),
    Asset("volcanic_island_peak","热带火山岛剪影","远端尖耸海岛，雨林色与裸露岩脊",(46,24,18),-.5,(2500,4500),origin="groundContact",camera=(3,-14,4)),
)
BUILDS=(bungalow,outrigger,curved,tall,coral,hibiscus,island)
PALETTE=basic_palette()
PALETTE.update({
    WOOD: Surface((.461,.335,.226),.64,"carved"),
    TRIM: Surface((.560,.458,.325),.70,"wood"),
    BARK: Surface((.384,.343,.278),.80,"palm_trunk"),
    WEAVE: Surface((.475,.390,.265),.76,"weave"),
    ROOF: Surface((.487,.401,.267),.83,"thatch"),
    ROCK: Surface((.597,.570,.495),.77,"coral"),
    COVER: Surface((.300,.316,.280),.83,"volcano",(.315,.423,.256)),
    NEEDLE: Surface((.190,.339,.227),.68,"palm",(.407,.510,.283)),
    LEAF: Surface((.245,.385,.234),.61,"broad",(.436,.476,.283)),
    LEAF2: Surface((.293,.376,.248),.61,"broad",(.480,.524,.310)),
    BLOOM: Surface((.782,.455,.212),.56,"petal",(.656,.220,.253)),
    DETAIL: Surface((.324,.281,.189),.82,"thatch"),
})


if __name__=="__main__":
    generate("lagoon","热带珊瑚暮湾","South Pacific Coral Lagoon",
             ("#ece8dc","#294139","#5b6a55","#8d5e3c","#d6e1d6"),
             SPECS,BUILDS,PALETTE,20261130)
