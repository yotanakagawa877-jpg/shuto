// ============================================================================================================
// v4.0 「首都圏ストーリー」 — appended to game.js at build time (tools/bundle.sh), so it shares game.js' scope.
//  - save slots (3), achievements, encyclopedia (stations / shrines / landmarks), talking to pedestrians
//  - rides: Ferris wheels, roller coasters; horse-race betting at every racecourse; 調布 sightseeing flights
//  - story chapters: 横浜編 / 湾岸千葉編 / 大宮編 / 鎌倉湘南編 (missions in MISSIONS, chapter field)
// ============================================================================================================

// ---------- save slots
var V4 = { slot: 0, inited: !1, dexT: 0, achT: 0, ride: null, race: null, toastQ: [] };
// (game.js' own top-level code calls this before this file has run, so V4 may not exist yet)
function getSlot() {
  if (typeof V4 !== 'undefined' && V4 && V4.slot) return V4.slot;
  let n = 1;
  try {
    n = +localStorage.getItem('shuto2.slot') || 1;
  } catch {}
  n = n >= 1 && n <= 3 ? n : 1;
  typeof V4 !== 'undefined' && V4 && (V4.slot = n);
  return n;
}
function slotKey(n) {
  n = n || getSlot();
  return n === 1 ? 'shuto2.save' : 'shuto2.save.' + n;
}
function setSlot(n) {
  V4.slot = n;
  try {
    localStorage.setItem('shuto2.slot', String(n));
  } catch {}
}
function anySave() {
  for (let i = 1; i <= 3; i++) if (Qi.get(slotKey(i))) return !0;
  return !1;
}
function slotLabel(n) {
  const o = Qi.get(slotKey(n));
  if (!o) return { label: `スロット ${n}`, sub: '空き' };
  let place = '';
  try {
    place = W.nodes && W.nodes.length ? districtAt(o.x, o.z).n : '';
  } catch {}
  const d = new Date(o.t || 0),
    ds = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { label: `スロット ${n}`, sub: `¥${(o.money || 0).toLocaleString('ja-JP')} ・ ミッション ${(o.done || []).length} ・ ${place ? place + ' ・ ' : ''}${ds}` };
}
// a modal list (works before the HUD exists, e.g. on the title screen)
function v4Menu(title, rows, closeText, onClose) {
  let ov = document.getElementById('v4ov');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'v4ov';
    ov.className = 'ov';
    ov.style.cssText = 'background:rgba(5,6,10,.86);align-items:center;justify-content:center;z-index:9';
    ov.innerHTML = '<div class="panel scroll"><h2></h2><div class="v4l"></div><button class="close"></button></div>';
    document.body.appendChild(ov);
  }
  ov.querySelector('h2').textContent = title;
  const L = ov.querySelector('.v4l');
  L.innerHTML = '';
  for (const o of rows) {
    const r = document.createElement('div');
    r.className = 'row';
    r.innerHTML = `<i style="background:${o.color || '#ffd23f'}"></i><b>${o.label}${o.sub ? `<small style="display:block;color:#8a93a3;font-weight:500">${o.sub}</small>` : ''}</b>`;
    for (const a of o.buttons || []) {
      const b = document.createElement('button');
      b.textContent = a.text;
      b.onclick = (e) => {
        e.stopPropagation();
        ov.hidden = !0;
        a.fn();
      };
      r.appendChild(b);
    }
    L.appendChild(r);
  }
  const c = ov.querySelector('.close');
  c.textContent = closeText || '閉じる';
  c.onclick = () => {
    ov.hidden = !0;
    onClose && onClose();
  };
  ov.hidden = !1;
}
function v4MenuOpen() {
  const ov = document.getElementById('v4ov');
  return !!(ov && !ov.hidden);
}
// apply a save object to a running game (title -> CONTINUE after the world was already built)
function v4ApplySave(o) {
  if (!o) return;
  G.stats = { missions: 0, jobs: 0, distance: 0, rides: 0, flights: 0, capsules: [] };
  Gz(o);
  MS.done = new Set(o.done || []);
  MS.cur = null;
  MS.target = null;
  G.route = null;
  v4Stats();
}
function v4NewGame() {
  j6();
  MS.done = new Set();
  MS.cur = null;
  MS.target = null;
  v4Stats();
}
function v4Stats() {
  const s = G.stats;
  s.ach || (s.ach = []);
  s.dex || (s.dex = { st: [], sh: [], lm: [] });
  s.bets || (s.bets = { n: 0, won: 0, best: 0 });
  s.wheel || (s.wheel = 0);
  s.coaster || (s.coaster = 0);
  s.tours || (s.tours = 0);
  s.talks || (s.talks = 0);
  return s;
}
// title screen: CONTINUE / NEW GAME choose a slot
function v4Start(slot, cont) {
  setSlot(slot);
  if (G.booted) {
    aw(cont).then(() => {
      cont ? v4ApplySave(Qi.get(slotKey())) : v4NewGame();
    });
  } else aw(cont);
}
$t('tContinue').onclick = () => {
  const rows = [];
  for (let i = 1; i <= 3; i++) {
    const o = Qi.get(slotKey(i)),
      l = slotLabel(i);
    o && rows.push({ ...l, color: i === getSlot() ? '#6be29a' : '#ffd23f', buttons: [{ text: 'つづきから', fn: () => v4Start(i, !0) }] });
  }
  if (rows.length === 1 && Qi.get(slotKey(getSlot()))) return v4Start(getSlot(), !0);
  rows.length && v4Menu('つづきから', rows, '戻る');
};
$t('tNew').onclick = () => {
  const rows = [];
  for (let i = 1; i <= 3; i++) {
    const o = Qi.get(slotKey(i)),
      l = slotLabel(i);
    rows.push({
      ...l,
      color: o ? '#e5402b' : '#6be29a',
      buttons: [
        {
          text: o ? '上書きして開始' : 'ここで開始',
          fn: () => {
            if (o) try { localStorage.removeItem(slotKey(i)); } catch {}
            v4Start(i, !1);
          },
        },
      ],
    });
  }
  v4Menu('はじめから — セーブ先を選ぶ', rows, '戻る');
};
(() => {
  const b = $t('tContinue');
  if (anySave()) ((b.disabled = !1), b.classList.add('pri'), $t('tNew').classList.remove('pri'));
  const sm = $t('tNew').querySelector('small');
  sm && (sm.textContent = 'はじめから（スロットを選ぶ）');
})();
function v4SaveMenu() {
  const rows = [];
  for (let i = 1; i <= 3; i++) {
    const l = slotLabel(i);
    rows.push({ ...l, color: i === getSlot() ? '#6be29a' : '#ffd23f', buttons: [{ text: i === getSlot() ? 'ここにセーブ' : 'このスロットにセーブ', fn: () => (setSlot(i), saveGame()) }] });
  }
  v4Menu('セーブ', rows, '戻る');
}

