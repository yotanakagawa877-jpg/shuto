#!/bin/sh
# v3.2 checks: departure board, through services, Shinkansen, destination skip, extended map views
cd "$(dirname "$0")/.."
ST='(n)=>__G.W.stations.find(s=>s.ja===n)'
TP='(x,z)=>{const P=__G.P;P.mode="foot";P.x=x;P.z=z;P.y=0.2;__G.G.cam.snap=true;}'
python3 -u test/game.py ${1:-v32} "
(()=>{const G=__G.G;const by={};for(const t of G.trains){by[t.state]=(by[t.state]||0)+1}const g={};for(const t of G.trains)g[t.group]=(g[t.group]||0)+1;return {n:G.trains.length,sv:__G.X.SV.length,by,g}})();;
(()=>{const S=($ST)('東京');window.__S=S;__G.X.departMenu(S);return document.getElementById('stLines').innerText.slice(0,800)})();;
wait 500;;shot board1;;
(()=>{const S=window.__S;const L=S.lines.find(l=>/新幹線/.test(l.rail.ja)&&/東海道/.test(l.rail.ja));document.getElementById('stmenu').hidden=true;const sv=__G.X.SV.find(s=>s.k==='tk_nozomi');const dest=sv.stops[sv.stops.length-1].st;__G.X.MM2(sv,false,L.st,false,dest);const t=__G.P.train;return {line:L.rail.ja,dest:dest.ja,tr:!!t,cars:t&&t.cars,group:t&&t.group}})();;
wait 6000;;shot ride_in;;
(()=>{__G.G.cam.inside=false;return 1})();;
wait 9000;;shot ride_out;;
(()=>{const t=__G.P.train;return {v:t&&Math.round(t.v*3.6),ut:t&&Math.round(t.ut),state:t&&t.state,y:t&&t.carPos[0]&&t.carPos[0].y}})();;
(()=>{__G.X.skipToDest();return {mode:__G.P.mode,x:Math.round(__G.P.x),z:Math.round(__G.P.z)}})();;
wait 1500;;
(()=>({mode:__G.P.mode,x:Math.round(__G.P.x),z:Math.round(__G.P.z)}))();;
(()=>{const S=($ST)('渋谷');__G.X.departMenu(S);const b=[...document.querySelectorAll('#stLines button')];const i=b.findIndex(x=>x.textContent==='発車案内');return document.getElementById('stLines').innerText.slice(0,600)})();;
(()=>{const S=($ST)('渋谷');const L=S.lines.find(l=>/埼京|湘南/.test(l.rail.ja))||S.lines.find(l=>/山手/.test(l.rail.ja));const sv=L.st.svc.find(s=>/湘南新宿/.test(s.line))||L.st.svc[0];document.getElementById('stmenu').hidden=true;__G.X.MM2(sv,false,L.st,false,null);const t=__G.P.train;return {line:sv.line,type:sv.type,legs:sv.L.map(l=>l.r.ja).join('>')}})();;
wait 3000;;(()=>{__G.G.cam.inside=false;return 1})();;wait 6000;;shot through;;
(()=>{const P=__G.P;P.train&&(P.train.state='dwell');P.train&&__G.TRN&&0;P.mode='foot';P.train=null;return 1})();;
(()=>{const S=($ST)('大宮');(${TP})(S.x+40,S.z+40);return [S.x,S.z]})();;
wait 12000;;shot omiya;;
(()=>{const S=($ST)('町田');(${TP})(S.x+40,S.z+40);return [S.x,S.z]})();;
wait 12000;;shot machida;;
(()=>{const S=($ST)('鎌倉');(${TP})(S.x+40,S.z+40);return [S.x,S.z]})();;
wait 12000;;shot kamakura;;
(()=>{const S=($ST)('新横浜');(${TP})(S.x+60,S.z+60);return [S.x,S.z]})();;
wait 12000;;shot shinyoko;;
(()=>({calls:__G.R.renderer.info.render.calls,tris:__G.R.renderer.info.render.triangles,pb:__G.X.PB.top-__G.X.PB.base}))()
" ${2:-1280} ${3:-720}
