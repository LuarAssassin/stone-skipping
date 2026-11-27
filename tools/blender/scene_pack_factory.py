"""Shared offline geometry, atlas, glTF verification and Cycles for the scene packs."""

import argparse
from dataclasses import dataclass
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
TAU = math.tau

if "--compose-pack" not in sys.argv:
    import bpy
    import numpy as np
    from mathutils import Vector

    sys.dont_write_bytecode = True
    from generate_jiangnan_scene import (
        Glb, Model, catalog_lock, diffuse_noise, fresh_scene, material,
        mix, packed_image, polar, preview_image, require, select_only, smooth, v3, write_json,
    )

WOOD, TRIM, BARK, WEAVE, METAL, GLOW, ROCK, COVER, ROOF, SNOW, NEEDLE, LEAF, LEAF2, BLOOM, PANEL, DETAIL = range(16)
OPAQUE, EMIT, MASK, CLOTH = range(4)


@dataclass(frozen=True)
class Asset:
    name: str
    title: str
    use: str
    bbox: tuple
    base: float
    triangles: tuple
    kind: str = "large"
    origin: str = "waterline"
    camera: tuple = (4., -9., 4.)
    x_start: bool = False
    anchor_xy: tuple | None = None

    @property
    def size(self):
        return 1024 if self.kind != "small" else 512

    @property
    def byte_limit(self):
        return {"large": 1_500_000, "boat": 800_000, "tree": 800_000, "small": 250_000}[self.kind]


@dataclass(frozen=True)
class Surface:
    rgb: tuple
    roughness: float
    pattern: str
    accent: tuple | None = None


def section(model, path, widths, heights, slot, bevel=.16, shade=False, group=OPAQUE):
    """A shaped, bevelled structural section, straight or swept through a series of centres."""
    path = np.array(path,dtype=float)
    perimeter = ((-1+bevel,-1),(1-bevel,-1),(1,-1+bevel),(1,1-bevel),
                 (1-bevel,1),(-1+bevel,1),(-1,1-bevel),(-1,-1+bevel))
    rings = []
    for i,p in enumerate(path):
        axis = Vector(path[min(i+1,len(path)-1)]-path[max(i-1,0)]).normalized()
        ref = Vector((0,0,1)) if abs(axis.z)<.94 else Vector((0,1,0))
        a = v3(ref.cross(axis).normalized())
        b = v3(axis.cross(Vector(a)))
        rings.append([model.vertex(p+a*t*widths[i]/2+b*s*heights[i]/2) for t,s in perimeter])
    for i in range(len(rings)-1):
        tail,head = rings[i:i+2]
        for j in range(8):
            k = (j+1)%8
            v,w = i/(len(rings)-1),(i+1)/(len(rings)-1)
            # Longitudinal wood grain runs along the sweep.
            model.face((tail[j],tail[k],head[k],head[j]),((0,v),(1,v),(1,w),(0,w)),slot,group,shade)
    cap = [(.5+t*.48,.5+s*.48) for t,s in perimeter]
    model.face(rings[0][::-1],cap[::-1],slot,group,False)
    model.face(rings[-1],cap,slot,group,False)


def beam(model, a, b, width, height, slot=WOOD, bevel=.12, group=OPAQUE):
    section(model,[a,b],[width,width],[height,height],slot,bevel=bevel,group=group)


def cuboid(model, center, dim, slot, group=OPAQUE):
    if group == OPAQUE:
        model.box(center,dim,slot)
        return
    center = v3(center)
    beam(model,center+(-dim[0]/2,0,0),center+(dim[0]/2,0,0),dim[1],dim[2],slot,.06,group)


def cylinder(model, a, b, radius, sides=10, slot=WOOD):
    model.tube([a,b],[radius,radius],sides,slot)


def twig(model, path, radii, sides=7, slot=BARK):
    model.tube(path,radii,sides,slot)


def seed_phase(rng, count=6):
    return rng.uniform(0,TAU,count)


def rock(model, center, span, rings, sides, rng, slot=ROCK, style="granite", cap=None):
    """Closed sculpted ring mesh with a continuous, height-aware geology UV."""
    c = v3(center)
    a,b,h = v3(span)*.5
    phase = seed_phase(rng)
    rows,uvs = [],[]
    column = style=="column"
    basalt = style=="basalt" or column
    angular = .153 if basalt else {"granite":.115,"coral":.19,"ice":.13,"snow":.10}.get(style,.12)
    for j in range(rings+1):
        t = j/rings
        z = c[2]+h*(2*t-1)
        if style == "ice":
            width = .73+.27*math.sin(math.pi*t)**.42
        elif basalt:
            width = .42+.49*math.sin(math.pi*t)**.50 + .09*t
        else:
            width = .13+.87*math.sin(math.pi*t)**.56
        row,tex = [],[]
        for i in range(sides):
            theta = TAU*i/sides
            ridge = (.65*math.sin(3*theta+phase[0])+.34*math.sin(5*theta+phase[1])
                     +.31*math.sin(7*theta+phase[2])+.26*math.cos(8*t+theta*6+phase[3]))
            r = width*(1+angular*ridge)
            shift = .12*(t-.38)**2*a if basalt else .08*math.sin(t*4)*a
            site = (c[0]+a*r*math.cos(theta)+shift, c[1]+b*r*math.sin(theta),
                    z+h*.076*math.sin(theta*4+phase[4]+t*3)*math.sin(math.pi*t))
            row.append(model.vertex(site))
            above = max(.045,c[2]+h)
            below = max(.045,h-c[2])
            mapped_v = .44+site[2]*(.50/above if site[2]>0 else .39/below)
            tex.append((i/sides,float(np.clip(mapped_v,.018,.982))))
        rows.append(row)
        uvs.append(tex)
    for j in range(rings):
        for i in range(sides):
            k = (i+1)%sides
            a0,b0 = uvs[j][i],uvs[j][k]
            a1,b1 = uvs[j+1][i],uvs[j+1][k]
            if k==0:
                b0,b1 = (1,b0[1]),(1,b1[1])
            coating = cap is not None and not column and (j+.61+.38*math.sin(TAU*i/sides*3+phase[5]))/rings > .80
            shade = style in ("granite","coral","snow") or (column and i%7!=3)
            model.face((rows[j][i],rows[j][k],rows[j+1][k],rows[j+1][i]),(a0,b0,b1,a1),
                       cap if coating else slot,shade=shade)
    cap_uv = [(.5+.47*math.cos(TAU*i/sides),.5+.47*math.sin(TAU*i/sides)) for i in range(sides)]
    model.face(rows[0][::-1],cap_uv[::-1],slot,shade=False)
    # A deposit material's v coordinate represents height, including on
    # its upper cap. A full circular UV here would expose a dark oval.
    top_uv = [(u,.87+.24*(v-.5)) for u,v in cap_uv] if slot==COVER and cap is None else cap_uv
    model.face(rows[-1],top_uv,slot if cap is None else cap,shade=False)


