// v3.2 street network of the extended map.
//  - arterials along the real routes (国道・主要地方道), continuing the old network's roads at the old map edge
//  - a street grid around every station town (size by the station's importance, oriented to the railway)
//  - a coarse collector grid over the remaining land, so the suburbs are connected
//  - every crossing becomes a junction (planar graph); old dead ends at the old edge are stitched to the new streets
//  - expressway interchanges get ramps down to the nearest arterial
// usage: node tools/geo/roads.mjs in.json out.json
import fs from 'fs';
import { toXZ } from './munis.mjs';
import { boundsXZ, CELL as MCELL, fbm } from './mask.mjs';
import { makeStreets, vnoise } from './streets.mjs';
const IN = process.argv[2], OUT = process.argv[3];
const W = JSON.parse(fs.readFileSync(IN, 'utf8'));
const MASK = JSON.parse(fs.readFileSync(process.argv[4] || 'data/ext_mask.json', 'utf8'));
const mask = { ...MASK, m: Buffer.from(MASK.raw, 'base64') };
const mq = (x, z) => { const c = Math.floor((x - mask.X0) / mask.cell), r = Math.floor((z - mask.Z0) / mask.cell); if (c < 0 || r < 0 || c >= mask.W || r >= mask.H) return 0; return mask.m[r * mask.W + c]; };
const isLand = (x, z) => { const v = mq(x, z); return v === 1 || v === 2; };
const B = boundsXZ();
const inB = (x, z, m = 0) => x > B.x0 - m && x < B.x1 + m && z > B.z0 - m && z < B.z1 + m;
const hyp = Math.hypot, LL = (a) => a.map(([lat, lng]) => toXZ(lng, lat));
function cum(p) { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + hyp(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; }
function resample(p, step) { const c = cum(p), L = c[c.length - 1], n = Math.max(1, Math.round(L / step)), out = []; let j = 0; for (let k = 0; k <= n; k++) { const s = L * k / n; while (j < c.length - 2 && c[j + 1] < s) j++; const t = (s - c[j]) / ((c[j + 1] - c[j]) || 1); out.push([p[j][0] + (p[j + 1][0] - p[j][0]) * t, p[j][1] + (p[j + 1][1] - p[j][1]) * t]); } return out; }
function smooth(p, sig, step) { const s = sig / step, R = Math.ceil(s * 3), n = p.length; if (s < 0.5) return p; return p.map((q, i) => { let x = 0, z = 0, w = 0; for (let k = -R; k <= R; k++) { const j = i + k; if (j < 0 || j >= n) continue; const ww = Math.exp(-(k * k) / (2 * s * s)); x += p[j][0] * ww; z += p[j][1] * ww; w += ww; } const f = Math.min(1, Math.min(i, n - 1 - i) / (R + 1)); return [q[0] + (x / w - q[0]) * f, q[1] + (z / w - q[1]) * f]; }); }
const N = W.nodes, E = W.edges, KIND = { X: 0, A: 1, B: 2, L: 3, R: 4 };
const nameIdx = (n) => { if (!n) return -1; let k = W.roadNames.indexOf(n); if (k < 0) { W.roadNames.push(n); k = W.roadNames.length - 1; } return k; };

// ---------- the old data area (no new streets inside it)
const OCC = 200, occ = new Set(); const ok = (x, z) => Math.floor(x / OCC) + ',' + Math.floor(z / OCC);
for (const e of E) { if (e[2] !== KIND.L && e[2] !== KIND.B && e[2] !== KIND.A) continue; for (const n of [e[0], e[1]]) occ.add(ok(N[n][0], N[n][1])); }
const oldArea = (x, z, m = 1) => { const a = Math.floor(x / OCC), b = Math.floor(z / OCC); for (let i = -m; i <= m; i++) for (let j = -m; j <= m; j++) if (occ.has((a + i) + ',' + (b + j))) return true; return false; };
const nOld = N.length, eOld = E.length;

// ---------- rails (to keep local streets from running along under viaducts)
const RG = 40, rgrid = new Map();
for (const r of W.rails) { if (r.kind === 'sub') continue; for (let i = 0; i + 1 < r.path.length; i += 1) { if (r.ys[i] < 0) continue; const q = r.path[i], k = Math.floor(q[0] / RG) + ',' + Math.floor(q[1] / RG); let A = rgrid.get(k); if (!A) rgrid.set(k, A = []); A.push([q[0], q[1], r.path[i + 1][0] - q[0], r.path[i + 1][1] - q[1], r.kind]); } }
function alongRail(ax, az, bx, bz) { const mx = (ax + bx) / 2, mz = (az + bz) / 2, dx = bx - ax, dz = bz - az, l = hyp(dx, dz) || 1; const cx = Math.floor(mx / RG), cz = Math.floor(mz / RG);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const A = rgrid.get((cx + i) + ',' + (cz + j)); if (!A) continue; for (const [x, z, ex, ez, kind] of A) { const el = hyp(ex, ez) || 1; if (Math.abs((dx * ex + dz * ez) / (l * el)) < 0.8) continue; const d = Math.abs((mx - x) * (-ez / el) + (mz - z) * (ex / el)); if (d < (kind === 'tram' ? 4 : 9)) return true; } } return false; }

