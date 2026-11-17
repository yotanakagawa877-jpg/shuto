// Coarse land/water mask for the extended map (v3.2).
// Land: union of municipal polygons (N03). Water: sea, big rivers (Tama/Edo/Tone from municipal boundaries, Ara/Tsurumi
// from way points), lakes. Riverbanks become park, hills get forest patches, the far shore of Tokyo Bay is forest.
// Mask values follow the game: 0 water, 1 land, 2 park, 4 forest.
import { toXZ, sharedEdges, chain } from './munis.mjs';
export const CELL = 16;
export const BOUNDS = { lat0: 35.30, lat1: 35.93, lng0: 139.43, lng1: 140.07 };
export function boundsXZ() { const [x0, z0] = toXZ(BOUNDS.lng0, BOUNDS.lat1), [x1, z1] = toXZ(BOUNDS.lng1, BOUNDS.lat0); return { x0, z0, x1, z1 }; }
const hyp = Math.hypot;
function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return hyp(px - ax - dx * t, pz - az - dz * t); }
// smooth value noise
function hash(x, z) { let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x, z) { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz; }
export function fbm(x, z) { return vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 7, z * 2.1 + 3) * 0.3 + vnoise(x * 4.3 + 1, z * 4.3 + 9) * 0.15; }

const LL = (pts) => pts.map(([lat, lng]) => toXZ(lng, lat));
// rivers given by way points (lat, lng)
export const RIVER_WP = [
  { n: '荒川', e: 'ARAKAWA RIVER', w: 150, bank: 560, P: LL([[35.7440, 139.8190], [35.7520, 139.8120], [35.7600, 139.8030], [35.7650, 139.7865], [35.7715, 139.7730], [35.7790, 139.7585], [35.7848, 139.7405], [35.7855, 139.7232], [35.7885, 139.7080], [35.7930, 139.6935], [35.7972, 139.6820], [35.8035, 139.6640], [35.8105, 139.6480], [35.8225, 139.6345], [35.8395, 139.6240], [35.8600, 139.6125], [35.8815, 139.5965], [35.9040, 139.5765], [35.9400, 139.5560]]) },
  { n: '鶴見川', e: 'TSURUMI RIVER', w: 55, bank: 150, P: LL([[35.5040, 139.6010], [35.5100, 139.6070], [35.5185, 139.6100], [35.5270, 139.6160], [35.5330, 139.6290], [35.5385, 139.6390], [35.5340, 139.6530], [35.5250, 139.6650]]) },
  { n: '鶴見川', e: 'TSURUMI RIVER', w: 40, bank: 110, P: LL([[35.5040, 139.6010], [35.5105, 139.5850], [35.5140, 139.5660], [35.5160, 139.5480], [35.5290, 139.5350], [35.5450, 139.5250], [35.5600, 139.5150], [35.5760, 139.4980]]) },
  { n: '中川', e: 'NAKAGAWA RIVER', w: 70, bank: 140, P: LL([[35.7480, 139.8480], [35.7630, 139.8460], [35.7800, 139.8420], [35.7980, 139.8370], [35.8150, 139.8360], [35.8350, 139.8400], [35.8600, 139.8450], [35.8900, 139.8500], [35.9350, 139.8530]]) },
  { n: '綾瀬川', e: 'AYASE RIVER', w: 35, bank: 60, P: LL([[35.7580, 139.8260], [35.7750, 139.8200], [35.7950, 139.8130], [35.8150, 139.8060], [35.8400, 139.7900], [35.8650, 139.7800], [35.8900, 139.7600], [35.9350, 139.7400]]) },
];
// lakes (lat, lng polygons)
export const LAKES = [
  { n: '手賀沼', e: 'TEGANUMA', P: LL([[35.8640, 139.9640], [35.8680, 139.9800], [35.8640, 139.9980], [35.8600, 140.0200], [35.8560, 140.0400], [35.8520, 140.0700], [35.8470, 140.0700], [35.8510, 140.0400], [35.8550, 140.0180], [35.8580, 139.9950], [35.8600, 139.9780]]) },
];
// hills with forest patches: [lat0, lng0, lat1, lng1, density]
const HILLS = [[35.555, 139.430, 35.635, 139.530, 0.55], [35.330, 139.540, 35.405, 139.650, 0.62], [35.300, 139.520, 35.345, 139.600, 0.66], [35.300, 139.600, 35.335, 139.660, 0.6], [35.640, 139.430, 35.700, 139.470, 0.4], [35.505, 139.440, 35.555, 139.500, 0.45], [35.840, 139.880, 35.930, 140.070, 0.35], [35.70, 139.92, 35.80, 140.07, 0.3]];
// parks: [lat, lng, radius m, kind]
const PARKS = [[35.7158, 139.5180, 520, 2], [35.6830, 139.5250, 450, 2], [35.6880, 139.5000, 330, 2], [35.9140, 139.6380, 400, 2], [35.7880, 139.7640, 420, 2], [35.7860, 139.8660, 520, 2], [35.6450, 140.0340, 600, 2], [35.5560, 139.4900, 450, 4], [35.3650, 139.6030, 900, 4], [35.5105, 139.6070, 260, 2], [35.3290, 139.5600, 330, 4], [35.6650, 139.4800, 380, 2], [35.8600, 139.6600, 700, 2], [35.8750, 139.6750, 800, 2], [35.8950, 139.6900, 700, 2]];
// far shore of Tokyo Bay / Boso: scenery only
const FAR = new Set(['12206', '12219', '12225', '12226', '12229', '12101']);

