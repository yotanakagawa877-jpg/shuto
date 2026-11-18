# public facilities inside the map (OSM amenity=*) -> compact lists in game coordinates
# usage: python3 -I tools/v5/amen.py kanto.osm.pbf out.json
import sys, json, math, osmium
PBF, OUT = sys.argv[1], sys.argv[2]
LAT0, LNG0, C = 35.64, 139.755, math.cos(math.radians(35.64))
def xz(lng, lat): return ((lng - LNG0) * C * 111320, -(lat - LAT0) * 110950)
KINDS = {'police': 'po', 'hospital': 'ho', 'fire_station': 'fi', 'townhall': 'th', 'library': 'li', 'post_office': 'pt', 'school': 'sc'}
out = {v: [] for v in KINDS.values()}
class H(osmium.SimpleHandler):
    def add(self, t, lng, lat):
        k = KINDS.get(t.get('amenity'))
        if not k: return
        x, z = xz(lng, lat)
        if not (-44500 < x < 43500 and -47500 < z < 52800): return
        if k == 'ho' and t.get('emergency') != 'yes' and 'hospital' not in (t.get('healthcare') or 'hospital'): return
        if k == 'th' and t.get('townhall:type') not in (None, 'city', 'town', 'ward', 'village'): return
        out[k].append([round(x), round(z), (t.get('name') or '')[:24], 1 if (k == 'po' and ('交番' in (t.get('name') or '') or t.get('police') == 'koban')) else 0])
    def node(self, n):
        if 'amenity' in n.tags and n.location.valid(): self.add(n.tags, n.location.lon, n.location.lat)
    def area(self, a):
        if 'amenity' not in a.tags: return
        try:
            ring = next(iter(a.outer_rings()))
            xs = [p.lon for p in ring]; ys = [p.lat for p in ring]
            self.add(a.tags, sum(xs) / len(xs), sum(ys) / len(ys))
        except Exception: pass
H().apply_file(PBF, locations=True, idx='flex_mem')
for k, v in out.items():
    # de-duplicate (node + area of the same place)
    seen, keep = set(), []
    for e in v:
        key = (round(e[0] / 40), round(e[1] / 40))
        if key in seen: continue
        seen.add(key); keep.append(e)
    out[k] = keep
    print(k, len(keep))
json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
