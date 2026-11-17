// Load municipal polygons (N03 via github.com/niiyz/JapanCityGeoJson) in game coordinates.
// export: loadMunis() -> [{code, name, pref, polys:[[ring[[x,z]]...]...]}], toXZ(lng,lat)
import fs from 'fs';
export const A9 = Math.cos(35.64 * Math.PI / 180) * 111320, R9 = 110950;
export const toXZ = (lng, lat) => [(lng - 139.755) * A9, -(lat - 35.64) * R9];
export const toLL = (x, z) => [x / A9 + 139.755, 35.64 - z / R9];
const ROOT = '/home/claude/ext/JapanCityGeoJson/geojson/';
export function loadMunis() {
  const out = [];
  for (const p of fs.readdirSync(ROOT)) for (const f of fs.readdirSync(ROOT + p)) {
    const g = JSON.parse(fs.readFileSync(ROOT + p + '/' + f));
    for (const ft of g.features) {
      const pr = ft.properties, c = ft.geometry.coordinates, polys = ft.geometry.type === 'Polygon' ? [c] : c;
      out.push({ code: pr.N03_007, pref: pr.N03_001, name: (pr.N03_003 || '') + (pr.N03_004 || ''), city: pr.N03_003 || pr.N03_004, ward: pr.N03_004,
        polys: polys.map(pl => pl.map(r => r.map(q => toXZ(q[0], q[1])))) });
    }
  }
  // 所属未定地 (reclaimed land in the bay without a municipality) from the simplified national set
  const S = '/home/claude/ext/japan-topography/data/municipality/geojson/s0010/';
  for (const p of ['12', '13']) {
    const g = JSON.parse(fs.readFileSync(S + 'N03-21_' + p + '_210101.json'));
    for (const ft of g.features) { if (ft.properties.N03_007) continue; const c = ft.geometry.coordinates, polys = ft.geometry.type === 'Polygon' ? [c] : c;
      out.push({ code: 'x' + p, pref: ft.properties.N03_001, name: '', polys: polys.map(pl => pl.map(r => r.map(q => toXZ(q[0], q[1])))) }); }
  }
  return out;
}
// shared boundary polylines between two municipalities (exactly matching vertices)
export function sharedEdges(munis) {
  const key = (q) => Math.round(q[0] * 10) + ',' + Math.round(q[1] * 10);
  const owner = new Map();
  munis.forEach((m, mi) => { for (const pl of m.polys) for (const r of pl) for (let i = 0; i + 1 < r.length; i++) { const a = key(r[i]), b = key(r[i + 1]), k = a < b ? a + '|' + b : b + '|' + a; let o = owner.get(k); if (!o) owner.set(k, o = { s: new Set(), p: [r[i], r[i + 1]] }); o.s.add(mi); } });
  const pairs = new Map();
  for (const [, o] of owner) { if (o.s.size !== 2) continue; const [a, b] = [...o.s].sort((x, y) => x - y), k = a + '-' + b; let L = pairs.get(k); if (!L) pairs.set(k, L = []); L.push(o.p); }
  return pairs; // "i-j" -> [[p,q],...]
}
export function chain(segs) { // join segments into polylines
  const key = (q) => Math.round(q[0] * 10) + ',' + Math.round(q[1] * 10);
  const adj = new Map(); segs.forEach((s, i) => { for (const e of [0, 1]) { const k = key(s[e]); let a = adj.get(k); if (!a) adj.set(k, a = []); a.push(i); } });
  const used = new Uint8Array(segs.length), lines = [];
  for (let i = 0; i < segs.length; i++) { if (used[i]) continue; used[i] = 1; let L = [segs[i][0], segs[i][1]];
    for (const dir of [1, 0]) { for (;;) { const end = dir ? L[L.length - 1] : L[0], k = key(end), nx = (adj.get(k) || []).find(j => !used[j]); if (nx === undefined) break; used[nx] = 1; const s = segs[nx], o = key(s[0]) === k ? s[1] : s[0]; if (dir) L.push(o); else L.unshift(o); } }
    lines.push(L); }
  return lines.sort((a, b) => b.length - a.length);
}
