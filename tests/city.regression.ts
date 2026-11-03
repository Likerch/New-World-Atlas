// City-level regressions: run with `npm test`.
import assert from "node:assert/strict";
import { area, buildingFromCity, generateBuilding, SETTINGS, CITY_THEMES, cityTiers, renderTier, generateDistrict, cityFromBurg, distanceToPolyline, ERAS, generateCity, generatePlanet, pointInPolygon, renderCity, hashString, citySociety, cityShops, craftsOf, influenceTints, cityLegend, localFromPlace, editCity, PROPS, GROWTH_AGES, heightField, tierLegend, localFromHall, localOutskirts } from "../src/core/index";

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

test("quarters differ in size and shape: big and small, round and long", () => {
  for (const city of [port, generateCity({ seed: "spread", era: "modern", population: 900 })]) {
    const sizes = city.wards.filter((w) => w.urban).map((w) => area(w.polygon));
    const mean = sizes.reduce((s, a) => s + a, 0) / sizes.length;
    const spread = Math.sqrt(sizes.reduce((s, a) => s + (a - mean) ** 2, 0) / sizes.length) / mean;
    assert.ok(spread > 0.25, `${city.params.era}: ward sizes spread only ${spread.toFixed(2)}`);
    assert.ok(Math.max(...sizes) > Math.min(...sizes) * 2.5, `${city.params.era}: the biggest ward is not much bigger than the smallest`);
  }
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

test("a town walled only round its castle keeps its taverns; a craftsmen's quarter is no pattern of numbers", () => {
  const town = generateCity({ seed: "castle-only", era: "medieval", population: 30, walls: false, citadel: true });
  const expected = Math.max(1, Math.min(6, Math.round(1 + Math.sqrt(30))));
  assert.ok(town.landmarks.filter((l) => l.kind === "tavern").length >= expected - 1, "taverns were lost to the citadel's gateless ring");
  const city = generateCity({ seed: "crafts", era: "medieval", population: 60, walls: true, citadel: true });
  const crafts = new Set(city.wards.filter((w) => w.kind === "craftsmen").map((w) => w.id));
  const smithies = city.buildings.map((b, index) => [b, index] as const).filter(([b]) => crafts.has(b.ward) && b.kind === "house").filter(([, index]) => buildingFromCity(city, index).type === "smithy").map(([, index]) => index % 5);
  if (smithies.length > 3) assert.ok(new Set(smithies).size > 1, "every fifth house is a smithy");
});

test("the classic town keeps its quarters, houses, streets, walls and first places (golden print)", () => {
  const city = generateCity({ seed: "golden", era: "medieval", population: 20, coast: 1, river: 2, walls: true, citadel: true });
  assert.equal(hashString(JSON.stringify({ wards: city.wards, buildings: city.buildings, streets: city.streets.filter((s) => s.kind !== "alley" && s.kind !== "boulevard"), walls: city.walls })), 2062758862);
  assert.equal(hashString(JSON.stringify(city.landmarks.slice(0, 12))), 3405626691);
  // Alleys come after the town's own streets, cut where its rows of houses part.
  const first = city.streets.findIndex((s) => s.kind === "alley");
  assert.ok(first > 0 && city.streets.slice(first).every((s) => s.kind === "alley"), "alleys follow the streets");
  assert.ok(city.streets.filter((s) => s.kind === "alley").length > 10);
});

test("society: factions hold quarters, every place has an owner and people, quarters have a headman, rumours have one lie", () => {
  const society = citySociety(port);
  assert.deepEqual(JSON.stringify(citySociety(generateCity({ seed: "harbour", era: "medieval", population: 20, coast: Math.PI / 2, river: 0, walls: true, citadel: true }))), JSON.stringify(society), "the same town, the same people");
  assert.ok(society.factions.length >= 2 && society.factions.every((f) => Object.values(f.influence).every((share) => share >= 0 && share <= 1)));
  assert.ok(society.wards.some((w) => w.faction), "someone holds some quarter");
  assert.equal(society.places.length, port.landmarks.length, "every place has an owner");
  for (const place of society.places) {
    assert.ok(place.owner.name.length > 2);
    if (place.rumours.length >= 2) assert.equal(place.rumours.filter((r) => !r.true).length, 1);
  }
  const seat = society.factions.find((f) => f.seat !== null);
  if (seat) assert.equal(society.places.find((p) => p.landmark === seat.seat)!.faction, seat.id, "a seat answers to its faction");
  for (const ward of society.wards.filter((w) => port.wards.find((x) => x.id === w.ward)?.urban)) assert.ok(ward.headman.name && ward.traits.length === 2 && ward.rumours.length >= 2);
  const shops = cityShops(port);
  assert.ok(shops.length > 20 && shops.every((shop) => craftsOf("medieval").includes(shop.craft)));
  assert.ok(shops.filter((shop) => shop.address).every((shop) => shop.address!.number > 0 && shop.address!.name), "shops have addresses");
  const tints = influenceTints(port);
  assert.ok(tints.length && tints.every((tint) => /^#/u.test(tint.color)));
  assert.doesNotMatch(renderCity(port, { tints, mark: { landmark: port.landmarks[0].id, building: 5 } }), /NaN|undefined|Infinity/u);
});

test("a bigger town has more places; the world gives a capital its palace, a faith its temples, magic a tower, nomads their tents", () => {
  const small = generateCity({ seed: "grow", era: "medieval", population: 6 });
  const big = generateCity({ seed: "grow", era: "medieval", population: 60 });
  const count = (city: typeof big, kind: string) => city.landmarks.filter((l) => l.kind === kind).length;
  assert.ok(count(big, "tavern") > count(small, "tavern") && count(big, "temple") > count(small, "temple"), "more taverns and parish churches");
  const world = generateCity({ seed: "world", era: "medieval", population: 35, capital: true, faith: { name: "Sun", deity: "Ulma", holy: true }, magic: 2, nomads: true, walls: true });
  assert.ok(world.landmarks.some((l) => l.kind === "palace"), "a palace");
  assert.ok(world.landmarks.some((l) => l.kind === "cathedral" && l.deity === "Ulma"), "a cathedral of the god");
  assert.ok(world.landmarks.filter((l) => l.kind === "temple").every((l) => l.deity === "Ulma"), "temples dedicated");
  assert.ok(world.landmarks.some((l) => l.kind === "mage-tower"), "a mage's tower");
  assert.ok(world.buildings.some((b) => b.kind === "tent") && world.landmarks.some((l) => l.kind === "tents"), "nomads' tents");
  const plain = generateCity({ seed: "world", era: "medieval", population: 35, walls: true });
  assert.deepEqual(world.buildings.slice(0, plain.buildings.length), plain.buildings, "the world's gifts are added after the town's own houses");
  const planet = generatePlanet({ seed: "roads", cells: 4000 });
  const burg = planet.burgs.slice(1).find((b) => b.walls && b.capital) ?? planet.burgs[1];
  const link = cityFromBurg(planet, burg.id, "medieval");
  assert.ok(link.params.arms && link.params.biome, "a planet's town brings its arms and its land");
  const town = generateCity(link.params, link.language);
  assert.match(renderCity(town), /coa-/u, "the arms beside the name");
  if (link.params.roads?.length && town.walls.length) assert.ok(town.gateRoads?.some((road) => road !== null), "gates know the roads they open on");
});

test("the GM's own places and quarters; the editor rebuilds one quarter and keeps every other house in its place", () => {
  const own = { id: "lodge", name: "Black Lodge", glyph: "☾", color: "#552288", description: "A lodge.", secret: "Its masters are dead.", opens: "local" as const, target: "crypt", count: 3, where: ["craftsmen" as const] };
  const city = generateCity({ seed: "edit", era: "medieval", population: 20, walls: true, coast: null, river: null, custom: { wards: [], places: [own] } });
  const lodges = city.landmarks.filter((l) => l.kind === "custom" && l.custom === "lodge");
  assert.ok(lodges.length >= 1 && lodges.every((l) => city.wards.find((w) => w.id === l.ward)?.kind === "craftsmen"), "own places in the quarters they belong in");
  assert.match(renderCity(city), /☾/u);
  assert.ok(cityLegend(city).some((section) => section.entries.some((entry) => entry.label === "Black Lodge")));
  assert.equal(localFromPlace(city, lodges[0].id)!.params.theme, "crypt", "it opens into what the GM said");
  const ward = city.wards.find((w) => w.urban && w.kind === "craftsmen" && w.buildings > 20)!;
  const guild = { id: "thieves", name: "Thieves' quarter", color: "#333333", base: "slum" as const, wealth: 0.1 };
  const edited = editCity(city, { wards: { [ward.id]: { custom: guild.id, own: guild } } });
  assert.equal(edited.wards.find((w) => w.id === ward.id)!.custom, "thieves");
  assert.equal(edited.wards.find((w) => w.id === ward.id)!.kind, "slum");
  edited.buildings.slice(0, city.buildings.length).forEach((b, k) => {
    if (city.buildings[k].ward !== ward.id || ["pier", "boat", "tent"].includes(b.kind)) assert.deepEqual(b, city.buildings[k], "another quarter's house moved");
    else assert.equal(b.kind, "gone");
  });
  assert.ok(edited.buildings.slice(city.buildings.length).every((b) => b.ward === ward.id && b.key), "new houses at the end, each with a name of its own");
  assert.deepEqual(editCity(city, { wards: { [ward.id]: { custom: guild.id, own: guild } } }).buildings, edited.buildings, "the same edit, the same houses");
  assert.notDeepEqual(editCity(city, { wards: { [ward.id]: { salt: 1 } } }).buildings.slice(city.buildings.length), editCity(city, { wards: { [ward.id]: { salt: 2 } } }).buildings.slice(city.buildings.length), "thrown again, built anew");
  assert.equal(editCity(city, null), city);
  const index = edited.buildings.findIndex((b) => b.key && !PROPS.includes(b.kind));
  assert.ok(buildingFromCity(edited, index).seed.endsWith(`building-${edited.buildings[index].key}`), "a new house has a seed of its own");
  // Places taken away, moved, turned into others and added; gates opened and bricked up.
  const tavern = city.landmarks.find((l) => l.kind === "tavern")!;
  const moved = editCity(city, { places: { removed: [city.landmarks[0].id], moved: { [String(tavern.id)]: [100, 100] }, kinds: { [String(tavern.id)]: "custom:lodge" }, added: [{ id: 999, kind: "bank", x: ward.center[0], y: ward.center[1] }] } });
  assert.ok(!moved.landmarks.some((l) => l.id === city.landmarks[0].id));
  const placed = moved.landmarks.find((l) => l.id === tavern.id)!;
  assert.ok(placed.x === 100 && placed.kind === "custom" && placed.custom === "lodge");
  assert.equal(moved.landmarks.find((l) => l.id === 999)!.ward, ward.id);
  const wall = city.walls.find((w) => !w.citadel)!;
  // A new gate on the corner of the wall farthest from the gates it has.
  const far = wall.ring.reduce((best, p) => (Math.min(...wall.gates.map((g) => Math.hypot(g[0] - p[0], g[1] - p[1]))) > Math.min(...wall.gates.map((g) => Math.hypot(g[0] - best[0], g[1] - best[1]))) ? p : best), wall.ring[0]);
  const gated = editCity(city, { gates: { removed: [wall.gates[0]], added: [far] } });
  const after = gated.walls.find((w) => !w.citadel)!;
  assert.equal(after.gates.length, wall.gates.length, "one gate shut, one opened");
  assert.ok(gated.streets.length === city.streets.length + 1 && gated.streets[gated.streets.length - 1].kind === "road", "a road out of the new gate");
  assert.doesNotMatch(renderCity(gated), /NaN|undefined|Infinity/u);
});

test("growth in rings of ages: an old core, old walls inside the new or boulevards; off, the town is as it was", () => {
  const medieval = generateCity({ seed: "rings", era: "medieval", population: 30, walls: true, growth: true });
  assert.deepEqual(medieval.growth?.ages, GROWTH_AGES.medieval);
  assert.ok(medieval.walls.some((w) => w.old) && medieval.walls.some((w) => !w.old && !w.citadel), "an old wall inside the town wall");
  assert.ok(medieval.landmarks.some((l) => l.kind === "old-gate"), "the old gates stand");
  const rings = Object.values(medieval.growth!.rings);
  assert.ok(rings.includes(0) && rings.includes(1) && rings.includes(2));
  const industrial = generateCity({ seed: "rings", era: "industrial", population: 120, growth: true });
  assert.ok(industrial.streets.some((s) => s.kind === "boulevard"), "the walls became boulevards");
  assert.ok(industrial.wards.some((w) => w.kind === "old-town"), "the old core is an old town");
  for (const city of [medieval, industrial]) assert.doesNotMatch(renderCity(city), /NaN|undefined|Infinity/u);
  const off = generateCity({ seed: "rings", era: "medieval", population: 30, walls: true });
  assert.ok(!off.growth && !off.walls.some((w) => w.old), "without the option the town grows as before");
});

test("a village strings farmsteads along its road; a hamlet is a few round a yard; both open as houses", () => {
  const village = generateCity({ seed: "village", era: "medieval", population: 0.4, settlement: "village", river: 0.5, coast: null });
  assert.ok(village.wards.filter((w) => w.kind === "farmstead").length >= 6);
  assert.ok(village.buildings.filter((b) => b.kind === "house").length >= 6 && village.buildings.some((b) => b.kind === "field"));
  for (const kind of ["temple", "tavern", "market-well"]) assert.ok(village.landmarks.some((l) => l.kind === kind), `a village has its ${kind}`);
  const hamlet = generateCity({ seed: "hamlet", era: "renaissance", population: 0.03, settlement: "hamlet", river: null, coast: null });
  const houses = hamlet.buildings.filter((b) => b.kind === "house").length;
  assert.ok(houses >= 1 && houses <= 4, `${houses} houses in a hamlet`);
  for (const city of [village, hamlet]) {
    assert.doesNotMatch(renderCity(city), /NaN|undefined|Infinity/u);
    const index = city.buildings.findIndex((b) => b.kind === "house");
    assert.ok(generateBuilding(buildingFromCity(city, index)).floors.length >= 1);
    citySociety(city);
  }
});

test("hills and a lake: contours drawn, the citadel on the heights, nothing built in the lake, the steepest slopes left empty", () => {
  const hilly = generateCity({ seed: "hills", era: "medieval", population: 25, relief: 0.9, lake: true, citadel: true, walls: true, river: null, coast: null });
  const height = heightField(hilly.params)!;
  assert.ok(hilly.lake);
  for (const b of hilly.buildings) for (const p of b.polygon) assert.ok(!pointInPolygon(p, hilly.lake!), `a ${b.kind} stands in the lake`);
  const castle = hilly.wards.find((w) => w.kind === "castle");
  if (castle) {
    const rim = hilly.wards.filter((w) => w.urban && w.id !== castle.id).map((w) => height(w.center)).sort((a, b) => a - b);
    assert.ok(height(castle.center) >= rim[Math.floor(rim.length / 2)], "the citadel stands high");
  }
  const flat = generateCity({ seed: "hills", era: "medieval", population: 25, citadel: true, walls: true, river: null, coast: null });
  assert.ok(hilly.buildings.length < flat.buildings.length && hilly.buildings.length > flat.buildings.length * 0.6, "a few slopes left empty");
  assert.match(renderCity(hilly), /opacity="0.55"/u, "contours");
});

test("tiers by age, and the ways down: rooftops over an old town, vaults after the fall, halls and crypts open as local maps", () => {
  const tiers = cityTiers(port);
  assert.ok(tiers.upper.rooftops.length > 50 && tiers.upper.planks.length > 5 && tiers.upper.lookouts.length > 0, "rooftops, planks, lookouts");
  assert.doesNotMatch(renderTier(port, tiers, "upper"), /NaN|undefined|Infinity/u);
  assert.equal(tierLegend(tiers, "upper")[0].key, "tier.upper.old");
  const fallen = cityTiers(generateCity({ seed: "fallen", era: "post-apocalypse", population: 6 }));
  assert.equal(fallen.under.halls[0].purpose, "vault");
  const hall = localFromHall(port, tiers, tiers.under.halls[0].id)!;
  assert.equal(hall.params.theme, "crypt", "an ossuary opens as a crypt");
  const temple = port.landmarks.find((l) => l.kind === "temple")!;
  assert.equal(localFromPlace(port, temple.id)!.params.theme, "crypt");
  assert.equal(localFromPlace(port, port.landmarks.find((l) => l.kind === "tavern")!.id), null, "a tavern has no crypt");
  assert.equal(localOutskirts({ ...port, params: { ...port.params, biome: "taiga" } }).params.theme, "taiga");
  // A place seen up close opens as the same house as on the whole map.
  const ward = port.wards.find((w) => w.urban && port.landmarks.some((l) => l.ward === w.id && l.kind === "tavern"))!;
  const close = generateDistrict(port, ward.id);
  const place = close.landmarks.find((l) => l.kind === "tavern")!;
  const index = port.buildings.findIndex((b) => !PROPS.includes(b.kind) && pointInPolygon([port.landmarks.find((l) => l.id === place.id)!.x, port.landmarks.find((l) => l.id === place.id)!.y], b.polygon));
  assert.equal(place.origin, index, "the close-up's place knows its house");
});

console.log(`city: ${passed} regressions passed`);
