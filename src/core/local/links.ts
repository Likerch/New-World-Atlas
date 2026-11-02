// Ways into local maps from the bigger ones: a planet's point of interest (a cave, ruins, a monastery, a bandit
// camp…), a way down into a city's undercity, a derelict or ruin in the galaxy. The local map keeps the place's seed,
// danger and the language of the people around it.
import type { City } from "../city/model";
import type { Language } from "../language";
import type { Planet } from "../planet/model";
import type { Galaxy } from "../space/galaxy";
import type { LocalParams } from "./local";

export interface LocalLink {
  params: Partial<LocalParams>;
  language: Language | null;
}

/** Which planet markers open as which local map. */
export function localFromMarker(planet: Planet, markerId: number): LocalLink | null {
  const marker = planet.markers[markerId];
  if (!marker) return null;
  const seed = `${planet.params.seed}/marker-${markerId}`;
  const biome = planet.biome[marker.cell];
  const wildTheme = planet.height[marker.cell] > 60 ? "mountain" : planet.coast[marker.cell] === 1 ? "coast" : biome === 12 ? "swamp" : biome === 1 || biome === 2 ? "desert" : biome === 9 || biome === 10 || biome === 11 ? "taiga" : "forest";
  const language = planet.cultures[planet.culture[marker.cell]]?.language ?? null;
  const danger = marker.kind === "cave" || marker.kind === "ruins" || marker.kind === "portal" ? 3 : 2;
  const by: Partial<Record<string, Partial<LocalParams>>> = {
    cave: { kind: "cave", theme: "lair" },
    mine: { kind: "cave", theme: "mine" },
    ruins: { kind: "dungeon", theme: "crypt" },
    monastery: { kind: "dungeon", theme: "temple" },
    portal: { kind: "dungeon", theme: "temple" },
    brigands: { kind: "wilderness", theme: wildTheme },
    "sacred-grove": { kind: "wilderness", theme: wildTheme },
    "giant-tree": { kind: "wilderness", theme: wildTheme },
    battlefield: { kind: "wilderness", theme: wildTheme },
    volcano: { kind: "wilderness", theme: "mountain" },
    "hot-spring": { kind: "wilderness", theme: "mountain" },
  };
  const params = by[marker.kind];
  const dweller = typeof marker.facts.dweller === "string" ? marker.facts.dweller.replace(/ /gu, "-") : undefined;
  return params ? { params: { seed, danger, ...params, ...(dweller ? { boss: dweller } : {}) }, language } : null;
}

export function localFromLandmark(city: City, landmarkId: number): LocalLink | null {
  const landmark = city.landmarks.find((item) => item.id === landmarkId);
  if (!landmark || landmark.kind !== "undercity") return null;
  const future = city.params.era === "cyberpunk" || city.params.era === "modern";
  return { params: { seed: `${city.params.seed}/landmark-${landmarkId}`, kind: "dungeon", theme: future ? "bunker" : "sewer", danger: 3 }, language: city.language };
}

export function localFromStar(galaxy: Galaxy, starId: number): LocalLink | null {
  const star = galaxy.stars[starId];
  const theme = star.feature === "derelict" ? "derelict" : star.feature === "ruins" ? "temple" : star.feature === "station" || star.feature === "pirate-base" || star.feature === "research" || star.feature === "quarantine" ? "bunker" : null;
  if (!theme) return null;
  return { params: { seed: `${galaxy.params.seed}/star-${starId}/site`, kind: "dungeon", theme, danger: star.feature === "quarantine" ? 3 : 2 }, language: star.empire ? galaxy.empires[star.empire].language : null };
}
