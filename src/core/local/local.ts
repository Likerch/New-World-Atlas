// Local maps on a battle grid: dungeons of rooms and corridors (crypts, temples, mines, sewers, bunkers, derelict
// ships, and for later ages factories, metro stations, labs, malls, vaults and starships), caves grown by cellular
// automata, and wilderness — forest, taiga, swamp, desert, mountain pass, coast, the wasteland after the fall —
// with streams, trails and camps. Every room or site is keyed for a game master: what it is, who is there, what
// lies hidden, what will hurt.
import Delaunator from "delaunator";
import { createLanguage, name, type Language } from "../language";
import { fbm, noise2 } from "../noise";
import { PriorityQueue } from "../queue";
import { createRng, randomSeed, type Rng } from "../random";

export type LocalKind = "dungeon" | "cave" | "wilderness";
export const LOCAL_KINDS: LocalKind[] = ["dungeon", "cave", "wilderness"];

export type LocalTheme =
  | "crypt"
  | "temple"
  | "mine"
  | "sewer"
  | "bunker"
  | "derelict"
  | "factory"
  | "metro"
  | "lab"
  | "mall"
  | "vault"
  | "starship"
  | "lair"
  | "forest"
  | "taiga"
  | "swamp"
  | "desert"
  | "mountain"
  | "coast"
  | "wasteland";
export const LOCAL_THEMES: Record<LocalKind, LocalTheme[]> = {
  dungeon: ["crypt", "temple", "mine", "sewer", "bunker", "derelict", "factory", "metro", "lab", "mall", "vault", "starship"],
  cave: ["lair", "mine"],
  wilderness: ["forest", "taiga", "swamp", "desert", "mountain", "coast", "wasteland"],
};

/** Tile kinds, by id. */
export const TILE = {
  rock: 0,
  floor: 1,
  corridor: 2,
  water: 3,
  deep: 4,
  grass: 5,
  forest: 6,
  thicket: 7,
  stone: 8,
  sand: 9,
  marsh: 10,
  trail: 11,
  snow: 12,
  cliff: 13,
  rubble: 14,
} as const;

export type Purpose =
  | "entrance"
  | "guard-room"
  | "barracks"
  | "shrine"
  | "treasury"
  | "prison"
  | "library"
  | "laboratory"
  | "lair"
  | "storage"
  | "trap-room"
  | "flooded"
  | "tomb"
  | "workshop"
  | "server-room"
  | "camp"
  | "clearing"
  | "ruin"
  | "nest"
  | "spring";

export interface Keyed {
  id: number;
  /** Tile cells it covers, as x + y * width. */
  cells: number[];
  /** Label position, in tiles. */
  x: number;
  y: number;
  purpose: Purpose;
  monsters: string[];
  treasure: string | null;
  trap: string | null;
  secret: boolean;
  name: string;
}

export type LocalFeatureKind = "door" | "secret-door" | "locked-door" | "stairs-up" | "stairs-down" | "pillar" | "statue" | "chest" | "altar" | "pool" | "tree" | "rock" | "tent" | "fire" | "bridge" | "trap" | "terminal" | "crate" | "bones" | "stalagmite";

export interface LocalFeature {
  x: number;
  y: number;
  kind: LocalFeatureKind;
}

export interface LocalParams {
  seed: string;
  kind: LocalKind;
  theme: LocalTheme;
  /** Tiles across and down. */
  width: number;
  height: number;
  /** Rooms (dungeon) or how crowded the place is, 1–3. */
  rooms: number;
  danger: number;
  /** Who waits in the deepest room, when the place already has a legend (the troll of a cave on the planet map). */
  boss?: string;
  /** Which level down this is; 1 is the way in from the surface. */
  depth?: number;
}

export interface LocalMap {
  params: LocalParams;
  name: string;
  /** Metres per tile. */
  cell: number;
  tiles: Uint8Array;
  keyed: Keyed[];
  features: LocalFeature[];
  /** Stream and trail courses, in tile centres. */
  stream: [number, number][];
  trail: [number, number][];
}

