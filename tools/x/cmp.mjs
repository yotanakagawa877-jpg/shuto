import fs from 'fs';
const W = JSON.parse(fs.readFileSync('data/world.json'));
const MT = '/home/claude/ext/mini-tokyo-3d/data/';
const S = JSON.parse(fs.readFileSync(MT + 'stations.json'));
const A9 = Math.cos(35.64 * Math.PI / 180) * 111320, R9 = 110950;
const fe = (lat, lng) => [(lng - 139.755) * A9, -(lat - 35.64) * R9];
const byName = new Map(); for (const s of S) { const k = s.title.ja; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(s); }
let tot = 0, n = 0;
for (const r of W.rails) for (const st of r.st) { const c = byName.get(st.ja); if (!c) continue; const [x, z] = r.path[st.i]; let b = 1e9; for (const s of c) { if (!s.coord) continue; const [sx, sz] = fe(s.coord[1], s.coord[0]); b = Math.min(b, Math.hypot(sx - x, sz - z)); } if (b < 2000) { tot += b; n++; } if (b > 250 && b < 2000) console.log(r.code, st.ja, Math.round(b)); }
console.log('avg', tot / n, n);
