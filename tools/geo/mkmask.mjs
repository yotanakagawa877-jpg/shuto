// builds the extended-map mask: data/ext_mask.json (raw, for the tools) and data/ext_mask_rle.json (for the game)
import fs from 'fs';
import { loadMunis } from './munis.mjs';
import { buildMask, rle, BOUNDS } from './mask.mjs';
const mk = buildMask(loadMunis());
fs.writeFileSync('data/ext_mask.json', JSON.stringify({ X0: mk.X0, Z0: mk.Z0, W: mk.W, H: mk.H, cell: mk.cell, raw: Buffer.from(mk.m).toString('base64') }));
fs.writeFileSync('data/ext_mask_rle.json', JSON.stringify({ bounds: BOUNDS, X0: mk.X0, Z0: mk.Z0, W: mk.W, H: mk.H, cell: mk.cell, rle: rle(mk), rivers: mk.rivers, lakes: mk.lakes }));
console.log('mask', mk.W, mk.H, 'rivers', mk.rivers.length);
