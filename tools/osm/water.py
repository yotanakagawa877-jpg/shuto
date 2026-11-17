# v3.3: water / park / forest / airport polygons from OSM for the land mask
# usage: python3 -I tools/osm/water.py kanto.osm.pbf OUT.json
import sys, json, math
import osmium
PBF, OUT = sys.argv[1], sys.argv[2]
A9 = math.cos(35.64 * math.pi / 180) * 111320; R9 = 110950
def xz(lon, lat): return [round((lon - 139.755) * A9, 1), round(-(lat - 35.64) * R9, 1)]
LAT0, LAT1, LNG0, LNG1 = 35.29, 35.94, 139.42, 140.08
out = {'water': [], 'park': [], 'forest': [], 'air': [], 'holes': []}
class H(osmium.SimpleHandler):
    def area(self, a):
        t = a.tags; c = None
        if t.get('natural') == 'water' or t.get('waterway') in ('riverbank', 'dock') or t.get('landuse') in ('reservoir', 'basin'): c = 'water'
        elif t.get('leisure') in ('park', 'garden') or t.get('landuse') in ('grass', 'recreation_ground', 'cemetery'): c = 'park'
        elif t.get('landuse') == 'forest' or t.get('natural') in ('wood', 'scrub'): c = 'forest'
        elif t.get('aeroway') == 'aerodrome': c = 'air'
        if not c: return
        for ring in a.outer_rings():
            P = [(n.lon, n.lat) for n in ring]
            if len(P) < 4: continue
            lo = [p[0] for p in P]; la = [p[1] for p in P]
            if max(lo) < LNG0 or min(lo) > LNG1 or max(la) < LAT0 or min(la) > LAT1: continue
            out[c].append([xz(*p) for p in P[:-1]])
            if c == 'water':
                for inner in a.inner_rings(ring):
                    Q = [(n.lon, n.lat) for n in inner]
                    if len(Q) >= 4: out['holes'].append([xz(*p) for p in Q[:-1]])
H().apply_file(PBF, locations=True, idx='flex_mem')
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print({k: len(v) for k, v in out.items()})
