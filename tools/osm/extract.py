# OSM (Kanto .pbf) -> compact intermediate data for the map builder (v3.3)
#   roads.json : highway ways inside the map bounds  [{k: kind, n: name, p: [[x,z],...], b: bridge, t: tunnel, l: layer, o: oneway}]
#   bld.bin    : buildings as polygons in game metres  (records: u32 nPts, u8 cls, u8 levels, u16 height*10, f32 x,z ...)
#   areas.json : landuse / amenity areas that steer zoning (commercial, retail, industrial, station, school, park ...)
# usage: python3 -I tools/osm/extract.py /home/claude/osm/kanto.osm.pbf OUTDIR
import sys, json, math, struct, os
import osmium

PBF, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
A9 = math.cos(35.64 * math.pi / 180) * 111320; R9 = 110950
def xz(lon, lat): return ((lon - 139.755) * A9, -(lat - 35.64) * R9)
# map bounds (tools/geo/mask.mjs BOUNDS) plus a margin
LAT0, LAT1, LNG0, LNG1 = 35.30 - 0.01, 35.93 + 0.01, 139.43 - 0.01, 140.07 + 0.01
def inb(lon, lat): return LNG0 <= lon <= LNG1 and LAT0 <= lat <= LAT1

ROADK = {
  'motorway': 'X', 'motorway_link': 'R',
  'trunk': 'A', 'trunk_link': 'A', 'primary': 'A', 'primary_link': 'A',
  'secondary': 'B', 'secondary_link': 'B', 'tertiary': 'B', 'tertiary_link': 'B',
  'unclassified': 'L', 'residential': 'L', 'living_street': 'L', 'service': 'S',
}
BCLS = {'house': 1, 'detached': 1, 'residential': 2, 'apartments': 3, 'terrace': 2, 'dormitory': 3,
        'commercial': 4, 'retail': 5, 'office': 6, 'hotel': 7, 'industrial': 8, 'warehouse': 8, 'factory': 8,
        'school': 9, 'university': 9, 'college': 9, 'hospital': 10, 'train_station': 11, 'station': 11,
        'temple': 12, 'shrine': 12, 'church': 12, 'public': 13, 'civic': 13, 'government': 13,
        'garage': 14, 'garages': 14, 'carport': 14, 'roof': 15, 'shed': 14, 'hut': 14, 'kiosk': 5,
        'parking': 16, 'stadium': 17, 'sports_hall': 17, 'construction': 18}
AREAK = {('landuse', 'commercial'): 'com', ('landuse', 'retail'): 'ret', ('landuse', 'industrial'): 'ind',
         ('landuse', 'residential'): 'res', ('landuse', 'railway'): 'rail', ('amenity', 'school'): 'sch',
         ('amenity', 'university'): 'sch', ('amenity', 'hospital'): 'hos', ('railway', 'station'): 'sta',
         ('leisure', 'park'): 'park', ('landuse', 'farmland'): 'farm', ('landuse', 'cemetery'): 'cem',
         ('landuse', 'forest'): 'wood', ('natural', 'wood'): 'wood', ('leisure', 'golf_course'): 'golf'}

def num(s):
    try: return float(str(s).replace('m', '').replace(',', '.').split(';')[0].strip())
    except Exception: return 0.0

roads, areas = [], []
bf = open(os.path.join(OUT, 'bld.bin'), 'wb')
nb = 0

class H(osmium.SimpleHandler):
    def way(self, w):
        hw = w.tags.get('highway')
        if hw not in ROADK: return
        if hw == 'service' and w.tags.get('service') in ('parking_aisle', 'drive-through', 'emergency_access'): return
        if w.tags.get('area') == 'yes': return
        try: P = [(n.lon, n.lat) for n in w.nodes]
        except osmium.InvalidLocationError: return
        if not any(inb(*q) for q in P): return
        roads.append({'k': ROADK[hw], 'h': hw, 'n': w.tags.get('name', ''), 'r': w.tags.get('ref', ''),
                      'p': [[round(v, 1) for v in xz(*q)] for q in P],
                      'b': 1 if w.tags.get('bridge') not in (None, 'no') else 0,
                      't': 1 if w.tags.get('tunnel') not in (None, 'no') else 0,
                      'l': int(num(w.tags.get('layer', '0'))), 'o': 1 if w.tags.get('oneway') == 'yes' else 0,
                      'n2': int(num(w.tags.get('lanes', '0'))), 'wd': round(num(w.tags.get('width', '0')), 1),
                      'w': w.id})

    def area(self, a):
        global nb
        t = a.tags
        b = t.get('building')
        if b and b != 'no':
            for ring in a.outer_rings():
                P = [(n.lon, n.lat) for n in ring]
                if len(P) < 4 or not inb(*P[0]): continue
                cls = BCLS.get(b, 0)
                if t.get('shop') or t.get('amenity') in ('restaurant', 'cafe', 'fast_food', 'bank'): cls = cls or 5
                lv = int(max(0, min(255, num(t.get('building:levels', '0')))))
                h = max(0.0, num(t.get('height', '0')))
                pts = [xz(*q) for q in P[:-1]]
                bf.write(struct.pack('<IBBH', len(pts), cls, lv, int(min(65535, h * 10))))
                bf.write(struct.pack('<%df' % (2 * len(pts)), *[v for q in pts for v in q]))
                nb += 1
            return
        for (k, v), cls in AREAK.items():
            if t.get(k) == v:
                for ring in a.outer_rings():
                    P = [(n.lon, n.lat) for n in ring]
                    if len(P) < 4 or not any(inb(*q) for q in P[::max(1, len(P) // 8)]): continue
                    areas.append({'c': cls, 'p': [[round(v2, 1) for v2 in xz(*q)] for q in P[:-1]]})
                break

H().apply_file(PBF, locations=True, idx='flex_mem')
bf.close()
json.dump(roads, open(os.path.join(OUT, 'roads.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(areas, open(os.path.join(OUT, 'areas.json'), 'w'), separators=(',', ':'))
print('roads', len(roads), 'buildings', nb, 'areas', len(areas))
