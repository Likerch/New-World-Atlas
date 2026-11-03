// Region regressions: run with `npm test`.
import assert from "node:assert/strict";
import { SETTINGS, armsOf, cityFromBurg, generateCity, generateCountry, generatePlanet, generateRegion, generateUnderworld, renderPlanet, renderUnderworld } from "../src/core/index";

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

const planet = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
const province = planet.provinces.slice(1).sort((a, b) => b.cells - a.cells)[0];
const region = generateRegion(planet, province.id, 5000);

test("a region keeps the planet's towns, adds villages and stays on land", () => {
  const towns = planet.burgs.filter((burg) => burg.province === province.id);
  for (const town of towns) assert.ok(region.burgs.some((burg) => burg.name === town.name), `${town.name} is missing`);
  assert.ok(region.burgs.length - 1 > towns.length, "villages were added");
  for (const burg of region.burgs.slice(1)) assert.ok(!region.water[burg.cell], `${burg.name} is in the water`);
  assert.ok(region.routes.length > 1, "roads join the settlements");
});

test("a region is reproducible and draws cleanly", () => {
  const again = generateRegion(planet, province.id, 5000);
  assert.deepEqual(again.burgs.map((b) => b.name), region.burgs.map((b) => b.name));
  assert.doesNotMatch(renderPlanet(region, { theme: "political", layers: { provinces: true } }), /NaN|undefined|Infinity/u);
});

test("a village of a region opens as a small town", () => {
  const village = region.burgs.slice(1).find((burg) => burg.population < 1)!;
  const { params, language } = cityFromBurg(region, village.id, "medieval");
  const city = generateCity(params, language);
  assert.equal(city.name, village.name);
  assert.ok(city.wards.filter((ward) => ward.urban).length <= 12);
});

test("a whole country opens up close with all its towns", () => {
  const state = planet.states.slice(1).sort((a, b) => b.cells - a.cells)[0];
  const country = generateCountry(planet, state.id, 6000);
  assert.equal(country.name, state.name);
  for (const town of planet.burgs.filter((burg) => burg.state === state.id)) assert.ok(country.burgs.some((burg) => burg.name === town.name), `${town.name} is missing`);
});

test("the underworld is one connected web with ways down from the surface", () => {
  const world = generateUnderworld(planet);
  assert.ok(world.caverns.length > 20, "caverns were placed");
  const parent = world.caverns.map((_, k) => k);
  const root = (k: number): number => (parent[k] === k ? k : (parent[k] = root(parent[k])));
  for (const [a, b] of world.tunnels) parent[root(a)] = root(b);
  assert.equal(new Set(world.caverns.map((c) => root(c.id))).size, 1, "every cavern is reachable");
  for (const entrance of world.entrances) assert.ok(world.caverns[entrance.cavern], "an entrance leads to a cavern");
  assert.ok(world.caverns.some((c) => c.kind === "settlement" && c.people), "the deep peoples live somewhere");
  assert.deepEqual(generateUnderworld(planet).caverns.map((c) => c.name), world.caverns.map((c) => c.name));
  assert.doesNotMatch(renderUnderworld(world, planet), /NaN|undefined|Infinity/u);
});

test("a close-up keeps its realms' and towns' arms", () => {
  assert.deepEqual(armsOf(region, "state", province.state), armsOf(planet, "state", province.state));
  const town = region.burgs.slice(1).find((burg) => burg.origin !== undefined)!;
  assert.deepEqual(armsOf(region, "burg", town.id), armsOf(planet, "burg", town.origin!));
});

test("a region's names do not depend on what was opened before, and no two villages share one", () => {
  const names = (made: typeof region) => [made.burgs, made.rivers, made.markers].map((items) => items.map((item) => item.name));
  const first = names(generateRegion(planet, province.id, 5000));
  for (const other of planet.provinces.slice(1, 6)) generateRegion(planet, other.id, 5000);
  generateUnderworld(planet);
  assert.deepEqual(names(generateRegion(planet, province.id, 5000)), first);
  const villages = region.burgs.slice(1).filter((burg) => burg.origin === undefined).map((burg) => burg.name);
  assert.equal(new Set(villages).size, villages.length, "village names repeat");
});

test("each province of a region keeps its centre, the capital's too", () => {
  const state = planet.states.slice(1).sort((a, b) => b.cells - a.cells)[0];
  const country = generateCountry(planet, state.id, 6000);
  for (const p of country.provinces.slice(1)) {
    const origin = planet.provinces.find((item) => item.name === p.name)!;
    if (!origin?.burg || planet.burgs[origin.burg].removed) continue;
    assert.equal(country.burgs[p.burg]?.origin, origin.burg, `${p.name} lost its centre`);
  }
});

test("a town opened from a region is the town opened from the planet; a hamlet stays a hamlet", () => {
  const town = planet.burgs.find((burg) => burg.province === province.id && !burg.removed)!;
  const copy = region.burgs.find((burg) => burg.origin === town.id)!;
  const fromPlanet = cityFromBurg(planet, town.id, "medieval");
  const fromRegion = cityFromBurg(region, copy.id, "medieval");
  assert.equal(fromRegion.params.seed, fromPlanet.params.seed);
  assert.equal(generateCity(fromRegion.params, fromRegion.language).name, generateCity(fromPlanet.params, fromPlanet.language).name);
  const hamlet = region.burgs.slice(1).find((burg) => burg.origin === undefined && burg.population < 0.5);
  if (hamlet) assert.ok(cityFromBurg(region, hamlet.id, "medieval").params.population < 0.5, "a hamlet opened as a town");
});

test("a close-up counts airports and airways by the realms in its frame", () => {
  const modern = generatePlanet({ seed: "regression", template: "continents", cells: 6000, setting: SETTINGS.modern });
  const small = modern.provinces.slice(1).sort((a, b) => b.cells - a.cells)[0];
  const close = generateRegion(modern, small.id, 5000);
  const realms = new Set(close.burgs.slice(1).map((burg) => burg.state)).size;
  assert.ok(close.markers.filter((m) => m.kind === "airport").length <= realms + 4 + 2, "airports for the whole planet");
  assert.ok(close.routes.filter((r) => r.kind === "air").length <= realms + 6 + 2, "airways for the whole planet");
});

test("cities of their own speak tongues of their own", () => {
  const a = generateCity({ seed: "tongue-a", era: "medieval" });
  const b = generateCity({ seed: "tongue-b", era: "medieval" });
  const streets = (city: typeof a) => city.streets.map((street) => street.name).filter(Boolean).join(" ");
  assert.notEqual(streets(a).slice(0, 40), streets(b).slice(0, 40));
  assert.equal(generateCity({ seed: "tongue-a", era: "medieval" }).name, a.name, "and the same seed speaks the same");
});

console.log(`region: ${passed} regressions passed`);
