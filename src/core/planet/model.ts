// The planet level's data: a world map of thousands of Voronoi cells with relief, climate, water, life and peoples.
// Index 0 of every entity list is a placeholder for "none" (open sea, wild lands, no culture), so typed arrays can
// hold ids directly.
import type { CityFaith, CityRoad } from "../city/model";
import type { Point } from "../geometry";
import type { Language } from "../language";
import type { Mesh } from "../mesh";
import type { Setting } from "../setting";
import type { TemplateId } from "./heightmap";
import type { History } from "./history";

export const SEA_LEVEL = 20;

export interface PlanetParams {
  seed: string;
  /** A fixed name (a world named in its star system); empty to name it in its first people's tongue. */
  name?: string;
  /** For a close-up: the seed of the world it was cut from, so its realms and towns keep their arms. */
  world?: string;
  /** The world's age and setting; none is the medieval world with a few wonders. */
  setting?: Partial<Setting>;
  width: number;
  height: number;
  /** Number of Voronoi cells: detail versus speed (2 000 – 50 000). */
  cells: number;
  template: TemplateId;
  /** Latitudes at the map's top and bottom edges, in degrees. */
  latitudeNorth: number;
  latitudeSouth: number;
  /** Mean temperatures at the equator and the poles, °C. */
  temperatureEquator: number;
  temperaturePole: number;
  /** Rain multiplier: 1 is Earth-like, 0.3 a dry world, 2 a wet one. */
  precipitation: number;
  /** Height of the highest peak, metres. */
  peakHeight: number;
  cultures: number;
  states: number;
  /** Towns besides capitals; 0 picks a count from the map size. */
  towns: number;
  /** Share of towns that head a province (0–1). */
  provinceShare: number;
  /** A world nobody lives on: no peoples, towns, realms or faiths, only the land, its waters and their names. */
  lifeless?: boolean;
  /** Years of history lived before the map: realms, towns, wars and rulers come out of it. None: the map is drawn at once. */
  history?: number;
  /** How far realms reach (1 the usual; more for great empires, less for many small lands). */
  growth?: number;
  /** The GM's own relief recipe (see parseRecipe), used instead of the template's. */
  recipe?: string;
  /** The share of the map that is land (0–1); none keeps what the relief gives. */
  land?: number;
  /** Stages thrown again, each so many times, leaving the rest of the world as it was (see REROLL_STAGES). */
  reroll?: Partial<Record<RerollStage, number>>;
  /** Peoples speak tongues of this many families (daughters of one proto-language sound alike); none: each its own. */
  families?: number;
}

/** The stages of a world that can be thrown again on their own: everything after a stage follows from it. */
export const REROLL_STAGES = ["peoples", "towns", "realms", "faiths", "names", "places"] as const;
export type RerollStage = (typeof REROLL_STAGES)[number];

export type FeatureKind = "ocean" | "lake" | "continent" | "island" | "isle";

export interface WaterOrLand {
  id: number;
  kind: FeatureKind;
  land: boolean;
  cells: number;
  /** Touches the map's edge (oceans always do). */
  border: boolean;
  name: string;
  /** A lake with no outlet: its water is salt. */
  salt?: boolean;
}

/** The dictionary word for a sea, a lake (a salt one) or a landmass. */
export const featureWord = (feature: Pick<WaterOrLand, "kind" | "salt">): string => (feature.salt ? "salt-lake" : feature.kind);

/** What open water loses to the sun in a year, mm: little in the cold, a metre and more in the hot lands. */
export const evaporationOf = (temperature: Float32Array): Float32Array => temperature.map((t) => Math.max(0, 50 * (t + 2)));

export interface River {
  id: number;
  name: string;
  /** Cells from source to mouth. */
  cells: number[];
  /** Where it meets the sea, a lake or its parent river. */
  mouth: Point;
  /** Water flowing out at the mouth, in m³/s. */
  discharge: number;
  /** Length in km. */
  length: number;
  /** The river it flows into, 0 for the sea or a lake. */
  parent: number;
  /** Width at the mouth in map units, for drawing. */
  width: number;
}

