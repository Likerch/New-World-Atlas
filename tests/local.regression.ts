// Local-map regressions: run with `npm test`.
import assert from "node:assert/strict";
import { blocked, doorsOf, editLocal, editUnderworld, generateBuilding, localFromCellar, localParams, renderUnderworldSection, tierOf, underworldGhostSvg, generateCity, generateGalaxy, localAt, localFromCavern, localFromLandmark, localFromStar, localScene, localStory, generateUnderworld, reachOf, renderLocal, renderLocalScene, renderUnderworld, SETTINGS, generateLocal, generatePlanet, LOCAL_KINDS, LOCAL_STYLES, LOCAL_THEMES, localFromMarker, TILE, walk, whoKey, type LocalMap, type LocalTheme } from "../src/core/index";
import { translator } from "../src/app/i18n";

let passed = 0;
function test(title: string, run: () => void) {
  try {
    run();
    passed++;
  } catch (error) {
    console.error(`✗ ${title}`);
    throw error;
  }
}

test("every room of a dungeon or cave can be reached from its entrance", () => {
  for (const kind of ["dungeon", "cave"] as const) {
    for (const theme of LOCAL_THEMES[kind]) {
      const map = generateLocal({ seed: `reach-${theme}`, kind, theme });
      const W = map.params.width;
      const open = (i: number) => map.tiles[i] !== TILE.rock;
      const entrance = map.keyed.find((k) => k.purpose === "entrance")!;
      const seen = new Set([entrance.cells.find(open)!]);
      const queue = [...seen];
      while (queue.length) {
        const i = queue.shift()!;
        for (const n of [i - 1, i + 1, i - W, i + W]) if (n >= 0 && n < map.tiles.length && open(n) && !seen.has(n)) (seen.add(n), queue.push(n));
      }
      for (const room of map.keyed) assert.ok(room.cells.some((c) => seen.has(c)), `${theme}: room ${room.id} (${room.purpose}) is sealed off`);
      // One room ends the place: a deep people's hold ends in its hoard, not a lair.
      assert.equal(map.keyed.filter((k) => k.final).length, 1, `${theme}: one final room`);
      if (theme === "hold") assert.equal(map.keyed.find((k) => k.final)!.purpose, "treasury");
    }
  }
});

test("a wilderness trail crosses the map from west to east", () => {
  // Under the sea one swims; there is no trail.
  for (const theme of LOCAL_THEMES.wilderness.filter((item) => item !== "seabed")) {
    const map = generateLocal({ seed: `trail-${theme}`, kind: "wilderness", theme });
    assert.ok(map.trail.length > map.params.width * 0.6, `${theme}: trail of ${map.trail.length}`);
    assert.equal(map.trail[map.trail.length - 1][0], map.params.width - 1, `${theme}: the trail stops short`);
  }
});

test("local maps are reproducible and every style draws them", () => {
  for (const kind of LOCAL_KINDS) {
    const a = generateLocal({ seed: "same", kind });
    const b = generateLocal({ seed: "same", kind });
    assert.deepEqual(Array.from(a.tiles), Array.from(b.tiles));
    assert.deepEqual(a.keyed, b.keyed);
    for (const style of LOCAL_STYLES) assert.doesNotMatch(renderLocal(a, { style, highlight: 1 }), /NaN|undefined|Infinity/u);
  }
});

test("a cave on the planet map keeps its legend's dweller in the lair", () => {
  const planet = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
  const cave = planet.markers.find((marker) => marker.kind === "cave");
  if (!cave) return;
  const link = localFromMarker(planet, cave.id)!;
  const map = generateLocal(link.params, link.language ?? undefined);
  assert.equal(map.params.kind, "cave");
  if (cave.name) assert.equal(map.name, cave.name, "the cave keeps its name");
  // The dweller waits on the cave's last level; a level above it holds lesser things.
  const levels = map.params.levels ?? 1;
  const bottom = levels > 1 ? generateLocal({ ...map.params, seed: `${map.params.seed}/depth-${levels}`, depth: levels }, link.language ?? undefined) : map;
  const dweller = String(cave.facts.dweller).replace(/ /gu, "-");
  assert.equal(bottom.keyed.find((k) => k.final)!.monsters.find((g) => g.boss)!.who, dweller);
  assert.ok(!bottom.features.some((f) => f.kind === "stairs-down"), "the last level leads no further");
  if (levels > 1) assert.notEqual(map.keyed.find((k) => k.final)!.monsters.find((g) => g.boss)?.who, dweller, "the dweller is not on the first level");
});

test("dungeons and caves lead further down, and a deeper level is a new place", () => {
  for (const kind of ["dungeon", "cave"] as const) {
    const first = generateLocal({ seed: `deep-${kind}`, kind, levels: 3 });
    assert.ok(first.features.some((f) => f.kind === "stairs-down"), `${kind}: a way down`);
    const second = generateLocal({ ...first.params, seed: `deep-${kind}/depth-2`, depth: 2 });
    assert.equal(second.params.depth, 2);
    assert.notDeepEqual(Array.from(second.tiles), Array.from(first.tiles));
  }
});

