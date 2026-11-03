// A building on a city map, opened as a floor plan: its footprint from the drawn outline (the smallest rectangle
// around it), its purpose from the quarter it stands in, any landmark there and the city's age, its height from the map.
// The city hands down more: the quarter's wealth, a shop's craft, the street the door opens on and whether the house
// stands wall to wall with its neighbours, how far it has decayed, the world's magic, and its owner — the place's owner
// of the city, with the faction they answer to — so the people inside are the city's people.
import { PROPS, type City } from "../city/model";
import { addressOf, cityFactions, placeFaction, placeOwnerKey, placeOwnerRole, wardHolder } from "../city/society";
import type { Point } from "../geometry";
import { pointInPolygon } from "../polygon";
import { hashString } from "../random";
import { craftFor } from "./crafts";
import { BUILDING_FLOORS, ERA_BUILDINGS, MAX_FLOORS, buildingParams, type BuildingOwner, type BuildingParams, type BuildingType } from "./plan";
import type { Planet } from "../planet/model";
import { ageOf, settingOf } from "../setting";
import type { Era } from "../city/model";

/** Sides of the smallest rectangle around a convex outline (rotating each edge onto the x-axis). */
export function footprint(polygon: Point[]): [number, number] {
  let best: [number, number] = [0, 0];
  let bestArea = Infinity;
  for (let k = 0; k < polygon.length; k++) {
    const [ax, ay] = polygon[k];
    const [bx, by] = polygon[(k + 1) % polygon.length];
    const angle = Math.atan2(by - ay, bx - ax);
    const c = Math.cos(-angle),
      s = Math.sin(-angle);
    const xs = polygon.map(([x, y]) => x * c - y * s);
    const ys = polygon.map(([x, y]) => x * s + y * c);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    if (w * h < bestArea) {
      bestArea = w * h;
      best = [w, h];
    }
  }
  return best;
}

const BY_LANDMARK: Record<string, BuildingType> = {
  tavern: "tavern",
  temple: "temple",
  keep: "keep",
  smithy: "smithy",
  guildhall: "guildhall",
  bathhouse: "bathhouse",
  docks: "warehouse",
  barracks: "barracks",
  "town-hall": "manor",
  station: "station",
  hospital: "clinic",
  police: "police",
  factory: "factory",
  "corp-hq": "office",
  ripperdoc: "clinic",
  "netrunner-den": "apartment",
  club: "club",
  "night-market": "shop",
  "gang-hq": "club",
  museum: "manor",
  university: "school",
  "chief-hut": "hut",
  "flint-workshop": "hut",
  theatre: "theatre",
  library: "manor",
  gymnasium: "manor",
  agora: "shop",
  lab: "lab",
  "ai-core": "lab",
  "garden-dome": "hydroponics",
  "launch-pad": "station",
  "barter-market": "trading-post",
  "water-still": "factory",
  "raider-fort": "bunker",
  "vault-door": "bunker",
  "radio-tower": "bunker",
  scrapyard: "warehouse",
  lighthouse: "lighthouse",
  mill: "mill",
  stadium: "arena",
  arena: "arena",
  palace: "palace",
  cathedral: "temple",
  bank: "bank",
  "mage-tower": "mage-tower",
  prison: "prison",
};

/** The building at a map point, if any (not trees, fields, graves or piers). */
export function buildingAt(city: City, point: Point): number {
  return city.buildings.findIndex((b) => !PROPS.includes(b.kind) && pointInPolygon(point, b.polygon));
}

/** The landmark standing on a building, if any. */
const landmarkOn = (city: City, index: number) => {
  const building = city.buildings[index];
  return city.landmarks.find((l) => l.ward === building.ward && pointInPolygon([l.x, l.y], building.polygon));
};

