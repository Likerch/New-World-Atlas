// Ways down from the space maps into the other kinds of map: every point of interest of a galaxy's star as a local map
// of its own kind (the same map whether it is opened from the galaxy or from the system), a station as a building in
// the system's age, a colony as a habitat city, a ringworld's face and a rogue planet as planets, and the game master's
// own things as whatever map they were given. From the universe: a galaxy with what its node there holds, a crystal
// sphere's system, a plane of existence as a world, a strange thing as a map of its own.
import { ERA_BUILDINGS, type BuildingParams, type BuildingType } from "../building/plan";
import type { CityParams } from "../city/model";
import type { Language } from "../language";
import type { LocalParams } from "../local/local";
import type { LocalLink } from "../local/links";
import type { PlanetParams } from "../planet/model";
import type { CustomKind, KindOpening } from "./custom";
import type { Galaxy, GalaxyOrigin, GalaxyParams, GalaxyShape, SpaceFeature } from "./galaxy";
import { eraOfTech, spaceAge, type SpaceAge } from "./profile";
import { bodyOf, worldSetting, type Site, type SiteKind, type StarSystem, type SystemParams } from "./system";
import { shapeOf, type PlaneKind, type Universe } from "./universe";

/** Each point of interest as a local map: its kind, its theme, how dangerous. The first six are as they always were. */
const FEATURE_LOCAL: Record<SpaceFeature, Pick<LocalParams, "kind" | "theme"> & { danger?: number }> = {
  derelict: { kind: "dungeon", theme: "derelict" },
  ruins: { kind: "dungeon", theme: "temple" },
  station: { kind: "dungeon", theme: "bunker" },
  "pirate-base": { kind: "dungeon", theme: "bunker" },
  research: { kind: "dungeon", theme: "bunker" },
  quarantine: { kind: "dungeon", theme: "bunker", danger: 3 },
  anomaly: { kind: "dungeon", theme: "lab", danger: 3 },
  relay: { kind: "dungeon", theme: "bunker" },
  shipyard: { kind: "dungeon", theme: "factory" },
  wormhole: { kind: "dungeon", theme: "lab", danger: 3 },
  "dyson-sphere": { kind: "dungeon", theme: "factory" },
  ringworld: { kind: "wilderness", theme: "forest" },
  "jump-gate": { kind: "dungeon", theme: "factory" },
  graveyard: { kind: "dungeon", theme: "derelict", danger: 3 },
  leviathan: { kind: "cave", theme: "lair", danger: 3 },
  "time-rift": { kind: "dungeon", theme: "derelict", danger: 3 },
  "rogue-planet": { kind: "cave", theme: "lair" },
  vault: { kind: "dungeon", theme: "vault", danger: 3 },
  "trade-hub": { kind: "dungeon", theme: "mall", danger: 1 },
  mining: { kind: "cave", theme: "mine" },
  prison: { kind: "dungeon", theme: "bunker", danger: 3 },
  beacon: { kind: "dungeon", theme: "starship" },
};

/** The place a site is: its feature's own local map, for the sites that are a star's point of interest. */
const SITE_FEATURE: Partial<Record<SiteKind, SpaceFeature>> = {
  derelict: "derelict",
  ruins: "ruins",
  station: "station",
  "pirate-den": "pirate-base",
  "research-station": "research",
  cordon: "quarantine",
  anomaly: "anomaly",
  relay: "relay",
  shipyard: "shipyard",
  wormhole: "wormhole",
  "dyson-shell": "dyson-sphere",
  gate: "jump-gate",
  graveyard: "graveyard",
  leviathan: "leviathan",
  "time-rift": "time-rift",
  vault: "vault",
  "trade-station": "trade-hub",
  "mining-camp": "mining",
  prison: "prison",
  beacon: "beacon",
};

/** A star's point of interest as a local map. Out among the stars even a ruin is haunted by machines and strange life,
 * not goblins. */
export function siteOfStar(galaxy: Galaxy, starId: number): LocalLink | null {
  const star = galaxy.stars[starId];
  if (!star?.feature) return null;
  const local = FEATURE_LOCAL[star.feature];
  return { params: { seed: `${galaxy.params.seed}/star-${starId}/site`, kind: local.kind, theme: local.theme, danger: local.danger ?? 2, age: localAge(galaxy.age), name: star.name }, language: star.empire ? galaxy.empires[star.empire].language : null };
}