test("later ages have their own dungeons and wastes, and their underworld has metro lines, bunkers and vaults", () => {
  for (const theme of ["factory", "metro", "lab", "mall", "vault", "starship"] as const) {
    const map = generateLocal({ seed: `age-${theme}`, kind: "dungeon", theme });
    assert.equal(map.params.theme, theme);
    assert.ok(map.keyed.length > 3);
    assert.doesNotMatch(renderLocal(map), /NaN|undefined/u);
  }
  const waste = generateLocal({ seed: "age-waste", kind: "wilderness", theme: "wasteland" });
  assert.ok(waste.tiles.some((tile) => tile === TILE.rubble));
  const modern = generatePlanet({ seed: "age-under", cells: 3000, setting: SETTINGS.modern });
  const below = generateUnderworld(modern);
  assert.ok(below.tunnels.some(([, , kind]) => kind === "line") && below.caverns.some((cavern) => cavern.kind === "metro"), "metro lines under the great cities");
  // Without magic no fantastic peoples live below, only the folk of the age: mole people, a doomsday cult, tunnel folk.
  assert.ok(below.peoples.length > 0 && below.peoples.every((p) => ["mole-people", "doomsday-cult", "tunnel-folk"].includes(p.kind)), "the folk of the age live below");
  assert.doesNotMatch(renderUnderworld(below, modern), /NaN|undefined/u);
  const factory = modern.markers.find((marker) => marker.kind === "factory")!;
  assert.equal(localFromMarker(modern, factory.id)?.params.theme, "factory");
  const fallen = generatePlanet({ seed: "age-under", cells: 3000, setting: SETTINGS["post-apocalypse"] });
  assert.ok(generateUnderworld(fallen).caverns.some((cavern) => cavern.kind === "vault"), "vaults after the fall");
});

test("one door to each run of corridor, chambers that share no ground, the lair at the end of the walk", () => {
  for (let k = 0; k < 12; k++) {
    const map = generateLocal({ seed: `walk-${k}`, kind: "dungeon", theme: "crypt" });
    const W = map.params.width;
    const doors = map.features.filter((f) => f.kind === "door" || f.kind === "locked-door" || f.kind === "secret-door");
    // A door at each end of a short passage is fine; a wall of three or more doors in a line is not.
    const at = (x: number, y: number) => doors.some((d) => d.x === x && d.y === y);
    const walls = doors.filter((d) => (at(d.x - 1, d.y) && at(d.x + 1, d.y)) || (at(d.x, d.y - 1) && at(d.x, d.y + 1)));
    assert.equal(walls.length, 0, `walk-${k}: doors in a row`);
    // Steps from the way in: the lair (or tomb) is the farthest room.
    const entrance = map.keyed.find((r) => r.purpose === "entrance")!;
    const dist = new Map<number, number>([[entrance.cells[0], 0]]);
    const queue = [entrance.cells[0]];
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      for (const n of [c - 1, c + 1, c - W, c + W]) if (n >= 0 && n < map.tiles.length && map.tiles[n] !== TILE.rock && !dist.has(n)) (dist.set(n, dist.get(c)! + 1), queue.push(n));
    }
    const reach = (r: (typeof map.keyed)[number]) => Math.min(...r.cells.map((c) => dist.get(c) ?? Infinity));
    const end = map.keyed.find((r) => r.final)!;
    for (const room of map.keyed.filter((r) => !r.secret)) assert.ok(reach(room) <= reach(end) + 4, `walk-${k}: room ${room.id} lies deeper than the tomb`);
    // Nothing stands on another thing; stairs and chests stay out of the water.
    const spots = map.features.filter((f) => ["stairs-down", "crate", "trap", "chest"].includes(f.kind));
    for (const f of spots) assert.ok(map.tiles[f.x + f.y * W] !== TILE.water && map.tiles[f.x + f.y * W] !== TILE.deep, `${f.kind} in the water`);
    assert.equal(new Set(spots.map((f) => f.x + f.y * W)).size, spots.length, "two things on one tile");
  }
  for (let k = 0; k < 6; k++) {
    const cave = generateLocal({ seed: `halls-${k}`, kind: "cave", theme: "lair" });
    const all = cave.keyed.flatMap((r) => r.cells);
    assert.equal(new Set(all).size, all.length, "two chambers share ground");
    assert.ok(cave.features.filter((f) => f.kind === "trap").length >= cave.keyed.filter((r) => r.trap).length, "a cave's traps are on the map");
  }
});

test("the wilds hold as many places as asked; the players see no secrets, traps or keys", () => {
  const wild = generateLocal({ seed: "many", kind: "wilderness", theme: "forest", rooms: 8 });
  assert.ok(wild.keyed.length > 6, `${wild.keyed.length} places`);
  assert.ok(wild.features.filter((f) => f.kind === "trap").length >= wild.keyed.filter((r) => r.trap).length);
  assert.match(renderLocal(wild), /M0,0V/u, "the wilds have their grid");
  for (let k = 0; k < 10; k++) {
    const map = generateLocal({ seed: `secret-${k}`, kind: "dungeon", theme: "crypt", danger: 3 });
    if (!map.features.some((f) => f.kind === "secret-door" || f.kind === "trap")) continue;
    const view = renderLocal(map, { players: true });
    assert.doesNotMatch(view, />S</u);
    assert.doesNotMatch(view, />T</u);
    return;
  }
});

test("each place opens as itself: a precursor ruin, a vault's door, a deep people's hold", () => {
  const galaxy = generateGalaxy({ seed: "ruins", stars: 600 });
  const ruin = galaxy.stars.find((star) => star.feature === "ruins");
  if (ruin) {
    const link = localFromStar(galaxy, ruin.id)!;
    const map = generateLocal(link.params, link.language ?? undefined);
    assert.equal(map.name, ruin.name);
    for (const room of map.keyed) for (const m of room.monsters) assert.ok(!["goblins", "orcs", "kobolds", "skeletons", "zombies"].includes(m.who), `${m.who} among the stars`);
  }
  const fallen = generateCity({ seed: "vaulted", era: "post-apocalypse", population: 3 });
  const door = fallen.landmarks.find((l) => l.kind === "vault-door");
  if (door) assert.equal(localFromLandmark(fallen, door.id)?.params.theme, "vault");
  const planet = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
  const below = generateUnderworld(planet);
  const hold = below.caverns.find((c) => c.kind === "settlement");
  if (hold) {
    const link = localFromCavern(below, hold.id)!;
    assert.equal(link.params.theme, "hold");
    assert.equal(link.params.name, hold.name);
    assert.equal(link.params.danger, 1);
  }
});

