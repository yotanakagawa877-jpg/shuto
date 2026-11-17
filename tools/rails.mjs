// Rebuild the rail network geometry in data/world.json:
//  1. smooth every surface line (removes zig-zags left by the station-to-station splines)
//  2. lay lines that really run side by side on shared corridors with fixed track spacing, in the real order
//     (京浜東北・山手・東海道 田端〜品川〜横浜, 山手貨物線 大崎〜池袋 with 埼京・湘南新宿, 中央快速・各停, 品鶴線, 東横・目黒, 田園都市・大井町)
//  3. recompute heights: one base level for elevated lines, flyovers only where lines really cross each other or an expressway,
//     tunnels/portals for lines that are underground in reality (横須賀線 東京〜品川, 京王線 新宿〜笹塚, 小田急 下北沢, 田園都市線, 目黒線 …)
// usage: node tools/rails.mjs [in.json] [out.json]
import fs from 'fs';
const IN = process.argv[2] || 'data/world.json', OUT = process.argv[3] || IN;
const W = JSON.parse(fs.readFileSync(IN, 'utf8'));
const STEP = 4, SPACING = 11.5, BASE = 8, OVER_RAIL = 9, OVER_X = 19.5, GRADE = 0.035, TUN = -16;
const hyp = Math.hypot;
const lineBy = (code, ja) => W.rails.find(r => r.code === code && (!ja || r.ja === ja));
const L = (code, ja) => { const r = lineBy(code, ja); if (!r) throw new Error('no line ' + code + ' ' + ja); return r; };

