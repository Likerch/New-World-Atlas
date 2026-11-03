// People of a world, for the game master: who holds a place and who lives there, what they are like, what they want
// and what they hide; the factions they belong to; and rumours, three to a place and one of them false. Names come
// from the tongue of the place; everything else is a key the app words in the reader's language ("role.smith",
// "trait.greedy"; an age may have its own word, "role.smith@modern").
import { name, type Language } from "./language";
import { createRng } from "./random";
import type { EraId } from "./setting";

export type Role =
  | "ruler"
  | "heir"
  | "noble"
  | "steward"
  | "captain"
  | "guard"
  | "mercenary"
  | "priest"
  | "monk"
  | "shaman"
  | "elder"
  | "mage"
  | "scholar"
  | "healer"
  | "merchant"
  | "innkeeper"
  | "smith"
  | "guildmaster"
  | "farmer"
  | "hunter"
  | "miner"
  | "sailor"
  | "servant"
  | "bard"
  | "thief"
  | "boss"
  | "spy"
  | "cultist"
  | "hermit"
  | "warden"
  | "prisoner"
  | "engineer"
  | "pilot"
  | "hacker"
  | "fixer"
  | "scavenger"
  | "doctor"
  | "android";

export const ROLES: Role[] = ["ruler", "heir", "noble", "steward", "captain", "guard", "mercenary", "priest", "monk", "shaman", "elder", "mage", "scholar", "healer", "merchant", "innkeeper", "smith", "guildmaster", "farmer", "hunter", "miner", "sailor", "servant", "bard", "thief", "boss", "spy", "cultist", "hermit", "warden", "prisoner", "engineer", "pilot", "hacker", "fixer", "scavenger", "doctor", "android"];

export const TRAITS = ["greedy", "brave", "pious", "cruel", "kind", "proud", "paranoid", "curious", "honest", "lazy", "ambitious", "loyal", "cowardly", "cheerful", "bitter", "cunning", "reckless", "gentle", "stubborn", "vain"] as const;
export type Trait = (typeof TRAITS)[number];
export const WANTS = ["power", "wealth", "revenge", "love", "safety", "knowledge", "faith", "freedom", "fame", "escape", "justice", "family"] as const;
export type Want = (typeof WANTS)[number];
export const SECRETS = ["debt", "affair", "crime", "cult", "spy", "heir", "curse", "forgery", "smuggling", "false-name", "addiction", "murder"] as const;
export type Secret = (typeof SECRETS)[number];

/** A person of the world. Ids are stable: the same place and role give the same person on every visit. */
export interface Npc {
  id: string;
  name: string;
  role: Role;
  /** Years. */
  age: number;
  trait: Trait;
  want: Want;
  /** What they hide from the players, if anything (the GM sees it). */
  secret: Secret | null;
  /** The faction they serve, by id. */
  faction?: string;
}

/** Roles that do not exist before their age, and roles of the machine ages. */
const LATE: Partial<Record<Role, EraId[]>> = {
  engineer: ["industrial", "modern", "cyberpunk", "far-future", "post-apocalypse"],
  pilot: ["modern", "cyberpunk", "far-future", "post-apocalypse"],
  hacker: ["modern", "cyberpunk", "far-future"],
  fixer: ["cyberpunk", "far-future", "modern"],
  scavenger: ["post-apocalypse", "cyberpunk", "far-future"],
  doctor: ["industrial", "modern", "cyberpunk", "far-future", "post-apocalypse"],
  android: ["cyberpunk", "far-future"],
  mage: ["stone", "ancient", "medieval", "renaissance"],
};

/** Whether a role belongs to an age (a hacker does not, in a bronze-age town). */
export function roleFits(role: Role, age: EraId): boolean {
  const ages = LATE[role];
  return !ages || ages.includes(age);
}

/** How likely the owner of a place, a shop or a house keeps a secret: one chance, so the same owner is the same person
 * in the city's directory and in the plan of the house. */
export const OWNER_SECRET = 0.55;

/** A person: `key` names the place and the post (the same key gives the same person), `language` their names. */
export function makeNpc(key: string, language: Language, role: Role, options: { secretChance?: number; faction?: string; ageRange?: [number, number] } = {}): Npc {
  const rng = createRng(`${key}/npc`);
  const [young, old] = options.ageRange ?? (role === "heir" ? [14, 30] : role === "elder" ? [55, 85] : [18, 70]);
  return {
    id: key,
    name: `${name({ ...language }, rng, "person")} ${name({ ...language }, rng.fork("family"), "person")}`,
    role,
    age: rng.int(young, old),
    trait: rng.pick(TRAITS),
    want: rng.pick(WANTS),
    secret: rng.chance(options.secretChance ?? 0.45) ? rng.pick(SECRETS) : null,
    ...(options.faction ? { faction: options.faction } : {}),
  };
}

