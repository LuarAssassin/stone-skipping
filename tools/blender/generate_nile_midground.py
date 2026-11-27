"""Build the Aswan temple, Nubian oasis and royal lateen dahabiya."""

from pathlib import Path
import math
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate_alps_midground import (
    Asset, Surface, factory, np, quad, block, turn, room, roof, lantern_storey,
    quay, lamp, palm, rock_cluster, hull, triangular_sail, boat_rails, generate,
    DETAIL, COVER, WOOD, TRIM, BARK, WEAVE, METAL, ROCK, ROOF, SNOW, LEAF, LEAF2,
    PANEL, BLOOM, beam, rock,
)


def ashlar(m, x, y, profile, slots):
    """Closed battered square shaft. Each profile row carries its own jamb setback."""
    coords = [(-1,-1),(1,-1),(1,1),(-1,1)]
    rings = [[m.vertex((x+w*u/2,y+d*v/2,z)) for u,v in coords] for z,w,d in profile]
    quad(m,rings[0][::-1],slots[0])
    for j,(a,b) in enumerate(zip(rings,rings[1:])):
        for k in range(4):
            i = (k+1)%4
            quad(m,(a[k],a[i],b[i],b[k]),slots[min(j,len(slots)-1)])
    quad(m,rings[-1],slots[-1])


def lotus_column(m, x, y, bottom, top, radius, *, full=True):
    f = radius
    m.stack(x,y,[(bottom,f*1.36),(bottom+.18,f*1.39),(bottom+.34,f*1.12),
                 (bottom+.55,f*.91),(bottom+1.32,f*.84),(top-1.36,f*.65),
                 (top-1.14,f*.67),(top-.83,f*.79),(top-.46,f*1.20),
                 (top-.22,f*1.25),(top-.195,f*1.09),(top,f*1.10)],12,ROCK,phase=.13)
    for i in range(7 if full else 5):
        a = i*math.tau/(7 if full else 5)
        c,s = math.cos(a),math.sin(a)
        path = [(x+c*f*r,y+s*f*r,z) for r,z in ((.66,top-1.28),(.81,top-.86),
                                                 (1.19,top-.47),(1.22,top-.23))]
        m.tube(path,[.049,.084,.13,.057],5,DETAIL,phase=i*.21)


def statue(m, x, y, z, angle):
    begin = len(m.xyz)
    ashlar(m,x,y,[(z,2.3,1.9),(z+.24,2.34,1.98),(z+.51,2.19,1.84)],(DETAIL,ROCK))
    m.box((x,y+.16,z+1.12),(1.55,1.55,1.19),ROCK)
    ashlar(m,x,y+.20,[(z+1.63,1.35,1.0),(z+2.2,1.37,.83),(z+2.78,1.71,.80),
                      (z+2.96,.66,.66)],(PANEL,ROCK,ROCK))
    for side in (-1,1):
        k = x+side*.392
        m.box((k,y-.696,z+.59),(.54,.79,.23),ROCK)
        m.box((k+.018,y-.48,z+1.14),(.422,.51,1.03),PANEL)
        beam(m,(x+side*.715,y+.16,z+2.76),(x+side*.72,y-.44,z+1.81),.31,.32,DETAIL)
        m.box((k+side*.23,y-.511,z+1.72),(.27,.40,.20),ROCK)
    m.stack(x,y+.18,[(z+2.77,.265),(z+3.04,.342),(z+3.35,.395),
                     (z+3.67,.38),(z+3.797,.29)],12,ROCK)
    ashlar(m,x,y+.255,[(z+2.94,1.09,.70),(z+3.44,.91,.77),(z+3.72,.98,.77),
                         (z+3.88,.69,.66)],(DETAIL,PANEL,DETAIL))
    # The face stands in front of the flared nemes, with a projecting nose and beard.
    m.stack(x,y-.169,[(z+3.05,.214),(z+3.32,.286),(z+3.56,.264),(z+3.65,.192)],10,ROCK)
    m.box((x,y-.45,z+3.38),(.102,.169,.20),ROCK)
    m.tube([(x,y-.357,z+2.97),(x,y-.425,z+3.18)],[.052,.079],7,DETAIL)
    turn(m,begin,x,y,angle)


def brazier(m, x, y, z):
    m.stack(x,y,[(z-.27,.278),(z-.10,.268),(z,.17),(z+.63,.135),(z+.66,.365),
                 (z+.82,.515),(z+1.011,.59),(z+1.078,.516)],12,METAL)
    m.stack(x,y,[(z+.87,.31),(z+1.03,.34),(z+1.19,.258),(z+1.43,.151),
                 (z+1.63,.039)],10,factory.GLOW,group=factory.EMIT,phase=.13)
    for i in range(5):
        a = i*math.tau/5
        dx,dy = .204*math.cos(a),.204*math.sin(a)
        m.tube([(x+dx,y+dy,z+1.024),(x+dx*1.4,y+dy*1.28,z+1.25),
                (x+dx*1.1,y+dy*1.24,z+1.39+.07*i)],(.129,.107,.014),7,
               factory.GLOW,group=factory.EMIT)


