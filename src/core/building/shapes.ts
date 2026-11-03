// Buildings that are not one rectangle: an L of two wings round a corner, a T with a wing behind the middle, a U of
// three wings round a yard open at the back, four wings round a closed court entered through a gate passage, and the
// round tower — a lighthouse, a mage's tower, an arena. Every floor is laid out in the same wings: rooms are sliced
// along each wing (a hallway down the middle of a deep one), a stair hall stands where the wings meet (a second,
// service stair at the far end of a big house), and an entry hall opens behind the front door of a house that has one.
// Coordinates are metres; the street is on the bottom side, y = depth.
import type { Point } from "../geometry";
import { hashString, type Rng } from "../random";
import { ATTIC, BACK_ROOMS, CIRCULATION, furnish, program, sharedWall, slice, type BuildingParams, type Door, type Floor, type Opening, type Rect, type Room, type RoomKind, type YardFeature } from "./plan";

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Types whose front door opens into an entry hall rather than straight into a room. */
const ENTRY = new Set(["house", "manor", "palace", "guildhall", "bank", "office", "apartment", "police", "school", "clinic", "tenement", "lab", "mage-tower", "barracks", "prison", "custom"]);
/** Rooms without windows. */
const DARK = new Set<RoomKind>(["storage", "cellar", "stairs", "corridor", "server-room", "cell", "pantry", "toilet", "vault", "generator", "boiler-room", "furnace", "capsules", "airlock", "passage", "attic"]);

export interface Wings {
  wings: Rect[];
  court: Rect | null;
  /** The stair halls, carved from the wings' ends: the main one first. */
  stairs: Rect[];
}

/** The wings of a shape on a W × D footprint, or null when the footprint is too small for it. */
export function wingsOf(shape: BuildingParams["shape"], W: number, D: number, seed: string, multi: boolean, big: boolean): Wings | null {
  const s = clamp(Math.round(W * 0.3), 4, 10);
  const st = (length: number) => clamp(Math.min(3.6, length * 0.4), 2.4, 3.6);
  // A stair hall at the end of a wing where it meets the front wing; a wing too short for one gives the corner of the
  // front wing instead.
  const front = (f: number) => ({ x: 0, y: D - f, w: W, h: f });
  const stairOf = (wing: Rect, f: number, far = false): Rect =>
    wing.h >= st(wing.h) + 3 ? { x: wing.x, y: far ? wing.y : wing.y + wing.h - st(wing.h), w: wing.w, h: st(wing.h) } : { x: wing.x + wing.w / 2 < W / 2 ? 0 : W - 2.6, y: D - f, w: 2.6, h: f };
  if (shape === "court") {
    const f = clamp(Math.round(D * 0.3), 4, 9);
    if (W - 2 * s < 3 || D - 2 * f < 3) return null;
    const left = { x: 0, y: f, w: s, h: D - 2 * f };
    const right = { x: W - s, y: f, w: s, h: D - 2 * f };
    const stairs = multi ? [stairOf(left, f), ...(big && right.h >= 6 ? [{ x: W - s, y: f, w: s, h: st(right.h) }] : [])] : [];
    return { wings: [front(f), left, { x: 0, y: 0, w: W, h: f }, right], court: { x: s, y: f, w: W - 2 * s, h: D - 2 * f }, stairs };
  }
  const f = clamp(Math.round(D * 0.55), 4, 11);
  if (D - f < 3) return null;
  const back = (x: number) => ({ x, y: 0, w: s, h: D - f });
  if (shape === "L") {
    if (W < s + 4) return null;
    const side = back(hashString(seed) % 2 ? 0 : W - s);
    return { wings: [front(f), side], court: null, stairs: multi ? [stairOf(side, f), ...(big && side.h > 9 ? [stairOf(side, f, true)] : [])] : [] };
  }
  if (shape === "T") {
    if (W < s + 6) return null;
    const middle = back((W - s) / 2);
    const main = middle.h >= st(middle.h) + 3 ? stairOf(middle, f) : { x: 0, y: D - f, w: 2.6, h: f };
    return { wings: [front(f), middle], court: null, stairs: multi ? [main, ...(big && middle.h > 9 ? [stairOf(middle, f, true)] : [])] : [] };
  }
  if (shape === "U") {
    if (W < 2 * s + 3) return null;
    const left = back(0);
    const right = back(W - s);
    return { wings: [front(f), left, right], court: null, stairs: multi ? [stairOf(left, f), ...(big ? [stairOf(right, f)] : [])] : [] };
  }
  return null;
}

