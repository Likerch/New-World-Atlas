// Galaxy and star-system regressions: run with `npm test`.
import assert from "node:assert/strict";
import { anomalyDistance, anomalyPoint, bodyCode, buildingOfSite, localOfBelt, systemLegend, cityOfBody, cleanGalaxyEdits, cleanKind, cosmicHooks, editGalaxy, editUniverse, emptyGalaxyEdits, filamentPath, galaxyOfNode, generateUniverse, localFromStar, localOfSite, openingOfAnomaly, powersOf, renameGalaxy, renderUniverse, shapeOf, siteOfStar, skyOf, starLore, surveyGalaxy, systemLore, tradeCodes, GALAXY_SHAPES, generateGalaxy, generateLoneSystem, generatePlanet, generateSystem, planetFromBody, renderGalaxy, renderSystem, type SpaceFeature } from "../src/core/index";

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

test("every galaxy shape is one connected network of hyperlanes, and powers hold their capitals", () => {
  for (const shape of GALAXY_SHAPES) {
    const galaxy = generateGalaxy({ seed: `net-${shape}`, shape, stars: 400 });
    const next = galaxy.stars.map(() => [] as number[]);
    for (const [a, b] of galaxy.lanes) next[a].push(b), next[b].push(a);
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length) for (const to of next[queue.shift()!]) if (!seen.has(to)) (seen.add(to), queue.push(to));
    assert.equal(seen.size, galaxy.stars.length, `${shape}: ${galaxy.stars.length - seen.size} stars cut off`);
    for (const empire of galaxy.empires.slice(1)) assert.equal(galaxy.stars[empire.capital].empire, empire.id);
    assert.doesNotMatch(renderGalaxy(galaxy, { script: "cyrillic", highlight: 1 }), /NaN|undefined|Infinity/u);
  }
});

test("systems are reproducible, orbits widen outwards, living worlds sit in the habitable zone", () => {
  const galaxy = generateGalaxy({ seed: "orbits" });
  let living = 0;
  for (const star of galaxy.stars.slice(0, 80)) {
    const system = generateSystem(galaxy, star.id);
    assert.equal(JSON.stringify({ ...generateSystem(galaxy, star.id), language: null }), JSON.stringify({ ...system, language: null }));
    for (let k = 1; k < system.bodies.length; k++) assert.ok(system.bodies[k].orbit > system.bodies[k - 1].orbit);
    // A power's homeworld is made home wherever it lies; other living worlds keep to the zone.
    for (const body of system.bodies.filter((b) => b.habitable && !b.homeworld)) {
      living++;
      assert.ok(body.orbit >= system.zone[0] - 1e-9 && body.orbit <= system.zone[1] + 1e-9, `${body.name} lives outside the zone`);
    }
    assert.doesNotMatch(renderSystem(system), /NaN|undefined|Infinity/u);
  }
  assert.ok(living > 0, "some worlds are habitable");
});

test("galaxies and the universe hold wonders and regions of trouble; the game master's own kinds land without moving anything else", () => {
  const plain = generateGalaxy({ seed: "strange" });
  assert.ok(plain.zones.length >= 3 && plain.stars.some((s) => s.feature === "graveyard" || s.feature === "mining" || s.feature === "beacon" || s.feature === "jump-gate"), "regions and new wonders by default");
  const calm = generateGalaxy({ seed: "strange", anomalies: 0 });
  assert.equal(calm.zones.length, 0);
  assert.ok(calm.stars.every((s) => !s.feature || s.feature === "wormhole"), "no strangeness asked, none given");
  const custom = [{ id: "hive", name: "Hive", glyph: "✹", color: "#ff9f1a", count: 5, where: "unclaimed" as const, area: false }, { id: "storm", name: "", glyph: "≈", color: "#7cf6ff", count: 3, where: "anywhere" as const, area: true }];
  const own = generateGalaxy({ seed: "strange", custom });
  assert.equal(own.stars.filter((s) => s.custom === "hive").length, 5);
  assert.ok(own.stars.filter((s) => s.custom === "hive").every((s) => s.empire === 0), "unclaimed means unclaimed");
  assert.equal(own.zones.filter((z) => z.custom === "storm").length, 3);
  assert.deepEqual(own.stars.map((s) => s.feature), plain.stars.map((s) => s.feature), "adding kinds moves no wonder");
  assert.deepEqual(own.zones.filter((z) => z.kind !== "custom"), plain.zones);
  assert.doesNotMatch(renderGalaxy(own, { highlightZone: 0 }), /NaN|undefined|Infinity/u);
  const universe = generateUniverse({ seed: "strange", galaxies: 200, custom });
  assert.ok(universe.anomalies.filter((a) => a.kind !== "custom").length >= 4, "the universe has its strange things");
  assert.equal(universe.anomalies.filter((a) => a.custom === "hive").length, 5);
  assert.deepEqual(universe.galaxies, generateUniverse({ seed: "strange", galaxies: 200 }).galaxies, "custom kinds leave the galaxies alone");
  assert.doesNotMatch(renderUniverse(universe, { highlightAnomaly: 2 }), /NaN|undefined|Infinity/u);
});

