# v3.3b: merge bake runs of several quality presets (cleared buildings: union; keyed replay entries: union)
# usage: python3 -I tools/osm/bakemerge.py OUT_PREFIX RUN1_PREFIX RUN2_PREFIX ...   (prefix.json + prefix_replay.json)
import sys, json
out, runs = sys.argv[1], sys.argv[2:]
cl = set(); rp = None
for r in runs:
    cl.update(json.load(open(r + '.json')))
    q = json.load(open(r + '_replay.json'))
    if rp is None: rp = q; continue
    for k in ('v', 's', 'o', 'f'):
        for a, b in q[k].items(): rp[k].setdefault(a, b)
    seen = {(round(c[0], 1), round(c[1], 1)) for c in rp['c']}
    for c in q['c']:
        if (round(c[0], 1), round(c[1], 1)) not in seen: rp['c'].append(c); seen.add((round(c[0], 1), round(c[1], 1)))
json.dump(sorted(cl), open(out + '.json', 'w')); json.dump(rp, open(out + '_replay.json', 'w'))
print('cleared', len(cl), {k: len(v) for k, v in rp.items() if k != 'keyed'})
