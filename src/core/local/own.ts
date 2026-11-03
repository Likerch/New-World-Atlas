// The game master's own content for local maps: kinds of room (with a description, whether they are secret, and what
// they open into), themes of dungeon built on one of the generator's, and tables of dwellers, loot and traps by theme
// and age. They are kept outside the map's parameters, so the same place with and without them keeps its key.
import type { Rng } from "../random";
import type { Keyed, LocalKind, LocalParams, LocalTheme } from "./model";
import type { Tables } from "./stock";

export interface OwnRoomKind {
  id: string;
  name: string;
  /** What the game master reads out. */
  text: string;
  /** Hidden behind a secret door. */
  secret: boolean;
  /** A theme it opens into (a way down to a place of that theme), or "" for none. */
  opens: string;
  /** Themes it turns up in; none for every built place. */
  themes: string[];
}

export interface OwnTheme {
  id: string;
  name: string;
  kind: LocalKind;
  /** The generator's theme it is built like. */
  base: LocalTheme;
  /** Its rooms: built-in purposes and "own:<id>" kinds. */
  rooms: string[];
}

export interface OwnTable {
  id: string;
  what: "dwellers" | "loot" | "traps";
  /** A theme ("any" for all) and an age ("any" for all). */
  theme: string;
  age: string;
  /** One entry a line; dwellers may say how many come together: "goblin archers 2-6". */
  entries: string;
}

export interface LocalOwn {
  rooms: OwnRoomKind[];
  themes: OwnTheme[];
  tables: OwnTable[];
}

export const NO_OWN: LocalOwn = { rooms: [], themes: [], tables: [] };

/** A table's lines: names, and for dwellers how many ("2-6", "3"). */
export function parseEntries(text: string): { who: string; n?: [number, number] }[] {
  return text
    .split(/\r?\n|;/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(.*?)\s+(\d+)(?:\s*[-–]\s*(\d+))?$/u.exec(line);
      if (!match) return { who: line };
      const lo = Math.max(1, Number(match[2]));
      return { who: match[1].trim(), n: [lo, Math.max(lo, Number(match[3] ?? match[2]))] as [number, number] };
    });
}

const fits = (value: string, wanted: string | undefined) => value === "any" || value === "" || value === wanted;

/** The game master's tables that apply to a place: its theme (or its own theme's base) and its age. */
export function ownTables(params: LocalParams, own: LocalOwn): Tables["own"] {
  const tables = own.tables.filter((table) => (fits(table.theme, params.theme) || table.theme === params.own) && fits(table.age, params.age));
  if (!tables.length) return undefined;
  const of = (what: OwnTable["what"]) => tables.filter((table) => table.what === what).flatMap((table) => parseEntries(table.entries));
  return { dwellers: of("dwellers"), loot: of("loot").map((entry) => entry.who), traps: of("traps").map((entry) => entry.who) };
}

/** The theme a place is built like: its own theme's base, when it follows one. */
export function ownThemeOf(params: LocalParams, own: LocalOwn): OwnTheme | null {
  return params.own ? own.themes.find((theme) => theme.id === params.own) ?? null : null;
}

/** Rooms that are the place's own and never handed to the game master's kinds. */
const SPECIAL = new Set(["entrance", "lair", "tomb", "great-hall", "cistern", "platform", "ship-bridge", "engine-room", "airlock", "guard-room"]);

/** How a place uses the game master's rooms: its own theme's purposes, and each of their room kinds that fits it
 * once, in a room that would have been an ordinary one (a secret kind in a secret room). */
export interface OwnPlan {
  pool: Keyed["purpose"][] | null;
  take: (purpose: Keyed["purpose"], secret: boolean) => Keyed["purpose"];
}

export function ownPlan(params: LocalParams, own: LocalOwn, rng: Rng): OwnPlan {
  const theme = ownThemeOf(params, own);
  const known = new Set(own.rooms.map((room) => room.id));
  const pool = theme?.rooms.filter((id) => !id.startsWith("own:") || known.has(id.slice(4))) as Keyed["purpose"][] | undefined;
  const fitting = own.rooms.filter((room) => !room.themes.length || room.themes.includes(params.theme) || (params.own !== undefined && room.themes.includes(params.own)));
  const open = rng.shuffle(fitting.filter((room) => !room.secret));
  const hidden = rng.shuffle(fitting.filter((room) => room.secret));
  return {
    pool: pool?.length ? pool : null,
    take: (purpose, secret) => {
      if (SPECIAL.has(purpose)) return purpose;
      const queue = secret ? hidden : open;
      if (queue.length && rng.chance(secret ? 1 : 0.5)) return `own:${queue.shift()!.id}`;
      return purpose;
    },
  };
}
