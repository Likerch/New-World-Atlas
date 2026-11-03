// What every local map is built with: keying a room (its purpose, who and what is in it, how it looks), furnishing it
// by purpose, doors where passages meet rooms, bridges over chasms, locked doors with their keys lying where one can
// reach them first, secret rooms found only through secret doors, and the stairs where one level meets the next.
import type { Language } from "../language";
import { makeNpc, type Npc, type Role } from "../people";
import { createRng, type Rng } from "../random";
import { blocked, doorsOf, passage, placeSeed, reachOf, TILE, walk, type Keyed, type LocalFeature, type LocalFeatureKind, type LocalGroup, type LocalParams, type Purpose } from "./model";
import { stock, type Family, type Tables } from "./stock";

export interface Build {
  params: LocalParams;
  W: number;
  H: number;
  tiles: Uint8Array;
  keyed: Keyed[];
  features: LocalFeature[];
  /** The layout's own stream: what is drawn from it never depends on danger, the ruler or the age. */
  rng: Rng;
  tables: Tables;
  /** Whoever rules the place, on its last level. */
  lord: LocalGroup | null;
  language: Language;
  /** The place and level, for stable names of its people. */
  key: string;
  depth: number;
}

export const cellAt = (b: Build, x: number, y: number) => x + y * b.W;

export function taken(b: Build, x: number, y: number): boolean {
  return b.features.some((f) => f.x === x && f.y === y);
}

/** Ground one stands on and puts things on: dry, open, nothing there yet. */
export function freeFloor(b: Build, cell: number): boolean {
  const t = b.tiles[cell];
  return !blocked(t) && t !== TILE.water && t !== TILE.deep && !taken(b, cell % b.W, Math.floor(cell / b.W));
}

/** The free tile of some cells nearest a wish (the wish itself when nothing is free). */
export function spot(b: Build, cells: number[], wx: number, wy: number): [number, number] {
  let found: [number, number] = [Math.round(wx), Math.round(wy)];
  let d0 = Infinity;
  for (const c of cells) {
    if (!freeFloor(b, c)) continue;
    const x = c % b.W,
      y = Math.floor(c / b.W);
    const d = Math.hypot(x - wx, y - wy);
    if (d < d0) [d0, found] = [d, [x, y]];
  }
  return found;
}

/** Where one level of a place meets the next: level n's stairs down and level n + 1's stairs up stand here. */
export function linkPoint(seed: string, n: number, W: number, H: number): [number, number] {
  const rng = createRng(`${placeSeed(seed)}/link-${n}`);
  return [Math.round(rng.float(0.22, 0.78) * W), Math.round(rng.float(0.28, 0.72) * H)];
}

