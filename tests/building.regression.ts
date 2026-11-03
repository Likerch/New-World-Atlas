// Building-level regressions: run with `npm test`.
import assert from "node:assert/strict";
import { PROPS, tierLegend, cityTiers, generateDistrict, BUILDING_THEMES, BUILDING_TYPES, buildingAt, buildingFromCity, centroid, ERA_BUILDINGS, generateBuilding, generateCity, generateRoom, pointInPolygon, renderBuilding, renderRoom, hashString, BUILDING_SHAPES, buildingKey, CRAFT_IDS, CRAFTS, shopInventory, craftFor, craftsOf, editBuilding, localFromHatch, placeOwnerKey, citySociety, cityShops, ROLES, DOOR_WALL, neighbours, sharedWall, type CustomBuildingType, type RoomKind } from "../src/core/index";
import { translator } from "../src/app/i18n";

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
  const room = generateRoom(plan, floor, hall.id)!;
  for (const item of room.items) assert.ok(item.x >= 0 && item.y >= 0 && item.x <= room.w && item.y <= room.h, `${item.kind} lies outside the room`);
  assert.ok(room.exits.some((exit) => exit.kind === "door"), "a way in");
  for (const exit of room.exits) assert.ok([0, room.w].some((v) => Math.abs(exit.at[0] - v) < 0.01) || [0, room.h].some((v) => Math.abs(exit.at[1] - v) < 0.01), "exits sit on the walls");
  assert.ok(room.cover.length > 0, "tables and the bar give cover");
  const hidden = { ...room, items: [...room.items, { x: 1, y: 1, kind: "key" as const, hidden: true }] };
  assert.match(renderRoom(hidden), /#c0392b/u, "the GM sees the hidden find");
  assert.doesNotMatch(renderRoom(hidden, { players: true }), /#c0392b/u, "players do not");
  assert.equal(JSON.stringify(generateRoom(plan, floor, hall.id)), JSON.stringify(room));
});

test("a tall tower keeps all its floors; a nave or a hut never stacks itself", () => {
  const office = generateBuilding({ seed: "tall", type: "office", floors: 14, cellar: false });
  assert.equal(office.floors.length, 14);
  for (const type of ["temple", "hut", "domus"] as const) {
    const plan = generateBuilding({ seed: "one", type, floors: 4, cellar: false });
    assert.equal(plan.floors.length, 1, `${type} stacked itself`);
    assert.equal(plan.params.floors, 1);
  }
  const city = generateCity({ seed: "stacks", era: "medieval", population: 40, walls: true, citadel: true });
  const temple = city.landmarks.find((l) => l.kind === "temple");
  const index = temple ? city.buildings.findIndex((b) => !PROPS.includes(b.kind) && pointInPolygon([temple.x, temple.y], b.polygon)) : -1;
  if (index >= 0) assert.equal(generateBuilding(buildingFromCity(city, index)).floors.filter((f) => f.level >= 0).length, 1, "a temple from the city has one nave");
});

test("the front door opens into a room for guests, and a house with a yard has a back door", () => {
  let stores = 0;
  let backs = 0;
  let houses = 0;
  for (let k = 0; k < 40; k++) {
    for (const type of ["manor", "lab", "tavern", "house"] as const) {
      const plan = generateBuilding({ seed: `door-${k}`, type, era: type === "lab" ? "far-future" : "medieval" });
      const ground = plan.floors.find((f) => f.level === 0)!;
      const front = ground.doors.find((d) => d.rooms[1] === -1 && Math.abs(d.at[1] - plan.params.depth) < 0.01)!;
      const room = ground.rooms.find((r) => r.id === front.rooms[0])!;
      if (["storage", "pantry"].includes(room.kind) && ground.rooms.some((r) => Math.abs(r.y + r.h - plan.params.depth) < 0.01 && !["storage", "pantry", "stairs"].includes(r.kind))) stores++;
      if (type === "house" && plan.params.yard) {
        houses++;
        if (ground.doors.some((d) => d.rooms[1] === -1 && d.at[1] < 0.01)) backs++;
      }
    }
  }
  assert.equal(stores, 0, "a guest walked into a store");
  assert.ok(backs >= houses * 0.8, `${backs} of ${houses} houses have a back door`);
});

