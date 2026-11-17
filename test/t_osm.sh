#!/bin/sh
# v3.3 aerial + ground shots with streamed OSM tiles (teleport waits for the packs)
cd "$(dirname "$0")/.."
A='async (n,h)=>{const S=__G.W.stations.find(s=>s.ja===n);const P=__G.P;P.mode="foot";P.x=S.x;P.z=S.z+60;P.y=0.2;await __G.X.tsPrefetch(P.x,P.z);for(let i=0;i<6;i++)__G.X.lg(P.x,P.z,60000);__G.G.cam.free=[S.x-h*0.9,h,S.z+h*1.1,S.x,0,S.z];return [Math.round(S.x),Math.round(S.z),__G.X.TS.tiles.size]}'
G='(n,h)=>{const S=__G.W.stations.find(s=>s.ja===n);__G.G.cam.free=[S.x+70,h,S.z+90,S.x-60,4,S.z-80];return 1}'
steps=""
for st in ${STATIONS:-渋谷 新宿 東京 大宮 町田 鎌倉 海浜幕張 船橋}; do
  steps="$steps;;(($A)('$st',${H:-260}));;wait 2500;;shot air_$st;;(($G)('$st',2.2));;wait 1500;;shot gnd_$st"
done
steps="$steps;;performance.memory.usedJSHeapSize/1e6;;({tiles:__G.X.TS.tiles.size,nE:__G.X.TS.nE,top:__G.X.PB.top})"
python3 -u test/game.py ${1:-osm} "$steps" 960 540