test("a star system of its own comes from its seed and keeps the star and people asked for", () => {
  const made = generateLoneSystem({ seed: "lone", spectral: "K", settled: true });
  assert.equal(JSON.stringify({ ...generateLoneSystem({ seed: "lone", spectral: "K", settled: true }), language: null }), JSON.stringify({ ...made, language: null }));
  assert.equal(made.spectral, "K");
  assert.ok(made.settled && made.empire && made.bodies.length > 0);
  assert.equal(generateLoneSystem({ seed: "lone", settled: false }).bodies.reduce((sum, b) => sum + b.population, 0), 0, "nobody lives in an unsettled system");
  assert.doesNotMatch(renderSystem(made), /NaN|undefined|Infinity/u);
});

test("a world of a system opens as a planet with its name and climate", () => {
  const galaxy = generateGalaxy({ seed: "worlds" });
  const system = galaxy.stars.map((star) => generateSystem(galaxy, star.id)).find((s) => s.bodies.some((b) => b.habitable))!;
  const body = system.bodies.find((b) => b.habitable)!;
  const params = planetFromBody(system, body.id);
  const planet = generatePlanet({ ...params, cells: 3000 });
  assert.equal(planet.name, body.name);
  assert.equal(planet.params.temperatureEquator, params.temperatureEquator);
});

test("the universe strings its galaxies along void walls, and each galaxy opens in its own shape", () => {
  const universe = generateUniverse({ seed: "web", galaxies: 200 });
  assert.ok(universe.galaxies.length > 150, `${universe.galaxies.length} galaxies`);
  for (const g of universe.galaxies) for (const v of universe.voids) assert.ok(Math.hypot(g.x - v.x, g.y - v.y) >= v.r * 0.8 - 1e-6, "no galaxy deep inside a void");
  assert.ok(universe.filaments.length > universe.galaxies.length * 0.8, "a web, not scattered dots");
  assert.doesNotMatch(renderUniverse(universe, { highlight: 3 }), /NaN|undefined|Infinity/u);
  const barred = universe.galaxies.find((g) => g.kind === "barred")!;
  const galaxy = generateGalaxy({ seed: `web/galaxy-${barred.id}`, shape: shapeOf(barred.kind), stars: barred.stars });
  assert.equal(galaxy.params.shape, "barred");
});

test("more galaxies leave the first ones as they were; a galaxy opens as the universe shows it", () => {
  const few = generateUniverse({ seed: "growth", galaxies: 200 });
  const many = generateUniverse({ seed: "growth", galaxies: 300 });
  for (const g of few.galaxies) {
    const same = many.galaxies[g.id];
    assert.equal(same.name, g.name, `galaxy ${g.id} was renamed`);
    assert.equal(same.kind, g.kind, `galaxy ${g.id} changed its kind`);
  }
  const node = few.galaxies.find((g) => g.civilisations > 0)!;
  const empty = few.galaxies.find((g) => g.civilisations === 0)!;
  const galaxy = generateGalaxy({ seed: `growth/galaxy-${node.id}`, shape: shapeOf(node.kind), stars: node.stars, name: node.name, empires: node.civilisations });
  assert.equal(galaxy.name, node.name);
  assert.equal(galaxy.empires.length - 1, node.civilisations);
  assert.equal(generateGalaxy({ seed: `growth/galaxy-${empty.id}`, empires: 0 }).empires.length, 1, "a galaxy without civilisations has no powers");
  const wall = { id: 0, kind: "bubble-wall" as const, x: 500, y: 500, angle: 0.4, size: 200, name: "" };
  const [ax, ay] = anomalyPoint(wall);
  assert.ok(anomalyDistance(wall, ax + 2, ay) < 3, "a bubble's wall is picked on its arc");
  assert.ok(anomalyDistance(wall, 500, 500) > 50, "not at its empty middle");
});

