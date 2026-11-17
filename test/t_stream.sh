#!/bin/sh
# v3.3 streaming endurance: move the player 24 km in 200 m steps (as if driving fast) and log heap / tiles / pool
cd "$(dirname "$0")/.."
S='async (k)=>{const P=__G.P,X=__G.X;const out=[];for(let i=0;i<k;i++){P.x+=140;P.z-=140;const t0=performance.now();await new Promise(r=>setTimeout(r,350));out.push(Math.round(performance.now()-t0))}return {x:Math.round(P.x),z:Math.round(P.z),tiles:X.TS.tiles.size,nE:X.TS.nE,nN:X.TS.nN,top:X.PB.top,free:X.PB.free.length,loads:X.TS.loads,unl:X.TS.unloads,packs:X.TS.packs.size,heap:Math.round(performance.memory.usedJSHeapSize/1e6),slow:Math.max(...out)}}'
steps=""
for i in 1 2 3 4 5 6 7 8; do steps="$steps;;(($S)(15))"; done
steps="$steps;;shot end"
python3 -u test/game.py ${1:-stream} "$steps" 960 540
