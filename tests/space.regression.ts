// Galaxy and star-system regressions: run with `npm test`.
import assert from "node:assert/strict";
import { GALAXY_SHAPES, generateGalaxy, generatePlanet, generateSystem, planetFromBody, renderGalaxy, renderSystem } from "../src/core/index";

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

test("a world of a system opens as a planet with its name and climate", () => {
  const galaxy = generateGalaxy({ seed: "worlds" });
  const system = galaxy.stars.map((star) => generateSystem(galaxy, star.id)).find((s) => s.bodies.some((b) => b.habitable))!;
  const body = system.bodies.find((b) => b.habitable)!;
  const params = planetFromBody(system, body.id);
  const planet = generatePlanet({ ...params, cells: 3000 });
  assert.equal(planet.name, body.name);
  assert.equal(planet.params.temperatureEquator, params.temperatureEquator);
});

console.log(`space: ${passed} regressions passed`);
