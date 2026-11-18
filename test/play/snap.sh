#!/bin/sh
# freeze the current build for a test run: copy dist (data linked, not copied) to $TDIST and serve it on port 8781
# so rebuilding dist while tests boot cannot hand a half-written game.js to the browser
TDIST=${TDIST:-/tmp/shuto_tdist}
mkdir -p "$TDIST"
for f in index.html game.js sw.js manifest.webmanifest icon-180.png icon-192.png icon-512.png; do cp "dist/$f" "$TDIST/$f"; done
[ -e "$TDIST/data" ] || ln -s "$(pwd)/dist/data" "$TDIST/data"
curl -s -o /dev/null localhost:8781/index.html || (cd "$TDIST" && nohup python3 -m http.server 8781 >/dev/null 2>&1 &)
sleep 1; echo "snapshot $(md5sum "$TDIST/game.js" | cut -c1-8) on :8781"
