"""Aswan palm silhouettes, ancient sandstone quay and woven lateen felucca."""
from pathlib import Path
import math
import sys
sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))

import numpy as np
from scene_pack_factory import (
    Asset, Surface, BARK, BLOOM, COVER, DETAIL, EMIT, GLOW, LEAF, MASK, METAL,
    NEEDLE, ROCK, TRIM, WEAVE, WOOD, TAU, basic_palette,
    beam, frond, generate, mix, polar, rock, section, twig, v3, watercraft,
)
from scene_pack_landmarks import sail_rig


def monuments(m,rng):
    def dune(u,v):
        x=66*(u-.5)
        y=26*(v-.5)
        # Low wind-sculpted sand crest winding along the river horizon.
        swirl=.55+.095*math.sin(5*u+.4)+.075*math.sin(12*u)
        first=2.8*math.exp(-((v-swirl)/.25)**2)
        second=1.25*math.exp(-((v-.2+.065*math.sin(10*u))/.12)**2)
        z=-.15+first+second+.46*math.sin(9*u+3*v)**2
        return (x,y,max(-.38,z))
    m.grid(dune,56,22,COVER)
    for side in (0,1):
        def wall(t,h,across):
            x,y,z = dune(t,side) if across else dune(side,t)
            return (x,y,-.60+(z+.60)*h)
        m.grid(lambda t,h:wall(t,h,True),56,1,COVER,flip=side==1)
        m.grid(lambda t,h:wall(t,h,False),22,1,COVER,flip=side==0)
    m.box((0,0,-.555),(66,26.0,.09),COVER)
    for x,y,width,height,levels,angle in ((-17.,1.23,15.,14.51,23,.091),(-.64,3.21,19.1,22.5,29,-.08),
                                             (18.36,-.65,14.10,13.18,23,.144)):
        # Embed the first stone course in the dunes, including on the
        # downhill side of the slope at each of the three footprints.
        base=-.30
        c,s=math.cos(angle),math.sin(angle)
        rings=[]
        for i in range(levels):
            t=i/levels
            extent=width*.5*(1-t)
            z=base+height*t
            for zstep in (.005,height/levels*.95):
                row=[]
                for u,v in ((-1,-1),(1,-1),(1,1),(-1,1)):
                    row.append(m.vertex((x+extent*(c*u-s*v),y+extent*(s*u+c*v),z+zstep)))
                rings.append(row)
        for i in range(len(rings)-1):
            for j in range(4):
                k=(j+1)%4
                lo,hi=i/len(rings),(i+1)/len(rings)
                m.face((rings[i][j],rings[i][k],rings[i+1][k],rings[i+1][j]),
                       ((.06,lo),(.94,lo),(.94,hi),(.06,hi)),ROCK if j%2 else DETAIL,shade=False)
        m.face(rings[-1],((0,0),(1,0),(1,1),(0,1)),ROCK,shade=False)


def lotus_column(m,x,y,top,phase):
    profile=[(.43,.379),(.55,.397),(.63,.375),(.70,.284),(.80,.273)]
    profile.extend((.90+(top-1.88)*t,.273-.056*t) for t in np.linspace(0,1,14))
    profile+= [(top-.862,.247),(top-.738,.284),(top-.581,.369),(top-.38,.399),
              (top-.21,.348),(top-.115,.272),(top-.034,.345),(top,.364)]
    sides=28
    rings=[]
    for z,radius in profile:
        flute = .095 if .80<z<top-.89 else .15 if top-.81<z<top-.18 else .025
        rings.append([
            m.vertex((x+r*math.cos(a),y+r*math.sin(a),z))
            for a in (TAU*j/sides+phase for j in range(sides))
            for r in [radius*(1+flute*math.cos(a*7+phase))]
        ])
    for i in range(len(rings)-1):
        h,k=profile[i][0]/top,profile[i+1][0]/top
        slot=DETAIL if i in (1,3,len(rings)-4) else ROCK
        for j in range(sides):
            s=(j+1)%sides
            m.face((rings[i][j],rings[i][s],rings[i+1][s],rings[i+1][j]),
                   ((j/sides,h),((j+1)/sides,h),((j+1)/sides,k),(j/sides,k)),slot,shade=True)
    close=[(.5+.44*math.cos(TAU*j/sides),.5+.44*math.sin(TAU*j/sides)) for j in range(sides)]
    m.face(rings[0][::-1],close[::-1],ROCK,shade=False)
    m.face(rings[-1],close,ROCK,shade=False)


