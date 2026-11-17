#!/bin/sh
# v3.4 logic checks: train top speed per type (simulated with the game's own driving step), skydive
cd "$(dirname "$0")/.."
T='(()=>{const TR=__G.TR,G=__G.G,out={};for(const k of ["tk_nozomi","th_hayabusa"].concat(__G.X.SV.filter(s=>!s.model.startsWith("s:")).slice(0,400).filter((s,i,a)=>a.findIndex(q=>(q.type||"")===(s.type||"")&&q.kindOf===s.kindOf)===i).map(s=>s.k))){const sv=__G.X.SV.find(s=>s.k===k);if(!sv)continue;const n={sv,v:0,ut:sv.U/2,si:0,state:"run",notch:0};const I=G.input;const keep={...I};I.thr=1;I.brake=0;I.hand=0;let t=0,t100=null;for(;t<400;t+=0.05){TR.trainDrive(n,0.05);n.ut=sv.U/2;n.si=sv.stops.length;if(t100===null&&n.v*3.6>=100)t100=t;if(n.v>=TR.trainTop(n)-0.01)break}Object.assign(I,keep);I.thr=0;out[k+" "+(sv.type||sv.kindOf)]=[Math.round(n.v*3.6),Math.round(TR.trainTop(n)*3.6),Math.round(t),t100&&Math.round(t100)]}return out})()'
python3 -u test/game.py v34b "$T" 480 270