/** A wing with its stair halls cut off its ends. */
function trim(wing: Rect, stairs: Rect[]): Rect {
  let { x, y, w, h } = wing;
  for (const stair of stairs) {
    if (stair.x < x - 0.01 || stair.x + stair.w > x + w + 0.01 || stair.y < y - 0.01 || stair.y + stair.h > y + h + 0.01) continue;
    if (Math.abs(stair.y - y) < 0.01 && Math.abs(stair.w - w) < 0.01) ((y += stair.h), (h -= stair.h));
    else if (Math.abs(stair.y + stair.h - (y + h)) < 0.01 && Math.abs(stair.w - w) < 0.01) h -= stair.h;
    else if (Math.abs(stair.x - x) < 0.01 && Math.abs(stair.h - h) < 0.01) ((x += stair.w), (w -= stair.w));
    else if (Math.abs(stair.x + stair.w - (x + w)) < 0.01 && Math.abs(stair.h - h) < 0.01) w -= stair.w;
  }
  return { x, y, w, h };
}

/** Shares the program's rooms among the wings by their floor area: welcoming rooms in the front wing, the rest behind. */
function share(rooms: [RoomKind, number][], wings: Rect[]): [RoomKind, number][][] {
  const list = [...rooms].sort((a, b) => Number(CIRCULATION.has(b[0])) - Number(CIRCULATION.has(a[0])));
  // Too few rooms for the wings: the biggest room is split until every wing has one.
  while (list.length < wings.length) {
    const biggest = list.reduce((best, room, k) => (room[1] > list[best][1] ? k : best), 0);
    const [kind, size] = list[biggest];
    list.splice(biggest, 1, [kind, size / 2], [kind, size / 2]);
  }
  const area = wings.map((wing) => wing.w * wing.h);
  const total = list.reduce((sum, room) => sum + room[1], 0);
  const all = area.reduce((sum, value) => sum + value, 0);
  const out: [RoomKind, number][][] = wings.map(() => []);
  let wing = 0;
  let filled = 0;
  let due = (area[0] / all) * total;
  list.forEach((room, k) => {
    const left = list.length - k;
    const wingsLeft = wings.length - wing - 1;
    if (wing < wings.length - 1 && out[wing].length && (filled >= due - room[1] / 2 || left <= wingsLeft)) {
      wing++;
      due += (area[wing] / all) * total;
    }
    out[wing].push(room);
    filled += room[1];
  });
  return out;
}

