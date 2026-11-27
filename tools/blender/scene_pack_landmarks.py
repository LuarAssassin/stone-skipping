"""Joined geometry used by the second wave of landmark packs."""
import math
import numpy as np

from scene_pack_factory import (
    BARK, CLOTH, COVER, EMIT, GLOW, METAL, ROCK, ROOF,
    TRIM, WEAVE, WOOD, TAU,
    beam, glass_lamp, mix, section, twig, v3,
)


def pier(model, rng, length, depth, level, lamp_z, boards=40, pile_depth=-1.2):
    """Planked deck with braced log piles, rivets and a small warm navigation lantern."""
    l,w=length/2,depth/2
    for x in (-l+.38,0,l-.38):
        for y in (-w+.23,w-.23):
            model.stack(x,y,[(pile_depth,.121),(pile_depth+.09,.14),(-.51,.126),(.18,.136),
                             (level,.132),(level+.14,.121)],15,BARK,shade=True)
            model.stack(x,y,[(level+.052,.138),(level+.082,.139)],12,METAL)
            offset=.62 if x<0 else -.62
            beam(model,(x,y,-.32),(x+offset,y,level-.12),.102,.101,WOOD)
        beam(model,(x,-w+.07,level-.23),(x,w-.07,level-.23),.147,.162,TRIM)
    for y in (-w+.033,-w*.49,0,w*.49,w-.033):
        beam(model,(-l,y,level-.144),(l,y,level-.144),.112,.124,WOOD)
    for i in range(boards):
        x=length*((i+.5)/boards-.5)
        z=level+.004*rng.uniform(-1,1)
        beam(model,(x,-w,z-.04),(x,w,z-.04),length/boards-.004,.078,WOOD if i%5 else TRIM)
        for y in (-w+.19,w-.19):
            model.stack(x,y,[(z-.001,.012),(z+.006,.012)],7,METAL)
    x,y=l-.28,-w+.24
    model.stack(x,y,[(level-.005,.080),(level+.11,.074),(lamp_z-.41,.056),(lamp_z-.27,.049)],
                12,TRIM,shade=True)
    glass_lamp(model,x,y,lamp_z-.211,.088,.238)
    model.stack(x,y,[(lamp_z-.061,.043),(lamp_z-.012,.029),(lamp_z,.012)],8,METAL)


