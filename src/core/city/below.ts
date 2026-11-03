// The ways a city leads down and out, as local maps: a hall of the underside (an ossuary, smugglers' cellars, a
// flooded cistern, a metro station, a gang's turf), the crypt under a temple or the dungeons under a castle, a hatch in
// a house's cellar down to the sewers or the metro, and the country round the town. Each keeps the town's language and
// age, and its own seed, so it is the same place every time it is opened.
import type { BuildingPlan } from "../building/plan";
import type { Language } from "../language";
import type { LocalLink } from "../local/links";
import type { LocalParams, LocalTheme } from "../local/local";
import { organicEra, type City, type Era } from "./model";
import type { HallPurpose, Tiers } from "./tiers";

/** What lies under the streets of an age, for a hatch or a shaft. */
export function belowTheme(era: Era): LocalTheme {
  if (era === "post-apocalypse") return "vault";
  if (era === "stone") return "lair";
  if (era === "ancient") return "crypt";
  return organicEra(era) ? "sewer" : "metro";
}

const HALL_THEME: Record<HallPurpose, LocalTheme> = { market: "mall", turf: "bunker", metro: "metro", flooded: "sewer", cult: "temple", ossuary: "crypt", smugglers: "sewer", squat: "sewer", cistern: "sewer", vault: "vault", bunker: "bunker" };

/** A hall of the city's underside. */
export function localFromHall(city: City, tiers: Tiers, hallId: number): LocalLink | null {
  const hall = tiers.under.halls.find((item) => item.id === hallId);
  if (!hall) return null;
  const old = organicEra(city.params.era);
  const theme = HALL_THEME[hall.purpose] === "mall" && old ? "sewer" : HALL_THEME[hall.purpose];
  return { params: { seed: `${city.params.seed}/hall-${hallId}`, kind: "dungeon", theme, danger: hall.purpose === "cult" || hall.purpose === "turf" ? 3 : 2, levels: 1 + (hallId % 2), age: city.params.era, name: hall.name }, language: city.language };
}

/** Kinds of place with something underneath: a crypt, dungeons, a vault. */
export const DESCENTS: Partial<Record<string, LocalTheme>> = { temple: "crypt", cathedral: "crypt", keep: "crypt", palace: "crypt", prison: "crypt", "mage-tower": "temple", "old-ruins": "crypt", bank: "vault", "corp-hq": "lab", "ai-core": "lab", "raider-fort": "bunker" };

/** The crypt under a temple, the dungeons under a castle, a vault under a bank — or a place of the GM's own that opens
 * into a local map. */
export function localFromPlace(city: City, landmarkId: number): LocalLink | null {
  const landmark = city.landmarks.find((item) => item.id === landmarkId);
  if (!landmark) return null;
  const custom = landmark.custom ? city.params.custom?.places.find((place) => place.id === landmark.custom) : undefined;
  const theme = custom ? (custom.opens === "local" ? (custom.target as LocalTheme) : undefined) : DESCENTS[landmark.kind];
  if (!theme) return null;
  // The machine ages' castles and temples go down into service tunnels and bunkers rather than crypts.
  const own = custom ? theme : !organicEra(city.params.era) && theme === "crypt" ? "bunker" : theme;
  const kind: LocalParams["kind"] = own === "lair" || own === "hold" ? "cave" : ["forest", "taiga", "swamp", "desert", "mountain", "coast", "wasteland"].includes(own) ? "wilderness" : "dungeon";
  return { params: { seed: `${city.params.seed}/below-${landmarkId}`, kind, theme: own, danger: landmark.kind === "old-ruins" || landmark.kind === "mage-tower" ? 3 : 2, levels: kind === "wilderness" ? 1 : landmark.kind === "palace" || landmark.kind === "cathedral" ? 2 : 1, age: city.params.era, ...(landmark.name || custom?.name ? { name: landmark.name || custom?.name } : {}) }, language: city.language };
}

/** The country round the town: woods, steppe, marsh or desert by its biome; the wasteland after the fall. */
export function localOutskirts(city: City): LocalLink {
  const biome = city.params.biome ?? "";
  const theme: LocalTheme =
    city.params.era === "post-apocalypse" ? "wasteland" : biome === "taiga" || biome === "tundra" ? "taiga" : biome === "wetland" ? "swamp" : biome.includes("desert") || biome === "savanna" ? "desert" : city.params.coast !== null && city.params.coast !== undefined ? "coast" : (city.params.relief ?? 0) > 0.6 ? "mountain" : "forest";
  return { params: { seed: `${city.params.seed}/outskirts`, kind: "wilderness", theme, danger: 1, levels: 1, age: city.params.era, name: city.name }, language: city.language };
}

/** The hatch in a house's cellar: down into the sewers, the metro or the vaults. */
export function localFromHatch(plan: BuildingPlan, language: Language | null): LocalLink {
  return { params: { seed: `${plan.params.seed}/hatch`, kind: "dungeon", theme: belowTheme(plan.params.era), danger: 2, levels: 1, age: plan.params.era }, language };
}
