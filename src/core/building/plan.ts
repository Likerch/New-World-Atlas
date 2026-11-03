// Buildings and interiors. A footprint becomes floors (a cellar, the ground floor, upper floors) whose rooms follow
// the building's purpose — a tavern's common room and guest rooms, a temple's nave, a keep's hall and cells, an
// office tower's open floors. Doors join every room to the way in, windows open the outer walls, furniture fills the
// rooms, and a fenced yard surrounds the house. Coordinates are metres. The age furnishes them: furs and a hearth in a
// stone-age hut, holo-tables and sleep pods in the far future, mattresses and crates after the fall.
import type { Era } from "../city/model";
import type { Point } from "../geometry";
import { createRng, type Rng } from "../random";

export type BuildingType = "house" | "manor" | "tavern" | "shop" | "smithy" | "temple" | "keep" | "warehouse" | "apartment" | "office" | "clinic" | "club" | "hut";
export const BUILDING_TYPES: BuildingType[] = ["house", "manor", "tavern", "shop", "smithy", "temple", "keep", "warehouse", "apartment", "office", "clinic", "club", "hut"];

export type RoomKind =
  | "hall"
  | "common-room"
  | "kitchen"
  | "pantry"
  | "bedroom"
  | "guest-room"
  | "storage"
  | "workshop"
  | "shop-floor"
  | "office"
  | "study"
  | "chapel"
  | "nave"
  | "sacristy"
  | "armory"
  | "barracks"
  | "throne-room"
  | "corridor"
  | "stairs"
  | "bath"
  | "cellar"
  | "cell"
  | "living-room"
  | "dining"
  | "lobby"
  | "operating-room"
  | "waiting-room"
  | "dance-floor"
  | "bar"
  | "vip"
  | "toilet"
  | "server-room";

export type FurnitureKind =
  | "bed"
  | "bunk"
  | "table"
  | "round-table"
  | "chair"
  | "bench"
  | "counter"
  | "hearth"
  | "stove"
  | "barrel"
  | "crate"
  | "shelf"
  | "altar"
  | "pew"
  | "desk"
  | "chest"
  | "wardrobe"
  | "tub"
  | "toilet"
  | "sofa"
  | "screen"
  | "operating-table"
  | "anvil"
  | "forge"
  | "throne"
  | "rack"
  | "plant"
  | "booth"
  | "carpet"
  | "pillar"
  // The stone age, the far future and the fallen world.
  | "furs"
  | "mat"
  | "log"
  | "pot"
  | "holo-table"
  | "pod"
  | "replicator"
  | "mattress";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Furniture extends Rect {
  kind: FurnitureKind;
  round: boolean;
}

export interface Room extends Rect {
  id: number;
  kind: RoomKind;
  furniture: Furniture[];
}

export interface Door {
  /** Centre of the opening. */
  at: Point;
  /** The wall runs horizontally (true) or vertically. */
  horizontal: boolean;
  width: number;
  /** Rooms on either side; -1 is outdoors. */
  rooms: [number, number];
}

export interface Opening {
  a: Point;
  b: Point;
}

export interface Floor {
  level: number;
  rooms: Room[];
  doors: Door[];
  windows: Opening[];
}

