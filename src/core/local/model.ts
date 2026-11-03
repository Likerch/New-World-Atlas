// The shapes of a local map: its kinds and themes, tiles, keyed rooms and sites with who and what is in them, the
// things standing on the grid, and how one walks across it (through doors only, never across a chasm or lava).
import type { Npc } from "../people";

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
  | "hold"
  | "forest"
  | "taiga"
  | "swamp"
  | "desert"
  | "mountain"
  | "coast"
  | "wasteland"
  | "jungle"
  | "steppe"
  | "tundra"
  | "seabed";
export const LOCAL_THEMES: Record<LocalKind, LocalTheme[]> = {
  dungeon: ["crypt", "temple", "mine", "sewer", "bunker", "derelict", "factory", "metro", "lab", "mall", "vault", "starship"],
  cave: ["lair", "mine", "hold"],
  wilderness: ["forest", "taiga", "swamp", "desert", "mountain", "coast", "wasteland", "jungle", "steppe", "tundra", "seabed"],
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
  /** A drop no one walks across but on a bridge. */
  chasm: 15,
  /** Rails: a mine's cart track or a metro's line, walked like a corridor. */
  rail: 16,
  lava: 17,
  kelp: 18,
  coral: 19,
  ice: 20,
  /** A metro platform: room floor with an open edge onto the track. */
  platform: 21,
  /** A ship's hull and machinery: solid, but drawn as plating, not rock. */
  hull: 22,
  /** Tilled fields and gardens. */
  field: 23,
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
  | "spring"
  | "ossuary"
  | "great-hall"
  | "quarters"
  | "mine-face"
  | "cistern"
  | "platform"
  | "armory"
  | "medbay"
  | "dwelling"
  | "ship-bridge"
  | "engine-room"
  | "airlock"
  | "cargo-hold"
  | "shop"
  | "garden"
  | "landmark";

/** A band of creatures or people in a room: what they are, how many, and (for people) who leads them. */
export interface LocalGroup {
  who: string;
  count: number;
  /** The place's ruler or the strongest thing on this level. */
  boss?: boolean;
  /** Its own name, when the legend gives one (the ruler of a tomb). */
  name?: string;
  /** People are led by someone with a name. */
  leader?: Npc;
}

/** What lies to be found: a kind of loot and, for coin and the like, how much. */
export interface LocalLoot {
  what: string;
  amount?: number;
}

export interface Keyed {
  id: number;
  /** Tile cells it covers, as x + y * width. */
  cells: number[];
  /** Label position, in tiles. */
  x: number;
  y: number;
  /** A built-in purpose, or "own:<id>" for one of the game master's own kinds of room. */
  purpose: Purpose | `own:${string}`;
  monsters: LocalGroup[];
  treasure: LocalLoot | null;
  trap: string | null;
  /** Reached only through a secret door. */
  secret: boolean;
  name: string;
  /** Words for how it looks, sounds and smells: dictionary keys. */
  look: string[];
  /** Its doors are locked: the number of the lock (and of the key that opens it). */
  lock?: number;
  /** The key to a lock lies here. */
  key?: number;
  /** A landmark's kind, for a wild place's centrepiece ("great-tree", "stone-ring", "wreck"…). */
  object?: string;
  /** The game master wrote this room's description. */
  text?: string;
  /** People worth a name who are not a band: a captive, a scholar, a hermit. */
  people?: Npc[];
  /** The room at the end of the place: its ruler's, its tomb, its hoard. */
  final?: boolean;
}

export type LocalFeatureKind =
  | "door"
  | "secret-door"
  | "locked-door"
  | "stairs-up"
  | "stairs-down"
  | "pillar"
  | "statue"
  | "chest"
  | "altar"
  | "pool"
  | "tree"
  | "rock"
  | "tent"
  | "fire"
  | "bridge"
  | "trap"
  | "terminal"
  | "crate"
  | "bones"
  | "stalagmite"
  | "niche"
  | "coffin"
  | "console"
  | "reactor"
  | "airlock"
  | "bunk"
  | "cart"
  | "shaft"
  | "vein"
  | "grate"
  | "machine"
  | "mushroom"
  | "crystal"
  | "exit"
  | "key"
  | "portal"
  | "grave"
  | "fence"
  | "great-tree"
  | "derrick";

export interface LocalFeature {
  x: number;
  y: number;
  kind: LocalFeatureKind;
  /** A locked door's lock, or the key lying here. */
  lock?: number;
  /** Where an exit at the map's edge leads ("" for the way out). */
  to?: string;
  /** The room whose furnishing it is, so the room can be furnished anew. */
  room?: number;
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
  /** How many levels the place goes down; whoever rules it waits on the last. */
  levels?: number;
  /** The place's own name, when the map it was opened from gives it one. */
  name?: string;
  /** The age of the world it lies in: what lurks there follows it (no goblins in a precursor ruin). */
  age?: string;
  /** How much magic the world has (0–3), when it is not its age's usual. */
  magic?: number;
  /** What the place is on the map it was opened from, and the facts of its legend (a tomb's ruler, a mine's ore). */
  origin?: { kind: string; facts: Record<string, string | number> };
  /** A river crossing the wilds, by name ("" for a nameless one). */
  river?: string;
  /** Which sheet of the wilds this is, east and south of the first: neighbours meet at their edges. */
  sheet?: [number, number];
  /** Passages leading off the map: a cavern's tunnels to the caverns around it. */
  exits?: LocalExit[];
  /** The game master's own theme this place follows, by id. */
  own?: string;
}

/** A passage off the map's edge: the compass way it leaves by (0 north, 2 east, 4 south, 6 west; odd between), what
 * kind of way it is and where it leads. */
export interface LocalExit {
  dir: number;
  kind: string;
  to: string;
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
  /** A river's course across the wilds, in tile centres. */
  river: [number, number][];
  /** What one meets wandering about: a d6 table. */
  wandering: LocalGroup[];
}

/** Tiles no one walks onto. */
export function blocked(tile: number): boolean {
  return tile === TILE.rock || tile === TILE.chasm || tile === TILE.lava || tile === TILE.hull;
}

/** Ground walked like a corridor (rooms are floors). */
export function passage(tile: number): boolean {
  return tile === TILE.corridor || tile === TILE.rubble || tile === TILE.rail;
}

const isDoor = (kind: LocalFeatureKind) => kind === "door" || kind === "locked-door" || kind === "secret-door";

/** The door tiles of a map, by cell, with their kind and lock. */
export function doorsOf(map: Pick<LocalMap, "features" | "params">): Map<number, LocalFeature> {
  const W = map.params.width;
  return new Map(map.features.filter((f) => isDoor(f.kind)).map((f) => [f.x + f.y * W, f]));
}

/** Whether one can step between two neighbouring tiles of a built place: a room and a passage beside it are walled off
 * but for a door; a metro platform is open onto its track. Caves and the wilds are open ground. */
export function canStep(map: Pick<LocalMap, "tiles" | "params">, doors: Map<number, unknown>, a: number, b: number): boolean {
  const ta = map.tiles[a],
    tb = map.tiles[b];
  if (blocked(ta) || blocked(tb)) return false;
  if (map.params.kind !== "dungeon") return true;
  // A platform is open onto its track; water (a canal, a flooded floor) is open to whatever it touches.
  if ((ta === TILE.platform && tb === TILE.rail) || (ta === TILE.rail && tb === TILE.platform)) return true;
  if (ta === TILE.water || ta === TILE.deep || tb === TILE.water || tb === TILE.deep) return true;
  return passage(ta) === passage(tb) || doors.has(a) || doors.has(b);
}

/** Steps from one tile to every other (Infinity where none lead); `closed` doors are walls. */
export function walk(map: Pick<LocalMap, "tiles" | "params">, doors: Map<number, unknown>, start: number, closed: (cell: number) => boolean = () => false): Float64Array {
  const W = map.params.width;
  const n = map.tiles.length;
  const dist = new Float64Array(n).fill(Infinity);
  if (start < 0 || start >= n || closed(start)) return dist;
  dist[start] = 0;
  const queue = [start];
  for (let k = 0; k < queue.length; k++) {
    const c = queue[k];
    const x = c % W;
    for (const m of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W]) {
      if (m < 0 || m >= n || dist[m] !== Infinity || closed(m) || !canStep(map, doors, c, m)) continue;
      dist[m] = dist[c] + 1;
      queue.push(m);
    }
  }
  return dist;
}

/** A room's nearest step from a walk, or Infinity. */
export function reachOf(room: Keyed, dist: Float64Array): number {
  let best = Infinity;
  for (const c of room.cells) if (dist[c] < best) best = dist[c];
  return best;
}

/** The base seed of a many-levelled place: every level hangs from it. */
export const placeSeed = (seed: string) => seed.replace(/\/depth-\d+$/u, "");
