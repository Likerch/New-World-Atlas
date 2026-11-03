// The game master's edits over a generated city, kept in the map's patch under "city": what a quarter is (one of the
// generator's kinds or the GM's own) and how rich, a quarter thrown again, places added, taken away, moved or turned
// into something else, gates opened in the wall or bricked up. A quarter's new houses come from a stream of its own and
// go to the end of the list, and its old ones stay in their places as empty slots, so every other building keeps its
// number — and so its plan and its notes.
import type { Point } from "../geometry";
import { centroid, distanceToPolyline, pointInPolygon } from "../polygon";
import { createRng } from "../random";
import { buildBuildings } from "./buildings";
import { cityStages, gateRoads } from "./generate";
import { PROPS, type Building, type City, type CustomPlace, type CustomWard, type Landmark, type LandmarkKind, type WardKind } from "./model";
import { edgeKey } from "./streets";

export interface CityEdits {
  /** By ward id: a new kind (the generator's, or the GM's own by id, its definition carried along), a new wealth, how
   * often it was thrown again. */
  wards?: Record<string, { kind?: WardKind; custom?: string; own?: CustomWard; wealth?: number; salt?: number }>;
  places?: {
    /** Places the GM put on the map; their ids follow the city's own. A place of the GM's own kind carries its kind. */
    added?: { id: number; kind: LandmarkKind; custom?: string; own?: CustomPlace; x: number; y: number; name?: string }[];
    removed?: number[];
    moved?: Record<string, [number, number]>;
    /** A place turned into another kind ("custom:<id>" for the GM's own). */
    kinds?: Record<string, string>;
  };
  /** Gates opened in the town wall and gates bricked up, by where they stand. */
  gates?: { added?: Point[]; removed?: Point[] };
}

/** The next free id for a place the GM adds. */
export function nextPlaceId(city: City): number {
  return city.landmarks.reduce((top, landmark) => Math.max(top, landmark.id), 0) + 1;
}

const wardAt = (city: City, at: Point) => city.wards.find((ward) => pointInPolygon(at, ward.polygon))?.id ?? city.wards[0]?.id ?? 0;

