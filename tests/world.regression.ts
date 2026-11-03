// Worlds: the tree of maps, parameters handed down with the GM's overrides on top, names flowing up. Run with `npm test`.
import assert from "node:assert/strict";
import { buildingFromCity, cityFromBurg, emptyPatch, emptyWorld, generateCity, generatePlanet, levelsOf, nameUp, overridesOf, pathTo, readWorld, resolve, rootOf, settingAt, SETTINGS, visit, type WorldDoc } from "../src/core/index";

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

function planetWorld(): WorldDoc {
  let world = emptyWorld({ id: "w1", name: "Test", top: "planet", now: 1 });
  world = visit(world, `planet:${planet.params.seed}`, { level: "planet", parent: null, step: null, title: planet.name, base: null, params: asRecord(planet.params) }, 2);
  world = visit(world, `city:${city.params.seed}`, { level: "city", parent: `planet:${planet.params.seed}`, step: { entity: `burg:${burg.id}` }, title: burg.name, base: asRecord(city.params), params: asRecord(city.params), language: city.language }, 3);
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
  assert.equal(rootOf(world)![0], `planet:${planet.params.seed}`);
  assert.deepEqual(pathTo(world, `city:${city.params.seed}`).map(([key]) => key), [`planet:${planet.params.seed}`, `city:${city.params.seed}`]);
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
  assert.equal(nameUp(renamed, key, undefined).patches[`planet:${planet.params.seed}`].names[`burg:${burg.id}`], "Newport");
});

test("a world survives a file, and a file that is not a world is refused", () => {
  const world = planetWorld();
  const back = readWorld(JSON.parse(JSON.stringify(world)));
  assert.equal(JSON.stringify(back), JSON.stringify(world));
  assert.throws(() => readWorld({ format: "new-world-atlas/campaign", version: 1, maps: {} }), /not a world/u);
  assert.throws(() => readWorld({ ...world, version: 9 }), /version/u);
});

console.log(`world: ${passed} regressions passed`);
