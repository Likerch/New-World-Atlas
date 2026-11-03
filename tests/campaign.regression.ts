// GM-layer regressions: run with `npm test`.
import assert from "node:assert/strict";
import { translator } from "../src/app/i18n";
import { readCampaign, readWorld, planetParams, emptyPatch, generateCity, generatePlanet, overlaySvg, renameCity, renamePlanet, renderPlanet, withOverlay } from "../src/core/index";

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

test("renames reach the map and leave the generated world untouched", () => {
  const planet = generatePlanet({ seed: "gm", cells: 3000 });
  const original = planet.states[1].name;
  const shown = renamePlanet(planet, { "state:1": "Free March", world: "Terra" });
  assert.equal(shown.states[1].name, "Free March");
  assert.equal(shown.name, "Terra");
  assert.equal(planet.states[1].name, original, "the generated planet is not changed");
  assert.match(renderPlanet(shown), /FREE MARCH/u);
  assert.equal(renamePlanet(planet, {}), planet, "no renames, no copy");
  const city = generateCity({ seed: "gm-city", era: "medieval" });
  assert.equal(renameCity(city, { [`ward:${city.wards[0].id}`]: "Old Docks" }).wards[0].name, "Old Docks");
});

test("players do not see hidden pins, and their fog is opaque", () => {
  const patch = { ...emptyPatch(), pins: [{ id: "a", x: 10, y: 10, label: "Camp", note: "", color: "#d64545", hidden: false }, { id: "b", x: 20, y: 20, label: "Secret lair", note: "", color: "#1d1d1d", hidden: true }], fog: { enabled: true, revealed: [[50, 50, 30]] as [number, number, number][] } };
  const gm = overlaySvg(patch, 100, 100, false);
  const players = overlaySvg(patch, 100, 100, true);
  assert.match(gm, /Secret lair/u);
  assert.doesNotMatch(players, /Secret lair/u);
  assert.match(players, /Camp/u);
  assert.match(players, /opacity="1" mask/u);
  assert.match(gm, /opacity="0.55" mask/u);
  const exported = withOverlay("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"></svg>", players, 100, 100);
  assert.match(exported, /^<svg[^>]*><svg x="0" y="0"/u);
});

test("a file that is not a campaign is refused; a patch without fog is made whole; a pin cannot smuggle markup", () => {
  assert.throws(() => readCampaign({ format: "something-else" }));
  const read = readCampaign({ format: "new-world-atlas/campaign", version: 1, maps: { "planet:x": { names: { world: "X" } } } });
  assert.deepEqual(read.maps["planet:x"].fog, { enabled: false, revealed: [] });
  assert.deepEqual(read.maps["planet:x"].pins, []);
  const svg = overlaySvg({ ...emptyPatch(), pins: [{ id: "p", x: 10, y: 10, label: "<b>", note: "", color: '"/><script>alert(1)</script>', hidden: false }] }, 100, 100, false);
  assert.doesNotMatch(svg, /<script|<b>/u);
  const world = readWorld({ format: "new-world-atlas/world", version: 1, id: "w", name: "W", top: "planet", patches: { "city:c": { names: {} } } });
  assert.equal(world.patches["city:c"].fog.enabled, false);
  const north = planetParams({ seed: "turned", latitudeNorth: -20, latitudeSouth: 40 });
  assert.ok(north.latitudeNorth > north.latitudeSouth, "north stays north of south");
});

test("words agree with their numbers, and numbers are written the reader's way", () => {
  const ru = translator("ru");
  assert.match(ru("stats.summary", { states: 262, burgs: 4, rivers: 1 }), /262 государства · 4 города · 1 река/u);
  assert.match(ru("building.summary", { rooms: 5, floors: 4, w: 10, d: 8 }), /5 комнат · 4 этажа/u);
  assert.match(ru("world.size", { w: 3100, h: 12 }), /3\s100/u);
  assert.match(translator("en")("galaxy.summary", { stars: 1, empires: 2, lanes: 3 }), /1 star · 2 powers · 3 hyperlanes/u);
});

console.log(`campaign: ${passed} regressions passed`);
