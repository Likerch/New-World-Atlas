// Worlds: the tree of maps, parameters handed down with the GM's overrides on top, names flowing up. Run with `npm test`.
import assert from "node:assert/strict";
import { mergeWorlds, mapKeyOf, rekey, planetParams, generateUniverse, renameUniverse, generateUnderworld, renameUnderworld, generateDistrict, buildingFromCity, cityFromBurg, emptyPatch, emptyWorld, generateCity, generatePlanet, levelsOf, nameUp, overridesOf, pathTo, readWorld, resolve, rootOf, settingAt, SETTINGS, visit, type WorldDoc } from "../src/core/index";

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

const planet = generatePlanet({ seed: "world-test", cells: 3000 });
const burg = planet.burgs.find((b) => b.id && !b.removed)!;
const city = cityFromBurg(planet, burg.id);
const asRecord = (value: unknown) => value as Record<string, unknown>;
const PLANET = mapKeyOf("planet", asRecord(planet.params));

function planetWorld(): WorldDoc {
  let world = emptyWorld({ id: "w1", name: "Test", top: "planet", now: 1 });
  world = visit(world, PLANET, { level: "planet", parent: null, step: null, title: planet.name, base: null, params: asRecord(planet.params) }, 2);
  world = visit(world, `city:${city.params.seed}`, { level: "city", parent: PLANET, step: { entity: `burg:${burg.id}` }, title: burg.name, base: asRecord(city.params), params: asRecord(city.params), language: city.language }, 3);
  return world;
}

test("a world shows its top map and everything reachable below it, nothing above", () => {
  assert.deepEqual(levelsOf("planet"), ["planet", "region", "underworld", "city", "building", "local"]);
  assert.deepEqual(levelsOf("city"), ["city", "building", "local"]);
  assert.equal(levelsOf("universe").length, 9);
  assert.deepEqual(levelsOf("building"), ["building"]);
});

test("maps hang in a tree from the top; the path down is the breadcrumb", () => {
  const world = planetWorld();
  assert.equal(rootOf(world)![0], PLANET);
  assert.deepEqual(pathTo(world, `city:${city.params.seed}`).map(([key]) => key), [PLANET, `city:${city.params.seed}`]);
  assert.equal(world.last.byLevel.city, `city:${city.params.seed}`);
});

test("the GM's overrides survive a new hand-down from the parent and reach the map's children", () => {
  let world = planetWorld();
  const key = `city:${city.params.seed}`;
  // The GM shows the city in another age.
  world = visit(world, key, { level: "city", parent: null, step: null, title: burg.name, base: null, params: { ...asRecord(city.params), era: "industrial" } }, 4);
  assert.deepEqual(overridesOf(world.maps[key]), { era: "industrial" });
  // The parent hands the city down again (say, grown bigger): the override is laid back on top, the rest follows.
  const grown = { ...asRecord(city.params), population: 99 };
  const again = resolve(world, key, grown);
  assert.equal(again.era, "industrial");
  assert.equal(again.population, 99);
  // A building opened from the city takes the city's age.
  const made = generateCity(again as never, city.language);
  const index = made.buildings.findIndex((b) => b.kind === "house");
  assert.equal(buildingFromCity(made, index).era, "industrial");
});

test("the world's setting reaches every map unless a planet below was set apart", () => {
  let world = emptyWorld({ id: "w2", name: "Space", top: "galaxy", setting: SETTINGS["far-future"] });
  world = visit(world, "galaxy:g", { level: "galaxy", parent: null, step: null, title: "G", base: null, params: { seed: "g" } });
  world = visit(world, "system:g/star-1", { level: "system", parent: "galaxy:g", step: { entity: "star:1" }, title: "S", base: { star: 1 }, params: { star: 1 } });
  assert.equal(settingAt(world, "system:g/star-1").era, "far-future");
  world = visit(world, "planet:g/star-1/body-0", { level: "planet", parent: "system:g/star-1", step: { entity: "body:0" }, title: "P", base: { seed: "g/star-1/body-0", setting: SETTINGS["far-future"] }, params: { seed: "g/star-1/body-0", setting: SETTINGS["post-apocalypse"] } });
  assert.equal(settingAt(world, "planet:g/star-1/body-0").era, "post-apocalypse", "a lost colony keeps its own age");
});

test("a new top map makes a new world: the maps under the old one go", () => {
  let world = planetWorld();
  world = visit(world, "planet:other", { level: "planet", parent: null, step: null, title: "Other", base: null, params: { seed: "other" } }, 5);
  assert.deepEqual(Object.keys(world.maps), ["planet:other"]);
});

test("a map's new name names the thing it was opened from on the parent map", () => {
  const world = planetWorld();
  const key = `city:${city.params.seed}`;
  const renamed = { ...world, patches: { ...world.patches, [key]: { ...emptyPatch(), names: { world: "Newport" } } } };
  assert.equal(nameUp(renamed, key, undefined).patches[PLANET].names[`burg:${burg.id}`], "Newport");
});

test("a world survives a file, and a file that is not a world is refused", () => {
  const world = planetWorld();
  const back = readWorld(JSON.parse(JSON.stringify(world)));
  assert.equal(JSON.stringify(back), JSON.stringify(world));
  assert.throws(() => readWorld({ format: "new-world-atlas/campaign", version: 1, maps: {} }), /not a world/u);
  assert.throws(() => readWorld({ ...world, version: 9 }), /version/u);
});