def brazier(m,rng,x,y,z):
    m.stack(x,y,[(z,.164),(z+.04,.20),(z+.074,.181),(z+.34,.081),(z+.391,.111),(z+.41,.143)],
            14,METAL,shade=True)
    m.stack(x,y,[(z+.408,.128),(z+.448,.160),(z+.603,.231),(z+.65,.247),
                 (z+.68,.249),(z+.694,.229)],18,METAL,shade=True)
    m.stack(x,y,[(z+.694,.189),(z+.709,.171),(z+.731,.124)],13,GLOW,group=EMIT,shade=True)
    for j in range(9):
        a=TAU*j/9
        radius=rng.uniform(.032,.077)
        growth=rng.uniform(.126,.304)
        origin=v3((x+radius*math.cos(a),y+radius*math.sin(a),z+.713))
        end=origin+polar(.065,a,growth)
        m.tube([origin,mix(origin,end,.44)+(0,0,.035),end],[.043,.028,.004],7,
               GLOW if j%3 else BLOOM,group=EMIT,shade=True)


def temple(m,rng):
    step_length=6.45
    for i in range(8):
        z=-1.145+.179*i
        y=-2.07+.364*i
        for j in range(8):
            x=-step_length/2+(j+.5)*step_length/8
            beam(m,(x,y-.175,z),(x,y+.18,z),step_length/8-.012,.181,COVER if i<=3 else ROCK,bevel=.17)
    m.box((0,.83,.145),(6.14,2.78,.574),ROCK)
    for j in range(9):
        x=(j-4)*.665
        beam(m,(x,-.34,.440),(x,2.19,.440),.652,.105,ROCK)
    for i,x in enumerate((-2.48,-.84,.84,2.48)):
        top=5.10 if i!=3 else 4.89
        lotus_column(m,x,.24,top,.17+.19*i)
        m.box((x,.23,.472),(.83,.88,.093),DETAIL)
    # Restored silhouette retains a partially broken lintel and jambs rather than a continuous roof.
    section(m,[(-3.11,.26,5.25),(-2.48,.26,5.32),(-1.37,.26,5.32),(-.47,.26,5.23),(.41,.26,5.20)],
            [.811,.836,.837,.792,.680],[.426,.462,.453,.384,.318],ROCK,bevel=.15)
    section(m,[(-2.87,.27,5.52),(-1.84,.26,5.522),(-.84,.27,5.461),(-.067,.25,5.452)],
            [.922,.926,.89,.749],[.176,.155,.154,.124],DETAIL)
    for x in (-2.53,-1.85,-1.09,-.42):
        m.box((x,-.223,5.23),(.195,.039,.143),COVER)
    m.box((2.47,.24,4.98),(.815,.81,.181),ROCK)
    for x in (-2.10,2.10):
        brazier(m,rng,x,-1.46,.378)


def felucca(m,rng):
    watercraft(m,5.17,1.63,-.35,.69,"felucca")
    sail_rig(m,5.47,5.18,want_lateen=True)


def date_palm(m,rng):
    t_values=np.linspace(0,1,49)
    def stem(t):
        return v3((.47*t*t+.182*math.sin(3*t)*t,.18*math.sin(4*t)*t,-.29+8.54*t))
    twig(m,[stem(t) for t in t_values], [.238-.082*t+.009*(i%2)+.055*math.exp(-25*t)
                                        for i,t in enumerate(t_values)],16,BARK)
    for i in range(5):
        a=TAU*i/5
        twig(m,[stem(.055),polar(.24,a,-.035),polar(.405,a,-.176)],[.068,.052,.020],7,BARK)
    leader=stem(1.)
    for i in range(22):
        a=TAU*i/22+rng.uniform(-.14,.14)
        height=leader[2]+.095*(i%3==0)
        b=v3(polar(.071,a,height))+v3((leader[0],leader[1],0))
        l=rng.uniform(1.92,2.70)
        arch=.35 if i%4==0 else .23
        drop=rng.uniform(.31,.61)
        frond(m,b,a,l,l*.43,NEEDLE,drop=drop,arch=arch,segments=15,transverse=3)
        twig(m,[b+polar(t*l,a,l*(arch*math.sin(math.pi*t)-drop*t*t)) for t in np.linspace(0,1,10)],
             np.linspace(.024,.004,10),5,TRIM)
    for i in range(4):
        a=TAU*i/4+.41
        top=leader+polar(.34,a,-.08)
        tail=leader+polar(.47,a,-.72)
        twig(m,[top,mix(top,tail,.53),tail],[.018,.014,.011],6,TRIM)
        for j in range(6):
            x,y,z=mix(top,tail,(j+.6)/6.3)+polar(.068,a+2.1*j,0)
            m.stack(x,y,[(z-.074,.034),(z-.038,.052),(z+.036,.050),(z+.064,.031)],7,DETAIL,shade=True)