test("in every age the underworld is one web, and its ways down open close beneath them", () => {
  for (const setting of [SETTINGS.medieval, SETTINGS.modern, SETTINGS["far-future"], SETTINGS["post-apocalypse"]]) {
    const planet = generatePlanet({ seed: "web", cells: 4000, setting });
    const world = generateUnderworld(planet);
    const parent = world.caverns.map((_, k) => k);
    const root = (k: number): number => (parent[k] === k ? k : (parent[k] = root(parent[k])));
    for (const [a, b] of world.tunnels) parent[root(a)] = root(b);
    assert.equal(new Set(world.caverns.map((c) => root(c.id))).size, 1, `${setting.era}: the dark falls apart`);
    for (const entrance of world.entrances.filter((e) => e.marker)) {
      const marker = planet.markers[entrance.marker];
      const cavern = world.caverns[entrance.cavern];
      assert.ok(!["metro", "undercity", "bunker", "vault"].includes(cavern.kind), "a cave mouth opens on a bunker");
      assert.equal(planet.feature[planet.mesh.find(cavern.x, cavern.y)], planet.feature[planet.mesh.find(marker.x, marker.y)], "a way down leads under another land");
      if (marker.kind === "portal") assert.equal(marker.facts.leadsTo, "underworld");
    }
  }
});

/** Where one starts: the stairs up, else the way in at the map's edge, else a cavern's first tunnel. */
const startOf = (map: LocalMap) => {
  const way = map.features.find((f) => f.kind === "stairs-up") ?? map.features.find((f) => (f.kind === "exit" || f.kind === "airlock") && f.to === "") ?? map.features.find((f) => f.kind === "exit")!;
  return way.x + way.y * map.params.width;
};

test("topology v2: a way in from the edge, keys before their locks, secret rooms only through secret doors, chasms bridged", () => {
  let locks = 0,
    secrets = 0,
    chasms = 0;
  for (const theme of LOCAL_THEMES.dungeon)
    for (let k = 0; k < 5; k++) {
      const map = generateLocal({ seed: `topo-${theme}-${k}`, kind: "dungeon", theme, levels: 2 });
      const W = map.params.width;
      const way = map.features.find((f) => (f.kind === "exit" || f.kind === "airlock") && f.to === "")!;
      assert.ok(way && (way.x === 0 || way.y === 0 || way.x === W - 1 || way.y === map.params.height - 1 || theme === "starship" || theme === "derelict"), `${theme}: the way in is at the edge`);
      const doors = doorsOf(map);
      const start = startOf(map);
      const all = walk(map, doors, start);
      // Every open tile can be walked to: chasms have their bridges.
      for (let c = 0; c < map.tiles.length; c++) if (!blocked(map.tiles[c])) assert.ok(all[c] < Infinity, `${theme}-${k}: ground cut off at ${c % W},${Math.floor(c / W)}`);
      if (map.tiles.some((t) => t === TILE.chasm)) chasms++;
      for (const holder of map.keyed.filter((r) => r.key)) {
        locks++;
        const n = holder.key!;
        const shut = new Set(map.features.filter((f) => f.kind === "locked-door" && (f.lock ?? 0) >= n).map((f) => f.x + f.y * W));
        assert.ok(reachOf(holder, walk(map, doors, start, (c) => shut.has(c))) < Infinity, `${theme}-${k}: key ${n} lies behind its own lock`);
        const target = map.keyed.find((r) => r.lock === n)!;
        assert.ok(reachOf(target, walk(map, doors, start, (c) => shut.has(c))) === Infinity, `${theme}-${k}: lock ${n} keeps nothing out`);
      }
      const hidden = new Set(map.features.filter((f) => f.kind === "secret-door").map((f) => f.x + f.y * W));
      const plain = walk(map, doors, start, (c) => hidden.has(c));
      for (const room of map.keyed) assert.equal(room.secret, reachOf(room, plain) === Infinity, `${theme}-${k}: room ${room.id} secret is ${room.secret}`);
      secrets += map.keyed.filter((r) => r.secret).length;
    }
  assert.ok(locks > 10 && secrets > 10 && chasms > 3, `locks ${locks}, secret rooms ${secrets}, chasms ${chasms}`);
});

test("levels link up: a level's stairs down stand where the next one's stairs up do", () => {
  for (const [kind, theme] of [["dungeon", "crypt"], ["dungeon", "metro"], ["dungeon", "starship"], ["cave", "lair"], ["cave", "mine"]] as const) {
    const first = generateLocal({ seed: `link-${theme}`, kind, theme, levels: 3 });
    const second = generateLocal({ ...first.params, seed: `link-${theme}/depth-2`, depth: 2 });
    const down = first.features.find((f) => f.kind === "stairs-down")!;
    const up = second.features.find((f) => f.kind === "stairs-up")!;
    assert.deepEqual([up.x, up.y], [down.x, down.y], `${theme}: the stairs do not meet`);
  }
});

test("a stable key: danger, ruler, age, magic and depth never move rooms or change what they are for", () => {
  for (const [kind, theme] of [["dungeon", "crypt"], ["dungeon", "mine"], ["dungeon", "starship"], ["cave", "mine"]] as const) {
    const a = generateLocal({ seed: `stable-${theme}`, kind, theme, danger: 1, levels: 1 });
    const b = generateLocal({ seed: `stable-${theme}`, kind, theme, danger: 3, boss: "troll", age: "modern", magic: 2, levels: 3 });
    assert.deepEqual(Array.from(b.tiles), Array.from(a.tiles), `${theme}: tiles moved`);
    assert.deepEqual(b.keyed.map((r) => [r.id, r.purpose, r.cells.length]), a.keyed.map((r) => [r.id, r.purpose, r.cells.length]), `${theme}: rooms changed`);
  }
});

