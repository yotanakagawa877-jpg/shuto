# v3.3 road network from OpenStreetMap (whole map, old area included)
#   global graph (traffic, buses, GPS):   X motorway, R motorway_link, A trunk/primary(+links), B secondary(+links),
#                                         L tertiary(+links)  -> nodes/edges in the old world.json format
#   tile streets (streamed per 1280 m tile): L residential / unclassified / living_street / service
# Dual carriageways (two one-way ways of the same road) are merged into one centre line, like the old map's roads.
# usage: python3 -I tools/osm/roads.py roads.json OUT.pkl
import sys, json, math, pickle, collections
import numpy as np
from scipy.spatial import cKDTree

IN, OUT = sys.argv[1], sys.argv[2]
A9 = math.cos(35.64 * math.pi / 180) * 111320; R9 = 110950
def xz(lng, lat): return ((lng - 139.755) * A9, -(lat - 35.64) * R9)
BX0, BZ0 = xz(139.43, 35.93); BX1, BZ1 = xz(140.07, 35.30)
GROUP = {'motorway': 'X', 'motorway_link': 'R', 'trunk': 'A', 'trunk_link': 'A', 'primary': 'A', 'primary_link': 'A',
         'secondary': 'B', 'secondary_link': 'B', 'tertiary': 'T', 'tertiary_link': 'T',
         'unclassified': 'L', 'residential': 'L', 'living_street': 'L', 'service': 'S'}
# v3.3b: motorways stay as their two one-way carriageways (real junctions, ramps join the right deck)
PAIR_D = {'A': 40, 'B': 30, 'T': 22}
STEP = 4.0

ways = json.load(open(IN))
print('ways', len(ways))

def key(p): return (int(round(p[0] * 10)), int(round(p[1] * 10)))

# ---------- vertex use counts (OSM connectivity = shared vertices)
use = collections.Counter()
W = []
for w in ways:
    g = GROUP.get(w['h'])
    if g is None: continue
    p = [tuple(q) for q in w['p']]
    # drop consecutive duplicates
    q = [p[0]]
    for a in p[1:]:
        if a != q[-1]: q.append(a)
    if len(q) < 2: continue
    # keep ways touching the map (with margin); clipping happens on the final edges
    xs = [a[0] for a in q]; zs = [a[1] for a in q]
    if max(xs) < BX0 - 300 or min(xs) > BX1 + 300 or max(zs) < BZ0 - 300 or min(zs) > BZ1 + 300: continue
    ow = w['o'] or g in ('X', 'R')
    W.append({'g': g, 'h': w['h'], 'n': w['n'] or w['r'], 'p': q, 'o': 1 if ow else 0, 'b': w['b'], 't': w['t'], 'id': w['w'],
              'ln': w.get('n2', 0), 'wd': w.get('wd', 0), 'ly': w.get('l', 0)})
    for i, a in enumerate(q): use[key(a)] += 1 if 0 < i < len(q) - 1 else 2
print('kept ways', len(W))

# ---------- dual carriageway merge (per group)
def densify(p):
    out = []; src = []  # src: original vertex index or -1
    for i in range(len(p) - 1):
        a, b = np.array(p[i]), np.array(p[i + 1]); L = float(np.hypot(*(b - a))); n = max(1, int(L / STEP))
        for k in range(n):
            out.append(a + (b - a) * (k / n)); src.append(i if k == 0 else -1)
    out.append(np.array(p[-1])); src.append(len(p) - 1)
    return np.array(out), np.array(src)

moved = {}     # way index -> (dense pts, src, keep mask, new pts)
for g, dmax in PAIR_D.items():
    idx = [i for i, w in enumerate(W) if w['g'] == g and w['o']]
    if not idx: continue
    D = {}; allp = []; allt = []; allw = []; alli = []
    for i in idx:
        P, S = densify(W[i]['p'])
        T = np.gradient(P, axis=0); T /= np.maximum(np.linalg.norm(T, axis=1)[:, None], 1e-9)
        D[i] = (P, S, T)
        allp.append(P); allt.append(T); allw.append(np.full(len(P), i)); alli.append(np.arange(len(P)))
    AP = np.concatenate(allp); AT = np.concatenate(allt); AW = np.concatenate(allw); AI = np.concatenate(alli)
    tree = cKDTree(AP)
    dd, nn = tree.query(AP, k=24, distance_upper_bound=dmax)
    partner = np.full(len(AP), -1)
    for r in range(len(AP)):
        for d, j in zip(dd[r], nn[r]):
            if not np.isfinite(d) or j >= len(AP): break
            if AW[j] == AW[r] or d < 2: continue
            if AT[r] @ AT[j] > -0.8: continue
            off = (AP[j] - AP[r]) / d
            if abs(off @ AT[r]) > 0.45: continue
            na, nb = W[AW[r]]['n'], W[AW[j]]['n']
            if na and nb and na != nb: continue
            partner[r] = j; break
    # per way: runs of paired points (>= 4 points), fill small gaps
    base = 0
    for i in idx:
        P, S, T = D[i]; n = len(P); pr = partner[base:base + n].copy(); base += n
        pm = pr >= 0
        # fill gaps of <= 2
        k = 0
        while k < n:
            if not pm[k]:
                j = k
                while j < n and not pm[j]: j += 1
                if 0 < k and j < n and j - k <= 2: pm[k:j] = True; pr[k:j] = pr[k - 1]
                k = j
            else: k += 1
        # remove short runs
        k = 0
        while k < n:
            if pm[k]:
                j = k
                while j < n and pm[j]: j += 1
                if j - k < 4: pm[k:j] = False
                k = j
            else: k += 1
        keep = np.ones(n, bool); NP = P.copy(); dual = np.zeros(n, bool)
        for k in np.where(pm)[0]:
            j = pr[k] if pr[k] >= 0 else -1
            if j < 0: continue
            if W[AW[j]]['id'] < W[i]['id']: keep[k] = False      # the other carriageway keeps this stretch
            else: NP[k] = (P[k] + AP[j]) / 2; dual[k] = True
        # taper the shift over 5 points at the ends of moved runs
        sh = NP - P
        for k in range(n):
            if dual[k]: continue
            # distance (in points) to the nearest moved point
            for dk in range(1, 6):
                for kk in (k - dk, k + dk):
                    if 0 <= kk < n and dual[kk] and keep[k]:
                        NP[k] = P[k] + sh[kk] * (1 - dk / 6); break
                else: continue
                break
        pw = [int(AW[pr[k]]) if (pm[k] and pr[k] >= 0) else -1 for k in range(n)]
        moved[i] = (P, S, keep, NP, dual, pw)
    print(g, 'oneway ways', len(idx), 'paired pts', int((partner >= 0).sum()), 'of', len(AP))

