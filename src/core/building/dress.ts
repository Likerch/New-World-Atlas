// What a plan carries beyond its rooms: what every door is made of and how it is locked, a second way between rooms
// (so a house has loops to run round, not only dead ends), now and then a hidden door or a secret way out of the
// cellar, a craft's tools on the shop floor, a hatch down to the sewers, and the marks of decay and of magic. All of
// it comes from streams of its own, so the rooms and their furniture stay as the plan made them.
import type { Era } from "../city/model";
import type { Point } from "../geometry";
import { createRng, type Rng } from "../random";
import { CRAFTS, type Craft } from "./crafts";
import type { BuildingPlan, Door, DoorKind, Floor, FurnitureKind, LockKind, Room, RoomKind } from "./plan";

/** Rooms a hidden door is worth having in: someone keeps something there. */
const PRIVATE = new Set<RoomKind>(["study", "bedroom", "vault", "cellar", "office", "sacristy", "storage", "throne-room", "ritual-room", "vip", "server-room"]);
const MACHINE: Era[] = ["modern", "cyberpunk", "far-future"];
/** Houses that keep secrets: a hidden door is likelier in them. */
const SECRETIVE = new Set(["keep", "palace", "manor", "mage-tower", "bank", "prison", "tavern", "guildhall", "temple", "club", "domus"]);

const roomOf = (floor: Floor, id: number) => floor.rooms.find((room) => room.id === id);

/** Whether a door at a point would open onto furniture in a room. */
function blocked(room: Room, at: Point, reach = 0.9): boolean {
  return room.furniture.some((f) => f.kind !== "carpet" && at[0] > f.x - reach && at[0] < f.x + f.w + reach && at[1] > f.y - reach && at[1] < f.y + f.h + reach);
}

/** A spot in a room for a piece of the given size: clear of furniture and doors, inside a round wall. */
export function freeSpot(plan: BuildingPlan, floor: Floor, room: Room, w: number, h: number, rng: Rng): Point | null {
  const R = plan.params.shape === "round" ? plan.params.width / 2 : 0;
  const options: Point[] = [];
  for (let x = room.x + 0.35; x + w <= room.x + room.w - 0.35; x += 0.3) for (let y = room.y + 0.35; y + h <= room.y + room.h - 0.35; y += 0.3) options.push([x, y]);
  rng.shuffle(options);
  const doors = floor.doors.filter((door) => door.rooms.includes(room.id));
  for (const [x, y] of options) {
    if (room.furniture.some((f) => f.kind !== "carpet" && x < f.x + f.w + 0.1 && f.x < x + w + 0.1 && y < f.y + f.h + 0.1 && f.y < y + h + 0.1)) continue;
    if (doors.some((door) => door.at[0] > x - 0.8 && door.at[0] < x + w + 0.8 && door.at[1] > y - 0.8 && door.at[1] < y + h + 0.8)) continue;
    if (R && [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].some(([px, py]) => Math.hypot(px - R, py - R) > R - 0.3)) continue;
    return [x, y];
  }
  return null;
}

function put(plan: BuildingPlan, floor: Floor, room: Room, kind: FurnitureKind, w: number, h: number, rng: Rng, round = false): boolean {
  const at = freeSpot(plan, floor, room, w, h, rng);
  if (!at) return false;
  room.furniture.push({ kind, x: at[0], y: at[1], w, h, round });
  return true;
}

/** What a door is: by the age, the house, and what lies on either side of it. */
function doorKind(plan: BuildingPlan, a: Room | undefined, b: Room | undefined, door: Door): DoorKind {
  const { type, era } = plan.params;
  const kinds = [a?.kind, b?.kind];
  const has = (...list: RoomKind[]) => kinds.some((kind) => kind && list.includes(kind));
  if (era === "stone" || type === "hut" || type === "longhouse") return "curtain";
  if (has("airlock")) return "airlock";
  if (has("cell") && ["prison", "keep", "police", "barracks", "mage-tower", "arena", "palace"].includes(type)) return "bars";
  if (has("vault")) return "iron";
  const outer = door.rooms[1] === -1;
  if (outer) {
    if (door.width >= 2.4 && ["warehouse", "factory", "station", "arena", "barracks", "prison", "palace"].includes(type)) return "gate";
    if (era === "far-future") return "sliding";
    if (type === "bunker") return "iron";
    if (MACHINE.includes(era) && ["store", "office", "clinic", "lab", "station", "school", "bank", "club", "capsule-hotel"].includes(type)) return "glass";
    if (["keep", "palace", "prison", "bank", "temple", "guildhall", "barracks", "mage-tower"].includes(type)) return "heavy";
    return "plain";
  }
  if (has("armory")) return "heavy";
  if (era === "far-future") return "sliding";
  if (door.width >= 1.4 && !MACHINE.includes(era) && era !== "industrial" && era !== "post-apocalypse") return "arch";
  if (door.width >= 1.4 && MACHINE.includes(era) && has("lobby", "office", "lab")) return "glass";
  return "plain";
}

