import fs from 'fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _gen from '@babel/generator';
import * as t from '@babel/types';
const traverse = _traverse.default?.default || _traverse.default || _traverse;
const generate = _gen.default?.default || _gen.default || _gen;
const code = fs.readFileSync('rec/game.js', 'utf8');
const ast = parse(code, { sourceType: 'script' });
// iife body
const iife = ast.program.body[0].expression.callee; const body = iife.body.body;
const kThree = body.findIndex(st => code.slice(st.start, st.end).includes('__THREE__'));
const boundary = body[kThree].end;
console.log('statements', body.length, 'three ends at', kThree, boundary);
// namespace maps
const NS = {}; // nsIdent -> {exportName: ident}
for (const st of body) { const src = code.slice(st.start, Math.min(st.end, st.start + 8)); }
traverse(ast, { CallExpression(p) { const n = p.node; if (n.callee.type === 'Identifier' && n.callee.name === 'vi' && n.arguments[1]?.type === 'ObjectExpression') { const m = {}; for (const pr of n.arguments[1].properties) m[pr.key.name || pr.key.value] = pr.value.body.name; NS[n.arguments[0].name] = m; } } });
const threeMap = NS['yn']; const threeRev = {}; for (const k in threeMap) threeRev[threeMap[k]] = k;
// __G mapping
const GMAP = {};
traverse(ast, { AssignmentExpression(p) { const n = p.node; if (n.left.type === 'MemberExpression' && n.left.object.name === 'window' && n.left.property.name === '__G') { for (const pr of n.right.properties) if (pr.value.type === 'Identifier') GMAP[pr.value.name] = pr.key.name; } } });
console.log('GMAP', JSON.stringify(GMAP));
let progScope = null, iifeScope = null;
traverse(ast, { ArrowFunctionExpression(p) { if (p.node === iife) { iifeScope = p.scope; p.stop(); } } });
// 1) replace references to three exports in the game part with THREE.X
let nThree = 0; const foreign = new Map();
traverse(ast, { Identifier(p) {
  if (p.node.start === undefined || p.node.start < boundary) return;
  if (!p.isReferencedIdentifier()) return;
  const b = p.scope.getBinding(p.node.name); if (!b || b.scope !== iifeScope) return;
  if (b.identifier.start >= boundary) return;
  const nm = p.node.name;
  if (nm === 'yn') { p.replaceWith(t.identifier('THREE')); nThree++; return; }
  if (nm === 'vi' || nm === 'Mw') return;
  const ex = threeRev[nm];
  if (!ex) { foreign.set(nm, (foreign.get(nm) || 0) + 1); return; }
  p.replaceWith(t.memberExpression(t.identifier('THREE'), t.identifier(ex))); nThree++;
} });
console.log('three refs replaced', nThree, 'foreign', [...foreign.entries()].slice(0, 30));
// 2) drop the three statements
iife.body.body = body.slice(kThree + 1);
fs.writeFileSync('rec/meta.json', JSON.stringify({ NS, GMAP }));
// regenerate as module
const prog = t.program([...iife.body.body]);
const out = generate(prog, { jsescOption: { minimal: true }, comments: false }).code;
fs.writeFileSync('rec/game_body.js', out);
console.log('out bytes', out.length);