# ---------- rebuild polylines with junction keys
# every original vertex key maps to its new position; vertices of dropped stretches map to the nearest kept centre point
kmap = {}
pieces = []   # {g, n, b, t, pts: [(x,z)], keys:[orig key or None], dual}
centre_pts = []; centre_ref = []
for i, w in enumerate(W):
    if i in moved:
        P, S, keep, NP, dual, pw = moved[i]
        cur = None
        for k in range(len(P)):
            if keep[k]:
                # a new piece where the dual / single state changes (one-way vs two-way, lanes)
                if cur is not None and cur['dual'] and cur['dual'][-1] != bool(dual[k]):
                    last = cur['pts'][-1]
                    cur = {'w': i, 'pts': [last], 'keys': [None], 'dual': [bool(dual[k])], 'pw': [pw[k]]}; pieces.append(cur)
                if cur is None: cur = {'w': i, 'pts': [], 'keys': [], 'dual': [], 'pw': []}; pieces.append(cur)
                cur['pw'].append(pw[k])
                cur['pts'].append(tuple(NP[k])); cur['dual'].append(bool(dual[k]))
                ok = key(w['p'][S[k]]) if S[k] >= 0 else None
                cur['keys'].append(ok)
                if ok is not None: kmap[ok] = tuple(NP[k])
                centre_pts.append(NP[k]); centre_ref.append(w['g'])
            else:
                cur = None
    else:
        pieces.append({'w': i, 'pts': list(w['p']), 'keys': [key(a) for a in w['p']], 'dual': [False] * len(w['p'])})
for pc in pieces:
    w = W[pc['w']]; pc['g'] = w['g']; pc['n'] = w['n']; pc['b'] = w['b']; pc['t'] = w['t']; pc['h'] = w['h']
    pc['ly'] = w['ly']; pc['wd'] = w['wd']
    d = bool(pc['dual']) and sum(pc['dual']) > len(pc['dual']) / 2
    pc['du'] = d
    if d:
        # merged carriageways: two-way, lanes of both (the partner's from the way it was paired with)
        ps = [p for p in pc.get('pw', []) if p >= 0]
        pl = W[max(set(ps), key=ps.count)]['ln'] if ps else 0
        pc['ow'] = 0; pc['ln'] = (w['ln'] + pl) if (w['ln'] and pl) else (2 * w['ln'] if w['ln'] else 0)
    else:
        pc['ow'] = w['o']; pc['ln'] = w['ln']
print('pieces', len(pieces))
# dropped junction vertices -> nearest centre point of the same group
CP = np.array(centre_pts) if centre_pts else np.zeros((0, 2)); CG = np.array(centre_ref)
trees = {g: (cKDTree(CP[CG == g]), CP[CG == g]) for g in set(centre_ref)}
dropped = 0
for i, (P, S, keep, NP, dual, pw) in moved.items():
    w = W[i]
    for k in range(len(P)):
        if keep[k] or S[k] < 0: continue
        ok = key(w['p'][S[k]])
        if ok in kmap or use[ok] < 2: continue
        t, CPg = trees[w['g']]
        d, j = t.query(P[k])
        if d < PAIR_D[w['g']]: kmap[ok] = tuple(CPg[j]); dropped += 1
print('remapped dropped junctions', dropped)
# apply the map to all pieces (crossing roads now meet the centre line)
for pc in pieces:
    for k, ok in enumerate(pc['keys']):
        if ok is not None and ok in kmap and pc['w'] not in moved: pc['pts'][k] = kmap[ok]
# cut ends of dropped stretches: connect the loose end of a kept piece of a paired way to the nearest centre point
for pc in pieces:
    if pc['w'] not in moved: continue
    g = pc['g']; t, CPg = trees.get(g, (None, None))
    if t is None: continue
    for end in (0, -1):
        k0 = pc['keys'][end]
        if k0 is not None and use[k0] >= 2: continue  # real junction / way end shared
        q = np.array(pc['pts'][end]); d, j = t.query(q, k=8)
        for dd, jj in zip(d, j):
            if not np.isfinite(dd) or dd > PAIR_D[g] or dd < 3: continue
            c = tuple(CPg[jj])
            if end == 0: pc['pts'].insert(0, c); pc['keys'].insert(0, None); pc['dual'].insert(0, True)
            else: pc['pts'].append(c); pc['keys'].append(None); pc['dual'].append(True)
            break

pickle.dump({'pieces': pieces}, open(OUT, 'wb'))
print('saved', OUT)
