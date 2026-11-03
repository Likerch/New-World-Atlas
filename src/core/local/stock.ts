// What fills a local map: who lives there and how many come together, what lies to be found and what will hurt — by
// the place's theme, its world's age and how much magic that world has (no skeletons walk where there is none: grave
// robbers and rats do). A ruler waits in the last room; people come led by someone with a name.
import { makeNpc, type Role } from "../people";
import type { Language } from "../language";
import type { Rng } from "../random";
import { SETTINGS, type EraId } from "../setting";
import type { LocalGroup, LocalLoot, LocalParams, LocalTheme, Purpose } from "./model";

/** The ages, grouped by what crawls in their dark. */
export type AgeGroup = "primal" | "old" | "steam" | "now" | "chrome" | "stars" | "after";
const GROUP_OF: Record<EraId, AgeGroup> = { stone: "primal", ancient: "old", medieval: "old", renaissance: "old", industrial: "steam", modern: "now", cyberpunk: "chrome", "far-future": "stars", "post-apocalypse": "after" };

/** Which table a theme draws its dwellers from. */
export type Family = "crypt" | "temple" | "cave" | "mine" | "sewer" | "facility" | "metro" | "mall" | "ship" | "hold" | "forest" | "taiga" | "swamp" | "desert" | "mountain" | "coast" | "jungle" | "steppe" | "tundra" | "seabed" | "waste";
const FAMILY: Record<LocalTheme, Family> = { crypt: "crypt", temple: "temple", mine: "mine", sewer: "sewer", bunker: "facility", derelict: "ship", factory: "facility", metro: "metro", lab: "facility", mall: "mall", vault: "facility", starship: "ship", lair: "cave", hold: "hold", forest: "forest", taiga: "taiga", swamp: "swamp", desert: "desert", mountain: "mountain", coast: "coast", wasteland: "waste", jungle: "jungle", steppe: "steppe", tundra: "tundra", seabed: "seabed" };

/** A kind of dweller: how many come together, how strong (3 can rule a place), who leads people, where and when it
 * is met, and whether it needs magic in the world. */
interface Dweller {
  id: string;
  n: [number, number];
  tier: 1 | 2 | 3;
  lead?: Role;
  where: Family[];
  ages: AgeGroup[];
  magic?: boolean;
}

const OLD: AgeGroup[] = ["old"];
const EARTHLY: AgeGroup[] = ["primal", "old", "steam", "now", "chrome", "after"];
const MACHINE: AgeGroup[] = ["now", "chrome", "stars", "after"];
const WILD: Family[] = ["forest", "taiga", "swamp", "desert", "mountain", "coast", "jungle", "steppe", "tundra"];

