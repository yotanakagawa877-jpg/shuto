# v4.0: apply a bake run of the extended map without touching the v3.6 core:
#  - buildings cleared at start-up are removed only from tiles whose centre lies outside the old bounds (the ring)
#  - replay: keyed answers (v/s/o/f) keep the old entries and add the new ones; d (station stores, in station order)
#    and c (cleared lots) come from the new run (c merged with the old list)
# usage: python3 -I tools/ext/bake_ring.py cleared.json cleared_replay.json data/tiles data/world.json
import sys, json, struct, glob, os, collections, math
CL, RPF, TD, WJ = sys.argv[1:5]
P = 5; T = 1280
Ay = math.cos(35.64 * math.pi / 180) * 111320; QS = 110950
ox0 = (139.43 - 139.755) * Ay; ox1 = (140.07 - 139.755) * Ay; oz0 = -(35.93 - 35.64) * QS; oz1 = -(35.30 - 35.64) * QS
def ring(tx, tz):
    x = (tx + .5) * T; z = (tz + .5) * T
    return not (ox0 < x < ox1 and oz0 < z < oz1)
rm = collections.defaultdict(set); skipped = 0
for k in json.load(open(CL)):
    t, i = divmod(int(k), 65536); tx, tz = t // 1024 - 512, t % 1024 - 512
    if ring(tx, tz): rm[(tx, tz)].add(i)
    else: skipped += 1
tot = 0; index = []
for fn in sorted(glob.glob(os.path.join(TD, '*.bin'))):
    d = open(fn, 'rb').read(); px, pz = struct.unpack_from('<ii', d, 0)
    tab = [struct.unpack_from('<IIIIII', d, 8 + 24 * k) for k in range(P * P)]; base = 8 + 24 * P * P
    blob = bytearray(); nt = []; ch = False
    for k, (so, sl, bo, bl, po, pl) in enumerate(tab):
        t = (px * P + k // P, pz * P + k % P)
        s = d[base + so: base + so + sl]; b = d[base + bo: base + bo + bl]; pb = d[base + po: base + po + pl]
        if t in rm:
            ch = True
            r = rm[t]; nb = len(b) // 12
            b = b''.join(b[i * 12:(i + 1) * 12] for i in range(nb) if i not in r); tot += len([i for i in r if i < nb])
            newi = {}; j = 0
            for i in range(nb):
                if i not in r: newi[i] = j; j += 1
            if len(pb) >= 2:
                npo = struct.unpack_from('<H', pb, 0)[0]; o = 2; out = bytearray(); cnt = 0
                for _ in range(npo):
                    bi, nv = struct.unpack_from('<HB', pb, o); rec = pb[o + 3: o + 3 + 4 * nv]; o += 3 + 4 * nv
                    if bi in newi: out += struct.pack('<HB', newi[bi], nv) + rec; cnt += 1
                pb = struct.pack('<H', cnt) + bytes(out)
        o0 = len(blob)
        nt.append((o0, len(s), o0 + len(s), len(b), o0 + len(s) + len(b), len(pb))); blob += s + b + pb
    out = struct.pack('<ii', px, pz) + b''.join(struct.pack('<IIIIII', *r) for r in nt) + bytes(blob)
    if ch: open(fn, 'wb').write(out)
    index.append([px, pz, len(out) if ch else len(d)])
W = json.load(open(WJ, encoding='utf8'))
old = W['tiles'].get('replay') or {}
new = json.load(open(RPF))
mg = {'keyed': 1}
for k in ('v', 's', 'o', 'f'):
    a = dict(new.get(k, {})); a.update(old.get(k, {})); mg[k] = a
mg['d'] = new.get('d', [])
seen = set(); c = []
for e in (old.get('c', []) + new.get('c', [])):
    key = (round(e[0], 1), round(e[1], 1))
    if key in seen: continue
    seen.add(key); c.append(e)
mg['c'] = c
W['tiles']['replay'] = mg
W['tiles']['packs'] = index
json.dump(W, open(WJ, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print('removed', tot, 'ring buildings; skipped core clears', skipped, '; replay', {k: (len(v) if hasattr(v, '__len__') else v) for k, v in mg.items()},
      'old', {k: len(v) for k, v in old.items() if k != 'keyed'})
