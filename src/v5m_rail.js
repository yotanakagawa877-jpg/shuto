// ===================== v5.0 鉄道路線作成モード (custom train services) =====================
// The player builds their own service on the existing tracks: stops, through-running onto connected lines, vehicle,
// cars, colours, type, names, headway, hours, top speed. Definitions live in G.stats.usv (saved with the slot);
// run-time services are built like the world's services (W.svc -> SV) and their trains are ordinary trains, so the
// departure boards, riding, driving and "次は" all work unchanged.
var USV = { graph: null, list: [], sig: '', t: 0 };
// approved performance budget: at most 12 custom trains at once
var V5_RAIL_CAP = 12;
var VEH = [
  { k: 'tsukin', ja: '通勤形', model: 'c', top: 120, cars: 10, body: '#c8ccd2', stripe: '#80c241' },
  { k: 'kinko', ja: '近郊形', model: 'c', top: 130, cars: 15, body: '#d7dbe0', stripe: '#f68b1e' },
  { k: 'ltd', ja: '特急形', model: 'l:e353', top: 160, cars: 9, body: '#eceef0', stripe: '#5b2c83' },
  { k: 'shin', ja: '新幹線形', model: 's:n700', top: 320, cars: 16, body: '#f5f5f0', stripe: '#1e50a2' },
  { k: 'sub', ja: '地下鉄形', model: 'c', top: 110, cars: 10, body: '#b8bcc4', stripe: '#00a7db' },
  { k: 'pvt', ja: '私鉄形', model: 'c', top: 120, cars: 10, body: '#e9e4d8', stripe: '#c8102e' },
  { k: 'mono', ja: 'モノレール・新交通', model: 'c', top: 80, cars: 6, body: '#eef0f2', stripe: '#2f6eb5' },
];
var TYPES5 = [
  ['各駅停車', '#80c241'], ['普通', '#9aa3ad'], ['快速', '#f68b1e'], ['急行', '#e60012'], ['特急', '#c8102e'],
  ['通勤快速', '#a05aa0'], ['ライナー', '#0068b7'], ['準急', '#00a040'], ['新幹線', '#1e50a2'],
];
var esc5 = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// at most n characters (code points, so emoji are not cut in half)
var cut5 = (s, n) => [...String(s ?? '').replace(/[\u0000-\u001f<>&"`]/g, '')].slice(0, n).join('').trim();

// ---------- the track graph: points of interest (stations, junctions) along each rail, junction hops between rails
function railGraph() {
  if (USV.graph) return USV.graph;
  const R5 = W.rails, poi = R5.map(() => []), jn = [];
  const key = (ri, s) => ri + '|' + Math.round(s);
  const addJ = (ra, sa, rb, sb) => {
    if (ra === rb && Math.abs(sa - sb) < 5) return;
    jn.push([ra, sa, rb, sb]);
    poi[ra].push({ s: sa, j: 1 });
    poi[rb].push({ s: sb, j: 1 });
  };
  // 1. hops used by the real services (through-running is known to be possible there)
  for (const raw of W.svc || [])
    for (let i = 1; i < raw.legs.length; i++) {
      const [ra, , ea] = raw.legs[i - 1], [rb, sb] = raw.legs[i];
      R5[ra] && R5[rb] && addJ(ra, ea, rb, sb);
    }
  // 2. track ends that run into another track at the same height (connections no service uses yet)
  const pt = {};
  for (let ri = 0; ri < R5.length; ri++) {
    const r = R5[ri];
    if (r.loop || !r.path || r.path.length < 2) continue;
    for (const end of [0, r.path.length - 1]) {
      const [x, z] = r.path[end], y = r.ys ? r.ys[end] : 0;
      let best = null;
      for (let rj = 0; rj < R5.length; rj++) {
        if (rj === ri) continue;
        const o = R5[rj];
        if (!o.path || !!o.shin !== !!r.shin) continue;
        for (let k = 0; k < o.path.length; k += 1) {
          const p = o.path[k], d = Math.abs(p[0] - x) + Math.abs(p[1] - z);
          if (d < 12 && (!best || d < best.d) && Math.abs((o.ys ? o.ys[k] : 0) - y) < 3) best = { d, rj, s: o.cum[k] };
        }
      }
      best && addJ(ri, r.cum[end], best.rj, best.s);
    }
  }
  // stations
  for (let ri = 0; ri < R5.length; ri++) for (const st of R5[ri].st || []) poi[ri].push({ s: st.s, st });
  // sort + merge points closer than 3 m (a station and a junction at the same place become one node)
  const adj = new Map(), node = (ri, s) => {
    const k = key(ri, s);
    adj.has(k) || adj.set(k, { k, ri, s, e: [] });
    return adj.get(k);
  };
  for (let ri = 0; ri < R5.length; ri++) {
    const L = poi[ri].sort((a, b) => a.s - b.s), r = R5[ri];
    let prev = null, first = null;
    for (const p of L) {
      const n = node(ri, p.s);
      p.st && (n.st = p.st);
      p.node = n;
      first || (first = n);
      prev && prev !== n && (prev.e.push([n, Math.abs(n.s - prev.s), 0]), n.e.push([prev, Math.abs(n.s - prev.s), 0]));
      prev = n;
    }
    // ring lines: close the ring
    r.loop && first && prev && first !== prev && (prev.e.push([first, r.len - prev.s + first.s, 1]), first.e.push([prev, r.len - prev.s + first.s, 1]));
  }
  for (const [ra, sa, rb, sb] of jn) {
    const a = node(ra, sa), b = node(rb, sb);
    a.e.push([b, 30, 2]);
    b.e.push([a, 30, 2]);
  }
  return (USV.graph = { adj, node, key });
}
// station node of a rail station object
function stNode(st) {
  const g = railGraph();
  for (let ri = 0; ri < W.rails.length; ri++) if ((W.rails[ri].st || []).includes(st)) return g.adj.get(g.key(ri, st.s));
  return null;
}
// Dijkstra from a set of start nodes; returns {dist: Map, prev: Map}
function railSearch(starts) {
  const dist = new Map(), prev = new Map(), H5 = [];
  const push = (n, d) => {
    H5.push([d, n]);
    let i = H5.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (H5[p][0] <= H5[i][0]) break;
      ([H5[p], H5[i]] = [H5[i], H5[p]]), (i = p);
    }
  };
  const pop = () => {
    const top = H5[0], last = H5.pop();
    if (H5.length) {
      H5[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        l < H5.length && H5[l][0] < H5[m][0] && (m = l);
        r < H5.length && H5[r][0] < H5[m][0] && (m = r);
        if (m === i) break;
        ([H5[m], H5[i]] = [H5[i], H5[m]]), (i = m);
      }
    }
    return top;
  };
  for (const s of starts) s && (dist.set(s, 0), push(s, 0));
  while (H5.length) {
    const [d, n] = pop();
    if (d > dist.get(n)) continue;
    for (const [m, w, kind] of n.e) {
      const nd = d + w;
      if (nd < (dist.has(m) ? dist.get(m) : 1e18)) (dist.set(m, nd), prev.set(m, [n, kind]), push(m, nd));
    }
  }
  return { dist, prev };
}
// node chain -> legs [[ri, s0, s1], ...]
function chainLegs(chain) {
  const legs = [];
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1].n, kind = chain[i].kind, b = chain[i].n;
    if (kind === 2) continue; // junction hop: the next movement starts a new leg
    const r = W.rails[a.ri];
    if (kind === 1) {
      // across the ring's seam: split in two
      const fwd = b.s < a.s;
      fwd ? (legs.push([a.ri, a.s, r.len]), legs.push([a.ri, 0, b.s])) : (legs.push([a.ri, a.s, 0]), legs.push([a.ri, r.len, b.s]));
      continue;
    }
    const L = legs[legs.length - 1];
    L && L[0] === a.ri && Math.abs(L[2] - a.s) < 4 && Math.sign(L[2] - L[1]) === Math.sign(b.s - a.s) ? (L[2] = b.s) : legs.push([a.ri, a.s, b.s]);
  }
  return legs.filter((l) => Math.abs(l[2] - l[1]) > 1);
}
// path between two station nodes as a node chain (with the kind of each step)
function railPath(a, b) {
  if (a === b) return [{ n: a, kind: 0 }];
  const { prev } = railSearch([a]);
  if (!prev.has(b)) return null;
  const nodes = [], kinds = [];
  for (let n = b; ; ) {
    nodes.push(n);
    if (n === a) break;
    const p = prev.get(n);
    kinds.push(p[1]);
    n = p[0];
  }
  nodes.reverse();
  kinds.reverse();
  // chain[i].kind = the kind of the step chain[i-1] -> chain[i]
  return nodes.map((n, i) => ({ n, kind: i ? kinds[i - 1] : 0 }));
}