def temple(m, rng):
    quay(m,0,.85,27.8,10.04,.58,slot=ROCK,blocks=16)
    for j in range(7):
        z = .365+j*.156
        m.box((.041*j,-4.99+j*.397,z-.27),(5.72-j*.107,1.22+j*.055,.54),PANEL)
    m.box((0,.09,1.183),(6.15,4.24,.20),DETAIL)
    for sign in (-1,1):
        x = sign*4.87
        y = 2.56+sign*.045
        ashlar(m,x,y,[(.717,5.77,4.22),(1.15,5.65,4.12),(1.38,5.24,3.82),(11.63,4.31,3.0),
                      (11.82,4.57,3.34),(12.41,5.12,3.82),(12.68,5.28,3.96),(12.90,4.76,3.48)],
               (DETAIL,ROCK,ROCK,DETAIL,ROCK,PANEL,DETAIL))
        for i in range(4):
            for j in range(4):
                cx = x+(i-1.5)*.11-.28
                z = 2.69+j*.96+i*.016
                cy = .621+j*.026
                m.box((cx,cy,z),(.073,.46,.37),DETAIL,angle=.011*i)
                m.box((cx+.143,cy-.013,z+.11),(.171,.42,.064),DETAIL,angle=.015*i)
            u = x+(i-1.5)*.96
            m.box((u,.921,9.36+.045*i),(.166,.484,2.82),PANEL)
        # The recessed central gateway remains open below the lintel.
        m.box((sign*2.27,1.81,3.78),(.46,1.26,5.19),PANEL)
        statue(m,sign*4.01,-2.49,.722,sign*.095)
        brazier(m,sign*2.23,-4.37,.68)
    ashlar(m,0,2.30,[(5.97,5.33,3.11),(6.37,5.39,3.31),(6.80,5.63,3.53),
                      (7.02,5.62,3.52),(7.22,5.08,3.21)],(DETAIL,PANEL,ROCK,DETAIL))
    for i,(x,y) in enumerate(((-11.83,-.49),(-9.59,-.52),(-7.42,-.47),
                              (7.56,-.43),(9.83,-.48),(12.09,-.51),(10.57,3.76))):
        full = i not in (0,6)
        lotus_column(m,x,y,.733,7.31+i*.027 if full else 4.39-i*.13,.67,full=full)
    for x,w,y in ((-8.56,4.19,-.52),(9.81,6.45,-.43)):
        ashlar(m,x,y,[(7.25,w,1.34),(7.53,w*1.04,1.47),(7.94,w*1.11,1.68),
                      (8.14,w*1.105,1.66)],(DETAIL,ROCK,PANEL))
    for i in range(8):
        rock(m,(rng.uniform(-12.4,-7.2),rng.uniform(2.5,4.1),.85+i*.026),
             (rng.uniform(.6,1.6),.66,.71),3,8,rng,ROCK,"granite")
    return (2.23,-4.37,1.87)


def oasis(m, rng):
    rock_cluster(m,rng,0,.26,-1.08,3.79,21.3,13.54,ROCK,cap=DETAIL,stones=7)
    rock_cluster(m,rng,4.19,.38,-.83,4.61,11.32,9.07,ROCK,cap=DETAIL,stones=2)
    rock(m,(-4.99,-.75,1.73),(6.72,6.98,2.48),6,13,rng,DETAIL,"basalt")
    x,y = 4.53,.08
    m.stack(x,y,[(3.31,2.70),(3.51,2.73),(3.86,2.53),(4.06,2.42),
                 (5.06,2.29),(5.79,2.23)],12,PANEL,phase=math.pi/12)
    lantern_storey(m,x,y,2.25,5.72,7.70,8,PANEL,TRIM,opening=.66)
    m.stack(x,y,[(7.68,2.30),(7.85,2.45),(8.13,2.40),(8.38,2.08),(8.73,1.99),
                 (9.20,1.76),(9.67,1.40),(10.04,.91),(10.30,.47),(10.39,.068)],
            18,ROOF,shade=True,phase=math.pi/18)
    m.stack(x,y,[(10.36,.105),(10.58,.10),(10.73,.041)],8,TRIM)
    for u,v,z,h,size,lean in ((-6.08,.53,2.81,7.32,2.78,1.66),
                             (-2.93,2.75,2.66,8.35,2.81,-.52),
                             (-6.69,-1.56,2.96,5.95,2.51,-.91)):
        palm(m,rng,u,v,z,h,size,lean,fronds=5 if h<6 else 7)
    lamp(m,6.07,-1.72,4.75,1.07)
    return (6.07,-1.72,4.75)