const MONSTERS: Record<string, string[]> = {
  fantasy: ["goblins", "skeletons", "zombies", "giant-rats", "giant-spiders", "orcs", "cultists", "ghouls", "kobolds", "slime"],
  boss: ["ogre", "troll", "wraith", "minotaur", "lich", "young-dragon", "vampire"],
  scifi: ["drones", "security-bots", "mutants", "cyberpsychos", "gangers", "corp-soldiers", "scavengers"],
  scifiBoss: ["xenomorph", "rogue-ai", "war-mech"],
  wild: ["wolves", "bear", "bandits", "boars", "giant-eagle", "trolls", "harpies"],
  waste: ["raiders", "mutants", "feral-dogs", "scavengers", "giant-rats"],
};
const TREASURE: Record<string, string[]> = { fantasy: ["coins", "gems", "magic-item", "scroll", "potions", "fine-weapon", "relic"], scifi: ["credits", "chip", "cyberware", "prototype-weapon", "data-shard", "medkits"] };
const TRAPS: Record<string, string[]> = { fantasy: ["pit", "darts", "gas", "falling-block", "glyph", "net"], scifi: ["laser-grid", "mines", "turret", "nerve-gas"] };

export function localParams(input: Partial<LocalParams> = {}): LocalParams {
  const seed = input.seed || randomSeed();
  const rng = createRng(seed).fork("local-params");
  const kind = input.kind ?? rng.pick(LOCAL_KINDS);
  return {
    seed,
    kind,
    theme: input.theme && LOCAL_THEMES[kind].includes(input.theme) ? input.theme : rng.pick(LOCAL_THEMES[kind]),
    width: kind === "wilderness" ? 96 : 64,
    height: kind === "wilderness" ? 64 : 44,
    rooms: kind === "dungeon" ? rng.int(9, 16) : 2,
    danger: 2,
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "")),
  };
}

const scifiTheme = (theme: LocalTheme) => ["bunker", "derelict", "factory", "metro", "lab", "mall", "vault", "starship"].includes(theme);

function stock(rng: Rng, purpose: Purpose, theme: LocalTheme, danger: number, boss?: string): Pick<Keyed, "monsters" | "treasure" | "trap"> {
  const sf = scifiTheme(theme);
  const pool = theme === "wasteland" ? MONSTERS.waste : theme === "forest" || theme === "taiga" || theme === "swamp" || theme === "desert" || theme === "mountain" || theme === "coast" ? MONSTERS.wild : sf ? MONSTERS.scifi : MONSTERS.fantasy;
  const final = purpose === "lair" || purpose === "tomb";
  const monsters: string[] = [];
  const crowd = purpose === "barracks" || purpose === "guard-room" || purpose === "camp" || purpose === "nest" ? 1 : 0;
  if (final) monsters.push(boss ?? rng.pick(sf ? MONSTERS.scifiBoss : pool === MONSTERS.waste ? ["war-mech", "mutants", "raiders"] : pool === MONSTERS.wild ? ["bear", "trolls", "giant-eagle"] : MONSTERS.boss));
  else if (rng.chance(0.25 + danger * 0.12 + crowd * 0.4)) monsters.push(rng.pick(pool));
  const rich = purpose === "treasury" || final;
  const treasure = rich || rng.chance(0.2) ? rng.pick(sf ? TREASURE.scifi : TREASURE.fantasy) : null;
  const trap = purpose === "trap-room" || (purpose === "treasury" && rng.chance(0.6)) || rng.chance(0.06 * danger) ? rng.pick(sf ? TRAPS.scifi : TRAPS.fantasy) : null;
  return { monsters, treasure, trap };
}

