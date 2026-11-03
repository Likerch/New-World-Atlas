// Ways into local maps from the bigger ones: a planet's point of interest (a cave, a tomb, a mine, a bridge over a
// river, a wreck on the sea floor, a bandit camp…), any spot of a planet ("a local map here"), a city's crypts,
// cellars and undercity, a derelict or ruin in the galaxy, a cavern of the underworld with its tunnels leading off the
// map. The local map keeps the place's seed, danger, the facts of its legend and the language of the people around it.
import type { BuildingPlan } from "../building/plan";
import type { City } from "../city/model";
import type { Language } from "../language";
import type { Planet } from "../planet/model";
import type { Underworld } from "../planet/underworld";
import { hashString } from "../random";
import { ageOf, SETTINGS, settingOf, type Setting } from "../setting";
import type { Galaxy } from "../space/galaxy";
import { siteOfStar } from "../space/links";
import type { LocalExit, LocalParams, LocalTheme } from "./model";

export interface LocalLink {
  params: Partial<LocalParams>;
  language: Language | null;
}

/** A world's magic, when it is not its age's usual (high fantasy, magic in our day). */
function magicOf(setting: Setting): { magic?: number } {
  return setting.magic !== SETTINGS[ageOf(setting)].magic ? { magic: setting.magic } : {};
}

/** The wild land of a planet's cell, as a local map's theme. */
export function wildThemeAt(planet: Planet, cell: number): LocalTheme {
  if (planet.water[cell]) return "seabed";
  const biome = planet.biome[cell];
  if (planet.height[cell] > 60) return "mountain";
  if (planet.coast[cell] === 1) return "coast";
  if (ageOf(settingOf(planet.params.setting)) === "post-apocalypse" && biome !== 12) return "wasteland";
  return biome === 12 ? "swamp" : biome === 1 || biome === 2 ? "desert" : biome === 9 ? "taiga" : biome === 10 || biome === 11 ? "tundra" : biome === 5 || biome === 7 ? "jungle" : biome === 3 || biome === 4 ? "steppe" : "forest";
}

