# runtime land-use layer: 32 m cells, 0 none / 1 field (paddy or crops) / 2 greenhouse / 3 industrial
# from the 16 m landuse.npz (tools/v5/landuse.py) -> data/lu.bin: header (int32 x0, z0, s, nx, nz) + run-length bytes
# usage: python3 -I tools/v5/lulayer.py landuse.npz data/lu.bin
import sys, struct, numpy as np
D = np.load(sys.argv[1]); lu = D['lu']
h, w = lu.shape[0] // 2, lu.shape[1] // 2
a = lu[:h * 2, :w * 2].reshape(h, 2, w, 2)
def frac(k): return (a == k).sum(axis=(1, 3))
out = np.zeros((h, w), np.uint8)
out[frac(4) >= 3] = 1
out[frac(5) >= 2] = 2
out[frac(3) >= 3] = 3
flat = out.ravel()
# run-length: (value, run) pairs, run as uint16 (split long runs)
buf = bytearray(struct.pack('<5i', int(D['x0']), int(D['z0']), int(D['s']) * 2, w, h))
i, n = 0, len(flat)
change = np.flatnonzero(np.diff(flat)) + 1
starts = np.concatenate([[0], change]); ends = np.concatenate([change, [n]])
for s0, e0 in zip(starts, ends):
    v, run = int(flat[s0]), int(e0 - s0)
    while run > 0:
        r = min(run, 65535); buf += struct.pack('<BH', v, r); run -= r
open(sys.argv[2], 'wb').write(bytes(buf))
print('cells', {k: int((out == k).sum()) for k in (1, 2, 3)}, 'bytes', len(buf))