function dungeon(params: LocalParams, rng: Rng, tiles: Uint8Array, keyed: Keyed[], features: LocalFeature[]) {
  const { width: W, height: H } = params;
  const at = (x: number, y: number) => x + y * W;
  type Box = { x: number; y: number; w: number; h: number };
  const boxes: Box[] = [];
  for (let attempt = 0; attempt < 400 && boxes.length < params.rooms; attempt++) {
    const w = rng.int(4, 10),
      h = rng.int(4, 8);
    const box = { x: rng.int(2, W - w - 2), y: rng.int(2, H - h - 2), w, h };
    if (boxes.some((o) => box.x < o.x + o.w + 2 && o.x < box.x + box.w + 2 && box.y < o.y + o.h + 2 && o.y < box.y + box.h + 2)) continue;
    boxes.push(box);
  }
  for (const b of boxes) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) tiles[at(x, y)] = TILE.floor;
  // Corridors: a spanning tree over the rooms plus a few loops, carved as L-shapes.
  const centers = boxes.map((b) => [b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2)] as [number, number]);
  const edges: [number, number, number][] = [];
  if (centers.length >= 3) {
    const d = Delaunator.from(centers);
    for (let e = 0; e < d.triangles.length; e++) {
      const a = d.triangles[e],
        b = d.triangles[e % 3 === 2 ? e - 2 : e + 1];
      if (a < b) edges.push([a, b, Math.hypot(centers[a][0] - centers[b][0], centers[a][1] - centers[b][1])]);
    }
  } else if (centers.length === 2) edges.push([0, 1, 1]);
  edges.sort((p, q) => p[2] - q[2]);
  const parent = centers.map((_, k) => k);
  const root = (k: number): number => (parent[k] === k ? k : (parent[k] = root(parent[k])));
  const carve = (x: number, y: number) => {
    if (tiles[at(x, y)] === TILE.rock) tiles[at(x, y)] = TILE.corridor;
  };
  for (const [a, b] of edges) {
    const joined = root(a) === root(b);
    if (joined && !rng.chance(0.15)) continue;
    if (!joined) parent[root(a)] = root(b);
    const [ax, ay] = centers[a],
      [bx, by] = centers[b];
    if (rng.chance(0.5)) {
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, ay);
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) carve(bx, y);
    } else {
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) carve(ax, y);
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, by);
    }
  }
  // Doors where a corridor meets a room's edge.
  for (const b of boxes) {
    for (let x = b.x; x < b.x + b.w; x++)
      for (const y of [b.y - 1, b.y + b.h]) {
        if (tiles[at(x, y)] !== TILE.corridor) continue;
        const roll = rng.next();
        features.push({ x, y, kind: roll < 0.08 ? "secret-door" : roll < 0.2 ? "locked-door" : "door" });
      }
    for (let y = b.y; y < b.y + b.h; y++)
      for (const x of [b.x - 1, b.x + b.w]) {
        if (tiles[at(x, y)] !== TILE.corridor) continue;
        const roll = rng.next();
        features.push({ x, y, kind: roll < 0.08 ? "secret-door" : roll < 0.2 ? "locked-door" : "door" });
      }
  }
  // Purposes: the entrance nearest the map's edge, the lair farthest from it, the rest by theme.
  const order = boxes.map((_, k) => k).sort((a, b) => Math.min(centers[a][0], W - centers[a][0], centers[a][1], H - centers[a][1]) - Math.min(centers[b][0], W - centers[b][0], centers[b][1], H - centers[b][1]));
  const pool: Purpose[] =
    params.theme === "crypt"
      ? ["shrine", "trap-room", "storage", "prison", "library"]
      : params.theme === "temple"
        ? ["shrine", "library", "treasury", "barracks", "trap-room"]
        : params.theme === "mine"
          ? ["workshop", "storage", "barracks", "flooded", "trap-room"]
          : params.theme === "sewer"
            ? ["flooded", "storage", "barracks", "trap-room", "prison"]
            : params.theme === "factory"
              ? ["workshop", "storage", "workshop", "flooded", "trap-room", "barracks"]
              : params.theme === "metro"
                ? ["camp", "storage", "flooded", "nest", "workshop", "trap-room"]
                : params.theme === "mall"
                  ? ["storage", "camp", "nest", "workshop", "barracks", "trap-room"]
                  : params.theme === "vault"
                    ? ["barracks", "storage", "workshop", "server-room", "laboratory", "prison"]
                    : ["server-room", "laboratory", "barracks", "storage", "trap-room", "prison"];
  order.forEach((index, rank) => {
    const b = boxes[index];
    const purpose: Purpose = rank === 0 ? "entrance" : rank === order.length - 1 ? (params.theme === "crypt" ? "tomb" : "lair") : rank === 1 ? "guard-room" : rng.pick(pool);
    const cells: number[] = [];
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) cells.push(at(x, y));
    keyed.push({ id: keyed.length + 1, cells, x: b.x + b.w / 2, y: b.y + b.h / 2, purpose, ...stock(rng, purpose, params.theme, params.danger, params.boss), secret: features.some((f) => f.kind === "secret-door" && Math.abs(f.x - (b.x + b.w / 2)) <= b.w / 2 + 1 && Math.abs(f.y - (b.y + b.h / 2)) <= b.h / 2 + 1), name: "" });
    // Furnishings by purpose.
    const cx = b.x + Math.floor(b.w / 2),
      cy = b.y + Math.floor(b.h / 2);
    if (purpose === "entrance") features.push({ x: b.x + 1, y: b.y + 1, kind: "stairs-up" });
    if (purpose === "lair" || purpose === "tomb") features.push({ x: cx, y: cy, kind: purpose === "tomb" ? "altar" : "bones" });
    if (purpose === "shrine") features.push({ x: cx, y: b.y + 1, kind: "altar" }, { x: cx - 1, y: cy + 1, kind: "statue" });
    if (purpose === "treasury") features.push({ x: cx, y: cy, kind: "chest" });
    if (purpose === "flooded") for (let y = b.y + 1; y < b.y + b.h - 1; y++) for (let x = b.x + 1; x < b.x + b.w - 1; x++) tiles[at(x, y)] = rng.chance(0.3) ? TILE.deep : TILE.water;
    if (purpose === "storage") for (let k = 0; k < 4; k++) features.push({ x: b.x + rng.int(0, b.w - 1), y: b.y + rng.int(0, b.h - 1), kind: "crate" });
    if (purpose === "server-room" || purpose === "laboratory") for (let x = b.x + 1; x < b.x + b.w - 1; x += 2) features.push({ x, y: b.y, kind: "terminal" });
    if (b.w >= 7 && b.h >= 6 && (purpose === "shrine" || purpose === "tomb" || purpose === "guard-room")) for (const [px, py] of [[b.x + 1, b.y + 1], [b.x + b.w - 2, b.y + 1], [b.x + 1, b.y + b.h - 2], [b.x + b.w - 2, b.y + b.h - 2]]) features.push({ x: px, y: py, kind: "pillar" });
    const last = keyed[keyed.length - 1];
    if (last.trap) features.push({ x: cx + 1, y: cy, kind: "trap" });
  });
  const deepest = boxes[order[order.length - 2] ?? order[0]];
  if (deepest) features.push({ x: deepest.x + deepest.w - 2, y: deepest.y + deepest.h - 2, kind: "stairs-down" });
  // Rubble and scattered rubbish in derelicts and mines.
  if (params.theme === "derelict" || params.theme === "mine" || params.theme === "metro" || params.theme === "factory" || params.theme === "mall") for (let k = 0; k < W * H * 0.01; k++) {
    const i = rng.int(0, W * H - 1);
    if (tiles[i] === TILE.corridor) tiles[i] = TILE.rubble;
  }
}

