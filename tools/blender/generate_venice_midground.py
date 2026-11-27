"""Build Venice's midground in background Blender without rewriting the near-ground GLBs."""

import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import numpy as np

import scene_pack_factory as factory
from scene_pack_factory import (
    Asset, Surface, BARK, BLOOM, COVER, DETAIL, EMIT, GLOW, LEAF, LEAF2, METAL,
    NEEDLE, OPAQUE, PANEL, ROCK, ROOF, SNOW, TRIM, WEAVE, WOOD,
    beam, mix, require, section,
)

SPECS = (
    Asset("venice_canal_row_mid", "威尼斯水岸彩宅联排", "彩色灰泥、水门、石阳台与漏斗形烟囱",
          (28, 13.5, 10), -1, (5000, 8500), camera=(4, -13, 3.5)),
    Asset("venice_rialto_arcade_mid", "里亚托风格石拱廊桥", "伊斯特拉石拱跨水，阶梯石廊与双灯",
          (24, 11.5, 8.5), -1, (4500, 7500), camera=(4, -14, 4)),
    Asset("venice_bricola_beacon_mid", "威尼斯泻湖航标", "四根橡木桩、缆绳、铁箍与暖色航标灯",
          (2.8, 5.2, 2.8), -1.2, (1800, 3200), "small", camera=(5, -10, 3.6)),
    Asset("venice_bragozzo_boat_mid", "布拉戈佐彩帆木船", "平底木船、双桅赭红条纹帆与船尾灯，船首朝 +X",
          (11, 7.2, 3.2), -.5, (3500, 6000), "boat", camera=(3, -12, 3)),
)

QUAD_UV = ((0, 0), (1, 0), (1, 1), (0, 1))
MIN_REVEAL = .22


def quad(m, vertices, slot, group=OPAQUE):
    m.face(vertices, QUAD_UV, slot, group, shade=False)


def loop(m, profile, y):
    return [m.vertex((x, y, z)) for x, z in profile]


def strip(m, a, b, slot, group=OPAQUE, closed=True):
    for j in range(len(a) if closed else len(a) - 1):
        k = (j + 1) % len(a)
        quad(m, (a[j], a[k], b[k], b[j]), slot, group)


def prism(m, profile, front, back, slot, group=OPAQUE):
    """Extrude a counterclockwise X/Z profile towards the back of the facade."""
    a, b = loop(m, profile, front), loop(m, profile, back)
    coords = np.asarray(profile)
    uv = ((coords - coords.min(axis=0)) / np.ptp(coords, axis=0)).tolist()
    m.face(a, uv, slot, group, shade=False)
    m.face(b[::-1], uv[::-1], slot, group, shade=False)
    strip(m, b, a, slot, group)


def outline(x, z, half, spring, rise, pointed=False, segments=10):
    """From the left spring point to the right, with an optional Gothic apex."""
    result = []
    for i in range(segments + 1):
        angle = math.pi * i / segments
        sideways = -math.cos(angle)
        curve = (1 - abs(sideways)) ** .67 if pointed else math.sin(angle)
        result.append((x + sideways * half, z + spring + rise * curve))
    return result


def stone_ring(m, inner, outer, front, back, closed=True):
    """A hollow extruded surround with modeled soffit, sides, and rear face."""
    i0, i1 = loop(m, inner, front), loop(m, inner, back)
    o0, o1 = loop(m, outer, front), loop(m, outer, back)
    strip(m, i0, o0, ROCK, closed=closed)
    strip(m, o1, i1, ROCK, closed=closed)
    strip(m, i1, i0, TRIM, closed=closed)
    strip(m, o0, o1, ROCK, closed=closed)
    if not closed:
        quad(m, (o0[0], o1[0], i1[0], i0[0]), ROCK)
        quad(m, (i0[-1], i1[-1], o1[-1], o0[-1]), ROCK)


