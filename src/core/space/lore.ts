// People, rumours and hooks of the space maps, from the shared generators of people: who governs a world and who
// runs its port, who keeps a station, a den or a prison; the factions of a settled system; three rumours about a star
// (one of them false); and a couple of hooks to start a session with. A star tells the same on the galaxy map and in
// its system: both read the same profile, the same tongue and the same keys.
import { createLanguage, type Language } from "../language";
import { crowdOf, makeFactions, rumoursOf, type Faction, type Hearsay, type Npc, type Role, type Rumour } from "../people";
import { createRng } from "../random";
import type { EraId } from "../setting";
import type { Galaxy, SpaceFeature } from "./galaxy";
import type { StarContext, TradeCode, WorldProfile, WorldTag } from "./profile";
import type { GalaxySurvey } from "./survey";
import { inEllipse, type Site, type SiteKind, type StarSystem } from "./system";
import { siteKey } from "./links";
import type { Universe } from "./universe";

/** The tongue a star's people speak: its power's, a free world's own, or one for whoever happens to be there. */
export function tongueOf(seed: string, power: Language | null, settled: boolean): Language {
  if (power) return { ...power };
  return createLanguage(createRng(seed).fork(settled ? "free-tongue" : "people-tongue"));
}

/** Who is found at a point of interest. */
const FEATURE_ROLES: Record<SpaceFeature, Role[]> = {
  station: ["captain", "merchant"],
  "pirate-base": ["boss", "mercenary", "pilot"],
  prison: ["warden", "prisoner"],
  research: ["scholar", "engineer"],
  quarantine: ["doctor", "guard"],
  "trade-hub": ["merchant", "fixer"],
  mining: ["miner", "boss"],
  shipyard: ["engineer", "captain"],
  ruins: ["scholar", "scavenger"],
  vault: ["scholar", "scavenger"],
  derelict: ["scavenger", "pilot"],
  graveyard: ["scavenger", "pilot"],
  relay: ["engineer", "hermit"],
  beacon: ["engineer", "hermit"],
  anomaly: ["scholar", "cultist"],
  "time-rift": ["scholar", "cultist"],
  wormhole: ["pilot", "scholar"],
  "dyson-sphere": ["engineer", "priest"],
  ringworld: ["engineer", "priest"],
  "jump-gate": ["guard", "pilot"],
  leviathan: ["hunter", "cultist"],
  "rogue-planet": ["hermit", "scavenger"],
};
const TAG_ROLES: Partial<Record<WorldTag, Role>> = { pirates: "boss", zealots: "priest", rebels: "captain", megacorps: "boss", "tech-cultists": "cultist", smugglers: "fixer", "police-state": "guard", warlords: "mercenary", "civil-war": "captain", "decadent-elite": "noble", psionics: "mage", refugees: "healer", nomads: "pilot", "gold-rush": "miner", "rogue-ai": "android", "military-outpost": "captain", "prison-planet": "warden", freeport: "merchant" };
/** Who keeps each kind of station or place in a system. */
const SITE_ROLES: Partial<Record<SiteKind, Role[]>> = {
  highport: ["steward", "captain", "merchant"],
  station: ["captain", "engineer"],
  "military-base": ["captain", "guard"],
  "trade-station": ["merchant", "fixer"],
  "research-station": ["scholar", "doctor"],
  habitat: ["elder", "engineer"],
  shipyard: ["engineer", "captain"],
  "mining-camp": ["boss", "miner"],
  "pirate-den": ["boss", "pilot", "mercenary"],
  prison: ["warden", "prisoner", "guard"],
  cordon: ["captain", "doctor"],
  gate: ["guard", "engineer"],
  relay: ["engineer"],
  ringworld: ["priest", "farmer"],
};

/** What a star's goods are worth elsewhere: by its trade codes. */
const GOODS: Partial<Record<TradeCode, string>> = { Ag: "food", In: "machines", Ht: "tech", Ri: "luxuries", As: "ore", De: "spice", Wa: "biologics", Ic: "ice", Ga: "wine", Po: "salvage", Fl: "chemicals", Na: "machines" };

export interface Lore {
  people: Npc[];
  rumours: Rumour[];
  hooks: Hearsay[];
}

export interface LoreInput {
  /** The star system's seed: everything about it is keyed by it. */
  key: string;
  place: string;
  profile: WorldProfile;
  context: StarContext;
  language: Language;
  era: EraId;
  /** The power holding it, by name, and a power it borders and quarrels with. */
  power?: string;
  enemy?: string;
  /** Names of stars nearby (along the lanes), for the lies and for where goods go. */
  near: string[];
  /** Other powers by name, for a lie about a war. */
  rivals?: string[];
  /** A trade hub or a capital nearby, where its goods sell. */
  market?: string;
  /** Where its gate or wormhole leads, by name. */
  leads?: string;
  /** A region of trouble it lies in, by name. */
  zone?: { name: string; kind: string };
}

