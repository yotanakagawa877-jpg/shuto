# v3.3 land mask from real data: land = municipal areas (N03), water / parks / forests / airports from OSM.
#   fine grid (8 m) over the former core map, coarse grid (16 m, same frame as data/ext_mask_rle.json) for the rest
# values: 0 water, 1 land, 2 park, 3 palace, 4 forest, 5 moat, 6 airport
# usage: python3 -I tools/osm/mask.py water.json ext_mask_rle.json OUT.json
import sys, json, math, glob, os
import numpy as np
from PIL import Image, ImageDraw
import shapely
WJ, EXT, OUT = sys.argv[1:4]
A9 = math.cos(35.64 * math.pi / 180) * 111320; R9 = 110950
def xz(lng, lat): return ((lng - 139.755) * A9, -(lat - 35.64) * R9)
W = json.load(open(WJ)); EM = json.load(open(EXT))

def munis():
    out = []
    for p in ('08', '11', '12', '13', '14'):
        for f in glob.glob(f'/home/claude/ext/JapanCityGeoJson/geojson/{p}/*.json'):
            g = json.load(open(f))
            for ft in g['features']:
                c = ft['geometry']['coordinates']; polys = [c] if ft['geometry']['type'] == 'Polygon' else c
                for pl in polys: out.append([[xz(*q) for q in pl[0]]] + [[xz(*q) for q in r] for r in pl[1:]])
    S = '/home/claude/ext/japan-topography/data/municipality/geojson/s0010/'
    for p in ('12', '13'):
        g = json.load(open(S + f'N03-21_{p}_210101.json'))
        for ft in g['features']:
            if ft['properties'].get('N03_007'): continue
            c = ft['geometry']['coordinates']; polys = [c] if ft['geometry']['type'] == 'Polygon' else c
            for pl in polys: out.append([[xz(*q) for q in pl[0]]] + [[xz(*q) for q in r] for r in pl[1:]])
    return out
M = munis(); print('municipal polygons', len(M))
PAL = xz(139.7528, 35.6852)

def raster(X0, Z0, Wd, Ht, cell):
    im = Image.new('L', (Wd, Ht), 0); d = ImageDraw.Draw(im)
    f = lambda pts: [((x - X0) / cell, (z - Z0) / cell) for x, z in pts]
    def poly(pts, v):
        if len(pts) >= 3: d.polygon(f(pts), fill=v)
    # every ring is land: municipal areas do not overlap, holes are enclaves (other municipalities)
    # (N03 via JapanCityGeoJson stores the separate parts of a municipality as rings of one polygon)
    for pl in M:
        for r in pl: poly(r, 1)
    for p in W['park']: poly(p, 2)
    for p in W['forest']: poly(p, 4)
    for p in W['air']: poly(p, 6)
    for p in W['water']:
        cx = sum(q[0] for q in p) / len(p); cz = sum(q[1] for q in p) / len(p)
        v = 5 if math.hypot(cx - PAL[0], cz - PAL[1]) < 1300 else 0
        # long river rings are often self-intersecting: draw their valid form (exteriors, then holes back as land)
        g = shapely.make_valid(shapely.Polygon(p)) if len(p) >= 3 else None
        if g is None or g.is_empty: continue
        for part in getattr(g, 'geoms', [g]):
            if part.geom_type != 'Polygon': continue
            poly(list(part.exterior.coords), v)
            for h in part.interiors: poly(list(h.coords), 1)
    for p in W['holes']: poly(p, 1)
    a = np.array(im, dtype=np.uint8)
    # the palace grounds: park / forest inside the moats
    yy, xx = np.mgrid[0:Ht, 0:Wd]
    near = np.hypot(X0 + (xx + 0.5) * cell - PAL[0], Z0 + (yy + 0.5) * cell - PAL[1]) < 900
    a[near & ((a == 2) | (a == 4))] = 3
    return a

def rle(a):
    out = bytearray()
    def vi(v):
        while v >= 128: out.append((v & 127) | 128); v >>= 7
        out.append(v)
    flat = a.ravel(); n = len(flat)
    idx = np.flatnonzero(np.diff(flat)) + 1
    starts = np.concatenate([[0], idx]); ends = np.concatenate([idx, [n]])
    for s, e in zip(starts, ends): vi(int(flat[s])); vi(int(e - s))
    import base64
    return base64.b64encode(bytes(out)).decode()

# fine grid: the frame of the old core map (B2 in the game)
x0, z0 = xz(139.6, 35.745); x1, z1 = xz(139.845, 35.425)
FX0, FZ0 = x0 - 400, z0 - 400; FW = math.ceil((x1 - x0 + 800) / 8); FH = math.ceil((z1 - z0 + 800) / 8)
fine = raster(FX0, FZ0, FW, FH, 8)
coarse = raster(EM['X0'], EM['Z0'], EM['W'], EM['H'], EM['cell'])
res = {'fine': {'X0': FX0, 'Z0': FZ0, 'W': FW, 'H': FH, 'cell': 8, 'rle': rle(fine)},
       'mask': {'X0': EM['X0'], 'Z0': EM['Z0'], 'W': EM['W'], 'H': EM['H'], 'cell': EM['cell'], 'rle': rle(coarse)}}
json.dump(res, open(OUT, 'w'))
print('fine', FW, FH, np.bincount(fine.ravel(), minlength=7), 'coarse', np.bincount(coarse.ravel(), minlength=7), 'bytes', os.path.getsize(OUT))
Image.fromarray((np.array([[40, 90, 160], [215, 210, 200], [120, 180, 110], [90, 150, 90], [60, 120, 60], [70, 120, 190], [170, 170, 180]], np.uint8)[coarse])).save('/home/claude/osm/mask_coarse.png')
