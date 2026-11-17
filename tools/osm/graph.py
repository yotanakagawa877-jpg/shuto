# v3.3: merged road pieces -> road graph (global) + street tiles
# usage: python3 -I tools/osm/graph.py pieces.pkl graph.pkl
import sys, math, pickle, collections
import numpy as np
from scipy.spatial import cKDTree

IN, OUT = sys.argv[1], sys.argv[2]
A9 = math.cos(35.64 * math.pi / 180) * 111320; R9 = 110950
def xz(lng, lat): return ((lng - 139.755) * A9, -(lat - 35.64) * R9)
BX0, BZ0 = xz(139.43, 35.93); BX1, BZ1 = xz(140.07, 35.30)
KIND = {'X': 0, 'A': 1, 'B': 2, 'T': 3, 'L': 3, 'S': 3, 'R': 4}
GLOBAL = {'X', 'A', 'B', 'T', 'R'}
pieces = pickle.load(open(IN, 'rb'))['pieces']

def inside(p): return BX0 <= p[0] <= BX1 and BZ0 <= p[1] <= BZ1
def key(p): return (int(round(p[0] * 10)), int(round(p[1] * 10)))

# ---------- clip to the map
P2 = []
for pc in pieces:
    cur = None
    for q in pc['pts']:
        if inside(q):
            if cur is None: cur = dict(pc, pts=[]); P2.append(cur)
            cur['pts'].append(q)
        else: cur = None
pieces = [p for p in P2 if len(p['pts']) >= 2]
for pc in pieces:
    q = [pc['pts'][0]]
    for a in pc['pts'][1:]:
        if math.dist(a, q[-1]) > 0.05: q.append(a)
    pc['pts'] = q
pieces = [p for p in pieces if len(p['pts']) >= 2]
print('pieces in map', len(pieces))

# ---------- junction vertices: piece ends + vertices shared by two pieces
cnt = collections.Counter(); lvl = collections.defaultdict(set)
for i, pc in enumerate(pieces):
    hi = pc['g'] == 'X'
    for k, q in enumerate(pc['pts']):
        kk = key(q); cnt[kk] += 2 if k in (0, len(pc['pts']) - 1) else 1
        lvl[kk].add('X' if hi else ('R' if pc['g'] == 'R' else 'G'))
J = [k for k, c in cnt.items() if c >= 2]
JP = np.array(J, float) / 10
JL = ['X' if lvl[k] == {'X'} else ('G' if 'X' not in lvl[k] else 'XR') for k in J]
print('junction vertices', len(J))
# cluster junctions closer than 5 m (same level) -> one node
parent = list(range(len(J)))
def f(a):
    while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
    return a
T = cKDTree(JP)
for a, b in T.query_pairs(5.0):
    if (JL[a] == 'X') != (JL[b] == 'X'): continue
    ra, rb = f(a), f(b)
    if ra != rb: parent[ra] = rb
groups = collections.defaultdict(list)
for i in range(len(J)): groups[f(i)].append(i)
node_of = {}; NODES = []
for g, mem in groups.items():
    c = JP[mem].mean(0); ni = len(NODES); NODES.append([float(c[0]), float(c[1]), 'X' in ''.join(JL[m] for m in mem)])
    for m in mem: node_of[J[m]] = ni
print('nodes', len(NODES))

# ---------- simplify between junctions (Douglas-Peucker 0.6 m)
def rdp(P, eps):
    if len(P) < 3: return P
    P = np.asarray(P); a, b = P[0], P[-1]; d = b - a; L = np.hypot(*d) or 1e-9
    q = P[1:-1] - a; dist = np.abs(d[0] * q[:, 1] - d[1] * q[:, 0]) / L
    i = int(np.argmax(dist))
    if dist[i] > eps: return np.vstack([rdp(P[:i + 2], eps)[:-1], rdp(P[i + 1:], eps)])
    return np.vstack([a, b])