/** Which planet markers open as which local map. */
export function localFromMarker(planet: Planet, markerId: number): LocalLink | null {
  const marker = planet.markers[markerId];
  if (!marker) return null;
  // The planet's own place is the same map from any close-up of it, like its towns.
  const seed = marker.origin !== undefined ? `${planet.params.world ?? planet.params.seed}/marker-${marker.origin}` : `${planet.params.seed}/marker-${markerId}`;
  const wildTheme = wildThemeAt(planet, marker.cell);
  const language = planet.cultures[planet.culture[marker.cell]]?.language ?? null;
  const danger = ["cave", "ruins", "portal", "radiation", "toxic-zone", "crash-site", "wizard-tower", "tomb"].includes(marker.kind) ? 3 : ["inn", "monastery", "bridge"].includes(marker.kind) ? 1 : 2;
  const by: Partial<Record<string, Partial<LocalParams>>> = {
    cave: { kind: "cave", theme: "lair" },
    mine: { kind: "cave", theme: "mine" },
    ruins: { kind: "dungeon", theme: "crypt" },
    monastery: { kind: "dungeon", theme: "temple" },
    portal: { kind: "dungeon", theme: "temple" },
    brigands: { kind: "wilderness", theme: wildTheme === "seabed" ? "coast" : wildTheme },
    "sacred-grove": { kind: "wilderness", theme: wildTheme },
    "giant-tree": { kind: "wilderness", theme: wildTheme },
    battlefield: { kind: "wilderness", theme: wildTheme },
    volcano: { kind: "wilderness", theme: "mountain" },
    "hot-spring": { kind: "wilderness", theme: "mountain" },
    megalith: { kind: "wilderness", theme: wildTheme },
    "hunting-ground": { kind: "wilderness", theme: wildTheme },
    "ley-nexus": { kind: "wilderness", theme: wildTheme },
    biodome: { kind: "wilderness", theme: "forest" },
    // A bridge is the river it crosses; a wreck lies on the sea floor.
    bridge: { kind: "wilderness", theme: wildTheme === "seabed" ? "coast" : wildTheme, river: typeof marker.facts.river === "string" ? marker.facts.river : "" },
    shipwreck: { kind: "wilderness", theme: "seabed" },
    tomb: { kind: "dungeon", theme: "crypt" },
    oracle: { kind: "dungeon", theme: "temple" },
    "wizard-tower": { kind: "dungeon", theme: "temple" },
    factory: { kind: "dungeon", theme: "factory" },
    dam: { kind: "dungeon", theme: "factory" },
    "power-plant": { kind: "dungeon", theme: "factory" },
    terraformer: { kind: "dungeon", theme: "factory" },
    base: { kind: "dungeon", theme: "bunker" },
    "data-haven": { kind: "dungeon", theme: "lab" },
    airport: { kind: "dungeon", theme: "mall" },
    arcology: { kind: "dungeon", theme: "mall" },
    spaceport: { kind: "dungeon", theme: "starship" },
    "space-elevator": { kind: "dungeon", theme: "starship" },
    "crash-site": { kind: "dungeon", theme: "derelict" },
    bunker: { kind: "dungeon", theme: "vault" },
    "oil-field": { kind: "wilderness", theme: "wasteland" },
    "toxic-zone": { kind: "wilderness", theme: "wasteland" },
    crater: { kind: "wilderness", theme: "wasteland" },
    radiation: { kind: "wilderness", theme: "wasteland" },
  };
  const params = by[marker.kind];
  if (!params) return null;
  const dweller = typeof marker.facts.dweller === "string" ? marker.facts.dweller.replace(/ /gu, "-") : undefined;
  // A cave goes as deep as its legend says; other built places one to three levels; whoever rules waits on the last.
  const depth = Number(marker.facts.depth);
  const levels = params.kind === "wilderness" ? 1 : marker.kind === "cave" && depth > 0 ? Math.min(9, depth) : 1 + (hashString(seed) % 3);
  const setting = settingOf(planet.params.setting);
  return { params: { seed, danger, ...params, levels, age: ageOf(setting), ...magicOf(setting), origin: { kind: marker.kind, facts: { ...marker.facts } }, ...(marker.name ? { name: marker.name } : {}), ...(dweller ? { boss: dweller } : {}) }, language };
}

/** A local map of any spot of a planet: its wild land, the river through it, the sea floor under water. A town's
 * spot opens as its city instead. */
export function localAt(planet: Planet, cell: number): LocalLink | null {
  if (cell < 0 || cell >= planet.mesh.cells || planet.burg[cell]) return null;
  const setting = settingOf(planet.params.setting);
  const river = planet.river[cell] ? planet.rivers[planet.river[cell]] : null;
  const near = planet.mesh.neighbors[cell].some((next) => planet.burg[next]);
  return {
    params: { seed: `${planet.params.seed}/cell-${cell}`, kind: "wilderness", theme: wildThemeAt(planet, cell), danger: near ? 1 : 2, age: ageOf(setting), ...magicOf(setting), ...(river && !planet.water[cell] ? { river: river.name } : {}) },
    language: planet.cultures[planet.culture[cell]]?.language ?? null,
  };
}

/** The ways down from a city: the undercity (sewers in old towns, the metro later, a bunker after the fall), a vault's
 * door, the crypt under a temple, a keep's dungeon, the tunnels under a station, a tower's labs. */
export function localFromLandmark(city: City, landmarkId: number): LocalLink | null {
  const landmark = city.landmarks.find((item) => item.id === landmarkId);
  if (!landmark) return null;
  const era = city.params.era;
  const future = ["modern", "cyberpunk", "far-future", "post-apocalypse"].includes(era);
  const by: Partial<Record<string, LocalTheme>> = {
    undercity: !future ? "sewer" : era === "post-apocalypse" ? "bunker" : "metro",
    "vault-door": "vault",
    temple: "crypt",
    keep: future ? "bunker" : "crypt",
    station: future ? "metro" : "sewer",
    "corp-hq": "lab",
    police: "bunker",
    hospital: "lab",
    "gang-hq": future ? "metro" : "sewer",
    factory: "factory",
  };
  const theme = by[landmark.kind];
  if (!theme) return null;
  const danger = landmark.kind === "undercity" || landmark.kind === "vault-door" || landmark.kind === "gang-hq" ? 3 : 2;
  return { params: { seed: `${city.params.seed}/landmark-${landmarkId}`, kind: "dungeon", theme, danger, age: era, origin: { kind: `landmark:${landmark.kind}`, facts: {} }, ...(landmark.name ? { name: landmark.name } : {}) }, language: city.language };
}