export interface YardFeature {
  kind: "well" | "tree" | "bed" | "shed" | "stable" | "hay" | "cart" | "fountain" | "parking";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BuildingParams {
  seed: string;
  type: BuildingType;
  era: Era;
  name: string;
  /** Footprint, metres. */
  width: number;
  depth: number;
  floors: number;
  cellar: boolean;
  yard: boolean;
}

export interface BuildingPlan {
  params: BuildingParams;
  floors: Floor[];
  /** The yard around the footprint, metres; the building stands at (0, 0). */
  yard: { bounds: Rect; features: YardFeature[] } | null;
}

const SIZES: Record<BuildingType, [number, number, number, number]> = {
  // width range, depth range
  house: [7, 11, 7, 10],
  manor: [18, 26, 12, 16],
  tavern: [13, 18, 10, 14],
  shop: [7, 10, 9, 13],
  smithy: [9, 13, 8, 11],
  temple: [24, 34, 11, 15],
  keep: [16, 22, 14, 20],
  warehouse: [16, 26, 11, 16],
  apartment: [22, 34, 12, 15],
  office: [24, 36, 18, 26],
  clinic: [11, 15, 9, 12],
  club: [18, 26, 13, 18],
  hut: [4, 7, 4, 7],
};

/** Floor counts each type usually has. */
export const BUILDING_FLOORS: Record<BuildingType, [number, number]> = {
  house: [1, 2],
  manor: [2, 3],
  tavern: [2, 3],
  shop: [2, 2],
  smithy: [1, 2],
  temple: [1, 1],
  keep: [3, 4],
  warehouse: [1, 2],
  apartment: [4, 8],
  office: [5, 20],
  clinic: [1, 2],
  club: [1, 2],
  hut: [1, 1],
};

/** Rooms of each floor: [kind, share of the floor]; "corridor" floors line their rooms along a central hallway. */
type Program = { rooms: [RoomKind, number][]; corridor?: boolean };
function program(type: BuildingType, level: number, top: number, rng: Rng, modern: boolean): Program {
  const guests = (count: number, kind: RoomKind = "guest-room"): [RoomKind, number][] => Array.from({ length: count }, () => [kind, 1] as [RoomKind, number]);
  if (level < 0) return type === "keep" ? { rooms: [...guests(rng.int(4, 6), "cell"), ["storage", 1.5]], corridor: true } : { rooms: [["cellar", 1]] };
  switch (type) {
    case "house":
      return level === 0 ? { rooms: [[modern ? "living-room" : "hall", 0.45], ["kitchen", 0.3], [modern ? "bath" : "pantry", 0.25]] } : { rooms: [["bedroom", 0.55], ["bedroom", 0.45]] };
    case "manor":
      return level === 0 ? { rooms: [["hall", 0.32], ["dining", 0.2], ["kitchen", 0.16], ["study", 0.16], ["pantry", 0.16]] } : { rooms: [...guests(rng.int(4, 5), "bedroom"), ["bath", 0.8]], corridor: true };
    case "tavern":
      return level === 0 ? { rooms: [["common-room", 0.6], ["kitchen", 0.24], ["pantry", 0.16]] } : { rooms: guests(rng.int(4, 6)), corridor: true };
    case "shop":
      return level === 0 ? { rooms: [["shop-floor", 0.6], ["workshop", 0.25], ["storage", 0.15]] } : { rooms: [["bedroom", 0.55], ["living-room", 0.45]] };
    case "smithy":
      return level === 0 ? { rooms: [["workshop", 0.72], ["storage", 0.28]] } : { rooms: [["bedroom", 0.6], ["kitchen", 0.4]] };
    case "temple":
      return { rooms: [["nave", 0.74], ["sacristy", 0.13], ["chapel", 0.13]] };
    case "keep":
      if (level === 0) return { rooms: [["hall", 0.4], ["armory", 0.2], ["kitchen", 0.2], ["storage", 0.2]] };
      if (level === 1) return { rooms: [["throne-room", 0.6], ["chapel", 0.2], ["study", 0.2]] };
      return { rooms: [["barracks", 0.55], ["bedroom", 0.45]] };
    case "warehouse":
      return level === 0 ? { rooms: [["storage", 0.82], ["office", 0.18]] } : { rooms: [["storage", 1]] };
    case "apartment":
      return level === 0 ? { rooms: [["lobby", 0.5], ["storage", 0.2], ["office", 0.3]] } : { rooms: Array.from({ length: rng.int(6, 8) }, (_, k): [RoomKind, number] => [(["living-room", "bedroom", "kitchen", "bath"] as RoomKind[])[k % 4], k % 4 === 3 ? 0.6 : 1]), corridor: true };
    case "office":
      return level === 0 ? { rooms: [["lobby", 0.55], ["office", 0.25], ["toilet", 0.2]] } : level === top ? { rooms: [["server-room", 0.4], ["office", 0.6]] } : { rooms: [...guests(rng.int(4, 6), "office"), ["toilet", 0.6]], corridor: true };
    case "clinic":
      return level === 0 ? { rooms: [["waiting-room", 0.34], ["operating-room", 0.34], ["storage", 0.14], ["office", 0.18]] } : { rooms: [["bedroom", 0.5], ["server-room", 0.5]] };
    case "club":
      return level === 0 ? { rooms: [["dance-floor", 0.5], ["bar", 0.2], ["vip", 0.15], ["toilet", 0.15]] } : { rooms: [["vip", 0.5], ["office", 0.5]] };
    case "hut":
      return { rooms: [["hall", 1]] };
  }
}

/** What each age has in place of the middle ages' furniture; null where it has nothing. */
const AGE_FURNITURE: Partial<Record<Era, Partial<Record<FurnitureKind, FurnitureKind | null>>>> = {
  stone: { bed: "furs", bunk: "furs", table: "mat", "round-table": "mat", desk: "mat", counter: "mat", chair: "log", bench: "log", pew: "log", sofa: "furs", chest: "pot", wardrobe: "pot", shelf: "pot", barrel: "pot", crate: "pot", stove: "hearth", carpet: "furs", tub: null, toilet: null, screen: null, throne: "furs", forge: "hearth", anvil: "log" },
  "far-future": { table: "holo-table", desk: "holo-table", "round-table": "holo-table", bed: "pod", bunk: "pod", stove: "replicator", hearth: "replicator", chest: "crate", barrel: "crate" },
  "post-apocalypse": { bed: "mattress", bunk: "mattress", sofa: "mattress", desk: "crate", wardrobe: "crate", screen: null, carpet: null, plant: null, stove: "barrel" },
};

/** Slices a rectangle into rooms with areas in proportion to their shares, keeping them as square as it can. */
function slice(rect: Rect, rooms: [RoomKind, number][], out: { rect: Rect; kind: RoomKind }[], along?: "x" | "y"): void {
  if (rooms.length === 1) {
    out.push({ rect, kind: rooms[0][0] });
    return;
  }
  const total = rooms.reduce((sum, room) => sum + room[1], 0);
  let k = 1;
  let acc = rooms[0][1];
  while (k < rooms.length - 1 && acc + rooms[k][1] <= total / 2) acc += rooms[k++][1];
  const ratio = acc / total;
  const vertical = along ? along === "x" : rect.w >= rect.h;
  const [a, b]: [Rect, Rect] = vertical
    ? [{ x: rect.x, y: rect.y, w: rect.w * ratio, h: rect.h }, { x: rect.x + rect.w * ratio, y: rect.y, w: rect.w * (1 - ratio), h: rect.h }]
    : [{ x: rect.x, y: rect.y, w: rect.w, h: rect.h * ratio }, { x: rect.x, y: rect.y + rect.h * ratio, w: rect.w, h: rect.h * (1 - ratio) }];
  slice(a, rooms.slice(0, k), out, along);
  slice(b, rooms.slice(k), out, along);
}

const CIRCULATION = new Set<RoomKind>(["corridor", "hall", "common-room", "lobby", "shop-floor", "nave", "stairs", "dance-floor", "living-room", "waiting-room", "workshop", "storage", "cellar", "throne-room"]);

/** The wall two rooms share, if they touch along at least a door's width. */
function sharedWall(a: Rect, b: Rect): { from: Point; to: Point; horizontal: boolean } | null {
  const eps = 0.01;
  const overlap = (a0: number, a1: number, b0: number, b1: number) => [Math.max(a0, b0), Math.min(a1, b1)];
  if (Math.abs(a.x + a.w - b.x) < eps || Math.abs(b.x + b.w - a.x) < eps) {
    const x = Math.abs(a.x + a.w - b.x) < eps ? b.x : a.x;
    const [y0, y1] = overlap(a.y, a.y + a.h, b.y, b.y + b.h);
    if (y1 - y0 >= 1.2) return { from: [x, y0], to: [x, y1], horizontal: false };
  }
  if (Math.abs(a.y + a.h - b.y) < eps || Math.abs(b.y + b.h - a.y) < eps) {
    const y = Math.abs(a.y + a.h - b.y) < eps ? b.y : a.y;
    const [x0, x1] = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
    if (x1 - x0 >= 1.2) return { from: [x0, y], to: [x1, y], horizontal: true };
  }
  return null;
}

function furnish(room: Room, doors: Door[], type: BuildingType, modern: boolean, rng: Rng): Furniture[] {
  const out: Furniture[] = [];
  const m = 0.35;
  const { x, y, w, h } = room;
  const clear = (f: Rect) => doors.every((door) => door.at[0] < f.x - 1 || door.at[0] > f.x + f.w + 1 || door.at[1] < f.y - 1 || door.at[1] > f.y + f.h + 1);
  const add = (kind: FurnitureKind, fx: number, fy: number, fw: number, fh: number, round = false) => {
    const f = { kind, x: fx, y: fy, w: fw, h: fh, round };
    if (fx >= x && fy >= y && fx + fw <= x + w && fy + fh <= y + h && clear(f) && out.every((o) => fx >= o.x + o.w || o.x >= fx + fw || fy >= o.y + o.h || o.y >= fy + fh)) out.push(f);
  };
  const grid = (kind: FurnitureKind, fw: number, fh: number, gx: number, gy: number, round = false, margin = 0.8) => {
    for (let px = x + margin; px + fw <= x + w - margin; px += gx) for (let py = y + margin; py + fh <= y + h - margin; py += gy) add(kind, px, py, fw, fh, round);
  };
  const alongTop = (kind: FurnitureKind, fw: number, fh: number, step: number) => {
    for (let px = x + m; px + fw <= x + w - m; px += step) add(kind, px, y + m, fw, fh);
  };
  switch (room.kind) {
    case "bedroom":
    case "guest-room": {
      const beds = room.kind === "guest-room" && w * h > 14 && rng.chance(0.5) ? 2 : 1;
      for (let k = 0; k < beds; k++) add("bed", x + m + k * 1.8, y + m, 1.4, 2.0);
      add("chest", x + m, y + m + 2.1, 1.0, 0.6);
      add(modern ? "screen" : "wardrobe", x + w - m - 1.2, y + m, 1.2, 0.6);
      add("table", x + w - m - 1.0, y + h - m - 0.8, 1.0, 0.8);
      break;
    }
    case "common-room":
    case "dining":
      alongTop("counter", Math.min(w - 2 * m, 5), 0.7, 99);
      add(modern ? "screen" : "hearth", x + w - m - 1.8, y + h - m - 0.8, 1.8, 0.8);
      grid("round-table", 1.2, 1.2, 2.6, 2.6, true, 1.4);
      // Chairs round every table.
      for (const table of out.filter((f) => f.kind === "round-table")) {
        add("chair", table.x + 0.35, table.y - 0.55, 0.5, 0.45);
        add("chair", table.x + 0.35, table.y + 1.3, 0.5, 0.45);
        add("chair", table.x - 0.55, table.y + 0.35, 0.45, 0.5);
        add("chair", table.x + 1.3, table.y + 0.35, 0.45, 0.5);
      }
      break;
    case "hall":
    case "living-room":
      add(modern ? "sofa" : "hearth", x + w / 2 - 1, y + m, 2, 0.8);
      add(modern ? "sofa" : "bench", x + m, y + h / 2 - 1, 0.8, 2);
      add("table", x + w / 2 - 1, y + h / 2 - 0.6, 2, 1.2);
      add("carpet", x + w / 2 - 1.6, y + h / 2 - 1.2, 3.2, 2.4);
      break;
    case "kitchen":
      add(modern ? "stove" : "hearth", x + m, y + m, 1.8, 0.8);
      add("table", x + w / 2 - 0.8, y + h / 2 - 0.5, 1.6, 1.0);
      add("barrel", x + w - m - 0.8, y + h - m - 0.8, 0.8, 0.8, true);
      alongTop("shelf", 1.2, 0.4, 1.4);
      break;
    case "pantry":
    case "storage":
    case "cellar":
      grid(rng.chance(0.5) ? "barrel" : "crate", 0.8, 0.8, 1.3, 1.3, room.kind !== "storage", 0.5);
      break;
    case "workshop":
      if (type === "smithy") {
        add("forge", x + m, y + m, 1.6, 1.2);
        add("anvil", x + m + 2.2, y + m + 0.5, 0.8, 0.5);
      }
      alongTop("table", 1.8, 0.8, 2.2);
      add("rack", x + w - m - 0.5, y + h - m - 2, 0.5, 2);
      break;
    case "shop-floor":
      add("counter", x + m + 1, y + h / 2 - 0.4, Math.min(3, w - 3), 0.8);
      alongTop("shelf", 1.4, 0.5, 1.6);
      break;
    case "office":
    case "study":
      if (modern && w * h > 20) grid("desk", 1.4, 0.8, 2.4, 2.2, false, 1);
      else {
        add("desk", x + w / 2 - 0.8, y + h / 2 - 0.4, 1.6, 0.8);
        alongTop("shelf", 1.2, 0.4, 1.4);
      }
      break;
    case "nave":
      add("altar", x + w - m - 1.6, y + h / 2 - 1, 1.2, 2);
      for (let px = x + 2; px + 0.6 <= x + w - 4; px += 1.4) {
        add("pew", px, y + 1, 0.6, h / 2 - 2);
        add("pew", px, y + h / 2 + 1, 0.6, h / 2 - 2);
      }
      for (let px = x + 3; px < x + w - 4; px += 4) {
        add("pillar", px, y + 0.4, 0.6, 0.6, true);
        add("pillar", px, y + h - 1, 0.6, 0.6, true);
      }
      break;
    case "chapel":
      add("altar", x + w / 2 - 0.8, y + m, 1.6, 0.8);
      add("pew", x + m + 0.5, y + h / 2, w - 2 * m - 1, 0.5);
      break;
    case "sacristy":
      add("chest", x + m, y + m, 1.2, 0.6);
      alongTop("shelf", 1.2, 0.4, 1.4);
      break;
    case "armory":
      alongTop("rack", 1.6, 0.5, 2);
      add("chest", x + w / 2 - 0.6, y + h - m - 0.7, 1.2, 0.7);
      break;
    case "barracks":
      grid("bunk", 0.9, 2.0, 1.6, 2.8, false, 0.6);
      break;
    case "throne-room":
      add("throne", x + w - m - 1.2, y + h / 2 - 0.6, 1.2, 1.2);
      add("carpet", x + 1, y + h / 2 - 0.8, w - 3, 1.6);
      for (let px = x + 2; px < x + w - 3; px += 3.5) {
        add("pillar", px, y + 1.2, 0.7, 0.7, true);
        add("pillar", px, y + h - 1.9, 0.7, 0.7, true);
      }
      break;
    case "bath":
      add("tub", x + m, y + m, 1.6, 0.8);
      if (modern) add("toilet", x + w - m - 0.6, y + m, 0.6, 0.7);
      break;
    case "toilet":
      for (let px = x + m; px + 0.7 <= x + w - m; px += 1.2) add("toilet", px, y + m, 0.6, 0.7);
      break;
    case "cell":
      add("bench", x + m, y + m, 0.6, 1.8);
      break;
    case "lobby":
    case "waiting-room":
      add("counter", x + w / 2 - 1.5, y + m, 3, 0.8);
      add("plant", x + m, y + m, 0.7, 0.7, true);
      add("plant", x + w - m - 0.7, y + m, 0.7, 0.7, true);
      grid(room.kind === "lobby" ? "sofa" : "chair", room.kind === "lobby" ? 2 : 0.6, 0.8, room.kind === "lobby" ? 3 : 1, 2, false, 2);
      break;
    case "operating-room":
      add("operating-table", x + w / 2 - 1, y + h / 2 - 0.4, 2, 0.8);
      alongTop("screen", 1.2, 0.4, 1.6);
      add("shelf", x + m, y + h - m - 0.5, 1.6, 0.5);
      break;
    case "dance-floor":
      add("booth", x + w - m - 2, y + h / 2 - 1, 2, 2);
      break;
    case "bar":
      add("counter", x + m, y + m + 0.8, w - 2 * m, 0.7);
      alongTop("shelf", 1.4, 0.4, 1.6);
      break;
    case "vip":
      add("sofa", x + m, y + m, 2.4, 0.9);
      add("round-table", x + m + 0.8, y + m + 1.3, 1, 1, true);
      add("sofa", x + m, y + h - m - 0.9, 2.4, 0.9);
      break;
    case "server-room":
      grid("rack", 0.6, 2.2, 1.6, 3, false, 0.8);
      break;
    default:
      break;
  }
  return out;
}

export function buildingParams(input: Partial<BuildingParams> = {}): BuildingParams {
  const seed = input.seed || Math.floor(Math.random() * 1e9).toString(36);
  const rng = createRng(seed).fork("building-params");
  const type = input.type ?? rng.pick(BUILDING_TYPES);
  const [w0, w1, d0, d1] = SIZES[type];
  const [f0, f1] = BUILDING_FLOORS[type];
  return {
    seed,
    type,
    era: input.era ?? (["apartment", "office", "clinic", "club"].includes(type) ? "modern" : type === "hut" ? "stone" : "medieval"),
    name: "",
    width: Math.round(rng.float(w0, w1)),
    depth: Math.round(rng.float(d0, d1)),
    floors: rng.int(f0, f1),
    cellar: type !== "temple" && type !== "hut" && rng.chance(0.6),
    yard: ["house", "manor", "tavern", "smithy", "shop", "clinic", "hut"].includes(type),
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
  };
}

export function generateBuilding(input: Partial<BuildingParams> = {}): BuildingPlan {
  const params = buildingParams(input);
  const rng = createRng(params.seed).fork("building");
  const modern = params.era === "modern" || params.era === "cyberpunk" || params.era === "industrial" || params.era === "far-future" || params.era === "post-apocalypse";
  // The long side runs along x; the street (and the front door) is on the bottom side, y = depth.
  const W = Math.max(params.width, params.depth, 5);
  const D = Math.max(4, Math.min(params.width, params.depth));
  const levels = [...(params.cellar ? [-1] : []), ...Array.from({ length: Math.max(1, Math.min(params.floors, 6)) }, (_, k) => k)];
  const multi = levels.length > 1;
  const stairsW = multi ? Math.min(2.8, W * 0.25) : 0;
  const stairsH = Math.min(4.2, D * 0.5);
  const floors: Floor[] = [];

  for (const level of levels) {
    const own = rng.fork(`floor-${level}`);
    const plan = program(params.type, level, levels[levels.length - 1], own, modern);
    const rects: { rect: Rect; kind: RoomKind }[] = [];
    const main: Rect = { x: 0, y: 0, w: W - stairsW, h: D };
    if (multi) {
      rects.push({ rect: { x: W - stairsW, y: 0, w: stairsW, h: stairsH }, kind: "stairs" });
      rects.push({ rect: { x: W - stairsW, y: stairsH, w: stairsW, h: D - stairsH }, kind: plan.corridor ? "corridor" : level < 0 ? "cellar" : level === 0 ? "storage" : "corridor" });
    }
    if (plan.corridor && D >= 8) {
      const cw = 1.6;
      const top = (D - cw) / 2;
      rects.push({ rect: { x: 0, y: top, w: main.w, h: cw }, kind: "corridor" });
      const half = Math.ceil(plan.rooms.length / 2);
      slice({ x: 0, y: 0, w: main.w, h: top }, plan.rooms.slice(0, half), rects, "x");
      if (plan.rooms.length > half) slice({ x: 0, y: top + cw, w: main.w, h: D - top - cw }, plan.rooms.slice(half), rects, "x");
    } else slice(main, own.shuffle([...plan.rooms]).sort((a, b) => Number(CIRCULATION.has(b[0])) - Number(CIRCULATION.has(a[0]))), rects);
    const rooms: Room[] = rects.map(({ rect, kind }, id) => ({ id, kind, ...rect, furniture: [] }));

    // Doors: a tree from the main room (or hallway) so every room can be reached, plus the front door.
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
    // Rooms the tree missed (no shared wall with a reached room) are joined to any neighbour.
    for (const room of rooms) {
      if (reached.has(room.id)) continue;
      const other = rooms.find((candidate) => candidate !== room && sharedWall(room, candidate));
      if (other) addDoor(room, other);
    }
    if (level === 0) {
      const front = rooms.filter((room) => Math.abs(room.y + room.h - D) < 0.01 && room.kind !== "stairs").sort((a, b) => Number(CIRCULATION.has(b.kind)) - Number(CIRCULATION.has(a.kind)) || b.w - a.w)[0];
      if (front) doors.push({ at: [front.x + front.w / 2, D], horizontal: true, width: params.type === "temple" || params.type === "keep" || params.type === "warehouse" ? 2.4 : 1.2, rooms: [front.id, -1] });
      const kitchen = rooms.find((room) => room.kind === "kitchen" && room.y < 0.01);
      if (kitchen) doors.push({ at: [kitchen.x + kitchen.w / 2, 0], horizontal: true, width: 0.9, rooms: [kitchen.id, -1] });
    }

    // Windows along the outer walls, kept clear of the doors.
    const windows: Opening[] = [];
    if (level >= 0) {
      for (const room of rooms) {
        if (["storage", "cellar", "stairs", "corridor", "server-room", "cell", "pantry", "toilet"].includes(room.kind)) continue;
        const sides: [Point, Point, boolean][] = [];
        if (room.y < 0.01) sides.push([[room.x, 0], [room.x + room.w, 0], true]);
        if (Math.abs(room.y + room.h - D) < 0.01) sides.push([[room.x, D], [room.x + room.w, D], true]);
        if (room.x < 0.01) sides.push([[0, room.y], [0, room.y + room.h], false]);
        if (Math.abs(room.x + room.w - W) < 0.01) sides.push([[W, room.y], [W, room.y + room.h], false]);
        for (const [a, b, horizontal] of sides) {
          const len = horizontal ? b[0] - a[0] : b[1] - a[1];
          const step = modern ? 2.2 : 3;
          for (let t = step / 2; t < len - 0.8; t += step) {
            const at: Point = horizontal ? [a[0] + t, a[1]] : [a[0], a[1] + t];
            if (doors.some((door) => Math.hypot(door.at[0] - at[0], door.at[1] - at[1]) < 1.4)) continue;
            const half = modern ? 0.8 : 0.5;
            windows.push(horizontal ? { a: [at[0] - half, at[1]], b: [at[0] + half, at[1]] } : { a: [at[0], at[1] - half], b: [at[0], at[1] + half] });
          }
        }
      }
    }
    for (const room of rooms) room.furniture = furnish(room, doors.filter((door) => door.rooms.includes(room.id)), params.type, modern, own).flatMap((item) => {
   const swap = AGE_FURNITURE[params.era]?.[item.kind];
   return swap === null ? [] : swap ? [{ ...item, kind: swap, round: swap === "pot" || item.round }] : [item];
 });
    floors.push({ level, rooms, doors, windows });
  }

  // The yard: a fenced plot round the house with what a household keeps outside.
  let yard: BuildingPlan["yard"] = null;
  if (params.yard) {
    const own = rng.fork("yard");
    const margin = { left: own.float(2, 6), right: own.float(3, 8), back: own.float(4, 10), front: own.float(1.5, 3) };
    const bounds = { x: -margin.left, y: -margin.back, w: W + margin.left + margin.right, h: D + margin.back + margin.front };
    const features: YardFeature[] = [];
    const freeBack = { x: bounds.x + 0.8, y: bounds.y + 0.8, w: bounds.w - 1.6, h: margin.back - 1.6 };
    if (freeBack.h > 2) {
      features.push({ kind: modern ? "fountain" : "well", x: freeBack.x + own.float(0, freeBack.w - 1.5), y: freeBack.y + own.float(0, freeBack.h - 1.5), w: 1.5, h: 1.5 });
      if (params.type === "tavern" && freeBack.h > 4) features.push({ kind: "stable", x: freeBack.x + freeBack.w - 7, y: freeBack.y, w: 7, h: Math.min(4, freeBack.h) });
      else if (!modern) for (let k = 0; k < 3; k++) features.push({ kind: "bed", x: freeBack.x + 2 + k * 2.2, y: freeBack.y + 0.3, w: 1.6, h: Math.min(3, freeBack.h - 0.6) });
      else features.push({ kind: "parking", x: freeBack.x, y: freeBack.y, w: Math.min(10, freeBack.w), h: Math.min(5, freeBack.h) });
    }
    const side = { x: W + 0.8, y: bounds.y + 1, w: margin.right - 1.6, h: bounds.h - 2 };
    if (side.w > 1.5) {
      for (let k = own.int(1, 3); k > 0; k--) features.push({ kind: "tree", x: side.x + own.float(0, side.w - 1.6), y: side.y + own.float(0, side.h - 1.6), w: 1.6, h: 1.6 });
      if (!modern && side.w > 2.5) features.push({ kind: own.chance(0.5) ? "hay" : "cart", x: side.x, y: D - 3, w: Math.min(2.4, side.w), h: 1.8 });
      if (side.w > 3 && own.chance(0.6)) features.push({ kind: "shed", x: side.x, y: side.y, w: Math.min(3.5, side.w), h: 3 });
    }
    yard = { bounds, features };
  }
  return { params: { ...params, width: W, depth: D }, floors, yard };
}