test("the same seed grown another way keys its own notes; old worlds move to the new keys", () => {
  const plain = planetParams({ seed: "keyed" });
  assert.equal(mapKeyOf("planet", asRecord(plain)), "planet:keyed", "a seed's own settings keep the plain key");
  assert.equal(mapKeyOf("planet", asRecord({ ...plain, name: "Other", setting: SETTINGS.modern })), "planet:keyed", "a name or an age is not a new map");
  const other = mapKeyOf("planet", asRecord({ ...plain, template: plain.template === "pangea" ? "archipelago" : "pangea" }));
  assert.match(other, /^planet:keyed~/u);
  assert.notEqual(mapKeyOf("planet", asRecord({ ...plain, cells: 3000 })), other);

  // A world saved with the old key: the map, its patch and its children's links move.
  const params = asRecord({ ...plain, cells: 3000 });
  let world = emptyWorld({ id: "w2", name: "Old", top: "planet", now: 1 });
  world = visit(world, "planet:keyed", { level: "planet", parent: null, step: null, title: "Keyed", base: null, params }, 2);
  world = visit(world, "city:keyed/burg-3", { level: "city", parent: "planet:keyed", step: { entity: "burg:3" }, title: "Town", base: {}, params: {} }, 3);
  world = { ...world, patches: { "planet:keyed": { ...emptyPatch(), names: { "burg:3": "Town" } } } };
  const moved = rekey(world);
  const key = mapKeyOf("planet", params);
  assert.ok(moved.maps[key] && !moved.maps["planet:keyed"], "the map moved");
  assert.equal(moved.patches[key].names["burg:3"], "Town", "with its notes");
  assert.equal(moved.maps["city:keyed/burg-3"].parent, key, "and its children follow");
  assert.equal(moved.last.byLevel.city, "city:keyed/burg-3");
  assert.equal(rekey(moved), moved, "a moved world stays put");
  assert.deepEqual(resolve(moved, "planet:keyed", { seed: "keyed" }), { seed: "keyed" }, "a top map has no overrides");
});

test("a link meets again the child it opened last, whatever its key's print", () => {
  let world = emptyWorld({ id: "w3", name: "Links", top: "galaxy", now: 1 });
  world = visit(world, "galaxy:g", { level: "galaxy", parent: null, step: null, title: "G", base: null, params: { seed: "g" } }, 2);
  world = visit(world, "planet:p~a", { level: "planet", parent: "galaxy:g", step: { entity: "star:1" }, title: "P", base: { seed: "p", cells: 4000 }, params: { seed: "p", cells: 4000 } }, 3);
  world = visit(world, "planet:p~b", { level: "planet", parent: "galaxy:g", step: { entity: "star:1" }, title: "P", base: { seed: "p", cells: 4000 }, params: { seed: "p", cells: 4000, template: "pangea" } }, 4);
  assert.equal(resolve(world, "planet:p", { seed: "p", cells: 4000 }).template, "pangea");
});

test("the universe and the underworld wear the GM's names", () => {
  const universe = generateUniverse({ seed: "names", galaxies: 40 });
  const named = renameUniverse(universe, { world: "All", "galaxy:2": "Home" });
  assert.equal(named.name, "All");
  assert.equal(named.galaxies[2].name, "Home");
  const below = generateUnderworld(planet);
  const deep = renameUnderworld(below, { "cavern:1": "Hall" });
  assert.equal(deep.caverns[1].name, "Hall");
  assert.notEqual(below.caverns[1].name, "Hall", "the generated world is untouched");
});

test("a building a quarter close-up only enlarges opens as the building of the whole city", () => {
  const made = generateCity(city.params, city.language);
  const ward = made.wards.find((w) => w.urban && !["plaza", "temple", "castle", "park", "cemetery", "arcology"].includes(w.kind) && made.buildings.some((b) => b.ward === w.id))!;
  const close = generateDistrict(made, ward.id);
  const copy = close.buildings.findIndex((b) => b.origin !== undefined);
  assert.ok(copy >= 0, "the neighbours are copies of the city's buildings");
  const origin = close.buildings[copy].origin!;
  assert.equal(made.buildings[origin].ward, close.buildings[copy].ward);
  assert.equal(buildingFromCity(made, origin).seed, `${made.params.seed}/building-${origin}`);
  assert.ok(close.buildings.some((b) => b.origin === undefined), "the quarter's own lots are new");
});

test("two copies of one world merge: names and notes of both, pins of both, fog revealed by either", () => {
  const base = { ...emptyWorld({ id: "m", name: "M", top: "planet", now: 1 }), patches: { "planet:a": { ...emptyPatch(), names: { "burg:1": "Old" }, notes: { "burg:2": "mine" }, pins: [{ id: "p1", x: 1, y: 1, label: "", note: "", color: "#d64545", hidden: false }], fog: { enabled: true, revealed: [[1, 1, 5]] as [number, number, number][] } } } };
  const incoming = { ...emptyWorld({ id: "m", name: "M", top: "planet", now: 2 }), patches: { "planet:a": { ...emptyPatch(), names: { "burg:1": "New", "burg:3": "Third" }, notes: {}, pins: [{ id: "p2", x: 2, y: 2, label: "", note: "", color: "#d64545", hidden: false }], fog: { enabled: false, revealed: [[9, 9, 5]] as [number, number, number][] } } } };
  const merged = mergeWorlds(base, incoming).patches["planet:a"];
  assert.deepEqual(merged.names, { "burg:1": "New", "burg:3": "Third" });
  assert.equal(merged.notes["burg:2"], "mine");
  assert.deepEqual(merged.pins.map((pin) => pin.id), ["p1", "p2"]);
  assert.equal(merged.fog.enabled, true);
  assert.equal(merged.fog.revealed.length, 2);
});

console.log(`world: ${passed} regressions passed`);