// ---------- definition -> raw service (same shape as world.json svc)
function usvRaw(def) {
  const g = railGraph(), way = def.way.map((w) => {
    const r = W.rails[w.ri];
    const st = r && (r.st || []).find((s) => s.ja === w.ja);
    return st ? g.adj.get(g.key(w.ri, st.s)) : null;
  });
  if (way.length < 2 || way.some((w) => !w)) return { err: '停車駅が見つかりません' };
  let legs = [];
  const r0 = W.rails[def.way[0].ri];
  if (def.loop && r0 && r0.loop && def.way.every((w) => w.ri === def.way[0].ri)) {
    // 環状運転: one leg once round the ring, starting at the first stop
    legs = [[def.way[0].ri, way[0].s, way[0].s + r0.len]];
  } else
    for (let i = 1; i < way.length; i++) {
      const ch = railPath(way[i - 1], way[i]);
      if (!ch) return { err: `${def.way[i - 1].ja}→${def.way[i].ja} は線路がつながっていません` };
      legs = legs.concat(chainLegs(ch));
    }
  // merge the joins between sections
  const L2 = [];
  for (const l of legs) {
    const p = L2[L2.length - 1];
    p && p[0] === l[0] && Math.abs(p[2] - l[1]) < 4 && Math.sign(p[2] - p[1]) === Math.sign(l[2] - l[1]) ? (p[2] = l[2]) : L2.push(l.slice());
  }
  if (!L2.length) return { err: '経路が短すぎます' };
  // stations along the route: stop at the waypoints, at all of them for 各駅停車, minus the ones marked 通過
  const stops = [], seen = new Set(), wayNames = new Set(def.way.map((w) => w.ja)), skip = new Set(def.skip || []);
  L2.forEach(([ri, s0, s1], li) => {
    const r = W.rails[ri], lo = Math.min(s0, s1) - 3, hi = Math.max(s0, s1) + 3;
    (r.st || []).forEach((st, si) => {
      if ((st.s < lo || st.s > hi) && !(r.loop && st.s + r.len >= lo && st.s + r.len <= hi)) return;
      const stopHere = wayNames.has(st.ja) || (def.allStop && !skip.has(st.ja)) || (def.extra || []).includes(st.ja);
      const k = st.ja;
      stopHere && !seen.has(k + li) && (seen.add(k + li), stops.push([li, si]));
    });
  });
  // a station on the joint of two legs would be listed twice: drop repeats of the same name in a row
  const veh = VEH.find((v) => v.k === def.veh) || VEH[0];
  return {
    raw: {
      k: 'u' + def.id, user: !0, line: `${def.code ? def.code + ' ' : ''}${def.line || '自作路線'}`, type: def.type || '各駅停車', tc: def.tcol || '#80c241',
      names: def.name ? [def.name] : undefined, model: veh.model, cars: def.cars || veh.cars, n: 1, vm: 1,
      dest: [def.way[def.way.length - 1].ja, def.way[0].ja], legs: L2, stops, loop: !!def.loop,
    },
  };
}
// raw -> run-time service (the conversion of buildServices for one entry)
function usvBuild(def) {
  const o = usvRaw(def);
  if (o.err) return o;
  const raw = o.raw, legs = [];
  let u0 = 0;
  for (const [ri, s0, s1] of raw.legs) {
    const r = W.rails[ri], len = Math.abs(s1 - s0);
    legs.push({ r, ri, s0, s1, d: s1 >= s0 ? 1 : -1, u0, len });
    u0 += len;
  }
  const sv = { ...raw, L: legs, U: u0, stops: [], def };
  sv.kindOf = legs[0].r.kind === 'sub' ? 'el' : legs[0].r.kind;
  for (const [li, si] of raw.stops) {
    const lg = legs[li], st = lg && lg.r.st[si];
    if (!st) continue;
    let off = (st.s - lg.s0) * lg.d;
    lg.r.loop && off < -1 && (off += lg.r.len);
    sv.stops.push({ u: lg.u0 + (lg.r.loop ? off : Math.abs(st.s - lg.s0)), st, ja: st.ja });
  }
  sv.stops.sort((a, b) => a.u - b.u);
  sv.stops = sv.stops.filter((s, i, A) => !i || s.ja !== A[i - 1].ja || s.u - A[i - 1].u > 50);
  if (sv.stops.length < 2) return { err: '停車駅が2つ未満です' };
  sv.color = def.lcol || legs[0].r.color;
  sv.loop = !!(raw.loop && legs.length === 1 && legs[0].r.loop && Math.abs(legs[0].len - legs[0].r.len) < 30);
  sv.offA = sv.offB = !1;
  // speed: the chosen top speed, not above the vehicle's
  const veh = VEH.find((v) => v.k === def.veh) || VEH[0], spec = raw.model.startsWith('s:') ? 74 : (RAILSPEC[sv.kindOf] || RAILSPEC.el).vmax;
  sv.vm = Math.max(0.3, Math.min(veh.top, def.vkmh || veh.top) / 3.6 / spec);
  sv.liv = [new THREE.Color(def.body || veh.body).getHex(), new THREE.Color(def.stripe || veh.stripe).getHex(), new THREE.Color(def.body || veh.body).getHex()];
  return { sv };
}
// how many trains: one every `every` minutes on a round trip, within the cap shared by all custom services
function usvTrains(sv, left) {
  const v = Math.min(74, (sv.model.startsWith('s:') ? 74 : (RAILSPEC[sv.kindOf] || RAILSPEC.el).vmax) * sv.vm) * 0.55;
  const trip = (sv.loop ? sv.U : 2 * sv.U) / v + sv.stops.length * 30, every = Math.max(3, sv.def.every || 10) * 60;
  return Math.max(1, Math.min(left, Math.ceil(trip / every)));
}
function usvActive(sv) {
  const d = sv.def;
  if (!d || d.off) return !1;
  const h0 = d.h0 ?? 5, h1 = d.h1 ?? 24, t = R.tod;
  return h0 <= h1 ? t >= h0 && t < h1 : t >= h0 || t < h1;
}
// remove a service's trains (a train the player is on keeps running to its next stop, see usvTick)
function usvDrop(sv) {
  sv.dead = !0;
  for (const s of sv.stops) s.st.svc && (s.st.svc = s.st.svc.filter((x) => x !== sv));
  for (let i = G.trains.length - 1; i >= 0; i--) {
    const t = G.trains[i];
    if (t.sv !== sv) continue;
    t === P.train ? (t.orphan = !0) : G.trains.splice(i, 1);
  }
}
// rebuild every custom service from G.stats.usv (after load, edit, delete)
function usvRebuild() {
  for (const sv of USV.list) usvDrop(sv);
  USV.list = [];
  const defs = (G.stats.usv || []).filter((d) => !d.off);
  let left = V5_RAIL_CAP;
  for (const def of defs) {
    if (left <= 0) break;
    const o = usvBuild(def);
    if (o.err) continue;
    const sv = o.sv;
    for (const s of sv.stops) (s.st.svc || (s.st.svc = [])).push(sv);
    USV.list.push(sv);
    const n = usvTrains(sv, left);
    left -= n;
    for (let k = 0; k < n; k++) {
      const back = !sv.loop && k % 2 === 1, ut = sv.loop ? (sv.U * k) / n : It((sv.U * (k + 0.5)) / n, 40, sv.U - 40);
      const tr = spawnTrain(sv, back, ut);
      tr.liv = sv.liv;
      tr.usv = 1;
    }
  }
  USV.sig = JSON.stringify(G.stats.usv || []);
}
function usvTick(dt) {
  if ((USV.t -= dt) > 0) return;
  USV.t = 1;
  // load / slot change: the definitions changed under us
  const sig = JSON.stringify(G.stats.usv || []);
  sig !== USV.sig && G.trains && G.trains.length && usvRebuild();
  // hours: trains outside them stand hidden ('off'), inside them run
  for (const t of G.trains) {
    if (!t.usv) continue;
    const on = usvActive(t.sv);
    !on && t.state !== 'off' && t !== P.train ? ((t.state = 'off'), (t.dwell = 1e9)) : on && t.state === 'off' && t.dwell > 1e8 && (t.dwell = Math.random() * 20);
  }
  // the player's train belongs to a deleted service: let them off at the next station
  const t = P.train;
  if (t && t.orphan && P.mode === 'train' && t.state === 'dwell' && !t.drive) {
    leaveTrain();
    const i = G.trains.indexOf(t);
    i >= 0 && G.trains.splice(i, 1);
    toast('この運行は削除されたため、ここで降車しました');
  }
}

