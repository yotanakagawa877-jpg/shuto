#!/bin/sh
# Publish dist/ as a GitHub Pages site: force-pushes a fresh, history-less `gh-pages` branch every release
# (the repo stays small even though the map data is ~105 MB).  usage: sh tools/deploy_pages.sh OWNER/REPO [VERSION]
set -e
cd "$(dirname "$0")/.."
REPO=$1; V=${2:-$(date +%Y%m%d%H%M)}
[ -n "$REPO" ] || { echo "usage: deploy_pages.sh OWNER/REPO [VERSION]"; exit 1; }
MINIFY=1 VERSION=$V sh tools/bundle.sh
S=$(mktemp -d)
cp -r dist/index.html dist/game.js dist/sw.js dist/manifest.webmanifest dist/icon-*.png dist/data "$S/"
touch "$S/.nojekyll"
cat > "$S/README.md" <<MD
# SHUTO 首都 — web build $V
Played at https://$(echo $REPO | cut -d/ -f1).github.io/$(echo $REPO | cut -d/ -f2)/ — add it to the home screen for a full-screen app.
Map data © OpenStreetMap contributors (ODbL).
MD
cd "$S"
git init -q -b gh-pages && git add -A && git -c user.name="SHUTO deploy" -c user.email="deploy@users.noreply.github.com" commit -qm "SHUTO $V"
git push -f "https://github.com/$REPO.git" gh-pages
echo "deployed $V -> https://$(echo $REPO | cut -d/ -f1).github.io/$(echo $REPO | cut -d/ -f2)/"