def window(m, x, face, bottom, width, spring, rise, band_top, slot, pointed):
    """A solid recess cut into the wall band, with the light behind the masonry."""
    reveal_face, pane_face, wall_back = face - .24, face + .46, face + 1.20
    pane_back = pane_face + .23
    require(min(face - reveal_face, pane_face - face, pane_back - pane_face,
                wall_back - pane_back) >= MIN_REVEAL, "Insufficient solid window reveal")
    half, surround = width / 2, .24
    inner_arch = outline(x, bottom, half, spring, rise, pointed, segments=4)
    outer_arch = outline(x, bottom, half + surround, spring, rise + surround, pointed, segments=4)
    left, right = outer_arch[0][0], outer_arch[-1][0]
    outside = [(left, bottom - surround), *outer_arch, (right, bottom - surround)]
    inside = [(x-half, bottom), *inner_arch, (x+half, bottom)]
    stone_ring(m, inside, outside, reveal_face, face + .59)
    prism(m, inside[::-1], pane_face, pane_back, GLOW, EMIT)
    # The spandrel above the surround is actual wall volume. The facing
    # remains open between the trim and the solid amber panel.
    spandrel = [*outer_arch, (right, band_top), (left, band_top)]
    prism(m, spandrel, face, wall_back, slot)
    return left, right


def frontage(m, x, width, face, low, high, apertures, wall, pointed):
    wall_depth = 1.20
    y = face + wall_depth / 2
    bottom = low + .48
    # The horizontal stone sill closes the strip below the aperture and
    # extends past the face enough to cast a readable shadow at distance.
    m.box((x, y-.13, (low + bottom-.24)/2), (width, wall_depth+.26, bottom-.24-low), ROCK)
    previous = x - width / 2
    for offset, size, spring, rise in apertures:
        arch_scale = min(1, (high-bottom-.24-.25)/(spring+rise))
        left, right = window(m, x + offset, face, bottom, size, spring*arch_scale, rise*arch_scale,
                             high, wall, pointed)
        require(left-previous >= .14, "Window bays need substantial masonry between openings")
        m.box(((previous+left)/2, y, (high+bottom-.24)/2),
              (left-previous, wall_depth, high-bottom+.24), wall)
        previous = right
    right = x + width / 2
    m.box(((previous+right)/2, y, (high+bottom-.24)/2),
          (right-previous, wall_depth, high-bottom+.24), wall)


def hipped_roof(m, x, y, eave, width, depth, rise, hip):
    ex, ey = width / 2, depth / 2
    rim = [(x-ex, y-ey), (x+ex, y-ey), (x+ex, y+ey), (x-ex, y+ey)]
    lower = [m.vertex((*p, eave-.25)) for p in rim]
    upper = [m.vertex((*p, eave)) for p in rim]
    ridge = [m.vertex((x+sign*(ex-hip), y, eave+rise)) for sign in (-1, 1)]
    quad(m, lower[::-1], ROOF)
    strip(m, lower, upper, ROOF)
    quad(m, (upper[0], upper[1], ridge[1], ridge[0]), ROOF)
    quad(m, (upper[2], upper[3], ridge[0], ridge[1]), ROOF)
    m.face((upper[1], upper[2], ridge[1]), ((0, 0), (1, 0), (.5, 1)), ROOF, shade=False)
    m.face((upper[3], upper[0], ridge[0]), ((0, 0), (1, 0), (.5, 1)), ROOF, shade=False)
    m.tube([(x-ex+hip-.10, y, eave+rise), (x+ex-hip+.10, y, eave+rise)], [.13]*2, 8, ROOF)


def chimney(m, x, y, base, top):
    m.box((x, y, (top+base-.66)/2), (.52, .52, top-base-.66), WOOD)
    # A hollow octagonal funnel. The liner terminates on the chimney throat.
    cross_section = ((top-.86, .30), (top-.70, .43), (top-.20, .65),
                     (top, .68), (top, .45), (top-.22, .43), (top-.60, .25))
    rows = []
    for z, radius in cross_section:
        rows.append([m.vertex((x+radius*math.cos(a), y+radius*math.sin(a), z))
                     for a in np.linspace(0, math.tau, 8, endpoint=False)])
    for j, (a, b) in enumerate(zip(rows, rows[1:])):
        strip(m, a, b, ROOF if j < 4 else DETAIL)
    m.face(rows[0][::-1], [(.5+.45*math.cos(a), .5+.45*math.sin(a))
                         for a in np.linspace(math.tau*7/8, 0, 8)], ROOF, shade=False)
    m.face(rows[-1], [(.5+.45*math.cos(a), .5+.45*math.sin(a))
                      for a in np.linspace(0, math.tau, 8, endpoint=False)], DETAIL, shade=False)


