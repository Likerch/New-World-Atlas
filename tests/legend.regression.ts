// Map legends: every map says what is on it, and only that. Run with `npm test`.
import assert from "node:assert/strict";
import { buildingLegend, cityLegend, galaxyLegend, generateBuilding, generateCity, generateGalaxy, generateLocal, generatePlanet, generateUnderworld, generateUniverse, generateLoneSystem, legendSvg, localLegend, planetLegend, swatchSvg, systemLegend, underworldLegend, universeLegend, type LegendSection } from "../src/core/index";

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

const keys = (sections: LegendSection[]) => sections.flatMap((section) => section.entries.map((entry) => entry.key ?? entry.label ?? ""));
const sane = (sections: LegendSection[], what: string) => {
  assert.ok(sections.length > 0 && sections.every((section) => section.entries.length > 0), `${what}: empty sections`);
  for (const entry of sections.flatMap((section) => section.entries)) assert.doesNotMatch(swatchSvg(entry.swatch), /NaN|undefined|Infinity/u, `${what}: ${entry.key}`);
  const drawn = legendSvg(sections.map((section) => ({ title: section.key, entries: section.entries.map((entry) => ({ label: entry.key ?? entry.label ?? "", swatch: entry.swatch })) })), 1600, 1000, { paper: "#fff", ink: "#000" });
  assert.match(drawn, /<g class="legend"/u);
  assert.doesNotMatch(drawn, /NaN|undefined|Infinity/u, what);
};

test("a world map lists its biomes, ways and marks, and drops what a layer hides", () => {
  const planet = generatePlanet({ seed: "legend", cells: 4000 });
  const full = planetLegend(planet);
  sane(full, "planet");
  const listed = keys(full);
  assert.ok(listed.some((key) => key.startsWith("biome.")) && listed.some((key) => key.startsWith("route.")) && listed.includes("legend.capital"));
  for (const marker of planet.markers.slice(1)) assert.ok(listed.some((key) => key.startsWith(`marker.${marker.kind}@`)), `${marker.kind} missing from the legend`);
  assert.ok(!keys(planetLegend(planet, { layers: { markers: false, routes: false } })).some((key) => key.startsWith("marker.") || key.startsWith("route.")));
  sane(underworldLegend(generateUnderworld(planet)), "underworld");
});

test("a city, a floor plan and a local map list what they show", () => {
  const camp = generateCity({ seed: "legend", era: "stone", population: 0.5, walls: true, river: 0.4 });
  const camped = keys(cityLegend(camp));
  assert.ok(camped.includes("bkind.hut") && camped.includes("street.path") && camped.includes("legend.palisade") && !camped.includes("bkind.tower"));
  sane(cityLegend(generateCity({ seed: "legend", era: "cyberpunk", population: 900 }), { theme: "neon" }), "city");
  const plan = generateBuilding({ seed: "legend", type: "tavern" });
  const things = new Set(plan.floors[plan.floors.findIndex((f) => f.level === 0)].rooms.flatMap((room) => room.furniture.map((f) => `furniture.${f.kind}`)));
  assert.deepEqual(new Set(keys(buildingLegend(plan)).filter((key) => key.startsWith("furniture."))), things);
  sane(localLegend(generateLocal({ seed: "legend", kind: "dungeon" })), "dungeon");
  sane(localLegend(generateLocal({ seed: "legend", kind: "wilderness", theme: "forest" })), "wilderness");
});

test("space maps list their stars, wonders, regions and the game master's own kinds by name", () => {
  const galaxy = generateGalaxy({ seed: "legend", custom: [{ id: "hive", name: "Hive", glyph: "✹", color: "#ff9f1a", count: 3, where: "anywhere", area: false }] });
  const listed = galaxyLegend(galaxy);
  sane(listed, "galaxy");
  assert.ok(keys(listed).includes("Hive"), "a custom kind is listed by its name");
  sane(systemLegend(generateLoneSystem({ seed: "legend", settled: true })), "system");
  sane(universeLegend(generateUniverse({ seed: "legend", galaxies: 150 })), "universe");
});

console.log(`legend: ${passed} regressions passed`);
