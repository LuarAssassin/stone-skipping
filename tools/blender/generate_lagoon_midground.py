"""Build Polynesian bungalows, an open coral arch and a twin-hull canoe."""

from pathlib import Path
import math
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate_alps_midground import (
    Asset, Surface, factory, np, room, roof, gable, lamp, rails, palm, rock_cluster,
    hull, sail, generate, DETAIL, COVER, WOOD, TRIM, BARK, WEAVE, METAL, ROCK, ROOF, SNOW,
    LEAF, LEAF2, PANEL, BLOOM, beam, rock,
)


def bungalow(m, x, y, width, depth, height, rise, floor):
    """A split bamboo frontage finished with a thick thatched eave."""
    room(m,x,y,floor,width,depth,height,PANEL,WOOD,
         ((.48,1.77,((-width*.255,1.18),(width*.255,1.18))),),shutters=True,rear=False)
    gable(m,x,y,floor+height,width,depth,rise*.8,PANEL)
    roof(m,x,y,floor+height+.068,width+1.46,depth+1.69,rise,ROOF,nx=6,courses=3,
         ridge_slot=WEAVE,warp=.22,tile_relief=(.013,.042))
    m.box((x,y-.52,floor-.128),(width+1.08,depth+1.46,.32),WOOD)
    for i, dx in enumerate((-width*.445,0,width*.445)):
        for j, dy in enumerate((-depth*.49,depth*.455)):
            m.tube([(x+dx-.091,y+dy+(j-1)*.11,-1.064+.013*i+.017*j),
                    (x+dx,y+dy,floor+.049*(i%2))],(.194,.16),8,WOOD,phase=.12*(j+i))
        beam(m,(x+dx,y-depth*.50-.13,.26),(x+dx+.071,y+depth*.47+.22,.23),.19,.27,TRIM)
        if i!=1:
            beam(m,(x+dx,y-depth*.48,-.48),(x+dx+.032,y+.11,.42),.127,.158,WOOD)
    for u in (-.41,0,.41):
        xx = x+u*width
        m.tube([(xx,y-depth/2-.44,floor-.013),(xx+.010,y-depth/2-.45,floor+height+.090)],
               (.102,.084),8,TRIM,phase=.11*u)
    for u in (-.36,):
        light_x = x+u*width
        lamp(m,light_x,y-depth/2-.78,floor+1.72,.79,mount=False)
        m.tube([(light_x,y-depth/2-.44,floor+height*.96),
                (light_x-.015,y-depth/2-.83,floor+height*.94),
                (light_x-.024,y-depth/2-.80,floor+1.85)],(.051,.041,.028),8,WEAVE)
    # Fascia lath and exposed ends give the thatch a loose woven silhouette.
    for side in (-1,1):
        for j in range(8):
            u = j/7-.5
            z = floor+height+.058-.09*(j%3)
            xx = x+side*(width/2+.63)
            yy = y+u*(depth+1.58)
            m.tube([(xx-side*.27,yy,z+.24),(xx+side*(.13+.022*(j%4)),yy+.066,z-.10)],
                   (.064,.029),5,ROOF,phase=.23*j)


def walkway(m, rng):
    """Curved plank deck from landing to landing, resting on wood stilt bents."""
    for side,x,y,w,d,h,rise in ((-1,-8.05,1.23,7.26,6.12,3.30,2.58),
                               (1,8.11,.67,7.12,6.17,3.64,2.86)):
        bungalow(m,x,y,w,d,h,rise,.733+.012*side)
        rock_cluster(m,rng,x+side*3.83,y+.38,-1.03,.65,4.71,6.08,ROCK,style="coral",cap=DETAIL,stones=1)

    level = .68
    def basis(x):
        y = -2.19-2.53*(1-(x/12.6)**2)+.15*math.sin(x*.3)
        a = math.atan(5.06*x/12.6**2+.045*math.cos(x*.3))
        return y, a
    def pos(x, width):
        y,a = basis(x)
        return x-math.sin(a)*width,y+math.cos(a)*width

    spine = [(*pos(x,0),.458) for x in np.linspace(-12.62,12.62,14)]
    factory.section(m,spine,[2.05]*len(spine),[.29]*len(spine),WOOD,bevel=.085)
    for i,x in enumerate(np.linspace(-12.48,12.48,46)):
        y,a = basis(x)
        # Small offsets between planks preserve the cut edges above the continuous sill.
        m.box((x,y,level-.113+.009*math.sin(i*1.3)),(.518,2.21+.016*(i%5),.238),
              TRIM if i%5 else WOOD,angle=a)
    for j,x in enumerate(np.linspace(-12.22,12.22,8)):
        y,a = basis(x)
        m.box((x,y,.337+j*.007),(2.44,.193,.241),WOOD,angle=a+math.pi/2)
    for side in (-1,1):
        for j,x in enumerate(np.linspace(-12.22,12.22,8)):
            px,py = pos(x,side*.91)
            m.tube([(px+.055,py+side*.117,-1.031+.014*(j%5)),(px,py,.61)],(.177,.136),8,WOOD,
                   phase=.23*j)
        rail_x = np.linspace(-12.18,12.18,11)
        if side>0:
            for a,b in ((0,1),(3,7),(9,10)):
                rails(m,[pos(x,1.04) for x in rail_x[a:b+1]],level,.70,TRIM,rope=True)
        else:
            rails(m,[pos(x,-1.04) for x in rail_x],level,.70,TRIM,rope=True)
    for x in (0,6.5):
        u,v = pos(x,-.87)
        lamp(m,u,v,1.47,.77,metal=WOOD)
    u,v = pos(0,-.87)
    return (u,v,1.47)