// ---------- share code: SHUTO-RAIL1:<base64 of the definition with rails named by line code>
function usvCode(def) {
  const o = { ...def, id: void 0, way: def.way.map((w) => ({ c: W.rails[w.ri].code, r: W.rails[w.ri].ja, j: w.ja })) };
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return 'SHUTO-RAIL1:' + btoa(s);
}
function usvParse(code) {
  try {
    const m = String(code || '').trim().match(/^SHUTO-RAIL1:([A-Za-z0-9+/=]+)$/);
    if (!m) return { err: 'コードの形式が違います（SHUTO-RAIL1: で始まる文字列）' };
    const bin = atob(m[1]), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const o = JSON.parse(new TextDecoder().decode(u8));
    if (!o || !Array.isArray(o.way) || o.way.length < 2) return { err: '停車駅の情報がありません' };
    const way = [];
    for (const w of o.way) {
      const ri = W.rails.findIndex((r) => r.code === w.c && r.ja === w.r);
      const r = W.rails[ri];
      if (!r || !(r.st || []).some((s) => s.ja === w.j)) return { err: `${w.r || '?'} の ${w.j || '?'} 駅が見つかりません` };
      way.push({ ri, ja: w.j });
    }
    const def = usvClean({ ...o, way });
    const t = usvBuild(def);
    return t.err ? { err: t.err } : { def };
  } catch (e) {
    return { err: 'コードが壊れています' };
  }
}
// sanitise a definition (names, ranges)
function usvClean(d) {
  const veh = VEH.find((v) => v.k === d.veh) || VEH[0], col = (c, f) => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : f);
  return {
    id: d.id || Date.now().toString(36) + Math.floor(Math.random() * 1e4),
    name: cut5(d.name, 24), line: cut5(d.line, 24) || '自作路線', code: cut5(d.code, 4), lcol: col(d.lcol, '#ffd23f'),
    type: cut5(d.type, 12) || '各駅停車', tcol: col(d.tcol, '#80c241'), veh: veh.k,
    cars: It(Math.round(+d.cars || veh.cars), 1, veh.k === 'shin' ? 16 : veh.k === 'mono' ? 6 : 15),
    body: col(d.body, veh.body), stripe: col(d.stripe, veh.stripe),
    every: It(Math.round(+d.every || 10), 3, 120), h0: It(Math.round(+(d.h0 ?? 5)), 0, 23), h1: It(Math.round(+(d.h1 ?? 24)), 1, 24),
    vkmh: It(Math.round(+d.vkmh || veh.top), 30, veh.top), loop: !!d.loop, allStop: !!d.allStop, off: !!d.off,
    way: (d.way || []).map((w) => ({ ri: w.ri, ja: w.ja })), skip: (d.skip || []).slice(0, 400), extra: (d.extra || []).slice(0, 400),
  };
}

