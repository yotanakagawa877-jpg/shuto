# v3.3: apply a bake run of the game (index.html?bake) to the data
#   cleared.json : buildings the start-up clears (landmarks, stations, doors ...) -> removed from the tile packs
#   replay.json  : start-up decisions that depend on buildings -> world.json tiles.replay (replayed by the normal start-up)
# keys: tileKey * 65536 + local index (indices of the pristine packs), tileKey = (tx + 512) * 1024 + (tz + 512)
# usage: python3 -I tools/osm/bake.py cleared.json replay.json PRISTINE_TILEDIR OUT_TILEDIR WORLD_JSON
import sys, json, struct, glob, os, collections
CL, RPF, SRC, TD, WJ = sys.argv[1:6]
P = 5
rm = collections.defaultdict(set)
for k in json.load(open(CL)):
    t, i = divmod(int(k), 65536); rm[(t // 1024 - 512, t % 1024 - 512)].add(i)
os.makedirs(TD, exist_ok=True)
tot = 0; index = []
for fn in sorted(glob.glob(os.path.join(SRC, '*.bin'))):
    d = open(fn, 'rb').read(); px, pz = struct.unpack_from('<ii', d, 0)
    tab = [struct.unpack_from('<IIIIII', d, 8 + 24 * k) for k in range(P * P)]; base = 8 + 24 * P * P
    blob = bytearray(); nt = []
    for k, (so, sl, bo, bl, po, pl) in enumerate(tab):
        t = (px * P + k // P, pz * P + k % P)
        s = d[base + so: base + so + sl]; b = d[base + bo: base + bo + bl]; pb = d[base + po: base + po + pl]
        if t in rm:
            r = rm[t]; nb = len(b) // 12
            b = b''.join(b[i * 12:(i + 1) * 12] for i in range(nb) if i not in r); tot += len(r)
            # outlines follow their building's new index
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
    open(os.path.join(TD, os.path.basename(fn)), 'wb').write(out); index.append([px, pz, len(out)])
W = json.load(open(WJ))
W['tiles']['packs'] = index
W['tiles']['replay'] = json.load(open(RPF))
W['tiles'].pop('snap', None)
json.dump(W, open(WJ, 'w'), ensure_ascii=False, separators=(',', ':'))
r = W['tiles']['replay']
print('removed', tot, 'buildings; replay', {k: len(v) for k, v in r.items() if k != 'keyed'})