// ---------- encyclopedia (図鑑)
var LM_JA = {
  tokyoTower: '東京タワー', skytree: 'スカイツリー', tokyoStation: '東京駅丸の内駅舎', scramble: '渋谷スクランブル交差点', shibuya109: 'シブヤ108', tocho: '東京都庁',
  docomo: '代々木の時計塔ビル', cocoon: 'まゆ型タワー', roppongiHills: '六本木ハイツタワー', azabudai: '麻布台ハイツ', sensoji: '浅草寺', kaminarimon: '雷門', rainbowBridge: 'レインボーブリッジ',
  fujiTV: '台場テレビ球体', bigSight: '東京ビッグサイト', kabukichoGate: '歌舞伎町一番街', diet: '国会議事堂', meijiShrine: '明治神宮', sunshine60: '池袋サンライズ60', tokyoDome: '後楽園ドーム',
  toranomonHills: '虎ノ門ハイツ', palaceKeep: '皇居 天守台', kachidokiBridge: '勝鬨橋', gate: '東京駅前広場', heliport: '東京ヘリポート', nihonbashi: '日本橋', ameyoko: 'アメ横',
  landmarkTower: 'みなとみらいタワー', queensSquare: 'クイーンズプラザ横浜', cosmoClock: 'みなとみらい大観覧車', redBrick: '赤レンガ倉庫', osanbashi: '大さん橋', yamashitaPark: '山下公園',
  marineTower: 'マリンタワー', chinatown: '横浜中華街', yokohamaStadium: '横浜公園スタジアム', bayBridge: '横浜ベイブリッジ', tsubasaBridge: 'つばさ橋', kawasakiDaishi: '川崎大師',
  yokohamaStation: '横浜駅', musashiKosugi: '武蔵小杉',
  omiyaHikawa: '大宮 氷川神社', railwayMuseum: '鉄道博物館', superArena: 'さいたまスーパーアリーナ', kawagoeBell: '川越 時の鐘', urawaRace: '浦和競馬場',
  tsurugaoka: '鶴岡八幡宮', daibutsu: '鎌倉大仏', enoshima: '江の島', seaCandle: '江の島シーキャンドル', chibaPortTower: '千葉ポートタワー', makuhariMesse: '幕張メッセ',
  marineStadium: '幕張マリン球場', funabashiRace: '船橋競馬場', hakkeijima: '八景島', mikasa: '記念艦 三笠', hachiojiSt: '八王子駅', kisarazuAF: '木更津飛行場',
};
// v4.0 landmarks of the new chapters (real places; added to the landmark table before the world is built)
Object.assign(Mf, {
  omiyaHikawa: [35.9161, 139.6297], railwayMuseum: [35.9213, 139.6183], superArena: [35.8949, 139.6311], kawagoeBell: [35.9222, 139.4829], urawaRace: [35.8538, 139.6727],
  tsurugaoka: [35.3259, 139.5565], daibutsu: [35.3167, 139.5358], enoshima: [35.2995, 139.4808], seaCandle: [35.2998, 139.4794], chibaPortTower: [35.6003, 140.0948],
  makuhariMesse: [35.6478, 140.0347], marineStadium: [35.645, 140.031], funabashiRace: [35.6796, 139.9989], hakkeijima: [35.3388, 139.6449], mikasa: [35.2847, 139.6738],
  hachiojiSt: [35.6557, 139.3389], kisarazuAF: [35.3983, 139.9103],
});
function v4Dex() {
  const s = v4Stats(),
    px = P.mode === 'car' || P.mode === 'ride' ? (P.car ? P.car.x : P.x) : P.air ? P.air.x : P.x,
    pz = P.mode === 'car' || P.mode === 'ride' ? (P.car ? P.car.z : P.z) : P.air ? P.air.z : P.z,
    add = (k, name, what) => {
      if (s.dex[k].includes(name)) return;
      s.dex[k].push(name);
      toast(`📖 図鑑に登録：${name}（${what}）`);
    };
  if (P.mode === 'train' && P.train && P.train.state === 'dwell' && P.train.cur) {
    const n = P.train.cur.ja;
    n && add('st', n, '駅');
  }
  for (const S of W.stations) if (Math.abs(S.x - px) < 90 && Math.abs(S.z - pz) < 90 && Math.hypot(S.x - px, S.z - pz) < 90) add('st', S.ja, '駅');
  if (P.mode === 'foot')
    for (const d of To) if (d.type === 'omairi' && Math.abs(d.x - px) < 30 && Math.abs(d.z - pz) < 30 && Math.hypot(d.x - px, d.z - pz) < 30) add('sh', d.label, '神社');
  for (const k in W.landmarks) {
    const L = W.landmarks[k],
      nm = LM_JA[k];
    if (!nm || Math.abs(L.x - px) > 260 || Math.abs(L.z - pz) > 260) continue;
    Math.hypot(L.x - px, L.z - pz) < 260 && add('lm', nm, 'ランドマーク');
  }
  const F = W.fun;
  if (F) {
    for (const rc of F.race) Math.hypot(rc.c[0] - px, rc.c[1] - pz) < 400 && add('lm', rc.name, '競馬場');
    for (const w of F.wheels) w[4] && Math.hypot(w[0] - px, w[1] - pz) < 150 && add('lm', w[4], '観覧車');
    for (const pk of F.parks) pk.name && Math.hypot(pk.c[0] - px, pk.c[1] - pz) < 300 && add('lm', pk.name, 'テーマパーク');
  }
}
function v4DexMenu() {
  const s = v4Stats(),
    nSh = To.filter((d) => d.type === 'omairi').length,
    nLm = Object.keys(LM_JA).length + (W.fun ? W.fun.race.length + W.fun.parks.filter((p) => p.name).length + W.fun.wheels.filter((w) => w[4]).length : 0);
  const cat = (k, name, total, col) => ({
    label: `${name}  ${s.dex[k].length} / ${total}`,
    sub: s.dex[k].slice(-12).reverse().join('・') || 'まだありません',
    color: col,
    buttons: [{ text: '一覧', fn: () => v4Menu(`${name}（${s.dex[k].length}）`, s.dex[k].slice().sort().map((n) => ({ label: n, color: col })), '戻る', v4DexMenu) }],
  });
  v4Menu('図鑑', [cat('st', '駅', W.stations.length, '#2f8a4e'), cat('sh', '神社', nSh, '#d8401f'), cat('lm', 'ランドマーク・名所', nLm, '#ffd23f')], '閉じる');
}

