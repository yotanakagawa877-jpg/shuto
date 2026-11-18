// v5.0 scenarios (police, cars, NPC, military, suburbs, rail creator). Each returns a small JSON summary;
// T.issues collects invariant violations (NaN, below ground, floating …) as before.
const W8 = (ctx, ms) => ctx.page.waitForTimeout(ms);
export const V5S = {};
// leave the current car and remove it (the pools are small: a run of tests must not use them up)
const dropCar = () => { const g = __G; const c = g.P.car; g.P.mode === 'car' && g.PL.tryEnter(); if (c && g.P.mode !== 'car') { try { g.V.freeCar(c); } catch (e) {} c.removed = !0; } g.P.car = null; g.P.mode = 'foot'; };
const DROP = dropCar.toString();

// police vs a player on foot, ★1..5: patrol cars must stop short and never run the player over; no shots below ★3
V5S.police_foot = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X, out = [];
  for (let s = 1; s <= 5; s++) {
    await T.tp(-4867, -2166); g.POL.resetPolice && g.POL.resetPolice(); g.G.heat = 0; T.sim(1);
    const r0 = X.V5.stats.runOver, sh0 = X.V5.stats.shots.slice();
    g.POL.forceStars(s); g.P.hp = 100;
    let minD = 1e9, cops = 0, busted = 0;
    for (let k = 0; k < 40; k++) {
      T.sim(0.5);
      for (const c of g.G.cars) if (g.V.isCop(c) && !c.removed && c.ctl === 'police') minD = Math.min(minD, Math.hypot(c.x - g.P.x, c.z - g.P.z));
      cops = Math.max(cops, g.G.peds.filter((p) => (p.kind === 4 || p.kind === 11) && p.state === 'cop').length);
      if (X.V5.arrest || g.G.dying) { busted = 1; break; }
    }
    out.push({ s, minD: Math.round(minD * 10) / 10, cops, runOver: X.V5.stats.runOver - r0, shots: X.V5.stats.shots.map((v, i) => v - sh0[i]).reduce((a, b) => a + b, 0), busted, hp: Math.round(g.P.hp) });
    let k = 0; while ((X.V5.arrest || g.G.dying) && k++ < 40) T.sim(0.5);
  }
  return out;
});

// standing still in front of officers: ★1 = 職務質問 (fine, stars cleared), ★3 = arrest scene then BUSTED
V5S.police_stop = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X, out = [];
  for (const s of [1, 3]) {
    await T.tp(-4867, -2166); g.G.heat = 0; T.sim(1);
    g.G.money = 20000; const m0 = g.G.money; g.POL.forceStars(s);
    // an officer right next to the player
    const cop = g.PD && g.PD.spawnPedAt ? g.PD.spawnPedAt(g.P.x + 1.2, g.P.z, 'cop', 4) : null;
    cop && ((cop.state = 'cop'), (cop.t = 40));
    let seen = { arrest: 0, dying: 0 };
    for (let k = 0; k < 30; k++) { T.sim(0.5); X.V5.arrest && (seen.arrest = 1); g.G.dying && (seen.dying = 1); if (seen.dying || (s === 1 && g.G.heat === 0)) break; }
    out.push({ s, cop: !!cop, ...seen, stars: Math.floor(g.G.heat), paid: m0 - g.G.money });
    let k = 0; while ((X.V5.arrest || g.G.dying) && k++ < 40) T.sim(0.5);
  }
  return out;
});

// jump in front of a speeding patrol car (★2): it must brake
V5S.police_dart = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X, out = [];
  for (const sp of [12, 20, 28]) {
    const q = await T.roadPoint(-4867, -2166);
    g.G.heat = 0; T.sim(0.5); g.POL.forceStars(2);
    const c = X.newCar('police', q.x - q.dx * 50, q.z - q.dz * 50, Math.atan2(q.dx, q.dz), 'phys');
    if (!c) { out.push('no car'); continue; }
    Object.assign(c, { ctl: 'police', siren: !0, y: 0.04, vx: q.dx * sp, vz: q.dz * sp });
    g.P.mode = 'foot'; g.P.x = q.x; g.P.z = q.z; g.P.y = 0.2; g.P.hp = 100;
    const r0 = X.V5.stats.runOver;
    let minD = 1e9;
    for (let k = 0; k < 60; k++) { T.sim(0.1); minD = Math.min(minD, Math.hypot(c.x - g.P.x, c.z - g.P.z)); }
    out.push({ sp, minD: Math.round(minD * 10) / 10, runOver: X.V5.stats.runOver - r0, hp: Math.round(g.P.hp) });
    c.removed || (c.ctl = null);
  }
  return out;
});

