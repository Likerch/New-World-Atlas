// GM-layer regressions: run with `npm test`.
import assert from "node:assert/strict";
import { emptyPatch, generateCity, generatePlanet, overlaySvg, renameCity, renamePlanet, renderPlanet, withOverlay } from "../src/core/index";

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

console.log(`campaign: ${passed} regressions passed`);