def balcony(m, x, face, z, width):
    m.box((x, face-.53, z), (width, 1.40, .27), ROCK)
    m.box((x, face-.53, z-.115), (width-.23, 1.23, .25), TRIM)
    y = face-1.10
    rail = z+.97
    m.box((x, y, rail), (width-.16, .24, .23), ROCK)
    for position in np.linspace(x-width*.39, x+width*.39, round(width/.53)):
        m.stack(position, y, [(z+.125, .145), (z+.47, .104), (rail-.06, .14)], 5, TRIM)
    for sign in (-1, 1):
        side = x + sign*(width/2-.22)
        m.box((side, face-.695, rail+.024), (.24, .88, .23), ROCK)
        m.box((side, face-.47, (z+rail)/2), (.23, .23, rail-z), ROCK)


def canal_row(m, _rng):
    m.box((0, .16, -.60), (28, 9.68, .80), COVER)
    m.box((0, .14, .105), (27.89, 9.54, .61), ROCK)
    for x in np.linspace(-13.3, 13.3, 20):
        m.box((x, -4.68, .14), (1.26, .64, .37), TRIM)

    houses = (
        (-10.56, 6.53, -3.12, 8.94, .5, 11.97, PANEL),
        (-3.69, 7.05, -3.72, 10.12, 1.02, 12.50, BLOOM),
        (3.30, 6.65, -3.26, 9.29, .70, 11.73, SNOW),
        (10.14, 6.70, -3.58, 8.62, .39, 11.02, LEAF2),
    )
    for i, (x, w, y, top, ridge, chimney_top, wall) in enumerate(houses):
        back = 4.46 - i*.14
        front_of_block = y + 1.20
        m.box((x, (front_of_block+back)/2, (top+.36)/2),
              (w, back-front_of_block, top-.36), wall)
        gate = ((0, 1.38, 1.26, .62),)
        if i in (1, 2):
            gate = ((-1.89, .94, 1.25, .51), *gate, (1.89, .94, 1.25, .51))
        frontage(m, x, w, y, .38, 3.21, gate, TRIM, False)
        for level, (low, high) in enumerate(((3.21, 5.98), (5.98, top-.38))):
            if level == 0 and i in (1, 2):
                bays = ((-2.08, .75, 1.29, .74), (-.69, .66, 1.37, .80),
                        (.69, .66, 1.37, .80), (2.08, .75, 1.29, .74))
            elif level == 0:
                bays = ((-1.66, .91, 1.29, .74), (0, 1.03, 1.37, .80), (1.66, .91, 1.29, .74))
            elif i % 2:
                bays = ((-1.90, .86, 1.31, .61), (0, 1.11, 1.49, .62), (1.90, .86, 1.31, .61))
            else:
                bays = ((-1.22, 1.03, 1.21, .56), (1.22, 1.03, 1.21, .56))
            frontage(m, x, w, y, low, high, bays, wall, pointed=level==0 or i==1)
        for z, depth, h in ((3.25, .80, .23), (5.99, .68, .24), (top-.15, .90, .46)):
            m.box((x, y-.15, z), (w+.07, depth, h), ROCK)
        balcony(m, x, y, 3.29, 3.35 if i % 2 else 2.76)
        if i == 1:
            balcony(m, x, y, 6.02, 2.15)
        for side in (-1, 1):
            edge_x = x + side*(w/2-.25)
            for j in range(6):
                m.box((edge_x, y-.01, 3.56+j*.75), (.35 if j%2 else .46, .54, .29), TRIM)
        for j in range(9):
            corbel_x = x+(j/8-.5)*(w-.36)
            m.box((corbel_x, y-.12, top-.43), (.22, .56, .36), TRIM)

        hipped_roof(m, x, (y+back)/2, top+.12, w+.28, back-y+.39, ridge, .84)
        chimney(m, x-w*.27, (y+back)/2-1.24, top+.22, chimney_top)
        chimney(m, x+w*.28, (y+back)/2+1.48, top+.35, chimney_top-.65)

        # Framed end windows give the two exposed sides depth in oblique views.
        if i in (0, 3):
            sign = -1 if i == 0 else 1
            start = len(m.xyz)
            for offset, z in ((-.29, 3.66), (1.63, 6.45)):
                side_face = -sign*x - w/2 - .71
                ia = outline(offset, z, .46, 1.14, .52, segments=6)
                oa = outline(offset, z, .70, 1.14, .76, segments=6)
                inside = [(offset-.46, z), *ia, (offset+.46, z)]
                outside = [(offset-.70, z-.24), *oa, (offset+.70, z-.24)]
                stone_ring(m, inside, outside, side_face, side_face+.85)
                prism(m, inside[::-1], side_face+.24, side_face+.48, GLOW, EMIT)
            m.xyz[start:] = [(-sign*v, sign*u, z) for u, v, z in m.xyz[start:]]