test("themes build their own rooms: a ship's bridge, engines and airlocks, sewer canals, mine rails and veins, a metro's platforms, a crypt's niches", () => {
  const ship = generateLocal({ seed: "theme-ship", kind: "dungeon", theme: "starship" });
  for (const purpose of ["ship-bridge", "engine-room"]) assert.ok(ship.keyed.some((r) => r.purpose === purpose), purpose);
  assert.ok(ship.features.filter((f) => f.kind === "airlock").length >= 2 && ship.tiles.some((t) => t === TILE.hull), "a hull with airlocks");
  const sewer = generateLocal({ seed: "theme-sewer", kind: "dungeon", theme: "sewer" });
  assert.ok(sewer.tiles.filter((t) => t === TILE.water).length > 40 && sewer.features.some((f) => f.kind === "grate"), "canals under grates");
  const mine = generateLocal({ seed: "theme-mine", kind: "dungeon", theme: "mine" });
  assert.ok(mine.tiles.some((t) => t === TILE.rail) && mine.features.some((f) => f.kind === "vein"), "rails and veins");
  const metro = generateLocal({ seed: "theme-metro", kind: "dungeon", theme: "metro" });
  assert.ok(metro.tiles.some((t) => t === TILE.platform) && metro.keyed.some((r) => r.purpose === "platform"), "platforms");
  assert.equal(metro.features.filter((f) => f.kind === "exit" && f.to === "line").length, 2, "the line runs off both edges");
  const crypt = generateLocal({ seed: "theme-crypt", kind: "dungeon", theme: "crypt" });
  assert.ok(crypt.features.some((f) => f.kind === "niche") && crypt.features.some((f) => f.kind === "coffin"), "niches and a sarcophagus");
  for (const map of [ship, sewer, mine, metro, crypt]) assert.doesNotMatch(renderLocal(map, { coords: true, units: "ft" }), /NaN|undefined|Infinity/u);
});

test("bands come in numbers by age and magic, people are led by someone with a name", () => {
  const counted = generateLocal({ seed: "bands", kind: "dungeon", theme: "crypt", danger: 3 });
  const groups = counted.keyed.flatMap((r) => r.monsters);
  assert.ok(groups.length > 2 && groups.every((g) => g.count >= 1));
  assert.ok(groups.some((g) => g.count > 1), "some come in bands");
  assert.equal(counted.wandering.length, 6);
  const undead = ["skeletons", "zombies", "ghouls", "lich", "wraith", "vampire", "mummy"];
  const plain = generateLocal({ seed: "bands", kind: "dungeon", theme: "crypt", age: "renaissance", danger: 3 });
  assert.ok(plain.keyed.flatMap((r) => r.monsters).every((g) => !undead.includes(g.who)), "the dead lie still without magic");
  const magic = generateLocal({ seed: "bands", kind: "dungeon", theme: "crypt", age: "renaissance", magic: 2, danger: 3 });
  assert.ok(magic.keyed.flatMap((r) => r.monsters).some((g) => undead.includes(g.who)), "and walk where magic stirs");
  const gang = generateLocal({ seed: "gang", kind: "dungeon", theme: "sewer", age: "modern", danger: 3 });
  const led = gang.keyed.flatMap((r) => r.monsters).filter((g) => g.leader);
  assert.ok(led.length > 0 && led.every((g) => g.leader!.name.includes(" ")), "a gang has a named boss");
  for (const room of gang.keyed) assert.ok(room.look.length >= 1 && room.look.every((key) => key.startsWith("look.") || key.startsWith("object.")));
});

test("legends come true: a tomb holds its ruler, a mine its veins and miners, a camp its whole band, a cave goes as deep as told", () => {
  const planet = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
  const ancient = generatePlanet({ seed: "legends", cells: 4000, setting: { ...SETTINGS.ancient, magic: 1 } });
  const tomb = ancient.markers.find((m) => m.kind === "tomb");
  if (tomb) {
    const link = localFromMarker(ancient, tomb.id)!;
    const levels = link.params.levels ?? 1;
    const bottom = generateLocal({ ...link.params, seed: `${link.params.seed}/depth-${levels}`, depth: levels }, link.language ?? undefined);
    const final = bottom.keyed.find((r) => r.final)!;
    assert.equal(final.purpose, "tomb");
    assert.equal(final.name, tomb.facts.ruler, "the tomb is its ruler's");
    assert.equal(final.monsters.find((g) => g.boss)?.name, tomb.facts.ruler, "the ruler rises");
  }
  const mine = planet.markers.find((m) => m.kind === "mine")!;
  const dug = generateLocal(localFromMarker(planet, mine.id)!.params);
  assert.ok(dug.features.some((f) => f.kind === "vein") && dug.tiles.some((t) => t === TILE.rail));
  assert.ok(dug.keyed.flatMap((r) => r.monsters).some((g) => g.who === "miners"), "a working mine has its miners");
  // Brigands are rare on a small planet: the camp is made as a planet's link makes it.
  const camp = generateLocal({ seed: "camp", kind: "wilderness", theme: "forest", age: "medieval", origin: { kind: "brigands", facts: { band: 23 } } });
  const band = camp.keyed.flatMap((r) => r.monsters).filter((g) => g.who === "bandits");
  assert.equal(band.reduce((sum, g) => sum + g.count, 0), 23, "the whole band is there");
  assert.ok(band.some((g) => g.boss && g.leader), "led by its chief");
  assert.ok(camp.features.some((f) => f.kind === "fence") && camp.keyed.some((r) => r.object === "bandit-camp"));
  for (const cave of planet.markers.filter((m) => m.kind === "cave")) assert.equal(localFromMarker(planet, cave.id)!.params.levels, Math.min(9, Number(cave.facts.depth)));
  const fallen = generatePlanet({ seed: "age-under", cells: 3000, setting: SETTINGS["post-apocalypse"] });
  const vault = fallen.markers.find((m) => m.kind === "bunker" && Number(m.facts.dwellers) > 0);
  if (vault) {
    const lived = generateLocal(localFromMarker(fallen, vault.id)!.params);
    assert.ok(lived.keyed.flatMap((r) => r.monsters).some((g) => g.who === "survivors"), "a lived-in vault");
    assert.equal(localStory(lived).hook.key, "hook.vault");
  }
});

