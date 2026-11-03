// World profiles in the manner of Traveller's UWP and the tags of Stars Without Number: for a star's main world, its
// starport, size, air, water, people, government, law and technology as one code ("A788899-C"), the trade codes that
// follow from them, bases, a travel zone and two tags to hang a story on. The physical part is read off the system's
// real worlds; the rest comes from who holds the star, how far it lies from the capital, what is there and the age.
// Also the space age itself: what the world's setting means among the stars.
import { createRng, type Rng } from "../random";
import { ageOf, isClassic, settingOf, SETTINGS, type EraId, type Setting } from "../setting";
import type { EmpireForm, SpaceFeature, SpectralClass, ZoneKind } from "./galaxy";
import type { Body } from "./system";

/** What the world's setting means among the stars. */
export interface SpaceAge {
  /** The setting the stars follow: the world's own, or the far future when the world never chose an age. */
  setting: Setting;
  /** Technology (0–15, as in Traveller) of a starfaring power's core worlds. */
  tech: number;
  /** The age whose words and people the stars use. */
  era: EraId;
  /** Ships sail on magic between crystal spheres. */
  fantasy: boolean;
}

export function spaceAge(input?: Partial<Setting> | null): SpaceAge {
  const chosen = settingOf(input);
  // The classic medieval world is the generator's default, not a choice: its stars live in the far future.
  const setting = isClassic(chosen) ? SETTINGS["far-future"] : chosen;
  return { setting, tech: Math.max(1, Math.round(setting.tech * 1.3)), era: ageOf(setting), fantasy: setting.magic >= 2 && setting.tech < 6.25 };
}

/** The era a world of this technology lives in, when it opens as a planet or a city. */
export function eraOfTech(tech: number, age: SpaceAge): EraId {
  if (age.setting.decline >= 0.5 && tech >= 6) return "post-apocalypse";
  return tech >= 12 ? "far-future" : tech >= 10 ? "cyberpunk" : tech >= 8 ? "modern" : tech >= 6 ? "industrial" : tech >= 5 ? "renaissance" : tech >= 3 ? "medieval" : tech >= 1 ? "ancient" : "stone";
}

export type Starport = "A" | "B" | "C" | "D" | "E" | "X";
export type TradeCode = "Ag" | "As" | "Ba" | "De" | "Fl" | "Ga" | "Hi" | "Ht" | "Ic" | "In" | "Lo" | "Lt" | "Na" | "Ni" | "Po" | "Ri" | "Va" | "Wa";
export type TravelZone = "green" | "amber" | "red";
export type Base = "naval" | "scout" | "pirate" | "research";
export const WORLD_TAGS = [
  "ancient-ruins",
  "civil-war",
  "cold-war",
  "pirates",
  "zealots",
  "police-state",
  "rebels",
  "gold-rush",
  "hostile-biosphere",
  "tomb-world",
  "quarantined",
  "xenophobes",
  "xenophiles",
  "regional-hegemon",
  "seagoing-cities",
  "bubble-cities",
  "megacorps",
  "feral-world",
  "tech-cultists",
  "psionics",
  "sealed-menace",
  "refugees",
  "prison-planet",
  "warlords",
  "nomads",
  "rogue-ai",
  "pilgrimage-site",
  "battleground",
  "local-specialty",
  "great-work",
  "doomed-world",
  "decadent-elite",
  "terraform-failure",
  "out-of-contact",
  "primitive-natives",
  "radioactive",
  "abandoned-colony",
  "freeport",
  "military-outpost",
  "smugglers",
] as const;
export type WorldTag = (typeof WORLD_TAGS)[number];

/** What a star's place among the stars says about its main world. */
export interface StarContext {
  spectral: SpectralClass;
  /** The power holding it (0 none), its form and whether this is its capital. */
  power: number;
  form: EmpireForm | null;
  capital: boolean;
  settled: boolean;
  independent: boolean;
  natives: boolean;
  feature: SpaceFeature | null;
  /** Jumps to its power's capital along the lanes; 99 when it has none. */
  hops: number;
  /** Regions of trouble it lies in. */
  zones: ZoneKind[];
  /** A lane leads to another power's star. */
  border: boolean;
}

