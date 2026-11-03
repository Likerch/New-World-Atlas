// Buildings and interiors. A footprint becomes floors (a cellar, the ground floor, upper floors) whose rooms follow
// the building's purpose — a tavern's common room and guest rooms, a temple's nave, a keep's hall and cells, an
// office tower's open floors. Doors join every room to the way in, windows open the outer walls, furniture fills the
// rooms, and a fenced yard surrounds the house. Coordinates are metres. The age furnishes them: furs and a hearth in a
// stone-age hut, holo-tables and sleep pods in the far future, mattresses and crates after the fall. Each age also has
// buildings of its own: longhouses; a Roman house round its atrium, tenements and baths; guildhalls and banks; mills,
// stations and schools; capsule hotels; habitat modules, labs and grow halls; shelters, trading posts and bunkers.
import type { Era } from "../city/model";
import type { Point } from "../geometry";
import { createRng, type Rng } from "../random";
import { dress } from "./dress";
import { courtFeatures, roundFloors, wingedFloors, wingsOf } from "./shapes";

export type BuildingType =
  | "house"
  | "manor"
  | "tavern"
  | "shop"
  | "smithy"
  | "temple"
  | "keep"
  | "warehouse"
  | "apartment"
  | "office"
  | "clinic"
  | "club"
  | "hut"
  | "longhouse"
  | "domus"
  | "insula"
  | "bathhouse"
  | "guildhall"
  | "bank"
  | "tenement"
  | "factory"
  | "station"
  | "school"
  | "police"
  | "store"
  | "capsule-hotel"
  | "hab"
  | "lab"
  | "hydroponics"
  | "shelter"
  | "trading-post"
  | "bunker"
  // Landmarks that are buildings of their own, and the game master's own kind.
  | "lighthouse"
  | "mill"
  | "theatre"
  | "arena"
  | "prison"
  | "barracks"
  | "palace"
  | "mage-tower"
  | "custom";
/** The first types; a random building is still drawn from these, so a seed keeps the building it always made. */
const FIRST_TYPES: BuildingType[] = ["house", "manor", "tavern", "shop", "smithy", "temple", "keep", "warehouse", "apartment", "office", "clinic", "club", "hut", "longhouse", "domus", "insula", "bathhouse", "guildhall", "bank", "tenement", "factory", "station", "school", "police", "store", "capsule-hotel", "hab", "lab", "hydroponics", "shelter", "trading-post", "bunker"];
export const BUILDING_TYPES: BuildingType[] = [...FIRST_TYPES, "lighthouse", "mill", "theatre", "arena", "prison", "barracks", "palace", "mage-tower"];

/** The buildings each age raises, its own first. */
export const ERA_BUILDINGS: Record<Era, BuildingType[]> = {
  stone: ["hut", "longhouse"],
  ancient: ["domus", "insula", "temple", "bathhouse", "tavern", "shop", "smithy", "warehouse", "keep", "theatre", "arena", "lighthouse", "barracks", "palace", "prison"],
  medieval: ["house", "manor", "tavern", "shop", "smithy", "temple", "keep", "warehouse", "mill", "barracks", "prison", "palace", "lighthouse", "mage-tower"],
  renaissance: ["house", "manor", "guildhall", "bank", "tavern", "shop", "smithy", "temple", "keep", "warehouse", "theatre", "mill", "barracks", "prison", "palace", "lighthouse", "mage-tower"],
  industrial: ["tenement", "house", "manor", "factory", "station", "bank", "tavern", "shop", "temple", "clinic", "police", "warehouse", "theatre", "prison", "barracks", "mill", "lighthouse"],
  modern: ["house", "apartment", "office", "store", "school", "clinic", "police", "club", "station", "factory", "warehouse", "temple", "theatre", "arena", "prison", "lighthouse"],
  cyberpunk: ["apartment", "capsule-hotel", "office", "store", "clinic", "club", "tavern", "police", "factory", "warehouse", "arena", "prison"],
  "far-future": ["hab", "lab", "hydroponics", "office", "store", "clinic", "club", "station", "temple", "arena", "prison"],
  "post-apocalypse": ["shelter", "trading-post", "bunker", "tavern", "clinic", "smithy", "warehouse", "temple", "arena", "prison"],
};

/** The age a building type belongs to when none is asked for. */
const TYPE_ERA: Partial<Record<BuildingType, Era>> = { apartment: "modern", office: "modern", clinic: "modern", club: "modern", hut: "stone", longhouse: "stone", domus: "ancient", insula: "ancient", bathhouse: "ancient", guildhall: "renaissance", bank: "renaissance", tenement: "industrial", factory: "industrial", station: "industrial", school: "modern", police: "modern", store: "modern", "capsule-hotel": "cyberpunk", hab: "far-future", lab: "far-future", hydroponics: "far-future", shelter: "post-apocalypse", "trading-post": "post-apocalypse", bunker: "post-apocalypse", theatre: "renaissance", arena: "ancient" };

/** Footprints a building can have. A plain rectangle is the old plan; the others are wings round a corner, a back
 * wing, two wings round a yard open at the back, four round a closed court, or a round tower. */
export type BuildingShape = "rect" | "L" | "T" | "U" | "court" | "round";
export const BUILDING_SHAPES: BuildingShape[] = ["rect", "L", "T", "U", "court", "round"];
/** The shape a type is built in when none is asked for. */
export const TYPE_SHAPE: Partial<Record<BuildingType, BuildingShape>> = { lighthouse: "round", "mage-tower": "round", arena: "round", theatre: "U", prison: "court", barracks: "court", palace: "court" };

export type RoomKind =
  | "hall"
  | "common-room"
  | "kitchen"
  | "pantry"
  | "bedroom"
  | "guest-room"
  | "storage"
  | "workshop"
  | "shop-floor"
  | "office"
  | "study"
  | "chapel"
  | "nave"
  | "sacristy"
  | "armory"
  | "barracks"
  | "throne-room"
  | "corridor"
  | "stairs"
  | "bath"
  | "cellar"
  | "cell"
  | "living-room"
  | "dining"
  | "lobby"
  | "operating-room"
  | "waiting-room"
  | "dance-floor"
  | "bar"
  | "vip"
  | "toilet"
  | "server-room"
  // Rooms of other ages' buildings.
  | "atrium"
  | "garden"
  | "classroom"
  | "gym"
  | "canteen"
  | "machine-hall"
  | "boiler-room"
  | "vault"
  | "ticket-hall"
  | "platform"
  | "airlock"
  | "grow-room"
  | "lab"
  | "capsules"
  | "changing-room"
  | "pool-room"
  | "furnace"
  | "generator"
  | "garage"
  // Entries, lofts, and the rooms of lighthouses, mills, theatres, arenas, prisons, palaces and towers.
  | "vestibule"
  | "attic"
  | "passage"
  | "lantern"
  | "mill-room"
  | "stage"
  | "auditorium"
  | "arena-floor"
  | "stands"
  | "guard-room"
  | "ballroom"
  | "gallery"
  | "ritual-room";

export type FurnitureKind =
  | "bed"
  | "bunk"
  | "table"
  | "round-table"
  | "chair"
  | "bench"
  | "counter"
  | "hearth"
  | "stove"
  | "barrel"
  | "crate"
  | "shelf"
  | "altar"
  | "pew"
  | "desk"
  | "chest"
  | "wardrobe"
  | "tub"
  | "toilet"
  | "sofa"
  | "screen"
  | "operating-table"
  | "anvil"
  | "forge"
  | "throne"
  | "rack"
  | "plant"
  | "booth"
  | "carpet"
  | "pillar"
  // The stone age, the far future and the fallen world.
  | "furs"
  | "mat"
  | "log"
  | "pot"
  | "holo-table"
  | "pod"
  | "replicator"
  | "mattress"
  | "machine"
  | "locker"
  | "pool"
  | "vat"
  | "generator"
  // Crafts, new buildings, decay, magic and the way down.
  | "oven"
  | "hooks"
  | "loom"
  | "bolts"
  | "kiln"
  | "still"
  | "press"
  | "display"
  | "millstone"
  | "lantern"
  | "stands"
  | "stage"
  | "rubble"
  | "circle"
  | "hatch";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Furniture extends Rect {
  kind: FurnitureKind;
  round: boolean;
  /** Part of the house rather than of the room's use (the hatch down, a craft's tools, a chalked circle): it stays when
   * the room falls in or is furnished anew. */
  fixed?: boolean;
}