const DWELLERS: Dweller[] = [
  // The dead and those who serve the dark, where magic stirs them.
  { id: "skeletons", n: [2, 6], tier: 1, where: ["crypt", "temple"], ages: OLD, magic: true },
  { id: "zombies", n: [2, 5], tier: 1, where: ["crypt"], ages: [...OLD, "steam", "now"], magic: true },
  { id: "ghouls", n: [1, 4], tier: 2, where: ["crypt", "sewer"], ages: [...OLD, "steam"], magic: true },
  { id: "ghouls", n: [2, 6], tier: 2, where: ["metro", "facility", "waste", "sewer"], ages: ["after"] },
  { id: "wraith", n: [1, 1], tier: 3, where: ["crypt", "temple"], ages: [...OLD, "steam"], magic: true },
  { id: "mummy", n: [1, 1], tier: 3, where: ["crypt", "desert"], ages: ["primal", "old"], magic: true },
  { id: "lich", n: [1, 1], tier: 3, where: ["crypt"], ages: OLD, magic: true },
  { id: "vampire", n: [1, 1], tier: 3, where: ["crypt", "sewer"], ages: [...OLD, "steam", "now"], magic: true },
  { id: "animated-statues", n: [1, 3], tier: 2, where: ["temple", "crypt"], ages: OLD, magic: true },
  { id: "minotaur", n: [1, 1], tier: 3, where: ["temple", "crypt", "cave"], ages: OLD, magic: true },
  { id: "drowned", n: [2, 6], tier: 1, where: ["seabed"], ages: OLD, magic: true },
  // People of the dark places.
  { id: "cultists", n: [3, 8], tier: 1, lead: "cultist", where: ["temple", "crypt", "sewer", "cave", "metro"], ages: ["primal", "old", "steam", "now", "chrome"] },
  { id: "temple-guards", n: [2, 6], tier: 1, lead: "guard", where: ["temple"], ages: OLD },
  { id: "grave-robbers", n: [2, 5], tier: 1, lead: "thief", where: ["crypt"], ages: ["old", "steam", "now"] },
  { id: "smugglers", n: [3, 7], tier: 1, lead: "boss", where: ["sewer", "cave", "coast", "mine"], ages: ["old", "steam", "now"] },
  { id: "bandits", n: [4, 12], tier: 1, lead: "boss", where: [...WILD, "cave"], ages: ["old", "steam"] },
  { id: "pirates", n: [4, 10], tier: 1, lead: "captain", where: ["coast", "seabed"], ages: ["old", "steam"] },
  { id: "nomads", n: [4, 12], tier: 1, lead: "elder", where: ["desert", "steppe"], ages: ["primal", "old", "steam", "after"] },
  { id: "rival-hunters", n: [3, 8], tier: 1, lead: "hunter", where: [...WILD, "cave"], ages: ["primal"] },
  { id: "miners", n: [4, 10], tier: 1, lead: "miner", where: ["mine"], ages: ["old", "steam", "now", "after"] },
  { id: "thugs", n: [3, 8], tier: 1, lead: "boss", where: ["sewer", "facility", "mine", "metro"], ages: ["steam", "now"] },
  { id: "gangers", n: [3, 8], tier: 1, lead: "boss", where: ["sewer", "metro", "mall", "facility"], ages: ["now", "chrome"] },
  { id: "squatters", n: [3, 10], tier: 1, lead: "elder", where: ["metro", "mall", "facility", "sewer"], ages: ["now", "chrome"] },
  { id: "security-guards", n: [2, 5], tier: 1, lead: "captain", where: ["facility", "mall"], ages: ["now"] },
  { id: "soldiers", n: [4, 8], tier: 2, lead: "captain", where: ["facility"], ages: ["steam", "now"] },
  { id: "corp-soldiers", n: [3, 6], tier: 2, lead: "captain", where: ["facility", "mall", "metro"], ages: ["chrome", "stars"] },
  { id: "netrunners", n: [1, 3], tier: 2, lead: "hacker", where: ["facility", "metro", "mall"], ages: ["chrome"] },
  { id: "scavengers", n: [2, 5], tier: 1, lead: "scavenger", where: ["facility", "metro", "mall", "ship", "waste"], ages: ["chrome", "stars", "after"] },
  { id: "raiders", n: [4, 10], tier: 1, lead: "boss", where: ["waste", "facility", "metro", "mall", "sewer"], ages: ["after"] },
  { id: "void-pirates", n: [3, 8], tier: 2, lead: "captain", where: ["ship", "facility"], ages: ["stars"] },
  // Beasts.
  { id: "giant-rats", n: [3, 10], tier: 1, where: ["sewer", "crypt", "mine", "metro", "cave", "waste"], ages: EARTHLY },
  { id: "bat-swarm", n: [1, 3], tier: 1, where: ["cave", "mine", "crypt"], ages: ["primal", "old", "steam", "now"] },
  { id: "giant-spiders", n: [2, 5], tier: 2, where: ["cave", "crypt", "forest", "jungle"], ages: OLD, magic: true },
  { id: "slime", n: [1, 2], tier: 1, where: ["sewer", "cave", "crypt"], ages: OLD, magic: true },
  { id: "wererats", n: [2, 4], tier: 2, lead: "thief", where: ["sewer"], ages: ["old", "steam", "now"], magic: true },
  { id: "goblins", n: [4, 10], tier: 1, lead: "boss", where: ["cave", "mine", "forest", "mountain"], ages: OLD, magic: true },
  { id: "kobolds", n: [3, 8], tier: 1, lead: "boss", where: ["cave", "mine"], ages: OLD, magic: true },
  { id: "orcs", n: [3, 7], tier: 2, lead: "boss", where: ["cave", "mountain", "forest", "steppe"], ages: OLD, magic: true },
  { id: "ogre", n: [1, 1], tier: 3, where: ["cave", "mountain", "forest"], ages: OLD, magic: true },
  { id: "troll", n: [1, 1], tier: 3, where: ["cave", "mountain", "taiga", "forest"], ages: OLD, magic: true },
  { id: "young-dragon", n: [1, 1], tier: 3, where: ["cave", "mountain"], ages: OLD, magic: true },
  { id: "trolls", n: [2, 4], tier: 3, where: ["mountain", "forest", "taiga"], ages: OLD, magic: true },
  { id: "giant-eagle", n: [1, 2], tier: 2, where: ["mountain"], ages: OLD, magic: true },
  { id: "harpies", n: [2, 5], tier: 2, where: ["mountain", "coast"], ages: OLD, magic: true },
  { id: "lizardfolk", n: [3, 8], tier: 1, lead: "elder", where: ["swamp", "jungle"], ages: OLD, magic: true },
  { id: "merfolk", n: [3, 8], tier: 1, lead: "elder", where: ["seabed"], ages: OLD, magic: true },
  { id: "giant-octopus", n: [1, 1], tier: 3, where: ["seabed"], ages: [...OLD, "steam"], magic: true },
  { id: "giant-scorpions", n: [2, 5], tier: 2, where: ["desert"], ages: OLD, magic: true },
  { id: "yeti", n: [1, 1], tier: 3, where: ["tundra", "mountain"], ages: OLD, magic: true },
  { id: "automatons", n: [1, 4], tier: 2, where: ["facility", "mine"], ages: ["steam"], magic: true },
  { id: "wolves", n: [3, 8], tier: 1, where: ["forest", "taiga", "tundra", "steppe", "mountain"], ages: EARTHLY },
  { id: "bear", n: [1, 1], tier: 2, where: ["forest", "taiga", "mountain", "cave"], ages: ["old", "steam", "now"] },
  { id: "cave-bears", n: [1, 2], tier: 3, where: ["cave", "mountain", "taiga"], ages: ["primal"] },
  { id: "cave-lions", n: [1, 3], tier: 3, where: ["cave", "steppe", "tundra"], ages: ["primal"] },
  { id: "mammoths", n: [2, 6], tier: 2, where: ["steppe", "tundra"], ages: ["primal"] },
  { id: "boars", n: [2, 5], tier: 1, where: ["forest", "jungle", "steppe", "swamp"], ages: EARTHLY },
  { id: "crocodiles", n: [1, 4], tier: 2, where: ["swamp", "jungle", "sewer"], ages: EARTHLY },
  { id: "vipers", n: [1, 4], tier: 1, where: ["jungle", "swamp", "desert", "crypt"], ages: EARTHLY },
  { id: "jaguar", n: [1, 1], tier: 2, where: ["jungle"], ages: EARTHLY },
  { id: "lions", n: [2, 5], tier: 2, where: ["steppe"], ages: ["primal", "old", "steam", "now"] },
  { id: "hyenas", n: [3, 8], tier: 1, where: ["steppe", "desert"], ages: EARTHLY },
  { id: "polar-bear", n: [1, 1], tier: 3, where: ["tundra"], ages: EARTHLY },
  { id: "sharks", n: [1, 4], tier: 2, where: ["seabed", "coast"], ages: EARTHLY },
  { id: "giant-crabs", n: [2, 6], tier: 1, where: ["seabed", "coast"], ages: OLD, magic: true },
  { id: "feral-dogs", n: [3, 8], tier: 1, where: ["metro", "waste", "sewer", "mall"], ages: ["now", "after"] },
  // Machines and things of the late ages.
  { id: "mutants", n: [2, 6], tier: 2, where: ["facility", "sewer", "metro", "waste"], ages: ["chrome", "stars", "after"] },
  { id: "drones", n: [2, 6], tier: 1, where: ["facility", "ship", "mall", "metro"], ages: ["chrome", "stars"] },
  { id: "security-bots", n: [1, 4], tier: 2, where: ["facility", "ship", "mall"], ages: ["chrome", "stars"] },
  { id: "cyberpsychos", n: [1, 2], tier: 3, where: ["facility", "metro", "mall"], ages: ["chrome"] },
  { id: "xeno-swarm", n: [4, 12], tier: 1, where: ["ship", "facility", "cave"], ages: ["stars"] },
  { id: "xenomorph", n: [1, 1], tier: 3, where: ["ship", "facility"], ages: ["stars"] },
  { id: "rogue-ai", n: [1, 1], tier: 3, where: ["ship", "facility"], ages: ["chrome", "stars"] },
  { id: "war-mech", n: [1, 1], tier: 3, where: ["facility", "waste"], ages: ["chrome", "stars", "after"] },
  { id: "rad-scorpions", n: [2, 4], tier: 2, where: ["waste", "cave", "desert"], ages: ["after"] },
  { id: "mutant-brute", n: [1, 1], tier: 3, where: ["waste", "facility", "metro", "sewer"], ages: ["after"] },
  // Those who live there.
  { id: "deep-folk", n: [4, 12], tier: 1, lead: "elder", where: ["hold"], ages: [...EARTHLY, "stars"] },
  { id: "survivors", n: [4, 16], tier: 1, lead: "elder", where: [], ages: MACHINE },
  { id: "monks", n: [3, 10], tier: 1, lead: "monk", where: [], ages: ["old", "steam"] },
  { id: "crew", n: [3, 10], tier: 1, lead: "captain", where: [], ages: ["stars"] },
];