export interface WorldProfile {
  /** The main world's body id, or null when the system has nothing solid. */
  body: number | null;
  /** A moon of the main body is the main world. */
  moon?: number;
  starport: Starport;
  /** Digits as Traveller writes them (size 0–A, air 0–F, water 0–A, people 0–C, government 0–F, law 0–C, tech 0–F). */
  size: number;
  atmosphere: number;
  hydrographics: number;
  population: number;
  government: number;
  law: number;
  tech: number;
  /** The whole profile as one code: "A788899-C". */
  code: string;
  /** How many people live in the whole system. */
  people: number;
  trade: TradeCode[];
  bases: Base[];
  zone: TravelZone;
  tags: WorldTag[];
  independent: boolean;
  /** A people who never left their world lives on the main world (or elsewhere in the system). */
  natives: boolean;
}

/** A digit in Traveller's way: 0–9, then A–H, J… (no I or O). */
export const ehex = (value: number) => "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.max(0, Math.min(33, Math.round(value)))];

/** Governments as Traveller numbers them, by the form of the power holding the world: its capital's, then a colony's. */
const GOVERNMENTS: Record<EmpireForm, [number[], number[]]> = {
  empire: [[10, 11, 5], [6, 11, 5]],
  kingdom: [[11, 5, 10], [6, 5]],
  republic: [[4, 2, 8], [4, 8]],
  hegemony: [[15, 10, 3], [6, 15]],
  collective: [[2, 8, 9], [2, 8]],
  union: [[4, 8, 2], [4, 8, 7]],
  dominion: [[11, 10], [6, 11]],
  consortium: [[1, 3], [1, 6]],
  corporate: [[1], [1, 6]],
  federation: [[4, 8], [4, 2, 7]],
  theocracy: [[13, 14], [13, 6]],
  hive: [[12, 2], [6, 2]],
  technocracy: [[5, 9], [5, 8]],
  machine: [[9, 8], [9, 6]],
  "pirate-kingdom": [[10, 7], [7, 0, 10]],
  "nomad-fleet": [[2, 10], [0, 7]],
  junta: [[15, 10], [6, 15]],
  directorate: [[3, 12], [3, 6]],
};
/** How much law a government keeps, before chance. */
const LAW_OF_GOVERNMENT = [0, 3, 2, 5, 4, 5, 6, 4, 6, 8, 7, 6, 7, 9, 8, 10];

/** The world the profile describes: the most people, else the most livable, else the biggest solid world. */
export function mainWorld(bodies: Body[]): { body: Body; moon?: number } | null {
  const solid = bodies.filter((b) => !b.removed);
  const settled = [...solid].sort((a, b) => b.population - a.population)[0];
  if (settled?.population) return { body: settled };
  const moonPeople = solid.flatMap((b) => b.moons.map((m, k) => ({ body: b, moon: k, people: m.population ?? 0 }))).sort((a, b) => b.people - a.people)[0];
  if (moonPeople?.people) return { body: moonPeople.body, moon: moonPeople.moon };
  const living = solid.find((b) => b.habitable);
  if (living) return { body: living };
  const rocky = solid.filter((b) => b.kind !== "gas-giant" && b.kind !== "ice-giant").sort((a, b) => b.radius - a.radius)[0];
  return rocky ? { body: rocky } : null;
}

/** Air as Traveller numbers it, from what the world has. */
function airOf(body: Pick<Body, "atmosphere" | "radius" | "kind" | "temperature">, rng: Rng): number {
  if (body.kind === "belt") return 0;
  switch (body.atmosphere) {
    case "none":
      return body.radius > 0.5 ? 1 : 0;
    case "thin":
      return ["terran", "ocean", "jungle", "tundra"].includes(body.kind) ? rng.pick([4, 5, 5]) : rng.pick([2, 3]);
    case "breathable":
      return rng.weighted([[6, 6], [7, 2], [8, 2]]);
    case "toxic":
      return body.temperature > 400 ? 11 : rng.pick([10, 10, 12]);
    case "thick":
      return body.temperature > 380 ? 11 : rng.pick([13, 10]);
  }
}

