# v5.0 suburban infill: OSM has few building footprints in parts of the outer ring, so residential / commercial /
# industrial land there looks emptier than the centre. Along the streets of those zones, empty lots are filled with
# buildings in the same 12-byte format (attributes sampled from real buildings of the same tile, else of the ring),
# kept clear of roads, rails, existing buildings and no-build land. New records are APPENDED to each tile (indices of
# existing buildings stay valid for the start-up bake / cleared keys).
# usage: python3 -I tools/v5/infill.py data/world.json data/tiles landuse.npz [jobs]   (edits data/tiles in place)
import sys, os, json, math, struct, random, glob
import numpy as np
from multiprocessing import Pool
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ext'))
import pack
WORLD, TILES, LU = sys.argv[1], sys.argv[2], sys.argv[3]
JOBS = int(sys.argv[4]) if len(sys.argv) > 4 else 2
T, P5 = 1280, 5
# old (v3.6) frame: dense real data, untouched
OX0, OX1, OZ0, OZ1 = -29395, 28491, -32175, 37723
G = 2.0  # occupancy grid (m)
N = int(T / G)

def load_globals():
    W = json.load(open(WORLD))
    nodes = W['nodes']
    segs = {}  # tile key -> list of (x0,z0,x1,z1,half width, kind)
    def add(x0, z0, x1, z1, hw, k):
        for tx in range(int(math.floor(min(x0, x1) / T)), int(math.floor(max(x0, x1) / T)) + 1):
            for tz in range(int(math.floor(min(z0, z1) / T)), int(math.floor(max(z0, z1) / T)) + 1):
                segs.setdefault((tx, tz), []).append((x0, z0, x1, z1, hw, k))
    for e in W['edges']:
        a, b, kind, name, pts, hw10 = e[:6]
        side = (e[8] if len(e) > 8 else 0) / 10
        top = e[9] if len(e) > 9 else 0
        P = [nodes[a][:2]] + [p[:2] for p in pts] + [nodes[b][:2]]
        for i in range(len(P) - 1):
            add(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], hw10 / 10 + side, 'elev' if top else kind)
    for r in W['rails']:
        p = r['path']
        hw = 6.5 if r['kind'] in ('el', 'sub') else 4.5
        for i in range(len(p) - 1):
            add(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], hw, 'rail')
    return segs