/** A star's people, rumours and hooks. */
export function loreOf(input: LoreInput): Lore {
  const { key, place, profile, context, language, era } = input;
  const roles: Role[] = [];
  if (profile.population && !(profile.natives && !context.settled)) roles.push(context.power ? (context.capital ? "noble" : "steward") : "ruler");
  if (context.feature) roles.push(...FEATURE_ROLES[context.feature]);
  for (const tag of profile.tags) if (TAG_ROLES[tag]) roles.push(TAG_ROLES[tag]!);
  if (profile.starport !== "X" && profile.starport !== "E" && !roles.includes("merchant")) roles.push("merchant");
  const unique = [...new Set(roles)].slice(0, 4);
  const people = unique.length ? crowdOf(`${key}/lore`, language, unique, unique.length, era) : [];

  const others = input.near.filter((name) => name !== place);
  const other = (salt: string) => (others.length ? others[Math.floor(createRng(`${key}/${salt}`).next() * others.length)] : place);
  const truths: Hearsay[] = [];
  const lies: Hearsay[] = [];
  const wrongTag = (tag: WorldTag) => {
    const pool: WorldTag[] = ["pirates", "sealed-menace", "civil-war", "gold-rush", "ancient-ruins", "rogue-ai", "doomed-world", "quarantined"];
    return pool[(pool.indexOf(tag) + 1 + Math.floor(createRng(`${key}/lie-tag`).next() * (pool.length - 1))) % pool.length];
  };
  if (context.feature) {
    truths.push({ key: `rumour.feature.${context.feature}`, vars: { place } });
    lies.push({ key: `rumour.feature.${context.feature}`, vars: { place: other("feature") } });
  }
  for (const tag of profile.tags) {
    truths.push({ key: "rumour.space.tag", vars: { place, what: `@tag.${tag}.rumour` } });
    lies.push({ key: "rumour.space.tag", vars: { place, what: `@tag.${wrongTag(tag)}.rumour` } });
  }
  const secretive = people.find((npc) => npc.secret);
  if (secretive) {
    truths.push({ key: "rumour.person", vars: { name: secretive.name, secret: `@secret.${secretive.secret}` } });
    const innocent = people.find((npc) => !npc.secret);
    if (innocent) lies.push({ key: "rumour.person", vars: { name: innocent.name, secret: `@secret.${secretive.secret}` } });
  }
  const goods = profile.trade.map((code) => GOODS[code]).find(Boolean);
  if (goods && input.market && input.market !== place) {
    truths.push({ key: "rumour.space.trade", vars: { goods: `@goods.${goods}`, place, market: input.market } });
    lies.push({ key: "rumour.space.trade", vars: { goods: `@goods.${goods === "ore" ? "tech" : "ore"}`, place, market: input.market } });
  }
  if (input.enemy && input.power) truths.push({ key: "rumour.space.war", vars: { a: input.power, b: input.enemy, place } });
  else if (input.power && input.rivals?.length) lies.push({ key: "rumour.space.war", vars: { a: input.power, b: input.rivals[Math.floor(createRng(`${key}/lie-war`).next() * input.rivals.length)], place } });
  if (profile.natives) truths.push({ key: "rumour.space.natives", vars: { place } });
  if (input.leads) {
    truths.push({ key: "rumour.space.leads", vars: { place, to: input.leads } });
    lies.push({ key: "rumour.space.leads", vars: { place, to: other("leads") } });
  }
  if (input.zone) truths.push({ key: "rumour.space.zone", vars: { place, zone: input.zone.name, kind: `@zone.${input.zone.kind}` } });
  if (!profile.population && !context.feature) lies.push({ key: "rumour.space.hidden", vars: { place } });
  // Nothing true to tell, nothing told: a lie alone is no rumour mill.
  const rumours = truths.length ? rumoursOf(`${key}/space`, truths, lies) : [];
  return { people, rumours, hooks: hooksOf(key, place, profile, context, people, input) };
}

