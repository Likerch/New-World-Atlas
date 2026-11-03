// A world: one game master's project. It starts from one top map — a universe, a galaxy, a star system, a planet, a
// city, a building or a local map — and holds every map reached from it by following links down (a galaxy's star, a
// system's planet, a planet's town, a town's house…), with the parameters each was made from, the game master's
// changes to them, and the GM's names, notes, pins and fog.
//
// Parameters flow down the tree in three ways:
// - world-wide values (the age and setting, the names' script) belong to the world and reach every map;
// - each child's parameters are derived from its parent at the link (a town's size, coast and river become its
//   city's; a city's age becomes its buildings');
// - the game master may override any of them on a map, and the override reaches that map's descendants (a city
//   shown in another age opens its houses in that age).
// When a parent changes, its children are derived afresh on the next visit and their overrides laid back on top.
import type { MapPatch } from "./campaign";
import type { Language } from "./language";
import { localParams } from "./local/local";
import { planetParams } from "./planet/generate";
import { hashString } from "./random";
import { settingOf, type Setting } from "./setting";
import { galaxyParams } from "./space/galaxy";
import { universeParams } from "./space/universe";

/** Every kind of map a world can hold. */
export type MapLevel = "universe" | "galaxy" | "system" | "planet" | "region" | "underworld" | "city" | "building" | "local";
/** The kinds a world can start from. */
export type TopLevel = "universe" | "galaxy" | "system" | "planet" | "city" | "building" | "local";
export const TOP_LEVELS: TopLevel[] = ["universe", "galaxy", "system", "planet", "city", "building", "local"];

/** Which maps can be reached below each kind of map. */
const BELOW: Record<MapLevel, MapLevel[]> = {
  universe: ["galaxy"],
  galaxy: ["system", "local"],
  system: ["planet"],
  planet: ["region", "underworld", "city", "local"],
  region: ["city", "local"],
  underworld: ["local"],
  city: ["building", "local"],
  building: [],
  local: [],
};

/** The levels a world with this top can show: the top and everything reachable under it. */
export function levelsOf(top: TopLevel): MapLevel[] {
  const out: MapLevel[] = [];
  const walk = (level: MapLevel) => {
    if (out.includes(level)) return;
    out.push(level);
    BELOW[level].forEach(walk);
  };
  walk(top);
  const order: MapLevel[] = ["universe", "galaxy", "system", "planet", "region", "underworld", "city", "building", "local"];
  return order.filter((level) => out.includes(level));
}

/** How a map was reached from its parent: which thing on the parent map was opened. */
export interface WorldStep {
  /** The thing's key on the parent map, as its names and notes use it: "galaxy:3", "star:42", "body:2", "burg:17",
   * "province:5", "state:2", "marker:9", "landmark:4", "building:220", "cavern:6", "underworld". */
  entity: string;
}

export interface WorldMap {
  level: MapLevel;
  /** The parent map's key; null for the world's top map. */
  parent: string | null;
  step: WorldStep | null;
  /** A name to show in the world's outline. */
  title: string;
  /** The parameters derived from the parent when the map was last opened from it. */
  base: Record<string, unknown> | null;
  /** The parameters the map was last made from: the derived ones with the GM's overrides on top. */
  params: Record<string, unknown>;
  /** The language its names come from, when one was handed down. */
  language?: Language | null;
  opened: number;
}

export interface WorldDoc {
  format: "new-world-atlas/world";
  version: 1;
  id: string;
  name: string;
  created: number;
  updated: number;
  top: TopLevel;
  /** World-wide: the age and setting every map follows. */
  setting: Partial<Setting>;
  script: "latin" | "cyrillic";
  /** The top map's first parameters (its seed, a planet's size and shape), until the top map is made. */
  start?: Record<string, unknown>;
  /** Every map opened in this world, by map key; the top map has no parent. */
  maps: Record<string, WorldMap>;
  /** The game master's names, notes, pins, fog and edits, per map key. */
  patches: Record<string, MapPatch>;
  /** The map the game master was on, and the last map of each level. */
  last: { key: string | null; byLevel: Partial<Record<MapLevel, string>> };
}

/** A short summary for the list of worlds. */
export interface WorldSummary {
  id: string;
  name: string;
  top: TopLevel;
  era: string;
  maps: number;
  updated: number;
}

