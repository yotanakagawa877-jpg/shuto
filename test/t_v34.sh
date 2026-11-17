#!/bin/sh
# v3.4: drive a Shinkansen flat out, jump off, then skydive from a plane
cd "$(dirname "$0")/.."
B='(()=>{const X=__G.X;const sv=X.SV.find(s=>s.k==="tk_nozomi");const st=sv.stops[1].st||sv.stops[1];window.__sv=sv;X.MM2(sv,false,st,true);return [__G.P.mode,!!__G.P.train]})()'
L='(async()=>{const P=__G.P;const o=[];for(let i=0;i<24;i++){await new Promise(r=>setTimeout(r,2500));const t=P.train;if(!t)break;o.push([Math.round(t.v*3.6),t.notch,Math.round(t.limit*3.6),t.state])}return o})()'
J='(()=>{__G.interact();const P=__G.P;return [P.mode,P.down,Math.round(P.hp)]})()'
A='(()=>{const P=__G.P,G=__G.G;P.mode="foot";P.train=null;const a=G.aircraft.find(a=>a.kind==="parked");P.x=a.x+8;P.z=a.z;P.y=0.2;__G.interact();const n=P.air;if(!n)return "noplane";n.y=900;n.v=220;n.thr=1;n.airborne=true;n.gear=false;return [P.mode,Math.round(n.x),Math.round(n.z)]})()'
V='(async()=>{const P=__G.P;const o=[];for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,1500));const n=P.air;if(!n)break;o.push([Math.round(n.v*3.6),Math.round(n.y)])}return o})()'
S='(async()=>{const P=__G.P;const o=[];for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,1000));o.push([Math.round(P.y),P.sky?(P.sky.open?"chute":"free"):"none",Math.round(P.hp)]);if(!P.sky)break}return o})()'
python3 -u test/game.py ${1:-v34} "$B;;wait 3000;;(()=>{__G.interact();return __G.P.train.state})();;hold KeyW;;$L;;shot drv;;$J;;wait 1500;;shot jumped;;release KeyW;;$A;;wait 2000;;$V;;shot fly;;(()=>{__G.interact();return [__G.P.mode,!!__G.P.sky]})();;wait 2500;;shot free;;key Space 300;;wait 2500;;shot chute;;$S;;shot landed" 960 540
