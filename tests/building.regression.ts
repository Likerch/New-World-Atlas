// Building-level regressions: run with `npm test`.
import assert from "node:assert/strict";
import { BUILDING_THEMES, BUILDING_TYPES, buildingFromCity, generateBuilding, generateCity, pointInPolygon, renderBuilding } from "../src/core/index";

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

test("every room of every floor can be entered, and the ground floor has a front door", () => {
  for (const type of BUILDING_TYPES) {
    for (const seed of ["a", "b", "c"]) {
      const plan = generateBuilding({ seed: `${type}-${seed}`, type });
      for (const floor of plan.floors) {
        for (const room of floor.rooms) assert.ok(floor.doors.some((door) => door.rooms.includes(room.id)), `${type}/${seed} floor ${floor.level}: ${room.kind} has no door`);
        if (floor.level === 0) assert.ok(floor.doors.some((door) => door.rooms.includes(-1)), `${type}/${seed}: no way in`);
      }
    }
  }
});

test("rooms tile the footprint without overlapping and furniture stays inside its room", () => {
  const plan = generateBuilding({ seed: "tile", type: "manor", floors: 2, cellar: true });
  for (const floor of plan.floors) {
    const area = floor.rooms.reduce((sum, room) => sum + room.w * room.h, 0);
    assert.ok(Math.abs(area - plan.params.width * plan.params.depth) < 0.5, `floor ${floor.level} covers ${area}`);
    for (const room of floor.rooms) for (const f of room.furniture) assert.ok(f.x >= room.x - 1e-6 && f.y >= room.y - 1e-6 && f.x + f.w <= room.x + room.w + 1e-6 && f.y + f.h <= room.y + room.h + 1e-6, `${f.kind} sticks out of the ${room.kind}`);
  }
});

test("a tavern on a city map opens as a named tavern with guest rooms upstairs", () => {
  const city = generateCity({ seed: "harbour", era: "medieval" });
  const tavern = city.landmarks.find((landmark) => landmark.kind === "tavern")!;
  const index = city.buildings.findIndex((b) => b.ward === tavern.ward && pointInPolygon([tavern.x, tavern.y], b.polygon));
  const params = buildingFromCity(city, index);
  assert.equal(params.type, "tavern");
  assert.equal(params.name, tavern.name);
  const plan = generateBuilding(params);
  assert.ok(plan.floors.some((floor) => floor.rooms.some((room) => room.kind === "guest-room")));
});

test("every style draws every floor", () => {
  const plan = generateBuilding({ seed: "styles", type: "keep", cellar: true });
  for (const theme of BUILDING_THEMES) for (let floor = 0; floor < plan.floors.length; floor++) assert.doesNotMatch(renderBuilding(plan, { theme, floor, grid: true, highlight: 1 }), /NaN|undefined|Infinity/u);
});

console.log(`building: ${passed} regressions passed`);