test("a galaxy holds the stars and powers asked, names each star once, keeps its wonders out of wormholes", () => {
  for (const shape of GALAXY_SHAPES) {
    const galaxy = generateGalaxy({ seed: `count-${shape}`, shape, stars: 1500, empires: 12 });
    assert.ok(galaxy.stars.length >= 1450, `${shape}: ${galaxy.stars.length} of 1500 stars`);
    assert.equal(galaxy.empires.length - 1, 12, `${shape}: ${galaxy.empires.length - 1} of 12 powers`);
    assert.equal(new Set(galaxy.stars.map((star) => star.name)).size, galaxy.stars.length, `${shape}: a star name repeats`);
    for (const empire of galaxy.empires.slice(1)) assert.ok(generateSystem(galaxy, empire.capital).bodies.some((b) => b.habitable), `${shape}: ${empire.name} has no home`);
  }
  assert.equal(generateGalaxy({ seed: "calm", anomalies: 0 }).wormholes.length, 0, "wormholes in a galaxy with no strangeness");
  const named = renameGalaxy(generateGalaxy({ seed: "calm" }), { "nebula:0": "Veil" });
  assert.equal(named.nebulae[0].name, "Veil");
});

test("a black hole is drawn dark and its worlds keep a heavy star's year; a dead world opens with nobody on it", () => {
  const hole = generateLoneSystem({ seed: "dark", spectral: "BH" });
  assert.match(renderSystem(hole), /fill="#000" stroke="#ffb35c"/u);
  for (const body of hole.bodies) assert.equal(body.year, Math.round(365.25 * Math.sqrt(body.orbit ** 3 / 10)));
  for (let k = 0; k < 40; k++) {
    const system = generateLoneSystem({ seed: `dead-${k}`, settled: false });
    const lava = system.bodies.find((b) => !b.habitable && !b.population && !["gas-giant", "ice-giant", "belt"].includes(b.kind));
    if (!lava) continue;
    const params = planetFromBody(system, lava.id);
    assert.equal(params.lifeless, true);
    const world = generatePlanet({ ...params, cells: 3000 });
    assert.equal(world.burgs.length, 1, "towns on a dead world");
    assert.equal(world.states.length, 1, "realms on a dead world");
    assert.ok(world.culture.every((c) => c === 0), "peoples on a dead world");
    assert.doesNotMatch(renderSystem(system), /NaN|undefined/u);
    return;
  }
});


test("every star has a world profile read off its real system, the same on the galaxy map and in the system", () => {
  const galaxy = generateGalaxy({ seed: "profiles", stars: 400 });
  const survey = surveyGalaxy(galaxy);
  assert.equal(survey.worlds.length, galaxy.stars.length);
  for (const star of galaxy.stars.slice(0, 120)) {
    const world = survey.worlds[star.id];
    assert.match(world.code, /^[ABCDEX][0-9A-F]{6}-[0-9A-F]$/u, world.code);
    assert.deepEqual(generateSystem(galaxy, star.id).profile, world, `${star.name}: the system tells another profile`);
    assert.deepEqual(world.trade, tradeCodes(world));
    assert.equal(world.trade.includes("Hi"), world.population >= 9);
    if (!star.settled && !star.natives && !world.people) assert.equal(world.starport, "X");
  }
  for (const empire of galaxy.empires.slice(1)) assert.ok(["A", "B"].includes(survey.worlds[empire.capital].starport), `${empire.name}'s capital has a poor port`);
  const settled = survey.worlds.filter((w) => w.population > 0);
  assert.ok(settled.some((w) => w.tags.length === 2) && new Set(settled.flatMap((w) => w.tags)).size > 8, "worlds carry a range of tags");
  assert.equal(JSON.stringify(surveyGalaxy(generateGalaxy({ seed: "profiles", stars: 400 })).worlds), JSON.stringify(survey.worlds), "profiles are reproducible");
});