test("every place of a planet opens: a bridge on its river, a wreck on the sea floor, any spot as the land there", () => {
  const planet = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
  const bridge = planet.markers.find((m) => m.kind === "bridge");
  if (bridge) {
    const map = generateLocal(localFromMarker(planet, bridge.id)!.params);
    assert.ok(map.river.length > 0 && map.features.some((f) => f.kind === "bridge") && map.keyed.some((r) => r.object === "bridge"));
    assert.equal(map.params.river, bridge.facts.river);
  }
  const wreck = planet.markers.find((m) => m.kind === "shipwreck");
  if (wreck) {
    const map = generateLocal(localFromMarker(planet, wreck.id)!.params);
    assert.equal(map.params.theme, "seabed");
    assert.ok(map.keyed.some((r) => r.treasure?.what === `fact:${wreck.facts.cargo}`), "the cargo lies in the hold");
  }
  const sea = Array.from({ length: planet.mesh.cells }, (_, c) => c).find((c) => planet.water[c])!;
  assert.equal(localAt(planet, sea)!.params.theme, "seabed");
  const river = Array.from({ length: planet.mesh.cells }, (_, c) => c).find((c) => planet.river[c] && !planet.water[c] && !planet.burg[c])!;
  assert.equal(localAt(planet, river)!.params.river, planet.rivers[planet.river[river]].name);
  const town = planet.burgs[1];
  assert.equal(localAt(planet, town.cell), null, "a town opens as its city");
  for (const theme of ["jungle", "steppe", "tundra", "seabed"] as const) assert.doesNotMatch(renderLocal(generateLocal({ seed: `land-${theme}`, kind: "wilderness", theme })), /NaN|undefined/u);
  const city = generateCity({ seed: "crypts", era: "medieval", population: 20 });
  const temple = city.landmarks.find((l) => l.kind === "temple");
  if (temple) assert.equal(localFromLandmark(city, temple.id)?.params.theme, "crypt");
});

test("the wilds go on past their edges: a sheet's trail and stream meet its neighbours'", () => {
  const here = generateLocal({ seed: "sheets", kind: "wilderness", theme: "forest" });
  const east = generateLocal({ ...here.params, sheet: [1, 0] });
  assert.equal(east.trail[0][1], here.trail[here.trail.length - 1][1], "the trail meets at the east edge");
  const south = generateLocal({ ...here.params, sheet: [0, 1] });
  const leaving = here.stream.filter(([, y]) => y === here.params.height - 1).map(([x]) => x);
  const entering = south.stream.filter(([, y]) => y === 0).map(([x]) => x);
  assert.ok(leaving.length && entering.length && Math.abs(leaving[leaving.length - 1] - entering[0]) <= 2, "the stream runs on south");
  assert.notDeepEqual(east.keyed.map((r) => [r.x, r.y]), here.keyed.map((r) => [r.x, r.y]), "each sheet has places of its own");
});

test("a place's story: a hook, three rumours with one lie, its bands as factions", () => {
  for (let k = 0; k < 6; k++) {
    const map = generateLocal({ seed: `story-${k}`, kind: "dungeon", theme: "sewer", age: "modern", danger: 3 });
    const story = localStory(map);
    assert.ok(story.hook.key.startsWith("hook."));
    assert.equal(story.rumours.length, 3);
    assert.equal(story.rumours.filter((r) => !r.true).length, 1);
    for (const faction of story.factions) for (const rival of faction.rivals) assert.ok(story.factions.find((f) => f.id === rival)!.rivals.includes(faction.id));
    assert.deepEqual(localStory(map), story, "the same story every time");
  }
});

test("the game master edits a room's key and rolls a room anew; a room opens as a scene", () => {
  const map = generateLocal({ seed: "edit", kind: "dungeon", theme: "crypt", danger: 2 });
  const room = map.keyed.find((r) => r.purpose !== "entrance" && !r.final)!;
  const edited = editLocal(map, { rooms: { [room.id]: { monsters: [{ who: "ghouls", count: 4 }], trap: "pit", text: "Cold." } } });
  const after = edited.keyed.find((r) => r.id === room.id)!;
  assert.deepEqual(after.monsters, [{ who: "ghouls", count: 4 }]);
  assert.equal(after.trap, "pit");
  assert.equal(after.text, "Cold.");
  assert.ok(edited.features.some((f) => f.kind === "trap" && f.room === room.id), "the trap is on the map");
  assert.deepEqual(map.keyed.find((r) => r.id === room.id), room, "the map itself is untouched");
  const once = editLocal(map, { rooms: { [room.id]: { reroll: 1 } } });
  assert.deepEqual(editLocal(map, { rooms: { [room.id]: { reroll: 1 } } }).keyed, once.keyed, "a roll is the same every time");
  const rolls = [1, 2, 3, 4].map((n) => JSON.stringify(editLocal(map, { rooms: { [room.id]: { reroll: n } } }).keyed.find((r) => r.id === room.id)));
  assert.ok(new Set(rolls).size > 1, "rolls differ");
  assert.deepEqual(once.keyed.filter((r) => r.id !== room.id), map.keyed.filter((r) => r.id !== room.id), "other rooms stay");
  const busy = map.keyed.find((r) => r.monsters.length)!;
  const scene = localScene(map, busy.id)!;
  assert.equal(scene.tokens.length, Math.min(busy.monsters.reduce((sum, g) => sum + g.count, 0), busy.cells.length));
  for (const token of scene.tokens) assert.ok(busy.cells.includes(token.x + token.y * map.params.width));
  assert.doesNotMatch(renderLocalScene(map, scene), /NaN|undefined|Infinity/u);
});


