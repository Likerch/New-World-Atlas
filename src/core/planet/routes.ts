// Roads and sea lanes. Highways link neighbouring capitals, roads knit each state's towns into a network (a spanning
// tree plus a few shortcuts), and ports on the same waters trade by sea. Paths are found with A* over the cells, and
// later roads prefer to follow earlier ones, so networks merge the way real ones do. The age decides what they are:
// footpaths before the wheel, railways and motorways later, and air routes between the great cities of an age of
// flight; the map draws each kind in its age's manner.
import Delaunator from "delaunator";
import { PriorityQueue } from "../queue";
import { ageOf, settingOf } from "../setting";
import { BIOMES } from "./biomes";
import type { Burg, Ground, Route, RouteKind, State } from "./model";
import { realmsHere } from "./markers";

function findPath(g: Ground, from: number, to: number, sea: boolean, roads: Uint8Array): number[] | null {
  const n = g.mesh.cells;
  const cost = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const queue = new PriorityQueue<number>();
  const tx = g.mesh.x[to],
    ty = g.mesh.y[to];
  // Halved so that cheap road steps (0.5) never make the estimate overshoot.
  const heuristic = (cell: number) => (0.5 * Math.hypot(g.mesh.x[cell] - tx, g.mesh.y[cell] - ty)) / g.mesh.spacing;
  const closed = new Uint8Array(n);
  cost[from] = 0;
  queue.push(from, heuristic(from));
  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    const [cell] = entry;
    if (cell === to) break;
    if (closed[cell]) continue;
    closed[cell] = 1;
    for (const next of g.mesh.neighbors[cell]) {
      if (closed[next]) continue;
      let step: number;
      if (sea) {
        // Ships keep to water; the ports at both ends are the only land they touch.
        if (!g.water[next] && next !== to) continue;
        step = g.coast[next] === -1 ? 1.4 : 1;
      } else {
        if (g.water[next]) continue;
        step = roads[next] ? 0.5 : 1 + BIOMES[g.biome[next]].cost / 80 + Math.max(0, g.height[next] - 45) / 6 + Math.abs(g.height[next] - g.height[cell]) / 4;
        if (g.river[next] && !g.river[cell] && !roads[next]) step += 2;
      }
      const total = cost[cell] + step;
      if (total >= cost[next]) continue;
      cost[next] = total;
      came[next] = cell;
      queue.push(next, total + heuristic(next));
    }
  }
  if (came[to] === -1) return null;
  const path = [to];
  for (let cell = to; cell !== from; ) {
    cell = came[cell];
    path.push(cell);
  }
  return path.reverse();
}

/** Edges of a minimum spanning tree over points (Kruskal on their Delaunay graph), plus short extra links. */
function network(points: number[][], extraRatio: number): [number, number][] {
  if (points.length < 2) return [];
  if (points.length === 2) return [[0, 1]];
  const coords = points.flat();
  let edges: [number, number, number][] = [];
  try {
    const delaunay = new Delaunator(coords);
    for (let e = 0; e < delaunay.triangles.length; e++) {
      const a = delaunay.triangles[e];
      const b = delaunay.triangles[e % 3 === 2 ? e - 2 : e + 1];
      if (a < b) edges.push([a, b, Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1])]);
    }
  } catch {
    // Collinear points: chain them in order.
    edges = points.slice(1).map((_, k) => [k, k + 1, 1]);
  }
  edges.sort((x, y) => x[2] - y[2]);
  const parent = points.map((_, k) => k);
  const root = (k: number): number => (parent[k] === k ? k : (parent[k] = root(parent[k])));
  const chosen: [number, number][] = [];
  const spare: [number, number, number][] = [];
  for (const [a, b, length] of edges) {
    const ra = root(a),
      rb = root(b);
    if (ra !== rb) {
      parent[ra] = rb;
      chosen.push([a, b]);
    } else spare.push([a, b, length]);
  }
  const mean = chosen.length ? edges.slice(0, chosen.length).reduce((sum, edge) => sum + edge[2], 0) / chosen.length : 0;
  for (const [a, b, length] of spare.slice(0, Math.round(chosen.length * extraRatio))) if (length < mean * 1.3) chosen.push([a, b]);
  return chosen;
}

