"""Build the Lofoten skerry lighthouse, rorbu boardwalk and trawler."""

from pathlib import Path
import math
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate_alps_midground import (
    Asset, Surface, factory, np, room, roof, gable, lamp, rails, rock_cluster,
    hull, boat_rails, generate, DETAIL, COVER, WOOD, TRIM, WEAVE, METAL, ROCK,
    ROOF, SNOW, PANEL, BLOOM, GLOW, EMIT, beam, rock,
)


def lighthouse(m, rng):
    rock_cluster(m,rng,0,.36,-1.06,3.86,17.31,11.15,ROCK,style="basalt",cap=SNOW,stones=11)
    rock(m,(1.22,1.24,2.89),(8.59,7.63,2.79),5,13,rng,ROCK,"basalt",cap=SNOW)
    for i in range(6):
        z = .41+.42*i
        m.box((1.26+i*.036,-4.43+i*.57,z-.14),(2.34-.09*i,1.21,.49),DETAIL)
    x,y = 1.01,.95
    rings = [(3.27,2.12),(3.78,2.12),(3.95,1.88),
             (5.81,1.71),(7.23,1.58),(9.26,1.42),(10.86,1.29),
             (11.42,1.25),(11.56,1.53),(11.78,1.77)]
    for a,b,slot in ((0,2,DETAIL),(2,3,SNOW),(3,4,BLOOM),(4,5,SNOW),
                     (5,6,BLOOM),(6,7,SNOW),(7,9,METAL)):
        m.stack(x,y,rings[a:b+1],16,slot,phase=math.pi/16)
    beacon_z = 12.66
    # The amber panes sit inside the eight structural mullions.
    m.stack(x,y,[(11.77,1.14),(11.95,1.09),(13.36,1.09),(13.53,1.13)],8,
            GLOW,group=EMIT,phase=math.pi/8)
    for j in range(8):
        a = math.pi/8+j*math.tau/8
        u,v = x+1.31*math.cos(a),y+1.31*math.sin(a)
        m.stack(u,v,[(11.74,.176),(11.91,.145),(13.41,.124),(13.55,.175)],
                8,METAL,phase=a)
    m.stack(x,y,[(11.78,1.41),(11.945,1.395)],16,METAL,phase=math.pi/16)
    m.stack(x,y,[(13.37,1.377),(13.547,1.44)],16,METAL,phase=math.pi/16)
    for j in range(12):
        a = j*math.tau/12
        c,s = math.cos(a),math.sin(a)
        xx,yy = x+1.61*c,y+1.61*s
        m.stack(xx,yy,[(11.75,.057),(12.33,.04)],6,METAL,phase=j*.12)
        b = (j+1)*math.tau/12
        dx,dy = x+1.61*math.cos(b)-xx,y+1.61*math.sin(b)-yy
        m.tube([(xx+.047*dx,yy+.047*dy,12.29),(xx+.953*dx,yy+.953*dy,12.29)],
               (.037,.037),6,METAL)
    m.stack(x,y,[(13.54,1.52),(13.63,1.59),(13.85,1.44),(14.18,1.00),
                 (14.40,.54),(14.49,.17)],12,BLOOM,phase=.13)
    m.tube([(x,y,14.44),(x-.027,y+.03,14.61),(x-.054,y+.063,14.88)],
           (.083,.067,.025),8,METAL)

    sx,sy,sz = -4.09,.54,3.63
    m.box((sx,sy,sz-.61),(4.52,3.91,1.34),DETAIL)
    room(m,sx,sy,sz,3.92,3.20,2.22,BLOOM,TRIM,((.53,1.64,((.73,.91),)),),rear=False)
    gable(m,sx,sy,sz+2.22,3.92,3.2,1.29,BLOOM)
    roof(m,sx,sy,sz+2.24,4.66,3.97,1.59,SNOW,nx=7,courses=3,ridge_slot=ROOF)
    m.box((sx-.91,sy-.22,sz+2.49),(.52,.60,1.51),ROCK,angle=.027)
    lamp(m,sx+.94,sy-1.91,sz+1.49,.67)
    return (x,y-1.30,beacon_z)


def piles(m, x, y, fx, fy, index, *, height=.64):
    shift = .021*(index%5)
    m.tube([(x+fx,y+fy,-1.064+shift),(x,y,height+shift)],(.197,.171),8,
           WOOD,phase=.17*index)