def terrain(model, rng, nx, ny, peaks, style):
    """A serrated ridge and its asymmetric slopes, including a sealed base."""
    vertices, tex = [], []
    phase = seed_phase(rng)
    dim = {"alpine": (1.58,1.09,.09,.82), "fjord": (2.32,1.20,.14,.93),
           "volcano": (1.43,1.64,.105,.76)}[style]
    steep, exponent, fracture, prominence = dim

    def skyline(x):
        base = .17+.045*math.cos(4.5*x)
        for location,height,width in peaks:
            mountain = height*max(0,1-abs(x-location)/width)**1.45
            if style=="fjord":
                mountain = height*math.exp(-2.4*abs((x-location)/width)**1.65)
            base = max(base,mountain)
        return base
    for i in range(nx+1):
        x = -1+2*i/nx
        profile = skyline(x)*(.92+.066*math.cos(27*x+phase[0])+.032*math.sin(63*x+phase[1]))
        ridge = .12*math.sin(5*x+phase[2])+.074*math.sin(14*x+phase[3])
        row,uv = [],[]
        for j in range(ny+1):
            y = -1+2*j/ny
            distance = abs(y-ridge)/(1-ridge if y>ridge else 1+ridge)
            flank = max(0,1-distance**steep)**exponent
            incision = math.sin(21*x+10*y+phase[4])*.57+math.cos(43*x-6*y+phase[5])*.31
            incision += .14*math.sin(82*x+15*y)
            z = .009+profile*flank*(1+fracture*incision)
            relief = flank*(.020*math.cos(18*x-5*y)+.024*math.sin(12*y+10*x))*profile
            z += relief*math.sin(math.pi*distance)
            if i in (0,nx) or j in (0,ny):
                z = .006
            row.append(model.vertex((x,y,z)))
            # v is exposure to snow/vegetation, u moves the rock strata along the ridge.
            deposit = (z*prominence+.15*incision*flank+.10*(y+.4))
            if style=="volcano":
                deposit = .92-.59*z-.20*abs(incision)*flank
            uv.append((.11+.76*(x+1)/2+.08*(y+1)/2,float(np.clip(deposit,.02,.98))))
        vertices.append(row)
        tex.append(uv)
    for i in range(nx):
        for j in range(ny):
            face = (vertices[i][j],vertices[i+1][j],vertices[i+1][j+1],vertices[i][j+1])
            corners = (tex[i][j],tex[i+1][j],tex[i+1][j+1],tex[i][j+1])
            model.face(face,corners,COVER,shade=style=="volcano" or (i+j)%4!=0)
    edge = ([vertices[i][0] for i in range(nx)]+[vertices[-1][j] for j in range(ny)]
            +[vertices[i][-1] for i in range(nx,0,-1)]+[vertices[0][j] for j in range(ny,0,-1)])
    lower = [model.vertex((*model.xyz[index][:2],0)) for index in edge]
    middle = model.vertex((0,0,0))
    for j in range(len(edge)):
        k = (j+1)%len(edge)
        model.face((edge[k],edge[j],lower[j],lower[k]),((0,1),(1,1),(1,0),(0,0)),ROCK,shade=False)
        model.face((lower[k],lower[j],middle),((.84,.84),(.12,.84),(.5,.2)),ROCK,shade=False)


def blades(u,v,rng,kind):
    alpha = np.zeros_like(u)
    relief = np.zeros_like(u)
    pigment = np.full_like(u,.48)
    if kind in ("needle","spruce","palm","bamboo_leaf"):
        stem = (abs(u-.5-.015*np.sin(6*v))<.008)&(v>.024)&(v<.975)
        alpha[stem] = 1
        pigment[stem] = .22
        pairs = {"needle":28,"spruce":30,"palm":24,"bamboo_leaf":10}[kind]
        for i in range(pairs):
            anchor = .055+.877*i/(pairs-1)
            for sign in (-1,1):
                dx,dy = (u-.5-.015*math.sin(6*anchor))*sign,v-anchor
                slender = {"palm":.019,"bamboo_leaf":.027}.get(kind,.016)
                sweep = .28+.22*anchor
                length = (.105+.32*math.sin(math.pi*anchor)**.60)*rng.uniform(.82,1.06)
                t = (dx+dy*.16)/length
                distance = dy-t*sweep*length + .037*t*t
                spread = slender*np.maximum(np.sin(math.pi*np.clip(t,0,1)),0)**.68
                visible = (t>0)&(t<1)&(np.abs(distance)<spread)
                alpha[visible] = 1
                relief[visible] = (.30*np.exp(-80*abs(distance)))[visible]
                pigment[visible] = (.40+.22*t+rng.uniform(-.12,.16))[visible]
        if kind=="spruce":
            # Snow clings near the stem in elongated deposits, leaving open
            # silhouettes and muted blue-green needle tips.
            snow = .143 + .055*np.sin(20*v)+.026*np.cos(63*v)
            crust = (abs(u-.50)<snow)&(v>.10)&(v<.87)&(pigment<.52)
            alpha[crust] = 1
            pigment[crust] = .96
        return alpha,relief,pigment

    outline = np.array(((0,1),(.16,.50),(.44,.66),(.38,.31),(.76,.47),(.72,.20),
        (1.,.09),(.65,-.06),(.78,-.24),(.41,-.19),(.28,-.39),(.02,-.23),
        (-.28,-.40),(-.40,-.19),(-.77,-.26),(-.65,-.05),(-.97,.10),(-.70,.20),
        (-.76,.46),(-.37,.31),(-.42,.66),(-.15,.50)))
    scatter = [(x+.068*rng.uniform(-1,1),y+.080*rng.uniform(-1,1))
               for x in (.175,.5,.825) for y in (.17,.396,.616,.837)]
    if kind=="maple_single":
        scatter = [(.50,.48)]
    for cx,cy in scatter:
        # Each leaf faces its own direction on the same atlas tile.
        rotation = rng.uniform(-math.pi,math.pi) if kind!="maple_single" else -.18
        scale = .399 if kind=="maple_single" else rng.uniform(.088,.136)
        angle_x,angle_y = math.cos(rotation),math.sin(rotation)
        a = ((u-cx)*angle_x+(v-cy)*angle_y)/scale
        b = (-(u-cx)*angle_y+(v-cy)*angle_x)/scale
        if kind.startswith("maple"):
            mask = np.zeros_like(u,dtype=bool)
            for (x1,y1),(x2,y2) in zip(outline,np.roll(outline,-1,axis=0)):
                if y1 != y2:
                    mask ^= ((b>y1)!=(b>y2)) & (a<(x2-x1)*(b-y1)/(y2-y1)+x1)
            mask |= (abs(a)<.037)&(b<-.2)&(b>-.70)
            vein = np.exp(-8*abs(a))+.42*np.exp(-12*abs(a-.73*b))+.42*np.exp(-12*abs(a+.73*b))
        else:
            # Smooth-margined tropical blades, with a light midrib.
            mask = (np.abs(a)<.51*np.maximum(0,1-b*b)**.75)&(abs(b)<1)
            vein = np.exp(-13*abs(a))+.32*np.exp(-13*abs(np.sin(9*b+6*abs(a))))
        alpha[mask] = 1.
        relief[mask] = (.27*vein)[mask]
        pigment[mask] = (.43+.19*b+.13*vein+rng.uniform(-.20,.24))[mask]
    return alpha,relief,pigment


