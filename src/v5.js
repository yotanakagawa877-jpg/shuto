// ===================== SHUTO v5.0 =====================
// Concatenated after game.js and v4.js (same scope). game.js calls into here through small hooks:
//   policeAI (replaces the old one, which stays as policeAI0 for far routing), v5CopBumpAmt, v5CarHit, v5Tick,
//   v5CopMayShoot, v5Busted. State lives in V5.
var V5 = { stats: { runOver: 0, shots: [0, 0, 0, 0, 0, 0], pit: 0 }, inited: !1, arrest: null, spikes: [], blocks: [], hideT: 0, lastCar: null, swapT: 0, prefT: 0, pref: 0 };

// ---------- prefecture (警視庁 / 神奈川県警 / 千葉県警 / 埼玉県警 …) from a 500 m raster built by tools/v5/pref.py
var PREF_NAMES = ['', '警視庁', '神奈川県警', '千葉県警', '埼玉県警', '茨城県警', '山梨県警', '群馬県警', '栃木県警', '静岡県警'];
var PREF_EN = ['', 'METROPOLITAN POLICE', 'KANAGAWA POLICE', 'CHIBA POLICE', 'SAITAMA POLICE', 'IBARAKI POLICE', 'YAMANASHI POLICE', 'GUNMA POLICE', 'TOCHIGI POLICE', 'SHIZUOKA POLICE'];
var PREF_GRID = null;
function prefGrid() {
  if (PREF_GRID || typeof PREF_DATA === 'undefined') return PREF_GRID;
  const d = PREF_DATA, a = new Uint8Array(d.nx * d.nz);
  let k = 0;
  for (const part of d.rle.split(',')) {
    if (!part) continue;
    const c = +part[0], n = +part.slice(1);
    a.fill(c, k, k + n);
    k += n;
  }
  return (PREF_GRID = { ...d, a });
}
function prefAt(x, z) {
  const g = prefGrid();
  if (!g) return 1;
  const i = Math.floor((x - g.x0) / g.s), j = Math.floor((z - g.z0) / g.s);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return 1;
  return g.a[j * g.nx + i] || 1;
}
function policeName(x, z) {
  return PREF_NAMES[prefAt(x, z)] || '警視庁';
}

