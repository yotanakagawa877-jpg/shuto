// v3.2 expressways of the extended map, joined to the existing Shuto network.
// Way points follow the real routes (approximate, IC / JCT positions); every route is a smooth polyline, junctions
// are shared nodes. IC positions are kept in W.ext.ics so tools/geo/roads.mjs can add the ramps to the street network.
// usage: node tools/geo/xways.mjs in.json out.json
import fs from 'fs';
import { toXZ } from './munis.mjs';
import { boundsXZ } from './mask.mjs';
const IN = process.argv[2], OUT = process.argv[3];
const W = JSON.parse(fs.readFileSync(IN, 'utf8'));
const B = boundsXZ(), M = 700;
const inB = (q) => q[0] > B.x0 - M && q[0] < B.x1 + M && q[1] > B.z0 - M && q[1] < B.z1 + M;
const hyp = Math.hypot;
const LL = (a) => a.map(([lat, lng]) => toXZ(lng, lat));
function cum(p) { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + hyp(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; }
function resample(p, step) { const c = cum(p), L = c[c.length - 1], n = Math.max(1, Math.round(L / step)), out = []; let j = 0; for (let k = 0; k <= n; k++) { const s = L * k / n; while (j < c.length - 2 && c[j + 1] < s) j++; const t = (s - c[j]) / ((c[j + 1] - c[j]) || 1); out.push([p[j][0] + (p[j + 1][0] - p[j][0]) * t, p[j][1] + (p[j + 1][1] - p[j][1]) * t]); } return out; }
function smooth(p, sig, step) { const s = sig / step, R = Math.ceil(s * 3), n = p.length; return p.map((q, i) => { let x = 0, z = 0, w = 0; for (let k = -R; k <= R; k++) { const j = i + k; if (j < 0 || j >= n) continue; const ww = Math.exp(-(k * k) / (2 * s * s)); x += p[j][0] * ww; z += p[j][1] * ww; w += ww; } const f = Math.min(1, Math.min(i, n - 1 - i) / (R + 1)); return [q[0] + (x / w - q[0]) * f, q[1] + (z / w - q[1]) * f]; }); }

// [name, from: {old: road name} | {node: 'JCT name'} | null, way points (lat, lng), ics: [[name, lat, lng]], end: 'JCT name' | null]
const JCT = {}; // name -> [x, z]
const XW = [
  ['東名高速道路', { old: '首都高 3号渋谷線', at: [35.5900, 139.6000] }, [[35.5810, 139.5810], [35.5705, 139.5610], [35.5560, 139.5420], [35.5517, 139.5368], [35.5440, 139.5190], [35.5330, 139.5000], [35.5175, 139.4770], [35.5010, 139.4560], [35.4860, 139.4320], [35.4740, 139.4100]], [['東名川崎', 35.5880, 139.5860], ['横浜青葉', 35.5517, 139.5368], ['横浜町田', 35.5175, 139.4770]], { jct: [['横浜青葉JCT', 3]] }],
  ['中央自動車道', { old: '首都高 4号新宿線', at: [35.6810, 139.5950] }, [[35.6772, 139.5805], [35.6705, 139.5625], [35.6610, 139.5440], [35.6545, 139.5250], [35.6520, 139.5050], [35.6565, 139.4850], [35.6625, 139.4650], [35.6680, 139.4440], [35.6705, 139.4180]], [['調布', 35.6595, 139.5400], ['稲城', 35.6525, 139.5030], ['国立府中', 35.6680, 139.4440]], {}],
  ['首都高 5号池袋線', { old: '首都高 5号池袋線', at: [35.7470, 139.7050] }, [[35.7535, 139.7005], [35.7600, 139.6960], [35.7705, 139.6850], [35.7825, 139.6730], [35.7955, 139.6600], [35.8055, 139.6480], [35.8136, 139.6362]], [['高島平', 35.7880, 139.6680], ['戸田南', 35.7980, 139.6575]], { jct: [['板橋JCT', 1]], endJct: '美女木JCT' }],
  ['首都高 埼玉大宮線', { jct: '美女木JCT' }, [[35.8300, 139.6320], [35.8500, 139.6280], [35.8700, 139.6250], [35.8830, 139.6220]], [['浦和南', 35.8420, 139.6300], ['与野', 35.8830, 139.6220]], {}],
  ['首都高 中央環状線', { old: '首都高 中央環状線', at: [35.7470, 139.7120] }, [[35.7585, 139.7075], [35.7650, 139.7200], [35.7700, 139.7395], [35.7745, 139.7520], [35.7722, 139.7700], [35.7682, 139.7880], [35.7620, 139.8050], [35.7545, 139.8190]], [['王子北', 35.7700, 139.7395], ['加平', 35.7650, 139.8000]], { jct: [['江北JCT', 3], ['小菅JCT', 6]], endJct: '堀切JCT' }],
  ['首都高 6号向島線', { old: '首都高 6号向島線', at: [35.7470, 139.8200] }, [[35.7545, 139.8190]], [], { endJct: '堀切JCT', joinOnly: true }],
  ['首都高 6号三郷線', { jct: '小菅JCT' }, [[35.7760, 139.8170], [35.7900, 139.8280], [35.8080, 139.8360], [35.8230, 139.8450], [35.8350, 139.8620]], [['八潮', 35.8080, 139.8360]], { endJct: '三郷JCT' }],
  ['首都高 川口線', { jct: '江北JCT' }, [[35.7900, 139.7530], [35.8100, 139.7520], [35.8300, 139.7510], [35.8470, 139.7530]], [['鹿浜橋', 35.7880, 139.7530], ['新井宿', 35.8350, 139.7510]], { endJct: '川口JCT' }],
  ['東北自動車道', { jct: '川口JCT' }, [[35.8655, 139.7480], [35.8855, 139.7420], [35.9100, 139.7350], [35.9420, 139.7270]], [['浦和', 35.8855, 139.7420]], {}],
  ['東京外環自動車道', { jct: '大泉JCT', at: [35.7525, 139.5950] }, [[35.7655, 139.6010], [35.7800, 139.6120], [35.7955, 139.6250], [35.8136, 139.6362], [35.8205, 139.6600], [35.8300, 139.6900], [35.8400, 139.7200], [35.8470, 139.7530], [35.8480, 139.7800], [35.8420, 139.8100], [35.8355, 139.8400], [35.8350, 139.8620], [35.8150, 139.8780], [35.7900, 139.8900], [35.7600, 139.8985], [35.7350, 139.9050], [35.7090, 139.9300], [35.6930, 139.9600]], [['和光', 35.7800, 139.6120], ['戸田西', 35.8180, 139.6480], ['外環浦和', 35.8300, 139.6900], ['川口西', 35.8400, 139.7200], ['草加', 35.8420, 139.8100], ['三郷南', 35.8150, 139.8780], ['松戸', 35.7900, 139.8900], ['市川北', 35.7600, 139.8985], ['市川中央', 35.7350, 139.9050]], { jct: [['美女木JCT', 3], ['川口JCT', 7], ['三郷JCT', 11], ['京葉JCT', 16]], endJct: '高谷JCT' }],
  ['関越自動車道', null, [[35.7470, 139.6110], [35.7525, 139.5950], [35.7700, 139.5600], [35.7980, 139.5150], [35.8280, 139.5050], [35.8600, 139.4980], [35.8840, 139.4960], [35.9350, 139.4800]], [['練馬', 35.7470, 139.6110], ['所沢', 35.7980, 139.5150], ['川越', 35.8840, 139.4960]], { jct: [['大泉JCT', 1]] }],
  ['常磐自動車道', { jct: '三郷JCT' }, [[35.8500, 139.8850], [35.8650, 139.9050], [35.8780, 139.9300], [35.8880, 139.9550], [35.9100, 139.9850], [35.9380, 140.0120]], [['流山', 35.8650, 139.9050], ['柏', 35.8880, 139.9550]], {}],
  ['京葉道路', { old: '首都高 7号小松川線', at: [35.6930, 139.8470] }, [[35.6990, 139.8700], [35.7020, 139.8920], [35.7050, 139.9150], [35.7090, 139.9300], [35.6990, 139.9450], [35.6960, 139.9700], [35.6950, 139.9900], [35.6870, 140.0130], [35.6750, 140.0350], [35.6650, 140.0500], [35.6580, 140.0800]], [['篠崎', 35.7020, 139.8920], ['市川', 35.7050, 139.9150], ['原木', 35.6990, 139.9450], ['船橋', 35.6950, 139.9900], ['花輪', 35.6870, 140.0130], ['武石', 35.6650, 140.0500]], { jct: [['京葉JCT', 3]] }],
  ['首都高 湾岸線', { old: '首都高 湾岸線', at: [35.6430, 139.8600] }, [[35.6420, 139.8800], [35.6440, 139.9000], [35.6520, 139.9150], [35.6680, 139.9300], [35.6820, 139.9480], [35.6930, 139.9600]], [['舞浜', 35.6420, 139.8800], ['湾岸市川', 35.6680, 139.9300]], { endJct: '高谷JCT' }],
  ['東関東自動車道', { jct: '高谷JCT' }, [[35.6880, 139.9800], [35.6800, 140.0000], [35.6650, 140.0250], [35.6500, 140.0500], [35.6400, 140.0820]], [['谷津船橋', 35.6800, 140.0000], ['湾岸習志野', 35.6650, 140.0250], ['湾岸千葉', 35.6480, 140.0550]], {}],
  ['首都高 湾岸線', { old: '首都高 湾岸線', at: [35.4200, 139.6620] }, [[35.4100, 139.6550], [35.3980, 139.6420], [35.3850, 139.6330], [35.3700, 139.6300], [35.3550, 139.6320], [35.3480, 139.6260], [35.3480, 139.6050]], [['磯子', 35.3980, 139.6420], ['杉田', 35.3700, 139.6300], ['幸浦', 35.3550, 139.6320]], { endJct: '釜利谷JCT' }],
  ['首都高 狩場線', { old: '首都高 1号羽田線', at: [35.4370, 139.6450] }, [[35.4380, 139.6300], [35.4400, 139.6150], [35.4335, 139.6000], [35.4300, 139.5950]], [['花之木', 35.4380, 139.6300]], { endJct: '狩場JCT' }],
  ['横浜横須賀道路', { jct: '狩場JCT' }, [[35.4150, 139.5880], [35.4000, 139.5850], [35.3850, 139.5900], [35.3650, 139.6000], [35.3480, 139.6050], [35.3360, 139.5950], [35.3200, 139.5900], [35.3050, 139.5950], [35.2880, 139.6070]], [['日野', 35.4000, 139.5850], ['港南台', 35.3850, 139.5900], ['朝比奈', 35.3360, 139.5950], ['逗子', 35.3050, 139.5950]], { jct: [['釜利谷JCT', 4]] }],
  ['保土ヶ谷バイパス', { jct: '狩場JCT' }, [[35.4450, 139.5850], [35.4600, 139.5800], [35.4780, 139.5880], [35.4900, 139.5600], [35.5000, 139.5350], [35.5050, 139.5180], [35.5120, 139.4950], [35.5175, 139.4770]], [['新桜ヶ丘', 35.4600, 139.5800], ['本村', 35.4900, 139.5600], ['上川井', 35.5050, 139.5180]], { jct: [['保土ヶ谷JCT', 2]], endOn: '東名高速道路' }],
  ['横浜新道', { jct: '保土ヶ谷JCT' }, [[35.4650, 139.5750], [35.4450, 139.5600], [35.4250, 139.5450], [35.4100, 139.5350]], [['今井', 35.4450, 139.5600], ['戸塚', 35.4100, 139.5350]], {}],
  ['第三京浜道路', { oldA: '第三京浜', at: [35.5380, 139.5980] }, [[35.5250, 139.5950], [35.5100, 139.5920], [35.4950, 139.5900]], [['港北', 35.5250, 139.5950]], { endJct: '保土ヶ谷JCT' }],
  ['首都高 横浜北線', { onRoad: '首都高 1号羽田線', at: [35.4940, 139.6750] }, [[35.5000, 139.6550], [35.5080, 139.6350], [35.5110, 139.6190], [35.5180, 139.6050], [35.5250, 139.5980]], [['新横浜', 35.5110, 139.6190]], { endJct: '港北JCT' }],
  ['首都高 横浜北西線', { jct: '港北JCT' }, [[35.5350, 139.5750], [35.5450, 139.5550], [35.5517, 139.5368]], [['横浜港北', 35.5300, 139.5880]], { endJct: '横浜青葉JCT' }],
];

// ---------- build
const N = W.nodes, E = W.edges;
const nameIdx = (n) => { let k = W.roadNames.indexOf(n); if (k < 0) { W.roadNames.push(n); k = W.roadNames.length - 1; } return k; };
const KX = 0, KA = 1;
const deadEnds = (name, kind = KX) => { const ri = W.roadNames.indexOf(name); const deg = new Map(); for (const e of E) { if (e[3] !== ri || e[2] !== kind) continue; for (const n of [e[0], e[1]]) deg.set(n, (deg.get(n) || 0) + 1); } return [...deg].filter(([, d]) => d === 1).map(([n]) => n); };
const addNode = (q, y) => { N.push([Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10, y]); return N.length - 1; };
const jctNode = {};
const ics = [];
let added = 0;
for (const [name, from, wp, icl, opt] of XW) {
  let pts = LL(wp), startNode = null;
  if (from && (from.old || from.oldA)) {
    const ends = deadEnds(from.old || from.oldA, from.oldA ? KA : KX), at = toXZ(from.at[1], from.at[0]);
    let best = null, bd = 1e9; for (const n of ends) { const d = hyp(N[n][0] - at[0], N[n][1] - at[1]); if (d < bd) { bd = d; best = n; } }
    if (best === null || bd > 900) { console.log('  ! no old end for', name, from.old || from.oldA, Math.round(bd)); }
    else { startNode = best; pts = [[N[best][0], N[best][1]], ...pts]; }
  } else if (from && from.onRoad) {
    const ri = W.roadNames.indexOf(from.onRoad), at = toXZ(from.at[1], from.at[0]);
    let best = null; E.forEach((e, ei) => { if (e[3] !== ri || e[2] !== KX) return; const p = [N[e[0]].slice(0, 2), ...(e[4] || []), N[e[1]].slice(0, 2)]; for (let k = 0; k + 1 < p.length; k++) { const a = p[k], b = p[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz; let t = l2 ? ((at[0] - a[0]) * dx + (at[1] - a[1]) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t)); const d = hyp(a[0] + dx * t - at[0], a[1] + dz * t - at[1]); if (!best || d < best.d) best = { d, ei, k, q: [a[0] + dx * t, a[1] + dz * t], p }; } });
    if (!best || best.d > 400) console.log('  ! onRoad not found', name, best && Math.round(best.d));
    else { const e = E[best.ei], nd = addNode(best.q, 12); const pA = best.p.slice(1, best.k + 1), pB = best.p.slice(best.k + 1, -1); E.push([nd, e[1], e[2], e[3], pB]); e[1] = nd; e[4] = pA; startNode = nd; pts = [best.q, ...pts]; }
  } else if (from && from.jct) {
    if (jctNode[from.jct] === undefined && from.at) jctNode[from.jct] = addNode(toXZ(from.at[1], from.at[0]), 12);
    const jn = jctNode[from.jct]; if (jn === undefined) { console.log('  ! jct not yet', from.jct, name); continue; }
    startNode = jn; pts = [[N[jn][0], N[jn][1]], ...pts];
  }
  // smooth polyline
  let P = smooth(resample(pts, 20), 90, 20);
  P[0] = pts[0]; P[P.length - 1] = pts[pts.length - 1];
  // junction nodes along the route: [name, way point index]
  const c = cum(P);
  const cut = []; // arc positions where a node is needed
  for (const [jn, wi] of (opt.jct || [])) { const q = pts[(startNode !== null ? 1 : 0) + wi] || pts[wi]; let bi = 0, bd = 1e9; P.forEach((p, i) => { const d = hyp(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = i; } }); cut.push([c[bi], jn, bi]); }
  // IC nodes
  const icCuts = [];
  for (const [icn, la, ln] of icl) { const q = toXZ(ln, la); let bi = 0, bd = 1e9; P.forEach((p, i) => { const d = hyp(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = i; } }); if (bi > 0 && bi < P.length - 1) icCuts.push([c[bi], null, bi, icn]); }
  const all = [...cut, ...icCuts].sort((a, b) => a[2] - b[2]);
  // clip to the map
  let i0 = 0, i1 = P.length - 1; while (i1 > 0 && !inB(P[i1])) i1--; if (i1 < P.length - 1) { i1 = Math.min(P.length - 1, i1 + 1); }
  let prev = startNode !== null ? startNode : addNode(P[0], 12), prevI = 0;
  const ni = nameIdx(name);
  const stops = all.filter(a => a[2] > 0 && a[2] < i1);
  for (const [, jn, bi, icn] of stops) {
    let nd;
    if (jn && jctNode[jn] !== undefined) nd = jctNode[jn];
    else { nd = addNode(P[bi], 12); if (jn) jctNode[jn] = nd; }
    if (bi - prevI < 2) { if (jn) jctNode[jn] = prev; if (icn) ics.push({ name: icn, road: name, node: prev }); continue; }
    E.push([prev, nd, KX, ni, P.slice(prevI + 1, bi).map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10])]); added++;
    if (icn) ics.push({ name: icn, road: name, node: nd });
    prev = nd; prevI = bi;
  }
  // end
  let endNode;
  if (opt.endJct) { if (jctNode[opt.endJct] === undefined) jctNode[opt.endJct] = addNode(P[i1], 12); endNode = jctNode[opt.endJct]; }
  else if (opt.endOn) { // join an expressway built before: nearest node of it
    const ri = W.roadNames.indexOf(opt.endOn); let best = null, bd = 1e9; for (const e of E) { if (e[3] !== ri) continue; for (const n of [e[0], e[1]]) { const d = hyp(N[n][0] - P[i1][0], N[n][1] - P[i1][1]); if (d < bd) { bd = d; best = n; } } } endNode = bd < 600 ? best : addNode(P[i1], 12);
  } else endNode = addNode(P[i1], 12);
  if (endNode !== prev) { E.push([prev, endNode, KX, ni, P.slice(prevI + 1, i1).map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10])]); added++; }
  console.log('xway', name.padEnd(14), Math.round(c[i1] / 100) / 10 + 'km', stops.length, 'nodes');
}
W.ext = W.ext || {};
W.ext.ics = ics.map(o => ({ name: o.name, road: o.road, node: o.node }));
fs.writeFileSync(OUT, JSON.stringify(W));
console.log('edges added', added, 'ics', ics.length, 'jct', Object.keys(jctNode).length);
