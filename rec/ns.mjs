import fs from 'fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default?.default || _traverse.default || _traverse;
const code = fs.readFileSync('rec/game.js', 'utf8');
const ast = parse(code, { sourceType: 'script' });
const ns = [];
traverse(ast, { CallExpression(p) { const n = p.node; if (n.callee.type === 'Identifier' && n.callee.name === 'vi' && n.arguments.length === 2 && n.arguments[1].type === 'ObjectExpression') {
  const map = {}; for (const pr of n.arguments[1].properties) { const k = pr.key.name || pr.key.value; const v = pr.value.body; map[k] = v.type === 'Identifier' ? v.name : '?' + v.type; }
  ns.push({ name: n.arguments[0].name, start: n.start, n: Object.keys(map).length, keys: Object.keys(map).slice(0, 12), map }); } } });
for (const x of ns) console.log(x.name, x.start, x.n, x.keys.join(','));
fs.writeFileSync('rec/ns.json', JSON.stringify(ns));
