// Star systems: the star's light sets a habitable zone and a frost line; orbits widen outwards; rocky worlds form
// inside the frost line (scorched, barren, desert, terran or ocean by warmth and water), giants beyond it. Moons,
// rings, asteroid belts and stations; settled worlds when a power holds the star, a free world's people when none does,
// natives who never left their world. Then the system is furnished: what lives on each world, its gravity and day; the
// places in it — highports and stations, the star's wonder (a Dyson shell, a ringworld, a gate), pirates in the belt, a
// prison on a moon, a graveyard of ships; the game master's own things and edits; and the main world's profile. A world
// can be opened as a planet, a station as a building, a wreck as a local map.
import { createLanguage, name, type Language } from "../language";
import type { PlanetParams } from "../planet/model";
import { createRng, randomSeed, type Rng } from "../random";
import type { Setting } from "../setting";
import { cleanKind, type CustomKind } from "./custom";
import { applySystemEdits, type SystemEdits } from "./edit";
import { EMPIRE_FORMS, SPECTRA, type EmpireForm, type Galaxy, type SpaceFeature, type SpectralClass, type Star, type ZoneKind } from "./galaxy";
import { eraOfTech, profileWorld, spaceAge, type SpaceAge, type StarContext, type WorldProfile } from "./profile";

export type BodyKind = "lava" | "barren" | "desert" | "terran" | "ocean" | "jungle" | "tundra" | "ice" | "gas-giant" | "ice-giant" | "belt";
export const BODY_KINDS: BodyKind[] = ["lava", "barren", "desert", "terran", "ocean", "jungle", "tundra", "ice", "gas-giant", "ice-giant", "belt"];
export type Atmosphere = "none" | "thin" | "breathable" | "toxic" | "thick";
/** How far life has come on a world: none, its chemistry, microbes, simple life, complex life, people of its own, or
 * life brought and kept by settlers. */
export type Biosphere = "none" | "prebiotic" | "microbial" | "simple" | "complex" | "sapient" | "engineered";

export interface Moon {
  name: string;
  kind: BodyKind;
  radius: number;
  /** Distance from its world, in that world's radii. */
  orbit?: number;
  habitable?: boolean;
  /** Millions of people. */
  population?: number;
  biosphere?: Biosphere;
}

export interface Body {
  id: number;
  name: string;
  kind: BodyKind;
  /** Distance from the star, AU. */
  orbit: number;
  /** Where it is on its orbit, radians. */
  angle: number;
  /** Earth radii. */
  radius: number;
  /** Mean surface temperature, kelvin. */
  temperature: number;
  atmosphere: Atmosphere;
  /** Share of the surface under water, 0–1. */
  water: number;
  /** Year length, Earth days. */
  year: number;
  moons: Moon[];
  rings: boolean;
  /** Millions of people, 0 if unsettled. */
  population: number;
  station: boolean;
  habitable: boolean;
  /** The world a power's people came from (made home even when it lies outside the habitable zone). */
  homeworld?: boolean;
  /** People who never left it live here. */
  natives?: boolean;
  biosphere?: Biosphere;
  /** 0 (deadly) to 10 (as good as home). */
  habitability?: number;
  /** Surface gravity, g. */
  gravity?: number;
  /** Length of a day, hours; 0 for a world that always turns one face to its star. */
  day?: number;
  /** Who holds it when that is not the system's owner (the game master's edit). */
  owner?: string;
  /** Taken out by the game master (kept so ids stay put). */
  removed?: boolean;
  /** Put in by the game master. */
  added?: boolean;
}

export type SiteKind =
  | "highport"
  | "station"
  | "military-base"
  | "trade-station"
  | "research-station"
  | "habitat"
  | "shipyard"
  | "mining-camp"
  | "pirate-den"
  | "prison"
  | "dyson-shell"
  | "ringworld"
  | "gate"
  | "graveyard"
  | "derelict"
  | "ruins"
  | "vault"
  | "relay"
  | "beacon"
  | "anomaly"
  | "wormhole"
  | "leviathan"
  | "time-rift"
  | "rogue-planet"
  | "cordon"
  | "custom";

/** A place in a system: on or round a world (or one of its moons), or out on an orbit of its own. */
export interface Site {
  id: number;
  kind: SiteKind;
  name: string;
  body: number | null;
  moon?: number;
  /** Distance from the star, AU, and where on the orbit. */
  orbit: number;
  angle: number;
  /** People living or working there. */
  crew: number;
  /** The star's own wonder or point of interest (the place the galaxy map's star opens to). */
  main?: boolean;
  /** A game master's kind. */
  custom?: string;
  /** Where it leads: a star of the galaxy (a gate, a wormhole) or another galaxy by name. */
  leads?: number | string;
}