// ---------- polylines to insert: {pts, kind, name, bridge (may cross water)}
const lines = [];
const addLine = (pts, kind, name, opt = {}) => { if (pts.length >= 2) lines.push({ pts, kind, name, ...opt }); };

// arterials: [name, kind, way points, from old road name (continue its dead end near the first point)]
const ART = [
  ['国道17号・中山道', 'A', [[35.7450, 139.7300], [35.7530, 139.7100], [35.7650, 139.6950], [35.7800, 139.6880], [35.7965, 139.6825], [35.8150, 139.6830], [35.8350, 139.6790], [35.8580, 139.6540], [35.8800, 139.6430], [35.9060, 139.6320], [35.9250, 139.6250], [35.9380, 139.6200]], '白山通り・国道17号'],
  ['新大宮バイパス', 'A', [[35.7750, 139.6700], [35.7950, 139.6620], [35.8150, 139.6500], [35.8450, 139.6350], [35.8750, 139.6200], [35.9050, 139.6050], [35.9380, 139.5950]], null],
  ['国道4号・日光街道', 'A', [[35.7300, 139.7850], [35.7450, 139.7980], [35.7600, 139.8040], [35.7800, 139.8010], [35.8000, 139.8030], [35.8250, 139.8030], [35.8600, 139.7950], [35.8900, 139.7900], [35.9380, 139.7850]], '昭和通り・国道4号'],
  ['国道6号・水戸街道', 'A', [[35.7470, 139.8250], [35.7600, 139.8450], [35.7700, 139.8650], [35.7850, 139.8950], [35.8150, 139.9150], [35.8500, 139.9550], [35.8700, 140.0000], [35.8900, 140.0350], [35.9150, 140.0750]], null],
  ['国道14号・千葉街道', 'A', [[35.6960, 139.8500], [35.7020, 139.8850], [35.7180, 139.9250], [35.7030, 139.9550], [35.7000, 139.9850], [35.6850, 140.0200], [35.6700, 140.0500], [35.6550, 140.0850]], '新大橋・京葉道路'],
  ['国道357号・湾岸道路', 'A', [[35.6440, 139.8600], [35.6430, 139.8950], [35.6550, 139.9200], [35.6750, 139.9500], [35.6880, 139.9750], [35.6780, 140.0050], [35.6600, 140.0350], [35.6450, 140.0750]], '湾岸道路・国道357号'],
  ['国道20号・甲州街道', 'A', [[35.6690, 139.5950], [35.6620, 139.5600], [35.6530, 139.5400], [35.6600, 139.5100], [35.6700, 139.4800], [35.6800, 139.4500], [35.6900, 139.4200]], '甲州街道'],
  ['青梅街道', 'A', [[35.7090, 139.5950], [35.7150, 139.5700], [35.7230, 139.5400], [35.7300, 139.5100], [35.7400, 139.4700], [35.7500, 139.4250]], '青梅街道'],
  ['環状八号線', 'A', [[35.7470, 139.6360], [35.7600, 139.6500], [35.7700, 139.6750], [35.7780, 139.7000], [35.7830, 139.7220]], '環状八号線'],
  ['国道246号', 'A', [[35.5990, 139.6080], [35.5850, 139.5900], [35.5700, 139.5700], [35.5550, 139.5400], [35.5350, 139.5050], [35.5150, 139.4750], [35.4950, 139.4500], [35.4800, 139.4250]], '青山通り・国道246号'],
  ['国道1号', 'A', [[35.4640, 139.6170], [35.4500, 139.5950], [35.4300, 139.5650], [35.4100, 139.5450], [35.3950, 139.5300], [35.3700, 139.5100], [35.3500, 139.4950], [35.3380, 139.4800], [35.3300, 139.4250]], '桜田通り・国道1号'],
  ['国道16号', 'A', [[35.4450, 139.6150], [35.4650, 139.5850], [35.4800, 139.5650], [35.4950, 139.5300], [35.5150, 139.4950], [35.5350, 139.4600], [35.5500, 139.4250]], null],
  ['国道16号', 'A', [[35.9200, 139.9700], [35.8800, 139.9850], [35.8400, 140.0000], [35.8000, 140.0150], [35.7600, 140.0300], [35.7200, 140.0450], [35.6900, 140.0750]], null],
  ['中原街道', 'A', [[35.5400, 139.6100], [35.5250, 139.5700], [35.5050, 139.5250], [35.4800, 139.4800], [35.4650, 139.4300]], '中原街道'],
  ['府中街道', 'B', [[35.6000, 139.6180], [35.6200, 139.5700], [35.6450, 139.5200], [35.6650, 139.4800], [35.7000, 139.4600], [35.7400, 139.4700], [35.7900, 139.4700]], '府中街道'],
  ['世田谷通り', 'B', [[35.6400, 139.6000], [35.6300, 139.5700], [35.6200, 139.5400], [35.6050, 139.5000], [35.5800, 139.4700]], '世田谷通り'],
  ['井の頭通り', 'B', [[35.7000, 139.6050], [35.7030, 139.5800], [35.7100, 139.5500], [35.7200, 139.5200]], '井の頭通り'],
  ['川越街道・国道254号', 'A', [[35.7470, 139.6900], [35.7600, 139.6600], [35.7760, 139.6320], [35.7880, 139.6100], [35.8020, 139.5880], [35.8250, 139.5650], [35.8550, 139.5450], [35.8850, 139.5150], [35.9100, 139.4900], [35.9380, 139.4700]], null],
  ['北本通り・国道122号', 'A', [[35.7830, 139.7250], [35.8100, 139.7300], [35.8400, 139.7350], [35.8700, 139.7380], [35.9000, 139.7330], [35.9380, 139.7250]], null],
  ['国道134号', 'A', [[35.3150, 139.4250], [35.3080, 139.4700], [35.3070, 139.5100], [35.3080, 139.5400], [35.3100, 139.5600], [35.3050, 139.5800], [35.2950, 139.6000]], null],
  ['国道357号', 'A', [[35.4150, 139.6500], [35.3950, 139.6380], [35.3750, 139.6290], [35.3500, 139.6280], [35.3320, 139.6230]], null],
  ['鎌倉街道', 'B', [[35.4100, 139.5950], [35.3850, 139.5800], [35.3600, 139.5650], [35.3350, 139.5550], [35.3150, 139.5500]], null],
  ['尻手黒川道路', 'B', [[35.5700, 139.6400], [35.5800, 139.6000], [35.5950, 139.5600], [35.6050, 139.5200], [35.6100, 139.4800]], null],
  ['産業道路', 'B', [[35.7600, 139.7600], [35.8000, 139.7150], [35.8350, 139.7000], [35.8700, 139.6900], [35.9000, 139.6800]], null],
  ['県道さいたま幸手線', 'B', [[35.8750, 139.6450], [35.8800, 139.6800], [35.8850, 139.7200], [35.8900, 139.7700], [35.8950, 139.8200], [35.9000, 139.8700]], null],
  ['国道298号', 'B', [[35.8136, 139.6362], [35.8300, 139.6900], [35.8470, 139.7530], [35.8420, 139.8100], [35.8350, 139.8620], [35.7900, 139.8900], [35.7350, 139.9050], [35.6930, 139.9600]], null],
  ['東八道路', 'B', [[35.6850, 139.5950], [35.6800, 139.5600], [35.6780, 139.5200], [35.6750, 139.4800]], null],
  ['新青梅街道', 'B', [[35.7300, 139.5950], [35.7380, 139.5600], [35.7470, 139.5200], [35.7550, 139.4800], [35.7600, 139.4300]], null],
  ['松戸街道', 'B', [[35.7850, 139.8950], [35.7600, 139.9200], [35.7300, 139.9450], [35.7050, 139.9700]], null],
  ['県道越谷流山線', 'B', [[35.8900, 139.7900], [35.8800, 139.8350], [35.8700, 139.8800], [35.8650, 139.9200]], null],
];
for (const [name, kind, wp, oldName] of ART) {
  let pts = LL(wp);
  if (oldName) { // start exactly at the old road's dead end nearest the first point
    const ri = W.roadNames.indexOf(oldName); const deg = new Map(); for (let ei = 0; ei < eOld; ei++) { const e = E[ei]; if (e[3] !== ri) continue; for (const n of [e[0], e[1]]) deg.set(n, (deg.get(n) || 0) + 1); }
    let best = null, bd = 1e9; for (const [n, d] of deg) { if (d !== 1) continue; const q = N[n]; const dd = hyp(q[0] - pts[0][0], q[1] - pts[0][1]); if (dd < bd) { bd = dd; best = n; } }
    if (best !== null && bd < 1500) { pts[0] = [N[best][0], N[best][1]]; lines.push({ pts: smooth(resample(pts, 25), 60, 25), kind, name, bridge: true, startNode: best }); continue; }
    console.log('  ! arterial start not found', name, oldName, Math.round(bd));
  }
  addLine(smooth(resample(pts, 25), 60, 25), kind, name, { bridge: true });
}

