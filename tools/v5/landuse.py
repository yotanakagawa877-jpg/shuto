# land-use raster for the infill / farmland pass: 16 m cells over the whole map, one byte per cell
#   1 residential  2 commercial/retail  3 industrial  4 farmland (paddy / field)  5 greenhouse / orchard
#   9 no-build (water, park, forest, cemetery, military, rail yard, school / hospital grounds, golf, pitch)
# usage: python3 -I tools/v5/landuse.py kanto.osm.pbf out.npz
import sys, math, numpy as np, osmium
from PIL import Image, ImageDraw
PBF, OUT = sys.argv[1], sys.argv[2]
LAT0, LNG0, C = 35.64, 139.755, math.cos(math.radians(35.64))
X0, Z0, X1, Z1, S = -46000, -50000, 46000, 54000, 16
NX, NZ = (X1 - X0) // S, (Z1 - Z0) // S
def px(lng, lat): return (((lng - LNG0) * C * 111320) - X0) / S, ((-(lat - LAT0) * 110950) - Z0) / S
def cls(t):
    lu, na, le, am, wa = t.get('landuse'), t.get('natural'), t.get('leisure'), t.get('amenity'), t.get('waterway')
    if lu == 'residential': return 1
    if lu in ('commercial', 'retail'): return 2
    if lu == 'industrial': return 3
    if lu in ('farmland', 'meadow', 'grass', 'farmyard') or t.get('crop') == 'rice': return 4
    if lu in ('greenhouse_horticulture', 'orchard', 'vineyard', 'plant_nursery'): return 5
    if lu in ('forest', 'reservoir', 'basin', 'cemetery', 'military', 'railway', 'quarry', 'landfill', 'recreation_ground', 'religious'): return 9
    if na in ('water', 'wood', 'wetland', 'scrub', 'beach', 'sand', 'bare_rock'): return 9
    if le in ('park', 'golf_course', 'pitch', 'garden', 'nature_reserve', 'stadium', 'playground', 'track'): return 9
    if am in ('school', 'university', 'college', 'hospital', 'kindergarten', 'parking'): return 9
    if wa == 'riverbank': return 9
    return 0
# paint order: farmland / urban first, no-build last so it wins
layers = {k: Image.new('L', (NX, NZ), 0) for k in (1, 2, 3, 4, 5, 9)}
drw = {k: ImageDraw.Draw(v) for k, v in layers.items()}
n = [0]
class H(osmium.SimpleHandler):
    def area(self, a):
        k = cls(a.tags)
        if not k: return
        try:
            for outer in a.outer_rings():
                pts = [px(p.lon, p.lat) for p in outer]
                if len(pts) >= 3: drw[k].polygon(pts, fill=1)
                for inner in a.inner_rings(outer):
                    q = [px(p.lon, p.lat) for p in inner]
                    len(q) >= 3 and drw[k].polygon(q, fill=0)
            n[0] += 1
        except Exception:
            pass
H().apply_file(PBF, locations=True, idx='flex_mem')
out = np.zeros((NZ, NX), np.uint8)
for k in (4, 5, 1, 2, 3, 9):
    m = np.array(layers[k], dtype=np.uint8) > 0
    out[m] = k
np.savez_compressed(OUT, lu=out, x0=X0, z0=Z0, s=S)
print('areas', n[0], {k: int((out == k).sum()) for k in (1, 2, 3, 4, 5, 9)})
