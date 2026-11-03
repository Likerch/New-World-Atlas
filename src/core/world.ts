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
import { cleanPatch, type MapPatch } from "./campaign";
import type { Page } from "./handbook";
import type { Language } from "./language";
import { localParams } from "./local/local";
import { planetParams } from "./planet/generate";
import { hashString } from "./random";
import { settingOf, type Setting } from "./setting";
import { galaxyParams } from "./space/galaxy";
import { universeParams } from "./space/universe";

/** The generator's version, written into each map a world records. A map made by an older version is still opened
 * from its seed and settings, but the newer generator may draw it otherwise; the app says so. */
export const GENERATOR = "2026.11.3";

/** Every kind of map a world can hold. */
export type MapLevel = "universe" | "galaxy" | "system" | "planet" | "region" | "underworld" | "city" | "building" | "local";
/** The kinds a world can start from. */
export type TopLevel = "universe" | "galaxy" | "system" | "planet" | "city" | "building" | "local";
export const TOP_LEVELS: TopLevel[] = ["universe", "galaxy", "system", "planet", "city", "building", "local"];

/** Which maps can be reached below each kind of map. */
const BELOW: Record<MapLevel, MapLevel[]> = {
  universe: ["galaxy"],
  galaxy: ["system", "local", "building"],
  system: ["planet", "city", "building", "local"],
  planet: ["region", "underworld", "city", "building", "local"],
  region: ["city", "building", "local", "underworld"],
  underworld: ["local", "city"],
  // A city's way to the deep and a cave's to the underworld need a planet above them, which a city or a dungeon at the
  // top of its world has not.
  city: ["building", "local"],
  building: ["local"],
  local: ["local"],
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
  /** The generator that made it: a map made by an older one may come out differently now. */
  made?: string;
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
  /** The handbook: a page for each place written about, by `pageKey`. */
  pages?: Record<string, Page>;
  /** Kilometres or miles. */
  units?: "metric" | "imperial";
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
 * the world it is part of, the age and magic the whole world shares, the GM's own kinds of thing, a dungeon's danger. */
const SHAPED: Partial<Record<MapLevel, [(seed: string) => object, string[]]>> = {
  planet: [(seed) => planetParams({ seed }), ["setting"]],
  local: [(seed) => localParams({ seed }), ["danger", "boss", "levels", "age", "magic"]],
  galaxy: [(seed) => galaxyParams({ seed }), ["custom"]],
  universe: [(seed) => universeParams({ seed }), ["custom"]],
};

/** What a key leaves out of the parameters it prints: names handed down (a gate's far galaxy, a far power, the
 * caverns a cavern's tunnels lead to), which the GM may rename without the map becoming another. */
const unnamed = (level: MapLevel, field: string, value: unknown): unknown => {
  if (level === "local" && field === "exits" && Array.isArray(value)) return value.map((exit: { dir?: unknown; kind?: unknown }) => ({ dir: exit?.dir, kind: exit?.kind }));
  if (level !== "galaxy" || field !== "origin" || !value || typeof value !== "object") return value;
  const origin = value as { gate?: unknown; power?: Record<string, unknown> };
  return { ...origin, ...(origin.gate !== undefined ? { gate: true } : {}), ...(origin.power ? { power: { ...origin.power, name: undefined } } : {}) };
};

/** A galaxy's star system: keyed by its galaxy as grown, so the same seed grown otherwise does not share its notes. */
export function systemKeyOf(galaxy: Record<string, unknown> | object, star: number): string {
  return `system:${mapKeyOf("galaxy", galaxy as Record<string, unknown>).slice("galaxy:".length)}/star-${star}`;
}

/** A lone star system: its seed, and a print of what shapes it besides (class, worlds, companion, settlers…). */
export function loneSystemKeyOf(params: Record<string, unknown> | object): string {
  const own = params as Record<string, unknown>;
  const fields = Object.keys(own).filter((field) => !["seed", "name", "custom"].includes(field) && own[field] !== undefined).sort();
  const plain = `system:lone/${String(own.seed)}`;
  return fields.length ? `${plain}~${hashString(fields.map((field) => `${field}=${JSON.stringify(own[field])}`).join("&")).toString(36)}` : plain;
}

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
  return differs.length ? `${plain}~${hashString(differs.map((field) => `${field}=${JSON.stringify(unnamed(level, field, params[field]))}`).join("&")).toString(36)}` : plain;
}

