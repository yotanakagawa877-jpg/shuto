// ===================== v5.0 自衛隊・米軍: tanks, fighters, attack helicopters, bases, ships =====================
// Names are parodies. Bases come from OSM military areas (tools/v5/mil.py -> MIL_DATA in v5m_0data.js) and are built
// only while the player is within 2.5 km of one (fence, gates, watch towers, guards, parked tanks / jets / helicopters,
// ships at 横須賀); everything is removed again beyond 4 km.
var MIL = { base: null, built: null, t: 0, shells: [], missiles: [], jets: [], ahs: [], fireT: 0, gunT: 0, intrT: 0, mat: null, ammo: 8, inside: null };
var MILNAME = {
  tank: '一九式戦車「ハガネ」', fighter: 'XF-9「ツバメ」', ah: 'AH-46「カマキリ」', dd: '護衛艦「むらくも」', cv: '原子力空母「ロナルド・ベーカー」',
};
var milMat = () => MIL.mat || (MIL.mat = vMat());

// ---------- tank: hull + tracks as the car type 'tank' (CR calls v5TankGeo); turret + gun as a separate mesh per tank
function v5TankGeo(t, e, a) {
  const L = t.L, Wd = t.W, h = Wd / 2;
  a(Ce, 16777215).box(0, 0.55, 0, Wd - 1.1, 1.0, L - 0.6, 0, {});
  a(Ce, 16777215).box(0, 1.5, -0.2, Wd - 0.4, 0.45, L - 1.2, 0, {});
  a(Ce, 16777215).box(0, 1.15, L / 2 - 0.8, Wd - 0.6, 0.35, 1.2, 0, {});
  // tracks with road wheels and side skirts
  for (const s of [-1, 1]) {
    a(Te, 2302755).box(s * (h - 0.32), 0.0, 0, 0.62, 1.05, L - 0.3, 0, {});
    a(Ce, 16777215).box(s * (h - 0.28), 1.05, 0, 0.7, 0.35, L - 0.2, 0, {});
    for (let k = 0; k < 6; k++) a(Te, 3816512).box(s * (h - 0.05), 0.12, -L / 2 + 1 + k * ((L - 2) / 5), 0.12, 0.7, 0.7, 0, {});
  }
  a(Te, 1710618).box(0, 1.2, -L / 2 + 0.2, Wd - 0.8, 0.5, 0.3, 0, {});
  return e.build();
}
function v5TurretGeo() {
  const g = new Mt({ color: !0 }), a = (c) => (g.setColor(c), g);
  a(0x4b5638).box(0, 0, -0.2, 2.6, 0.75, 3.6, 0, {});
  a(0x434d32).box(0, 0.75, -0.6, 2.0, 0.35, 2.2, 0, {});
  a(0x2f3524).box(0.6, 1.1, -0.9, 0.7, 0.3, 0.7, 0, {});
  a(0x2a2a2a).box(0, 0.2, 1.4 + 2.6, 0.22, 0.22, 5.2, 0, {});
  a(0x3c4430).box(0, 0.13, 1.6, 0.5, 0.36, 0.8, 0, {});
  return g.build();
}
var TURRET_GEO = null;
function v5TankTurrets(dt) {
  TURRET_GEO || (TURRET_GEO = v5TurretGeo());
  for (const c of G.cars) {
    if (c.t !== 'tank' || c.removed) continue;
    if (!c.turret) {
      c.turret = new THREE.Mesh(TURRET_GEO, milMat());
      c.turret.castShadow = !0;
      R.scene.add(c.turret);
      c.tyaw = 0;
    }
    // aim: the player's camera when driving, the player when hunting
    let want = c.tyaw;
    if (c.ctl === 'player') want = ln(G.cam.yaw - c.yaw);
    else if (c.ctl === 'police') {
      const p = il();
      want = ln(Math.atan2(p.x - c.x, p.z - c.z) - c.yaw);
    }
    c.tyaw += It(ln(want - c.tyaw), -dt * 1.3, dt * 1.3);
    c.turret.position.set(c.x, c.y + 1.75 + (c.flip ? 0 : 0), c.z);
    c.turret.rotation.set(c.pitch || 0, c.yaw + c.tyaw, c.roll || 0, 'YXZ');
    c.turret.visible = !c.flip && !c.dead;
    // hunting tanks fire every few seconds with a clear line and no bystanders in the way
    if (c.ctl === 'police' && !c.dead) {
      c.fireT = (c.fireT || rt(3, 6)) - dt;
      const p = il(), d = Math.hypot(p.x - c.x, p.z - c.z);
      if (c.fireT <= 0 && d < 180 && d > 15 && Math.abs(ln(Math.atan2(p.x - c.x, p.z - c.z) - c.yaw - c.tyaw)) < 0.15) {
        c.fireT = rt(5, 8);
        rayBuildings(c.x, c.y + 2, c.z, p.x, (p.y || 0) + 1, p.z) >= 1 && v5CopMayShoot(c, p.x, p.y || 0, p.z) && v5Shell(c, p.x + rt(-5, 5), (p.y || 0) + 0.5, p.z + rt(-5, 5), !1);
      }
    }
  }
}
// a tank round: flies flat and fast, explodes where it lands / hits
function v5Shell(c, tx, ty, tz, byPlayer) {
  const yaw = c.yaw + (c.tyaw || 0), sx = c.x + Math.sin(yaw) * 6, sz = c.z + Math.cos(yaw) * 6, sy = c.y + 2;
  let dx = tx - sx, dy = ty - sy, dz = tz - sz;
  const L = Math.hypot(dx, dy, dz) || 1;
  MIL.shells.push({ x: sx, y: sy, z: sz, vx: (dx / L) * 260, vy: (dy / L) * 260, vz: (dz / L) * 260, t: 0, by: byPlayer });
  Ro(sx, sy, sz, 6);
  gt.boom && gt.boom(Math.hypot(sx - P.x, sz - P.z) * 0.5);
  G.cam.shake = Math.max(G.cam.shake || 0, byPlayer ? 0.5 : 0.2);
}
function v5ShellTick(dt) {
  for (let i = MIL.shells.length - 1; i >= 0; i--) {
    const s = MIL.shells[i], nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, nz = s.z + s.vz * dt;
    s.t += dt;
    s.vy -= 9.8 * dt;
    const g = groundUnder(nx, nz, ny + 5).g, hitB = rayBuildings(s.x, s.y, s.z, nx, ny, nz) < 1;
    let hitCar = null;
    carsNear(nx, nz, 4, V5C);
    for (const c of V5C) if (Math.abs((c.y || 0) + 1 - ny) < 2.5) hitCar = c;
    if (ny <= g + 0.2 || hitB || hitCar || s.t > 3) {
      xt('explode', { x: nx, y: Math.max(g, ny), z: nz, big: !0, byPlayer: s.by });
      MIL.shells.splice(i, 1);
      continue;
    }
    s.x = nx; s.y = ny; s.z = nz;
    We.smoke && Math.random() < 0.5 && We.smoke.spawn(nx, ny, nz, 0, 0.2, 0, 0.4, 0.4, 1.2, 0.8, 0.8, 0.8, 0.4);
  }
}

