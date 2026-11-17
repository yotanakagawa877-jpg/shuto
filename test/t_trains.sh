#!/bin/sh
# close-up shots of trains (Shinkansen, limited express) and the bus stop menu
cd "$(dirname "$0")/.."
T='(k)=>{const t=__G.G.trains.find(t=>t.sv.k===k&&t.state==="run"&&Math.abs(t.x)<25000&&Math.abs(t.z+0)<30000);if(!t)return null;window.__tr=t;const P=__G.P;P.x=t.x+30;P.z=t.z+30;for(let i=0;i<3;i++)__G.X.lg(P.x,P.z,60000);return {k,x:Math.round(t.x),z:Math.round(t.z)}}'
C='()=>{const t=window.__tr;if(!t||t.carPos.length<4)return "nocars";const c=t.carPos[0],c2=t.carPos[3];const nx=c.z-c2.z,nz=-(c.x-c2.x),L=Math.hypot(nx,nz)||1;__G.G.cam.free=[c.x+nx/L*26+(c.x-c2.x)*0.5,c.y+7,c.z+nz/L*26+(c.z-c2.z)*0.5,c2.x,c.y+1,c2.z];return {y:c.y,n:t.carPos.length}}'
steps=""
for k in ${KS:-tk_nozomi th_hayabusa}; do steps="$steps;;(($T)('$k'));;wait 4000;;(($C)());;wait 1500;;shot tr_$k"; done
python3 -u test/game.py ${1:-trn} "$steps" 960 540