export interface Room extends Rect {
  id: number;
  kind: RoomKind;
  furniture: Furniture[];
  /** Fallen in: its floor is rubble (a building in deep decay). */
  collapsed?: boolean;
}

/** What a door is made of: a hide flap or a curtain, a plain or a heavy door, iron, bars, glass, a sliding or an
 * airlock door, an open arch, a wide gate, a hatch in the floor, or one hanging off its hinges. */
export type DoorKind = "curtain" | "plain" | "heavy" | "iron" | "bars" | "glass" | "sliding" | "airlock" | "arch" | "gate" | "broken";
export const DOOR_KINDS: DoorKind[] = ["curtain", "plain", "heavy", "iron", "bars", "glass", "sliding", "airlock", "arch", "gate", "broken"];
/** How a door is held shut: not at all, a latch, a simple or a good lock, a master's lock, a bar on the inside, a
 * keycard or a hand on a reader, or a warding spell. */
export type LockKind = "none" | "latch" | "simple" | "good" | "master" | "bar" | "keycard" | "biometric" | "magic";
export const LOCK_KINDS: LockKind[] = ["none", "latch", "simple", "good", "master", "bar", "keycard", "biometric", "magic"];

export interface Door {
  /** Centre of the opening. */
  at: Point;
  /** The wall runs horizontally (true) or vertically. */
  horizontal: boolean;
  width: number;
  /** Rooms on either side; -1 is outdoors. */
  rooms: [number, number];
  kind?: DoorKind;
  lock?: LockKind;
  /** Hidden in the wall (behind a shelf, a panel): only a search finds it, and players do not see it. */
  secret?: boolean;
  /** Bricked up by the game master: drawn as wall, no way through. */
  walled?: boolean;
}

export interface Opening {
  a: Point;
  b: Point;
  /** Nailed over with boards. */
  boarded?: boolean;
}

export interface Floor {
  level: number;
  rooms: Room[];
  doors: Door[];
  windows: Opening[];
}