export interface StarSystem {
  seed: string;
  name: string;
  spectral: SpectralClass;
  luminosity: number;
  companion: SpectralClass | null;
  /** Habitable zone, AU. */
  zone: [number, number];
  frost: number;
  bodies: Body[];
  empire: string;
  settled: boolean;
  language: Language | null;
  /** Places in the system: stations, wonders, wrecks, dens. */
  sites: Site[];
  /** The main world, profiled. */
  profile: WorldProfile;
  /** The star's place among the stars. */
  context: StarContext;
  /** The galaxy star it was cut from; null for a lone system. */
  star: number | null;
  age: SpaceAge;
  /** The natives' own tongue. */
  nativeTongue: Language | null;
  /** The game master's own kinds of thing placed here. */
  custom: CustomKind[];
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV"];
export const isGiant = (kind: BodyKind) => kind === "gas-giant" || kind === "ice-giant";
const SOLID = (kind: BodyKind) => !isGiant(kind) && kind !== "belt";

/** The game master's settings for a system (all optional). */
export interface SystemOptions {
  edits?: SystemEdits | null;
  custom?: CustomKind[];
  /** For a galaxy's star: the jumps to its power's capital, when they are already known. */
  hops?: number;
}

/** Where a galaxy's star stands: its power, its distance from the capital, the regions round it, its borders. */
export function starContext(galaxy: Galaxy, starId: number, hops?: number): StarContext {
  const star = galaxy.stars[starId];
  const empire = galaxy.empires[star.empire];
  let jumps = hops ?? 99;
  if (hops === undefined && star.empire && empire) {
    const next = galaxy.stars.map(() => [] as number[]);
    for (const [a, b] of galaxy.lanes) (next[a].push(b), next[b].push(a));
    const seen = new Map([[empire.capital, 0]]);
    for (let queue = [empire.capital]; queue.length && !seen.has(starId); ) {
      const after: number[] = [];
      for (const at of queue) for (const to of next[at]) if (!seen.has(to)) (seen.set(to, seen.get(at)! + 1), after.push(to));
      queue = after;
    }
    jumps = seen.get(starId) ?? 99;
  }
  const zones = (galaxy.zones ?? []).filter((z) => z.kind !== "custom" && inEllipse(z, star.x, star.y)).map((z) => z.kind as ZoneKind);
  const border = galaxy.lanes.some(([a, b]) => {
    if (a !== starId && b !== starId) return false;
    const other = galaxy.stars[a === starId ? b : a];
    return other.empire !== star.empire && (star.empire > 0 || other.empire > 0);
  });
  return { spectral: star.spectral, power: star.empire, form: star.empire ? empire.form : null, capital: star.capital, settled: star.settled, independent: !!star.independent, natives: !!star.natives, feature: star.feature, hops: jumps, zones, border };
}

/** Whether a point lies inside a region's ellipse. */
export function inEllipse(zone: { x: number; y: number; r: number; angle: number; squash: number }, x: number, y: number): boolean {
  const dx = x - zone.x,
    dy = y - zone.y;
  const u = dx * Math.cos(zone.angle) + dy * Math.sin(zone.angle),
    v = -dx * Math.sin(zone.angle) + dy * Math.cos(zone.angle);
  return (u / zone.r) ** 2 + (v / (zone.r * zone.squash)) ** 2 <= 1;
}

export function generateSystem(galaxy: Galaxy, starId: number, options: SystemOptions = {}): StarSystem {
  const star = galaxy.stars[starId];
  const empire = galaxy.empires[star.empire];
  const seed = `${galaxy.params.seed}/star-${starId}`;
  // A copy, so names already given elsewhere do not change what this system is called on the next visit. A free world
  // speaks a tongue of its own.
  const language = star.empire ? { ...empire.language } : star.independent ? createLanguage(createRng(seed).fork("free-tongue")) : null;
  const bare = buildSystem(seed, star, empire?.name ?? "", language);
  // A gate or a wormhole here leads somewhere: its far end.
  const gate = (galaxy.gates ?? []).find(([a, b]) => a === starId || b === starId);
  const hole = galaxy.wormholes.find(([a, b]) => a === starId || b === starId);
  const leads = star.farGate ?? (gate ? (gate[0] === starId ? gate[1] : gate[0]) : hole ? (hole[0] === starId ? hole[1] : hole[0]) : undefined);
  return furnish(bare, star, starContext(galaxy, starId, options.hops), galaxy.age ?? spaceAge(), starId, { ...options, leads });
}

/** How a lone system is asked for. */
export interface SystemParams {
  seed: string;
  /** The star's class; none picks one, mostly sunlike. */
  spectral?: SpectralClass;
  /** Whether people live there; none decides by chance. */
  settled?: boolean;
  /** How many worlds; none lets the star decide. The first worlds stay as they were when this changes. */
  worlds?: number;
  /** A companion star or none; unset decides by chance. */
  companion?: boolean;
  /** A wonder or point of interest of the star. */
  feature?: SpaceFeature;
  /** A people who never left their world; unset decides by chance. */
  natives?: boolean;
  /** The kind of power that holds it. */
  form?: EmpireForm;
  /** The game master's own kinds of thing. */
  custom?: CustomKind[];
}

/** A star system of its own, not cut from a galaxy: for a game that starts at one star. */
export function generateLoneSystem(input: Partial<SystemParams> = {}, setting?: Partial<Setting> | null, edits?: SystemEdits | null): StarSystem {
  const seed = input.seed || randomSeed();
  const rng = createRng(seed).fork("lone-star");
  const language = createLanguage(rng.fork("tongue"));
  const spectral = input.spectral ?? rng.weighted<SpectralClass>([["G", 5], ["K", 5], ["F", 3], ["M", 4], ["A", 1], ["B", 0.4], ["WD", 0.4], ["NS", 0.2], ["BH", 0.1]]);
  const settled = input.settled ?? rng.chance(0.6);
  const extra = createRng(seed).fork("lone-extra");
  const natives = input.natives ?? (["F", "G", "K"].includes(spectral) && extra.chance(0.12));
  const form = input.form ?? extra.pick(EMPIRE_FORMS.slice(0, 9));
  const star: Star = { id: 0, x: 0, y: 0, name: name(language, rng, "plain"), spectral, empire: 0, capital: settled, settled, feature: input.feature ?? null, natives };
  const bare = buildSystem(seed, star, settled ? name(language, rng, "land") : "", settled ? language : null, { worlds: input.worlds, companion: input.companion });
  const context: StarContext = { spectral, power: settled ? 1 : 0, form: settled ? form : null, capital: settled, settled, independent: false, natives, feature: star.feature, hops: 0, zones: [], border: false };
  return furnish(bare, star, context, spaceAge(setting), null, { custom: input.custom, edits });
}

type Bare = Pick<StarSystem, "seed" | "name" | "spectral" | "luminosity" | "companion" | "zone" | "frost" | "bodies" | "empire" | "settled" | "language">;

function buildSystem(seed: string, star: Star, empire: string, language: Language | null, overrides: { worlds?: number; companion?: boolean } = {}): Bare {
  const rng = createRng(seed);
  const spectrum = SPECTRA[star.spectral];
  const luminosity = spectrum.luminosity * rng.float(0.7, 1.3);
  const zone: [number, number] = [Math.sqrt(Math.max(luminosity, 1e-4) / 1.1), Math.sqrt(Math.max(luminosity, 1e-4) / 0.53)];
  const frost = 2.7 * Math.sqrt(Math.max(luminosity, 1e-4));
  // What the star would have drawn is drawn anyway, so asking for a companion or a count keeps the rest as it was.
  let companion = rng.chance(0.2) && star.spectral !== "BH" ? rng.pick<SpectralClass>(["K", "M", "M", "WD"]) : null;
  if (overrides.companion === false) companion = null;
  else if (overrides.companion && !companion) companion = createRng(seed).fork("companion").pick<SpectralClass>(["K", "M", "M", "WD"]);
  const drawn = star.spectral === "BH" || star.spectral === "NS" ? rng.int(0, 3) : star.spectral === "M" ? rng.int(1, 6) : rng.int(3, 11);
  const count = overrides.worlds === undefined ? drawn : Math.max(0, Math.min(14, Math.round(overrides.worlds)));
  const bodies: Body[] = [];
  let orbit = Math.max(0.03, zone[0] * rng.float(0.15, 0.45));
  for (let k = 0; k < count; k++) {
    const temperature = 278 * Math.pow(Math.max(luminosity, 1e-5), 0.25) / Math.sqrt(orbit);
    const inside = orbit < frost;
    let kind: BodyKind;
    if (!inside) kind = rng.chance(orbit < frost * 3 ? 0.65 : 0.35) ? "gas-giant" : rng.chance(0.5) ? "ice-giant" : rng.chance(0.3) ? "belt" : "ice";
    else if (temperature > 600) kind = "lava";
    else if (orbit >= zone[0] && orbit <= zone[1]) kind = rng.weighted<BodyKind>([["terran", 4], ["ocean", 3], ["jungle", 2], ["desert", 3], ["tundra", 2], ["barren", 2]]);
    else if (temperature > 320) kind = rng.chance(0.6) ? "desert" : "barren";
    else if (temperature < 230) kind = rng.chance(0.5) ? "tundra" : rng.chance(0.4) ? "belt" : "barren";
    else kind = rng.pick<BodyKind>(["barren", "desert", "tundra"]);
    const giant = isGiant(kind);
    const radius = kind === "belt" ? 0 : giant ? rng.float(kind === "gas-giant" ? 6 : 3, kind === "gas-giant" ? 13 : 5) : rng.float(0.3, 1.8);
    const atmosphere: Atmosphere = giant ? "thick" : ["terran", "ocean", "jungle"].includes(kind) ? (rng.chance(0.8) ? "breathable" : "thin") : kind === "lava" || kind === "desert" ? rng.pick<Atmosphere>(["none", "toxic", "thick"]) : kind === "belt" ? "none" : rng.pick<Atmosphere>(["none", "thin", "toxic"]);
    const water = kind === "ocean" ? rng.float(0.85, 0.98) : kind === "terran" ? rng.float(0.5, 0.8) : kind === "jungle" ? rng.float(0.35, 0.6) : kind === "tundra" ? rng.float(0.2, 0.6) : kind === "desert" ? rng.float(0, 0.15) : kind === "ice" ? rng.float(0.6, 0.95) : 0;
    const greenhouse = atmosphere === "thick" ? 1.25 : atmosphere === "toxic" ? 1.15 : atmosphere === "breathable" ? 1.06 : 1;
    const habitable = ["terran", "ocean", "jungle"].includes(kind) && atmosphere === "breathable";
    const settled = star.settled && (habitable || (!giant && kind !== "belt" && rng.chance(0.25)));
    const moons: Moon[] = Array.from({ length: kind === "belt" ? 0 : giant ? rng.int(1, 6) : rng.int(0, 2) }, (_, m) => ({ name: `${ROMAN[k] ?? k + 1}-${String.fromCharCode(97 + m)}`, kind: rng.pick<BodyKind>(["barren", "ice", "barren", "lava"]), radius: rng.float(0.1, giant ? 0.5 : 0.3) }));
    bodies.push({
      id: k,
      name: settled && language ? name(language, rng, "plain") : `${star.name} ${ROMAN[k] ?? k + 1}`,
      kind,
      orbit,
      angle: rng.float(-0.6, 0.6),
      radius,
      temperature: Math.round(temperature * greenhouse),
      atmosphere,
      water,
      // Kepler: the star's mass, not its light, sets the year (a black hole is dark but heavy).
      year: Math.round(365.25 * Math.sqrt(orbit ** 3 / spectrum.mass)),
      moons,
      rings: kind === "gas-giant" ? rng.chance(0.45) : kind === "ice-giant" && rng.chance(0.3),
      population: settled ? Math.round(habitable ? rng.float(200, 9000) : rng.float(0.5, 80)) : 0,
      station: (star.settled && rng.chance(0.3)) || (star.feature === "station" && k === 0),
      habitable,
    });
    orbit *= rng.float(1.45, 2.1);
  }
  // A power's capital has a world its people came from: the rocky world nearest the middle of the habitable zone.
  if (star.capital && !bodies.some((b) => b.habitable)) {
    const home = rng.fork("homeworld");
    const world = nearestMiddle(bodies, zone);
    if (world)
      Object.assign(world, {
        kind: home.pick<BodyKind>(["terran", "terran", "ocean", "jungle"]),
        atmosphere: "breathable",
        water: home.float(0.45, 0.8),
        temperature: Math.round(home.float(278, 298)),
        habitable: true,
        homeworld: true,
        population: Math.round(home.float(2000, 9000)),
        name: language ? name(language, home, "plain") : world.name,
      });
  }
  return { seed, name: star.name, spectral: star.spectral, luminosity, companion, zone, frost, bodies, empire, settled: star.settled, language };
}

/** The rocky world nearest the middle of the habitable zone, of those that pass. */
function nearestMiddle(bodies: Body[], zone: [number, number], fits: (b: Body) => boolean = () => true): Body | null {
  const middle = (zone[0] + zone[1]) / 2;
  return bodies.filter((b) => SOLID(b.kind) && !b.removed && fits(b)).reduce<Body | null>((pick, b) => (!pick || Math.abs(Math.log(b.orbit / middle)) < Math.abs(Math.log(pick.orbit / middle)) ? b : pick), null);
}

/** Everything past the bare worlds: homeworlds and natives, the age's crowds, moons, life, edits, places, the profile.
 * Each step draws from a stream of its own, so the worlds generated before stay as they were. */
function furnish(bare: Bare, star: Star, context: StarContext, age: SpaceAge, starId: number | null, options: SystemOptions & { leads?: number | string }): StarSystem {
  const { seed, zone } = bare;
  const root = createRng(seed);
  const bodies = bare.bodies.map((b) => ({ ...b, moons: b.moons.map((m) => ({ ...m })) }));
  // At a capital with living worlds, the most crowded of them is the one its people came from.
  if (star.capital && !bodies.some((b) => b.homeworld)) {
    const home = bodies.filter((b) => b.habitable).sort((a, b) => b.population - a.population)[0];
    if (home) home.homeworld = true;
  }
  // Natives: a living world nobody settled, or the rocky world nearest the zone's middle made living for them.
  let nativeTongue: Language | null = null;
  if (context.natives) {
    const tribe = root.fork("natives");
    nativeTongue = createLanguage(tribe.fork("tongue"));
    let world = nearestMiddle(bodies, zone, (b) => b.habitable && !b.population && !b.homeworld);
    if (!world) {
      world = nearestMiddle(bodies, zone, (b) => !b.population && !b.homeworld);
      if (world) Object.assign(world, { kind: tribe.pick<BodyKind>(["terran", "jungle", "ocean", "terran"]), atmosphere: "breathable", water: tribe.float(0.4, 0.85), temperature: Math.round(tribe.float(275, 302)), habitable: true });
    }
    if (world) Object.assign(world, { natives: true, population: Math.round(tribe.float(5, 900)) });
  }
  // A settled star with nobody on its worlds has at least a colony under domes on its likeliest rock.
  if (star.settled && !bodies.some((b) => b.population && !b.natives)) {
    const colony = nearestMiddle(bodies, zone, (b) => !b.natives) ?? bodies.find((b) => b.kind === "belt");
    if (colony) colony.population = Math.round(root.fork("colony").float(0.5, 60) * 10) / 10;
  }
  // The age's crowds: fewer people after a fall, more or fewer as the setting's density says.
  const scale = age.setting.density * (1 - age.setting.decline * 0.7);
  if (scale !== 1) for (const b of bodies) if (b.population && !b.natives) b.population = Math.round(b.population * scale * 100) / 100;
  // Moons: how far out they circle, a living moon round a giant in the zone, settlers and miners on moons.
  for (const b of bodies) {
    const own = root.fork(`moons-${b.id}`);
    const giant = isGiant(b.kind);
    const largest = b.moons.reduce((best, m, k) => (m.radius > b.moons[best].radius ? k : best), 0);
    b.moons.forEach((moon, k) => {
      moon.orbit = Math.round((giant ? 4 + (k + 1) * own.float(3, 8) : 18 + (k + 1) * own.float(12, 30)) * 10) / 10;
      if (giant && k === largest && b.orbit >= zone[0] && b.orbit <= zone[1] && own.chance(0.35)) Object.assign(moon, { kind: own.pick<BodyKind>(["terran", "ocean", "jungle"]), radius: Math.max(moon.radius, own.float(0.35, 0.6)), habitable: true });
      const miners = context.feature === "mining" && giant;
      if ((bare.settled && own.chance(moon.habitable ? 0.6 : 0.1)) || (miners && own.chance(0.5))) moon.population = Math.round((moon.habitable ? own.float(5, 400) : own.float(0.01, 2)) * scale * 100) / 100;
    });
  }
  // The game master's edits lie over what was generated.
  const edited = applySystemEdits(bodies, options.edits, bare);
  for (const b of edited) describeBody(b, bare, root.fork(`body-${b.id}`), context);
  const language = bare.language ?? (edited.some((b) => b.population && !b.natives) ? createLanguage(root.fork("free-tongue")) : null);
  const sites = placeSites({ ...bare, bodies: edited, language }, star, context, root.fork("sites"), options);
  const profile = profileWorld(seed, context, edited, sites.map((s) => s.crew), age);
  // A good port has a highport over its main world, even where no station was drawn.
  if (profile.body !== null && "ABC".includes(profile.starport) && !sites.some((s) => s.kind === "highport")) {
    const main = edited.find((b) => b.id === profile.body)!;
    sites.unshift({ id: -1, kind: "highport", name: name({ ...(language ?? createLanguage(root.fork("site-tongue"))) }, root.fork("highport"), "plain"), body: main.id, orbit: main.orbit, angle: main.angle, crew: profile.starport === "A" ? 120000 : profile.starport === "B" ? 30000 : 4000 });
    sites.forEach((site, k) => (site.id = k));
  }
  const empire = options.edits?.owner !== undefined ? options.edits.owner : bare.empire;
  return { ...bare, empire, settled: bare.settled || edited.some((b) => !b.removed && !b.natives && b.population > 0), bodies: edited, sites, profile, context, star: starId, age, nativeTongue, custom: (options.custom ?? []).map(cleanKind) };
}

/** A world's life, gravity, day and how livable it is, from a stream of its own. */
function describeBody(b: Body, bare: Bare, rng: Rng, context: StarContext) {
  const giant = isGiant(b.kind);
  b.gravity = b.kind === "belt" ? 0 : Math.round((giant ? Math.pow(b.radius, 0.4) : b.radius * (b.kind === "ice" ? 0.45 : 1)) * rng.float(0.85, 1.15) * 100) / 100;
  const locked = b.orbit < 0.08 || ((bare.spectral === "M" || bare.spectral === "WD") && b.orbit < 0.4);
  b.day = b.kind === "belt" || locked ? 0 : giant ? Math.round(rng.float(9, 18) * 10) / 10 : Math.round((rng.chance(0.1) ? rng.float(100, 3000) : rng.float(10, 50)) * 10) / 10;
  const air = b.atmosphere;
  if (b.natives || (b.homeworld && context.power)) b.biosphere = "sapient";
  else if (b.habitable) b.biosphere = rng.weighted<Biosphere>([["complex", 6], ["simple", 2], ["microbial", 1]]);
  else if (b.population && SOLID(b.kind) && (air === "thin" || air === "breathable")) b.biosphere = "engineered";
  else if (["tundra", "desert", "terran", "ocean", "jungle"].includes(b.kind) && air !== "none") b.biosphere = rng.weighted<Biosphere>([["simple", 2], ["microbial", 3], ["prebiotic", 2]]);
  else if (b.kind === "ice" && b.water > 0.6) b.biosphere = rng.chance(0.3) ? "microbial" : "prebiotic";
  else if (b.kind === "gas-giant") b.biosphere = rng.chance(0.08) ? "simple" : "none";
  else b.biosphere = rng.chance(0.1) ? "prebiotic" : "none";
  const airCost = { none: 8, thin: 2, breathable: 0, toxic: 6, thick: 4 }[air];
  const score = giant || b.kind === "belt" ? 0 : 10 - Math.abs(b.temperature - 288) / 8 - airCost - (b.water < 0.1 ? 2 : b.water > 0.95 ? 1 : 0) - Math.abs((b.gravity ?? 1) - 1) * 3;
  b.habitability = Math.max(0, Math.min(10, Math.round(b.habitable ? Math.max(score, 6) : score)));
  for (const moon of b.moons) moon.biosphere = moon.habitable ? rng.weighted<Biosphere>([["complex", 3], ["simple", 2]]) : moon.kind === "ice" && rng.chance(0.15) ? "microbial" : "none";
}

/** Station kinds by what holds the system. */
function stationKind(context: StarContext, rng: Rng): SiteKind {
  if (context.feature === "research") return "research-station";
  if (context.feature === "trade-hub" || context.independent) return "trade-station";
  if (context.border && rng.chance(0.5)) return "military-base";
  return rng.weighted<SiteKind>([["station", 3], ["habitat", 2], ["trade-station", 2], ["research-station", 1], ["military-base", context.power ? 1.5 : 0.2]]);
}

/** What the star's wonder or point of interest is, as a place in the system. */
export const FEATURE_SITE: Record<SpaceFeature, SiteKind> = {
  ruins: "ruins",
  station: "station",
  anomaly: "anomaly",
  derelict: "derelict",
  "pirate-base": "pirate-den",
  relay: "relay",
  shipyard: "shipyard",
  research: "research-station",
  quarantine: "cordon",
  wormhole: "wormhole",
  "dyson-sphere": "dyson-shell",
  ringworld: "ringworld",
  "jump-gate": "gate",
  graveyard: "graveyard",
  leviathan: "leviathan",
  "time-rift": "time-rift",
  "rogue-planet": "rogue-planet",
  vault: "vault",
  "trade-hub": "trade-station",
  mining: "mining-camp",
  prison: "prison",
  beacon: "beacon",
};

/** Places in a system: stations over worlds, the star's own feature where it belongs (pirates in the belt, a prison on
 * a moon, a shell round the star, a gate at the edge), and the game master's own kinds. */
function placeSites(system: Bare, star: Star, context: StarContext, rng: Rng, options: SystemOptions & { leads?: number | string }): Site[] {
  const bodies = system.bodies.filter((b) => !b.removed);
  const tongue = { ...(system.language ?? createLanguage(rng.fork("tongue"))) };
  const sites: Site[] = [];
  const outer = Math.max(system.frost * 1.2, ...bodies.map((b) => b.orbit), 1);
  const add = (kind: SiteKind, at: { body?: Body | null; moon?: number; orbit?: number; angle?: number }, crew: number, extra: Partial<Site> = {}) => {
    const body = at.body ?? null;
    sites.push({ id: sites.length, kind, name: name(tongue, rng, "plain"), body: body?.id ?? null, ...(at.moon !== undefined ? { moon: at.moon } : {}), orbit: body ? body.orbit : (at.orbit ?? outer), angle: body ? body.angle : (at.angle ?? rng.float(-0.7, 0.7)), crew: Math.round(crew), ...extra });
  };
  for (const b of bodies) if (b.station) add(star.feature === "station" && b.id === 0 ? "station" : stationKind(context, rng), { body: b }, rng.float(200, 6000), star.feature === "station" && b.id === 0 ? { main: true } : {});
  const feature = star.feature;
  if (feature && !(feature === "station" && sites.some((s) => s.main))) {
    const kind = FEATURE_SITE[feature];
    const belt = bodies.find((b) => b.kind === "belt");
    const giants = bodies.filter((b) => isGiant(b.kind) && b.moons.length);
    const rocky = bodies.filter((b) => SOLID(b.kind));
    const main = [...bodies].sort((a, b) => b.population - a.population)[0];
    const middle = (system.zone[0] + system.zone[1]) / 2;
    const own = { main: true, ...(options.leads !== undefined ? { leads: options.leads } : {}) };
    switch (kind) {
      case "pirate-den":
        // Pirates hide in the belt; without one, among a giant's moons; else on a rock of their own far out.
        if (belt) add(kind, { body: belt }, rng.float(300, 3000), own);
        else if (giants.length) add(kind, { body: rng.pick(giants), moon: 0 }, rng.float(300, 3000), own);
        else add(kind, { orbit: outer * 1.15 }, rng.float(300, 3000), own);
        break;
      case "prison": {
        // A prison on a moon, else on the outermost rock.
        const host = giants.length ? rng.pick(giants) : rocky.find((b) => b.moons.length);
        if (host) add(kind, { body: host, moon: rng.int(0, host.moons.length - 1) }, rng.float(2000, 60000), own);
        else add(kind, { body: rocky[rocky.length - 1] ?? null, orbit: outer }, rng.float(2000, 60000), own);
        break;
      }
      case "mining-camp":
        if (belt) add(kind, { body: belt }, rng.float(500, 20000), own);
        else if (giants.length) add(kind, { body: rng.pick(giants), moon: 0 }, rng.float(500, 20000), own);
        else add(kind, { body: rocky[0] ?? null }, rng.float(500, 20000), own);
        break;
      case "dyson-shell":
        add(kind, { orbit: Math.max(0.05, middle * 0.9), angle: 0 }, 0, own);
        break;
      case "ringworld":
        add(kind, { orbit: middle, angle: 0 }, rng.float(1e11, 3e12), own);
        break;
      case "gate":
      case "wormhole":
      case "relay":
      case "beacon":
        add(kind, { orbit: outer * 1.1 }, kind === "relay" ? rng.float(10, 200) : kind === "gate" ? rng.float(100, 2000) : 0, own);
        break;
      case "shipyard":
      case "trade-station":
      case "cordon":
        add(kind, { body: main ?? null, orbit: middle }, kind === "cordon" ? rng.float(200, 2000) : rng.float(5000, 80000), own);
        break;
      case "ruins":
      case "vault": {
        const host = rocky.filter((b) => !b.population);
        if (host.length) add(kind, { body: rng.pick(host) }, 0, own);
        else if (giants.length) add(kind, { body: rng.pick(giants), moon: 0 }, 0, own);
        else add(kind, { orbit: outer * 0.6 }, 0, own);
        break;
      }
      case "research-station":
        add(kind, { orbit: Math.max(0.05, system.zone[0] * 0.5) }, rng.float(50, 800), own);
        break;
      case "rogue-planet":
        add(kind, { orbit: outer * 1.3 }, 0, own);
        break;
      default:
        // A derelict, a graveyard, an anomaly, a leviathan, a rift: out among the worlds on an orbit of their own.
        add(kind, { orbit: Math.max(0.1, rng.float(0.3, 1) * outer) }, 0, own);
    }
  }
  // The game master's kinds of thing for systems, each from a stream of its own.
  for (const kind of (options.custom ?? []).map(cleanKind)) {
    const own = createRng(system.seed).fork(`custom-${kind.id}`);
    const fits = bodies.filter((b) =>
      kind.where === "inner" ? b.orbit < system.zone[0] : kind.where === "outer" ? b.orbit > system.frost : kind.where === "habitable" ? b.orbit >= system.zone[0] && b.orbit <= system.zone[1] : kind.where === "moons" ? b.moons.length > 0 : kind.where === "belt" ? b.kind === "belt" : true,
    );
    for (let k = 0; k < kind.count; k++) {
      const body = fits.length ? own.pick(fits) : null;
      const moon = body && kind.where === "moons" ? own.int(0, body.moons.length - 1) : undefined;
      sites.push({ id: sites.length, kind: "custom", custom: kind.id, name: kind.name || name(tongue, own, "plain"), body: body?.id ?? null, ...(moon !== undefined ? { moon } : {}), orbit: body ? body.orbit : own.float(0.2, 1) * outer, angle: body ? body.angle : own.float(-0.7, 0.7), crew: 0 });
    }
  }
  return sites;
}

/** Where a system's lanes, gates and wormholes lead: each neighbour with its direction on the galaxy map and distance. */
export interface SystemExit {
  to: number;
  name: string;
  kind: "lane" | "gate" | "wormhole";
  /** Direction on the galaxy map, radians. */
  angle: number;
  /** Light years. */
  distance: number;
}

export function exitsOf(galaxy: Galaxy, starId: number): SystemExit[] {
  const from = galaxy.stars[starId];
  const out: SystemExit[] = [];
  const add = (to: number, kind: SystemExit["kind"]) => {
    const star = galaxy.stars[to];
    out.push({ to, name: star.name, kind, angle: Math.atan2(star.y - from.y, star.x - from.x), distance: Math.round(Math.hypot(star.x - from.x, star.y - from.y) * galaxy.scale) });
  };
  for (const [a, b] of galaxy.lanes) if (a === starId || b === starId) add(a === starId ? b : a, "lane");
  for (const [a, b] of galaxy.gates ?? []) if (a === starId || b === starId) add(a === starId ? b : a, "gate");
  for (const [a, b] of galaxy.wormholes) if (a === starId || b === starId) add(a === starId ? b : a, "wormhole");
  return out;
}

/** A body by id (ids stay put when the game master takes worlds out). */
export const bodyOf = (system: StarSystem, id: number): Body | undefined => system.bodies.find((b) => b.id === id && !b.removed);

/** Planet-generator settings for a world (or a moon) of a system: its climate, its water, mountains as high as its
 * gravity lets them stand, its peoples and its age — a natives' world opens in their own age, a settled world in the
 * age its technology belongs to. */
export function planetFromBody(system: StarSystem, bodyId: number, moonIndex?: number): Partial<PlanetParams> & { name: string } {
  const body = bodyOf(system, bodyId) ?? system.bodies[0];
  const moon = moonIndex !== undefined ? body.moons[moonIndex] : undefined;
  const world = moon
    ? { name: `${body.name} ${moon.name}`, kind: moon.kind, temperature: body.temperature - (moon.habitable ? 0 : 20), water: moon.habitable ? 0.6 : moon.kind === "ice" ? 0.8 : 0, population: moon.population ?? 0, habitable: !!moon.habitable, gravity: Math.max(0.05, moon.radius * 0.9), natives: false }
    : { name: body.name, kind: body.kind, temperature: body.temperature, water: body.water, population: body.population, habitable: body.habitable, gravity: body.gravity ?? Math.max(0.1, body.radius), natives: !!body.natives };
  const celsius = world.temperature - 273;
  const template = world.kind === "ocean" ? "archipelago" : world.kind === "desert" ? "pangea" : world.kind === "jungle" ? "isthmus" : world.water < 0.35 ? "pangea" : "continents";
  // A world nobody lives on (scorched, frozen or airless, and unsettled) has no peoples, towns or realms.
  const lifeless = !world.population && !world.habitable;
  const main = system.profile.body === bodyId && moonIndex === system.profile.moon;
  const tech = world.natives ? Math.min(system.profile.tech, 4) : main ? system.profile.tech : Math.max(0, system.profile.tech - 1);
  // Lighter worlds raise higher mountains.
  const peakHeight = Math.round(Math.max(3000, Math.min(24000, 8800 / Math.max(0.3, world.gravity))));
  return {
    ...(lifeless ? { lifeless: true } : {}),
    seed: moon ? `${system.seed}/body-${bodyId}/moon-${moonIndex}` : `${system.seed}/body-${bodyId}`,
    name: world.name,
    template,
    latitudeNorth: 75,
    latitudeSouth: -75,
    temperatureEquator: Math.round(celsius + 14),
    temperaturePole: Math.round(celsius - 40),
    precipitation: Math.max(0.1, Math.round((world.water < 0.05 ? 0.05 : 0.25 + world.water * 1.8) * 10) / 10),
    peakHeight,
    cultures: world.population ? Math.max(3, Math.min(20, Math.round(Math.log10(world.population + 1) * 4))) : 3,
    states: world.population ? Math.max(3, Math.min(30, Math.round(Math.log10(world.population + 1) * 5))) : 3,
    ...(lifeless ? {} : { setting: worldSetting(system, tech, world.population) }),
  };
}

const TECH_OF_ERA: Record<string, number> = { stone: 0, ancient: 2, medieval: 3, renaissance: 4, industrial: 5.5, modern: 7, cyberpunk: 8, "far-future": 9.5, "post-apocalypse": 7 };

/** The setting a settled world opens in: the age its technology belongs to, as crowded as its people make it. A world
 * of a fantasy cosmology keeps the world's own setting. */
export function worldSetting(system: Pick<StarSystem, "age">, tech: number, population: number): Partial<Setting> {
  const age = system.age;
  if (age.fantasy) return age.setting;
  const era = eraOfTech(tech, age);
  // Earth holds about 8 000 million; a thin colony is sparser, a hive world fuller.
  const density = Math.max(0.25, Math.min(4, Math.round(Math.sqrt(Math.max(1, population) / 8000) * 100) / 100));
  return { era, tech: TECH_OF_ERA[era], transport: TECH_OF_ERA[era], magic: age.setting.magic, decline: era === "post-apocalypse" ? Math.max(0.5, age.setting.decline) : age.setting.decline, density, rule: age.setting.rule };
}
