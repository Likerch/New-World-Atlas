// City-level regressions: run with `npm test`.
import assert from "node:assert/strict";
import { buildingFromCity, generateBuilding, SETTINGS, CITY_THEMES, cityTiers, renderTier, generateDistrict, cityFromBurg, distanceToPolyline, ERAS, generateCity, generatePlanet, pointInPolygon, renderCity } from "../src/core/index";

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

const port = generateCity({ seed: "harbour", era: "medieval", population: 20, coast: Math.PI / 2, river: 0, walls: true, citadel: true });

test("the same seed gives the same city", () => {
  const again = generateCity({ seed: "harbour", era: "medieval", population: 20, coast: Math.PI / 2, river: 0, walls: true, citadel: true });
  assert.equal(JSON.stringify({ ...again, language: null }), JSON.stringify({ ...port, language: null }));
});

test("nothing is built in the sea or the river", () => {
  assert.ok(port.sea && port.river, "a port on a river");
  for (const building of port.buildings.filter((item) => item.kind !== "pier")) {
    for (const p of building.polygon) {
      assert.ok(!pointInPolygon(p, port.sea!), `a ${building.kind} stands in the sea`);
      assert.ok(distanceToPolyline(p, port.river!.points) >= port.river!.width / 2, `a ${building.kind} stands in the river`);
    }
  }
});

test("a walled town has gates, towers, a citadel ring, a market and main streets", () => {
  const wall = port.walls.find((item) => !item.citadel)!;
  assert.ok(wall && wall.gates.length >= 2 && wall.towers.length > 4);
  assert.ok(port.walls.some((item) => item.citadel));
  assert.ok(port.wards.some((ward) => ward.kind === "plaza"));
  assert.ok(port.streets.filter((street) => street.kind === "main").length >= 2);
  assert.ok(port.landmarks.some((landmark) => landmark.kind === "market-well"));
  assert.ok(port.buildings.some((building) => building.kind === "pier"), "a harbour has piers");
  assert.ok(port.buildings.filter((building) => building.kind === "stall").length >= 8, "the market has rows of stalls");
});

test("every era builds a city and every style draws it", () => {
  for (const era of ERAS) {
    const city = generateCity({ seed: `era-${era}`, era, coast: 0, river: 1, population: era === "modern" || era === "cyberpunk" ? 900 : 15 });
    assert.ok(city.wards.some((ward) => ward.urban), era);
    assert.ok(city.buildings.length > 200, `${era}: ${city.buildings.length} buildings`);
    assert.ok(city.buildings.length < 40_000, `${era}: ${city.buildings.length} buildings is too many to draw`);
    assert.ok(city.landmarks.length > 3, era);
    if (era === "renaissance") assert.ok(city.walls.every((wall) => wall.bastions));
    for (const theme of CITY_THEMES) {
      const svg = renderCity(city, { theme, highlight: city.wards[0].id, script: "cyrillic" });
      assert.doesNotMatch(svg, /NaN|undefined|Infinity/u, `${era}/${theme}`);
    }
  }
});

test("a town of the planet becomes a city that keeps its coast, river and defences", () => {
  const planet = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
  const burg = planet.burgs.slice(1).find((item) => item.port && planet.river[item.cell]) ?? planet.burgs.slice(1).find((item) => item.port)!;
  const { params, language } = cityFromBurg(planet, burg.id, "medieval");
  assert.equal(params.name, burg.name);
  assert.notEqual(params.coast, null, "a port lies by the water");
  if (planet.river[burg.cell]) assert.notEqual(params.river, null);
  assert.equal(params.walls, burg.walls);
  const city = generateCity(params, language);
  assert.equal(city.name, burg.name);
  assert.deepEqual(generateCity(params, language).wards.map((ward) => ward.name), city.wards.map((ward) => ward.name), "the same town gets the same names when opened again");
  assert.ok(city.sea);
});