// ---------- achievements (実績)
var ACH = [
  ['m1', '上京', '最初のミッションをクリア', (s) => MS.done.has('m1')],
  ['tokyo', '東京編クリア', '東京のミッション10本をすべてクリア', () => MISSIONS.filter((m) => !m.ch).every((m) => MS.done.has(m.id))],
  ['yokohama', 'ハマの顔', '横浜編をすべてクリア', () => v4ChapterDone('yokohama')],
  ['chiba', '湾岸の主', '湾岸千葉編をすべてクリア', () => v4ChapterDone('chiba')],
  ['omiya', '鉄道のまちの友', '大宮編をすべてクリア', () => v4ChapterDone('omiya')],
  ['shonan', '湘南の風', '鎌倉湘南編をすべてクリア', () => v4ChapterDone('shonan')],
  ['story', '首都圏ストーリー', 'すべてのミッションをクリア', () => MISSIONS.every((m) => MS.done.has(m.id))],
  ['st50', '駅めぐり', '50駅を図鑑に登録', (s) => s.dex.st.length >= 50],
  ['st300', '乗り鉄', '300駅を図鑑に登録', (s) => s.dex.st.length >= 300],
  ['sh10', '御朱印集め', '神社を10社めぐる', (s) => s.dex.sh.length >= 10],
  ['lm20', '名所めぐり', 'ランドマーク・名所を20か所登録', (s) => s.dex.lm.length >= 20],
  ['ride50', '通勤の達人', '電車に50回乗る', (s) => s.rides >= 50],
  ['fly10', '空の人', '10回フライトする', (s) => s.flights >= 10],
  ['km100', 'ロングドライブ', '合計100km移動', (s) => s.distance >= 1e5],
  ['job20', '働き者', '仕事を20件こなす', (s) => s.jobs >= 20],
  ['wheel', 'てっぺんの景色', '観覧車に乗る', (s) => s.wheel >= 1],
  ['coaster', '絶叫', 'ジェットコースターに乗る', (s) => s.coaster >= 1],
  ['bet', '初馬券', '競馬で馬券を買う', (s) => s.bets.n >= 1],
  ['betwin', '的中！', '馬券を的中させる', (s) => s.bets.won >= 1],
  ['bigwin', '万馬券', '1回の配当で¥100,000以上', (s) => s.bets.best >= 1e5],
  ['tour', '遊覧飛行', '調布で遊覧飛行の仕事をこなす', (s) => s.tours >= 1],
  ['talk10', '人付き合い', '通行人と10回話す', (s) => s.talks >= 10],
  ['rich', '億万長者', '所持金¥1,000,000', () => G.money >= 1e6],
  ['caps', 'ガチャマニア', 'ガチャカプセルを25個集める', (s) => s.capsules.length >= 25],
];
function v4ChapterDone(ch) {
  const L = MISSIONS.filter((m) => m.ch === ch);
  return L.length > 0 && L.every((m) => MS.done.has(m.id));
}
function v4Ach() {
  const s = v4Stats();
  for (const [id, name, desc, f] of ACH) {
    if (s.ach.includes(id)) continue;
    let ok = !1;
    try {
      ok = f(s);
    } catch {}
    if (ok) {
      s.ach.push(id);
      toast(`🏆 実績解除：${name}`);
      gt.mission();
    }
  }
}
function v4AchMenu() {
  const s = v4Stats();
  v4Menu(
    `実績 ${s.ach.length} / ${ACH.length}`,
    ACH.map(([id, name, desc]) => ({ label: (s.ach.includes(id) ? '🏆 ' : '・ ') + name, sub: desc, color: s.ach.includes(id) ? '#ffd23f' : '#3a3f4a' })),
    '閉じる',
  );
}

// ---------- talking to pedestrians
var TALK = [
  ['この辺、夜になると首都高の音がよく聞こえるんだよね', 'こんにちは！ 道に迷ったら地図アプリが便利ですよ', '最近、湾岸のほうで走り屋が増えたらしいよ', '駅前の新しいカフェ、もう行った？'],
  ['観覧車からの夜景、おすすめだよ', '競馬場、今日はいいレースがあるらしい', '江ノ電に乗るなら朝が空いてて最高', '大宮の鉄道博物館は一日いても飽きないよ'],
  ['タクシーの運転手さんって道に詳しいよね', 'ガチャカプセル、あと何個集めればいいんだろう', '調布から遊覧飛行が出てるの知ってた？', 'ちょっと急いでるので、失礼！'],
];
function v4Talk() {
  if (P.mode !== 'foot' || P.interior) return !1;
  let best = null,
    bd = 2.6;
  for (const p of G.peds) {
    if (p.dead || p.state === 'flee' || p.state === 'dead') continue;
    const d = Math.hypot(p.x - P.x, p.z - P.z);
    d < bd && ((bd = d), (best = p));
  }
  if (!best) return !1;
  best.state === 'walk' && (best.t = 4);
  best.yaw = Math.atan2(P.x - best.x, P.z - best.z);
  const s = v4Stats();
  s.talks++;
  const d = districtAt(best.x, best.z);
  dialog(`通行人（${d && d.n ? d.n : '街'}）`, [Be(Be(TALK))]);
  return !0;
}

