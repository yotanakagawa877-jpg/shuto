import fs from 'fs';
import { loadMunis } from '../geo/munis.mjs';
import { buildMask, rle } from '../geo/mask.mjs';
const t0 = Date.now();
const mk = buildMask(loadMunis());
console.log('mask', mk.W, mk.H, Date.now() - t0, 'ms', 'rle', rle(mk).length);
// downsample x4 to a ppm
const S = 4, w = Math.floor(mk.W / S), h = Math.floor(mk.H / S), px = Buffer.alloc(w * h * 3);
const col = { 0: [20, 40, 70], 1: [120, 118, 110], 2: [80, 140, 70], 4: [40, 90, 40] };
for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const v = mk.m[(r * S) * mk.W + c * S]; const k = col[v] || [255, 0, 0]; px.set(k, (r * w + c) * 3); }
fs.writeFileSync('/tmp/claude-0/-home-claude/3bbe58eb-4d0e-551e-9fd5-f5c9a1cde57a/scratchpad/mask.ppm', Buffer.concat([Buffer.from(`P6 ${w} ${h} 255\n`), px]));
fs.writeFileSync('/tmp/claude-0/-home-claude/3bbe58eb-4d0e-551e-9fd5-f5c9a1cde57a/scratchpad/mask_meta.json', JSON.stringify({ X0: mk.X0, Z0: mk.Z0, cell: mk.cell * S, rivers: mk.rivers.map(r => r.n + ':' + r.P.length) }));