test("what lies about follows the age, and stairs show where they lead", () => {
  for (let k = 0; k < 30; k++) {
    const hut = generateBuilding({ seed: `hut-${k}`, type: "hut", era: "stone" });
    for (const room of hut.floors[0].rooms) {
      const items = generateRoom(hut, 0, room.id)!.items.map((item) => item.kind);
      for (const kind of ["letter", "key", "coins", "papers", "book", "datapad", "credstick"]) assert.ok(!items.includes(kind as never), `a ${kind} in a stone-age hut`);
    }
  }
  const tavern = generateBuilding({ seed: "flights", type: "tavern", floors: 2, cellar: false });
  const stairs = tavern.floors[0].rooms.find((r) => r.kind === "stairs")!;
  const close = generateRoom(tavern, 0, stairs.id)!;
  assert.deepEqual(close.flights, { up: true, down: false });
  assert.match(renderRoom(close), /▲/u);
});

test("a camp marks its places on its huts; tiers have their own legend", () => {
  const city = generateCity({ seed: "close", era: "medieval", population: 30, walls: true, citadel: true });
  for (const ward of city.wards.filter((w) => w.urban && city.landmarks.some((l) => l.ward === w.id)).slice(0, 4)) {
    const close = generateDistrict(city, ward.id);
    for (const landmark of close.landmarks) {
      const homes = close.buildings.filter((b) => b.ward === landmark.ward && !PROPS.includes(b.kind) && b.kind !== "shed");
      if (homes.length) assert.ok(homes.some((b) => pointInPolygon([landmark.x, landmark.y], b.polygon) || Math.hypot(centroid(b.polygon)[0] - landmark.x, centroid(b.polygon)[1] - landmark.y) < 0.01), `${landmark.kind} stands in a yard`);
    }
  }
  const neon = generateCity({ seed: "neon", era: "cyberpunk", population: 900 });
  const tiers = cityTiers(neon);
  assert.ok(tierLegend(tiers, "under").some((section) => section.key === "legend.halls"));
  assert.equal(tierLegend(tiers, "upper")[0].entries[0].key, "legend.roof");
});

test("plain plans keep their rooms, furniture and windows (golden prints)", () => {
  const golden: Record<string, number> = { tavern: 2032776645, manor: 4186042473, keep: 329613731, office: 4038766457, hut: 593739294 };
  for (const [type, print] of Object.entries(golden)) {
    const plan = generateBuilding({ seed: "golden", type: type as never });
    const rooms = plan.floors.map((f) => ({ level: f.level, rooms: f.rooms.map((r) => [r.kind, r.x, r.y, r.w, r.h, r.furniture.map((x) => [x.kind, x.x, x.y, x.w, x.h])]), windows: f.windows.map((w) => [w.a, w.b]) }));
    assert.equal(hashString(JSON.stringify(rooms)), print, `${type} changed`);
  }
});

/** Rooms reached from the first over doors that are not hidden or bricked up. */
const reachable = (floor: { rooms: { id: number }[]; doors: { rooms: [number, number]; secret?: boolean; walled?: boolean }[] }) => {
  const seen = new Set([floor.rooms[0].id]);
  const queue = [floor.rooms[0].id];
  while (queue.length) {
    const at = queue.shift()!;
    for (const door of floor.doors) {
      if (door.secret || door.walled) continue;
      const other = door.rooms[0] === at ? door.rooms[1] : door.rooms[1] === at ? door.rooms[0] : -2;
      if (other >= 0 && !seen.has(other)) (seen.add(other), queue.push(other));
    }
  }
  return seen.size;
};

