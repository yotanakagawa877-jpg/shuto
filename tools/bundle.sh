#!/bin/sh
# Build the playable web version into dist/ (also a PWA: manifest, icons, service worker with a release version)
cd "$(dirname "$0")/.."
mkdir -p dist
cp web/index.html dist/index.html
cp web/manifest.webmanifest web/icon-180.png web/icon-192.png web/icon-512.png dist/
V=${VERSION:-$(date +%Y%m%d%H%M)}
sed "s/__VERSION__/$V/" web/sw.js > dist/sw.js
cat src/game.js src/v4.js src/v5_pref.js src/v5.js $(ls src/v5m_*.js 2>/dev/null) > src/.game_all.js
npx esbuild src/.game_all.js --bundle --format=iife ${MINIFY:+--minify} --outfile=dist/game.js --log-level=warning