// ---------- rides: Ferris wheels and roller coasters
var COASTERS = [];
function v4NearWheel(x, z) {
  for (const w of WHEELS) if (Math.hypot(w.x - x, w.z - z) < w.R0 * 0.6 + 14) return w;
  return null;
}
function v4NearCoaster(x, z) {
  for (const c of COASTERS) if (Math.hypot(c.P[0][0] - x, c.P[0][1] - z) < 22) return c;
  return null;
}
function v4StartWheel(w) {
  if (G.money < 800) return (toast('お金が足りません（¥800）'), !0);
  G.money -= 800;
  gt.cash();
  v4Stats().wheel++;
  // the gondola nearest the bottom
  let k = 0,
    best = 1e9;
  for (let i = 0; i < w.N; i++) {
    const a = (((w.a + (i / w.N) * Math.PI * 2 + Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
      d = Math.min(a, Math.PI * 2 - a);
    d < best && ((best = d), (k = i));
  }
  V4.ride = { type: 'wheel', w, k, t: 0, dur: 75, back: [P.x, P.z] };
  w.boost = (Math.PI * 2) / 75;
  toast('観覧車に乗った（¥800）— 一周 約75秒。景色を楽しもう');
  return !0;
}
function v4StartCoaster(c) {
  if (G.money < 1200) return (toast('お金が足りません（¥1,200）'), !0);
  G.money -= 1200;
  gt.cash();
  v4Stats().coaster++;
  if (!c.car) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1, 3.4), new THREE.MeshStandardMaterial({ color: 0xe23a3a, roughness: 0.4 }));
    R.scene.add(m);
    c.car = m;
  }
  c.car.visible = !0;
  V4.ride = { type: 'coaster', c, u: 0, v: 3, back: [P.x, P.z] };
  toast('ジェットコースターに乗った（¥1,200）');
  return !0;
}
function v4RideTick(dt) {
  const r = V4.ride;
  if (!r) return;
  P.mode = 'foot';
  P.vy = 0;
  P.onGround = !1; // seated on a ride, not standing on the ground
  P.speed = 0;
  P.walkAmp = 0;
  if (r.type === 'wheel') {
    const w = r.w;
    r.t += dt;
    const a = w.a + (r.k / w.N) * Math.PI * 2,
      lx = Math.cos(a) * (w.R0 + 0.2),
      ly = w.hub + Math.sin(a) * (w.R0 + 0.2) - 1.6,
      ry = w.g.rotation.y;
    P.x = w.x + Math.cos(ry) * lx;
    P.z = w.z - Math.sin(ry) * lx;
    P.y = ly - 0.9;
    if (r.t >= r.dur) {
      w.boost = 0;
      V4.ride = null;
      P.x = r.back[0];
      P.z = r.back[1];
      P.y = 0.2;
      G.cam.snap = !0;
      toast('観覧車を降りた');
      missionEvent('wheel');
    }
  } else if (r.type === 'coaster') {
    const c = r.c,
      h = c.hAt(r.u),
      top = c.H;
    // lift hill at a steady pace, then gravity (energy from the top of the lift)
    r.v = r.u < c.L * 0.14 ? 4 : Math.max(5, Math.sqrt(Math.max(0, 2 * 9.81 * (top - h))) + 3);
    r.u += r.v * dt;
    if (r.u >= c.L - 0.5) {
      V4.ride = null;
      c.car.visible = !1;
      P.x = c.P[0][0] + 6;
      P.z = c.P[0][1] + 6;
      P.y = 0.2;
      G.cam.snap = !0;
      toast('ジェットコースターを降りた');
      missionEvent('coaster');
      return;
    }
    const p = c.at(r.u),
      q = c.at(Math.min(c.L, r.u + 2));
    P.x = p[0];
    P.z = p[1];
    P.y = h + 0.6;
    P.yaw = Math.atan2(q[0] - p[0], q[1] - p[1]);
    c.car.position.set(p[0], h + 0.85, p[1]);
    c.car.rotation.set(-Math.atan2(c.hAt(Math.min(c.L, r.u + 2)) - h, 2), P.yaw, 0, 'YXZ');
  }
}

// ---------- horse racing (競馬): bet at the big screen of every racecourse, watch the race on the course
var HORSES = ['シャトルランナー', 'ミッドナイトメトロ', 'ベイブリッジ', 'ヤマノテオー', 'カンナナスター', 'ショウナンカゼ', 'トーキョーリング', 'ハマノキセキ', 'サイタマミライ', 'マクハリボーイ', 'エドノハナ', 'ムサシノダッシュ'];
var JOCKEY = [0xffffff, 0x111111, 0xe5402b, 0x2a62b6, 0xf2c230, 0x3ac26b, 0xf07ac0, 0xf28c28];
function v4NearRace(x, z) {
  if (!W.fun) return null;
  for (const rc of W.fun.race) if (Math.hypot(rc.c[0] - x, rc.c[1] - z) < 70) return rc;
  return null;
}
function v4BetMenu(rc) {
  if (V4.race) return toast('レース中です。結果をお待ちください'), !0;
  const n = 8,
    names = HORSES.slice().sort(() => Math.random() - 0.5).slice(0, n),
    str = names.map(() => 0.75 + Math.random() * 0.5),
    tot = str.reduce((a, b) => a + b * b * b, 0),
    odds = str.map((s) => Math.max(1.3, Math.round((tot / (s * s * s)) * 0.78 * 10) / 10));
  const rows = names.map((nm, i) => ({
    label: `${i + 1}番 ${nm}`,
    sub: `単勝 ${odds[i].toFixed(1)} 倍`,
    color: '#' + JOCKEY[i].toString(16).padStart(6, '0'),
    buttons: [1e3, 1e4].map((amt) => ({ text: `¥${amt.toLocaleString('ja-JP')}`, fn: () => v4PlaceBet(rc, names, str, odds, i, amt) })),
  }));
  v4Menu(`${rc.name} 発走前 — 単勝を買う`, rows, 'やめる');
  return !0;
}
function v4PlaceBet(rc, names, str, odds, pick, amt) {
  if (G.money < amt) return toast('お金が足りません');
  G.money -= amt;
  gt.cash();
  const s = v4Stats();
  s.bets.n++;
  const ring = rc.rings[0],
    k = ring.length / 2,
    pts = [];
  for (let i = 0; i < k; i++) pts.push([ring[i * 2], ring[i * 2 + 1]]);
  const cum = [0];
  for (let i = 1; i <= k; i++) cum.push(cum[i - 1] + Math.hypot(pts[i % k][0] - pts[i - 1][0], pts[i % k][1] - pts[i - 1][1]));
  const L = cum[k],
    at = (u, off) => {
      u = ((u % L) + L) % L;
      let i = 0;
      for (; i < k - 1 && cum[i + 1] < u; ) i++;
      const a = pts[i],
        b = pts[(i + 1) % k],
        f = (u - cum[i]) / (cum[i + 1] - cum[i] || 1),
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        d = Math.hypot(dx, dz) || 1;
      return [a[0] + dx * f - (dz / d) * off, a[1] + dz * f + (dx / d) * off, Math.atan2(dx, dz)];
    };
  const grp = new THREE.Group(),
    body = new THREE.BoxGeometry(0.7, 0.9, 2.2),
    rider = new THREE.BoxGeometry(0.5, 0.7, 0.5),
    hm = new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.7 }),
    horses = names.map((nm, i) => {
      const h = new THREE.Group(),
        b = new THREE.Mesh(body, hm),
        j = new THREE.Mesh(rider, new THREE.MeshStandardMaterial({ color: JOCKEY[i] }));
      b.position.y = 1.4;
      j.position.set(0, 2.2, -0.2);
      h.add(b, j);
      grp.add(h);
      return { h, u: 0, v: 0, s: str[i] };
    });
  R.scene.add(grp);
  const len = Math.min(L * 0.95, 1200);
  V4.race = { rc, names, odds, pick, amt, horses, grp, at, L, len, t: 0, fin: [] };
  toast(`${pick + 1}番 ${names[pick]} の単勝を¥${amt.toLocaleString('ja-JP')}購入。まもなく発走！`);
  gt.melody && gt.melody();
}
function v4RaceTick(dt) {
  const r = V4.race;
  if (!r) return;
  r.t += dt;
  if (r.t < 3) return;
  r.horses.forEach((h, i) => {
    if (r.fin.includes(i)) return;
    const pace = 15 * h.s + 1.6 * Math.sin(r.t * 0.7 + i * 1.7) + (Math.random() - 0.5) * 2.2;
    h.v += (pace - h.v) * Math.min(1, dt * 1.5);
    h.u += h.v * dt;
    const p = r.at(h.u, 4 + i * 1.6);
    h.h.position.set(p[0], 0, p[1]);
    h.h.rotation.y = p[2];
    h.h.children[0].position.y = 1.4 + Math.abs(Math.sin(r.t * 9 + i)) * 0.18;
    h.u >= r.len && r.fin.push(i);
  });
  if (r.fin.length && !r.called) ((r.called = 1), toast(`1着 ${r.fin[0] + 1}番 ${r.names[r.fin[0]]}！`));
  if (r.fin.length === r.horses.length || r.t > 240) {
    const win = r.fin[0],
      s = v4Stats();
    if (win === r.pick) {
      const pay = Math.round(r.amt * r.odds[win]);
      G.money += pay;
      s.bets.won++;
      s.bets.best = Math.max(s.bets.best, pay);
      big('的中！', `${r.names[win]}  +¥${pay.toLocaleString('ja-JP')}`, '#ffd23f');
      gt.mission();
    } else toast(`はずれ… 勝ったのは ${win + 1}番 ${r.names[win]}（${r.odds[win].toFixed(1)}倍）`);
    missionEvent('bet', { rc: r.rc });
    R.scene.remove(r.grp);
    r.grp.traverse((o) => o.geometry && o.geometry.dispose());
    V4.race = null;
  }
}

