# SHUTO 首都 — handoff (v3.5)

Live game artifact: https://claude.ai/artifact/TZks9ttVBzwCcsHT4yKpRN (Version 24 = v3.5, published 2026-10-22)
Backup page: https://claude.ai/artifact/P3LMAmNdQm2o9V6wh78L6z
User: plays on iPhone (landscape), Japanese replies, parody shop names, keep screen centre / lower centre free of UI,
smartphone build only. **Every performance measure must be proposed in chat first and approved.**
**New areas must match the old map's quality (roads and buildings) — no visible difference.**

## What v3.3 is
The WHOLE map (old core included) is rebuilt from real data. Finding (told to the user, who chose "2 = whole map"):
the old core map was NOT real data either (warped street lattice, straight approximated arterials, procedural lots).
- Roads: OpenStreetMap (download.openstreetmap.fr/extracts/asia/japan/kanto.osm.pbf; Geofabrik is unreachable from the
  sandbox even when allowed). Dual carriageways merged into centre lines. Global graph (world.json nodes/edges, same
  format/kinds): X motorway, R motorway_link, A trunk/primary(+links), B secondary(+links), L = tertiary(+links) and
  connector streets promoted so the major network is connected. Small streets (residential/unclassified/living/service)
  are per-tile edges (drawn + drivable, not in route()).
- Buildings: OSM footprints -> oriented boxes in the old 12-byte format (type 0 house,1 apt,2 mid,3 office,4 tower,5 shop;
  height from height / levels / estimate by class, area, landuse zone, station distance). Cut back from road/rail ribbons.
- Land mask: municipal areas (N03) + OSM water/park/forest/airport: 8 m fine grid (old core frame) + 16 m coarse grid
  (world.json ext.fine / ext.mask, game decodeFMask/decodeCMask). Palace grounds/moat by distance to 皇居.
- Credit "地図データ © OpenStreetMap contributors" on the title screen (web/index.html).
- Approved items 1–6 are implemented: 1 OSM data, 2 tile streaming (1280 m tiles, 5x5 per pack file data/t2/PX_PZ.txt (v3.3b; old data/t removed)),
  3 global graph = majors / streets per tile, 4 start-up prefetches only the packs around the start position
  (tsPrefetch), 5 far bus-stop signs freed (stopFree, > 700 m), 6 draw distances unchanged per quality preset.
- Start-up replay: start-up code that depends on buildings (v3 avg height, $_ scenery lot, setupDoors store building,
  W.cleared) is recorded by a bake run (index.html?bake) and replayed by the normal start-up (RP, rpSetup/rpEnd), and the
  buildings the start-up clears are removed from the packs. Re-bake whenever start-up code or tiles change.
- Heap (Chrome, low, after GC, same test): v3.2 344 MB -> v3.3 289 MB. 24 km streaming drive stays ~285–305 MB.

## Game code (src/game.js) — v3.3 parts
TS (tile streaming): tsSetup, tsFetchPack, tsEnsure(budget), tsLoadTile/tsLoadTile0, tsUnloadTile, tsTick (every 0.1 s,
5 ms decode budget, load radius lod+900, unload lod+2200, max 9 decoded packs), tsPrefetch, tsBakeAll; tile streets live in
spare slots of W.edges/W.nodes (dead slots = TS_DEADE/TS_DEADN, free lists), their segments in TS.grid (merged into
roadsNear/edgesInRect); buildings in the PB pool (PB.tk/PB.li = tile key / local index; TS.cleared keeps runtime clears).
nearestNode skips tile edges; route() arrays grow with headroom. XS/pbGen procedural code is dormant (no ext.dist).
Test hooks: __G.X.{TS,tsPrefetch,newCar,CT}.

## Data pipeline (tools/osm)
    # 1. data
    curl -o /home/claude/osm/kanto.osm.pbf https://download.openstreetmap.fr/extracts/asia/japan/kanto.osm.pbf
    pip install --break-system-packages osmium shapely scipy
    python3 -I tools/osm/extract.py kanto.osm.pbf X            # roads.json, bld.bin, areas.json (~6 min)
    python3 -I tools/osm/water.py kanto.osm.pbf X/water.json   # mask polygons
    python3 -I tools/osm/roads.py X/roads.json X/pieces.pkl     # dual carriageway merge
    python3 -I tools/osm/graph.py X/pieces.pkl X/graph.pkl      # nodes/edges
    python3 -I tools/osm/mask.py X/water.json data/ext_mask_rle.json X/mask.json   # then put mask/fine into world.json ext
    # 2. packs (~45 min with 2 jobs: ONLY=<pack list> splits the work; STREETS_ONLY=1 rewrites streets of existing packs)
    python3 -I tools/osm/tiles.py X data/world.json OUT_WORLD.json X/tiles
    # 3. bake: copy pristine X/tiles to data/tiles, build dist, run python3 test/bake.py X/bake.json, then
    python3 -I tools/osm/bake.py X/bake.json X/bake_replay.json X/tiles data/tiles data/world.json
    python3 tools/b64parts.py && MINIFY=1 sh tools/bundle.sh