def lu_tile(LUA, x0, z0):
    s = int(LUA['s']); lu = LUA['lu']
    i0 = int((x0 - LUA['x0']) // s); j0 = int((z0 - LUA['z0']) // s); n = T // s
    out = np.zeros((n, n), np.uint8)
    J0, J1 = max(0, j0), min(lu.shape[0], j0 + n); I0, I1 = max(0, i0), min(lu.shape[1], i0 + n)
    if J1 > J0 and I1 > I0: out[J0 - j0:J1 - j0, I0 - i0:I1 - i0] = lu[J0:J1, I0:I1]
    return np.kron(out, np.ones((s // int(G), s // int(G)), np.uint8))  # to the 2 m grid

def stamp_rect(occ, gx0, gz0, cx, cz, rot, w, d, margin=0.0, test=False):
    # rotated rectangle on the grid (local x along (cos rot, sin rot))
    c, s = math.cos(rot), math.sin(rot)
    hw, hd = w / 2 + margin, d / 2 + margin
    R = math.hypot(hw, hd)
    i0 = max(0, int((cx - R - gx0) / G)); i1 = min(N - 1, int((cx + R - gx0) / G))
    j0 = max(0, int((cz - R - gz0) / G)); j1 = min(N - 1, int((cz + R - gz0) / G))
    if i1 < i0 or j1 < j0: return True if test else None
    xs = gx0 + (np.arange(i0, i1 + 1) + 0.5) * G; zs = gz0 + (np.arange(j0, j1 + 1) + 0.5) * G
    X, Z = np.meshgrid(xs - cx, zs - cz)
    u = X * c + Z * s; v = -X * s + Z * c
    m = (np.abs(u) <= hw) & (np.abs(v) <= hd)
    if test: return bool((occ[j0:j1 + 1, i0:i1 + 1] & m).any())
    occ[j0:j1 + 1, i0:i1 + 1] |= m

def stamp_seg(occ, gx0, gz0, x0, z0, x1, z1, hw):
    L = math.hypot(x1 - x0, z1 - z0)
    if L < 0.01: return
    stamp_rect(occ, gx0, gz0, (x0 + x1) / 2, (z0 + z1) / 2, math.atan2(z1 - z0, x1 - x0), L + 2 * hw, 2 * hw)

def stamp_poly(occ, gx0, gz0, pts, margin):
    from PIL import Image, ImageDraw
    im = Image.new('1', (N, N), 0)
    ImageDraw.Draw(im).polygon([((x - gx0) / G, (z - gz0) / G) for x, z in pts], fill=1, outline=1)
    m = np.array(im, dtype=bool)
    if margin > 0:
        k = int(math.ceil(margin / G))
        m2 = m.copy()
        for dy in range(-k, k + 1):
            for dx in range(-k, k + 1):
                m2 |= np.roll(np.roll(m, dy, 0), dx, 1)
        m = m2
    occ |= m

RING_POOL = None
def process(fn):
    rnd = random.Random(hash(os.path.basename(fn)) & 0xffffffff)
    b = open(fn, 'rb').read()
    px, pz, tiles = pack.parse_raw(b)
    added = 0
    for o, t in enumerate(tiles):
        tx, tz = px * P5 + o // P5, pz * P5 + o % P5
        cx, cz = (tx + 0.5) * T, (tz + 0.5) * T
        gx0, gz0 = tx * T, tz * T
        if OX0 <= cx < OX1 and OZ0 <= cz < OZ1: continue
        lu = lu_tile(LUA, gx0, gz0)
        recs = [struct.unpack('<hhBBBBHBB', r) for r in t['bld']]
        if len(recs) < 20: continue
        # settlement mask: OSM rarely tags residential land in the suburbs, so "town" = urban land use OR at least 4
        # real buildings within ~56 m; farmland, forest, water, parks etc. are never built on
        hist = np.zeros((80, 80), np.float32)
        for r in recs:
            i, j = int((r[0] / 10 + 640) // 16), int((r[1] / 10 + 640) // 16)
            0 <= i < 80 and 0 <= j < 80 and hist.__setitem__((j, i), hist[j, i] + 1)
        k = 3
        pad = np.pad(hist, k)
        dens = sum(pad[k + dy:k + dy + 80, k + dx:k + dx + 80] for dy in range(-k, k + 1) for dx in range(-k, k + 1))
        town = np.kron(dens >= 4, np.ones((8, 8), bool))
        urban = (lu == 1) | (lu == 2) | (lu == 3)
        allowed = (urban | town) & ~((lu == 4) | (lu == 5) | (lu == 9))
        if not allowed.any(): continue
        occ = ~allowed
        # existing buildings (with a 1.5 m gap) and their outlines
        polyIdx = {bi for bi, n, pts in t['polys']}
        for i, r in enumerate(recs):
            bx, bz = cx + r[0] / 10, cz + r[1] / 10
            stamp_rect(occ, gx0, gz0, bx, bz, r[2] / 255 * math.pi, r[3] / 4, r[4] / 4, 1.5)
        for bi, n, pts in t['polys']:
            P = [(cx + struct.unpack_from('<hh', pts, 4 * j)[0] / 10, cz + struct.unpack_from('<hh', pts, 4 * j)[1] / 10) for j in range(n)]
            stamp_poly(occ, gx0, gz0, P, 1.5)
        # streets of the tile + global roads / rails
        nodes = [(cx + a / 10, cz + bb / 10) for a, bb in t['nodes']]
        streets = []
        for hdr, pts in t['edges']:
            ea, eb, k, hw10, ln, sd10, n = hdr
            P = [(cx + a / 10, cz + bb / 10) for a, bb in pts]
            hw = hw10 / 10 + sd10 / 10
            for i in range(len(P) - 1):
                stamp_seg(occ, gx0, gz0, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], hw + 1.0)
                streets.append((P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], hw))
        for x0, z0, x1, z1, hw, k in SEGS.get((tx, tz), []):
            stamp_seg(occ, gx0, gz0, x0, z0, x1, z1, hw + (3.0 if k == 'rail' else 1.0))
            if k in ('A', 'B', 'L'): streets.append((x0, z0, x1, z1, hw))
        # attributes to copy: real buildings of this tile by type, else of the whole ring
        bytype = {}
        for r in recs: bytype.setdefault(r[5], []).append(r)
        cap = max(0, int(len(recs) * 1.6) + 40)
        rnd.shuffle(streets)
        new = []
        for x0, z0, x1, z1, hw in streets:
            L = math.hypot(x1 - x0, z1 - z0)
            if L < 8: continue
            dx, dz = (x1 - x0) / L, (z1 - z0) / L
            rot = math.atan2(dz, dx) % math.pi
            for side in (-1, 1):
                nx, nz = -dz * side, dx * side
                s = rnd.uniform(1, 6)
                while s < L - 4 and len(new) < cap:
                    px_, pz_ = x0 + dx * s, z0 + dz * s
                    gi, gj = int((px_ + nx * (hw + 6) - gx0) / G), int((pz_ + nz * (hw + 6) - gz0) / G)
                    if not (0 <= gi < N and 0 <= gj < N): s += 6; continue
                    cls = lu[gj, gi]
                    if not allowed[gj, gi]: s += 8; continue
                    cls in (1, 2, 3) or (cls := 1)
                    if cls == 1:
                        if rnd.random() < 0.85: t5, w, d, h = 0, rnd.uniform(7, 10), rnd.uniform(8, 11), rnd.uniform(5.6, 7.8)
                        else: t5, w, d, h = 1, rnd.uniform(12, 24), rnd.uniform(9, 13), rnd.choice([9.4, 12.7, 16.0, 19.3])
                    elif cls == 2:
                        if rnd.random() < 0.6: t5, w, d, h = 5, rnd.uniform(10, 18), rnd.uniform(12, 18), rnd.uniform(6, 11)
                        else: t5, w, d, h = 2, rnd.uniform(12, 20), rnd.uniform(12, 18), rnd.uniform(12, 24)
                    elif cls == 3: t5, w, d, h = 2, rnd.uniform(20, 45), rnd.uniform(18, 35), rnd.uniform(7, 13)
                    else: s += 8; continue
                    off = hw + rnd.uniform(1.0, 2.5) + d / 2
                    bx, bz = px_ + dx * w / 2 + nx * off, pz_ + dz * w / 2 + nz * off
                    if not stamp_rect(occ, gx0, gz0, bx, bz, rot, w, d, 0.6, test=True):
                        stamp_rect(occ, gx0, gz0, bx, bz, rot, w, d, 1.2)
                        pool = bytype.get(t5) or RING_POOL.get(t5) or recs
                        src = pool[rnd.randrange(len(pool))] if pool else (0, 0, 0, 0, 0, t5, 60, 0, 128)
                        if t5 in bytype and src[6] > 0 and t5 in (0, 5):
                            h = src[6] / 10 * rnd.uniform(0.9, 1.1)  # match the street's real heights
                        rec = struct.pack('<hhBBBBHBB', int(round((bx - cx) * 10)), int(round((bz - cz) * 10)), int(round(rot / math.pi * 255)) % 256,
                                          min(255, int(round(w * 4))), min(255, int(round(d * 4))), t5, min(65535, int(round(h * 10))), src[7], src[8])
                        new.append(rec)
                        s += w + rnd.uniform(1.2, 3.0)
                    else:
                        s += rnd.uniform(2.5, 5)
        if new:
            t['bld'] = t['bld'] + new
            t['wc'] = True
            added += len(new)
    if added:
        open(fn, 'wb').write(pack.build(px, pz, tiles))
    return os.path.basename(fn), added

def init(segs, lua, ring):
    global SEGS, LUA, RING_POOL
    SEGS, LUA, RING_POOL = segs, lua, ring

if __name__ == '__main__':
    D = np.load(LU)
    lua = {'lu': D['lu'], 'x0': int(D['x0']), 'z0': int(D['z0']), 's': int(D['s'])}
    segs = load_globals()
    files = sorted(glob.glob(os.path.join(TILES, '*.bin')))
    ring = {}
    # ring-wide attribute pool by type (sample of real ring buildings)
    for fn in files[::7]:
        px, pz, tiles = pack.parse_raw(open(fn, 'rb').read())
        for t in tiles:
            for r in t['bld'][::25]:
                v = struct.unpack('<hhBBBBHBB', r); ring.setdefault(v[5], []).append(v)
    init(segs, lua, ring)
    tot = 0
    with Pool(JOBS, initializer=init, initargs=(segs, lua, ring)) as pl:
        for name, n in pl.imap_unordered(process, files):
            tot += n
            n and print(name, n, flush=True)
    print('added', tot)