// car chase: ★1 a patrol behind must not touch; ★3 a PIT from behind spins the car; roadblock + spikes flatten tyres
V5S.police_car = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X, out = {};
  const setup = async (stars) => {
    T.drop(); g.POL.resetPolice(); g.G.heat = 0;
    const q = await T.roadPoint(-4867, -2166);
    const yaw = Math.atan2(q.dx, q.dz);
    const c = X.newCar('sedan', q.x, q.z, yaw, 'phys');
    Object.assign(c, { y: 0.04, driver: !1, parked: !0 });
    g.P.x = q.x + 1.5; g.P.z = q.z; g.V.rebuildCarGrid(); g.PL.tryEnter();
    g.POL.forceStars(stars);
    for (const k of g.G.cars) g.V.isCop(k) && k !== c && (k.removed || ((k.ctl = null), (k.x += 4000)));
    const cop = X.newCar('police', q.x - q.dx * 14 - q.dz * 1.5, q.z - q.dz * 14 + q.dx * 1.5, yaw, 'phys');
    Object.assign(cop, { y: 0.04, ctl: 'police', siren: !0, vx: q.dx * 18, vz: q.dz * 18 });
    return { c, cop, q, yaw };
  };
  // ★1: player cruises at 14 m/s; the patrol follows without contact
  {
    const { c, cop, q, yaw } = await setup(1);
    let minD = 1e9, hp0 = c.hp;
    for (let k = 0; k < 60; k++) { c.yaw = yaw; c.vx = q.dx * 14; c.vz = q.dz * 14; T.sim(0.1); minD = Math.min(minD, Math.hypot(cop.x - c.x, cop.z - c.z)); }
    out.s1 = { minD: Math.round(minD * 10) / 10, hpLoss: Math.round(hp0 - c.hp), entered: g.P.car === c };
  }
  // ★3: the PIT role drives into the rear quarter
  {
    const { c, cop, q, yaw } = await setup(3);
    cop.role = 'pit'; const p0 = X.V5.stats.pit;
    let spun = 0;
    for (let k = 0; k < 80; k++) { if (!spun) { c.vx = q.dx * 14; c.vz = q.dz * 14; c.yaw = yaw; } T.sim(0.1); Math.abs(c.spin || 0) > 0.3 && (spun = 1); if (X.V5.stats.pit > p0) spun = 1; }
    out.s3 = { pit: X.V5.stats.pit - p0, spun };
  }
  // roadblock ahead + spike strip
  {
    const { c, q, yaw } = await setup(3);
    c.vx = q.dx * 14; c.vz = q.dz * 14; T.sim(0.2);
    const ok = X.v5Roadblock(); const b = X.V5.blocks[X.V5.blocks.length - 1];
    out.block = { ok, cars: b ? b.cars.length : 0 };
    if (b && b.spike) {
      const sp = b.spike, back = 30;
      c.x = sp.x - b.dx * back; c.z = sp.z - b.dz * back; c.yaw = Math.atan2(b.dx, b.dz);
      for (let k = 0; k < 40 && !c.flat; k++) { c.vx = b.dx * 12; c.vz = b.dz * 12; c.yaw = Math.atan2(b.dx, b.dz); T.sim(0.1); }
      out.block.flat = !!c.flat;
    }
  }
  T.drop(); g.POL.resetPolice(); g.G.heat = 0;
  return out;
});
// escaping: open street vs under a flyover vs inside a building vs a different car (★2)
V5S.police_hide = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X, out = {};
  const run = async (name, setup) => {
    await T.tp(-4867, -2166); g.G.heat = 0; T.sim(0.5);
    await setup(); g.POL.forceStars(2);
    if (name === 'swapcar') { T.sim(2); const old = g.P.car; T.drop(); T.carHere('compact'); }
    // remove the patrols so nobody sees the player, then time the escape
    for (const c of g.G.cars) g.V.isCop(c) && (c.removed || ((c.ctl = null), (c.siren = !1), (c.x += 3000)));
    let t = 0; while (g.G.heat >= 1 && t < 120) { T.sim(1); t++; }
    out[name] = { t, hid: X.V5.hid || null };
  };
  await run('open', async () => {});
  await run('under', async () => {
    // find an elevated deck nearby and stand under it
    const e = g.W.edges.find((e) => e && e.elev && e.kind === 'X' && Math.hypot(g.W.nodes[e.a].x + 4867, g.W.nodes[e.a].z + 2166) < 4000);
    if (e) { const q = g.X.edgePos ? g.X.edgePos(e, e.len / 2, {}) : null; q && (await T.tp(q.x, q.z, false), (g.P.x = q.x), (g.P.z = q.z), (g.P.y = 0.2)); }
  });
  await run('swapcar', async () => { T.carHere('sedan'); });
  return out;
});

