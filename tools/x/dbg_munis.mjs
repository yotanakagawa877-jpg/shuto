import fs from 'fs';
import { loadMunis, sharedEdges, chain } from '../geo/munis.mjs';
const M = loadMunis();
const P = sharedEdges(M);
const out = [];
for (const [k, segs] of P) { const [a, b] = k.split('-').map(Number); for (const L of chain(segs)) out.push({ a: M[a].name, b: M[b].name, pa: M[a].pref, pb: M[b].pref, L }); }
fs.writeFileSync('/tmp/claude-0/-home-claude/3bbe58eb-4d0e-551e-9fd5-f5c9a1cde57a/scratchpad/shared.json', JSON.stringify(out));
fs.writeFileSync('/tmp/claude-0/-home-claude/3bbe58eb-4d0e-551e-9fd5-f5c9a1cde57a/scratchpad/munis.json', JSON.stringify(M.map(m => ({ name: m.name, polys: m.polys }))));
console.log(M.length, out.length);
