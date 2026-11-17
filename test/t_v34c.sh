#!/bin/sh
cd "$(dirname "$0")/.."
A='(()=>{const P=__G.P,G=__G.G;const a=G.aircraft.find(a=>a.kind==="parked");P.x=a.x+8;P.z=a.z;P.y=0.2;__G.interact();const n=P.air;if(!n)return "noplane";n.y=700;n.v=220;n.thr=1;n.airborne=true;n.gear=false;n.pitch=0;return [P.mode,Math.round(n.x),Math.round(n.z),G.t]})()'
V='(async()=>{const P=__G.P,G=__G.G;const o=[];for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,2000));const n=P.air;if(!n)break;n.pitch=0;o.push([Math.round(n.v*3.6),Math.round(n.y),+G.t.toFixed(1)])}return o})()'
S='(async()=>{const P=__G.P,G=__G.G;const o=[];for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,2000));o.push([Math.round(P.y),P.sky?(P.sky.open?"chute":"free"):"none",Math.round(P.hp),+G.t.toFixed(1)]);if(!P.sky)break}return o})()'
python3 -u test/game.py ${1:-v34c} "$A;;wait 1000;;$V;;shot fly;;(()=>{__G.interact();return [__G.P.mode,!!__G.P.sky]})();;wait 3000;;shot free;;key Space 300;;wait 3000;;shot chute;;$S;;shot landed;;(()=>__G.G.aircraft.filter(a=>a.kind==='falling').length)()" 640 360