def gabled_roof(model, span, depth, eaves, ridge, nu=28, nv=10, slot=ROOF, sweep=0.):
    """Two eaves, separate soffit and raised ridge. The pitch is eased near the eaves."""
    a,b=span/2,depth/2
    for side in (-1,1):
        def point(u,v,offset=0):
            x=span*(u-.5)
            uneven = sweep*(.23*v*v+.69*v**5*abs(2*u-1)**3)
            z=eaves+(ridge-eaves)*(1-v)**(1.33 if sweep else 1)+uneven+offset
            return v3((x,side*b*v,z))
        model.grid(lambda u,v:point(u,v),nu,nv,slot,uv=lambda u,v:(u,v),flip=side<0)
        model.grid(lambda u,v:point(u,v,-.122),nu//2,4,TRIM,flip=side>0)
        model.grid(lambda u,v:point(u,1.,-.122*v),nu,1,slot,flip=side>0)
        for u in (0,1):
            path=[point(u,v,-.035) for v in np.linspace(0,1,15)]
            section(model,path,[.113]*len(path),[.087]*len(path),slot)
        for k in range(1,7):
            v=k*.141
            path=[point(u,v,.016) for u in np.linspace(.006,.994,14)]
            twig(model,path,[.019 if sweep else .011]*len(path),5,slot)
    twig(model,[(-a,0,ridge+.03),(-a*.97,0,ridge+.068),(-a*.38,0,ridge+.043),(a*.38,0,ridge+.043),
                (a*.97,0,ridge+.068),(a,0,ridge+.023)],[.061]*6,8,slot)


def lit_arch(model, center, width, height, z_spring=.70, arch="round", front=-1, axis="x",
             frame=ROCK, panel=GLOW, mullions=True):
    """Solid sash with a shaped round, pointed or three-lobed head and a recessed emissive pane."""
    x,y,z=center
    half=width/2
    def point(u,v,d=0):
        if axis=="x":
            return (x+u,y+front*d,z+v)
        return (x+front*d,y+u,z+v)
    def upper(t):
        if arch=="point":
            return height*(z_spring+(1-z_spring)*(1-abs(t))**.63)
        lobe = .054*math.cos(3*math.pi*t) if arch=="trefoil" else 0
        return height*(z_spring+(1-z_spring)*max(0,1-t*t)**.60+lobe*max(0,1-abs(t)))
    fillet=.049*width
    model.grid(lambda t,v:point((t-.5)*width,.044*height+(upper(2*t-1)-.061*height)*v,.014),
               12,2,panel,group=EMIT,flip=(front>0 if axis=="x" else front<0))
    path=[point(-half,.019,.036)]+[point(t*half,upper(t),.036) for t in np.linspace(-1,1,21)]+[point(half,.019,.036)]
    twig(model,path,[fillet]*len(path),6,frame)
    beam(model,point(-half*1.10,.011,.068),point(half*1.10,.011,.068),fillet*3.2,fillet*1.88,frame)
    if mullions:
        twig(model,[point(0,.028,.043),point(0,upper(0)-.045,.043)],[fillet*.46]*2,5,frame)
        twig(model,[point(-half,.52*height,.044),point(half,.52*height,.044)],[fillet*.43]*2,5,frame)


def second_paddle(model,length,width,slot=TRIM):
    x = -.46*length
    y = width*.49
    twig(model,[(x,y,.33),(x+.64,y-.11,.29),(x+1.28,y-.22,.318)],
         [.017,.016,.013],8,slot)
    model.grid(lambda t,s:(x-.25+.43*t,y+.055-.06*t+(s-.5)*(.034+.079*math.sin(math.pi*t)),
                           .32+.017*math.sin(math.pi*t)),7,4,slot)


def sail_rig(model, height, length, want_lateen=False, slot=WEAVE):
    """A double-sided woven sail held by real mast, spars, shrouds and tiller."""
    h=height-.20
    mast_x=.22 if want_lateen else -.24
    twig(model,[(mast_x,0,.102),(mast_x-.037,0,h*.61),(mast_x-.16,0,h)],
         [.061,.051,.034],12,WOOD)
    if want_lateen:
        vertices=((-.38,-.046,h-.029),(length*.440,-.057,.64),(length*-.415,-.059,1.295))
        high,fore,aft=map(v3,vertices)
        twig(model,[fore,mix(fore,high,.68),high+(-.142,0,.165)],[.042,.037,.023],10,TRIM)
    else:
        high=v3((mast_x-.143,-.037,h-.173))
        fore=v3((mast_x+.044,-.035,.92))
        aft=v3((length*-.387,-.089,1.06))
        twig(model,[fore,aft],[.032,.024],10,TRIM)
    def sail(t,u):
        top=mix(high,aft,.035+.965*t)
        point=mix(top,fore,u*.93)
        form=math.sin(math.pi*t)*math.sin(math.pi*u)
        return point+(0,-(.21 if want_lateen else .14)*form, .046*form)
    model.grid(sail,20,18,slot,group=CLOTH,uv=lambda t,u:(u,t),flip=True)
    for u in (0.,.95):
        twig(model,[sail(t,u) for t in np.linspace(0,1,16)],[.008]*16,5,TRIM)
    for x,y in ((length*.45,.039),(-length*.29,-.49),(-length*.29,.49)):
        twig(model,[(x,y,.24),mix((x,y,.24),high,.52)+(0,0,-.025),high],
             [.012,.009,.009],5,METAL)
    twig(model,[(-length*.48,0,-.21),(-length*.501,0,.52),(-length*.34,.08,.53)],
         [.029,.031,.018],8,WOOD)


def radial_mountain(model,rng,style):
    """Surveyed cone vs leaning pyramidal horn; the horizontal backdrop is along X."""
    phases=rng.uniform(0,TAU,9)
    sides,rings=(104,19) if style=="fuji" else (88,21)
    rows,tex=[],[]
    for j in range(rings+1):
        t=j/rings
        row,uv=[],[]
        for i in range(sides):
            a=TAU*i/sides
            c,s=math.cos(a),math.sin(a)
            if style=="fuji":
                radius=(.125+.875*t**1.96)*(1+.033*math.sin(a*8+phases[0])+.019*math.sin(a*21+phases[1]))
                z=1-t+.028*math.sin(a*3+phases[2])*(1-t)**8
                wash=math.cos(13*a+.15*math.sin(6*a)+phases[3])
                z+=.046*wash*math.sin(math.pi*t)**1.24
                x,y=radius*c,radius*s
                snow=z*.93+.079*wash-.025*math.cos(5*a)
            else:
                radius=.012+.988*t**1.3
                ridge=1/(abs(c)**1.20+abs(s)**1.20)**(1/1.20)
                radius*=ridge*(1+.175*math.sin(a*3+phases[0])+.063*math.sin(a*12+phases[1]))
                z=1-t+.069*math.sin(a*7+phases[2])*math.sin(t*math.pi)
                x,y=radius*c-.20*(1-t)**2,radius*s+.093*(1-t)
                snow=z*.65+.18*math.cos(4*a+.1)+.030*math.sin(12*a+2*t)
            row.append(model.vertex((x,y,z)))
            uv.append((i/sides,float(np.clip(snow,.036,.97))))
        rows.append(row)
        tex.append(uv)
    for j in range(rings):
        for i in range(sides):
            k=(i+1)%sides
            verts=(rows[j][i],rows[j+1][i],rows[j+1][k],rows[j][k])
            corners=[tex[j][i],tex[j+1][i],tex[j+1][k],tex[j][k]]
            if k==0:
                corners[2:]=[(1,uv[1]) for uv in corners[2:]]
            model.face(verts,corners,COVER,shade=style=="fuji" or i%9!=4)
    # Fuji's summit rim turns into a recessed crater bowl; the horn has only
    # a tiny ragged summit. Both use the same upper, snow-exposed atlas band.
    center=model.vertex((0 if style=="fuji" else -.2,0 if style=="fuji" else .093,.939 if style=="fuji" else 1.001))
    rim=[(.5+.42*math.cos(TAU*i/sides),.86+.087*math.sin(TAU*i/sides)) for i in range(sides)]
    for i in range(sides):
        k=(i+1)%sides
        model.face((center,rows[0][i],rows[0][k]),((.5,.86),rim[i],rim[k]),COVER,shade=True)
    uv=[(.5+.45*math.cos(TAU*i/sides),.5+.45*math.sin(TAU*i/sides)) for i in range(sides)]
    model.face(rows[-1][::-1],uv[::-1],ROCK,shade=False)
