#!/bin/sh
# v3.3b: pristine packs -> baked data -> dist. usage: sh tools/osm/finish.sh OSMDIR (with OSMDIR/world_A.json and OSMDIR/tiles)
set -e
cd "$(dirname "$0")/../.."
X=$1
rm -rf data/tiles && cp -r $X/tiles data/tiles
python3 - "$X" <<'PY'
import json, os, sys
X = sys.argv[1]
W = json.load(open(X + '/world_A.json'))
W['tiles']['packs'] = [[int(f[:-4].split('_')[0]), int(f[:-4].split('_')[1]), os.path.getsize('data/tiles/' + f)] for f in sorted(os.listdir('data/tiles'))]
W['tiles'].pop('replay', None)
json.dump(W, open('data/world.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('world', len(W['nodes']), len(W['edges']), 'packs', len(W['tiles']['packs']))
PY
python3 tools/b64parts.py && sh tools/bundle.sh
# the start-up depends on the quality preset (scenery spacing): bake 'low' and 'mid' (= high / ultra) and merge
Q=low PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 test/bake.py $X/bake_low.json
Q=mid PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 test/bake.py $X/bake_mid.json
python3 -I tools/osm/bakemerge.py $X/bake $X/bake_low $X/bake_mid
python3 -I tools/osm/bake.py $X/bake.json $X/bake_replay.json $X/tiles data/tiles data/world.json
python3 tools/b64parts.py && MINIFY=1 sh tools/bundle.sh
