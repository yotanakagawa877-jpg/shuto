// dump visual lattice streets for a rect: node tools/x/vis.mjs world.json lat lng half out.json
import fs from 'fs';
import { makeStreets } from '../geo/streets.mjs';
const [,, wf, lat, lng, half, out] = process.argv;
const W = JSON.parse(fs.readFileSync(wf));
const MK = JSON.parse(fs.readFileSync('data/ext_mask.json')); const m = Buffer.from(MK.raw, 'base64');
const mq = (x, z) => { const c = Math.floor((x - MK.X0) / MK.cell), r = Math.floor((z - MK.Z0) / MK.cell); return c < 0 || r < 0 || c >= MK.W || r >= MK.H ? 0 : m[r * MK.W + c]; };
const occ = new Set(W.ext.oldOcc); const old = (x, z) => occ.has(Math.floor(x / 200) + ',' + Math.floor(z / 200));
const ST = makeStreets(W.ext.dist);
const A9 = Math.cos(35.64 * Math.PI / 180) * 111320; const cx = (lng - 139.755) * A9, cz = -(lat - 35.64) * 110950, h = +half;
const res = [];
const ids = new Set(); for (const i of ST.near(cx, cz, 2)) ids.add(i);
for (const i of ids) for (const p of ST.lines(i, cx - h, cz - h, cx + h, cz + h, { want: 'visual', keep: (x, z) => { const v = mq(x, z); return (v === 1 || v === 2) && !old(x, z) && ST.S[i].lv > 0; } })) res.push(p.pts.map(q => [Math.round(q[0]), Math.round(q[1])]));
fs.writeFileSync(out, JSON.stringify(res)); console.log(res.length);
