// Biomes from yearly temperature and moisture (rain plus what rivers and lakes add), with how livable and how hard to
// cross each one is: the inputs for settlement, borders and roads.

export type BiomeKey =
  | "marine"
  | "hot-desert"
  | "cold-desert"
  | "savanna"
  | "grassland"
  | "tropical-seasonal-forest"
  | "temperate-forest"
  | "tropical-rainforest"
  | "temperate-rainforest"
  | "taiga"
  | "tundra"
  | "glacier"
  | "wetland";

export interface Biome {
  id: number;
  key: BiomeKey;
  /** 0–100: how many people the land feeds. */
  habitability: number;
  /** Travel cost through it. */
  cost: number;
  /** Relief icons drawn on it. */
  icon: "none" | "dune" | "grass" | "palm" | "deciduous" | "jungle" | "conifer" | "swamp" | "ice";
}

export const BIOMES: Biome[] = [
  { id: 0, key: "marine", habitability: 0, cost: 10, icon: "none" },
  { id: 1, key: "hot-desert", habitability: 4, cost: 200, icon: "dune" },
  { id: 2, key: "cold-desert", habitability: 10, cost: 150, icon: "none" },
  { id: 3, key: "savanna", habitability: 22, cost: 60, icon: "grass" },
  { id: 4, key: "grassland", habitability: 30, cost: 50, icon: "grass" },
  { id: 5, key: "tropical-seasonal-forest", habitability: 50, cost: 70, icon: "palm" },
  { id: 6, key: "temperate-forest", habitability: 100, cost: 70, icon: "deciduous" },
  { id: 7, key: "tropical-rainforest", habitability: 80, cost: 80, icon: "jungle" },
  { id: 8, key: "temperate-rainforest", habitability: 90, cost: 90, icon: "deciduous" },
  { id: 9, key: "taiga", habitability: 12, cost: 200, icon: "conifer" },
  { id: 10, key: "tundra", habitability: 4, cost: 1000, icon: "none" },
  { id: 11, key: "glacier", habitability: 0, cost: 5000, icon: "ice" },
  { id: 12, key: "wetland", habitability: 12, cost: 150, icon: "swamp" },
];

export function biomeOf(temperature: number, moisture: number, lowland: boolean, wet: boolean): number {
  if (temperature < -8) return 11;
  if (wet && lowland && temperature > 2 && moisture > 1100) return 12;
  if (temperature < 0) return moisture < 120 ? 2 : 10;
  if (temperature < 5) return moisture > 380 ? 9 : moisture > 140 ? 10 : 2;
  if (temperature < 19) {
    if (moisture < 110) return 2;
    if (moisture < 430) return 4;
    return moisture < 1300 ? 6 : 8;
  }
  if (moisture < 220) return 1;
  if (moisture < 650) return 3;
  return moisture < 1500 ? 5 : 7;
}
