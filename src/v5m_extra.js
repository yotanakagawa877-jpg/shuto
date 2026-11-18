// ===================== v5.0 extras: achievements / 図鑑, radio news, earthquake & typhoon, night racers =====================
// achievements of v5 (appended to the v4 list; v4Ach checks them every 2 s). s = v4Stats(); s.v5 holds the counters.
var s5 = () => {
  const s = v4Stats();
  return s.v5 || (s.v5 = { base: [], tank: 0, jet: 0, down: 0, svc: 0, thru: 0, field: 0, surr: 0, quake: 0, pit: 0 });
};
ACH.push(
  ['v5base', '立入禁止', '自衛隊・米軍の基地に入った', () => s5().base.length > 0],
  ['v5bases', '基地めぐり', '基地を4か所訪れた', () => s5().base.length >= 4],
  ['v5tank', '戦車長', '戦車を運転した', () => s5().tank > 0],
  ['v5jet', 'エースパイロット', '戦闘機・攻撃ヘリを撃墜した', () => s5().down > 0],
  ['v5svc', '運行開始', '自分の運行系統をつくった', () => (G.stats.usv || []).length > 0],
  ['v5thru', '直通運転', '別の路線へ直通する運行をつくった', () => USV.list.some((sv) => new Set(sv.L.map((l) => l.ri)).size >= 2)],
  ['v5field', '田園風景', '田んぼ・畑の中を走った', () => s5().field > 0],
  ['v5surr', '自首', '警察署・交番に自首した', () => s5().surr > 0],
  ['v5pit', '逃げ切り名人', '手配度★3以上から逃げ切った（PIT を受けても）', () => s5().pit > 0],
  ['v5quake', '揺れに耐えた', '地震を体験した', () => s5().quake > 0],
);
// 図鑑: bases count as landmarks
if (typeof MIL_DATA !== 'undefined') for (const k in MIL_DATA) LM_JA['mil_' + k] = MIL_DATA[k].name;

// ---------- radio news: in-game events become headlines while driving (one every ~80 s)
var NEWS = { q: [], t: 30, last: '' };
function news(t) {
  t !== NEWS.last && NEWS.q.length < 6 && (NEWS.q.push(t), (NEWS.last = t));
}
function v5NewsTick(dt) {
  if ((NEWS.t -= dt) > 0) return;
  NEWS.t = 80;
  if (!NEWS.q.length || !(P.mode === 'car' || P.mode === 'ride' || P.mode === 'boat')) return;
  toast('📻 ニュース：' + NEWS.q.shift());
}

// ---------- earthquake / typhoon: rare events (at most one every ~25 game minutes)
var EVT = { t: 900, q: null, ty: null };
function v5EventTick(dt) {
  if (EVT.q) {
    const q = EVT.q;
    q.t -= dt;
    G.cam.shake = Math.max(G.cam.shake || 0, q.amp * Math.min(1, q.t / 2));
    for (const c of G.cars) c.mode === 'ai' && (c.v *= 1 - Math.min(1, dt * 1.5));
    if (q.t <= 0) ((EVT.q = null), toast('揺れがおさまった'), news(`${q.where}で震度${q.int}の地震。交通機関に一時乱れ`));
  }
  if (EVT.ty) {
    const y = EVT.ty;
    y.t -= dt;
    // gusts push light vehicles and the player's car sideways a little
    const g = Math.sin(G.t * 0.7) * Math.sin(G.t * 0.23) * y.w;
    for (const c of G.cars) c.mode === 'phys' && !c.air && ((c.vx += g * dt * (c.td.bike ? 1.6 : 0.6)), (c.vz += g * 0.4 * dt));
    y.t <= 0 && ((EVT.ty = null), toast('台風が過ぎ去った'), news('台風一過。各地で倒木や冠水の被害'));
  }
  if ((EVT.t -= dt) > 0 || V5.arrest || G.dying || MS.cur) return;
  EVT.t = rt(1500, 2600);
  if (Math.random() < 0.6) {
    const int = Math.random() < 0.7 ? 3 : Math.random() < 0.8 ? 4 : 5;
    EVT.q = { t: 6 + int * 2, amp: int * 0.25, int, where: districtAt(P.x, P.z).n };
    s5().quake++;
    toast(`⚠ 緊急地震速報　強い揺れに警戒（震度${int}）`);
    v5Gunshot(P.x, P.z);
  } else {
    EVT.ty = { t: 180, w: 6 };
    toast('🌀 台風が接近。強い雨と突風に注意');
    news('大型の台風が関東に接近');
  }
}

// ---------- night racers on the expressways (走り屋): fast cars at night, hasty drivers
function v5NightRacers() {
  if (R.night < 0.5) return;
  for (const c of G.cars) {
    if (c.mode !== 'ai' || c.racer !== void 0 || !c.e) continue;
    c.racer = (c.t === 'sport' || c.t === 'super') && c.e.kind === 'X' && Math.random() < 0.6;
    c.racer && ((c.temper = 1.35), (c.gap = 1.2), (c.lcMin = 1.2), (c.persona = 'racer'));
  }
}

// ---------- counters for the achievements / news, every 0.5 s
var X5 = { t: 0, lastStars: 0 };
function v5ExtraTick(dt) {
  v5NewsTick(dt);
  v5EventTick(dt);
  if ((X5.t -= dt) > 0) return;
  X5.t = 0.5;
  const s = s5(), st = Ke();
  P.mode === 'car' && P.car && P.car.t === 'tank' && s.tank++;
  MIL.built && MIL.inside && !s.base.includes(MIL.built.b.key) && (s.base.push(MIL.built.b.key), v4Stats().dex.lm.includes('mil_' + MIL.built.b.key) || v4Stats().dex.lm.push('mil_' + MIL.built.b.key));
  P.mode === 'car' && P.car && Math.abs(P.car.v) > 5 && luAt(P.car.x, P.car.z) === 1 && s.field++;
  // escaped from ★3+
  X5.lastStars >= 3 && st === 0 && !G.dying && !V5.arrest && (s.pit++, news(`${policeName(P.x, P.z)}、逃走車両を見失う`));
  st >= 4 && X5.lastStars < 4 && news(`${districtAt(P.x, P.z).n}付近で大規模な捜査`);
  X5.lastStars = st;
  v5NightRacers();
}
