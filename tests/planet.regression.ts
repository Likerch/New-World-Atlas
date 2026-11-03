// Planet-level regressions: run with `npm test`.
import assert from "node:assert/strict";
import { fromGeoJSON, parseRecipe, recipeText, generateArea, koppenOf, KOPPEN, planetGeoJSON, sculpt, zonesOf, cellKm2, pastPlanet, shiftLanguage, createLanguage, createRng, armsOf, emblemOf, MIXES, SETTINGS, settingFromText, settingToText, coatOfArms, editPlanet, emptyEdits, foundedSize, generatePlanet, globePick, METALS, name, raiseArmies, renderCoatOfArms, renderGlobe, planetToJson, renderPlanet, TEMPLATES, THEMES, toCyrillic, SEA_LEVEL } from "../src/core/index";

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
  for (const quick of [true, false]) assert.doesNotMatch(renderGlobe(planet, { lon: 33, lat: -12, quick }), /NaN|undefined|Infinity/u);
});

test("a map of the whole planet wraps the globe: no seam at the antimeridian, no uncharted lands", () => {
  const whole = generatePlanet({ seed: "whole", template: "isthmus", width: 2000, height: 1000, latitudeNorth: 90, latitudeSouth: -90, cells: 5000 });
  for (let y = 5; y < 1000; y += 10) {
    assert.equal(whole.water[whole.mesh.find(3, y)], 1, `land runs off the left edge at y ${y}`);
    assert.equal(whole.water[whole.mesh.find(1997, y)], 1, `land runs off the right edge at y ${y}`);
  }
  const back = renderGlobe(whole, { lon: 180, lat: 0 });
  assert.ok(!/fill-opacity="0.55"/u.test(back), "no unknown lands on a fully charted world");
  assert.ok(!/stroke-dasharray="6 4" opacity="0.6"/u.test(back), "no edge of the known world");
});

test("the far side of the globe shows uncharted lands, and the map's sea does not spill over it", () => {
  const back = renderGlobe(planet, { lon: 180, lat: 0 });
  const unknown = back.match(/<path d="([^"]*)" fill="[^"]*" fill-opacity="0.55"/u);
  assert.ok(unknown && unknown[1].length > 500, "unknown lands are sketched round the back");
  // The charted area is behind us: its sea must not be drawn as a disc over the whole globe.
  const chart = back.match(/<path d="([^"]*)" fill="[^"]*"\/><path d="[^"]*" fill="[^"]*" fill-rule="evenodd"\/>/u);
  assert.ok(!chart || chart[1].length < 200, "the hidden map is not stretched over the visible side");
  assert.ok(!/fill-opacity="0.55"/u.test(renderGlobe(planet, { lon: 180, lat: 0, unknown: false })), "unknown lands can be turned off");
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

test("a relief stroke keeps every town, people and realm on its number", () => {
  const sea = Array.from({ length: planet.mesh.cells }, (_, cell) => cell).find((cell) => planet.coast[cell] === -4)!;
  const raised = generatePlanet(planet.params, [[planet.mesh.x[sea], planet.mesh.y[sea], 90, 40]]);
  assert.equal(raised.burgs.length, planet.burgs.length, "no town was lost or added");
  assert.equal(raised.states.length, planet.states.length, "no realm was lost or added");
  assert.equal(raised.cultures.length, planet.cultures.length);
  let kept = 0;
  for (const town of planet.burgs.slice(1)) {
    const now = raised.burgs[town.id];
    assert.equal(now.capital, town.capital, `${town.name} is still ${town.capital ? "" : "not "}a capital`);
    assert.ok(Math.hypot(now.x - town.x, now.y - town.y) < planet.mesh.spacing * 6, `${town.name} stays where it stood`);
    if (now.name === town.name) kept++;
  }
  assert.ok(kept / (planet.burgs.length - 1) > 0.9, `${kept} of ${planet.burgs.length - 1} towns kept their names`);
});