// ---------- fighter jet geometry (also used by the enemy fighters)
function v5FighterGeo() {
  const g = new Mt({ color: !0 }), a = (c) => (g.setColor(c), g), c1 = 0x7d8790, c2 = 0x5f6973;
  a(c1).box(0, 1.1, 0, 1.5, 1.3, 15, 0, {});
  a(c2).box(0, 1.6, 4.2, 1.1, 0.7, 3.2, 0, {});
  a(0x2a3b4c).box(0, 2.05, 4.0, 0.9, 0.45, 2.6, 0, {});
  a(c1).box(0, 0.9, 8, 0.8, 0.8, 2, 0, {});
  // wings, tails, intakes, nozzles
  for (const s of [-1, 1]) {
    a(c1).box(s * 3.4, 1.15, -1.2, 5.6, 0.16, 4.6, s * -0.25, {});
    a(c2).box(s * 2.2, 1.2, -6.4, 2.8, 0.14, 2.2, s * -0.2, {});
    a(c2).box(s * 0.9, 2.0, -5.6, 0.14, 2.4, 2.4, 0, {});
    a(c2).box(s * 1.1, 0.8, 1.6, 0.7, 0.9, 3, 0, {});
    a(0x26292c).box(s * 0.45, 0.85, -7.8, 0.75, 0.75, 1, 0, {});
  }
  a(0x26292c).box(0, 0.0, 3, 0.25, 0.9, 0.25, 0, {});
  for (const s of [-1, 1]) a(0x26292c).box(s * 1.6, 0.0, -1.5, 0.25, 0.9, 0.25, 0, {});
  return g.build();
}
var FIGHTER_GEO = null;
var fGeo = () => FIGHTER_GEO || (FIGHTER_GEO = v5FighterGeo());
// attack helicopter: narrow body, stub wings with pods, tandem cockpit
function v5AhGeo() {
  const g = new Mt({ color: !0 }), a = (c) => (g.setColor(c), g), c1 = 0x4a5440;
  a(c1).box(0, 0.6, 0.6, 1.2, 1.6, 6, 0, {});
  a(0x22303c).box(0, 1.6, 1.8, 0.9, 0.7, 2.6, 0, {});
  a(c1).box(0, 1.0, -4.4, 0.45, 0.6, 5, 0, {});
  a(c1).box(0, 1.2, -6.8, 0.12, 1.8, 1.0, 0, {});
  for (const s of [-1, 1]) (a(c1).box(s * 1.4, 0.9, 0.4, 1.8, 0.14, 0.9, 0, {}), a(0x2b2f28).box(s * 2.0, 0.55, 0.4, 0.45, 0.45, 1.6, 0, {}));
  a(0x2b2b2b).box(0, -0.1, 2.6, 0.3, 0.3, 1.2, 0, {});
  return g.build();
}
var AH_GEO = null;