// ---------- districts and their street grids (tools/geo/streets.mjs, shared with the game)
const towns = new Map();
for (const r of W.rails) { if (r.conn) continue; for (const s of r.st) { const q = r.path[s.i]; const key = s.ja.replace(/[〈（(].*$/, ''); let t = [...(towns.get(key) || [])].find(o => hyp(o.x - q[0], o.z - q[1]) < 600); if (!t) { t = { name: key, lines: 0, dir: null, sx: 0, sz: 0, n: 0, kinds: new Set() }; if (!towns.has(key)) towns.set(key, []); towns.get(key).push(t); t.x = q[0]; t.z = q[1]; } t.sx += q[0]; t.sz += q[1]; t.n++; t.lines++; t.kinds.add(r.kind); if (!t.dir && r.kind !== 'sub') { const a = r.path[Math.max(0, s.i - 3)], b = r.path[Math.min(r.path.length - 1, s.i + 3)]; t.dir = Math.atan2(b[1] - a[1], b[0] - a[0]); } } }
const townList = [...towns.values()].flat().map(t => ({ ...t, x: t.sx / t.n, z: t.sz / t.n }));
const seeds = [];
const stationSeeds = [];
for (const t of townList) {
  if (!inB(t.x, t.z, -100) || oldArea(t.x, t.z, 1) || !isLand(t.x, t.z)) continue;
  const lv = t.lines >= 3 ? 3 : t.lines === 2 ? 3 : 2;
  const a = (t.dir ?? vnoise(t.x / 4000, t.z / 4000) * Math.PI);
  const core = 260 + Math.min(4, t.lines) * 70;
  seeds.push([Math.round(t.x), Math.round(t.z), Math.round(a * 1000) / 1000, lv, 1, core]); stationSeeds.push(t);
}
// background seeds on a jittered grid; urban level from the distance to the nearest station
{
  const GS = 1350;
  for (let gx = Math.floor(B.x0 / GS); gx <= Math.ceil(B.x1 / GS); gx++) for (let gz = Math.floor(B.z0 / GS); gz <= Math.ceil(B.z1 / GS); gz++) {
    const x = (gx + 0.2 + 0.6 * vnoise(gx * 3.1, gz * 1.7)) * GS, z = (gz + 0.2 + 0.6 * vnoise(gx * 2.3 + 9, gz * 4.1)) * GS;
    if (!inB(x, z, 600) || oldArea(x, z, 2)) continue;
    const v = mq(x, z); if (v !== 1 && v !== 2) continue;
    let dmin = 1e9; for (const t of stationSeeds) { const d = hyp(t.x - x, t.z - z); if (d < dmin) dmin = d; }
    if (dmin < 700) continue;
    const lv = dmin < 1500 ? 2 : dmin < 2600 ? 1 : 0;
    const a = vnoise(x / 9000 + 3, z / 9000) * Math.PI * 0.5 + 0.2;
    seeds.push([Math.round(x), Math.round(z), Math.round(a * 1000) / 1000, lv, 0, 0]);
  }
}
const ST = makeStreets(seeds);
console.log('districts', seeds.length, 'stations', stationSeeds.length);
{
  const keep = (x, z) => { const v = mq(x, z); return (v === 1 || v === 2) && !oldArea(x, z, 0) && inB(x, z, 250); };
  let nGraph = 0;
  ST.S.forEach((o, i) => {
    const R = 1900;
    for (const p of ST.lines(i, o.x - R, o.z - R, o.x + R, o.z + R, { step: 20, overshoot: o.s * 1.1, keep, want: 'graph' })) {
      const kind = (o.lv >= 2 && (((p.k % 8) + 8) % 8 === 0)) ? 'B' : 'L';
      addLine(p.pts.map(q => [q[0], q[1]]), kind, null); nGraph++;
    }
  });
  console.log('graph street pieces', nGraph);
}
W.ext = W.ext || {};
W.ext.dist = seeds;
W.ext.oldOcc = [...occ];

// ---------- planar graph: densify, intersect, split
const SEG = [];
lines.forEach((l, li) => { const p = l.pts; for (let i = 0; i + 1 < p.length; i++) SEG.push([li, i]); });
const G = 60, sgrid = new Map();
SEG.forEach(([li, i], si) => { const a = lines[li].pts[i], b = lines[li].pts[i + 1]; for (let x = Math.floor(Math.min(a[0], b[0]) / G); x <= Math.floor(Math.max(a[0], b[0]) / G); x++) for (let z = Math.floor(Math.min(a[1], b[1]) / G); z <= Math.floor(Math.max(a[1], b[1]) / G); z++) { const k = x * 100003 + z; let A = sgrid.get(k); if (!A) sgrid.set(k, A = []); A.push(si); } });
const cuts = lines.map(() => []); // [param (segment index + t), node id]
function segInter(a, b, c, d) { const r1 = b[0] - a[0], r2 = b[1] - a[1], s1 = d[0] - c[0], s2 = d[1] - c[1], den = r1 * s2 - r2 * s1; if (Math.abs(den) < 1e-9) return null; const t = ((c[0] - a[0]) * s2 - (c[1] - a[1]) * s1) / den, u = ((c[0] - a[0]) * r2 - (c[1] - a[1]) * r1) / den; if (t < 0 || t > 1 || u < 0 || u > 1) return null; return [t, u]; }
const newNode = (x, z) => { N.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, 0]); return N.length - 1; };
const seen = new Set();
for (const [, A] of sgrid) {
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    const s1 = SEG[A[i]], s2 = SEG[A[j]]; if (s1[0] === s2[0]) continue;
    const key = A[i] < A[j] ? A[i] * 1e7 + A[j] : A[j] * 1e7 + A[i]; if (seen.has(key)) continue; seen.add(key);
    const l1 = lines[s1[0]], l2 = lines[s2[0]];
    const h = segInter(l1.pts[s1[1]], l1.pts[s1[1] + 1], l2.pts[s2[1]], l2.pts[s2[1] + 1]); if (!h) continue;
    const a = l1.pts[s1[1]], b = l1.pts[s1[1] + 1], x = a[0] + (b[0] - a[0]) * h[0], z = a[1] + (b[1] - a[1]) * h[0];
    const nd = newNode(x, z); cuts[s1[0]].push([s1[1] + h[0], nd]); cuts[s2[0]].push([s2[1] + h[1], nd]);
  }
}
// merge junction nodes closer than 5 m (several lines crossing at one spot)
const par = new Map(); const find = (a) => { let r = a; while (par.has(r) && par.get(r) !== r) r = par.get(r); let c = a; while (par.has(c) && par.get(c) !== r) { const nx = par.get(c); par.set(c, r); c = nx; } return r; };
{ const cg = new Map(), CG = 10; for (let i = nOld; i < N.length; i++) { const k = Math.floor(N[i][0] / CG) + ',' + Math.floor(N[i][1] / CG); let A = cg.get(k); if (!A) cg.set(k, A = []); A.push(i); }
  for (let i = nOld; i < N.length; i++) { const cx = Math.floor(N[i][0] / CG), cz = Math.floor(N[i][1] / CG); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of cg.get((cx + a) + ',' + (cz + b)) || []) { if (j <= i) continue; if (hyp(N[i][0] - N[j][0], N[i][1] - N[j][1]) < 5) { const ri = find(i), rj = find(j); if (ri !== rj) par.set(rj, ri); } } } }
