// Street lattice of the extended map (copy of tools/geo/streets.mjs — keep the two in sync).
// Districts (Voronoi of seeds) with straight street grids; some lines are graph roads, the others are drawn by the game.
// background grid). Each district has its own straight street grid (angle, spacing). Some grid lines are real roads
// (in the road graph: traffic, buses, GPS); the others are drawn by the game only, together with procedural buildings.
export function hash2(x, z) { let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x, z) { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1); return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz; }
export const SPACING = [190, 128, 104, 88];
export const GRAPH_EVERY = [5, 4, 4, 4];
export function makeStreets(seeds) {
  // seeds: [x, z, angle, level 0..3, station 0|1, coreRadius]
  const S = seeds.map(([x, z, a, lv, st, core]) => ({ x, z, a, lv, st, core, s: SPACING[lv], c: Math.cos(a), n: Math.sin(a), w: st ? 1.25 + lv * 0.08 : 1 }));
  const G = 1500, grid = new Map();
  S.forEach((o, i) => { const k = Math.floor(o.x / G) * 65536 + Math.floor(o.z / G); let A = grid.get(k); if (!A) grid.set(k, A = []); A.push(i); });
  const near = (x, z, r = 1) => { const out = []; const cx = Math.floor(x / G), cz = Math.floor(z / G); for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const A = grid.get((cx + a) * 65536 + cz + b); if (A) for (const i of A) out.push(i); } return out; };
  // weighted distance with a wobbly border
  const wd = (o, x, z) => Math.hypot(x - o.x, z - o.z) / o.w + (vnoise(x / 170 + o.x * 0.001, z / 170) - 0.5) * 120;
  function owner2(x, z) { let b = -1, bd = 1e18, b2 = -1, bd2 = 1e18; for (const i of near(x, z, 2)) { const d = wd(S[i], x, z); if (d < bd) { b2 = b; bd2 = bd; b = i; bd = d; } else if (d < bd2) { b2 = i; bd2 = d; } } return [b, bd, b2, bd2]; }
  const owner = (x, z) => owner2(x, z)[0];
  // is (axis, k) of seed i a road of the graph? (every n-th line, all lines inside the station core)
  const isGraph = (i, axis, k, u, v) => { const o = S[i]; if (o.st && Math.abs(u) < o.core && Math.abs(v) < o.core) return true; return ((k % GRAPH_EVERY[o.lv]) + GRAPH_EVERY[o.lv]) % GRAPH_EVERY[o.lv] === 0; };
  // lattice lines of seed i crossing the rectangle; returns pieces [{i, axis, k, graph, pts}]
  function lines(i, x0, z0, x1, z1, opt = {}) {
    const o = S[i], out = [], step = opt.step || 16, ov = opt.overshoot ?? 0;
    const corners = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]];
    for (const axis of [0, 1]) {
      // axis 0: lines of constant u (running along V), axis 1: constant v
      const U = axis === 0 ? [o.c, o.n] : [-o.n, o.c], V = axis === 0 ? [-o.n, o.c] : [o.c, o.n];
      let umin = 1e18, umax = -1e18, vmin = 1e18, vmax = -1e18;
      for (const [x, z] of corners) { const u = (x - o.x) * U[0] + (z - o.z) * U[1], v = (x - o.x) * V[0] + (z - o.z) * V[1]; umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
      for (let k = Math.ceil(umin / o.s - 0.5); k <= Math.floor(umax / o.s - 0.5); k++) {
        const u = (k + 0.5) * o.s;
        let cur = null;
        const v0 = Math.ceil(vmin / step) * step;
        for (let v = v0; v <= vmax; v += step) {
          const x = o.x + U[0] * u + V[0] * v, z = o.z + U[1] * u + V[1] * v;
          let ok = x >= x0 - 1 && x <= x1 + 1 && z >= z0 - 1 && z <= z1 + 1;
          if (ok) { const [b, bd, , ] = owner2(x, z); ok = b === i || (ov > 0 && wd(o, x, z) - bd < ov); }
          if (ok && opt.keep) ok = opt.keep(x, z);
          if (ok && opt.want) { const g = isGraph(i, axis, k, u, v); ok = opt.want === 'graph' ? g : !g; }
          if (ok) { if (!cur) { cur = { i, axis, k, u, graph: opt.want === 'graph', pts: [] }; } cur.pts.push([x, z, v]); }
          else if (cur) { if (cur.pts.length > 1) out.push(cur); cur = null; }
        }
        if (cur && cur.pts.length > 1) out.push(cur);
      }
    }
    return out;
  }
  return { S, near, owner, owner2, lines, isGraph, wd };
}
