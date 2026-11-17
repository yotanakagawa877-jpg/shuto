# overview: existing world rails (white) vs MT3D lines (colour), old bounds, new bounds
import json, sys
from PIL import Image, ImageDraw
W = json.load(open('data/world.json')); M = json.load(open('data/mt3d.json'))['lines']
A9 = 90460.0
def fe(lat, lng): return ((lng - 139.755) * 90457.6, -(lat - 35.64) * 110950)
nb = [fe(35.92, 139.47), fe(35.33, 140.0)]
x0, z0 = nb[0][0] - 3000, nb[0][1] - 3000; x1, z1 = nb[1][0] + 3000, nb[1][1] + 3000
S = float(sys.argv[1]) if len(sys.argv) > 1 else 0.03
w, h = int((x1 - x0) * S), int((z1 - z0) * S)
im = Image.new('RGB', (w, h), (20, 22, 26)); d = ImageDraw.Draw(im); P = lambda x, z: ((x - x0) * S, (z - z0) * S)
N = W['nodes']
for e in W['edges']:
    if e[2] == 0:
        pts = [N[e[0]][:2]] + (e[4] or []) + [N[e[1]][:2]]
        d.line([P(*p) for p in pts], fill=(140, 90, 30), width=2)
for id, l in M.items():
    c = l['color'].lstrip('#'); col = tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    pts = l['path']
    d.line([P(*p) for p in pts], fill=col, width=2)
for r in W['rails']:
    d.line([P(*p) for p in r['path']], fill=(255, 255, 255), width=1)
ob = [fe(35.745, 139.6), fe(35.425, 139.845)]
d.rectangle([P(*ob[0]), P(*ob[1])], outline=(255, 255, 0))
d.rectangle([P(*nb[0]), P(*nb[1])], outline=(0, 255, 255))
im.save(sys.argv[2] if len(sys.argv) > 2 else 'test/maps/overview.png'); print(w, h)