def sea_arch(m, rng):
    """One continuous eroded limestone ring over water with no tunnel cap."""
    rows = []
    samples, sides = 25, 18
    for i,theta in enumerate(np.linspace(math.pi+.14,-.14,samples+1)):
        c,s = math.cos(theta), math.sin(theta)
        x, z = 8.04*c, .30+7.28*s+.36*s*math.sin(4*theta+.23)
        outward = np.array((7.28*c,0,8.04*s))/math.hypot(7.28*c,8.04*s)
        row = []
        for k in range(sides):
            a = math.tau*(k/sides)
            t = i/samples
            erosion = 1+.13*math.sin(5*a+9*t)+.10*math.cos(7*a-11*t)+.037*math.sin(31*t+a)
            lip = erosion*(1.99+.71*abs(c)**2+.33*math.cos(3*theta+.31))
            depth = erosion*(2.89+.74*abs(c)+.29*math.sin(4*theta))
            p = np.array((x,.66+.48*math.sin(5*t)+.22*math.sin(9*t),z)) + outward*lip*math.cos(a)
            # The XY cross section has stepped sedimentary ribs and widens at the foot.
            p[1] += math.sin(a)*depth
            p[2] += .045*math.cos(a+31*t)
            row.append(m.vertex(p))
        rows.append(row)
    for j,(a,b) in enumerate(zip(rows,rows[1:])):
        for k in range(sides):
            n = (k+1)%sides
            u,v = j/samples,(j+1)/samples
            m.face((a[k],b[k],b[n],a[n]),((u,k/sides),(v,k/sides),
                   (v,(k+1)/sides),(u,(k+1)/sides)),
                   ROCK,shade=False)
    cap = [(.5+.45*math.cos(math.tau*k/sides),.5+.45*math.sin(math.tau*k/sides)) for k in range(sides)]
    m.face(rows[0],cap,ROCK,shade=False)
    m.face(rows[-1][::-1],cap[::-1],ROCK,shade=False)

    rock_cluster(m,rng,-8.17,1.03,-1.05,1.34,7.75,10.63,ROCK,style="coral",cap=SNOW,stones=5)
    rock_cluster(m,rng,8.46,1.02,-1.04,1.55,7.22,9.26,ROCK,style="coral",cap=SNOW,stones=5)
    rock(m,(9.45,-2.31,-.13),(6.09,7.78,1.23),5,13,rng,SNOW,"coral")
    rock(m,(-8.33,-2.71,-.24),(5.22,6.37,1.28),5,11,rng,SNOW,"coral")
    for x,y,z,h,spread,lean in ((-2.73,.95,8.27,3.78,2.64,-1.35),
                                (2.17,1.35,8.72,3.23,2.77,1.30),
                                (6.93,2.24,4.76,5.11,2.58,1.54)):
        palm(m,rng,x,y,z,h,spread,lean,coconut=True)


def lash(m, x, y, z, radius):
    path = [(x+.146*math.sin(a),y+t*.14,z+radius*math.cos(a))
            for t,a in ((t,t*math.tau*2.04) for t in np.linspace(-.6,.6,13))]
    m.tube(path,[.035]*len(path),6,WEAVE)