def lantern(m, x, y, z, scale=1.):
    """An oversized metal frame and separate solid amber core."""
    def stack(layers, slot, group=OPAQUE, sides=8):
        m.stack(x, y, [(z+h*scale, r*scale) for h, r in layers], sides, slot, group=group)
    stack(((-.59, .13), (-.44, .34), (-.35, .39), (-.24, .31)), METAL)
    stack(((-.21, .23), (-.11, .29), (.23, .34), (.33, .27)), GLOW, EMIT)
    stack(((.34, .44), (.45, .46), (.61, .27), (.68, .105)), METAL)
    stack(((.67, .098), (.78, .115), (.88, .041)), METAL, sides=6)
    for i in range(6):
        a = math.tau*i/6
        u, v = math.cos(a), math.sin(a)
        beam(m, (x+u*.32*scale, y+v*.32*scale, z-.34*scale),
             (x+u*.42*scale, y+v*.42*scale, z+.39*scale), .16*scale, .17*scale, METAL)


def rialto(m, _rng):
    def deck(x):
        return 1.02 + 3.63*(1-abs(x)/12)**.84

    # The whole underside is one stone vault. The floor of each shoreline
    # pier starts at -1 m. No mesh crosses the navigable opening.
    half = 8.45
    samples = [(-12, -1), (-half, -1)]
    samples.extend(outline(0, -1, half, 0, 5.01, segments=28)[1:-1])
    samples.extend(((half, -1), (12, -1)))
    groups = []
    for x, h in samples:
        groups.append([m.vertex((x, y, z)) for y, z in
                       ((-4.02, h), (4.02, h), (4.02, deck(x)), (-4.02, deck(x)))])
    for i, (a, b) in enumerate(zip(groups, groups[1:])):
        for j, slot in enumerate((COVER, ROCK, TRIM, ROCK)):
            k = (j+1) % 4
            quad(m, (a[j], a[k], b[k], b[j]), slot)
    quad(m, groups[0][::-1], ROCK)
    quad(m, groups[-1], ROCK)

    arch = outline(0, -1, half, 0, 5.01, segments=28)
    for sign in (-1, 1):
        # Projecting keyed voussoirs follow the vault and stay out of the channel.
        for i in range(len(arch)-1):
            p, q = np.asarray(arch[i]), np.asarray(arch[i+1])
            a, b = mix(p, q, .025), mix(p, q, .975)
            thickness = .40 + (.19 if i in (13, 14) else 0)
            def raised(pt):
                return pt + ((pt[0]/half)*.36, thickness)
            prism(m, [a-(0, .24), b-(0, .24), raised(b), raised(a)], min(sign*3.94, sign*4.25),
                  max(sign*3.94, sign*4.25), TRIM if i%4 else ROCK)
        rail = []
        for j in range(23):
            x = -11.6+j*(23.2/22)
            y = sign*3.91
            z = deck(x)
            height = .78 if abs(x) < 10.9 else .92
            m.stack(x, y, [(z-.08, .17), (z+.34, .113), (z+height, .16)], 6, ROCK)
            rail.append((x, y, z+height))
        section(m, rail, [.29]*len(rail), [.23]*len(rail), TRIM)

    for side in (-1, 1):
        for j in range(9):
            x = side*(8.75+j*.34)
            z = deck(x)
            m.box((x, 0, z+.053), (.34, 7.53, .28), ROCK if j%2 else TRIM)

    # The gallery is porous on both sides. Each stepped roof has whole
    # extruded arches instead of a facade with painted-in voids.
    posts = (-8.17, -4.90, -1.67, 1.67, 4.90, 8.17)
    springs = (5.32, 5.91, 6.80, 5.91, 5.32)
    crowns = (7.18, 7.77, 8.66, 7.77, 7.18)
    for i, (left, right) in enumerate(zip(posts, posts[1:])):
        x, w = (left+right)/2, right-left
        spring, top = springs[i], crowns[i]
        for y in (-2.43, 2.43):
            for side in (-1, 1):
                # The piers belong to their bay, meeting the next bay at its joint.
                px = x+side*(w/2-.18)
                base = deck(px)-.12
                m.box((px, y, (base+spring+.18)/2), (.36, .68, spring+.18-base), ROCK)
                m.box((px-side*.05, y, base+.14), (.43, .79, .42), TRIM)
                m.box((px-side*.064, y, spring-.09), (.46, .83, .28), TRIM)
            inner = outline(x, spring, w/2-.27, 0, 1.16, segments=12)
            outer = outline(x, spring, w/2-.05, 0, 1.58, segments=12)
            stone_ring(m, inner, outer, y-.39, y+.39, closed=False)
            prism(m, [*outer, (outer[-1][0], top), (outer[0][0], top)], y-.39, y+.39, TRIM)

        for y in (-2.54, 2.54):
            m.box((x, y, top-.09), (w+.04, .92, .32), ROCK)
        roof_rise = 1.66 if i==2 else 1.08
        hipped_roof(m, x, 0, top+.05, w+.14, 6.21, roof_rise, .67)
    # Both lamps sit above the walking surface and stand off the parapet.
    for x in (-8.82, 8.82):
        z = deck(x)
        y = -3.59
        m.stack(x, y, [(z-.12, .24), (z+.16, .24), (z+.45, .15),
                        (z+2.36, .11), (z+2.54, .16)], 10, METAL)
        lantern(m, x, y, z+2.78, .78)