// ---------- police driving
// Far away the old router (policeAI0) follows the road graph. Within 45 m:
//  * the player on foot: slow down and stop 10 m short (never run them over); the officers get out and run (game.js)
//  * the player in a car, below ★3: follow at a distance, no contact
//  * ★3+: three roles — PIT (aim at a rear corner, push it to spin the car), box (pull alongside / ahead and squeeze),
//    chase (sit 9 m behind). A stopped car is approached slowly and boxed in, not rammed.
function policeAI(n, t) {
  const e = P, inCar = e.mode === 'car' && e.car, tg = inCar ? e.car : e, tier = G.polTier || {};
  const dx = tg.x - n.x, dz = tg.z - n.z, o = Math.hypot(dx, dz), m = Math.abs(n.v);
  if (o > 45 && !(inCar && tier.ram && o < 70)) return policeAI0(n, t);
  if (n.rev > 0) return ((n.rev -= t), [0, 0, 1]);
  let tx = tg.x, tz = tg.z, vdes = 0;
  const fx = Math.sin(tg.yaw || 0), fz = Math.cos(tg.yaw || 0), sx = -fz, sz = fx;
  const vp = inCar ? Math.hypot(tg.vx || 0, tg.vz || 0) : 0;
  if (!inCar) {
    // on foot (or in a building / on a train …): pull up 10–12 m away
    const stopD = 10 + Math.min(4, m * 0.25);
    vdes = Math.max(0, (o - stopD) * 0.7);
  } else {
    const side = (n.x - tg.x) * sx + (n.z - tg.z) * sz >= 0 ? 1 : -1;
    n.role || (n.role = ['pit', 'box', 'chase'][(n.slot || 0) % 3]);
    if (!tier.ram) {
      tx = tg.x - fx * 10; tz = tg.z - fz * 10;
      vdes = vp + It((Math.hypot(tx - n.x, tz - n.z) - 2) * 0.5, -6, 6);
      o < 8 && (vdes = Math.min(vdes, vp - 2));
    } else if (vp < 2.5) {
      // stopped: close in and block, gently
      tx = tg.x + side * sx * 4 + fx * (n.role === 'box' ? 5 : -5); tz = tg.z + side * sz * 4 + fz * (n.role === 'box' ? 5 : -5);
      vdes = Math.max(0, Math.hypot(tx - n.x, tz - n.z) * 0.6);
    } else if (n.role === 'pit') {
      // line up beside the rear wheel, then turn in across it
      const dT = Math.hypot(tg.x - fx * 1.8 + side * sx * 2.2 - n.x, tg.z - fz * 1.8 + side * sz * 2.2 - n.z);
      dT > 3 ? ((tx = tg.x - fx * 1.8 + side * sx * 2.2), (tz = tg.z - fz * 1.8 + side * sz * 2.2)) : ((tx = tg.x - fx * 1.2), (tz = tg.z - fz * 1.2));
      vdes = vp + It(dT * 0.7, 1, 9);
    } else if (n.role === 'box') {
      const ahead = 3 + vp * 0.15;
      tx = tg.x + fx * ahead + side * sx * 2.4; tz = tg.z + fz * ahead + side * sz * 2.4;
      vdes = vp + It(Math.hypot(tx - n.x, tz - n.z) * 0.6, -3, 8);
    } else {
      tx = tg.x - fx * 9; tz = tg.z - fz * 9;
      vdes = vp + It((Math.hypot(tx - n.x, tz - n.z) - 1) * 0.6, -5, 8);
    }
  }
  // never drive into a player on foot (or a bystander): brake for anything in the lane ahead
  const fwx = Math.sin(n.yaw), fwz = Math.cos(n.yaw);
  if (!inCar && e.mode === 'foot') {
    const ax = dx * fwx + dz * fwz, lat = Math.abs(dx * -fwz + dz * fwx);
    ax > 0 && ax < 6 + m * 1.2 && lat < 3 && (vdes = 0);
  }
  const h = obstacleAhead(n, 20);
  let av = 0;
  if (h < 14 && n.obst && n.obst !== tg) {
    const y = n.obst;
    av = ((y.x - n.x) * Math.cos(n.yaw) - (y.z - n.z) * Math.sin(n.yaw) > 0 ? 1 : -1) * 0.7;
    h < 6 && (vdes = Math.min(vdes, 2));
  }
  const x = ln(Math.atan2(tx - n.x, tz - n.z) - n.yaw);
  // stuck against something: back off
  m < 1.2 && vdes > 3 ? ((n.stk = (n.stk || 0) + t), n.stk > 1.8 && ((n.stk = 0), (n.rev = 1.1))) : (n.stk = 0);
  let thr = 0, brk = 0;
  const dv = vdes - n.v;
  dv > 0.5 ? (thr = It(dv / 5, 0.25, 1)) : dv < -0.8 && (brk = It(-dv / 6, 0.2, 1));
  Math.abs(x) > 1 && m > 12 && ((thr = 0), (brk = Math.max(brk, 0.7)));
  return [thr, It(-x * 2.4 + av, -1, 1), brk];
}

// heat added by bumping a patrol car: a nudge is a warning, a real crash is a crime
function v5CopBumpAmt(sp) {
  return sp < 3 ? 0 : sp < 7 ? 0.35 : sp < 12 ? 0.8 : 1.3;
}

// collision hook: a PIT from a patrol car spins the player's car
function v5CarHit(n, r, sp, bx, bz) {
  // impact type: a hard hit on the side of a car (T-bone) spins it, a very hard one rolls a light / tall car over
  for (const [a, o, sgn] of [[n, r, 1], [r, n, -1]]) {
    if (a.td.bike || a.flip || (a.ctl !== 'player' && o.ctl !== 'player')) continue;
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), lat = Math.abs(bx * -fz + bz * fx);
    if (lat > 0.7 && sp > 9) {
      const massRatio = (o.td.L * o.td.W) / (a.td.L * a.td.W);
      a.spin = (a.spin || 0) + sgn * Math.min(2.5, sp * 0.08 * massRatio);
      sp * massRatio > 26 / hnd5(a)[2] && v5Flip(a, sgn);
    }
  }
  const cop = isCop(n) && n.ctl === 'police' ? n : isCop(r) && r.ctl === 'police' ? r : null,
    pl = n.ctl === 'player' ? n : r.ctl === 'player' ? r : null;
  if (!cop || !pl || !(G.polTier && G.polTier.ram) || sp < 2) return;
  // where on the player's car was it hit? rear quarter (local forward < -0.5 L/4) from the side
  const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw), lx = cop.x - pl.x, lz = cop.z - pl.z;
  const ax = lx * fx + lz * fz, lat = lx * -fz + lz * fx;
  if (ax < pl.td.L * 0.1 && Math.abs(lat) > pl.td.W * 0.15) {
    V5.stats.pit++;
    pl.spin = (pl.spin || 0) + Math.sign(lat) * Math.min(3.2, 0.8 + sp * 0.25);
    xt('toast', 'PIT で回された！');
  }
}

// heat rules on top of crime(): one incident adds at most ~1.2 stars
function v5CapHeat(before) {
  G.heat > before + 1.25 && (G.heat = Math.max(before + 1.25, Math.min(G.heat, 1.3)));
}