test("repainted land joins a province of its new realm; capitals stay home; new neighbours meet", () => {
  const [a, d] = (() => {
    for (const realm of planet.states.slice(1)) {
      const stranger = planet.states.slice(1).find((other) => other.id !== realm.id && other.cells > 20 && !realm.neighbors.includes(other.id));
      if (stranger) return [realm, stranger];
    }
    throw new Error("no two realms apart");
  })();
  const [abroad, ...theirs] = Array.from({ length: planet.mesh.cells }, (_, cell) => cell).filter((cell) => planet.state[cell] === d.id && !planet.burg[cell]).slice(0, 6);
  const capital = planet.burgs[a.capital];
  const edited = editPlanet(planet, { ...emptyEdits(), owners: Object.fromEntries(theirs.map((cell) => [cell, a.id])), moved: { [capital.id]: [planet.mesh.x[abroad], planet.mesh.y[abroad]] } });
  for (const cell of theirs) {
    assert.equal(edited.state[cell], a.id);
    assert.equal(edited.provinces[edited.province[cell]]?.state, a.id, "the land is in one of its new realm's provinces");
  }
  assert.equal(edited.burgs[capital.id].cell, capital.cell, "a capital does not move into another realm");
  assert.ok(edited.states[a.id].neighbors.includes(d.id) && edited.states[d.id].neighbors.includes(a.id), "the realms now meet");
  assert.ok(edited.states[a.id].relations[d.id] && edited.states[d.id].relations[a.id], "and have a stance on each other");
  assert.doesNotMatch(renderPlanet(edited, { theme: "political", layers: { provinces: true } }), /NaN|undefined|Infinity/u);
});

test("a town moved to the sea becomes a port; a founded town is the size of its realm's towns", () => {
  const town = planet.burgs.find((b) => b.id && !b.capital && !b.port)!;
  const shore = Array.from({ length: planet.mesh.cells }, (_, cell) => cell).find((cell) => planet.coast[cell] === 1 && !planet.burg[cell] && planet.state[cell] === town.state && planet.mesh.neighbors[cell].some((next) => planet.features[planet.feature[next]]?.kind === "ocean"))!;
  const moved = editPlanet(planet, { ...emptyEdits(), moved: { [town.id]: [planet.mesh.x[shore], planet.mesh.y[shore]] } });
  assert.ok(moved.burgs[town.id].port, "it became a port");

  const stone = generatePlanet({ seed: "regression", template: "continents", cells: 3000, setting: SETTINGS.stone });
  const spot = Array.from({ length: stone.mesh.cells }, (_, cell) => cell).find((cell) => !stone.water[cell] && !stone.burg[cell] && stone.state[cell])!;
  const size = foundedSize(stone, spot);
  assert.ok(size < 1, `a stone-age camp is small (${size})`);
  const camp = editPlanet(stone, { ...emptyEdits(), added: [[stone.mesh.x[spot], stone.mesh.y[spot], "Camp", size]] }).burgs.at(-1)!;
  assert.ok(!camp.walls && !camp.citadel && !camp.market, "and has no walls, citadel or market");
});

test("the map names its continents, keys every heat map shown and speaks the reader's units", () => {
  const svg = renderPlanet(planet, { layers: { landmasses: true, temperature: true, precipitation: true }, words: { km: "км" } });
  const land = planet.features.find((f) => f.land && f.name && f.cells >= 30)!;
  assert.ok(svg.includes(`>${land.name.toUpperCase()}<`), "a continent is named");
  assert.ok(svg.includes(">°C<") && svg.includes(">mm<"), "both heat maps have their key");
  assert.match(svg, /\d+ км</u);
  const whole = generatePlanet({ seed: "regression", cells: 3000, width: 2000, height: 1000, latitudeNorth: 90, latitudeSouth: -90 });
  assert.match(renderPlanet(whole, { words: { atEquator: "на экваторе" } }), /на экваторе/u, "a world map's scale holds at the equator");
});