export interface YardFeature {
  kind: "well" | "tree" | "bed" | "shed" | "stable" | "hay" | "cart" | "fountain" | "parking" | "wheel";
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the walls are built of. */
export type Material = "hide" | "timber" | "adobe" | "stone" | "brick" | "concrete" | "glass" | "composite" | "scrap";
export const MATERIALS: Material[] = ["hide", "timber", "adobe", "stone", "brick", "concrete", "glass", "composite", "scrap"];

/** The game master's own kind of building: its name, what it is for, and its rooms floor by floor. */
export interface CustomBuildingType {
  id: string;
  name: string;
  description: string;
  /** Rooms of the ground floor, of each floor above, and of the cellar. */
  ground: RoomKind[];
  upper: RoomKind[];
  cellar: RoomKind[];
  width: number;
  depth: number;
  floors: number;
}

/** Who holds the building: a person of the city (the same key gives the same person) and the faction they serve. */
export interface BuildingOwner {
  key: string;
  role: string;
  faction?: { id: string; name: string; kind: string };
}

export interface BuildingParams {
  seed: string;
  type: BuildingType;
  era: Era;
  name: string;
  /** Footprint, metres. */
  width: number;
  depth: number;
  floors: number;
  cellar: boolean;
  yard: boolean;
  /** The footprint's shape; unset is the plain rectangle. */
  shape?: BuildingShape;
  /** A loft under the roof above the top floor. */
  attic?: boolean;
  /** What a shop sells or a workshop makes ("baker", "chrome"…). */
  craft?: string;
  /** 0 poor – 1 rich: what the household owns. */
  wealth?: number;
  material?: Material;
  /** 0 kept – 1 a ruin: rubble, boarded windows, broken doors, rooms fallen in. */
  decay?: number;
  /** 0 none – 3 the world runs on it: warded locks, circles, enchanted things. */
  magic?: number;
  /** A hatch in the cellar floor down to the sewers, the metro or the vaults below. */
  hatch?: boolean;
  /** The street the front door opens on and the house's number on it, and houses wall to wall on either side. */
  street?: string;
  house?: number;
  terrace?: boolean;
  owner?: BuildingOwner;
  /** The game master's own type, when `type` is "custom". */
  customType?: CustomBuildingType;
}

export interface BuildingPlan {
  params: BuildingParams;
  floors: Floor[];
  /** The yard around the footprint, metres; the building stands at (0, 0). */
  yard: { bounds: Rect; features: YardFeature[] } | null;
  /** The wings of a shaped building (a plain one has none); every floor is laid out in them. */
  wings?: Rect[];
  /** The open court inside a courtyard building, with what stands in it. */
  court?: { rect: Rect; features: YardFeature[] };
}

const SIZES: Record<BuildingType, [number, number, number, number]> = {
  // width range, depth range
  house: [7, 11, 7, 10],
  manor: [18, 26, 12, 16],
  tavern: [13, 18, 10, 14],
  shop: [7, 10, 9, 13],
  smithy: [9, 13, 8, 11],
  temple: [24, 34, 11, 15],
  keep: [16, 22, 14, 20],
  warehouse: [16, 26, 11, 16],
  apartment: [22, 34, 12, 15],
  office: [24, 36, 18, 26],
  clinic: [11, 15, 9, 12],
  club: [18, 26, 13, 18],
  hut: [4, 7, 4, 7],
  longhouse: [14, 26, 5, 8],
  domus: [16, 24, 12, 18],
  insula: [16, 26, 12, 16],
  bathhouse: [20, 32, 14, 20],
  guildhall: [16, 24, 10, 14],
  bank: [14, 22, 12, 16],
  tenement: [14, 22, 10, 13],
  factory: [30, 50, 18, 30],
  station: [30, 46, 12, 18],
  school: [26, 40, 12, 16],
  police: [18, 26, 12, 16],
  store: [20, 34, 16, 24],
  "capsule-hotel": [14, 20, 10, 13],
  hab: [10, 16, 8, 12],
  lab: [18, 28, 12, 18],
  hydroponics: [20, 34, 10, 16],
  shelter: [5, 9, 4, 7],
  "trading-post": [10, 16, 8, 12],
  bunker: [14, 24, 10, 16],
  lighthouse: [6, 8, 6, 8],
  mill: [10, 14, 8, 11],
  theatre: [24, 34, 18, 26],
  arena: [30, 44, 30, 44],
  prison: [24, 34, 20, 28],
  barracks: [24, 34, 18, 24],
  palace: [34, 50, 26, 36],
  "mage-tower": [8, 11, 8, 11],
  custom: [10, 16, 8, 12],
};

/** The most floors a plan draws: a tower of the far future. */
export const MAX_FLOORS = 60;

/** Floor counts each type usually has. */
export const BUILDING_FLOORS: Record<BuildingType, [number, number]> = {
  house: [1, 2],
  manor: [2, 3],
  tavern: [2, 3],
  shop: [2, 2],
  smithy: [1, 2],
  temple: [1, 1],
  keep: [3, 4],
  warehouse: [1, 2],
  apartment: [4, 8],
  office: [5, 20],
  clinic: [1, 2],
  club: [1, 2],
  hut: [1, 1],
  longhouse: [1, 1],
  domus: [1, 1],
  insula: [3, 5],
  bathhouse: [1, 1],
  guildhall: [2, 3],
  bank: [2, 3],
  tenement: [3, 5],
  factory: [1, 2],
  station: [1, 2],
  school: [2, 3],
  police: [2, 3],
  store: [1, 1],
  "capsule-hotel": [3, 6],
  hab: [1, 2],
  lab: [1, 3],
  hydroponics: [1, 2],
  shelter: [1, 1],
  "trading-post": [1, 2],
  bunker: [1, 2],
  lighthouse: [3, 5],
  mill: [2, 2],
  theatre: [2, 2],
  arena: [1, 1],
  prison: [2, 3],
  barracks: [2, 2],
  palace: [2, 3],
  "mage-tower": [3, 5],
  custom: [1, 3],
};

/** Rooms of each floor: [kind, share of the floor]; "corridor" floors line their rooms along a central hallway. */
export type Program = { rooms: [RoomKind, number][]; corridor?: boolean };
export function program(type: BuildingType, level: number, top: number, rng: Rng, modern: boolean, custom?: CustomBuildingType): Program {
  const guests = (count: number, kind: RoomKind = "guest-room"): [RoomKind, number][] => Array.from({ length: count }, () => [kind, 1] as [RoomKind, number]);
  if (type === "custom") {
    // The game master's own rooms, the first (the main room) twice the size of the others.
    const list = (level < 0 ? custom?.cellar : level === 0 ? custom?.ground : custom?.upper) ?? [];
    const rooms: RoomKind[] = list.length ? list : [level < 0 ? "cellar" : level === 0 ? "hall" : "bedroom"];
    return { rooms: rooms.map((kind, k): [RoomKind, number] => [kind, k === 0 ? 2 : 1]), corridor: rooms.length > 4 };
  }
  if (level < 0) {
    if (type === "prison" || type === "barracks") return { rooms: [...guests(rng.int(4, 6), "cell"), ["guard-room", 1], ["storage", 1]], corridor: true };
    if (type === "palace") return { rooms: [["vault", 0.3], ["cellar", 0.4], ["storage", 0.3]] };
    if (type === "mage-tower") return { rooms: [["vault", 0.5], ["cell", 0.5]] };
    if (type === "theatre") return { rooms: [["storage", 0.6], ["changing-room", 0.4]] };
    if (type === "keep" || type === "police") return { rooms: [...guests(rng.int(4, 6), "cell"), ["storage", 1.5]], corridor: true };
    if (type === "bank") return { rooms: [["vault", 0.7], ["storage", 0.3]] };
    if (type === "bunker") return { rooms: [["generator", 0.3], ["storage", 0.4], ["armory", 0.3]] };
    if (type === "factory" || type === "station" || type === "school" || type === "office") return { rooms: [["boiler-room", 0.4], ["storage", 0.6]] };
    return { rooms: [["cellar", 1]] };
  }
  switch (type) {
    case "house":
      return level === 0 ? { rooms: [[modern ? "living-room" : "hall", 0.45], ["kitchen", 0.3], [modern ? "bath" : "pantry", 0.25]] } : { rooms: [["bedroom", 0.55], ["bedroom", 0.45]] };
    case "manor":
      return level === 0 ? { rooms: [["hall", 0.32], ["dining", 0.2], ["kitchen", 0.16], ["study", 0.16], ["pantry", 0.16]] } : { rooms: [...guests(rng.int(4, 5), "bedroom"), ["bath", 0.8]], corridor: true };
    case "tavern":
      return level === 0 ? { rooms: [["common-room", 0.6], ["kitchen", 0.24], ["pantry", 0.16]] } : { rooms: guests(rng.int(4, 6)), corridor: true };
    case "shop":
      return level === 0 ? { rooms: [["shop-floor", 0.6], ["workshop", 0.25], ["storage", 0.15]] } : { rooms: [["bedroom", 0.55], ["living-room", 0.45]] };
    case "smithy":
      return level === 0 ? { rooms: [["workshop", 0.72], ["storage", 0.28]] } : { rooms: [["bedroom", 0.6], ["kitchen", 0.4]] };
    case "temple":
      return { rooms: [["nave", 0.74], ["sacristy", 0.13], ["chapel", 0.13]] };
    case "keep":
      if (level === 0) return { rooms: [["hall", 0.4], ["armory", 0.2], ["kitchen", 0.2], ["storage", 0.2]] };
      if (level === 1) return { rooms: [["throne-room", 0.6], ["chapel", 0.2], ["study", 0.2]] };
      return { rooms: [["barracks", 0.55], ["bedroom", 0.45]] };
    case "warehouse":
      return level === 0 ? { rooms: [["storage", 0.82], ["office", 0.18]] } : { rooms: [["storage", 1]] };
    case "apartment":
      return level === 0 ? { rooms: [["lobby", 0.5], ["storage", 0.2], ["office", 0.3]] } : { rooms: Array.from({ length: rng.int(6, 8) }, (_, k): [RoomKind, number] => [(["living-room", "bedroom", "kitchen", "bath"] as RoomKind[])[k % 4], k % 4 === 3 ? 0.6 : 1]), corridor: true };
    case "office":
      return level === 0 ? { rooms: [["lobby", 0.55], ["office", 0.25], ["toilet", 0.2]] } : level === top ? { rooms: [["server-room", 0.4], ["office", 0.6]] } : { rooms: [...guests(rng.int(4, 6), "office"), ["toilet", 0.6]], corridor: true };
    case "clinic":
      return level === 0 ? { rooms: [["waiting-room", 0.34], ["operating-room", 0.34], ["storage", 0.14], ["office", 0.18]] } : { rooms: [["bedroom", 0.5], ["server-room", 0.5]] };
    case "club":
      return level === 0 ? { rooms: [["dance-floor", 0.5], ["bar", 0.2], ["vip", 0.15], ["toilet", 0.15]] } : { rooms: [["vip", 0.5], ["office", 0.5]] };
    case "hut":
      return { rooms: [["hall", 1]] };
    case "longhouse":
      return { rooms: [["storage", 0.14], ["hall", 0.72], ["storage", 0.14]] };
    case "domus":
      return level === 0 ? { rooms: [["atrium", 0.2], ["garden", 0.24], ["shop-floor", 0.12], ["dining", 0.12], ["study", 0.08], ["bedroom", 0.08], ["bedroom", 0.08], ["kitchen", 0.08]] } : { rooms: guests(rng.int(3, 4), "bedroom") };
    case "insula":
      return level === 0 ? { rooms: [["shop-floor", 1], ["shop-floor", 1], ["shop-floor", 1], ["storage", 0.6]] } : { rooms: Array.from({ length: rng.int(6, 8) }, (_, k): [RoomKind, number] => [(["bedroom", "living-room", "kitchen"] as RoomKind[])[k % 3], 1]), corridor: true };
    case "bathhouse":
      return { rooms: [["changing-room", 0.16], ["pool-room", 0.22], ["pool-room", 0.2], ["pool-room", 0.2], ["furnace", 0.12], ["storage", 0.1]] };
    case "guildhall":
      return level === 0 ? { rooms: [["hall", 0.5], ["office", 0.2], ["kitchen", 0.15], ["storage", 0.15]] } : { rooms: [["hall", 0.5], ["study", 0.25], ["office", 0.25]] };
    case "bank":
      return level === 0 ? { rooms: [["lobby", 0.45], ["office", 0.2], ["vault", 0.25], ["office", 0.1]] } : { rooms: [...guests(rng.int(3, 5), "office"), ["toilet", 0.6]], corridor: true };
    case "tenement":
      return level === 0 ? { rooms: [["shop-floor", 0.35], ["living-room", 0.25], ["kitchen", 0.2], ["toilet", 0.2]] } : { rooms: [...Array.from({ length: rng.int(6, 8) }, (_, k): [RoomKind, number] => [k % 2 ? "kitchen" : "bedroom", 1]), ["toilet", 0.5]], corridor: true };
    case "factory":
      return level === 0 ? { rooms: [["machine-hall", 0.62], ["boiler-room", 0.14], ["storage", 0.14], ["office", 0.1]] } : { rooms: [["office", 0.4], ["storage", 0.6]] };
    case "station":
      return level === 0 ? { rooms: [["ticket-hall", 0.4], ["platform", 0.4], ["office", 0.1], ["toilet", 0.1]] } : { rooms: [["office", 0.6], ["storage", 0.4]] };
    case "school":
      return level === 0 ? { rooms: [["lobby", 0.2], ["canteen", 0.3], ["gym", 0.3], ["office", 0.2]] } : { rooms: [...guests(rng.int(5, 6), "classroom"), ["toilet", 0.6]], corridor: true };
    case "police":
      return level === 0 ? { rooms: [["lobby", 0.3], ["office", 0.3], ["armory", 0.16], ["cell", 0.12], ["cell", 0.12]] } : { rooms: [...guests(rng.int(3, 5), "office"), ["toilet", 0.6]], corridor: true };
    case "store":
      return { rooms: [["shop-floor", 0.76], ["storage", 0.14], ["office", 0.1]] };
    case "capsule-hotel":
      return level === 0 ? { rooms: [["lobby", 0.45], ["bath", 0.2], ["toilet", 0.15], ["storage", 0.2]] } : { rooms: [...guests(4, "capsules"), ["bath", 0.6]], corridor: true };
    case "hab":
      return level === 0 ? { rooms: [["airlock", 0.12], ["living-room", 0.3], ["grow-room", 0.16], ["kitchen", 0.14], ["bedroom", 0.28]] } : { rooms: [["bedroom", 0.5], ["lab", 0.5]] };
    case "lab":
      return level === 0 ? { rooms: [["lobby", 0.2], ["lab", 0.3], ["lab", 0.3], ["server-room", 0.2]] } : { rooms: [...guests(3, "lab"), ...guests(2, "office")], corridor: true };
    case "hydroponics":
      return level === 0 ? { rooms: [["grow-room", 0.76], ["storage", 0.12], ["office", 0.12]] } : { rooms: [["grow-room", 1]] };
    case "shelter":
      return { rooms: [["hall", 0.65], ["storage", 0.35]] };
    case "trading-post":
      return level === 0 ? { rooms: [["shop-floor", 0.55], ["storage", 0.3], ["bedroom", 0.15]] } : { rooms: [["bedroom", 0.5], ["storage", 0.5]] };
    case "bunker":
      return level === 0 ? { rooms: [["barracks", 1], ["armory", 0.6], ["storage", 0.7], ["generator", 0.6], ["kitchen", 0.7]], corridor: true } : { rooms: [["barracks", 0.5], ["office", 0.5]] };
    case "lighthouse":
      // The keeper lives at the foot; the lamp burns at the top.
      return level === 0 ? { rooms: [["living-room", 0.5], ["kitchen", 0.25], ["storage", 0.25]] } : level === top ? { rooms: [["lantern", 1]] } : { rooms: [["storage", 0.5], ["bedroom", 0.5]] };
    case "mill":
      return level === 0 ? { rooms: [["mill-room", 0.62], ["storage", 0.38]] } : { rooms: [["storage", 0.55], ["bedroom", 0.25], ["kitchen", 0.2]] };
    case "theatre":
      return level === 0 ? { rooms: [["auditorium", 0.5], ["stage", 0.22], ["lobby", 0.14], ["changing-room", 0.14]] } : { rooms: [["gallery", 0.6], ["office", 0.2], ["storage", 0.2]] };
    case "arena":
      return { rooms: [["arena-floor", 1.4], ["stands", 1], ["stands", 1], ["cell", 0.5], ["armory", 0.5]] };
    case "prison":
      return level === 0 ? { rooms: [["guard-room", 1], ["office", 0.7], ["canteen", 1], ...guests(rng.int(4, 6), "cell")], corridor: true } : { rooms: [...guests(rng.int(6, 8), "cell"), ["guard-room", 1]], corridor: true };
    case "barracks":
      return level === 0 ? { rooms: [["canteen", 1.2], ["armory", 0.8], ["kitchen", 0.6], ["office", 0.5], ["storage", 0.6], ["guard-room", 0.6]] } : { rooms: [...guests(rng.int(3, 5), "barracks"), ["bath", 0.6]], corridor: true };
    case "palace":
      if (level === 0) return { rooms: [["ballroom", 1.4], ["gallery", 1], ["dining", 0.8], ["kitchen", 0.6], ["chapel", 0.5], ["guard-room", 0.5], ["pantry", 0.4]] };
      if (level === 1) return { rooms: [["throne-room", 1.4], ["study", 0.6], ["bedroom", 0.8], ["bedroom", 0.8], ["bath", 0.5], ["gallery", 0.8]] };
      return { rooms: [...guests(rng.int(4, 6)), ["bath", 0.6]], corridor: true };
    case "mage-tower":
      return level === 0 ? { rooms: [["hall", 0.6], ["storage", 0.4]] } : level === top ? { rooms: [["ritual-room", 1]] } : level === 1 ? { rooms: [["study", 0.6], ["lab", 0.4]] } : { rooms: [["bedroom", 0.5], ["study", 0.5]] };
  }
}

/** The loft under the roof: lumber and a servant's bed. */
export const ATTIC: Program = { rooms: [["attic", 0.7], ["bedroom", 0.3]] };

/** What each age has in place of the middle ages' furniture; null where it has nothing. */
const AGE_FURNITURE: Partial<Record<Era, Partial<Record<FurnitureKind, FurnitureKind | null>>>> = {
  stone: { bed: "furs", bunk: "furs", table: "mat", "round-table": "mat", desk: "mat", counter: "mat", chair: "log", bench: "log", pew: "log", sofa: "furs", chest: "pot", wardrobe: "pot", shelf: "pot", barrel: "pot", crate: "pot", stove: "hearth", carpet: "furs", tub: null, toilet: null, screen: null, throne: "furs", forge: "hearth", anvil: "log" },
  "far-future": { table: "holo-table", desk: "holo-table", "round-table": "holo-table", bed: "pod", bunk: "pod", stove: "replicator", hearth: "replicator", chest: "crate", barrel: "crate" },
  "post-apocalypse": { bed: "mattress", bunk: "mattress", sofa: "mattress", desk: "crate", wardrobe: "crate", screen: null, carpet: null, plant: null, stove: "barrel" },
};

/** Slices a rectangle into rooms with areas in proportion to their shares, keeping them as square as it can. */
export function slice(rect: Rect, rooms: [RoomKind, number][], out: { rect: Rect; kind: RoomKind }[], along?: "x" | "y"): void {
  if (rooms.length === 1) {
    out.push({ rect, kind: rooms[0][0] });
    return;
  }
  const total = rooms.reduce((sum, room) => sum + room[1], 0);
  let k = 1;
  let acc = rooms[0][1];
  while (k < rooms.length - 1 && acc + rooms[k][1] <= total / 2) acc += rooms[k++][1];
  const ratio = acc / total;
  const vertical = along ? along === "x" : rect.w >= rect.h;
  const [a, b]: [Rect, Rect] = vertical
    ? [{ x: rect.x, y: rect.y, w: rect.w * ratio, h: rect.h }, { x: rect.x + rect.w * ratio, y: rect.y, w: rect.w * (1 - ratio), h: rect.h }]
    : [{ x: rect.x, y: rect.y, w: rect.w, h: rect.h * ratio }, { x: rect.x, y: rect.y + rect.h * ratio, w: rect.w, h: rect.h * (1 - ratio) }];
  slice(a, rooms.slice(0, k), out, along);
  slice(b, rooms.slice(k), out, along);
}

/** Rooms a guest should not walk into from the street. */
export const BACK_ROOMS = new Set<RoomKind>(["storage", "pantry", "cellar", "stairs", "attic"]);
export const CIRCULATION = new Set<RoomKind>(["corridor", "hall", "common-room", "lobby", "shop-floor", "nave", "stairs", "dance-floor", "living-room", "waiting-room", "workshop", "storage", "cellar", "throne-room", "atrium", "garden", "ticket-hall", "platform", "machine-hall", "canteen", "gym", "changing-room", "airlock", "grow-room", "vestibule", "passage", "ballroom", "gallery", "auditorium", "arena-floor", "stands", "guard-room", "mill-room", "attic"]);

/** The wall two rooms share, if they touch along at least a door's width (or `least` metres). */
export function sharedWall(a: Rect, b: Rect, least = 1.2): { from: Point; to: Point; horizontal: boolean } | null {
  const eps = 0.01;
  const overlap = (a0: number, a1: number, b0: number, b1: number) => [Math.max(a0, b0), Math.min(a1, b1)];
  if (Math.abs(a.x + a.w - b.x) < eps || Math.abs(b.x + b.w - a.x) < eps) {
    const x = Math.abs(a.x + a.w - b.x) < eps ? b.x : a.x;
    const [y0, y1] = overlap(a.y, a.y + a.h, b.y, b.y + b.h);
    if (y1 - y0 >= least) return { from: [x, y0], to: [x, y1], horizontal: false };
  }
  if (Math.abs(a.y + a.h - b.y) < eps || Math.abs(b.y + b.h - a.y) < eps) {
    const y = Math.abs(a.y + a.h - b.y) < eps ? b.y : a.y;
    const [x0, x1] = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
    if (x1 - x0 >= least) return { from: [x0, y], to: [x1, y], horizontal: true };
  }
  return null;
}

export function furnish(room: Room, doors: Door[], type: BuildingType, modern: boolean, rng: Rng): Furniture[] {
  const out: Furniture[] = [];
  const m = 0.35;
  const { x, y, w, h } = room;
  const clear = (f: Rect) => doors.every((door) => door.at[0] < f.x - 1 || door.at[0] > f.x + f.w + 1 || door.at[1] < f.y - 1 || door.at[1] > f.y + f.h + 1);
  const add = (kind: FurnitureKind, fx: number, fy: number, fw: number, fh: number, round = false) => {
    const f = { kind, x: fx, y: fy, w: fw, h: fh, round };
    // A circle is chalked on the floor: it may run up to a door.
    if (fx >= x && fy >= y && fx + fw <= x + w && fy + fh <= y + h && (kind === "circle" || clear(f)) && out.every((o) => fx >= o.x + o.w || o.x >= fx + fw || fy >= o.y + o.h || o.y >= fy + fh)) out.push(f);
  };
  const grid = (kind: FurnitureKind, fw: number, fh: number, gx: number, gy: number, round = false, margin = 0.8) => {
    for (let px = x + margin; px + fw <= x + w - margin; px += gx) for (let py = y + margin; py + fh <= y + h - margin; py += gy) add(kind, px, py, fw, fh, round);
  };
  const alongTop = (kind: FurnitureKind, fw: number, fh: number, step: number) => {
    for (let px = x + m; px + fw <= x + w - m; px += step) add(kind, px, y + m, fw, fh);
  };
  switch (room.kind) {
    case "bedroom":
    case "guest-room": {
      const beds = room.kind === "guest-room" && w * h > 14 && rng.chance(0.5) ? 2 : 1;
      for (let k = 0; k < beds; k++) add("bed", x + m + k * 1.8, y + m, 1.4, 2.0);
      add("chest", x + m, y + m + 2.1, 1.0, 0.6);
      add(modern ? "screen" : "wardrobe", x + w - m - 1.2, y + m, 1.2, 0.6);
      add("table", x + w - m - 1.0, y + h - m - 0.8, 1.0, 0.8);
      break;
    }
    case "common-room":
    case "dining":
      alongTop("counter", Math.min(w - 2 * m, 5), 0.7, 99);
      add(modern ? "screen" : "hearth", x + w - m - 1.8, y + h - m - 0.8, 1.8, 0.8);
      grid("round-table", 1.2, 1.2, 2.6, 2.6, true, 1.4);
      // Chairs round every table.
      for (const table of out.filter((f) => f.kind === "round-table")) {
        add("chair", table.x + 0.35, table.y - 0.55, 0.5, 0.45);
        add("chair", table.x + 0.35, table.y + 1.3, 0.5, 0.45);
        add("chair", table.x - 0.55, table.y + 0.35, 0.45, 0.5);
        add("chair", table.x + 1.3, table.y + 0.35, 0.45, 0.5);
      }
      break;
    case "hall":
    case "living-room":
      if (type === "longhouse" && room.kind === "hall") {
        // Hearths down the middle, sleeping places along both long walls.
        for (let px = x + 2; px + 1.4 <= x + w - 2; px += 4) add("hearth", px, y + h / 2 - 0.6, 1.4, 1.2);
        for (let px = x + 0.8; px + 1.4 <= x + w - 0.8; px += 1.8) {
          add("bed", px, y + m, 1.4, 1.6);
          add("bed", px, y + h - m - 1.6, 1.4, 1.6);
        }
        break;
      }
      if (type === "shelter" && room.kind === "hall") {
        add("barrel", x + w / 2 - 0.4, y + h / 2 - 0.4, 0.8, 0.8, true);
        grid("mattress", 0.9, 1.9, 1.5, 2.6, false, 0.5);
        break;
      }
      add(modern ? "sofa" : "hearth", x + w / 2 - 1, y + m, 2, 0.8);
      add(modern ? "sofa" : "bench", x + m, y + h / 2 - 1, 0.8, 2);
      add("table", x + w / 2 - 1, y + h / 2 - 0.6, 2, 1.2);
      add("carpet", x + w / 2 - 1.6, y + h / 2 - 1.2, 3.2, 2.4);
      break;
    case "kitchen":
      add(modern ? "stove" : "hearth", x + m, y + m, 1.8, 0.8);
      add("table", x + w / 2 - 0.8, y + h / 2 - 0.5, 1.6, 1.0);
      add("barrel", x + w - m - 0.8, y + h - m - 0.8, 0.8, 0.8, true);
      alongTop("shelf", 1.2, 0.4, 1.4);
      break;
    case "pantry":
    case "storage":
    case "cellar":
      grid(rng.chance(0.5) ? "barrel" : "crate", 0.8, 0.8, 1.3, 1.3, room.kind !== "storage", 0.5);
      break;
    case "workshop":
      if (type === "smithy") {
        add("forge", x + m, y + m, 1.6, 1.2);
        add("anvil", x + m + 2.2, y + m + 0.5, 0.8, 0.5);
      }
      alongTop("table", 1.8, 0.8, 2.2);
      add("rack", x + w - m - 0.5, y + h - m - 2, 0.5, 2);
      break;
    case "shop-floor":
      if (type === "store") {
        // Aisles of shelving, the tills by the door.
        for (let py = y + 1.6; py + 0.6 <= y + h - 2.6; py += 2.2) add("shelf", x + 1.2, py, w - 2.4, 0.6);
        for (let px = x + 1; px + 1.2 <= x + Math.min(w, 9); px += 2) add("counter", px, y + h - m - 0.8, 1.2, 0.6);
        break;
      }
      add("counter", x + m + 1, y + h / 2 - 0.4, Math.min(3, w - 3), 0.8);
      alongTop("shelf", 1.4, 0.5, 1.6);
      break;
    case "office":
    case "study":
      if (modern && w * h > 20) grid("desk", 1.4, 0.8, 2.4, 2.2, false, 1);
      else {
        add("desk", x + w / 2 - 0.8, y + h / 2 - 0.4, 1.6, 0.8);
        alongTop("shelf", 1.2, 0.4, 1.4);
      }
      break;
    case "nave":
      add("altar", x + w - m - 1.6, y + h / 2 - 1, 1.2, 2);
      for (let px = x + 2; px + 0.6 <= x + w - 4; px += 1.4) {
        add("pew", px, y + 1, 0.6, h / 2 - 2);
        add("pew", px, y + h / 2 + 1, 0.6, h / 2 - 2);
      }
      for (let px = x + 3; px < x + w - 4; px += 4) {
        add("pillar", px, y + 0.4, 0.6, 0.6, true);
        add("pillar", px, y + h - 1, 0.6, 0.6, true);
      }
      break;
    case "chapel":
      add("altar", x + w / 2 - 0.8, y + m, 1.6, 0.8);
      add("pew", x + m + 0.5, y + h / 2, w - 2 * m - 1, 0.5);
      break;
    case "sacristy":
      add("chest", x + m, y + m, 1.2, 0.6);
      alongTop("shelf", 1.2, 0.4, 1.4);
      break;
    case "armory":
      alongTop("rack", 1.6, 0.5, 2);
      add("chest", x + w / 2 - 0.6, y + h - m - 0.7, 1.2, 0.7);
      break;
    case "barracks":
      grid("bunk", 0.9, 2.0, 1.6, 2.8, false, 0.6);
      break;
    case "throne-room":
      add("throne", x + w - m - 1.2, y + h / 2 - 0.6, 1.2, 1.2);
      add("carpet", x + 1, y + h / 2 - 0.8, w - 3, 1.6);
      for (let px = x + 2; px < x + w - 3; px += 3.5) {
        add("pillar", px, y + 1.2, 0.7, 0.7, true);
        add("pillar", px, y + h - 1.9, 0.7, 0.7, true);
      }
      break;
    case "bath":
      add("tub", x + m, y + m, 1.6, 0.8);
      if (modern) add("toilet", x + w - m - 0.6, y + m, 0.6, 0.7);
      break;
    case "toilet":
      for (let px = x + m; px + 0.7 <= x + w - m; px += 1.2) add("toilet", px, y + m, 0.6, 0.7);
      break;
    case "cell":
      add("bench", x + m, y + m, 0.6, 1.8);
      break;
    case "lobby":
    case "waiting-room":
      add("counter", x + w / 2 - 1.5, y + m, 3, 0.8);
      add("plant", x + m, y + m, 0.7, 0.7, true);
      add("plant", x + w - m - 0.7, y + m, 0.7, 0.7, true);
      grid(room.kind === "lobby" ? "sofa" : "chair", room.kind === "lobby" ? 2 : 0.6, 0.8, room.kind === "lobby" ? 3 : 1, 2, false, 2);
      break;
    case "operating-room":
      add("operating-table", x + w / 2 - 1, y + h / 2 - 0.4, 2, 0.8);
      alongTop("screen", 1.2, 0.4, 1.6);
      add("shelf", x + m, y + h - m - 0.5, 1.6, 0.5);
      break;
    case "dance-floor":
      add("booth", x + w - m - 2, y + h / 2 - 1, 2, 2);
      break;
    case "bar":
      add("counter", x + m, y + m + 0.8, w - 2 * m, 0.7);
      alongTop("shelf", 1.4, 0.4, 1.6);
      break;
    case "vip":
      add("sofa", x + m, y + m, 2.4, 0.9);
      add("round-table", x + m + 0.8, y + m + 1.3, 1, 1, true);
      add("sofa", x + m, y + h - m - 0.9, 2.4, 0.9);
      break;
    case "server-room":
      grid("rack", 0.6, 2.2, 1.6, 3, false, 0.8);
      break;
    case "atrium":
      // The rain pool under the open roof, columns round it.
      add("pool", x + w / 2 - w * 0.18, y + h / 2 - h * 0.18, w * 0.36, h * 0.36);
      for (const [px, py] of [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]]) add("pillar", x + w * px - 0.3, y + h * py - 0.3, 0.6, 0.6, true);
      add("plant", x + m, y + m, 0.7, 0.7, true);
      add("plant", x + w - m - 0.7, y + m, 0.7, 0.7, true);
      break;
    case "garden":
      for (let px = x + 0.6; px + 0.6 <= x + w - 0.6; px += 2.4) {
        add("pillar", px, y + 0.6, 0.6, 0.6, true);
        add("pillar", px, y + h - 1.2, 0.6, 0.6, true);
      }
      add("pool", x + w / 2 - 0.9, y + h / 2 - 0.9, 1.8, 1.8);
      grid("plant", 0.8, 0.8, 2.2, 2.2, true, 2);
      break;
    case "classroom":
      add("screen", x + w / 2 - Math.min(2, w / 4), y + m, Math.min(4, w / 2), 0.3);
      add("desk", x + w / 2 - 0.7, y + m + 0.8, 1.4, 0.7);
      grid("desk", 1.2, 0.6, 1.8, 1.5, false, 1.4);
      break;
    case "gym":
      alongTop("rack", 1.6, 0.5, 2.4);
      grid("mat", 2, 1, 3, 2.4, false, 1.4);
      break;
    case "canteen":
      alongTop("counter", Math.min(w - 2 * m, 6), 0.7, 99);
      grid("table", 2, 0.8, 3, 2.4, false, 1.6);
      for (const table of out.filter((f) => f.kind === "table")) {
        add("bench", table.x, table.y - 0.5, 2, 0.4);
        add("bench", table.x, table.y + 0.9, 2, 0.4);
      }
      break;
    case "machine-hall":
      grid("machine", 2.4, 1.6, 4, 3.4, false, 1.2);
      alongTop("crate", 0.9, 0.9, 1.2);
      break;
    case "boiler-room":
    case "generator":
      add("generator", x + m, y + m, Math.min(2.4, w - 1), Math.min(1.8, h - 1));
      if (w > 6) add("generator", x + m + 3, y + m, 2.4, 1.8);
      grid("barrel", 0.8, 0.8, 1.2, 1.2, true, 1.2);
      break;
    case "vault":
      alongTop("locker", 0.9, 0.5, 1);
      grid("chest", 1, 0.6, 1.6, 1.3, false, 1.4);
      break;
    case "ticket-hall":
      alongTop("counter", Math.min(w * 0.5, 8), 0.7, 99);
      grid("bench", 2.4, 0.5, 3.6, 2.2, false, 2);
      break;
    case "platform":
      for (let px = x + 1.5; px + 2.4 <= x + w - 1.5; px += 5) add("bench", px, y + h / 2 - 0.25, 2.4, 0.5);
      for (let px = x + 3; px < x + w - 2; px += 6) add("pillar", px, y + h - 1.2, 0.6, 0.6, true);
      break;
    case "airlock":
    case "changing-room":
      alongTop("locker", 0.6, 0.5, 0.7);
      add("bench", x + m, y + h / 2, w - 2 * m, 0.45);
      break;
    case "grow-room":
      grid("vat", 1.2, 3, 2, 4, false, 1);
      break;
    case "lab":
      alongTop("table", 2.4, 0.8, 2.8);
      add("table", x + w / 2 - 1.5, y + h / 2 - 0.5, 3, 1);
      add("screen", x + m, y + h - m - 0.4, 1.4, 0.4);
      add("shelf", x + w - m - 1.6, y + h - m - 0.5, 1.6, 0.5);
      break;
    case "capsules":
      grid("pod", 1.1, 2.2, 1.35, 2.5, false, 0.4);
      break;
    case "pool-room":
      add("pool", x + 1.2, y + 1.2, w - 2.4, h - 2.4);
      for (const [px, py] of [[x + 0.3, y + 0.3], [x + w - 0.9, y + 0.3], [x + 0.3, y + h - 0.9], [x + w - 0.9, y + h - 0.9]]) add("pillar", px, py, 0.6, 0.6, true);
      break;
    case "furnace":
      add("forge", x + m, y + m, Math.min(2.4, w - 1), Math.min(1.6, h - 1));
      grid("log", 1.6, 0.4, 2, 0.8, false, 1.2);
      break;
    case "garage":
      alongTop("table", 2, 0.8, 2.4);
      add("rack", x + w - m - 0.5, y + h - m - 2, 0.5, 2);
      grid("crate", 0.9, 0.9, 2.2, 2.2, false, 1.6);
      break;
    case "vestibule":
      // Somewhere to sit and pull off boots, pegs for coats.
      add("bench", x + m, y + m, Math.min(1.6, w - 2 * m), 0.45);
      add("rack", x + w - m - 0.4, y + m, 0.4, Math.min(1.4, h - 2 * m));
      break;
    case "attic":
      grid(rng.chance(0.5) ? "chest" : "crate", 0.9, 0.7, 1.8, 1.6, false, 0.7);
      break;
    case "lantern":
      add("lantern", x + w / 2 - 0.9, y + h / 2 - 0.9, 1.8, 1.8, true);
      break;
    case "mill-room":
      add("millstone", x + m + 0.4, y + m + 0.4, 2.2, 2.2, true);
      if (w > 7) add("millstone", x + m + 3.2, y + m + 0.4, 2.2, 2.2, true);
      grid("crate", 0.8, 0.8, 1.2, 1.2, false, 1.6);
      break;
    case "stage":
      add("stage", x + m, y + m, w - 2 * m, h - 2 * m);
      break;
    case "auditorium":
    case "stands":
      for (let py = y + 0.8; py + 0.8 <= y + h - 0.8; py += 1.1) add(room.kind === "stands" ? "stands" : "bench", x + 1, py, w - 2, 0.6);
      break;
    case "arena-floor":
      add("pillar", x + w / 2 - 0.4, y + h / 2 - 0.4, 0.8, 0.8, true);
      break;
    case "guard-room":
      add("table", x + w / 2 - 0.9, y + h / 2 - 0.5, 1.8, 1);
      for (const [dx, dy] of [[0.3, -0.55], [0.9, -0.55], [0.3, 1.05], [0.9, 1.05]]) add("chair", x + w / 2 - 0.9 + dx, y + h / 2 - 0.5 + dy, 0.45, 0.45);
      alongTop("rack", 1.4, 0.45, 1.8);
      break;
    case "ballroom":
      add("carpet", x + 1.2, y + 1.2, w - 2.4, h - 2.4);
      for (let px = x + 1; px < x + w - 1.4; px += 3.6) {
        add("pillar", px, y + 0.4, 0.6, 0.6, true);
        add("pillar", px, y + h - 1, 0.6, 0.6, true);
      }
      add("plant", x + m, y + h / 2 - 0.35, 0.7, 0.7, true);
      break;
    case "gallery":
      alongTop("shelf", 1.6, 0.35, 2.4);
      for (let px = x + 1.2; px + 1.8 <= x + w - 1.2; px += 3.6) add("bench", px, y + h / 2 - 0.25, 1.8, 0.45);
      break;
    case "ritual-room": {
      const r = Math.min(w, h) * 0.3;
      add("circle", x + w / 2 - r, y + h / 2 - r, r * 2, r * 2, true);
      add("altar", x + m, y + m, 1, 0.6);
      add("shelf", x + w - m - 1.2, y + m, 1.2, 0.4);
      break;
    }
    default:
      break;
  }
  return out;
}