def flowering_mask(u,v,rng,pattern):
    matte = np.zeros_like(u)
    pigment = np.full_like(u,.45)
    relief = np.zeros_like(u)
    if pattern=="petal_single":
        a,b = (u-.50)/.33,(v-.50)/.412
        heart = (a*(1+.64*(b-.32)**2))**2+b*b
        notch = np.hypot(a*.95,b-.98)
        matte[(heart<1)&(notch>.18)] = 1.
        return matte,.13*np.exp(-11*np.abs(a)),np.clip(.64-.27*b+.10*np.sin(4*a),0,1)
    if pattern=="papyrus":
        x,y = u-.5,v-.5
        r,theta = np.hypot(x,y),np.arctan2(y,x)
        points = rng.uniform(.39,.47,31)
        for i,length in enumerate(points):
            angle = TAU*i/len(points)+rng.uniform(-.034,.034)
            arm = np.cos(theta-angle)*r
            center = np.sin(theta-angle)*r-.14*arm**2
            mask = (arm>0)&(arm<length)&(np.abs(center)<.011*(1-.81*arm/length))
            matte[mask]=1
            pigment[mask]=(.31+.31*arm/length)[mask]
        heart = r<.043
        matte[heart]=1
        pigment[heart]=.74
        return matte,relief,pigment
    for cx in (.166,.50,.834):
        for cy in (.13,.38,.62,.87):
            x,y = u-cx-rng.uniform(-.072,.072),v-cy-rng.uniform(-.054,.054)
            angle = np.arctan2(y,x)+rng.uniform(0,TAU)
            radius = rng.uniform(.091,.146)
            rho = np.hypot(.94*x,y)/radius
            petal = 1+.19*np.cos(5*angle)-.11*np.cos(10*angle)
            mask = rho<petal
            color = .62+.28*smooth(rho)-.39*np.exp(-12*rho*rho)+rng.uniform(-.24,.10)
            matte[mask] = 1.
            pigment[mask] = color[mask]
            relief[mask] = (.27*np.cos(angle*5)*smooth(rho))[mask]
    return matte,relief,pigment