def bricola(m, _rng):
    def post(x, y, height, radius):
        levels = ((-1.2, .99, COVER), (-.40, 1.01, COVER), (.16, 1.03, COVER),
                  (.43, 1.0, BARK), (1.21, .98, BARK), (2.30, .94, BARK),
                  (height-.18, .90, BARK), (height, .74, WOOD))
        phase = math.atan2(y, x)*.21
        rows = []
        for z, width, _ in levels:
            inward = 1-.18*(z+1.2)/(height+1.2)
            rows.append([m.vertex((x*inward+radius*width*math.cos(a), y*inward+radius*width*math.sin(a), z))
                         for a in np.linspace(phase, phase+math.tau, 12, endpoint=False)])
        for i, (a, b) in enumerate(zip(rows, rows[1:])):
            slot = levels[i][2]
            low, high = (-1.2, .43) if slot==COVER else (.43, height)
            v0, v1 = ((levels[j][0]-low)/(high-low) for j in (i, i+1))
            for j in range(12):
                k = (j+1) % 12
                u0, u1 = j/12, (j+1)/12
                m.face((a[j], a[k], b[k], b[j]), ((u0,v0), (u1,v0), (u1,v1), (u0,v1)),
                       slot, shade=False)
        for row, reverse in ((rows[0], True), (rows[-1], False)):
            order = list(range(11, -1, -1) if reverse else range(12))
            m.face([row[j] for j in order], [(.5+.46*math.cos(j*math.tau/12),
                   .5+.46*math.sin(j*math.tau/12)) for j in order], WOOD, shade=False)
        for z in (1.01, 2.07):
            f = 1-.18*(z+1.2)/(height+1.2)
            m.stack(x*f, y*f, [(z-.12, radius*1.08), (z-.07, radius*1.18),
                                (z+.07, radius*1.18), (z+.12, radius*1.08)], 10, METAL)

    for x, y, height, radius in ((-.65, -.58, 3.09, .42), (.71, -.50, 2.59, .42),
                                  (.64, .69, 2.90, .40), (-.62, .62, 2.75, .43)):
        post(x, y, height, radius)
    def wrap(t):
        power = .50
        u, v = math.cos(t), math.sin(t)
        return (1.14*math.copysign(abs(u)**power, u), 1.13*math.copysign(abs(v)**power, v),
                1.37+.150*t/math.tau+.049*math.sin(t))
    path = [wrap(t) for t in np.linspace(.17, math.tau*2.06, 50)]
    m.tube(path, [.071]*len(path), 7, WEAVE)
    m.tube([path[-1], (.80, -.72, 1.62), (.82, -.82, 1.27), (.77, -.83, 1.09)],
           [.074, .074, .071, .065], 7, WEAVE)
    m.box((0, 0, 2.76), (1.32, 1.20, .24), BARK, angle=.09)
    m.stack(.03, -.055, [(2.77, .25), (2.99, .27), (3.19, .13)], 10, METAL)
    lantern(m, .03, -.055, 3.43, .65)


