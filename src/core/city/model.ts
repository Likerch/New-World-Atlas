// The city level: wards (quarters or districts), the streets between them, buildings on their lots, walls and gates,
// water, fields beyond the walls, and landmarks a game master can send players to. Lengths are map units; `scale`
// converts them to metres.
import type { Point } from "../geometry";
import type { Language } from "../language";
import { ERA_IDS, type EraId } from "../setting";

/** A city's age is the world's: stone-age camps and walled towns grow quarter by quarter (antiquity lays its houses on a
 * grid inside the walls); the machine ages plan whole districts on street grids, and after the fall they lie in ruins. */
export type Era = EraId;
export const ERAS: Era[] = ERA_IDS;
export const organicEra = (era: Era) => era === "stone" || era === "ancient" || era === "medieval" || era === "renaissance";

export type WardKind =
  // Walled towns.
  | "plaza"
  | "temple"
  | "castle"
  | "harbour"
  | "patriciate"
  | "merchants"
  | "craftsmen"
  | "slum"
  | "military"
  | "administration"
  | "park"
  | "cemetery"
  | "farm"
  | "suburb"
  | "wild"
  // Planned cities.
  | "downtown"
  | "commercial"
  | "residential"
  | "rich-residential"
  | "industrial"
  | "port"
  | "campus"
  | "old-town"
  | "arcology"
  | "megablock"
  | "combat-zone"
  // The far future and the fallen city.
  | "spaceport"
  | "ruins"
  | "settlement"
  | "wasteland";

export interface CityParams {
  seed: string;
  name: string;
  width: number;
  height: number;
  /** Thousands of people. */
  population: number;
  era: Era;
  /** Direction from the centre towards the sea, radians; null for an inland town. */
  coast: number | null;
  /** Direction the river flows, radians; null without a river. */
  river: number | null;
  walls: boolean;
  citadel: boolean;
  port: boolean;
  temple: boolean;
  market: boolean;
  shanty: boolean;
}

export interface Ward {
  id: number;
  kind: WardKind;
  polygon: Point[];
  center: Point;
  /** Inside the town proper (within the walls for walled towns). */
  urban: boolean;
  name: string;
  /** 0 poor – 1 rich. */
  wealth: number;
  /** For planned districts: the street grid's angle. */
  angle: number;
  buildings: number;
}

/** A hut or a longhouse is a stone-age dwelling, and a camp has its fire, standing stones, burial mounds, pens, drying
 * racks and boats; a ruin is what is left of a building after the fall. */
export type BuildingKind = "house" | "landmark" | "tower" | "industrial" | "field" | "tree" | "grave" | "stall" | "pier" | "yard" | "shed" | "hut" | "ruin" | "longhouse" | "fire" | "stone" | "mound" | "pen" | "rack" | "boat";

/** Things on a city map that are not buildings anyone walks into. */
export const PROPS: BuildingKind[] = ["tree", "field", "grave", "pier", "stall", "yard", "fire", "stone", "mound", "pen", "rack", "boat"];

export interface Building {
  polygon: Point[];
  ward: number;
  kind: BuildingKind;
  floors: number;
  /** In a close-up: the building of the enlarged map that this one is (absent for lots drawn only up close). */
  origin?: number;
}

/** A path is a stone-age footpath: trodden earth between the huts, down to the water and out to the hunting grounds. */
export type StreetKind = "main" | "street" | "road" | "avenue" | "highway" | "rail" | "skyway" | "path";

export interface Street {
  id: number;
  kind: StreetKind;
  points: Point[];
  /** Width in map units. */
  width: number;
  name: string;
}

export interface Wall {
  /** Closed ring of corner points. */
  ring: Point[];
  towers: Point[];
  gates: Point[];
  /** Star-fort bastions at the corners (renaissance). */
  bastions: boolean;
  citadel: boolean;
}

export type LandmarkKind =
  | "market-well"
  | "temple"
  | "keep"
  | "tavern"
  | "smithy"
  | "guildhall"
  | "bathhouse"
  | "gallows"
  | "docks"
  | "lighthouse"
  | "mill"
  | "barracks"
  | "town-hall"
  | "station"
  | "hospital"
  | "police"
  | "stadium"
  | "university"
  | "museum"
  | "factory"
  | "corp-hq"
  | "ripperdoc"
  | "netrunner-den"
  | "night-market"
  | "club"
  | "av-port"
  | "undercity"
  | "gang-hq"
  | "fire-pit"
  | "chief-hut"
  | "flint-workshop"
  | "animal-pen"
  | "sacred-stone"
  | "agora"
  | "theatre"
  | "arena"
  | "gymnasium"
  | "library"
  | "lab"
  | "garden-dome"
  | "ai-core"
  | "launch-pad"
  | "barter-market"
  | "water-still"
  | "raider-fort"
  | "vault-door"
  | "scrapyard"
  | "radio-tower";

export interface Landmark {
  id: number;
  kind: LandmarkKind;
  x: number;
  y: number;
  ward: number;
  name: string;
}

export interface City {
  params: CityParams;
  name: string;
  /** Metres per map unit. */
  scale: number;
  center: Point;
  wards: Ward[];
  buildings: Building[];
  streets: Street[];
  walls: Wall[];
  sea: Point[] | null;
  river: { points: Point[]; width: number } | null;
  /** Where streets cross the river. */
  bridges: [Point, Point][];
  landmarks: Landmark[];
  language: Language;
}
