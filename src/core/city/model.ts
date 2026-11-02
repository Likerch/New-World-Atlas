// The city level: wards (quarters or districts), the streets between them, buildings on their lots, walls and gates,
// water, fields beyond the walls, and landmarks a game master can send players to. Lengths are map units; `scale`
// converts them to metres.
import type { Point } from "../geometry";
import type { Language } from "../language";

/** Organic eras grow quarter by quarter; the later ones are planned on street grids. */
export type Era = "medieval" | "renaissance" | "industrial" | "modern" | "cyberpunk";
export const ERAS: Era[] = ["medieval", "renaissance", "industrial", "modern", "cyberpunk"];
export const organicEra = (era: Era) => era === "medieval" || era === "renaissance";

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
  | "combat-zone";

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

export type BuildingKind = "house" | "landmark" | "tower" | "industrial" | "field" | "tree" | "grave" | "stall" | "pier";

export interface Building {
  polygon: Point[];
  ward: number;
  kind: BuildingKind;
  floors: number;
}

export type StreetKind = "main" | "street" | "road" | "avenue" | "highway" | "rail" | "skyway";

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
  | "gang-hq";

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
