#!/bin/sh
# v3.3 aerial shots at lat/lng spots: SPOTS="name:lat,lng:height ..."
cd "$(dirname "$0")/.."
A='async (lat,lng,h)=>{const A9=Math.cos(35.64*Math.PI/180)*111320;const x=(lng-139.755)*A9,z=-(lat-35.64)*110950;const P=__G.P;P.mode="foot";P.x=x;P.z=z+40;P.y=0.2;await __G.X.tsPrefetch(x,z);for(let i=0;i<8;i++)__G.X.lg(x,z,60000);__G.G.cam.free=[x-h*0.6,h,z+h*0.8,x,0,z];return [Math.round(x),Math.round(z)]}'
steps=""
for sp in $SPOTS; do n=${sp%%:*}; r=${sp#*:}; ll=${r%%:*}; h=${r#*:}; steps="$steps;;(($A)($ll,$h));;wait 3000;;shot $n"; done
python3 -u test/game.py ${1:-spots} "$steps" 1100 620