// ---------- 調布飛行場: sightseeing flight job (遊覧飛行)
function v4ChofuAF() {
  return W.fun && W.fun.af.find((a) => /調布/.test(a.name));
}
function v4NearChofuDesk(x, z) {
  const af = v4ChofuAF();
  if (!af || !af.apron || !af.apron[0]) return null;
  const A = af.apron[0];
  let cx = 0,
    cz = 0;
  for (let i = 0; i < A.length; i += 2) ((cx += A[i]), (cz += A[i + 1]));
  cx /= A.length / 2;
  cz /= A.length / 2;
  return Math.hypot(cx - x, cz - z) < 80 ? af : null;
}
function v4TourMenu(af) {
  if (MS.cur) return toast('ミッション中です'), !0;
  const tours = [
    { name: '多摩川・新宿副都心コース', pts: [['tocho', 420]], pay: 18e3 },
    { name: '東京タワー・スカイツリー周遊', pts: [['tocho', 420], ['tokyoTower', 420], ['skytree', 720]], pay: 32e3 },
    { name: '横浜みなとみらい周遊', pts: [['musashiKosugi', 380], ['landmarkTower', 520], ['bayBridge', 360]], pay: 36e3 },
  ];
  v4Menu(
    '遊覧飛行の仕事 — 調布飛行場',
    tours.map((t) => ({ label: t.name, sub: `報酬 ¥${t.pay.toLocaleString('ja-JP')}・小型機で周遊して調布に着陸`, color: '#4aa3ff', buttons: [{ text: '受ける', fn: () => v4StartTour(af, t) }] })),
    'やめる',
  );
  return !0;
}
function v4StartTour(af, t) {
  const pl = G.aircraft.filter((a) => a.kind === 'parked' && a.small).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
  if (!pl) return toast('いま飛べる機体がありません');
  const rw = af.rw && af.rw[0];
  const m = {
    id: 'tour_' + Date.now(),
    title: '遊覧飛行：' + t.name,
    who: 'pilot',
    repeat: !0,
    start: [P.x, P.z],
    intro: ['お客さんが3名、お待ちかねだ。', '小型機で周遊して、調布の滑走路に戻ってきてくれ。'],
    steps: [
      { t: 'enter', kind: 'plane', text: '駐機中の小型機に乗る' },
      { t: 'rings', pts: t.pts, text: '遊覧コースのリングを通過' },
      { t: 'land', to: rw ? [rw.x, rw.z] : [pl.x, pl.z], r: 700, plane: !0, text: '調布飛行場に着陸して停止' },
    ],
    reward: t.pay,
  };
  MS.target = [pl.x, pl.z];
  startMission(m);
}