test("a quarter opens up close as blocks of houses round courtyards, inside the frame", () => {
  const ward = port.wards.find((w) => w.urban && (w.kind === "craftsmen" || w.kind === "merchants"))!;
  const district = generateDistrict(port, ward.id);
  assert.ok(district.scale < port.scale, "closer means fewer metres per unit");
  assert.ok(district.wards.filter((w) => w.urban).length >= 2, "alleys cut the quarter into blocks");
  assert.ok(district.buildings.some((b) => b.kind === "yard"), "blocks have courtyards");
  for (const b of district.buildings) for (const [x, y] of b.polygon) assert.ok(x > -1 && y > -1 && x < 1201 && y < 901, `a ${b.kind} sits outside the frame`);
  assert.doesNotMatch(renderCity(district), /NaN|undefined|Infinity/u);
});

test("a cyberpunk city has an upper tier and an undercity; an old town has catacombs and no roofs to walk", () => {
  const sprawl = generateCity({ seed: "tiers", era: "cyberpunk", population: 1200, river: 0.3, coast: null });
  const high = cityTiers(sprawl);
  assert.ok(high.upper.roofs.length > 0 && high.upper.bridges.length > 0 && high.upper.pads.length <= 30);
  assert.ok(high.under.halls.length > 0 && high.under.shafts.length >= high.under.halls.length && high.under.tunnels.length > 0);
  for (const tier of ["upper", "under"] as const) assert.doesNotMatch(renderTier(sprawl, high, tier), /NaN|undefined|Infinity/u);
  const old = cityTiers(port);
  assert.equal(old.upper.roofs.length, 0);
  assert.ok(old.under.halls.some((hall) => hall.purpose === "ossuary"));
});

test("a camp, a polis, a city of the far future and a dead city each look their age; a planet town opens in its world's age", () => {
  const camp = generateCity({ seed: "ages", era: "stone", population: 0.4, walls: true });
  assert.ok(camp.buildings.some((b) => b.kind === "hut") && !camp.buildings.some((b) => b.kind === "house" || b.kind === "tower"), "huts only");
  assert.ok(camp.landmarks.some((l) => l.kind === "fire-pit"));
  assert.equal(camp.buildings.filter((b) => b.kind === "fire").length, 1, "one fire in the middle");
  assert.ok(camp.buildings.filter((b) => b.kind === "stone").length >= 8, "a ring of standing stones round a great one");
  assert.ok(camp.streets.length > 2 && camp.streets.every((street) => street.kind === "path"), "footpaths, no streets");
  const hut = generateBuilding(buildingFromCity(camp, camp.buildings.findIndex((b) => b.kind === "hut")));
  const things = hut.floors.flatMap((floor) => floor.rooms.flatMap((room) => room.furniture.map((item) => item.kind)));
  assert.ok(things.includes("hearth") && !things.includes("table") && !things.includes("bed"), "a hearth, mats and furs, no tables or beds");
  const polis = generateCity({ seed: "ages", era: "ancient", population: 40 });
  assert.ok(polis.landmarks.some((l) => l.kind === "agora") && polis.walls.length > 0, "an agora inside walls");
  const future = generateCity({ seed: "ages", era: "far-future", population: 900 });
  assert.ok(future.wards.some((w) => w.kind === "spaceport") && future.landmarks.some((l) => l.kind === "ai-core"), "a spaceport and an AI core");
  assert.ok(future.streets.some((street) => street.kind === "rail"), "maglev lines");
  const fallen = generateCity({ seed: "ages", era: "post-apocalypse", population: 6 });
  assert.ok(fallen.wards.some((w) => w.kind === "settlement") && fallen.buildings.filter((b) => b.kind === "ruin").length > fallen.buildings.filter((b) => b.kind === "house").length, "a hold among ruins");
  for (const city of [camp, polis, future, fallen]) assert.doesNotMatch(renderCity(city), /NaN|undefined|Infinity/u);
  const world = generatePlanet({ seed: "ages", cells: 3000, setting: SETTINGS["far-future"] });
  const capital = world.burgs.find((b) => b.capital)!;
  assert.equal(cityFromBurg(world, capital.id).params.era, "far-future");
  assert.equal(cityFromBurg(world, capital.id).params.population, Math.round(capital.population * 100) / 100, "a town sized by its age keeps its people");
});

console.log(`city: ${passed} regressions passed`);
