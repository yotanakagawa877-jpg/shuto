# Write gzip data as base64 text parts (<= 12 MB each) for the artifact host's per-file size limit.
#   data/world.json        -> dist/data/world.b64.N.txt
#   data/tiles/PX_PZ.bin   -> dist/data/t2/PX_PZ.txt   (v3.3 streamed OSM packs, one file each)
import base64, os, glob, gzip
os.makedirs('dist/data/t2', exist_ok=True)
for f in glob.glob('dist/data/*.txt') + glob.glob('dist/data/t2/*.txt'): os.remove(f)
LIM = 12_000_000
raw = gzip.compress(open('data/world.json', 'rb').read(), 9)
b = base64.b64encode(raw).decode()
parts = [b[i:i + LIM] for i in range(0, len(b), LIM)]
for i, p in enumerate(parts): open(f'dist/data/world.b64.{i}.txt', 'w').write(p)
print('world', len(raw), 'parts', len(parts))
tot = 0
for fn in sorted(glob.glob('data/tiles/*.bin')):
    raw = gzip.compress(open(fn, 'rb').read(), 9)
    b = base64.b64encode(raw).decode()
    assert len(b) < 16_000_000, fn
    open('dist/data/t2/' + os.path.basename(fn)[:-4] + '.txt', 'w').write(b)
    tot += len(b)
print('tiles', len(glob.glob('data/tiles/*.bin')), 'b64 MB', round(tot / 1e6, 1))
if os.path.exists('data/lu.bin'):  # v5.0 land-use layer (fields / greenhouses / industry)
    b = base64.b64encode(gzip.compress(open('data/lu.bin', 'rb').read(), 9)).decode()
    open('dist/data/lu.txt', 'w').write(b); print('land use b64 KB', len(b) // 1000)
if os.path.exists('data/startup.bin'):
    b = base64.b64encode(gzip.compress(open('data/startup.bin', 'rb').read(), 9)).decode()
    open('dist/data/startup.txt', 'w').write(b); print('startup snapshot b64 KB', len(b) // 1000)