function cave(params: LocalParams, rng: Rng, tiles: Uint8Array, keyed: Keyed[], features: LocalFeature[]) {
  const { width: W, height: H } = params;
  const at = (x: number, y: number) => x + y * W;
  let open = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) open[at(x, y)] = rng.chance(0.55) ? 1 : 0;
  for (let round = 0; round < 5; round++) {
    const next = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!open[at(x + dx, y + dy)]) walls++;
        next[at(x, y)] = walls >= 5 ? 0 : 1;
      }
    open = next;
  }
  // Keep the largest cavern.
  const region = new Int32Array(W * H).fill(-1);
  let best: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!open[i] || region[i] >= 0) continue;
    const cells = [i];
    region[i] = i;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      for (const n of [c - 1, c + 1, c - W, c + W]) if (n >= 0 && n < W * H && open[n] && region[n] < 0) (region[n] = i, cells.push(n));
    }
    if (cells.length > best.length) best = cells;
  }
  for (const i of best) tiles[i] = TILE.floor;
  // Pools in the low spots, stalagmites about.
  const damp = noise2(rng.fork("pools"));
  for (const i of best) {
    const x = i % W,
      y = Math.floor(i / W);
    const v = fbm(damp, x / 14, y / 14, 3);
    if (v > 0.35) tiles[i] = v > 0.5 ? TILE.deep : TILE.water;
    else if (rng.chance(0.015)) features.push({ x, y, kind: "stalagmite" });
  }
  // Chambers: the widest open spots, keyed.
  const width = new Float32Array(W * H);
  for (const i of best) {
    let r = 0;
    while (r < 8 && [i - r, i + r, i - r * W, i + r * W].every((n) => n >= 0 && n < W * H && tiles[n] !== TILE.rock)) r++;
    width[i] = r;
  }
  const spots = [...best].sort((a, b) => width[b] - width[a]);
  const chosen: number[] = [];
  for (const i of spots) {
    if (chosen.length >= 6 + params.rooms) break;
    if (chosen.some((c) => Math.hypot((c % W) - (i % W), Math.floor(c / W) - Math.floor(i / W)) < 10)) continue;
    chosen.push(i);
  }
  const edgeDistance = (i: number) => Math.min(i % W, W - (i % W), Math.floor(i / W), H - Math.floor(i / W));
  chosen.sort((a, b) => edgeDistance(a) - edgeDistance(b));
  chosen.forEach((i, rank) => {
    const x = i % W,
      y = Math.floor(i / W);
    const purpose: Purpose = rank === 0 ? "entrance" : rank === chosen.length - 1 ? "lair" : rng.pick<Purpose>(params.theme === "mine" ? ["storage", "workshop", "flooded", "trap-room"] : ["nest", "spring", "storage", "trap-room", "shrine"]);
    const cells = best.filter((c) => Math.hypot((c % W) - x, Math.floor(c / W) - y) < width[i] + 1);
    keyed.push({ id: keyed.length + 1, cells, x, y, purpose, ...stock(rng, purpose, params.theme, params.danger, params.boss), secret: false, name: "" });
    if (purpose === "lair" || purpose === "nest") features.push({ x, y, kind: "bones" });
    if (purpose === "spring") features.push({ x, y, kind: "pool" });
    if (purpose === "entrance") features.push({ x, y, kind: "stairs-up" });
    // A shaft further down, in the chamber before the lair.
    if (rank === chosen.length - 2) features.push({ x: x + 1, y, kind: "stairs-down" });
  });
}

