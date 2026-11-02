// A building on a city map, opened as a floor plan: its footprint from the drawn outline (the smallest rectangle
// around it), its purpose from the quarter it stands in and any landmark there, its height from the map.
import type { City } from "../city/model";
import type { Point } from "../geometry";
import { pointInPolygon } from "../polygon";
import { BUILDING_FLOORS, buildingParams, type BuildingParams, type BuildingType } from "./plan";

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
  guildhall: "manor",
  bathhouse: "house",
  docks: "warehouse",
  barracks: "keep",
  "town-hall": "manor",
  station: "warehouse",
  hospital: "clinic",
  police: "office",
  factory: "warehouse",
  "corp-hq": "office",
  ripperdoc: "clinic",
  "netrunner-den": "apartment",
  club: "club",
  "night-market": "shop",
  "gang-hq": "club",
  museum: "manor",
  university: "office",
};

/** The building at a map point, if any (not trees, fields, graves or piers). */
export function buildingAt(city: City, point: Point): number {
  return city.buildings.findIndex((b) => !["tree", "field", "grave", "pier", "stall", "yard"].includes(b.kind) && pointInPolygon(point, b.polygon));
}

export function buildingFromCity(city: City, index: number): BuildingParams {
  const building = city.buildings[index];
  const ward = city.wards.find((w) => w.id === building.ward);
  const landmark = city.landmarks.find((l) => l.ward === building.ward && pointInPolygon([l.x, l.y], building.polygon));
  const modern = city.params.era === "modern" || city.params.era === "cyberpunk" || city.params.era === "industrial";
  let type: BuildingType = "house";
  if (landmark && BY_LANDMARK[landmark.kind]) type = BY_LANDMARK[landmark.kind];
  else if (building.kind === "landmark") type = ward?.kind === "temple" || ward?.kind === "cemetery" ? "temple" : ward?.kind === "castle" ? "keep" : "manor";
  else if (building.kind === "tower") type = ward && ["megablock", "residential", "combat-zone"].includes(ward.kind) ? "apartment" : "office";
  else if (building.kind === "industrial") type = "warehouse";
  else if (ward) {
    if (["patriciate", "rich-residential", "administration"].includes(ward.kind)) type = "manor";
    else if (["merchants", "commercial"].includes(ward.kind)) type = "shop";
    else if (ward.kind === "craftsmen") type = (index * 2654435761) % 5 === 0 ? "smithy" : (index % 3 === 0 ? "shop" : "house");
    else if (ward.kind === "residential" || ward.kind === "megablock") type = modern && building.floors >= 3 ? "apartment" : "house";
    else if (ward.kind === "harbour" || ward.kind === "port") type = "warehouse";
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
    floors: Math.max(BUILDING_FLOORS[type][0], Math.min(6, building.floors || 1)),
    yard: ["house", "manor", "tavern", "smithy"].includes(type) && !modern,
  });
}
