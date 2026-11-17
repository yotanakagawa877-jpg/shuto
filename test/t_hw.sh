#!/bin/sh
# v3.5: move physics cars along expressway decks / ramps (no rendering) and measure height error vs the deck
cd "$(dirname "$0")/.."
T='(()=>{const W=__G.W,X=__G.X,V=__G.V;const res={X:[],R:[]};
for(const kind of ["X","R"]){const edges=W.edges.filter(e=>e&&e.kind===kind&&e.len>(kind==="X"?800:250)&&!e.tile&&e.elev);
for(let k=0;k<edges.length&&res[kind].length<40;k+=Math.max(1,Math.floor(edges.length/40))){const e=edges[k];
const p0=X.edgePos(e,30,{});const c=X.newCar("sedan",p0.x,p0.z,Math.atan2(p0.dx,p0.dz),"phys");if(!c)continue;c.y=X.edgeY(e,30);c.ctl="test";
let maxF=0,maxS=0,air=0,n=0,at=0;
for(let s=30;s<e.len-30;s+=25/60){const q=X.edgePos(e,s,{});const lo=(window.__LO||0)*(e.hw-1.3);c.x=q.x+q.dz*lo;c.z=q.z-q.dx*lo;c.yaw=Math.atan2(q.dx,q.dz);c.vx=q.dx*25;c.vz=q.dz*25;
V.physCar(c,1/60);c.x=q.x+q.dz*lo;c.z=q.z-q.dx*lo;const d=c.y-X.edgeY(e,s);n++;if(d>maxF){maxF=d;at=Math.round(s)}maxS=Math.min(maxS,d);c.air&&air++}
res[kind].push([W.edges.indexOf(e),Math.round(e.len),+maxF.toFixed(2),+maxS.toFixed(2),at,air,n]);V.freeCar(c)}}
const f=(a)=>({n:a.length,float_gt03:a.filter(r=>r[2]>0.3).length,sink_gt03:a.filter(r=>r[3]<-0.3).length,worst:a.slice().sort((x,y)=>y[2]-x[2]).slice(0,4),worstSink:a.slice().sort((x,y)=>x[3]-y[3]).slice(0,3)});return {X:f(res.X),R:f(res.R)}})()'
python3 -u test/game.py hw "wait 2000;;$T" 480 270