// ---------- cars: barriers, ramps, drift, rollover
// hit expressway parapets at speed and at an angle: the car must stay on the deck (no fall, no tunnelling)
V5S.car_barrier = async (ctx) => ctx.ev(async () => {
  const g = __G, W = g.W, res = [];
  const xs = W.edges.filter((e) => e && (e.kind === 'X' || e.kind === 'R') && !e.tile && e.len > 300 && e.elev && Math.hypot(W.nodes[e.a].x, W.nodes[e.a].z) < 20000).filter((_, i) => i % 7 === 0).slice(0, 6);
  for (const e of xs) {
    for (const [ang, sp] of [[0.35, 30], [0.8, 22], [1.3, 18]]) {
      const q = g.X.edgePos(e, e.len / 2, {}), y = g.X.edgeY(e, e.len / 2);
      await g.X.tsPrefetch(q.x, q.z);
      T.drop();
      const c = g.X.newCar('sedan', q.x, q.z, Math.atan2(q.dx, q.dz), 'phys'); if (!c) { res.push('no car'); continue; }
      Object.assign(c, { y: y + 0.1, driver: !1, parked: !0 });
      g.P.x = q.x + 1.5; g.P.z = q.z; g.P.y = y + 0.3; g.V.rebuildCarGrid && g.V.rebuildCarGrid(); g.PL.tryEnter();
      if (g.P.mode !== 'car' || g.P.car !== c) { res.push('not entered'); c.removed = !0; continue; }
      const yaw = Math.atan2(q.dx, q.dz) + ang;
      Object.assign(c, { x: q.x, z: q.z, y: y + 0.1, yaw, vx: Math.sin(yaw) * sp, vz: Math.cos(yaw) * sp });
      let minY = 1e9, maxOff = 0;
      g.KEYS.KeyW = true;
      for (let k = 0; k < 45; k++) { T.sim(0.1); minY = Math.min(minY, c.y); const L = []; g.X.roadsNear(c.x, c.z, 30, L); const o = L.filter((h) => h.e.elev).sort((a, b) => a.d - b.d)[0]; o && (maxOff = Math.max(maxOff, o.d - o.e.hw)); }
      g.KEYS.KeyW = false;
      res.push({ e: e.i, ang, sp, dy: Math.round((y - minY) * 10) / 10, off: Math.round(maxOff * 10) / 10, hp: Math.round(c.hp), flip: !!c.flip });
      T.drop();
    }
  }
  return res;
});
// drift with the handbrake on dry / rain / snow: how far the car slides sideways
V5S.car_drift = async (ctx) => ctx.ev(async () => {
  const g = __G, out = [];
  const q = await T.roadPoint(-4867, -2166);
  for (const wx of ['dry', 'rain', 'snow']) {
    T.drop(); g.P.x = q.x; g.P.z = q.z; T.carHere('sport', Math.atan2(q.dx, q.dz)); const c = g.P.mode === 'car' && g.P.car; if (!c) { out.push('no car'); continue; }
    g.X.V4.snow = wx === 'snow' ? 1 : 0; g.X.V4.wx = wx === 'snow' ? 'snow' : null;
    const rain = g.R && g.X.rn ? null : null;
    Object.assign(c, { vx: Math.sin(c.yaw) * 22, vz: Math.cos(c.yaw) * 22 });
    g.KEYS.KeyW = true; T.sim(0.3); g.KEYS.KeyD = true; g.KEYS.Space = true; let mx = 0;
    for (let k = 0; k < 8; k++) { T.sim(0.1); mx = Math.max(mx, Math.abs(c.lat || 0)); }
    g.KEYS.Space = false; let after = 0; for (let k = 0; k < 8; k++) { T.sim(0.1); after = Math.max(after, Math.abs(c.lat || 0)); }
    g.KEYS.KeyD = false; g.KEYS.KeyW = false;
    out.push({ wx, hand: Math.round(mx * 10) / 10, after: Math.round(after * 10) / 10, v: Math.round(Math.hypot(c.vx, c.vz)), yaw: Math.round(c.yaw * 100) / 100 });
    T.drop(); T.sim(0.5);
  }
  g.X.V4.snow = 0; g.X.V4.wx = null;
  return out;
});
// T-bone at speed: spin, then roll a light car over; get out of a flipped car
V5S.car_rollover = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X;
  const q = await T.roadPoint(-4867, -2166);
  T.drop(); g.P.x = q.x; g.P.z = q.z; T.carHere('kei', Math.atan2(q.dx, q.dz)); const c = g.P.mode === 'car' && g.P.car;
  if (!c) return 'no car';
  const tr = X.newCar('truck', q.x - q.dz * 14, q.z + q.dx * 14, Math.atan2(-q.dz, q.dx) + Math.PI, 'phys');
  if (!tr) return 'no truck';
  Object.assign(tr, { y: 0.04, ctl: null, vx: q.dz * 26, vz: -q.dx * 26 });
  let flip = 0, spin = 0;
  for (let k = 0; k < 40; k++) { T.sim(0.05); c.flip && (flip = 1); Math.abs(c.spin || 0) > 0.2 && (spin = 1); }
  T.sim(2);
  const before = T.snap(); g.PL.tryEnter(); T.sim(1);
  return { flip, spin, hp: Math.round(c.hp), y: Math.round(c.y * 100) / 100, exited: g.P.mode === 'foot', before: before.mode };
});