/** The trade codes that follow from a profile, as Traveller gives them. */
export function tradeCodes(p: Pick<WorldProfile, "size" | "atmosphere" | "hydrographics" | "population" | "government" | "law" | "tech">): TradeCode[] {
  const { size: s, atmosphere: a, hydrographics: h, population: pop, government: g, law: l, tech } = p;
  const codes: [TradeCode, boolean][] = [
    ["Ag", a >= 4 && a <= 9 && h >= 4 && h <= 8 && pop >= 5 && pop <= 7],
    ["As", s === 0 && a === 0 && h === 0],
    ["Ba", pop === 0 && g === 0 && l === 0],
    ["De", a >= 2 && h === 0],
    ["Fl", a >= 10 && h >= 1],
    ["Ga", s >= 6 && s <= 8 && [5, 6, 8].includes(a) && h >= 5 && h <= 7],
    ["Hi", pop >= 9],
    ["Ht", tech >= 12],
    ["Ic", a <= 1 && h >= 1],
    ["In", [0, 1, 2, 4, 7, 9, 10, 11, 12].includes(a) && pop >= 9],
    ["Lo", pop >= 1 && pop <= 3],
    ["Lt", pop >= 1 && tech <= 5],
    ["Na", a <= 3 && h <= 3 && pop >= 6],
    ["Ni", pop >= 4 && pop <= 6],
    ["Po", a >= 2 && a <= 5 && h <= 3],
    ["Ri", [6, 8].includes(a) && pop >= 6 && pop <= 8 && g >= 4 && g <= 9],
    ["Va", a === 0],
    ["Wa", ((a >= 3 && a <= 9) || a >= 13) && h >= 10],
  ];
  return codes.filter(([, holds]) => holds).map(([code]) => code);
}

/** How many people the system holds: its worlds, moons and stations. */
export function headcount(bodies: Body[], crews: number[] = []): number {
  let people = 0;
  for (const b of bodies) {
    if (b.removed) continue;
    people += b.population * 1e6;
    for (const m of b.moons) people += (m.population ?? 0) * 1e6;
  }
  return Math.round(people + crews.reduce((sum, crew) => sum + crew, 0));
}

/** A star's main world, profiled. `seed` is the system's, so a star keeps its profile whatever happens elsewhere. */
export function profileWorld(seed: string, context: StarContext, bodies: Body[], crews: number[], age: SpaceAge): WorldProfile {
  const rng = createRng(seed).fork("profile");
  const main = mainWorld(bodies);
  const body = main?.body ?? null;
  const moon = main?.moon !== undefined && body ? body.moons[main.moon] : null;
  const people = headcount(bodies, crews);
  const population = people >= 1 ? Math.min(12, Math.floor(Math.log10(people))) : 0;
  const decline = age.setting.decline;
  const natives = context.natives || bodies.some((b) => b.natives);
  // The natives' world is out of bounds when it is the main world and nobody else lives there.
  const interdicted = !!body?.natives && !context.settled;
  const radius = moon ? moon.radius : (body?.radius ?? 0);
  const size = !body ? 0 : body.kind === "belt" ? 0 : Math.max(1, Math.min(10, Math.round(radius * 8)));
  const atmosphere = !body ? 0 : moon ? (moon.habitable ? 6 : radius > 0.4 ? 1 : 0) : airOf(body, rng);
  const hydrographics = !body ? 0 : moon ? (moon.habitable ? rng.int(4, 8) : moon.kind === "ice" ? rng.int(1, 4) : 0) : Math.max(0, Math.min(10, Math.round(body.water * 10)));

  // Who governs: the power's way for its capital and its colonies, chance for a free world, nobody on an empty one.
  let government = 0;
  if (population > 0 && !interdicted) {
    if (context.power && context.form) {
      const [home, colony] = GOVERNMENTS[context.form];
      government = rng.pick(context.capital ? home : colony);
    } else government = Math.max(0, Math.min(15, rng.int(2, 12) - 7 + population));
  }
  const law = population > 0 && !interdicted ? Math.max(0, Math.min(12, LAW_OF_GOVERNMENT[government] + rng.int(-2, 2))) : 0;

  // The port: by people, the capital and trade; a fallen age wears ports down; the natives' world has none.
  const crew = crews.reduce((sum, c) => sum + c, 0);
  const score = population + (context.capital ? 4 : 0) + (context.feature === "trade-hub" || context.feature === "shipyard" ? 3 : 0) + (context.independent ? -1 : 0) + rng.int(-1, 1) - Math.round(decline * 3);
  const starport: Starport = interdicted ? "X" : population === 0 && crew === 0 ? "X" : score >= 11 ? "A" : score >= 9 ? "B" : score >= 7 ? "C" : score >= 5 ? "D" : score >= 3 ? "E" : crew ? "E" : "X";

  // Technology: the age's, more at the capital, less out on the frontier, on a free world or after the fall.
  let tech: number;
  if (interdicted) tech = rng.int(0, Math.min(4, age.tech - 4));
  else if (population === 0) tech = crew ? Math.max(0, age.tech - 1) : 0;
  else {
    tech = age.tech + (context.capital ? 2 : 0) - Math.min(3, Math.floor((context.power ? context.hops : 8) / 4)) + (starport === "A" ? 1 : starport === "X" ? -2 : 0) + rng.int(-1, 1);
    if (context.independent) tech -= rng.int(0, 3);
    if (!context.capital) tech -= Math.round(decline * 3);
  }
  tech = Math.max(0, Math.min(15, tech));
  const trade = tradeCodes({ size, atmosphere, hydrographics, population, government, law, tech });

  const bases: Base[] = [];
  if (!interdicted && population) {
    if (context.capital || context.feature === "shipyard" || (context.border && rng.chance(0.35))) bases.push("naval");
    if (["research", "relay", "beacon"].includes(context.feature ?? "") || (context.hops >= 4 && rng.chance(0.2))) bases.push("scout");
  }
  if (context.feature === "pirate-base" || (context.independent && rng.chance(0.2))) bases.push("pirate");
  if (["research", "vault", "anomaly", "time-rift"].includes(context.feature ?? "")) bases.push("research");

  const tags = pickTags(context, { population, atmosphere, government, law, tech, people, natives, interdicted, hostile: !!body && !body.habitable && population > 0, decline, magic: age.setting.magic, ocean: hydrographics >= 9 }, rng);
  const zone = zoneOf(context, tags, law, interdicted);
  const code = `${starport}${ehex(size)}${ehex(atmosphere)}${ehex(hydrographics)}${ehex(population)}${ehex(government)}${ehex(law)}-${ehex(tech)}`;
  return { body: body?.id ?? null, ...(main?.moon !== undefined ? { moon: main.moon } : {}), starport, size, atmosphere, hydrographics, population, government, law, tech, code, people, trade, bases, zone, tags, independent: context.independent, natives };
}

