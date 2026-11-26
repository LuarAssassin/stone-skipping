"""Build the Arashiyama seasonal shrine pack.

blender -b --factory-startup -P tools/blender/generate_kyoto_scene.py --
"""
import math
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import numpy as np
from scene_pack_factory import (
    Asset, Surface, TAU, WOOD, TRIM, BARK, METAL, GLOW, ROCK, COVER, ROOF,
    NEEDLE, LEAF, LEAF2, PANEL, DETAIL, EMIT, MASK,
    basic_palette, cylinder, frond, generate, mix, polar, rock, section,
    twig, v3, watercraft,
)


def torii(m,rng):
    for side in (-1,1):
        x=side*1.76
        m.stack(x,0,[(-1.2,.43),(-1.09,.49),(-.35,.50),(.013,.49),(.09,.46),(.16,.395)],24,COVER,shade=True)
        m.stack(x,0,[(.142,.369),(.176,.366),(.89,.319),(1.03,.30)],24,ROCK,shade=True)
        path = [(side*(1.76-.133*t),.014*math.sin(2*t),.163+5.55*t) for t in np.linspace(0,1,23)]
        twig(m,path,[.298-.068*t+.009*math.sin(4*t) for t in np.linspace(0,1,23)],26,WOOD)
        for z,r in ((1.021,.30),(4.909,.26),(5.493,.256)):
            m.stack(side*(1.76-.133*z/5.71),0,[(z-.032,r),(z+.037,r*.986)],20,TRIM,shade=True)
    for z,h,width,span,slot,upturn in (
        (3.90,.32,.40,2.30,WOOD,.007), (4.06,.095,.43,2.41,TRIM,.009),
        (5.28,.258,.66,2.64,WOOD,.16), (5.53,.245,.78,2.81,WOOD,.238),
        (5.742,.221,1.14,2.90,ROOF,.294), (5.925,.158,1.5,2.88,ROOF,.196),
        (5.743,.045,1.22,2.86,TRIM,.275)):
        xx = np.linspace(-1,1,31 if z>5 else 7)
        path = [(span*t,0,z+upturn*abs(t)**3.85) for t in xx]
        section(m,path,[width*(.94+.06*t*t) for t in xx],[h]*len(xx),slot,bevel=.27)
    for z in (3.88,4.028,5.30):
        for x in (-1.69,1.69):
            cylinder(m,(x,.225,z),(x,-.226,z),.057,12,METAL)
    for side in (-1,1):
        m.box((side*.44,0,4.60),(.18,.36,1.16),WOOD)
    m.box((0,-.009,4.70),(.549,.325,.884),ROOF)
    m.box((0,-.183,4.70),(.467,.061,.792),PANEL)
    for z,length in ((4.48,.216),(4.61,.144),(4.78,.250),(4.91,.179)):
        m.box((.019,-.220,z),(length,.017,.029),METAL)


def skiff(m,rng):
    watercraft(m,4.5,1.08,-.35,.83,"skiff")


def toro(m,rng):
    for j in range(3):
        a=TAU*j/3+.5
        path = []
        for t in np.linspace(0,1,18):
            r = .074+.44*(1-t)**1.24
            path.append(polar(r,a,.071+.60*t))
        twig(m,path,[.091+.023*math.sin(math.pi*t) for t in np.linspace(0,1,18)],16,COVER)
    for profile,slot,n in (
        ([(.57,.26),(.63,.287),(.70,.251),(.736,.31),(.787,.308),(.832,.257)],COVER,16),
        ([(.792,.26),(.836,.226),(.882,.213)],ROCK,18),
        ([(1.085,.225),(1.14,.265),(1.20,.315),(1.246,.304)],COVER,18),
        ([(1.356,.223),(1.427,.171),(1.467,.127),(1.49,.133),(1.524,.102),(1.58,.055),
          (1.61,.064),(1.666,.079),(1.72,.046),(1.75,.013)],ROCK,16)):
        m.stack(0,0,profile,n,slot,shade=True)
    for i in range(6):
        a=TAU*i/6+.11
        x,y,_=polar(.196,a,0)
        section(m,[(x,y,.836),(.925*x,.925*y,.970),(x,y,1.154)],
                [.083,.061,.078],[.080,.061,.081],ROCK,bevel=.27)
        b=a+TAU/6
        def cap(t,s):
            p=mix(polar(.527,a,0),polar(.527,b,0),s)*t
            p[2]=1.23+.263*(1-t)**1.6+.087*t**5*abs(2*s-1)**2
            return p
        m.grid(lambda u,v:cap(.09+.91*u,v),8,6,COVER)
        m.grid(lambda u,v:cap(.58+.42*u,v)+(0,0,-.057),4,5,ROCK,flip=True)
        twig(m,[cap(1,s)+(0,0,-.025) for s in np.linspace(0,1,11)],[.027]*11,6,COVER)
    m.stack(0,0,[(.850,.128),(.909,.125),(1.042,.103),(1.110,.123)],12,GLOW,group=EMIT,shade=True)