test("free worlds and natives: settled with nobody's flag, natives kept apart and out of bounds", () => {
  const galaxy = generateGalaxy({ seed: "free", stars: 700 });
  const free = galaxy.stars.filter((s) => s.independent);
  assert.ok(free.length > 3 && free.every((s) => !s.empire && s.settled), "free worlds are settled and unclaimed");
  const natives = galaxy.stars.filter((s) => s.natives);
  assert.ok(natives.length > 3, "some stars have natives");
  for (const star of natives) {
    const system = generateSystem(galaxy, star.id);
    const home = system.bodies.find((b) => b.natives);
    assert.ok(home && home.habitable && home.population > 0 && home.biosphere === "sapient", `${star.name}: natives without a living world`);
    if (!star.settled) assert.equal(system.profile.zone, "red", "an untouched natives' world is interdicted");
    assert.ok(system.nativeTongue, "natives speak a tongue of their own");
  }
  const system = generateSystem(galaxy, free[0].id);
  assert.ok(system.language && system.bodies.some((b) => b.population), "a free world has people and a tongue");
});

test("the setting reaches the stars without moving them: forms follow its rule, technology its age", () => {
  const plain = generateGalaxy({ seed: "ages" });
  const faith = generateGalaxy({ seed: "ages" }, { era: "far-future", tech: 9.5, rule: "faith" });
  assert.deepEqual(faith.stars.map((s) => [s.name, s.x, s.empire]), plain.stars.map((s) => [s.name, s.x, s.empire]));
  assert.deepEqual(faith.lanes, plain.lanes);
  assert.ok(faith.empires.slice(1).filter((e) => e.form === "theocracy").length > plain.empires.slice(1).filter((e) => e.form === "theocracy").length);
  const stone = surveyGalaxy(generateGalaxy({ seed: "ages", stars: 300 }, { era: "industrial", tech: 5.5 }));
  const future = surveyGalaxy(generateGalaxy({ seed: "ages", stars: 300 }));
  const best = (worlds: typeof stone.worlds) => Math.max(...worlds.map((w) => w.tech));
  assert.ok(best(stone.worlds) < best(future.worlds), "an industrial age is not a far-future one");
  assert.deepEqual(generateGalaxy({ seed: "ages" }, {}).stars, plain.stars, "the classic world is the far future among the stars");
});

test("lanes: trade arteries, border crossings, dangers, and the only way through", () => {
  const galaxy = generateGalaxy({ seed: "lanes", stars: 500 });
  const survey = surveyGalaxy(galaxy);
  assert.equal(survey.lanes.length, galaxy.lanes.length);
  assert.ok(survey.lanes.some((l) => l.trade === 3) && survey.lanes.some((l) => l.trade === 0), "some lanes carry the trade, some do not");
  galaxy.lanes.forEach(([a, b], k) => assert.equal(survey.lanes[k].border, galaxy.stars[a].empire !== galaxy.stars[b].empire && (galaxy.stars[a].empire > 0 || galaxy.stars[b].empire > 0)));
  // Cut every lane across the middle but one: that one is the chokepoint.
  const middle = galaxy.params.width / 2;
  const crossing = galaxy.lanes.filter(([a, b]) => (galaxy.stars[a].x - middle) * (galaxy.stars[b].x - middle) < 0);
  const kept = crossing[0];
  const cut = editGalaxy(galaxy, { ...emptyGalaxyEdits(), cut: crossing.slice(1) });
  const after = surveyGalaxy({ ...cut, wormholes: [], gates: [] });
  const lane = cut.lanes.findIndex(([a, b]) => (a === kept[0] && b === kept[1]) || (a === kept[1] && b === kept[0]));
  assert.ok(after.lanes[lane].choke, "the last lane across is a chokepoint");
  assert.ok(after.chokes[kept[0]] || after.chokes[kept[1]], "and its stars are too");
});

test("powers in depth: rulers, banners, ways, and relations that agree from both sides", () => {
  const galaxy = generateGalaxy({ seed: "powers", empires: 8 });
  const survey = surveyGalaxy(galaxy);
  for (const power of survey.powers.slice(1)) {
    assert.ok(power.leader.name && power.heir.role === "heir" && power.ethos.length >= 1);
    assert.ok(["flag", "logo", "arms"].includes(power.emblem.kind));
    for (const [other, relation] of Object.entries(power.relations)) {
      const back = survey.powers[Number(other)].relations[power.id];
      assert.equal(back, relation === "overlord" ? "vassal" : relation === "vassal" ? "overlord" : relation, "relations disagree");
    }
  }
  assert.ok(survey.sectors.length >= galaxy.empires.length - 1, "each big power has its sectors");
  assert.ok(galaxy.stars.every((s) => !s.empire || survey.sectorOf[s.id] >= 0 || galaxy.empires[s.empire].stars < 6), "every star of a big power is in a sector");
});