/** What a building of the city is: by any place on it, its quarter, its age and its own look. */
export function buildingTypeOf(city: City, index: number): BuildingType {
  const building = city.buildings[index];
  const ward = city.wards.find((w) => w.id === building.ward);
  const landmark = landmarkOn(city, index);
  const modern = ["modern", "cyberpunk", "industrial", "far-future", "post-apocalypse"].includes(city.params.era);
  const era = city.params.era;
  // A stable draw per building (a product taken modulo k only cycled with the index: every fifth house a smithy).
  const pick = (k: number, salt = "") => hashString(`${city.params.seed}/building-${building.key ?? index}${salt}`) % k;
  // A place of the game master's own kind opens as the building it is meant to be.
  const custom = landmark?.custom ? city.params.custom?.places.find((place) => place.id === landmark.custom) : undefined;
  if (custom?.opens === "building" && custom.target) return custom.target.startsWith("custom:") ? "custom" : (custom.target as BuildingType);
  if (building.kind === "hut" || building.kind === "longhouse") return building.kind;
  if (landmark && BY_LANDMARK[landmark.kind]) return BY_LANDMARK[landmark.kind];
  if (era === "stone") return "hut";
  // Each age's own houses: a Roman's atrium house or a tenement block, a worker's tenement, a habitat module, a
  // survivor's shack.
  if (era === "ancient" && building.kind === "house" && ward && ["patriciate", "merchants", "administration"].includes(ward.kind)) return "domus";
  if (era === "ancient" && building.kind === "house" && ward && ["craftsmen", "slum", "suburb"].includes(ward.kind)) return building.floors >= 2 ? "insula" : pick(3) ? "domus" : "shop";
  if (era === "industrial" && building.kind === "house" && ward && ["craftsmen", "slum", "old-town", "residential"].includes(ward.kind)) return pick(4) ? "tenement" : "shop";
  if (era === "industrial" && building.kind === "industrial") return pick(3) ? "factory" : "warehouse";
  if ((era === "modern" || era === "cyberpunk") && building.kind === "industrial") return pick(2) ? "factory" : "warehouse";
  if ((era === "modern" || era === "cyberpunk") && building.kind === "house" && ward && ["commercial", "downtown"].includes(ward.kind)) return "store";
  if (era === "cyberpunk" && building.kind === "tower" && ward && ["megablock", "combat-zone"].includes(ward.kind) && !pick(4)) return "capsule-hotel";
  if (era === "far-future" && (building.kind === "tower" || building.kind === "house")) return ward?.kind === "campus" ? "lab" : ward && ["commercial", "arcology"].includes(ward.kind) ? (pick(3) ? "office" : "store") : "hab";
  if (era === "far-future" && building.kind === "industrial") return pick(2) ? "hydroponics" : "factory";
  if (era === "post-apocalypse" && (building.kind === "house" || building.kind === "ruin")) return ward?.kind === "settlement" && !pick(5) ? "trading-post" : "shelter";
  if (era === "post-apocalypse" && building.kind === "industrial") return pick(2) ? "smithy" : "warehouse";
  if (era === "renaissance" && building.kind === "house" && ward?.kind === "merchants" && !pick(9)) return "bank";
  if (era === "renaissance" && building.kind === "house" && ward?.kind === "administration") return "guildhall";
  if (building.kind === "landmark") return ward?.kind === "temple" || ward?.kind === "cemetery" ? "temple" : ward?.kind === "castle" ? "keep" : "manor";
  if (building.kind === "tower") return ward && ["megablock", "residential", "combat-zone"].includes(ward.kind) ? "apartment" : "office";
  if (building.kind === "industrial") return "warehouse";
  if (ward) {
    if (["patriciate", "rich-residential", "administration"].includes(ward.kind)) return "manor";
    if (["merchants", "commercial"].includes(ward.kind)) return "shop";
    if (ward.kind === "craftsmen") return pick(5, "craft") === 0 ? "smithy" : pick(3, "shop") === 0 ? "shop" : "house";
    if (ward.kind === "residential" || ward.kind === "megablock") return modern && building.floors >= 3 ? "apartment" : "house";
    if (ward.kind === "harbour" || ward.kind === "port") return "warehouse";
  }
  return "house";
}

/** How far a house has gone to ruin, by its quarter and the age. */
function decayOf(city: City, index: number): number | undefined {
  const building = city.buildings[index];
  const ward = city.wards.find((w) => w.id === building.ward)?.kind;
  if (building.kind === "ruin") return 0.85;
  if (ward === "wasteland" || ward === "ruins") return 0.7;
  if (city.params.era === "post-apocalypse") return 0.4;
  if (ward === "combat-zone") return 0.45;
  if (ward === "slum") return 0.3;
  return undefined;
}

/** The plan's owner: the place's owner when a place stands here (with the faction it answers to), else the household's
 * head, who now and then answers to the quarter's holder if that is a gang, a house or a corporation. */
function ownerOf(city: City, index: number, type: BuildingType): BuildingOwner {
  const landmark = landmarkOn(city, index);
  if (landmark) {
    const faction = placeFaction(city, landmark);
    return { key: placeOwnerKey(city, landmark.id), role: placeOwnerRole(city, landmark), ...(faction ? { faction: { id: faction.id, name: faction.name, kind: faction.kind } } : {}) };
  }
  const id = city.buildings[index].key ?? String(index);
  const { faction } = wardHolder(cityFactions(city), city.buildings[index].ward);
  const answers = faction && ["gang", "house", "corporation", "syndicate", "clan"].includes(faction.kind) && hashString(`${city.params.seed}/building-${id}/loyal`) % 3 === 0;
  const role = type === "shop" || type === "store" || type === "trading-post" ? "merchant" : "";
  return { key: `${city.params.seed}/building-${id}/owner`, role, ...(answers && faction ? { faction: { id: faction.id, name: faction.name, kind: faction.kind } } : {}) };
}

