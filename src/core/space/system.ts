// Star systems: the star's light sets a habitable zone and a frost line; orbits widen outwards; rocky worlds form
// inside the frost line (scorched, barren, desert, terran or ocean by warmth and water), giants beyond it. Moons,
// rings, asteroid belts and stations; settled worlds when a power holds the star. A world can be opened as a planet.
import { createLanguage, name, type Language } from "../language";
import type { PlanetParams } from "../planet/model";
import { createRng, randomSeed } from "../random";
import { SPECTRA, type Galaxy, type SpectralClass, type Star } from "./galaxy";

export type BodyKind = "lava" | "barren" | "desert" | "terran" | "ocean" | "jungle" | "tundra" | "ice" | "gas-giant" | "ice-giant" | "belt";
export type Atmosphere = "none" | "thin" | "breathable" | "toxic" | "thick";

export interface Moon {
  name: string;
  kind: BodyKind;
  radius: number;
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
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV"];

export function generateSystem(galaxy: Galaxy, starId: number): StarSystem {
  const star = galaxy.stars[starId];
  const empire = galaxy.empires[star.empire];
  // A copy, so names already given elsewhere do not change what this system is called on the next visit.
  return buildSystem(`${galaxy.params.seed}/star-${starId}`, star, empire?.name ?? "", star.empire ? { ...empire.language } : null);
}

export interface SystemParams {
  seed: string;
  /** The star's class; none picks one, mostly sunlike. */
  spectral?: SpectralClass;
  /** Whether people live there; none decides by chance. */
  settled?: boolean;
}

/** A star system of its own, not cut from a galaxy: for a game that starts at one star. */
export function generateLoneSystem(input: Partial<SystemParams> = {}): StarSystem {
  const seed = input.seed || randomSeed();
  const rng = createRng(seed).fork("lone-star");
  const language = createLanguage(rng.fork("tongue"));
  const spectral = input.spectral ?? rng.weighted<SpectralClass>([["G", 5], ["K", 5], ["F", 3], ["M", 4], ["A", 1], ["B", 0.4], ["WD", 0.4], ["NS", 0.2], ["BH", 0.1]]);
  const settled = input.settled ?? rng.chance(0.6);
  const star: Star = { id: 0, x: 0, y: 0, name: name(language, rng, "plain"), spectral, empire: 0, capital: settled, settled, feature: null };
  return buildSystem(seed, star, settled ? name(language, rng, "land") : "", settled ? language : null);
}

function buildSystem(seed: string, star: Star, empire: string, language: Language | null): StarSystem {
  const rng = createRng(seed);
  const spectrum = SPECTRA[star.spectral];
  const luminosity = spectrum.luminosity * rng.float(0.7, 1.3);
  const zone: [number, number] = [Math.sqrt(Math.max(luminosity, 1e-4) / 1.1), Math.sqrt(Math.max(luminosity, 1e-4) / 0.53)];
  const frost = 2.7 * Math.sqrt(Math.max(luminosity, 1e-4));
  const companion = rng.chance(0.2) && star.spectral !== "BH" ? rng.pick<SpectralClass>(["K", "M", "M", "WD"]) : null;
  const count = star.spectral === "BH" || star.spectral === "NS" ? rng.int(0, 3) : star.spectral === "M" ? rng.int(1, 6) : rng.int(3, 11);
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
    const giant = kind === "gas-giant" || kind === "ice-giant";
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
      year: Math.round(365.25 * Math.sqrt(orbit ** 3 / Math.max(0.05, Math.pow(Math.max(luminosity, 1e-4), 0.25)))),
      moons,
      rings: kind === "gas-giant" ? rng.chance(0.45) : kind === "ice-giant" && rng.chance(0.3),
      population: settled ? Math.round(habitable ? rng.float(200, 9000) : rng.float(0.5, 80)) : 0,
      station: (star.settled && rng.chance(0.3)) || (star.feature === "station" && k === 0),
      habitable,
    });
    orbit *= rng.float(1.45, 2.1);
  }
  return { seed, name: star.name, spectral: star.spectral, luminosity, companion, zone, frost, bodies, empire, settled: star.settled, language };
}

/** Planet-generator settings for a world of a system: its climate, its water and its peoples. */
export function planetFromBody(system: StarSystem, bodyId: number): Partial<PlanetParams> & { name: string } {
  const body = system.bodies[bodyId];
  const celsius = body.temperature - 273;
  const template = body.kind === "ocean" ? "archipelago" : body.kind === "desert" ? "pangea" : body.kind === "jungle" ? "isthmus" : body.water < 0.35 ? "pangea" : "continents";
  return {
    seed: `${system.seed}/body-${bodyId}`,
    name: body.name,
    template,
    latitudeNorth: 75,
    latitudeSouth: -75,
    temperatureEquator: Math.round(celsius + 14),
    temperaturePole: Math.round(celsius - 40),
    precipitation: Math.round((0.25 + body.water * 1.8) * 10) / 10,
    cultures: body.population ? Math.max(3, Math.min(20, Math.round(Math.log10(body.population + 1) * 4))) : 3,
    states: body.population ? Math.max(3, Math.min(30, Math.round(Math.log10(body.population + 1) * 5))) : 3,
  };
}