test("every shape builds: wings that tile without overlap, every room reached, a round tower keeps inside its wall", () => {
  for (const shape of BUILDING_SHAPES) {
    for (const type of ["house", "manor", "tavern", "keep", "office", "palace", "lighthouse", "temple"] as const) {
      const plan = generateBuilding({ seed: `shape-${type}`, type, shape, floors: 3, cellar: true, width: 24, depth: 19 });
      const { width: W, depth: D } = plan.params;
      if (shape === "round") assert.equal(W, D, "a round tower is as wide as it is deep");
      if (shape !== "rect" && shape !== "round") assert.ok(plan.wings && plan.wings.length >= 2, `${shape}/${type} has no wings`);
      if (shape === "court") assert.ok(plan.court, "a courtyard house has its court");
      for (const floor of plan.floors) {
        for (const room of floor.rooms) {
          assert.ok(room.x > -0.01 && room.y > -0.01 && room.x + room.w < W + 0.01 && room.y + room.h < D + 0.01, `${shape}/${type}: ${room.kind} outside`);
          for (const other of floor.rooms) if (other.id > room.id) assert.ok(!(room.x < other.x + other.w - 0.01 && other.x < room.x + room.w - 0.01 && room.y < other.y + other.h - 0.01 && other.y < room.y + room.h - 0.01), `${shape}/${type}: ${room.kind} overlaps ${other.kind}`);
          if (shape === "round") for (const f of room.furniture) for (const [x, y] of [[f.x, f.y], [f.x + f.w, f.y + f.h]]) assert.ok(Math.hypot(x - W / 2, y - W / 2) < W / 2, `${type}: a ${f.kind} sticks through the round wall`);
        }
        assert.equal(reachable(floor), floor.rooms.length, `${shape}/${type} floor ${floor.level}: a room cannot be reached`);
        if (floor.level === 0) assert.ok(floor.doors.some((door) => door.rooms[1] === -1), `${shape}/${type}: no way in`);
      }
      for (let floor = 0; floor < plan.floors.length; floor++) assert.doesNotMatch(renderBuilding(plan, { floor, theme: "color", grid: true }), /NaN|undefined|Infinity/u);
      assert.doesNotMatch(renderBuilding(plan, { roof: true }), /NaN|undefined|Infinity/u, `${shape}/${type} roof`);
    }
  }
  // A house of the new path gets an entry hall behind its front door; a courtyard house a gate passage to its court.
  const manor = generateBuilding({ seed: "entry", type: "manor", shape: "L", floors: 2 });
  const ground = manor.floors.find((f) => f.level === 0)!;
  const front = ground.doors.find((d) => d.rooms[1] === -1 && Math.abs(d.at[1] - manor.params.depth) < 0.01)!;
  assert.equal(ground.rooms.find((r) => r.id === front.rooms[0])!.kind, "vestibule");
  const court = generateBuilding({ seed: "court", type: "palace" });
  assert.ok(court.floors.find((f) => f.level === 0)!.rooms.some((r) => r.kind === "passage"));
});