def maple(m,rng,gold=False):
    h=5.6 if gold else 6.2
    root = [(-.08,.07,-.25),(0,0,.03),(.12,.03,.46),(.07,.18,1.25),(.34,.31,2.05),
            (.78,.25,2.91),(.96,.32,3.69),(.66,.41,4.48),(1.06,.47,h-.23)]
    radii = [.285,.343,.253,.217,.176,.159,.109,.067,.019]
    twig(m,root,radii,15,BARK)
    for j in range(5):
        a=TAU*j/5+.29
        twig(m,[(.09,0,.25),polar(.29,a,.045),polar(.59,a,-.095)], [.107,.063,.028],9,BARK)
    lx,ly,lz=np.array(root).T
    for i in range(10):
        a=TAU*i/10+rng.uniform(-.25,.25)
        z=rng.uniform(1.46,3.26)
        start=v3((np.interp(z,lz,lx),np.interp(z,lz,ly),z))
        span=rng.uniform(1.65,2.44)
        high=h*rng.uniform(.67,.88)
        out=v3((math.cos(a),math.sin(a),0))
        branch=start+span*out+(0,0,high-z)
        elbow=mix(start,branch,.56)+(0,0,-.16)
        twig(m,[start,mix(start,elbow,.45),elbow,mix(elbow,branch,.63),branch],
             [.113,.090,.061,.035,.015],10,BARK)
        for j in range(4):
            t=(j+.51)/4.5
            stem=mix(elbow,branch,t)
            angle=a+(-.67 if j%2 else .69)+rng.uniform(-.38,.38)
            end=stem+polar(rng.uniform(.52,1.06),angle,rng.uniform(.06,.43))
            twig(m,[stem,mix(stem,end,.58)+(0,0,.119),end],[.032,.021,.008],7,BARK)
            for k in range(5):
                base=mix(stem,end,(k+.4)/5.2)
                base+=v3((rng.uniform(-.11,.10),rng.uniform(-.14,.12),rng.uniform(-.14,.17)))
                l=rng.uniform(.65,1.33)
                frond(m,base,angle+rng.uniform(-1.26,1.26),l,l*.70,
                      LEAF2 if gold else LEAF,drop=rng.uniform(.15,.47),arch=.19,segments=4,transverse=3)
    for i in range(6):
        frond(m,root[-1],TAU*i/6,.69,.53,LEAF2 if gold else LEAF,drop=.27,segments=5,transverse=2)


def red_maple(m,rng):
    maple(m,rng)


def gold_maple(m,rng):
    maple(m,rng,True)


def moss_rock(m,rng):
    rock(m,(0,0,.10),(2.1,1.7,1.10),16,46,rng,COVER,"basalt")


def litter(m,rng):
    sites = [(x+rng.uniform(-.14,.14),y+rng.uniform(-.14,.14))
             for x in (-.75,-.25,.22,.67) for y in (-.67,-.25,.23,.68)]
    for i,(x,y) in enumerate(sites):
        a=rng.uniform(0,TAU); c,s=math.cos(a),math.sin(a)
        radius=rng.uniform(.084,.129)
        def leaf(u,v):
            dx,dy=(2*u-1)*radius,(2*v-1)*radius
            return (x+c*dx-s*dy,y+s*dx+c*dy,.018+.011*math.sin(math.pi*u)+.011*(v-.38)**2)
        m.grid(leaf,3,3,DETAIL if i%3==0 else NEEDLE,group=MASK)
        twig(m,[(x+s*radius*.56,y-c*radius*.56,.015),(x+s*radius*.87,y-c*radius*.87,.008)],
             [.0014,.0012],3,WOOD)


SPECS = (
    Asset("water_torii","明神水鸟居","湖中神社门景，朱漆门柱面朝 +Z",(5.8,7.4,1.5),-1.2,(5000,9000),camera=(3.5,-9,2.0)),
    Asset("yakatabune_skiff","素木和船","近景漂浮和船，船头朝 +X，竹竿挂灯",(4.5,1.05,1.18),-.35,(4000,7000),"boat"),
    Asset("stone_toro","雪见石灯笼","岸边雪见灯笼，三曲足接地",(1.05,1.75,1.05),0,(2500,4500),"small","groundContact",camera=(4,-9,2.8)),
    Asset("japanese_maple_red","绯红鸡爪槭","主体红枫，横展树枝和层叠掌状叶",(6.8,6.2,6.4),-.24,(6000,9000),"tree","groundContact"),
    Asset("japanese_maple_gold","琥珀金枫","金枫作为秋景中的暖色树冠层",(6.2,5.6,5.8),-.24,(6000,9000),"tree","groundContact"),
    Asset("mossy_river_rock","覆苔玄武湖石","近岸半浸玄武岩，石顶覆苔，下缘潮湿",(2.1,1.1,1.7),-.45,(1000,2200),"small"),
    Asset("autumn_floating_leaves","水面秋枫落叶","十六片水面落叶，混合朱红与琥珀金",(1.9,.04,1.8),0,(200,500),"small",camera=(3,-6,9)),
)
BUILDS = (torii,skiff,toro,red_maple,gold_maple,moss_rock,litter)
PALETTE=basic_palette()
PALETTE.update({
    WOOD: Surface((.548,.210,.145),.61,"lacquer"),
    TRIM: Surface((.580,.414,.269),.69,"wood"),
    BARK: Surface((.330,.279,.218),.84,"bark"),
    ROCK: Surface((.338,.360,.318),.81,"basalt"),
    COVER: Surface((.286,.314,.294),.86,"moss",(.388,.446,.295)),
    ROOF: Surface((.177,.202,.185),.71,"wood"),
    NEEDLE: Surface((.433,.164,.136),.74,"maple_single",(.685,.320,.161)),
    LEAF: Surface((.355,.125,.118),.74,"maple",(.663,.267,.184)),
    LEAF2: Surface((.494,.234,.122),.73,"maple",(.812,.562,.213)),
    PANEL: Surface((.535,.419,.284),.68,"wood"),
    DETAIL: Surface((.546,.293,.138),.77,"maple_single",(.873,.609,.238)),
})


if __name__=="__main__":
    generate("kyoto","京都岚山枫渡","Arashiyama Autumn Crossing",
             ("#eee5d9","#422c2d","#785b4c","#975047","#ddd6c7"),
             SPECS,BUILDS,PALETTE,20261128)
