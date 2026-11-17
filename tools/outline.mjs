// print top-level declarations with line numbers (to navigate the restored source)
import fs from 'fs';
import { parse } from '@babel/parser';
const src = fs.readFileSync(process.argv[2] || 'src/game.js', 'utf8');
const ast = parse(src, { sourceType: 'module' });
for (const st of ast.program.body) {
  let names = [];
  if (st.type === 'VariableDeclaration') names = st.declarations.map(d => d.id.name || '{..}');
  else if (st.id) names = [st.id.name];
  else names = [st.type];
  const l = st.loc.start.line, l2 = st.loc.end.line;
  console.log(String(l).padStart(6), String(l2 - l + 1).padStart(5), names.join(',').slice(0, 160));
}