The backup holds osm/tiles_pristine (= X/tiles), osm/bake.json, osm/bake_replay.json, so data/tiles is restored with the
bake.py line above (no OSM rebuild needed). Restore also needs: JapanCityGeoJson geojson/08,11,12,13,14 only (others OOM),
japan-topography s0010 (sparse clone) for mask.py.
Tests: test/t_osm.sh (aerial/ground shots with prefetch), test/t_stream.sh (24 km streaming), test/heapprof.py,
test/bake.py. Publish: two publishes (<= 64 MB each): tiles first with the live page, then page + game.js + world + rest.

## v3.3b (2026-10-22 night, user's list after v3.3)
- Train manual driving: no speed limits, trainTop(): Shinkansen 275–320, Skyliner/N'EX 160, limited express 140,
  rapid/express 125, local 115, subway 105, monorail 90, AGT 75, tram 50 km/h. HUD shows 最高.
- Roads: per-edge width/lanes/sidewalk/one-way from OSM (lanes, width tags, merged carriageways); world.json edge =
  [a,b,kind,name,pts,hw*10,lanes,flags(1=one-way),side*10,top*10]; tile edge header 14 bytes
  (i32 a,b; u8 kind,hw*10,lanes|ow<<4,side*10; u16 n). Motorways are NOT merged any more (two one-way decks, real
  junctions); layer>=2 -> flyover height (top) via yProfile(); AI/route respect one-way (laneOff, b_, route, spawn).
- Buildings: cut back from road+sidewalk+junction discs; a box only if it keeps clear of the roads (fill >= 0.8 /
  houses 0.62), else the real outline as a prism (pack v2 poly block; PB.pp, Mt.outline, polyHas/polyNear/polyRay,
  bInside; collision, camera rays, roofs (groundUnder) and spot tests use outlines). Overlap with roads: 0.
- Street furniture (lamps, vending machines, signals, trees, poles, expressway / rail pillars) checked with onRoadP()
  (carriageway + junction discs); median pillars only on wide two-way roads. Parapets skipped where decks overlap
  (deckUnder). Start-up replay now also covers onRoadP (o) and freeSpot (f); the bake run sees the small streets as
  segments (TS.sg) without making them roads.
- Camera: occlusion pull-in is immediate but eases out (t.occ) and keeps height in vehicles -> no bouncing at speed.

## v3.4 (2026-10-22, user's list after v3.3b)
- Train driving simplified: hold accelerate / hold brake (brake grows over ~0.9 s) / release = coast; HUD 加速/減速/惰行.
  Fixed "never reaches top speed" (old drag 0.012 v balanced the notch force far below the top). Y9 exposed as
  TR.trainDrive for tests (test/t_v34b.sh simulates every train type to its top speed).
- Tokaido Shinkansen (rails[20]) rebuilt from OSM main tracks (tools: osm/py/shin.py + shinpath.py): it no longer
  runs along the Yokosuka line past Musashi-Kosugi; tunnels go below 1.5 m (hidden), 7 m clearance over other rails.
  Packs along the old/new line rebuilt (ONLY=-5_3,-4_2,-4_3,-3_2,-3_3,-2_0,-2_1,-2_2,-1_0) -> osm/x3.
- Haneda from OSM (world.json 'aero', built by osm/py/aero.py + aero3.py + aeropack.py): real runways A/B/C/D (HND.rw),
  terminal outlines T1/T2/T3 as glass halls (hndTerminals; OSM blocks inside cleared at start-up -> bake), aprons and
  taxiways with centre lines / edge lights (hndGround), stands from OSM parking positions (gatePositions), TERMS derived
  from the outlines (c/L/Wd/side/land kerb point). Procedural garages/hotel/hangars/cargo/fuel/fire/radar dropped
  (real buildings are in the packs).
- New airliner model (vR): attached fin/tailplane, swept wings with winglets, engines on pylons, livery, gear.
- Plane top speed ~1050 km/h clean (thrust 14, drag 0.000165 v²; gear down adds drag).
- Bail out of moving vehicles (F): cars/trains -> tumble with damage by speed (bailOut / jumpOffTrain, L key too);
  aircraft -> skydive (player_P.sky, skyFall): jump opens the canopy, auto-opens below 85 m; pilotless aircraft
  crash and respawn at their stand / helipad. Players can stand on roofs only while skydiving landings (groundUnder).