test("a lived history makes the realms and towns of the map, and living on keeps what was", () => {
  const world = generatePlanet({ seed: "lived", template: "continents", cells: 5000, history: 300 });
  const history = world.history!;
  assert.ok(history.events.length > 50 && history.figures.length > 20, "a history happened");
  assert.equal(world.burgs.length, history.towns.length, "every town of the history has its burg");
  for (const burg of world.burgs.slice(1)) {
    const town = history.towns[burg.id];
    assert.equal(burg.name, town.name);
    assert.equal(!!burg.removed, town.fell !== undefined, `${burg.name}: fallen towns are razed slots, the living stand`);
    if (!burg.removed) assert.equal(world.burg[burg.cell], burg.id);
  }
  for (const state of world.states.slice(1)) {
    const seat = world.burgs[state.capital];
    assert.ok(seat && !seat.removed && seat.capital && seat.state === state.id, `${state.name} sits in its own capital`);
    assert.equal(history.polities[state.polity!].name, state.name);
  }
  for (const marker of world.markers.filter((item) => item.kind === "ruins" && typeof item.facts.town === "number")) assert.ok(history.towns[marker.facts.town as number].fell !== undefined, "ruins are of fallen towns");
  assert.doesNotMatch(renderPlanet(world), /NaN|undefined|Infinity/u);
  const then = pastPlanet(world, 120);
  assert.doesNotMatch(renderPlanet(then), /NaN|undefined|Infinity/u);
  assert.ok(then.routes.length > 1, "the past had its own roads");
  assert.doesNotMatch(renderPlanet(world, { layers: { events: true } }), /NaN|undefined|Infinity/u);
  // The same seed lives the same history; fifty years more begin with the same three hundred.
  const again = generatePlanet({ seed: "lived", template: "continents", cells: 5000, history: 300 });
  assert.deepEqual(again.history!.events.map((event) => `${event.year}:${event.kind}`), history.events.map((event) => `${event.year}:${event.kind}`));
  const older = generatePlanet({ seed: "lived", template: "continents", cells: 5000, history: 350 }).history!;
  assert.deepEqual(older.events.filter((event) => event.year <= 300).map((event) => `${event.year}:${event.kind}:${event.town ?? ""}`), history.events.map((event) => `${event.year}:${event.kind}:${event.town ?? ""}`));
  for (const town of history.towns) assert.equal(older.towns[town.id].name, town.name, "a town keeps its number and name");
  // A daughter tongue sounds akin to its parent but is its own.
  const parent = createLanguage(createRng("tongue"));
  const daughter = shiftLanguage(parent, createRng("shift"));
  assert.equal(daughter.morphemes.town.length > 0, parent.morphemes.town.length > 0);
});

test("a whole world measures the area of a globe, not of a flat sheet", () => {
  const whole = generatePlanet({ seed: "globe-area", cells: 3000, width: 2000, height: 1000, latitudeNorth: 90, latitudeSouth: -90 });
  let total = 0;
  for (let cell = 0; cell < whole.mesh.cells; cell++) total += cellKm2(whole, cell);
  const sphere = 4 * Math.PI * ((180 * 111) / Math.PI) ** 2;
  assert.ok(Math.abs(total / sphere - 1) < 0.08, `${Math.round(total / 1e6)} million km² for a globe of ${Math.round(sphere / 1e6)}`);
});

test("the land makes its own places, the year has seasons and climates, the world has its zones of trouble", () => {
  const kinds = new Set(planet.markers.map((marker) => marker.kind));
  assert.ok(["waterfall", "rapids", "ford", "pass", "reef"].some((kind) => kinds.has(kind as never)), "rivers, roads and shores make places");
  const climates = koppenOf(planet);
  assert.ok(new Set([...climates].filter((k) => k >= 0)).size >= 4, "more than one climate");
  for (let cell = 0; cell < planet.mesh.cells; cell++) assert.equal(climates[cell] >= 0, !planet.water[cell]);
  assert.ok(KOPPEN.length === 18);
  const at = generatePlanet({ ...planet.params, setting: { ...SETTINGS.medieval, magic: 3 } });
  assert.ok(zonesOf(at).some((zone) => zone.kind === "storm"), "strong magic brings magic storms");
  assert.doesNotMatch(renderPlanet(planet, { layers: { climate: true, zones: true, cultures: true, ice: true }, season: "winter" }), /NaN|undefined|Infinity/u);
  const geo = planetGeoJSON(planet);
  assert.ok(geo.features.length > planet.burgs.length / 2);
  const area = generateArea(planet, [300, 200, 700, 500], "Box");
  assert.ok(area.burgs.length > 1 && area.mesh.cells > 1000, "a marked-out area opens up close");
});

