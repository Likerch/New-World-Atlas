// A building on a city map, opened as a floor plan: its footprint from the drawn outline (the smallest rectangle
// around it), its purpose from the quarter it stands in, any landmark there and the city's age, its height from the map.
import { PROPS, type City } from "../city/model";
import type { Point } from "../geometry";
import { pointInPolygon } from "../polygon";
import { BUILDING_FLOORS, MAX_FLOORS, buildingParams, type BuildingParams, type BuildingType } from "./plan";
import { hashString } from "../random";

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
  barracks: "keep",
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
  theatre: "temple",
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
  lighthouse: "keep",
  mill: "smithy",
  stadium: "temple",
  arena: "temple",
};

/** The building at a map point, if any (not trees, fields, graves or piers). */
export function buildingAt(city: City, point: Point): number {
  return city.buildings.findIndex((b) => !PROPS.includes(b.kind) && pointInPolygon(point, b.polygon));
}

export function buildingFromCity(city: City, index: number): BuildingParams {
  const building = city.buildings[index];
  const ward = city.wards.find((w) => w.id === building.ward);
  const landmark = city.landmarks.find((l) => l.ward === building.ward && pointInPolygon([l.x, l.y], building.polygon));
  const modern = ["modern", "cyberpunk", "industrial", "far-future", "post-apocalypse"].includes(city.params.era);
  const era = city.params.era;
  // A stable draw per building (a product taken modulo k only cycled with the index: every fifth house a smithy).
  const pick = (k: number, salt = "") => hashString(`${city.params.seed}/building-${index}${salt}`) % k;
  let type: BuildingType = "house";
  if (building.kind === "hut" || building.kind === "longhouse") type = building.kind;
  else if (landmark && BY_LANDMARK[landmark.kind]) type = BY_LANDMARK[landmark.kind];
  else if (era === "stone") type = "hut";
  // Each age's own houses: a Roman's atrium house or a tenement block, a worker's tenement, a habitat module, a
  // survivor's shack.
  else if (era === "ancient" && building.kind === "house" && ward && ["patriciate", "merchants", "administration"].includes(ward.kind)) type = "domus";
  else if (era === "ancient" && building.kind === "house" && ward && ["craftsmen", "slum", "suburb"].includes(ward.kind)) type = building.floors >= 2 ? "insula" : pick(3) ? "domus" : "shop";
  else if (era === "industrial" && building.kind === "house" && ward && ["craftsmen", "slum", "old-town", "residential"].includes(ward.kind)) type = pick(4) ? "tenement" : "shop";
  else if (era === "industrial" && building.kind === "industrial") type = pick(3) ? "factory" : "warehouse";
  else if ((era === "modern" || era === "cyberpunk") && building.kind === "industrial") type = pick(2) ? "factory" : "warehouse";
  else if ((era === "modern" || era === "cyberpunk") && building.kind === "house" && ward && ["commercial", "downtown"].includes(ward.kind)) type = "store";
  else if (era === "cyberpunk" && building.kind === "tower" && ward && ["megablock", "combat-zone"].includes(ward.kind) && !pick(4)) type = "capsule-hotel";
  else if (era === "far-future" && (building.kind === "tower" || building.kind === "house")) type = ward?.kind === "campus" ? "lab" : ward && ["commercial", "arcology"].includes(ward.kind) ? (pick(3) ? "office" : "store") : "hab";
  else if (era === "far-future" && building.kind === "industrial") type = pick(2) ? "hydroponics" : "factory";
  else if (era === "post-apocalypse" && (building.kind === "house" || building.kind === "ruin")) type = ward?.kind === "settlement" && !pick(5) ? "trading-post" : "shelter";
  else if (era === "post-apocalypse" && building.kind === "industrial") type = pick(2) ? "smithy" : "warehouse";
  else if (era === "renaissance" && building.kind === "house" && ward?.kind === "merchants" && !pick(9)) type = "bank";
  else if (era === "renaissance" && building.kind === "house" && ward?.kind === "administration") type = "guildhall";
  else if (building.kind === "landmark") type = ward?.kind === "temple" || ward?.kind === "cemetery" ? "temple" : ward?.kind === "castle" ? "keep" : "manor";
  else if (building.kind === "tower") type = ward && ["megablock", "residential", "combat-zone"].includes(ward.kind) ? "apartment" : "office";
  else if (building.kind === "industrial") type = "warehouse";
  else if (ward) {
    if (["patriciate", "rich-residential", "administration"].includes(ward.kind)) type = "manor";
    else if (["merchants", "commercial"].includes(ward.kind)) type = "shop";
    else if (ward.kind === "craftsmen") type = pick(5, "craft") === 0 ? "smithy" : pick(3, "shop") === 0 ? "shop" : "house";
    else if (ward.kind === "residential" || ward.kind === "megablock") type = modern && building.floors >= 3 ? "apartment" : "house";
    else if (ward.kind === "harbour" || ward.kind === "port") type = "warehouse";
    else if (ward.kind === "settlement") type = "house";
  }
  const [a, b] = footprint(building.polygon);
  const width = Math.max(5, Math.min(60, Math.round(Math.max(a, b) * city.scale)));
  const depth = Math.max(4, Math.min(40, Math.round(Math.min(a, b) * city.scale)));
  return buildingParams({
    seed: `${city.params.seed}/building-${index}`,
    type,
    era: city.params.era,
    name: landmark?.name ?? "",
    width,
    depth,
    // One-storey kinds (a temple's nave, a hut) stay one storey however tall the city draws them; others keep their height.
    floors: BUILDING_FLOORS[type][1] === 1 ? 1 : Math.max(BUILDING_FLOORS[type][0], Math.min(MAX_FLOORS, building.floors || 1)),
    yard: ["house", "manor", "tavern", "smithy"].includes(type) && !modern,
  });
}