const BY_ID = new Map(DWELLERS.map((d) => [d.id, d]));

/** How many of a kind come together, by its id; a legend's own dweller ("cave bears", "a hermit") by its words. */
export function groupSize(id: string): [number, number] {
  const known = BY_ID.get(id);
  if (known) return known.n;
  return /^(a|an|the)-/u.test(id) ? [1, 1] : [2, 6];
}

/** Who leads a band of people of this kind, if they are people. */
export function leaderOf(id: string): Role | undefined {
  return BY_ID.get(id)?.lead ?? (["outlaws", "smugglers", "squatters", "a-gang", "raiders", "a-lost-tribe"].includes(id) ? "boss" : undefined);
}

const LOOT: Record<AgeGroup, string[]> = {
  primal: ["amber", "furs", "flint-blades", "ochre", "carved-idol", "shells"],
  old: ["coins", "gems", "jewelry", "fine-weapon", "relic", "silverware"],
  steam: ["banknotes", "gold-watch", "fine-weapon", "deeds", "coins", "medicines"],
  now: ["cash", "guns", "laptop", "gold-bars", "keycard", "medkits"],
  chrome: ["credits", "chip", "cyberware", "prototype-weapon", "data-shard", "medkits"],
  stars: ["credits", "data-core", "alien-relic", "plasma-weapon", "nanite-kit", "medkits"],
  after: ["caps", "ammo", "canned-food", "fuel", "clean-water", "medicine"],
};
/** Loot only a world with magic holds; a world without it has its plain things instead. */
const MAGIC_LOOT = ["magic-item", "scroll", "potions"];
/** Loot counted out: coin, ammunition, gems. */
const COUNTED: Record<string, [number, number]> = { coins: [20, 300], banknotes: [50, 500], cash: [200, 5000], credits: [100, 4000], caps: [20, 300], ammo: [10, 120], gems: [1, 6], shells: [10, 80], "gold-bars": [1, 5], amber: [2, 12] };

