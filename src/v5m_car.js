// ===================== v5.0 car handling, barriers, rollover, damage =====================
// physCar (game.js) asks v5Grip / v5Steer for the tyre grip and steering of each car, and calls v5AfterPhys at the end
// of every physics step (bridge railings, ground motorway walls, rollovers, suspension bounce, damage tint).
// handling per type: grip (lateral damping multiplier), steer (steering multiplier), roll (how easily it rolls over)
var HANDLE = {
  sedan: [1, 1, 1], hybrid: [0.95, 1, 1], compact: [0.95, 1.08, 1.05], kei: [0.85, 1.12, 1.3], suv: [0.92, 0.92, 1.35],
  van: [0.85, 0.85, 1.4], taxi: [1, 1, 1], delivery: [0.8, 0.8, 1.5], truck: [0.7, 0.65, 1.6], bus: [0.7, 0.6, 1.7],
  police: [1.15, 1.08, 0.95], riot: [0.75, 0.7, 1.5], super: [1.35, 1.15, 0.7], keitora: [0.8, 1.05, 1.5],
  ambulance: [0.85, 0.85, 1.45], fire: [0.7, 0.65, 1.6], sdf: [0.8, 0.75, 1.3], sport: [1.25, 1.12, 0.8],
};
var hnd5 = (n) => HANDLE[n.t] || HANDLE.sedan;
// lateral grip: weather (rain is already in the base value), snow, flat tyres, the drift that follows a handbrake turn
function v5Grip(n, p) {
  const h = hnd5(n);
  let k = h[0];
  typeof V4 !== 'undefined' && V4.snow > 0.05 && (k *= 1 - V4.snow * 0.55);
  n.flat && (k *= 0.55);
  n.driftT > 0 && (k *= 0.35);
  n.flip && (k = 4);
  return p * k;
}
function v5Steer(n, r) {
  const h = hnd5(n);
  // handbrake while moving starts a drift that lasts while the car is sideways and the throttle is held
  if (n.ctl === 'player') {
    const sp = Math.abs(n.v || 0), slip = Math.abs(n.lat || 0);
    r && sp > 7 ? (n.driftT = 0.7) : n.driftT > 0 && (n.driftT -= G.dt || 1 / 30);
    slip > 3 && sp > 6 && G.input && G.input.thr > 0 && n.driftT > 0 && (n.driftT = Math.max(n.driftT, 0.35));
  }
  return (n.flip ? 0 : 1) * h[1] * (n.driftT > 0 ? 1.25 : 1);
}