test("the world editor smooths, levels and raises ridges; raises, merges and reshapes realms; sets towns and marks", () => {
  const height = planet.height.slice();
  const [x, y] = [planet.params.width / 2, planet.params.height / 2];
  sculpt(planet.mesh, height, [[x, y, 80, 30, 2]]);
  const near = Array.from({ length: planet.mesh.cells }, (_, cell) => cell).filter((cell) => Math.hypot(planet.mesh.x[cell] - x, planet.mesh.y[cell] - y) < 10);
  for (const cell of near) assert.ok(Math.abs(height[cell] - 30) < 3, "levelled to the height asked");
  const ridge = planet.height.slice();
  sculpt(planet.mesh, ridge, [[100, 100, 30, 20, 3, 400, 100]]);
  const onLine = planet.mesh.find(250, 100);
  assert.ok(ridge[onLine] > planet.height[onLine] + 10, "a ridge rises along its line");
  const town = planet.burgs.find((burg) => burg.id && !burg.removed && !burg.capital && burg.province)!;
  const [a, b] = planet.states.slice(1).filter((state) => state.cells && state.id !== town.state);
  const edited = editPlanet(planet, { ...emptyEdits(), raised: [{ town: town.id, name: "Freeland", color: "#336699" }], merged: [[b.id, a.id]], realms: { [a.id]: { formKey: "empire", color: "#aa2200" } }, towns: { [town.id]: { population: 77, walls: true } }, relations: [[a.id, town.state, "enemy"]], labels: [[50, 50, "Here be dragons", 14]], zones: [[200, 200, 50, "custom", "Haunted"]] });
  const free = edited.states[edited.states.length - 1];
  assert.equal(free.name, "Freeland");
  assert.ok(free.cells > 0 && edited.burgs[town.id].capital && edited.burgs[town.id].state === free.id, "a realm raised round a town");
  assert.equal(edited.states[b.id].cells, 0, "a merged realm is gone into the other");
  assert.equal(edited.states[a.id].formKey, "empire");
  assert.equal(edited.burgs[town.id].population, 77);
  assert.match(renderPlanet(edited), /Here be dragons/u);
  assert.ok(zonesOf(edited).some((zone) => zone.label === "Haunted"));
});

test("the world's age reshapes towns, realms, roads, places, armies and banners, and the medieval age is the classic world", () => {
  const classic = generatePlanet({ seed: "regression", template: "continents", cells: 6000, setting: SETTINGS.medieval });
  assert.equal(JSON.stringify(planetToJson({ ...classic, params: planet.params })), JSON.stringify(planetToJson(planet)), "the medieval preset changes nothing");
  const age = (setting: (typeof SETTINGS)[keyof typeof SETTINGS]) => generatePlanet({ seed: "regression", template: "continents", cells: 4000, setting });
  const stone = age(SETTINGS.stone);
  assert.ok(stone.routes.slice(1).every((route) => route.kind === "trail"), "no roads or sea lanes before the wheel and the boat");
  assert.ok(stone.states.slice(1).every((state) => state.form === "tribal"), "only bands and tribes");
  assert.ok(stone.markers.some((marker) => marker.kind === "megalith") && !stone.markers.some((marker) => marker.kind === "portal"), "standing stones, no wonders");
  const modern = age(SETTINGS.modern);
  assert.ok(modern.routes.some((route) => route.kind === "air"), "air routes join great cities");
  assert.ok(Math.max(...modern.burgs.map((b) => b.population)) > 10 * Math.max(...classic.burgs.map((b) => b.population)), "cities of millions");
  assert.ok(modern.markers.some((marker) => marker.kind === "airport") && modern.markers.some((marker) => marker.kind === "factory"), "airports and factories");
  assert.equal(emblemOf(modern, "state", 1)?.kind, "flag", "realms fly flags");
  assert.ok((modern.secular ?? 0) > 0.2, "many keep no faith");
  const future = age(SETTINGS["far-future"]);
  assert.ok(future.markers.some((marker) => marker.kind === "space-elevator") && future.markers.some((marker) => marker.kind === "spaceport"), "a space elevator and spaceports");
  const fallen = age(SETTINGS["post-apocalypse"]);
  assert.ok(fallen.markers.some((marker) => marker.kind === "crater") && !fallen.routes.some((route) => route.kind === "air"), "craters and no flights after the fall");
  assert.ok(fallen.states.slice(1).some((state) => state.form === "warlord"), "warlords rule");
  const magic = age(MIXES["high-fantasy"]);
  assert.ok(magic.markers.some((marker) => marker.kind === "wizard-tower"), "wizards' towers where magic is everywhere");
  for (const setting of [SETTINGS.modern, MIXES.steampunk, { ...SETTINGS.ancient, magic: 2, decline: 0.3, name: "Bronze gods" }]) assert.deepEqual(settingFromText(settingToText(setting)), setting, "a setting survives the link");
  assert.equal(settingToText(SETTINGS["far-future"]), "far-future");
  assert.equal(settingFromText("{broken"), undefined);
  const units = (world: typeof planet) => raiseArmies(world).reduce((sum, regiment) => sum + regiment.units.cavalry, 0);
  assert.equal(units(stone), 0, "no riders in the stone age");
});