/** How a family of places looks, sounds and smells. */
const AMBIENT: Record<string, string[]> = {
  crypt: ["dust", "cold", "silence", "carvings", "cobwebs"],
  temple: ["incense", "murals", "echo", "candles"],
  mine: ["props", "drip", "glint", "bad-air"],
  sewer: ["stench", "squeak", "flow", "slime"],
  facility: ["hum", "flicker", "stale-air", "signs"],
  metro: ["draught", "tiles", "rumble", "graffiti"],
  mall: ["mannequins", "glass", "music", "rot"],
  ship: ["recycled-air", "alarm", "frost", "gravity"],
  cave: ["drip", "echo", "bats", "cold"],
  hold: ["hearth", "carvings", "hammering", "lamps"],
  wild: ["birdsong", "wind", "tracks", "smoke"],
  seabed: ["current", "bubbles", "dim", "fish"],
  waste: ["dust-storm", "geiger", "rust", "silence"],
};
const AMBIENT_OF: Partial<Record<Family, string>> = { crypt: "crypt", temple: "temple", mine: "mine", sewer: "sewer", facility: "facility", metro: "metro", mall: "mall", ship: "ship", cave: "cave", hold: "hold", seabed: "seabed", waste: "waste" };
/** A sentence or two of how each kind of room looks. */
const LOOKS: Partial<Record<Purpose, string[]>> = {
  entrance: ["steps", "marks"],
  "guard-room": ["table", "slits"],
  barracks: ["bunks", "gear"],
  shrine: ["idol", "offerings"],
  treasury: ["shelves", "scratched"],
  prison: ["chains", "tallies"],
  library: ["books", "burnt"],
  laboratory: ["glassware", "cages"],
  lair: ["bones", "musk"],
  storage: ["sacks", "rot"],
  "trap-room": ["tiles", "bodies"],
  flooded: ["dark-water", "floating"],
  tomb: ["sarcophagus", "inscription"],
  workshop: ["tools", "unfinished"],
  "server-room": ["racks", "chill"],
  camp: ["ashes", "bedrolls"],
  clearing: ["flowers", "stump"],
  ruin: ["walls", "ivy"],
  nest: ["webs", "eggs"],
  spring: ["clear", "icy"],
  ossuary: ["skulls", "niches"],
  "great-hall": ["pillars", "banners"],
  quarters: ["beds", "letters"],
  "mine-face": ["vein", "picks"],
  cistern: ["vaults", "drips"],
  platform: ["signs", "train"],
  armory: ["racks", "empty-racks"],
  medbay: ["cots", "blood"],
  dwelling: ["hearth", "children"],
  "ship-bridge": ["screens", "chair"],
  "engine-room": ["heat", "throb"],
  airlock: ["suits", "warning"],
  "cargo-hold": ["containers", "loose"],
  shop: ["shelves", "counter"],
  garden: ["beds", "lamps"],
};

/** Two lines of description: how the place feels here, and what this room is like. */
export function lookOf(rng: Rng, family: Family, purpose: string, object?: string): string[] {
  const ambient = AMBIENT[AMBIENT_OF[family] ?? "wild"];
  const own = object ? [`object.${object}`] : (LOOKS[purpose as Purpose] ?? []).map((id) => `look.${purpose}.${id}`);
  return [`look.${AMBIENT_OF[family] ?? "wild"}.${rng.pick(ambient)}`, ...(own.length ? [rng.pick(own)] : [])];
}

/** People worth a name in a room who are not a band: a captive, a scholar among the books, a hermit at a shrine. */
export function notablesOf(rng: Rng, purpose: string, b: Build, id: number): Npc[] {
  const roles: Partial<Record<string, [Role, number]>> = { prison: ["prisoner", 0.6], library: ["scholar", 0.25], shrine: ["hermit", 0.2], laboratory: ["doctor", 0.25], medbay: ["doctor", 0.3], workshop: [b.tables.age === "old" || b.tables.age === "primal" ? "smith" : "engineer", 0.15] };
  const role = roles[purpose];
  if (!role || !rng.chance(role[1])) return [];
  return [makeNpc(`${b.key}/room-${id}/${role[0]}`, b.language, role[0], { secretChance: 0.6 })];
}

/** A new keyed room: its stock and its looks drawn from streams of its own. */
export function keyRoom(b: Build, cells: number[], x: number, y: number, purpose: Keyed["purpose"], extra: { final?: boolean; object?: string; name?: string; secret?: boolean } = {}): Keyed {
  const id = b.keyed.length + 1;
  const own = b.rng.fork(`stock-${id}`);
  const stocked = stock({ rng: own, purpose, final: !!extra.final, tables: b.tables, danger: b.params.danger, depth: b.depth, lord: extra.final ? b.lord : null, key: `${b.key}/room-${id}`, language: b.language });
  const room: Keyed = { id, cells, x, y, purpose, ...stocked, secret: !!extra.secret, name: extra.name ?? "", look: lookOf(b.rng.fork(`look-${id}`), b.tables.family, purpose, extra.object) };
  const people = notablesOf(b.rng.fork(`people-${id}`), purpose, b, id);
  if (people.length) room.people = people;
  if (extra.object) room.object = extra.object;
  if (extra.final) room.final = true;
  b.keyed.push(room);
  return room;
}