def aswan(m,rng):
    rock(m,(0,0,.28),(3.4,2.8,1.95),20,45,rng,ROCK,"granite")


def papyrus(m,rng):
    for i in range(19):
        a=TAU*i/19+rng.uniform(-.16,.22)
        r=rng.uniform(.07,.59)
        height=rng.uniform(1.06,1.84)
        top=v3(polar(r+.11,a,height))
        root=v3(polar(r*.48,a,-.4))
        path=[mix(root,top,t)+polar(.065*math.sin(math.pi*t),a,0) for t in np.linspace(0,1,9)]
        twig(m,path,np.linspace(.024,.013,9),3,WOOD)
        spread=rng.uniform(.19,.33)
        for j in range(2):
            phase=1.4*j+a
            c,s=math.cos(phase),math.sin(phase)
            def umbrella(u,v):
                x,y=(2*u-1)*spread,(2*v-1)*spread
                d=math.hypot(x,y)/spread
                z=.023*j+(.155 if j else .045)*min(1.32,d)**1.62-.069*d**2
                return top+(x*c-y*s,x*s+y*c,z)
            m.grid(umbrella,5,5,LEAF,group=MASK)
        m.stack(top[0],top[1],[(top[2]-.044,.026),(top[2]+.024,.039)],6,TRIM)


SPECS=(
    Asset("nile_horizon_monuments","沙脊与三座金字塔","远岸沙丘和阶梯金字塔，横向沿 X",(66,26,26),-.6,(2500,4500),origin="groundContact",camera=(2.4,-15,4)),
    Asset("nile_temple_quay","莲花石柱神庙码头","水岸石阶、四根莲花柱和青铜火盆",(6.6,6.8,4.8),-1.2,(7500,12000),camera=(4,-10,2.8)),
    Asset("nile_felucca","尼罗三角帆船","朝 +X 的暖木船，船尾提灯与斜挂帆索",(5.2,5.8,1.65),-.35,(5000,8000),"boat"),
    Asset("nile_date_palm","尼罗河枣椰","接地高干，菱纹叶痕、灰绿扇羽和枣串",(5.4,9.2,5.2),-.29,(5500,8500),"tree","groundContact",anchor_xy=(0,0)),
    Asset("aswan_granite_boulder","阿斯旺磨光河礁","潮线半浸的暗红花岗岩巨石",(3.4,1.95,2.8),-.60,(1500,3000),"small"),
    Asset("nile_papyrus_clump","尼罗纸莎草伞冠","涉水三棱茎，顶端放射羽丝，底部没入水线",(1.8,2.3,1.8),-.4,(1800,3500),"small",camera=(3,-8,4)),
)
BUILDS=(monuments,temple,felucca,date_palm,aswan,papyrus)
BASE_PALETTE=basic_palette()
BASE_PALETTE.update({
    WOOD:Surface((.472,.339,.221),.66,"wood"),TRIM:Surface((.581,.439,.275),.70,"wood"),
    BARK:Surface((.345,.267,.185),.86,"date_bark"),ROCK:Surface((.622,.471,.326),.78,"sandstone"),
    COVER:Surface((.662,.527,.359),.85,"dune"),DETAIL:Surface((.692,.529,.339),.75,"sandstone"),
    WEAVE:Surface((.748,.652,.484),.77,"canvas"),METAL:Surface((.285,.225,.144),.55,"stone"),
    GLOW:Surface((.938,.618,.217),.65,"paper"),BLOOM:Surface((.897,.380,.097),.62,"paper"),
    NEEDLE:Surface((.229,.340,.269),.72,"palm",(.430,.499,.332)),
    LEAF:Surface((.290,.410,.237),.74,"papyrus",(.506,.562,.321)),
})
def PALETTE(asset):
    p=BASE_PALETTE.copy()
    if asset.name=="aswan_granite_boulder":
        p[ROCK]=Surface((.346,.239,.210),.56,"granite")
    elif asset.name=="nile_date_palm":
        p[DETAIL]=Surface((.519,.351,.184),.78,"wood")
    elif asset.name=="nile_papyrus_clump":
        p[WOOD]=Surface((.328,.427,.241),.76,"wood")
        p[TRIM]=Surface((.470,.517,.298),.74,"wood")
    return p


if __name__=="__main__":
    generate("nile","尼罗夕照 · 阿斯旺","Aswan Nile Sunset",
             ("#eee6d5","#413932","#6f6459","#944d32","#e3dbc7"),SPECS,BUILDS,PALETTE,20261205)
