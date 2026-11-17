import fs from 'fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _gen from '@babel/generator';
const traverse = _traverse.default?.default || _traverse.default || _traverse;
const generate = _gen.default?.default || _gen.default || _gen;
const { NS, GMAP } = JSON.parse(fs.readFileSync('rec/meta.json'));
const src = "import * as THREE from 'three';\nvar Mw = Object.defineProperty;\nvar vi = (n, t) => { for (var e in t) Mw(n, e, { get: t[e], enumerable: !0 }); };\n" + fs.readFileSync('rec/game_body.js', 'utf8');
const ast = parse(src, { sourceType: 'module' });
let prog; traverse(ast, { Program(p) { prog = p; p.stop(); } });
const top = prog.scope;
const MOD = { J2: 'world', Rf: 'trains', Op: 'aircraft', t1: 'police', So: 'vehicles', Xr: 'peds', d3: 'transit', Y3: 'player', Jf: 'weapons', n5: 'interiors', d5: 'missions', w5: 'hud', L5: 'boats', aM: 'gta', I1: 'fire' };
const want = new Map(); // ident -> desired name
const claim = (id, nm) => { if (!top.hasOwnBinding(id)) return; if (!want.has(id)) want.set(id, nm); };
for (const k in GMAP) if (k !== 'yn') claim(k, GMAP[k]);
for (const ns in NS) { if (ns === 'yn') continue; for (const ex in NS[ns]) claim(NS[ns][ex], ex); }
// resolve duplicates
const byName = new Map(); for (const [id, nm] of want) { if (!byName.has(nm)) byName.set(nm, []); byName.get(nm).push(id); }
for (const [nm, ids] of byName) if (ids.length > 1) { ids.forEach((id, i) => { if (i === 0) return; let mod = 'x'; for (const ns in NS) if (ns !== 'yn' && Object.values(NS[ns]).includes(id)) mod = MOD[ns]; want.set(id, mod + '_' + nm); }); }
let ren = 0, moved = 0;
const used = new Set(Object.keys(top.bindings));
for (const [id, nm] of want) {
  if (id === nm) continue;
  // a different top-level binding already uses the wanted name -> move it away
  if (top.hasOwnBinding(nm) && !want.has(nm)) { const nn = '_' + nm + '_'; top.rename(nm, nn); moved++; }
  else if (top.hasOwnBinding(nm)) { const tmp = '__tmp_' + nm; top.rename(nm, tmp); want.set(tmp, want.get(nm)); want.delete(nm); }
  const b = top.getBinding(id); if (!b) { console.log('nobinding', id); continue; }
  // inner scopes that would shadow the new name
  for (const rp of b.referencePaths) { let s = rp.scope; while (s && s !== top) { if (s.hasOwnBinding(nm)) { s.rename(nm, s.generateUid(nm)); } s = s.parent; } }
  for (const cp of b.constantViolations) { let s = cp.scope; while (s && s !== top) { if (s.hasOwnBinding(nm)) s.rename(nm, s.generateUid(nm)); s = s.parent; } }
  top.rename(id, nm); ren++;
}
console.log('renamed', ren, 'moved', moved);
const out = generate(ast, { jsescOption: { minimal: true }, comments: false }).code;
fs.writeFileSync('rec/game_named.js', out);
console.log(out.length);