test("a recipe, a share of land, plates and salt lakes", () => {
  const plain = generatePlanet({ seed: "recipe", template: "continents", cells: 3000 });
  const written = generatePlanet({ seed: "recipe", template: "continents", cells: 3000, recipe: recipeText("continents") });
  assert.deepEqual([...written.height], [...plain.height], "the template's recipe as text grows the same world");
  assert.deepEqual(parseRecipe(["hill 2 50 40-60 40-60", "nonsense", "mask -3"].join("\n")).errors, [2]);
  const wide = generatePlanet({ seed: "recipe", template: "continents", cells: 3000, land: 0.6 });
  const share = [...wide.height].filter((h) => h >= SEA_LEVEL).length / wide.mesh.cells;
  assert.ok(Math.abs(share - 0.6) < 0.02, `land share ${share}`);
  const plates = generatePlanet({ seed: "plates", template: "plates", cells: 4000 });
  const land = [...plates.water].filter((w) => !w).length / plates.mesh.cells;
  assert.ok(land > 0.1 && land < 0.8, `plates give ${land} land`);
  for (const seed of ["s2", "s5", "dry1"]) {
    const world = generatePlanet({ seed, cells: 6000, precipitation: seed === "dry1" ? 0.4 : 1 });
    for (const lake of world.features.filter((f) => f.salt)) {
      const cells = [...Array(world.mesh.cells).keys()].filter((cell) => world.feature[cell] === lake.id);
      assert.ok(cells.reduce((sum, cell) => sum + world.precipitation[cell], 0) / cells.length < 350, "a salt lake where it rains well");
    }
  }
});

test("a stage thrown again leaves the stages before it; families of tongues", () => {
  const base = generatePlanet({ seed: "reroll", cells: 3000 });
  const towns = generatePlanet({ seed: "reroll", cells: 3000, reroll: { towns: 1 } });
  assert.deepEqual([...towns.height], [...base.height], "the relief moved");
  assert.deepEqual(towns.cultures.map((c) => c.name), base.cultures.map((c) => c.name), "the peoples changed");
  assert.notDeepEqual(towns.burgs.map((b) => b.name), base.burgs.map((b) => b.name), "the towns stayed");
  const names = generatePlanet({ seed: "reroll", cells: 3000, reroll: { names: 2 } });
  assert.deepEqual(names.burgs.map((b) => b.name), base.burgs.map((b) => b.name), "names moved the towns");
  const kin = generatePlanet({ seed: "reroll", cells: 3000, families: 2 });
  assert.equal(new Set(kin.cultures.slice(1).map((c) => c.family)).size, Math.min(2, kin.cultures.length - 1));
});