/** The stretches of each room's walls that no other room shares: outer walls and walls onto a court. */
export function outerWalls(rooms: Rect[]): { room: number; a: Point; b: Point; horizontal: boolean }[] {
  const out: { room: number; a: Point; b: Point; horizontal: boolean }[] = [];
  const eps = 0.01;
  rooms.forEach((room, index) => {
    const sides: [Point, Point, boolean, (other: Rect) => boolean][] = [
      [[room.x, room.y], [room.x + room.w, room.y], true, (o) => Math.abs(o.y + o.h - room.y) < eps],
      [[room.x, room.y + room.h], [room.x + room.w, room.y + room.h], true, (o) => Math.abs(o.y - (room.y + room.h)) < eps],
      [[room.x, room.y], [room.x, room.y + room.h], false, (o) => Math.abs(o.x + o.w - room.x) < eps],
      [[room.x + room.w, room.y], [room.x + room.w, room.y + room.h], false, (o) => Math.abs(o.x - (room.x + room.w)) < eps],
    ];
    for (const [a, b, horizontal, touches] of sides) {
      const lo = horizontal ? a[0] : a[1];
      const hi = horizontal ? b[0] : b[1];
      // Covered stretches, merged, then the gaps between them.
      const covered = rooms
        .filter((other, k) => k !== index && touches(other))
        .map((other) => (horizontal ? [Math.max(lo, other.x), Math.min(hi, other.x + other.w)] : [Math.max(lo, other.y), Math.min(hi, other.y + other.h)]))
        .filter(([p, q]) => q - p > eps)
        .sort((p, q) => p[0] - q[0]);
      let at = lo;
      const gaps: [number, number][] = [];
      for (const [p, q] of covered) {
        if (p > at + eps) gaps.push([at, p]);
        at = Math.max(at, q);
      }
      if (hi > at + eps) gaps.push([at, hi]);
      for (const [p, q] of gaps) out.push({ room: index, horizontal, a: horizontal ? [p, a[1]] : [a[0], p], b: horizontal ? [q, a[1]] : [a[0], q] });
    }
  });
  return out;
}

/** Doors: a tree from the hallway (or the main room) so every room can be reached, as in a plain plan. */
function connect(rooms: Room[], own: Rng): Door[] {
  const doors: Door[] = [];
  const root = rooms.find((room) => room.kind === "corridor") ?? rooms.find((room) => CIRCULATION.has(room.kind) && room.kind !== "stairs") ?? rooms[0];
  const reached = new Set([root.id]);
  const queue = [root];
  const addDoor = (a: Room, b: Room) => {
    const wall = sharedWall(a, b)!;
    const len = wall.horizontal ? wall.to[0] - wall.from[0] : wall.to[1] - wall.from[1];
    const t = own.float(0.3, 0.7) * (len - 1.2) + 0.6;
    const at: Point = wall.horizontal ? [wall.from[0] + t, wall.from[1]] : [wall.from[0], wall.from[1] + t];
    doors.push({ at, horizontal: wall.horizontal, width: CIRCULATION.has(a.kind) && CIRCULATION.has(b.kind) ? 1.4 : 0.9, rooms: [a.id, b.id] });
  };
  while (queue.length) {
    const room = queue.shift()!;
    const options = rooms.filter((other) => !reached.has(other.id) && sharedWall(room, other)).sort((a, b) => Number(CIRCULATION.has(b.kind)) - Number(CIRCULATION.has(a.kind)));
    for (const other of options) {
      if (reached.has(other.id)) continue;
      reached.add(other.id);
      addDoor(room, other);
      queue.push(other);
    }
  }
  for (const room of rooms) {
    if (reached.has(room.id)) continue;
    const other = rooms.find((candidate) => candidate !== room && sharedWall(room, candidate));
    if (other) addDoor(room, other);
  }
  return doors;
}

/** Windows along the outer walls (and onto the court), kept clear of the doors. */
function windowsOf(rooms: Room[], doors: Door[], modern: boolean): Opening[] {
  const windows: Opening[] = [];
  for (const wall of outerWalls(rooms)) {
    if (DARK.has(rooms[wall.room].kind)) continue;
    const len = wall.horizontal ? wall.b[0] - wall.a[0] : wall.b[1] - wall.a[1];
    const step = modern ? 2.2 : 3;
    for (let t = step / 2; t < len - 0.8; t += step) {
      const at: Point = wall.horizontal ? [wall.a[0] + t, wall.a[1]] : [wall.a[0], wall.a[1] + t];
      if (doors.some((door) => Math.hypot(door.at[0] - at[0], door.at[1] - at[1]) < 1.4)) continue;
      const half = modern ? 0.8 : 0.5;
      windows.push(wall.horizontal ? { a: [at[0] - half, at[1]], b: [at[0] + half, at[1]] } : { a: [at[0], at[1] - half], b: [at[0], at[1] + half] });
    }
  }
  return windows;
}