/** The age a local map out in space lives in: the far future, or the world's own when the stars follow another age. */
const localAge = (age: SpaceAge) => (age.fantasy || age.era === "post-apocalypse" ? age.era : "far-future");

/** A stable seed for a site, whatever else the system holds. */
export function siteKey(system: StarSystem, site: Site): string {
  if (site.main) return `${system.seed}/site`;
  if (site.custom) return `${system.seed}/custom-${site.custom}-${system.sites.filter((s) => s.custom === site.custom).indexOf(site)}`;
  return `${system.seed}/${site.kind}-${site.body ?? "free"}${site.moon !== undefined ? `-${site.moon}` : ""}`;
}

/** A site of a system as a local map, when it is one (a wreck, a den, a ruin, a vault…). */
export function localOfSite(system: StarSystem, site: Site): LocalLink | null {
  const feature = SITE_FEATURE[site.kind];
  if (!feature || (buildingType(site.kind) && !site.main)) return null;
  const local = FEATURE_LOCAL[feature];
  return { params: { seed: siteKey(system, site), kind: local.kind, theme: local.theme, danger: local.danger ?? 2, age: localAge(system.age), name: site.main ? system.name : site.name }, language: system.language };
}

/** An asteroid belt as a local map: tunnels and caverns of a worked rock. */
export function localOfBelt(system: StarSystem, bodyId: number): LocalLink | null {
  const body = bodyOf(system, bodyId);
  if (!body || body.kind !== "belt") return null;
  return { params: { seed: `${system.seed}/body-${bodyId}/belt`, kind: "cave", theme: "mine", danger: 2, age: localAge(system.age), name: body.name }, language: system.language };
}

/** The building type a station is, if it is one. */
function buildingType(kind: SiteKind): BuildingType | null {
  return kind === "highport" || kind === "station" || kind === "habitat" || kind === "military-base" ? "hab" : kind === "research-station" ? "lab" : kind === "trade-station" ? "store" : null;
}

/** A station as a building of the system's age: a habitat, a laboratory, a market. */
export function buildingOfSite(system: StarSystem, site: Site): Partial<BuildingParams> | null {
  const wanted = buildingType(site.kind);
  if (!wanted) return null;
  const era = system.age.fantasy ? system.age.era : eraOfTech(Math.max(system.profile.tech, 12), system.age);
  const type = ERA_BUILDINGS[era].includes(wanted) ? wanted : ERA_BUILDINGS[era][0];
  return { seed: siteKey(system, site), type, era, name: site.name, floors: site.kind === "highport" ? 4 : 2 };
}

/** A settled world or moon as its chief city: a habitat under domes where the air will not do, in its technology's age. */
export function cityOfBody(system: StarSystem, bodyId: number, moon?: number): { params: Partial<CityParams>; language: Language | null } | null {
  const body = bodyOf(system, bodyId);
  if (!body) return null;
  const people = moon !== undefined ? body.moons[moon]?.population ?? 0 : body.population;
  if (!people || body.natives) return null;
  const living = moon !== undefined ? !!body.moons[moon]?.habitable : body.habitable;
  const main = system.profile.body === bodyId && system.profile.moon === moon;
  const era = system.age.fantasy ? system.age.era : eraOfTech(main ? system.profile.tech : Math.max(0, system.profile.tech - 1), system.age);
  // The chief city holds a share of its world: most of a small colony, a sliver of a crowded world.
  const thousands = Math.round(Math.min(3000, Math.max(0.5, people * 1000 * (people < 1 ? 0.8 : people < 100 ? 0.25 : 0.02))) * 10) / 10;
  return {
    params: { seed: `${system.seed}/body-${bodyId}${moon !== undefined ? `/moon-${moon}` : ""}/city`, name: moon !== undefined ? `${body.name} ${body.moons[moon].name}` : body.name, population: thousands, era, coast: living && body.water > 0.3 ? 0.4 : null, river: living ? 1.2 : null, walls: !living, citadel: main, port: true, temple: true, market: true, shanty: !living },
    language: system.language,
  };
}