/** Hooks: what someone here would pay strangers to do. */
function hooksOf(key: string, place: string, profile: WorldProfile, context: StarContext, people: Npc[], input: LoreInput): Hearsay[] {
  if (!people.length) return [];
  const rng = createRng(`${key}/hooks`);
  const weights = new Map<string, number>();
  const add = (hook: string, weight: number) => weights.set(hook, (weights.get(hook) ?? 0) + weight);
  const f = context.feature;
  const tags = profile.tags;
  if (f === "derelict" || f === "graveyard") add("salvage", 5);
  if (f === "prison" || f === "quarantine" || tags.includes("civil-war") || tags.includes("police-state")) add("rescue", 4);
  if (f === "pirate-base" || tags.includes("pirates") || tags.includes("warlords")) (add("hunt", 4), add("escort", 3));
  if (profile.law >= 8 || tags.includes("smugglers")) add("smuggle", 3);
  if (["ruins", "vault", "anomaly", "time-rift", "rogue-planet", "wormhole", "leviathan"].includes(f ?? "") || tags.includes("ancient-ruins")) add("explore", 5);
  if (f === "quarantine" || tags.includes("refugees") || tags.includes("doomed-world")) add("deliver", 3);
  if (input.enemy || tags.includes("cold-war")) add("negotiate", 3);
  if (f === "relay" || f === "beacon" || tags.includes("out-of-contact")) add("investigate", 4);
  if (profile.natives) add("protect", 4);
  if (f === "shipyard" || tags.includes("great-work")) add("sabotage", 3);
  if (f === "mining" || tags.includes("gold-rush")) add("claim", 4);
  add("escort", 0.5);
  add("smuggle", 0.3);
  add("rescue", 0.2);
  const hooks: Hearsay[] = [];
  for (let k = 0; k < 2 && weights.size; k++) {
    const hook = rng.weighted([...weights.entries()]);
    weights.delete(hook);
    const patron = people[k % people.length];
    hooks.push({ key: `hook.${hook}`, vars: { patron: patron.name, role: `@role.${patron.role}`, place, a: input.power ?? place, b: input.enemy ?? input.near[0] ?? place } });
  }
  return hooks;
}

/** A galaxy star's lore, from the galaxy and its survey. */
export function starLore(galaxy: Galaxy, survey: GalaxySurvey, starId: number): Lore {
  const star = galaxy.stars[starId];
  const key = `${galaxy.params.seed}/star-${starId}`;
  const profile = survey.worlds[starId];
  return loreOf({ ...galaxyLoreInput(galaxy, survey, starId), key, place: star.name, profile, language: tongueOf(key, star.empire ? galaxy.empires[star.empire].language : null, star.settled), era: galaxy.age.era, context: { spectral: star.spectral, power: star.empire, form: star.empire ? galaxy.empires[star.empire].form : null, capital: star.capital, settled: star.settled, independent: !!star.independent, natives: !!star.natives, feature: star.feature, hops: survey.hops[starId], zones: [], border: false } });
}

/** What a galaxy says about a star for its lore: its power and that power's enemy, its neighbours, its market, where
 * its gate leads and the region round it. */
export function galaxyLoreInput(galaxy: Galaxy, survey: GalaxySurvey | null, starId: number): Pick<LoreInput, "power" | "enemy" | "near" | "rivals" | "market" | "leads" | "zone"> {
  const star = galaxy.stars[starId];
  const near = galaxy.lanes.filter(([a, b]) => a === starId || b === starId).map(([a, b]) => (a === starId ? b : a));
  const power = star.empire ? galaxy.empires[star.empire] : null;
  const info = survey && power ? survey.powers[power.id] : null;
  const enemyId = info ? near.map((id) => galaxy.stars[id].empire).find((id) => id && id !== star.empire && ["war", "rival", "cold"].includes(info.relations[id] ?? "")) : undefined;
  const market = galaxy.stars
    .filter((other) => other.id !== starId && (other.feature === "trade-hub" || other.capital))
    .reduce<{ name: string; d: number } | null>((best, other) => {
      const d = Math.hypot(other.x - star.x, other.y - star.y);
      return !best || d < best.d ? { name: other.name, d } : best;
    }, null);
  const gate = (galaxy.gates ?? []).find(([a, b]) => a === starId || b === starId) ?? galaxy.wormholes.find(([a, b]) => a === starId || b === starId);
  const zone = (galaxy.zones ?? []).find((z) => z.kind !== "custom" && inEllipse(z, star.x, star.y));
  return {
    ...(power ? { power: power.name } : {}),
    ...(enemyId ? { enemy: galaxy.empires[enemyId].name } : {}),
    near: near.map((id) => galaxy.stars[id].name),
    rivals: galaxy.empires.slice(1).filter((empire) => empire.id !== star.empire).map((empire) => empire.name),
    ...(market ? { market: market.name } : {}),
    ...(star.farGate ? { leads: star.farGate } : gate ? { leads: galaxy.stars[gate[0] === starId ? gate[1] : gate[0]].name } : {}),
    ...(zone ? { zone: { name: zone.name, kind: zone.kind } } : {}),
  };
}