const TRAPS: Record<AgeGroup, string[]> = {
  primal: ["pit", "deadfall", "snare"],
  old: ["pit", "darts", "gas", "falling-block", "net", "scythe", "flooding"],
  steam: ["pit", "gas", "tripwire-gun", "steam-vent", "bear-trap"],
  now: ["tripwire-grenade", "mines", "alarm", "electrified"],
  chrome: ["laser-grid", "turret", "nerve-gas", "mines", "electrified"],
  stars: ["laser-grid", "turret", "nerve-gas", "vacuum"],
  after: ["mines", "tripwire-grenade", "bear-trap", "rad-pocket"],
};

/** The tables a place draws from: its dwellers' pool, the rulers among them, its loot and traps. */
export interface Tables {
  family: Family;
  age: AgeGroup;
  magic: number;
  pool: string[];
  lords: string[];
  loot: string[];
  traps: string[];
  /** Who lives there, when the place is lived in (a hold's deep folk, a vault's survivors, a monastery's monks). */
  residents?: string;
  /** The game master's own tables for this place, laid over the built-in ones. */
  own?: { dwellers: { who: string; n?: [number, number] }[]; loot: string[]; traps: string[] };
}

/** The age group of a place: its world's age, or its theme's own when the age is not known. */
export function ageGroupOf(params: Pick<LocalParams, "age" | "theme">): AgeGroup {
  if (params.age && params.age in GROUP_OF) return GROUP_OF[params.age as EraId];
  if (params.theme === "starship" || params.theme === "derelict") return "stars";
  if (["bunker", "lab", "vault"].includes(params.theme)) return "chrome";
  if (["factory", "metro", "mall"].includes(params.theme)) return "now";
  if (params.theme === "wasteland") return "after";
  return "old";
}