/** A world saved before map keys carried their print: each map, its patch and the links to it move to its key now. */
export function rekey(world: WorldDoc): WorldDoc {
  const moves = new Map<string, string>();
  const taken = new Set<string>();
  // The map opened last first: when two old keys now key alike (a cavern's map before and after a neighbour was
  // renamed), it takes the new key and the other stays where it was, its notes kept.
  for (const [key, map] of Object.entries(world.maps).sort(([, p], [, q]) => q.opened - p.opened)) {
    // A map of a kind whose key carries a print, keyed otherwise than its parameters key it now.
    const plain = `${map.level}:${String(map.params.seed)}`;
    if (!SHAPED[map.level] || (key !== plain && !key.startsWith(`${plain}~`))) continue;
    const next = mapKeyOf(map.level, map.params);
    if (next !== key && !world.maps[next] && !taken.has(next)) {
      moves.set(key, next);
      taken.add(next);
    }
  }
  // The local map of a star's place once hung by the star's own entity, so renaming the place renamed the star.
  let sites = false;
  const steps = Object.fromEntries(
    Object.entries(world.maps).map(([key, map]) => {
      const parent = map.parent ? world.maps[map.parent] : undefined;
      if (map.level !== "local" || parent?.level !== "galaxy" || !map.step || !/^star:\d+$/u.test(map.step.entity)) return [key, map];
      sites = true;
      return [key, { ...map, step: { ...map.step, entity: `${map.step.entity}:site` } }];
    }),
  );
  if (sites) world = { ...world, maps: steps };
  if (!moves.size) return world;
  // Keys derived from a moved one follow it: its underworld (`underworld:<body>/…`), a room's scene
  // (`local:<body>/room-4`), its handbook pages (`<key>|<entity>`).
  const bodies = [...moves].map(([from, next]) => [from.slice(0, from.indexOf(":")), from.slice(from.indexOf(":") + 1), next.slice(next.indexOf(":") + 1)] as const);
  const derived = (key: string): string => {
    if (moves.has(key)) return moves.get(key)!;
    const bar = key.indexOf("|");
    if (bar > 0 && moves.has(key.slice(0, bar))) return `${moves.get(key.slice(0, bar))}${key.slice(bar)}`;
    const colon = key.indexOf(":");
    const body = key.slice(colon + 1);
    // Only keys made from the moved key itself (a city's is made from its planet's seed alone, and stays).
    const level = key.slice(0, colon);
    for (const [kind, from, next] of bodies) if ((level === kind || (level === "underworld" && kind === "planet")) && body.startsWith(`${from}/`)) return `${level}:${next}${body.slice(from.length)}`;
    return key;
  };
  const to = (key: string | null) => (key !== null ? derived(key) : null);
  const maps = Object.fromEntries(Object.entries(world.maps).map(([key, map]) => [to(key)!, { ...map, parent: to(map.parent) }]));
  const patches: typeof world.patches = {};
  for (const [key, patch] of Object.entries(world.patches)) {
    const next = to(key)!;
    if (next === key || !world.patches[next]) patches[next] = patch;
    else patches[key] = patch;
  }
  const pages = world.pages ? Object.fromEntries(Object.entries(world.pages).map(([key, page]) => [to(key)!, { ...page, map: to(page.map)! }])) : undefined;
  const byLevel = Object.fromEntries(Object.entries(world.last.byLevel).map(([level, key]) => [level, to(key ?? null)]));
  return { ...world, maps, patches, ...(pages ? { pages } : {}), last: { key: to(world.last.key), byLevel } };
}

