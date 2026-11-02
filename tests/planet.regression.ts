// Planet-level regressions: run with `npm test`.
import assert from "node:assert/strict";
import { createLanguage, createRng, armsOf, coatOfArms, editPlanet, emptyEdits, generatePlanet, globePick, METALS, name, raiseArmies, renderCoatOfArms, renderGlobe, planetToJson, renderPlanet, TEMPLATES, THEMES, toCyrillic, SEA_LEVEL } from "../src/core/index";

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

test("the same seed and settings give the same world; another seed gives another", () => {
  const again = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
  assert.equal(JSON.stringify(planetToJson(again)), JSON.stringify(planetToJson(planet)));
  const other = generatePlanet({ seed: "regression-2", template: "continents", cells: 6000 });
  assert.notEqual(JSON.stringify(planetToJson(other).cells.height), JSON.stringify(planetToJson(planet).cells.height));
});

test("every template makes a world with both land and sea", () => {
  for (const template of TEMPLATES) {
    const world = generatePlanet({ seed: `land-${template}`, template, cells: 3000 });
    let land = 0;
    for (let cell = 0; cell < world.mesh.cells; cell++) if (!world.water[cell]) land++;
    const share = land / world.mesh.cells;
    assert.ok(share > 0.04 && share < 0.85, `${template}: ${(share * 100).toFixed(0)}% land`);
  }
});

test("water runs downhill to the sea or a lake, and every river is a chain of neighbours", () => {
  assert.ok(planet.rivers.length > 5, "a continent has rivers");
  for (const river of planet.rivers.slice(1)) {
    for (let k = 1; k < river.cells.length; k++) {
      assert.ok(planet.mesh.neighbors[river.cells[k - 1]].includes(river.cells[k]), `${river.name} skips a cell`);
      assert.ok(!planet.water[river.cells[k]], `${river.name} runs through water`);
    }
    const first = planet.height[river.cells[0]];
    const last = planet.height[river.cells[river.cells.length - 1]];
    assert.ok(last <= first + 1, `${river.name} climbs from ${first} to ${last}`);
    if (river.parent) assert.ok(planet.rivers[river.parent], `${river.name} flows into a missing river`);
  }
});

test("land has a biome, a state and people; water has none", () => {
  for (let cell = 0; cell < planet.mesh.cells; cell++) {
    if (planet.water[cell]) {
      assert.equal(planet.biome[cell], 0);
      assert.equal(planet.state[cell], 0);
      continue;
    }
    assert.ok(planet.biome[cell] > 0, `land cell ${cell} without a biome`);
    if (planet.height[cell] < SEA_LEVEL) assert.fail(`land below sea level at ${cell}`);
  }
});

test("towns stand on land; capitals rule their states; relations are mutual", () => {
  for (const burg of planet.burgs.slice(1)) {
    assert.ok(!planet.water[burg.cell], `${burg.name} is in the water`);
    assert.equal(burg.state, planet.state[burg.cell]);
    if (burg.capital) assert.equal(planet.states[burg.state].capital, burg.id);
  }
  for (const state of planet.states.slice(1)) {
    for (const other of state.neighbors) {
      const there = planet.states[other].relations[state.id];
      const here = state.relations[other];
      assert.ok(here && there, `${state.name} and ${planet.states[other].name} lack a relation`);
      if (here === "vassal") assert.equal(there, "suzerain");
    }
  }
  for (let cell = 0; cell < planet.mesh.cells; cell++) {
    const province = planet.province[cell];
    if (province) assert.equal(planet.provinces[province].state, planet.state[cell], `province ${province} crosses a border`);
  }
});

test("languages give unique names and spell them in Cyrillic", () => {
  const language = createLanguage(createRng("tongue"));
  const rng = createRng("names");
  const names = Array.from({ length: 60 }, () => name(language, rng, "town"));
  assert.equal(new Set(names).size, names.length);
  assert.equal(toCyrillic("Eldor"), "Элдор");
  assert.equal(toCyrillic("Shavarkh Tse"), "Шаварх Це");
  assert.equal(toCyrillic("Yuma-Zhel"), "Юма-Жел");
});

test("every style renders a complete SVG without broken numbers", () => {
  for (const theme of THEMES) {
    const svg = renderPlanet(planet, { theme, script: theme === "night" ? "cyrillic" : "latin", highlight: { kind: "state", id: 1 } });
    assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/u, theme);
  }
});

test("the globe turns to any side and a click finds the place under it", () => {
  const { width, height, latitudeNorth, latitudeSouth } = planet.params;
  const centre = globePick(planet, 500, 500, { lon: 0, lat: (latitudeNorth + latitudeSouth) / 2 })!;
  assert.ok(Math.abs(centre[0] - width / 2) < 1 && Math.abs(centre[1] - height / 2) < 1, `the centre of the globe is the centre of the map, not ${centre}`);
  assert.equal(globePick(planet, 2, 2), null, "a corner is off the sphere");
  assert.equal(globePick(planet, 500, 500, { lon: 180, lat: 0 }), null, "the far side of the world is uncharted");
  for (const [lon, lat] of [[0, 0], [60, 30], [180, -60], [-120, 90]]) assert.doesNotMatch(renderGlobe(planet, { lon, lat, mark: [width / 2, height / 2] }), /NaN|undefined|Infinity/u);
});