export function buildingParams(input: Partial<BuildingParams> = {}): BuildingParams {
  const seed = input.seed || Math.floor(Math.random() * 1e9).toString(36);
  const rng = createRng(seed).fork("building-params");
  const type = input.type ?? rng.pick(FIRST_TYPES);
  // The game master's own type brings its size, floors and cellar.
  const own = type === "custom" ? input.customType : undefined;
  const [w0, w1, d0, d1] = own ? [own.width, own.width, own.depth, own.depth] : SIZES[type];
  const [f0, f1] = own ? [own.floors, own.floors] : BUILDING_FLOORS[type];
  return {
    seed,
    type,
    era: input.era ?? TYPE_ERA[type] ?? "medieval",
    name: "",
    width: Math.round(rng.float(w0, w1)),
    depth: Math.round(rng.float(d0, d1)),
    floors: rng.int(f0, f1),
    cellar: own ? own.cellar.length > 0 : !["temple", "hut", "longhouse", "shelter", "bathhouse", "station", "store", "hab", "hydroponics", "domus", "arena", "lighthouse"].includes(type) && rng.chance(type === "bunker" ? 1 : 0.6),
    yard: ["house", "manor", "tavern", "smithy", "shop", "clinic", "hut", "longhouse", "shelter", "trading-post", "mill"].includes(type),
    ...(TYPE_SHAPE[type] ? { shape: TYPE_SHAPE[type] } : {}),
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
  };
}