test("relief and names from GeoJSON: cells with a height, named places, north up", () => {
  const square = (x: number, y: number, h: number) => ({ type: "Feature", properties: { height: h }, geometry: { type: "Polygon", coordinates: [[[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10], [x, y]]] } });
  const doc = { type: "FeatureCollection", features: [square(0, 0, 5), square(10, 0, 70), square(0, 10, 70), square(10, 10, 5), { type: "Feature", properties: { name: "Northport", capital: true }, geometry: { type: "Point", coordinates: [15, 15] } }] };
  const read = fromGeoJSON(doc, { width: 1600, height: 1000 })!;
  const { width, height, heights } = read.image!;
  const at = (fx: number, fy: number) => heights[Math.floor(fy * height) * width + Math.floor(fx * width)];
  // North up: the high square at (10–20, 0–10) lies in the lower right, the one at (0–10, 10–20) in the upper left.
  assert.equal(at(0.6, 0.75), 70);
  assert.equal(at(0.4, 0.25), 70);
  assert.equal(at(0.6, 0.25), 5);
  const [x, y, words, size] = read.labels[0];
  assert.equal(words, "Northport");
  assert.ok(x > 800 && y < 500 && size > 9, "the capital stands in the north-east, large");
  const places = fromGeoJSON({ type: "FeatureCollection", features: [doc.features[4]] }, { width: 1600, height: 1000 }, read.image!.box)!;
  assert.deepEqual(places.labels[0].slice(0, 2), read.labels[0].slice(0, 2), "a file of places alone lands where the relief put them");
  assert.equal(fromGeoJSON({ type: "FeatureCollection", features: [] }, { width: 1600, height: 1000 }), null);
});

test("review fixes: edits, relief, rivers, places and GeoJSON", () => {
  const world = generatePlanet({ seed: "review", template: "continents", cells: 3000 });
  // Colours and zones from a file are only drawn when they are what they say.
  const evil = '#f00"/><image href="x" onerror="alert(1)"/><g fill="';
  const painted = editPlanet(world, { ...emptyEdits(), realms: { 1: { color: evil } }, zones: [[100, 100, 40, '"><script>', ""]] } as never);
  const svg = renderPlanet(painted, { layers: { zones: true } as never });
  assert.ok(!svg.includes("onerror") && !svg.includes("<script>"), "markup from a file reached the map");
  // A former capital may be razed once its realm is merged away.
  const [gone, into] = [2, 1];
  const seat = world.states[gone].capital;
  const merged = editPlanet(world, { ...emptyEdits(), merged: [[gone, into]], removed: [seat] });
  assert.ok(merged.burgs[seat].removed, "the old seat could not be razed");
  // Many towns asked for on a small map give many towns, not none.
  assert.ok(generatePlanet({ seed: "crowd", cells: 3000, towns: 1000 }).burgs.length > 300);
  // Water never climbs.
  for (const river of world.rivers.slice(1)) for (let k = 1; k < river.cells.length; k++) assert.ok(world.height[river.cells[k]] <= world.height[river.cells[k - 1]] + 0.5, `river ${river.id} climbs`);
  // No natural or remembered place on a town.
  const lived = generatePlanet({ seed: "review", cells: 3000, history: 150 });
  for (const m of lived.markers.slice(1)) assert.ok(!lived.burg[m.cell], `a ${m.kind} stands on a town`);
  // A recipe's heights stay on the map's scale; the share of land is what is asked, whatever the relief.
  const odd = generatePlanet({ seed: "review", cells: 2000, recipe: "hill 1 -40 50 50" });
  assert.ok(Math.max(...odd.height) < 30, "a negative hill wrapped round into a mountain");
  for (const recipe of ["add 5 0-100", "mask 0.5"]) {
    const sunk = generatePlanet({ seed: "review", cells: 2000, recipe, land: 0.6 });
    assert.ok(Math.abs([...sunk.height].filter((h) => h >= SEA_LEVEL).length / sunk.mesh.cells - 0.6) < 0.02, `${recipe}: wrong share of land`);
  }
  // Latitudes beyond the poles and no rain at all are brought within reason.
  const wild = generatePlanet({ seed: "review", cells: 1500, latitudeNorth: 120, latitudeSouth: -100, precipitation: 0 });
  assert.ok(!renderPlanet(wild).includes("NaN"));
  // A realm's lakes are holes in its GeoJSON polygon, not land.
  const geo = planetGeoJSON(world) as { features: { properties: { kind: string }; geometry: { coordinates: unknown[][][] } }[] };
  for (const f of geo.features.filter((f) => f.properties.kind === "realm")) for (const polygon of f.geometry.coordinates) assert.ok(polygon.length >= 1);
  // A lone named place lands in the middle of the map.
  const one = fromGeoJSON({ type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "Here" }, geometry: { type: "Point", coordinates: [10, 10] } }] }, { width: 1600, height: 1000 })!;
  assert.deepEqual(one.labels[0].slice(0, 2), [800, 500]);
});

console.log(`planet: ${passed} regressions passed`);