def hull(m):
    cross_section = ((0, 1), (-.76, .97), (-1, .84), (-1, .53), (-.91, .23),
                     (-.70, .03), (-.43, 0), (.43, 0), (.70, .03), (.91, .23),
                     (1, .53), (1, .84), (.76, .97))
    colors = (WOOD, TRIM, DETAIL, LEAF, DETAIL, COVER, COVER, COVER, DETAIL, LEAF, DETAIL, TRIM, WOOD)
    def contour(t, u, v):
        width = .102+1.498*max(0, math.sin(math.pi*t))**.58
        tip = abs(2*t-1)**4
        sheer = .85+.84*tip+.32*t**8
        keel = -.5+1.08*tip+.48*t**9
        return (11*(t-.5), width*u, keel+v*(sheer-keel))
    segments = 28
    rows = [[m.vertex(contour(i/segments, u, v)) for u, v in cross_section] for i in range(segments+1)]
    for i, (a, b) in enumerate(zip(rows, rows[1:])):
        for j, slot in enumerate(colors):
            k = (j+1)%len(a)
            u, v = (i%7)/7, (i%7+1)/7
            m.face((a[j], a[k], b[k], b[j]), ((u, 0), (u, 1), (v, 1), (v, 0)), slot, shade=False)
    cap = [(.50+.445*u, .055+.89*v) for u, v in cross_section]
    m.face(rows[0][::-1], cap[::-1], BARK, shade=False)
    m.face(rows[-1], cap, BARK, shade=False)
    for side in (-1, 1):
        path = [np.asarray(contour(t, side*.86, .92))+(0, side*.061, .076) for t in np.linspace(.01,.99,22)]
        section(m, path, [.22]*len(path), [.22]*len(path), TRIM)
    for t in (.18, .27, .73, .82):
        x, _, z = contour(t, 0, 1)
        _, y, _ = contour(t, .68, 1)
        m.box((x, 0, z+.04), (.33, y*2, .25), WOOD)
    return contour


def sail(m, corners, slot_pattern, thickness=.19):
    lower_left, lower_right, upper_left, upper_right = map(np.asarray, corners)
    def point(u, v, side):
        p = mix(mix(lower_left, lower_right, u), mix(upper_left, upper_right, u), v)
        belly = math.sin(math.pi*u)*math.sin(math.pi*v)
        return p + (0, -.68*belly + side*thickness/2, .16*belly)
    nu, nv = 5, 11
    skins = []
    for side in (-1, 1):
        grid = [[m.vertex(point(i/nu, j/nv, side)) for j in range(nv+1)] for i in range(nu+1)]
        for i in range(nu):
            for j in range(nv):
                face = (grid[i][j], grid[i+1][j], grid[i+1][j+1], grid[i][j+1])
                uv = tuple((u, v) for u, v in ((i/nu,j/nv),((i+1)/nu,j/nv),
                                               ((i+1)/nu,(j+1)/nv),(i/nu,(j+1)/nv)))
                slot = slot_pattern[j]
                m.face(face if side<0 else face[::-1], uv if side<0 else uv[::-1], slot, shade=True)
        skins.append(grid)
    edges = [point for edge in (
        [(i, 0) for i in range(nu+1)], [(nu, j) for j in range(1, nv+1)],
        [(i, nv) for i in range(nu-1,-1,-1)], [(0, j) for j in range(nv-1,0,-1)])
        for point in edge]
    a, b = [[skin[i][j] for i, j in edges] for skin in skins]
    strip(m, b, a, TRIM)
    for v in (0, 1):
        path = [point(u, v, 0) for u in np.linspace(0, 1, 8)]
        section(m, path, [.22]*8, [.22]*8, WOOD)