# ---------- split into edges
EDGES = []   # [a, b, kind, name, pts(list), highway, dual, oneway, lanes, width, layer]
names = {}
for pc in pieces:
    pts = pc['pts']; cur = None; start = None
    for k, q in enumerate(pts):
        kk = key(q); n = node_of.get(kk)
        if cur is None:
            if n is None: n = len(NODES); NODES.append([q[0], q[1], pc['g'] == 'X']); node_of[kk] = n
            cur = [q]; start = n; continue
        cur.append(q)
        if n is not None or k == len(pts) - 1:
            if n is None: n = len(NODES); NODES.append([q[0], q[1], pc['g'] == 'X']); node_of[kk] = n
            mid = rdp(cur, 0.6)[1:-1].tolist() if len(cur) > 2 else []
            if start != n or mid:
                EDGES.append([start, n, pc['g'], pc['n'] or '', mid, pc['h'], pc.get('du', False), pc.get('ow', 0), pc.get('ln', 0), pc.get('wd', 0), pc.get('ly', 0)])
            cur = [q]; start = n
print('edges raw', len(EDGES))
# drop duplicates (same ends, same kind, similar length), split self loops
seen = {}; E2 = []
def elen(e):
    p = [NODES[e[0]][:2]] + e[4] + [NODES[e[1]][:2]]
    return sum(math.dist(p[i], p[i + 1]) for i in range(len(p) - 1))
for e in EDGES:
    L = elen(e)
    if L < 0.5: continue
    if e[0] == e[1]:
        p = e[4]
        if len(p) < 2: continue
        m = len(p) // 2; n = len(NODES); NODES.append([p[m][0], p[m][1], NODES[e[0]][2]])
        E2.append([e[0], n, e[2], e[3], p[:m]] + e[5:]); E2.append([n, e[1], e[2], e[3], p[m + 1:]] + e[5:]); continue
    k = ((e[0], e[1]) if e[7] else (min(e[0], e[1]), max(e[0], e[1]))) + (e[2], round(L / 3))
    if k in seen: continue
    seen[k] = 1; E2.append(e)
EDGES = E2
# long edges: at most 4000 points
E2 = []
for e in EDGES:
    p = e[4]
    while len(p) > 4000:
        n = len(NODES); NODES.append([p[3000][0], p[3000][1], NODES[e[0]][2]])
        E2.append([e[0], n, e[2], e[3], p[:3000]] + e[5:]); e = [n, e[1], e[2], e[3], p[3001:]] + e[5:]; p = e[4]
    E2.append(e)
EDGES = E2
# merge chains through degree-2 nodes (OSM splits ways at arbitrary points) when kind and name agree
def merge_deg2(EDGES):
    inc = collections.defaultdict(list)
    for i, e in enumerate(EDGES): inc[e[0]].append(i); inc[e[1]].append(i)
    dead = [False] * len(EDGES)
    for n, L in list(inc.items()):
        L = [i for i in L if not dead[i]]
        if len(L) != 2: continue
        i, j = L
        if i == j: continue
        a, b = EDGES[i], EDGES[j]
        if a[2] != b[2] or a[3] != b[3] or a[7:] != b[7:]: continue
        # one-way chains only in their own direction (a ends at n, b starts at n)
        if a[7] and not (a[1] == n and b[0] == n): continue
        pa = [NODES[a[0]][:2]] + a[4] + [NODES[a[1]][:2]] if a[1] == n else [NODES[a[1]][:2]] + a[4][::-1] + [NODES[a[0]][:2]]
        pb = [NODES[b[0]][:2]] + b[4] + [NODES[b[1]][:2]] if b[0] == n else [NODES[b[1]][:2]] + b[4][::-1] + [NODES[b[0]][:2]]
        s0 = a[0] if a[1] == n else a[1]; s1 = b[1] if b[0] == n else b[0]
        if s0 == s1 or len(pa) + len(pb) > 3900: continue
        mid = [list(q) for q in pa[1:]] + [list(q) for q in pb[1:-1]]
        EDGES[i] = [s0, s1, a[2], a[3], mid, a[5], a[6] or b[6]] + a[7:]; dead[j] = True
        inc[s1] = [i if k == j else k for k in inc[s1]]
    return [e for k, e in enumerate(EDGES) if not dead[k]]
EDGES = merge_deg2(EDGES)
print('edges', len(EDGES), collections.Counter(e[2] for e in EDGES))
pickle.dump({'nodes': NODES, 'edges': EDGES}, open(OUT, 'wb'))