test("doors are of their age and house, locks guard what is worth guarding, and houses have loops and hidden doors", () => {
  const bank = generateBuilding({ seed: "doors", type: "bank", floors: 2, cellar: true });
  const vaultDoors = bank.floors.flatMap((f) => f.doors.filter((d) => d.rooms.some((id) => id >= 0 && f.rooms.find((r) => r.id === id)?.kind === "vault")));
  assert.ok(vaultDoors.length && vaultDoors.every((d) => d.kind === "iron" && (d.lock === "master" || d.lock === "biometric")), "a vault behind an iron door with a master's lock");
  const hut = generateBuilding({ seed: "doors", type: "hut", era: "stone" });
  assert.ok(hut.floors[0].doors.every((d) => d.kind === "curtain" && d.lock === "none"), "a hide over the door of a hut");
  const prison = generateBuilding({ seed: "doors", type: "prison" });
  assert.ok(prison.floors.some((f) => f.doors.some((d) => d.kind === "bars")), "cells behind bars");
  let loops = 0;
  let secrets = 0;
  for (let k = 0; k < 30; k++) {
    const plan = generateBuilding({ seed: `loop-${k}`, type: "manor", floors: 2, cellar: true });
    // More doors than a tree needs: some room can be reached two ways.
    if (plan.floors.some((f) => f.level >= 0 && f.doors.filter((d) => d.rooms[1] >= 0 && !d.secret).length >= f.rooms.length)) loops++;
    const hidden = plan.floors.flatMap((f) => f.doors.filter((d) => d.secret));
    if (hidden.length) {
      secrets++;
      const floor = plan.floors.findIndex((f) => f.doors.some((d) => d.secret));
      assert.match(renderBuilding(plan, { floor }), /#c0392b/u, "the GM sees the hidden door");
      assert.doesNotMatch(renderBuilding(plan, { floor, players: true }), /#c0392b/u, "players do not");
      const key = buildingKey(plan);
      assert.ok(key.rooms.some((entry) => entry.clues.some((clue) => clue.key === "clue.draught")), "a hidden door leaves a draught to be found");
    }
  }
  assert.ok(loops >= 20, `only ${loops} of 30 manors have a loop`);
  assert.ok(secrets >= 10, `only ${secrets} of 30 manors hide a door`);
});

test("a shop works at its craft: tools on the floor, goods priced in the age's money", () => {
  for (const craft of CRAFT_IDS) {
    const era = CRAFTS[craft].eras[0];
    const plan = generateBuilding({ seed: `craft-${craft}`, type: era === "modern" || era === "cyberpunk" || era === "far-future" ? "store" : "shop", era, craft, wealth: 0.7 });
    const things = plan.floors.flatMap((f) => f.rooms.flatMap((r) => r.furniture.map((x) => x.kind)));
    for (const tool of CRAFTS[craft].furniture) assert.ok(things.includes(tool), `${craft} has no ${tool}`);
    const goods = shopInventory(plan);
    assert.equal(goods.length, CRAFTS[craft].goods.length);
    assert.ok(goods.every((item) => item.price >= 1 && item.key.startsWith("goods.")));
  }
  assert.equal(craftFor("a shop", "medieval"), craftFor("a shop", "medieval"), "a shop's craft is its own");
  assert.ok(craftsOf("medieval").length > 8 && !craftsOf("medieval").includes("chrome"));
});

test("the key: an owner and household, people by room, valuables, clues, three rumours with one lie, all the same each time", () => {
  const plan = generateBuilding({ seed: "key", type: "tavern", floors: 2, cellar: true, wealth: 0.8, hatch: true });
  const key = buildingKey(plan);
  assert.deepEqual(buildingKey(plan), key, "the same building keeps the same people");
  assert.equal(key.owner.role, "innkeeper");
  assert.ok(key.rooms.some((entry) => entry.occupants.includes(key.owner)), "the owner is somewhere in the house");
  const common = key.rooms.find((entry) => plan.floors.find((f) => f.level === entry.level)!.rooms.find((r) => r.id === entry.room)!.kind === "common-room")!;
  assert.ok(common.occupants.length >= 1, "drinkers in the common room");
  assert.ok(key.rooms.every((entry, k) => entry.n === k + 1), "rooms are numbered in order");
  assert.ok(key.rooms.some((entry) => entry.clues.some((clue) => clue.key === "clue.hatch")), "the hatch smells of the sewers");
  for (const list of [key.rumours, ...key.rooms.map((entry) => entry.rumours)].filter((list) => list.length)) assert.equal(list.filter((item) => !item.true).length, 1, "one rumour is false");
  const vault = buildingKey(generateBuilding({ seed: "key", type: "bank", cellar: true, wealth: 1 }));
  assert.ok(vault.rooms.some((entry) => entry.valuables.length >= 2), "a bank's vault holds valuables");
  // A room thrown again has new people; the rest of the house keeps its own.
  const again = buildingKey(plan, null, { [`${common.level}:${common.room}`]: 1 });
  assert.notDeepEqual(again.rooms.find((entry) => entry.room === common.room && entry.level === common.level)!.occupants.map((npc) => npc.name), common.occupants.map((npc) => npc.name));
  assert.deepEqual(again.rooms.filter((entry) => entry !== again.rooms.find((e) => e.room === common.room && e.level === common.level)).map((e) => e.valuables), key.rooms.filter((entry) => entry !== common).map((e) => e.valuables));
});

test("the GM's edits: a room's new purpose is furnished for it, doors change, are hidden, bricked up and broken through", () => {
  const plan = generateBuilding({ seed: "edit", type: "manor", floors: 2 });
  const ground = plan.floors.find((f) => f.level === 0)!;
  const room = ground.rooms.find((r) => r.kind === "study") ?? ground.rooms[1];
  const edited = editBuilding(plan, { rooms: { [`0:${room.id}`]: { kind: "armory" } }, doors: { "0:0": { kind: "iron", lock: "master" }, "0:1": { removed: true } } });
  const after = edited.floors.find((f) => f.level === 0)!;
  assert.equal(after.rooms.find((r) => r.id === room.id)!.kind, "armory");
  assert.ok(after.rooms.find((r) => r.id === room.id)!.furniture.some((f) => f.kind === "rack"), "an armoury gets its racks");
  assert.equal(after.doors[0].kind, "iron");
  assert.equal(after.doors[0].lock, "master");
  assert.ok(after.doors[1].walled, "a bricked-up door stays in the list, walled");
  assert.equal(plan.floors.find((f) => f.level === 0)!.rooms.find((r) => r.id === room.id)!.kind, room.kind, "the plan itself is untouched");
  // A door broken through between two rooms that touch.
  const joined = (a: number, b: number) => ground.doors.some((d) => d.rooms.includes(a) && d.rooms.includes(b));
  const pairs = ground.rooms.flatMap((a) => ground.rooms.filter((b) => b.id > a.id && a.kind !== "stairs" && b.kind !== "stairs" && !joined(a.id, b.id) && (Math.abs(a.y + a.h - b.y) < 0.01 || Math.abs(a.x + a.w - b.x) < 0.01)).map((b) => [a, b] as const));
  const opened = pairs.filter(([a, b]) => editBuilding(plan, { added: [{ level: 0, a: a.id, b: b.id }] }).floors.find((f) => f.level === 0)!.doors.length === ground.doors.length + 1);
  if (pairs.length) assert.ok(opened.length, "a door can be broken through between rooms that touch");
  assert.equal(editBuilding(plan, null), plan);
});

test("new buildings, decay, magic, a loft and a hatch; a lighthouse on the map opens as a round tower", () => {
  for (const type of ["lighthouse", "mill", "theatre", "arena", "prison", "barracks", "palace", "mage-tower"] as const) {
    const plan = generateBuilding({ seed: `new-${type}`, type });
    assert.ok(plan.floors.length >= 1);
  }
  const lighthouse = generateBuilding({ seed: "light", type: "lighthouse", floors: 4 });
  assert.ok(lighthouse.floors[lighthouse.floors.length - 1].rooms.some((r) => r.kind === "lantern"), "a lamp at the top");
  const ruin = generateBuilding({ seed: "ruin", type: "manor", decay: 0.9, floors: 2 });
  assert.ok(ruin.floors.some((f) => f.rooms.some((r) => r.collapsed)), "rooms fallen in");
  assert.ok(ruin.floors.some((f) => f.rooms.some((r) => r.furniture.some((x) => x.kind === "rubble"))), "rubble");
  assert.ok(ruin.floors.some((f) => f.windows.some((w) => w.boarded)), "boarded windows");
  const tower = generateBuilding({ seed: "magic", type: "mage-tower", magic: 3, floors: 4 });
  assert.ok(tower.floors.some((f) => f.rooms.some((r) => r.furniture.some((x) => x.kind === "circle"))), "circles in a mage's tower");
  const loft = generateBuilding({ seed: "loft", type: "house", attic: true, floors: 2 });
  assert.ok(loft.floors[loft.floors.length - 1].rooms.some((r) => r.kind === "attic") && loft.params.floors === 2, "a loft above, not a storey");
  const hatch = generateBuilding({ seed: "hatch", type: "house", hatch: true, cellar: true });
  assert.ok(hatch.floors.find((f) => f.level < 0)!.rooms.some((r) => r.furniture.some((x) => x.kind === "hatch")));
  assert.equal(localFromHatch(hatch, null).params.theme, "sewer");
  const city = generateCity({ seed: "harbour", era: "medieval", population: 30, coast: Math.PI / 2, port: true });
  const light = city.landmarks.find((l) => l.kind === "lighthouse");
  if (light) {
    const index = city.buildings.findIndex((b) => !PROPS.includes(b.kind) && pointInPolygon([light.x, light.y], b.polygon));
    if (index >= 0) assert.equal(generateBuilding(buildingFromCity(city, index)).params.shape, "round");
  }
});

test("a house opened from the city knows its street, its quarter's wealth, its craft and its owner of the city", () => {
  const city = generateCity({ seed: "society", era: "medieval", population: 25, walls: true, citadel: true });
  const tavern = city.landmarks.find((l) => l.kind === "tavern")!;
  const index = city.buildings.findIndex((b) => !PROPS.includes(b.kind) && pointInPolygon([tavern.x, tavern.y], b.polygon));
  const params = buildingFromCity(city, index);
  assert.equal(params.owner?.key, placeOwnerKey(city, tavern.id), "the tavern's owner is the city's innkeeper");
  const place = citySociety(city).places.find((p) => p.landmark === tavern.id)!;
  assert.equal(buildingKey(generateBuilding(params), city.language).owner.name, place.owner.name, "the same person in the city and in the house");
  assert.ok(typeof params.wealth === "number");
  const shop = cityShops(city)[0];
  if (shop) assert.equal(buildingFromCity(city, shop.building).craft, shop.craft, "the directory and the plan agree on the craft");
  // Every house has a head of household in a real role.
  for (const era of ["medieval", "modern", "post-apocalypse"] as const) {
    const town = generateCity({ seed: `owners-${era}`, era, population: era === "modern" ? 300 : 10 });
    town.buildings.forEach((b, index) => {
      if (index % 37 || PROPS.includes(b.kind) || b.kind === "shed") return;
      const role = buildingKey(generateBuilding(buildingFromCity(town, index)), town.language).owner.role;
      assert.ok(ROLES.includes(role), `${era}: an owner with no role (${role})`);
    });
  }
});

test("review fixes: a room up close of another floor, the hatch and a craft's tools kept, one room to a rumour, doors offered that open", () => {
  const plan = generateBuilding({ seed: "tools", type: "shop", era: "medieval", floors: 2, cellar: true, hatch: true, craft: "baker" });
  const ground = plan.floors.findIndex((f) => f.level === 0);
  assert.equal(generateRoom(plan, ground, 999), null, "a room the floor has not is no room up close");
  // Decay that brings a room down leaves the hatch under the rubble; a room furnished anew keeps it and the craft's tools.
  for (let k = 0; k < 20; k++) {
    const ruin = generateBuilding({ seed: `ruin-${k}`, type: "house", hatch: true, cellar: true, decay: 0.95 });
    assert.ok(ruin.floors.some((f) => f.rooms.some((r) => r.furniture.some((x) => x.kind === "hatch"))), `ruin-${k} lost its hatch`);
  }
  const at = plan.floors.flatMap((f) => f.rooms.filter((r) => r.furniture.some((x) => x.kind === "hatch")).map((r) => [f.level, r.id] as const))[0];
  const tools = plan.floors.flatMap((f) => f.rooms.filter((r) => r.furniture.some((x) => x.fixed && x.kind !== "hatch")).map((r) => [f.level, r.id] as const))[0];
  assert.ok(at && tools, "a hatch and a baker's oven");
  const again = editBuilding(plan, { rooms: { [`${at[0]}:${at[1]}`]: { salt: 1 }, [`${tools[0]}:${tools[1]}`]: { kind: "storage" } } });
  const room = (level: number, id: number) => again.floors.find((f) => f.level === level)!.rooms.find((r) => r.id === id)!;
  assert.ok(room(at[0], at[1]).furniture.some((x) => x.kind === "hatch"), "a room thrown again lost its hatch");
  assert.ok(room(tools[0], tools[1]).furniture.some((x) => x.fixed && x.kind !== "hatch"), "a room given a new purpose lost the craft's tools");
  // A rumour or a hook names one room, never a room of nowhere.
  for (let k = 0; k < 60; k++) {
    for (const type of ["tavern", "manor", "house"] as const) {
      const key = buildingKey(generateBuilding({ seed: `r${k}`, type }));
      assert.doesNotMatch(JSON.stringify([key.rumours, key.hook]), /@room\.undefined/u, `r${k}/${type}`);
    }
  }
  // Every room the editor offers a door to gets one.
  for (let k = 0; k < 10; k++) {
    const manor = generateBuilding({ seed: `door-${k}`, type: "manor", floors: 2 });
    for (const floor of manor.floors)
      for (const one of floor.rooms)
        for (const other of floor.rooms.filter((o) => o.id !== one.id && o.kind !== "stairs" && !neighbours(floor, one.id).some((way) => way.room === o.id) && sharedWall(one, o, DOOR_WALL))) {
          const doors = editBuilding(manor, { added: [{ level: floor.level, a: one.id, b: other.id }] }).floors.find((f) => f.level === floor.level)!.doors.length;
          assert.equal(doors, floor.doors.length + 1, `door-${k}: no door from ${one.kind} to ${other.kind}`);
        }
  }
});

test("review fixes: narrow rooms are reached, a round tower's top has its stair and its secret way out stays in its wall", () => {
  const twelve: RoomKind[] = ["hall", "kitchen", "bedroom", "bedroom", "storage", "study", "office", "bath", "pantry", "bedroom", "storage", "chapel"];
  const own: CustomBuildingType = { id: "dozen", name: "Dozen", description: "", ground: twelve, upper: twelve, cellar: [], width: 12, depth: 9, floors: 2 };
  const plans = [
    ...(["tenement", "prison", "barracks", "apartment"] as const).map((type) => generateBuilding({ seed: "narrow", type, width: 5, depth: 4, floors: 3 })),
    generateBuilding({ seed: "arcology", type: "office", era: "cyberpunk", width: 6, depth: 4, floors: 12 }),
    ...(["L", "T"] as const).map((shape) => generateBuilding({ seed: "dozen", type: "custom", customType: own, shape, width: 12, depth: 9, floors: 2 })),
  ];
  for (const plan of plans) for (const floor of plan.floors) assert.equal(reachable(floor), floor.rooms.length, `${plan.params.type}/${plan.params.shape ?? "rect"} floor ${floor.level}: a room cannot be reached`);
  for (const type of ["lighthouse", "mage-tower"] as const) {
    for (const attic of [false, true]) {
      const tower = generateBuilding({ seed: "tower", type, floors: 4, attic });
      for (const floor of tower.floors) {
        assert.ok(floor.rooms.some((r) => r.kind === "stairs"), `${type}${attic ? " with a loft" : ""}: floor ${floor.level} has no stair`);
        assert.equal(reachable(floor), floor.rooms.length);
      }
    }
  }
  let secrets = 0;
  for (let k = 0; k < 40; k++) {
    const tower = generateBuilding({ seed: `mage-${k}`, type: "mage-tower", cellar: true });
    const R = tower.params.width / 2;
    for (const floor of tower.floors)
      for (const door of floor.doors.filter((d) => d.secret && d.rooms[1] === -1)) {
        secrets++;
        assert.ok(Math.abs(Math.hypot(door.at[0] - R, door.at[1] - R) - R) < 0.05, `mage-${k}: the secret way out is not in the round wall`);
      }
  }
  assert.ok(secrets > 3, "secret ways out of a tower's cellar");
  // A round room up close has the windows of its stretch of wall.
  const light = generateBuilding({ seed: "light", type: "lighthouse", floors: 3 });
  const ground = light.floors.findIndex((f) => f.level === 0);
  assert.ok(light.floors[ground].rooms.reduce((sum, r) => sum + generateRoom(light, ground, r.id)!.exits.filter((e) => e.kind === "window").length, 0) >= light.floors[ground].windows.length);
});

test("review fixes: every piece of furniture has a name in both tongues", () => {
  const kinds = new Set<string>();
  for (const [era, types] of Object.entries(ERA_BUILDINGS))
    for (const type of types) for (const floor of generateBuilding({ seed: `names-${type}`, type, era: era as never, decay: 0.9, magic: 3, hatch: true, cellar: true }).floors) for (const room of floor.rooms) for (const f of room.furniture) kinds.add(f.kind);
  for (const craft of CRAFT_IDS) for (const kind of CRAFTS[craft].furniture) kinds.add(kind);
  for (const locale of ["en", "ru"] as const) {
    const t = translator(locale);
    for (const kind of kinds) assert.notEqual(t(`furniture.${kind}`), `furniture.${kind}`, `${locale}: furniture.${kind}`);
    assert.notEqual(t("bkind.gone"), "bkind.gone");
  }
});

test("review fixes: the owner of a place or a shop is the same person in the city and in the house", () => {
  for (const era of ["medieval", "industrial"] as const) {
    const city = generateCity({ seed: `secrets-${era}`, era, population: 25 });
    const society = citySociety(city);
    for (const place of society.places.slice(0, 12)) {
      const index = city.buildings.findIndex((b) => b.ward === city.landmarks.find((l) => l.id === place.landmark)!.ward && !PROPS.includes(b.kind) && pointInPolygon([city.landmarks.find((l) => l.id === place.landmark)!.x, city.landmarks.find((l) => l.id === place.landmark)!.y], b.polygon));
      if (index < 0) continue;
      const owner = buildingKey(generateBuilding(buildingFromCity(city, index)), city.language).owner;
      if (owner.id === place.owner.id) assert.equal(owner.secret, place.owner.secret, `${era}: the owner of place ${place.landmark} keeps another secret in the house`);
    }
    for (const shop of cityShops(city).slice(0, 12)) {
      const owner = buildingKey(generateBuilding(buildingFromCity(city, shop.building)), city.language).owner;
      if (owner.id === shop.owner.id) assert.equal(owner.secret, shop.owner.secret, `${era}: a shopkeeper keeps another secret in the shop`);
    }
  }
});

console.log(`building: ${passed} regressions passed`);