/** What each age has in place of a piece, applied to a whole room. */
export function forAge(furniture: Furniture[], era: Era): Furniture[] {
  return furniture.flatMap((item) => {
    const swap = AGE_FURNITURE[era]?.[item.kind];
    return swap === null ? [] : swap ? [{ ...item, kind: swap, round: swap === "pot" || item.round }] : [item];
  });
}

/** The ages of machines, which furnish with sofas and screens. */
export const machineAge = (era: Era) => era === "modern" || era === "cyberpunk" || era === "industrial" || era === "far-future" || era === "post-apocalypse";

export function generateBuilding(input: Partial<BuildingParams> = {}): BuildingPlan {
  const params = buildingParams(input);
  const rng = createRng(params.seed).fork("building");
  const modern = machineAge(params.era);
  // A one-storey kind (a nave, a hut) never stacks itself; anything else rises as high as asked.
  const storeys = BUILDING_FLOORS[params.type][1] === 1 ? 1 : Math.max(1, Math.min(params.floors, MAX_FLOORS));
  // A loft goes on top; it is no storey of its own.
  const levels = [...(params.cellar ? [-1] : []), ...Array.from({ length: storeys }, (_, k) => k), ...(params.attic ? [storeys] : [])];
  if (params.shape && params.shape !== "rect") {
    const shaped = shapedPlan(params, levels, storeys, rng, modern);
    if (shaped) return dress(shaped);
  }
  // The long side runs along x; the street (and the front door) is on the bottom side, y = depth.
  const W = Math.max(params.width, params.depth, 5);
  const D = Math.max(4, Math.min(params.width, params.depth));
  const multi = levels.length > 1;
  const stairsW = multi ? Math.min(2.8, W * 0.25) : 0;
  const stairsH = Math.min(4.2, D * 0.5);
  const floors: Floor[] = [];

  for (const level of levels) {
    const own = rng.fork(`floor-${level}`);
    const plan = params.attic && level === storeys ? ATTIC : program(params.type, level, storeys - 1, own, modern, params.customType);
    const rects: { rect: Rect; kind: RoomKind }[] = [];
    const main: Rect = { x: 0, y: 0, w: W - stairsW, h: D };
    if (multi) {
      rects.push({ rect: { x: W - stairsW, y: 0, w: stairsW, h: stairsH }, kind: "stairs" });
      rects.push({ rect: { x: W - stairsW, y: stairsH, w: stairsW, h: D - stairsH }, kind: plan.corridor ? "corridor" : level < 0 ? "cellar" : level === 0 ? "storage" : "corridor" });
    }
    if (plan.corridor && D >= 8) {
      const cw = 1.6;
      const top = (D - cw) / 2;
      rects.push({ rect: { x: 0, y: top, w: main.w, h: cw }, kind: "corridor" });
      const half = Math.ceil(plan.rooms.length / 2);
      slice({ x: 0, y: 0, w: main.w, h: top }, plan.rooms.slice(0, half), rects, "x");
      if (plan.rooms.length > half) slice({ x: 0, y: top + cw, w: main.w, h: D - top - cw }, plan.rooms.slice(half), rects, "x");
    } else slice(main, own.shuffle([...plan.rooms]).sort((a, b) => Number(CIRCULATION.has(b[0])) - Number(CIRCULATION.has(a[0]))), rects);
    const rooms: Room[] = rects.map(({ rect, kind }, id) => ({ id, kind, ...rect, furniture: [] }));

    // Doors: a tree from the main room (or hallway) so every room can be reached, plus the front door.
    const doors: Door[] = [];
    const root = rooms.find((room) => room.kind === "corridor") ?? rooms.find((room) => CIRCULATION.has(room.kind) && room.kind !== "stairs") ?? rooms[0];
    const reached = new Set([root.id]);
    const queue = [root];
    const addDoor = (a: Room, b: Room) => {
      const wall = sharedWall(a, b)!;
      const len = wall.horizontal ? wall.to[0] - wall.from[0] : wall.to[1] - wall.from[1];
      const t = own.float(0.3, 0.7) * (len - 1.2) + 0.6;
      const at: Point = wall.horizontal ? [wall.from[0] + t, wall.from[1]] : [wall.from[0], wall.from[1] + t];
      doors.push({ at, horizontal: wall.horizontal, width: CIRCULATION.has(a.kind) && CIRCULATION.has(b.kind) ? 1.4 : 0.9, rooms: [a.id, b.id] });
    };
    while (queue.length) {
      const room = queue.shift()!;
      const options = rooms.filter((other) => !reached.has(other.id) && sharedWall(room, other)).sort((a, b) => Number(CIRCULATION.has(b.kind)) - Number(CIRCULATION.has(a.kind)));
      for (const other of options) {
        if (reached.has(other.id)) continue;
        reached.add(other.id);
        addDoor(room, other);
        queue.push(other);
      }
    }
    // Rooms the tree missed (no shared wall with a reached room) are joined to any neighbour.
    for (const room of rooms) {
      if (reached.has(room.id)) continue;
      const other = rooms.find((candidate) => candidate !== room && sharedWall(room, candidate));
      if (other) addDoor(room, other);
    }
    if (level === 0) {
      // The front door opens into a room for guests (a hall, a shop floor), not a store under the stairs.
      const welcome = (room: Room) => (BACK_ROOMS.has(room.kind) ? 0 : CIRCULATION.has(room.kind) ? 2 : 1);
      const front = rooms.filter((room) => Math.abs(room.y + room.h - D) < 0.01 && room.kind !== "stairs").sort((a, b) => welcome(b) - welcome(a) || b.w - a.w)[0];
      if (front) doors.push({ at: [front.x + front.w / 2, D], horizontal: true, width: ["temple", "keep", "warehouse", "factory", "station", "store", "bathhouse", "hydroponics", "bunker"].includes(params.type) ? 2.4 : 1.2, rooms: [front.id, -1] });
      // A back door to the yard (or a service door of a big house): from the kitchen, else a workshop or a store.
      const service = (room: Room) => (room.kind === "kitchen" ? 3 : room.kind === "workshop" ? 2 : ["storage", "pantry", "hall", "common-room", "corridor"].includes(room.kind) ? 1 : 0);
      const wanted = params.type !== "bunker" && (params.yard || W * D >= 150);
      const back = rooms.filter((room) => room.y < 0.01 && room.kind !== "stairs" && (wanted ? service(room) > 0 : room.kind === "kitchen")).sort((a, b) => service(b) - service(a) || b.w - a.w)[0];
      if (back) doors.push({ at: [back.x + back.w / 2, 0], horizontal: true, width: 0.9, rooms: [back.id, -1] });
    }

    // Windows along the outer walls, kept clear of the doors.
    const windows: Opening[] = [];
    if (level >= 0) {
      for (const room of rooms) {
        if (["storage", "cellar", "stairs", "corridor", "server-room", "cell", "pantry", "toilet", "vault", "generator", "boiler-room", "furnace", "capsules", "airlock"].includes(room.kind) || params.type === "bunker") continue;
        const sides: [Point, Point, boolean][] = [];
        if (room.y < 0.01) sides.push([[room.x, 0], [room.x + room.w, 0], true]);
        if (Math.abs(room.y + room.h - D) < 0.01) sides.push([[room.x, D], [room.x + room.w, D], true]);
        if (room.x < 0.01) sides.push([[0, room.y], [0, room.y + room.h], false]);
        if (Math.abs(room.x + room.w - W) < 0.01) sides.push([[W, room.y], [W, room.y + room.h], false]);
        for (const [a, b, horizontal] of sides) {
          const len = horizontal ? b[0] - a[0] : b[1] - a[1];
          const step = modern ? 2.2 : 3;
          for (let t = step / 2; t < len - 0.8; t += step) {
            const at: Point = horizontal ? [a[0] + t, a[1]] : [a[0], a[1] + t];
            if (doors.some((door) => Math.hypot(door.at[0] - at[0], door.at[1] - at[1]) < 1.4)) continue;
            const half = modern ? 0.8 : 0.5;
            windows.push(horizontal ? { a: [at[0] - half, at[1]], b: [at[0] + half, at[1]] } : { a: [at[0], at[1] - half], b: [at[0], at[1] + half] });
          }
        }
      }
    }
    for (const room of rooms) room.furniture = forAge(furnish(room, doors.filter((door) => door.rooms.includes(room.id)), params.type, modern, own), params.era);
    floors.push({ level, rooms, doors, windows });
  }
  params.floors = storeys;
  return dress({ params: { ...params, width: W, depth: D }, floors, yard: yardOf(params, W, D, rng, modern) });
}

