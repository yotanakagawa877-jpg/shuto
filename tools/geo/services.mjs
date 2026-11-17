// v3.2 train services: resolves the catalog (tools/geo/catalog.mjs) against the built tracks.
//  - legs become [track index, s0, s1] (arc positions), stops are taken from the real stop pattern of the train type
//  - where a service changes track and the two tracks do not meet, a connecting track is laid (crossover / junction)
//  - every track without a local service of its own gets a default 各駅停車
// usage: node tools/geo/services.mjs in.json out.json
import fs from 'fs';
import { CATALOG, TYPE_COLOR } from './catalog.mjs';
const IN = process.argv[2], OUT = process.argv[3];
const W = JSON.parse(fs.readFileSync(IN, 'utf8'));
const MTD = '/home/claude/ext/mini-tokyo-3d/data/';
const hyp = Math.hypot, nm = (s) => s.normalize('NFKC').replace(/([\u4e00-\u9fff])ケ([\u4e00-\u9fff])/g, '$1ヶ$2').replace(/[〈（(].*$/, '');
const stTitle = new Map(JSON.parse(fs.readFileSync(MTD + 'stations.json')).map(s => [s.id, nm(s.title.ja)]));
const ttCache = new Map();
function timetable(rw) { if (ttCache.has(rw)) return ttCache.get(rw); const [op, line] = rw.split('.'); const f = MTD + 'train-timetables/' + op.toLowerCase().replace(/-/g, '') + '-' + line.toLowerCase() + '.json'; let t = []; try { t = JSON.parse(fs.readFileSync(f)); } catch { console.log('  ! no timetable', rw); } ttCache.set(rw, t); return t; }
function pattern(pairs) { const s = new Set(); for (const [rw, ty] of pairs) { let n = 0; for (const t of timetable(rw)) { if (t.y !== ty) continue; n++; for (const q of t.tt) { const name = stTitle.get(q.s); if (name) s.add(name); } } if (!n) console.log('  ! no trains', rw, ty); } return s; }
// ---------- geometry of tracks
const R = W.rails;
for (const r of R) { const c = [0]; for (let i = 1; i < r.path.length; i++) c.push(c[i - 1] + hyp(r.path[i][0] - r.path[i - 1][0], r.path[i][1] - r.path[i - 1][1])); r._c = c; r._len = c[c.length - 1]; }
const pos = (r, s) => { const c = r._c; s = Math.max(0, Math.min(r._len, s)); let lo = 0, hi = c.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= s) lo = m; else hi = m - 1; } const a = r.path[lo], b = r.path[lo + 1], t = (s - c[lo]) / ((c[lo + 1] - c[lo]) || 1), l = hyp(b[0] - a[0], b[1] - a[1]) || 1; return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l, y: r.ys[lo] + (r.ys[lo + 1] - r.ys[lo]) * t }; };
const nearestS = (r, x, z) => { let best = 0, bd = 1e18; for (let i = 0; i + 1 < r.path.length; i++) { const a = r.path[i], b = r.path[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz; let t = l2 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t)); const d = hyp(a[0] + dx * t - x, a[1] + dz * t - z); if (d < bd) { bd = d; best = r._c[i] + (r._c[i + 1] - r._c[i]) * t; } } return [best, bd]; };
const findTrack = (key) => { const [code, ja] = key.split(':'); const c = R.filter(r => r.code === code && (!ja || r.ja === ja)); if (!c.length) throw new Error('no track ' + key); return R.indexOf(c[0]); };
const stS = (ri, name) => { const r = R[ri]; const s = r.st.find(q => nm(q.ja) === nm(name)); if (!s) return null; return r._c[s.i]; };
// ---------- connectors
const conns = new Map();
function connector(ra, sa, da, rb, sb, db) {
  const A = R[ra], Bt = R[rb];
  const pa = pos(A, sa), pb = pos(Bt, sb);
  const ta = [pa.dx * da, pa.dz * da], tb = [pb.dx * db, pb.dz * db];
  const key = [ra, Math.round(sa / 5), rb, Math.round(sb / 5)].join(',');
  const key2 = [rb, Math.round(sb / 5), ra, Math.round(sa / 5)].join(',');
  if (conns.has(key)) return { ri: conns.get(key), rev: false };
  if (conns.has(key2)) return { ri: conns.get(key2), rev: true };
  const d = hyp(pb.x - pa.x, pb.z - pa.z), k = d, n = Math.max(4, Math.round(d / 6)), path = [], ys = [];
  for (let j = 0; j <= n; j++) { const t = j / n, h1 = 2 * t ** 3 - 3 * t * t + 1, h2 = -2 * t ** 3 + 3 * t * t, h3 = t ** 3 - 2 * t * t + t, h4 = t ** 3 - t * t; path.push([Math.round((h1 * pa.x + h2 * pb.x + (h3 * ta[0] + h4 * tb[0]) * k) * 10) / 10, Math.round((h1 * pa.z + h2 * pb.z + (h3 * ta[1] + h4 * tb[1]) * k) * 10) / 10]); const e = t * t * (3 - 2 * t); ys.push(Math.round((pa.y + (pb.y - pa.y) * e) * 100) / 100); }
  const kind = (A.kind === 'sub' || Bt.kind === 'sub') ? 'sub' : 'el';
  const r = { code: 'x', ja: A.ja + '→' + Bt.ja, en: 'connection', color: A.color, kind, loop: false, path, ys, st: [], conn: 1 };
  const c = [0]; for (let i = 1; i < path.length; i++) c.push(c[i - 1] + hyp(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])); r._c = c; r._len = c[c.length - 1];
  R.push(r); conns.set(key, R.length - 1);
  return { ri: R.length - 1, rev: false };
}
// ---------- resolve a catalog entry
function resolve(sv) {
  const legs = []; // {ri, s0, s1, stopFirst}
  let prev = null;
  for (let li = 0; li < sv.legs.length; li++) {
    const [key, from, to] = sv.legs[li]; const ri = findTrack(key), r = R[ri];
    let s0, s1;
    if (from === '@join') { const pe = pos(R[prev.ri], prev.s1); [s0] = nearestS(r, pe.x, pe.z); }
    else if (from) { s0 = stS(ri, from); if (s0 === null) throw new Error(sv.k + ': no station ' + from + ' on ' + r.ja); }
    if (to) { s1 = stS(ri, to); if (s1 === null) throw new Error(sv.k + ': no station ' + to + ' on ' + r.ja); }
    if (s0 === undefined && s1 === undefined) { if (prev) { const pe = pos(R[prev.ri], prev.s1); const d0 = hyp(pos(r, 0).x - pe.x, pos(r, 0).z - pe.z), d1 = hyp(pos(r, r._len).x - pe.x, pos(r, r._len).z - pe.z); [s0, s1] = d0 <= d1 ? [0, r._len] : [r._len, 0]; } else { s0 = 0; s1 = r._len; } }
    else if (s0 === undefined) { // start at the far end (or where the previous leg left off)
      if (prev) { const pe = pos(R[prev.ri], prev.s1); [s0] = nearestS(r, pe.x, pe.z); } else s0 = s1 > r._len / 2 ? 0 : r._len; }
    else if (s1 === undefined) { // run to the end in the direction away from where we came from
      if (prev) { const pp = pos(R[prev.ri], prev.s0); const a = pos(r, Math.max(0, s0 - 50)), b = pos(r, Math.min(r._len, s0 + 50)); s1 = hyp(b.x - pp.x, b.z - pp.z) > hyp(a.x - pp.x, a.z - pp.z) ? r._len : 0; }
      else s1 = s0 > r._len / 2 ? 0 : r._len; }
    const leg = { ri, s0, s1, d: Math.sign(s1 - s0) || 1 };
    if (prev) {
      const pa = pos(R[prev.ri], prev.s1), pb = pos(r, leg.s0), gap = hyp(pa.x - pb.x, pa.z - pb.z);
      if (gap > 4) {
        const A = R[prev.ri], da = prev.d, room = da > 0 ? A._len - prev.s1 : prev.s1;
        const clearA = Math.min(Math.max(0, room - 3), 140);
        const sa = prev.s1 + da * clearA;
        const along = clearA + Math.max(140, Math.min(420, gap * 7));
        const roomB = leg.d > 0 ? r._len - leg.s0 : leg.s0;
        const sb = leg.s0 + leg.d * Math.min(along, roomB * 0.6);
        const cn = connector(prev.ri, sa, da, ri, sb, leg.d);
        prev.s1 = sa; prev.cutStop = true;
        const L = R[cn.ri]._len;
        legs.push({ ri: cn.ri, s0: cn.rev ? L : 0, s1: cn.rev ? 0 : L, d: cn.rev ? -1 : 1, conn: true });
        leg.s0 = sb; leg.skipFirst = true;
      }
    }
    legs.push(leg); prev = leg;
  }
  // stops
  const pat = sv.pat ? pattern(sv.pat) : null; if (pat && sv.plus) for (const p of sv.plus) pat.add(p);
  const stops = [];
  legs.forEach((lg, li) => {
    const r = R[lg.ri]; if (lg.conn) return;
    const lo = Math.min(lg.s0, lg.s1) - 1, hi = Math.max(lg.s0, lg.s1) + 1;
    const list = r.st.map((s, si) => ({ si, s: r._c[s.i], name: nm(s.ja) })).filter(o => o.s >= lo && o.s <= hi).sort((a, b) => (a.s - b.s) * lg.d);
    for (const o of list) {
      if (pat && !pat.has(o.name)) continue;
      if (stops.length && stops[stops.length - 1].name === o.name) continue; // junction station counted once
      if (lg.skipFirst && Math.abs(o.s - lg.s0) < 400 && stops.length && R[legs[stops[stops.length - 1].li].ri].st.length && stops.some(q => q.name === o.name)) continue;
      stops.push({ li, si: o.si, name: o.name });
    }
  });
  return { legs, stops };
}
// ---------- build
const out = [];
const covered = new Set();
for (const sv of CATALOG) {
  let res; try { res = resolve(sv); } catch (e) { console.log('  ! skip', sv.k, e.message); continue; }
  if (res.stops.length < 2) { console.log('  ! too few stops', sv.k); continue; }
  for (const lg of res.legs) if (!R[lg.ri].conn && /各駅停車|普通/.test(sv.type) && res.legs.length === 1) covered.add(lg.ri);
  const len = res.legs.reduce((a, l) => a + Math.abs(l.s1 - l.s0), 0);
  out.push({ k: sv.k, line: sv.line, type: sv.type, tc: TYPE_COLOR[sv.type] || '#5a6270', names: sv.names || null, model: sv.model || 'c', cars: sv.cars || 8, n: sv.n || 2, vm: sv.vm || 1, dest: sv.dest || null, alt: sv.alt || null,
    legs: res.legs.map(l => [l.ri, Math.round(l.s0 * 10) / 10, Math.round(l.s1 * 10) / 10]), stops: res.stops.map(s => [s.li, s.si]) });
  console.log(sv.k.padEnd(18), sv.type.padEnd(6), (Math.round(len / 100) / 10 + 'km').padEnd(8), res.legs.length + ' legs', res.stops.length + '駅', res.stops.slice(0, 4).map(s => s.name).join(' '), '…', res.stops.slice(-2).map(s => s.name).join(' '));
}
// default local services
for (let ri = 0; ri < R.length; ri++) {
  const r = R[ri]; if (r.conn || r.shin || covered.has(ri) || r.st.length < 2) continue;
  const len = r._len, n = Math.max(1, Math.min(8, Math.round(len / 3500)));
  const type = /JR/.test(r.ja) || r.kind === 'sub' ? '各駅停車' : '普通';
  out.push({ k: 'def' + ri, line: r.ja.replace(/\(.*\)$/, ''), type, tc: TYPE_COLOR[type], names: null, model: 'c', cars: r.kind === 'tram' ? 1 : r.kind === 'ats' ? 6 : r.kind === 'mono' ? 6 : len < 4000 ? 4 : 8, n: r.loop ? Math.max(6, Math.round(len / 2800)) : n, vm: 1, dest: null, alt: null, loop: r.loop ? 1 : 0,
    legs: [[ri, 0, Math.round(len * 10) / 10]], stops: r.st.map((s, si) => [0, si]) });
}
for (const r of R) { delete r._c; delete r._len; }
W.svc = out;
console.log('services', out.length, 'connectors', conns.size, 'trains', out.reduce((a, s) => a + s.n, 0));
fs.writeFileSync(OUT, JSON.stringify(W));
