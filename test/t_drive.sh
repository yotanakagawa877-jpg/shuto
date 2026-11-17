#!/bin/sh
# v3.3 drive test: board the nearest car, hold the throttle, log height / pitch while driving fast
cd "$(dirname "$0")/.."
B='(()=>{const P=__G.P,G=__G.G;let b=null,bd=1e9;for(const c of G.cars){if(c.removed||c.td.bike)continue;const d=Math.hypot(c.x-P.x,c.z-P.z);if(d<bd){bd=d;b=c}}P.x=b.x+Math.cos(b.yaw)*2.5;P.z=b.z-Math.sin(b.yaw)*2.5;b.v=0;b.vx=0;b.vz=0;__G.interact();return [P.mode,b.td.name,Math.round(bd)]})()'
L='(async()=>{const P=__G.P,c=P.car;if(!c)return "nocar";const o=[];for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,150));o.push([Math.round(c.v*3.6),+c.y.toFixed(2),+(c.pitch||0).toFixed(3),c.air?1:0])}return o})()'
python3 -u test/game.py ${1:-drive} "$B;;wait 500;;hold KeyW;;$L;;shot run;;release KeyW" 960 540 ${2:-0} <<EOF2
EOF2