def rorbu(m, x, y, w, d, height, rise):
    lower = .78
    room(m,x,y,lower,w,d,height,BLOOM,TRIM,((.54,1.89,((-w*.256,.86),(w*.27,1.04))),),
         shutters=False,rear=False)
    gable(m,x,y,lower+height,w,d,rise*.86,BLOOM)
    roof(m,x,y,lower+height+.034,w+.77,d+.75,rise,SNOW,nx=6,courses=3,ridge_slot=ROOF)
    for side in (-1,1):
        m.box((x+side*(w*.5-.093),y-d/2-.045,lower+height*.49),
              (.17,.273,height+.057),TRIM)
    m.box((x,y-d*.49-.073,lower+.11),(w+.14,.23,.247),WOOD)
    for j in range(5):
        u = x+w*(j/4-.5)*.92
        m.box((u,y-d*.5-.13,lower+height*.758+j*.015),(.065,.201,height*.32),
              BLOOM)
    m.box((x+w*.23,y+.68,lower+height+rise*.49),(.53,.58,1.57),ROOF,angle=.016)


def drying_rack(m, x, y, z):
    for i in range(3):
        u = x+i*2.23
        for side in (-1,1):
            beam(m,(u,y+side*1.33,z-.09),(u+.081,y,z+3.13),.168,.182,TRIM)
        m.beam((u,y-1.56,z+.71+i*.019),(u,y+1.57,z+.71+i*.019),.13,.17,WOOD)
    m.beam((x-.31,y,z+3.09),(x+4.77,y,z+3.09),.139,.159,TRIM)
    for side in (-1,1):
        for j in range(2):
            v,h = y+side*(.44+.38*j),z+2.30-.73*j
            m.beam((x-.17,v,h),(x+4.64,v,h),.105,.103,WOOD)
            for k in range(7):
                u = x+.37+.531*k+.037*j
                m.tube([(u,v+.019*(k%2),h-.68),(u,v,h-.35),(u+.05,v+.017,h-.051)],
                       (.035,.086,.037),5,DETAIL,phase=.21*(k+j))


def village(m, rng):
    quay_bottom, deck = -1.06,.68
    rock_cluster(m,rng,-10.0,2.1,quay_bottom,1.02,5.55,6.15,ROCK,style="basalt",cap=SNOW,stones=3)
    rock_cluster(m,rng,10.64,-.76,-1.02,.71,4.6,4.38,ROCK,style="basalt",cap=SNOW,stones=3)
    for i in range(52):
        x = -12.51+(i+.5)*.478
        m.box((x,-2.67+.015*math.sin(i),deck-.107+.011*math.sin(i*3)),
              (.448,2.51+.020*(i%5),.23),WOOD if i%7 else SNOW)
    for side in (-1,1):
        y = -2.67+side*1.06
        m.beam((-12.31,y,.399),(12.42,y,.399),.26,.27,TRIM)
        for j,x in enumerate(np.linspace(-12.18,12.20,12)):
            piles(m,x,y,.04*math.sin(j),side*.115,j,height=.91)
    for i,(x,y,w,d,ht,rise) in enumerate(((-8.41,1.18,5.45,5.93,4.11,2.48),
                                           (-2.09,1.64,5.27,5.15,3.68,2.08),
                                           (4.26,1.46,5.46,5.45,4.83,2.98))):
        m.box((x,y,.643),(w+.38,d+.47,.33),WOOD)
        m.box((x,-1.55,.625),(w*.73,1.74,.254),TRIM)
        for j in (-1,1):
            for k in (-1,1):
                piles(m,x+j*w*.42,y+k*d*.43,j*.11,k*.11,i+2*k+3,height=.78)
        rorbu(m,x,y,w,d,ht,rise)
        lamp(m,x+w*.31,-2.05,1.14,.73)
    drying_rack(m,7.4,1.80,.64)
    m.box((9.61,1.82,.47),(5.19,3.53,.394),TRIM)
    m.box((9.63,-.05,.59),(3.14,1.05,.306),WOOD)
    for j,x in enumerate((7.47,9.78,11.98)):
        for side in (-1,1):
            piles(m,x,1.82+side*1.31,.071,side*.10,j,height=.57)
    return (4.26+5.46*.31,-2.05,1.14)


