// v3.2: rebuild the whole rail network from real alignments (Mini Tokyo 3D open data, github.com/nagix/mini-tokyo-3d).
//  - every line = a physical track (double track). Services that share track in reality (湘南新宿ライン, 上野東京ライン,
//    成田エクスプレス, 相鉄直通 …) are defined later as services running over several tracks (tools/geo/services.mjs)
//  - lines that run side by side in reality are laid at a fixed track spacing in a consistent order, diverging smoothly
//  - heights: base viaduct, flyovers only where crossing other lines / expressways, tunnels where the real line is underground
//  - Tokaido and Tohoku Shinkansen built along the real corridors
// usage: node tools/geo/rails3.mjs in.json out.json
import fs from 'fs';
import { toXZ } from './munis.mjs';
import { boundsXZ } from './mask.mjs';
const IN = process.argv[2], OUT = process.argv[3];
const W = JSON.parse(fs.readFileSync(IN, 'utf8'));
const MT = JSON.parse(fs.readFileSync('data/mt3d.json', 'utf8')).lines;
const B = boundsXZ(), MARGIN = 600;
const inB = (q, m = MARGIN) => q[0] > B.x0 - m && q[0] < B.x1 + m && q[1] > B.z0 - m && q[1] < B.z1 + m;
const STEP = 8, SPACING = 11.5, BASE = 8, SHIN_BASE = 13, OVER_RAIL = 9, OVER_X = 19.5, GRADE = 0.035, TUN = -16;
const hyp = Math.hypot, ss = (t) => t * t * (3 - 2 * t);
function cum(p, loop = false) { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + hyp(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; }
function resampleU(p, step, u) {
  const c = cum(p), len = c[c.length - 1], n = Math.max(1, Math.round(len / step)), out = [], uo = [];
  let j = 0;
  for (let k = 0; k <= n; k++) { const s = len * k / n; while (j < c.length - 2 && c[j + 1] < s) j++; const t = (s - c[j]) / ((c[j + 1] - c[j]) || 1); out.push([p[j][0] + (p[j + 1][0] - p[j][0]) * t, p[j][1] + (p[j + 1][1] - p[j][1]) * t]); uo.push(u ? (t < 0.5 ? u[j] : u[j + 1]) : 0); }
  return [out, uo];
}
function smoothPts(p, sigmaM, loop = false) {
  const s = sigmaM / STEP; if (s < 0.5 || p.length < 3) return p; const R = Math.ceil(s * 3), K = []; for (let k = -R; k <= R; k++) K.push(Math.exp(-(k * k) / (2 * s * s)));
  const n = p.length; return p.map((q, i) => { let x = 0, z = 0, ws = 0; for (let k = -R; k <= R; k++) { let j = i + k; if (loop) j = (j + n) % n; else if (j < 0 || j >= n) continue; const w = K[k + R]; x += p[j][0] * w; z += p[j][1] * w; ws += w; } const f = loop ? 1 : Math.min(1, Math.min(i, n - 1 - i) / (R + 1)); return [q[0] + (x / ws - q[0]) * f, q[1] + (z / ws - q[1]) * f]; });
}
function tangent(p, i, loop = false) { const n = p.length; const a = p[loop ? (i - 2 + n) % n : Math.max(0, i - 2)], b = p[loop ? (i + 2) % n : Math.min(n - 1, i + 2)], l = hyp(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
function hermite(P, tP, Q, tQ, kf = 1) { const d = hyp(Q[0] - P[0], Q[1] - P[1]), nn = Math.max(2, Math.round(d / STEP)), k = d * kf, out = []; for (let j = 1; j < nn; j++) { const t = j / nn, h1 = 2 * t ** 3 - 3 * t * t + 1, h2 = -2 * t ** 3 + 3 * t * t, h3 = t ** 3 - 2 * t * t + t, h4 = t ** 3 - t * t; out.push([h1 * P[0] + h2 * Q[0] + (h3 * tP[0] + h4 * tQ[0]) * k, h1 * P[1] + h2 * Q[1] + (h3 * tP[1] + h4 * tQ[1]) * k]); } return out; }
function nearest(path, q, c = null) { let best = [0, 0, 1e18, 0]; c = c || cum(path); for (let i = 0; i + 1 < path.length; i++) { const a = path[i], b = path[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz; let t = l2 ? ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const d = hyp(a[0] + dx * t - q[0], a[1] + dz * t - q[1]); if (d < best[2]) best = [i, t, d, c[i] + (c[i + 1] - c[i]) * t]; } return best; }
function at(path, c, s) { s = Math.max(0, Math.min(c[c.length - 1], s)); let lo = 0, hi = c.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= s) lo = m; else hi = m - 1; } const j = lo, t = (s - c[j]) / ((c[j + 1] - c[j]) || 1), a = path[j], b = path[j + 1], l = hyp(b[0] - a[0], b[1] - a[1]) || 1; return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l, j }; }
function subPath(path, c, a, b, u = null) { const lo = Math.min(a, b), hi = Math.max(a, b), out = [], uo = []; const A = at(path, c, lo); out.push([A.x, A.z]); uo.push(u ? u[A.j] : 0); for (let i = 0; i < path.length; i++) if (c[i] > lo + 0.5 && c[i] < hi - 0.5) { out.push(path[i].slice()); uo.push(u ? u[i] : 0); } const Bq = at(path, c, hi); out.push([Bq.x, Bq.z]); uo.push(u ? u[Bq.j] : 0); if (a > b) { out.reverse(); uo.reverse(); } return [out, uo]; }
const nm = (s) => s.replace(/[〈（(].*$/, '');
const mt = (id) => { const l = MT[id]; if (!l) throw new Error('no mt3d ' + id); if (!l.c) l.c = cum(l.path); return l; };
const stArc = (l, name) => { const s = l.st.find(q => nm(q.ja) === name); if (!s) throw new Error('no station ' + name + ' on ' + l.ja); return s.arc; };
const canon = (ja) => ja.normalize('NFKC').replace(/([\u4e00-\u9fff])ケ([\u4e00-\u9fff])/g, '$1ヶ$2');
const gameName = (ja0) => { const ja = canon(ja0); const b = nm(ja); if (b === '押上') return '押上〈スカイツリー前〉'; if (/\(/.test(ja)) return ja.replace(/\(([^)]*)\)/, '〈$1〉'); return ja; };

// ---------- the tracks
// [code, ja, en, color, kind, source, opts]  source: mt3d id | function -> {p, u, st}
// opts: from/to (station names on the MT3D line), loop, rev, conn (track without own stations), shin, keepOld (old geometry), fixed
const T = [
  ['JY', 'JR山手線', 'JR Yamanote Line', '#80c241', 'el', 'JR-East.Yamanote', { loop: true }],
  ['JK', 'JR京浜東北線', 'JR Keihin-Tohoku Line', '#00b2e5', 'el', 'JR-East.KeihinTohokuNegishi', {}],
  ['JU', 'JR宇都宮線・高崎線', 'JR Utsunomiya / Takasaki Line', '#f68b1e', 'el', 'JR-East.Utsunomiya', {}],
  ['JT', 'JR東海道線', 'JR Tokaido Line', '#f68b1e', 'el', 'JR-East.Tokaido', {}],
  ['JC', 'JR中央線(快速)', 'JR Chuo Line (Rapid)', '#f15a22', 'el', 'JR-East.ChuoRapid', {}],
  ['JB', 'JR中央・総武線', 'JR Chuo-Sobu Line', '#ffd400', 'el', 'JR-East.ChuoSobuLocal', {}],
  ['JO', 'JR横須賀・総武快速線', 'JR Yokosuka / Sobu Rapid Line', '#0067c0', 'el', 'JO', {}],
  ['JA', 'JR埼京線', 'JR Saikyo Line', '#00ac9a', 'el', 'JR-East.SaikyoKawagoe', {}],
  ['JJ', 'JR常磐線', 'JR Joban Line (Rapid)', '#00b261', 'el', 'JR-East.JobanRapid', { from: '上野' }],
  ['JL', 'JR常磐線各駅停車', 'JR Joban Line (Local)', '#868a87', 'el', 'JR-East.JobanLocal', {}],
  ['JE', 'JR京葉線', 'JR Keiyo Line', '#c9242f', 'el', 'JR-East.Keiyo', {}],
  ['JM', 'JR武蔵野線', 'JR Musashino Line', '#f15a22', 'el', 'JR-East.Musashino', {}],
  ['JN', 'JR南武線', 'JR Nambu Line', '#ffd400', 'el', 'JR-East.Nambu', {}],
  ['JN', 'JR南武線浜川崎支線', 'JR Nambu Branch Line', '#ffd400', 'el', 'JR-East.NambuBranch', {}],
  ['JI', 'JR鶴見線', 'JR Tsurumi Line', '#ffd400', 'el', 'JR-East.Tsurumi', {}],
  ['JH', 'JR横浜線', 'JR Yokohama Line', '#80c241', 'el', 'JR-East.Yokohama', {}],
  ['SJ', '相鉄・JR直通線', 'Sotetsu-JR Link Line', '#00b48d', 'el', 'SJ', {}],
  ['xO', '大崎支線', 'Osaki Branch', '#00ac9a', 'el', 'xO', { conn: true }],
  ['xF', '京葉線二俣支線', 'Keiyo Futamata Branch', '#c9242f', 'el', 'xF', { conn: true }],
  ['xK', '京葉線高谷支線', 'Keiyo Koya Branch', '#c9242f', 'el', 'xK', { conn: true }],
  ['TK', '東海道新幹線', 'Tokaido Shinkansen', '#1e50a2', 'el', 'TK', { shin: true }],
  ['TH', '東北・上越・北陸新幹線', 'Tohoku / Joetsu / Hokuriku Shinkansen', '#00a95f', 'el', 'TH', { shin: true }],
  ['Y', '東京メトロ有楽町線', 'Tokyo Metro Yurakucho Line', '#c1a470', 'sub', 'TokyoMetro.Yurakucho', {}],
  ['F', '東京メトロ副都心線', 'Tokyo Metro Fukutoshin Line', '#9c5e31', 'sub', 'TokyoMetro.Fukutoshin', {}],
  ['T', '東京メトロ東西線', 'Tokyo Metro Tozai Line', '#009bbf', 'el', 'TokyoMetro.Tozai', {}],
  ['S', '都営新宿線', 'Toei Shinjuku Line', '#6cbb5a', 'sub', 'Toei.Shinjuku', {}],
  ['G', '東京メトロ銀座線', 'Tokyo Metro Ginza Line', '#ff9500', 'sub', 'TokyoMetro.Ginza', {}],
  ['M', '東京メトロ丸ノ内線', 'Tokyo Metro Marunouchi Line', '#f62e36', 'sub', 'TokyoMetro.Marunouchi', {}],
  ['M', '東京メトロ丸ノ内線(方南町支線)', 'Tokyo Metro Marunouchi Branch', '#f62e36', 'sub', 'TokyoMetro.MarunouchiBranch', {}],
  ['H', '東京メトロ日比谷線', 'Tokyo Metro Hibiya Line', '#b5b5ac', 'sub', 'TokyoMetro.Hibiya', { to: '北千住' }],
  ['C', '東京メトロ千代田線', 'Tokyo Metro Chiyoda Line', '#00bb85', 'sub', 'TokyoMetro.Chiyoda', { from: '代々木上原' }],
  ['Z', '東京メトロ半蔵門線', 'Tokyo Metro Hanzomon Line', '#8f76d6', 'sub', 'TokyoMetro.Hanzomon', {}],
  ['N', '東京メトロ南北線', 'Tokyo Metro Namboku Line', '#00ac9b', 'sub', 'TokyoMetro.Namboku', {}],
  ['E', '都営大江戸線', 'Toei Oedo Line', '#b6007a', 'sub', 'Toei.Oedo', {}],
  ['A', '都営浅草線', 'Toei Asakusa Line', '#e85298', 'sub', 'Toei.Asakusa', {}],
  ['I', '都営三田線', 'Toei Mita Line', '#0079c2', 'sub', 'Toei.Mita', {}],
  ['SA', '都電荒川線', 'Toden Arakawa Line', '#e35c9e', 'tram', 'Toei.Arakawa', {}],
  ['SG', '東急世田谷線', 'Tokyu Setagaya Line', '#fcc800', 'tram', 'Tokyu.Setagaya', {}],
  ['EN', '江ノ島電鉄線', 'Enoshima Electric Railway', '#00a66c', 'tram', 'Enoden.Enoden', {}],
  ['U', 'ゆりかもめ', 'Yurikamome', '#1b5fae', 'ats', 'Yurikamome.Yurikamome', {}],
  ['NT', '日暮里・舎人ライナー', 'Nippori-Toneri Liner', '#e85298', 'ats', 'Toei.NipporiToneri', {}],
  ['SL', '金沢シーサイドライン', 'Kanazawa Seaside Line', '#00a0de', 'ats', 'YokohamaSeaside.KanazawaSeaside', {}],
  ['MO', '東京モノレール', 'Tokyo Monorail', '#1a3c8f', 'mono', 'TokyoMonorail.HanedaAirport', {}],
  ['SM', '湘南モノレール', 'Shonan Monorail', '#e60012', 'mono', 'ShonanMonorail.ShonanMonorail', {}],
  ['R', 'りんかい線', 'Rinkai Line', '#00418e', 'sub', 'TWR.Rinkai', {}],
  ['TX', 'つくばエクスプレス', 'Tsukuba Express', '#2e3192', 'el', 'MIR.TsukubaExpress', {}],
  ['TS', '東武スカイツリーライン', 'Tobu Skytree Line', '#0f6cc3', 'el', 'Tobu.TobuSkytree', {}],
  ['TS', '東武スカイツリーライン(押上)', 'Tobu Skytree Line (Oshiage)', '#0f6cc3', 'el', 'Tobu.TobuSkytreeBranch', {}],
  ['TS', '東武亀戸線', 'Tobu Kameido Line', '#0f6cc3', 'el', 'Tobu.Kameido', {}],
  ['TS', '東武大師線', 'Tobu Daishi Line', '#0f6cc3', 'el', 'Tobu.Daishi', {}],
  ['TD', '東武アーバンパークライン', 'Tobu Urban Park Line', '#00a7ea', 'el', 'Tobu.TobuUrbanPark', {}],
  ['TJ', '東武東上線', 'Tobu Tojo Line', '#004098', 'el', 'Tobu.Tojo', {}],
  ['SI', '西武池袋線', 'Seibu Ikebukuro Line', '#f39800', 'el', 'Seibu.Ikebukuro', {}],
  ['SI', '西武有楽町線', 'Seibu Yurakucho Line', '#f39800', 'sub', 'Seibu.SeibuYurakucho', {}],
  ['SS', '西武新宿線', 'Seibu Shinjuku Line', '#0080c8', 'el', 'Seibu.Shinjuku', {}],
  ['SK', '西武国分寺線', 'Seibu Kokubunji Line', '#0080c8', 'el', 'Seibu.Kokubunji', {}],
  ['SW', '西武多摩川線', 'Seibu Tamagawa Line', '#0080c8', 'el', 'Seibu.Tamagawa', {}],
  ['KS', '京成本線', 'Keisei Main Line', '#005aaa', 'el', 'Keisei.Main', {}],
  ['KS', '京成押上線', 'Keisei Oshiage Line', '#005aaa', 'el', 'Keisei.Oshiage', {}],
  ['KS', '京成松戸線', 'Keisei Matsudo Line', '#ee86a7', 'el', 'Keisei.Matsudo', {}],
  ['KS', '京成金町線', 'Keisei Kanamachi Line', '#005aaa', 'el', 'Keisei.Kanamachi', {}],
  ['KS', '京成千葉線', 'Keisei Chiba Line', '#005aaa', 'el', 'Keisei.Chiba', {}],
  ['HS', '北総線', 'Hokuso Line', '#1e90d2', 'el', 'Hokuso.Hokuso', {}],
  ['TR', '東葉高速線', 'Toyo Rapid Railway', '#3fb049', 'el', 'ToyoRapid.ToyoRapid', {}],
  ['RN', '流鉄流山線', 'Ryutetsu Nagareyama Line', '#e60012', 'el', 'Ryutetsu.Nagareyama', {}],
  ['KK', '京急本線', 'Keikyu Main Line', '#e5171f', 'el', 'Keikyu.Main', {}],
  ['KK', '京急空港線', 'Keikyu Airport Line', '#e5171f', 'el', 'Keikyu.Airport', { from: '京急蒲田' }],
  ['KK', '京急大師線', 'Keikyu Daishi Line', '#e5171f', 'el', 'Keikyu.Daishi', {}],
  ['KK', '京急逗子線', 'Keikyu Zushi Line', '#e5171f', 'el', 'Keikyu.Zushi', {}],
  ['KO', '京王線', 'Keio Line', '#dd0077', 'el', 'Keio.Keio', {}],
  ['KO', '京王新線', 'Keio New Line', '#dd0077', 'sub', 'Keio.KeioNew', {}],
  ['KO', '京王相模原線', 'Keio Sagamihara Line', '#dd0077', 'el', 'Keio.Sagamihara', { from: '調布' }],
  ['IN', '京王井の頭線', 'Keio Inokashira Line', '#4a3f99', 'el', 'Keio.Inokashira', {}],
  ['OH', '小田急線', 'Odakyu Odawara Line', '#2288cc', 'el', 'Odakyu.Odawara', {}],
  ['OH', '小田急多摩線', 'Odakyu Tama Line', '#2288cc', 'el', 'Odakyu.Tama', {}],
  ['OE', '小田急江ノ島線', 'Odakyu Enoshima Line', '#2288cc', 'el', 'Odakyu.Enoshima', {}],
  ['TY', '東急東横線', 'Tokyu Toyoko Line', '#da0442', 'el', 'Tokyu.Toyoko', {}],
  ['MG', '東急目黒線', 'Tokyu Meguro Line', '#009cd2', 'el', 'Tokyu.Meguro', {}],
  ['DT', '東急田園都市線', 'Tokyu Den-en-toshi Line', '#20a288', 'el', 'Tokyu.DenEnToshi', {}],
  ['OM', '東急大井町線', 'Tokyu Oimachi Line', '#f18c43', 'el', 'Tokyu.Oimachi', {}],
  ['IK', '東急池上線', 'Tokyu Ikegami Line', '#ee86a7', 'el', 'Tokyu.Ikegami', {}],
  ['TM', '東急多摩川線', 'Tokyu Tamagawa Line', '#ae0378', 'el', 'Tokyu.TokyuTamagawa', {}],
  ['SH', '東急新横浜線', 'Tokyu Shin-Yokohama Line', '#009cd2', 'sub', 'Tokyu.TokyuShinYokohama', {}],
  ['KD', '東急こどもの国線', 'Tokyu Kodomonokuni Line', '#00a0de', 'el', 'Tokyu.Kodomonokuni', {}],
  ['SO', '相鉄本線', 'Sotetsu Main Line', '#00508f', 'el', 'Sotetsu.Main', {}],
  ['SO', '相鉄いずみ野線', 'Sotetsu Izumino Line', '#00508f', 'el', 'Sotetsu.Izumino', {}],
  ['SO', '相鉄新横浜線', 'Sotetsu Shin-Yokohama Line', '#00508f', 'sub', 'Sotetsu.SotetsuShinYokohama', {}],
  ['B', '横浜市営地下鉄ブルーライン', 'Yokohama Subway Blue Line', '#0068b7', 'sub', 'YokohamaMunicipal.Blue', {}],
  ['GL', '横浜市営地下鉄グリーンライン', 'Yokohama Subway Green Line', '#00a650', 'sub', 'YokohamaMunicipal.Green', {}],
  ['MM', 'みなとみらい線', 'Minatomirai Line', '#134a8b', 'sub', 'Minatomirai.Minatomirai', {}],
  ['SR', '埼玉高速鉄道線', 'Saitama Railway', '#00a3d9', 'sub', 'SaitamaRailway.SaitamaRailway', {}],
];
// lateral order where lines share a corridor: bigger = further right of the canonical direction (southward / eastward) = west / south
const RANK = { JC: 9, JB: 8, JY: 7, JA: 6.5, JK: 6, JU: 5, JT: 4.5, JJ: 4, JL: 3.8, JO: 3.5, TH: 2, TK: 1, TY: 2, MG: 1, DT: 2, OM: 1 };
const PRI = ['TK', 'TH', 'JY', 'JK', 'JU', 'JT', 'JO', 'JA', 'JC', 'JB', 'JJ', 'JL', 'JE', 'JM', 'JN', 'JH', 'JI', 'SJ', 'KK', 'TY', 'MG', 'OH', 'OE', 'KO', 'IN', 'DT', 'OM', 'IK', 'TM', 'SO', 'SI', 'SS', 'SK', 'SW', 'TS', 'TD', 'TJ', 'KS', 'HS', 'TR', 'T', 'TX', 'RN', 'KD', 'xO', 'xF', 'xK'];

// ---------- raw geometry
function clipPiece(p, u) { let best = null, cur = null; p.forEach((q, i) => { if (inB(q)) { if (!cur) cur = { i0: i, i1: i }; cur.i1 = i; } else if (cur) { if (!best || cur.i1 - cur.i0 > best.i1 - best.i0) best = cur; cur = null; } }); if (cur && (!best || cur.i1 - cur.i0 > best.i1 - best.i0)) best = cur; if (!best) return null; return [p.slice(best.i0, best.i1 + 1), u.slice(best.i0, best.i1 + 1)]; }
function fromMT(id, o) {
  const l = mt(id); let a = 0, b = l.c[l.c.length - 1];
  if (o.from) a = stArc(l, o.from); if (o.to) b = stArc(l, o.to);
  let [p, u] = subPath(l.path, l.c, a, b, l.under);
  if (!o.loop) { const cp = clipPiece(p, u); if (!cp) return null; [p, u] = cp; }
  return { p, u, sts: l.st, line: l };
}
const LLp = (pts) => pts.map(([lat, lng]) => toXZ(lng, lat));
const RAW = {};
// 横須賀・総武快速線: 総武快速 (edge -> 東京, reversed) + 横須賀線 (東京 -> edge)
RAW.JO = () => { const s = fromMT('JR-East.SobuRapid', {}), y = fromMT('JR-East.Yokosuka', {}); const sp = s.p.slice().reverse(), su = s.u.slice().reverse(); return { p: [...sp, ...y.p.slice(1)], u: [...su, ...y.u.slice(1)], sts: [...s.line.st, ...y.line.st] }; };
// 相鉄・JR直通線: where it leaves the 横須賀線 beyond 武蔵小杉 to 羽沢横浜国大
RAW.SJ = () => { const l = mt('JR-East.SotetsuDirect'), y = mt('JR-East.Yokosuka'); let [p, u] = subPath(l.path, l.c, stArc(l, '武蔵小杉'), l.c.at(-1), l.under); let k = 0; const pc = cum(p); for (; k < p.length; k++) if (nearest(y.path, p[k], y.c)[2] > 12 && pc[k] > 200) break; k = Math.max(0, k - 25); return { p: p.slice(k), u: u.slice(k), sts: l.st.filter(s => nm(s.ja) === '羽沢横浜国大') }; };
// 大崎支線: 山手貨物線 (大崎) -> 品鶴線 (西大井の手前)
RAW.xO = () => { const l = mt('JR-East.OsakiBranch'), y = mt('JR-East.Yokosuka'); let [p, u] = subPath(l.path, l.c, 0, Math.min(l.c.at(-1), 4500), l.under); let k = 0; for (; k < p.length; k++) if (nearest(y.path, p[k], y.c)[2] < 6) break; return { p: p.slice(0, Math.min(p.length, k + 30)), u: u.slice(0, Math.min(p.length, k + 30)), sts: [] }; };
// 京葉線 二俣支線 (市川塩浜 - 西船橋) and 高谷支線 (西船橋 - 南船橋)
RAW.xF = () => { const l = mt('JR-East.KeiyoFutamataBranch'); const [p, u] = subPath(l.path, l.c, stArc(l, '市川塩浜') - 400, l.c.at(-1), l.under); return { p, u, sts: [] }; };
RAW.xK = () => { const l = mt('JR-East.KeiyoKoyaBranch'); const [p, u] = subPath(l.path, l.c, 0, stArc(l, '南船橋') + 400, l.under); return { p, u, sts: [] }; };
// 東海道新幹線: 東京〜品川 alongside the 東海道線, 品鶴線 alongside the 横須賀線 to 新川崎, then its own way via 新横浜 to the west edge
RAW.TK = () => {
  const t = mt('JR-East.Tokaido'), y = mt('JR-East.Yokosuka');
  const [p1] = subPath(t.path, t.c, 0, stArc(t, '品川') + 700);
  const yS = nearest(y.path, p1[p1.length - 1], y.c)[3];
  const [p2] = subPath(y.path, y.c, yS + 150, stArc(y, '新川崎') + 500);
  const wp = LLp([[35.5470, 139.6620], [35.5360, 139.6490], [35.5250, 139.6370], [35.5150, 139.6265], [35.5070, 139.6172], [35.5000, 139.6000], [35.4920, 139.5800], [35.4840, 139.5600], [35.4770, 139.5380], [35.4720, 139.5150], [35.4680, 139.4900], [35.4640, 139.4650], [35.4600, 139.4400], [35.4550, 139.4000]]);
  const [r3] = resampleU(wp, STEP, null); const p3 = smoothPts(r3, 120).filter(q => inB(q));
  const p = [...p1, ...p2.slice(1)], u = p.map(() => 0);
  const j = hermite(p[p.length - 1], tangent(p, p.length - 1), p3[3], tangent(p3, 3), 1.1);
  const all = [...p, ...j, ...p3.slice(4)];
  return { p: all, u: all.map(() => 0), sts: [{ ja: '東京', en: 'Tokyo', ...xzOf(t, '東京') }, { ja: '品川', en: 'Shinagawa', ...xzOf(t, '品川') }, { ja: '新横浜', en: 'Shin-Yokohama', ...xzOf(mt('JR-East.Yokohama'), '新横浜') }] };
};
// 東北新幹線: 東京〜秋葉原 alongside, tunnel under 上野 (地下駅), out before 日暮里, along the 京浜東北線 to 赤羽, along the 埼京線 to 大宮, north edge
RAW.TH = () => {
  const ut = mt('JR-East.Utsunomiya'), k = mt('JR-East.KeihinTohokuNegishi'), sa = mt('JR-East.SaikyoKawagoe');
  const [p1] = subPath(ut.path, ut.c, 0, stArc(ut, '上野'));
  const kU = nearest(k.path, p1[p1.length - 1], k.c)[3];
  const [p2] = subPath(k.path, k.c, kU, stArc(k, '赤羽') - 300); // KeihinTohoku runs 大宮 -> 大船: northbound = decreasing
  const sA = stArc(sa, '赤羽') + 500, sO = stArc(sa, '大宮');
  const [p3] = subPath(sa.path, sa.c, sA, sO);
  const uO = stArc(ut, '大宮');
  const [p4] = subPath(ut.path, ut.c, uO + 500, uO + 7000);
  const j23 = hermite(p2[p2.length - 1], tangent(p2, p2.length - 1), p3[0], tangent(p3, 0), 1.0);
  const j34 = hermite(p3[p3.length - 1], tangent(p3, p3.length - 1), p4[0], tangent(p4, 0), 1.0);
  const p = [...p1, ...p2.slice(1), ...j23, ...p3, ...j34, ...p4].filter(q => inB(q));
  // underground: 秋葉原の先 (御徒町) 〜 上野 〜 日暮里の手前
  const c = cum(p), sAki = nearest(p, xzA(ut, '上野'), c)[3];
  const u = c.map(s => (s > sAki - 1300 && s < sAki + 1700) ? 1 : 0);
  return { p, u, sts: [{ ja: '東京', en: 'Tokyo', ...xzOf(ut, '東京') }, { ja: '上野', en: 'Ueno', ...xzOf(ut, '上野') }, { ja: '大宮', en: 'Omiya', ...xzOf(ut, '大宮') }] };
};
function xzOf(l, name) { const s = l.st.find(q => nm(q.ja) === name); return { x: s.x, z: s.z }; }
function xzA(l, name) { const s = xzOf(l, name); return [s.x, s.z]; }

const rails = [];
for (const [code, ja, en, color, kind, src, o] of T) {
  const g = RAW[src] ? RAW[src]() : fromMT(src, o);
  if (!g) { console.log('  ! out of map', ja); continue; }
  let [p, u] = resampleU(g.p, STEP, g.u);
  if (o.loop) { // MT3D loop: drop the closing duplicate
    while (p.length > 2 && hyp(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < STEP * 0.6) { p.pop(); u.pop(); }
  }
  const r = { code, ja, en, color, kind, loop: !!o.loop, path: p, u, sts: g.sts, o };
  if (o.shin) r.shin = 1; if (o.conn) r.conn = 1;
  rails.push(r);
}

// ---------- corridors: coincident (< 10 m, parallel) surface points are spread to fixed slots
{
  const surf = rails.filter(r => r.kind === 'el');
  const G = 16, grid = new Map(), gk = (a, b) => a * 100003 + b;
  for (const r of surf) r.path.forEach((q, i) => { if (r.u[i]) return; const k = gk(Math.floor(q[0] / G), Math.floor(q[1] / G)); let A = grid.get(k); if (!A) grid.set(k, A = []); A.push([r, i]); });
  const pri = (r) => { const k = PRI.indexOf(r.code); return (k < 0 ? 99 : k) * 1000 + rails.indexOf(r); };
  const rankOf = (r) => RANK[r.code] ?? null;
  for (const r of surf) {
    const n = r.path.length, raw = new Float64Array(n);
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      if (r.u[i]) continue;
      const q = r.path[i], t = tangent(r.path, i, r.loop), mem = new Map([[r, t]]);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const A = grid.get(gk(Math.floor(q[0] / G) + a, Math.floor(q[1] / G) + b)); if (!A) continue; for (const [r2, j] of A) { if (r2 === r || mem.has(r2)) continue; const q2 = r2.path[j]; if (hyp(q2[0] - q[0], q2[1] - q[1]) > 15) continue; const t2 = tangent(r2.path, j, r2.loop); if (Math.abs(t[0] * t2[0] + t[1] * t2[1]) < 0.93) continue; mem.set(r2, t2); } }
      if (mem.size < 2) continue;
      // canonical direction: southward (or eastward for east-west corridors); right of it = west (or south)
      let cd = Math.abs(t[1]) >= Math.abs(t[0]) * 0.6 ? (t[1] > 0 ? t : [-t[0], -t[1]]) : (t[0] > 0 ? t : [-t[0], -t[1]]);
      const list = [...mem.keys()];
      // stable order: ranked lines by rank; unranked lines keep their priority order on the left (east / north) side
      const key = (x) => rankOf(x) ?? (-50 - pri(x) / 1000);
      list.sort((x, y) => key(x) - key(y));
      const k = list.indexOf(r), m = list.length;
      const o = (k - (m - 1) / 2) * SPACING; // to the right of cd
      const same = t[0] * cd[0] + t[1] * cd[1] > 0;
      raw[i] = same ? o : -o; cnt++;
    }
    if (!cnt) continue;
    const sig = 110 / STEP, Rr = Math.ceil(sig * 3), K = []; for (let k = -Rr; k <= Rr; k++) K.push(Math.exp(-(k * k) / (2 * sig * sig)));
    const sm = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = 0, ws = 0; for (let k = -Rr; k <= Rr; k++) { let j = i + k; if (r.loop) j = (j + n) % n; else if (j < 0 || j >= n) continue; s += raw[j] * K[k + Rr]; ws += K[k + Rr]; } sm[i] = s / ws; }
    r.off = sm;
  }
  for (const r of surf) { if (!r.off) continue; const P = r.path.map(q => q.slice()); for (let i = 0; i < P.length; i++) { const o = r.off[i]; if (Math.abs(o) < 0.05) continue; const t = tangent(P, i, r.loop); r.path[i] = [P[i][0] - t[1] * o, P[i][1] + t[0] * o]; } delete r.off; }
}
// ---------- smoothing (rounds the corners of the source polylines)
for (const r of rails) r.path = smoothPts(r.path, r.kind === 'tram' ? 10 : r.shin ? 40 : 26, r.loop);