/** A code for any world of a system, the main world's own or a lesser one's: a secondary port by its people (F good,
 * G poor, H basic, Y none), its own size, air, water and people, the system's government and law where people live,
 * technology a step behind the main world's. */
export function bodyCode(profile: WorldProfile, body: Body, seed: string): { code: string; trade: TradeCode[] } {
  if (profile.body === body.id && profile.moon === undefined) return { code: profile.code, trade: profile.trade };
  const rng = createRng(`${seed}/body-${body.id}`).fork("code");
  const people = body.population * 1e6;
  const population = people >= 1 ? Math.min(12, Math.floor(Math.log10(people))) : 0;
  const size = body.kind === "belt" ? 0 : body.kind === "gas-giant" || body.kind === "ice-giant" ? 15 : Math.max(1, Math.min(10, Math.round(body.radius * 8)));
  const atmosphere = body.kind === "gas-giant" || body.kind === "ice-giant" ? 15 : airOf(body, rng);
  const hydrographics = Math.max(0, Math.min(10, Math.round(body.water * 10)));
  const lived = population > 0 && !body.natives;
  const government = lived ? profile.government : 0;
  const law = lived ? profile.law : 0;
  const tech = lived ? Math.max(0, profile.tech - 1) : body.natives ? Math.min(profile.tech, 3) : 0;
  const port = !lived ? "Y" : population >= 6 ? "F" : population >= 4 ? "G" : "H";
  const digits = { size, atmosphere, hydrographics, population, government, law, tech };
  return { code: `${port}${ehex(size)}${ehex(atmosphere)}${ehex(hydrographics)}${ehex(population)}${ehex(government)}${ehex(law)}-${ehex(tech)}`, trade: tradeCodes(digits) };
}

/** Red: interdicted, sealed or deadly; amber: dangerous, lawless or harsh. */
function zoneOf(context: StarContext, tags: WorldTag[], law: number, interdicted: boolean): TravelZone {
  const red = interdicted || context.feature === "quarantine" || context.feature === "time-rift" || context.zones.some((z) => z === "dead-zone" || z === "plasma-sea") || tags.some((tag) => tag === "sealed-menace" || tag === "doomed-world" || tag === "quarantined");
  if (red) return "red";
  const amber = ["pirate-base", "prison", "leviathan", "graveyard"].includes(context.feature ?? "") || context.zones.some((z) => z === "ion-storm" || z === "gravity-rift" || z === "radiation-belt") || law >= 10 || tags.some((tag) => ["civil-war", "warlords", "pirates", "hostile-biosphere", "radioactive", "feral-world", "rogue-ai", "battleground"].includes(tag));
  return amber ? "amber" : "green";
}