export type CultureKind = "generic" | "river" | "lake" | "naval" | "nomadic" | "highland" | "hunting";

export interface Culture {
  id: number;
  name: string;
  kind: CultureKind;
  language: Language;
  center: number;
  color: string;
  expansionism: number;
  cells: number;
  population: number;
  /** The family of tongues its language belongs to, when the world has families. */
  family?: string;
}

export interface Burg {
  id: number;
  name: string;
  cell: number;
  x: number;
  y: number;
  culture: number;
  state: number;
  province: number;
  capital: boolean;
  port: boolean;
  /** In a close-up: the id of the planet's town this one is. */
  origin?: number;
  /** Razed by the GM: kept only so other towns keep their ids. */
  removed?: boolean;
  /** In a close-up: a village or a hamlet rather than one of the planet's towns. */
  tier?: "village" | "hamlet";
  /** In a close-up, one of the planet's towns: what its city takes from where it stands on the planet, so it opens as
   * the same city from either map. */
  site?: TownSite;
  /** Thousands of people. */
  population: number;
  walls: boolean;
  citadel: boolean;
  temple: boolean;
  market: boolean;
  shanty: boolean;
  kind: CultureKind;
}

/** What a town's city takes from the map round it: the way to the sea and the way the river runs (radians, null for
 * none), the roads of the world leaving it, the faith of its land, and its biome. */
export interface TownSite {
  coast: number | null;
  river: number | null;
  roads: CityRoad[];
  faith?: CityFaith;
  biome?: string;
}

export type StateForm = "monarchy" | "republic" | "theocracy" | "union" | "tribal" | "horde" | "free-city" | "magocracy" | "dictatorship" | "corporate" | "machine" | "colony" | "warlord";

export type Relation = "ally" | "friendly" | "neutral" | "suspicion" | "rival" | "enemy" | "vassal" | "suzerain";

export interface State {
  id: number;
  name: string;
  /** The full name: "Kingdom of X", "X Republic"; a localisation key plus the name. */
  formKey: string;
  form: StateForm;
  color: string;
  capital: number;
  culture: number;
  expansionism: number;
  cells: number;
  area: number;
  burgs: number;
  rural: number;
  urban: number;
  /** Where its name is drawn, and how large. */
  pole: Point;
  neighbors: number[];
  relations: Record<number, Relation>;
  /** The realm of the world's history it is, when the history was lived. */
  polity?: number;
}

export interface Province {
  id: number;
  name: string;
  formKey: string;
  state: number;
  center: number;
  burg: number;
  color: string;
  cells: number;
  pole: Point;
}

/** Folk faiths of one people, churches spread from a holy city, cults round one town, heresies split from a church. */
export type ReligionKind = "folk" | "organized" | "cult" | "heresy";
export type ReligionForm =
  | "shamanism"
  | "animism"
  | "ancestors"
  | "nature"
  | "sky"
  | "monotheism"
  | "pantheon"
  | "dualism"
  | "henotheism"
  | "philosophy"
  | "mystery"
  | "sun"
  | "moon"
  | "fire"
  | "death"
  | "serpent"
  | "dragon"
  | "machine"
  | "cosmic";

export interface Religion {
  id: number;
  name: string;
  kind: ReligionKind;
  form: ReligionForm;
  /** The god, the chief of the gods or the founder they revere. */
  deity: string;
  color: string;
  culture: number;
  /** The holy city (a burg), 0 for folk faiths. */
  center: number;
  /** The church a heresy broke from. */
  parent: number;
  cells: number;
  /** Square km. */
  area: number;
  /** Thousands. */
  followers: number;
}

/** Air routes join the great cities of an age of flight in a straight line. */
export type RouteKind = "highway" | "road" | "trail" | "sea" | "air";

export interface Route {
  id: number;
  kind: RouteKind;
  cells: number[];
  /** Length in km. */
  length: number;
  /** A close-up's share of its planet's roads: kept when its own are relaid. */
  given?: boolean;
}

