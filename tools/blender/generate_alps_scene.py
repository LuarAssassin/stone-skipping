"""Lake Brienz boathouse, Matterhorn and Swiss lakeside props."""
from pathlib import Path
import sys
sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))

from scene_pack_factory import (
    Asset, Surface, BARK, BLOOM, COVER, DETAIL, LEAF, NEEDLE, PANEL, ROCK, ROOF, TRIM,
    WEAVE, WOOD, TAU, basic_palette, beam, evergreen, frond, generate, glass_lamp, rock, watercraft,
)
from scene_pack_landmarks import gabled_roof, lit_arch, pier, radial_mountain, sail_rig


def matterhorn(m,rng):
    radial_mountain(m,rng,"matterhorn")


def boathouse(m,rng):
    for x in (-2.53,0,2.53):
        for y in (-2.15,1.82):
            m.stack(x,y,[(-1.2,.133),(-1.12,.151),(-.38,.143),(.19,.145),(.57,.137)],14,BARK,shade=True)
            beam(m,(x,y,-.31),(x+(.55 if x<0 else -.55),y,.42),.104,.122,WOOD)
        beam(m,(x,-2.31,.36),(x,2.04,.36),.172,.172,WOOD)
    for i in range(38):
        x=(i-18.5)*.149
        beam(m,(x,-2.50,.532),(x,2.26,.532),.145,.073,WOOD if i%4 else TRIM)
    # The boat bay and water-facing balcony share the same column grid.
    for x in (-2.19,-1.19,1.05,2.19):
        for y in (-1.63,1.65):
            beam(m,(x,y,.53),(x,y,3.54),.158,.165,TRIM)
    for i in range(20):
        z=.63+i*.143
        for x in (-2.195,2.195):
            beam(m,(x,-1.62,z),(x,1.69,z),.122,.143,WOOD)
        beam(m,(-2.19,1.69,z),(2.19,1.69,z),.111,.147,WOOD)
        for a,b in ((-2.16,-.95),(.91,2.16)) if z<2.4 else ((-2.16,2.16),):
            beam(m,(a,-1.64,z),(b,-1.64,z),.118,.143,WOOD)
    for x in (-1.11,1.08):
        beam(m,(x,-1.72,.55),(x,-1.72,2.42),.138,.126,TRIM)
    beam(m,(-1.15,-1.73,2.43),(1.12,-1.73,2.43),.145,.158,TRIM)
    m.box((0,1.59,1.53),(1.91,.07,1.87),ROOF)
    for z in (2.58,3.44):
        beam(m,(-2.58,-1.76,z),(2.58,-1.76,z),.101,.110,TRIM)
    # Fretted timber balcony with alternating scalloped bars.
    for i in range(18):
        x=-2.40+.276*i
        path=[(x,-2.03-h*.060,2.58+.71*h) for h in (0,.27,.53,.84,1)]
        m.tube(path,[.037,.024,.033,.026,.043],5,TRIM)
    for y,z in ((-2.10,3.28),(-2.065,3.04),(-2.03,2.588)):
        beam(m,(-2.55,y,z),(2.55,y,z),.095,.098,TRIM)
    beam(m,(-2.55,-1.85,2.541),(2.55,-1.85,2.541),.673,.093,WOOD)
    for x in (-1.46,0,1.46):
        lit_arch(m,(x,-1.716,2.84),.71,.547,.98,frame=DETAIL)
    for side in (-1,1):
        for y in (-.53,.59):
            lit_arch(m,(side*2.253,y,1.84),.65,.57,.99,front=side,axis="y",frame=DETAIL)
    for x in (-1.53,1.47):
        m.box((x,-2.09,2.90),(.93,.302,.242),DETAIL)
        for j in range(5):
            p=(x-.35+j*.176,-2.10,3.046)
            heading=rng.uniform(0,TAU)
            frond(m,p,heading,.262,.198,LEAF,drop=.27,segments=3,transverse=1)
            frond(m,p,heading+1.11,.237,.22,BLOOM,drop=.16,arch=.21,segments=3,transverse=2)
    glass_lamp(m,-1.249,-1.86,2.27,.072,.138)
    # Chamfered roof and its exposed verge beneath a broad eave.
    gabled_roof(m,5.98,4.85,3.55,4.96,nu=17,nv=4,sweep=.045)


