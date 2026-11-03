// Building-level regressions: run with `npm test`.
import assert from "node:assert/strict";
import { BUILDING_THEMES, BUILDING_TYPES, buildingAt, buildingFromCity, centroid, ERA_BUILDINGS, generateBuilding, generateCity, generateRoom, pointInPolygon, renderBuilding, renderRoom } from "../src/core/index";

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

test("every age raises buildings of its own, furnished and drawn, and its city maps open as them", () => {
  const signature: Partial<Record<string, string>> = { longhouse: "hearth", domus: "pool", bathhouse: "pool", factory: "machine", school: "desk", store: "shelf", "capsule-hotel": "pod", hydroponics: "vat", bunker: "generator", shelter: "mattress" };
  for (const [era, types] of Object.entries(ERA_BUILDINGS)) {
    for (const type of types) {
      const plan = generateBuilding({ seed: `age-${type}`, type, era: era as never });
      const things = plan.floors.flatMap((floor) => floor.rooms.flatMap((room) => room.furniture.map((f) => f.kind)));
      if (signature[type]) assert.ok(things.includes(signature[type] as never), `${era}/${type} has no ${signature[type]}`);
      for (let floor = 0; floor < plan.floors.length; floor++) assert.doesNotMatch(renderBuilding(plan, { floor }), /NaN|undefined|Infinity/u, `${era}/${type}`);
    }
  }
  const opened = (era: "ancient" | "industrial" | "far-future" | "post-apocalypse") => {
    const city = generateCity({ seed: "ages", era, population: era === "far-future" ? 900 : 20 });
    return new Set(city.buildings.map((_, index) => index).filter((index) => buildingAt(city, centroid(city.buildings[index].polygon)) === index).slice(0, 400).map((index) => buildingFromCity(city, index).type));
  };
  assert.ok(opened("ancient").has("domus") || opened("ancient").has("insula"), "a Roman town has atrium houses or tenements");
  assert.ok(opened("industrial").has("tenement"), "an industrial city has tenements");
  assert.ok(opened("far-future").has("hab"), "a city of the far future has habitat modules");
  assert.ok(opened("post-apocalypse").has("shelter"), "a dead city has shelters");
});

test("every style draws every floor", () => {
  const plan = generateBuilding({ seed: "styles", type: "keep", cellar: true });
  for (const theme of BUILDING_THEMES) for (let floor = 0; floor < plan.floors.length; floor++) assert.doesNotMatch(renderBuilding(plan, { theme, floor, grid: true, highlight: 1 }), /NaN|undefined|Infinity/u);
});

test("a room opens as a scene: things inside it, doors on its walls, cover from its furniture, finds hidden from players", () => {
  const plan = generateBuilding({ seed: "scene", type: "tavern", floors: 2 });
  const floor = plan.floors.findIndex((f) => f.level === 0);
  const hall = plan.floors[floor].rooms.find((r) => r.kind === "common-room")!;
  const room = generateRoom(plan, floor, hall.id);
  for (const item of room.items) assert.ok(item.x >= 0 && item.y >= 0 && item.x <= room.w && item.y <= room.h, `${item.kind} lies outside the room`);
  assert.ok(room.exits.some((exit) => exit.kind === "door"), "a way in");
  for (const exit of room.exits) assert.ok([0, room.w].some((v) => Math.abs(exit.at[0] - v) < 0.01) || [0, room.h].some((v) => Math.abs(exit.at[1] - v) < 0.01), "exits sit on the walls");
  assert.ok(room.cover.length > 0, "tables and the bar give cover");
  const hidden = { ...room, items: [...room.items, { x: 1, y: 1, kind: "key" as const, hidden: true }] };
  assert.match(renderRoom(hidden), /#c0392b/u, "the GM sees the hidden find");
  assert.doesNotMatch(renderRoom(hidden, { players: true }), /#c0392b/u, "players do not");
  assert.equal(JSON.stringify(generateRoom(plan, floor, hall.id)), JSON.stringify(room));
});

console.log(`building: ${passed} regressions passed`);