def maps(surface, n, seed):
    rng = np.random.default_rng(seed)
    p = 5/n
    axis = (np.arange(n)/n-p)/(1-2*p)
    v,u = np.meshgrid(axis,axis,indexing="ij")
    cloud = diffuse_noise(rng,n,1.9,8)
    grain = diffuse_noise(rng,n,15,56)
    grit = diffuse_noise(rng,n,36,98)
    alpha = np.ones_like(u)
    tone = .029*cloud+.018*grain+.005*grit
    bump = .078*grain+.034*grit
    rough = surface.roughness+.05*cloud+.028*grain
    rgb = np.array(surface.rgb)
    pattern = surface.pattern
    accent = np.array(surface.accent) if surface.accent is not None else None
    if pattern in ("wood","bark","lacquer","carved","palm_trunk","date_bark"):
        distortion = .017*np.sin(9*v+4*u)+.022*cloud
        ring = np.sin(TAU*12*(u+distortion)+1.3*np.cos(6*u))
        fibre = np.sin(TAU*43*(u+distortion)+2*grit)
        tone += .023*ring+.016*fibre
        bump += .21*ring+.26*fibre
        if pattern in ("bark","palm_trunk","date_bark"):
            grooves = (1-abs(ring))**8
            tone -= grooves*.066
            bump -= grooves*.77
        if pattern=="palm_trunk":
            scar = np.exp(-125*((v*14+.03*cloud)%1-.25)**2)
            bump += .48*scar
            tone += .048*scar
        if pattern=="date_bark":
            left = np.cos(TAU*(u*13+v*22))
            right = np.cos(TAU*(u*13-v*22))
            scale = smooth((np.minimum(left,right)+.31)/1.20)
            bump += .64*scale
            tone += .066*scale
        if pattern=="lacquer":
            wear = smooth((cloud+.17*grain-.44)/.47)
            tone += .050*wear
            rough += .10*wear
        if pattern=="carved":
            end = np.exp(-26*abs(np.sin(TAU*(u*4.+v*2)))*.53)*smooth((abs(u-.5)-.24)/.08)
            tone -= .073*end
            bump -= .49*end
    elif pattern in ("weave","thatch","seams","paper"):
        if pattern == "weave":
            a,b = 19*u+5*v, 21*v-4*u
            even = (np.floor(a+.5)+np.floor(b+.5))%2
            strips = np.sin(TAU*a)*even+np.sin(TAU*b)*(1-even)
            tone += .046*strips
            bump += .49*strips
        elif pattern == "thatch":
            streak = np.sin(TAU*(u*29+.14*np.sin(10*v)+.36*cloud))
            fiber = np.maximum(0,np.cos(TAU*67*u+4*grit))**3
            ties = np.exp(-42*((v*3+.057*grain)%1-.15)**2)
            tone += .045*streak-.05*ties+.016*fiber
            bump += .59*streak-.34*ties+.22*fiber
        elif pattern=="seams":
            seam = np.exp(-48*((v*13+.033*cloud)%1-.10)**2)
            tone -= seam*.048
            bump -= seam*.59
        else:
            tone += .026*np.cos(TAU*u*7)+.014*cloud
            bump += .12*np.cos(TAU*u*7)
    elif pattern in ("granite","basalt","coral","ice","stone","alpine","fjord","volcano","snow","moss","snowrock"):
        stratum = np.sin(TAU*(5*v+.24*u+.081*cloud+.061*grain))
        specks = smooth((abs(grit)-.50)/.47)
        bedding = .009 if pattern=="granite" else .022
        tone += bedding*stratum-.061*specks
        bump += .19*stratum+.43*specks
        if pattern=="granite":
            feldspar = smooth((grain+.32*grit-.38)/.38)
            tone += .085*feldspar
            bump += .28*feldspar
        if pattern in ("coral","basalt","ice","snowrock"):
            cells = smooth((grain+.42*grit-.27)/.50)
            bump -= cells*(1.12 if pattern=="coral" else .68)
            tone -= cells*(.075 if pattern=="coral" else .041)
        if pattern=="coral":
            # Bored limestone pockets, with randomly sized openings and a softly
            # weathered lip. Repeat around the boulder's meridian.
            x,y = u*31,v*21
            fx,fy = np.floor(x).astype(int),np.floor(y).astype(int)
            sites = rng.uniform(.13,.87,(21,31,3))
            nearest = np.full_like(x,4.)
            for ox in (-1,0,1):
                for oy in (-1,0,1):
                    ix,iy=fx+ox,fy+oy
                    jitter=sites[iy%21,ix%31]
                    distance=np.hypot(x-ix-jitter[:,:,0],y-iy-jitter[:,:,1])/(.71+.45*jitter[:,:,2])
                    nearest=np.minimum(distance,nearest)
            pit = 1-smooth((nearest-.094)/.26)
            lip = np.exp(-57*(nearest-.362)**2)
            bump += .23*lip-1.12*pit
            tone += .038*lip-.157*pit
        if pattern in ("granite","basalt","coral","ice","moss","snowrock"):
            wet = 1-smooth((v-.32+.030*cloud)/.19)
            tone -= wet*.081
            rough -= wet*.32
        if pattern in ("alpine","fjord","volcano","moss"):
            edge = .43+.095*cloud+.05*grain
            deposit = smooth((v-edge)/(.25 if pattern=="volcano" else .119))
            rgb = rgb*(1-deposit[:,:,None])+accent*deposit[:,:,None]
            if pattern in ("alpine","fjord"):
                rough += .10*deposit
                bump *= 1-.63*deposit
            else:
                tone -= .015*deposit
        if pattern=="snowrock":
            snowline = .855+.031*cloud+.016*np.sin(59*u)+.011*grain
            deposit = smooth((v-snowline)/.046)
            rgb = rgb*(1-deposit[:,:,None])+accent*deposit[:,:,None]
            rough += .13*deposit
            bump *= 1-.54*deposit
    elif pattern in ("needle","spruce","maple","maple_single","palm","broad","bamboo_leaf"):
        alpha,ridge,pigment = blades(u,v,rng,pattern)
        bump += ridge
        if pattern=="spruce":
            color = smooth((pigment-.83)/.12)
            rgb = rgb+(.051*(pigment-.32))[:,:,None]
        else:
            color = smooth((pigment-.19)/.64)
        rgb = rgb*(1-color[:,:,None])+accent*color[:,:,None]
        tone = .014*cloud+.008*grain+.011*ridge
    elif pattern in ("sakura","petal_single","papyrus"):
        alpha,form,pigment = flowering_mask(u,v,rng,pattern)
        color = np.clip(pigment,0,1)
        rgb = rgb*(1-color[:,:,None])+accent*color[:,:,None]
        bump += form
        tone = .016*cloud+.011*grain
    elif pattern in ("stripe","sandstone","sand_moss","lava","slate","dune","brick","canvas","fuji","matterhorn"):
        if pattern=="stripe":
            band = smooth((np.sin(TAU*(2*u-4*v))+.14)/.26)
            rgb = rgb*(1-band[:,:,None])+accent*band[:,:,None]
            wet = 1-smooth((v-.24+.038*cloud)/.15)
            rgb = rgb*(1-.48*wet[:,:,None])+np.array((.09,.122,.084))*wet[:,:,None]
            rough -= .19*wet
            tone -= .034*smooth((grain+cloud-.49)/.41)
        elif pattern in ("fuji","matterhorn"):
            # Mesh v encodes snow exposure, so gullies carry the line down
            # below exposed shoulders without painterly stretched stripes.
            fall = .47+.047*cloud+.026*grain
            snow = smooth((v-fall)/(.105 if pattern=="fuji" else .085))
            rgb = rgb*(1-snow[:,:,None])+accent*snow[:,:,None]
            grooves = np.sin(TAU*(9.0*u+.19*v+.18*cloud))
            tone += .019*grooves*(1-.63*snow)
            bump += (.31*grooves+.18*grain)*(1-.73*snow)
            rough += .085*snow
        elif pattern=="brick":
            y = v*15
            x = u*8+.5*np.floor(y)
            mortar = np.minimum(np.minimum(x%1,1-x%1),np.minimum(y%1,1-y%1))
            joint = 1-smooth((mortar-.018)/.066)
            rgb = rgb*(1-.45*joint[:,:,None])+accent*.45*joint[:,:,None]
            tone += .019*np.sin(np.floor(x)*8.1+np.floor(y)*3.17)
            bump -= .89*joint
        elif pattern=="canvas":
            warp = np.sin(TAU*51*u)*np.sin(TAU*57*v)
            seams = np.exp(-81*((u*4.0+.04*cloud)%1-.3)**2)
            tone += .024*warp-.054*seams
            bump += .10*warp+.34*seams
        elif pattern=="dune":
            ripples = np.sin(TAU*(24*v+2*u+.20*cloud))
            tone += .018*ripples+.035*cloud
            bump += .23*ripples
        else:
            bedding = np.sin(TAU*((13 if pattern=="slate" else 8)*v+.08*cloud+.14*u))
            fault = smooth((bedding-.57)/.31)
            wet = 1-smooth((v-.28+.025*cloud)/.22)
            rough -= .27*wet
            tone += .027*bedding-.051*fault-.079*wet
            bump += .24*bedding-.59*fault
            if pattern=="lava":
                cavity = smooth((grain+.46*grit-.23)/.42)
                tone -= .090*cavity
                bump -= 1.19*cavity
            if pattern=="sand_moss":
                coverage = smooth((v-.80+.11*cloud+.036*grain)/.12)
                rgb = rgb*(1-coverage[:,:,None])+accent*coverage[:,:,None]
                rough += .062*coverage
    elif pattern=="petal":
        pigment = smooth(v)
        rgb = rgb*(1-pigment[:,:,None])+accent*pigment[:,:,None]
        fiber = np.sin(TAU*(10*u+.18*v+.070*cloud))
        tone += .018*fiber
        bump += .16*fiber
    result = np.clip(rgb+tone[:,:,None],.035,.96)
    dy,dx = np.gradient(bump)
    normal = np.dstack((-.73*dx,-.73*dy,np.ones_like(dx)))
    normal /= np.linalg.norm(normal,axis=2,keepdims=True)
    return result,np.clip(rough,.22,.99),(.5+.5*normal),alpha