const SERVICE = (room: Room) => (room.kind === "kitchen" ? 3 : room.kind === "workshop" ? 2 : ["storage", "pantry", "hall", "common-room", "corridor", "canteen", "guard-room"].includes(room.kind) ? 1 : 0);

/** The floors of a winged building. */
export function wingedFloors(params: BuildingParams, W: number, D: number, levels: number[], top: number, rng: Rng, modern: boolean, layout: Wings): Floor[] {
  const floors: Floor[] = [];
  const frontWing = layout.wings[0];
  for (const level of levels) {
    const own = rng.fork(`floor-${level}`);
    const plan = params.attic && level > top ? ATTIC : program(params.type, level, top, own, modern, params.customType);
    const rects: { rect: Rect; kind: RoomKind }[] = layout.stairs.map((rect) => ({ rect, kind: "stairs" as RoomKind }));
    let wings = layout.wings.map((wing) => trim(wing, layout.stairs));
    // A court is entered through a gate passage in the middle of the front wing.
    if (layout.court && level === 0) {
      const gate: Rect = { x: W / 2 - 1.6, y: frontWing.y, w: 3.2, h: frontWing.h };
      const cut = wings[0];
      rects.push({ rect: gate, kind: "passage" });
      wings = [{ x: cut.x, y: cut.y, w: gate.x - cut.x, h: cut.h }, { x: gate.x + gate.w, y: cut.y, w: cut.x + cut.w - gate.x - gate.w, h: cut.h }, ...wings.slice(1)];
    }
    const parts = share(own.shuffle([...plan.rooms]), wings);
    wings.forEach((wing, k) => {
      const rooms = parts[k];
      if (!rooms.length) return;
      const along = wing.w >= wing.h ? "x" : "y";
      const deep = along === "x" ? wing.h : wing.w;
      if (plan.corridor && deep >= 8 && rooms.length > 1) {
        const cw = 1.6;
        const half = Math.ceil(rooms.length / 2);
        if (along === "x") {
          const mid = wing.y + (wing.h - cw) / 2;
          rects.push({ rect: { x: wing.x, y: mid, w: wing.w, h: cw }, kind: "corridor" });
          slice({ x: wing.x, y: wing.y, w: wing.w, h: mid - wing.y }, rooms.slice(0, half), rects, "x");
          slice({ x: wing.x, y: mid + cw, w: wing.w, h: wing.y + wing.h - mid - cw }, rooms.slice(half), rects, "x");
        } else {
          const mid = wing.x + (wing.w - cw) / 2;
          rects.push({ rect: { x: mid, y: wing.y, w: cw, h: wing.h }, kind: "corridor" });
          slice({ x: wing.x, y: wing.y, w: mid - wing.x, h: wing.h }, rooms.slice(0, half), rects, "y");
          slice({ x: mid + cw, y: wing.y, w: wing.x + wing.w - mid - cw, h: wing.h }, rooms.slice(half), rects, "y");
        }
      } else slice(wing, rooms, rects, along);
    });
    // An entry hall: a strip of the welcoming room behind the front door, running back through it.
    if (level === 0 && ENTRY.has(params.type)) {
      const welcome = (kind: RoomKind) => (BACK_ROOMS.has(kind) ? 0 : CIRCULATION.has(kind) ? 2 : 1);
      const front = rects.filter(({ rect, kind }) => Math.abs(rect.y + rect.h - D) < 0.01 && kind !== "stairs" && kind !== "passage" && rect.w >= 6.5 && rect.h >= 4).sort((a, b) => welcome(b.kind) - welcome(a.kind) || b.rect.w - a.rect.w)[0];
      if (front) {
        const strip: Rect = { x: front.rect.x, y: front.rect.y, w: 2.4, h: front.rect.h };
        front.rect = { ...front.rect, x: front.rect.x + 2.4, w: front.rect.w - 2.4 };
        rects.push({ rect: strip, kind: "vestibule" });
      }
    }
    const rooms: Room[] = rects.map(({ rect, kind }, id) => ({ id, kind, ...rect, furniture: [] }));
    const doors = connect(rooms, own);
    if (level === 0) {
      const welcome = (room: Room) => (room.kind === "vestibule" || room.kind === "passage" ? 3 : BACK_ROOMS.has(room.kind) ? 0 : CIRCULATION.has(room.kind) ? 2 : 1);
      const front = rooms.filter((room) => Math.abs(room.y + room.h - D) < 0.01 && room.kind !== "stairs").sort((a, b) => welcome(b) - welcome(a) || b.w - a.w)[0];
      const grand = ["temple", "keep", "warehouse", "factory", "station", "store", "bathhouse", "hydroponics", "bunker", "palace", "prison", "barracks", "arena", "theatre"].includes(params.type);
      if (front) doors.push({ at: [front.x + front.w / 2, D], horizontal: true, width: grand || front.kind === "passage" ? 2.4 : 1.2, rooms: [front.id, -1] });
      const gate = rooms.find((room) => room.kind === "passage");
      if (gate) doors.push({ at: [gate.x + gate.w / 2, gate.y], horizontal: true, width: 2.4, rooms: [gate.id, -1] });
      // A service door out of the kitchen (or a workshop, a store) to the back or the court.
      const walls = outerWalls(rooms).filter((wall) => !(wall.horizontal && Math.abs(wall.a[1] - D) < 0.01) && SERVICE(rooms[wall.room]) > 0 && (wall.horizontal ? wall.b[0] - wall.a[0] : wall.b[1] - wall.a[1]) >= 1.4);
      const back = walls.sort((a, b) => SERVICE(rooms[b.room]) - SERVICE(rooms[a.room]))[0];
      if (back) doors.push({ at: [(back.a[0] + back.b[0]) / 2, (back.a[1] + back.b[1]) / 2], horizontal: back.horizontal, width: 0.9, rooms: [back.room, -1] });
    }
    const windows = level >= 0 ? windowsOf(rooms, doors, modern) : [];
    for (const room of rooms) room.furniture = furnish(room, doors.filter((door) => door.rooms.includes(room.id)), params.type, modern, own);
    floors.push({ level, rooms, doors, windows });
  }
  return floors;
}