// station positions from the current world (rails rebuilt from Mini Tokyo 3D)
import fs from 'fs';
function stationsXZ() {
  try { const W = JSON.parse(fs.readFileSync('data/world.json')); const out = []; for (const r of W.rails) for (const st of r.st) out.push(r.path[st.i]); return out; } catch (e) { return []; }
}
export function buildMask(munis) {
  const B = boundsXZ(), M = 1200;
  const X0 = Math.floor((B.x0 - M) / CELL) * CELL, Z0 = Math.floor((B.z0 - M) / CELL) * CELL;
  const W = Math.ceil((B.x1 + M - X0) / CELL), H = Math.ceil((B.z1 + M - Z0) / CELL);
  const m = new Uint8Array(W * H);
  const fill = (ring, v) => { let lo = 1e9, hi = -1e9; for (const q of ring) { lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]); }
    const xs = []; for (let r = Math.max(0, Math.floor((lo - Z0) / CELL)); r <= Math.min(H - 1, Math.ceil((hi - Z0) / CELL)); r++) { const z = Z0 + (r + 0.5) * CELL; xs.length = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
      xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) { const c0 = Math.max(0, Math.ceil((xs[k] - X0) / CELL - 0.5)), c1 = Math.min(W - 1, Math.floor((xs[k + 1] - X0) / CELL - 0.5)); for (let c = c0; c <= c1; c++) m[r * W + c] = v; } } };
  // land (holes = water inside a municipality are rare; ignored), later polygons win
  for (const mu of munis) for (const pl of mu.polys) for (const ring of pl) fill(ring, FAR.has(mu.code) ? 4 : 1); // holes are other municipalities (enclaves), not water
  // hills (station towns stay built up: no forest within ~800 m of a station)
  const STG = new Map(), stKey = (x, z) => Math.floor(x / 1000) * 100000 + Math.floor(z / 1000);
  for (const [x, z] of stationsXZ()) { const k = stKey(x, z); STG.has(k) || STG.set(k, []); STG.get(k).push([x, z]); }
  const nearStation = (x, z, R0) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const [sx, sz] of STG.get(stKey(x + a * 1000, z + b * 1000)) || []) if (hyp(sx - x, sz - z) < R0) return true; return false; };
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const i = r * W + c; if (m[i] !== 1) continue; const x = X0 + (c + 0.5) * CELL, z = Z0 + (r + 0.5) * CELL;
    if (nearStation(x, z, 650 + 300 * vnoise(x / 400, z / 400))) continue;
    for (const [la0, lo0, la1, lo1, d] of HILLS) { const [ax, az] = toXZ(lo0, la1), [bx, bz] = toXZ(lo1, la0); if (x < ax || x > bx || z < az || z > bz) continue; const edge = Math.min(x - ax, bx - x, z - az, bz - z), fe = Math.min(1, edge / 900);
      if (fbm(x / 700, z / 700) > 1 - d * 0.75 * fe) m[i] = 4; } }
  for (const [lat, lng, rad, k] of PARKS) { const [px, pz] = toXZ(lng, lat); stamp(px, pz, rad, (i) => { if (m[i]) m[i] = k; }); }
  function stamp(px, pz, rad, f) { for (let r = Math.max(0, Math.floor((pz - rad - Z0) / CELL)); r <= Math.min(H - 1, Math.ceil((pz + rad - Z0) / CELL)); r++) for (let c = Math.max(0, Math.floor((px - rad - X0) / CELL)); c <= Math.min(W - 1, Math.ceil((px + rad - X0) / CELL)); c++) { const x = X0 + (c + 0.5) * CELL, z = Z0 + (r + 0.5) * CELL; if (hyp(x - px, z - pz) < rad * (0.85 + 0.3 * vnoise(x / 90, z / 90))) f(r * W + c); } }
  const line = (P, half, f) => { for (let k = 0; k + 1 < P.length; k++) { const [ax, az] = P[k], [bx, bz] = P[k + 1];
    for (let r = Math.max(0, Math.floor((Math.min(az, bz) - half - Z0) / CELL)); r <= Math.min(H - 1, Math.ceil((Math.max(az, bz) + half - Z0) / CELL)); r++)
      for (let c = Math.max(0, Math.floor((Math.min(ax, bx) - half - X0) / CELL)); c <= Math.min(W - 1, Math.ceil((Math.max(ax, bx) + half - X0) / CELL)); c++) { const x = X0 + (c + 0.5) * CELL, z = Z0 + (r + 0.5) * CELL; if (segDist(x, z, ax, az, bx, bz) < half) f(r * W + c); } } };
  // rivers from municipal boundaries
  const rivers = [];
  const pairs = sharedEdges(munis), byCode = new Map(munis.map((u, i) => [u.code, i]));
  const RIV = [
    { n: '多摩川', e: 'TAMA RIVER', w: 110, bank: 420, pairs: [['13111', '14131'], ['13111', '14132'], ['13111', '14133'], ['13112', '14133'], ['13112', '14134'], ['13112', '14135'], ['13219', '14135'], ['13208', '14135'], ['13208', '13225'], ['13206', '13225'], ['13206', '13224'], ['13206', '13212'], ['13215', '13212'], ['13202', '13212']] },
    { n: '江戸川', e: 'EDOGAWA RIVER', w: 120, bank: 360, pairs: [['13123', '12203'], ['13122', '12203'], ['13122', '12207'], ['11237', '12207'], ['11237', '12220'], ['11243', '12220'], ['11243', '12208'], ['11465', '12208']] },
    { n: '旧江戸川', e: 'OLD EDOGAWA', w: 90, bank: 120, pairs: [['13123', '12227']] },
    { n: '利根川', e: 'TONE RIVER', w: 260, bank: 700, pairs: [['08217', '12222'], ['08564', '12222'], ['08224', '12217'], ['08217', '12217']] },
  ];
  for (const R of RIV) { const segs = []; for (const [a, b] of R.pairs) { const ia = byCode.get(a), ib = byCode.get(b); if (ia === undefined || ib === undefined) continue; const k = Math.min(ia, ib) + '-' + Math.max(ia, ib); for (const s of pairs.get(k) || []) segs.push(s); }
    for (const L of chain(segs)) { if (L.length < 3) continue; rivers.push({ n: R.n, e: R.e, w: R.w, bank: R.bank, P: L }); } }
  for (const R of RIVER_WP) rivers.push(R);
  for (const R of rivers) line(R.P, R.bank / 2, (i) => { if (m[i] === 1 || m[i] === 4) m[i] = 2; });
  for (const R of rivers) line(R.P, R.w / 2, (i) => { m[i] = 0; });
  for (const L of LAKES) fill(L.P, 0);
  return { X0, Z0, W, H, cell: CELL, m, rivers: rivers.map(r => ({ n: r.n, e: r.e, w: r.w, P: r.P.map(q => [Math.round(q[0]), Math.round(q[1])]) })), lakes: LAKES.map(l => ({ n: l.n, e: l.e, P: l.P.map(q => [Math.round(q[0]), Math.round(q[1])]) })) };
}
// row run-length encoding -> base64 (pairs of [value, run] as varints)
export function rle(mask) {
  const out = [];
  const vi = (v) => { while (v >= 128) { out.push((v & 127) | 128); v >>>= 7; } out.push(v); };
  for (let r = 0; r < mask.H; r++) { let c = 0; while (c < mask.W) { const v = mask.m[r * mask.W + c]; let k = c + 1; while (k < mask.W && mask.m[r * mask.W + k] === v) k++; vi(v); vi(k - c); c = k; } }
  return Buffer.from(Uint8Array.from(out)).toString('base64');
}