/** A site that is a world of its own: the face of a ringworld (a band of land under a sun that never sets) or a
 * rogue planet passing in the dark. */
export function planetOfSite(system: StarSystem, site: Site): Partial<PlanetParams> | null {
  if (site.kind === "ringworld")
    return { seed: `${system.seed}/ringworld`, name: site.name, template: "continents", latitudeNorth: 8, latitudeSouth: -8, temperatureEquator: 24, temperaturePole: 18, precipitation: 1.1, cultures: 14, states: 18, setting: worldSetting(system, Math.max(system.profile.tech, 12), 1e5) };
  if (site.kind === "rogue-planet") return { seed: `${system.seed}/rogue`, name: site.name, template: "pangea", lifeless: true, temperatureEquator: -190, temperaturePole: -220, precipitation: 0.1, latitudeNorth: 75, latitudeSouth: -75 };
  return null;
}

/** What a game master's thing opens into, as a local map, a building or a lone system's seed. */
export function openingOf(kind: CustomKind, seed: string, name: string, age: SpaceAge, language: Language | null): { local?: LocalLink; building?: Partial<BuildingParams>; system?: { seed: string }; planet?: Partial<PlanetParams> } | null {
  const opens: KindOpening = kind.opens ?? "none";
  const at = `${seed}/custom-${kind.id}`;
  const local = (params: Pick<LocalParams, "kind" | "theme">, danger = 2) => ({ local: { params: { seed: at, ...params, danger, age: localAge(age), name }, language } });
  switch (opens) {
    case "derelict":
      return local({ kind: "dungeon", theme: "derelict" });
    case "ruins":
      return local({ kind: "dungeon", theme: "temple" });
    case "cave":
      return local({ kind: "cave", theme: "lair" }, 3);
    case "lab":
      return local({ kind: "dungeon", theme: "lab" });
    case "wilds":
      return local({ kind: "wilderness", theme: "forest" });
    case "station": {
      const era = age.fantasy ? age.era : "far-future";
      return { building: { seed: at, type: ERA_BUILDINGS[era].includes("hab") ? "hab" : ERA_BUILDINGS[era][0], era, name } };
    }
    case "system":
      return { system: { seed: at } };
    case "planet":
      return { planet: { seed: at, name } };
    default:
      return null;
  }
}

/** A galaxy of the universe as its galaxy map: its name, shape, stars and peoples, the strange things near it, a gate
 * to another galaxy and the far power that holds it. */
export function galaxyOfNode(universe: Universe, id: number): Partial<GalaxyParams> {
  const node = universe.galaxies[id];
  const power = node.power !== undefined ? universe.powers[node.power] : undefined;
  const gate = (universe.gates ?? []).find(([a, b]) => a === id || b === id);
  const origin: GalaxyOrigin = {
    ...(node.touched?.length ? { touched: node.touched } : {}),
    ...(gate ? { gate: universe.galaxies[gate[0] === id ? gate[1] : gate[0]].name } : {}),
    ...(power ? { power: { name: power.name, form: power.form, color: power.color } } : {}),
  };
  return { seed: `${universe.params.seed}/galaxy-${id}`, shape: shapeOf(node.kind), stars: node.stars, name: node.name, empires: Math.max(node.civilisations, power ? 1 : 0), anomalies: universe.params.anomalies, ...(Object.keys(origin).length ? { origin } : {}) };
}

/** A crystal sphere of the phlogiston as the star system inside it. */
export function systemOfSphere(universe: Universe, id: number): Partial<SystemParams> {
  const node = universe.galaxies[id];
  return { seed: `${universe.params.seed}/sphere-${id}`, name: node.name, settled: node.civilisations > 0, natives: node.civilisations === 0 && node.stars > 700 };
}

