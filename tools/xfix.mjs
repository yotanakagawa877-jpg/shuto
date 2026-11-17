// Expressway geometry clean-up for data/world.json
//  - removes V-shaped spikes / zig-zags inside expressway & ramp polylines and smooths them
//  - at junctions (JCT) and where ramps leave the main line, the joining road now merges tangentially
//    (a gentle Y) instead of meeting the deck at a hard angle
// usage: node tools/xfix.mjs [in] [out]
import fs from 'fs';
const IN = process.argv[2] || 'data/world.json', OUT = process.argv[3] || IN;
const W = JSON.parse(fs.readFileSync(IN, 'utf8'));
const N = W.nodes, E = W.edges, X = 0, R = 4;
const hyp = Math.hypot;
const ptsOf = (e) => [N[e[0]].slice(0, 2), ...(e[4] || []), N[e[1]].slice(0, 2)];
const setPts = (e, p) => { e[4] = p.slice(1, -1).map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]); };
function cum(p) { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + hyp(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; }
function resample(p, step) { const c = cum(p), L = c[c.length - 1], n = Math.max(2, Math.round(L / step)), out = []; let j = 0; for (let k = 0; k <= n; k++) { const s = L * k / n; while (j < c.length - 2 && c[j + 1] < s) j++; const t = (s - c[j]) / ((c[j + 1] - c[j]) || 1); out.push([p[j][0] + (p[j + 1][0] - p[j][0]) * t, p[j][1] + (p[j + 1][1] - p[j][1]) * t]); } return out; }
function smoothFixed(p, sigmaPts, it = 1) { let q = p.map(a => a.slice()); const n = q.length, Rr = Math.ceil(sigmaPts * 3);
  for (let k = 0; k < it; k++) { const o = q.map(a => a.slice()); for (let i = 1; i < n - 1; i++) { let x = 0, z = 0, w = 0; for (let j = -Rr; j <= Rr; j++) { const m = i + j; if (m < 0 || m >= n) continue; const ww = Math.exp(-(j * j) / (2 * sigmaPts * sigmaPts)); x += q[m][0] * ww; z += q[m][1] * ww; w += ww; } const f = Math.min(1, Math.min(i, n - 1 - i) / (Rr + 1)); o[i] = [q[i][0] + (x / w - q[i][0]) * f, q[i][1] + (z / w - q[i][1]) * f]; } q = o; }
  return q; }
const ang = (a, b, c) => { const ux = a[0] - b[0], uz = a[1] - b[1], vx = c[0] - b[0], vz = c[1] - b[1]; return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / ((hyp(ux, uz) * hyp(vx, vz)) || 1)))) * 180 / Math.PI; };
let spikes = 0, merged = 0, smoothed = 0;
// 1) spikes and smoothing
for (const e of E) {
  if (e[2] !== X && e[2] !== R) continue;
  let p = ptsOf(e);
  // drop vertices that make a hairpin (< 100°) unless they are the end points
  let changed = true;
  while (changed && p.length > 2) { changed = false; for (let i = 1; i < p.length - 1; i++) if (ang(p[i - 1], p[i], p[i + 1]) < 100) { p.splice(i, 1); spikes++; changed = true; break; } }
  const L = cum(p).at(-1); if (L < 12) { setPts(e, p); continue; }
  const step = e[2] === X ? 8 : 6;
  p = smoothFixed(resample(p, step), e[2] === X ? 3 : 2, 2); smoothed++;
  setPts(e, p);
}
// 2) tangential merges at junction nodes
const adj = new Map();
E.forEach((e, i) => { if (e[2] !== X && e[2] !== R) return; for (const n of [e[0], e[1]]) { if (!adj.has(n)) adj.set(n, []); adj.get(n).push(i); } });
const outDir = (e, n) => { const p = ptsOf(e), q = e[0] === n ? p : p.slice().reverse(); let k = 1; while (k < q.length - 1 && hyp(q[k][0] - q[0][0], q[k][1] - q[0][1]) < 25) k++; const dx = q[k][0] - q[0][0], dz = q[k][1] - q[0][1], l = hyp(dx, dz) || 1; return [dx / l, dz / l]; };
for (const [n, list] of adj) {
  if (list.length < 3) continue;
  const legs = list.map(i => ({ i, e: E[i], d: outDir(E[i], n) }));
  // the straightest pair is the through route
  let best = null, bd = 2;
  for (let a = 0; a < legs.length; a++) for (let b = a + 1; b < legs.length; b++) { if (legs[a].e[2] !== X || legs[b].e[2] !== X) continue; const dot = legs[a].d[0] * legs[b].d[0] + legs[a].d[1] * legs[b].d[1]; if (dot < bd) { bd = dot; best = [legs[a], legs[b]]; } }
  if (!best || bd > -0.7) continue; // no clear through route (e.g. a 4-way crossing): leave it
  for (const g of legs) {
    if (best.includes(g)) continue;
    // merge onto the through leg that points the same way, offset 10° to the branch's side
    const t = best.map(b => [b, b.d[0] * g.d[0] + b.d[1] * g.d[1]]).sort((a, b) => b[1] - a[1])[0][0];
    if (t.d[0] * g.d[0] + t.d[1] * g.d[1] > 0.985) continue; // already tangential
    const side = Math.sign(t.d[0] * g.d[1] - t.d[1] * g.d[0]) || 1, a = side * 10 * Math.PI / 180;
    const td = [t.d[0] * Math.cos(a) - t.d[1] * Math.sin(a), t.d[0] * Math.sin(a) + t.d[1] * Math.cos(a)];
    let p = ptsOf(g.e); const rev = g.e[0] !== n; if (rev) p.reverse();
    p = resample(p, 4); const c = cum(p), L = c.at(-1), Lb = Math.min(g.e[2] === R ? 140 : 240, L * 0.6);
    let j = c.findIndex(v => v >= Lb); if (j < 2) continue;
    const P0 = p[0], Q = p[j], tq = [(p[Math.min(p.length - 1, j + 2)][0] - p[Math.max(0, j - 2)][0]), (p[Math.min(p.length - 1, j + 2)][1] - p[Math.max(0, j - 2)][1])], lq = hyp(tq[0], tq[1]) || 1;
    const k = hyp(Q[0] - P0[0], Q[1] - P0[1]) * 1.1, out = [P0];
    for (let m = 1; m < j; m++) { const s = m / j, h1 = 2 * s ** 3 - 3 * s * s + 1, h2 = -2 * s ** 3 + 3 * s * s, h3 = s ** 3 - 2 * s * s + s, h4 = s ** 3 - s * s;
      out.push([h1 * P0[0] + h2 * Q[0] + (h3 * td[0] + h4 * tq[0] / lq) * k, h1 * P0[1] + h2 * Q[1] + (h3 * td[1] + h4 * tq[1] / lq) * k]); }
    p = [...out, ...p.slice(j)];
    if (rev) p.reverse();
    setPts(g.e, resample(p, g.e[2] === X ? 8 : 6)); merged++;
  }
}
fs.writeFileSync(OUT, JSON.stringify(W));
console.log({ spikes, smoothed, merged });