test("the game master's galaxy edits: repaint, move a capital, draw and cut lanes, join gates; ids stay", () => {
  const galaxy = generateGalaxy({ seed: "edits", empires: 4 });
  assert.equal(editGalaxy(galaxy, emptyGalaxyEdits()), galaxy, "no edits, the same galaxy");
  const capital = galaxy.empires[1].capital;
  const other = galaxy.stars.find((s) => s.empire === 1 && !s.capital)!;
  const far = galaxy.stars.find((s) => s.empire === 2 && !s.capital)!;
  const [a, b] = galaxy.lanes[0];
  const edits = { ...emptyGalaxyEdits(), stars: { [far.id]: { empire: 1, spectral: "BH" as const }, [capital]: { empire: 3 } }, capitals: { 1: other.id }, cut: [[a, b] as [number, number]], added: [[capital, far.id] as [number, number]], gates: [[capital, far.id] as [number, number]] };
  const edited = editGalaxy(galaxy, cleanGalaxyEdits(JSON.parse(JSON.stringify(edits))));
  assert.equal(edited.stars.length, galaxy.stars.length);
  assert.equal(edited.stars[far.id].empire, 1);
  assert.equal(edited.stars[far.id].spectral, "BH");
  assert.equal(edited.empires[1].capital, other.id);
  assert.ok(edited.stars[other.id].capital && !edited.stars[capital].capital, "the capital moved");
  assert.equal(edited.stars[capital].empire, 3, "the old capital can change hands once it is no longer one");
  assert.ok(!edited.lanes.some(([x, y]) => (x === a && y === b) || (x === b && y === a)) && edited.lanes.some(([x, y]) => x === capital && y === far.id));
  assert.ok(edited.gates.some(([x, y]) => x === capital && y === far.id) && edited.stars[capital].feature === "jump-gate");
  assert.equal(edited.empires.reduce((sum, e) => sum + e.stars, 0), galaxy.stars.length, "stars counted once");
  assert.equal(cleanGalaxyEdits({ stars: { x: 1 }, cut: [[1, "a"]], capitals: { 2: "z" } })!.cut.length, 0, "a file's nonsense is dropped");
});

test("a system holds its star's wonder where it belongs: pirates in the belt, a prison on a moon, a shell round the star", () => {
  const where = (feature: SpaceFeature) => {
    for (let k = 0; k < 30; k++) {
      const system = generateLoneSystem({ seed: `site-${feature}-${k}`, feature, spectral: "G", worlds: 9 });
      const site = system.sites.find((s) => s.main);
      if (site) return { system, site };
    }
    throw new Error(`no ${feature} placed`);
  };
  const pirates = where("pirate-base");
  const belt = pirates.system.bodies.find((b) => b.kind === "belt");
  if (belt) assert.equal(pirates.site.body, belt.id, "pirates hide in the belt");
  const prison = where("prison");
  assert.ok(prison.site.moon !== undefined || prison.site.body !== null, "a prison is on a world or a moon");
  const shell = where("dyson-sphere");
  assert.equal(shell.site.kind, "dyson-shell");
  assert.ok(shell.site.orbit < shell.system.frost, "the shell is round the star");
  const gate = where("jump-gate");
  assert.ok(gate.site.orbit >= Math.max(...gate.system.bodies.map((b) => b.orbit)), "the gate stands at the edge");
  for (const { system } of [pirates, prison, shell, gate]) assert.doesNotMatch(renderSystem(system, { view: "orbits", day: 400, style: "orrery" }), /NaN|undefined|Infinity/u);
});