export type MarkerKind =
  | "waterfall"
  | "rapids"
  | "ford"
  | "pass"
  | "reef"
  | "volcano"
  | "hot-spring"
  | "mine"
  | "bridge"
  | "lighthouse"
  | "ruins"
  | "battlefield"
  | "monastery"
  | "cave"
  | "sacred-grove"
  | "shipwreck"
  | "brigands"
  | "inn"
  | "watchtower"
  | "giant-tree"
  | "portal"
  | "megalith"
  | "hunting-ground"
  | "tomb"
  | "oracle"
  | "factory"
  | "dam"
  | "power-plant"
  | "oil-field"
  | "base"
  | "airport"
  | "arcology"
  | "data-haven"
  | "toxic-zone"
  | "spaceport"
  | "space-elevator"
  | "terraformer"
  | "biodome"
  | "crater"
  | "radiation"
  | "crash-site"
  | "bunker"
  | "wizard-tower"
  | "ley-nexus";

export interface Marker {
  id: number;
  kind: MarkerKind;
  cell: number;
  x: number;
  y: number;
  name: string;
  /** Facts a legend is written from: who, what, when. */
  facts: Record<string, string | number>;
  /** In a close-up: the id of the planet's place this one is. */
  origin?: number;
}

/** A lordship (a district in later ages): the land round a seat, a town or a market village. */
export interface Fief {
  id: number;
  /** The town or village that holds it. */
  seat: number;
  state: number;
  cells: number;
}

export type LandformKind = "forest" | "marsh" | "hills" | "mountains" | "peak" | "desert" | "heath";

/** A named stretch of land in a close-up: a wood, a marsh, a range of hills, a summit. */
export interface Landform {
  id: number;
  kind: LandformKind;
  name: string;
  /** Where its name stands. */
  x: number;
  y: number;
  cells: number;
  /** A summit's own cell. */
  cell?: number;
}

export interface Planet {
  params: PlanetParams;
  /** How the world came to be as it is, when its history was lived. */
  history?: History;
  /** The GM's own words and zones on the map (from the world editor). */
  gmLabels?: [number, number, string, number][];
  gmZones?: [number, number, number, string, string?][];
  /** A print of the GM's relief strokes when the world was regrown under them. */
  relief?: string;
  /** The world's own name, in the tongue of its first people. */
  name: string;
  mesh: Mesh;
  /** 0–100, sea level at 20. */
  height: Float32Array;
  /** 1 for seas and lakes (lakes may lie above sea level). */
  water: Uint8Array;
  feature: Int32Array;
  features: WaterOrLand[];
  /** Distance to the coast in cells: 1, 2, 3… on land, -1, -2, -3… in water. */
  coast: Int8Array;
  /** °C, yearly mean. */
  temperature: Float32Array;
  /** mm a year. */
  precipitation: Float32Array;
  /** Water passing through a cell, m³/s. */
  flux: Float32Array;
  river: Int32Array;
  rivers: River[];
  biome: Uint8Array;
  /** Rural population per cell, thousands. */
  population: Float32Array;
  culture: Uint16Array;
  cultures: Culture[];
  religion: Uint16Array;
  religions: Religion[];
  /** Share of people who keep no faith (modern and later ages). */
  secular?: number;
  burg: Int32Array;
  burgs: Burg[];
  state: Uint16Array;
  states: State[];
  province: Uint16Array;
  provinces: Province[];
  routes: Route[];
  markers: Marker[];
  /** Km per map unit. */
  scale: number;
  /** A close-up's frame on the map it was cut from: x0, y0, x1, y1 in that map's units. */
  frame?: [number, number, number, number];
  /** A close-up's countryside: what each cell's land is used for (see LAND_USE), its lordships and named land. */
  landUse?: Uint8Array;
  fief?: Uint16Array;
  fiefs?: Fief[];
  landforms?: Landform[];
}

/** The physical world peoples settle on. */
export type Ground = Pick<Planet, "params" | "mesh" | "height" | "water" | "feature" | "features" | "coast" | "temperature" | "precipitation" | "flux" | "river" | "rivers" | "biome" | "scale">;