export function emptyWorld(input: { id: string; name: string; top: TopLevel; setting?: Partial<Setting>; script?: "latin" | "cyrillic"; start?: Record<string, unknown>; now?: number }): WorldDoc {
  const now = input.now ?? Date.now();
  return { format: "new-world-atlas/world", version: 1, id: input.id, name: input.name, created: now, updated: now, top: input.top, setting: input.setting ?? {}, script: input.script ?? "latin", ...(input.start ? { start: input.start } : {}), maps: {}, patches: {}, last: { key: null, byLevel: {} } };
}

export function summarize(world: WorldDoc): WorldSummary {
  return { id: world.id, name: world.name, top: world.top, era: settingOf(world.setting).era, maps: Object.keys(world.maps).length, updated: world.updated };
}

/** The world's top map, if it has been made. */
export function rootOf(world: WorldDoc): [string, WorldMap] | null {
  return Object.entries(world.maps).find(([, map]) => map.parent === null) ?? null;
}

/** The chain of maps from the world's top down to this one. */
export function pathTo(world: WorldDoc, key: string): [string, WorldMap][] {
  const out: [string, WorldMap][] = [];
  const seen = new Set<string>();
  for (let at: string | null = key; at && world.maps[at] && !seen.has(at); at = world.maps[at].parent) {
    seen.add(at);
    out.unshift([at, world.maps[at]]);
  }
  return out;
}

