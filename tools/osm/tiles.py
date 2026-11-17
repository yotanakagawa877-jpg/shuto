# v3.3: graph.pkl + OSM buildings -> data/world.json (global road graph) and data/tiles/*.bin (streamed packs)
# Pack = 5 x 5 tiles of 1280 m; a tile holds its streets (L), buildings (12-byte records, coords relative to tile centre)
# and (v3.3b) the outlines of the buildings that are not boxes (triangular / polygonal prisms).
# Pack format v2: int32 px, pz; 25 x (u32 streetOff, streetLen, bldOff, bldLen, polyOff, polyLen); blob.
# Roads get their own width / lanes from OSM (lanes, width, merged carriageways) and one-way flags.
# usage: python3 -I tools/osm/tiles.py OSMDIR WORLD_IN WORLD_OUT TILEDIR
import sys, os, math, json, pickle, struct, collections, zlib, hashlib
import numpy as np
import shapely
from shapely import STRtree

OSM, WIN, WOUT, TD = sys.argv[1:5]
os.makedirs(TD, exist_ok=True)
TILE = 1280; PACK = 5
ROADW = {'X': 17, 'A': 22, 'B': 15, 'T': 7, 'L': 7, 'S': 7, 'R': 8}
KIDX = {'X': 0, 'A': 1, 'B': 2, 'T': 3, 'L': 3, 'S': 3, 'R': 4}
GLOBAL = {'X', 'A', 'B', 'T', 'R'}
A9 = math.cos(35.64 * math.pi / 180) * 111320; R9 = 110950
def xz(lng, lat): return ((lng - 139.755) * A9, -(lat - 35.64) * R9)

G = pickle.load(open(os.path.join(OSM, 'graph.pkl'), 'rb')); N = G['nodes']; E = G['edges']
world = json.load(open(WIN))

# ---------------- connectivity: pieces of the major network that only meet the rest through small streets get the
# shortest such streets promoted to the global graph (as L), so buses / taxis / GPS can route everywhere
import heapq
def promote():
    adj = collections.defaultdict(list)
    for k, e in enumerate(E):
        p = [N[e[0]][:2]] + e[4] + [N[e[1]][:2]]
        L = sum(math.dist(p[i], p[i + 1]) for i in range(len(p) - 1))
        if e[2] == 'X': continue
        adj[e[0]].append((k, e[1], L)); adj[e[1]].append((k, e[0], L))
    par = {}
    def f(a):
        par.setdefault(a, a)
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    def uni(a, b):
        a, b = f(a), f(b)
        if a != b: par[a] = b
    gN = set()
    for e in E:
        if e[2] in GLOBAL and e[2] != 'X': uni(e[0], e[1]); gN.add(e[0]); gN.add(e[1])
    comps = collections.defaultdict(list)
    for n in gN: comps[f(n)].append(n)
    main = max(comps, key=lambda c: len(comps[c]))
    promoted = 0; joined = 0
    for c, mem in sorted(comps.items(), key=lambda kv: -len(kv[1])):
        if f(mem[0]) == f(main): continue
        dist = {n: 0.0 for n in mem}; prev = {}; hq = [(0.0, n) for n in mem]; heapq.heapify(hq); hit = None
        while hq:
            d, n = heapq.heappop(hq)
            if d > dist.get(n, 1e18): continue
            if d > 4000: break
            if n in gN and f(n) == f(main): hit = n; break
            for k, m, L in adj[n]:
                nd = d + L * (1.0 if E[k][2] in ('L', 'T', 'A', 'B', 'R') else 1.6)
                if nd < dist.get(m, 1e18): dist[m] = nd; prev[m] = (n, k); heapq.heappush(hq, (nd, m))
        if hit is None: continue
        n = hit
        while n in prev:
            pn, k = prev[n]
            if E[k][2] in ('L', 'S'): E[k][2] = 'T'; promoted += 1
            gN.add(n); gN.add(pn); uni(n, pn); n = pn
        uni(mem[0], main); joined += 1
    print('connectivity: joined', joined, 'of', len(comps) - 1, 'pieces, promoted streets', promoted)
promote()