/** The box round some cells. */
export function boxOf(b: Build, cells: number[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const c of cells) {
    const x = c % b.W,
      y = Math.floor(c / b.W);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Furnishes a room by its purpose and its place's theme; the pieces remember their room, so it can be done anew. */
export function furnish(b: Build, room: Keyed, rng: Rng) {
  const put = (x: number, y: number, kind: LocalFeatureKind) => {
    if (x < 0 || y < 0 || x >= b.W || y >= b.H || taken(b, x, y)) return;
    b.features.push({ x, y, kind, room: room.id });
  };
  const at = (wx: number, wy: number, kind: LocalFeatureKind) => {
    const [x, y] = spot(b, room.cells, wx, wy);
    if (freeFloor(b, cellAt(b, x, y))) put(x, y, kind);
  };
  const box = boxOf(b, room.cells);
  const cx = box.x + Math.floor(box.w / 2),
    cy = box.y + Math.floor(box.h / 2);
  const some = (kind: LocalFeatureKind, count: number) => {
    for (let k = 0; k < count; k++) at(box.x + rng.int(0, box.w - 1), box.y + rng.int(0, box.h - 1), kind);
  };
  const along = (kind: LocalFeatureKind, row: number, step = 2) => {
    for (let x = box.x + 1; x < box.x + box.w - 1; x += step) if (room.cells.includes(cellAt(b, x, row)) && freeFloor(b, cellAt(b, x, row))) put(x, row, kind);
  };
  const scifi = ["now", "chrome", "stars", "after"].includes(b.tables.age);
  const wild = b.params.kind === "wilderness";
  switch (room.purpose) {
    case "lair":
      at(cx, cy, "bones");
      break;
    case "tomb":
      at(cx, cy, "coffin");
      if (box.w >= 6) {
        at(cx - 2, cy, "coffin");
        at(cx + 2, cy, "coffin");
      }
      at(cx, box.y, "altar");
      break;
    case "shrine":
      at(cx, box.y + 1, "altar");
      at(cx - 1, cy + 1, "statue");
      break;
    case "great-hall":
      if (box.w >= 7 && box.h >= 5)
        for (let x = box.x + 1; x < box.x + box.w - 1; x += 2) {
          put(x, box.y + 1, "pillar");
          put(x, box.y + box.h - 2, "pillar");
        }
      at(cx, box.y + Math.floor(box.h / 2), b.params.theme === "temple" ? "altar" : "fire");
      break;
    case "treasury":
      at(cx, cy, "chest");
      break;
    case "storage":
    case "cargo-hold":
    case "shop":
      some("crate", room.purpose === "cargo-hold" ? 7 : 4);
      break;
    case "server-room":
    case "laboratory":
      along("terminal", box.y);
      if (room.purpose === "laboratory") some("machine", 2);
      break;
    case "barracks":
    case "quarters":
    case "medbay":
    case "dwelling":
      if (wild) break;
      along("bunk", box.y);
      if (box.h >= 5) along("bunk", box.y + box.h - 1);
      if (room.purpose === "dwelling") at(cx, cy, b.params.theme === "hold" ? "fire" : "crate");
      break;
    case "armory":
      along(scifi ? "machine" : "crate", box.y);
      at(cx, cy, "chest");
      break;
    case "workshop":
      some(scifi ? "machine" : "crate", 3);
      break;
    case "engine-room":
      at(cx, cy, "reactor");
      some("machine", 3);
      break;
    case "ship-bridge":
      for (const c of room.cells) {
        const x = c % b.W,
          y = Math.floor(c / b.W);
        if (x === box.x + box.w - 1 || !room.cells.includes(c + 1)) put(x, y, "console");
      }
      at(cx - 1, cy, "console");
      break;
    case "airlock":
      some("crate", 1);
      break;
    case "ossuary":
      some("bones", 3);
      break;
    case "mine-face":
      at(cx, cy, "shaft");
      some("cart", 1);
      break;
    case "garden":
      for (const c of room.cells) if (b.tiles[c] === TILE.floor && rng.chance(0.5)) b.tiles[c] = TILE.field;
      break;
    case "camp":
      at(cx, cy, "fire");
      if (wild) {
        put(cx + 2, cy - 1, "tent");
        put(cx - 2, cy + 1, "tent");
      }
      break;
    case "nest":
      at(cx, cy, "bones");
      break;
    case "spring":
      at(cx, cy, "pool");
      break;
    case "ruin":
      for (let k = 0; k < 5; k++) put(cx + rng.int(-3, 3), cy + rng.int(-3, 3), "pillar");
      break;
    case "entrance":
      break;
    default:
      if (room.purpose.startsWith("own:")) at(cx, cy, "statue");
  }
  if (b.params.kind === "dungeon" && box.w >= 7 && box.h >= 6 && (room.purpose === "shrine" || room.purpose === "tomb" || room.purpose === "guard-room")) for (const [px, py] of [[box.x + 1, box.y + 1], [box.x + box.w - 2, box.y + 1], [box.x + 1, box.y + box.h - 2], [box.x + box.w - 2, box.y + box.h - 2]]) put(px, py, "pillar");
}

/** Floods a room's middle: shallow, with deep spots. */
export function flood(b: Build, room: Keyed, rng: Rng) {
  const box = boxOf(b, room.cells);
  for (const c of room.cells) {
    const x = c % b.W,
      y = Math.floor(c / b.W);
    if (x > box.x && x < box.x + box.w - 1 && y > box.y && y < box.y + box.h - 1 && b.tiles[c] === TILE.floor) b.tiles[c] = rng.chance(0.3) ? TILE.deep : TILE.water;
  }
}

/** Doors where passages meet a room: one in the middle of each run of passage along it. A metro platform is open
 * onto its track. Doors already there stay. */
export function placeDoors(b: Build, rooms: number[][]) {
  for (const cells of rooms) {
    const inside = new Set(cells);
    const touching = new Set<number>();
    for (const c of cells) {
      const x = c % b.W;
      for (const n of [x > 0 ? c - 1 : -1, x < b.W - 1 ? c + 1 : -1, c - b.W, c + b.W]) {
        if (n < 0 || n >= b.tiles.length || inside.has(n) || !passage(b.tiles[n])) continue;
        if (b.tiles[n] === TILE.rail && b.tiles[c] === TILE.platform) continue;
        touching.add(n);
      }
    }
    const seen = new Set<number>();
    for (const start of touching) {
      if (seen.has(start)) continue;
      const run = [start];
      seen.add(start);
      for (let k = 0; k < run.length; k++) {
        const c = run[k];
        for (const n of [c - 1, c + 1, c - b.W, c + b.W]) if (touching.has(n) && !seen.has(n) && Math.abs((n % b.W) - (c % b.W)) <= 1) (seen.add(n), run.push(n));
      }
      run.sort((p, q) => p - q);
      const door = run[Math.floor(run.length / 2)];
      const x = door % b.W,
        y = Math.floor(door / b.W);
      if (b.features.some((f) => f.x === x && f.y === y && (f.kind === "door" || f.kind === "secret-door" || f.kind === "locked-door"))) continue;
      // A door takes the place of whatever lay on its tile (a canal's grate).
      for (let k = b.features.length - 1; k >= 0; k--) if (b.features[k].x === x && b.features[k].y === y) b.features.splice(k, 1);
      b.features.push({ x, y, kind: "door" });
    }
  }
}

/** Bridges over every chasm that cuts ground off from the way in: the shortest span each time, until all is joined;
 * where no span will do, the chasm is filled in. */
export function bridgeChasms(b: Build, from: number) {
  const map = { tiles: b.tiles, params: b.params };
  for (let round = 0; round < 24; round++) {
    const dist = walk(map, doorsOf(b), from);
    const lost = (c: number) => !blocked(b.tiles[c]) && dist[c] === Infinity;
    let any = false;
    for (let c = 0; c < b.tiles.length && !any; c++) any = lost(c);
    if (!any) return;
    let best: number[] | null = null;
    for (let c = 0; c < b.tiles.length; c++) {
      if (b.tiles[c] !== TILE.chasm) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = c % b.W,
          y = Math.floor(c / b.W);
        const back = cellAt(b, x - dx, y - dy);
        if (x - dx < 0 || x - dx >= b.W || y - dy < 0 || y - dy >= b.H || blocked(b.tiles[back]) || dist[back] === Infinity) continue;
        const span: number[] = [];
        let k = 0;
        for (; k < 5; k++) {
          const nx = x + dx * k,
            ny = y + dy * k;
          if (nx < 0 || nx >= b.W || ny < 0 || ny >= b.H) break;
          const n = cellAt(b, nx, ny);
          if (b.tiles[n] !== TILE.chasm) break;
          span.push(n);
        }
        const nx = x + dx * k,
          ny = y + dy * k;
        if (!span.length || nx < 0 || nx >= b.W || ny < 0 || ny >= b.H) continue;
        if (!lost(cellAt(b, nx, ny))) continue;
        if (!best || span.length < best.length) best = span;
      }
    }
    if (!best) {
      for (let c = 0; c < b.tiles.length; c++) if (b.tiles[c] === TILE.chasm) b.tiles[c] = TILE.rubble;
      return;
    }
    for (const c of best) {
      b.tiles[c] = b.params.kind === "dungeon" ? TILE.floor : TILE.stone;
      b.features.push({ x: c % b.W, y: Math.floor(c / b.W), kind: "bridge" });
    }
  }
}

/** The tile one starts from: the stairs up, else the way in at the map's edge, else the first room. */
export function startOf(b: Pick<Build, "features" | "keyed" | "W">): number {
  const way = b.features.find((f) => f.kind === "stairs-up") ?? b.features.find((f) => (f.kind === "exit" || f.kind === "airlock") && f.to === "");
  if (way) return way.x + way.y * b.W;
  return b.keyed[0]?.cells[0] ?? 0;
}

/** Locks the doors of the rooms that guard a place's best (its ruler, a treasury), one lock each, and lays each key
 * in a room one can reach before its lock: a later key may lie behind an earlier lock, never behind its own. */
export function lockAndKey(b: Build, targets: Keyed[], rng: Rng) {
  const doors = doorsOf(b);
  const start = startOf(b);
  const roomDoors = (room: Keyed) => {
    const inside = new Set(room.cells);
    return [...doors.entries()].filter(([c]) => [c - 1, c + 1, c - b.W, c + b.W].some((n) => inside.has(n))).map(([, f]) => f);
  };
  let lock = 0;
  for (const target of targets) {
    const own = roomDoors(target).filter((f) => f.kind === "door");
    if (!own.length || roomDoors(target).some((f) => f.kind === "secret-door")) continue;
    const n = lock + 1;
    for (const f of own) {
      f.kind = "locked-door";
      f.lock = n;
    }
    // Where one can get with this lock and every later one shut.
    const shut = new Set(b.features.filter((f) => f.kind === "locked-door" && (f.lock ?? 0) >= n).map((f) => f.x + f.y * b.W));
    const dist = walk({ tiles: b.tiles, params: b.params }, doors, start, (c) => shut.has(c));
    const reached = b.keyed.filter((room) => room !== target && room.purpose !== "entrance" && !room.secret && room.key === undefined && reachOf(room, dist) < Infinity);
    if (!reached.length) {
      for (const f of own) {
        f.kind = "door";
        delete f.lock;
      }
      continue;
    }
    // The key lies deep in what can be reached: the far half of it.
    reached.sort((p, q) => reachOf(q, dist) - reachOf(p, dist));
    const holder = rng.pick(reached.slice(0, Math.max(1, Math.ceil(reached.length / 2))));
    holder.key = n;
    target.lock = n;
    const box = boxOf(b, holder.cells);
    const [x, y] = spot(b, holder.cells, box.x + box.w / 2 + 1, box.y + box.h / 2 + 1);
    b.features.push({ x, y, kind: "key", lock: n, room: holder.id });
    lock = n;
  }
}

/** Which rooms are secret: those found only through a secret door. */
export function markSecrets(b: Build) {
  const doors = doorsOf(b);
  const hidden = new Set(b.features.filter((f) => f.kind === "secret-door").map((f) => f.x + f.y * b.W));
  if (!hidden.size) return;
  const dist = walk({ tiles: b.tiles, params: b.params }, doors, startOf(b), (c) => hidden.has(c));
  for (const room of b.keyed) room.secret = reachOf(room, dist) === Infinity;
}

/** Traps on the map where the key says a room has one. */
export function setTraps(b: Build) {
  for (const room of b.keyed) {
    if (!room.trap || b.features.some((f) => f.kind === "trap" && f.room === room.id)) continue;
    const box = boxOf(b, room.cells);
    const [x, y] = spot(b, room.cells, box.x + box.w / 2 + 1, box.y + box.h / 2);
    if (!taken(b, x, y)) b.features.push({ x, y, kind: "trap", room: room.id });
  }
}

/** Niches cut into walls along some open ground: a crypt's dead lie in them. */
export function niches(b: Build, cells: Iterable<number>, chance: number, rng: Rng) {
  for (const c of cells) {
    const x = c % b.W;
    for (const n of [x > 0 ? c - 1 : -1, x < b.W - 1 ? c + 1 : -1, c - b.W, c + b.W]) {
      if (n < 0 || n >= b.tiles.length || b.tiles[n] !== TILE.rock || !rng.chance(chance)) continue;
      const nx = n % b.W,
        ny = Math.floor(n / b.W);
      if (!taken(b, nx, ny)) b.features.push({ x: nx, y: ny, kind: "niche" });
    }
  }
}

/** Veins of ore in the rock beside some open ground. */
export function veins(b: Build, cells: Iterable<number>, chance: number, rng: Rng) {
  for (const c of cells) {
    const x = c % b.W;
    for (const n of [x > 0 ? c - 1 : -1, x < b.W - 1 ? c + 1 : -1, c - b.W, c + b.W]) {
      if (n < 0 || n >= b.tiles.length || b.tiles[n] !== TILE.rock || !rng.chance(chance)) continue;
      const nx = n % b.W,
        ny = Math.floor(n / b.W);
      if (!taken(b, nx, ny)) b.features.push({ x: nx, y: ny, kind: "vein" });
    }
  }
}

/** A path of steps between two tiles over open ground, door-aware in built places. */
export function pathBetween(b: Build, from: number, to: number): number[] {
  const map = { tiles: b.tiles, params: b.params };
  const dist = walk(map, doorsOf(b), to);
  if (dist[from] === Infinity) return [];
  const path = [from];
  for (let c = from, guard = 0; c !== to && guard < b.tiles.length; guard++) {
    const x = c % b.W;
    let next = -1;
    for (const n of [x > 0 ? c - 1 : -1, x < b.W - 1 ? c + 1 : -1, c - b.W, c + b.W]) if (n >= 0 && n < b.tiles.length && dist[n] === dist[c] - 1) next = n;
    if (next < 0) break;
    path.push(next);
    c = next;
  }
  return path;
}