// ---------- chapters (首都圏ストーリー): missions use the existing step engine plus wheel / coaster / bet steps
const pe4 = (a, b) => fe(a, b);
var CHAPTERS = { yokohama: '横浜編', chiba: '湾岸千葉編', omiya: '大宮編', shonan: '鎌倉湘南編' };
MISSIONS.push(
  // ---- 横浜編
  { id: 'y1', ch: 'yokohama', title: 'ハマの物件めぐり', who: 'saki', start: pe4(35.4658, 139.6232), intro: ['横浜にも物件があるの。', 'みなとみらいの見どころを写真に撮ってきて。お客さんに見せたいの。'],
    steps: [{ t: 'photo', at: 'cosmoClock', r: 260, text: 'みなとみらい大観覧車を撮影（パンチボタン）' }, { t: 'photo', at: 'redBrick', r: 200, text: '赤レンガ倉庫を撮影' }, { t: 'go', to: pe4(35.4456, 139.651), r: 40, foot: !0, text: '山下公園へ歩いて行く' }], reward: 8e3 },
  { id: 'y2', ch: 'yokohama', title: '中華街デリバリー', who: 'hana', start: pe4(35.4428, 139.6462), intro: ['中華街の名店から、熱々の肉まんの配達だ！', '冷めないうちに、港の見える丘と横浜スタジアムへ。'],
    steps: [{ t: 'spawn', car: 'delivery', at: pe4(35.443, 139.6452), text: '配達バンに乗る' }, { t: 'enter', kind: 'car', text: '配達バンに乗る' },
      { t: 'go', to: pe4(35.4385, 139.6525), r: 25, vehicle: !0, time: 150, text: '港の見える丘公園へ配達' }, { t: 'go', to: pe4(35.4434, 139.6405), r: 30, vehicle: !0, time: 150, text: '横浜公園スタジアムへ配達' }], reward: 9e3 },
  { id: 'y3', ch: 'yokohama', title: 'ベイブリッジ疾走', who: 'ryo', start: pe4(35.4545, 139.6385), intro: ['よう、横浜まで来たか。', 'ベイブリッジを渡って大黒ふ頭まで。湾岸の流儀ってやつを見せてやる。'],
    steps: [{ t: 'spawn', car: 'sport', at: pe4(35.4547, 139.6392), text: 'スポーツカーに乗る' }, { t: 'enter', kind: 'car', text: 'スポーツカーに乗る' },
      { t: 'go', to: pe4(35.4628, 139.6833), r: 60, vehicle: !0, time: 240, text: 'ベイブリッジを渡って大黒ふ頭へ' }, { t: 'heat', stars: 2, text: '派手に走って手配度★2' }, { t: 'evade', text: '警察を振り切る' }], reward: 14e3 },
  { id: 'y4', ch: 'yokohama', title: 'シーパラの絶叫', who: 'saki', start: pe4(35.3405, 139.6402), intro: ['取材で八景島に来たの。', 'ジェットコースターの感想、あなたが体験して教えて！'],
    steps: [{ t: 'coaster', text: 'ジェットコースターに乗る（乗り場で「乗る」）' }], reward: 6e3 },
  { id: 'y5', ch: 'yokohama', title: 'みなとみらい上空', who: 'pilot', start: pe4(35.55, 139.784), intro: ['機長、今日は横浜方面だ。', 'つばさ橋、ベイブリッジ、みなとみらいタワーの上空を回って羽田に戻ってくれ。'],
    steps: [{ t: 'enter', kind: 'plane', text: '駐機中の飛行機に乗る' }, { t: 'rings', pts: [['tsubasaBridge', 300], ['bayBridge', 320], ['landmarkTower', 520]], text: '横浜上空のリングを通過' },
      { t: 'land', to: [HND.A.x, HND.A.z], r: 1500, plane: !0, text: '羽田に着陸して停止' }], reward: 3e4 },
  // ---- 湾岸千葉編
  { id: 'c1', ch: 'chiba', title: '湾岸の観覧車', who: 'saki', start: pe4(35.6437, 139.8595), intro: ['湾岸の物件、眺めが売りなの。', '葛西の大観覧車から景色を確かめてきて。'],
    steps: [{ t: 'go', to: pe4(35.6413, 139.8568), r: 60, foot: !0, text: '葛西臨海公園の大観覧車へ' }, { t: 'wheel', text: '観覧車に乗る（乗り場で「乗る」）' }], reward: 6e3 },
  { id: 'c2', ch: 'chiba', title: '幕張までの客', who: 'ken', start: pe4(35.6363, 139.8836), intro: ['舞浜でお客さんを拾った。', '幕張メッセまで急ぎだそうだ。湾岸線を飛ばしな！'],
    steps: [{ t: 'spawn', car: 'taxi', at: pe4(35.6367, 139.8843), text: 'タクシーに乗る' }, { t: 'enter', kind: 'car', text: 'タクシーに乗る' },
      { t: 'go', to: pe4(35.6478, 140.0347), r: 60, vehicle: !0, time: 330, text: '幕張メッセへ' }], reward: 1e4 },
  { id: 'c3', ch: 'chiba', title: '船橋の大一番', who: 'hana', start: pe4(35.6806, 139.9979), intro: ['社長の代わりに馬券を頼まれちまった。', '船橋競馬場で一勝負してきてくれ。当たったら山分けだ！'],
    steps: [{ t: 'bet', course: '船橋', text: '船橋競馬場の大型ビジョン前で馬券を買い、レースを見届ける' }], reward: 5e3 },
  { id: 'c4', ch: 'chiba', title: 'ポートタワーへの追跡', who: 'inspector', start: pe4(35.6153, 140.1132), intro: ['千葉駅前で盗難車を見つけた。', '港の方へ逃げるはずだ。追え！'],
    steps: [{ t: 'enter', kind: 'car', text: '車に乗る（近くの車を奪ってもいい）' }, { t: 'chase', text: '盗難車を止める' }, { t: 'go', to: pe4(35.6008, 140.0965), r: 70, vehicle: !0, text: '千葉ポートタワーで合流' }], reward: 15e3 },
  { id: 'c5', ch: 'chiba', title: '房総の空', who: 'pilot', start: pe4(35.3975, 139.9095), intro: ['木更津へようこそ。', 'ヘリで湾岸をぐるっと回って帰ってきてくれ。'],
    steps: [{ t: 'enter', kind: 'heli', text: 'ヘリに乗る' }, { t: 'rings', pts: [['chibaPortTower', 260], ['makuhariMesse', 260], ['funabashiRace', 220]], text: '湾岸のリングを通過' },
      { t: 'land', to: pe4(35.3975, 139.9095), r: 80, text: '木更津に着陸' }], reward: 25e3 },
  // ---- 大宮編
  { id: 'o1', ch: 'omiya', title: '鉄道のまちへ', who: 'saki', start: pe4(35.7779, 139.7206), intro: ['大宮の物件を見に行くわ。', '赤羽から電車で大宮まで行って、鉄道博物館に寄ってみて。'],
    steps: [{ t: 'station', name: '赤羽', text: '赤羽駅に入る' }, { t: 'ride', to: '大宮', text: '電車で大宮駅へ' }, { t: 'go', to: pe4(35.9213, 139.6183), r: 50, foot: !0, text: '鉄道博物館へ' }], reward: 9e3 },
  { id: 'o2', ch: 'omiya', title: '氷川の参道', who: 'hana', start: pe4(35.9065, 139.6237), intro: ['大宮は氷川神社の門前町なんだ。', '長い参道を歩いて、お参りしてきな。'],
    steps: [{ t: 'go', to: pe4(35.9161, 139.6297), r: 60, foot: !0, text: '氷川神社へ歩いて行く' }, { t: 'photo', at: 'omiyaHikawa', r: 120, text: '氷川神社を撮影' }], reward: 6e3 },
  { id: 'o3', ch: 'omiya', title: '小江戸ドライブ', who: 'ken', start: pe4(35.9068, 139.6205), intro: ['川越のお客さんだ。', '時の鐘まで、10分以内で頼むぜ。'],
    steps: [{ t: 'spawn', car: 'taxi', at: pe4(35.9066, 139.6198), text: 'タクシーに乗る' }, { t: 'enter', kind: 'car', text: 'タクシーに乗る' },
      { t: 'go', to: pe4(35.9222, 139.4829), r: 50, vehicle: !0, time: 600, text: '川越の時の鐘へ' }, { t: 'photo', at: 'kawagoeBell', r: 160, text: '時の鐘を撮影' }], reward: 12e3 },
  { id: 'o4', ch: 'omiya', title: 'アリーナ前の逃走', who: 'ryo', start: pe4(35.8935, 139.6315), intro: ['さいたま新都心で警察に目をつけられた。', '派手にやって、きっちり撒いてこい。'],
    steps: [{ t: 'enter', kind: 'car', text: '車に乗る' }, { t: 'heat', stars: 3, text: '手配度★3まで上げる' }, { t: 'evade', text: '警察を振り切る' }], reward: 15e3 },
  { id: 'o5', ch: 'omiya', title: '浦和の一番人気', who: 'inspector', start: pe4(35.8545, 139.6735), intro: ['浦和競馬場で怪しい男が馬券を買っているらしい。', '客のふりをして一レース見てこい。'],
    steps: [{ t: 'bet', course: '浦和', text: '浦和競馬場で馬券を買い、レースを見届ける' }, { t: 'enter', kind: 'car', text: '車に乗る（近くの車を奪ってもいい）' }, { t: 'chase', text: '逃げ出した車を止める' }], reward: 16e3 },
  // ---- 鎌倉湘南編
  { id: 'k1', ch: 'shonan', title: '古都さんぽ', who: 'saki', start: pe4(35.3192, 139.5506), intro: ['鎌倉の古民家物件の下見よ。', '鶴岡八幡宮と大仏さま、両方撮ってきて。'],
    steps: [{ t: 'photo', at: 'tsurugaoka', r: 200, text: '鶴岡八幡宮を撮影' }, { t: 'photo', at: 'daibutsu', r: 160, text: '鎌倉大仏を撮影' }], reward: 8e3 },
  { id: 'k2', ch: 'shonan', title: '江ノ電でGO', who: 'hana', start: pe4(35.3192, 139.5506), intro: ['江の島の土産物屋に届け物だ。', '江ノ電で行くのが一番だぜ。'],
    steps: [{ t: 'station', name: '鎌倉', text: '鎌倉駅に入る' }, { t: 'ride', to: '江ノ島', text: '江ノ電で江ノ島駅へ' }, { t: 'go', to: pe4(35.2995, 139.4808), r: 60, foot: !0, text: '江の島へ渡る' }], reward: 9e3 },
  { id: 'k3', ch: 'shonan', title: '134号の風', who: 'ryo', start: pe4(35.3094, 139.4831), intro: ['湘南といえば134号だ。', 'バイクで茅ヶ崎まで流して、逗子まで戻ってこい。'],
    steps: [{ t: 'spawn', car: 'moto', at: pe4(35.3091, 139.4836), text: 'バイクに乗る' }, { t: 'enter', kind: 'car', text: 'バイクに乗る' },
      { t: 'go', to: pe4(35.3185, 139.4045), r: 60, vehicle: !0, time: 300, text: '茅ヶ崎へ' }, { t: 'go', to: pe4(35.2958, 139.5797), r: 60, vehicle: !0, time: 420, text: '逗子まで戻る' }], reward: 14e3 },
  { id: 'k4', ch: 'shonan', title: 'モノレールで大船', who: 'ken', start: pe4(35.3086, 139.4858), intro: ['大船の営業所に顔を出さなきゃならない。', '湘南モノレールで行こう。宙に浮くような乗り心地だぞ。'],
    steps: [{ t: 'station', name: '湘南江の島', text: '湘南江の島駅に入る' }, { t: 'ride', to: '大船', text: 'モノレールで大船へ' }], reward: 8e3 },
  { id: 'k5', ch: 'shonan', title: '湘南上空', who: 'pilot', start: pe4(35.4545, 139.4497), intro: ['厚木から特別に一機借りた。', '江の島、大仏、八幡宮の上空を回ってきてくれ。'],
    steps: [{ t: 'enter', kind: 'plane', text: '駐機中の機体に乗る' }, { t: 'rings', pts: [['enoshima', 300], ['daibutsu', 280], ['tsurugaoka', 280]], text: '湘南上空のリングを通過' },
      { t: 'land', to: pe4(35.4545, 139.4497), r: 1400, plane: !0, text: '厚木に着陸して停止' }], reward: 3e4 },
);

