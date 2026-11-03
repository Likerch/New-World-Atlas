// Galaxy and star-system regressions: run with `npm test`.
import assert from "node:assert/strict";
import { generateUniverse, renderUniverse, shapeOf, GALAXY_SHAPES, generateGalaxy, generateLoneSystem, generatePlanet, generateSystem, planetFromBody, renderGalaxy, renderSystem } from "../src/core/index";

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
    for (const body of system.bodies.filter((b) => b.habitable)) {
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

console.log(`space: ${passed} regressions passed`);