function wilderness(params: LocalParams, rng: Rng, tiles: Uint8Array, keyed: Keyed[], features: LocalFeature[], language: Language) {
  const { width: W, height: H } = params;
  const at = (x: number, y: number) => x + y * W;
  const relief = noise2(rng.fork("relief"));
  const growth = noise2(rng.fork("growth"));
  const height = new Float32Array(W * H);
  const theme = params.theme;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let h = fbm(relief, x / 40, y / 40, 4);
      if (theme === "mountain") h += Math.abs(x - W / 2) / W;
      if (theme === "coast") h += (x / W - 0.35) * 1.6;
      height[at(x, y)] = h;
      const g = fbm(growth, x / 18, y / 18, 4);
      let tile: number = TILE.grass;
      if (theme === "desert") tile = g > 0.45 ? TILE.stone : g > 0.25 ? TILE.grass : TILE.sand;
      else if (theme === "swamp") tile = g > 0.25 ? TILE.water : g > 0 ? TILE.marsh : g > -0.3 ? TILE.forest : TILE.grass;
      else if (theme === "mountain") tile = h > 0.55 ? TILE.snow : h > 0.3 ? TILE.cliff : h > 0.15 ? TILE.stone : g > 0.2 ? TILE.forest : TILE.grass;
      else if (theme === "taiga") tile = g > 0.35 ? TILE.thicket : g > -0.05 ? TILE.forest : g > -0.35 ? TILE.grass : TILE.snow;
      else if (theme === "wasteland") tile = g > 0.4 ? TILE.rubble : g > 0.1 ? TILE.stone : g > -0.35 ? TILE.sand : TILE.grass;
      else tile = g > 0.38 ? TILE.thicket : g > 0.02 ? TILE.forest : g > -0.45 ? TILE.grass : TILE.stone;
      if (theme === "coast" && h < -0.15) tile = h < -0.3 ? TILE.deep : h < -0.22 ? TILE.water : TILE.sand;
      tiles[at(x, y)] = tile;
    }
  const passable = (i: number) => tiles[i] !== TILE.deep;
  // A stream runs downhill across the map.
  const stream: [number, number][] = [];
  if (theme !== "desert") {
    let x = rng.int(W * 0.2, W * 0.8),
      y = 0;
    for (let steps = 0; steps < W * H && y < H - 1; steps++) {
      stream.push([x, y]);
      if (tiles[at(x, y)] !== TILE.deep) tiles[at(x, y)] = TILE.water;
      const options = [
        [x, y + 1],
        [x - 1, y + 1],
        [x + 1, y + 1],
        [x - 1, y],
        [x + 1, y],
      ].filter(([nx, ny]) => nx > 0 && nx < W - 1 && ny < H && !stream.some(([sx, sy]) => sx === nx && sy === ny));
      if (!options.length) break;
      [x, y] = options.reduce((bestOpt, o) => (height[at(o[0], o[1])] + (o[1] > y ? -0.05 : 0) < height[at(bestOpt[0], bestOpt[1])] + (bestOpt[1] > y ? -0.05 : 0) ? o : bestOpt)) as [number, number];
    }
  }
  // A trail from the west edge to the east, avoiding thickets and water; bridges where it fords the stream.
  const cost = (i: number) => (!passable(i) ? Infinity : tiles[i] === TILE.cliff ? 25 : tiles[i] === TILE.thicket ? 8 : tiles[i] === TILE.forest || tiles[i] === TILE.snow ? 3 : tiles[i] === TILE.water || tiles[i] === TILE.marsh ? 6 : tiles[i] === TILE.stone ? 2 : 1);
  // The trail sets out from the first dry ground on the western side.
  const row = rng.int(H * 0.2, H * 0.8);
  let first = 0;
  while (first < W - 1 && !passable(at(first, row))) first++;
  const start = at(first, row);
  const best = new Float64Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const queue = new PriorityQueue<number>();
  best[start] = 0;
  queue.push(start, 0);
  let goal = -1;
  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    const [i, c] = entry;
    if (c > best[i]) continue;
    if (i % W === W - 1) {
      goal = i;
      break;
    }
    const x = i % W;
    for (const n of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (n < 0 || n >= W * H) continue;
      const step = cost(n);
      if (!Number.isFinite(step) || c + step >= best[n]) continue;
      best[n] = c + step;
      came[n] = i;
      queue.push(n, c + step);
    }
  }
  const trail: [number, number][] = [];
  for (let i = goal; i >= 0; i = came[i]) {
    trail.push([i % W, Math.floor(i / W)]);
    if (tiles[i] === TILE.water) features.push({ x: i % W, y: Math.floor(i / W), kind: "bridge" });
    else tiles[i] = TILE.trail;
  }
  // Trees and rocks as features; sites keyed along or off the trail.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = tiles[at(x, y)];
      if ((t === TILE.forest && rng.chance(0.35)) || (t === TILE.thicket && rng.chance(0.7)) || (t === TILE.marsh && rng.chance(0.08))) features.push({ x, y, kind: "tree" });
      else if ((t === TILE.stone && rng.chance(0.12)) || (t === TILE.cliff && rng.chance(0.2))) features.push({ x, y, kind: "rock" });
    }
  const sites: Purpose[] = ["camp", "clearing", "ruin", "lair", "spring", "shrine"];
  const placed: [number, number][] = [];
  for (const purpose of rng.shuffle([...sites]).slice(0, 3 + params.rooms)) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = rng.int(4, W - 5),
        y = rng.int(4, H - 5);
      if (!passable(at(x, y)) || tiles[at(x, y)] === TILE.cliff || tiles[at(x, y)] === TILE.water || placed.some(([px, py]) => Math.hypot(px - x, py - y) < 14)) continue;
      placed.push([x, y]);
      const cells: number[] = [];
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) cells.push(at(x + dx, y + dy));
      for (const c of cells) if (tiles[c] === TILE.forest || tiles[c] === TILE.thicket) tiles[c] = TILE.grass;
      keyed.push({ id: keyed.length + 1, cells, x, y, purpose, ...stock(rng, purpose, theme, params.danger, params.boss), secret: false, name: purpose === "ruin" || purpose === "shrine" ? name(language, rng, "plain") : "" });
      if (purpose === "camp") features.push({ x, y, kind: "fire" }, { x: x + 2, y: y - 1, kind: "tent" }, { x: x - 2, y: y + 1, kind: "tent" });
      if (purpose === "ruin") for (let k = 0; k < 5; k++) features.push({ x: x + rng.int(-3, 3), y: y + rng.int(-3, 3), kind: "pillar" });
      if (purpose === "shrine") features.push({ x, y, kind: "statue" });
      if (purpose === "spring") features.push({ x, y, kind: "pool" });
      if (purpose === "lair") features.push({ x, y, kind: "bones" });
      break;
    }
  }
  // Features standing on cleared ground lose their trees.
  for (let k = features.length - 1; k >= 0; k--) if (features[k].kind === "tree" && tiles[at(features[k].x, features[k].y)] !== TILE.forest && tiles[at(features[k].x, features[k].y)] !== TILE.thicket && tiles[at(features[k].x, features[k].y)] !== TILE.marsh) features.splice(k, 1);
  return { stream, trail: trail.reverse() };
}

export function generateLocal(input: Partial<LocalParams> = {}, language?: Language): LocalMap {
  const params = localParams(input);
  const rng = createRng(params.seed).fork("local");
  const tongue = language ? { ...language } : createLanguage(rng.fork("language"));
  const tiles = new Uint8Array(params.width * params.height);
  const keyed: Keyed[] = [];
  const features: LocalFeature[] = [];
  let stream: [number, number][] = [];
  let trail: [number, number][] = [];
  if (params.kind === "dungeon") dungeon(params, rng.fork("dungeon"), tiles, keyed, features);
  else if (params.kind === "cave") cave(params, rng.fork("cave"), tiles, keyed, features);
  else ({ stream, trail } = wilderness(params, rng.fork("wild"), tiles, keyed, features, tongue));
  return { params, name: name(tongue, rng.fork("name"), "plain"), cell: params.kind === "wilderness" ? 5 : 1.5, tiles, keyed, features, stream, trail };
}
