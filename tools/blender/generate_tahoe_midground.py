"""Build Tahoe's granite tea-house island, timber lodge and wooden cruiser."""

from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate_alps_midground import (
    Asset, Surface, factory, np, block, room, roof, gable, prism, turn, lamp, pine, rails, rock_cluster,
    hull, triangular_sail, boat_rails, generate, DETAIL, COVER, WOOD, TRIM, BARK, WEAVE, METAL, ROCK, ROOF,
    SNOW, LEAF, NEEDLE, PANEL, BLOOM, GLOW, EMIT, beam, rock,
)


def chimney(m, x, y, z, height):
    m.box((x,y,z+height*.48),(.78,.75,height),ROCK,angle=.014)
    for i in range(7):
        m.box((x+.074*(i%2),y-.32-i*.006,z+height*(.12+.10*i)),(.80,.27,.15),
              DETAIL if i%3 else ROCK,angle=.018+i*.006)
    m.box((x-.014,y+.031,z+height-.025),(1.03,.95,.23),DETAIL)
    m.box((x+.038,y+.017,z+height+.14),(.73,.664,.16),ROCK)


def masonry(m, x, face, z, span):
    for i in range(4):
        for j in range(5):
            u = x+span*((j+.5)/5-.5)+(i%2)*.15
            m.box((u,face-.14-.015*j,z+.21+.299*i+j*.008),
                  (span*.16,.34,.24),ROCK if (i+j)%4 else DETAIL,angle=.029*(j-2))


def isle(m, rng):
    rock_cluster(m,rng,0,.11,-1.08,5.89,25.2,15.7,ROCK,cap=DETAIL,stones=12)
    rock_cluster(m,rng,1.14,.18,-.73,6.5,13.7,10.5,ROCK,cap=DETAIL,stones=6)
    rock(m,(1.01,-1.04,5.47),(8.5,6.1,1.14),5,14,rng,DETAIL)
    z = 5.85
    m.box((1.37,-.73,z),(5.2,4.64,.34),ROCK,angle=.018)
    room(m,1.41,-.67,z+.10,4.48,3.68,2.86,ROCK,TRIM,
         ((.09,1.75,((0,1.06),)),(2.04,2.50,((-.96,.63),(.94,.60)))),rear=False)
    masonry(m,1.42,-2.46,z+.05,3.68)
    gable(m,1.41,-.67,z+2.96,4.48,3.68,1.46,WOOD)
    roof(m,1.41,-.67,z+3.00,5.15,4.3,1.52,ROOF,nx=7,courses=4,ridge_slot=METAL)
    chimney(m,3.15,.36,7.84,2.32)
    for x,y,a,h,w in ((-5.51,1.08,4.29,8.53,4.06),
                      (5.55,2.68,4.02,8.67,4.15),
                      (8.2,1.19,3.10,6.95,3.07)):
        pine(m,rng,x,y,a,h,w,ponderosa=True)
    for i in range(6):
        rock(m,(-.23+i*.58,-4.65+i*.40,1.80+i*.62),(1.86,.9,1.41),3,10,rng,DETAIL)
    lamp(m,2.33,-3.03,6.85,.82)
    return (2.33,-3.03,6.85)


def lookout_glazing(m, x, y, z, w, rise, depth):
    """Split an A-frame facade around a solid triangular window recessed 0.36 m."""
    full, glass = w/2, w*.342
    peak = rise*.80
    sill = z+.16
    outer = z+rise
    prism(m,[(x-full,z-.12),(x+full,z-.12),(x+glass,sill),(x-glass,sill)],y,y+depth,PANEL)
    prism(m,[(x-full,z-.12),(x-glass,sill),(x,sill+peak),(x,outer)],y,y+depth,PANEL)
    prism(m,[(x,sill+peak),(x+glass,sill),(x+full,z-.12),(x,outer)],y,y+depth,PANEL)
    prism(m,[(x-glass,sill),(x+glass,sill),(x,sill+peak)],y+.36,y+.49,GLOW,EMIT)
    for side in (-1,1):
        beam(m,(x+side*glass,y-.155,sill),(x+side*.098,y-.155,sill+peak-.105),.224,.252,TRIM)
    m.box((x,y-.139,sill+peak*.49),(.13,.265,peak*.89),TRIM)
    m.box((x,y-.133,sill+peak*.415),(glass*1.02,.241,.123),TRIM)
    m.box((x,y-.046,sill-.025),(glass*2.12,.61,.21),TRIM)