def textures(model, asset, palette, seed):
    px = asset.size
    cell = px//4
    alpha = MASK in model.groups
    color = np.zeros((px,px,4 if alpha else 3),dtype=np.float32)
    if alpha:
        color[:,:,3] = 1
    rough = np.full((px,px,3),.70,dtype=np.float32)
    normal = np.zeros((px,px,3),dtype=np.float32)
    normal[:] = (.5,.5,1.)
    for slot in sorted({c[0] for c in model.corners}):
        if slot not in palette:
            raise ValueError(f"{asset.name}: missing surface palette slot {slot}")
        patch = np.s_[slot//4*cell:(slot//4+1)*cell,slot%4*cell:(slot%4+1)*cell]
        bc,r,nt,a = maps(palette[slot],cell,seed+5501*slot)
        color[patch][:,:,:3] = bc
        if alpha:
            color[patch][:,:,3] = a
        rough[patch] = r[:,:,None]
        normal[patch] = nt
    return tuple(packed_image(f"{asset.name}_{name}",data,is_data)
                 for name,data,is_data in (("basecolor",color,False),("roughness",rough,True),("normal",normal,True)))


def pbr_materials(model, asset, palette, seed):
    images = textures(model,asset,palette,seed)
    mats = []
    for group in range(max(model.groups)+1):
        mat,shader = material(asset.name+" / "+("Surface","Amber lights","Cutout foliage","Woven sail")[group])
        mat.use_backface_culling = group not in (MASK,CLOTH)
        nodes = mat.node_tree.nodes
        link = mat.node_tree.links.new
        bc,r,nt = [nodes.new("ShaderNodeTexImage") for _ in images]
        for node,image in zip((bc,r,nt),images):
            node.image = image
            node.extension = "EXTEND"
        link(bc.outputs["Color"],shader.inputs["Base Color"])
        link(r.outputs["Color"],shader.inputs["Roughness"])
        tangent = nodes.new("ShaderNodeNormalMap")
        tangent.space = "TANGENT"
        link(nt.outputs["Color"],tangent.inputs["Color"])
        link(tangent.outputs["Normal"],shader.inputs["Normal"])
        shader.inputs["Metallic"].default_value = 0
        if group==EMIT:
            link(bc.outputs["Color"],shader.inputs["Emission Color"])
            shader.inputs["Emission Strength"].default_value = 2.55
        if group==MASK:
            cutout = nodes.new("ShaderNodeMath")
            cutout.operation = "GREATER_THAN"
            cutout.inputs[1].default_value = .49
            link(bc.outputs["Alpha"],cutout.inputs[0])
            link(cutout.outputs[0],shader.inputs["Alpha"])
            mat.surface_render_method = "DITHERED"
        mats.append(mat)
    return mats


def normalize(model, asset):
    coords = np.array(model.xyz,dtype=float)
    lo,hi = coords.min(axis=0),coords.max(axis=0)
    require(np.isfinite(coords).all() and np.all(hi>lo),f"{asset.name}: source geometry has invalid bounds")
    target = np.array([asset.bbox[0],asset.bbox[2],asset.bbox[1]])
    shift = np.array((0 if asset.x_start else -target[0]/2,-target[1]/2,asset.base))
    if asset.anchor_xy is not None:
        shift[:2] = (lo[:2]-asset.anchor_xy)*target[:2]/(hi-lo)[:2]
    model.xyz = ((coords-lo)*(target/(hi-lo))+shift).tolist()


def validate(path, asset, model, work):
    glb = Glb(path)
    doc = glb.doc
    nodes = doc["nodes"]
    require(nodes==[dict(mesh=0,name=asset.name)] and len(doc["meshes"])==1 and len(doc["scenes"])==1
            and doc["scenes"][0]["nodes"]==[0],"Expected one identity scene node")
    require(not any(key in doc for key in ("cameras","animations","skins")), "Extra glTF scene objects")
    require(len(doc["buffers"])==1 and "uri" not in doc["buffers"][0] and len(doc["images"])==3,
            "Expected three fully embedded textures")
    triangles,points = 0,[]
    for part in doc["meshes"][0]["primitives"]:
        require(part.get("mode",4)==4,"Expected triangles")
        attrs = part["attributes"]
        xyz = glb.accessor(attrs["POSITION"])
        uv = glb.accessor(attrs["TEXCOORD_0"])
        normals = glb.accessor(attrs["NORMAL"])
        tangents = glb.accessor(attrs["TANGENT"])
        idx = glb.accessor(part["indices"]).reshape(-1,3)
        corners = xyz[idx].astype(np.float64)
        area = np.linalg.norm(np.cross(corners[:,1]-corners[:,0],corners[:,2]-corners[:,0]),axis=1)
        require(np.isfinite(xyz).all() and np.all(area>1e-10) and
                np.isfinite(uv).all() and uv.min()>=0 and uv.max()<=1 and
                np.allclose(np.linalg.norm(normals,axis=1),1.,atol=1e-4) and
                np.allclose(np.linalg.norm(tangents[:,:3],axis=1),1.,atol=4e-4) and
                np.all(np.abs(tangents[:,3])==1),f"{asset.name}: invalid triangle, atlas UV, or tangent frame")
        triangles += len(idx)
        points.append(xyz)
    xyz = np.concatenate(points).astype(float)
    lo,hi = xyz.min(axis=0),xyz.max(axis=0)
    source = np.asarray(model.xyz)[:,[0,2,1]]*(1,1,-1)
    require(np.allclose(source.min(axis=0),lo,rtol=0,atol=5e-6)
            and np.allclose(source.max(axis=0),hi,rtol=0,atol=5e-6)
            and abs(lo[1]-asset.base)<5e-6 and np.allclose(hi-lo,asset.bbox,rtol=0,atol=6e-6),
            f"{asset.name}: metric coordinates or origin mismatch")
    n = path.stat().st_size
    require(0<n<=asset.byte_limit and asset.triangles[0]<=triangles<=asset.triangles[1],
            f"{asset.name}: {triangles} tris (target {asset.triangles}), {n} bytes (limit {asset.byte_limit})")
    maps = []
    raw = work/"map.webp"
    for im in doc["images"]:
        require(im["mimeType"]=="image/webp" and "uri" not in im,"External/non-WebP image")
        raw.write_bytes(glb.view(im["bufferView"]))
        image = bpy.data.images.load(str(raw),check_existing=False)
        try:
            require(list(image.size)==[asset.size,asset.size],"Incorrect embedded PBR atlas resolution")
            maps.append(dict(name=im["name"],size=list(image.size),mimeType=im["mimeType"]))
        finally:
            bpy.data.images.remove(image)
    for m in doc["materials"]:
        p = m["pbrMetallicRoughness"]
        require("baseColorTexture" in p and "metallicRoughnessTexture" in p and "normalTexture" in m and
                p.get("metallicFactor",1)==0,"Missing baked PBR channels")
    masks = [m for m in doc["materials"] if m.get("alphaMode")=="MASK" and m.get("doubleSided",False)]
    emitters = [m for m in doc["materials"] if m.get("emissiveTexture") and max(m["emissiveFactor"])>0]
    require(len(masks)==int(MASK in model.groups) and len(emitters)==int(EMIT in model.groups),
            "Missing or unexpected cutout or emissive material")
    return dict(file=path.name,name=asset.name,title=asset.title,use=asset.use,bboxMeters=(hi-lo).tolist(),
                boundsMeters=dict(min=lo.tolist(),max=hi.tolist()),origin=asset.origin,triangles=triangles,
                fileBytes=n,textureMaps=maps,materialCount=len(doc["materials"]),emissive=bool(emitters),
                alphaMask=bool(masks),sha256=glb.digest)


def normalize_exported_tangents(path):
    """Recover the dominant component from the rounded UV tangent's other two.

    The exporter rounds components separately. Across worker counts the same UV
    tangent can land either side of a rounding midpoint on its dominant axis.
    Reconstructing unit length preserves the two minor components and handedness.
    """
    glb = Glb(path)
    blob = bytearray(path.read_bytes())
    binary = len(blob)-len(glb.data)
    parts = glb.doc["meshes"][0]["primitives"]
    for index in {p["attributes"]["TANGENT"] for p in parts}:
        accessor = glb.doc["accessors"][index]
        view = glb.doc["bufferViews"][accessor["bufferView"]]
        data = np.ndarray((accessor["count"],4),dtype="<f4",buffer=blob,
                          offset=binary+view.get("byteOffset",0)+accessor.get("byteOffset",0),
                          strides=(view.get("byteStride",16),4))
        vec = data[:,:3].astype(np.float64)
        rows = np.arange(len(vec))
        dominant = np.argmax(abs(vec),axis=1)
        sign = np.sign(vec[rows,dominant])
        vec[rows,dominant] = 0
        data[rows,dominant] = sign*np.sqrt(np.maximum(0,1-np.sum(vec*vec,axis=1)))
    path.write_bytes(blob)


def export(asset, build, palette, seed, assets, work, *, material_builder=pbr_materials):
    fresh_scene()
    model = Model(asset.name)
    build(model,np.random.default_rng(seed))
    normalize(model,asset)
    if callable(palette):
        palette = palette(asset)
    obj = model.object(asset.size,material_builder(model,asset,palette,seed))
    select_only(obj)
    modifier = obj.modifiers.new("Explicit atlas triangles","TRIANGULATE")
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    require(tuple(obj.location)==(0,0,0) and tuple(obj.scale)==(1,1,1)
            and tuple(obj.rotation_euler)==(0,0,0),"Invalid origin transform")
    path = assets/(asset.name+".glb")
    for quality in (92,88,84,80,76):
        result = bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,export_yup=True,
                    export_apply=True,export_normals=True,export_tangents=True,export_image_format="WEBP",
                    export_image_quality=quality,export_animations=False,export_lights=False,export_cameras=False)
        require("FINISHED" in result,f"Export failed for {asset.name}")
        if path.stat().st_size<=asset.byte_limit:
            break
    normalize_exported_tangents(path)
    return validate(path,asset,model,work)


