#!/bin/sh
# aerial comparison shots: extended area vs the old detailed map
cd "$(dirname "$0")/.."
A='(n,h,dx)=>{const S=__G.W.stations.find(s=>s.ja===n);const P=__G.P;P.mode="foot";P.x=S.x+(dx||0);P.z=S.z+60;P.y=0.2;for(let i=0;i<4;i++)__G.X.lg(P.x,P.z,60000);__G.G.cam.free=[S.x-h*0.9,h,S.z+h*1.1,S.x,0,S.z];return [Math.round(S.x),Math.round(S.z)]}'
G='(n,h)=>{const S=__G.W.stations.find(s=>s.ja===n);const P=__G.P;P.x=S.x+30;P.z=S.z+30;for(let i=0;i<4;i++)__G.X.lg(P.x,P.z,60000);__G.G.cam.free=[S.x+70,h,S.z+90,S.x-60,4,S.z-80];return 1}'
steps=""
for st in ${STATIONS:-中野 大宮 町田 鎌倉 新横浜 海浜幕張 府中 船橋}; do
  steps="$steps;;(($A)('$st',260));;wait 2500;;shot air_$st;;(($G)('$st',2.2));;wait 2500;;shot gnd_$st"
done
python3 -u test/game.py ${1:-air} "$steps" 960 540
