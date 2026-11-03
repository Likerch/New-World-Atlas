// Local-map regressions: run with `npm test`.
import assert from "node:assert/strict";
import { generateCity, generateGalaxy, localFromCavern, localFromLandmark, localFromStar, generateUnderworld, renderUnderworld, SETTINGS, generateLocal, generatePlanet, LOCAL_KINDS, LOCAL_STYLES, LOCAL_THEMES, localFromMarker, renderLocal, TILE } from "../src/core/index";

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
      // A deep people's hold ends in its hoard, not a lair.
      assert.equal(map.keyed.filter((k) => k.purpose === (theme === "hold" ? "treasury" : "lair") || k.purpose === "tomb").length, 1, `${theme}: one final room`);
    }
  }
});

test("a wilderness trail crosses the map from west to east", () => {
  for (const theme of LOCAL_THEMES.wilderness) {
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
  assert.deepEqual(bottom.keyed.find((k) => k.purpose === "lair")!.monsters, [dweller]);
  assert.ok(!bottom.features.some((f) => f.kind === "stairs-down"), "the last level leads no further");
  if (levels > 1) assert.notDeepEqual(map.keyed.find((k) => k.purpose === "lair")!.monsters, [dweller], "the dweller is not on the first level");
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
  assert.equal(below.peoples.length, 0, "no peoples of the deep without magic");
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
    const end = map.keyed.find((r) => r.purpose === "tomb" || r.purpose === "lair")!;
    for (const room of map.keyed) assert.ok(reach(room) <= reach(end) + 4, `walk-${k}: room ${room.id} lies deeper than the tomb`);
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
    for (const room of map.keyed) for (const m of room.monsters) assert.ok(!["goblins", "orcs", "kobolds", "skeletons", "zombies"].includes(m), `${m} among the stars`);
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

console.log(`local: ${passed} regressions passed`);