def compose(job):
    from PIL import Image, ImageDraw, ImageFont

    work = Path(job["work"])
    names = "/usr/share/fonts/opentype/noto/"
    cjk = Path(names+"NotoSerifCJK-Regular.ttc").is_file()
    def font(name,size):
        try:
            return ImageFont.truetype(name,size)
        except OSError:
            return ImageFont.load_default()
    title = font(names+"NotoSerifCJK-Regular.ttc" if cjk else "DejaVuSerif.ttf",66)
    heading = font(names+"NotoSerifCJK-Regular.ttc" if cjk else "DejaVuSerif.ttf",29)
    body = font(names+"NotoSansCJK-Regular.ttc" if cjk else "DejaVuSans.ttf",19)
    mono = font("DejaVuSansMono.ttf",18)
    mono_small = font("DejaVuSansMono.ttf",16)
    width, height = 2550, 1367
    card_x, card_y, gutter, top = 606, 570, 13, 174
    paper, ink, muted, accent, plate = job["colors"]
    canvas = Image.new("RGB",(width,height),paper)
    draw = ImageDraw.Draw(canvas)
    count = len(job["assets"])
    first_row = (count+1)//2
    draw.text((43,18),job["english"].upper()+f"   /   {count} ASSETS",fill=accent,font=mono)
    draw.text((40,49),job["title"] if cjk else job["english"],fill=ink,font=title)
    draw.text((43,133),"Cycles 暮色散光 · 独立取景 · 米制尺寸按 X × Y × Z" if cjk else
              "Soft dusk in Cycles   /   Individual framing   /   Metres, X × Y × Z",fill=muted,font=body)
    draw.line((43,161,width-43,161),fill=muted,width=2)
    for index,entry in enumerate(job["assets"]):
        second = index>=first_row
        columns = count-first_row if second else first_row
        first = (width-(columns*card_x+(columns-1)*gutter))//2
        x = first+(index-first_row if second else index)*(card_x+gutter)
        y = top+(card_y+18)*second
        card = Image.new("RGB",(card_x,484),plate)
        with Image.open(work/(entry["name"]+".png")) as rendered:
            rgba = rendered.convert("RGBA").resize(card.size,Image.Resampling.LANCZOS)
            card.paste(rgba,mask=rgba.getchannel("A"))
        canvas.paste(card,(x,y))
        draw.text((x+9,y+490),entry["title"] if cjk else entry["name"].replace("_"," ").title(),fill=ink,font=heading)
        draw.text((x+10,y+543),entry["file"],fill=accent,font=mono_small)
        dims = " × ".join(f"{value:.2f}" for value in entry["bboxMeters"])
        draw.text((x+card_x-9,y+543),dims+" m",fill=muted,font=mono_small,anchor="ra")
    canvas.save(job["target"],optimize=True)