/** A few people of a place, each in a role drawn from those that suit it and its age. */
export function crowdOf(key: string, language: Language, roles: Role[], count: number, age: EraId): Npc[] {
  const fit = roles.filter((role) => roleFits(role, age));
  if (!fit.length) return [];
  const rng = createRng(`${key}/people`);
  return Array.from({ length: count }, (_, k) => makeNpc(`${key}/person-${k}`, language, k < fit.length ? fit[k] : rng.pick(fit)));
}

export type FactionKind = "guild" | "house" | "gang" | "cult" | "order" | "corporation" | "syndicate" | "clan" | "militia" | "council" | "rebels" | "church";

/** What kinds of faction an age has. */
export const FACTIONS_OF_AGE: Record<EraId, FactionKind[]> = {
  stone: ["clan", "council", "cult"],
  ancient: ["house", "cult", "guild", "council", "gang"],
  medieval: ["guild", "house", "gang", "order", "cult", "church", "militia"],
  renaissance: ["guild", "house", "gang", "order", "church", "council"],
  industrial: ["guild", "syndicate", "corporation", "gang", "cult", "rebels", "council"],
  modern: ["corporation", "syndicate", "gang", "cult", "council", "rebels"],
  cyberpunk: ["corporation", "gang", "syndicate", "rebels", "cult"],
  "far-future": ["corporation", "order", "syndicate", "rebels", "cult", "council"],
  "post-apocalypse": ["clan", "gang", "militia", "cult", "council"],
};

const LEADER: Record<FactionKind, Role> = { guild: "guildmaster", house: "noble", gang: "boss", cult: "cultist", order: "captain", corporation: "boss", syndicate: "boss", clan: "elder", militia: "captain", council: "elder", rebels: "captain", church: "priest" };

/** A faction of a town or a world: who leads it, what it wants, whom it fights and whom it trusts. */
export interface Faction {
  id: string;
  name: string;
  kind: FactionKind;
  leader: Npc;
  goal: Want;
  /** 1 (a handful) to 5 (runs the place). */
  strength: number;
  rivals: string[];
  allies: string[];
}

/** The factions of a place: kinds of its age, each with a leader; rivals and allies among them. */
export function makeFactions(key: string, language: Language, count: number, age: EraId): Faction[] {
  const rng = createRng(`${key}/factions`);
  const tongue = { ...language };
  const kinds = rng.shuffle([...FACTIONS_OF_AGE[age]]);
  const factions: Faction[] = Array.from({ length: count }, (_, k) => {
    const kind = kinds[k % kinds.length];
    const id = `${key}/faction-${k}`;
    return { id, name: name(tongue, rng, "plain"), kind, leader: makeNpc(`${id}/leader`, language, LEADER[kind], { faction: id }), goal: rng.pick(WANTS), strength: rng.int(1, 5), rivals: [], allies: [] };
  });
  for (let a = 0; a < factions.length; a++)
    for (let b = a + 1; b < factions.length; b++) {
      const roll = rng.next();
      if (roll < 0.35) (factions[a].rivals.push(factions[b].id), factions[b].rivals.push(factions[a].id));
      else if (roll < 0.55) (factions[a].allies.push(factions[b].id), factions[b].allies.push(factions[a].id));
    }
  return factions;
}

/** Something people say. Values that start with "@" are dictionary keys ("@monster.troll"); the rest are names. */
export interface Hearsay {
  key: string;
  vars: Record<string, string | number>;
}

export interface Rumour extends Hearsay {
  /** Whether it is so; the GM sees which one is the lie. */
  true: boolean;
}

/** Three rumours about a place: two true (if it has two truths to tell), and one false — a true one with a wrong
 * detail when a lie of the right kind is at hand, else a lie from elsewhere. */
export function rumoursOf(key: string, truths: Hearsay[], lies: Hearsay[]): Rumour[] {
  const rng = createRng(`${key}/rumours`);
  const told: Rumour[] = rng.shuffle([...truths]).slice(0, 2).map((item) => ({ ...item, true: true }));
  const twin = lies.filter((lie) => told.some((item) => item.key === lie.key));
  const lie = (twin.length ? rng.pick(twin) : lies.length ? rng.pick(lies) : null) as Hearsay | null;
  if (lie) told.push({ ...lie, true: false });
  return rng.shuffle(told);
}