/** How a door is held shut: the house's purse, the age, and what is worth guarding behind it. */
function lockKind(plan: BuildingPlan, a: Room | undefined, b: Room | undefined, door: Door, rng: Rng): LockKind {
  const { era, type } = plan.params;
  const wealth = plan.params.wealth ?? 0.5;
  const magic = plan.params.magic ?? 0;
  const kinds = [a?.kind, b?.kind];
  const has = (...list: RoomKind[]) => kinds.some((kind) => kind && list.includes(kind));
  if (era === "stone" || type === "hut" || type === "longhouse") return "none";
  const digital = era === "cyberpunk" || era === "modern" ? "keycard" : era === "far-future" ? "biometric" : null;
  const warded = magic >= 1 && !MACHINE.includes(era) && has("study", "vault", "sacristy", "ritual-room") && rng.chance(magic >= 2 ? 0.7 : 0.35);
  if (warded) return "magic";
  if (has("vault")) return digital === "keycard" ? "biometric" : digital ?? "master";
  if (has("cell")) return digital ?? "good";
  if (has("armory", "server-room")) return digital ?? "good";
  if (door.rooms[1] === -1) {
    // The back door is barred from inside; the front door locked as well as the house can afford.
    if (Math.abs(door.at[1]) < 0.01) return "bar";
    if (digital && ["office", "lab", "bank", "police", "clinic"].includes(type)) return digital;
    return wealth > 0.65 ? "good" : wealth > 0.25 ? "simple" : "latch";
  }
  if (has("study", "office", "vip") && rng.chance(0.3 + wealth * 0.4)) return digital ?? "simple";
  if (has("bedroom", "guest-room") && rng.chance(0.25 + wealth * 0.3)) return digital === "biometric" ? "biometric" : "simple";
  if (has("storage", "pantry", "cellar") && rng.chance(0.4)) return "latch";
  return "none";
}

/** A door between two rooms that touch but have none: on their shared wall, clear of furniture on both sides. */
export function newDoor(floor: Floor, a: Room, b: Room, rng: Rng, force = false): Door | null {
  const eps = 0.01;
  let wall: { from: Point; to: Point; horizontal: boolean } | null = null;
  if (Math.abs(a.x + a.w - b.x) < eps || Math.abs(b.x + b.w - a.x) < eps) {
    const x = Math.abs(a.x + a.w - b.x) < eps ? b.x : a.x;
    const y0 = Math.max(a.y, b.y),
      y1 = Math.min(a.y + a.h, b.y + b.h);
    if (y1 - y0 >= 1.6) wall = { from: [x, y0], to: [x, y1], horizontal: false };
  } else if (Math.abs(a.y + a.h - b.y) < eps || Math.abs(b.y + b.h - a.y) < eps) {
    const y = Math.abs(a.y + a.h - b.y) < eps ? b.y : a.y;
    const x0 = Math.max(a.x, b.x),
      x1 = Math.min(a.x + a.w, b.x + b.w);
    if (x1 - x0 >= 1.6) wall = { from: [x0, y], to: [x1, y], horizontal: true };
  }
  if (!wall) return null;
  const len = wall.horizontal ? wall.to[0] - wall.from[0] : wall.to[1] - wall.from[1];
  for (let attempt = 0; attempt < 8; attempt++) {
    const t = 0.7 + rng.float(0, 1) * (len - 1.4);
    const at: Point = wall.horizontal ? [wall.from[0] + t, wall.from[1]] : [wall.from[0], wall.from[1] + t];
    if (blocked(a, at) || blocked(b, at) || floor.doors.some((door) => Math.hypot(door.at[0] - at[0], door.at[1] - at[1]) < 1.6)) continue;
    return { at, horizontal: wall.horizontal, width: 0.9, rooms: [a.id, b.id] };
  }
  // The game master's door goes in whatever stands there: in the middle of the wall.
  if (force) return { at: wall.horizontal ? [(wall.from[0] + wall.to[0]) / 2, wall.from[1]] : [wall.from[0], (wall.from[1] + wall.to[1]) / 2], horizontal: wall.horizontal, width: 0.9, rooms: [a.id, b.id] };
  return null;
}