/** The maps opened from this one. */
export function childrenOf(world: WorldDoc, key: string): [string, WorldMap][] {
  return Object.entries(world.maps).filter(([, map]) => map.parent === key);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The GM's overrides of a map: the parameters that differ from what its parent handed down. */
export function overridesOf(map: WorldMap): Record<string, unknown> {
  if (!map.base) return {};
  return Object.fromEntries(Object.entries(map.params).filter(([field, value]) => !same(value, map.base![field])));
}

/** A child's parameters: what the parent hands down now, with the GM's earlier overrides laid on top. `key` is the
 * child's plain key (level and seed); of the maps grown from that seed, the one opened last is the one met again. */
export function resolve(world: WorldDoc, key: string, derived: Record<string, unknown>): Record<string, unknown> {
  let known: WorldMap | undefined;
  for (const [other, map] of Object.entries(world.maps)) if ((other === key || other.startsWith(`${key}~`)) && (!known || map.opened > known.opened)) known = map;
  return known ? { ...derived, ...overridesOf(known) } : derived;
}

/** What each kind of map grows from besides its seed. Settings that do not reshape it stay out of its key: its name,
 * the world it is part of, the age the whole world shares, the GM's own kinds of thing, a dungeon's danger. */
const SHAPED: Partial<Record<MapLevel, [(seed: string) => object, string[]]>> = {
  planet: [(seed) => planetParams({ seed }), ["setting"]],
  local: [(seed) => localParams({ seed }), ["danger", "boss"]],
  galaxy: [(seed) => galaxyParams({ seed }), ["custom"]],
  universe: [(seed) => universeParams({ seed }), ["custom"]],
};

/** A map's key for the GM's names, notes, pins and edits: its level and seed, and a short print of the settings it
 * grew from when they are not its seed's own, so the same seed grown another way does not wear another map's notes. */
export function mapKeyOf(level: MapLevel, params: Record<string, unknown>): string {
  const seed = String(params.seed);
  const plain = `${level}:${seed}`;
  const shaped = SHAPED[level];
  if (!shaped) return plain;
  const own = shaped[0](seed) as Record<string, unknown>;
  const differs = Object.keys(params)
    .filter((field) => !["seed", "name", "world", ...shaped[1]].includes(field) && params[field] !== undefined && !same(params[field], own[field]))
    .sort();
  return differs.length ? `${plain}~${hashString(differs.map((field) => `${field}=${JSON.stringify(params[field])}`).join("&")).toString(36)}` : plain;
}

/** A world saved before map keys carried their print: each map, its patch and the links to it move to its key now. */
export function rekey(world: WorldDoc): WorldDoc {
  const moves = new Map<string, string>();
  for (const [key, map] of Object.entries(world.maps)) {
    // Only a map keyed by its level and seed alone, of a kind whose key now carries a print.
    if (!SHAPED[map.level] || key !== `${map.level}:${String(map.params.seed)}`) continue;
    const next = mapKeyOf(map.level, map.params);
    if (next !== key && !world.maps[next]) moves.set(key, next);
  }
  if (!moves.size) return world;
  const to = (key: string | null) => (key !== null ? moves.get(key) ?? key : null);
  const maps = Object.fromEntries(Object.entries(world.maps).map(([key, map]) => [to(key)!, { ...map, parent: to(map.parent) }]));
  const patches = { ...world.patches };
  for (const [from, next] of moves) {
    if (!patches[from] || patches[next]) continue;
    patches[next] = patches[from];
    delete patches[from];
  }
  const byLevel = Object.fromEntries(Object.entries(world.last.byLevel).map(([level, key]) => [level, to(key ?? null)]));
  return { ...world, maps, patches, last: { key: to(world.last.key), byLevel } };
}

/** Records a map opened in the world: from a parent (with what it handed down) or as the world's top. */
export function visit(world: WorldDoc, key: string, entry: { level: MapLevel; parent: string | null; step: WorldStep | null; title: string; base: Record<string, unknown> | null; params: Record<string, unknown>; language?: Language | null }, now = Date.now()): WorldDoc {
  const old = world.maps[key];
  // A map met again keeps its place in the tree unless it is reached from a new parent.
  const parent = entry.parent ?? (entry.level === world.top ? null : old?.parent ?? null);
  const map: WorldMap = { level: entry.level, parent, step: entry.step ?? old?.step ?? null, title: entry.title, base: entry.base ?? old?.base ?? null, params: entry.params, language: entry.language === undefined ? old?.language : entry.language, opened: now };
  let maps = { ...world.maps, [key]: map };
  // A new top map makes a new world under it: maps hanging from the old top are dropped (their notes stay, unused).
  if (parent === null && entry.level === world.top) {
    const root = rootOf(world);
    if (root && root[0] !== key) maps = Object.fromEntries(Object.entries(maps).filter(([other]) => other === key || reaches(maps, other, key)));
  }
  return { ...world, maps, updated: now, last: { key, byLevel: { ...world.last.byLevel, [entry.level]: key } } };
}

/** Whether a map hangs, through its parents, from another. */
function reaches(maps: Record<string, WorldMap>, key: string, ancestor: string): boolean {
  const seen = new Set<string>();
  for (let at: string | null = maps[key]?.parent ?? null; at && !seen.has(at); at = maps[at]?.parent ?? null) {
    if (at === ancestor) return true;
    seen.add(at);
  }
  return false;
}

/** The setting a map lives in: its own or its nearest ancestor's override, else the world's. */
export function settingAt(world: WorldDoc, key: string | null): Partial<Setting> {
  for (const [, map] of key ? pathTo(world, key).reverse() : []) {
    if (map.level === "planet" && map.parent !== null && map.base && !same(map.params.setting, map.base.setting)) return (map.params.setting as Partial<Setting>) ?? {};
  }
  return world.setting;
}

/** Reads a world file, or says why it cannot. */
export function readWorld(data: unknown): WorldDoc {
  const world = data as Partial<WorldDoc> | null;
  if (!world || world.format !== "new-world-atlas/world") throw new Error("not a world file");
  if (world.version !== 1) throw new Error(`unknown world file version ${String(world.version)}`);
  if (!world.id || !world.top || !TOP_LEVELS.includes(world.top)) throw new Error("the world file has no top map");
  return rekey({ ...emptyWorld({ id: world.id, name: world.name ?? "", top: world.top }), ...world, maps: world.maps ?? {}, patches: world.patches ?? {}, last: world.last ?? { key: null, byLevel: {} } } as WorldDoc);
}

/** A map's patch changed: a new name for the map itself also names the thing it was opened from on its parent map
 * (a city renamed renames its town on the planet; a system, its star). */
export function nameUp(world: WorldDoc, key: string, before: MapPatch | undefined): WorldDoc {
  const map = world.maps[key];
  const name = world.patches[key]?.names.world;
  if (!map?.parent || !map.step || map.step.entity === "underworld" || name === before?.names.world) return world;
  const parent = world.patches[map.parent] ?? { names: {}, notes: {}, pins: [], fog: { enabled: false, revealed: [] } };
  const names = { ...parent.names };
  if (name) names[map.step.entity] = name;
  else delete names[map.step.entity];
  return { ...world, patches: { ...world.patches, [map.parent]: { ...parent, names } } };
}