test("every settled land keeps a faith, and churches hold their holy cities", () => {
  for (let cell = 0; cell < planet.mesh.cells; cell++) if (!planet.water[cell] && planet.culture[cell]) assert.ok(planet.religion[cell], `cell ${cell} has no faith`);
  const churches = planet.religions.filter((faith) => faith.kind === "organized");
  assert.ok(churches.length >= 1, "a church arose");
  for (const church of churches) assert.equal(planet.religion[planet.burgs[church.center].cell], church.id, `${church.name} lost its holy city`);
  for (const heresy of planet.religions.filter((faith) => faith.kind === "heresy")) assert.equal(planet.religions[heresy.parent].kind, "organized");
  const again = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
  assert.deepEqual(Array.from(again.religion), Array.from(planet.religion));
});

test("arms keep metal off metal, follow their realm and draw cleanly", () => {
  for (let k = 0; k < 200; k++) {
    const arms = coatOfArms(`arms-${k}`);
    if (arms.division === "plain" && arms.ordinary === "none") {
      assert.ok(arms.charge, "a bare field bears a charge");
      assert.notEqual(METALS.includes(arms.field), METALS.includes(arms.chargeTincture), `${arms.charge} on ${arms.field} breaks the rule of tincture`);
    }
    assert.doesNotMatch(renderCoatOfArms(arms), /NaN|undefined/u);
  }
  assert.deepEqual(coatOfArms("same"), coatOfArms("same"));
  const state = planet.states.slice(1).find((item) => item.cells)!;
  const kin = planet.provinces.slice(1).filter((province) => province.state === state.id).map((province) => armsOf(planet, "province", province.id)!);
  const field = armsOf(planet, "state", state.id)!.field;
  assert.ok(kin.filter((arms) => arms.field === field).length >= kin.length / 3, "most provinces keep their realm's field");
});

test("armies stand at the capitals and on the marches, fleets in the ports", () => {
  const regiments = raiseArmies(planet);
  assert.ok(regiments.length > planet.states.length / 2);
  for (const regiment of regiments) {
    const burg = planet.burgs[regiment.burg];
    assert.equal(burg.state, regiment.state, "a regiment stands in its own realm");
    assert.ok(regiment.total > 0);
    if (regiment.stance === "guard") assert.ok(burg.capital, "the guard holds the capital");
    if (regiment.stance === "fleet") assert.ok(burg.port && regiment.ships > 0, "a fleet lies in a port");
    if (regiment.stance === "march") assert.ok(["enemy", "rival", "suspicion"].includes(planet.states[regiment.state].relations[regiment.facing]), "a march faces a hostile realm");
  }
});

test("heat maps of warmth, rain and people draw with their key", () => {
  for (const id of ["temperature", "precipitation", "population"] as const) {
    const svg = renderPlanet(planet, { layers: { [id]: true } });
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/u, id);
    assert.ok(svg.includes(id === "temperature" ? "°C" : id === "precipitation" ? ">mm<" : "/km²"), `${id} has a key`);
  }
});

test("the world editor reshapes the ground, repaints realms and moves towns without renumbering them", () => {
  const sea = Array.from({ length: planet.mesh.cells }, (_, cell) => cell).find((cell) => planet.coast[cell] === -4)!;
  const raised = generatePlanet(planet.params, [[planet.mesh.x[sea], planet.mesh.y[sea], 90, 40]]);
  assert.equal(raised.water[sea], 0, "the brush raised land out of the sea");
  assert.deepEqual(generatePlanet(planet.params, []).burgs.map((b) => b.name), planet.burgs.map((b) => b.name), "no strokes, no change");

  const town = planet.burgs.find((b) => b.id && !b.capital)!;
  const other = planet.burgs.find((b) => b.id && !b.capital && b.state !== town.state)!;
  const spot = Array.from({ length: planet.mesh.cells }, (_, cell) => cell).find((cell) => !planet.water[cell] && !planet.burg[cell] && Math.hypot(planet.mesh.x[cell] - town.x, planet.mesh.y[cell] - town.y) > 50)!;
  const edits = { ...emptyEdits(), owners: { [other.cell]: town.state }, moved: { [town.id]: [planet.mesh.x[spot], planet.mesh.y[spot]] as [number, number] }, added: [[10, 10, "Founded", 2] as [number, number, string, number]], removed: [other.id] };
  const edited = editPlanet(planet, edits);
  assert.equal(edited.burgs[town.id].cell, spot, "the town moved");
  assert.equal(edited.burgs[town.id].name, town.name, "and kept its id");
  assert.equal(edited.burgs.length, planet.burgs.length + 1, "a founded town follows the others");
  assert.ok(edited.burgs[other.id].removed && !edited.burg[other.cell], "a razed town is gone from the map");
  assert.equal(edited.state[other.cell], town.state, "the land changed hands");
  assert.equal(edited.states.slice(1).reduce((sum, item) => sum + item.cells, 0), planet.states.slice(1).reduce((sum, item) => sum + item.cells, 0), "realms recounted");
  assert.ok(!renderPlanet(edited).includes(`>${other.name}<`), "a razed town is not drawn");
  assert.equal(editPlanet(planet, emptyEdits()), planet, "no edits, the same world");
});

console.log(`planet: ${passed} regressions passed`);
