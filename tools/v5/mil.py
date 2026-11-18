# military areas (landuse=military / military=*) inside the map -> outlines in game coordinates for fences / gates
# usage: python3 -I tools/v5/mil.py kanto.osm.pbf out.json
import sys, json, math, osmium
from shapely import wkb as W
from shapely.geometry import Polygon
PBF, OUT = sys.argv[1], sys.argv[2]
LAT0, LNG0, C = 35.64, 139.755, math.cos(math.radians(35.64))
def xz(lng, lat): return ((lng - LNG0) * C * 111320, -(lat - LAT0) * 110950)
BASES = {  # name, parody, lat, lng, kind
 'asaka': ('朝霞駐屯地', 35.796, 139.595, 'gsdf'), 'nerima': ('練馬駐屯地', 35.745, 139.637, 'gsdf'),
 'yokosuka': ('横須賀基地', 35.290, 139.664, 'navy'), 'iruma': ('入間基地', 35.842, 139.410, 'asdf'),
 'atsugi': ('厚木基地', 35.455, 139.450, 'navy_air'), 'kisarazu': ('木更津駐屯地', 35.398, 139.910, 'gsdf_air'),
 'shimofusa': ('下総航空基地', 35.799, 140.011, 'msdf_air'), 'yokota': ('横田基地', 35.749, 139.348, 'us_air'),
}
fab = osmium.geom.WKBFactory()
areas = []
class H(osmium.SimpleHandler):
    def area(self, a):
        t = a.tags
        if t.get('landuse') == 'military' or t.get('military') in ('base', 'airfield', 'naval_base', 'barracks', 'training_area'):
            try:
                g = W.loads(fab.create_multipolygon(a), hex=True)
            except Exception:
                return
            if g.area < 2e-6: return
            areas.append((t.get('name', ''), g))
H().apply_file(PBF, locations=True, idx='flex_mem')
out = {}
for k, (name, lat, lng, kind) in BASES.items():
    from shapely.geometry import Point
    p = Point(lng, lat)
    cand = [(g.distance(p), nm, g) for nm, g in areas if g.distance(p) < 0.01]
    if not cand: print('missing', k); continue
    # union of the touching parts around the base point
    cand.sort(key=lambda c: c[0])
    g = cand[0][2]
    for d, nm, h in cand[1:]:
        if h.distance(g) < 0.0015: g = g.union(h)
    g = g.buffer(0)
    poly = max(g.geoms, key=lambda q: q.area) if g.geom_type == 'MultiPolygon' else g
    poly = poly.simplify(0.00012)
    ring = [xz(x, y) for x, y in poly.exterior.coords]
    cx, cz = xz(poly.centroid.x, poly.centroid.y)
    out[k] = {'name': name, 'kind': kind, 'cx': round(cx, 1), 'cz': round(cz, 1), 'ring': [[round(x, 1), round(z, 1)] for x, z in ring],
              'area_m2': round(poly.area * (C * 111320) * 110950)}
    print(k, name, len(ring), out[k]['area_m2'])
json.dump(out, open(OUT, 'w'), ensure_ascii=False)