// ---------- UI
function v5ov() {
  let ov = document.getElementById('v5ov');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'v5ov';
    ov.className = 'ov';
    ov.style.cssText = 'background:rgba(5,6,10,.9);align-items:center;justify-content:center;z-index:10';
    ov.innerHTML = '<div class="panel scroll v5p"><h2></h2><div class="v5b"></div><div class="v5f"></div></div>';
    document.body.appendChild(ov);
  }
  return ov;
}
function v5Open(title, html, foot) {
  const ov = v5ov();
  ov.querySelector('h2').textContent = title;
  ov.querySelector('.v5b').innerHTML = html;
  const f = ov.querySelector('.v5f');
  f.innerHTML = '';
  for (const [text, fn, cls] of foot) {
    const b = document.createElement('button');
    b.textContent = text;
    cls && (b.className = cls);
    b.onclick = (e) => (e.stopPropagation(), fn());
    f.appendChild(b);
  }
  ov.hidden = !1;
  ov.querySelector('.panel').scrollTop = 0;
  return ov;
}
function v5Close() {
  const ov = document.getElementById('v5ov');
  ov && (ov.hidden = !0);
}
function v5Err(msg) {
  const ov = v5ov(), e = ov.querySelector('.v5err');
  e ? (e.textContent = msg) : toast(msg);
  toast(msg);
}