def yacht(m,rng):
    watercraft(m,4.54,1.52,-.45,.70,"sailboat",lamp=False)
    sail_rig(m,5.16,4.57)


def lake_pier(m,rng):
    pier(m,rng,5.8,2.08,.42,1.20,boards=39)
    for x,y,top in ((-2.56,-.72,.992),(1.88,.78,1.17),(.91,-.79,1.11)):
        m.stack(x,y,[(-1.2,.096),(-1.06,.111),(-.45,.102),(.365,.110),(.511,.104),(top,.093)],
                16,DETAIL,shade=True)
        m.stack(x,y,[(top-.039,.102),(top-.016,.111),(top+.011,.101)],14,WOOD)


def larch(m,rng):
    evergreen(m,rng,9.52,4.40,.31,rows=11)


def slate(m,rng):
    rock(m,(0,0,.20),(2.72,2.13,1.39),15,45,rng,ROCK,"column")
    rock(m,(-.82,-.74,-.04),(1.51,1.16,.66),7,23,rng,COVER,"column")


SPECS=(
    Asset("matterhorn_peak","马特洪冰棱雪峰","远景微弯角峰，岩壁和两侧雪沟，横向沿 X",(58,35,28),-.6,(3500,6000),origin="groundContact",camera=(1.5,-15,4)),
    Asset("swiss_boathouse","布里恩茨临水船舍","蜂蜜木墙、水桩、系泊船口与暖色窗光",(6,6.2,5.2),-1.2,(8000,12500),camera=(4,-9,3.8)),
    Asset("alpine_sailboat","米白湖上小帆船","船首朝 +X，布帆、桅杆和舵索独立建模",(4.6,5.4,1.55),-.45,(5000,8000),"boat"),
    Asset("swiss_lake_pier","红白桩湖畔栈道","沿 +X 的浅木码头，含水下桩与小栈灯",(5.8,2.4,2.1),-1.2,(4000,7000),x_start=True),
    Asset("alpine_larch_tree","金绿高山落叶松","接地树冠，落叶松针叶呈层叠金绿",(4.4,9.8,4.4),-.28,(5500,8500),"tree","groundContact",anchor_xy=(0,0)),
    Asset("alpine_slate_rock","青灰冰碛页岩","半浸页岩，深湿底与松散层理",(2.8,1.45,2.3),-.5,(1200,2500),"small"),
)
BUILDS=(matterhorn,boathouse,yacht,lake_pier,larch,slate)
BASE_PALETTE=basic_palette()
BASE_PALETTE.update({
    WOOD:Surface((.518,.350,.203),.70,"wood"),TRIM:Surface((.585,.404,.245),.66,"wood"),
    BARK:Surface((.310,.256,.210),.86,"bark"),DETAIL:Surface((.415,.284,.180),.73,"wood"),
    COVER:Surface((.364,.391,.408),.81,"matterhorn",(.851,.881,.901)),
    ROCK:Surface((.353,.394,.409),.80,"slate"),ROOF:Surface((.329,.251,.191),.77,"seams"),
    NEEDLE:Surface((.302,.342,.160),.75,"needle",(.632,.547,.248)),
    BLOOM:Surface((.409,.138,.122),.70,"sakura",(.755,.271,.193)),
})
def PALETTE(asset):
    p=BASE_PALETTE.copy()
    if asset.name=="alpine_sailboat":
        p[WEAVE]=Surface((.738,.693,.593),.77,"canvas")
        p[PANEL]=Surface((.722,.681,.573),.58,"wood")
    if asset.name=="swiss_lake_pier":
        p[DETAIL]=Surface((.702,.668,.563),.71,"stripe",(.565,.229,.179))
    if asset.name=="alpine_slate_rock":
        p[COVER]=Surface((.282,.312,.340),.79,"slate")
    return p


if __name__=="__main__":
    generate("alps","布里恩茨冰湖 · 马特洪","Swiss Alps and Lake Brienz",
             ("#e9eae1","#2b393d","#58686b","#7e6d51","#dae4e6"),SPECS,BUILDS,PALETTE,20261204)