/** The floors of a round tower R metres across: a spiral stair in the middle and four rooms round it like the blades
 * of a pinwheel (one floor without a stair has a great room in the middle — an arena's sand). Whatever the rooms'
 * corners, only what lies inside the round wall is kept. */
export function roundFloors(params: BuildingParams, R: number, levels: number[], top: number, rng: Rng, modern: boolean): Floor[] {
  const multi = levels.length > 1;
  const s = multi ? clamp(R * 0.3, 2.2, 3.2) : R * 0.5;
  const c = (R - s) / 2;
  const cells: Rect[] = [
    { x: c, y: c + s, w: c + s, h: c },
    { x: 0, y: c, w: c, h: c + s },
    { x: 0, y: 0, w: c + s, h: c },
    { x: c + s, y: 0, w: c, h: c + s },
  ];
  const centre: Rect = { x: c, y: c, w: s, h: s };
  const inside = (x: number, y: number, inset = 0.3) => Math.hypot(x - R / 2, y - R / 2) <= R / 2 - inset;
  const floors: Floor[] = [];
  for (const level of levels) {
    const own = rng.fork(`floor-${level}`);
    const plan = params.attic && level > top ? ATTIC : program(params.type, level, top, own, modern, params.customType);
    const kinds = plan.rooms.map(([kind]) => kind);
    const rects: { rect: Rect; kind: RoomKind }[] = [];
    // The lamp of a lighthouse (a mage's circle) stands in the middle of the top floor, a walk round it; the stair comes
    // up at the back of the walk (and goes on to a loft above).
    if (kinds.length === 1 && (kinds[0] === "lantern" || kinds[0] === "ritual-room")) {
      rects.push({ rect: centre, kind: kinds[0] });
      cells.forEach((cell, k) => rects.push({ rect: cell, kind: multi && k === 2 ? "stairs" : "gallery" }));
    } else {
      let ring = kinds;
      if (multi) rects.push({ rect: centre, kind: "stairs" });
      else {
        rects.push({ rect: centre, kind: kinds[0] });
        ring = kinds.length > 1 ? kinds.slice(1) : kinds;
      }
      // Four rooms round the middle: the welcoming one at the door, a short list spread round, a long one cut short.
      const ordered = [...ring].sort((a, b) => Number(CIRCULATION.has(b)) - Number(CIRCULATION.has(a)));
      cells.forEach((cell, k) => rects.push({ rect: cell, kind: ordered.length >= 4 ? ordered[k] : ordered[Math.min(ordered.length - 1, Math.floor((k * ordered.length) / 4))] }));
    }
    const rooms: Room[] = rects.map(({ rect, kind }, id) => ({ id, kind, ...rect, furniture: [] }));
    const doors = connect(rooms, own);
    if (level === 0) {
      const door = rooms.find((room) => room.y + room.h > R - 0.01 && room.x < R / 2 && room.x + room.w > R / 2)!;
      doors.push({ at: [R / 2, R], horizontal: true, width: params.type === "arena" ? 2.4 : 1.2, rooms: [door.id, -1] });
    }
    // Windows round the wall: short chords where the wall passes a room that has them.
    const windows: Opening[] = [];
    if (level >= 0) {
      const count = Math.max(6, Math.floor((Math.PI * R) / (modern ? 2.2 : 3)));
      for (let k = 0; k < count; k++) {
        const angle = (k + 0.5) * ((Math.PI * 2) / count);
        const at: Point = [R / 2 + Math.cos(angle) * (R / 2), R / 2 + Math.sin(angle) * (R / 2)];
        const probe: Point = [R / 2 + Math.cos(angle) * (R / 2 - 0.4), R / 2 + Math.sin(angle) * (R / 2 - 0.4)];
        const room = rooms.find((r) => probe[0] >= r.x && probe[0] <= r.x + r.w && probe[1] >= r.y && probe[1] <= r.y + r.h);
        if (!room || DARK.has(room.kind) || doors.some((door) => Math.hypot(door.at[0] - at[0], door.at[1] - at[1]) < 1.4)) continue;
        const half = (modern ? 0.8 : 0.5) / (R / 2);
        windows.push({ a: [R / 2 + Math.cos(angle - half) * (R / 2), R / 2 + Math.sin(angle - half) * (R / 2)], b: [R / 2 + Math.cos(angle + half) * (R / 2), R / 2 + Math.sin(angle + half) * (R / 2)] });
      }
    }
    for (const room of rooms) room.furniture = furnish(room, doors.filter((door) => door.rooms.includes(room.id)), params.type, modern, own).filter((f) => inside(f.x, f.y) && inside(f.x + f.w, f.y) && inside(f.x, f.y + f.h) && inside(f.x + f.w, f.y + f.h));
    floors.push({ level, rooms, doors, windows });
  }
  return floors;
}

/** What stands in an open court: a well or a fountain in the middle, trees in the corners. */
export function courtFeatures(court: Rect, modern: boolean): YardFeature[] {
  const out: YardFeature[] = [{ kind: modern ? "fountain" : "well", x: court.x + court.w / 2 - 0.9, y: court.y + court.h / 2 - 0.9, w: 1.8, h: 1.8 }];
  if (court.w >= 7 && court.h >= 7)
    for (const [fx, fy] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) out.push({ kind: "tree", x: court.x + court.w * fx - 0.8, y: court.y + court.h * fy - 0.8, w: 1.6, h: 1.6 });
  return out;
}