// hiding places: under a flyover / in a tunnel / in a multi-storey or underground car park
function v5Hidden() {
  const t = il();
  if (P.interior) return 'building';
  const y = t.y || 0;
  roadsNear(t.x, t.z, 16, V5Q);
  for (const o of V5Q) if (o.e.elev && o.d < o.e.hw + 1 && edgeY(o.e, o.s) > y + 4) return 'under';
  if (y < -2) return 'tunnel';
  return null;
}
var V5Q = [];

// officers must not shoot below ★3, nor with a bystander in the line of fire
function v5CopMayShoot(n, tx, ty, tz) {
  if (Ke() < 3) return !1;
  const dx = tx - n.x, dz = tz - n.z, L = Math.hypot(dx, dz) || 1;
  pedsNear((n.x + tx) / 2, (n.z + tz) / 2, L / 2 + 2, V5P);
  for (const p of V5P) {
    if (p === n || p.state === 'down' || p.kind === 4 || p.kind === 11) continue;
    const u = ((p.x - n.x) * dx + (p.z - n.z) * dz) / (L * L);
    if (u < 0.05 || u > 1) continue;
    if (Math.hypot(n.x + dx * u - p.x, n.z + dz * u - p.z) < 1.4) return !1;
  }
  return !0;
}
var V5P = [];

// ---------- roadblocks (★3+): patrol cars across the road, cones, a spike strip across the free lanes
var CONE_GEO = null, CONE_MAT = null, SPIKE_GEO = null, SPIKE_MAT = null;
function v5Roadblock() {
  const t = il(), sp = Math.hypot(t.vx || 0, t.vz || 0);
  if (sp < 6 || P.mode !== 'car') return !1;
  const ex = (t.vx || 0) / sp, ez = (t.vz || 0) / sp, ax = t.x + ex * 200, az = t.z + ez * 200, L = [];
  roadsNear(ax, az, 80, L);
  const a = L.filter((h) => !h.e.elev && !h.e.dead && h.e.kind !== 'X' && h.e.kind !== 'R' && h.e.hw >= 2.8).sort((h, d) => h.d - d.d)[0];
  if (!a) return !1;
  const e = a.e, p = edgePos(e, a.s, {}), dx = p.dx, dz = p.dz, nx = dz, nz = -dx, hw = e.hw;
  const yaw = Math.atan2(nx, nz), blk = { x: p.x, z: p.z, t: 60, cars: [], cones: null, spike: null, nx, nz, dx, dz, hw };
  // cars nose to nose across ~70% of the width, leaving one lane free with the spikes
  const n = Math.max(2, Math.min(4, Math.round(hw / 2.6)));
  for (let i = 0; i < n; i++) {
    const off = -hw + 2.2 + i * 2.7;
    if (off > hw - 3.4) break;
    const c = newCar(i % 2 ? 'police' : 'police', p.x + nx * off - dx * (i % 2) * 0.8, p.z + nz * off - dz * (i % 2) * 0.8, yaw + (i % 2 ? 0.35 : -0.35), 'phys');
    if (!c) continue;
    Object.assign(c, { y: 0.04, ctl: null, parked: !0, keep: !1, siren: !0, block: 60, driver: !1 });
    blk.cars.push(c);
    const cp = spawnPedAt(c.x - dx * 4, c.z - dz * 4, 'cop', 4);
    cp && ((cp.t = 60), (cp.home = null));
  }
  // cones and spikes (instanced, a handful)
  CONE_GEO || ((CONE_GEO = new THREE.ConeGeometry(0.22, 0.7, 10)), (CONE_MAT = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6 })));
  SPIKE_GEO || ((SPIKE_GEO = new THREE.BoxGeometry(1, 0.06, 0.5)), (SPIKE_MAT = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.6, roughness: 0.4 })));
  const cones = new THREE.InstancedMesh(CONE_GEO, CONE_MAT, 10), M = new THREE.Matrix4();
  for (let i = 0; i < 10; i++) {
    const off = -hw + 0.6 + (i / 9) * (hw * 2 - 1.2);
    M.makeTranslation(p.x + nx * off - dx * 6, 0.35, p.z + nz * off - dz * 6);
    cones.setMatrixAt(i, M);
  }
  R.scene.add(cones);
  blk.cones = cones;
  const sw = Math.max(3, hw * 2 - 2), spike = new THREE.Mesh(SPIKE_GEO, SPIKE_MAT);
  spike.scale.set(sw, 1, 1);
  spike.position.set(p.x - dx * 3, 0.05, p.z - dz * 3);
  spike.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
  R.scene.add(spike);
  blk.spike = { m: spike, x: spike.position.x, z: spike.position.z, ax: nx, az: nz, w: sw / 2 };
  V5.blocks.push(blk);
  xt('toast', '前方に検問！ スパイクに注意');
  return !0;
}
function v5BlocksTick(dt) {
  for (let i = V5.blocks.length - 1; i >= 0; i--) {
    const b = V5.blocks[i];
    b.t -= dt;
    // spike strip: any car whose centre crosses the strip gets flat tyres
    if (b.spike) {
      const s = b.spike;
      carsNear(s.x, s.z, s.w + 3, V5C);
      for (const c of V5C) {
        if (c.flat || c.td.bike === 'cycle') continue;
        const lx = c.x - s.x, lz = c.z - s.z, al = lx * s.ax + lz * s.az, ac = lx * -s.az + lz * s.ax;
        if (Math.abs(al) < s.w && Math.abs(ac) < 0.6 + Math.abs(c.v || 0) * 0.02) {
          c.flat = 1;
          c.ctl === 'player' && (xt('toast', 'スパイクを踏んだ！ タイヤがパンク'), gt.thud && gt.thud());
        }
      }
    }
    const far = Math.hypot(b.x - P.x, b.z - P.z) > 600;
    if (b.t <= 0 || (far && b.t < 50) || Ke() === 0) {
      b.cones && (R.scene.remove(b.cones), b.cones.dispose());
      b.spike && R.scene.remove(b.spike.m);
      for (const c of b.cars) c.block = 0;
      V5.blocks.splice(i, 1);
    }
  }
}
var V5C = [];