// ---------- geometry helpers
function cum(p) { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + hyp(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; }
function resample(p, step = STEP, closed = false) {
  const q = closed ? [...p, p[0]] : p, c = cum(q), len = c[c.length - 1], n = Math.max(2, Math.round(len / step)), out = [];
  let j = 0;
  for (let k = 0; k <= (closed ? n - 1 : n); k++) { const s = len * k / n; while (j < c.length - 2 && c[j + 1] < s) j++; const t = (s - c[j]) / ((c[j + 1] - c[j]) || 1); out.push([q[j][0] + (q[j + 1][0] - q[j][0]) * t, q[j][1] + (q[j + 1][1] - q[j][1]) * t]); }
  return out;
}
function smooth(p, sigmaM, closed = false, pins = []) {
  const s = sigmaM / STEP; if (s < 0.5) return p; const R = Math.ceil(s * 3), K = []; let ks = 0;
  for (let k = -R; k <= R; k++) { const w = Math.exp(-(k * k) / (2 * s * s)); K.push(w); ks += w; }
  const n = p.length, out = p.map(q => q.slice());
  for (let i = 0; i < n; i++) {
    let x = 0, z = 0, ws = 0;
    for (let k = -R; k <= R; k++) { let j = i + k; if (closed) j = (j + n) % n; else if (j < 0 || j >= n) continue; const w = K[k + R]; x += p[j][0] * w; z += p[j][1] * w; ws += w; }
    if (!closed) { // keep the ends anchored: blend back to the original near them
      const e = Math.min(i, n - 1 - i), f = Math.min(1, e / (R + 1));
      out[i] = [p[i][0] + (x / ws - p[i][0]) * f, p[i][1] + (z / ws - p[i][1]) * f];
    } else out[i] = [x / ws, z / ws];
  }
  for (const pi of pins) { // pull pinned points (e.g. corridor joints) back with a smooth taper
    const d = [p[pi][0] - out[pi][0], p[pi][1] - out[pi][1]];
    for (let k = -R * 2; k <= R * 2; k++) { let j = pi + k; if (closed) j = (j + n) % n; else if (j < 0 || j >= n) continue; const w = Math.exp(-(k * k) / (2 * s * s)); out[j][0] += d[0] * w; out[j][1] += d[1] * w; }
  }
  return out;
}
function nearestIdx(p, x, z, lo = 0, hi = p.length - 1) { let b = -1, bd = 1e18; for (let i = Math.max(0, lo); i <= Math.min(p.length - 1, hi); i++) { const d = (p[i][0] - x) ** 2 + (p[i][1] - z) ** 2; if (d < bd) { bd = d; b = i; } } return [b, Math.sqrt(bd)]; }
function tangent(p, i) { const a = p[Math.max(0, i - 2)], b = p[Math.min(p.length - 1, i + 2)], l = hyp(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
const ss = (t) => t * t * (3 - 2 * t);

// ---------- station anchors
for (const r of W.rails) for (const s of r.st) { const q = r.path[s.i]; s.ax = q[0]; s.az = q[1]; }
const ORIG = new Map(); for (const r of W.rails) ORIG.set(r, { path: r.path.map(q => q.slice()), ys: r.ys.slice() });
const stPos = (r, name) => { const s = r.st.find(q => q.ja === name); return s ? [s.ax, s.az] : null; };

// ---------- kinds / tunnels (real-world: which parts are underground)
const TUNNELS = [ // [code, ja, from station or null (=line start), to station or null (=line end)]
  ['JO', 'JR横須賀・総武快速線', null, '品川'], // 東京〜品川 地下、品川の先で地上へ
  ['JE', 'JR京葉線', null, '越中島'],
  ['KO', '京王線', null, '幡ヶ谷'], // 新宿〜笹塚手前 地下
  ['OH', '小田急線', '東北沢', '世田谷代田'],
  ['DT', '東急田園都市線', null, '用賀'],
  ['MG', '東急目黒線', null, '大岡山'],
  ['TY', '東急東横線', null, '代官山'],
  ['KK', '京急本線', null, '泉岳寺'],
];
for (const [c, ja] of TUNNELS) { const r = L(c, ja); r.kind = 'el'; }
// 京王線（本線）は初台・幡ヶ谷に止まらない（京王新線の駅）
{ const r = L('KO', '京王線'); r.passSt = ['初台', '幡ヶ谷']; }

// ---------- 1) resample + smooth every surface line
const SURF = W.rails.filter(r => r.kind === 'el' || r.kind === 'mono' || r.kind === 'ats');
for (const r of SURF) {
  if (r.loop) { // rotate the loop so that it starts between 池袋 and 田端 (outside any corridor)
    const a = r.st.find(s => s.ja === '巣鴨') || r.st[0]; const k = r.path.indexOf(r.path[a.i]);
    r.path = [...r.path.slice(k), ...r.path.slice(0, k)];
  }
  r.path = smooth(resample(r.path, STEP, r.loop), 36, r.loop);
}

// ---------- 2) corridors
// slot: offset in track spacings to the RIGHT of the corridor direction (first station -> last station).
// from/to limit a member to part of the corridor (station names of the corridor).
const CORRIDORS = [
  { name: '東北・東海道（田端〜東京〜品川〜横浜）', st: ['田端', '西日暮里', '日暮里', '鶯谷', '上野', '御徒町', '秋葉原', '神田', '東京', '有楽町', '新橋', '浜松町', '田町', '品川', '大井町', '大森', '蒲田', '川崎', '鶴見', '新子安', '東神奈川', '横浜'], ref: ['JK'],
    // 南行きの右手＝西（丸の内・高輪側）: 中央線 > 山手線 > 京浜東北線 > 東海道線（八重洲・港南側）。品鶴線（横須賀線・湘南新宿）は鶴見から内陸側に並ぶ
    m: [['JK', null, 0], ['JY', null, 1, '田端', '品川'], ['JT', null, -1, '上野', '横浜', ['上野']], ['JC', null, 2, '神田', '東京'], ['JJ', null, -1, '日暮里', '上野'], ['JO', null, 1, '鶴見', '横浜'], ['JS', null, 2, '鶴見', '横浜']] },
  { name: '中央線（御茶ノ水〜代々木）', st: ['御茶ノ水', '水道橋', '飯田橋', '市ケ谷', '四ツ谷', '信濃町', '千駄ケ谷', '代々木'], ref: ['JB'],
    m: [['JB', null, -0.5], ['JC', null, 0.5]] },
  { name: '山手貨物線（大崎〜池袋）', st: ['大崎', '五反田', '目黒', '恵比寿', '渋谷', '原宿', '代々木', '新宿', '新大久保', '高田馬場', '目白', '池袋'], ref: ['JY'],
    // 北行きの右手＝東: 中央線各停・快速 | 山手線 | 埼京線・湘南新宿ライン（貨物線は外側＝西）
    m: [['JY', null, 0], ['JA', null, -1], ['JS', null, -2], ['JB', null, 1, '代々木', '新宿'], ['JC', null, 2, '代々木', '新宿']] },
  { name: '中央線（新宿〜西荻窪）', st: ['新宿', '大久保', '東中野', '中野', '高円寺', '阿佐ケ谷', '荻窪', '西荻窪'], ref: ['JB'],
    m: [['JB', null, -0.5], ['JC', null, 0.5]] },
  { name: '品鶴線（西大井〜新川崎）', st: ['西大井', '武蔵小杉', '新川崎'], ref: ['JO'],
    m: [['JO', null, -0.5], ['JS', null, 0.5]] },
  { name: '東横線・目黒線 複々線（田園調布〜日吉）', st: ['田園調布', '多摩川', '新丸子', '武蔵小杉', '元住吉', '日吉'], ref: ['TY'],
    m: [['TY', null, -0.5], ['MG', null, 0.5]] },
  { name: '田園都市線・大井町線（二子玉川〜溝の口）', st: ['二子玉川', '二子新地', '高津', '溝の口'], ref: ['DT'],
    m: [['DT', null, 0.5], ['OM', null, -0.5]] },
  { name: '京急本線・空港線（京急蒲田）', st: ['京急蒲田'], ref: ['KK'], m: [] },
];
function anchorsOf(C) {
  const A = [];
  for (const name of C.st) {
    let sx = 0, sz = 0, n = 0;
    { const rr = lineBy(C.ref[0]); const p = rr && stPos(rr, name); if (p) { A.push(p); continue; } }
    for (const [c, ja] of C.m) { const r = lineBy(c, ja); if (!r) continue; const p = stPos(r, name); if (p) { sx += p[0]; sz += p[1]; n++; } }
    if (!n) for (const r of W.rails) { const p = stPos(r, name); if (p && r.kind !== 'sub') { sx += p[0]; sz += p[1]; n++; break; } }
    if (!n) { console.log('  ! no anchor', C.name, name); A.push(null); continue; }
    A.push([sx / n, sz / n]);
  }
  return A;
}
// the part of a line's path between two points (in path order), or null
function sliceBetween(r, P, Q, maxD = 400) {
  const [i, di] = nearestIdx(r.path, P[0], P[1]), [j, dj] = nearestIdx(r.path, Q[0], Q[1]);
  if (di > maxD || dj > maxD) return null; return i <= j ? { i, j, rev: false } : { i: j, j: i, rev: true };
}
for (const C of CORRIDORS) {
  if (!C.m.length) continue;
  const A = anchorsOf(C); if (A.some(a => !a)) { console.log('skip corridor', C.name); continue; }
  const ref = L(C.ref[0]);
  // centreline: the reference line between the end anchors, averaged with the other members running alongside, pulled through the anchors
  let cl = [];
  for (let k = 0; k + 1 < A.length || (A.length === 1 && k === 0); k++) {
    if (A.length === 1) break;
    const sl = sliceBetween(ref, A[k], A[k + 1]); if (!sl) { console.log('  ! ref gap', C.name, C.st[k], C.st[k + 1]); cl = null; break; }
    let seg = ref.path.slice(sl.i, sl.j + 1); if (sl.rev) seg.reverse();
    // average with other full members near this stretch
    seg = seg.map(q => { let x = q[0], z = q[1], n = 1; for (const [c, ja, slot, f, t] of C.m) { if (f || c === C.ref[0]) continue; const r = lineBy(c, ja); if (!r) continue; const [ii, d] = nearestIdx(r.path, q[0], q[1]); if (d < 40) { x += r.path[ii][0]; z += r.path[ii][1]; n++; } } return [x / n, z / n]; });
    // pin both ends exactly onto the anchors (taper the correction along the segment)
    const n = seg.length, d0 = [A[k][0] - seg[0][0], A[k][1] - seg[0][1]], d1 = [A[k + 1][0] - seg[n - 1][0], A[k + 1][1] - seg[n - 1][1]];
    seg = seg.map((q, i) => { const t = n > 1 ? i / (n - 1) : 0; return [q[0] + d0[0] * (1 - t) + d1[0] * t, q[1] + d0[1] * (1 - t) + d1[1] * t]; });
    cl.push(...(k ? seg.slice(1) : seg));
  }
  if (!cl || cl.length < 2) continue;
  cl = smooth(smooth(resample(cl), 60, false), 60, false);
  const clc = cum(cl), clLen = clc[clc.length - 1];
  const anchorS = A.map(a => clc[nearestIdx(cl, a[0], a[1])[0]]);
  C.cl = cl; C.anchors = A;
  const atS = (s) => { s = Math.max(0, Math.min(clLen, s)); let j = 0; while (j < clc.length - 2 && clc[j + 1] < s) j++; const t = (s - clc[j]) / ((clc[j + 1] - clc[j]) || 1), a = cl[j], b = cl[j + 1]; const l = hyp(b[0] - a[0], b[1] - a[1]) || 1; return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l }; };
  // offset polyline between corridor arc positions s0..s1 (s0<s1), right-hand offset `off`
  const offsetPath = (s0, s1, off) => { const out = []; const n = Math.max(2, Math.round((s1 - s0) / STEP)); for (let k = 0; k <= n; k++) { const q = atS(s0 + (s1 - s0) * k / n); out.push([q.x - q.dz * off, q.z + q.dx * off]); } return out; };
  for (const [c, ja, slot, from, to, addOnly] of C.m) {
    const r = lineBy(c, ja); if (!r) continue;
    const s0 = from ? anchorS[C.st.indexOf(from)] : 0, s1 = to ? anchorS[C.st.indexOf(to)] : clLen;
    const off = -slot * SPACING; // right-hand normal of (dx,dz) is (-dz, dx); slot>0 = right
    let seg = offsetPath(s0, s1, -off);
    const P0 = seg[0], P1 = seg[seg.length - 1];
    let [ia, da] = nearestIdx(r.path, P0[0], P0[1]), [ib, db] = nearestIdx(r.path, P1[0], P1[1]);
    if (ia > ib) { [ia, ib] = [ib, ia]; [da, db] = [db, da]; seg = seg.reverse(); }
    const segA = seg[0], segB = seg[seg.length - 1];
    // extension: the line ends inside the corridor (e.g. 東海道線 to 上野, 大井町線 to 溝の口)
    const extendStart = ia === 0 && da > 60, extendEnd = ib === r.path.length - 1 && db > 60;
    if (da > 160 && !extendStart || db > 160 && !extendEnd) { console.log('  ! member far', C.name, c, Math.round(da), Math.round(db)); }
    let before = r.path.slice(0, ia), after = r.path.slice(ib + 1);
    const arcOf = (q) => clc[nearestIdx(cl, q[0], q[1])[0]], origStartArc = arcOf(r.path[0]), origEndArc = arcOf(r.path[r.path.length - 1]);
    const hermite = (P, tP, Q, tQ) => { const d = hyp(Q[0] - P[0], Q[1] - P[1]), nn = Math.max(2, Math.round(d / STEP)), k = d * 1.0, out = []; for (let j = 1; j < nn; j++) { const t = j / nn, h1 = 2 * t ** 3 - 3 * t * t + 1, h2 = -2 * t ** 3 + 3 * t * t, h3 = t ** 3 - 2 * t * t + t, h4 = t ** 3 - t * t; out.push([h1 * P[0] + h2 * Q[0] + (h3 * tP[0] + h4 * tQ[0]) * k, h1 * P[1] + h2 * Q[1] + (h3 * tP[1] + h4 * tQ[1]) * k]); } return out; };
    const stIdx = r.st.map(q => nearestIdx(r.path, q.ax, q.az)[0]);
    // far from the corridor: rebuild the approach from the previous / next stop with a smooth curve
    let bridged0 = false, bridged1 = false;
    if (!extendStart && before.length && da > 120) { const cand = stIdx.filter(i => i < ia - 60).sort((a, b) => b - a); const cut = cand.length ? cand[0] : Math.max(0, ia - 200);
      before = [...r.path.slice(0, cut + 1), ...hermite(r.path[cut], tangent(r.path, cut), segA, tangent(seg, 0))]; bridged0 = true; }
    if (!extendEnd && after.length && db > 120) { const cand = stIdx.filter(i => i > ib + 60).sort((a, b) => a - b); const cut = cand.length ? cand[0] : Math.min(r.path.length - 1, ib + 200);
      after = [...hermite(segB, tangent(seg, seg.length - 1), r.path[cut], tangent(r.path, cut)), ...r.path.slice(cut)]; bridged1 = true; }
    // taper the neighbouring track into the corridor (displacement fades over 260 m)
    const T = Math.round(260 / STEP);
    if (before.length && !extendStart && !bridged0) { const d = [segA[0] - r.path[ia][0], segA[1] - r.path[ia][1]]; for (let k = 1; k <= T && before.length - k >= 0; k++) { const w = ss(1 - k / (T + 1)), q = before[before.length - k]; if (!q) break; before[before.length - k] = [q[0] + d[0] * w, q[1] + d[1] * w]; } }
    if (after.length && !extendEnd && !bridged1) { const d = [segB[0] - r.path[ib][0], segB[1] - r.path[ib][1]]; for (let k = 0; k < T && k < after.length; k++) { const w = ss(1 - (k + 1) / (T + 1)), q = after[k]; after[k] = [q[0] + d[0] * w, q[1] + d[1] * w]; } }
    r.path = [...before, ...seg, ...after];
    // corridor stations of this member snap to the corridor (anchor offset)
    for (const s of r.st) { const k = C.st.indexOf(s.ja); if (k < 0) continue; const sa = anchorS[k]; if (sa < s0 - 1 || sa > s1 + 1) continue; const q = atS(sa); s.ax = q.x + q.dz * off; s.az = q.z - q.dx * off; }
    // extensions add the corridor stations as new stops
    if (extendStart || extendEnd) {
      const sx = arcOf(extendStart ? segA : segB), lim = extendStart ? origStartArc : origEndArc, lo2 = Math.min(sx, lim) - 1, hi2 = Math.max(sx, lim) - 1;
      for (let k = 0; k < C.st.length; k++) { const name = C.st[k], sa = anchorS[k]; if (sa < s0 - 1 || sa > s1 + 1 || r.st.some(q => q.ja === name)) continue; if (!(sa > lo2 - 20 && sa < hi2 - 20 + 2) && !(Math.abs(sa - sx) < 30)) continue; if (addOnly && !addOnly.includes(name)) continue;
        const src = W.rails.flatMap(q => q.st).find(q => q.ja === name); const q = atS(sa);
        const ns = { ja: name, en: src ? src.en : name, i: 0, ax: q.x + q.dz * off, az: q.z - q.dx * off };
        if (extendStart) r.st.unshift(ns); else r.st.push(ns); }
      if (extendStart) { r.st.sort((a, b) => nearestIdx(r.path, a.ax, a.az)[0] - nearestIdx(r.path, b.ax, b.az)[0]); }
    }
    r.touched = true;
  }
  console.log('corridor', C.name, Math.round(clLen) + 'm');
}
// 京王新線: same alignment as 京王線 新宿〜笹塚, beside it (both underground)
{
  const k = L('KO', '京王線'), nw = L('KO', '京王新線'), a = stPos(k, '新宿'), b = stPos(k, '笹塚');
  const sl = sliceBetween(k, a, b); if (sl) {
    let seg = k.path.slice(sl.i, sl.j + 1); if (sl.rev) seg.reverse(); seg = resample(seg);
    seg = seg.map((q, i) => { const t = tangent(seg, i); return [q[0] - t[1] * 14, q[1] + t[0] * 14]; });
    const names = ['新線新宿', '初台', '幡ヶ谷', '笹塚'], olds = names.map(n => nw.st.find(s => s.ja === n));
    nw.path = seg; nw.ys = seg.map(() => TUN); const segc = cum(seg), L2 = segc[segc.length - 1];
    nw.st = names.map((n, j) => { const o = olds[j] || {}; const f = [0, 0.33, 0.62, 1][j]; let idx = nearestIdx(seg, o.ax ?? 1e9, o.az ?? 1e9)[0]; if (!o.ax || j === 0 || j === 3) idx = Math.round(f * (seg.length - 1)); return { ja: n, en: o.en || n, i: idx }; });
    nw.fixed = true;
  }
}

// station nudges (e.g. 京急品川駅は JR の西側、八ツ山橋の先で JR を越える)
function pull(r, name, dx, dz, sigma = 160) { const s = r.st.find(q => q.ja === name); if (!s) return; const [i0] = nearestIdx(r.path, s.ax, s.az); const c = cum(r.path);
  r.path = r.path.map((q, i) => { const w = Math.exp(-((c[i] - c[i0]) ** 2) / (2 * sigma * sigma)); return [q[0] + dx * w, q[1] + dz * w]; }); s.ax += dx; s.az += dz; }
{ const jr = L('JK'), a = stPos(jr, '品川'), [i] = nearestIdx(jr.path, a[0], a[1]), t = tangent(jr.path, i); // west = right of southbound
  pull(L('KK', '京急本線'), '品川', -t[1] * 75, t[0] * 75, 140); }
// ---------- 3) final resample + light smoothing, station indices
for (const r of SURF) {
  const pins = [];
  r.path = smooth(resample(r.path, STEP, r.loop), 14, r.loop);
  // station indices: in order along the line
  let lo = 0;
  for (const s of r.st) {
    if (r.loop) { s.i = nearestIdx(r.path, s.ax, s.az)[0]; continue; }
    const [i, d] = nearestIdx(r.path, s.ax, s.az, lo); s.i = i; lo = i + 1;
    if (d > 60) console.log('  ! station off', r.code, s.ja, Math.round(d));
  }
  if (r.loop) r.st.sort((a, b) => a.i - b.i);
}

// ---------- 4) heights
// expressway segments (deck at 12 m, Rainbow Bridge bump) and ramps
const N = W.nodes, K = 'XABLR';
const xsegs = [];
for (const e of W.edges) { const k = K[e[2]]; if (k !== 'X' && k !== 'R') continue; const pts = [N[e[0]].slice(0, 2), ...(e[4] || []), N[e[1]].slice(0, 2)]; const c = cum(pts), len = c[c.length - 1];
  for (let i = 0; i + 1 < pts.length; i++) { const ya = k === 'X' ? 12 : N[e[0]][2] + (N[e[1]][2] - N[e[0]][2]) * c[i] / len, yb = k === 'X' ? 12 : N[e[0]][2] + (N[e[1]][2] - N[e[0]][2]) * c[i + 1] / len; xsegs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], Math.max(ya, yb)]); } }