/** A system's lore: its star's people and rumours (the same as the galaxy map tells), and its factions. */
export function systemLore(system: StarSystem, galaxy: Galaxy | null, survey: GalaxySurvey | null): Lore & { factions: Faction[] } {
  const language = tongueOf(system.seed, system.language, system.settled);
  const input = galaxy && system.star !== null ? galaxyLoreInput(galaxy, survey, system.star) : { near: system.bodies.filter((b) => !b.removed).map((b) => b.name), ...(system.empire ? { power: system.empire } : {}) };
  const lore = loreOf({ ...input, key: system.seed, place: system.name, profile: system.profile, context: system.context, language, era: system.age.era });
  const pop = system.profile.population;
  const count = pop >= 9 ? 4 : pop >= 6 ? 3 : pop >= 3 ? 2 : pop >= 1 ? 1 : 0;
  return { ...lore, factions: count ? makeFactions(`${system.seed}/factions`, language, count, system.age.era) : [] };
}

/** Who keeps a station or a place of a system. */
export function siteLore(system: StarSystem, site: Site): Npc[] {
  const roles = SITE_ROLES[site.kind];
  if (!roles || (!site.crew && site.kind !== "relay")) return [];
  return crowdOf(`${siteKey(system, site)}/keepers`, tongueOf(system.seed, system.language, true), roles, roles.length, system.age.era);
}

/** Who governs a settled world of a system (its main world's governor is the system's). */
export function worldLore(system: StarSystem, bodyId: number): Npc[] {
  const body = system.bodies.find((b) => b.id === bodyId);
  if (!body?.population) return [];
  const language = body.natives && system.nativeTongue ? system.nativeTongue : tongueOf(system.seed, system.language, true);
  const roles: Role[] = body.natives ? ["elder", "shaman", "hunter"] : [system.context.power ? "steward" : "ruler", body.population > 1000 ? "noble" : "merchant"];
  return crowdOf(`${system.seed}/world-${bodyId}`, language, roles, roles.length, body.natives ? "ancient" : system.age.era);
}

/** Hooks at the scale of the universe: expeditions, signals, silent gates, refugees, fleets on the filaments, relics
 * waking, pilgrims, galaxies gone quiet — two for a galaxy, a strange thing, a void or a supercluster. */
export function cosmicHooks(universe: Universe, target: { kind: "galaxy" | "anomaly" | "void" | "cluster"; id: number }): Hearsay[] {
  const rng = createRng(`${universe.params.seed}/${target.kind}-${target.id}/hooks`);
  const g = universe.galaxies;
  const at =
    target.kind === "galaxy" ? g[target.id] : target.kind === "anomaly" ? universe.anomalies[target.id] : target.kind === "void" ? universe.voids[target.id] : g.find((node) => node.cluster === target.id);
  if (!at) return [];
  const place = target.kind === "cluster" ? universe.clusters[target.id]?.name ?? "" : at.name;
  const nearest = g.filter((node) => !(target.kind === "galaxy" && node.id === target.id)).sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
  const other = nearest[rng.int(0, Math.min(4, nearest.length - 1))]?.name ?? place;
  const holder = nearest.find((node) => node.power !== undefined);
  const power = target.kind === "galaxy" && g[target.id].power !== undefined ? universe.powers[g[target.id].power!] : holder ? universe.powers[holder.power!] : undefined;
  const weights = new Map<string, number>([["expedition", 1], ["signal", 1]]);
  const add = (hook: string, weight: number) => weights.set(hook, (weights.get(hook) ?? 0) + weight);
  if (target.kind === "galaxy") {
    const node = g[target.id];
    if (universe.gates.some(([a, b]) => a === node.id || b === node.id)) add("gate", 4);
    if (node.power !== undefined) add("war", 3);
    if (node.civilisations) add("refugees", 2);
    if (node.touched?.length) (add("relic", 2), add("vanished", 2));
    if (node.kind === "ghost") add("vanished", 4);
  } else if (target.kind === "anomaly") (add("relic", 3), add("signal", 3), add("vanished", 2));
  else if (target.kind === "void") (add("pilgrims", 4), add("expedition", 2));
  else (add("war", power ? 2 : 0), add("refugees", 1.5), add("pilgrims", 1));
  if (power) add("war", 0.5);
  const hooks: Hearsay[] = [];
  for (let k = 0; k < 2 && weights.size; k++) {
    const hook = rng.weighted([...weights.entries()]);
    weights.delete(hook);
    // A sky of magic words some hooks its own way ("hook.u.war@spheres"); the plain words stand in for the rest.
    const sky = universe.params.cosmology && universe.params.cosmology !== "web" ? `@${universe.params.cosmology}` : "";
    hooks.push({ key: `hook.u.${hook}${sky}`, vars: { place, other, power: power?.name ?? other } });
  }
  return hooks;
}