/** A star's point of interest as a local map: the galaxy's own map of it (see siteOfStar), with where it came from. */
export function localFromStar(galaxy: Galaxy, starId: number): LocalLink | null {
  const link = siteOfStar(galaxy, starId);
  return link && { ...link, params: { ...link.params, origin: { kind: `star:${galaxy.stars[starId].feature}`, facts: {} } } };
}

/** A cavern's way off the map toward a neighbour, by the compass. */
function compass(dx: number, dy: number): number {
  return (Math.round(Math.atan2(dx, -dy) / (Math.PI / 4)) + 8) % 8;
}

/** A cavern of the underworld as a local map: a deep people's hold, a cave of its kind (a lake in an underground sea,
 * lava in a magma chamber, a chasm through an abyss, mushrooms, crystals), or the age's built places; its tunnels leave
 * the map toward the caverns they lead to. */
export function localFromCavern(world: Underworld, cavernId: number, age?: string): LocalLink | null {
  const cavern = world.caverns[cavernId];
  if (!cavern) return null;
  const built: Partial<Record<string, LocalTheme>> = { metro: "metro", undercity: "metro", bunker: "bunker", vault: "vault", ruins: "crypt", catacombs: "crypt", sewers: "sewer" };
  const theme = built[cavern.kind] ?? (cavern.kind === "settlement" ? "hold" : cavern.kind === "crystal" ? "mine" : "lair");
  const danger = cavern.kind === "settlement" ? 1 : ["magma", "abyss", "ruins"].includes(cavern.kind) ? 3 : 2;
  const people = cavern.people ? world.peoples[cavern.people - 1] : null;
  const exits: LocalExit[] = world.tunnels
    .filter(([a, b]) => a === cavernId || b === cavernId)
    .map(([a, b, kind]) => {
      const other = world.caverns[a === cavernId ? b : a];
      return { dir: compass(other.x - cavern.x, other.y - cavern.y), kind, to: other.name };
    });
  // Two tunnels the same way leave by one passage.
  const ways = exits.filter((exit, k) => exits.findIndex((other) => other.dir === exit.dir) === k);
  const facts: Record<string, string | number> = { ...(people ? { people: people.name } : {}), ...(cavern.population ? { population: cavern.population } : {}) };
  return { params: { seed: `${world.seed}/cavern-${cavernId}`, kind: built[cavern.kind] ? "dungeon" : "cave", theme, danger, name: cavern.name, levels: 1, ...(age ? { age } : {}), origin: { kind: cavern.kind, facts }, ...(ways.length && !built[cavern.kind] ? { exits: ways } : {}) }, language: people?.language ?? null };
}

/** The way down from a building's cellar: a crypt under a temple, a castle's or a manor's dungeon, a hatch into the
 * sewers or the metro in a town of later ages, smugglers' tunnels under an old inn, a vault under a bunker. */
export function localFromCellar(plan: BuildingPlan, language: Language | null = null): LocalLink | null {
  const { params } = plan;
  if (!params.cellar) return null;
  const era = params.era;
  const late = ["industrial", "modern", "cyberpunk", "far-future"].includes(era);
  const theme: LocalTheme =
    params.type === "bunker" ? "vault" : era === "post-apocalypse" ? "bunker" : ["temple", "keep", "manor"].includes(params.type) ? "crypt" : params.type === "station" || (late && era !== "industrial") ? "metro" : late || era === "renaissance" ? "sewer" : "lair";
  return { params: { seed: `${params.seed}/cellar`, kind: theme === "lair" ? "cave" : "dungeon", theme, danger: 2, age: era, origin: { kind: `cellar:${params.type}`, facts: {} }, ...(params.name ? { name: params.name } : {}) }, language };
}