def dock(m, start=-2.5, end=-6.7, x=3.52, level=.68):
    depth = start-end
    width = 2.75
    for i in range(17):
        y = end+depth*(i+.5)/17
        m.box((x+.008*i,y,level-.093+.009*float(np.sin(i))),
              (width-.034*(i%4),depth/17-.015,.187),WOOD if i%4 else TRIM)
    for j,t in enumerate((.055,.377,.689,.95)):
        y = end+depth*t
        for sign in (-1,1):
            xx = x+sign*1.21
            m.tube([(xx+sign*.09,y+.03,-1.00+j*.013),(xx,y,.94-j*.027)],
                   (.20,.163),9,WOOD,phase=.13*j)
        m.beam((x-1.44,y,.38),(x+1.44,y,.38),.225,.28,TRIM)
    for sign in (-1,1):
        m.beam((x+sign*.99,end+.036,.43),(x+sign*.99,start-.037,.43),.24,.30,WOOD)
        rails(m,[(x+sign*1.23,u) for u in np.linspace(end+.22,start-.21,5)],level,.64,TRIM)


def lodge(m, rng):
    rock_cluster(m,rng,-.68,1.09,-1.06,2.86,23.62,10.74,ROCK,cap=DETAIL,stones=9)
    rock(m,(2.02,.674,1.83),(13.92,8.15,2.37),5,17,rng,DETAIL)
    floor = 2.72
    m.box((1.98,.24,floor-.105),(10.63,6.44,.45),DETAIL)
    room(m,2.11,.64,floor,9.87,5.75,3.27,WOOD,TRIM,
         ((.46,2.32,((-3.21,1.39),(-1.56,1.06),(.30,1.37),(2.17,1.10),(3.68,1.10))),))
    z = floor+3.27
    gable(m,2.11,.72,z,9.87,5.60,4.40,PANEL)
    # Visibility through the window is preserved by hollowing the whole front bay:
    # a shallow facade runs forward of the solid rear gable.
    lookout_glazing(m,2.11,-2.54,z,9.88,4.47,.48)
    roof(m,2.11,.52,z-.22,11.31,7.23,4.61,ROOF,nx=8,courses=4,ridge_slot=METAL,warp=.09)
    chimney(m,5.35,1.20,6.67,3.10)
    for side in (-1,1):
        for i,z0 in enumerate((3.11,3.51,3.92,4.33,4.74,5.15,5.54)):
            x = 2.11+side*(4.87+i*.015)
            m.tube([(x,-2.36,z0),(x,3.52+i*.04,z0+.026)],(.187,.164),8,WOOD)
    for x in (-2.55,-.90,2.12,4.58,6.81):
        m.box((x,-2.402,4.026),(.29,.445,2.89),TRIM)
    for i in range(7):
        z0 = .842+.277*i
        m.box((3.59,-5.32+.42*i,z0-.12),(2.50+i*.026,.68,.281),DETAIL)
    dock(m,start=-4.84,end=-8.82)
    for x,y,g,h,w in ((-7.43,1.08,2.23,7.40,4.21),(7.58,2.15,2.11,7.89,3.28)):
        pine(m,rng,x,y,g,h,w)
    lamp(m,5.18,-3.06,4.39,.88)
    return (5.18,-3.06,4.39)


