#!/bin/sh
# v3.2 world: data/world.orig.json (recovered v3.0 world) -> extended map -> data/world.json
set -e
cd "$(dirname "$0")/../.."
T=${TMPDIR:-/tmp}/shuto_build; mkdir -p $T
[ -f data/ext_mask.json ] || node tools/geo/mkmask.mjs
node tools/geo/xways.mjs data/world.orig.json $T/w1.json
node tools/xfix.mjs $T/w1.json $T/w2.json
node tools/geo/rails3.mjs $T/w2.json $T/w3.json > $T/rails.log
node tools/geo/roads.mjs $T/w3.json $T/w4.json data/ext_mask.json
node tools/geo/services.mjs $T/w4.json $T/w5.json > $T/services.log
node tools/geo/finalize.mjs $T/w5.json data/world.json
tail -1 $T/rails.log; tail -1 $T/services.log
