// Places in town a game master can send players to: the well on the market square, the cathedral, taverns by the
// gates, the docks — or, centuries later, the station, the stadium, a ripperdoc's back room, the way down to the
// undercity.
import type { Point } from "../geometry";
import { name } from "../language";
import { area, centroid, distanceToPolyline } from "../polygon";
import type { Rng } from "../random";
import type { Layout } from "./layout";
import type { Building, City, CityParams, Landmark, LandmarkKind, WardKind } from "./model";

export function placeLandmarks(params: CityParams, layout: Layout, buildings: Building[], language: City["language"], rng: Rng): Landmark[] {
  const out: Landmark[] = [];
  const used = new Set<Building>();
  const wardsOf = (kinds: WardKind[]) => layout.diagram.sites.map((_, ward) => ward).filter((ward) => kinds.includes(layout.kinds[ward]));
  const add = (kind: LandmarkKind, at: Point, ward: number, named = false) => {
    out.push({ id: out.length + 1, kind, x: at[0], y: at[1], ward, name: named ? name(language, rng, "plain") : "" });
  };
  /** A building in one of the wards, the biggest or a random one, not used by another landmark. */
  const building = (kinds: WardKind[], biggest: boolean, test: (b: Building) => boolean = () => true) => {
    const wards = new Set(wardsOf(kinds));
    const options = buildings.filter((b) => wards.has(b.ward) && !used.has(b) && b.kind !== "tree" && b.kind !== "field" && b.kind !== "grave" && test(b));
    if (!options.length) return null;
    const pick = biggest ? options.reduce((best, b) => (area(b.polygon) > area(best.polygon) ? b : best)) : rng.pick(options);
    used.add(pick);
    return pick;
  };
  const place = (kind: LandmarkKind, kinds: WardKind[], biggest = false, named = false, test?: (b: Building) => boolean) => {
    const b = building(kinds, biggest, test);
    if (b) add(kind, centroid(b.polygon), b.ward, named);
  };
  const nearGate = (b: Building) => layout.walls[0]?.gates.some((gate) => Math.hypot(centroid(b.polygon)[0] - gate[0], centroid(b.polygon)[1] - gate[1]) < layout.radius * 0.35) ?? true;
  const byRiver = (b: Building) => !!layout.river && distanceToPolyline(centroid(b.polygon), layout.river.points) < layout.river.width * 2;
  const taverns = Math.max(1, Math.min(6, Math.round(1 + Math.sqrt(params.population))));

  switch (params.era) {
    case "medieval":
    case "renaissance": {
      const plaza = layout.kinds.indexOf("plaza");
      if (plaza >= 0) add("market-well", centroid(layout.diagram.cells[plaza]), plaza);
      place("temple", ["temple"], true, true);
      place("keep", ["castle"], true, true);
      for (let k = 0; k < taverns; k++) place("tavern", ["merchants", "craftsmen", "slum", "suburb"], false, true, k % 2 ? undefined : nearGate);
      place("smithy", ["craftsmen", "military"], false, true);
      place("guildhall", ["merchants", "administration"], true, true);
      if (params.population > 5) place("bathhouse", ["merchants", "craftsmen"], false);
      place("gallows", ["slum", "craftsmen"], false);
      place("barracks", ["military"], true);
      place("docks", ["harbour"], true, true);
      if (layout.river) place("mill", ["craftsmen", "suburb", "farm", "merchants"], false, false, byRiver);
      break;
    }
    case "industrial":
      place("town-hall", ["old-town", "commercial"], true, true);
      place("station", ["commercial", "residential", "industrial"], true);
      for (let k = 0; k < 2; k++) place("factory", ["industrial"], true, true);
      place("hospital", ["residential", "commercial"], true);
      place("police", ["old-town", "residential"], false);
      place("docks", ["port"], true, true);
      for (let k = 0; k < taverns; k++) place("tavern", ["residential", "industrial", "old-town"], false, true);
      break;
    case "modern":
      place("town-hall", ["downtown"], true, true);
      place("station", ["downtown", "commercial"], true);
      place("hospital", ["residential", "commercial"], true, true);
      place("police", ["residential", "downtown"], false);
      place("stadium", ["residential", "suburb", "industrial"], true, true);
      place("university", ["campus"], true, true);
      place("museum", ["downtown", "commercial"], false, true);
      for (let k = 0; k < Math.ceil(taverns / 2); k++) place("club", ["downtown", "commercial"], false, true);
      place("docks", ["port"], true);
      break;
    case "cyberpunk":
      place("corp-hq", ["arcology"], true, true);
      for (let k = 0; k < 2; k++) place("ripperdoc", ["megablock", "combat-zone"], false, true);
      place("netrunner-den", ["megablock", "combat-zone"], false, true);
      place("night-market", ["megablock", "commercial"], false, true);
      for (let k = 0; k < 2; k++) place("club", ["commercial", "megablock"], false, true);
      place("police", ["commercial", "megablock"], false);
      place("av-port", ["commercial", "arcology"], true);
      for (let k = 0; k < 2; k++) place("undercity", ["megablock", "combat-zone", "industrial"], false);
      place("gang-hq", ["combat-zone"], false, true);
      place("docks", ["port"], true);
      break;
  }
  return out;
}