def bragozzo(m, _rng):
    contour = hull(m)
    rigs = (
        (-2.08, (-4.48,-.03,1.64), (-1.01,-.03,2.02), (-3.70,.16,5.13), (-.84,.03,4.44), 5.31),
        (1.85, (-.56,-.12,1.44), (4.80,-.03,2.12), (-.40,.25,6.45), (4.16,.10,5.57), 6.70),
    )
    for x, foot, clew, peak, throat, head in rigs:
        top = (x-.43, .17, head)
        m.tube([(x,.14,.32), (x-.11,.14,head*.5), top], [.156,.128,.095], 12, WOOD)
        m.stack(x-.43,.17,[(head-.23,.13),(head-.075,.15),(head,.11)], 10, TRIM)
        sail(m, (foot, clew, peak, throat),
             (ROOF, ROOF, NEEDLE, NEEDLE, PANEL, PANEL, ROOF, ROOF, NEEDLE, NEEDLE, ROOF))
        for side in (-1, 1):
            t = (x+5.5)/11
            anchor = contour(t-.035, side*.85, .98)
            middle = mix(anchor, top, .58)+(0, side*.07, -.06)
            m.tube([anchor, middle, top], [.064, .05, .045], 6, WEAVE)
        for corner in (foot, clew):
            tx = max(.06, min(.94, (corner[0]+5.5)/11))
            anchor = contour(tx, -.63, .98)
            m.tube([anchor, mix(anchor, corner, .55)+(0, -.11, -.05), corner], [.071,.052,.043], 6, WEAVE)

    for i in range(12):
        x = -.9+i*.19
        m.box((x, 0, 1.02), (.188, 1.66, .27), WOOD if i%2 else BARK)
    m.box((-3.70, .09, 1.29), (1.57, 1.15, .53), LEAF)
    hipped_roof(m, -3.70, .09, 1.73, 1.82, 1.39, .18, .35)
    m.stack(-4.21, -.58, [(1.24,.106), (1.82,.095), (1.92,.12)], 8, METAL)
    lantern(m, -4.21, -.58, 1.97, .45)
    m.tube([(-5.42, .13, .67), (-5.27, .12, 1.37), (-4.84, .10, 1.59)], [.13,.12,.09], 8, BARK)


PALETTE = factory.basic_palette() | {
    WOOD: Surface((.37,.21,.115), .67, "wood"),
    BARK: Surface((.30,.23,.16), .80, "bark"),
    TRIM: Surface((.68,.60,.46), .73, "stone"),
    ROCK: Surface((.76,.71,.60), .74, "sandstone"),
    COVER: Surface((.24,.29,.17), .73, "sand_moss", (.40,.44,.22)),
    DETAIL: Surface((.107,.156,.149), .62, "wood"),
    METAL: Surface((.125,.146,.154), .48, "seams"),
    GLOW: Surface((.92,.49,.145), .62, "paper"),
    ROOF: Surface((.49,.177,.094), .71, "seams"),
    PANEL: Surface((.68,.364,.127), .77, "stone"),
    BLOOM: Surface((.58,.28,.265), .79, "stone"),
    SNOW: Surface((.82,.71,.51), .79, "stone"),
    LEAF: Surface((.45,.128,.083), .53, "lacquer"),
    LEAF2: Surface((.57,.213,.115), .81, "stone"),
    NEEDLE: Surface((.88,.765,.551), .77, "canvas"),
    WEAVE: Surface((.48,.335,.189), .76, "weave"),
}