def cruiser(m, _rng):
    hull(m,12.5,3.34,body=WOOD,boot=TRIM,rail_slot=DETAIL,stations=27,rounded=True,
         draft=1.01,sheer=.61)
    room(m,-2.71,0,.64,3.18,1.93,1.09,WOOD,TRIM,
         ((.17,.91,((-.88,.73),(0,.71),(.88,.73))),))
    roof(m,-2.72,0,1.78,3.38,2.20,.21,WOOD,nx=6,courses=3,ridge_slot=TRIM)
    main = ((-.76,-.013,1.21),(-4.82,.151,1.20),(-.86,.044,3.28))
    jib = ((-.41,.026,1.06),(4.55,.02,.86),(-.76,.044,3.08))
    for data in (main,jib):
        triangular_sail(m,data,lambda row,_col: BLOOM if row==1 else SNOW,
                        rows=12,panels=11,belly=.24)
    m.tube([(-.70,.04,.65),(-.74,.048,2.23),(-.86,.048,3.31)],
           (.114,.079,.058),10,WOOD)
    m.tube([(-.73,.06,1.18),(-2.67,.14,1.17),(-4.91,.15,1.16)],(.059,.051,.034),8,TRIM)
    for side in (-1,1):
        beam(m,(-.29,side*1.40,.635),(-.81,.044,3.01),.041,.048,WEAVE)
    boat_rails(m,12.5,3.36,TRIM)
    lamp(m,-.861,-.114,3.32,.41,mount=False)
    lamp(m,-4.73,-.46,1.19,.74)
    return (-4.73,-.46,1.19)


def main():
    palette = factory.basic_palette() | {
        WOOD: Surface((.48,.237,.119),.69,"wood"),
        TRIM: Surface((.64,.38,.179),.63,"carved"),
        ROCK: Surface((.552,.563,.561),.86,"granite"),
        DETAIL: Surface((.639,.633,.598),.85,"granite"),
        PANEL: Surface((.677,.514,.336),.82,"wood"),
        ROOF: Surface((.205,.269,.242),.81,"seams"),
        NEEDLE: Surface((.168,.295,.194),.78,"broad",(.265,.373,.226)),
        LEAF: Surface((.232,.368,.221),.81,"broad",(.293,.417,.246)),
        SNOW: Surface((.92,.855,.698),.79,"canvas"),
        BLOOM: Surface((.30,.419,.403),.76,"canvas"),
    }
    def surfaces(asset):
        if asset.name=="tahoe_wooden_cruiser_mid":
            return palette | {WOOD:Surface((.463,.184,.084),.40,"lacquer"),
                              DETAIL:Surface((.70,.464,.205),.40,"carved")}
        return palette

    entries = (
        (Asset("tahoe_emerald_isle_mid","太浩湖翡翠湾湖心石岛与石砌茶屋","花岗岩松岛和石砌瞭望茶屋，临水面朝 +Z",
               (26,14,16),-1.08,(4800,8000),camera=(2.8,-10,3.12)),isle,"Emerald Bay tea-house island"),
        (Asset("tahoe_lodge_point_mid","北美松林湖岬原木度假屋与木栈码头","原木湖畔庄园、雪松码头与花岗岩，临水面朝 +Z",
               (24,11.5,12),-1.06,(4600,7800),camera=(2.65,-10,3.25)),lodge,"Sierra timber lodge and pier"),
        (Asset("tahoe_wooden_cruiser_mid","太浩湖经典桃花心木古典游艇","桃花心木巡航帆船，船首朝 +X",
               (12.5,4.4,3.4),-1.01,(3200,5500),"boat",camera=(2.58,-10,2.25)),cruiser,"Mahogany lake cruiser"),
    )
    generate("tahoe","Lake Tahoe · Midground",entries,surfaces,(.13,.24,.32),"#c1cfdd",originals=7,seed=20261217)


if __name__=="__main__":
    main()