/** Two tags for a world, weighted by what it is: one for an empty system with something to it, none for nothing. */
function pickTags(context: StarContext, world: { population: number; atmosphere: number; government: number; law: number; tech: number; people: number; natives: boolean; interdicted: boolean; hostile: boolean; decline: number; magic: number; ocean: boolean }, rng: Rng): WorldTag[] {
  const weights = new Map<WorldTag, number>();
  const add = (tag: WorldTag, weight: number) => weights.set(tag, (weights.get(tag) ?? 0) + weight);
  const lived = world.population > 0 && !world.interdicted;
  const feature = context.feature;
  if (feature === "ruins" || feature === "vault") (add("ancient-ruins", 6), add("sealed-menace", 1.5));
  if (feature === "pirate-base") (add("pirates", 6), add("smugglers", 2));
  if (feature === "prison") add("prison-planet", 8);
  if (feature === "quarantine") (add("quarantined", 6), add("sealed-menace", 2));
  if (feature === "trade-hub") (add("freeport", 4), add("local-specialty", 2), add("megacorps", 1));
  if (feature === "mining") (add("gold-rush", 5), add("rebels", 1));
  if (feature === "shipyard" || feature === "dyson-sphere" || feature === "ringworld") add("great-work", 5);
  if (feature === "research" || feature === "anomaly") (add("sealed-menace", 2), add("tech-cultists", 1.5));
  if (feature === "graveyard") (add("battleground", 4), add("tomb-world", 1));
  if (feature === "time-rift" || feature === "wormhole") add("out-of-contact", 3);
  if (feature === "derelict") (add("tomb-world", 1.5), add("smugglers", 1));
  if (feature === "leviathan") add("hostile-biosphere", 2);
  if (world.natives) add("primitive-natives", world.interdicted ? 10 : 4);
  if (context.zones.includes("radiation-belt")) add("radioactive", 4);
  if (context.zones.includes("dark-nebula")) (add("smugglers", 2), add("pirates", 1));
  if (!lived) {
    if (!weights.size) return [];
    if (!context.settled && world.people === 0) add("tomb-world", 0.5);
    return [rng.weighted([...weights.entries()])];
  }
  add("local-specialty", 1);
  add("xenophobes", 0.6);
  add("xenophiles", 0.6);
  add("decadent-elite", 0.4);
  add("rebels", 0.5);
  add("smugglers", 0.5);
  if (context.capital) (add("regional-hegemon", 4), add("decadent-elite", 2), add("police-state", 1));
  if (context.border) (add("cold-war", 2.5), add("battleground", 1.5), add("military-outpost", 2), add("refugees", 0.8));
  if (context.independent) (add("freeport", 2), add("warlords", 1.5), add("smugglers", 1.5), add("nomads", 1));
  if (context.form === "theocracy") (add("zealots", 4), add("pilgrimage-site", 2));
  if (context.form === "hegemony" || context.form === "junta" || world.law >= 9) add("police-state", 3);
  if (context.form === "consortium" || context.form === "corporate" || context.form === "directorate") add("megacorps", 4);
  if (context.form === "machine" || world.tech >= 14) add("rogue-ai", 1.5);
  if (context.form === "nomad-fleet") add("nomads", 4);
  if (context.form === "pirate-kingdom") add("pirates", 3);
  if (world.hostile) (add("bubble-cities", 3), add("hostile-biosphere", 1), add("terraform-failure", 1));
  if (world.ocean) add("seagoing-cities", 3);
  if (world.tech <= 6) (add("tech-cultists", 1), add("feral-world", 1));
  if (context.hops >= 6 && context.power) (add("rebels", 1.5), add("out-of-contact", 1));
  if (world.government === 7) add("civil-war", 4);
  if (world.government === 13 || world.government === 14) add("zealots", 2);
  if (world.magic >= 1) add("psionics", world.magic * 1.5);
  if (world.decline > 0) (add("abandoned-colony", world.decline * 4), add("feral-world", world.decline * 3), add("refugees", world.decline * 2), add("doomed-world", world.decline));
  const tags: WorldTag[] = [];
  for (let k = 0; k < 2 && weights.size; k++) {
    const tag = rng.weighted([...weights.entries()]);
    tags.push(tag);
    weights.delete(tag);
  }
  return tags;
}