const newEdges = [];
const deg = new Map();
lines.forEach((l, li) => {
  const p = l.pts, cs = cuts[li].sort((a, b) => a[0] - b[0]);
  const ends = [[0, l.startNode ?? null], [p.length - 1, null]];
  const all = [ends[0], ...cs, ends[1]];
  const at = (u) => { const i = Math.min(p.length - 2, Math.floor(u)), t = u - i; return [p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t]; };
  let prev = null, prevU = 0;
  for (const [u, nd0] of all) {
    let nd = nd0 === null ? null : find(nd0);
    if (nd === null) { const q = at(u); nd = newNode(q[0], q[1]); }
    if (prev !== null) {
      const mids = []; for (let i = Math.floor(prevU) + 1; i <= Math.ceil(u) - 1; i++) if (i > prevU + 1e-6 && i < u - 1e-6) mids.push(p[i]);
      const q0 = N[prev], q1 = N[nd]; const len = hyp(q1[0] - q0[0], q1[1] - q0[1]);
      if (prev !== nd && (len > 3 || mids.length)) {
        // local streets that run along under a viaduct are dropped
        const drop = l.kind === 'L' && alongRail(q0[0], q0[1], q1[0], q1[1]);
        if (!drop) { newEdges.push([prev, nd, KIND[l.kind], nameIdx(l.name), simplify([q0, ...mids, q1]).slice(1, -1).map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10])]); deg.set(prev, (deg.get(prev) || 0) + 1); deg.set(nd, (deg.get(nd) || 0) + 1); }
      }
    }
    prev = nd; prevU = u;
  }
});
function simplify(p, tol = 1.2) { if (p.length < 3) return p; const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1; const st = [[0, p.length - 1]]; while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; const ax = p[a][0], az = p[a][1], bx = p[b][0], bz = p[b][1], L = hyp(bx - ax, bz - az) || 1; for (let i = a + 1; i < b; i++) { const d = Math.abs((p[i][0] - ax) * (bz - az) - (p[i][1] - az) * (bx - ax)) / L; if (d > md) { md = d; mi = i; } } if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); } } return p.filter((_, i) => keep[i]); }
// remove dangling stubs left by the clipping / overshoot (short local dead ends)
let removed = 0;
const elen = (e) => { const p = [N[e[0]], ...e[4], N[e[1]]]; let L = 0; for (let i = 1; i < p.length; i++) L += hyp(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };
for (let pass = 0; pass < 3; pass++) for (let i = newEdges.length - 1; i >= 0; i--) { const e = newEdges[i]; if (!e || e[2] !== KIND.L) continue; const d0 = deg.get(e[0]) || 0, d1 = deg.get(e[1]) || 0; if ((d0 === 1 || d1 === 1) && elen(e) < (pass ? 90 : 170)) { deg.set(e[0], d0 - 1); deg.set(e[1], d1 - 1); newEdges[i] = null; removed++; } }
for (const e of newEdges) if (e) E.push(e);
console.log('lines', lines.length, 'new edges', newEdges.filter(Boolean).length, 'removed stubs', removed);

// ---------- stitch the old edge: old local dead ends near the old border -> nearest new node
{
  const degAll = new Map(); for (const e of E) for (const n of [e[0], e[1]]) degAll.set(n, (degAll.get(n) || 0) + 1);
  const NG = 80, ng = new Map(); for (let i = nOld; i < N.length; i++) { if (!degAll.get(i)) continue; const k = Math.floor(N[i][0] / NG) + ',' + Math.floor(N[i][1] / NG); let A = ng.get(k); if (!A) ng.set(k, A = []); A.push(i); }
  let st = 0;
  for (let i = 0; i < nOld; i++) { if (degAll.get(i) !== 1 || N[i][2] > 1) continue; const q = N[i]; let best = null, bd = 160; const cx = Math.floor(q[0] / NG), cz = Math.floor(q[1] / NG); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (const j of ng.get((cx + a) + ',' + (cz + b)) || []) { const d = hyp(N[j][0] - q[0], N[j][1] - q[1]); if (d < bd) { bd = d; best = j; } } if (best !== null && isLand((q[0] + N[best][0]) / 2, (q[1] + N[best][1]) / 2)) { E.push([i, best, KIND.L, -1, []]); st++; } }
  console.log('stitched', st);
}
// ---------- interchange ramps
{
  const ics = (W.ext && W.ext.ics) || [];
  const degAll = new Map(); for (const e of E) for (const n of [e[0], e[1]]) degAll.set(n, (degAll.get(n) || 0) + 1);
  const ground = []; for (let i = 0; i < N.length; i++) if (N[i][2] < 1 && degAll.get(i)) ground.push(i);
  const isArt = new Set(); for (const e of E) if (e[2] === KIND.A || e[2] === KIND.B) { isArt.add(e[0]); isArt.add(e[1]); }
  let made = 0;
  for (const ic of ics) {
    const q = N[ic.node]; if (!q) continue;
    let best = null, bd = 700; for (const j of ground) { const d = hyp(N[j][0] - q[0], N[j][1] - q[1]) * (isArt.has(j) ? 1 : 1.6); if (d < bd && d > 90) { bd = d; best = j; } }
    if (best === null) { console.log('  ! no ground for IC', ic.name); continue; }
    const g = N[best], mid = [(q[0] + g[0]) / 2 + (g[1] - q[1]) * 0.12, (q[1] + g[1]) / 2 - (g[0] - q[0]) * 0.12];
    const pts = resample([[q[0], q[1]], mid, [g[0], g[1]]], 12); const sm = smooth(pts, 18, 12).slice(1, -1).map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
    E.push([ic.node, best, KIND.R, nameIdx(ic.road), sm]); made++;
  }
  console.log('ramps', made, '/', ics.length);
}
// drop junction nodes that lost all their edges
{ const used = new Uint8Array(N.length); for (const e of E) { used[e[0]] = 1; used[e[1]] = 1; } const map = new Int32Array(N.length); let k = nOld; for (let i = 0; i < N.length; i++) { if (i < nOld) { map[i] = i; continue; } if (used[i]) { map[i] = k; N[k] = N[i]; k++; } else map[i] = -1; } N.length = k; for (const e of E) { e[0] = map[e[0]]; e[1] = map[e[1]]; } }
console.log('nodes', N.length, '(+' + (N.length - nOld) + ')', 'edges', E.length, '(+' + (E.length - eOld) + ')');
fs.writeFileSync(OUT, JSON.stringify(W));
