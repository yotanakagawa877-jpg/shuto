// v3.2 rail network for the extended map. Runs after tools/rails.mjs (old network final) and tools/geo/xways.mjs (new expressways).
//  - extends existing lines beyond the old map edge along the real alignment (Mini Tokyo 3D open data)
//  - adds the suburban lines of the new area, the Tokaido and Tohoku Shinkansen
//  - lines that share a corridor in reality are laid side by side (fixed track spacing, smooth divergence)
//  - heights: base viaduct, flyovers over crossing lines / expressways, tunnels where the real line is underground
// usage: node tools/geo/rails2.mjs in.json out.json
import fs from 'fs';
import { toXZ } from './munis.mjs';
import { boundsXZ } from './mask.mjs';
const IN = process.argv[2], OUT = process.argv[3];
const W = JSON.parse(fs.readFileSync(IN, 'utf8'));
const MT = JSON.parse(fs.readFileSync('data/mt3d.json', 'utf8')).lines;
const B = boundsXZ(), MARGIN = 500;
const inB = (q, m = MARGIN) => q[0] > B.x0 - m && q[0] < B.x1 + m && q[1] > B.z0 - m && q[1] < B.z1 + m;
const STEP = 8, SPACING = 11.5, BASE = 8, SHIN_BASE = 13, OVER_RAIL = 9, OVER_X = 19.5, GRADE = 0.035, TUN = -16;
const hyp = Math.hypot;
const ss = (t) => t * t * (3 - 2 * t);
function cum(p) { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + hyp(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; }
function resample(p, step = STEP, under = null) {
  const c = cum(p), len = c[c.length - 1], n = Math.max(1, Math.round(len / step)), out = [], u = [];
  let j = 0;
  for (let k = 0; k <= n; k++) { const s = len * k / n; while (j < c.length - 2 && c[j + 1] < s) j++; const t = (s - c[j]) / ((c[j + 1] - c[j]) || 1); out.push([p[j][0] + (p[j + 1][0] - p[j][0]) * t, p[j][1] + (p[j + 1][1] - p[j][1]) * t]); if (under) u.push(t < 0.5 ? under[j] : under[j + 1]); }
  return under ? [out, u] : out;
}
function smoothPts(p, sigmaM, step = STEP) {
  const s = sigmaM / step; if (s < 0.5 || p.length < 3) return p; const R = Math.ceil(s * 3), K = []; for (let k = -R; k <= R; k++) K.push(Math.exp(-(k * k) / (2 * s * s)));
  const n = p.length; return p.map((q, i) => { let x = 0, z = 0, ws = 0; for (let k = -R; k <= R; k++) { const j = i + k; if (j < 0 || j >= n) continue; const w = K[k + R]; x += p[j][0] * w; z += p[j][1] * w; ws += w; } const f = Math.min(1, Math.min(i, n - 1 - i) / (R + 1)); return [q[0] + (x / ws - q[0]) * f, q[1] + (z / ws - q[1]) * f]; });
}
function tangent(p, i) { const a = p[Math.max(0, i - 2)], b = p[Math.min(p.length - 1, i + 2)], l = hyp(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
function hermite(P, tP, Q, tQ, step = STEP, kf = 1) { const d = hyp(Q[0] - P[0], Q[1] - P[1]), nn = Math.max(2, Math.round(d / step)), k = d * kf, out = []; for (let j = 1; j < nn; j++) { const t = j / nn, h1 = 2 * t ** 3 - 3 * t * t + 1, h2 = -2 * t ** 3 + 3 * t * t, h3 = t ** 3 - 2 * t * t + t, h4 = t ** 3 - t * t; out.push([h1 * P[0] + h2 * Q[0] + (h3 * tP[0] + h4 * tQ[0]) * k, h1 * P[1] + h2 * Q[1] + (h3 * tP[1] + h4 * tQ[1]) * k]); } return out; }
// nearest point on a polyline: [segment, t, dist, arc]
function nearest(path, q, c = null) { let best = [0, 0, 1e18, 0]; c = c || cum(path); for (let i = 0; i + 1 < path.length; i++) { const a = path[i], b = path[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz; let t = l2 ? ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const d = hyp(a[0] + dx * t - q[0], a[1] + dz * t - q[1]); if (d < best[2]) best = [i, t, d, c[i] + (c[i + 1] - c[i]) * t]; } return best; }
function at(path, c, s) { s = Math.max(0, Math.min(c[c.length - 1], s)); let lo = 0, hi = c.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= s) lo = m; else hi = m - 1; } const j = lo, t = (s - c[j]) / ((c[j + 1] - c[j]) || 1), a = path[j], b = path[j + 1], l = hyp(b[0] - a[0], b[1] - a[1]) || 1; return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l, j }; }
// sub path of a polyline between arc positions a -> b (a may be > b: reversed)
function subPath(path, c, a, b, under = null) { const lo = Math.min(a, b), hi = Math.max(a, b), out = [], u = []; const A = at(path, c, lo); out.push([A.x, A.z]); if (under) u.push(under[A.j]); for (let i = 0; i < path.length; i++) if (c[i] > lo + 0.5 && c[i] < hi - 0.5) { out.push(path[i].slice()); if (under) u.push(under[i]); } const Bq = at(path, c, hi); out.push([Bq.x, Bq.z]); if (under) u.push(under[Bq.j]); if (a > b) { out.reverse(); u.reverse(); } return under ? [out, u] : out; }
// offset a path to the right of its direction by off(s) metres
function offsetPath(p, offFn) { const c = cum(p); return p.map((q, i) => { const t = tangent(p, i), o = offFn(c[i], i); return [q[0] - t[1] * o, q[1] + t[0] * o]; }); }

const rails = W.rails;
const byCode = (code, ja) => rails.find(r => r.code === code && (!ja || r.ja === ja));
const R = (code, ja) => { const r = byCode(code, ja); if (!r) throw new Error('no rail ' + code + ' ' + (ja || '')); return r; };
const mt = (id) => { const l = MT[id]; if (!l) throw new Error('no mt3d ' + id); if (!l.c) l.c = cum(l.path); return l; };
const stArc = (l, name) => { const s = l.st.find(q => q.ja === name || q.ja.replace(/[〈（(].*$/, '') === name); if (!s) throw new Error('no station ' + name + ' on ' + l.ja); return s.arc; };
const gameSt = (r, name) => r.st.find(s => s.ja === name || s.ja.replace(/[〈（(].*$/, '') === name);
const ptOf = (r, name) => { const s = gameSt(r, name); if (!s) throw new Error('no game station ' + name + ' on ' + r.ja); return r.path[s.i]; };
const nm = (s) => s.replace(/[〈（(].*$/, '');

// every new or changed rail: {r, from: index where new geometry starts (extension) or 0, under[] per point, isNew}
const touched = new Map();
const kindY = (kind, u) => kind === 'sub' ? TUN : kind === 'tram' ? 0.25 : u ? TUN : kind === 'el' ? BASE : 10;

// ---------- clip an MT3D line to the map (longest piece inside)
function clipMT(l, a0 = 0, a1 = null) {
  if (a1 === null) a1 = l.c[l.c.length - 1];
  let [p, u] = subPath(l.path, l.c, a0, a1, l.under);
  // longest inside piece
  let best = null, cur = null;
  p.forEach((q, i) => { if (inB(q)) { if (!cur) cur = { i0: i, i1: i }; cur.i1 = i; } else if (cur) { if (!best || cur.i1 - cur.i0 > best.i1 - best.i0) best = cur; cur = null; } });
  if (cur && (!best || cur.i1 - cur.i0 > best.i1 - best.i0)) best = cur;
  if (!best) return null;
  p = p.slice(best.i0, best.i1 + 1); u = u.slice(best.i0, best.i1 + 1);
  return { p, u };
}
// stations of an MT3D line lying on a path (within 120 m), in path order
function stationsOn(l, p, skipNames = new Set()) {
  const c = cum(p), out = [];
  for (const s of l.st) { if (skipNames.has(nm(s.ja))) continue; const q = [s.x, s.z]; if (!inB(q, 0)) continue; const n = nearest(p, q, c); if (n[2] > 120) continue; out.push({ ja: nm(s.ja) === '押上' ? '押上〈スカイツリー前〉' : s.ja.replace(/\(([^)]*)\)/, '〈$1〉'), en: s.en, arc: n[3] }); }
  out.sort((a, b) => a.arc - b.arc);
  return out.filter((s, i) => !i || s.arc - out[i - 1].arc > 40);
}
function setStations(r, list, p) { const c = cum(p); r.st = list.map(s => ({ ja: s.ja, en: s.en, i: Math.min(p.length - 1, Math.max(0, Math.round(at(p, c, s.arc).j + 0.5))) })); for (const s of r.st) { const a = list.find(q => q.ja === s.ja); s.i = closestIdx(p, at(p, c, a.arc)); } }
function closestIdx(p, q) { let b = 0, bd = 1e18; for (let i = 0; i < p.length; i++) { const d = (p[i][0] - q.x) ** 2 + (p[i][1] - q.z) ** 2; if (d < bd) { bd = d; b = i; } } return b; }

// ---------- extensions of existing lines
// [code, ja|null, mt3d id, which end ('start'|'end'), options]
const EXT = [
  ['JK', null, 'JR-East.KeihinTohokuNegishi', 'start'], ['JK', null, 'JR-East.KeihinTohokuNegishi', 'end'],
  ['Y', null, 'TokyoMetro.Yurakucho', 'start'], ['F', null, 'TokyoMetro.Fukutoshin', 'start'],
  ['JB', null, 'JR-East.ChuoSobuLocal', 'start'], ['JB', null, 'JR-East.ChuoSobuLocal', 'end'],
  ['T', null, 'TokyoMetro.Tozai', 'end'], ['S', null, 'Toei.Shinjuku', 'end'],
  ['JC', null, 'JR-East.ChuoRapid', 'end'], ['OH', null, 'Odakyu.Odawara', 'end'],
  ['KK', '京急本線', 'Keikyu.Main', 'end'], ['C', null, 'TokyoMetro.Chiyoda', 'start'],
  ['N', null, 'TokyoMetro.Namboku', 'start'], ['I', null, 'Toei.Mita', 'end'], ['E', null, 'Toei.Oedo', 'end'],
  ['JJ', null, 'JR-East.JobanRapid', 'end'], ['TX', null, 'MIR.TsukubaExpress', 'end'],
  ['TS', '東武スカイツリーライン', 'Tobu.TobuSkytree', 'end'], ['JA', null, 'JR-East.SaikyoKawagoe', 'end'],
  ['TJ', null, 'Tobu.Tojo', 'end'], ['SI', null, 'Seibu.Ikebukuro', 'end'], ['SS', null, 'Seibu.Shinjuku', 'end'],
  ['JE', null, 'JR-East.Keiyo', 'end'], ['KS', '京成本線', 'Keisei.Main', 'end'], ['JT', null, 'JR-East.Tokaido', 'end'],
  ['JO', null, 'JR-East.Yokosuka', 'end'], ['JO', null, 'JR-East.SobuRapid', 'start'],
  ['KO', '京王線', 'Keio.Keio', 'end'], ['IN', null, 'Keio.Inokashira', 'end'], ['DT', null, 'Tokyu.DenEnToshi', 'end'],
  ['NT', null, 'Toei.NipporiToneri', 'end'], ['JN', null, 'JR-East.Nambu', 'end'], ['JH', null, 'JR-East.Yokohama', 'end'],
  ['B', null, 'YokohamaMunicipal.Blue', 'start'], ['B', null, 'YokohamaMunicipal.Blue', 'end'],
];
function extend(r, l, which) {
  const p = r.path, n = p.length;
  const E = which === 'end' ? p[n - 1] : p[0];
  // outward tangent of the game line
  const ti = which === 'end' ? tangent(p, n - 1) : tangent(p, 0).map(v => -v);
  const nE = nearest(l.path, E, l.c);
  if (nE[2] > 500) { console.log('  ! ext far', r.code, r.ja, which, Math.round(nE[2])); return; }
  const tm = at(l.path, l.c, nE[3]), fwd = tm.dx * ti[0] + tm.dz * ti[1] > 0;
  const total = l.c[l.c.length - 1];
  const clip = clipMT(l, nE[3], fwd ? total : 0);
  if (!clip || cum(clip.p).at(-1) < 300) return;
  let [q, u] = resample(clip.p, STEP, clip.u);
  // drop the first 200 m and join with a smooth curve from the game end
  const qc = cum(q); let j = qc.findIndex(v => v > 220); if (j < 0) return;
  const join = hermite(E, ti, q[j], tangent(q, j), STEP);
  const newPts = [...join, ...q.slice(j)], newU = [...join.map(() => u[j]), ...u.slice(j)];
  // stations beyond the old end
  const have = new Set(r.st.map(s => nm(s.ja)));
  const sts = stationsOn(l, newPts, have);
  const base = r.kind;
  if (which === 'end') {
    const off = p.length;
    r.path = [...p, ...newPts];
    r.ys = [...r.ys, ...newU.map(v => kindY(base, v))];
    const c = cum(newPts);
    for (const s of sts) r.st.push({ ja: s.ja, en: s.en, i: off + closestIdx(newPts, at(newPts, c, s.arc)) });
    mark(r, off, n, newU, 'end');
  } else {
    const rev = newPts.slice().reverse(), revU = newU.slice().reverse(), m = rev.length;
    r.path = [...rev, ...p];
    r.ys = [...revU.map(v => kindY(base, v)), ...r.ys];
    for (const s of r.st) s.i += m;
    const c = cum(newPts);
    const add = sts.map(s => ({ ja: s.ja, en: s.en, i: m - 1 - closestIdx(newPts, at(newPts, c, s.arc)) }));
    r.st = [...add.sort((a, b) => a.i - b.i), ...r.st];
    mark(r, 0, m, revU, 'start');
  }
  console.log('ext', r.code.padEnd(3), (r.ja || '').padEnd(14), which.padEnd(5), Math.round(cum(newPts).at(-1)) + 'm', sts.map(s => s.ja).join(' '));
}
function mark(r, i0, n0, u, which) { // remember which point range is new (for corridors / heights)
  let t = touched.get(r); if (!t) touched.set(r, t = { r, ranges: [], isNew: false });
  if (which === 'start') { for (const g of t.ranges) { g[0] += u.length; g[1] += u.length; } t.ranges.push([0, u.length - 1, u]); }
  else t.ranges.push([i0, i0 + u.length - 1, u]);
}

// convert lines whose suburban part is above ground (東西線 東陽町の先から高架, TX 北千住の先から地上)
R('T').kind = 'el'; R('TX').kind = 'el';
for (const [code, ja, id, which] of EXT) { const r = byCode(code, ja); if (!r) { console.log('  ! no line', code, ja); continue; } extend(r, mt(id), which); }
for (const [code, upTo, extra] of [['T', '南砂町', 120], ['TX', '北千住', 300]]) {
  const r = R(code), k = gameSt(r, upTo).i + Math.round(extra / 4), u = r.path.map((q, i) => i <= k ? 1 : 0);
  touched.set(r, { r, ranges: [[0, r.path.length - 1, u]], isNew: true, keepXY: true });
}

// ---------- new lines
// [code, ja (game name), mt3d id, kind, opts {from, to, color, en}]
const NEW = [
  ['JL', 'JR常磐線各駅停車', 'JR-East.JobanLocal', 'el', { color: '#868a87' }],
  ['JM', 'JR武蔵野線', 'JR-East.Musashino', 'el', {}],
  ['JN', 'JR南武線浜川崎支線', 'JR-East.NambuBranch', 'el', {}],
  ['JK', 'JR京葉線(高谷支線)', 'JR-East.KeiyoKoyaBranch', 'el', { conn: true }],
  ['TD', '東武アーバンパークライン', 'Tobu.TobuUrbanPark', 'el', {}],
  ['TS', '東武スカイツリーライン(押上)', 'Tobu.TobuSkytreeBranch', 'el', {}],
  ['TS', '東武大師線', 'Tobu.Daishi', 'el', {}],
  ['SI', '西武有楽町線', 'Seibu.SeibuYurakucho', 'sub', {}],
  ['SK', '西武国分寺線', 'Seibu.Kokubunji', 'el', {}],
  ['SW', '西武多摩川線', 'Seibu.Tamagawa', 'el', {}],
  ['KO', '京王相模原線', 'Keio.Sagamihara', 'el', {}],
  ['OH', '小田急多摩線', 'Odakyu.Tama', 'el', {}],
  ['OE', '小田急江ノ島線', 'Odakyu.Enoshima', 'el', { color: '#2288cc' }],
  ['EN', '江ノ島電鉄線', 'Enoden.Enoden', 'tram', {}],
  ['SM', '湘南モノレール', 'ShonanMonorail.ShonanMonorail', 'mono', {}],
  ['SO', '相鉄本線', 'Sotetsu.Main', 'el', {}],
  ['SO', '相鉄いずみ野線', 'Sotetsu.Izumino', 'el', {}],
  ['SO', '相鉄新横浜線', 'Sotetsu.SotetsuShinYokohama', 'el', {}],
  ['SH', '東急新横浜線', 'Tokyu.TokyuShinYokohama', 'sub', {}],
  ['KD', '東急こどもの国線', 'Tokyu.Kodomonokuni', 'el', {}],
  ['SG', '東急世田谷線', 'Tokyu.Setagaya', 'tram', {}],
  ['GL', '横浜市営地下鉄グリーンライン', 'YokohamaMunicipal.Green', 'sub', {}],
  ['SL', '金沢シーサイドライン', 'YokohamaSeaside.KanazawaSeaside', 'ats', {}],
  ['KK', '京急逗子線', 'Keikyu.Zushi', 'el', {}],
  ['SR', '埼玉高速鉄道線', 'SaitamaRailway.SaitamaRailway', 'sub', {}],
  ['HS', '北総線', 'Hokuso.Hokuso', 'el', {}],
  ['KS', '京成松戸線', 'Keisei.Matsudo', 'el', { color: '#ee86a7' }],
  ['KS', '京成金町線', 'Keisei.Kanamachi', 'el', {}],
  ['KS', '京成千葉線', 'Keisei.Chiba', 'el', {}],
  ['TR', '東葉高速線', 'ToyoRapid.ToyoRapid', 'el', {}],
  ['RN', '流鉄流山線', 'Ryutetsu.Nagareyama', 'el', {}],
];
for (const [code, ja, id, kind, o] of NEW) {
  const l = mt(id), clip = clipMT(l);
  if (!clip) { console.log('  ! out of map', ja); continue; }
  let [p, u] = resample(clip.p, STEP, clip.u);
  p = smoothPts(p, 24);
  const r = { code, ja, en: l.en, color: (o.color || l.color).toLowerCase(), kind, loop: false, path: p, ys: u.map(v => kindY(kind, v)), st: [] };
  if (o.conn) r.conn = 1;
  const sts = o.conn ? [] : stationsOn(l, p);
  const c = cum(p); r.st = sts.map(s => ({ ja: s.ja, en: s.en, i: closestIdx(p, at(p, c, s.arc)) }));
  rails.push(r);
  touched.set(r, { r, ranges: [[0, p.length - 1, u]], isNew: true });
  console.log('new', code.padEnd(3), ja.padEnd(16), Math.round(c.at(-1)) + 'm', r.st.map(s => s.ja).join(' '));
}

// ---------- 宇都宮線・高崎線 (上野東京ライン: continues the 東海道線 track from 上野)
{
  const jt = R('JT'), jk = R('JK'), l = mt('JR-East.Utsunomiya');
  const P0 = ptOf(jt, '上野'), t0 = tangent(jt.path, gameSt(jt, '上野').i).map(v => -v); // northbound
  const a = nearest(l.path, P0, l.c)[3];
  const clip = clipMT(l, a, l.c.at(-1));
  let [q, u] = resample(clip.p, STEP, clip.u);
  // follow the JK corridor 2 slots east until the real line leaves it (尾久 route), then the real alignment
  const kc = cum(jk.path), aU = nearest(jk.path, P0, kc)[3];
  let k = 0; const qc = cum(q);
  for (; k < q.length; k++) { const n = nearest(jk.path, q[k], kc); if (n[2] > 45 && qc[k] > 600) break; }
  const sDiv = qc[k];
  // JK path from 上野 northwards (JK runs north->south, so arc decreases)
  const seg = subPath(jk.path, kc, aU, Math.max(0, aU - sDiv - 50));
  // right of northbound = east. slot -1 (JT at 上野) -> -2 (beside 常磐線)
  const segE = offsetPath(resample(seg), (s) => (1 + ss(Math.min(1, s / 300))) * SPACING);
  const kk = Math.min(q.length - 1, k + Math.round(250 / STEP));
  const path = [P0, ...segE.slice(1, -8), ...hermite(segE[segE.length - 8], tangent(segE, segE.length - 8), q[kk], tangent(q, kk)), ...q.slice(kk)];
  const pr = resample(path);
  const uu = pr.map((pp) => { const n = nearest(q, pp); return u[Math.min(u.length - 1, n[0])]; });
  const r = { code: 'JU', ja: 'JR宇都宮線・高崎線', en: 'JR Utsunomiya / Takasaki Line', color: '#f68b1e', kind: 'el', loop: false, path: pr, ys: uu.map(v => kindY('el', v)), st: [] };
  const sts = stationsOn(l, pr), c = cum(pr);
  r.st = sts.map(s => ({ ja: s.ja, en: s.en, i: closestIdx(pr, at(pr, c, s.arc)) }));
  if (!r.st.length || r.st[0].ja !== '上野') r.st.unshift({ ja: '上野', en: 'Ueno', i: 0 });
  rails.push(r); touched.set(r, { r, ranges: [[0, pr.length - 1, uu]], isNew: true, fixedHead: Math.round((sDiv + 300) / STEP) });
  console.log('new JU', Math.round(c.at(-1)) + 'm', r.st.map(s => s.ja).join(' '));
}

// ---------- 相鉄・JR直通線 (JR side: from the 品鶴線 beyond 武蔵小杉 to 羽沢横浜国大)
{
  const l = mt('JR-East.SotetsuDirect'), js = R('JS');
  const clip = clipMT(l, stArc(l, '武蔵小杉'), l.c.at(-1));
  let [q, u] = resample(clip.p, STEP, clip.u);
  const jc = cum(js.path); let k = 0; const qc = cum(q);
  for (; k < q.length; k++) if (nearest(js.path, q[k], jc)[2] > 40 && qc[k] > 300) break;
  const nJ = nearest(js.path, q[k], jc);
  const back = Math.max(0, nJ[3] - 420), A = at(js.path, jc, back);
  const kk = Math.min(q.length - 1, k + Math.round(200 / STEP));
  const path = resample([[A.x, A.z], ...hermite([A.x, A.z], [A.dx, A.dz], q[kk], tangent(q, kk)), ...q.slice(kk)]);
  const uu = path.map((pp) => { const n = nearest(q, pp); return u[Math.min(u.length - 1, n[0])]; });
  const r = { code: 'SJ', ja: '相鉄・JR直通線', en: 'Sotetsu-JR Link Line', color: '#00b48d', kind: 'el', loop: false, path, ys: uu.map(v => kindY('el', v)), st: [] };
  const c = cum(path); r.st = stationsOn(l, path, new Set(['武蔵小杉'])).map(s => ({ ja: s.ja, en: s.en, i: closestIdx(path, at(path, c, s.arc)) }));
  r.conn = 0; rails.push(r); touched.set(r, { r, ranges: [[0, path.length - 1, uu]], isNew: true });
  console.log('new SJ', Math.round(c.at(-1)) + 'm', r.st.map(s => s.ja).join(' '));
}

// ---------- Shinkansen
const LLp = (pts) => pts.map(([lat, lng]) => toXZ(lng, lat));
{
  // 東海道新幹線: 東京 (八重洲側, slot -2 of the JK corridor) - 品川 - 品鶴線沿い - 新川崎 - 新横浜 - west edge
  const jk = R('JK'), jo = R('JO'), kc = cum(jk.path);
  const aT = nearest(jk.path, ptOf(jk, '東京'), kc)[3], aS = nearest(jk.path, ptOf(jk, '品川'), kc)[3];
  const seg1 = resample(subPath(jk.path, kc, aT - 300, aS + 900)); // JK runs north -> south
  // offsetPath offsets to the right of the direction of travel; southbound right = west. Tokyo: conventional lines | 東北新幹線 | 東海道新幹線 (八重洲側)
  const p1e = offsetPath(seg1, () => -3 * SPACING);
  // 品鶴線 (JO) from 品川 to 新川崎, beside it on the inland side
  const oc = cum(jo.path), oS = nearest(jo.path, ptOf(jo, '品川'), oc)[3], oK = nearest(jo.path, ptOf(jo, '新川崎'), oc)[3];
  const seg2 = resample(subPath(jo.path, oc, oS + 1800, oK + 700));
  const p2 = offsetPath(seg2, () => 1.5 * SPACING);
  const wp = LLp([[35.5520, 139.6655], [35.5400, 139.6500], [35.5270, 139.6380], [35.5150, 139.6270], [35.5075, 139.6172], [35.5000, 139.6000], [35.4920, 139.5800], [35.4840, 139.5600], [35.4770, 139.5380], [35.4720, 139.5150], [35.4680, 139.4900], [35.4640, 139.4650], [35.4600, 139.4400], [35.4560, 139.4100]]);
  let p3 = [p2[p2.length - 1], ...wp];
  p3 = resample(smoothPts(resample(p3, 40), 200, 40));
  const n1 = p1e.length;
  const join12 = hermite(p1e[n1 - 1], tangent(p1e, n1 - 1), p2[0], tangent(p2, 0));
  let path = [...p1e, ...join12, ...p2, ...hermite(p2[p2.length - 1], tangent(p2, p2.length - 1), p3[8], tangent(p3, 8), STEP, 1.2), ...p3.slice(9)];
  path = resample(path).filter(q => inB(q));
  const sh = smoothPts(path, 30);
  const r = { code: 'SK', ja: '東海道新幹線', en: 'Tokaido Shinkansen', color: '#1e50a2', kind: 'el', shin: 1, loop: false, path: sh, ys: sh.map(() => SHIN_BASE), st: [] };
  const c = cum(sh);
  for (const [ja, en, pt] of [['東京', 'Tokyo', ptOf(jk, '東京')], ['品川', 'Shinagawa', ptOf(jk, '品川')], ['新横浜', 'Shin-Yokohama', toXZ(139.6175, 35.5075)]]) r.st.push({ ja, en, i: closestIdx(sh, at(sh, c, nearest(sh, pt, c)[3])) });
  rails.push(r); touched.set(r, { r, ranges: [[0, sh.length - 1, sh.map(() => 0)]], isNew: true, shin: true });
  console.log('new SK', Math.round(c.at(-1)) + 'm');
}
{
  // 東北・上越・北陸新幹線: 東京 - (秋葉原の先で地下) - 上野(地下) - 日暮里で地上 - 京浜東北線の西側 - 赤羽 - 埼京線沿い - 大宮 - north edge
  const jk = R('JK'), ja = R('JA'), kc = cum(jk.path);
  const aT = nearest(jk.path, ptOf(jk, '東京'), kc)[3], aA = nearest(jk.path, ptOf(jk, '赤羽'), kc)[3];
  const seg1 = resample(subPath(jk.path, kc, aT + 250, aA)); // northbound: arc decreasing on JK
  const sNip = nearest(seg1, ptOf(jk, '日暮里'))[3], sAki = nearest(seg1, ptOf(jk, '秋葉原'))[3], sTab = nearest(seg1, ptOf(jk, '田端'))[3];
  // right of northbound = east. east side slot 2 (beside the Tokaido Shinkansen platforms) to 秋葉原, underground to 日暮里, then west side (slot -2, -1 after 田端)
  const offF = (s) => s < sAki ? 2 * SPACING : s < sNip ? (2 + (-2 - 2) * ss((s - sAki) / (sNip - sAki))) * SPACING : s < sTab + 200 ? -2 * SPACING : (-2 + ss(Math.min(1, (s - sTab - 200) / 400))) * SPACING;
  const p1 = offsetPath(seg1, offF);
  const under1 = seg1.map((q, i) => { const s = cum(seg1)[i]; return s > sAki + 350 && s < sNip + 250 ? 1 : 0; });
  // 埼京線 from 赤羽 to 大宮, Shinkansen on its east side
  const jc = cum(ja.path), jA = nearest(ja.path, ptOf(ja, '赤羽'), jc)[3], jO = nearest(ja.path, ptOf(ja, '大宮'), jc)[3];
  const seg2 = resample(subPath(ja.path, jc, jA + 900, jO + (jO > jA ? 400 : -400)));
  const p2 = offsetPath(seg2, () => 1 * SPACING); // 埼京線 northbound: right = east (between 埼京線 and 東北本線)
  // north of 大宮 along the 宇都宮線
  const l = mt('JR-East.Utsunomiya'), aO = stArc(l, '大宮');
  const north = resample(subPath(l.path, l.c, aO + 900, aO + 6000));
  const p3 = offsetPath(north, () => -1.5 * SPACING).filter(q => inB(q));
  const join12 = hermite(p1[p1.length - 1], tangent(p1, p1.length - 1), p2[0], tangent(p2, 0), STEP, 1.1);
  const join23 = hermite(p2[p2.length - 1], tangent(p2, p2.length - 1), p3[0], tangent(p3, 0), STEP, 1.1);
  let path = [...p1, ...join12, ...p2, ...join23, ...p3];
  const under = [...under1, ...join12.map(() => 0), ...p2.map(() => 0), ...join23.map(() => 0), ...p3.map(() => 0)];
  const pr = resample(path), sh = smoothPts(pr, 24);
  const uu = sh.map((q) => under[Math.min(under.length - 1, nearest(path, q)[0])]);
  const r = { code: 'SH', ja: '東北・上越・北陸新幹線', en: 'Tohoku / Joetsu / Hokuriku Shinkansen', color: '#00a95f', kind: 'el', shin: 1, loop: false, path: sh, ys: uu.map(v => v ? TUN : SHIN_BASE), st: [] };
  r.code = 'TH';
  const c = cum(sh);
  for (const [jan, en, pt] of [['東京', 'Tokyo', ptOf(jk, '東京')], ['上野', 'Ueno', ptOf(jk, '上野')], ['大宮', 'Omiya', ptOf(jk, '大宮')]]) r.st.push({ ja: jan, en, i: closestIdx(sh, at(sh, c, nearest(sh, pt, c)[3])) });
  rails.push(r); touched.set(r, { r, ranges: [[0, sh.length - 1, uu]], isNew: true, shin: true, under: uu });
  console.log('new TH', Math.round(c.at(-1)) + 'm');
}

// ---------- side-by-side corridors in the new parts
// points of new geometry that coincide (< 7 m, parallel) with another line's new geometry get spread to fixed slots
const PRI = ['SK', 'TH', 'JK', 'JY', 'JU', 'JT', 'JO', 'JS', 'JA', 'JC', 'JB', 'JJ', 'JL', 'JE', 'JM', 'JN', 'JH', 'SJ', 'KK', 'TY', 'MG', 'OH', 'OE', 'KO', 'IN', 'DT', 'OM', 'SO', 'SI', 'SS', 'TS', 'TD', 'TJ', 'KS', 'HS', 'TR', 'T', 'TX'];
const pri = (r) => { const k = PRI.indexOf(r.code); return (k < 0 ? 99 : k) * 100 + rails.indexOf(r) % 100; };
{
  const items = [];
  for (const t of touched.values()) { const r = t.r; if (r.kind !== 'el' || r.conn || r.shin || t.keepXY) continue; for (const [i0, i1, u] of t.ranges) for (let i = i0; i <= i1; i++) { if (u[i - i0]) continue; if (t.fixedHead && i < t.fixedHead) continue; items.push([r, i]); } }
  const G = 12, grid = new Map(), gk = (a, b) => a * 100003 + b;
  for (const it of items) { const q = it[0].path[it[1]]; const k = gk(Math.floor(q[0] / G), Math.floor(q[1] / G)); let A = grid.get(k); if (!A) grid.set(k, A = []); A.push(it); }
  const offs = new Map();
  for (const [r, i] of items) {
    const q = r.path[i], t = tangent(r.path, i), mem = new Map([[r, 1]]);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const A = grid.get(gk(Math.floor(q[0] / G) + a, Math.floor(q[1] / G) + b)); if (!A) continue; for (const [r2, j] of A) { if (r2 === r || mem.has(r2)) continue; const q2 = r2.path[j]; if (hyp(q2[0] - q[0], q2[1] - q[1]) > 7) continue; const t2 = tangent(r2.path, j), d = t[0] * t2[0] + t[1] * t2[1]; if (Math.abs(d) < 0.93) continue; mem.set(r2, Math.sign(d)); } }
    if (mem.size < 2) continue;
    const list = [...mem.keys()].sort((x, y) => pri(x) - pri(y)), lead = list[0], sgn = mem.get(lead) * 1;
    const k = list.indexOf(r), n = list.length;
    let o = (k - (n - 1) / 2) * SPACING; if (sgn < 0) o = -o; // relative to the lead's direction
    let m = offs.get(r); if (!m) offs.set(r, m = new Map()); m.set(i, o);
  }
  for (const [r, m] of offs) {
    const n = r.path.length, raw = new Float64Array(n), has = new Uint8Array(n);
    for (const [i, o] of m) { raw[i] = o; has[i] = 1; }
    // smooth (sigma 90 m) including zeros around, only over the new ranges
    const sig = 90 / STEP, Rr = Math.ceil(sig * 3), K = []; for (let k = -Rr; k <= Rr; k++) K.push(Math.exp(-(k * k) / (2 * sig * sig)));
    const t = touched.get(r);
    const sm = new Float64Array(n);
    for (const [i0, i1] of t.ranges) for (let i = i0; i <= i1; i++) { let s = 0, ws = 0; for (let k = -Rr; k <= Rr; k++) { const j = i + k; if (j < 0 || j >= n) continue; s += raw[j] * K[k + Rr]; ws += K[k + Rr]; } sm[i] = s / ws; }
    const P = r.path.map(q => q.slice());
    for (const [i0, i1] of t.ranges) for (let i = i0; i <= i1; i++) { if (Math.abs(sm[i]) < 0.05) continue; const tt = tangent(P, i); r.path[i] = [P[i][0] - tt[1] * sm[i], P[i][1] + tt[0] * sm[i]]; }
    console.log('  corridor', r.code, r.ja, m.size);
  }
}

// ---------- heights of the new geometry
{
  const N = W.nodes, K = 'XABLR';
  const GS = 64, grid = new Map(); const gk = (a, b) => a * 100003 + b;
  const addSeg = (s) => { for (let a = Math.floor(Math.min(s[0], s[2]) / GS); a <= Math.floor(Math.max(s[0], s[2]) / GS); a++) for (let b = Math.floor(Math.min(s[1], s[3]) / GS); b <= Math.floor(Math.max(s[1], s[3]) / GS); b++) { const k = gk(a, b); let A = grid.get(k); if (!A) grid.set(k, A = []); A.push(s); } };
  for (const e of W.edges) { const k = K[e[2]]; if (k !== 'X' && k !== 'R') continue; const pts = [N[e[0]].slice(0, 2), ...(e[4] || []), N[e[1]].slice(0, 2)]; const c = cum(pts), len = c[c.length - 1];
    for (let i = 0; i + 1 < pts.length; i++) { const ya = k === 'X' ? 12 : N[e[0]][2] + (N[e[1]][2] - N[e[0]][2]) * c[i] / len, yb = k === 'X' ? 12 : N[e[0]][2] + (N[e[1]][2] - N[e[0]][2]) * c[i + 1] / len; addSeg([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], Math.max(ya, yb), 'X']); } }
  const isNewPt = new Map(); for (const t of touched.values()) { const a = new Uint8Array(t.r.path.length); for (const [i0, i1] of t.ranges) for (let i = i0; i <= i1; i++) a[i] = 1; isNewPt.set(t.r, a); }
  // existing geometry (old parts) is a fixed obstacle
  for (const r of rails) { if (r.kind === 'sub') continue; const a = isNewPt.get(r); for (let i = 0; i + 1 < r.path.length; i++) { if (a && (a[i] || a[i + 1])) continue; addSeg([r.path[i][0], r.path[i][1], r.path[i + 1][0], r.path[i + 1][1], Math.max(r.ys[i], r.ys[i + 1]), 'L']); } }
  function inter(ax, az, bx, bz, cx, cz, dx, dz) { const r1 = bx - ax, r2 = bz - az, s1 = dx - cx, s2 = dz - cz, den = r1 * s2 - r2 * s1; if (Math.abs(den) < 1e-9) return null; const t = ((cx - ax) * s2 - (cz - az) * s1) / den, u = ((cx - ax) * r2 - (cz - az) * r1) / den; if (t < 0 || t > 1 || u < 0 || u > 1) return null; return [t, Math.abs(den) / (hyp(r1, r2) * hyp(s1, s2))]; }
  const order = [...touched.values()].sort((a, b) => pri(a.r) - pri(b.r));
  for (const t of order) {
    const r = t.r; if (r.kind === 'sub' || r.kind === 'tram') continue;
    const base = r.shin ? SHIN_BASE : r.kind === 'el' ? BASE : 10, p = r.path, n = p.length, c = cum(p), y = r.ys.slice(), nw = isNewPt.get(r);
    const under = new Uint8Array(n); for (const [i0, i1, u] of t.ranges) for (let i = i0; i <= i1; i++) under[i] = u[i - i0] ? 1 : 0;
    for (let i = 0; i < n; i++) if (nw[i]) y[i] = base;
    const cons = [];
    for (let i = 0; i + 1 < n; i++) {
      if (!nw[i] || under[i]) continue;
      const ax = p[i][0], az = p[i][1], bx = p[i + 1][0], bz = p[i + 1][1], seen = new Set();
      for (let a = Math.floor(Math.min(ax, bx) / GS); a <= Math.floor(Math.max(ax, bx) / GS); a++) for (let b = Math.floor(Math.min(az, bz) / GS); b <= Math.floor(Math.max(az, bz) / GS); b++) {
        const A = grid.get(gk(a, b)); if (!A) continue;
        for (const sg of A) { if (seen.has(sg) || sg[6] === r) continue; seen.add(sg); const h = inter(ax, az, bx, bz, sg[0], sg[1], sg[2], sg[3]); if (!h) continue; const [tt, sin] = h; if (sin < 0.12) continue;
          const s = c[i] + (c[i + 1] - c[i]) * tt; const need = sg[5] === 'X' ? (sg[4] > 2 ? sg[4] + OVER_X - 12 : 0) : (sg[4] > 1.5 ? sg[4] + OVER_RAIL : 0); if (need > base) cons.push([s, need]); }
      }
    }
    for (const [s, h] of cons) for (let i = 0; i < n; i++) { if (!nw[i]) continue; const d = Math.abs(c[i] - s), v = h - Math.max(0, d - 45) * GRADE; if (v > y[i]) y[i] = v; }
    for (const st of r.st) { if (!nw[st.i]) continue; const s0 = c[st.i]; let m = 0; for (let i = 0; i < n; i++) if (nw[i] && Math.abs(c[i] - s0) < (r.shin ? 220 : 95)) m = Math.max(m, y[i]); for (let i = 0; i < n; i++) if (nw[i] && Math.abs(c[i] - s0) < (r.shin ? 220 : 95)) y[i] = m; }
    // continuity with the old part: grade envelope over the whole line (raises only new points)
    for (let i = 1; i < n; i++) if (nw[i]) y[i] = Math.max(y[i], y[i - 1] - GRADE * (c[i] - c[i - 1]));
    for (let i = n - 2; i >= 0; i--) if (nw[i]) y[i] = Math.max(y[i], y[i + 1] - GRADE * (c[i + 1] - c[i]));
    if (under.some(v => v)) {
      const dist = new Float64Array(n).fill(1e9);
      for (let i = 0; i < n; i++) if (under[i] || (!nw[i] && r.ys[i] < 0)) dist[i] = 0;
      for (let i = 1; i < n; i++) dist[i] = Math.min(dist[i], dist[i - 1] + (c[i] - c[i - 1]));
      for (let i = n - 2; i >= 0; i--) dist[i] = Math.min(dist[i], dist[i + 1] + (c[i + 1] - c[i]));
      for (let i = 0; i < n; i++) if (nw[i]) { const v = TUN + dist[i] * 0.04; if (v < y[i]) y[i] = v; }
    }
    // the old part ending at a portal / grade: blend new points next to it so no step remains
    for (let i = 1; i < n; i++) if (nw[i] && !nw[i - 1]) { const d0 = r.ys[i - 1] - y[i]; for (let k = 0; i + k < n && nw[i + k] && k * STEP < 500; k++) y[i + k] += d0 * (1 - ss(k * STEP / 500)); }
    for (let i = n - 2; i >= 0; i--) if (nw[i] && !nw[i + 1]) { const d0 = r.ys[i + 1] - y[i]; for (let k = 0; i - k >= 0 && nw[i - k] && k * STEP < 500; k++) y[i - k] += d0 * (1 - ss(k * STEP / 500)); }
    r.ys = y.map(v => Math.round(v * 100) / 100);
    for (let i = 0; i + 1 < n; i++) if (nw[i]) addSeg([p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], Math.max(r.ys[i], r.ys[i + 1]), 'L', r]);
  }
}
// ---------- tidy: station order, rounding
for (const r of rails) {
  r.st.sort((a, b) => a.i - b.i);
  r.st = r.st.filter((s, k) => !k || s.ja !== r.st[k - 1].ja);
  r.path = r.path.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
}
W.rails = rails;
fs.writeFileSync(OUT, JSON.stringify(W));
console.log('rails', rails.length, 'wrote', OUT);
