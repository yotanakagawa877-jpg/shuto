#!/bin/sh
# bus stop menu: all stops, "すぐ到着"
cd "$(dirname "$0")/.."
python3 -u test/game.py ${1:-bus} "
(()=>{const S=Object.values(__G.TRN.STOPS).filter(s=>s.routes.length>=1).sort((a,b)=>b.routes.length-a.routes.length)[0];window.__bs=S;const P=__G.P;P.x=S.sides[0][0];P.z=S.sides[0][1];__G.X.openBusMenu(S);return {name:S.name,routes:S.routes.length,text:document.getElementById('stLines').innerText.slice(0,500)}})();;
wait 800;;shot menu1;;
(()=>{const b=[...document.querySelectorAll('#stLines button')].find(x=>x.textContent==='行き先を選ぶ');b.click();return document.getElementById('stLines').querySelectorAll('.row').length+' rows: '+document.getElementById('stLines').innerText.slice(0,300)})();;
wait 800;;shot menu2;;
(()=>{const rows=[...document.querySelectorAll('#stLines .row')];const r=rows[rows.length-1];const name=r.querySelector('b').firstChild.textContent;r.querySelectorAll('button')[1].click();window.__dest=name;return {dest:name,wait:!!__G.TRN.RIDE.wait,fast:__G.TRN.RIDE.wait&&__G.TRN.RIDE.wait.fast}})();;
wait 40000;;
(()=>({mode:__G.P.mode,kind:__G.TRN.RIDE.kind,dest:__G.TRN.RIDE.dest&&__G.TRN.RIDE.dest.name,atStop:__G.TRN.RIDE.car&&__G.TRN.RIDE.car.atStop&&__G.TRN.RIDE.car.atStop.name,wait:!!__G.TRN.RIDE.wait}))();;
shot ride
" 960 540