// ---------- bases
function milNear() {
  if (typeof MIL_DATA === 'undefined') return null;
  let best = null, bd = 1e9;
  for (const k in MIL_DATA) {
    const b = MIL_DATA[k], d = Math.hypot(b.cx - P.x, b.cz - P.z);
    d < bd && ((bd = d), (best = b));
  }
  best && (best.key || (best.key = Object.keys(MIL_DATA).find((k) => MIL_DATA[k] === best)));
  return best ? { b: best, d: bd } : null;
}
function inRing(r, x, z) {
  let c = !1;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi && (c = !c);
  }
  return c;
}
function milBuild(b) {
  const g = new THREE.Group(), r = b.ring, fence = new Mt({ color: !0 }), A = (c) => (fence.setColor(c), fence);
  const gates = [], L5 = [];
  // gates: where a road crosses the outline
  for (let i = 0; i + 1 < r.length; i++) {
    const [x0, z0] = r[i], [x1, z1] = r[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 5; s < L - 5; s += 8) {
      const x = x0 + ((x1 - x0) * s) / L, z = z0 + ((z1 - z0) * s) / L;
      roadsNear(x, z, 12, L5);
      const o = L5.find((h) => !h.e.elev && h.d < h.e.hw + 0.5);
      o && !gates.some((q) => Math.hypot(q.x - x, q.z - z) < 60) && gates.push({ x, z, w: o.e.hw + 1.5, a: Math.atan2(x1 - x0, z1 - z0) });
    }
  }
  // fence: 2.6 m mesh panels on posts, barbed wire on top; open at the gates
  for (let i = 0; i + 1 < r.length; i++) {
    const [x0, z0] = r[i], [x1, z1] = r[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1) continue;
    const n = Math.ceil(L / 6), dx = (x1 - x0) / L, dz = (z1 - z0) / L, rot = Math.atan2(-dx, dz);
    for (let k = 0; k < n; k++) {
      const s0 = (k * L) / n, s1 = ((k + 1) * L) / n, cx = x0 + dx * (s0 + s1) * 0.5, cz = z0 + dz * (s0 + s1) * 0.5;
      if (gates.some((q) => Math.hypot(q.x - cx, q.z - cz) < q.w + 1)) continue;
      const y = groundUnder(cx, cz, 50).g;
      A(0x8f969c).box(cx, y, cz, 0.05, 2.6, s1 - s0, rot, {});
      A(0x5e6468).box(x0 + dx * s0, y, z0 + dz * s0, 0.1, 3.0, 0.1, rot, {});
      A(0x6b6f72).box(cx, y + 2.75, cz, 0.12, 0.12, s1 - s0, rot, {});
    }
  }
  // watch towers every ~350 m
  let acc = 0;
  for (let i = 0; i + 1 < r.length; i++) {
    const [x0, z0] = r[i], [x1, z1] = r[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
    acc += L;
    if (acc < 350) continue;
    acc = 0;
    const cx = (x0 + x1) / 2 - (z1 - z0) / L * 3, cz = (z0 + z1) / 2 + (x1 - x0) / L * 3, y = groundUnder(cx, cz, 50).g;
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) A(0x55595c).box(cx + ox * 1.1, y, cz + oz * 1.1, 0.18, 6, 0.18, 0, {});
    A(0x6a6e5e).box(cx, y + 6, cz, 2.8, 0.25, 2.8, 0, {});
    A(0x6a6e5e).box(cx, y + 6.25, cz, 2.8, 1.1, 0.1, 0, {});
    A(0x4c5040).box(cx, y + 8, cz, 3.2, 0.3, 3.2, 0, {});
  }
  // gate booths and barrier arms
  for (const q of gates) {
    const y = groundUnder(q.x, q.z, 50).g, ca = Math.cos(q.a), sa = Math.sin(q.a);
    A(0xd8dad2).box(q.x + Math.sin(q.a) * (q.w + 2), y, q.z + Math.cos(q.a) * (q.w + 2), 2.2, 2.6, 2.2, -q.a, {});
    A(0xc8102e).box(q.x, y + 1.0, q.z, 0.12, 0.12, q.w * 1.6, -q.a, {});
    A(0xf2f2f2).box(q.x, y + 1.0, q.z, 0.13, 0.13, q.w * 0.5, -q.a, {});
  }
  const fm = new THREE.Mesh(fence.build(), milMat());
  fm.castShadow = !0;
  g.add(fm);
  R.scene.add(g);
  const built = { b, g, gates, cars: [], air: [], peds: [], ships: [] };
  // guards at the gates
  for (const q of gates.slice(0, 4)) {
    const p = spawnPedAt(q.x + Math.cos(q.a) * (q.w + 1.5), q.z - Math.sin(q.a) * (q.w + 1.5), 'cop', 11);
    p && ((p.state = 'idle'), (p.t = 1e9), (p.guard = 1), built.peds.push(p));
  }
  // parked equipment on open ground inside
  const spots = milSpots(b, 14);
  const kind = b.kind;
  let k = 0;
  const take = () => spots[k++];
  if (kind === 'gsdf' || kind === 'gsdf_air')
    for (let i = 0; i < 3; i++) {
      const s = take();
      if (!s) break;
      const c = newCar(i < 2 ? 'tank' : 'sdf', s.x, s.z, s.yaw, 'phys');
      c && (Object.assign(c, { y: s.y, ctl: null, parked: !0, keep: !0, driver: !1, hp: i < 2 ? 900 : 320, armor: i < 2 ? 0.75 : 0.45, mil: 1 }), built.cars.push(c));
    }
  if (kind === 'asdf' || kind === 'us_air' || kind === 'navy_air' || kind === 'msdf_air')
    for (let i = 0; i < 3; i++) {
      const s = take();
      if (!s) break;
      const m = new THREE.Mesh(fGeo(), milMat());
      m.position.set(s.x, s.y + 0.2, s.z);
      m.rotation.y = s.yaw;
      m.castShadow = !0;
      R.scene.add(m);
      const a = { kind: 'parked', m, x: s.x, y: s.y + 0.2, z: s.z, yaw: s.yaw, fighter: !0, small: !0, rw: milRunway(b), mil: 1 };
      G.aircraft.push(a);
      built.air.push(a);
    }
  if (kind === 'gsdf_air' || kind === 'gsdf' || kind === 'us_air')
    for (let i = 0; i < 2; i++) {
      const s = take();
      if (!s) break;
      AH_GEO || (AH_GEO = v5AhGeo());
      const M = new THREE.Group(), y = new THREE.Mesh(AH_GEO, milMat());
      y.castShadow = !0;
      M.add(y);
      const rot = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      rot.position.y = 2.4;
      M.add(rot);
      const tr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, 0.2), rot.material);
      tr.position.set(0.2, 1.3, -6.8);
      M.add(tr);
      M.position.set(s.x, s.y + 0.3, s.z);
      R.scene.add(M);
      const a = { kind: 'heli', m: M, rot, tr, x: s.x, y: s.y + 0.3, z: s.z, yaw: 0, name: MILNAME.ah, home: [s.x, s.y + 0.3, s.z], attack: !0, mil: 1 };
      G.aircraft.push(a);
      built.air.push(a);
    }
  // ships at 横須賀
  if (kind === 'navy') built.ships = milShips(b);
  return built;
}
// open ground inside the base: not in a building, not on water, flat
function milSpots(b, n) {
  const r = b.ring;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of r) ((x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z)));
  const out = [];
  for (let i = 0; i < 600 && out.length < n; i++) {
    const x = b.cx + (Math.random() - 0.5) * Math.min(600, x1 - x0), z = b.cz + (Math.random() - 0.5) * Math.min(600, z1 - z0);
    if (!inRing(r, x, z) || v4Blocked(x, z) || out.some((o) => Math.hypot(o.x - x, o.z - z) < 22)) continue;
    // keep the whole footprint clear
    let ok = !0;
    for (const [ox, oz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) if (v4Blocked(x + ox, z + oz) || !inRing(r, x + ox, z + oz)) ok = !1;
    if (!ok) continue;
    out.push({ x, z, y: groundUnder(x, z, 50).g, yaw: Math.random() * 6.28 });
  }
  return out;
}
// the base's runway for a fighter take-off (the airfield of W.fun if it is there, else along the longest open line)
function milRunway(b) {
  if (W.fun)
    for (const af of W.fun.af) {
      const rw = af.rw && af.rw[0];
      if (rw && Math.hypot(rw.x - b.cx, rw.z - b.cz) < 3000) return rw;
    }
  return { x: b.cx, z: b.cz, ux: 1, uz: 0, len: 600, w: 40 };
}
function milShips(b) {
  const out = [];
  const spots = [];
  for (let i = 0; i < 400 && spots.length < 2; i++) {
    const a = Math.random() * 6.28, d = rt(250, 1400), x = b.cx + Math.cos(a) * d, z = b.cz + Math.sin(a) * d;
    let ok = !0;
    for (let k = -4; k <= 4 && ok; k++) for (const o of [-30, 0, 30]) !isWaterAt(x + Math.cos(a + 1.57) * k * 40 + Math.cos(a) * o, z + Math.sin(a + 1.57) * k * 40 + Math.sin(a) * o) && (ok = !1);
    ok && !spots.some((s) => Math.hypot(s.x - x, s.z - z) < 400) && spots.push({ x, z, yaw: a + Math.PI / 2 });
  }
  spots.forEach((s, i) => {
    const cv = i === 1, g = new Mt({ color: !0 }), A = (c) => (g.setColor(c), g), L = cv ? 330 : 150, B = cv ? 40 : 18, hull = 0x6d7378;
    A(hull).box(0, -4, 0, B, 10, L, 0, {});
    A(hull).box(0, -4, L / 2 + 6, B * 0.5, 10, 12, 0, {});
    if (cv) {
      A(0x50565b).box(0, 6, 0, 76, 1, L, 0, {});
      A(0x6d7378).box(30, 7, -30, 10, 18, 40, 0, {});
      for (let k = 0; k < 8; k++) A(0x7d8790).box(-20 + (k % 4) * 10, 7, -80 + Math.floor(k / 4) * 40, 6, 1.5, 12, 0, {});
    } else {
      A(0x7a8085).box(0, 6, 10, 12, 12, 40, 0, {});
      A(0x7a8085).box(0, 18, 14, 6, 10, 10, 0, {});
      A(0x5b6166).box(0, 6, 50, 4, 3, 8, 0, {});
      A(0x3b3f42).box(0, 7.5, 58, 0.5, 0.5, 6, 0, {});
    }
    const m = new THREE.Mesh(g.build(), milMat());
    m.position.set(s.x, 0, s.z);
    m.rotation.y = s.yaw;
    m.castShadow = !0;
    R.scene.add(m);
    out.push({ m, name: cv ? MILNAME.cv : MILNAME.dd, x: s.x, z: s.z, seen: !1 });
  });
  return out;
}
function milDispose(bt) {
  R.scene.remove(bt.g);
  bt.g.traverse((o) => o.geometry && o.geometry.dispose());
  for (const c of bt.cars) c.removed || (c.keep = !1);
  for (const a of bt.air) {
    if (P.air && (P.air.m === a.m || P.air.ref === a)) continue;
    R.scene.remove(a.m);
    const i = G.aircraft.indexOf(a);
    i >= 0 && G.aircraft.splice(i, 1);
  }
  for (const p of bt.peds) p.dead = !0;
  for (const s of bt.ships) (R.scene.remove(s.m), s.m.geometry.dispose());
}
function milTick(dt) {
  if ((MIL.t -= dt) <= 0) {
    MIL.t = 1;
    const n = milNear();
    if (n && n.d < 2500 && (!MIL.built || MIL.built.b !== n.b)) (MIL.built && milDispose(MIL.built), (MIL.built = milBuild(n.b)));
    else if (MIL.built && (!n || n.b !== MIL.built.b || n.d > 4000)) (milDispose(MIL.built), (MIL.built = null));
    // ship names
    if (MIL.built) for (const s of MIL.built.ships) !s.seen && Math.hypot(s.x - P.x, s.z - P.z) < 600 && ((s.seen = !0), xt('toast', s.name));
  }
  const bt = MIL.built;
  if (!bt) return;
  // fence: no way through except the gates (on foot and by car); aircraft fly over it
  const tgt = P.mode === 'car' && P.car ? P.car : P.mode === 'foot' && !P.interior ? P : null;
  if (tgt) {
    const inside = inRing(bt.b.ring, tgt.x, tgt.z);
    if (MIL.inside !== null && inside !== MIL.inside && !(P.mode === 'car' && P.car.t === 'tank')) {
      const gate = bt.gates.some((q) => Math.hypot(q.x - tgt.x, q.z - tgt.z) < q.w + 2);
      if (!gate && MIL.last) {
        tgt.x = MIL.last[0];
        tgt.z = MIL.last[1];
        tgt.vx !== void 0 && ((tgt.vx *= -0.3), (tgt.vz *= -0.3));
        P.mode === 'car' && ((P.car.vx = 0), (P.car.vz = 0));
        (MIL.fT = (MIL.fT || 0) - dt) <= 0 && ((MIL.fT = 2), xt('toast', 'フェンスがある — ゲートから入ろう'));
      } else MIL.inside = inside;
    } else MIL.inside = inside;
    MIL.last = [tgt.x, tgt.z];
    // getting in = ★4 at once
    if (MIL.inside && G.t > MIL.intrT) {
      MIL.intrT = G.t + 40;
      forceStars(Math.max(4, Ke()));
      xt('toast', `${bt.b.name}に侵入した！ 手配度 ★4`);
      for (const p of bt.peds) ((p.state = 'cop'), (p.t = 60));
    }
  }
}