/** How much magic the place's world has: as given, else its age's usual (a place of no known age is a fantasy one). */
export function magicOf(params: Pick<LocalParams, "age" | "magic">): number {
  if (params.magic !== undefined) return params.magic;
  return params.age && params.age in SETTINGS ? SETTINGS[params.age as EraId].magic : 1;
}

export function tablesOf(params: LocalParams): Tables {
  const age = ageGroupOf(params);
  const magic = magicOf(params);
  const family = FAMILY[params.theme] ?? "cave";
  const fits = (d: Dweller, where: Family) => d.where.includes(where) && d.ages.includes(age) && (!d.magic || magic >= 1);
  let found = DWELLERS.filter((d) => fits(d, family));
  // A theme with nothing of this age (a temple among the stars) takes what any built place of the age holds.
  if (found.filter((d) => d.tier < 3).length < 2) found = [...found, ...DWELLERS.filter((d) => fits(d, age === "primal" ? "cave" : "facility") || fits(d, "cave"))];
  if (!found.length) found = DWELLERS.filter((d) => d.id === "giant-rats");
  const ids = [...new Set(found.filter((d) => d.tier < 3).map((d) => d.id))];
  const strong = [...new Set(found.filter((d) => d.tier === 3).map((d) => d.id))];
  // Without a monster to rule it, a place is ruled by the strongest band of people in it.
  const lords = strong.length ? strong : [...new Set(found.filter((d) => d.lead).map((d) => d.id))];
  const loot = [...LOOT[age], ...(magic >= 1 && age !== "chrome" && age !== "stars" ? MAGIC_LOOT : [])];
  const traps = [...TRAPS[age], ...(magic >= 1 && age === "old" ? ["glyph"] : [])];
  return { family, age, magic, pool: ids.length ? ids : ["giant-rats"], lords: lords.length ? lords : ids.slice(0, 1), loot, traps };
}

/** A band's size: bigger with danger and depth, and a few more or less by chance. */
export function countOf(rng: Rng, id: string, danger: number, depth: number, own?: [number, number]): number {
  const [lo, hi] = own ?? groupSize(id);
  const f = Math.min(1, Math.max(0, 0.1 + 0.25 * (danger - 1) + 0.08 * (depth - 1) + rng.float(0, 0.4)));
  return Math.max(1, Math.round(lo + (hi - lo) * f));
}

/** Who a room holds, what lies there and what guards it. Each room draws from its own stream, so a place's danger,
 * its ruler or its age never move its rooms or what they are for. */
export interface StockInput {
  rng: Rng;
  purpose: string;
  /** The room at the end of the place, where its ruler waits. */
  final: boolean;
  tables: Tables;
  danger: number;
  depth: number;
  /** Whoever rules the place, in its last room on its last level. */
  lord: LocalGroup | null;
  /** Names the leaders of bands: a stable key for the room and the place's tongue. */
  key: string;
  language: Language;
}

const CROWDED = new Set(["barracks", "guard-room", "camp", "nest", "quarters", "dwelling", "great-hall", "armory", "platform"]);
const RICH = new Set(["treasury", "lair", "tomb", "cargo-hold", "armory"]);
const HOMES = new Set(["dwelling", "quarters", "great-hall", "workshop", "garden", "shrine", "camp", "mine-face", "shop", "barracks"]);