const GS = 64, grid = new Map(); const gk = (a, b) => a * 100003 + b;
const addSeg = (s) => { for (let a = Math.floor(Math.min(s[0], s[2]) / GS); a <= Math.floor(Math.max(s[0], s[2]) / GS); a++) for (let b = Math.floor(Math.min(s[1], s[3]) / GS); b <= Math.floor(Math.max(s[1], s[3]) / GS); b++) { const k = gk(a, b); let A = grid.get(k); if (!A) grid.set(k, A = []); A.push(s); } };
for (const s of xsegs) addSeg([...s, 'X']);
function inter(ax, az, bx, bz, cx, cz, dx, dz) { const r1 = bx - ax, r2 = bz - az, s1 = dx - cx, s2 = dz - cz, den = r1 * s2 - r2 * s1; if (Math.abs(den) < 1e-9) return null; const t = ((cx - ax) * s2 - (cz - az) * s1) / den, u = ((cx - ax) * r2 - (cz - az) * r1) / den; if (t < 0 || t > 1 || u < 0 || u > 1) return null; return [t, Math.abs(den) / (hyp(r1, r2) * hyp(s1, s2))]; }
// fixed obstacles: monorail / AGT / tram / lines we do not touch
for (const [ri, r] of W.rails.entries()) { if (SURF.includes(r) || r.kind === 'sub') continue; for (let i = 0; i + 1 < r.path.length; i++) addSeg([r.path[i][0], r.path[i][1], r.path[i + 1][0], r.path[i + 1][1], Math.max(r.ys[i], r.ys[i + 1]), 'R' + ri]); }
const PRI = ['JK', 'JY', 'JT', 'JC', 'JB', 'JJ', 'JA', 'JS', 'JO', 'JE', 'JN', 'JI', 'JH', 'KK', 'TY', 'MG', 'OH', 'KO', 'DT', 'OM', 'IK', 'TM', 'IN', 'SI', 'SS', 'TS', 'TJ', 'KS'];
const order = SURF.slice().sort((a, b) => (PRI.indexOf(a.code) + 1 || 99) - (PRI.indexOf(b.code) + 1 || 99));
const tunnelOf = (r) => TUNNELS.filter(t => t[0] === r.code && t[1] === r.ja);
for (const r of order) {
  if (r.fixed) continue;
  const base = r.kind === 'el' ? BASE : 10, p = r.path, n = p.length, c = cum(p), y = new Array(n).fill(base);
  // underground mask: explicit tunnels, else where the old line was underground (e.g. 京急空港線)
  const under = new Uint8Array(n);
  const tl = tunnelOf(r);
  if (tl.length) for (const [, , f, t] of tl) { const fi = f ? r.st.find(s => s.ja === f)?.i : 0, ti = t ? r.st.find(s => s.ja === t)?.i : n - 1; if (fi === undefined || ti === undefined) { console.log('  ! tunnel station', r.code, f, t); continue; } for (let i = Math.min(fi, ti); i <= Math.max(fi, ti); i++) under[i] = 1; }
  else if (ORIG.get(r).ys.some(v => v < 0)) { const o = ORIG.get(r); for (let i = 0; i < n; i += 1) { const [j] = nearestIdx(o.path, p[i][0], p[i][1], 0, o.path.length - 1); if (o.ys[j] < 0) under[i] = 1; } }
  // crossing constraints
  const cons = [];
  for (let i = 0; i + 1 < n; i++) {
    const ax = p[i][0], az = p[i][1], bx = p[i + 1][0], bz = p[i + 1][1], seen = new Set();
    for (let a = Math.floor(Math.min(ax, bx) / GS); a <= Math.floor(Math.max(ax, bx) / GS); a++) for (let b = Math.floor(Math.min(az, bz) / GS); b <= Math.floor(Math.max(az, bz) / GS); b++) {
      const A = grid.get(gk(a, b)); if (!A) continue;
      for (const sg of A) { if (seen.has(sg)) continue; seen.add(sg); const h = inter(ax, az, bx, bz, sg[0], sg[1], sg[2], sg[3]); if (!h) continue; const [t, sin] = h; if (sin < 0.12) continue;
        const s = c[i] + (c[i + 1] - c[i]) * t; if (under[i]) continue;
        const need = sg[5] === 'X' ? (sg[4] > 2 ? sg[4] + OVER_X - 12 : 0) : (sg[4] > 1.5 ? sg[4] + OVER_RAIL : 0);
        if (need > base) cons.push([s, need]); }
    }
  }
  for (const [s, h] of cons) for (let i = 0; i < n; i++) { const d = Math.abs(c[i] - s), v = h - Math.max(0, d - 45) * GRADE; if (v > y[i]) y[i] = v; }
  // stations stay level (platform ±90 m)
  for (const st of r.st) { const s0 = c[st.i]; let m = 0; for (let i = 0; i < n; i++) if (Math.abs(c[i] - s0) < 95) m = Math.max(m, y[i]); for (let i = 0; i < n; i++) if (Math.abs(c[i] - s0) < 95) y[i] = m; }
  // grade envelope (only raises)
  for (let i = 1; i < n; i++) y[i] = Math.max(y[i], y[i - 1] - GRADE * (c[i] - c[i - 1]));
  for (let i = n - 2; i >= 0; i--) y[i] = Math.max(y[i], y[i + 1] - GRADE * (c[i + 1] - c[i]));
  // tunnels with portals (2.5 % ramps outside the underground part)
  if (under.some(v => v)) {
    const dist = new Float64Array(n).fill(1e9);
    for (let i = 0; i < n; i++) if (under[i]) dist[i] = 0;
    for (let i = 1; i < n; i++) dist[i] = Math.min(dist[i], dist[i - 1] + (c[i] - c[i - 1]));
    for (let i = n - 2; i >= 0; i--) dist[i] = Math.min(dist[i], dist[i + 1] + (c[i + 1] - c[i]));
    for (let i = 0; i < n; i++) { const v = TUN + dist[i] * 0.04; if (v < y[i]) y[i] = v; }
  }
  r.ys = y.map(v => Math.round(v * 100) / 100);
  // register as obstacle for the lines processed after it
  for (let i = 0; i + 1 < n; i++) addSeg([p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], Math.max(r.ys[i], r.ys[i + 1]), 'L']);
}
for (const r of W.rails) if (r.passSt) r.st = r.st.filter(s => !r.passSt.includes(s.ja));
for (const r of W.rails) { r.path = r.path.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]); for (const s of r.st) { delete s.ax; delete s.az; } delete r.touched; delete r.fixed; delete r.passSt; }
// report
for (const r of SURF) { const lv = {}; for (const v of r.ys) { const k = v < 0 ? 'tun' : v < 12 ? 'base' : v < 21 ? 'fly1' : 'fly2'; lv[k] = (lv[k] || 0) + 1; } console.log(r.code.padEnd(3), r.ja.padEnd(14), r.path.length, JSON.stringify(lv), r.st.map(s => s.ja).join(' ').slice(0, 80)); }
fs.writeFileSync(OUT, JSON.stringify(W));
console.log('wrote', OUT);