export function buildingFromCity(city: City, index: number): BuildingParams {
  const building = city.buildings[index];
  const ward = city.wards.find((w) => w.id === building.ward);
  const landmark = landmarkOn(city, index);
  const modern = ["modern", "cyberpunk", "industrial", "far-future", "post-apocalypse"].includes(city.params.era);
  const type = buildingTypeOf(city, index);
  const custom = landmark?.custom ? city.params.custom?.places.find((place) => place.id === landmark.custom) : undefined;
  const [a, b] = footprint(building.polygon);
  const width = Math.max(5, Math.min(60, Math.round(Math.max(a, b) * city.scale)));
  const depth = Math.max(4, Math.min(40, Math.round(Math.min(a, b) * city.scale)));
  // A building the GM raised has a name of its own for its seed; any other is known by its place in the list.
  const id = building.key ?? String(index);
  const shopLike = type === "shop" || type === "store" || type === "trading-post";
  const craft = shopLike ? craftFor(`${city.params.seed}/building-${id}`, city.params.era) : undefined;
  const address = building.kind === "house" || building.kind === "landmark" || building.kind === "tower" ? addressOf(city, index) : null;
  const terrace = building.kind === "house" && ["ancient", "medieval", "renaissance", "industrial"].includes(city.params.era) && !!ward && ["craftsmen", "merchants", "slum", "old-town"].includes(ward.kind);
  const decay = decayOf(city, index);
  // A cellar may open on the sewers, the catacombs or the metro below the town.
  const hatch = city.params.era !== "stone" && hashString(`${city.params.seed}/building-${id}/hatch`) % 7 === 0;
  const dry = city.params.biome === "hot-desert" || city.params.biome === "savanna" || city.params.biome === "cold-desert";
  return buildingParams({
    seed: `${city.params.seed}/building-${id}`,
    type,
    era: city.params.era,
    name: landmark?.name || custom?.name || "",
    width,
    depth,
    // One-storey kinds (a temple's nave, a hut) stay one storey however tall the city draws them; others keep their height.
    floors: BUILDING_FLOORS[type][1] === 1 ? 1 : Math.max(BUILDING_FLOORS[type][0], Math.min(MAX_FLOORS, building.floors || 1)),
    yard: ["house", "manor", "tavern", "smithy"].includes(type) && !modern,
    // A cathedral is a temple built as a cross.
    ...(landmark?.kind === "cathedral" ? { shape: "T" as const } : {}),
    wealth: Math.round((ward?.wealth ?? 0.5) * 100) / 100,
    ...(craft ? { craft } : {}),
    ...(decay ? { decay } : {}),
    ...(city.params.magic ? { magic: city.params.magic } : {}),
    ...(hatch ? { hatch } : {}),
    ...(address ? { street: address.name, house: address.number } : {}),
    ...(terrace ? { terrace } : {}),
    ...(dry && ["ancient", "medieval", "renaissance", "stone"].includes(city.params.era) ? { material: "adobe" as const } : {}),
    ...(type === "custom" && custom?.targetType ? { customType: custom.targetType, width: custom.targetType.width, depth: custom.targetType.depth, floors: custom.targetType.floors, cellar: custom.targetType.cellar.length > 0 } : {}),
    owner: ownerOf(city, index, type),
  });
}

/** The places of a planet (or a region) that stand as one building: an inn, a lighthouse, a monastery, a watchtower, a
 * wizard's tower, a mill. The same building from any map of it: keyed by the planet's own place. */
const PLACE_BUILDINGS: Partial<Record<string, BuildingType>> = { inn: "tavern", lighthouse: "lighthouse", monastery: "temple", watchtower: "keep", "wizard-tower": "mage-tower", mill: "mill" };

export function buildingOfMarker(planet: Planet, markerId: number): Partial<BuildingParams> | null {
  const marker = planet.markers[markerId];
  const wanted = marker ? PLACE_BUILDINGS[marker.kind] : undefined;
  if (!marker || !wanted) return null;
  const era = ageOf(settingOf(planet.params.setting)) as Era;
  const types = ERA_BUILDINGS[era] ?? ERA_BUILDINGS.medieval;
  const type = types.includes(wanted) ? wanted : wanted === "tavern" ? types.find((t) => t === "store" || t === "shelter" || t === "trading-post") ?? types[0] : types[0];
  return { seed: `${planet.params.world ?? planet.params.seed}/marker-${marker.origin ?? markerId}/building`, type, era, ...(marker.name ? { name: marker.name } : {}) };
}