/** A city with the GM's edits laid over it; the city itself is left as it was. */
export function editCity(city: City, edits: CityEdits | null | undefined): City {
  if (!edits) return city;
  const wardEdits = Object.entries(edits.wards ?? {}).filter(([, change]) => change.kind || change.custom || change.wealth !== undefined || change.salt);
  const placeEdits = edits.places ?? {};
  const gateEdits = edits.gates ?? {};
  if (!wardEdits.length && !placeEdits.added?.length && !placeEdits.removed?.length && !Object.keys(placeEdits.moved ?? {}).length && !Object.keys(placeEdits.kinds ?? {}).length && !gateEdits.added?.length && !gateEdits.removed?.length) return city;
  // The GM's own kinds the edits use join the city's, so the map and its cards know them.
  const ownWards = [...(city.params.custom?.wards ?? [])];
  for (const [, change] of wardEdits) if (change.own && !ownWards.some((kind) => kind.id === change.own!.id)) ownWards.push(change.own);
  const ownPlaces = [...(city.params.custom?.places ?? [])];
  for (const add of placeEdits.added ?? []) if (add.own && !ownPlaces.some((kind) => kind.id === add.own!.id)) ownPlaces.push(add.own);
  const params = ownWards.length || ownPlaces.length ? { ...city.params, custom: { wards: ownWards, places: ownPlaces } } : city.params;
  const custom = new Map(ownWards.map((kind) => [kind.id, kind]));
  let wards = city.wards;
  let buildings = city.buildings;
  let landmarks = city.landmarks;
  let streets = city.streets;
  let walls = city.walls;

  // Quarters rebuilt: the town's first stages again, the edited quarters' kinds and wealth changed, their houses built anew.
  if (wardEdits.length && params.settlement !== "village" && params.settlement !== "hamlet") {
    const { layout, net } = cityStages(params, { ...city.language });
    if (layout.boulevards?.length) for (const line of layout.oldLines ?? []) for (let k = 1; k < line.length; k++) net.major.add(edgeKey(line[k - 1], line[k]));
    const kinds = [...layout.kinds];
    const wealth = [...layout.wealth];
    const salts = new Map<number, number>();
    for (const [id, change] of wardEdits) {
      const ward = Number(id);
      const own = change.custom ? custom.get(change.custom) : undefined;
      if (own) ((kinds[ward] = own.base), (wealth[ward] = own.wealth));
      else if (change.kind) kinds[ward] = change.kind;
      if (change.wealth !== undefined) wealth[ward] = change.wealth;
      salts.set(ward, change.salt ?? 0);
    }
    const only = new Set(salts.keys());
    const fresh = buildBuildings(params, { ...layout, kinds, wealth }, net, createRng(params.seed).fork("buildings"), { only, label: (ward) => `ward-${ward}/edit-${salts.get(ward) ?? 0}`, ...(layout.slope ? { slope: layout.slope } : {}) });
    // The old houses of those quarters stay as empty slots; the new ones go to the end, each with a name of its own.
    const counts = new Map<number, number>();
    const added: Building[] = fresh.map((building) => {
      const k = counts.get(building.ward) ?? 0;
      counts.set(building.ward, k + 1);
      return { ...building, key: `w${building.ward}-${salts.get(building.ward) ?? 0}-${k}` };
    });
    buildings = [...buildings.map((building): Building => (only.has(building.ward) && !["pier", "boat", "tent", "gone"].includes(building.kind) ? { polygon: [], ward: building.ward, kind: "gone", floors: 0 } : building)), ...added];
    wards = wards.map((ward) => {
      if (!only.has(ward.id)) return ward;
      const change = edits.wards![String(ward.id)];
      const own = change.custom ? custom.get(change.custom) : undefined;
      const next = { ...ward, kind: kinds[ward.id], wealth: wealth[ward.id], buildings: added.filter((b) => b.ward === ward.id && !PROPS.includes(b.kind)).length };
      delete next.custom;
      return own ? { ...next, custom: own.id } : next;
    });
    // A place in a rebuilt quarter moves onto the nearest new house of it.
    landmarks = landmarks.map((landmark) => {
      if (!only.has(landmark.ward)) return landmark;
      const homes = added.filter((b) => b.ward === landmark.ward && !PROPS.includes(b.kind) && b.kind !== "shed");
      if (!homes.length) return landmark;
      const best = homes.reduce((near, b) => (Math.hypot(centroid(b.polygon)[0] - landmark.x, centroid(b.polygon)[1] - landmark.y) < Math.hypot(centroid(near.polygon)[0] - landmark.x, centroid(near.polygon)[1] - landmark.y) ? b : near));
      const [x, y] = centroid(best.polygon);
      return { ...landmark, x, y };
    });
  }

  // Places taken away, turned into others, moved, and added.
  const removed = new Set(placeEdits.removed ?? []);
  landmarks = landmarks
    .filter((landmark) => !removed.has(landmark.id))
    .map((landmark): Landmark => {
      let next = landmark;
      const kind = placeEdits.kinds?.[String(landmark.id)];
      if (kind) next = kind.startsWith("custom:") ? { ...next, kind: "custom", custom: kind.slice(7) } : { ...next, kind: kind as LandmarkKind, custom: undefined };
      const moved = placeEdits.moved?.[String(landmark.id)];
      if (moved) next = { ...next, x: moved[0], y: moved[1], ward: wardAt(city, moved) };
      return next;
    });
  for (const add of placeEdits.added ?? []) if (!removed.has(add.id)) landmarks.push({ id: add.id, kind: add.kind, x: add.x, y: add.y, ward: wardAt(city, [add.x, add.y]), name: add.name ?? "", ...(add.custom ? { custom: add.custom } : {}) });

  // Gates: bricked up, and opened where the GM points (on the wall's nearest corner), with a road out of each new one.
  const town = walls.findIndex((wall) => !wall.citadel && !wall.old);
  if (town >= 0 && (gateEdits.added?.length || gateEdits.removed?.length)) {
    const wall = walls[town];
    const shut = (p: Point) => (gateEdits.removed ?? []).some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1);
    const gates = wall.gates.filter((gate) => !shut(gate));
    const roads: typeof streets = [];
    for (const at of gateEdits.added ?? []) {
      const corner = wall.ring.reduce((best, p) => (Math.hypot(p[0] - at[0], p[1] - at[1]) < Math.hypot(best[0] - at[0], best[1] - at[1]) ? p : best), wall.ring[0]);
      if (shut(corner) || gates.some((gate) => Math.hypot(gate[0] - corner[0], gate[1] - corner[1]) < 1)) continue;
      gates.push(corner);
      const away = Math.atan2(corner[1] - city.center[1], corner[0] - city.center[0]);
      const reach = Math.hypot(params.width, params.height);
      const points: Point[] = [corner];
      for (let t = 12; t < reach; t += 12) {
        const p: Point = [corner[0] + Math.cos(away) * t, corner[1] + Math.sin(away) * t];
        if ((city.sea && pointInPolygon(p, city.sea)) || (city.river && distanceToPolyline(p, city.river.points) < city.river.width / 2)) break;
        points.push(p);
        if (p[0] < 0 || p[1] < 0 || p[0] > params.width || p[1] > params.height) break;
      }
      if (points.length > 1) roads.push({ id: streets.length + roads.length, kind: "road", points, width: 6 / city.scale, name: "" });
    }
    walls = walls.map((item, index) => (index === town ? { ...item, gates } : item));
    streets = [...streets, ...roads];
  }
  return { ...city, params, wards, buildings, landmarks, streets, walls, ...(params.roads?.length ? { gateRoads: gateRoads(city.center, walls, params.roads) } : {}) };
}