// entry from the departure board of station complex S
function usvStart(S) {
  const sts = S.lines.map((L) => L.st).filter(Boolean);
  if (!sts.length) return toast('この駅からは作れません');
  const st = sts[0], ri = W.rails.findIndex((r) => (r.st || []).includes(st));
  usvEdit(usvClean({ way: [{ ri, ja: st.ja }], veh: W.rails[ri].shin ? 'shin' : W.rails[ri].kind === 'mono' || W.rails[ri].kind === 'ats' ? 'mono' : 'tsukin', allStop: !0, h0: 5, h1: 24 }), !0, S);
}
// reachable stations from the last waypoint, nearest first
function usvReach(def) {
  const g = railGraph(), last = def.way[def.way.length - 1], r = W.rails[last.ri];
  const st = r && r.st.find((s) => s.ja === last.ja), a = st && g.adj.get(g.key(last.ri, st.s));
  const { dist } = railSearch([a]), out = [];
  for (const [n, d] of dist) n.st && d > 1 && out.push({ ri: n.ri, ja: n.st.ja, d, line: W.rails[n.ri].ja, col: W.rails[n.ri].color });
  const best = new Map();
  for (const o of out.sort((a, b) => a.d - b.d)) best.has(o.ja + '|' + o.ri) || best.set(o.ja + '|' + o.ri, o);
  return [...best.values()];
}
function usvEdit(def, isNew, S) {
  USV.draft = def;
  USV.draftNew = isNew;
  const veh = VEH.find((v) => v.k === def.veh) || VEH[0];
  const way = def.way.map((w, i) => `<span class="v5chip">${i ? '→ ' : ''}${esc5(w.ja)}<small>${esc5(W.rails[w.ri] ? W.rails[w.ri].ja : '')}</small></span>`).join('');
  const typeOpts = TYPES5.map(([t]) => `<option${t === def.type ? ' selected' : ''}>${t}</option>`).join('') + `<option value="__free"${TYPES5.some(([t]) => t === def.type) ? '' : ' selected'}>自由入力</option>`;
  const vehOpts = VEH.map((v) => `<option value="${v.k}"${v.k === def.veh ? ' selected' : ''}>${v.ja}（最高 ${v.top} km/h）</option>`).join('');
  const hours = (sel) => Array.from({ length: 25 }, (_, h) => `<option${h === sel ? ' selected' : ''}>${h}</option>`).join('');
  // stations on the route (for 停車 / 通過)
  const b = usvBuild(def), along = [];
  if (b.sv) {
    const names = new Set();
    for (const lg of b.sv.L) {
      const lo = Math.min(lg.s0, lg.s1), hi = Math.max(lg.s0, lg.s1);
      const L = (lg.r.st || []).filter((s) => s.s >= lo - 3 && s.s <= hi + 3).sort((x, y) => (lg.d > 0 ? x.s - y.s : y.s - x.s));
      for (const s of L) names.has(s.ja) || (names.add(s.ja), along.push(s.ja));
    }
  }
  const wn = new Set(def.way.map((w) => w.ja));
  const mid = along.filter((n) => !wn.has(n));
  const stopRows = mid.length
    ? mid.map((n) => {
        const on = def.allStop ? !(def.skip || []).includes(n) : (def.extra || []).includes(n);
        return `<label class="v5tg"><input type="checkbox" data-st="${esc5(n)}"${on ? ' checked' : ''}>${esc5(n)}</label>`;
      }).join('')
    : '<small>途中駅はありません</small>';
  const html = `
<div class="v5err" style="color:#ff7a6b;font-weight:700"></div>
<div class="v5sec">経路（停車駅）</div>
<div class="v5way">${way}</div>
<div class="v5row"><button data-a="add">＋ 停車駅を追加</button>${def.way.length > 1 ? '<button data-a="undo">最後の駅を外す</button>' : ''}<label class="v5tg"><input type="checkbox" id="v5loop"${def.loop ? ' checked' : ''}>環状運転</label></div>
<div class="v5sec">途中駅の停車（${def.allStop ? 'チェック＝停車、外す＝通過' : 'チェックした駅にも停車'}）</div>
<div class="v5row"><label class="v5tg"><input type="checkbox" id="v5all"${def.allStop ? ' checked' : ''}>途中の駅にすべて停車（各駅）</label></div>
<div class="v5stops">${stopRows}</div>
<div class="v5sec">車両</div>
<div class="v5grid">
<label>車両<select id="v5veh">${vehOpts}</select></label>
<label>両数<input id="v5cars" type="number" min="1" max="16" value="${def.cars}"></label>
<label>車体色<input id="v5body" type="color" value="${def.body}"></label>
<label>帯の色<input id="v5stripe" type="color" value="${def.stripe}"></label>
</div>
<div class="v5sec">種別・名前</div>
<div class="v5grid">
<label>種別<select id="v5type">${typeOpts}</select></label>
<label>種別（自由入力）<input id="v5typef" maxlength="40" value="${TYPES5.some(([t]) => t === def.type) ? '' : esc5(def.type)}" placeholder="種別で「自由入力」を選ぶ"${TYPES5.some(([t]) => t === def.type) ? ' disabled' : ''}></label>
<label>種別の色<input id="v5tcol" type="color" value="${def.tcol}"></label>
<label>列車名・愛称<input id="v5name" maxlength="60" placeholder="例：ひかり号" value="${esc5(def.name)}"></label>
<label>路線名<input id="v5line" maxlength="60" value="${esc5(def.line)}"></label>
<label>路線記号<input id="v5code" maxlength="8" placeholder="例：SH" value="${esc5(def.code)}"></label>
<label>ラインカラー<input id="v5lcol" type="color" value="${def.lcol}"></label>
</div>
<div class="v5sec">運行</div>
<div class="v5grid">
<label>本数（分おき）<input id="v5every" type="number" min="3" max="120" value="${def.every}"></label>
<label>運転開始（時）<select id="v5h0">${hours(def.h0)}</select></label>
<label>運転終了（時）<select id="v5h1">${hours(def.h1)}</select></label>
<label>最高速度 km/h<input id="v5v" type="number" min="30" max="${veh.top}" value="${def.vkmh}"></label>
</div>
<small style="color:#8a93a3">自作の運行は同時に最大 ${V5_RAIL_CAP} 編成まで走ります。</small>`;
  const ov = v5Open(isNew ? '運行をつくる' : '運行を編集', html, [
    ['保存', () => usvSave(), 'v5ok'],
    ['やめる', () => (v5Close(), S && departMenu(S))],
  ]);
  const read = () => usvReadForm(ov, def);
  ov.querySelector('[data-a="add"]').onclick = () => (read(), usvPick(USV.draft, S));
  const u = ov.querySelector('[data-a="undo"]');
  u && (u.onclick = () => (read(), USV.draft.way.pop(), usvEdit(USV.draft, isNew, S)));
  ov.querySelector('#v5all').onchange = () => (read(), usvEdit(USV.draft, isNew, S));
  ov.querySelector('#v5type').onchange = (e) => {
    const f = ov.querySelector('#v5typef'), free = e.target.value === '__free';
    f.disabled = !free;
    free ? f.focus() : (f.value = '');
    // a preset type brings its colour
    const t = TYPES5.find(([n]) => n === e.target.value);
    t && (ov.querySelector('#v5tcol').value = t[1]);
  };
  ov.querySelector('#v5veh').onchange = () => {
    read();
    const v = VEH.find((x) => x.k === USV.draft.veh);
    Object.assign(USV.draft, { cars: v.cars, body: v.body, stripe: v.stripe, vkmh: v.top });
    usvEdit(USV.draft, isNew, S);
  };
  USV.editS = S;
}
function usvReadForm(ov, def) {
  const q = (id) => ov.querySelector('#' + id), d = USV.draft;
  if (!q('v5veh')) return d;
  d.veh = q('v5veh').value;
  d.cars = +q('v5cars').value;
  d.body = q('v5body').value;
  d.stripe = q('v5stripe').value;
  const ts = q('v5type').value;
  d.type = ts === '__free' ? q('v5typef').value : ts;
  d.tcol = q('v5tcol').value;
  d.name = q('v5name').value;
  d.line = q('v5line').value;
  d.code = q('v5code').value;
  d.lcol = q('v5lcol').value;
  d.every = +q('v5every').value;
  d.h0 = +q('v5h0').value;
  d.h1 = +q('v5h1').value;
  d.vkmh = +q('v5v').value;
  d.loop = q('v5loop').checked;
  d.allStop = q('v5all').checked;
  const chk = [...ov.querySelectorAll('.v5stops input[data-st]')];
  d.allStop ? (d.skip = chk.filter((c) => !c.checked).map((c) => c.dataset.st)) : (d.extra = chk.filter((c) => c.checked).map((c) => c.dataset.st));
  return d;
}
// choose the next stop: reachable stations nearest first, with a name filter; unconnected stations are shown greyed
function usvPick(def, S, filter = '') {
  const reach = usvReach(def), set = new Set(reach.map((o) => o.ja));
  const f = filter.trim(), L = (f ? reach.filter((o) => o.ja.includes(f) || o.line.includes(f)) : reach).slice(0, 80);
  let extra = '';
  if (f) {
    const miss = [];
    for (const r of W.rails) for (const s of r.st || []) s.ja.includes(f) && !set.has(s.ja) && miss.push(s.ja + '（' + r.ja + '）');
    miss.length && (extra = `<div class="v5sec">選べない駅</div>` + [...new Set(miss)].slice(0, 12).map((m) => `<div class="v5no">${esc5(m)}<small>線路がつながっていないため選べません</small></div>`).join(''));
  }
  const rows = L.map((o, i) => `<div class="row"><i style="background:${o.col || '#888'}"></i><b>${esc5(o.ja)}<small style="display:block;color:#8a93a3;font-weight:500">${esc5(o.line)}　約${(o.d / 1000).toFixed(1)} km</small></b><button data-i="${i}">ここに停車</button></div>`).join('');
  const ov = v5Open('停車駅を追加', `<canvas id="v5map" width="640" height="300" style="width:100%;height:auto;border-radius:8px;background:#0a0d12;touch-action:none"></canvas><small style="color:#8a93a3">地図の駅（緑＝選べる、灰＝線路がつながっていない）をタップ</small><div class="v5row"><input id="v5q" placeholder="駅名・路線名で絞り込み" value="${esc5(f)}"><button data-a="q">検索</button></div>${rows || '<small>つながっている駅がありません</small>'}${extra}`, [['戻る', () => usvEdit(def, USV.draftNew, S)]]);
  usvMap(ov.querySelector('#v5map'), def, reach, (o) => (def.way.push({ ri: o.ri, ja: o.ja }), usvEdit(def, USV.draftNew, S)));
  ov.querySelector('[data-a="q"]').onclick = () => usvPick(def, S, ov.querySelector('#v5q').value);
  ov.querySelectorAll('button[data-i]').forEach((b) => {
    b.onclick = () => {
      const o = L[+b.dataset.i];
      def.way.push({ ri: o.ri, ja: o.ja });
      usvEdit(def, USV.draftNew, S);
    };
  });
}
function usvSave() {
  const ov = v5ov(), d = usvClean(usvReadForm(ov, USV.draft));
  if (d.way.length < 2) return v5Err('停車駅を2つ以上選んでください（始発と終点）');
  const b = usvBuild(d);
  if (b.err) return v5Err(b.err);
  if (d.loop && !b.sv.loop) d.loop = !1;
  const L = G.stats.usv || (G.stats.usv = []), i = L.findIndex((x) => x.id === d.id);
  if (i < 0 && L.length >= 20) return v5Err('つくれる運行は20系統までです');
  i >= 0 ? (L[i] = d) : L.push(d);
  usvRebuild();
  v5Close();
  toast(`「${d.name || d.type + ' ' + d.way[d.way.length - 1].ja + '行き'}」の運行を始めました`);
  news(`新しい列車「${d.name || d.type}」${d.way[0].ja}〜${d.way[d.way.length - 1].ja}で運行開始`);
  v4Stats();
  USV.editS ? departMenu(USV.editS) : usvList();
}
function usvList(S) {
  const L = G.stats.usv || [];
  const rows = L.map((d, i) => {
    const run = USV.list.some((s) => s.def.id === d.id);
    return `<div class="row"><i style="background:${d.lcol}"></i><b>${esc5(d.code ? d.code + ' ' : '')}${esc5(d.line)}　<span style="color:${d.tcol}">${esc5(d.type)}</span> ${esc5(d.name)}<small style="display:block;color:#8a93a3;font-weight:500">${esc5(d.way[0].ja)} → ${esc5(d.way[d.way.length - 1].ja)}　${d.every}分おき　${d.off ? '運行停止中' : run ? '運行中' : '上限のため待機'}</small></b>
<button data-a="e" data-i="${i}">編集</button><button data-a="c" data-i="${i}">複製</button><button data-a="o" data-i="${i}">${d.off ? '再開' : '停止'}</button><button data-a="x" data-i="${i}">共有</button><button data-a="d" data-i="${i}">削除</button></div>`;
  }).join('');
  const ov = v5Open('つくった運行', (rows || '<small>まだありません。駅の発車案内の「＋ 運行をつくる」から作れます。</small>') + '<div class="v5sec">共有コードを読み込む</div><div class="v5row"><input id="v5code_in" placeholder="SHUTO-RAIL1:…"><button data-a="imp">読み込む</button></div><div class="v5err" style="color:#ff7a6b;font-weight:700"></div>', [['閉じる', () => (v5Close(), S && departMenu(S))]]);
  ov.querySelectorAll('button[data-a]').forEach((b) => {
    const i = +b.dataset.i, d = L[i];
    b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'e') return (USV.editS = null), usvEdit(JSON.parse(JSON.stringify(d)), !1, null);
      if (a === 'c') {
        if (L.length >= 20) return v5Err('つくれる運行は20系統までです');
        L.push(usvClean({ ...JSON.parse(JSON.stringify(d)), id: null, name: cut5((d.name || d.type) + '（コピー）', 24) }));
      } else if (a === 'o') d.off = !d.off;
      else if (a === 'd') L.splice(i, 1);
      else if (a === 'x') {
        const c = usvCode(d);
        const ov2 = v5Open('共有コード', `<p>このコードを送ると、相手の「コードを読み込む」で同じ運行を作れます。</p><textarea id="v5share" readonly style="width:100%;height:120px">${c}</textarea>`, [['コピー', () => { try { navigator.clipboard.writeText(c); toast('コピーしました'); } catch (e) { toast('コピーできませんでした（長押しで選択してください）'); } }], ['戻る', () => usvList(S)]]);
        ov2.querySelector('#v5share').select();
        return;
      } else if (a === 'imp') {
        const r = usvParse(ov.querySelector('#v5code_in').value);
        if (r.err) return v5Err(r.err);
        if (L.length >= 20) return v5Err('つくれる運行は20系統までです');
        L.push(r.def);
        toast('運行を読み込みました');
      }
      usvRebuild();
      usvList(S);
    };
  });
}