def dahabiya(m, _rng):
    hull(m,16,3.79,body=WOOD,boot=ROOF,rail_slot=TRIM,stations=29,rounded=True)
    room(m,-3.88,.04,.57,5.24,2.84,1.59,WOOD,TRIM,
         ((.22,1.27,((-1.73,.72),(-.57,.79),(.58,.79),(1.77,.71))),),shutters=True,rear=False)
    roof(m,-3.88,.05,2.18,5.58,3.15,.29,WEAVE,nx=5,courses=2,ridge_slot=TRIM)
    for side in (-1,1):
        for i,x in enumerate(np.linspace(-5.81,-1.98,9)):
            m.box((x,side*(1.43+i*.004),.76),(.18,.22,.24),BLOOM,angle=side*(.06*i))
    for i,(mx,h,shift,scale) in enumerate(((-.17,6.52,0,1.),(4.49,5.73,.52,.79))):
        y = -.09+i*.36
        m.tube([(mx,y,.58),(mx-.13,y+.04,h*.58),(mx-.36,y+.056,h)],
               (.19,.127,.078),10,TRIM)
        clew = (mx+3.00*scale,y-.04,h*.64+shift*.21)
        tack = (mx-4.34*scale,y+.03,h*.37+shift)
        head = (mx+1.71*scale,y+.12,h+1.66*scale)
        m.tube([tack,(mx,y+.079,h*.75),head],(.099,.091,.049),9,WOOD)
        triangular_sail(m,(tack,clew,head),
                        lambda r,c: ROOF if 2<=c<=3 or 7<=c<=8 else SNOW,
                        rows=10,panels=11,belly=.44 if i==0 else .34)
        for side in (-1,1):
            beam(m,(mx-1.01+side*.062,side*(1.48-.14*i),.64),(mx-.29+side*.026,y+.078,h*.91+side*.07),.065,.07,WEAVE)
    boat_rails(m,16,3.83,TRIM)
    for x,y,z in ((-6.63,-.51,1.52),(6.56,-.41,1.36)):
        lamp(m,x,y,z,.83)
    return (-6.63,-.51,1.52)


def main():
    palette = factory.basic_palette() | {
        WOOD: Surface((.37,.18,.092),.63,"carved"),
        TRIM: Surface((.64,.397,.17),.62,"wood"),
        ROCK: Surface((.74,.495,.293),.79,"sandstone"),
        DETAIL: Surface((.54,.355,.24),.80,"stone"),
        PANEL: Surface((.80,.61,.39),.83,"sandstone"),
        BARK: Surface((.39,.278,.168),.86,"date_bark"),
        ROOF: Surface((.64,.259,.126),.82,"canvas"),
        SNOW: Surface((.94,.823,.59),.79,"canvas"),
        BLOOM: Surface((.28,.42,.42),.70,"seams"),
        LEAF: Surface((.233,.391,.157),.77,"broad",(.436,.50,.223)),
        LEAF2: Surface((.368,.466,.227),.78,"broad",(.54,.609,.258)),
    }
    def surfaces(asset):
        if asset.name=="nile_granite_oasis_isle_mid":
            return palette | {
                ROCK: Surface((.289,.246,.248),.85,"granite"),
                DETAIL: Surface((.416,.334,.315),.79,"granite"),
                ROOF: Surface((.60,.32,.183),.87,"sandstone"),
            }
        return palette

    entries = (
        (Asset("nile_colonnade_ruin_mid","尼罗河岸古埃及柱廊神庙遗迹","双塔门、莲花柱、石像和火盆，临水面朝 +Z",
               (28,14,12),-1.06,(5000,8200),camera=(2.65,-10,3.27)),temple,"Riverside temple and lotus colonnade"),
        (Asset("nile_granite_oasis_isle_mid","阿斯旺花岗岩巨石绿洲岛与古石塔","棕榈、花岗岩和努比亚穹顶塔，临水面朝 +Z",
               (22,12,14),-1.08,(4000,6800),camera=(2.55,-10,3.15)),oasis,"Aswan granite oasis and Qubba"),
        (Asset("nile_royal_dahabiya_mid","尼罗河古典双桅帆船","双桅拉丁帆和木雕船舱，船首朝 +X",
               (16,9.5,3.8),-1.06,(3800,6200),"boat",camera=(2.7,-10,2.07)),dahabiya,"Royal dahabiya"),
    )
    generate("nile","Aswan Nile Sunset · Midground",entries,surfaces,(.35,.27,.21),"#e4c8a7",originals=6,seed=20261211)


if __name__=="__main__":
    main()