test("the underworld has depths and tiers, tunnels with lengths and hazards, places of the deep, and catacombs under old towns", () => {
  const planet = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
  const world = generateUnderworld(planet);
  assert.equal(world.ways.length, world.tunnels.length, "a way for every tunnel");
  assert.ok(world.ways.every((way) => way.length >= 1 && way.danger >= 1 && way.danger <= 3));
  assert.ok(world.ways.some((way) => way.hazard), "some ways are dangerous");
  assert.ok(world.caverns.every((c) => c.depth > 0), "every cavern has its depth");
  assert.ok(new Set(world.caverns.map((c) => tierOf(c))).size >= 2, "the dark has tiers");
  for (const e of world.entrances.filter((e) => e.marker)) assert.ok(world.caverns[e.cavern].depth <= 400, "a way down opens on the upper dark");
  assert.ok(world.sites.length >= 3 && world.sites.every((s) => world.caverns[s.cavern]));
  const under = world.caverns.filter((c) => c.kind === "catacombs");
  assert.ok(under.length > 0 && under.every((c) => c.burg && planet.burgs[c.burg].name === c.name), "catacombs under the great towns");
  // Peoples: each has a kind, a first settlement and relations that agree both ways.
  for (const people of world.peoples) {
    assert.ok(people.kind && world.caverns[people.capital]?.people === people.id);
    for (const [other, relation] of Object.entries(people.relations)) {
      const back = world.peoples[Number(other) - 1].relations[people.id];
      assert.equal(back, relation === "tribute" ? "tribute-from" : relation === "tribute-from" ? "tribute" : relation, "relations agree");
    }
  }
  // Older underworlds keep their caverns and tunnels: the new parts come after them.
  const again = generateUnderworld(planet);
  assert.deepEqual(again.caverns.map((c) => [c.x, c.y, c.kind]), world.caverns.map((c) => [c.x, c.y, c.kind]));
  for (const style of [renderUnderworld(world, planet, { surface: true, tunnel: 0, highlight: 1 }), renderUnderworldSection(world, planet, { highlight: 1 }), underworldGhostSvg(world)]) assert.doesNotMatch(style, /NaN|undefined|Infinity/u);
  const modern = generateUnderworld(generatePlanet({ seed: "age-under", cells: 3000, setting: SETTINGS.modern }));
  assert.ok(modern.caverns.some((c) => c.kind === "metro" && c.burg), "stations know their towns");
  assert.ok(!modern.caverns.some((c) => c.kind === "catacombs"), "the metro age digs no catacombs");
});

test("one cavern, one map: its tunnels leave the map toward the caverns they lead to", () => {
  const planet = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
  const world = generateUnderworld(planet);
  const cavern = world.caverns.find((c) => c.kind === "cavern" && world.tunnels.filter(([a, b]) => a === c.id || b === c.id).length >= 2)!;
  const link = localFromCavern(world, cavern.id)!;
  assert.ok(link.params.exits && link.params.exits.length >= 2);
  const map = generateLocal(link.params, link.language ?? undefined);
  const exits = map.features.filter((f) => f.kind === "exit" && f.to);
  assert.equal(exits.length, link.params.exits!.length, "a way off the map for each tunnel");
  const W = map.params.width;
  const dist = walk(map, doorsOf(map), exits[0].x + exits[0].y * W);
  for (const exit of exits) assert.ok(dist[exit.x + exit.y * W] < Infinity, "every way off the map is reached");
  for (const exit of exits) assert.ok(exit.x === 0 || exit.y === 0 || exit.x === W - 1 || exit.y === map.params.height - 1, "at the edge");
  const sea = world.caverns.find((c) => c.kind === "sea");
  if (sea) {
    const lake = generateLocal(localFromCavern(world, sea.id)!.params);
    assert.ok(lake.tiles.filter((t) => t === TILE.deep).length > 80, "an underground sea fills its cave");
  }
});

test("the game master edits the underworld: kinds and peoples, caverns removed and added, tunnels cut and dug", () => {
  const planet = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
  const world = generateUnderworld(planet);
  const [a, b] = world.tunnels[0];
  const lonely = world.caverns.find((c) => c.kind === "cavern")!;
  const edited = editUnderworld(world, { caverns: { [lonely.id]: { kind: "settlement", people: world.peoples[0]?.id ?? 0 }, [b]: { removed: true } }, added: [{ x: 100, y: 100, kind: "crystal", people: 0 }], cut: [], joined: [[a, lonely.id, "river"]] });
  assert.equal(edited.caverns[lonely.id].kind, "settlement");
  assert.ok(edited.caverns[lonely.id].population > 0);
  assert.ok(edited.caverns[b].removed && !edited.tunnels.some(([p, q]) => p === b || q === b), "a removed cavern takes its tunnels");
  assert.equal(edited.caverns.length, world.caverns.length + 1);
  assert.equal(edited.caverns[world.caverns.length].kind, "crystal");
  assert.equal(edited.tunnels.length, edited.ways.length);
  assert.ok(edited.tunnels.some(([p, q, kind]) => p === a && q === lonely.id && kind === "river") || a === lonely.id || b === lonely.id);
  const cut = editUnderworld(world, { cut: [[a, b]] });
  assert.equal(cut.tunnels.length, world.tunnels.length - 1);
  assert.equal(world.tunnels.length, generateUnderworld(planet).tunnels.length, "the underworld itself is untouched");
  assert.doesNotMatch(renderUnderworld(edited, planet), /NaN|undefined/u);
});

