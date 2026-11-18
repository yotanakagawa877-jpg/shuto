// ===================== v5.0 NPC: driver personalities, pedestrians (cower, dodge, onlookers, dogs) =====================
// Traffic already keeps lanes, stops at signals / stop lines, signals and changes lanes, passes parked cars and pulls over
// for sirens (aiUpdate). v5 adds driving personalities (gap, pace, lane-change eagerness, horn) and pedestrian reactions.
var PERSONA = {
  safe: { temper: [0.84, 0.94], gap: 4, lc: 6 },
  normal: { temper: [0.94, 1.06], gap: 2.6, lc: 4 },
  hasty: { temper: [1.12, 1.24], gap: 1.5, lc: 1.8, horn: 1 },
  taxi: { temper: [1.04, 1.14], gap: 2, lc: 2.5, horn: 1 },
  truck: { temper: [0.82, 0.92], gap: 5, lc: 8 },
};
function v5Persona(c) {
  const t = c.t;
  const k = t === 'taxi' ? 'taxi' : t === 'truck' || t === 'delivery' || t === 'bus' || t === 'fire' ? 'truck' : Math.random() < 0.25 ? 'safe' : Math.random() < 0.3 ? 'hasty' : 'normal';
  const p = PERSONA[k];
  c.persona = k;
  c.temper = rt(p.temper[0], p.temper[1]);
  c.gap = p.gap;
  c.lcMin = p.lc;
  return c;
}

// ---------- pedestrians: extra states handled before the normal state machine (true = handled)
function v5PedState(n, t, e) {
  const s = n.state;
  if (s === 'cower') {
    // crouched with hands over the head, then run
    n.t -= t;
    n.t <= 0 && ((n.state = 'flee'), (n.t = rt(3, 6)));
    return !0;
  }
  if (s === 'dodge') {
    // a quick side-step away from a car
    const d = n.dodge;
    d.t += t;
    const k = Math.min(1, d.t / 0.35);
    n.x = d.x0 + d.dx * k;
    n.z = d.z0 + d.dz * k;
    collideBuildings(n, 0.3, 0);
    d.t >= 0.9 && ((n.state = 'walk'), (n.dodge = null), (n.lo = It(n.lo || 0, -1.1, 1.1)));
    return !0;
  }
  if (s === 'gawk') {
    // walk up to the scene, watch, one of them is on the phone
    const g = n.gawk;
    n.t -= t;
    const dx = g.x - n.x, dz = g.z - n.z, d = Math.hypot(dx, dz);
    d > g.r ? Of(n, g.x, g.z, 1.3, t) : (n.yaw += ln(Math.atan2(dx, dz) - n.yaw) * Math.min(1, t * 4));
    n.aim = g.phone ? 0.5 : 0;
    if (n.t <= 0 || d > 80) ((n.state = 'flee'), (n.t = 0.1), (n.gawk = null), (n.aim = 0));
    return !0;
  }
  // walking pedestrians jump out of the way of a car coming at them (on the pavement, or a car off its lane)
  if (s === 'walk' && (n.dgT = (n.dgT || 0) - t) <= 0) {
    n.dgT = 0.2;
    pedCars5.length = 0;
    carsNear(n.x, n.z, 20, pedCars5);
    for (const k of pedCars5) {
      if (k.removed || (k.y || 0) > 2) continue;
      const v = k.mode === 'ai' ? k.v : Math.hypot(k.vx, k.vz);
      if (v < 4 || k.mode === 'ai') continue;
      const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw), dx = n.x - k.x, dz = n.z - k.z, f = dx * fx + dz * fz, l = dx * -fz + dz * fx;
      if (f > 0 && f < 3 + v * 0.9 && Math.abs(l) < k.td.W / 2 + 1) {
        const side = l >= 0 ? 1 : -1;
        n.state = 'dodge';
        n.dodge = { t: 0, x0: n.x, z0: n.z, dx: -fz * side * 2.6, dz: fx * side * 2.6 };
        return !0;
      }
    }
  }
  return !1;
}
var pedCars5 = [];
// gunfire: the nearest crouch, the rest run (scarePeds already makes them flee)
function v5Gunshot(x, z) {
  for (const p of G.peds) {
    if (Math.abs(p.x - x) > 30 || Math.abs(p.z - z) > 30) continue;
    if (p.state === 'down' || p.kind === 4 || p.kind === 11 || p.state === 'cop' || p.state === 'attack') continue;
    if (p.state === 'cower') continue;
    Math.random() < (Math.hypot(p.x - x, p.z - z) < 15 ? 0.7 : 0.35) && ((p.state = 'cower'), (p.t = rt(2.5, 5)));
  }
}
var pedP5 = [];
// a crash or a burning car draws onlookers; one calls it in (if the player caused it, that is a report)
function v5Crash(x, z, p) {
  if (p < 8 || (V5.crashT || 0) > G.t) return;
  V5.crashT = G.t + 6;
  let phone = 0;
  for (const q of G.peds) {
    if (Math.hypot(q.x - x, q.z - z) > 45) continue;
    if (q.state !== 'walk' && q.state !== 'idle' && q.state !== 'wait') continue;
    if (q.kind === 4 || q.kind === 11 || Math.random() > 0.45) continue;
    q.state = 'gawk';
    q.t = rt(10, 22);
    q.gawk = { x, z, r: rt(6, 10), phone: phone++ === 0 };
  }
  phone && Math.hypot(P.x - x, P.z - z) < 30 && P.mode === 'car' && Math.random() < 0.5 && (V5.lastCrashReport = G.t);
}

