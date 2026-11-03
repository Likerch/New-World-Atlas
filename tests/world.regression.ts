// Worlds: the tree of maps, parameters handed down with the GM's overrides on top, names flowing up. Run with `npm test`.
import assert from "node:assert/strict";
import { GENERATOR, generateRegion, generateGalaxy, generateLocal, planetToJson, hashString, emptyPage, handbookMarkdown, markdown, pageKey, searchWorld, mergeWorlds, mapKeyOf, rekey, planetParams, generateUniverse, renameUniverse, generateUnderworld, renameUnderworld, generateDistrict, buildingFromCity, cityFromBurg, cityParams, generateBuilding, emptyPatch, emptyWorld, generateCity, generatePlanet, levelsOf, nameUp, overridesOf, pathTo, readWorld, resolve, rootOf, settingAt, SETTINGS, visit, type WorldDoc } from "../src/core/index";

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
const CITY = mapKeyOf("city", asRecord(city.params));

function planetWorld(): WorldDoc {
  let world = emptyWorld({ id: "w1", name: "Test", top: "planet", now: 1 });
  world = visit(world, PLANET, { level: "planet", parent: null, step: null, title: planet.name, base: null, params: asRecord(planet.params) }, 2);
  world = visit(world, CITY, { level: "city", parent: PLANET, step: { entity: `burg:${burg.id}` }, title: burg.name, base: asRecord(city.params), params: asRecord(city.params), language: city.language }, 3);
  return world;
}

test("a world shows its top map and everything reachable below it, nothing above", () => {
  const sorted = (list: string[]) => [...list].sort();
  assert.deepEqual(sorted(levelsOf("planet")), sorted(["planet", "region", "underworld", "city", "building", "local"]));
  // A city leads into its buildings and halls; a building's cellar into a dungeon.
  assert.deepEqual(sorted(levelsOf("city")), sorted(["city", "building", "local"]));
  assert.deepEqual(sorted(levelsOf("building")), sorted(["building", "local"]));
  assert.equal(levelsOf("universe").length, 9);
  assert.ok(!levelsOf("building").includes("planet") && !levelsOf("city").includes("region"), "nothing above");
});

test("maps hang in a tree from the top; the path down is the breadcrumb", () => {
  const world = planetWorld();
  assert.equal(rootOf(world)![0], PLANET);
  assert.deepEqual(pathTo(world, CITY).map(([key]) => key), [PLANET, CITY]);
  assert.equal(world.last.byLevel.city, CITY);
});