test("a building's cellar leads down by its kind and age; a deep people's hold is lived in by that people", () => {
  const keep = generateBuilding({ seed: "cellar-keep", type: "keep", era: "medieval" });
  if (keep.params.cellar) assert.equal(localFromCellar(keep)?.params.theme, "crypt");
  const flat = generateBuilding({ seed: "cellar-flat", type: "house", era: "modern" });
  const way = localFromCellar({ ...flat, params: { ...flat.params, cellar: true } });
  assert.equal(way?.params.theme, "metro");
  assert.equal(localFromCellar({ ...flat, params: { ...flat.params, cellar: false } }), null, "no cellar, no way down");
  const planet = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
  const world = generateUnderworld(planet);
  const home = world.caverns.find((c) => c.kind === "settlement" && c.people)!;
  const hold = generateLocal(localFromCavern(world, home.id)!.params);
  const folk = hold.keyed.flatMap((r) => r.monsters).filter((g) => g.who === "deep-folk");
  assert.ok(folk.length && folk.every((g) => g.name === world.peoples[home.people - 1].name));
});

test("review fixes: whole tiles, a corridor to every room, lava that cuts nothing off, keys one can reach", () => {
  // Half a tile is no tile: the size rounds, and nothing stands between two tiles.
  const params = localParams({ seed: "half", kind: "wilderness", width: 40.5, height: 30.4, rooms: 2.6 });
  assert.deepEqual([params.width, params.height, params.rooms], [41, 30, 3]);
  const half = generateLocal({ seed: "half", kind: "dungeon", width: 40.5, height: 30.5 });
  assert.ok(half.features.every((f) => Number.isInteger(f.x) && Number.isInteger(f.y)), "a feature between tiles");
  // Rooms on the rim of the corridors' graph are joined too (an edge of the hull has one half-edge).
  const rims: [string, LocalTheme | undefined][] = [["hf-sewer-68", "sewer"], ["d3-235", undefined], ["d3-394", undefined], ...Array.from({ length: 40 }, (_, k): [string, undefined] => [`rim-${k}`, undefined])];
  for (const [seed, theme] of rims) {
    const map = generateLocal({ seed, kind: "dungeon", theme });
    const dist = walk(map, doorsOf(map), startOf(map));
    for (const room of map.keyed) assert.ok(reachOf(room, dist) < Infinity, `${seed}: room ${room.id} has no way in`);
  }
  // A magma chamber's lava never walls ground off, however wide its band; its ways off the map stay dry.
  for (let k = 0; k < 16; k++) {
    const map = generateLocal({ seed: `m4-${k}`, kind: "cave", theme: "lair", origin: { kind: k % 2 ? "magma" : "sea", facts: {} }, exits: [{ dir: k % 8, kind: "passage", to: "A" }, { dir: (k + 3) % 8, kind: "passage", to: "B" }] });
    const dist = walk(map, doorsOf(map), startOf(map));
    map.tiles.forEach((tile, c) => assert.ok(blocked(tile) || dist[c] < Infinity, `m4-${k}: ground cut off`));
    for (const exit of map.features.filter((f) => f.kind === "exit")) assert.ok(![TILE.lava, TILE.water, TILE.deep].includes(map.tiles[exit.x + exit.y * map.params.width] as never), `m4-${k}: a way out under lava or water`);
  }
  // Two locks: each key is reached holding the keys before it, so every lock can be opened in turn.
  for (const seed of ["dl-53", "dl-332", "dl-1017", ...Array.from({ length: 40 }, (_, k) => `dl-x${k}`)]) {
    const map = generateLocal({ seed, kind: "dungeon", theme: "temple" });
    const W = map.params.width;
    const held = new Set<number>();
    for (let round = 0; round < 4; round++) {
      const shut = new Set(map.features.filter((f) => f.kind === "locked-door" && !held.has(f.lock!)).map((f) => f.x + f.y * W));
      const dist = walk(map, doorsOf(map), startOf(map), (c) => shut.has(c));
      for (const room of map.keyed) if (room.key && reachOf(room, dist) < Infinity) held.add(room.key);
    }
    for (const room of map.keyed.filter((r) => r.lock)) assert.ok(held.has(room.lock!), `${seed}: lock ${room.lock} cannot be opened`);
  }
});

