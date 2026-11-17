# v3.5: pack airfields / racecourses / theme parks / wheels / coasters into world.json 'fun'
import json, sys, math
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, Point
O = json.load(open(sys.argv[1])); WJ = sys.argv[2]
def simp(p, tol, closed):
    g = Polygon(p) if closed else LineString(p)
    if closed and not g.is_valid: g = shapely.make_valid(g).buffer(0)
    g = g.simplify(tol)
    if closed:
        if g.geom_type != 'Polygon': g = max(g.geoms, key=lambda q: q.area)
        g = shapely.geometry.polygon.orient(g, 1.0); c = list(g.exterior.coords)[:-1]
    else: c = list(g.coords)
    return [round(v, 1) for q in c for v in q]
R = lambda v: round(float(v), 1)
AF = {'調布': ('調布飛行場', (-20540, -3500), 30, 'small'), '厚木': ('厚木基地', (-27580, 20570), 45, 'mil'),
      '下総': ('下総航空基地', (23270, -17640), 45, 'mil'), '木更津': ('木更津駐屯地', (14020, 26820), 45, 'heli')}
af = []
for k, (name, c, w, kind) in AF.items():
    near = lambda p, r=3500: math.dist(c, p) < r
    rw = [x for x in O['ways'] if x['ae'] == 'runway' and near(x['p'][0])]
    rwy = []
    for x in rw:
        P = np.array(x['p']); m = P.mean(0); _, _, vt = np.linalg.svd(P - m); d = vt[0]; t = (P - m) @ d
        a, b = m + d * t.min(), m + d * t.max(); rwy.append([R(a[0]), R(a[1]), R(b[0]), R(b[1]), w])
    ap = [simp(x['p'], 1.0, True) for x in O['ways'] if x['ae'] == 'apron' and near(x['p'][0]) and len(x['p']) > 3 and x['p'][0] == x['p'][-1]]
    tx = [[15 if kind == 'small' else 23] + simp(x['p'], 0.8, False) for x in O['ways'] if x['ae'] == 'taxiway' and near(x['p'][0])]
    hp = [[R(sum(q[0] for q in x['p']) / len(x['p'])), R(sum(q[1] for q in x['p']) / len(x['p']))] for x in O['ways'] if x['ae'] == 'helipad' and near(x['p'][0], 2500)]
    st = [[R(n['p'][0]), R(n['p'][1])] for n in O['nodes'] if n['ae'] == 'parking_position' and near(n['p'], 1500)]
    af.append({'name': name, 'kind': kind, 'rwy': rwy, 'apron': ap, 'taxi': tx, 'heli': hp[:12], 'stands': st})
    print(name, len(rwy), len(ap), len(tx), len(hp), len(st))
# racecourses: facility polygon + course rings inside it + track centre lines
fac = {}
for a in O['areas']:
    if a['kind'] == 'race' and a['name'].endswith('競馬場'):
        if a['name'] not in fac or a['a'] > fac[a['name']]['a']: fac[a['name']] = a
race = []
for name, f in fac.items():
    FP = Polygon(f['p']).buffer(0)
    rings = [a for a in O['areas'] if a['kind'] == 'race' and not a['name'] and FP.contains(Polygon(a['p']).buffer(0).representative_point()) and a['a'] < f['a'] * 0.97 and a['a'] > 40000]
    tracks = [w for w in O['ways'] if w['le'] in ('track', 'raceway') and FP.buffer(50).contains(Point(w['p'][0])) and len(w['p']) > 10]
    if not rings and not tracks:
        rings = [a for a in O['areas'] if a['kind'] == 'race' and a['name'] == name and a['a'] < f['a'] * 0.97]
    c = FP.centroid
    race.append({'name': name, 'c': [R(c.x), R(c.y)], 'rings': [simp(a['p'], 1.5, True) for a in sorted(rings, key=lambda a: -a['a'])][:3],
                 'tracks': [simp(w['p'], 1.0, False) for w in tracks][:3]})
    print(name, len(rings), len(tracks))
# theme parks (parody names for the Tokyo Disney Resort)
PN = {'東京ディズニーランド': 'トーキョー・ファンタジーランド', '東京ディズニーシー': 'トーキョー・ファンタジーシー'}
keep = ['東京ディズニーランド', '東京ディズニーシー', 'よみうりランド', '横浜・八景島シーパラダイス', '西武園ゆうえんち', 'あらかわ遊園', '東京ドイツ村', 'こどもの国']
parks = []
for a in O['areas']:
    if a['kind'] == 'park' and a['name'] in keep and not any(p['name'] == PN.get(a['name'], a['name']) for p in parks):
        P = Polygon(a['p']).buffer(0); c = P.centroid
        parks.append({'name': PN.get(a['name'], a['name']), 'c': [R(c.x), R(c.y)], 'p': simp(a['p'], 2.5, True), 'nature': a['name'] in ('こどもの国', '東京ドイツ村')})
# Tokyo Dome City attractions has no polygon here: a small plaza from its coasters
print('parks', [p['name'] for p in parks])
# ferris wheels: [x, z, diameter, yaw(plane of the wheel), name]
WD = {'ダイヤと花の大観覧車': 111, 'コスモクロック21': 0}
wheels = []
for w in O['ways']:
    if w['a'] == 'big_wheel':
        P = np.array(w['p']); m = P.mean(0)
        if len(P) > 2:
            _, _, vt = np.linalg.svd(P - m); d = vt[0]; yaw = math.atan2(d[0], d[1])
            ext = float(np.ptp((P - m) @ d))
        else: yaw, ext = 0.0, 30
        D = WD.get(w['name'], max(30, min(70, ext)))
        if D: wheels.append([R(m[0]), R(m[1]), D, round(yaw, 3), w['name']])
for n in O['nodes']:
    if n['a'] == 'big_wheel' and n['name'] not in ('幸せの観覧車',):
        if any(math.dist(n['p'], q[:2]) < 80 for q in wheels): continue
        D = 60 if n['h'] == '67' else 40
        wheels.append([n['p'][0], n['p'][1], D, 0.6, n['name']])
print('wheels', wheels)
coasters = []
for w in O['ways']:
    if w['a'] in ('roller_coaster',) and len(w['p']) > 3:
        L = sum(math.dist(w['p'][i], w['p'][i + 1]) for i in range(len(w['p']) - 1))
        if L > 120: coasters.append(simp(w['p'], 0.6, False))
print('coasters', len(coasters), sum(len(c) for c in coasters) // 2)
W = json.load(open(WJ))
W['fun'] = {'af': af, 'race': race, 'parks': parks, 'wheels': wheels, 'coasters': coasters}
json.dump(W, open(WJ, 'w'), ensure_ascii=False, separators=(',', ':'))
print('bytes', len(json.dumps(W['fun'])))