// ---------- stations
for (const r of rails) {
  if (r.conn) { r.st = []; continue; }
  const c = cum(r.path), seen = new Set(), list = [];
  for (const s of r.sts || []) {
    const q = [s.x, s.z]; if (!inB(q, 0)) continue; const name = gameName(s.ja); if (seen.has(name)) continue;
    const n = nearest(r.path, q, c); const ends = (r.sts[0] === s || r.sts[r.sts.length - 1] === s); if (n[2] > (ends ? 600 : 140)) continue;
    seen.add(name); list.push({ ja: name, en: s.en, i: Math.min(r.path.length - 1, n[0] + (n[1] > 0.5 ? 1 : 0)), s: n[3] });
  }
  list.sort((a, b) => a.s - b.s);
  r.st = list.filter((s, k) => !k || s.s - list[k - 1].s > 40).map(s => ({ ja: s.ja, en: s.en, i: s.i }));
}

// ---------- heights
{
  const N = W.nodes, K = 'XABLR';
  const GS = 64, grid = new Map(); const gk = (a, b) => a * 100003 + b;
  const addSeg = (s) => { for (let a = Math.floor(Math.min(s[0], s[2]) / GS); a <= Math.floor(Math.max(s[0], s[2]) / GS); a++) for (let b = Math.floor(Math.min(s[1], s[3]) / GS); b <= Math.floor(Math.max(s[1], s[3]) / GS); b++) { const k = gk(a, b); let A = grid.get(k); if (!A) grid.set(k, A = []); A.push(s); } };
  for (const e of W.edges) { const k = K[e[2]]; if (k !== 'X' && k !== 'R') continue; const pts = [N[e[0]].slice(0, 2), ...(e[4] || []), N[e[1]].slice(0, 2)]; const c = cum(pts), len = c[c.length - 1];
    for (let i = 0; i + 1 < pts.length; i++) { const ya = k === 'X' ? 12 : N[e[0]][2] + (N[e[1]][2] - N[e[0]][2]) * c[i] / len, yb = k === 'X' ? 12 : N[e[0]][2] + (N[e[1]][2] - N[e[0]][2]) * c[i + 1] / len; addSeg([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], Math.max(ya, yb), 'X']); } }
  function inter(ax, az, bx, bz, cx, cz, dx, dz) { const r1 = bx - ax, r2 = bz - az, s1 = dx - cx, s2 = dz - cz, den = r1 * s2 - r2 * s1; if (Math.abs(den) < 1e-9) return null; const t = ((cx - ax) * s2 - (cz - az) * s1) / den, u = ((cx - ax) * r2 - (cz - az) * r1) / den; if (t < 0 || t > 1 || u < 0 || u > 1) return null; return [t, Math.abs(den) / (hyp(r1, r2) * hyp(s1, s2))]; }
  const pri = (r) => { const k = PRI.indexOf(r.code); return (k < 0 ? 99 : k) * 1000 + rails.indexOf(r); };
  // fixed obstacles first: trams (ground), AGT and monorails (their own heights)
  for (const r of rails) { if (r.kind === 'sub' || r.kind === 'el') continue; r.ys = r.path.map(() => r.kind === 'tram' ? 0.25 : 10); for (let i = 0; i + 1 < r.path.length; i++) addSeg([r.path[i][0], r.path[i][1], r.path[i + 1][0], r.path[i + 1][1], r.ys[i], 'L', r]); }
  for (const r of rails) if (r.kind === 'sub') r.ys = r.path.map(() => TUN);
  const order = rails.filter(r => r.kind === 'el').sort((a, b) => pri(a) - pri(b));
  for (const r of order) {
    const base = r.shin ? SHIN_BASE : BASE, p = r.path, n = p.length, c = cum(p), y = new Array(n).fill(base), under = r.u;
    const cons = [];
    for (let i = 0; i < n - (r.loop ? 0 : 1); i++) {
      if (under[i]) continue; const i2 = (i + 1) % n;
      const ax = p[i][0], az = p[i][1], bx = p[i2][0], bz = p[i2][1], seen = new Set();
      for (let a = Math.floor(Math.min(ax, bx) / GS); a <= Math.floor(Math.max(ax, bx) / GS); a++) for (let b = Math.floor(Math.min(az, bz) / GS); b <= Math.floor(Math.max(az, bz) / GS); b++) {
        const A = grid.get(gk(a, b)); if (!A) continue;
        for (const sg of A) { if (seen.has(sg) || sg[6] === r) continue; seen.add(sg); const h = inter(ax, az, bx, bz, sg[0], sg[1], sg[2], sg[3]); if (!h) continue; const [tt, sin] = h; if (sin < 0.12) continue;
          const s = c[i] + hyp(bx - ax, bz - az) * tt; const need = sg[5] === 'X' ? (sg[4] > 2 ? sg[4] + OVER_X - 12 : 0) : (sg[4] > 1.5 ? sg[4] + OVER_RAIL : 0); if (need > base) cons.push([s, need]); }
      }
    }
    for (const [s, h] of cons) { const i0 = Math.max(0, Math.floor((s - 600) / STEP)), i1 = Math.min(n - 1, Math.ceil((s + 600) / STEP)); for (let i = i0; i <= i1; i++) { const d = Math.abs(c[i] - s), v = h - Math.max(0, d - 45) * GRADE; if (v > y[i]) y[i] = v; } }
    const plat = r.shin ? 220 : 100;
    for (const st of r.st) { const s0 = c[st.i]; let m = 0; for (let i = 0; i < n; i++) if (Math.abs(c[i] - s0) < plat) m = Math.max(m, y[i]); for (let i = 0; i < n; i++) if (Math.abs(c[i] - s0) < plat) y[i] = m; }
    for (let i = 1; i < n; i++) y[i] = Math.max(y[i], y[i - 1] - GRADE * (c[i] - c[i - 1]));
    for (let i = n - 2; i >= 0; i--) y[i] = Math.max(y[i], y[i + 1] - GRADE * (c[i + 1] - c[i]));
    if (under.some(v => v)) {
      const dist = new Float64Array(n).fill(1e9);
      for (let i = 0; i < n; i++) if (under[i]) dist[i] = 0;
      for (let i = 1; i < n; i++) dist[i] = Math.min(dist[i], dist[i - 1] + (c[i] - c[i - 1]));
      for (let i = n - 2; i >= 0; i--) dist[i] = Math.min(dist[i], dist[i + 1] + (c[i + 1] - c[i]));
      for (let i = 0; i < n; i++) { const v = TUN + dist[i] * 0.04; if (v < y[i]) y[i] = v; }
    }
    r.ys = y.map(v => Math.round(v * 100) / 100);
    for (let i = 0; i + 1 < n; i++) addSeg([p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], Math.max(r.ys[i], r.ys[i + 1]), 'L', r]);
  }
}

// ---------- output
W.rails = rails.map(r => {
  const o = { code: r.code, ja: r.ja, en: r.en, color: r.color, kind: r.kind, loop: r.loop, path: r.path.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]), ys: r.ys, st: r.st };
  if (r.shin) o.shin = 1; if (r.conn) o.conn = 1;
  return o;
});
for (const r of W.rails) { const lv = {}; for (const v of r.ys) { const k = v < 0 ? 'tun' : v < 12 ? 'base' : v < 21 ? 'fly1' : 'fly2'; lv[k] = (lv[k] || 0) + 1; } console.log(r.code.padEnd(3), r.ja.padEnd(18), String(Math.round(cum(r.path).at(-1) / 100) / 10).padStart(5) + 'km', JSON.stringify(lv), r.st.length + '駅', r.st.slice(0, 3).map(s => s.ja).join(' '), '…', r.st.slice(-2).map(s => s.ja).join(' ')); }
fs.writeFileSync(OUT, JSON.stringify(W));
console.log('rails', W.rails.length, 'wrote', OUT);