// ---------- dogs on a lead: a few walkers get a dog that trots beside them (one instanced mesh, at most 24)
var DOGS = { m: null, n: 0, max: 24 };
function v5DogsInit() {
  const g = new Mt({ color: !0 }), a = (c) => (g.setColor(c), g);
  a(0xffffff).box(0, 0.32, 0, 0.22, 0.2, 0.55, 0, {});
  a(0xffffff).box(0, 0.48, 0.3, 0.16, 0.16, 0.2, 0, {});
  a(0x222222).box(0, 0.44, 0.42, 0.08, 0.06, 0.06, 0, {});
  for (const [x, z] of [[-0.07, 0.2], [0.07, 0.2], [-0.07, -0.2], [0.07, -0.2]]) a(0xffffff).box(x, 0, z, 0.05, 0.24, 0.05, 0, {});
  a(0xffffff).box(0, 0.44, -0.3, 0.04, 0.04, 0.16, 0, {});
  const geo = g.build(), m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), DOGS.max);
  m.count = 0;
  m.frustumCulled = !1;
  R.scene.add(m);
  DOGS.m = m;
}
var DOG_COL = [0xd8b07a, 0x2b2420, 0xf2efe8, 0x9a6a3c, 0x6f6a64];
var dogM = null, dogC = null;
function v5DogsTick() {
  if (!DOGS.m) v5DogsInit();
  dogM || ((dogM = new THREE.Object3D()), (dogC = new THREE.Color()));
  let k = 0;
  for (const p of G.peds) {
    if (k >= DOGS.max) break;
    p.dog === void 0 && (p.dog = p.kind !== 4 && p.kind !== 11 && Math.random() < 0.06 ? Math.floor(Math.random() * DOG_COL.length) : -1);
    if (p.dog < 0 || p.state === 'down' || p.killed || (p.state !== 'walk' && p.state !== 'idle' && p.state !== 'wait' && p.state !== 'cross')) continue;
    const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    dogM.position.set(p.x + c * 0.7 + s * 0.6, p.y - 0.15, p.z - s * 0.7 + c * 0.6);
    dogM.rotation.set(0, p.yaw, 0);
    dogM.updateMatrix();
    DOGS.m.setMatrixAt(k, dogM.matrix);
    DOGS.m.setColorAt(k, dogC.set(DOG_COL[p.dog]));
    k++;
  }
  DOGS.m.count = k;
  DOGS.m.instanceMatrix.needsUpdate = !0;
  DOGS.m.instanceColor && (DOGS.m.instanceColor.needsUpdate = !0);
}
