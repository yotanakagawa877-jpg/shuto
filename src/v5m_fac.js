// ===================== v5.0 public facilities (役所・警察署/交番・消防署・病院・学校・図書館・郵便局) =====================
// Positions from OSM (AMEN in v5m_0amen.js). On foot within 22 m of one, 乗る opens its menu; the nearest hospital /
// police station is also where WASTED / BUSTED put the player back (the old lists only covered central Tokyo).
var FAC = { t: 0, near: null, inc: null };
var FAC_JA = { po: '警察', ho: '病院', fi: '消防署', th: '役所', li: '図書館', pt: '郵便局', sc: '学校' };
function facNearest(k, x, z, r, pred) {
  const A = AMEN[k];
  if (!A) return null;
  const xy = A.xy;
  let bi = -1, bd = r * r;
  for (let i = 0; i < xy.length; i += 2) {
    const dx = xy[i] - x, dz = xy[i + 1] - z, d = dx * dx + dz * dz;
    d < bd && (!pred || pred(A.n[i >> 1])) && ((bd = d), (bi = i));
  }
  if (bi < 0) return null;
  const nm = A.n[bi >> 1] || '', koban = nm.endsWith('|k');
  return { k, x: xy[bi], z: xy[bi + 1], name: nm.replace('|k', ''), koban, d: Math.sqrt(bd) };
}
function facLabel(f) {
  if (f.k === 'po') return f.koban ? '交番' : f.name || '警察署';
  return f.name || FAC_JA[f.k];
}
// the facility the player stands at (checked twice a second)
function facAt() {
  if (G.t - FAC.t < 0.5 && Math.hypot(P.x - (FAC.px || 0), P.z - (FAC.pz || 0)) < 4) return FAC.near;
  FAC.t = G.t;
  FAC.px = P.x;
  FAC.pz = P.z;
  FAC.near = null;
  if (P.mode !== 'foot' || P.interior) return null;
  let best = null;
  for (const k of ['po', 'ho', 'fi', 'th', 'li', 'pt', 'sc']) {
    const f = facNearest(k, P.x, P.z, 22);
    f && (!best || f.d < best.d) && (best = f);
  }
  return (FAC.near = best);
}
function v5FacPrompt() {
  const f = facAt();
  return f ? `${facLabel(f)}に入る` : '';
}
function v5FacInteract() {
  const f = facAt();
  if (!f) return !1;
  const lab = facLabel(f), rows = [];
  const row = (label, sub, text, fn, color) => rows.push({ label, sub, color, buttons: [{ text, fn }] });
  if (f.k === 'po') {
    const s = Ke();
    s > 0 && row('自首する', `手配度 ★${s} を消す（罰金 ¥${(s * 2000).toLocaleString('ja-JP')}）`, '自首', () => {
      G.money = Math.max(0, G.money - s * 2000);
      resetPolice();
      toast(`${policeName(f.x, f.z)}に自首した。手配が解除された`);
      s5().surr++;
    }, '#4a8bff');
    row('道をたずねる', '次のミッションの場所を地図に出してもらう', 'たずねる', () => {
      const m = availableMissions()[0];
      m ? ((MS.target = [m.start[0], m.start[1]]), updRoute(), toast(`「${m.title}」はこっちだよ、と教えてくれた`)) : toast('今はとくに案内することはないそうだ');
    });
    row('事件の手伝い', '逃げた車を追いかけて止める（報酬 ¥8,000）', '引き受ける', () => facChase(f));
  } else if (f.k === 'ho') {
    const need = Math.ceil(100 - P.hp);
    row('治療を受ける', need > 0 ? `体力を回復（¥${(need * 20).toLocaleString('ja-JP')}）` : 'どこも悪くないようだ', '受ける', () => {
      if (need <= 0) return toast('どこも悪くないようだ');
      G.money = Math.max(0, G.money - need * 20);
      P.hp = 100;
      toast('治療を受けた。体力が回復した');
    }, '#e5402b');
  } else if (f.k === 'fi') {
    row('消防車を借りる', '消防車で火事の現場へ', '借りる', () => facVehicle('fire', '消防車を借りた'), '#e5402b');
    row('救急車を借りる', '救急車で走る', '借りる', () => facVehicle('ambulance', '救急車を借りた'), '#f2f2f2');
  } else if (f.k === 'th') {
    row('地域の情報', `${districtAt(P.x, P.z).n}・管轄 ${policeName(P.x, P.z)}`, '見る', () => toast(`ここは${districtAt(P.x, P.z).n}。管轄は${policeName(P.x, P.z)}`));
    row('仕事をさがす', '配達やタクシーの仕事を紹介してもらう（車が必要）', 'さがす', () => (P.mode === 'car' ? startJob() : (facVehicle('delivery', '配達用の車を借りた'), setTimeout(() => startJob(), 300))));
    row('転入届を出す', 'この近くを「家」にする（セーブの位置）', '出す', () => (saveGame(!0), toast('転入届を出した。ここが新しい家だ')));
  } else if (f.k === 'li') {
    row('本を読む', '1時間すごす', '読む', () => {
      R.tod = (R.tod + 1) % 24;
      const keys = Object.keys(LM_JA || {});
      const k = keys[Math.floor(Math.random() * keys.length)];
      toast(k ? `「${LM_JA[k]}」について調べた。いつか行ってみよう` : '静かに本を読んだ');
    });
  } else if (f.k === 'pt') {
    row('配達の仕事', 'スクーターを借りて荷物を届ける', '始める', () => (facVehicle('scooter', 'スクーターを借りた'), setTimeout(() => startJob(), 300)), '#e60012');
  } else if (f.k === 'sc') {
    row('授業を見学する', '2時間すごす', '見学', () => ((R.tod = (R.tod + 2) % 24), toast('授業を見学した。なつかしい')));
  }
  v4Menu(lab, rows, '出る');
  return !0;
}
// a vehicle at the kerb next to the facility, and get in
function facVehicle(t, msg) {
  const L = [];
  roadsNear(P.x, P.z, 60, L);
  const o = L.filter((h) => !h.e.elev).sort((a, b) => a.d - b.d)[0];
  const q = o ? edgePos(o.e, o.s, {}) : { x: P.x + 3, z: P.z, dx: 0, dz: 1 };
  const c = newCar(t, q.x, q.z, Math.atan2(q.dx, q.dz), 'phys');
  if (!c) return toast('いまは貸し出せる車がありません');
  Object.assign(c, { y: 0.04, driver: !1, parked: !0 });
  P.x = c.x + 2;
  P.z = c.z;
  tryEnter();
  toast(msg);
}
// 事件の手伝い: a getaway car leaves from near the police box; stop it (wreck it or box it in until it stops)
function facChase(f) {
  const c = spawnAICar(f.x + rt(-200, 200), f.z + rt(-200, 200));
  if (!c) return toast('いまは事件がないようだ');
  toPhys(c);
  Object.assign(c, { ctl: 'npc', goal: { x: f.x + rt(-2500, 2500), z: f.z + rt(-2500, 2500) }, boost: 1.15, keep: !0, flee: 1 });
  FAC.inc = { c, t: 180, reward: 8000 };
  MS.target = [c.x, c.z];
  toast('逃走車を止めろ！（壊すか、止まるまで追い詰める）');
}
function v5FacTick(dt) {
  const I = FAC.inc;
  if (!I) return;
  I.t -= dt;
  const c = I.c, sp = c.mode === 'ai' ? c.v : Math.hypot(c.vx, c.vz);
  MS.target = [c.x, c.z];
  // keep driving away
  c.arrived && (c.goal = { x: c.x + rt(-2000, 2000), z: c.z + rt(-2000, 2000) }), (c.arrived = !1);
  const near = Math.hypot(c.x - P.x, c.z - P.z) < 15;
  near && sp < 1 ? (I.stopT = (I.stopT || 0) + dt) : (I.stopT = 0);
  if (c.dead || c.hp <= 30 || I.stopT > 3) {
    G.money += I.reward;
    toast(`逃走車を止めた！ 報酬 ¥${I.reward.toLocaleString('ja-JP')}`);
    gt.cash && gt.cash();
    (c.keep = !1), (FAC.inc = null), (MS.target = null), (G.route = null);
  } else if (I.t <= 0 || c.removed || Math.hypot(c.x - P.x, c.z - P.z) > 900) {
    toast('逃走車に逃げられた…');
    (c.keep = !1), (FAC.inc = null), (MS.target = null), (G.route = null);
  }
}
// WASTED -> nearest hospital, BUSTED -> nearest police station (not a 交番); null = keep the old list
function v5Places(kind, x, z) {
  const f = kind === 'busted' ? facNearest('po', x, z, 6000, (n) => !n.endsWith('|k')) : facNearest('ho', x, z, 6000);
  return f ? [[f.x, f.z]] : null;
}