test("review fixes: stairs meet and stay dry, cisterns hold water, pieces stand on floor, small ships can be boarded", () => {
  for (const [seed, theme] of [["lk-bunker-60/depth-2", "bunker"], ["lk-metro-105/depth-2", "metro"]] as const) {
    const map = generateLocal({ seed, kind: "dungeon", theme, depth: 2, levels: 3 });
    assert.ok(map.features.some((f) => f.kind === "stairs-down") && map.features.some((f) => f.kind === "stairs-up"), `${seed}: no way down`);
  }
  const caves: [string, LocalTheme][] = [["lk-mine-85", "mine"], ...Array.from({ length: 30 }, (_, k): [string, LocalTheme] => [`lk-${k}`, (["lair", "mine", "hold"] as const)[k % 3]])];
  for (const [seed, theme] of caves) {
    const first = generateLocal({ seed, kind: "cave", theme, levels: 2 });
    const second = generateLocal({ ...first.params, seed: `${seed}/depth-2`, depth: 2 });
    const down = first.features.find((f) => f.kind === "stairs-down")!;
    const up = second.features.find((f) => f.kind === "stairs-up")!;
    assert.deepEqual([down.x, down.y], [up.x, up.y], `${seed}: the stairs do not meet`);
  }
  for (let k = 0; k < 20; k++)
    for (const theme of ["mine", "factory"] as const) {
      const map = generateLocal({ seed: `wet-${k}/depth-2`, kind: "dungeon", theme, depth: 2, levels: 3 });
      for (const f of map.features.filter((item) => item.kind === "stairs-down" || item.kind === "stairs-up")) assert.ok(![TILE.water, TILE.deep].includes(map.tiles[f.x + f.y * map.params.width] as never), `wet-${k} ${theme}: ${f.kind} in the water`);
    }
  let cisterns = 0;
  for (let k = 0; k < 20; k++) {
    const map = generateLocal({ seed: `cistern-${k}`, kind: "dungeon", theme: "sewer" });
    for (const room of map.keyed.filter((r) => r.purpose === "cistern")) {
      cisterns++;
      assert.ok(room.cells.some((c) => map.tiles[c] === TILE.deep), `cistern-${k}: a dry cistern`);
    }
  }
  assert.ok(cisterns > 3, `${cisterns} cisterns`);
  // Pillars and tents stand on dry floor; a cave's chambers hold no chasm or lava; no tree grows on a wreck.
  for (let k = 0; k < 8; k++)
    for (const map of [generateLocal({ seed: `hold-${k}`, kind: "cave", theme: "hold" }), generateLocal({ seed: `abyss-${k}`, kind: "cave", theme: "lair", origin: { kind: k % 2 ? "abyss" : "magma", facts: {} } }), generateLocal({ seed: `wild-${k}`, kind: "wilderness", theme: k % 2 ? "swamp" : "coast", origin: { kind: "shipwreck", facts: {} } })]) {
      const tile = (f: { x: number; y: number }) => map.tiles[f.x + f.y * map.params.width];
      for (const f of map.features.filter((item) => item.kind === "pillar" || item.kind === "tent")) assert.ok(!blocked(tile(f)) && tile(f) !== TILE.water && tile(f) !== TILE.deep, `${map.params.seed}: a ${f.kind} in rock or water`);
      for (const f of map.features.filter((item) => item.kind === "tree" || item.kind === "rock")) assert.notEqual(tile(f), TILE.hull, `${map.params.seed}: a tree on the hull`);
      if (map.params.kind === "cave") for (const room of map.keyed) assert.ok(room.cells.every((c) => !blocked(map.tiles[c])), `${map.params.seed}: room ${room.id} takes in rock, chasm or lava`);
    }
  // However short, a ship has its engines, its bridge and a way aboard.
  for (const theme of ["starship", "derelict"] as const)
    for (const width of [24, 28]) {
      const map = generateLocal({ seed: `short-${width}`, kind: "dungeon", theme, width, height: 24 });
      const purposes = map.keyed.map((r) => r.purpose);
      assert.ok(purposes.includes("engine-room") && purposes.includes("ship-bridge") && purposes.includes("entrance"), `${theme} ${width}: ${purposes.join(",")}`);
      assert.ok(map.features.some((f) => f.kind === "airlock" && f.to === ""), `${theme} ${width}: no way aboard`);
    }
});

test("review fixes: legend dwellers in the story read as words; rerolls and cleared words of the GM", () => {
  const t = translator("en");
  for (const who of ["bats", "the-spirits", "a-lost-tribe", "bears", "outlaws", "a-hermit", "a-secret-lab", "a-rogue-AI", "a-gang", "feral-drones", "an-alien-nest", "a-sealed-vault", "dragon", "cave-bears", "troll"]) {
    const key = whoKey(who).slice(1);
    assert.notEqual(t(key), key, `${who} has no words`);
  }
  // The GM's own theme naming a kind of room since deleted never rolls it.
  const own = { rooms: [{ id: "well", name: "Well", text: "A deep well.", secret: false, opens: "", themes: [] }], themes: [{ id: "mine", name: "Mine", kind: "dungeon" as const, base: "crypt" as const, rooms: ["own:gone", "own:well", "storage"] }], tables: [] };
  const map = generateLocal({ seed: "own-reroll", kind: "dungeon", theme: "crypt", own: "mine" }, undefined, own);
  const plain = map.keyed.find((r) => !r.final && r.purpose !== "entrance" && !r.secret && !r.purpose.startsWith("own:"))!;
  for (let n = 1; n <= 12; n++) assert.notEqual(editLocal(map, { rooms: { [plain.id]: { reroll: n } } }, null, own).keyed.find((r) => r.id === plain.id)!.purpose, "own:gone");
  // Words cleared away leave the room's own words.
  const well = map.keyed.find((r) => r.purpose === "own:well");
  if (well) assert.equal(editLocal(map, { rooms: { [well.id]: { text: "" } } }, null, own).keyed.find((r) => r.id === well.id)!.text, "A deep well.");
  // A room rolled anew on a deeper level has people of that level.
  const deep = generateLocal({ seed: "people/depth-2", kind: "dungeon", theme: "crypt", depth: 2, levels: 2, age: "medieval", danger: 3 });
  const ids = deep.keyed.flatMap((room) => [1, 2, 3, 4, 5, 6].flatMap((n) => {
    const rolled = editLocal(deep, { rooms: { [room.id]: { reroll: n } } }).keyed.find((r) => r.id === room.id)!;
    // (The place's ruler is the same on every level, and keeps the name it has.)
    return [...(rolled.people ?? []), ...rolled.monsters.flatMap((g) => (g.leader && !g.boss ? [g.leader] : []))].map((npc) => npc.id);
  }));
  assert.ok(ids.length > 0 && ids.every((id) => id.startsWith("local:people/depth-2/")), "a rerolled room's people belong to the first level");
});

console.log(`local: ${passed} regressions passed`);