/** What each plane of existence is like as a world. */
const PLANE_WORLD: Record<PlaneKind, Partial<PlanetParams>> = {
  material: {},
  ethereal: { template: "continents", temperatureEquator: 14, temperaturePole: 4, lifeless: true },
  astral: { template: "archipelago", temperatureEquator: 10, temperaturePole: 0, lifeless: true },
  fire: { template: "pangea", temperatureEquator: 62, temperaturePole: 34, precipitation: 0.1, cultures: 4, states: 4 },
  water: { template: "archipelago", temperatureEquator: 20, temperaturePole: 4, precipitation: 2, cultures: 5, states: 5 },
  air: { template: "archipelago", temperatureEquator: 16, temperaturePole: -6, precipitation: 1.4, peakHeight: 3000, cultures: 4, states: 4 },
  earth: { template: "pangea", temperatureEquator: 22, temperaturePole: 2, precipitation: 0.4, peakHeight: 20000, cultures: 5, states: 6 },
  positive: { template: "continents", temperatureEquator: 40, temperaturePole: 30, lifeless: true },
  negative: { template: "pangea", temperatureEquator: -60, temperaturePole: -80, precipitation: 0.1, lifeless: true },
  heaven: { template: "continents", temperatureEquator: 22, temperaturePole: 14, precipitation: 1.2, cultures: 6, states: 7 },
  elysium: { template: "continents", temperatureEquator: 24, temperaturePole: 16, precipitation: 1.3, cultures: 6, states: 5 },
  wilds: { template: "continents", temperatureEquator: 25, temperaturePole: 5, precipitation: 1.9, cultures: 6, states: 4 },
  chaos: { template: "archipelago", temperatureEquator: 30, temperaturePole: -20, precipitation: 1, cultures: 8, states: 10 },
  abyss: { template: "pangea", temperatureEquator: 45, temperaturePole: 20, precipitation: 0.3, cultures: 8, states: 12 },
  hell: { template: "pangea", temperatureEquator: 70, temperaturePole: 40, precipitation: 0.1, cultures: 6, states: 9 },
  order: { template: "continents", temperatureEquator: 18, temperaturePole: 8, precipitation: 0.8, cultures: 4, states: 4 },
  dream: { template: "archipelago", temperatureEquator: 20, temperaturePole: 0, precipitation: 1.2, cultures: 6, states: 6 },
  shadow: { template: "continents", temperatureEquator: 0, temperaturePole: -20, precipitation: 0.7, cultures: 4, states: 5 },
  demiplane: { template: "isthmus", temperatureEquator: 20, temperaturePole: 6, cultures: 3, states: 3 },
};

/** A plane of existence as a world of its own. */
export function planetOfPlane(universe: Universe, id: number): Partial<PlanetParams> {
  const node = universe.galaxies[id];
  return { seed: `${universe.params.seed}/plane-${id}`, name: node.name, ...PLANE_WORLD[node.plane ?? "material"] };
}

/** A strange thing of the universe as a map: a relic as a vault to walk, a wandering black hole as its system, the
 * rest as a galaxy marked by it; the game master's things as whatever they were given. */
export function openingOfAnomaly(universe: Universe, id: number): { galaxy?: Partial<GalaxyParams>; system?: Partial<SystemParams>; local?: LocalLink } | null {
  const a = universe.anomalies[id];
  if (!a) return null;
  const seed = `${universe.params.seed}/anomaly-${id}`;
  if (a.kind === "custom") {
    const kind = (universe.params.custom ?? []).find((item) => item.id === a.custom);
    if (!kind?.opens || kind.opens === "none") return null;
    if (kind.opens === "galaxy") return { galaxy: { seed, name: a.name, shape: "elliptical", stars: 500, empires: 1, anomalies: Math.max(1, universe.params.anomalies) } };
    if (kind.opens === "system") return { system: { seed, name: a.name } };
    const way = openingOf(kind, seed, a.name, spaceAge(), null);
    return way?.local ? { local: way.local } : null;
  }
  if (a.kind === "relic") return { local: { params: { seed, kind: "dungeon", theme: "vault", danger: 3, age: "far-future", name: a.name }, language: null } };
  if (a.kind === "supermassive") return { system: { seed, name: a.name, spectral: "BH", settled: false, worlds: 3 } };
  const shape: Record<string, GalaxyShape> = { "great-attractor": "elliptical", "cosmic-string": "spiral", lens: "ring", "white-hole": "clusters", "dark-flow": "barred", "bubble-wall": "clusters" };
  return { galaxy: { seed, name: a.name, shape: shape[a.kind], stars: 600, empires: 1, anomalies: 3, origin: { touched: [a.kind] } } };
}
