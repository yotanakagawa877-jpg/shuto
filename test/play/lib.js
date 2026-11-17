// in-page helpers for the play tests (window.T)
window.T = (() => {
  const g = __G, P = g.P, G = g.G, W = g.W;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const T = {
    issues: [],
    note(kind, msg) { T.issues.push({ kind, msg, t: G.t, mode: P.mode, x: Math.round(P.x), z: Math.round(P.z) }); },
    st(name) { return W.stations.find((s) => s.ja === name); },
    async tp(x, z, road = true) {
      if (P.interior) { try { g.doAction('exit'); } catch (e) {} }
      for (let i = 0; i < 12 && g.HUD.dialogOpen(); i++) g.HUD.nextLine();
      if (P.car && P.mode === 'car') { g.PL.tryEnter(); }
      P.mode = 'foot'; P.car = null; P.air = null; P.train = null; P.interior = null;
      await g.X.tsPrefetch(x, z);
      if (road) g.PL.placeNearRoad(x, z); else { P.x = x; P.z = z; P.y = g.AC.groundUnder(x, z, 200).g + 0.1; }
      P.vy = 0; G.cam.snap = true;
      T.sim(0.5);
      return T.snap();
    },
    sim(sec, dt = 1 / 30) { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { g.sim(1, dt); T.watch(); } return G.t; },
    gy(x, z, y = 500) { try { return g.AC.groundUnder(x, z, y).g; } catch (e) { return NaN; } },
    snap() {
      const c = P.car, a = P.air;
      return { mode: P.mode, x: +P.x.toFixed(1), y: +P.y.toFixed(2), z: +P.z.toFixed(1), hp: Math.round(P.hp), money: Math.round(G.money),
        car: c ? { t: c.t, x: Math.round(c.x), y: +(c.y || 0).toFixed(2), z: Math.round(c.z), v: +(c.v || 0).toFixed(1), dead: !!c.dead, sink: !!c.sink } : null,
        air: a ? { x: Math.round(a.x), y: Math.round(a.y), z: Math.round(a.z), v: +((a.v ?? Math.hypot(a.vx || 0, a.vz || 0)) || 0).toFixed(1), crashed: !!a.crashed } : null,
        train: P.train ? { ja: P.train.r.ja, st: P.train.state, v: +P.train.v.toFixed(1) } : null, stars: g.POL && G.heat !== undefined ? G.heat : null, interior: !!P.interior, gt: Math.round(G.t) };
    },
    _ft: 0,
    watch() {
      // invariants checked every simulated frame
      const bad = [];
      for (const k of ['x', 'y', 'z']) if (!fin(P[k])) bad.push('P.' + k);
      const c = P.car; if (c) for (const k of ['x', 'y', 'z', 'v']) if (c[k] !== undefined && !fin(c[k])) bad.push('car.' + k);
      const a = P.air; if (a) for (const k of ['x', 'y', 'z']) if (!fin(a[k])) bad.push('air.' + k);
      if (bad.length) { if (!T._nan) T.note('NaN', bad.join(',')); T._nan = 1; return; }
      if (P.mode === 'foot' && !P.interior && !P.sky && !P.deck) {
        const gy = T.gy(P.x, P.z, P.y + 2);
        if (fin(gy)) {
          if (P.y < gy - 1.5) { T._under = (T._under || 0) + 1; if (T._under === 30) T.note('below-ground', `y ${P.y.toFixed(1)} ground ${gy.toFixed(1)}`); } else T._under = 0;
          if (P.onGround && P.y > gy + 2.5) { T._float = (T._float || 0) + 1; if (T._float === 30) T.note('floating', `y ${P.y.toFixed(1)} ground ${gy.toFixed(1)}`); } else T._float = 0;
        }
      }
      if (P.mode === 'car' && c && !c.sink && !c.dead) {
        const gy = T.gy(c.x, c.z, c.y + 2);
        if (fin(gy) && c.y < gy - 2) { T._cu = (T._cu || 0) + 1; if (T._cu === 30) T.note('car-below-ground', `y ${c.y.toFixed(1)} ground ${gy.toFixed(1)}`); } else T._cu = 0;
      }
      if (P.y < -60 || P.y > 3000) { if (!T._oob) T.note('y-out-of-range', P.y.toFixed(1)); T._oob = 1; }
    },
    startM(m) {
      const g = __G, P = g.P; P.x = m.start[0]; P.z = m.start[1];
      g.sim(2); for (let i = 0; i < 12 && g.HUD.dialogOpen(); i++) g.HUD.nextLine();
      g.interact();
      if (g.MS.cur !== m) { T.note('mission-start', `${m.id}: interact did not start (dialog ${g.HUD.dialogOpen()}, menu ${!document.getElementById('stmenu').hidden}, near ${g.MI.nearMissionStart(P.x, P.z) && g.MI.nearMissionStart(P.x, P.z).id}, avail ${g.MI.availableMissions().map((a) => a.id)})`); g.MI.startMission(m); }
      g.sim(2); for (let i = 0; i < 12 && g.HUD.dialogOpen(); i++) g.interact();
    },
    reset() { T._nan = T._under = T._float = T._cu = T._oob = 0; for (const k in g.KEYS) g.KEYS[k] = false; g.TOUCH.x = g.TOUCH.y = 0; },
    key(code, on) { g.KEYS[code] = on; },
    carHere(type = 'sedan', yaw) {
      const a = []; g.X.roadsNear(P.x, P.z, 80, a);
      const r = a.filter((q) => !q.e.elev).sort((p, q) => p.d - q.d)[0];
      const x = r ? r.x : P.x + 3, z = r ? r.z : P.z;
      const c = g.X.newCar(type, x, z, yaw ?? (r ? Math.atan2(r.e.pts[r.j + 1][0] - r.e.pts[r.j][0], r.e.pts[r.j + 1][1] - r.e.pts[r.j][1]) : 0), 'phys');
      if (!c) return null;
      c.driver = false; c.parked = true;
      P.x = c.x + 2; P.z = c.z; P.y = c.y + 0.1;
      g.V.rebuildCarGrid && g.V.rebuildCarGrid(); g.sim(1);
      P.x = c.x + 2; P.z = c.z; P.y = c.y + 0.1;
      g.PL.tryEnter();
      if (P.mode !== 'car') T.note('harness', 'could not enter spawned car');
      return P.mode === 'car';
    },
    findWater(x0, z0, R = 4000) {
      for (let r = 100; r < R; r += 100) for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        if (g.WD.isWaterAt(x, z)) {
          // walk back towards land to the shore
          for (let s = 0; s < 400; s += 10) { const xx = x - Math.cos(a) * s, zz = z - Math.sin(a) * s; if (!g.WD.isWaterAt(xx, zz)) return [xx, zz, a]; }
        }
      }
      return null;
    },
  };
  return T;
})();