/** The yard: a fenced plot round the house with what a household keeps outside. */
function yardOf(params: BuildingParams, W: number, D: number, rng: Rng, modern: boolean): BuildingPlan["yard"] {
  let yard: BuildingPlan["yard"] = null;
  if (params.yard) {
    const own = rng.fork("yard");
    const margin = { left: own.float(2, 6), right: own.float(3, 8), back: own.float(4, 10), front: own.float(1.5, 3) };
    const bounds = { x: -margin.left, y: -margin.back, w: W + margin.left + margin.right, h: D + margin.back + margin.front };
    const features: YardFeature[] = [];
    const freeBack = { x: bounds.x + 0.8, y: bounds.y + 0.8, w: bounds.w - 1.6, h: margin.back - 1.6 };
    if (freeBack.h > 2) {
      features.push({ kind: modern ? "fountain" : "well", x: freeBack.x + own.float(0, freeBack.w - 1.5), y: freeBack.y + own.float(0, freeBack.h - 1.5), w: 1.5, h: 1.5 });
      if (params.type === "tavern" && freeBack.h > 4) features.push({ kind: "stable", x: freeBack.x + freeBack.w - 7, y: freeBack.y, w: 7, h: Math.min(4, freeBack.h) });
      else if (!modern) for (let k = 0; k < 3; k++) features.push({ kind: "bed", x: freeBack.x + 2 + k * 2.2, y: freeBack.y + 0.3, w: 1.6, h: Math.min(3, freeBack.h - 0.6) });
      else features.push({ kind: "parking", x: freeBack.x, y: freeBack.y, w: Math.min(10, freeBack.w), h: Math.min(5, freeBack.h) });
    }
    const side = { x: W + 0.8, y: bounds.y + 1, w: margin.right - 1.6, h: bounds.h - 2 };
    if (side.w > 1.5) {
      for (let k = own.int(1, 3); k > 0; k--) features.push({ kind: "tree", x: side.x + own.float(0, side.w - 1.6), y: side.y + own.float(0, side.h - 1.6), w: 1.6, h: 1.6 });
      if (!modern && side.w > 2.5) features.push({ kind: own.chance(0.5) ? "hay" : "cart", x: side.x, y: D - 3, w: Math.min(2.4, side.w), h: 1.8 });
      if (side.w > 3 && own.chance(0.6)) features.push({ kind: "shed", x: side.x, y: side.y, w: Math.min(3.5, side.w), h: 3 });
    }
    // A watermill's wheel turns against its side wall.
    if (params.type === "mill") features.push({ kind: "wheel", x: W + 0.2, y: D / 2 - 1.6, w: 1.2, h: 3.2 });
    yard = { bounds, features };
  }
  return yard;
}