// ---------- arrest: hands up, officers close in, then the BUSTED screen
function v5Busted() {
  if (V5.arrest) return !0;
  // ★1 = 職務質問: a fine and a warning instead of an arrest
  if (Ke() <= 1 && P.mode === 'foot') {
    const fine = Math.min(Math.max(0, G.money), 5000);
    G.money -= fine;
    resetPolice();
    G.bust = 0;
    xt('big', { t: '職務質問', s: `${policeName(P.x, P.z)}：厳重注意 −¥${fine.toLocaleString('ja-JP')}`, col: '#4a8bff' });
    return !0;
  }
  V5.arrest = { t: 2.4 };
  const pn = policeName(P.x, P.z);
  xt('big', { t: '確保', s: pn + 'に身柄を確保された', col: '#4a8bff' });
  return !0;
}
function v5ArrestTick(dt) {
  const a = V5.arrest;
  if (!a) return;
  a.t -= dt;
  P.speed = 0;
  P.mode === 'car' && P.car && ((P.car.vx *= 0.9), (P.car.vz *= 0.9));
  // officers walk up
  for (const p of G.peds) if ((p.kind === 4 || p.kind === 11) && p.state === 'cop' && Math.hypot(p.x - P.x, p.z - P.z) < 25) p.aim = 0;
  if (a.t <= 0) {
    V5.arrest = null;
    xt('busted');
  }
}

// ---------- wanted level: hiding, changing car, slower build-up
function v5WantedTick(dt) {
  const s = Ke();
  if (s === 0) {
    V5.hideT = 0;
    return;
  }
  const hid = v5Hidden();
  V5.hid = hid;
  // not seen + hidden: the evade timer runs faster
  if (hid && G.evade > 0) G.evade += dt * (hid === 'building' ? 1 : 0.8);
  // switching cars while unseen: they lose the description of the car
  const car = P.mode === 'car' ? P.car : null;
  if (car && car !== V5.lastCar) {
    V5.lastCar && G.evade > 1 && ((G.evade += Math.max(3, (G.loseT || 12) * 0.35)), xt('toast', '車を乗り換えた — 警察が見失いかけている'));
    V5.lastCar = car;
  }
}

// ---------- the per-frame entry point (called from SM after the v4 tick)
function v5Tick(dt) {
  if (!V5.inited) {
    V5.inited = !0;
  }
  v5ArrestTick(dt);
  v5WantedTick(dt);
  v5BlocksTick(dt);
  usvTick(dt);
  v5DogsTick();
  v5MilTick(dt);
  v5FacTick(dt);
  v5LandTick(dt);
  v5ExtraTick(dt);
  // spinning player car after a PIT
  for (const c of G.cars)
    if (c.spin && c.mode === 'phys') {
      c.yaw += c.spin * dt;
      c.spin *= Math.max(0, 1 - dt * 1.6);
      Math.abs(c.spin) < 0.05 && (c.spin = 0);
    }
  // flat tyres: slower and they pull to one side
  for (const k of G.cars) if (k.flat && k.mode === 'phys') ((k.vx *= 1 - dt * 0.35), (k.vz *= 1 - dt * 0.35));
  // prefecture of the police for the HUD toast when stars first appear
  if ((V5.prefT -= dt) <= 0) ((V5.prefT = 2), (V5.pref = prefAt(P.x, P.z)));
}