// the picker's map: rails in grey, reachable stations green (tap to add), the rest grey, the last stop yellow; 30 km wide
function usvMap(cv, def, reach, pick) {
  if (!cv) return;
  const c = cv.getContext('2d'), W5 = cv.width, H5 = cv.height, last = def.way[def.way.length - 1], r0 = W.rails[last.ri];
  const st0 = r0 && r0.st.find((s) => s.ja === last.ja);
  if (!st0) return;
  let sc = W5 / 30000;
  const ox = st0.x, oz = st0.z, X = (x) => W5 / 2 + (x - ox) * sc, Z = (z) => H5 / 2 + (z - oz) * sc;
  const draw = () => {
    c.fillStyle = '#0a0d12';
    c.fillRect(0, 0, W5, H5);
    c.lineWidth = 1;
    for (const r of W.rails) {
      c.strokeStyle = r.color || '#555';
      c.globalAlpha = 0.45;
      c.beginPath();
      r.path.forEach((p, i) => (i % 4 && i !== r.path.length - 1 ? 0 : i ? c.lineTo(X(p[0]), Z(p[1])) : c.moveTo(X(p[0]), Z(p[1]))));
      c.stroke();
    }
    c.globalAlpha = 1;
    const ok = new Set(reach.map((o) => o.ri + '|' + o.ja));
    for (let ri = 0; ri < W.rails.length; ri++)
      for (const s of W.rails[ri].st || []) {
        const x = X(s.x), z = Z(s.z);
        if (x < -5 || z < -5 || x > W5 + 5 || z > H5 + 5) continue;
        const g = ok.has(ri + '|' + s.ja);
        c.fillStyle = g ? '#6be29a' : '#555b66';
        c.beginPath();
        c.arc(x, z, g ? 3.2 : 2, 0, 6.3);
        c.fill();
      }
    def.way.forEach((w, i) => {
      const r = W.rails[w.ri], s = r && r.st.find((q) => q.ja === w.ja);
      s && ((c.fillStyle = i === def.way.length - 1 ? '#ffd23f' : '#ffffff'), c.beginPath(), c.arc(X(s.x), Z(s.z), 5, 0, 6.3), c.fill());
    });
  };
  draw();
  cv.onclick = (e) => {
    const b = cv.getBoundingClientRect(), mx = ((e.clientX - b.left) / b.width) * W5, mz = ((e.clientY - b.top) / b.height) * H5;
    let best = null, bd = 18;
    for (const o of reach) {
      const r = W.rails[o.ri], s = r.st.find((q) => q.ja === o.ja), d = Math.hypot(X(s.x) - mx, Z(s.z) - mz);
      d < bd && ((bd = d), (best = o));
    }
    if (best) return pick(best);
    // a grey station: say why it cannot be chosen
    for (const r of W.rails) for (const s of r.st || []) if (Math.hypot(X(s.x) - mx, Z(s.z) - mz) < 10) return v5Err(`${s.ja}（${r.ja}）は線路がつながっていないため選べません`);
  };
}