/** Rooms that touch along a wall and have no door between them. */
function strangers(floor: Floor): [Room, Room][] {
  const joined = new Set(floor.doors.map((door) => `${Math.min(...door.rooms)}:${Math.max(...door.rooms)}`));
  const out: [Room, Room][] = [];
  for (const a of floor.rooms)
    for (const b of floor.rooms) if (a.id < b.id && !joined.has(`${a.id}:${b.id}`) && a.kind !== "stairs" && b.kind !== "stairs") out.push([a, b]);
  return out;
}

/** The finishing pass over a fresh plan. */
export function dress(plan: BuildingPlan): BuildingPlan {
  const { params } = plan;
  const base = createRng(`${params.seed}/dress`);
  const stone = params.era === "stone" || params.type === "hut" || params.type === "longhouse";

  // A second way round: one or two more doors on each floor of a house big enough to walk round.
  const loops = base.fork("loops");
  for (const floor of plan.floors) {
    if (stone || floor.level < 0 || floor.rooms.length < 4) continue;
    const pairs = loops.shuffle(strangers(floor).filter(([a, b]) => !["vault", "cell", "toilet", "bath"].includes(a.kind) && !["vault", "cell", "toilet", "bath"].includes(b.kind)));
    let wanted = floor.rooms.length > 8 ? 2 : 1;
    for (const [a, b] of pairs) {
      if (!wanted) break;
      const door = newDoor(floor, a, b, loops);
      if (door) {
        floor.doors.push(door);
        wanted--;
      }
    }
  }

  // A hidden door: between a private room and its neighbour, or a secret way out of the cellar.
  const secrets = base.fork("secret");
  if (!stone && secrets.chance(SECRETIVE.has(params.type) ? 0.7 : 0.3)) {
    const cellar = plan.floors.find((floor) => floor.level < 0);
    (() => {
      if (cellar && secrets.chance(0.45)) {
        // Out through the cellar wall, to a tunnel under the street or the yard.
        const room = cellar.rooms.find((r) => r.kind !== "stairs" && r.kind !== "corridor" && (r.y < 0.01 || r.x < 0.01));
        if (room) {
          const at: Point = room.y < 0.01 ? [room.x + room.w / 2, 0] : [0, room.y + room.h / 2];
          if (!blocked(room, at, 0.6)) {
            cellar.doors.push({ at, horizontal: room.y < 0.01, width: 0.9, rooms: [room.id, -1], secret: true, kind: "plain", lock: "none" });
            return true;
          }
        }
      }
      for (const floor of secrets.shuffle([...plan.floors])) {
        const pairs = strangers(floor).filter(([a, b]) => PRIVATE.has(a.kind) || PRIVATE.has(b.kind));
        for (const [a, b] of secrets.shuffle(pairs)) {
          const door = newDoor(floor, a, b, secrets);
          if (!door) continue;
          floor.doors.push({ ...door, secret: true, kind: "plain", lock: "none" });
          return true;
        }
      }
      return false;
    })();
  }

  // What every door is and how it shuts (the hidden ones are already plain and open to whoever finds them).
  for (const floor of plan.floors) {
    const rng = base.fork(`doors-${floor.level}`);
    for (const door of floor.doors) {
      if (door.secret) continue;
      const a = roomOf(floor, door.rooms[0]);
      const b = door.rooms[1] >= 0 ? roomOf(floor, door.rooms[1]) : undefined;
      door.kind = doorKind(plan, a, b, door);
      door.lock = door.kind === "arch" || door.kind === "curtain" ? "none" : lockKind(plan, a, b, door, rng);
    }
  }

  // A craft's tools: an oven at the baker's, hooks at the butcher's, a loom at the tailor's.
  const craft = params.craft ? CRAFTS[params.craft as Craft] : undefined;
  if (craft) {
    const rng = base.fork("craft");
    const ground = plan.floors.find((floor) => floor.level === 0);
    // The workshop first, then the shop floor, then wherever there is room.
    const order = ["workshop", "shop-floor", "hall", "storage", "living-room"];
    const rooms = (ground?.rooms.filter((room) => order.includes(room.kind)) ?? []).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.w * b.h - a.w * a.h);
    for (const kind of craft.furniture) {
      const size: [number, number] = kind === "oven" || kind === "kiln" || kind === "press" ? [1.4, 1] : kind === "hooks" || kind === "bolts" || kind === "display" ? [1.2, 0.5] : [1, 0.9];
      for (const room of rooms) if (ground && (put(plan, ground, room, kind, size[0], size[1], rng, kind === "kiln" || kind === "barrel" || kind === "vat") || put(plan, ground, room, kind, size[1], size[0], rng, kind === "kiln" || kind === "barrel" || kind === "vat"))) break;
    }
  }

  // The hatch down: in the cellar, or on the ground floor of a house without one.
  if (params.hatch) {
    const rng = base.fork("hatch");
    const floor = plan.floors.find((f) => f.level < 0) ?? plan.floors.find((f) => f.level === 0)!;
    const room = floor.rooms.find((r) => r.kind === "cellar" || r.kind === "storage") ?? floor.rooms.find((r) => r.kind !== "stairs") ?? floor.rooms[0];
    if (!put(plan, floor, room, "hatch", 1, 1, rng)) room.furniture.push({ kind: "hatch", x: room.x + 0.4, y: room.y + 0.4, w: 1, h: 1, round: false });
  }

  // Decay: rubble on the floors, boarded windows, doors off their hinges, a room or two fallen in.
  const decay = params.decay ?? 0;
  if (decay > 0) {
    const rng = base.fork("decay");
    for (const floor of plan.floors) {
      for (const room of floor.rooms) {
        if (room.kind === "stairs") continue;
        for (let k = Math.floor(decay * 3 * rng.float(0.3, 1.3)); k > 0; k--) put(plan, floor, room, "rubble", rng.float(0.6, 1.4), rng.float(0.6, 1.2), rng, true);
      }
      for (const win of floor.windows) if (rng.chance(decay * 0.6)) win.boarded = true;
      for (const door of floor.doors) if (!door.secret && door.rooms[1] >= 0 && rng.chance(decay * 0.4)) ((door.kind = "broken"), (door.lock = "none"));
      if (decay > 0.7) {
        const fallen = rng.shuffle(floor.rooms.filter((room) => room.kind !== "stairs" && room.kind !== "corridor")).slice(0, decay > 0.9 ? 2 : 1);
        for (const room of fallen) {
          room.collapsed = true;
          room.furniture = [];
          for (let k = 0; k < Math.max(2, Math.round((room.w * room.h) / 6)); k++) put(plan, floor, room, "rubble", rng.float(0.8, 1.8), rng.float(0.8, 1.6), rng, true);
        }
      }
    }
  }

  // Magic: circles chalked in studies and cellars, more of them the more the world runs on it.
  const magic = params.magic ?? 0;
  if (magic > 0 && !MACHINE.includes(params.era)) {
    const rng = base.fork("magic");
    for (const floor of plan.floors)
      for (const room of floor.rooms) {
        if (!["study", "lab", "cellar", "sacristy", "vault", "chapel"].includes(room.kind) || room.furniture.some((f) => f.kind === "circle")) continue;
        if (rng.chance(params.type === "mage-tower" ? 0.8 : magic * 0.12)) put(plan, floor, room, "circle", 1.6, 1.6, rng, true) || put(plan, floor, room, "circle", 1.1, 1.1, rng, true);
      }
  }
  return plan;
}

/** Rooms on the other side of each door of a room, for walking about: the room, or -1 outdoors, and the door. */
export function neighbours(floor: Floor, roomId: number): { room: number; door: Door; index: number }[] {
  return floor.doors.flatMap((door, index) => (door.rooms[0] === roomId ? [{ room: door.rooms[1], door, index }] : door.rooms[1] === roomId ? [{ room: door.rooms[0], door, index }] : []));
}