// ---------- per-frame (called from SM)
function v4Tick(dt) {
  if (!V4.inited) {
    V4.inited = !0;
    v4Stats();
    const ps = $t('pSave');
    ps && (ps.onclick = () => v4SaveMenu());
    const side = $t('side');
    if (side && !$t('pDex')) {
      const mk = (id, text, fn) => {
        const b = document.createElement('button');
        b.id = id;
        b.textContent = text;
        b.onclick = fn;
        return b;
      };
      const ref = $t('pSound');
      side.insertBefore(mk('pDex', '図鑑', () => v4DexMenu()), ref);
      side.insertBefore(mk('pAch', '実績', () => v4AchMenu()), ref);
    }
  }
  v4RideTick(dt);
  v4RaceTick(dt);
  v4Weather(dt);
  for (const w of WHEELS) w.boost && (w.a += dt * w.boost);
  if ((V4.dexT -= dt) <= 0) ((V4.dexT = 1), v4Dex());
  if ((V4.achT -= dt) <= 0) ((V4.achT = 2), v4Ach(), v4FixMissions());
}
// interact() hook for the new things on foot; true when handled
function v4Interact() {
  if (V4.ride) return (toast(V4.ride.type === 'wheel' ? '一周するまでお待ちください' : '到着までお待ちください'), !0);
  if (P.mode !== 'foot' || P.interior) return !1;
  const w = v4NearWheel(P.x, P.z);
  if (w) return v4StartWheel(w);
  const c = v4NearCoaster(P.x, P.z);
  if (c) return v4StartCoaster(c);
  const rc = v4NearRace(P.x, P.z);
  if (rc) return v4BetMenu(rc);
  const af = v4NearChofuDesk(P.x, P.z);
  if (af) return v4TourMenu(af);
  return !1;
}
// prompt text for the 乗る button / hint line
function v4Prompt() {
  if (P.mode !== 'foot' || P.interior || V4.ride) return null;
  if (v4NearWheel(P.x, P.z)) return '観覧車に乗る（¥800）';
  if (v4NearCoaster(P.x, P.z)) return 'ジェットコースターに乗る（¥1,200）';
  if (v4NearRace(P.x, P.z)) return V4.race ? 'レース観戦中' : '馬券を買う';
  if (v4NearChofuDesk(P.x, P.z)) return '遊覧飛行の仕事';
  return null;
}