def trawler(m, _rng):
    hull(m,13.5,3.88,body=PANEL,boot=BLOOM,rail_slot=TRIM,stations=25,rounded=True,sheer=.62)
    m.box((-2.03,.04,.697),(4.53,2.92,.21),WOOD)
    room(m,-1.64,.04,.72,3.74,2.63,2.03,SNOW,METAL,
         ((.86,1.79,((-1.079,.78),(0,.88),(1.064,.82))),))
    m.box((-1.64,.04,2.731),(4.04,2.89,.242),BLOOM)
    roof(m,-1.61,.04,2.91,4.06,3.04,.24,SNOW,nx=5,courses=2,ridge_slot=METAL)
    m.tube([(-2.97,.62,2.79),(-2.99,.62,3.09),(-3.10,.625,3.67)],
           (.198,.193,.162),10,METAL)
    m.tube([(-3.08,.624,3.52),(-3.12,.625,3.67)],(.197,.204),10,BLOOM)
    for side in (-1,1):
        beam(m,(1.67+.045*side,side*1.30,.62),(1.23+.041*side,0,5.04+.049*side),.224,.257,TRIM)
        beam(m,(3.62,side*1.08,.67),(1.26,side*.068,4.79),.068,.069,WEAVE)
        beam(m,(-3.65,side*.91,.68),(1.16,side*.13,4.93),.057,.062,WEAVE)
    m.beam((1.42,-.94,3.26),(1.42,.96,3.26),.15,.156,TRIM)
    m.tube([(1.27,-.012,4.61),(1.205,-.026,5.21),(1.142,-.051,5.38)],(.126,.068,.028),8,METAL)
    beam(m,(1.30,.02,4.55),(4.30,.25,2.56),.134,.158,WOOD)
    m.tube([(4.281,.25,2.52),(4.29,.253,1.31)],(.030,.026),6,WEAVE)
    for i in range(4):
        x = 2.23+i*.48
        m.box((x,-.48+i*.031,.86),(.35,.68,.44),DETAIL,angle=i*.101)
    boat_rails(m,13.5,3.91,TRIM)
    for x,y,z,scale in ((4.90,-.32,1.29,.77),(1.42,-.91,3.09,.64),(-4.76,-.63,1.25,.67)):
        lamp(m,x,y,z,scale)
    return (1.42,-.91,3.09)


def main():
    palette = factory.basic_palette() | {
        ROCK: Surface((.225,.248,.274),.86,"basalt"),
        DETAIL: Surface((.424,.438,.456),.80,"slate"),
        WOOD: Surface((.252,.203,.172),.86,"wood"),
        TRIM: Surface((.67,.577,.458),.78,"wood"),
        SNOW: Surface((.87,.897,.921),.85,"snow"),
        ROOF: Surface((.25,.298,.328),.80,"slate"),
        BLOOM: Surface((.65,.107,.112),.67,"lacquer"),
        PANEL: Surface((.117,.205,.278),.64,"wood"),
        METAL: Surface((.219,.25,.278),.49,"seams"),
    }
    entries = (
        (Asset("nordic_lighthouse_skerry_mid","罗弗敦红白条纹峡湾灯塔礁岛","条纹灯塔、积雪玄武岩和守塔人木屋，临水面朝 +Z",
               (18,15.5,12),-1.06,(4000,6800),camera=(2.75,-10,3.35)),lighthouse,"Lofoten lighthouse skerry"),
        (Asset("nordic_rorbu_village_mid","极夜木栈道红木渔村与晒鱼架","红色渔屋、桩架木栈道与晒鱼架，临水面朝 +Z",
               (26,9.8,11),-1.06,(4800,8000),camera=(2.8,-10,3.06)),village,"Rorbu cabins and hjell"),
        (Asset("nordic_trawler_mid","北欧峡湾木壳渔船","木壳拖网渔船和带工作灯的桅架，船首朝 +X",
               (13.5,6.4,4),-1.06,(3600,6000),"boat",camera=(2.75,-10,2.32)),trawler,"Arctic fjord trawler"),
    )
    generate("nordic","Lofoten · Midground",entries,palette,(.12,.19,.235),"#aebfd1",originals=7,seed=20261219)


if __name__=="__main__":
    main()