test("worlds and moons are described: life, gravity, day, sky and calendar; a settled system has stations and factions", () => {
  const galaxy = generateGalaxy({ seed: "worlds2" });
  const capital = galaxy.empires[1].capital;
  const system = generateSystem(galaxy, capital);
  const home = system.bodies.find((b) => b.homeworld)!;
  assert.ok(home && home.biosphere === "sapient", "a capital's homeworld is marked, its people its own");
  for (const body of system.bodies) {
    assert.ok(body.biosphere && body.gravity !== undefined && body.day !== undefined && body.habitability !== undefined);
    for (const moon of body.moons) assert.ok((moon.orbit ?? 0) > 0, "every moon has an orbit");
  }
  const sky = skyOf(system, home.id)!;
  assert.ok(sky.sunLight > 0.2 && sky.sunLight < 5, `a habitable world's sun is not ${sky.sunLight}× ours`);
  assert.ok(sky.year > 0 && (sky.day === 0 || (sky.localYear ?? 0) > 0));
  assert.ok(system.sites.some((s) => s.kind === "highport"), "a capital has a highport");
  const lore = systemLore(system, galaxy, surveyGalaxy(galaxy));
  assert.ok(lore.factions.length >= 2 && lore.people.length >= 2);
  assert.deepEqual(lore.people, starLore(galaxy, surveyGalaxy(galaxy), capital).people, "the same people on the galaxy map and in the system");
  const told = lore.rumours;
  assert.ok(told.length === 3 && told.filter((r) => !r.true).length === 1, "three rumours, one false");
  const lonely = generateLoneSystem({ seed: "m-dwarf", spectral: "M", worlds: 3 });
  assert.ok(lonely.bodies.some((b) => b.orbit < 0.4 && b.day === 0), "close worlds of a red dwarf keep one face to it");
});

test("the game master's system edits: another kind, people, a station, worlds put in and taken out, ids kept", () => {
  const plain = generateLoneSystem({ seed: "sys-edit", spectral: "G", worlds: 6, settled: false });
  const target = plain.bodies.find((b) => b.kind !== "belt")!;
  const edited = generateLoneSystem({ seed: "sys-edit", spectral: "G", worlds: 6, settled: false }, null, { bodies: { [target.id]: { kind: "ocean", population: 1500, station: true } }, added: [{ orbit: 0.9, kind: "terran", angle: 0.2 }], removed: [plain.bodies[plain.bodies.length - 1].id], owner: "Nevar" });
  const changed = edited.bodies.find((b) => b.id === target.id)!;
  assert.ok(changed.kind === "ocean" && changed.habitable && changed.population === 1500 && changed.station);
  assert.ok(edited.bodies.find((b) => b.added)!.id >= plain.bodies.length, "a new world takes a new id");
  assert.ok(edited.bodies.find((b) => b.id === plain.bodies[plain.bodies.length - 1].id)!.removed, "a world taken out is marked, its id kept");
  assert.equal(edited.empire, "Nevar");
  assert.ok(edited.profile.population >= 9, "the profile follows the edits");
  assert.ok(edited.sites.some((s) => s.body === target.id), "a station set down is a place");
  assert.doesNotMatch(renderSystem(edited), /NaN|undefined|Infinity/u);
});

test("a lone system's knobs keep the worlds already there; a companion and a wonder on request", () => {
  const few = generateLoneSystem({ seed: "knobs", spectral: "K", worlds: 3 });
  const many = generateLoneSystem({ seed: "knobs", spectral: "K", worlds: 8 });
  assert.equal(many.bodies.length, 8);
  assert.deepEqual(many.bodies.slice(0, 3).map((b) => [b.name, b.kind, b.orbit]), few.bodies.map((b) => [b.name, b.kind, b.orbit]));
  assert.ok(generateLoneSystem({ seed: "knobs", companion: true }).companion);
  assert.equal(generateLoneSystem({ seed: "knobs", companion: false }).companion, null);
  assert.ok(generateLoneSystem({ seed: "knobs", feature: "ringworld" }).sites.some((s) => s.kind === "ringworld"));
});

test("a world opens as a planet in its own age; natives in theirs; a dead world without people", () => {
  const galaxy = generateGalaxy({ seed: "ages2" });
  const capital = galaxy.empires[1].capital;
  const system = generateSystem(galaxy, capital);
  const home = system.bodies.find((b) => b.homeworld)!;
  const params = planetFromBody(system, home.id);
  assert.equal(params.setting?.era, "far-future", "a high-tech homeworld opens in the far future");
  assert.ok((params.setting?.density ?? 0) > 0.25);
  const native = galaxy.stars.find((s) => s.natives && !s.settled)!;
  const tribe = generateSystem(galaxy, native.id);
  const world = tribe.bodies.find((b) => b.natives)!;
  assert.ok(["stone", "ancient", "medieval"].includes(planetFromBody(tribe, world.id).setting!.era!), "natives open in their own age");
  const dead = system.bodies.find((b) => !b.population && !b.habitable && b.kind !== "belt" && b.kind !== "gas-giant" && b.kind !== "ice-giant");
  if (dead) assert.ok(planetFromBody(system, dead.id).lifeless && !planetFromBody(system, dead.id).setting);
  const giant = system.bodies.find((b) => b.moons.length);
  if (giant) assert.match(planetFromBody(system, giant.id, 0).seed!, /moon-0$/u, "a moon opens as a world of its own");
  const planet = generatePlanet({ ...params, cells: 3000 });
  assert.equal(planet.name, home.name);
});

