// Region regressions: run with `npm test`.
import assert from "node:assert/strict";
import { cityFromBurg, generateCity, generateCountry, generatePlanet, generateRegion, generateUnderworld, renderPlanet, renderUnderworld } from "../src/core/index";

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

console.log(`region: ${passed} regressions passed`);