// ---------- after each physics step
var V5RQ = [];
function v5AfterPhys(n, t) {
  // parked / standing cars: nothing to do (this runs for every physics car every frame)
  if (!n.flip && !n.susp && !n.landV && (n.hp === n.hpSeen || (n.ctl !== 'player' && n.ctl !== 'police')) && Math.abs(n.vx) + Math.abs(n.vz) < 0.4) return;
  // ground roads over water: a railing along the bridge edge (the old code let cars roll off into the river)
  if (!n.air && (n.y || 0) < 3 && !n.sink && n.td && !n.td.bike) {
    roadsNear(n.x, n.z, 18, V5RQ);
    let best = null;
    for (const o of V5RQ) if (!o.e.elev && (!best || o.d - o.e.hw < best.d - best.e.hw)) best = o;
    if (best) {
      const lim = best.e.hw + 0.4, over = best.d - lim;
      if (over > 0 && over < 4 && isWaterAt(n.x, n.z)) v5Wall(n, best.x, best.z, best.d, over, t, 'rail');
      // ground motorway: concrete walls at the outer edge (not at junction discs)
      else if ((best.e.kind === 'X') && best.d > best.e.hw - n.td.W / 2 + 0.2 && best.d < best.e.hw + 3) {
        const A = W.nodes[best.e.a], B = W.nodes[best.e.b];
        const nearNode = Math.hypot(n.x - A.x, n.z - A.z) < (A.r || 10) + 4 || Math.hypot(n.x - B.x, n.z - B.z) < (B.r || 10) + 4;
        let other = !1;
        for (const o of V5RQ) if (o !== best && o.d < o.e.hw + 0.5) { other = !0; break; }
        nearNode || other || v5Wall(n, best.x, best.z, best.d, best.d - (best.e.hw - n.td.W / 2 + 0.2), t, 'wall');
      }
    }
  }
  // rollover: very high sideways speed (a slide into a kerb / barrier / another car)
  if (!n.flip && !n.air && !n.td.bike && Math.abs(n.lat || 0) > 15 / hnd5(n)[2] && (n.wallT || 0) > 0) v5Flip(n, Math.sign(n.lat || 1));
  n.wallT > 0 && (n.wallT -= t);
  if (n.flip) {
    const f = n.flip;
    f.t += t;
    f.r = Math.min(Math.PI, f.r + t * 4.2);
    n.vx *= 1 - Math.min(1, t * 2.4);
    n.vz *= 1 - Math.min(1, t * 2.4);
  }
  // suspension: settle after landing
  n.vy < -3 && n.air && (n.landV = -n.vy);
  !n.air && n.landV && ((n.susp = -Math.min(0.25, n.landV * 0.03)), (n.landV = 0));
  n.susp && ((n.susp *= Math.max(0, 1 - t * 6)), Math.abs(n.susp) < 0.005 && (n.susp = 0));
  // damage: the body darkens as it is battered (player and police cars, cheap: only on change)
  if (n.hp !== n.hpSeen && (n.ctl === 'player' || n.ctl === 'police') && n.color !== void 0) {
    n.base === void 0 && (n.base = n.color);
    n.hpSeen = n.hp;
    const k = It((100 - Math.max(0, n.hp)) / 100, 0, 1) * 0.55, c = new THREE.Color(n.base).lerp(new THREE.Color(0x26221e), k);
    const e = Vr[n.t];
    e && (e.m.setColorAt(n.slot, c), (e.m.instanceColor.needsUpdate = !0));
  }
}
// push a car back from a wall at (cx, cz) side: slide along it, scrape, bounce off a head-on hit
function v5Wall(n, cx, cz, d, over, t, kind) {
  const nx = (n.x - cx) / (d || 1), nz = (n.z - cz) / (d || 1);
  n.x -= nx * over;
  n.z -= nz * over;
  v5WallResp(n, nx, nz, kind);
}
function v5WallResp(n, nx, nz, kind) {
  const vn = n.vx * nx + n.vz * nz;
  if (vn <= 0) return;
  const sp = Math.hypot(n.vx, n.vz), ang = sp > 0.5 ? vn / sp : 0;
  // remove the normal part (a little bounce for hard hits), keep most of the tangential part: the car slides along
  const bounce = ang > 0.6 ? 0.35 : 0.08, fr = 1 - Math.min(0.5, ang * 0.6);
  let tx = n.vx - nx * vn, tz = n.vz - nz * vn;
  n.vx = tx * fr - nx * vn * bounce;
  n.vz = tz * fr - nz * vn * bounce;
  // turn the nose along the wall a little
  if (sp > 4) {
    const ty = Math.atan2(tx, tz), fwd = Math.cos(n.yaw - ty) >= 0 ? ty : ty + Math.PI;
    n.yaw += ln(fwd - n.yaw) * Math.min(1, ang * 0.5);
  }
  n.wallT = 0.25;
  vn > 4 && Sg(n, vn * (kind === 'rail' ? 0.9 : 1));
  // sparks while scraping
  vn > 1.5 && Math.random() < 0.5 && Ro(n.x + nx * n.td.W * 0.5, (n.y || 0) + 0.4, n.z + nz * n.td.W * 0.5, Math.min(6, vn * 0.6));
}
function v5Flip(n, dir) {
  n.flip = { t: 0, r: 0, dir };
  n.vy = 4;
  n.air = !0;
  n.y += 0.2;
  damageCar(n, 25);
  n.ctl === 'player' && (xt('toast', '横転した！ 乗る ボタンで脱出'), (G.cam.shake = Math.max(G.cam.shake || 0, 0.8)));
}