// ---------- player weapons in a tank / fighter / attack helicopter (two touch buttons on the right)
function v5WeaponMode() {
  if (P.mode === 'car' && P.car && P.car.t === 'tank') return 'tank';
  if (P.mode === 'plane' && P.air && P.air.fighter) return 'jet';
  if (P.mode === 'heli' && P.air && P.air.ref && P.air.ref.attack) return 'ah';
  return null;
}
function v5WeaponUI() {
  let el = document.getElementById('v5wpn');
  if (!el) {
    el = document.createElement('div');
    el.id = 'v5wpn';
    el.innerHTML = '<button id="v5w1"></button><button id="v5w2"></button>';
    document.body.appendChild(el);
    const hold = (id, k) => {
      const b = el.querySelector(id);
      const on = (e) => (e.preventDefault(), e.stopPropagation(), (MIL[k] = !0));
      const off = (e) => (e.preventDefault(), (MIL[k] = !1));
      b.addEventListener('touchstart', on, { passive: !1 });
      b.addEventListener('touchend', off, { passive: !1 });
      b.addEventListener('touchcancel', off, { passive: !1 });
      b.addEventListener('mousedown', on);
      b.addEventListener('mouseup', off);
    };
    hold('#v5w1', 'b1');
    hold('#v5w2', 'b2');
  }
  const m = v5WeaponMode();
  el.hidden = !m;
  if (m) {
    el.querySelector('#v5w1').textContent = m === 'tank' ? '主砲' : '機関砲';
    el.querySelector('#v5w2').textContent = m === 'tank' ? '機銃' : m === 'jet' ? `ミサイル ${MIL.ammo}` : `ロケット ${MIL.ammo}`;
  }
  return m;
}
function v5WeaponsTick(dt) {
  const m = v5WeaponUI(), K = KEYS;
  MIL.fireT -= dt;
  MIL.gunT -= dt;
  m || (MIL.ammo = 8);
  if (!m) return;
  const b1 = MIL.b1 || K.KeyJ, b2 = MIL.b2 || K.KeyK;
  if (m === 'tank') {
    const c = P.car;
    if (b1 && MIL.fireT <= 0) {
      MIL.fireT = 2.4;
      const yaw = c.yaw + (c.tyaw || 0);
      v5Shell(c, c.x + Math.sin(yaw) * 400, c.y + 1.5 + (G.cam.pitch || 0) * -200, c.z + Math.cos(yaw) * 400, !0);
    }
    b2 && MIL.gunT <= 0 && ((MIL.gunT = 0.12), v5Gun(c.x, c.y + 2.6, c.z, c.yaw + (c.tyaw || 0), 0, 10));
  } else {
    const a = P.air, yaw = a.yaw, pitch = m === 'jet' ? a.pitch : 0.12;
    b1 && MIL.gunT <= 0 && ((MIL.gunT = m === 'jet' ? 0.07 : 0.1), v5Gun(a.x + Math.sin(yaw) * 8, a.y + 0.5, a.z + Math.cos(yaw) * 8, yaw, -pitch, 18));
    b2 && MIL.fireT <= 0 && MIL.ammo > 0 && ((MIL.fireT = m === 'jet' ? 1.6 : 0.5), MIL.ammo--, v5Missile(a, m === 'jet'));
  }
}
// gun: hitscan along the barrel (cars, people, enemy aircraft)
function v5Gun(x, y, z, yaw, pitch, dmg) {
  const dx = Math.sin(yaw) * Math.cos(pitch), dy = -Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
  const M = C3(x, y, z, dx + rt(-0.01, 0.01), dy + rt(-0.01, 0.01), dz + rt(-0.01, 0.01), 400, !0);
  r6(x, y, z, M.x, M.y, M.z, [1, 0.8, 0.4]);
  gt.gun && gt.gun('smg', 10);
  M.kind === 'ped' ? damagePed(M.p, dmg, dx * 2, dz * 2, !0) : M.kind === 'car' ? (damageCar(M.c, dmg * 0.6), Ro(M.x, M.y, M.z, 2)) : Ro(M.x, M.y, M.z, 1);
  for (const j of [...MIL.jets, ...MIL.ahs]) {
    const px = j.x - x, py = j.y - y, pz = j.z - z, u = px * dx + py * dy + pz * dz;
    u > 0 && u < 500 && Math.hypot(px - dx * u, py - dy * u, pz - dz * u) < 6 && (j.hp -= dmg * 0.5);
  }
  xt('crime', { amt: 0.9, why: '発砲' });
}
// missile / rocket: homing on the nearest enemy aircraft ahead (missiles), straight (rockets)
function v5Missile(a, homing) {
  const s = Math.sin(a.yaw), c = Math.cos(a.yaw), p = a.pitch || 0;
  let tgt = null;
  if (homing) {
    let bd = 2500;
    for (const j of [...MIL.jets, ...MIL.ahs]) {
      const dx = j.x - a.x, dz = j.z - a.z, d = Math.hypot(dx, dz, j.y - a.y);
      d < bd && (dx * s + dz * c) / (Math.hypot(dx, dz) || 1) > 0.6 && ((bd = d), (tgt = j));
    }
  }
  const v = homing ? 320 : 180;
  MIL.missiles.push({ x: a.x + s * 6, y: a.y - 1, z: a.z + c * 6, vx: s * Math.cos(p) * v, vy: -Math.sin(p) * v, vz: c * Math.cos(p) * v, t: 0, tgt, by: !0 });
  xt('toast', homing ? (tgt ? 'ミサイル発射 — ロックオン' : 'ミサイル発射') : 'ロケット発射');
}
function v5MissileTick(dt) {
  for (let i = MIL.missiles.length - 1; i >= 0; i--) {
    const m = MIL.missiles[i];
    m.t += dt;
    if (m.tgt && !m.tgt.dead) {
      const dx = m.tgt.x - m.x, dy = m.tgt.y - m.y, dz = m.tgt.z - m.z, d = Math.hypot(dx, dy, dz) || 1, v = Math.hypot(m.vx, m.vy, m.vz);
      m.vx += ((dx / d) * v - m.vx) * Math.min(1, dt * 3);
      m.vy += ((dy / d) * v - m.vy) * Math.min(1, dt * 3);
      m.vz += ((dz / d) * v - m.vz) * Math.min(1, dt * 3);
      if (d < 10) {
        m.tgt.hp = 0;
        xt('explode', { x: m.x, y: m.y, z: m.z, big: !0, byPlayer: m.by });
        MIL.missiles.splice(i, 1);
        continue;
      }
    } else m.vy -= 2 * dt;
    const nx = m.x + m.vx * dt, ny = m.y + m.vy * dt, nz = m.z + m.vz * dt, g = groundUnder(nx, nz, ny + 5).g;
    if (ny <= g + 0.3 || rayBuildings(m.x, m.y, m.z, nx, ny, nz) < 1 || m.t > 8) {
      xt('explode', { x: nx, y: Math.max(g, ny), z: nz, big: !0, byPlayer: m.by });
      MIL.missiles.splice(i, 1);
      continue;
    }
    m.x = nx; m.y = ny; m.z = nz;
    We.smoke && We.smoke.spawn(nx, ny, nz, 0, 0.3, 0, rt(0.6, 1.2), 0.6, 2.5, 0.85, 0.85, 0.85, 0.5);
  }
}

