// One room up close, for a scene or a fight: its furniture from the plan, the small things lying about, what a
// careful search turns up, which pieces give cover, where the light falls, and the ways out.
import type { Point } from "../geometry";
import { createRng } from "../random";
import type { BuildingPlan, Furniture, FurnitureKind } from "./plan";

export type ItemKind = "candle" | "mug" | "plate" | "book" | "jar" | "coins" | "letter" | "key" | "weapon" | "bottle" | "lamp" | "papers" | "datapad" | "credstick" | "rug" | "bones" | "rubbish" | "relic" | "cushion" | "tools";

export interface RoomItem {
  x: number;
  y: number;
  kind: ItemKind;
  /** Found only by searching. */
  hidden: boolean;
}

export interface Cover {
  x: number;
  y: number;
  w: number;
  h: number;
  full: boolean;
}

export interface Exit {
  at: Point;
  kind: "door" | "window";
  horizontal: boolean;
  width: number;
}

export interface RoomMap {
  seed: string;
  kind: string;
  /** Metres. */
  w: number;
  h: number;
  furniture: Furniture[];
  items: RoomItem[];
  cover: Cover[];
  exits: Exit[];
  lights: [number, number, number][];
  /** For a stairwell: whether its flights lead up and down. */
  flights?: { up: boolean; down: boolean };
}

const ON: Partial<Record<FurnitureKind, ItemKind[]>> = {
  table: ["candle", "mug", "plate", "papers", "letter"],
  "round-table": ["mug", "plate", "candle"],
  desk: ["papers", "lamp", "letter", "book"],
  counter: ["bottle", "mug", "coins"],
  shelf: ["book", "jar", "bottle", "tools"],
  altar: ["candle", "relic"],
  chest: ["coins", "key"],
  rack: ["weapon"],
  bed: ["cushion", "letter"],
};
const FULL = new Set<FurnitureKind>(["shelf", "rack", "wardrobe", "counter", "booth", "forge", "pillar", "screen", "machine", "locker", "generator"]);
const HALF = new Set<FurnitureKind>(["table", "round-table", "desk", "bench", "pew", "chest", "barrel", "crate", "altar", "sofa", "bed", "bunk", "tub", "anvil", "operating-table", "throne", "vat"]);
const LIGHT = new Set<FurnitureKind>(["hearth", "forge", "stove"]);

export function generateRoom(plan: BuildingPlan, floorIndex: number, roomId: number): RoomMap {
  const floor = plan.floors[floorIndex];
  const room = floor.rooms.find((r) => r.id === roomId)!;
  const seed = `${plan.params.seed}/floor-${floor.level}/room-${roomId}`;
  const rng = createRng(seed);
  const era = plan.params.era;
  const local = (x: number, y: number): Point => [x - room.x, y - room.y];
  const furniture = room.furniture.map((f) => ({ ...f, x: f.x - room.x, y: f.y - room.y }));
  const items: RoomItem[] = [];
  // What lies about follows the age: no letters, keys or coins in a stone-age hut, lamps once there is gas or power,
  // datapads and cred-sticks only when there are screens.
  const screens = era === "modern" || era === "cyberpunk" || era === "far-future";
  const swap = (kind: ItemKind): ItemKind | null =>
    era === "stone"
      ? ["letter", "papers", "book", "key", "candle", "datapad", "credstick"].includes(kind)
        ? null
        : kind === "coins"
          ? "relic"
          : kind === "mug" || kind === "plate" || kind === "bottle"
            ? "jar"
            : kind
      : screens
        ? kind === "candle" ? "lamp" : kind === "letter" || kind === "book" ? "datapad" : kind === "coins" ? "credstick" : kind
        : era === "industrial" || era === "post-apocalypse"
          ? kind === "candle" ? "lamp" : kind === "letter" && era === "post-apocalypse" ? "papers" : kind
          : kind;
  const put = (x: number, y: number, kind: ItemKind, hidden: boolean) => {
    const now = swap(kind);
    if (now) items.push({ x, y, kind: now, hidden });
  };
  for (const f of furniture) {
    const options = ON[f.kind];
    if (!options) continue;
    for (let k = rng.int(1, f.kind === "shelf" || f.kind === "counter" ? 4 : 2); k > 0; k--) {
      put(f.x + rng.float(0.15, 0.85) * f.w, f.y + rng.float(0.15, 0.85) * f.h, rng.pick(options), false);
    }
  }
  // On the floor: a rug in living spaces, rubbish in stores and cells.
  if (["hall", "living-room", "bedroom", "study", "vip"].includes(room.kind) && rng.chance(0.6)) items.push({ x: room.w / 2, y: room.h / 2, kind: "rug", hidden: false });
  if (["storage", "cellar", "cell", "pantry"].includes(room.kind)) for (let k = rng.int(1, 4); k > 0; k--) items.push({ x: rng.float(0.4, room.w - 0.4), y: rng.float(0.4, room.h - 0.4), kind: room.kind === "cell" ? "bones" : "rubbish", hidden: false });
  // Hidden things: a loose board, a false bottom, something under the bed.
  for (let k = rng.int(0, 2); k > 0; k--) put(rng.float(0.5, room.w - 0.5), rng.float(0.5, room.h - 0.5), rng.pick<ItemKind>(["coins", "key", "letter", "weapon", "relic"]), true);

  const cover: Cover[] = furniture.filter((f) => FULL.has(f.kind) || HALF.has(f.kind)).map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h, full: FULL.has(f.kind) }));
  const lights: [number, number, number][] = furniture.filter((f) => LIGHT.has(f.kind)).map((f) => [f.x + f.w / 2, f.y + f.h / 2, 4]);
  for (const item of items) if (item.kind === "candle" || item.kind === "lamp") lights.push([item.x, item.y, 2]);

  const onEdge = (p: Point) => Math.abs(p[0] - room.x) < 0.01 || Math.abs(p[0] - room.x - room.w) < 0.01 || Math.abs(p[1] - room.y) < 0.01 || Math.abs(p[1] - room.y - room.h) < 0.01;
  const within = (p: Point) => p[0] >= room.x - 0.01 && p[0] <= room.x + room.w + 0.01 && p[1] >= room.y - 0.01 && p[1] <= room.y + room.h + 0.01;
  const exits: Exit[] = [
    ...floor.doors.filter((door) => door.rooms.includes(room.id)).map((door): Exit => ({ at: local(door.at[0], door.at[1]), kind: "door", horizontal: door.horizontal, width: door.width })),
    ...floor.windows.filter((win) => within(win.a) && within(win.b) && onEdge(win.a) && onEdge(win.b)).map((win): Exit => {
      const horizontal = Math.abs(win.a[1] - win.b[1]) < 0.01;
      return { at: local((win.a[0] + win.b[0]) / 2, (win.a[1] + win.b[1]) / 2), kind: "window", horizontal, width: Math.hypot(win.b[0] - win.a[0], win.b[1] - win.a[1]) };
    }),
  ];
  const flights = room.kind === "stairs" ? { up: floorIndex < plan.floors.length - 1, down: floorIndex > 0 } : undefined;
  return { seed, kind: room.kind, w: room.w, h: room.h, furniture, items, cover, exits, lights, flights };
}
