// Worlds: the tree of maps, parameters handed down with the GM's overrides on top, names flowing up. Run with `npm test`.
import assert from "node:assert/strict";
import { GENERATOR, generateRegion, generateGalaxy, generateLocal, planetToJson, hashString, emptyPage, handbookMarkdown, markdown, pageKey, searchWorld, mergeWorlds, mapKeyOf, rekey, planetParams, generateUniverse, renameUniverse, generateUnderworld, renameUnderworld, generateDistrict, buildingFromCity, cityFromBurg, emptyPatch, emptyWorld, generateCity, generatePlanet, levelsOf, nameUp, overridesOf, pathTo, readWorld, resolve, rootOf, settingAt, SETTINGS, visit, type WorldDoc } from "../src/core/index";

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

test("a place has one handbook page at every scale; pages are safe Markdown, found by the search", () => {
  const world = planetWorld();
  const cityKey = `city:${city.params.seed}`;
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
  const golden = { generator: "2026.11.3", planet: 572519043, region: 81653941, galaxy: 2739417600, local: 4248020585 };
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

test("a cavern's map keeps its key when a neighbour is renamed or the world's magic changes; old keys move", () => {
  const exits = (to: string) => [{ dir: 2, kind: "passage", to }, { dir: 5, kind: "river", to: "Deepwater" }];
  const base = { seed: "p/underworld/cavern-4", kind: "cave", theme: "lair", levels: 1, origin: { kind: "cavern", facts: {} } };
  const key = mapKeyOf("local", { ...base, exits: exits("Old Hall") });
  assert.equal(mapKeyOf("local", { ...base, exits: exits("New Hall") }), key, "a neighbour's new name made another map");
  assert.equal(mapKeyOf("local", { ...base, exits: exits("Old Hall"), magic: 2 }), key, "the world's magic made another map");
  assert.notEqual(mapKeyOf("local", { ...base, exits: [{ dir: 3, kind: "passage", to: "Old Hall" }] }), key, "a tunnel the other way is another map");
  // A world saved with the old prints: the map opened last takes the new key with its notes; the other keeps its own.
  let world = emptyWorld({ id: "w10", name: "Deep", top: "local", now: 1 });
  world = visit(world, "local:p/underworld/cavern-4~old1", { level: "local", parent: null, step: null, title: "Hall", base: null, params: { ...base, exits: exits("Old Hall") } }, 2);
  world = { ...world, maps: { ...world.maps, "local:p/underworld/cavern-4~old2": { ...world.maps["local:p/underworld/cavern-4~old1"], params: { ...base, exits: exits("New Hall"), magic: 2 }, opened: 3 } } };
  world = { ...world, patches: { "local:p/underworld/cavern-4~old1": { ...emptyPatch(), notes: { "keyed:1": "first" } }, "local:p/underworld/cavern-4~old2": { ...emptyPatch(), notes: { "keyed:1": "second" } }, "local:p/underworld/cavern-4~old2/room-1": { ...emptyPatch(), notes: { x: "scene" } } } };
  const moved = rekey(world);
  assert.equal(moved.patches[key]?.notes["keyed:1"], "second", "the map opened last lost its notes");
  assert.equal(moved.patches["local:p/underworld/cavern-4~old1"]?.notes["keyed:1"], "first", "the other map's notes were dropped");
  assert.equal(moved.patches[`${key}/room-1`]?.notes.x, "scene", "a room's scene stayed behind");
  assert.ok(moved.maps[key] && moved.maps["local:p/underworld/cavern-4~old1"]);
});

console.log(`world: ${passed} regressions passed`);
