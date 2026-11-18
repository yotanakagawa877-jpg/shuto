// ===================== v5.0 田んぼ・畑・ビニールハウス・工業地帯 (streamed around the player) =====================
// data/lu.txt (tools/v5/lulayer.py): 32 m cells, 1 field, 2 greenhouse, 3 industrial. Chunks of 8 x 8 cells are built
// within ~650 m of the camera and dropped beyond ~900 m. Fields change colour with the season (real month): flooded
// paddies in spring, green in summer, gold in autumn, bare earth in winter; levees (あぜ道) and farm lanes (農道) on the
// cell borders; cells that touch a road or a building are left alone.
var LUL = { g: null, chunks: new Map(), t: 0, loading: !1, fail: 0, mat: null, season: -1 };
async function luLoad() {
  LUL.loading = !0;
  try {
    const buf = await Cv((TS.base || 'data/') + 'lu.txt'), dv = new DataView(buf);
    const x0 = dv.getInt32(0, !0), z0 = dv.getInt32(4, !0), s = dv.getInt32(8, !0), nx = dv.getInt32(12, !0), nz = dv.getInt32(16, !0);
    const a = new Uint8Array(nx * nz);
    let k = 0;
    for (let o = 20; o + 2 < buf.byteLength; o += 3) {
      const v = dv.getUint8(o), r = dv.getUint16(o + 1, !0);
      v && a.fill(v, k, k + r);
      k += r;
    }
    LUL.g = { x0, z0, s, nx, nz, a };
  } catch (e) {
    LUL.fail = 1;
  }
}
function luAt(x, z) {
  const g = LUL.g;
  if (!g) return 0;
  const i = Math.floor((x - g.x0) / g.s), j = Math.floor((z - g.z0) / g.s);
  return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? 0 : g.a[j * g.nx + i];
}
var luH = (i, j, k) => {
  let h = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// season from the real month: 0 spring (flooded / young rice), 1 summer, 2 autumn, 3 winter
function luSeason() {
  const m = new Date().getMonth() + 1;
  return m >= 4 && m <= 5 ? 0 : m >= 6 && m <= 8 ? 1 : m >= 9 && m <= 10 ? 2 : 3;
}
var LU_PADDY = [0x6f8a86, 0x5e9a3c, 0xc9a649, 0x8a7255], LU_SOIL = [0x7a5c3e, 0x6b5236, 0x7d6040, 0x7f6446], LU_CROP = [0x8db35a, 0x5f8f37, 0x9a8a3c, 0x7a6a50];
var LUQ = [], LUB = [];
// a cell can be dressed only where nothing real is: no road within the cell (+ margin), no building centre near it
function luFree(cx, cz, half) {
  roadsNear(cx, cz, half + 14, LUQ);
  for (const o of LUQ) if (o.d < o.e.hw + half + 2) return !1;
  buildingsNear(cx, cz, half + 10, LUB);
  for (const id of LUB) if (Math.abs(W.bld[id * 9] - cx) < half + 6 && Math.abs(W.bld[id * 9 + 1] - cz) < half + 6) return !1;
  return !isWaterAt(cx, cz);
}
function luBuildChunk(ci, cj) {
  const g = LUL.g, s = g.s, F = new Mt({ color: !0 }), S = new Mt({ color: !0 }), A = (m, c) => (m.setColor(c), m);
  const se = LUL.season;
  let n = 0;
  for (let dj = 0; dj < 8; dj++)
    for (let di = 0; di < 8; di++) {
      const i = ci * 8 + di, j = cj * 8 + dj;
      if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
      const v = g.a[j * g.nx + i];
      if (!v) continue;
      const x0 = g.x0 + i * s, z0 = g.z0 + j * s, cx = x0 + s / 2, cz = z0 + s / 2;
      if (!luFree(cx, cz, s / 2 - 2)) continue;
      const h = luH(i, j, 1);
      n++;
      if (v === 1) {
        const paddy = h < 0.62;
        if (paddy) A(F, LU_PADDY[se]).box(cx, 0.01, cz, s - 1.2, 0.03, s - 1.2, 0, {});
        else {
          // crop rows
          const rows = 8, w = (s - 1.2) / rows;
          for (let r = 0; r < rows; r++) A(F, r % 2 ? LU_SOIL[se] : LU_CROP[se]).box(x0 + 0.6 + w * (r + 0.5), 0.01, cz, w, se === 3 ? 0.04 : 0.12 + (r % 2 ? 0 : 0.18), s - 1.2, 0, {});
        }
        // levees on the west / north edges, a farm lane every fourth border
        const lane = i % 4 === 0, laneZ = j % 4 === 0;
        A(F, lane ? 0xa89c86 : 0x7b8a4a).box(x0 + (lane ? 1.4 : 0.35), 0.0, cz, lane ? 2.8 : 0.7, lane ? 0.06 : 0.28, s, 0, {});
        A(F, laneZ ? 0xa89c86 : 0x7b8a4a).box(cx, 0.0, z0 + (laneZ ? 1.4 : 0.35), s, laneZ ? 0.06 : 0.28, laneZ ? 2.8 : 0.7, 0, {});
        // a scarecrow / small shed now and then
        h > 0.97 && (A(S, 0x7d5a3a).box(x0 + 6, 0, z0 + 6, 3, 2.4, 4, 0, {}), A(S, 0x5a6470).box(x0 + 6, 2.4, z0 + 6, 3.4, 0.3, 4.4, 0, {}));
      } else if (v === 2) {
        // ビニールハウス: three tunnels with a rounded top
        for (let k = 0; k < 3; k++) {
          const x = x0 + 4.5 + k * 10.5;
          A(S, 0xdfe7ea).box(x, 0, cz, 7, 1.7, s - 5, 0, {});
          A(S, 0xe8eff1).box(x, 1.7, cz, 5.6, 0.55, s - 5, 0, {});
          A(S, 0xf0f5f6).box(x, 2.25, cz, 3.4, 0.3, s - 5, 0, {});
        }
      } else if (v === 3) {
        if (h < 0.28) {
          // storage tanks
          const r = 6 + luH(i, j, 2) * 5, hh = 9 + luH(i, j, 3) * 8;
          A(S, 0xe9ebec).cyl(cx, 0, cz, r, hh, 16);
          A(S, 0xc9cdd0).cyl(cx, hh, cz, r * 0.96, 0.6, 16);
          A(S, 0x8a8f94).box(cx + r, 0, cz, 0.5, hh + 0.6, 0.5, 0, {});
        } else if (h < 0.34) {
          // chimney with red / white bands
          const hh = 40 + luH(i, j, 4) * 30;
          for (let b = 0; b < 6; b++) A(S, b % 2 ? 0xf2f2f2 : 0xc8102e).cyl(cx, (hh / 6) * b, cz, 1.8 - b * 0.12, hh / 6, 12);
        } else if (h < 0.6) {
          // container stacks
          const cols = [0xc8102e, 0x1d4e89, 0x2f8f46, 0xd9a400, 0x7a7f86, 0xe36a1b];
          for (let k = 0; k < 6; k++) {
            const x = x0 + 4 + (k % 2) * 13, z = z0 + 5 + Math.floor(k / 2) * 9, lv = 1 + Math.floor(luH(i, j, 10 + k) * 3);
            for (let l = 0; l < lv; l++) A(S, cols[Math.floor(luH(i, j, 20 + k * 3 + l) * cols.length)]).box(x + 6, l * 2.6, z, 12, 2.55, 2.45, 0, {});
          }
        } else if (h < 0.66 && isWaterAt(cx + s, cz) + isWaterAt(cx - s, cz) + isWaterAt(cx, cz + s) + isWaterAt(cx, cz - s) > 0) {
          // gantry crane at the quay
          for (const [ox, oz] of [[-8, -6], [8, -6], [-8, 6], [8, 6]]) A(S, 0xd9480f).box(cx + ox, 0, cz + oz, 1, 30, 1, 0, {});
          A(S, 0xd9480f).box(cx, 30, cz, 18, 2, 14, 0, {});
          A(S, 0xd9480f).box(cx + 20, 31, cz, 56, 1.4, 3, 0, {});
          A(S, 0x2b2f33).box(cx, 32, cz, 6, 3, 5, 0, {});
        } else n--;
      }
    }
  if (!n) return { g: null };
  const grp = new THREE.Group();
  LUL.mat || (LUL.mat = new THREE.MeshStandardMaterial({ vertexColors: !0, roughness: 0.95, polygonOffset: !0, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  F.count && grp.add(new THREE.Mesh(F.build(), LUL.mat));
  if (S.count) {
    const m = new THREE.Mesh(S.build(), milMat());
    m.castShadow = !0;
    grp.add(m);
  }
  R.scene.add(grp);
  return { g: grp };
}
function v5LandTick(dt) {
  if (!LUL.g) {
    !LUL.loading && TS.on && G.started && luLoad();
    return;
  }
  if ((LUL.t -= dt) > 0) return;
  LUL.t = 0.5;
  const se = luSeason();
  if (se !== LUL.season) {
    for (const [, c] of LUL.chunks) c.g && (R.scene.remove(c.g), c.g.traverse((o) => o.geometry && o.geometry.dispose()));
    LUL.chunks.clear();
    LUL.season = se;
  }
  const g = LUL.g, cs = g.s * 8, cam = R.camera.position;
  if (P.interior) return;
  const ci0 = Math.floor((cam.x - g.x0) / cs), cj0 = Math.floor((cam.z - g.z0) / cs);
  // drop far chunks
  for (const [k, c] of LUL.chunks) {
    const ci = Math.floor(k / 4096) - 1000, cj = (k % 4096) - 1000, cx = g.x0 + (ci + 0.5) * cs, cz = g.z0 + (cj + 0.5) * cs;
    if (Math.hypot(cx - cam.x, cz - cam.z) > 900) (c.g && (R.scene.remove(c.g), c.g.traverse((o) => o.geometry && o.geometry.dispose())), LUL.chunks.delete(k));
  }
  // build at most two new chunks per tick, nearest first, only where the tile is loaded (roads / buildings known)
  let built = 0;
  for (let r = 0; r <= 3 && built < 2; r++)
    for (let dj = -r; dj <= r && built < 2; dj++)
      for (let di = -r; di <= r && built < 2; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ci = ci0 + di, cj = cj0 + dj, k = (ci + 1000) * 4096 + (cj + 1000);
        if (LUL.chunks.has(k)) continue;
        const cx = g.x0 + (ci + 0.5) * cs, cz = g.z0 + (cj + 0.5) * cs;
        if (Math.hypot(cx - cam.x, cz - cam.z) > 650 || !v4TileReady(cx, cz)) continue;
        LUL.chunks.set(k, luBuildChunk(ci, cj));
        built++;
      }
}
