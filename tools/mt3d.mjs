// Convert the Mini Tokyo 3D open railway dataset (github.com/nagix/mini-tokyo-3d, data/) into planar game coordinates.
// Output data/mt3d.json: { lines: { id: { ja, en, color, path:[[x,z]], under:[0|1], st:[{id, ja, en, x, z, i}] } } }
// Geometry: "main" sublines are taken as is, "sub" sublines follow the referenced railway (lateral offsets are dropped;
// the game lays parallel lines with its own track spacing). Altitude < 0 marks underground sections.
import fs from 'fs';
const MT = process.argv[2] || '/home/claude/ext/mini-tokyo-3d/data/';
const OUT = process.argv[3] || 'data/mt3d.json';
const A9 = Math.cos(35.64 * Math.PI / 180) * 111320, R9 = 110950;
const fe = (lng, lat) => [(lng - 139.755) * A9, -(lat - 35.64) * R9];
const C = JSON.parse(fs.readFileSync(MT + 'coordinates.json')).railways;
const RW = JSON.parse(fs.readFileSync(MT + 'railways.json'));
const ST = JSON.parse(fs.readFileSync(MT + 'stations.json'));
const stBy = new Map(ST.map(s => [s.id, s]));
const rwBy = new Map(RW.map(r => [r.id, r]));
const hyp = Math.hypot;
function nearest(path, p) { // [segment index, t, distance, arc]
  let best = [0, 0, 1e18], arc = 0, bestArc = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, L = Math.sqrt(l2);
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
    const d = hyp(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
    if (d < best[2]) { best = [i, t, d]; bestArc = arc + L * t; }
    arc += L;
  }
  return [...best, bestArc];
}
function cum(p) { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + hyp(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; }
function at(path, c, s) { s = Math.max(0, Math.min(c[c.length - 1], s)); let j = 0; while (j < c.length - 2 && c[j + 1] < s) j++; const t = (s - c[j]) / ((c[j + 1] - c[j]) || 1); return [path[j][0] + (path[j + 1][0] - path[j][0]) * t, path[j][1] + (path[j + 1][1] - path[j][1]) * t, j, t]; }
function slice(ref, p, q) { // part of ref polyline between the points nearest to p and q, in p->q order, with per-point "under"
  const c = cum(ref.path), a = nearest(ref.path, p)[3], b = nearest(ref.path, q)[3];
  const lo = Math.min(a, b), hi = Math.max(a, b), out = [], und = [];
  const A = at(ref.path, c, lo); out.push([A[0], A[1]]); und.push(ref.under[A[2]]);
  for (let i = 0; i < ref.path.length; i++) if (c[i] > lo + 0.5 && c[i] < hi - 0.5) { out.push(ref.path[i].slice()); und.push(ref.under[i]); }
  const B = at(ref.path, c, hi); out.push([B[0], B[1]]); und.push(ref.under[B[2]]);
  if (a > b) { out.reverse(); und.reverse(); }
  return [out, und];
}
const built = new Map();
let pending = C.slice(), guard = 0;
while (pending.length && guard++ < 20) {
  const next = [];
  for (const r of pending) {
    const deps = r.sublines.flatMap(s => [s.start && s.start.railway, s.end && s.end.railway]).filter(Boolean);
    if (r.sublines.some(s => (s.type === 'sub') && deps.some(d => d !== r.id && !built.has(d)))) { next.push(r); continue; }
    const path = [], under = [];
    r.sublines.forEach((s, k) => {
      const alt = s.altitude !== undefined ? s.altitude : (r.altitude || 0);
      let pts, und;
      const coords = s.coords.map(q => fe(q[0], q[1]));
      if (s.type === 'main' || s.type === 'hybrid' || !s.start || !s.start.railway) { pts = coords; und = coords.map(() => alt < 0 ? 1 : 0); }
      else {
        const ref = built.get(s.start.railway);
        if (!ref) { pts = coords; und = coords.map(() => alt < 0 ? 1 : 0); }
        else {[pts, und] = slice(ref, coords[0], coords[coords.length - 1]); if (s.altitude !== undefined || r.altitude !== undefined) und = und.map(() => alt < 0 ? 1 : 0); }
      }
      if (path.length && pts.length && hyp(path[path.length - 1][0] - pts[0][0], path[path.length - 1][1] - pts[0][1]) < 1) { pts = pts.slice(1); und = und.slice(1); }
      path.push(...pts); under.push(...und);
    });
    built.set(r.id, { path, under, loop: !!r.loop });
  }
  pending = next;
}
if (pending.length) console.log('unresolved', pending.map(r => r.id));
const lines = {};
for (const [id, g] of built) {
  if (id.startsWith('Base.')) continue;
  const rw = rwBy.get(id); if (!rw) continue;
  // drop duplicate points
  const P = [], U = [];
  g.path.forEach((q, i) => { if (!P.length || hyp(q[0] - P[P.length - 1][0], q[1] - P[P.length - 1][1]) > 0.3) { P.push(q); U.push(g.under[i]); } });
  const st = (rw.stations || []).map(sid => { const s = stBy.get(sid); if (!s || !s.coord) return null; const p = fe(s.coord[0], s.coord[1]); const n = nearest(P, p); return { id: sid, ja: s.title.ja, en: s.title.en, x: Math.round(p[0] * 10) / 10, z: Math.round(p[1] * 10) / 10, arc: n[3], d: Math.round(n[2]) }; }).filter(Boolean);
  lines[id] = { ja: rw.title.ja, en: rw.title.en, color: rw.color, loop: !!rw.loop, path: P.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]), under: U, st };
}
fs.writeFileSync(OUT, JSON.stringify({ lines }));
console.log('lines', Object.keys(lines).length);
for (const [id, l] of Object.entries(lines)) { const far = l.st.filter(s => s.d > 80); if (far.length) console.log('  far stations', id, far.map(s => s.ja + ':' + s.d).join(' ')); }