def catamaran(m, _rng):
    for side in (-1,1):
        hull(m,12.5-(.18 if side>0 else 0),1.56,y=side*1.78,body=WOOD,boot=BLOOM,
             rail_slot=TRIM,stations=17,draft=1.05-(.021 if side>0 else 0),sheer=.53+side*.023)
        for end in (-1,1):
            x = end*5.99
            m.tube([(x*.86,side*1.78,.57 if end<0 else .64),(x*.98,side*1.781,1.04),
                    (x*1.03,side*1.77,1.30)],
                   (.12,.11,.035),8,TRIM)
    for i,x in enumerate((-3.26,-1.99,.04,1.93,3.19)):
        level = .60+i*.016
        m.beam((x,-2.20,level),(x,2.20,level),.24,.22,TRIM)
        for side in (-1,1):
            lash(m,x,side*1.79,level,.132)
    for i,x in enumerate(np.linspace(-3.11,3.11,27)):
        m.box((x,.015*math.sin(i),.812+.008*math.sin(i)),
              (.215,2.69+.021*(i%4),.143),WEAVE if i%3 else TRIM)
    for side in (-1,1):
        rails(m,[(x,side*1.28) for x in (-2.9,-2.05,-1.21)],.86,.49,TRIM,rope=True)
        for x in (-2.75,-.86):
            m.tube([(x,side*.76,.84),(x+.11,side*.68,1.98)],(.074,.058),7,WOOD)
    roof(m,-1.78,0,1.99,2.91,2.1,.46,ROOF,nx=5,courses=2,ridge_slot=WEAVE)
    mast = [(.54,0,.87),(.28,.05,3.81),(-.04,.15,6.76)]
    m.tube(mast,(.174,.119,.073),10,TRIM)
    # Two curved spars flare from the tack and define the crab-claw head.
    tack = np.array((2.83,-.119,1.64))
    left = np.array((-3.51,.09,6.65))
    right = np.array((.19,-.004,7.59))
    levels = np.linspace(.013,1,14)
    def spar(t,end,bend):
        p = (1-t)*tack+t*end
        p[0] += bend*math.sin(math.pi*t)
        p[2] += .25*math.sin(math.pi*t)
        return p
    strips = [(spar(t,left,-.61),spar(t,right,.63)) for t in levels]
    # A deep curved head between the two separate tips gives the sail its claw shape.
    for j in range(2):
        path = [pair[j] for pair in strips]
        m.tube(path,np.linspace(.067,.032,len(path)),7,WOOD)
    # Sink the middle of the broad head with an extra luff-to-leech section.
    a,b = strips[-1]
    middle = (a+b)/2+(0,.20,-1.54)
    for j in range(2):
        panel = []
        for idx,(p,q) in enumerate(strips):
            t = idx/(len(strips)-1)
            center = (p+q)/2+np.array((0,.20*t,-1.54*t**2.1))
            panel.append((p,center) if j==0 else (center,q))
        sail(m,panel,lambda _r,c: BLOOM if c in (2,3) else SNOW,
             panels=7,belly=.25+.025*j,thickness=.063)
        start = a if j==0 else middle
        end = middle if j==0 else b
        m.tube([start,(start+end)/2+(0,.06,-.185),end],(.029,.027,.028),6,TRIM)
    for side in (-1,1):
        beam(m,(-1.07,side*1.72,.72),(.09,side*.09,5.90),.041,.045,WEAVE)
    lamp(m,-2.76,-1.07,1.44,.81)
    return (-2.76,-1.07,1.44)


def main():
    palette = factory.basic_palette() | {
        WOOD: Surface((.36,.234,.151),.73,"carved"),
        TRIM: Surface((.63,.451,.255),.79,"wood"),
        BARK: Surface((.377,.295,.209),.84,"palm_trunk"),
        ROCK: Surface((.542,.519,.455),.84,"coral"),
        DETAIL: Surface((.679,.649,.524),.86,"coral"),
        ROOF: Surface((.65,.438,.223),.88,"thatch"),
        WEAVE: Surface((.59,.376,.193),.84,"weave"),
        PANEL: Surface((.604,.435,.248),.83,"thatch"),
        LEAF: Surface((.206,.410,.251),.72,"broad",(.413,.529,.284)),
        LEAF2: Surface((.342,.513,.282),.75,"broad",(.474,.599,.343)),
        SNOW: Surface((.909,.849,.644),.81,"canvas"),
        BLOOM: Surface((.722,.260,.196),.83,"weave"),
    }
    def surfaces(asset):
        if asset.name=="lagoon_coral_arch_isle_mid":
            return palette | {SNOW:Surface((.925,.866,.729),.96,"dune")}
        return palette

    entries = (
        (Asset("lagoon_bungalow_walkway_mid","南太平洋连廊水上茅草屋群","茅草木屋、曲线栈桥和水桩，临水面朝 +Z",
               (28,7.5,11),-1.06,(4800,8000),camera=(2.65,-10,4.04)),walkway,"Overwater bungalows and boardwalk"),
        (Asset("lagoon_coral_arch_isle_mid","珊瑚石灰岩海蚀拱门与椰林礁岛","海蚀通洞、白沙和椰树，临水面朝 +Z",
               (24,13.5,12),-1.05,(4200,7200),camera=(2.49,-10,3.18)),sea_arch,"Coral sea arch and coconut palms"),
        (Asset("lagoon_catamaran_mid","玻里尼西亚双体帆船","双船身、捆扎梁和蟹钳帆，船首朝 +X",
               (12.5,8.8,5.2),-1.05,(3400,5800),"boat",camera=(2.69,-10,2.55)),catamaran,"Polynesian twin-hull voyaging canoe"),
    )
    generate("lagoon","South Pacific Lagoon · Midground",entries,surfaces,(.105,.335,.335),"#bfdedb",
             originals=7,seed=20261223)


if __name__=="__main__":
    main()