test("every point of interest opens as its own map; the old six as they were; stations as buildings, colonies as cities", () => {
  const galaxy = generateGalaxy({ seed: "links", anomalies: 3 });
  for (const star of galaxy.stars.filter((s) => s.feature)) {
    const site = siteOfStar(galaxy, star.id);
    assert.ok(site, `${star.feature} opens nothing`);
    const old = localFromStar(galaxy, star.id);
    if (old) assert.deepEqual([site!.params.seed, site!.params.theme, site!.params.kind], [old.params.seed, old.params.theme, old.params.kind], `${star.feature} moved its map`);
    const system = generateSystem(galaxy, star.id);
    const main = system.sites.find((s) => s.main);
    if (main && localOfSite(system, main)) assert.equal(localOfSite(system, main)!.params.seed, site!.params.seed, "the same place from the galaxy and from the system");
  }
  const capital = generateSystem(galaxy, galaxy.empires[1].capital);
  const port = capital.sites.find((s) => s.kind === "highport")!;
  assert.equal(buildingOfSite(capital, port)!.type, "hab");
  const settled = capital.bodies.find((b) => b.population && !b.natives)!;
  assert.ok((cityOfBody(capital, settled.id)!.params.population ?? 0) > 0);
});

test("the game master's own things: what they are, secret from the players, what they open into", () => {
  const kind = cleanKind({ id: "hive", name: "Hive", glyph: "✹", count: 3, where: "unclaimed", about: "A nest.", secret: true, opens: "cave" }, 0);
  assert.deepEqual([kind.about, kind.secret, kind.opens], ["A nest.", true, "cave"]);
  assert.equal(cleanKind({ opens: "nowhere" as never }, 0).opens, undefined);
  const galaxy = generateGalaxy({ seed: "secret", custom: [kind] });
  const at = galaxy.stars.find((s) => s.custom === "hive")!;
  assert.ok(at);
  assert.ok(renderGalaxy(galaxy).includes("✹") && !renderGalaxy(galaxy, { players: true }).includes("✹"), "the players do not see a secret thing");
  const system = generateLoneSystem({ seed: "secret", custom: [{ ...kind, where: "moons", count: 2 }] });
  assert.equal(system.sites.filter((s) => s.custom === "hive").length, 2);
});

test("the universe keeps its old galaxies; scales, ages and cosmologies; powers spread along the filaments", () => {
  const plain = generateUniverse({ seed: "cosmos", galaxies: 250 });
  const explicit = generateUniverse({ seed: "cosmos", galaxies: 250, clusters: 7, voids: 12, civilisations: 0.3, epoch: "now", scale: "web", cosmology: "web" });
  assert.deepEqual(explicit.galaxies, plain.galaxies, "the knobs at their defaults change nothing");
  assert.ok(plain.powers.length > 0);
  const next = plain.galaxies.map(() => [] as number[]);
  for (const [a, b] of plain.filaments) (next[a].push(b), next[b].push(a));
  for (const power of plain.powers) {
    // Every galaxy a power holds is reached from its home through galaxies it holds.
    const held = new Set(plain.galaxies.filter((g) => g.power === power.id).map((g) => g.id));
    const seen = new Set([power.home]);
    for (const queue = [power.home]; queue.length; ) for (const to of next[queue.shift()!]) if (held.has(to) && !seen.has(to)) (seen.add(to), queue.push(to));
    assert.equal(seen.size, held.size, `${power.name} holds a galaxy cut off from it`);
  }
  for (const g of plain.galaxies) for (const kind of g.touched ?? []) assert.ok(plain.anomalies.some((a) => a.kind === kind && anomalyDistance(a, g.x, g.y) < 140));
  const old = generateUniverse({ seed: "cosmos", galaxies: 250, epoch: "old" });
  const young = generateUniverse({ seed: "cosmos", galaxies: 250, epoch: "young" });
  const count = (u: typeof old, kinds: string[]) => u.galaxies.filter((g) => kinds.includes(g.kind)).length;
  assert.ok(count(old, ["elliptical", "lenticular"]) > count(young, ["elliptical", "lenticular"]) && count(young, ["irregular", "starburst", "quasar"]) > count(old, ["irregular", "starburst", "quasar"]));
  const group = generateUniverse({ seed: "cosmos", scale: "group" });
  assert.ok(group.galaxies.length <= 80 && group.scale < plain.scale);
  const spheres = generateUniverse({ seed: "cosmos" }, { era: "medieval", tech: 3, magic: 3 });
  assert.equal(spheres.params.cosmology, "spheres", "a world of magic sees crystal spheres");
  const planes = generateUniverse({ seed: "cosmos", cosmology: "planes" });
  assert.ok(planes.galaxies.some((g) => g.plane === "material") && planes.galaxies.every((g) => g.plane));
  for (const u of [plain, group, spheres, planes, generateUniverse({ seed: "cosmos", scale: "supercluster" })]) assert.doesNotMatch(renderUniverse({ ...u, home: 1 }, { borders: true, hereLabel: "here", ruler: [0, 1], rulerLabel: "x" }), /NaN|undefined|Infinity/u);
});

