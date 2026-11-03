// Local-map regressions: run with `npm test`.
import assert from "node:assert/strict";
import { generateUnderworld, renderUnderworld, SETTINGS, generateLocal, generatePlanet, LOCAL_KINDS, LOCAL_STYLES, LOCAL_THEMES, localFromMarker, renderLocal, TILE } from "../src/core/index";

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

test("every room of a dungeon or cave can be reached from its entrance", () => {
  for (const kind of ["dungeon", "cave"] as const) {
    for (const theme of LOCAL_THEMES[kind]) {
      const map = generateLocal({ seed: `reach-${theme}`, kind, theme });
      const W = map.params.width;
      const open = (i: number) => map.tiles[i] !== TILE.rock;
      const entrance = map.keyed.find((k) => k.purpose === "entrance")!;
      const seen = new Set([entrance.cells.find(open)!]);
      const queue = [...seen];
      while (queue.length) {
        const i = queue.shift()!;
        for (const n of [i - 1, i + 1, i - W, i + W]) if (n >= 0 && n < map.tiles.length && open(n) && !seen.has(n)) (seen.add(n), queue.push(n));
      }
      for (const room of map.keyed) assert.ok(room.cells.some((c) => seen.has(c)), `${theme}: room ${room.id} (${room.purpose}) is sealed off`);
      assert.equal(map.keyed.filter((k) => k.purpose === "lair" || k.purpose === "tomb").length, 1, `${theme}: one final room`);
    }
  }
});

test("a wilderness trail crosses the map from west to east", () => {
  for (const theme of LOCAL_THEMES.wilderness) {
    const map = generateLocal({ seed: `trail-${theme}`, kind: "wilderness", theme });
    assert.ok(map.trail.length > map.params.width * 0.6, `${theme}: trail of ${map.trail.length}`);
    assert.equal(map.trail[map.trail.length - 1][0], map.params.width - 1, `${theme}: the trail stops short`);
  }
});

test("local maps are reproducible and every style draws them", () => {
  for (const kind of LOCAL_KINDS) {
    const a = generateLocal({ seed: "same", kind });
    const b = generateLocal({ seed: "same", kind });
    assert.deepEqual(Array.from(a.tiles), Array.from(b.tiles));
    assert.deepEqual(a.keyed, b.keyed);
    for (const style of LOCAL_STYLES) assert.doesNotMatch(renderLocal(a, { style, highlight: 1 }), /NaN|undefined|Infinity/u);
  }
});

test("a cave on the planet map keeps its legend's dweller in the lair", () => {
  const planet = generatePlanet({ seed: "regression", template: "continents", cells: 6000 });
  const cave = planet.markers.find((marker) => marker.kind === "cave");
  if (!cave) return;
  const link = localFromMarker(planet, cave.id)!;
  const map = generateLocal(link.params, link.language ?? undefined);
  assert.equal(map.params.kind, "cave");
  const lair = map.keyed.find((k) => k.purpose === "lair")!;
  assert.deepEqual(lair.monsters, [String(cave.facts.dweller).replace(/ /gu, "-")]);
});

test("dungeons and caves lead further down, and a deeper level is a new place", () => {
  for (const kind of ["dungeon", "cave"] as const) {
    const first = generateLocal({ seed: `deep-${kind}`, kind });
    assert.ok(first.features.some((f) => f.kind === "stairs-down"), `${kind}: a way down`);
    const second = generateLocal({ ...first.params, seed: `deep-${kind}/depth-2`, depth: 2 });
    assert.equal(second.params.depth, 2);
    assert.notDeepEqual(Array.from(second.tiles), Array.from(first.tiles));
  }
});

test("later ages have their own dungeons and wastes, and their underworld has metro lines, bunkers and vaults", () => {
  for (const theme of ["factory", "metro", "lab", "mall", "vault", "starship"] as const) {
    const map = generateLocal({ seed: `age-${theme}`, kind: "dungeon", theme });
    assert.equal(map.params.theme, theme);
    assert.ok(map.keyed.length > 3);
    assert.doesNotMatch(renderLocal(map), /NaN|undefined/u);
  }
  const waste = generateLocal({ seed: "age-waste", kind: "wilderness", theme: "wasteland" });
  assert.ok(waste.tiles.some((tile) => tile === TILE.rubble));
  const modern = generatePlanet({ seed: "age-under", cells: 3000, setting: SETTINGS.modern });
  const below = generateUnderworld(modern);
  assert.ok(below.tunnels.some(([, , kind]) => kind === "line") && below.caverns.some((cavern) => cavern.kind === "metro"), "metro lines under the great cities");
  assert.equal(below.peoples.length, 0, "no peoples of the deep without magic");
  assert.doesNotMatch(renderUnderworld(below, modern), /NaN|undefined/u);
  const factory = modern.markers.find((marker) => marker.kind === "factory")!;
  assert.equal(localFromMarker(modern, factory.id)?.params.theme, "factory");
  const fallen = generatePlanet({ seed: "age-under", cells: 3000, setting: SETTINGS["post-apocalypse"] });
  assert.ok(generateUnderworld(fallen).caverns.some((cavern) => cavern.kind === "vault"), "vaults after the fall");
});

console.log(`local: ${passed} regressions passed`);