# ---------------- road widths from OSM: (half width, lanes, sidewalk, one-way, flyover height)
def lvlH(ly): return 12 + 6.5 * (min(4, max(1, ly)) - 1)
def width(e):
    g, h, du, ow, ln, wd, ly = e[2], e[5], e[6], e[7], e[8], e[9], e[10]
    if g == 'X':
        n = ln or 2
        if not ow: n = max(1, (ln or 4) // 2)
        return n * 1.75 + 1.25 if ow else n * 3.5 + 1.0, min(4, n), 0, ow, lvlH(ly) if ly >= 2 else 0
    if g == 'R':
        n = ln or 1
        return n * 1.75 + 1.0, min(3, n), 0, ow, lvlH(ly) if ly >= 2 else 0
    side = {'A': 3.5, 'B': 3.0, 'T': 2.0}.get(g, 0)
    if h in ('residential', 'unclassified', 'living_street', 'service'):
        base = {'residential': 2.6, 'unclassified': 2.9, 'living_street': 2.1, 'service': 2.0}[h]
        hw = min(4.0, max(1.8, wd / 2)) if wd > 0 else base
        if g == 'T': side = 1.0
        return (hw if not ow else min(hw, 2.4)), 1, side, ow, 0
    if du:
        tot = ln or 4
        per = max(1, min(3, round(tot / 2)))
        return per * 3.3 + 0.6, per, side, 0, 0
    if ow:
        n = ln or (2 if g == 'A' else 1)
        return n * 1.6 + 0.4, min(3, n), side * 0.8, 1, 0
    tot = ln or (4 if h in ('trunk',) else 2)
    hw = tot * 1.6 + 0.2
    if wd > 0: hw = min(12.0, max(2.6, wd / 2))
    return hw, max(1, min(3, tot // 2)), side, 0, 0
WID = [width(e) for e in E]

# ---------------- global graph
gnodes = {}; nodes_out = []; edges_out = []; names = []; name_ix = {}
def nm(s):
    if not s: return -1
    if s not in name_ix: name_ix[s] = len(names); names.append(s)
    return name_ix[s]
# node heights: expressway nodes on the deck (by OSM layer), nodes that also touch a ground road stay on the ground
hiN = collections.defaultdict(float); grN = set()
for e in E:
    if e[2] == 'X':
        for n in (e[0], e[1]): hiN[n] = max(hiN[n], lvlH(e[10]))
    elif e[2] != 'R':
        grN.add(e[0]); grN.add(e[1])
def gn(i):
    if i not in gnodes:
        y = hiN.get(i, 0) if i not in grN else 0
        gnodes[i] = len(nodes_out); nodes_out.append([round(N[i][0], 1), round(N[i][1], 1), round(y, 1)])
    return gnodes[i]
for k, e in enumerate(E):
    if e[2] not in GLOBAL: continue
    hw, ln, sd, ow, top = WID[k]
    edges_out.append([gn(e[0]), gn(e[1]), KIDX[e[2]], nm(e[3]), [[round(q[0], 1), round(q[1], 1)] for q in e[4]],
                      int(round(hw * 10)), ln, 1 if ow else 0, int(round(sd * 10)), int(round(top * 10))])
print('global nodes', len(nodes_out), 'edges', len(edges_out), 'names', len(names))

# ---------------- tile streets
def tkey(x, z): return (math.floor(x / TILE), math.floor(z / TILE))
tstreets = collections.defaultdict(list)
for k, e in enumerate(E):
    if e[2] in GLOBAL: continue
    e = e + [k]
    p = [N[e[0]][:2]] + e[4] + [N[e[1]][:2]]
    L = [math.dist(p[i], p[i + 1]) for i in range(len(p) - 1)]
    tot = sum(L); s = 0; mid = p[0]
    for i, l in enumerate(L):
        if s + l >= tot / 2: t = (tot / 2 - s) / (l or 1); mid = (p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t); break
        s += l
    tstreets[tkey(*mid)].append(e)

# ---------------- road ribbons for building clearance (per pack, built lazily)
def ribbons_in(x0, z0, x1, z1):
    geoms = []; m = 40
    for e in E:
        pass
    return geoms
# spatial index of all edges by tile (for ribbons)
etile = collections.defaultdict(list)
for k, e in enumerate(E):
    p = [N[e[0]][:2]] + e[4] + [N[e[1]][:2]]
    ks = set(tkey(q[0], q[1]) for q in p)
    for kk in ks: etile[kk].append(k)
# rails as ribbons (v3.5: the full deck width + 0.9 m; subways only where they run above ground; wider at stations)
rails = []; rwid = []
RW = {'el': 6.15, 'mono': 3.6, 'ats': 3.8, 'tram': 3.4, 'sub': 5.6}
for r in world['rails']:
    kind = r.get('kind', 'el'); w = RW.get(kind, 6.15)
    ys = r.get('ys')
    P = r['path']; cur = []
    def flush():
        if len(cur) > 1: rails.append(list(cur)); rwid.append(w)
    for i, q in enumerate(P):
        y = ys[i] if ys is not None and i < len(ys) else (-16 if kind == 'sub' else 8)
        if y < 1.5:
            flush(); cur = []
        else: cur.append(q)
    flush()
    # station platforms / canopies
    if kind in ('el', 'mono', 'ats'):
        for st in r['st']:
            i = st['i']
            if ys is not None and i < len(ys) and ys[i] < 1.5: continue
            seg = P[max(0, i - 10): i + 11]
            if len(seg) > 1: rails.append(seg); rwid.append(w + 6.0)
rtile = collections.defaultdict(list)
for k, p in enumerate(rails):
    for q in p: rtile[tkey(*q)].append(k)
for kk in rtile: rtile[kk] = sorted(set(rtile[kk]))

# ---------------- zoning (landuse + stations)
areas = json.load(open(os.path.join(OSM, 'areas.json')))
ZC = 40.0
zone = {}  # cell -> class priority
PRI = {'sta': 6, 'com': 5, 'ret': 5, 'ind': 4, 'sch': 3, 'hos': 3, 'res': 1}
apolys = []
for a in areas:
    if a['c'] not in PRI or len(a['p']) < 3: continue
    pg = shapely.Polygon(a['p'])
    if not pg.is_valid: pg = shapely.make_valid(pg)
    apolys.append((pg, a['c']))
AT = STRtree([p for p, _ in apolys]); ACL = [c for _, c in apolys]
stations = []
for r in world['rails']:
    for s in r['st']:
        q = r['path'][s['i']]; stations.append((q[0], q[1], r.get('kind')))
ST = np.array([[s[0], s[1]] for s in stations]); from scipy.spatial import cKDTree; STT = cKDTree(ST)
# station importance: number of lines within 250 m
imp = np.array([len(STT.query_ball_point(q, 250)) for q in ST])

def hsh(*v):
    h = hashlib.blake2b(struct.pack('<%dd' % len(v), *v), digest_size=4).digest(); return int.from_bytes(h, 'little') / 4294967296

# ---------------- buildings: split bld.bin into packs
def load_polys():
    raw = open(os.path.join(OSM, 'bld.bin'), 'rb').read(); i = 0; n = len(raw)
    while i < n:
        k, c, l, h = struct.unpack_from('<IBBH', raw, i); i += 8
        a = np.frombuffer(raw, dtype='<f4', count=2 * k, offset=i).reshape(k, 2).astype(np.float64); i += 8 * k
        yield a, c, l, h / 10

packs = collections.defaultdict(list)
for a, c, l, h in ([] if os.environ.get('STREETS_ONLY') else load_polys()):
    cx, cz = a.mean(0); t = tkey(cx, cz); pk = (t[0] // PACK, t[1] // PACK)
    if os.environ.get('ONLY') and f'{pk[0]}_{pk[1]}' not in os.environ['ONLY'].split(','): continue
    packs[pk].append((a, c, l, h))
# packs that only hold streets
for t in tstreets:
    if os.environ.get('ONLY') and f'{t[0] // PACK}_{t[1] // PACK}' not in os.environ['ONLY'].split(','): continue
    packs.setdefault((t[0] // PACK, t[1] // PACK), [])
print('packs', len(packs))

def box_params(rect):
    c = np.asarray(rect.exterior.coords)[:4]
    e1 = c[1] - c[0]; e2 = c[2] - c[1]; w = math.hypot(*e1); d = math.hypot(*e2)
    ang = math.atan2(e1[1], e1[0]) % math.pi
    return c.mean(0), w, d, ang

def to_boxes(pg, depth=0):
    """polygon -> list of (cx, cz, w, d, rot) boxes"""
    if pg.is_empty or pg.area < 12: return []
    if pg.geom_type != 'Polygon':
        out = []
        for g in getattr(pg, 'geoms', []):
            if g.geom_type == 'Polygon': out += to_boxes(g, depth)
        return out
    rect = shapely.minimum_rotated_rectangle(pg)
    if rect.geom_type != 'Polygon': return []
    (cx, cz), w, d, a = box_params(rect)
    fill = pg.area / max(rect.area, 1e-6)
    if depth < 3 and ((fill < 0.72 and pg.area > 180) or max(w, d) > 63):
        # cut across the long side
        if w >= d: u = np.array([math.cos(a), math.sin(a)])
        else: u = np.array([-math.sin(a), math.cos(a)])
        v = np.array([-u[1], u[0]]); L = max(w, d); big = 200
        parts = []
        k = 2 if max(w, d) <= 63 * 2 else math.ceil(max(w, d) / 60)
        for i in range(k):
            s0 = -L / 2 + L * i / k; s1 = -L / 2 + L * (i + 1) / k
            c0 = np.array([cx, cz])
            q = [c0 + u * s0 - v * big, c0 + u * s1 - v * big, c0 + u * s1 + v * big, c0 + u * s0 + v * big]
            parts.append(pg.intersection(shapely.Polygon(q)))
        out = []
        for p in parts: out += to_boxes(p, depth + 1)
        return out
    if w < 3 or d < 3: return []
    return [(cx, cz, min(w, 63.75), min(d, 63.75), a)]

def orient_ccw(c):
    c = list(c)
    if len(c) > 1 and c[0] == c[-1]: c = c[:-1]
    a = sum(c[i][0] * c[(i + 1) % len(c)][1] - c[(i + 1) % len(c)][0] * c[i][1] for i in range(len(c)))
    return c if a > 0 else c[::-1]
def to_shapes(pg, clear, depth=0, loose=0.86):
    """polygon (already cut back from the roads) -> [(cx, cz, w, d, rot, outline or None)]
    a box when the building is close to a rectangle and the box keeps clear of the roads, otherwise its outline
    (a triangular / polygonal prism) with the minimum rectangle as its bounding box"""
    if pg.is_empty or pg.area < 12: return []
    if pg.geom_type != 'Polygon':
        out = []
        for g in getattr(pg, 'geoms', []):
            if g.geom_type == 'Polygon': out += to_shapes(g, clear, depth, loose)
        return out
    rect = shapely.minimum_rotated_rectangle(pg)
    if rect.geom_type != 'Polygon': return []
    (cx, cz), w, d, a = box_params(rect)
    if max(w, d) > 63 and depth < 4:
        # too big for one record: cut across the long side
        if w >= d: u = np.array([math.cos(a), math.sin(a)])
        else: u = np.array([-math.sin(a), math.cos(a)])
        v = np.array([-u[1], u[0]]); L = max(w, d); big = 400; k = math.ceil(L / 60)
        out = []
        for i in range(k):
            s0 = -L / 2 + L * i / k; s1 = -L / 2 + L * (i + 1) / k; c0 = np.array([cx, cz])
            q = [c0 + u * s0 - v * big, c0 + u * s1 - v * big, c0 + u * s1 + v * big, c0 + u * s0 + v * big]
            out += to_shapes(pg.intersection(shapely.Polygon(q)), clear, depth + 1, loose)
        return out
    if w < 2.5 or d < 2.5: return []
    fill = pg.area / max(rect.area, 1e-6)
    hits_road = clear is not None and len(clear[0].query(rect, predicate='intersects')) and \
        rect.intersection(shapely.union_all(clear[1][clear[0].query(rect, predicate='intersects')])).area > 0.4
    if (fill >= loose or pg.area < 45) and not hits_road:
        return [(cx, cz, min(w, 63.75), min(d, 63.75), a, None)]
    sp = pg.simplify(0.35, preserve_topology=True)
    if sp.geom_type != 'Polygon' or sp.is_empty or not sp.is_valid: sp = pg
    if not sp.is_valid:
        v = shapely.make_valid(sp); ps = [g for g in getattr(v, 'geoms', [v]) if g.geom_type == 'Polygon']
        if not ps: return []
        sp = max(ps, key=lambda g: g.area)
    if len(sp.exterior.coords) > 34: sp = pg.simplify(1.0, preserve_topology=True)
    if sp.geom_type != 'Polygon' or sp.is_empty or len(sp.exterior.coords) > 60: return [(cx, cz, min(w, 63.75), min(d, 63.75), a, None)] if not hits_road else []
    return [(cx, cz, min(w, 63.75), min(d, 63.75), a, orient_ccw(sp.exterior.coords))]

def zone_at(x, z):
    hits = AT.query(shapely.Point(x, z), predicate='within')
    best = None; bp = 0
    for h in hits:
        c = ACL[h]
        if PRI[c] > bp: bp = PRI[c]; best = c
    return best

def classify(cls, lv, hh, area, x, z, zn, sd, si):
    """-> (type, height, commerce)"""
    r = hsh(x, z, 1.0); r2 = hsh(x, z, 2.0)
    com = zn in ('com', 'ret', 'sta') or (sd < 250 and si >= 2) or (sd < 450 and si >= 4)
    h = hh if hh > 0 else (lv * 3.3 + 0.8 if lv > 0 else 0)
    if h <= 0:
        if cls in (1, 2) or (cls == 0 and area < 130 and not com): h = 6.0 + r * 2.0
        elif cls == 14: h = 3.2 + r
        elif cls == 12: h = 7 + r * 4
        elif cls == 3: h = (9 + r * 8) if area < 300 else (14 + r * 22)
        elif cls in (4, 6, 7): h = 16 + r * 30 + (25 if area > 1500 else 0)
        elif cls == 5: h = 8 + r * 10
        elif cls == 8 or zn == 'ind': h = 7 + r * 7
        elif cls in (9, 10, 13, 11, 16, 17): h = 12 + r * 12
        elif com: h = (10 + r * 18) if area < 400 else (20 + r * 35)
        elif area < 400: h = 6.5 + r * 5 if r2 < 0.6 else 9 + r * 8
        else: h = 12 + r * 20
    h = max(3.0, min(h, 600))
    big = area > 260
    if h >= 60 and big: t = 4
    elif cls in (4, 6, 7) or (com and h >= 25 and big): t = 3 if h >= 22 else 2
    elif cls == 5 or (com and h < 25): t = 5 if r2 < 0.5 else 2
    elif cls in (8, 9, 10, 11, 13, 16, 17) or zn == 'ind': t = 2
    elif h < 9.5 and area < 260: t = 0
    else: t = 1
    c = 0.0
    if cls == 5: c = 0.95
    elif t in (2, 3, 5) and com: c = 0.2 + r2 * 0.6
    elif t in (2, 3, 5): c = 0.1 + r2 * 0.2
    return t, h, c

# junction areas: every node with 2+ roads gets a disc as wide as its widest road (the game draws junctions that size)
NREACH = collections.defaultdict(float); NDEG = collections.Counter()
for k, e in enumerate(E):
    hw, ln, sd, ow, top = WID[k]
    for n in (e[0], e[1]): NREACH[n] = max(NREACH[n], hw + sd); NDEG[n] += 1
def ribbon_geoms(keys):
    ids = set()
    for k in keys: ids.update(etile.get(k, ()))
    lines = []; widths = []; discs = set()
    for i in ids:
        e = E[i]; p = [N[e[0]][:2]] + e[4] + [N[e[1]][:2]]
        hw, ln, sd, ow, top = WID[i]
        lines.append(shapely.LineString(p)); widths.append(hw + sd + 0.4)
        for n in (e[0], e[1]):
            if NDEG[n] >= 2 and e[2] not in ('X',): discs.add(n)
    pts = [shapely.Point(N[n][0], N[n][1]) for n in discs]; pw = [NREACH[n] + 1.0 for n in discs]
    rids = set()
    for k in keys: rids.update(rtile.get(k, ()))
    for i in rids: lines.append(shapely.LineString(rails[i])); widths.append(rwid[i])
    if not lines: return None
    g = list(shapely.buffer(np.array(lines, dtype=object), np.array(widths), cap_style='flat', join_style='mitre', mitre_limit=2.0))
    if pts: g += list(shapely.buffer(np.array(pts, dtype=object), np.array(pw), quad_segs=6))
    return np.array(g, dtype=object)

def enc_tile_streets(t):
    cx, cz = (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE
    loc = {}; ln = []; out = bytearray()
    def ref(i):
        if i in gnodes: return gnodes[i]
        if i not in loc: loc[i] = len(ln); ln.append(i)
        return -1 - loc[i]
    eb = bytearray(); ne = 0
    for e in tstreets.get(t, ()):
        a, b = ref(e[0]), ref(e[1])
        pts = e[4]; whw, wln, wsd, wow, wtop = WID[e[-1]]
        eb += struct.pack('<iiBBBBH', a, b, KIDX[e[2]], min(255, int(round(whw * 10))), min(15, wln) | (16 if wow else 0), min(255, int(round(wsd * 10))), len(pts))
        for q in pts: eb += struct.pack('<hh', int(round((q[0] - cx) * 10)), int(round((q[1] - cz) * 10)))
        ne += 1
    out += struct.pack('<II', len(ln), ne)
    for i in ln: out += struct.pack('<hh', int(round((N[i][0] - cx) * 10)), int(round((N[i][1] - cz) * 10)))
    out += eb
    return bytes(out)

stats = collections.Counter(); hist_t = collections.Counter()
index = []
ONLY = os.environ.get('ONLY')
for pk in sorted(packs):
    if ONLY and f'{pk[0]}_{pk[1]}' not in ONLY.split(','): continue
    import time; T0 = time.time()
    recs = packs[pk]
    keys = [(pk[0] * PACK + i, pk[1] * PACK + j) for i in range(PACK) for j in range(PACK)]
    # neighbour tiles for ribbons
    rk = set((a + di, b + dj) for a, b in keys for di in (-1, 0, 1) for dj in (-1, 0, 1))
    RB = ribbon_geoms(rk)
    RT = STRtree(RB) if RB is not None else None
    tb = collections.defaultdict(list)
    for a, cls, lv, hh in recs:
        if cls in (15, 18): stats['skip_roof'] += 1; continue
        pg = shapely.Polygon(a)
        if not pg.is_valid: pg = shapely.make_valid(pg)
        area = pg.area
        if area < 12: stats['tiny'] += 1; continue
        x, z = a.mean(0)
        zn = zone_at(x, z); sd, si = STT.query([x, z]); sd = float(sd)
        t, h, c = classify(cls, lv, hh, area, x, z, zn, sd, imp[si])
        # clearance from roads (own width + sidewalk), junctions and rails
        if RT is not None:
            hit = RT.query(pg, predicate='intersects')
            if len(hit):
                pg2 = pg.difference(shapely.union_all(RB[hit]))
                if pg2.is_empty or pg2.area < max(12, area * 0.3): stats['road_drop'] += 1; continue
                pg = pg2; stats['road_cut'] += 1
        # houses keep their box (and gable roof) unless the box would touch a road
        for bx, bz, w, d, rot, poly in to_shapes(pg, (RT, RB) if RT is not None else None, 0, 0.62 if t == 0 else 0.8):
            tt = tkey(bx, bz)
            tb[tt].append((bx, bz, rot, w, d, t, h, int(hsh(bx, bz, 3.0) * 256) & 255, c, poly)); hist_t[t] += 1
            poly and stats.update(['poly'])
    # write the pack
    blob = bytearray(); table = []
    for k in keys:
        cx, cz = (k[0] + 0.5) * TILE, (k[1] + 0.5) * TILE
        s = enc_tile_streets(k)
        bb = bytearray(); pb = bytearray(); npoly = 0
        for bi, (bx, bz, rot, w, d, t, h, sty, c, poly) in enumerate(tb.get(k, ())):
            bb += struct.pack('<hhBBBBHBB', int(round((bx - cx) * 10)), int(round((bz - cz) * 10)), int(round(rot / math.pi * 255)) % 256,
                              min(255, int(round(w * 4))), min(255, int(round(d * 4))), t, min(65535, int(round(h * 10))), sty, min(255, int(round(c * 255))))
            if poly:
                pb += struct.pack('<HB', bi, len(poly))
                for q in poly: pb += struct.pack('<hh', int(round((q[0] - cx) * 10)), int(round((q[1] - cz) * 10)))
                npoly += 1
        pb = struct.pack('<H', npoly) + pb
        o0 = len(blob)
        table.append((o0, len(s), o0 + len(s), len(bb), o0 + len(s) + len(bb), len(pb)))
        blob += s + bb + pb
        stats['bld'] += len(bb) // 12
    head = struct.pack('<ii', pk[0], pk[1]) + b''.join(struct.pack('<IIIIII', *r) for r in table)
    data = head + bytes(blob)
    fn = f'{pk[0]}_{pk[1]}.bin'
    open(os.path.join(TD, fn), 'wb').write(data)
    index.append([pk[0], pk[1], len(data)])
    print('pack', pk, 'bytes', len(data), 'recs', len(recs), 'secs', round(time.time() - T0, 1), dict(stats), flush=True)

# ---------------- world.json
world['nodes'] = nodes_out; world['edges'] = edges_out; world['roadNames'] = names
ext = world.setdefault('ext', {})
for k in ('dist', 'oldOcc', 'ics'): ext.pop(k, None)
world['tiles'] = {'tile': TILE, 'pack': PACK, 'packs': index, 'credit': '© OpenStreetMap contributors'}
json.dump(world, open(WOUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('done', dict(stats), 'types', dict(hist_t))