// ---------- ★5: tanks on the roads, fighters and an attack helicopter from the air
function milWantedTick(dt) {
  const s = Ke();
  if (s < 5) {
    MIL.w5 = 0;
    for (const j of MIL.jets) j.leave = !0;
    for (const j of MIL.ahs) j.leave = !0;
  } else MIL.w5 = (MIL.w5 || 0) + dt;
  // tanks
  if (s >= 5 && (MIL.tankT = (MIL.tankT || 8) - dt) <= 0) {
    MIL.tankT = 10;
    const n = G.cars.filter((c) => c.t === 'tank' && c.ctl === 'police' && !c.removed && !c.dead).length;
    if (n < 2) {
      const c = YR('tank', !1);
      c && (Object.assign(c, { hp: 900, armor: 0.75, boost: 1 }), n === 0 && xt('toast', `自衛隊の${MILNAME.tank}が出動した！`));
    }
  }
  // fighters after 15 s at ★5, an attack helicopter after 25 s
  if (s >= 5 && MIL.w5 > 15 && MIL.jets.filter((j) => !j.leave).length < 2 && (MIL.jetT = (MIL.jetT || 0) - dt) <= 0) {
    MIL.jetT = 30;
    MIL.jets.push(milEnemyJet());
    MIL.jets.length === 1 && xt('toast', `${MILNAME.fighter}がスクランブル発進した！`);
  }
  if (s >= 5 && MIL.w5 > 25 && !MIL.ahs.some((j) => !j.leave)) (MIL.ahs.push(milEnemyAh()), xt('toast', `攻撃ヘリ ${MILNAME.ah}が出動した！`));
  for (let i = MIL.jets.length - 1; i >= 0; i--) milJetTick(MIL.jets[i], dt) || (R.scene.remove(MIL.jets[i].m), MIL.jets.splice(i, 1));
  for (let i = MIL.ahs.length - 1; i >= 0; i--) milAhTick(MIL.ahs[i], dt) || (R.scene.remove(MIL.ahs[i].m), MIL.ahs.splice(i, 1));
}
function milEnemyJet() {
  const p = il(), a = Math.random() * 6.28, m = new THREE.Mesh(fGeo(), milMat());
  R.scene.add(m);
  return { m, x: p.x + Math.cos(a) * 3000, z: p.z + Math.sin(a) * 3000, y: 250, yaw: a + Math.PI, roll: 0, v: 160, hp: 100, st: 'in', gunT: 0, msl: 2 };
}
function milJetTick(j, dt) {
  const p = il(), py = p.y || 0;
  if (j.hp <= 0 && !j.dead) ((j.dead = !0), xt('explode', { x: j.x, y: j.y, z: j.z, big: !0, byPlayer: !0 }), xt('toast', `${MILNAME.fighter}を撃墜した！`));
  if (j.dead) {
    j.y -= 60 * dt;
    j.x += Math.sin(j.yaw) * 80 * dt;
    j.z += Math.cos(j.yaw) * 80 * dt;
    j.m.rotation.z += dt * 4;
    j.m.position.set(j.x, j.y, j.z);
    if (j.y < groundUnder(j.x, j.z, j.y + 5).g + 1) return xt('explode', { x: j.x, y: j.y, z: j.z, big: !0 }), !1;
    return !0;
  }
  const dx = p.x - j.x, dz = p.z - j.z, d = Math.hypot(dx, dz);
  let want = Math.atan2(dx, dz);
  if (j.leave) want = j.yaw;
  else if (j.st === 'out') ((want = j.yaw), d > 1400 && (j.st = 'in'));
  const turn = It(ln(want - j.yaw), -0.6 * dt, 0.6 * dt);
  j.yaw += turn;
  j.roll = Ee(j.roll, -turn / dt * 1.2, dt * 2);
  const alt = Math.max(groundUnder(j.x, j.z, 900).g, py) + (j.st === 'in' && d < 900 ? 110 : 220);
  j.y += It(alt - j.y, -30 * dt, 30 * dt);
  j.x += Math.sin(j.yaw) * j.v * dt;
  j.z += Math.cos(j.yaw) * j.v * dt;
  // strafing run: cannon bursts while lined up and close, a missile at a vehicle
  if (!j.leave && j.st === 'in' && d < 700 && Math.abs(ln(Math.atan2(dx, dz) - j.yaw)) < 0.25) {
    (j.gunT -= dt) <= 0 && ((j.gunT = 0.12), v5CopMayShoot(j, p.x, py, p.z) && G.npcShoot(j.x, j.y, j.z, 0.08, 9, `${MILNAME.fighter}の機関砲に撃たれた`));
    if (j.msl > 0 && P.mode !== 'foot' && d < 600 && (j.mT = (j.mT || 0) - dt) <= 0) {
      j.mT = 6;
      j.msl--;
      MIL.missiles.push({ x: j.x, y: j.y - 2, z: j.z, vx: Math.sin(j.yaw) * 220, vy: -40, vz: Math.cos(j.yaw) * 220, t: 0, tgt: { get x() { return il().x; }, get y() { return (il().y || 0) + 1; }, get z() { return il().z; } }, by: !1 });
    }
  }
  d < 120 && j.st === 'in' && (j.st = 'out');
  j.m.position.set(j.x, j.y, j.z);
  j.m.rotation.set(0, j.yaw, j.roll, 'YXZ');
  return !(j.leave && d > 4000);
}
function milEnemyAh() {
  AH_GEO || (AH_GEO = v5AhGeo());
  const p = il(), a = Math.random() * 6.28, M = new THREE.Group(), y = new THREE.Mesh(AH_GEO, milMat()), rot = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  rot.position.y = 2.4;
  M.add(y, rot);
  R.scene.add(M);
  return { m: M, rot, x: p.x + Math.cos(a) * 900, z: p.z + Math.sin(a) * 900, y: 80, yaw: 0, hp: 160, fireT: 4 };
}
function milAhTick(h, dt) {
  const p = il(), py = p.y || 0;
  if (h.hp <= 0 && !h.dead) ((h.dead = !0), xt('explode', { x: h.x, y: h.y, z: h.z, big: !0, byPlayer: !0 }), xt('toast', `${MILNAME.ah}を撃墜した！`));
  if (h.dead) {
    h.y -= 25 * dt;
    h.m.rotation.y += dt * 5;
    h.m.position.set(h.x, h.y, h.z);
    return h.y < groundUnder(h.x, h.z, h.y + 5).g + 1 ? (xt('explode', { x: h.x, y: h.y, z: h.z, big: !0 }), !1) : !0;
  }
  const a = G.t * 0.15, tx = h.leave ? h.x + 100 : p.x + Math.cos(a) * 140, tz = h.leave ? h.z : p.z + Math.sin(a) * 140, dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz);
  d > 1 && ((h.x += (dx / d) * Math.min(d, 45 * dt)), (h.z += (dz / d) * Math.min(d, 45 * dt)));
  h.y += (Math.max(groundUnder(h.x, h.z, 400).g, py) + 60 - h.y) * Math.min(1, dt * 0.6);
  h.yaw = Math.atan2(p.x - h.x, p.z - h.z);
  h.m.position.set(h.x, h.y, h.z);
  h.m.rotation.set(0.1, h.yaw, 0);
  h.rot.rotation.y += dt * 40;
  if (!h.leave && (h.fireT -= dt) <= 0 && Math.hypot(p.x - h.x, p.z - h.z) < 260) {
    h.fireT = rt(4, 7);
    if (v5CopMayShoot(h, p.x, py, p.z) && rayBuildings(h.x, h.y, h.z, p.x, py + 1, p.z) >= 1) {
      const s = Math.hypot(p.x - h.x, py - h.y, p.z - h.z) || 1;
      MIL.missiles.push({ x: h.x, y: h.y - 1, z: h.z, vx: ((p.x + rt(-6, 6) - h.x) / s) * 160, vy: ((py - h.y) / s) * 160, vz: ((p.z + rt(-6, 6) - h.z) / s) * 160, t: 0, tgt: null, by: !1 });
    }
  }
  return !(h.leave && Math.hypot(p.x - h.x, p.z - h.z) > 1500);
}
function v5MilTick(dt) {
  milTick(dt);
  v5TankTurrets(dt);
  v5ShellTick(dt);
  v5MissileTick(dt);
  v5WeaponsTick(dt);
  milWantedTick(dt);
}