- Buses: autoBusRoutes 1.4 km cells (stop within 780 m counts as served), tertiary roads count, stops every >= 360 m.

## v3.5 (2026-10-22 afternoon, user's list after v3.4)
- Train ride UI (touch): passenger 「次の駅」 on the enter button again (v3.4 made it jump off by mistake); jumping off is
  its own red 「飛び降り」 button (bDown, also L key) shown only while moving; 「行き先」/「飛び降り」 moved into the
  right-hand cluster, toast narrower, prompt hidden while riding (body.tpOn CSS). Driver: アクセル/ブレーキ labels.
- Expressways: surfaceAt prefers height continuity (a deck > 1.2 m above can't be snapped to) -> no floating where ramps
  overlap the main line (test/t_hw.sh moves physics cars along decks); parapets are cut into ~5 m pieces and every
  piece standing on another deck is dropped; lamp posts too.
- Bikes: lean / pitch come from low-pass filtered yaw rate and acceleration (no rocking / bobbing).
- Fire: more ground spread, buildings ignite from ground fires and burning cars (igniteNearBld), explosions light up to
  two buildings within 16 m, building fires grow (radius only; water needed unchanged), caps 64 fires / 16 building fires.
- Buses: busOperator() names real operators by area (都営, 東急, 京王, 小田急, 関東, 西武, 国際興業, 東武, 京成, 京急,
  川崎市, 臨港, 横浜市営, 相鉄, 神奈中, ベイシティ, リムジン) — route title prefix, bus body colour, stop sign colour.
  Route search cost: one-way stop edges prune orientation combos, lower search limit, shared cache (transit ~17 s
  headless). Proposal pending: bake the bus routes (needs user approval as a performance measure).
- New places from OSM (osm/py/fun.py + funpack.py -> world.json 'fun'): airfields 調布 (light aircraft, enterable,
  take off from their own runway), 厚木 / 下総 (grey jets), 木更津 (helicopters); racecourses 東京, 中山, 大井, 川崎,
  船橋, 浦和 (turf / dirt bands, rails, infield, screen); theme parks (paved ground, entrance sign; Tokyo Disney
  Resort shown as parody 「トーキョー・ファンタジーランド／シー」), Ferris wheels (rotating, level gondolas), roller
  coasters (procedural height profile on columns); area labels (funArea in districtAt).
- Rails: tiles.py clearance = deck width + 0.9 m (+6 m at stations, above-ground subway sections too) -> packs rebuilt
  (osm/x4). Tunnel portals (tunnelPortals) where a line drops below 1.5 m. Train models: wheels, gangways, roof AC,
  pantographs (third pool per group: every 3rd middle car, Shinkansen every 4th).

## Known gaps / ideas (not done)
- Small streets have no AI traffic and are not used by GPS/taxi/bus routing (approved design 3).
- Some scenery is fewer than v3.2 (shrines 179 vs 356 etc.) because real buildings leave fewer qualifying lots.
- Mask is 16 m outside the core: narrow rivers are blocky there.
- Possible memory cuts (need approval): packed typed arrays for global edge geometry (~40–50 MB), tertiary to tiles.

### v3.4 rebuild notes
Scripts in tools/osm/v34 (run with python3 -I from the osm dir): shin.py PBF shin.json; shinpath.py shin.json world_A.json
world_S.json; aero.py / aero3.py PBF -> aero.json / aero_rel.json; aeropack.py aero.json aero_rel.json world_S.json.
The backup's osm/ holds aero.json, aero_rel.json, shin.json, tiles_pristine (= x3/tiles) and the merged bake jsons.
Checked: replay miss 0 (mid desktop, low touch); JS heap after GC on low 266 MB.
v3.5 data: osm/x4 (tiles = full rebuild with the wider rail clearance; world_A.json has 'aero' + 'fun' + new rails[20]);
backup osm/fun.json is the raw extract for funpack.py. Checked: replay miss 0 (mid desktop / low touch), heap low 270 MB.

## v3.6 (2026-11-02): standalone web / app
- Inside Claude the viewer toolbar covers the top ~88 px: index.html adds class `embed` when framed and every top
  inset uses var(--sat) = max(safe-area, 88px); the title screen centres safely (no cut-off top).
- PWA: manifest.webmanifest (fullscreen, landscape), icons, sw.js (shell network-first, map packs cache-first per
  release VERSION). Registered only top-level over https (not inside the Claude artifact).
- Hosting plan: GitHub Pages via tools/deploy_pages.sh OWNER/REPO VERSION (force-pushes a history-less gh-pages
  branch each release). Needs the user's GitHub connected to Claude and an empty repo; then Pages: branch gh-pages / root.
