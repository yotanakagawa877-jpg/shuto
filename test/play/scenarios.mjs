// each scenario: async (ctx) => summary object. Problems are reported through T.note / console errors / frozen checks.
const W8 = (ctx, ms) => ctx.page.waitForTimeout(ms);
export const SCEN = {
  // ---------- normal play
  async missions(ctx) {
    return ctx.ev(async () => {
      const g = __G, MS = g.MS, MI = g.MI, P = g.P, out = [];
      for (const m of MI.MISSIONS) {
        await T.tp(m.start[0], m.start[1], false);
        P.x = m.start[0]; P.z = m.start[1];
        T.startM(m);
        let guard = 0;
        while (MS.cur === m && guard++ < 40) {
          const s = m.steps[MS.step];
          const tgt = MS.target;
          if (s.t === 'shop') g.doAction('buy');
          else if (s.t === 'go') {
            if (s.vehicle && P.mode !== 'car') T.carHere('sedan');
            if (P.mode === 'car' && P.car) { await g.X.tsPrefetch(s.to[0], s.to[1]); P.car.x = s.to[0]; P.car.z = s.to[1]; P.car.v = 0; P.car.vx = P.car.vz = 0; }
            else { await g.X.tsPrefetch(s.to[0], s.to[1]); P.x = s.to[0]; P.z = s.to[1]; P.y = T.gy(P.x, P.z) + 0.1; }
          } else if (s.t === 'enter') {
            if (s.kind === 'car') { const c = MS.st.car || g.G.cars.find((c) => c.keep && !c.ctl && !c.removed); if (c) { P.x = c.x + 1.5; P.z = c.z; P.y = c.y + 0.1; g.PL.tryEnter(); } else T.carHere(); }
            else { const a = g.G.aircraft.filter((a) => (s.kind === 'heli' ? a.kind === 'heli' : a.kind === 'parked')).sort((p, q) => Math.hypot(p.x - P.x, p.z - P.z) - Math.hypot(q.x - P.x, q.z - P.z))[0];
              if (a) { P.x = a.x + 1; P.z = a.z + 1; P.y = a.y; g.PL.tryEnter(); } }
          } else if (s.t === 'station') { const S = T.st(s.name); const e = S.entrances[0]; await T.tp(e.x, e.z, false); P.x = e.x; P.z = e.z; g.interact(); }
          else if (s.t === 'ride') { if (P.interior) g.doAction('exit'); MI.missionEvent('alight', { st: { ja: s.to } }); }
          else if (s.t === 'race') { for (const cp of MS.st.cps.slice(MS.st.ci)) { P.car.x = cp[0]; P.car.z = cp[1]; T.sim(0.1); } }
          else if (s.t === 'chase') { const c = MS.st.car; if (c) { c.hp = 0; c.dead = true; } }
          else if (s.t === 'heat') { /* updMissions forces the stars */ }
          else if (s.t === 'evade') { g.GTA && (g.G.heat = 0); g.POL.resetPolice && g.POL.resetPolice(); }
          else if (s.t === 'photo') { const L = g.W.landmarks[s.at]; if (P.car) { P.car.x = L.x + 30; P.car.z = L.z + 30; } else { P.x = L.x + 30; P.z = L.z + 30; } MI.missionEvent('photo'); }
          else if (s.t === 'rings') { for (const r of MS.st.rings) { if (P.air) { P.air.x = r[0]; P.air.y = r[1]; P.air.z = r[2]; } T.sim(0.1); } }
          else if (s.t === 'wheel' || s.t === 'coaster') { const tg = MS.target; if (tg) { await T.tp(tg[0], tg[1], false); P.x = tg[0] + (s.t === 'wheel' ? 0 : 0); P.z = tg[1]; } if (s.t === 'coaster') { const c = g.X.COASTERS[0]; let b = c, bd = 1e18; for (const q of g.X.COASTERS) { const d = Math.hypot(q.P[0][0] - P.x, q.P[0][1] - P.z); d < bd && ((bd = d), (b = q)); } P.x = b.P[0][0]; P.z = b.P[0][1]; } g.interact(); let k = 0; while (g.X.V4.ride && k++ < 400) T.sim(0.5); }
          else if (s.t === 'bet') { const tg = MS.target; await T.tp(tg[0], tg[1], false); P.x = tg[0]; P.z = tg[1]; g.interact(); const b = document.querySelector('#v4ov .v4l button'); b && b.click(); let k = 0; while (g.X.V4.race && k++ < 600) T.sim(0.5); }
          else if (s.t === 'land') { const a = P.air; if (a) { a.x = s.to[0]; a.z = s.to[1]; a.y = T.gy(a.x, a.z) + 0.2; a.v = 0; a.vx = a.vz = 0; a.vy = 0; } }
          T.sim(0.5);
        }
        out.push([m.id, MS.done.has(m.id) ? 'passed' : 'stuck at ' + (MS.cur ? MS.cur.steps[MS.step].t : 'failed')]);
        if (MS.cur) g.MI.fail('test');
        if (P.mode === 'car') g.PL.tryEnter();
        if (P.air) { P.air.v = 0; P.air.vx = P.air.vz = 0; g.PL.tryEnter(); }
      }
      return out;
    });
  },
  async drive(ctx) {
    const a = await ctx.ev(async () => {
      await T.tp(-4867, -2166); T.carHere('sedan');
      const s0 = T.snap(); T.key('KeyW', true); T.sim(12); const s1 = T.snap();
      T.key('KeyD', true); T.sim(3); T.key('KeyD', false); T.sim(8); T.key('KeyW', false); T.sim(4);
      return [s0, s1, T.snap(), __G.G.stats.distance];
    });
    await W8(ctx, 3000); await ctx.shot('drive_view');
    return a;
  },
  async wrongway(ctx) {
    return ctx.ev(async () => {
      const g = __G; const e = g.W.edges.find((e) => e.kind === 'A' && e.ow && e.len > 300 && !e.tile && Math.abs(g.W.nodes[e.a].x + 2000) < 9000 && Math.abs(g.W.nodes[e.a].z) < 9000);
      if (!e) return 'no one-way edge';
      const q = g.X.edgePos(e, e.len * 0.8, {});
      await T.tp(q.x, q.z, false);
      T.carHere('sedan', Math.atan2(-q.dx, -q.dz));
      T.key('KeyW', true); T.sim(20); T.key('KeyW', false); T.sim(3);
      return T.snap();
    });
  },
  async crash_building(ctx) {
    return ctx.ev(async () => {
      const g = __G; await T.tp(500, -3400); T.carHere('sport');
      // aim at the nearest building
      const ids = []; g.WD.buildingsNear(g.P.car.x, g.P.car.z, 60, ids); const B = g.W.bld; let best = null, bd = 1e9;
      for (const id of ids) { const o = id * 9; if (B[o + 6] < 3) continue; const d = Math.hypot(B[o] - g.P.car.x, B[o + 1] - g.P.car.z); if (d < bd && d > 12) { bd = d; best = [B[o], B[o + 1]]; } }
      if (best) { g.P.car.yaw = Math.atan2(best[0] - g.P.car.x, best[1] - g.P.car.z); }
      T.key('KeyW', true); T.sim(8); T.key('KeyW', false); T.sim(2);
      const s = T.snap(); const ids2 = []; g.WD.buildingsNear(g.P.car.x, g.P.car.z, 1, ids2);
      let inside = false; for (const id of ids2) { const o = id * 9; const B2 = g.W.bld; if (B2[o + 6] > 2 && Math.hypot(B2[o] - g.P.car.x, B2[o + 1] - g.P.car.z) < Math.min(B2[o + 3], B2[o + 4]) / 2 - 1) inside = true; }
      if (inside) T.note('car-inside-building', JSON.stringify(s.car));
      // on foot: walk into a wall
      g.PL.tryEnter(); g.TOUCH.y = 1; T.sim(6); g.TOUCH.y = 0;
      return { s, target: best, dist: Math.round(bd) };
    });
  },
  async water(ctx) {
    const r = await ctx.ev(async () => {
      const g = __G; const w = T.findWater(3500, 2500, 6000) || T.findWater(0, 0, 9000); if (!w) return 'no water';
      await T.tp(w[0] - Math.cos(w[2]) * 40, w[1] - Math.sin(w[2]) * 40, false);
      T.carHere('sedan', Math.atan2(Math.cos(w[2]), Math.sin(w[2])));
      const s0 = T.snap(); T.key('KeyW', true); T.sim(10); T.key('KeyW', false); T.sim(8); const s1 = T.snap(); T.sim(10);
      // walk into water on foot
      const w2 = T.findWater(g.P.x, g.P.z, 3000); if (w2) { await T.tp(w2[0], w2[1], false); g.P.yaw = Math.atan2(Math.cos(w2[2]), Math.sin(w2[2])); g.TOUCH.y = 1; T.sim(8); g.TOUCH.y = 0; T.sim(5); }
      return { w, s0, s1, end: T.snap() };
    });
    return r;
  },
  async expressway(ctx) {
    return ctx.ev(async () => {
      const g = __G, W = g.W; const res = [];
      const xs = W.edges.filter((e) => e.kind === 'X' && !e.tile && e.len > 400 && W.nodes[e.a].y > 10 && W.nodes[e.b].y > 10 && Math.hypot(W.nodes[e.a].x, W.nodes[e.a].z) < 15000).slice(0, 3);
      for (const e of xs) {
        const q = g.X.edgePos(e, e.len / 2, {}); const y = g.X.edgeY(e, e.len / 2);
        await g.X.tsPrefetch(q.x, q.z);
        g.P.mode = 'foot'; g.P.x = q.x; g.P.z = q.z; g.P.y = y + 0.3; T.carHere('sedan', Math.atan2(q.dx, q.dz));
        if (g.P.car) { g.P.car.x = q.x; g.P.car.z = q.z; g.P.car.y = y + 0.1; g.P.car.yaw = Math.atan2(q.dx, q.dz); }
        T.key('KeyW', true); T.sim(15); const a = T.snap();
        // steer hard into the parapet / off the side
        T.key('KeyA', true); T.sim(4); T.key('KeyA', false); T.sim(6); T.key('KeyW', false); T.sim(3);
        res.push({ y0: Math.round(y), a, b: T.snap() });
        g.PL.tryEnter();
      }
      return res;
    });
  },
  async train(ctx) {
    const inside = await ctx.ev(async () => { const S = T.st('新宿'); const e = S.entrances[0]; await T.tp(e.x, e.z, false); __G.P.x = e.x; __G.P.z = e.z; __G.interact(); T.sim(0.5); const inn = !!__G.P.interior; inn && __G.doAction('trains'); return inn; });
    await W8(ctx, 1500);
    const lines = await ctx.page.$$eval('#stmenu .row', (rs) => rs.map((r) => r.textContent.trim().slice(0, 30)));
    // tap the first departure button of the first line
    await ctx.page.tap('#stmenu .row button').catch(() => {});
    await W8(ctx, 1500);
    const sub = await ctx.page.$$eval('#stmenu .row', (rs) => rs.map((r) => r.textContent.trim().slice(0, 30))).catch(() => []);
    if (await ctx.page.isVisible('#stmenu')) { await ctx.page.tap('#stmenu .row button').catch(() => {}); await W8(ctx, 1500); }
    const r = await ctx.ev(async () => {
      const g = __G, P = g.P;
      if (P.mode !== 'train') { const S = T.st('新宿'); const e = S.entrances[0]; if (P.interior) g.doAction('exit'); P.x = e.x; P.z = e.z; const rail = g.W.rails.find((r) => r.code === 'JY'); if (!g.PL.boardTrain(rail, 1)) return 'board failed'; T.note('harness', 'station UI did not board; used boardTrain'); }
      for (let k = 0; k < 20 && !P.train; k++) T.sim(0.5);
      if (!P.train) return 'no train after boarding';
      const a = T.snap(); T.sim(40); const b = T.snap();
      const n = g.TR.skipToNext(P.train); T.sim(2); const c = T.snap();
      return { a, b, next: n && n.ja, c };
    });
    await W8(ctx, 2500); await ctx.shot('train_ride');
    // irregular: jump off while running
    const j = await ctx.ev(async () => {
      const P = __G.P; let k = 0; while (P.mode === 'train' && P.train.state === 'dwell' && k++ < 60) T.sim(1);
      T.sim(8); return T.snap();
    });
    await ctx.page.keyboard.press('KeyL'); await W8(ctx, 4000);
    const after = await ctx.ev(() => { T.sim(6); return T.snap(); });
    return { inside, lines, sub, r, beforeJump: j, after };
  },
  async train_drive(ctx) {
    return ctx.ev(async () => {
      const g = __G, P = g.P; const S = T.st('東京'); const e = S.entrances[0]; await T.tp(e.x, e.z, false); P.x = e.x; P.z = e.z;
      const rail = g.W.rails.find((r) => r.code === 'JT'); if (!g.PL.boardTrain(rail, 1)) return 'board failed';
      const tr = P.train; Object.assign(tr, { drive: true, notch: 0, doors: true, state: 'dwell', dwell: 2, target: null }); P.trainCar = 0;
      T.sim(1); g.interact(); T.sim(4);
      const out = []; for (let i = 0; i < 6; i++) { tr.state === 'dwell' && g.interact(); g.KEYS.KeyW = true; T.sim(10); out.push([Math.round(tr.v * 3.6), tr.state, Math.round(tr.s)]); }
      g.KEYS.KeyW = false; g.KEYS.KeyS = true; T.sim(20); g.KEYS.KeyS = false; out.push([Math.round(tr.v * 3.6), tr.state]);
      return out;
    });
  },
  async bus(ctx) {
    const a = await ctx.ev(async () => {
      const g = __G; const S = T.st('渋谷'); await T.tp(S.x + 80, S.z + 80);
      // nearest stop sign
      const stops = Object.values(g.X.lg ? {} : {});
      return T.snap();
    });
    // use the real UI: walk to a stop via the game's own search, then tap the menu
    const b = await ctx.ev(async () => {
      const g = __G; let best = null;
      for (const s of Object.values(g.X.STOPS)) { if (!s.routes.length) continue; const d = Math.hypot(s.x - g.P.x, s.z - g.P.z); if (!best || d < best[0]) best = [d, s]; }
      if (!best) return 'no stops list';
      const s = best[1]; await T.tp(s.sides[0][0], s.sides[0][1], false); g.P.x = s.sides[0][0]; g.P.z = s.sides[0][1]; g.interact(); return { stop: s.name, d: Math.round(best[0]), routes: s.routes.map((r) => r.code) };
    });
    await W8(ctx, 1500);
    const btns = await ctx.page.$$eval('#stmenu button', (bs) => bs.map((b) => b.textContent.trim().slice(0, 20)));
    if (btns.length > 1) { await ctx.page.tap('#stmenu button:not(#stClose)'); await W8(ctx, 1200); }
    const btn2 = await ctx.page.$$eval('#stmenu button', (bs) => bs.map((b) => b.textContent.trim().slice(0, 20)));
    if (btn2.length > 1) { await ctx.page.tap('#stmenu button:not(#stClose)'); await W8(ctx, 1500); }
    const c = await ctx.ev(() => { let k = 0; while (__G.RIDE.kind !== 'bus' && k++ < 120) T.sim(1); const a = T.snap(); T.sim(20); __G.interact(); T.sim(3); return { waited: k, a, s: T.snap(), ride: __G.RIDE.kind }; });
    return { a, b, btns, btn2, c };
  },
  async taxi(ctx) {
    await ctx.ev(async () => { await T.tp(-2900, 1300); });
    await ctx.page.tap('#bX').catch(() => {}); await W8(ctx, 800);
    const near = await ctx.ev(() => { const g = __G; let k = 0; while (g.P.mode !== 'ride' && k++ < 90) T.sim(1); return { waited: k, mode: g.P.mode }; });
    await W8(ctx, 2000);
    const menu = await ctx.page.$$eval('#stmenu button', (bs) => bs.map((b) => b.textContent.trim().slice(0, 16)));
    if (menu.length > 1) { await ctx.page.tap('#stmenu button:not(#stClose)'); await W8(ctx, 1500); }
    const m2 = await ctx.page.$$eval('#stmenu button', (bs) => bs.map((b) => b.textContent.trim().slice(0, 16)));
    if (m2.length > 1) { await ctx.page.tap('#stmenu button:not(#stClose)'); await W8(ctx, 1500); }
    const s = await ctx.ev(() => { T.sim(20); return T.snap(); });
    return { near, menu, m2, s, ride: await ctx.ev(() => __G.RIDE.kind) };
  },
  async fly(ctx) {
    const r = await ctx.ev(async () => {
      const g = __G, P = g.P; const a = g.G.aircraft.find((a) => a.kind === 'parked' && !a.small);
      await T.tp(a.x + 3, a.z + 3, false); P.x = a.x + 2; P.z = a.z + 2; P.y = a.y;
      if (!g.PL.tryEnter()) return 'enter failed';
      const s0 = T.snap(); g.KEYS.ShiftLeft = true; T.sim(25); const s1 = T.snap();
      g.KEYS.KeyS = true; T.sim(4); g.KEYS.KeyS = false; T.sim(30); g.KEYS.ShiftLeft = false; const s2 = T.snap();
      return { s0, s1, s2 };
    });
    await W8(ctx, 2000); await ctx.shot('fly_air');
    // irregular: jump out of the flying plane, skydive
    const j = await ctx.ev(() => { const g = __G, P = g.P; g.PL.tryEnter(); const a = T.snap(); let k = 0, open = null; while (k++ < 300) { T.sim(1); if (!open && P.sky && P.sky.open) open = Math.round(P.y); if (P.mode === 'foot' && !P.sky && P.y - T.gy(P.x, P.z, P.y + 2) < 0.5) break; } return { a, open, end: T.snap(), sec: k, sky: !!P.sky }; });
    return { r, j };
  },
  async heli(ctx) {
    return ctx.ev(async () => {
      const g = __G, P = g.P; const h = g.G.aircraft.find((a) => a.kind === 'heli' && !a.crashed); if (!h) return 'no heli';
      await T.tp(h.x + 2, h.z + 2, false); P.x = h.x + 1; P.z = h.z + 1; P.y = h.y;
      if (!g.PL.tryEnter()) return 'enter failed';
      g.KEYS.ShiftLeft = true; T.sim(8); g.KEYS.ShiftLeft = false; g.KEYS.KeyW = true; T.sim(15); g.KEYS.KeyW = false; const s = T.snap();
      g.PL.tryEnter(); let k = 0; while (!(P.mode === 'foot' && P.onGround) && k++ < 200) T.sim(1);
      return { s, end: T.snap(), sec: k, heliCrashed: h.crashed };
    });
  },
  // ---------- irregular play
  async wanted5(ctx) {
    return ctx.ev(async () => {
      const g = __G; await T.tp(-4867, -2166); T.carHere('sport'); g.POL.forceStars(5);
      g.KEYS.KeyW = true; const out = [];
      for (let i = 0; i < 6; i++) { g.KEYS.KeyD = i % 2 === 0; T.sim(10); out.push(T.snap()); }
      g.KEYS.KeyW = g.KEYS.KeyD = false;
      // on foot with 5 stars until busted / wasted / respawn
      g.PL.tryEnter(); g.POL.forceStars(5); T.sim(60);
      return { out: out.map((s) => [s.mode, s.stars, s.car && s.car.v, s.hp]), end: T.snap(), cops: g.G.cars.filter((c) => g.V.isCop(c)).length };
    });
  },
  async map_edges(ctx) {
    return ctx.ev(async () => {
      const g = __G, b = g.W.ext.bounds; const Ay = Math.cos(35.64 * Math.PI / 180) * 111320, QS = 110950;
      const Pe = (lat, lng) => [(lng - 139.755) * Ay, -(lat - 35.64) * QS];
      const [x0, z0] = Pe(b.lat1, b.lng0), [x1, z1] = Pe(b.lat0, b.lng1);
      const spots = [[x0 + 600, z0 + 600, -2.4], [x1 - 600, z0 + 600, 2.4], [x0 + 600, z1 - 600, -0.8], [x1 - 600, z1 - 600, 0.8], [(x0 + x1) / 2, z0 + 400, Math.PI], [x0 + 400, (z0 + z1) / 2, -Math.PI / 2]];
      const out = [];
      for (const [x, z, yaw] of spots) {
        const s0 = await T.tp(x, z); const ok = T.carHere('sedan', yaw);
        if (g.P.car) g.P.car.yaw = yaw;
        g.KEYS.KeyW = true; T.sim(25); g.KEYS.KeyW = false; T.sim(2);
        const s = T.snap(); out.push({ start: [Math.round(x), Math.round(z)], ok, end: s.car ? [s.car.x, s.car.z] : [s.x, s.z], inside: s.x >= x0 - 1 && s.x <= x1 + 1 && s.z >= z0 - 1 && s.z <= z1 + 1, tiles: g.X.TS.tiles.size, fails: g.X.TS.fails });
        g.PL.tryEnter();
        // on foot past the edge
        g.P.x = x; g.P.z = z; g.P.yaw = yaw; g.TOUCH.y = 1; T.sim(10); g.TOUCH.y = 0;
      }
      return { bounds: [x0, z0, x1, z1].map(Math.round), out };
    });
  },
  async spam(ctx) {
    await ctx.ev(async () => { await T.tp(-4867, -2166); __G.X.newCar('sedan', __G.P.x + 3, __G.P.z, 0, 'phys'); });
    for (let i = 0; i < 25; i++) { await ctx.page.tap('#bEnter').catch(() => {}); await W8(ctx, 60); }
    for (let i = 0; i < 8; i++) { await ctx.page.tap('#pauseBtn').catch(() => {}); await W8(ctx, 200); await ctx.page.tap('#pResume').catch(() => {}); await W8(ctx, 150); }
    for (let i = 0; i < 8; i++) { await ctx.page.tap('#phoneBtn').catch(() => {}); await W8(ctx, 120); }
    for (let i = 0; i < 8; i++) { await ctx.page.tap('#camBtn').catch(() => {}); await W8(ctx, 80); }
    await ctx.page.tap('#pauseBtn').catch(() => {}); await W8(ctx, 500);
    const pbtns = await ctx.page.$$eval('#pause button', (bs) => bs.filter((b) => b.offsetParent).map((b) => b.id + ':' + b.textContent.trim().slice(0, 10)));
    for (const id of ['pMusic', 'pWeather', 'pTime', 'pCam', 'pInv', 'pSound', 'pSound']) { await ctx.page.tap('#' + id).catch(() => {}); await W8(ctx, 400); }
    await ctx.page.tap('#pResume').catch(() => {}); await W8(ctx, 800);
    if (await ctx.page.isVisible('#pause')) { await ctx.page.keyboard.press('Escape'); await W8(ctx, 500); }
    const s = await ctx.ev(() => ({ s: T.snap(), paused: __G.G.paused, phone: !!__G.GTA.GT.phone }));
    return { pbtns, s };
  },
  async idle(ctx) {
    const h0 = await ctx.heap();
    const r = await ctx.ev(async () => { await T.tp(-4867, -2166); const out = []; for (let i = 0; i < 10; i++) { T.sim(60); out.push([Math.round(__G.G.t), __G.G.cars.length, __G.G.peds ? __G.G.peds.length : 0]); } return out; });
    const h1 = await ctx.heap();
    await W8(ctx, 30000);
    const h2 = await ctx.heap();
    return { h0, h1, h2, r };
  },
  async streamdrive(ctx) {
    const h0 = await ctx.heap();
    const r = await ctx.ev(async () => {
      const g = __G; const res = []; const pts = [[-4867, -2166], [-12000, -20000], [-25000, -30000], [-37000, -2000], [-8000, 38000], [30000, 3000], [0, -40000], [20000, -25000]];
      for (const [x, z] of pts) { await T.tp(x, z); T.sim(2); res.push([x, z, g.X.TS.tiles.size, g.X.TS.packs.size, g.X.TS.fails, Math.round(performance.memory.usedJSHeapSize / 1e6)]); }
      return res;
    });
    const h1 = await ctx.heap();
    return { h0, h1, r };
  },
  async saveload(ctx) {
    await ctx.ev(async () => { const g = __G; await T.tp(-2900, 1300); g.G.money = 123456; g.MS.done.add('m1'); g.saveGame(); });
    const want = await ctx.ev(() => ({ x: Math.round(__G.P.x), z: Math.round(__G.P.z) }));
    await boot({ page: ctx.page, cont: true });
    await ctx.page.evaluate(ctx.lib);
    const got = await ctx.ev(() => ({ money: __G.G.money, x: Math.round(__G.P.x), z: Math.round(__G.P.z), done: [...__G.MS.done] }));
    return { want, got };
  },
};
import { boot } from './boot.mjs';
// ---------- v4.0 features
SCEN.v4_rides = async (ctx) => {
  const w = await ctx.ev(async () => {
    const g = __G, Wh = g.X.WHEELS[0]; if (!Wh) return 'no wheel';
    await T.tp(Wh.x, Wh.z, false); g.P.x = Wh.x; g.P.z = Wh.z + 3; g.G.money = 1e5;
    const pr = g.X.v4Prompt(); g.interact(); const on = !!g.X.V4.ride; T.sim(30); const mid = T.snap(); T.sim(50); return { pr, on, mid, end: T.snap(), ride: !!g.X.V4.ride };
  });
  await W8(ctx, 1500);
  const c = await ctx.ev(async () => {
    const g = __G, C = g.X.COASTERS[0]; if (!C) return 'no coaster';
    await T.tp(C.P[0][0], C.P[0][1], false); g.P.x = C.P[0][0]; g.P.z = C.P[0][1];
    const pr = g.X.v4Prompt(); g.interact(); const on = !!g.X.V4.ride; let k = 0, maxY = 0; while (g.X.V4.ride && k++ < 600) { T.sim(0.25); maxY = Math.max(maxY, g.P.y); } return { pr, on, sec: k / 4, maxY: Math.round(maxY), end: T.snap() };
  });
  return { w, c };
};
SCEN.v4_bet = async (ctx) => {
  const a = await ctx.ev(async () => { const g = __G, rc = g.W.fun.race[0]; await T.tp(rc.c[0], rc.c[1], false); g.P.x = rc.c[0]; g.P.z = rc.c[1]; g.G.money = 1e5; const pr = g.X.v4Prompt(); g.interact(); return { name: rc.name, pr }; });
  await W8(ctx, 1200); await ctx.shot('v4_betmenu');
  const rows = await ctx.page.$$eval('#v4ov .row', (rs) => rs.map((r) => r.textContent.trim().slice(0, 40)));
  await ctx.page.tap('#v4ov .v4l button').catch(() => {});
  await ctx.ev(() => T.sim(20)); await W8(ctx, 1500); await ctx.shot('v4_race');
  const b = await ctx.ev(() => { let k = 0; while (__G.X.V4.race && k++ < 300) T.sim(1); return { k, money: __G.G.money, bets: __G.G.stats.bets }; });
  return { a, rows, b };
};
SCEN.v4_tour = async (ctx) => {
  const a = await ctx.ev(async () => {
    const g = __G, af = g.W.fun.af.find((a) => /調布/.test(a.name)); const A = af.apron[0]; let cx = 0, cz = 0; for (let i = 0; i < A.length; i += 2) { cx += A[i]; cz += A[i + 1]; } cx /= A.length / 2; cz /= A.length / 2;
    await T.tp(cx, cz, false); g.P.x = cx; g.P.z = cz; return { pr: g.X.v4Prompt() };
  });
  await ctx.page.tap('#bEnter').catch(() => {}); await W8(ctx, 1200);
  const rows = await ctx.page.$$eval('#v4ov .row', (rs) => rs.map((r) => r.textContent.trim().slice(0, 40))).catch(() => []);
  await ctx.page.tap('#v4ov .v4l button').catch(() => {}); await W8(ctx, 800);
  const b = await ctx.ev(() => { const g = __G; for (let i = 0; i < 12 && g.HUD.dialogOpen(); i++) g.interact(); return { cur: g.MS.cur && g.MS.cur.title, step: g.MS.cur && g.MS.cur.steps[g.MS.step].t, target: g.MS.target }; });
  // fly it like the mission harness
  const c = await ctx.ev(async () => {
    const g = __G, MS = g.MS, P = g.P; const a = g.G.aircraft.filter((a) => a.kind === 'parked' && a.small).sort((p, q) => Math.hypot(p.x - P.x, p.z - P.z) - Math.hypot(q.x - P.x, q.z - P.z))[0];
    P.x = a.x + 1; P.z = a.z + 1; P.y = a.y; g.PL.tryEnter(); T.sim(1);
    if (MS.cur && MS.st.rings) for (const r of MS.st.rings) { P.air.x = r[0]; P.air.y = r[1]; P.air.z = r[2]; T.sim(0.2); }
    T.sim(1); const s = MS.cur && MS.cur.steps[MS.step]; if (s && s.t === 'land') { P.air.x = s.to[0]; P.air.z = s.to[1]; P.air.y = 0.3; P.air.v = 0; P.air.vx = P.air.vz = P.air.vy = 0; T.sim(2); }
    return { done: !MS.cur, tours: g.G.stats.tours, money: g.G.money };
  });
  return { a, rows, b, c };
};
SCEN.v4_talk_dex = async (ctx) => {
  const a = await ctx.ev(async () => {
    const g = __G; await T.tp(-2900, 1300); T.sim(3); const p = g.G.peds.filter((p) => !p.dead).sort((a, b) => Math.hypot(a.x - g.P.x, a.z - g.P.z) - Math.hypot(b.x - g.P.x, b.z - g.P.z))[0];
    if (p) { g.P.x = p.x + 1; g.P.z = p.z; } const ok = g.X.v4Talk(); const txt = document.getElementById('dTxt').textContent; for (let i = 0; i < 5 && g.HUD.dialogOpen(); i++) g.interact();
    const S = T.st('渋谷'); await T.tp(S.x, S.z); T.sim(3);
    const L = g.W.landmarks.tokyoTower; await T.tp(L.x + 60, L.z + 60); T.sim(3);
    return { ok, txt, dex: g.G.stats.dex, ach: g.G.stats.ach };
  });
  await ctx.page.tap('#pauseBtn'); await W8(ctx, 800); await ctx.page.tap('#pDex').catch((e) => {}); await W8(ctx, 800); await ctx.shot('v4_dex');
  const dexRows = await ctx.page.$$eval('#v4ov .row', (rs) => rs.map((r) => r.textContent.trim().slice(0, 60))).catch(() => []);
  await ctx.page.tap('#v4ov .close').catch(() => {}); await ctx.page.tap('#pAch').catch(() => {}); await W8(ctx, 800); await ctx.shot('v4_ach');
  const achN = await ctx.page.$$eval('#v4ov .row', (rs) => rs.length).catch(() => 0);
  await ctx.page.tap('#v4ov .close').catch(() => {}); await W8(ctx, 300); await ctx.page.tap('#pResume').catch(() => {});
  return { a, dexRows, achN };
};
SCEN.v4_slots = async (ctx) => {
  await ctx.ev(async () => { const g = __G; await T.tp(-2900, 1300); g.G.money = 777777; });
  await ctx.page.tap('#pauseBtn'); await W8(ctx, 600); await ctx.page.tap('#pSave'); await W8(ctx, 600);
  const rows = await ctx.page.$$eval('#v4ov .row', (rs) => rs.map((r) => r.textContent.trim().slice(0, 60)));
  await ctx.page.tap('#v4ov .row:nth-child(2) button'); await W8(ctx, 600);
  await ctx.page.tap('#pTitle'); await W8(ctx, 1000);
  await ctx.page.tap('#tContinue'); await W8(ctx, 800);
  const crow = await ctx.page.$$eval('#v4ov .row', (rs) => rs.map((r) => r.textContent.trim().slice(0, 60))).catch(() => []);
  await ctx.ev(() => { __G.G.money = 1; });
  if (crow.length) await ctx.page.tap('#v4ov .row:nth-child(2) button');
  await W8(ctx, 3000);
  const got = await ctx.ev(() => ({ money: __G.G.money, slot: __G.X.getSlot(), started: __G.G.started }));
  return { rows, crow, got };
};
// every mission start / spawn / go target: inside a building? in water? how far to the nearest road?
SCEN.mission_points = async (ctx) => ctx.ev(async () => {
  const g = __G, B = g.W.bld, out = [];
  const inside = (x, z) => { const ids = []; g.WD.buildingsNear(x, z, 40, ids); for (const id of ids) { const o = id * 9; if (B[o + 6] < 1) continue; const pp = g.X.PB.pp && g.X.PB.pp[id]; if (pp) { let c = false; for (let i = 0, j = pp.length - 2; i < pp.length; j = i, i += 2) { const xi = pp[i], zi = pp[i + 1], xj = pp[j], zj = pp[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } if (c) return id; continue; } const a = Math.cos(B[o + 2]), s = Math.sin(B[o + 2]), u = (x - B[o]) * a + (z - B[o + 1]) * s, v = -(x - B[o]) * s + (z - B[o + 1]) * a; if (Math.abs(u) < B[o + 3] / 2 && Math.abs(v) < B[o + 4] / 2) return id; } return -1; };
  for (const m of g.MI.MISSIONS) {
    const pts = [['start', m.start]];
    for (const s of m.steps) { if (s.at && typeof s.at !== 'string') pts.push([s.t + '.at', s.at]); if (s.to && s.t !== 'ride' && typeof s.to !== 'string') pts.push([s.t + '.to', s.to]); }
    for (const [k, p] of pts) {
      await g.X.tsPrefetch(p[0], p[1]);
      const a = []; g.X.roadsNear(p[0], p[1], 300, a); const r = a.filter((q) => !q.e.elev).sort((x, y) => x.d - y.d)[0];
      const bi = inside(p[0], p[1]), wat = g.WD.isWaterAt(p[0], p[1]);
      if (bi >= 0 || wat || !r || r.d > 60) out.push([m.id, k, Math.round(p[0]), Math.round(p[1]), bi >= 0 ? 'IN-BUILDING h' + Math.round(B[bi * 9 + 6]) : '', wat ? 'WATER' : '', r ? 'road ' + Math.round(r.d) + 'm' : 'NO ROAD']);
    }
  }
  return out;
});
// streaming memory: visit far places with frames running (tile unloading happens in the frame loop), GC, count
SCEN.memstream = async (ctx) => {
  const pts = [[-4867, -2166], [-12000, -20000], [-25000, -30000], [-20000, 10000], [-8000, 30000], [20000, 3000], [5000, -15000], [15000, -25000], [-4867, -2166]];
  const out = [];
  const m = async () => ctx.ev(() => { window.gc && gc(); const g = __G, TS = g.X.TS, mem = g.R.renderer.info.memory; return { heap: Math.round(performance.memory.usedJSHeapSize / 1e6), E: g.W.edges.length, N: g.W.nodes.length, tiles: TS.tiles.size, packs: TS.packs.size, pbTop: g.X.PB.top, geo: mem.geometries, tex: mem.textures, cars: g.G.cars.length, peds: g.G.peds.length }; });
  out.push(['start', await m()]);
  for (const [x, z] of pts) {
    await ctx.ev(async ([x, z]) => { await T.tp(x, z); }, [x, z]);
    await W8(ctx, 12000);
    out.push([x + ',' + z, await m()]);
  }
  return out;
};
