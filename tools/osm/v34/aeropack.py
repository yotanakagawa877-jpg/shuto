# Haneda airport data from OSM -> world.json 'aero'
import json, sys, math
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString
O = json.load(open(sys.argv[1])); R = json.load(open(sys.argv[2])); WJ = sys.argv[3]
def simp(p, tol, closed):
    g = Polygon(p) if closed else LineString(p)
    if closed and not g.is_valid: g = shapely.make_valid(g).buffer(0)
    g = g.simplify(tol)
    if closed:
        if g.geom_type != 'Polygon': g = max(g.geoms, key=lambda q: q.area)
        g = shapely.geometry.polygon.orient(g, 1.0)
        c = list(g.exterior.coords)[:-1]
    else: c = list(g.coords)
    return [round(v, 1) for q in c for v in q]
rw = {}
for o in O:
    if o['a'] == 'runway' and not o.get('node'):
        k = o['name'][-4] if o['name'].endswith('滑走路') else o['ref']
        rw.setdefault(k, []).extend(o['p'])
rwy = {}
for k, pts in rw.items():
    P = np.array(pts); c = P.mean(0); u, s, vt = np.linalg.svd(P - c); d = vt[0]
    t = (P - c) @ d; a = c + d * t.min(); b = c + d * t.max()
    rwy[k] = [round(float(a[0]), 1), round(float(a[1]), 1), round(float(b[0]), 1), round(float(b[1]), 1), 60]
    print('runway', k, rwy[k], round(float(t.max() - t.min())))
aprons = [simp(o['p'], 1.5, True) for o in O if o['a'] == 'apron' and not o.get('node') and len(o['p']) > 3]
taxi = []
for o in O:
    if o['a'] in ('taxiway', 'taxilane') and not o.get('node') and len(o['p']) > 1:
        w = 23 if o['a'] == 'taxiway' else 14
        try: w = float(o['w'] or w)
        except ValueError: pass
        taxi.append([round(w, 1)] + simp(o['p'], 0.8, False))
term = {}
for o in O:
    if o.get('b') == 'terminal' or o['a'] == 'terminal':
        if o['name'] == '第1旅客ターミナル': term['T1'] = simp(o['p'], 1.2, True)
        if o['name'] == '第3旅客ターミナル': term['T3'] = simp(o['p'], 1.2, True)
for o in R:
    if o['n'] == '第2旅客ターミナル': term['T2'] = simp(o['p'], 1.2, True)
stands = [[round(o['p'][0][0], 1), round(o['p'][0][1], 1)] for o in O if o['a'] == 'parking_position' and o.get('node')]
tower = None
print('aprons', len(aprons), 'taxi', len(taxi), sum(len(t) for t in taxi) // 2, 'terms', {k: len(v) // 2 for k, v in term.items()}, 'stands', len(stands))
W = json.load(open(WJ))
W['aero'] = {'rwy': rwy, 'apron': aprons, 'taxi': taxi, 'term': term, 'stands': stands, 'tower': [2608, 9787]}
json.dump(W, open(WJ, 'w'), ensure_ascii=False, separators=(',', ':'))
print('bytes', len(json.dumps(W['aero'])))