test("a galaxy opens with its node: its peoples by name, the strange nearby, a gate, the far power that holds it", () => {
  const universe = generateUniverse({ seed: "nodes", galaxies: 300, anomalies: 2 });
  const held = universe.galaxies.find((g) => g.power !== undefined && g.id !== universe.powers[g.power].home && g.civilisations > 1)!;
  const params = galaxyOfNode(universe, held.id);
  const galaxy = generateGalaxy(params);
  assert.equal(galaxy.empires[1].name, universe.powers[held.power!].name, "the far power holds a branch here");
  const named = powersOf(params.seed!, params.empires!);
  assert.deepEqual(galaxy.empires.slice(2).map((e) => e.name), named.slice(1, galaxy.empires.length - 1).map((p) => p.name), "the universe names the galaxy's peoples as the galaxy will");
  const touched = universe.galaxies.find((g) => g.touched?.length)!;
  const marked = generateGalaxy(galaxyOfNode(universe, touched.id));
  assert.ok(marked.params.origin?.touched?.length, "the strange nearby comes along");
  const quiet = universe.galaxies.find((g) => !g.touched && g.power === undefined && !universe.gates.some(([a, b]) => a === g.id || b === g.id))!;
  assert.equal(galaxyOfNode(universe, quiet.id).origin, undefined, "a galaxy with nothing to bring keeps its old parameters");
  const edited = editUniverse(universe, { galaxies: { [quiet.id]: { kind: "ring", stars: 1200 } }, home: quiet.id });
  assert.equal(galaxyOfNode(edited, quiet.id).shape, "ring");
  assert.equal(edited.home, quiet.id);
  const way = filamentPath(universe, universe.filaments[0][0], universe.filaments[5][1]);
  assert.ok(way && way.path.length >= 2 && way.length > 0);
  for (const a of universe.anomalies) if (a.kind !== "custom") assert.ok(openingOfAnomaly(universe, a.id), `${a.kind} opens nothing`);
  assert.equal(cosmicHooks(universe, { kind: "galaxy", id: held.id }).length, 2);
});

test("a system inside a region of trouble shows it; every world has its code; a belt opens as a local map", () => {
  const galaxy = generateGalaxy({ seed: "regions", anomalies: 3 });
  const inside = galaxy.stars.find((s) => galaxy.zones.some((z) => z.kind !== "custom" && Math.hypot(z.x - s.x, z.y - s.y) < z.r * z.squash * 0.9))!;
  const system = generateSystem(galaxy, inside.id);
  assert.ok(system.context.zones.length > 0, "the star knows the region round it");
  assert.ok(systemLegend(system).some((section) => section.key === "legend.zones"));
  assert.doesNotMatch(renderSystem(system), /NaN|undefined|Infinity/u);
  for (const body of system.bodies) assert.match(bodyCode(system.profile, body, system.seed).code, /^[ABCDEXFGHY][0-9A-F]{6}-[0-9A-F]$/u);
  const main = system.bodies.find((b) => b.id === system.profile.body);
  if (main) assert.equal(bodyCode(system.profile, main, system.seed).code, system.profile.code);
  for (let k = 0; k < 20; k++) {
    const lone = generateLoneSystem({ seed: `belt-${k}`, worlds: 10 });
    const belt = lone.bodies.find((b) => b.kind === "belt");
    if (!belt) continue;
    assert.equal(localOfBelt(lone, belt.id)!.params.theme, "mine");
    return;
  }
});

console.log(`space: ${passed} regressions passed`);