/** Records a map opened in the world: from a parent (with what it handed down) or as the world's top. */
export function visit(world: WorldDoc, key: string, entry: { level: MapLevel; parent: string | null; step: WorldStep | null; title: string; base: Record<string, unknown> | null; params: Record<string, unknown>; language?: Language | null }, now = Date.now()): WorldDoc {
  const old = world.maps[key];
  // A map met again keeps its place in the tree unless it is reached from a new parent; a new map of the top's level
  // reached from nowhere is a new top (a dungeon's next level is linked from the level above it, so it is not).
  const parent = entry.parent ?? old?.parent ?? null;
  const map: WorldMap = { level: entry.level, parent, step: entry.step ?? old?.step ?? null, title: entry.title, base: entry.base ?? old?.base ?? null, params: entry.params, language: entry.language === undefined ? old?.language : entry.language, opened: now, made: old?.made ?? GENERATOR };
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
  if (!world.id || typeof world.id !== "string" || !world.top || !TOP_LEVELS.includes(world.top)) throw new Error("the world file has no top map");
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
  const patches = Object.fromEntries(Object.entries(object(world.patches) ? world.patches : {}).map(([key, patch]) => [key, cleanPatch(patch)]));
  // Maps of the levels there are, with parameters to grow from; pages with what the handbook reads; a last map known.
  const maps = Object.fromEntries(
    Object.entries(object(world.maps) ? world.maps : {}).filter(([, map]) => object(map) && LEVELS.includes(map.level as MapLevel) && object(map.params)),
  ) as Record<string, WorldMap>;
  for (const map of Object.values(maps)) {
    if (map.parent !== null && typeof map.parent !== "string") map.parent = null;
    if (map.step !== null && !(object(map.step) && typeof map.step.entity === "string")) map.step = null;
    if (typeof map.title !== "string") map.title = "";
    if (typeof map.opened !== "number") map.opened = 0;
  }
  const pages = Object.fromEntries(
    Object.entries(object(world.pages) ? world.pages : {})
      .filter(([, page]) => object(page) && typeof page.map === "string" && typeof page.entity === "string")
      .map(([key, page]) => [key, cleanPage(page as Partial<Page> & Pick<Page, "map" | "entity">)]),
  );
  const last = object(world.last) ? world.last : { key: null, byLevel: {} };
  const byLevel = Object.fromEntries(Object.entries(object(last.byLevel) ? last.byLevel : {}).filter(([level, key]) => LEVELS.includes(level as MapLevel) && typeof key === "string" && maps[key]));
  const lastKey = typeof last.key === "string" && maps[last.key] ? last.key : null;
  return rekey({ ...emptyWorld({ id: world.id, name: world.name ?? "", top: world.top }), ...world, name: typeof world.name === "string" ? world.name : "", maps, patches, pages: object(world.pages) ? pages : undefined, last: { key: lastKey, byLevel } } as WorldDoc);
}

const LEVELS: MapLevel[] = ["universe", "galaxy", "system", "planet", "region", "underworld", "city", "building", "local"];

/** A handbook page as a file gives it: text where text is read, tags a list of words, a picture only as image data. */
function cleanPage(page: Partial<Page> & Pick<Page, "map" | "entity">): Page {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
  return {
    title: text(page.title, 200),
    text: text(page.text, 100_000),
    secret: text(page.secret, 100_000),
    tags: Array.isArray(page.tags) ? page.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.slice(0, 40)).slice(0, 40) : [],
    ...(typeof page.image === "string" && /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/iu.test(page.image) ? { image: page.image } : {}),
    map: page.map,
    entity: page.entity,
    name: text(page.name, 200),
    updated: typeof page.updated === "number" ? page.updated : 0,
  };
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

/** Two copies of one world brought together (the GM's own and one from a file): maps of both; where both changed a
 * map's patch, the names and notes of both (the file's word wins a clash), pins of both and fog revealed by either. */
export function mergeWorlds(base: WorldDoc, incoming: WorldDoc): WorldDoc {
  const patches = { ...base.patches };
  for (const [key, patch] of Object.entries(incoming.patches)) {
    const old = patches[key];
    patches[key] = !old
      ? patch
      : {
          ...old,
          ...patch,
          names: { ...old.names, ...patch.names },
          notes: { ...old.notes, ...patch.notes },
          pins: [...old.pins, ...patch.pins.filter((pin) => !old.pins.some((other) => other.id === pin.id))],
          fog: { enabled: old.fog.enabled || patch.fog.enabled, revealed: [...new Map([...old.fog.revealed, ...patch.fog.revealed].map((spot) => [spot.join(","), spot])).values()] },
          ...(old.changes || patch.changes ? { changes: { ...old.changes, ...patch.changes } } : {}),
        };
  }
  // Pages of both; where both wrote the same page, the later writing.
  const pages = { ...base.pages };
  for (const [key, page] of Object.entries(incoming.pages ?? {})) if (!pages[key] || pages[key].updated < page.updated) pages[key] = page;
  return { ...base, maps: { ...base.maps, ...incoming.maps }, patches, pages, updated: Math.max(base.updated, incoming.updated) };
}