// ---------- NPC
// intersections: AI cars stop for red; give way to a siren; peds cower at gunshots; onlookers at a crash
V5S.npc_basic = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X, out = {};
  T.drop(); await T.tp(-4867, -2166); T.sim(8);
  const ai = g.G.cars.filter((c) => c.mode === 'ai');
  out.persona = {}; for (const c of ai) out.persona[c.persona || 'none'] = (out.persona[c.persona || 'none'] || 0) + 1;
  out.stopS = ai.filter((c) => (c.why || '').startsWith('stopS')).length;
  // a siren coming up behind an AI car
  const a = ai.find((c) => c.v > 3 && !c.jc);
  if (a) {
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), pc = X.newCar('police', a.x - fx * 18, a.z - fz * 18, a.yaw, 'phys');
    pc && Object.assign(pc, { siren: !0, ctl: null, vx: fx * 16, vz: fz * 16, y: a.y });
    let pull = 0; for (let k = 0; k < 20; k++) { T.sim(0.1); a.pull && (pull = 1); }
    out.pull = pull; pc && ((pc.siren = !1), (pc.removed = !0));
  }
  // gunshot where the people are
  const near = (x, z) => g.G.peds.filter((p) => p.state !== 'down').sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))[0];
  const p0 = near(g.P.x, g.P.z);
  out.ped = p0 ? Math.round(Math.hypot(p0.x - g.P.x, p0.z - g.P.z)) : null;
  if (p0) {
    X.v5Gunshot(p0.x, p0.z);
    out.cower = g.G.peds.filter((p) => p.state === 'cower').length;
    T.sim(7); out.cowerAfter = g.G.peds.filter((p) => p.state === 'cower').length;
    T.sim(10);
    const p1 = near(g.P.x, g.P.z);
    X.v5Crash(p1.x + 6, p1.z, 14);
    out.gawk = g.G.peds.filter((p) => p.state === 'gawk').length;
    T.sim(25); out.gawkAfter = g.G.peds.filter((p) => p.state === 'gawk').length;
  }
  out.dogs = X.DOGS && X.DOGS.m ? X.DOGS.m.count : null;
  return out;
});

