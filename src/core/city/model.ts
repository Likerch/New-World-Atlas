// The city level: wards (quarters or districts), the streets between them, buildings on their lots, walls and gates,
// water, fields beyond the walls, and landmarks a game master can send players to. Lengths are map units; `scale`
// converts them to metres.
import type { Point } from "../geometry";
import type { CoatOfArms } from "../heraldry";
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
  | "wasteland"
  // Nomads' tents outside the walls, and a village's farmsteads.
  | "camp"
  | "farmstead";

/** A road of the world leaving town: its heading (radians), the town it leads to, and what kind of road it is. */
export interface CityRoad {
  angle: number;
  to: string;
  kind: string;
}

/** The faith the town keeps: the church's name, the god its temple is dedicated to, whether this is its holy city. */
export interface CityFaith {
  name: string;
  deity: string;
  holy: boolean;
}

/** The game master's own kind of quarter: built like one of the generator's, named and coloured its own way. */
export interface CustomWard {
  id: string;
  name: string;
  color: string;
  /** The kind of quarter it is built as. */
  base: WardKind;
  /** 0 poor – 1 rich. */
  wealth: number;
}

/** The game master's own kind of place: its mark and name, what it is, what only the GM knows of it, what it opens
 * into, and how many the generator puts in which quarters. */
export interface CustomPlace {
  id: string;
  name: string;
  glyph: string;
  color: string;
  description: string;
  secret: string;
  opens: "none" | "building" | "local";
  /** A building type (or a custom one's id, "custom:<id>") when it opens as a building; a local map theme otherwise. */
  target: string;
  count: number;
  /** Kinds of quarter it turns up in; none means anywhere in town. */
  where: WardKind[];
}

export interface CityCustom {
  wards: CustomWard[];
  places: CustomPlace[];
}

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
  /** Grown in rings of ages: an old core whose walls became boulevards, then newer quarters round it. */
  growth?: boolean;
  /** A village (houses along a road among their fields) or a hamlet (a farmstead or three) instead of a town. */
  settlement?: "town" | "village" | "hamlet";
  /** 0 flat – 1 hilly: contours, the citadel and the temple on the heights, the steepest slopes left empty. */
  relief?: number;
  /** A lake or a pond inside the frame. */
  lake?: boolean;
  /** The roads of the world that leave town, and whether the gates are moved onto them. */
  roads?: CityRoad[];
  roadGates?: boolean;
  /** What the world gives the town: a palace if it is a capital, its faith, nomads camped outside, magic, its biome,
   * its arms. */
  capital?: boolean;
  faith?: CityFaith;
  nomads?: boolean;
  magic?: number;
  biome?: string;
  arms?: CoatOfArms;
  /** The game master's own quarters and places. */
  custom?: CityCustom;
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
  /** A quarter of the game master's own kind (its id in the city's custom quarters). */
  custom?: string;
}

/** A hut or a longhouse is a stone-age dwelling, and a camp has its fire, standing stones, burial mounds, pens, drying
 * racks and boats; a ruin is what is left of a building after the fall. */
export type BuildingKind = "house" | "landmark" | "tower" | "industrial" | "field" | "tree" | "grave" | "stall" | "pier" | "yard" | "shed" | "hut" | "ruin" | "longhouse" | "fire" | "stone" | "mound" | "pen" | "rack" | "boat" | "tent" | "gone";

/** Things on a city map that are not buildings anyone walks into. */
export const PROPS: BuildingKind[] = ["tree", "field", "grave", "pier", "stall", "yard", "fire", "stone", "mound", "pen", "rack", "boat", "gone"];

export interface Building {
  polygon: Point[];
  ward: number;
  kind: BuildingKind;
  floors: number;
  /** In a close-up: the building of the enlarged map that this one is (absent for lots drawn only up close). */
  origin?: number;
  /** A building the game master's edits raised: its own name for seeds and notes, in place of its index. */
  key?: string;
}

/** A path is a stone-age footpath: trodden earth between the huts, down to the water and out to the hunting grounds. */
export type StreetKind = "main" | "street" | "road" | "avenue" | "highway" | "rail" | "skyway" | "path" | "alley" | "boulevard";

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
  /** An old wall a grown town has built past: it still stands inside the new one. */
  old?: boolean;
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
  | "radio-tower"
  // What the world gives a town, what its growth left behind, and the game master's own places.
  | "palace"
  | "cathedral"
  | "bank"
  | "mage-tower"
  | "old-ruins"
  | "tents"
  | "prison"
  | "old-gate"
  | "custom";

export interface Landmark {
  id: number;
  kind: LandmarkKind;
  x: number;
  y: number;
  ward: number;
  name: string;
  /** The god a temple is dedicated to. */
  deity?: string;
  /** A place of the game master's own kind (its id in the city's custom places). */
  custom?: string;
  /** In a close-up: the building of the whole city this place stands on, so it opens as the same house. */
  origin?: number;
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
  /** A lake or pond inside the frame. */
  lake?: Point[] | null;
  /** A city grown in rings: each quarter's ring (0 is the old core) and the age each ring was built in. */
  growth?: { rings: Record<number, number>; ages: EraId[] };
  /** The gates of the town wall, each with the road of the world it opens on (index into params.roads), if any. */
  gateRoads?: (number | null)[];
}
