# rebuild the Tokaido Shinkansen rail path (world rails[20]) from OSM main tracks
import json, math, sys, heapq
import numpy as np
from scipy.spatial import cKDTree
S = json.load(open(sys.argv[1])); W = json.load(open(sys.argv[2])); OUT = sys.argv[3]
RI = 20
r = W['rails'][RI]; old = np.array(r['path'])
ways = [o for o in S if '東海道' in o['n'] and o['svc'] == '']
# graph on rounded coords
def k(p): return (round(p[0], 1), round(p[1], 1))
adj = {}; info = {}
for o in ways:
    p = o['p']; tun = o['tu'] not in ('', 'no'); br = o['br'] not in ('', 'no')
    for a, b in zip(p, p[1:]):
        ka, kb = k(a), k(b); d = math.dist(a, b)
        adj.setdefault(ka, []).append((kb, d)); adj.setdefault(kb, []).append((ka, d))
        info[(ka, kb)] = info[(kb, ka)] = (tun, br)
keys = list(adj); KP = np.array(keys); T = cKDTree(KP)
_, s0 = T.query(old[0]); src = keys[s0]
# target: furthest-west node near the map edge on this line
cand = [q for q in keys if q[0] < -29000]
dst = max(cand, key=lambda q: q[0]) if cand else min(keys, key=lambda q: q[0])
dst = min(cand, key=lambda q: abs(q[0] + 29990))
print('src', src, 'dst', dst)
dist = {src: 0}; prev = {}; pq = [(0, src)]
while pq:
    d, u = heapq.heappop(pq)
    if u == dst: break
    if d > dist[u]: continue
    for v, w in adj[u]:
        nd = d + w
        if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
path = [dst]
while path[-1] != src: path.append(prev[path[-1]])
path.reverse()
print('osm nodes', len(path), 'length', dist[dst])
# resample every 8 m, carrying tunnel / bridge flags
P = np.array(path); seg = np.hypot(*np.diff(P, axis=0).T); cum = np.concatenate([[0], np.cumsum(seg)])
L = cum[-1]; n = int(L / 8) + 1; us = np.linspace(0, L, n)
xs = np.interp(us, cum, P[:, 0]); zs = np.interp(us, cum, P[:, 1])
fl = []
for u in us:
    j = min(len(path) - 2, int(np.searchsorted(cum, u, 'right') - 1))
    fl.append(info[(path[j], path[j + 1])])
# light smoothing (keeps curves, removes crossover kinks)
Q = np.stack([xs, zs], 1)
for _ in range(3):
    Q[1:-1] = Q[1:-1] * 0.5 + (Q[:-2] + Q[2:]) * 0.25
# heights: bridge 13, else 9; tunnels below the deck-drawing level (game hides rails under 1.5 m)
tun = np.array([t for t, b in fl]); tgt = np.array([13.0 if b else 9.0 for t, b in fl])
oT = cKDTree(old); dd, jj = oT.query(Q); oys = np.array(r['ys'])
for i in range(len(Q)):
    if dd[i] < 25 and jj[i] < 2100: tgt[i] = oys[jj[i]]
# cross other surface rails with 7 m clearance
oth = []
for ri, rr in enumerate(W['rails']):
    if ri == RI or rr.get('kind') == 'sub': continue
    yy = rr.get('ys') or [8] * len(rr['path'])
    for q, y in zip(rr['path'], yy):
        if y >= 1.5: oth.append((q[0], q[1], y))
OA = np.array(oth); OT = cKDTree(OA[:, :2])
for i in range(len(Q)):
    if tun[i]: continue
    for j in OT.query_ball_point(Q[i], 9):
        if abs(OA[j, 2] - tgt[i]) < 6.5: tgt[i] = max(tgt[i], OA[j, 2] + 7)
g = 0.03 * 8
ys = tgt.copy()
for _ in range(3):   # raise ramps towards crossings / bridges
    for i in range(1, len(ys)): ys[i] = max(ys[i], ys[i - 1] - g)
    for i in range(len(ys) - 2, -1, -1): ys[i] = max(ys[i], ys[i + 1] - g)
ys[tun] = 1.0
for _ in range(3):   # portals: descend outside the tunnel
    for i in range(1, len(ys)):
        if not tun[i]: ys[i] = min(ys[i], ys[i - 1] + g)
    for i in range(len(ys) - 2, -1, -1):
        if not tun[i]: ys[i] = min(ys[i], ys[i + 1] + g)
# inside tunnels go down to -14 m
idx = np.where(tun)[0]
if len(idx):
    runs = np.split(idx, np.where(np.diff(idx) > 1)[0] + 1)
    for rn in runs:
        for k, i in enumerate(rn): ys[i] = 1.0 - min(15.0, min(k + 1, len(rn) - k) * g)
tgt = np.where(tun, -1, tgt)
# stations
QT = cKDTree(Q)
for st in r['st']:
    _, st['i'] = QT.query(old[st['i']]); st['i'] = int(st['i'])
    print(st['ja'], st['i'], 'y', round(float(ys[st['i']]), 1))
r['path'] = [[round(float(a), 1), round(float(b), 1)] for a, b in Q]
r['ys'] = [round(float(y), 2) for y in ys]
cum2 = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(Q, axis=0).T))])
for s in W['svc']:
    for lg in s['legs']:
        if lg[0] == RI: lg[1] = round(float(cum2[r['st'][0]['i']]), 1); lg[2] = round(float(cum2[-1]), 1)
print('new length', cum2[-1], 'pts', len(Q), 'tunnel pts', int((tgt < 0).sum()), 'min y', ys.min())
json.dump(W, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