// ---------- 鉄道路線作成モード
// from the departure board of 新宿: ＋ 運行をつくる, add stops through the UI, odd names, save; then the API cases
V5S.rail_create = async (ctx) => {
  const p = ctx.page, out = {};
  // a menu left open by an earlier scenario would swallow the taps
  await ctx.page.evaluate(() => { for (const id of ['v4ov', 'v5ov']) { const o = document.getElementById(id); o && (o.hidden = true); } document.getElementById('stmenu').hidden = true; __G.pause(false); });
  const inside = await ctx.ev(async () => { const S = T.st('新宿'); const e = S.entrances[0]; await T.tp(e.x, e.z, false); __G.P.x = e.x; __G.P.z = e.z; __G.interact(); T.sim(0.5); const inn = !!__G.P.interior; inn && __G.doAction('trains'); return inn; });
  out.inside = inside;
  await p.waitForSelector('#stmenu', { state: 'visible', timeout: 15000 }).catch(() => {});
  out.mk = await p.$$eval('#stmenu .row', (rs) => rs.filter((r) => r.textContent.includes('運行をつくる')).length);
  await p.locator('#stmenu .row', { hasText: '運行をつくる' }).locator('button', { hasText: 'つくる' }).first().tap({ timeout: 10000 }).catch((e) => (out.e1 = e.message.slice(0, 80)));
  await p.waitForSelector('#v5ov', { state: 'visible', timeout: 10000 }).catch(() => {});
  // saving with only the first stop must be refused
  await p.locator('#v5ov .v5f button', { hasText: '保存' }).tap({ timeout: 8000 }).catch(() => {});
  out.err1 = await p.$eval('#v5ov .v5err', (e) => e.textContent).catch(() => '');
  // add two stops through the picker
  for (let i = 0; i < 2; i++) {
    await p.locator('#v5ov button[data-a="add"]').tap({ timeout: 8000 }).catch(() => {});
    await W8(ctx, 300);
    await p.locator('#v5ov button[data-i]').nth(i ? 6 : 3).tap({ timeout: 8000 }).catch((e) => (out['pick' + i] = e.message.slice(0, 60)));
    await W8(ctx, 300);
  }
  // an unconnected station: search for a tram stop name, it must be listed as not selectable
  await p.locator('#v5ov button[data-a="add"]').tap({ timeout: 8000 }).catch(() => {});
  await p.fill('#v5q', '荒川').catch(() => {});
  await p.locator('#v5ov button[data-a="q"]').tap({ timeout: 8000 }).catch(() => {});
  await W8(ctx, 300);
  out.noPick = await p.$$eval('#v5ov .v5no', (r) => r.length).catch(() => -1);
  await p.locator('#v5ov .v5f button', { hasText: '戻る' }).tap({ timeout: 8000 }).catch(() => {});
  // very long name with emoji, line code, free type
  await p.fill('#v5name', '🚄スーパー超特急ほのぼの号🌸'.repeat(6)).catch(() => {});
  await p.fill('#v5line', '<b>首都テスト線</b>').catch(() => {});
  await p.fill('#v5code', 'ST').catch(() => {});
  await p.fill('#v5every', '3').catch(() => {});
  await p.locator('#v5ov .v5f button', { hasText: '保存' }).tap({ timeout: 8000 }).catch((e) => (out.e2 = e.message.slice(0, 60)));
  await W8(ctx, 800);
  const st = await ctx.ev(() => {
    const g = __G, X = g.X, L = g.G.stats.usv || [];
    const d = L[L.length - 1];
    return { n: L.length, name: d && d.name, nameLen: d && [...d.name].length, line: d && d.line, way: d && d.way.map((w) => w.ja), trains: g.G.trains.filter((t) => t.usv).length, svs: X.USV.list.length };
  });
  Object.assign(out, st);
  // the new service is on the departure board
  out.board = await p.$$eval('#stmenu .row', (rs) => rs.map((r) => r.textContent).filter((t) => t.includes('首都テスト線') || t.includes('ほのぼの')).length).catch(() => -1);
  await p.locator('#stClose').tap({ timeout: 5000 }).catch(() => {});
  return out;
};
V5S.rail_api = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X, W = g.W, out = {};
  const usv = () => (g.G.stats.usv || (g.G.stats.usv = []));
  // through-running: a real service with 2+ legs gives a pair of stations on different rails that are connected
  const raw = W.svc.find((s) => s.legs.length >= 2 && !W.rails[s.legs[0][0]].shin);
  if (raw) {
    const r0 = W.rails[raw.legs[0][0]], r1 = W.rails[raw.legs[raw.legs.length - 1][0]];
    const a = r0.st[0], b = r1.st[r1.st.length - 1];
    const d = X.usvClean({ way: [{ ri: raw.legs[0][0], ja: a.ja }, { ri: raw.legs[raw.legs.length - 1][0], ja: b.ja }], veh: 'sub', allStop: !1, name: '直通テスト', every: 10 });
    const o = X.usvBuild(d);
    out.through = o.err || { legs: o.sv.L.length, rails: [...new Set(o.sv.L.map((l) => l.r.ja))], stops: o.sv.stops.length, km: Math.round(o.sv.U / 100) / 10 };
    o.sv && usv().push(d);
  }
  // unconnected: Toden Arakawa (tram) to Yamanote
  const tram = W.rails.findIndex((r) => r.kind === 'tram'), jy = W.rails.findIndex((r) => r.code === 'JY');
  if (tram >= 0 && jy >= 0) {
    const o = X.usvBuild(X.usvClean({ way: [{ ri: tram, ja: W.rails[tram].st[0].ja }, { ri: jy, ja: W.rails[jy].st[3].ja }] }));
    out.unconnected = o.err || 'built?!';
  }
  // ring: Yamanote all the way round
  if (jy >= 0) {
    const st = W.rails[jy].st;
    const d = X.usvClean({ way: [{ ri: jy, ja: st[0].ja }, { ri: jy, ja: st[14].ja }, { ri: jy, ja: st[28].ja }], loop: !0, allStop: !0, every: 4, name: '環状テスト' });
    const o = X.usvBuild(d);
    out.ring = o.err || { stops: o.sv.stops.length, loop: o.sv.loop };
    o.sv && usv().push(d);
  }
  // 0 / 1 stop
  out.zero = (X.usvBuild(X.usvClean({ way: [] })).err) || 'built?!';
  // max headway everywhere: the cap holds
  for (const d of usv()) d.every = 3;
  X.usvRebuild(); T.sim(2);
  out.trains = g.G.trains.filter((t) => t.usv).length;
  // share code round trip, broken codes
  const d0 = usv()[0];
  if (d0) {
    const c = X.usvCode(d0), back = X.usvParse(c);
    out.code = { len: c.length, ok: !back.err, same: back.def && back.def.name === d0.name };
    out.bad1 = X.usvParse('SHUTO-RAIL1:@@@').err;
    out.bad2 = X.usvParse(c.slice(0, c.length - 12)).err || 'parsed?!';
    out.bad3 = X.usvParse('hello').err;
  }
  // ride a custom train, then delete its service while riding: off at the next station
  const sv = X.USV.list[0];
  if (sv) {
    const st0 = sv.stops[0].st;
    const tr = g.G.trains.find((t) => t.sv === sv);
    if (tr) {
      g.P.mode = 'train'; g.P.train = tr; g.P.trainCar = 0; T.sim(3);
      out.ride = { type: tr.type, name: tr.sv.names && tr.sv.names[0] };
      g.G.stats.usv = usv().filter((d) => d.id !== sv.def.id); X.usvRebuild();
      let k = 0; while (g.P.mode === 'train' && k++ < 240) T.sim(1);
      out.afterDelete = { mode: g.P.mode, sec: k };
    }
  }
  // save -> load keeps the list
  const n0 = usv().length;
  g.saveGame(!0);
  g.G.stats.usv = []; X.usvRebuild();
  const s = JSON.parse(localStorage.getItem(X.slotKey ? X.slotKey() : 'shuto2.save'));
  out.saved = s && s.stats && (s.stats.usv || []).length;
  out.n0 = n0;
  return out;
});