// ---------- weather: fog and snow (v4.0). Fog pulls the scene fog in; snow is a light particle box around the camera.
var SNOW = null;
function v4Weather(dt) {
  const fogT = V4.wx === 'fog' && !P.interior ? 1 : 0,
    snowT = V4.wx === 'snow' && !P.interior ? 1 : 0;
  V4.fog = (V4.fog || 0) + It(fogT - (V4.fog || 0), -dt * 0.08, dt * 0.08);
  V4.snow = (V4.snow || 0) + It(snowT - (V4.snow || 0), -dt * 0.1, dt * 0.1);
  const f = R.scene.fog;
  if (f && !P.interior) {
    const far = R.Q.lod * 1.05;
    f.near = Ee(400, 25, V4.fog);
    f.far = Ee(far, Math.min(far, 420), V4.fog);
    V4.fog > 0.01 && f.color.lerp(new THREE.Color(0xc9ced4), V4.fog * 0.6);
  }
  if (V4.snow > 0.01 && !SNOW) {
    const N = 2400,
      a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) ((a[i * 3] = rt(-60, 60)), (a[i * 3 + 1] = rt(0, 50)), (a[i * 3 + 2] = rt(-60, 60)));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    SNOW = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: !0, opacity: 0, depthWrite: !1 }));
    SNOW.frustumCulled = !1;
    R.scene.add(SNOW);
  }
  if (SNOW) {
    SNOW.visible = V4.snow > 0.01;
    SNOW.material.opacity = V4.snow * 0.9;
    if (SNOW.visible) {
      const c = R.camera.position,
        pa = SNOW.geometry.attributes.position,
        a = pa.array;
      SNOW.position.set(Math.floor(c.x / 120) * 120, Math.max(0, c.y - 25), Math.floor(c.z / 120) * 120);
      for (let i = 0; i < a.length; i += 3) {
        a[i + 1] -= dt * 1.4;
        a[i] += Math.sin(G.t + i) * dt * 0.3;
        a[i + 1] < 0 && (a[i + 1] += 50);
      }
      pa.needsUpdate = !0;
      // keep the box centred on the camera: wrap x / z
      const ox = c.x - SNOW.position.x,
        oz = c.z - SNOW.position.z;
      SNOW.position.x += ox - 0;
      SNOW.position.z += oz - 0;
    }
  }
}

// ---------- mission points that ended up inside a real building or on water (the v3.3 OSM map moved buildings onto
// some of the old hand-placed points): move them to the pavement of the nearest ground road once their tile is loaded
function v4TileReady(x, z) {
  if (!TS.on) return !0;
  const T = TS.tile;
  return TS.tiles.has((Math.floor(x / T) + 512) * 1024 + (Math.floor(z / T) + 512));
}
function v4Blocked(x, z) {
  if (isWaterAt(x, z)) return !0;
  const ids = [];
  buildingsNear(x, z, 40, ids);
  for (const id of ids) if (W.bld[id * 9 + 6] >= 1 && bInside(id, x, z, 1.5)) return !0;
  return !1;
}
function v4SafeSpot(p, onRoad) {
  if (!v4TileReady(p[0], p[1])) return null;
  if (!v4Blocked(p[0], p[1])) return p;
  const a = [];
  roadsNear(p[0], p[1], 250, a);
  const c = a.filter((r) => !r.e.elev && r.e.kind !== 'X' && r.e.kind !== 'R').sort((u, v) => u.d - v.d);
  for (const r of c) {
    const e = r.e,
      [x0, z0] = e.pts[r.j],
      [x1, z1] = e.pts[r.j + 1],
      L = Math.hypot(x1 - x0, z1 - z0) || 1,
      nx = -(z1 - z0) / L,
      nz = (x1 - x0) / L;
    for (const sd of onRoad ? [0] : [1, -1]) {
      const q = [r.x + nx * sd * (e.hw + 1.5), r.z + nz * sd * (e.hw + 1.5)];
      if (!v4Blocked(q[0], q[1])) return q;
    }
  }
  return p;
}
function v4FixMissions() {
  const px = P.car ? P.car.x : P.x,
    pz = P.car ? P.car.z : P.z;
  for (const [m, mk] of x6) {
    if (m.fixed || MS.done.has(m.id) || Math.hypot(m.start[0] - px, m.start[1] - pz) > 900) continue;
    const q = v4SafeSpot(m.start, !1);
    if (!q) continue;
    m.fixed = !0;
    if (q !== m.start) ((m.start = q), mk.position.set(q[0], 15, q[1]));
  }
  const cur = MS.cur,
    s = cur && cur.steps[MS.step];
  if (s && !s.fixed && s.to && typeof s.to[0] === 'number' && (s.t === 'go' || s.t === 'land') && !s.plane && Math.hypot(s.to[0] - px, s.to[1] - pz) < 900) {
    let q = v4SafeSpot(s.to, !!s.vehicle);
    // a target for a vehicle must be reachable on a ground road (some old points sit 60 m off the real crossing)
    if (q && s.vehicle && s.t === 'go') {
      const a = [];
      roadsNear(q[0], q[1], 200, a);
      const r = a.filter((u) => !u.e.elev && u.e.kind !== 'X' && u.e.kind !== 'R').sort((u, v) => u.d - v.d)[0];
      r && r.d > s.r * 0.7 && (q = [r.x, r.z]);
    }
    q && ((s.fixed = !0), q !== s.to && ((s.to = q), (MS.target = q), updRoute()));
  }
}