def publish(root, staged_assets, relative_assets, staged_preview, relative_preview, work):
    with catalog_lock(root/relative_assets):
        done = []
        try:
            for src,relative in ((staged_assets,relative_assets),(staged_preview,relative_preview)):
                dest = root/relative
                dest.parent.mkdir(parents=True,exist_ok=True)
                backup = work/(dest.name+".previous")
                if dest.exists():
                    dest.replace(backup)
                done.append((src,dest,backup))
                src.replace(dest)
        except OSError:
            for src,dest,backup in reversed(done):
                if dest.exists():
                    dest.replace(src)
                if backup.exists():
                    backup.replace(dest)
            raise


def generate(pack_id, title, english, colors, specs, builds, palette, seed):
    parser = argparse.ArgumentParser(description=f"Build {english} with Blender Cycles")
    parser.add_argument("--seed",type=int,default=seed)
    parser.add_argument("--output-root",type=Path,default=ROOT)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    require(bpy.app.background and args.seed>=0,"Use background Blender (-b) and a non-negative seed")
    root = args.output_root.resolve()
    root.mkdir(parents=True,exist_ok=True)
    require(len(specs)==len(builds) and len(specs) in (6,7),"Expected six or seven catalogue assets")
    dest = Path("public/assets/scenes")/pack_id
    preview = Path("tools/blender")/f"preview_{pack_id}_assets.png"
    with tempfile.TemporaryDirectory(prefix=f".{pack_id}-",dir=root) as temp:
        work = Path(temp)
        assets = work/pack_id
        assets.mkdir()
        rows = []
        for i,(asset,build) in enumerate(zip(specs,builds)):
            row = export(asset,build,palette,args.seed+113*i,assets,work)
            rows.append(row)
            print(f"Verified {row['file']} — {row['triangles']} tris, {row['fileBytes']} bytes",flush=True)
        manifest = dict(version=1,packId=pack_id,units="metres",gltfAxes=["X","Y up","Z"],seed=args.seed,assets=rows)
        atlas = assets/"manifest.json"
        write_json(atlas,manifest)
        node = shutil.which("node")
        require(node,"Node is required for the local Three.js GLTFLoader validation")
        subprocess.run([node,str(Path(__file__).with_name("validate_scene_pack.mjs")),str(atlas)],check=True)
        for spec,row in zip(specs,rows):
            preview_image(spec,row,assets,work)
        target = work/preview.name
        job = dict(title=title,english=english,colors=colors,assets=rows,work=str(work),target=str(target))
        try:
            import PIL
        except ImportError:
            py = shutil.which("python3")
            require(py,"Pillow is required in Blender or system python3")
            layout = work/"layout.json"
            write_json(layout,job)
            subprocess.run([py,str(Path(__file__).resolve()),"--compose-pack",str(layout)],check=True)
        else:
            compose(job)
        require(target.stat().st_size>100_000,"Incomplete Cycles contact sheet")
        publish(root,assets,dest,target,preview,work)
        print(f"Published {pack_id} ({len(rows)} GLBs)",flush=True)


def basic_palette():
    return {
        WOOD: Surface((.43,.30,.213),.65,"wood"),
        TRIM: Surface((.53,.39,.273),.72,"wood"),
        BARK: Surface((.30,.256,.215),.86,"bark"),
        WEAVE: Surface((.476,.386,.263),.76,"weave"),
        METAL: Surface((.248,.243,.199),.60,"seams"),
        GLOW: Surface((.904,.644,.296),.62,"paper"),
        ROCK: Surface((.45,.46,.458),.79,"granite"),
        COVER: Surface((.345,.362,.367),.78,"alpine",(.795,.830,.853)),
        ROOF: Surface((.207,.225,.224),.71,"seams"),
        SNOW: Surface((.817,.852,.869),.85,"snow"),
        NEEDLE: Surface((.203,.297,.235),.72,"needle",(.373,.445,.306)),
        LEAF: Surface((.206,.354,.228),.64,"broad",(.332,.485,.279)),
        LEAF2: Surface((.287,.392,.244),.64,"broad",(.443,.510,.303)),
        BLOOM: Surface((.826,.518,.369),.64,"petal",(.656,.220,.243)),
        PANEL: Surface((.538,.459,.376),.76,"seams"),
        DETAIL: Surface((.40,.37,.303),.79,"stone"),
    }


def glass_lamp(model,x,y,z,radius,height,slot=METAL):
    half = height*.5
    model.stack(x,y,[(z-half,radius*.64),(z-half*.77,radius*.87),(z+half*.67,radius),
                      (z+half,radius*.74)],10,GLOW,group=EMIT,shade=True)
    model.stack(x,y,[(z-half-.026,radius*.80),(z-half-.011,radius*1.08),(z-half,radius*.84)],12,slot)
    model.stack(x,y,[(z+half,radius*1.12),(z+half+.033,radius*.99),
                      (z+half+.092,radius*.31)],12,slot)
    for i in range(6):
        dx,dy,_ = polar(radius*.99,TAU*i/6,0)
        cylinder(model,(x+dx*.83,y+dy*.83,z-half),(x+dx,y+dy,z+half),radius*.061,5,slot)