// ---------- tanks / fighters / bases
// 朝霞: the base is built when near; inside = ★4; get in a parked tank, fire, drive, get out; the fence blocks
V5S.mil_tank = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X, M = X.MIL, out = {};
  T.drop(); g.POL.resetPolice(); g.G.heat = 0;
  const b = X.MIL_DATA.asaka;
  await T.tp(b.cx + 900, b.cz, true); T.sim(2);
  out.built = !!(M.built && M.built.b === b);
  out.gates = M.built ? M.built.gates.length : 0;
  // walk to a gate and in
  out.cars = M.built ? M.built.cars.map((c) => c.t) : null;
  const q = M.built && M.built.gates[0];
  if (q) {
    // from 15 m outside the gate to 40 m inside, 1 m per step
    const nx = b.cx - q.x, nz = b.cz - q.z, L = Math.hypot(nx, nz), ux = nx / L, uz = nz / L;
    for (let d = -15; d <= 40; d += 1) { g.P.x = q.x + ux * d; g.P.z = q.z + uz * d; T.sim(0.05); }
    T.sim(1);
  }
  out.stars = Math.floor(g.G.heat);
  const tank = M.built && M.built.cars.find((c) => c.t === 'tank' && !c.removed);
  tank && (out.tankAt = [Math.round(tank.x - b.cx), Math.round(tank.z - b.cz)]);
  out.tank = !!tank;
  if (tank) {
    g.P.x = tank.x + 3; g.P.z = tank.z; g.P.y = tank.y + 0.1; T.sim(0.2); g.PL.tryEnter();
    out.inTank = g.P.mode === 'car' && g.P.car === tank;
    T.sim(0.1);
    out.ui = !document.getElementById('v5wpn').hidden && document.getElementById('v5w1').textContent;
    M.b1 = true; T.sim(0.1); M.b1 = false; out.shells = M.shells.length; T.sim(3); out.explodedNear = Math.round(Math.hypot(tank.x - g.P.x, tank.z - g.P.z));
    M.b2 = true; T.sim(0.5); M.b2 = false;
    g.KEYS.KeyW = true; T.sim(4); g.KEYS.KeyW = false; out.moved = Math.round(Math.hypot(tank.x - b.cx, tank.z - b.cz));
    T.drop(); out.out = g.P.mode;
  }
  // try to walk out through the fence (not at a gate): must be stopped
  const r = b.ring, mx = (r[0][0] + r[1][0]) / 2, mz = (r[0][1] + r[1][1]) / 2;
  const inX = mx + (b.cx - mx) * 0.03, inZ = mz + (b.cz - mz) * 0.03;
  g.P.x = inX; g.P.z = inZ; T.sim(0.3);
  for (let k = 0; k < 20; k++) { g.P.x += (mx - b.cx) * 0.002; g.P.z += (mz - b.cz) * 0.002; T.sim(0.05); }
  out.fenceHeld = M.inside;
  g.POL.resetPolice(); g.G.heat = 0; T.sim(1);
  return out;
});
// 入間: a parked fighter, take off, guns and a missile, then bail out
V5S.mil_jet = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X, M = X.MIL, out = {};
  T.drop(); g.POL.resetPolice(); g.G.heat = 0;
  const b = X.MIL_DATA.iruma;
  await T.tp(b.cx + 1500, b.cz, true); T.sim(2);
  const f = M.built && M.built.air.find((a) => a.fighter);
  out.fighter = !!f;
  if (!f) return out;
  g.P.x = f.x + 4; g.P.z = f.z; g.P.y = f.y; T.sim(0.3);
  out.near = g.G.aircraft.filter((a) => a.kind === 'parked' && Math.hypot(a.x - g.P.x, a.z - g.P.z) < 30).map((a) => [a.fighter ? 'F' : 'p', Math.round(Math.hypot(a.x - g.P.x, a.z - g.P.z))]);
  out.fkind = f.kind; g.PL.tryEnter();
  out.mode = g.P.mode; out.isFighter = !!(g.P.air && g.P.air.fighter);
  g.KEYS.ShiftLeft = true; T.sim(14); g.KEYS.KeyS = true; T.sim(3); g.KEYS.KeyS = false; T.sim(10); g.KEYS.ShiftLeft = false;
  const a = g.P.air; out.alt = a && Math.round(a.y); out.kmh = a && Math.round(a.v * 3.6);
  M.b1 = true; T.sim(0.5); M.b1 = false; M.b2 = true; T.sim(0.1); M.b2 = false; out.missiles = M.missiles.length; T.sim(5);
  g.PL.tryEnter(); let k = 0; while (g.P.sky && k++ < 200) T.sim(1);
  out.end = g.P.mode;
  return out;
});
// ★5 for a while: tanks on the roads, fighters and an attack helicopter appear; nobody shoots through bystanders
V5S.mil_wanted5 = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X, M = X.MIL, out = {};
  T.drop(); await T.tp(-4867, -2166); g.POL.forceStars(5); g.P.hp = 100;
  let tanks = 0, jets = 0, ahs = 0;
  for (let k = 0; k < 60; k++) {
    g.G.heat = 5.5; g.P.hp = 100; T.sim(1);
    tanks = Math.max(tanks, g.G.cars.filter((c) => c.t === 'tank' && c.ctl === 'police' && !c.removed).length);
    jets = Math.max(jets, M.jets.length); ahs = Math.max(ahs, M.ahs.length);
    if (g.G.dying) break;
  }
  Object.assign(out, { tanks, jets, ahs });
  // shoot down: a missile at each enemy aircraft
  for (const j of [...M.jets, ...M.ahs]) j.hp = 0;
  T.sim(8);
  out.after = { jets: M.jets.length, ahs: M.ahs.length };
  g.POL.resetPolice(); g.G.heat = 0; T.sim(20);
  out.left = { jets: M.jets.length, ahs: M.ahs.length };
  return out;
});

