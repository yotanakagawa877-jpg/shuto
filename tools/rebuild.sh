#!/bin/sh
# data/world.orig.json (recovered v3.0 world) -> fixes -> data/world.json
cd "$(dirname "$0")/.."
node tools/xfix.mjs data/world.orig.json data/world.tmp.json && node tools/rails.mjs data/world.tmp.json data/world.json | grep -v "^[A-Z][A-Z]* " && rm -f data/world.tmp.json
