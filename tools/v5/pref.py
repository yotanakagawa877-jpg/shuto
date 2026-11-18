# prefecture raster for police labels: admin_level=4 boundaries from the OSM extract -> 500 m grid, run-length string
# usage: python3 -I tools/v5/pref.py kanto.osm.pbf out.json
import sys, json, math, osmium
from shapely import wkb as W
from shapely.prepared import prep
from shapely.geometry import Point
PBF, OUT = sys.argv[1], sys.argv[2]
NAMES = {'東京都': 1, '神奈川県': 2, '千葉県': 3, '埼玉県': 4, '茨城県': 5, '山梨県': 6, '群馬県': 7, '栃木県': 8, '静岡県': 9}
fab = osmium.geom.WKBFactory()
polys = {}
class H(osmium.SimpleHandler):
    def area(self, a):
        t = a.tags
        if t.get('boundary') == 'administrative' and t.get('admin_level') == '4' and t.get('name') in NAMES:
            try: polys[t['name']] = W.loads(fab.create_multipolygon(a), hex=True)
            except Exception as e: print('fail', t.get('name'), e)
H().apply_file(PBF, locations=True, idx='flex_mem')
print({k: v.area for k, v in polys.items()})
LAT0, LNG0, C = 35.64, 139.755, math.cos(math.radians(35.64))
x0, x1, z0, z1, S = -46000, 46000, -50000, 54000, 500
nx, nz = (x1 - x0) // S, (z1 - z0) // S
pp = {NAMES[k]: prep(v) for k, v in polys.items()}
cells = []
for j in range(nz):
    for i in range(nx):
        x, z = x0 + (i + .5) * S, z0 + (j + .5) * S
        lng, lat = LNG0 + x / (C * 111320), LAT0 - z / 110950
        p = Point(lng, lat); code = 0
        for k, g in pp.items():
            if g.contains(p): code = k; break
        # Tokyo's own boundary relation does not assemble from the extract (the islands are outside it): what no other
        # prefecture claims north of the bay mouth and west of the Edogawa is Tokyo
        if not code and '東京都' not in polys and lat >= 35.53 and lng <= 139.92 and lng >= 139.0: code = 1
        cells.append(code)
# fill sea / unknown cells from the nearest coded neighbour so coasts get the right label
import collections
grid = [cells[j * nx:(j + 1) * nx] for j in range(nz)]
q = collections.deque((i, j) for j in range(nz) for i in range(nx) if grid[j][i])
while q:
    i, j = q.popleft()
    for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        a, b = i + di, j + dj
        if 0 <= a < nx and 0 <= b < nz and not grid[b][a]: grid[b][a] = grid[j][i]; q.append((a, b))
flat = [c for row in grid for c in row]
rle = []
for c in flat:
    if rle and rle[-1][0] == c: rle[-1][1] += 1
    else: rle.append([c, 1])
s = ''.join(f'{c}{n},' for c, n in rle)
json.dump({'x0': x0, 'z0': z0, 's': S, 'nx': nx, 'nz': nz, 'rle': s}, open(OUT, 'w'))
print(nx, nz, len(s))