export function stock(input: StockInput): { monsters: LocalGroup[]; treasure: LocalLoot | null; trap: string | null } {
  const { rng, purpose, final, tables, danger, depth, lord } = input;
  const own = tables.own;
  const pickWho = (strong: boolean): { who: string; n?: [number, number] } => {
    if (own?.dwellers.length && rng.chance(0.6)) return rng.pick(own.dwellers);
    return { who: rng.pick(strong ? tables.lords : tables.pool) };
  };
  const band = (who: string, n?: [number, number], extra: Partial<LocalGroup> = {}): LocalGroup => {
    const group: LocalGroup = { who, count: countOf(rng, who, danger, depth, n), ...extra };
    const lead = leaderOf(who);
    if (lead && group.count > 1 && !group.leader) group.leader = makeNpc(`${input.key}/${who}`, input.language, lead, { secretChance: 0.5 });
    return group;
  };
  const monsters: LocalGroup[] = [];
  if (final) {
    if (lord) monsters.push(lord);
    else {
      const pick = pickWho(true);
      monsters.push(band(pick.who, pick.n, { boss: true }));
    }
    // The ruler keeps a retinue, more often in a dangerous place.
    if (rng.chance(0.3 + danger * 0.15)) {
      const pick = pickWho(false);
      monsters.push(band(pick.who, pick.n));
    }
  } else if (tables.residents && HOMES.has(purpose) && rng.chance(0.85)) monsters.push(band(tables.residents));
  else if (rng.chance(0.2 + danger * 0.1 + (CROWDED.has(purpose) ? 0.4 : 0))) {
    const pick = pickWho(false);
    monsters.push(band(pick.who, pick.n));
  }
  const lootPool = own?.loot.length && rng.chance(0.6) ? own.loot : tables.loot;
  const treasure = final || RICH.has(purpose) || rng.chance(0.2) ? lootOf(rng, rng.pick(lootPool), danger, depth) : null;
  const trapPool = own?.traps.length && rng.chance(0.6) ? own.traps : tables.traps;
  const trap = purpose === "trap-room" || (purpose === "treasury" && rng.chance(0.6)) || rng.chance(0.06 * danger) ? rng.pick(trapPool) : null;
  return { monsters, treasure, trap };
}

/** A find, counted out when it is coin or the like: more in a dangerous and deep place. */
export function lootOf(rng: Rng, what: string, danger: number, depth: number): LocalLoot {
  const range = COUNTED[what];
  if (!range) return { what };
  const [lo, hi] = range;
  const amount = Math.round((lo + (hi - lo) * rng.next()) * (0.6 + 0.4 * danger) * (1 + 0.3 * (depth - 1)));
  return { what, amount: amount >= 100 ? Math.round(amount / 10) * 10 : amount };
}

/** What one meets wandering about the place: a d6 table of the common sort, in smaller bands. */
export function wanderingOf(rng: Rng, tables: Tables, danger: number, depth: number): LocalGroup[] {
  return Array.from({ length: 6 }, () => {
    const who: { who: string; n?: [number, number] } = tables.own?.dwellers.length && rng.chance(0.5) ? rng.pick(tables.own.dwellers) : { who: rng.pick(tables.pool) };
    const [lo, hi] = who.n ?? groupSize(who.who);
    return { who: who.who, count: Math.max(1, Math.round(lo + (hi - lo) * rng.float(0, 0.5) * (0.6 + 0.2 * danger + 0.1 * (depth - 1)))) };
  });
}

/** Purposes a theme's rooms are drawn from (besides its way in, its ruler's room and its own special rooms). */
export const PURPOSES: Record<LocalTheme, Purpose[]> = {
  crypt: ["ossuary", "shrine", "trap-room", "storage", "prison", "library", "ossuary"],
  temple: ["shrine", "library", "treasury", "barracks", "trap-room", "quarters"],
  mine: ["workshop", "storage", "barracks", "flooded", "mine-face", "trap-room"],
  sewer: ["flooded", "storage", "barracks", "trap-room", "prison", "camp"],
  bunker: ["barracks", "armory", "storage", "server-room", "medbay", "prison", "quarters"],
  factory: ["workshop", "storage", "workshop", "flooded", "trap-room", "barracks", "engine-room"],
  metro: ["camp", "storage", "flooded", "nest", "workshop", "trap-room"],
  lab: ["laboratory", "server-room", "medbay", "storage", "prison", "trap-room", "laboratory"],
  mall: ["shop", "shop", "storage", "camp", "nest", "shop", "barracks"],
  vault: ["dwelling", "dwelling", "storage", "workshop", "server-room", "medbay", "garden"],
  starship: ["quarters", "cargo-hold", "medbay", "armory", "laboratory", "storage", "prison"],
  derelict: ["quarters", "cargo-hold", "medbay", "armory", "laboratory", "storage", "flooded"],
  lair: ["nest", "spring", "storage", "trap-room", "shrine"],
  hold: ["dwelling", "workshop", "storage", "shrine", "spring", "great-hall", "garden"],
  forest: [],
  taiga: [],
  swamp: [],
  desert: [],
  mountain: [],
  coast: [],
  wasteland: [],
  jungle: [],
  steppe: [],
  tundra: [],
  seabed: [],
};