test("the GM's overrides survive a new hand-down from the parent and reach the map's children", () => {
  let world = planetWorld();
  const key = CITY;
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
  const key = CITY;
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

test("a town or a house grown another way keys its own notes; old worlds move them, their close-ups, sheets and pages", () => {
  const own = cityParams({ seed: "town" });
  assert.equal(mapKeyOf("city", asRecord(own)), "city:town", "a seed's own town keeps the plain key");
  const other = mapKeyOf("city", asRecord({ ...own, era: own.era === "medieval" ? "industrial" : "medieval" }));
  assert.match(other, /^city:town~/u, "another age is another town");
  assert.notEqual(mapKeyOf("city", asRecord({ ...own, population: own.population * 2 })), "city:town", "so is another size");
  assert.equal(mapKeyOf("city", asRecord({ ...own, name: "Elsewhere", custom: { wards: [], places: [] } })), "city:town", "a name or the GM's kinds are not");
  const town = cityFromBurg(planet, burg.id).params;
  const renamed = { ...town, roads: (town.roads ?? []).map((road) => ({ ...road, to: "Renamed" })), ...(town.faith ? { faith: { ...town.faith, name: "Renamed", deity: "Renamed" } } : {}) };
  assert.equal(mapKeyOf("city", asRecord(renamed)), CITY, "renaming the towns a road leads to, or the church, keeps the town's key");
  const house = generateBuilding({ seed: "house", type: "manor" }).params;
  const BUILDING = mapKeyOf("building", asRecord(house));
  assert.equal(mapKeyOf("building", asRecord({ ...house, name: "Hall", street: "Elm", house: 3, owner: { key: "k", role: "noble" } })), BUILDING, "an address or an owner is not another house");
  assert.notEqual(mapKeyOf("building", asRecord({ ...house, floors: house.floors + 1 })), BUILDING, "another floor is");

  // A world saved when towns and houses were keyed by their seeds alone.
  const params = asRecord(town);
  let world = emptyWorld({ id: "w4", name: "Old towns", top: "planet", now: 1 });
  world = visit(world, PLANET, { level: "planet", parent: null, step: null, title: "P", base: null, params: asRecord(planet.params) }, 2);
  world = visit(world, `city:${town.seed}`, { level: "city", parent: PLANET, step: { entity: `burg:${burg.id}` }, title: "T", base: params, params }, 3);
  world = visit(world, `building:${house.seed}`, { level: "building", parent: `city:${town.seed}`, step: { entity: "building:5" }, title: "H", base: asRecord(house), params: asRecord(house) }, 4);
  world = {
    ...world,
    patches: { [`city:${town.seed}`]: { ...emptyPatch(), names: { "ward:2": "Old Quay" } }, [`city:${town.seed}/ward-2`]: { ...emptyPatch(), notes: { "building:block-0-1": "a forger" } }, [`building:${house.seed}#floor-1`]: { ...emptyPatch(), notes: { "room:1:2": "a ghost" } }, [`building:${house.seed}`]: { ...emptyPatch(), names: { world: "Hall" } } },
    pages: { [`city:${town.seed}|city:${town.seed}/ward-2/building:block-0-1`]: { ...emptyPage(`city:${town.seed}`, `city:${town.seed}/ward-2/building:block-0-1`, "Forge"), text: "Coins" } },
  };
  const moved = rekey(world);
  assert.ok(moved.maps[CITY] && !moved.maps[`city:${town.seed}`], "the town moved to its printed key");
  assert.equal(moved.maps[BUILDING]?.parent, CITY, "and the house under it, hanging from it");
  assert.equal(moved.patches[CITY].names["ward:2"], "Old Quay");
  assert.equal(moved.patches[`${CITY}/ward-2`]?.notes["building:block-0-1"], "a forger", "a quarter up close follows its town");
  assert.equal(moved.patches[`${BUILDING}#floor-1`]?.notes["room:1:2"], "a ghost", "a floor's sheet follows its house");
  assert.equal(moved.patches[BUILDING].names.world, "Hall");
  const page = moved.pages![`${CITY}|${CITY}/ward-2/building:block-0-1`];
  assert.equal(page?.text, "Coins", "a page on a close-up's house follows its town");
  assert.equal(page.entity, `${CITY}/ward-2/building:block-0-1`);
  assert.equal(rekey(moved), moved, "a moved world stays put");
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

test("a place has one handbook page at every scale; pages are safe Markdown, found by the search", () => {
  const world = planetWorld();
  const cityKey = CITY;
  assert.equal(pageKey(world, cityKey, "world"), `${PLANET}|burg:${burg.id}`, "a city's page is its town's page on the planet");
  assert.equal(pageKey(world, cityKey, "ward:3"), `${cityKey}|ward:3`);
  const html = markdown(["# Port", "The **old** quay, see [[Harbour Gate]].", "- <script>alert(1)</script>"].join("\n"));
  assert.match(html, /<h3>Port<\/h3>/u);
  assert.match(html, /data-page="Harbour Gate"/u);
  assert.doesNotMatch(html, /<script>/u, "a page cannot carry markup of its own");
  const key = pageKey(world, cityKey, "world");
  const page = { ...emptyPage(PLANET, `burg:${burg.id}`, burg.name), text: "Smugglers meet at the quay.", secret: "The mayor is one of them.", tags: ["port"] };
  const withPage = { ...world, pages: { [key]: page }, patches: { [PLANET]: { ...emptyPatch(), names: { "burg:9": "Gullhaven" }, notes: { "burg:9": "a lighthouse keeper owes the party" } } } };
  assert.equal(searchWorld(withPage, "smugglers")[0].page, key);
  assert.ok(searchWorld(withPage, "gullhaven").some((found) => found.kind === "name"));
  assert.ok(searchWorld(withPage, "lighthouse").some((found) => found.kind === "note"));
  assert.doesNotMatch(handbookMarkdown(withPage, false), /mayor/u, "the players' handbook keeps the GM's secrets");
  assert.match(handbookMarkdown(withPage, true), /mayor/u);
});

test("golden prints: the generator draws the same maps until its version says otherwise", () => {
  // A change to what the generator draws must come with a new GENERATOR (the app then tells the GM the old maps were
  // made by an older one) and new prints here.
  const golden = { generator: "2026.11.3", planet: 572519043, region: 3247591320, galaxy: 2739417600, local: 4248020585 };
  const planet = generatePlanet({ seed: "golden", template: "continents", cells: 4000 });
  const region = generateRegion(planet, planet.provinces.slice(1).sort((a, b) => b.cells - a.cells)[0].id, 4000);
  const galaxy = generateGalaxy({ seed: "golden" });
  const local = generateLocal({ seed: "golden", kind: "dungeon" });
  const print = (value: unknown) => hashString(JSON.stringify(value));
  const now = { generator: GENERATOR, planet: print(planetToJson(planet)), region: print(planetToJson(region)), galaxy: print(galaxy.stars.map((s) => [s.name, s.x, s.y, s.feature ?? ""])), local: print(local.keyed.map((room) => room.id)) };
  assert.deepEqual(now, golden, now.generator === golden.generator ? "the maps changed: bump GENERATOR and the prints" : "a new GENERATOR: update the prints");
});

test("review fixes: a dungeon's next floor keeps the world, a bad file is mended, notes and pages follow new keys", () => {
  let crypt = emptyWorld({ id: "w9", name: "Crypt", top: "local", now: 1 });
  crypt = visit(crypt, "local:c", { level: "local", parent: null, step: null, title: "Crypt", base: null, params: { seed: "c" } }, 2);
  crypt = visit(crypt, "local:c/depth-2", { level: "local", parent: "local:c", step: { entity: "depth:2" }, title: "Crypt", base: null, params: { seed: "c/depth-2" } }, 3);
  crypt = visit(crypt, "local:c", { level: "local", parent: null, step: null, title: "Crypt", base: null, params: { seed: "c" } }, 4);
  assert.ok(crypt.maps["local:c"] && crypt.maps["local:c/depth-2"], "going back up dropped the floor below");
  crypt = visit(crypt, "local:c/depth-2", { level: "local", parent: null, step: null, title: "Crypt", base: null, params: { seed: "c/depth-2" } }, 5);
  assert.equal(crypt.maps["local:c/depth-2"].parent, "local:c", "a floor met again lost its place under the top");
  assert.ok(crypt.maps["local:c"], "the top was dropped");

  const world = planetWorld();
  const bad = JSON.parse(JSON.stringify(world));
  bad.last = { key: "nowhere" };
  bad.maps["x:1"] = { level: "dragon", params: {} };
  bad.pages = { "p|1": { map: "p", entity: "1", text: 5, image: 'x" onerror="alert(1)' } };
  const mended = readWorld(bad);
  assert.equal(mended.last.key, null);
  assert.deepEqual(mended.last.byLevel, {});
  assert.ok(!mended.maps["x:1"], "a map of no level was kept");
  assert.equal(mended.pages!["p|1"].text, "");
  assert.deepEqual(mended.pages!["p|1"].tags, []);
  assert.equal(mended.pages!["p|1"].image, undefined, "a picture that is not image data was kept");

  const fogged = { ...world, patches: { "planet:x": { ...emptyPatch(), fog: { enabled: true, revealed: [[1, 2, 3], [4, 5, 6]] as [number, number, number][] } } } };
  const twice = mergeWorlds(mergeWorlds(fogged, fogged), fogged);
  assert.equal(twice.patches["planet:x"].fog.revealed.length, 2, "merging the same world doubled its fog");

  const plain = planetParams({ seed: "pages" });
  const params = asRecord({ ...plain, cells: 3000 });
  let old = emptyWorld({ id: "w3", name: "Old", top: "planet", now: 1 });
  old = visit(old, "planet:pages", { level: "planet", parent: null, step: null, title: "P", base: null, params }, 2);
  old = visit(old, "city:pages/burg-3", { level: "city", parent: "planet:pages", step: { entity: "burg:3" }, title: "T", base: {}, params: {} }, 3);
  old = { ...old, patches: { "underworld:pages/underworld": { ...emptyPatch(), names: { "cavern:1": "Deep" } } }, pages: { "planet:pages|burg:3": { ...emptyPage("planet:pages", "burg:3", "T"), text: "A town" } } };
  const moved = rekey(old);
  const key = mapKeyOf("planet", params);
  assert.equal(moved.pages![`${key}|burg:3`]?.text, "A town", "a handbook page stayed on the old key");
  assert.equal(moved.pages![`${key}|burg:3`].map, key);
  assert.ok(moved.patches[`underworld:${key.slice("planet:".length)}/underworld`], "the underworld's notes stayed behind");
  assert.ok(moved.maps["city:pages/burg-3"], "a city's key (made from the seed alone) was moved");
});

console.log(`world: ${passed} regressions passed`);