// ---------- public facilities: police station (自首), hospital (治療), WASTED goes to the nearest hospital
V5S.fac_basic = async (ctx) => {
  const p = ctx.page, out = {};
  const r = await ctx.ev(async () => {
    const g = __G, X = g.X, o = {};
    T.drop(); g.POL.resetPolice(); g.G.heat = 0;
    const S = T.st('大宮');
    const f = X.facNearest('po', S.x, S.z, 4000, (n) => !n.endsWith('|k'));
    o.po = f && { name: f.name, d: Math.round(f.d) };
    if (f) { await T.tp(f.x, f.z, false); g.P.x = f.x + 4; g.P.z = f.z; T.sim(1.2); o.prompt = X.v5FacPrompt(); g.G.money = 50000; g.POL.forceStars(2); T.sim(0.2); g.interact(); }
    return o;
  });
  Object.assign(out, r);
  await W8(ctx, 500);
  out.rows = await p.$$eval('#v4ov .row', (rs) => rs.filter((x) => x.offsetParent).map((x) => x.textContent.slice(0, 24))).catch(() => []);
  await p.locator('#v4ov .row', { hasText: '自首' }).locator('button').first().tap({ timeout: 8000 }).catch((e) => (out.e1 = e.message.slice(0, 60)));
  out.after = await ctx.ev(() => ({ stars: Math.floor(__G.G.heat), money: __G.G.money }));
  const h = await ctx.ev(async () => {
    const g = __G, X = g.X, o = {};
    const f = X.facNearest('ho', g.P.x, g.P.z, 6000);
    o.ho = f && { name: f.name, d: Math.round(f.d) };
    // WASTED here: where do we wake up?
    g.P.hp = 0; g.HUD && 0; X.v5Places && (o.place = X.v5Places('wasted', g.P.x, g.P.z));
    o.placeD = o.place && Math.round(Math.hypot(o.place[0][0] - g.P.x, o.place[0][1] - g.P.z));
    g.P.hp = 100;
    return o;
  });
  Object.assign(out, h);
  await p.locator('#v4ov .close').tap({ timeout: 3000 }).catch(() => {});
  return out;
};
// fields / greenhouses / industry around the player in the outer ring; narrow-street traffic in a suburb
V5S.land_layer = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X, L = X.LUL, out = {};
  T.drop();
  let k = 0; while (!L.g && k++ < 60) { T.sim(0.5); await new Promise((r) => setTimeout(r, 200)); }
  out.loaded = !!L.g;
  if (!L.g) return out;
  // a field cell near 久喜 / 加須 and an industrial cell near 京葉臨海
  const find = (v, x, z) => { const G2 = L.g; for (let r = 0; r < 120; r++) for (let a = 0; a < 16; a++) { const px = x + Math.cos(a * 0.39) * r * 32, pz = z + Math.sin(a * 0.39) * r * 32; if (X.luAt(px, pz) === v) return [px, pz]; } return null; };
  const GH = [17936, -13808];
  for (const [name, v, x, z] of [['field', 1, -14000, -42000], ['greenhouse', 2, GH[0], GH[1]], ['industry', 3, 31212, 6657]]) {
    const q = find(v, x, z);
    if (!q) { out[name] = 'none'; continue; }
    await T.tp(q[0], q[1]); for (let i = 0; i < 12; i++) T.sim(0.6);
    let meshes = 0; for (const [, c] of L.chunks) c.g && meshes++;
    out[name] = { at: q.map(Math.round), chunks: L.chunks.size, meshes, heap: Math.round(performance.memory.usedJSHeapSize / 1e6) };
  }
  // drive through a field
  await T.tp(-14000, -42000); T.carHere('keitora'); g.KEYS.KeyW = true; T.sim(8); g.KEYS.KeyW = false; out.drive = T.snap(); T.drop();
  return out;
});
V5S.street_traffic = async (ctx) => ctx.ev(async () => {
  const g = __G, out = {};
  T.drop(); await T.tp(-33000, 3500); T.sim(20);
  const ai = g.G.cars.filter((c) => c.mode === 'ai' && !c.removed);
  out.ai = ai.length; out.onStreets = ai.filter((c) => c.e && c.e.tile).length; out.dead = ai.filter((c) => c.e && c.e.dead).length;
  // leave: tiles unload, nothing may be left on a dead street
  await T.tp(-4867, -2166); T.sim(10);
  out.deadAfter = g.G.cars.filter((c) => !c.removed && c.mode === 'ai' && c.e && c.e.dead).length;
  return out;
});
// long drive round the outer ring (streamdrive style) with heap readings
V5S.suburb_drive = async (ctx) => {
  const h0 = await ctx.heap();
  const r = await ctx.ev(async () => {
    const g = __G, res = [];
    for (const [x, z] of [[-38000, 2000], [-40000, 30000], [-20000, 44000], [10000, 46000], [36000, 30000], [38000, -10000], [30000, -40000], [-10000, -44000], [-36000, -30000]]) {
      await T.tp(x, z); for (let i = 0; i < 6; i++) T.sim(0.6);
      res.push([x, z, g.X.TS.tiles.size, g.X.TS.packs.size, g.X.LUL.chunks.size, Math.round(performance.memory.usedJSHeapSize / 1e6)]);
    }
    return res;
  });
  const h1 = await ctx.heap();
  return { h0, h1, r };
};
// earthquake and typhoon events: force each once, nothing breaks, they end by themselves; achievements / news counters
V5S.v5_events = async (ctx) => ctx.ev(async () => {
  const g = __G, X = g.X, out = {};
  T.drop(); await T.tp(-4867, -2166);
  for (const kind of ['quake', 'ty']) {
    const E = X.EVT; E.q = E.ty = null; E.t = 0;
    const r = Math.random; Math.random = () => (kind === 'quake' ? 0.1 : 0.9);
    T.sim(0.1); Math.random = r;
    out[kind] = { started: !!(kind === 'quake' ? E.q : E.ty) };
    let k = 0; while ((E.q || E.ty) && k++ < 240) T.sim(1);
    out[kind].sec = k; out[kind].ended = !(E.q || E.ty);
  }
  out.news = X.NEWS.q.length; out.ach = g.X.V4 ? null : null;
  return out;
});
V5S.save_probe = async (ctx) => ctx.ev(async () => {
  const g = __G, out = {};
  await T.tp(-2900, 1300);
  try { out.len = JSON.stringify(g.G.stats).length; } catch (e) { out.stringify = e.message; }
  const k = g.X.slotKey ? g.X.slotKey() : 'shuto2.save';
  localStorage.removeItem(k);
  g.saveGame(!0);
  const v = localStorage.getItem(k);
  out.key = k; out.saved = v ? v.length : null;
  try { localStorage.setItem('x5test', 'x'.repeat(1000)); out.lsOk = true; localStorage.removeItem('x5test'); } catch (e) { out.lsErr = e.message; }
  let tot = 0; for (let i = 0; i < localStorage.length; i++) { const kk = localStorage.key(i); tot += (localStorage.getItem(kk) || '').length; } out.lsTotal = tot; out.keys = localStorage.length;
  return out;
});
V5S.corner_probe = async (ctx) => ctx.ev(async () => {
  const g = __G, out = {};
  await T.tp(-43749, -46567, false); T.sim(1);
  const L = []; g.X.buildingsNear ? 0 : 0;
  out.gu = g.AC.groundUnder(-43749, -46567, 50);
  out.p = T.snap();
  return out;
});