def watercraft(model,length,width,bottom,top,form,lamp=True):
    cedar = form=="cedar"
    clinker = form=="clinker"
    outrigger = form=="outrigger"
    gondola = form=="gondola"
    timber = PANEL if clinker or form in ("skiff","rowboat","sailboat") else WOOD
    joinery = TRIM if form=="skiff" else WOOD
    half = length/2
    depth = abs(bottom)
    rise = .25 if outrigger else (.33 if cedar else .37)
    if gondola:
        rise = .39
    def hull(t,a,inner=False):
        profile = max(0,math.sin(math.pi*t))
        breadth = .021+(width*.5-.021)*profile**(.63 if cedar else .57)
        sheer = .18+rise*abs(2*t-1)**(3.5 if gondola else 3) + (.23 if gondola else .048)*(t-.5)
        if cedar or outrigger:
            sheer -= .10*(1-profile)**1.2
        draft = .062+(depth+.119)*profile**.85
        x = length*(t-.5)
        if inner:
            breadth = max(.012,breadth-.026)
        y = breadth*math.sin(a)+(.108*profile*math.sin(math.pi*t+.32) if gondola else 0)
        roundness = .84 if cedar else .51
        z = sheer-draft*max(0,math.cos(a))**roundness+(.035 if inner else 0)
        return v3((x,y,z))
    angle = lambda v: math.pi*(v-.5)
    model.grid(lambda u,v:hull(u,angle(v)),32,16,timber,uv=lambda u,v:(v,u),flip=True)
    model.grid(lambda u,v:hull(u,angle(v),True),24,12,TRIM,uv=lambda u,v:(v,u))
    for side in (-1,1):
        hull_edge = [hull(u,side*math.pi/2) for u in np.linspace(0,1,26)]
        twig(model,hull_edge,[.022]*26,7,TRIM)
        courses = (28,45,60,75) if clinker else (30,52,73)
        for i,bearing in enumerate(courses):
            ring = [hull(u,side*math.radians(bearing))+(0,side*.008,0) for u in np.linspace(.028,.972,21)]
            twig(model,ring,[.014 if clinker else .009]*21,5,TRIM if i%3==0 else timber)
    for u in (0,1):
        p = hull(u,0)
        model.box(p+(0,0,.035),(.025,.045,.107),TRIM)
    for i,t in enumerate((.19,.29,.40,.50,.60,.71,.81)):
        braces = [hull(t,angle(v),True)+(0,0,.013) for v in np.linspace(.06,.94,12)]
        twig(model,braces,[.017 if clinker else .010]*12,5,TRIM)
    for i,t in enumerate((.26,.51,.73)):
        wid = abs(hull(t,math.pi/2,True)[1])*1.84
        x = length*(t-.5)
        seat = (.235 if cedar else .176)+.030*abs(i-1)
        cuboid(model,(x,0,seat),(.24,wid,.049),WEAVE if cedar else TRIM)
        for off in (-.129,.129):
            beam(model,(x+off,-wid*.53,seat),(x+off,wid*.53,seat),.034,.041,joinery)
    if not cedar:
        for j in range(8):
            y = (j-3.5)*width*.095
            beam(model,(-half*.58,y,-.018),(half*.61,y,-.006),width*.088,.039,TRIM)
    # The outboard paddles are sculpted in plan and attached to a real round shaft.
    twig(model,[(-half*.97,-width*.47,.329),(-half*.64,-width*.36,.29),
                (-half*.20,width*.17,.331)],[.018,.015,.013],8,TRIM)
    model.grid(lambda t,v:(-half*.99+.44*t,-width*.54+.17*t+(2*v-1)*(.016+.047*math.sin(math.pi*t)),
                          .329-.036*t+.016*math.sin(math.pi*v)),7,4,TRIM)
    if cedar:
        # A raised curved stem makes the canoe's upstream end obvious in silhouette.
        for side in (-1,1):
            twig(model,[(side*half*.90,0,.41),(side*half*.96,0,.54),(side*half*.99,0,top)],
                 [.026,.023,.012],8,TRIM)
    if outrigger:
        y = width*.48+1.13
        rock(model,(-.28,y,-.045),(length*.75,.235,.32),9,14,np.random.default_rng(12),TRIM,"granite")
        for x in (-.94,.85):
            section(model,[(x,-width*.48,.185),(x,.35,.218),(x-.08,y-.12,.114),(x-.15,y,.072)],
                    [.075,.070,.061,.053],[.081,.071,.067,.065],WOOD,bevel=.24)
            for j in range(3):
                model.stack(x-.15+.031*j,y,[(.051,.079),(.069,.080),(.082,.079)],8,WEAVE)
        twig(model,[(half*.86,0,.32),(half*.966,0,.44),(half*.978,0,top)],[.022,.023,.008],8,TRIM)
    if not cedar and not outrigger and lamp:
        x = (-1 if clinker or form=="felucca" else 1)*half*.78
        twig(model,[(x,-width*.30,.168),(x,-width*.32,top-.057),(x+.13,-width*.20,top-.056)],
             [.025,.017,.013],7,METAL if clinker else TRIM)
        glass_lamp(model,x+.132,-width*.20,top-.22,.060,.122)
        if form=="skiff":
            twig(model,[(-half*.76,-width*.48,.265),(half*.5,width*.18,.333)],[.014,.014],7,TRIM)


def evergreen(model,rng,height,width,lean,snow=False,rows=12):
    feet = -.28
    def trunk(t):
        return v3((lean*t*t+.12*math.sin(5*t)*t,.07*height*.31*t*math.sin(4*t),feet+(height-feet)*t))
    twig(model,[trunk(t) for t in np.linspace(0,1,22)],
         np.linspace(.025*height,.012,22),15,BARK)
    for j in range(7):
        a = TAU*j/7
        twig(model,[trunk(.05),polar(.046*height,a,.075),polar(.083*height,a,-.155)],
             [.030*height,.015*height,.007*height],7,BARK)
    for row in range(rows):
        t = .175+.752*row/(rows-1)
        count = 7 if row<rows*.75 else 5
        for k in range(count):
            heading = TAU*(k/count)+t*9.9 + rng.uniform(-.16,.16)
            c,s = math.cos(heading),math.sin(heading)
            growth = v3((c,s,0))
            exponent = .53 if rows<10 else .69
            span = width*(.53*(1-t)**exponent+.042)*rng.uniform(.77,1.18)
            base = trunk(t+rng.uniform(-.012,.012))
            tip = base+growth*span+(0,0,span*rng.uniform(-.23,.03))
            toward = mix(base,tip,.45)+(0,0,.125)
            twig(model,[base,toward,tip],[.033*span,.020*span,.007],6,BARK)
            for j in range(5):
                axis = heading+(.64 if j%2 else -.60)*max(.15,1-j*.142)+rng.uniform(-.15,.16)
                origin = mix(toward,tip,(j+.2)/5)
                card_len = span*(.58-.045*j)*rng.uniform(.85,1.22)
                frond(model,origin,axis,card_len,.72*card_len,NEEDLE,
                      .31 if snow else .28,.18,segments=6,transverse=1)
    # Give the leader separate needle tufts even from a tilted camera.
    for i in range(6):
        frond(model,trunk(.938),TAU*i/6,.57*width/4,.32*width/4,NEEDLE,.17,.18,segments=6,transverse=2)


def frond(model,base,azimuth,length,width,slot,drop=.34,arch=.2,segments=8,transverse=2):
    base = v3(base)
    c,s = math.cos(azimuth),math.sin(azimuth)
    forward = v3((c,s,0))
    across = v3((-s,c,0))
    def p(t,u):
        margin = ((.24+.76*math.sin(math.pi*t)**.60)*width*(u-.5))
        z = length*(arch*math.sin(math.pi*t)-drop*t**2)-.19*abs(margin)*(t+.4)
        return base+forward*(length*t)+across*(margin+.074*width*math.sin(4*t))+(0,0,z)
    model.grid(p,segments,transverse,slot,uv=lambda t,u:(u,t),group=MASK)


if __name__ == "__main__":
    if "--compose-pack" in sys.argv:
        job = Path(sys.argv[sys.argv.index("--compose-pack")+1])
        compose(json.loads(job.read_text(encoding="utf-8")))
