// The game master's changes to a local map's key: a room given another purpose, other dwellers, loot, trap or words,
// or rolled anew from a stream of its own (the n-th roll is always the same). Changes live in the map's patch under
// `changes.local`, by room number, so each can be undone on its own.
import type { Language } from "../language";
import { createLanguage } from "../language";
import { createRng } from "../random";
import { furnish, lookOf, notablesOf, setTraps, type Build } from "./build";
import { tablesFor } from "./local";
import { placeSeed, TILE, type Keyed, type LocalGroup, type LocalLoot, type LocalMap } from "./model";
import { NO_OWN, ownThemeOf, type LocalOwn } from "./own";
import { PURPOSES, stock } from "./stock";

export interface LocalRoomEdit {
  purpose?: Keyed["purpose"];
  monsters?: LocalGroup[];
  treasure?: LocalLoot | null;
  trap?: string | null;
  /** The game master's own words for the room. */
  text?: string;
  /** How many times the room was rolled anew. */
  reroll?: number;
}

export interface LocalChanges {
  rooms?: Record<string, LocalRoomEdit>;
}

/** Rooms that make the place what it is: rolled anew they keep their purpose. */
const FIXED = new Set(["entrance", "lair", "tomb", "flooded", "cistern", "platform", "airlock", "ship-bridge", "engine-room", "great-hall", "landmark"]);
const WILD_SITES = ["camp", "clearing", "ruin", "lair", "spring", "shrine"] as const;
/** Things a room is furnished with, taken away when it is furnished anew (keys, stairs and ways out stay). */
const FURNISHING = new Set(["pillar", "statue", "chest", "altar", "pool", "tent", "fire", "terminal", "crate", "bones", "coffin", "console", "reactor", "bunk", "cart", "shaft", "machine", "trap", "grave", "fence", "derrick"]);

/** A map with the game master's changes to its rooms. */
export function editLocal(map: LocalMap, changes: LocalChanges | undefined, language?: Language | null, own: LocalOwn = NO_OWN): LocalMap {
  const edits = changes?.rooms;
  if (!edits || !Object.keys(edits).length) return map;
  const tables = tablesFor(map.params, own);
  const tongue = language ? { ...language } : createLanguage(createRng(map.params.seed).fork("local").fork("language"));
  const b: Build = { params: map.params, W: map.params.width, H: map.params.height, tiles: map.tiles.slice(), keyed: map.keyed.map((room) => ({ ...room })), features: map.features.map((f) => ({ ...f })), rng: createRng(`${map.params.seed}/edits`), tables, lord: null, language: tongue, key: `local:${placeSeed(map.params.seed)}`, depth: map.params.depth ?? 1 };
  const theme = ownThemeOf(map.params, own);
  const pool: Keyed["purpose"][] = map.params.kind === "wilderness" ? [...WILD_SITES] : theme?.rooms.length ? (theme.rooms as Keyed["purpose"][]) : PURPOSES[map.params.theme].filter((p) => p !== "flooded");
  for (const room of b.keyed) {
    const edit = edits[String(room.id)];
    if (!edit) continue;
    let refurnish = false;
    if (edit.reroll) {
      const rng = createRng(`${map.params.seed}/room-${room.id}/reroll-${edit.reroll}`);
      const purpose = FIXED.has(room.purpose) || room.purpose.startsWith("own:") || room.secret || !pool.length ? room.purpose : rng.pick(pool);
      const boss = room.monsters.find((group) => group.boss) ?? null;
      Object.assign(room, stock({ rng: rng.fork("stock"), purpose, final: !!room.final, tables, danger: map.params.danger, depth: b.depth, lord: boss, key: `${b.key}/room-${room.id}/reroll-${edit.reroll}`, language: tongue }));
      room.purpose = purpose;
      room.look = lookOf(rng.fork("look"), tables.family, purpose, room.object);
      const people = notablesOf(rng.fork("people"), purpose, b, room.id);
      if (people.length) room.people = people;
      else delete room.people;
      refurnish = true;
    }
    if (edit.purpose && edit.purpose !== room.purpose) {
      room.purpose = edit.purpose;
      room.look = lookOf(createRng(`${map.params.seed}/room-${room.id}/as-${edit.purpose}`), tables.family, edit.purpose, room.object);
      refurnish = true;
    }
    if (edit.monsters) room.monsters = edit.monsters.map((group) => ({ ...group, count: Math.max(1, Math.round(group.count) || 1) }));
    if (edit.treasure !== undefined) room.treasure = edit.treasure;
    if (edit.trap !== undefined) {
      room.trap = edit.trap;
      refurnish = true;
    }
    if (edit.text !== undefined) room.text = edit.text || undefined;
    if (refurnish) {
      b.features = b.features.filter((f) => f.room !== room.id || !FURNISHING.has(f.kind));
      // A garden's beds go with it.
      for (const c of room.cells) if (b.tiles[c] === TILE.field && map.tiles[c] === TILE.field && room.purpose !== "garden") b.tiles[c] = TILE.floor;
      furnish(b, room, createRng(`${map.params.seed}/room-${room.id}/dress-${edit.reroll ?? 0}-${room.purpose}`));
    }
  }
  setTraps(b);
  return { ...map, tiles: b.tiles, keyed: b.keyed, features: b.features };
}