/** A winged or round building, or null when its footprint is too small for the shape (it is then built plain). */
function shapedPlan(params: BuildingParams, levels: number[], storeys: number, rng: Rng, modern: boolean): BuildingPlan | null {
  const multi = levels.length > 1;
  if (params.shape === "round") {
    const R = Math.max(6, Math.min(params.width, params.depth));
    const floors = roundFloors(params, R, levels, storeys - 1, rng, modern).map((floor) => ({ ...floor, rooms: floor.rooms.map((room) => ({ ...room, furniture: forAge(room.furniture, params.era) })) }));
    return { params: { ...params, floors: storeys, width: R, depth: R }, floors, yard: yardOf(params, R, R, rng, modern) };
  }
  const W = Math.max(params.width, params.depth, 5);
  const D = Math.max(4, Math.min(params.width, params.depth));
  const layout = wingsOf(params.shape, W, D, params.seed, multi, W * D >= 380);
  if (!layout) return null;
  const floors = wingedFloors(params, W, D, levels, storeys - 1, rng, modern, layout).map((floor) => ({ ...floor, rooms: floor.rooms.map((room) => ({ ...room, furniture: forAge(room.furniture, params.era) })) }));
  return {
    params: { ...params, floors: storeys, width: W, depth: D },
    floors,
    yard: yardOf(params, W, D, rng, modern),
    wings: layout.wings,
    ...(layout.court ? { court: { rect: layout.court, features: courtFeatures(layout.court, modern) } } : {}),
  };
}