def materials(model, asset, palette, seed):
    """Bake the procedural atlas swatches to packed WebP-exportable PBR images in Cycles."""
    mats = factory.pbr_materials(model, asset, palette, seed)
    plane_mat = bpy.data.materials.new("Cycles atlas bake")
    plane_mat.use_nodes = True
    tree = plane_mat.node_tree
    tree.nodes.clear()
    source = tree.nodes.new("ShaderNodeTexImage")
    source.interpolation = "Closest"
    emit = tree.nodes.new("ShaderNodeEmission")
    tree.links.new(source.outputs["Color"], emit.inputs["Color"])
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    tree.links.new(emit.outputs[0], output.inputs["Surface"])
    target = tree.nodes.new("ShaderNodeTexImage")
    tree.nodes.active = target

    bpy.ops.mesh.primitive_plane_add()
    plane = bpy.context.object
    plane.data.materials.append(plane_mat)
    factory.select_only(plane)
    scene = bpy.context.scene
    scene.cycles.samples = 1
    image_nodes = [node for mat in mats for node in mat.node_tree.nodes if node.type == "TEX_IMAGE"]
    for original in dict.fromkeys(node.image for node in image_nodes):
        source.image = original
        data = original.colorspace_settings.is_data
        baked = bpy.data.images.new(original.name+"_bake", asset.size, asset.size, alpha=False, is_data=data)
        target.image = baked
        require("FINISHED" in bpy.ops.object.bake(type="EMIT", margin=0), f"Cycles bake failed for {original.name}")
        pixels = np.empty(asset.size*asset.size*4, dtype=np.float32)
        baked.pixels.foreach_get(pixels)
        require(float(np.max(pixels[::4])) > .10, f"Empty Cycles bake for {original.name}")
        baked.pack()
        name = original.name
        for node in image_nodes:
            if node.image == original:
                node.image = baked
        bpy.data.images.remove(original)
        baked.name = name
    mesh = plane.data
    bpy.data.objects.remove(plane, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    bpy.data.materials.remove(plane_mat)
    return mats


def generate():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=20261203)
    parser.add_argument("--output-root", type=Path, default=factory.ROOT)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    require(bpy.app.background and args.seed >= 0, "Use Blender in background with a non-negative seed")
    root = args.output_root.resolve()
    dest = Path("public/assets/scenes/venice")
    preview = Path("tools/blender/preview_venice_midground.png")
    original = root/dest/"manifest.json"
    require(original.is_file(), "Expected a Venice manifest and six original GLBs in the output root")
    mid_names = {spec.name for spec in SPECS}

    with tempfile.TemporaryDirectory(prefix=".venice-midground-", dir=root) as temp:
        work = Path(temp)
        assets = work/"venice"
        assets.mkdir()
        rows = []
        for i, (spec, build) in enumerate(zip(SPECS, (canal_row, rialto, bricola, bragozzo))):
            row = factory.export(spec, build, PALETTE, args.seed+113*i, assets, work, material_builder=materials)
            print(f"Verified {row['file']} — {row['triangles']} tris, {row['fileBytes']} bytes", flush=True)
            rows.append(row)
        for spec, row in zip(SPECS, rows):
            factory.preview_image(spec, row, assets, work)
        target = work/preview.name
        job = dict(title="威尼斯水巷 · 中景", english="Venice Grand Canal · Midground",
                   colors=("#e9ddd0", "#302827", "#6c5b55", "#87482f", "#d0c2b9"),
                   width=1311, assets=rows, work=str(work), target=str(target))
        try:
            import PIL
        except ImportError:
            layout = work/"layout.json"
            factory.write_json(layout, job)
            subprocess.run(["python3", factory.__file__, "--compose-pack", str(layout)], check=True)
        else:
            factory.compose(job)

        require(target.stat().st_size > 100_000, "Incomplete Cycles contact sheet")
        with factory.catalog_lock(root/dest):
            # Validate against the originals under the same lock used by
            # the shared exporter, then publish only the midground files.
            pack = json.loads(original.read_text(encoding="utf-8"))
            original_rows = [row for row in pack["assets"] if row["name"] not in mid_names]
            require(pack["packId"] == "venice" and len(original_rows) == 6, "Expected six original Venice assets")
            for row in original_rows:
                shutil.copy2(root/dest/row["file"], assets/row["file"])
            pack["assets"] = original_rows + rows
            manifest = assets/"manifest.json"
            factory.write_json(manifest, pack)
            validator = Path(factory.__file__).with_name("validate_scene_pack.mjs")
            subprocess.run(["node", str(validator), str(manifest)], check=True)
            staged = [(assets/row["file"], root/dest/row["file"]) for row in rows]
            staged.extend(((manifest, original), (target, root/preview)))
            published = []
            try:
                for src, out in staged:
                    backup = work/(out.name+".previous")
                    if out.exists():
                        shutil.copy2(out, backup)
                    src.replace(out)
                    published.append((out, backup))
            except OSError:
                for out, backup in reversed(published):
                    if backup.exists():
                        backup.replace(out)
                    else:
                        out.unlink()
                raise


if __name__ == "__main__":
    generate()
