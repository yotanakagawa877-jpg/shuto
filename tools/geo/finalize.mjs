// attaches the extended-map data to the world: mask (RLE), rivers, lakes, bounds, district names, old-area cells
import fs from 'fs';
const [,, IN, OUT] = process.argv;
const W = JSON.parse(fs.readFileSync(IN, 'utf8'));
const MK = JSON.parse(fs.readFileSync('data/ext_mask_rle.json', 'utf8'));
W.ext = W.ext || {};
W.ext.bounds = MK.bounds;
W.ext.mask = { X0: MK.X0, Z0: MK.Z0, W: MK.W, H: MK.H, cell: MK.cell, rle: MK.rle };
W.ext.rivers = MK.rivers; W.ext.lakes = MK.lakes;
// old-area cells (200 m) as packed numbers
W.ext.oldOcc = (W.ext.oldOcc || []).map(s => { const [a, b] = s.split(',').map(Number); return (a + 1000) * 4096 + (b + 1000); });
// area names in the new part: station towns (2+ lines first)
const occ = new Set(W.ext.oldOcc), isOld = (x, z) => occ.has((Math.floor(x / 200) + 1000) * 4096 + Math.floor(z / 200) + 1000);
const towns = new Map();
for (const r of W.rails) { if (r.conn) continue; for (const s of r.st) { const q = r.path[s.i]; const k = s.ja.replace(/[〈（(].*$/, ''); let t = towns.get(k); if (!t) towns.set(k, t = { ja: k, en: (s.en || k).replace(/\s*\(.*$/, '').toUpperCase(), x: 0, z: 0, n: 0 }); t.x += q[0]; t.z += q[1]; t.n++; } }
const d = [];
for (const t of towns.values()) { const x = t.x / t.n, z = t.z / t.n; if (isOld(x, z)) continue; d.push([t.ja, t.en, Math.round(x), Math.round(z), t.n]); }
W.ext.districts = d;
fs.writeFileSync(OUT, JSON.stringify(W));
console.log('ext districts', d.length, 'oldOcc', W.ext.oldOcc.length, 'size', (fs.statSync(OUT).size / 1e6).toFixed(1) + 'MB');