export function buildRoutes(g: Ground, burgs: Burg[], states: State[]): Route[] {
  const routes: Route[] = [{ id: 0, kind: "road", cells: [], length: 0 }];
  const roads = new Uint8Array(g.mesh.cells);
  const add = (kind: RouteKind, cells: number[] | null) => {
    if (!cells || cells.length < 2) return;
    let length = 0;
    for (let k = 1; k < cells.length; k++) length += Math.hypot(g.mesh.x[cells[k]] - g.mesh.x[cells[k - 1]], g.mesh.y[cells[k]] - g.mesh.y[cells[k - 1]]);
    routes.push({ id: routes.length, kind, cells, length: length * g.scale });
    if (kind !== "sea" && kind !== "air") for (const cell of cells) roads[cell] = 1;
  };
  const setting = settingOf(g.params.setting);
  // Before the wheel every way is a footpath, and before boats there are no sea lanes.
  const walking = setting.transport < 1;

  // Highways between the capitals of neighbouring states on the same landmass.
  const capitals = states.slice(1).filter((state) => state.capital);
  for (const state of capitals) {
    for (const other of state.neighbors) {
      if (other < state.id || !states[other].capital) continue;
      const a = burgs[state.capital].cell,
        b = burgs[states[other].capital].cell;
      if (g.feature[a] !== g.feature[b]) continue;
      add(walking ? "trail" : "highway", findPath(g, a, b, false, roads));
    }
  }
  // Roads inside each state; the smallest towns hang on trails.
  for (const state of capitals) {
    const towns = burgs.filter((burg) => burg.state === state.id);
    const byLand = new Map<number, Burg[]>();
    for (const town of towns) byLand.set(g.feature[town.cell], [...(byLand.get(g.feature[town.cell]) ?? []), town]);
    for (const group of byLand.values()) {
      for (const [a, b] of network(group.map((town) => [town.x, town.y]), 0.15)) {
        const small = group[a].population < 1.5 || group[b].population < 1.5;
        add(small || walking ? "trail" : "road", findPath(g, group[a].cell, group[b].cell, false, roads));
      }
    }
  }
  // Sea lanes between ports on the same water.
  const byWater = new Map<number, Burg[]>();
  for (const burg of burgs.slice(1)) {
    if (!burg.port) continue;
    // The port's sea is the largest water beside it, not a pond that happens to come first.
    const water = g.mesh.neighbors[burg.cell].filter((next) => g.water[next]).sort((a, b) => g.features[g.feature[b]].cells - g.features[g.feature[a]].cells)[0];
    if (water === undefined) continue;
    byWater.set(g.feature[water], [...(byWater.get(g.feature[water]) ?? []), burg]);
  }
  if (setting.transport >= 0.5) {
    for (const ports of byWater.values()) {
      for (const [a, b] of network(ports.map((port) => [port.x, port.y]), 0.1)) add("sea", findPath(g, ports[a].cell, ports[b].cell, true, roads));
    }
  }
  // Air routes (airship lines in a steam age running ahead): straight between the capitals and the greatest towns.
  if (setting.transport >= 6 && ageOf(setting) !== "post-apocalypse") {
    const hubs = burgs
      .slice(1)
      .filter((burg) => !burg.removed)
      .sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population)
      .slice(0, Math.min(24, realmsHere(states) + 6));
    for (const [a, b] of network(hubs.map((hub) => [hub.x, hub.y]), 0.25)) add("air", [hubs[a].cell, hubs[b].cell]);
  }
  return routes;
}
