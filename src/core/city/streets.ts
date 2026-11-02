// City streets. In walled towns the ward borders are the street net: main streets run from each gate to the market
// along it, and roads leave the gates for the countryside. Planned cities get avenues on every district border,
// plus highways, railways and (in cyberpunk) skyways. Bridges appear wherever a street meets the river.
import { chainUndirected, type Point } from "../geometry";
import { name } from "../language";
import { pointInPolygon, segmentIntersection } from "../polygon";
import { PriorityQueue } from "../queue";
import type { Rng } from "../random";
import type { Layout } from "./layout";
import { organicEra, type City, type CityParams, type Street } from "./model";

export interface StreetNet {
  streets: Street[];
  /** Ward sides that carry a main street or avenue, as "a:b" corner keys. */
  major: Set<string>;
  bridges: [Point, Point][];
}

export const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export function buildStreets(params: CityParams, layout: Layout, language: City["language"], rng: Rng): StreetNet {
  const { diagram, sea, river, center, radius, scale, urban, water } = layout;
  const W = params.width;
  const H = params.height;
  const n = diagram.sites.length;
  const corners = diagram.corners;
  const streets: Street[] = [];
  const major = new Set<string>();
  const metres = (m: number) => m / scale;
  const inSea = (p: Point) => !!sea && pointInPolygon(p, sea);
  const outside = (p: Point) => p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H;
  const add = (kind: Street["kind"], points: Point[], width: number, named = false) => {
    if (points.length < 2) return;
    streets.push({ id: streets.length, kind, points, width, name: named ? name(language, rng, "plain") : "" });
  };

  // The corner graph: ward sides as edges.
  const graph = new Map<number, { to: number; length: number; inside: boolean }[]>();
  for (let ward = 0; ward < n; ward++) {
    if (water[ward]) continue;
    for (const side of diagram.sides[ward]) {
      if (side.a === side.b || side.other < ward) continue;
      if (side.other < n && water[side.other] && water[ward]) continue;
      const pa = corners[side.a],
        pb = corners[side.b];
      if (inSea(pa) || inSea(pb)) continue;
      const inside = urban[ward] && side.other < n && urban[side.other];
      const length = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
      for (const [from, to] of [[side.a, side.b], [side.b, side.a]]) {
        const list = graph.get(from) ?? [];
        list.push({ to, length, inside });
        graph.set(from, list);
      }
    }
  }
  const crossesRiver = (a: Point, b: Point) => !!river && river.points.some((p, k) => k > 0 && !!segmentIntersection(a, b, river.points[k - 1], p));

  /** Cheapest corner path from a start to any target, with a cost per edge. */
  const path = (start: number, isTarget: (corner: number) => boolean, cost: (from: number, to: number, length: number, inside: boolean) => number) => {
    const best = new Map<number, number>([[start, 0]]);
    const came = new Map<number, number>();
    const queue = new PriorityQueue<number>();
    queue.push(start, 0);
    const done = new Set<number>();
    for (let entry = queue.pop(); entry; entry = queue.pop()) {
      const [corner, total] = entry;
      if (done.has(corner)) continue;
      done.add(corner);
      if (corner !== start && isTarget(corner)) {
        const route = [corner];
        for (let at = corner; at !== start; ) {
          at = came.get(at)!;
          route.push(at);
        }
        return route.reverse();
      }
      for (const edge of graph.get(corner) ?? []) {
        const step = cost(corner, edge.to, edge.length, edge.inside);
        if (!Number.isFinite(step)) continue;
        const next = total + step;
        if (next < (best.get(edge.to) ?? Infinity)) {
          best.set(edge.to, next);
          came.set(edge.to, corner);
          queue.push(edge.to, next);
        }
      }
    }
    return null;
  };

  if (organicEra(params.era)) {
    // Main streets: from every gate (or, unwalled, from the town's rim) to the market square.
    const heart = layout.kinds.indexOf("plaza") >= 0 ? layout.kinds.indexOf("plaza") : diagram.sites.map((_, ward) => ward).filter((ward) => urban[ward]).sort((a, b) => Math.hypot(diagram.sites[a][0] - center[0], diagram.sites[a][1] - center[1]) - Math.hypot(diagram.sites[b][0] - center[0], diagram.sites[b][1] - center[1]))[0];
    const heartCorners = new Set(diagram.sides[heart]?.flatMap((side) => [side.a, side.b]) ?? []);
    let starts = layout.gates;
    if (!starts.length) {
      // No walls: main streets start where the town meets the fields, spread around it.
      const rim = [...graph.keys()].filter((corner) => {
        const p = corners[corner];
        const d = Math.hypot(p[0] - center[0], p[1] - center[1]);
        return d > radius * 0.85 && d < radius * 1.1 && !outside(p);
      });
      const count = Math.max(2, Math.min(5, Math.round(2 + Math.sqrt(params.population))));
      const offset = rng.float(0, Math.PI * 2);
      starts = Array.from({ length: count }, (_, k) => {
        const angle = offset + (k * Math.PI * 2) / count;
        const goal: Point = [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
        return rim.reduce((best, corner) => (Math.hypot(corners[corner][0] - goal[0], corners[corner][1] - goal[1]) < Math.hypot(corners[best][0] - goal[0], corners[best][1] - goal[1]) ? corner : best), rim[0]);
      }).filter((corner, k, list) => corner !== undefined && list.indexOf(corner) === k);
    }
    for (const gate of starts) {
      const route = path(gate, (corner) => heartCorners.has(corner), (from, to, length) => {
        const factor = major.has(edgeKey(from, to)) ? 0.55 : 1;
        return length * factor * (crossesRiver(corners[from], corners[to]) ? 2.5 : 1);
      });
      if (!route) continue;
      for (let k = 1; k < route.length; k++) major.add(edgeKey(route[k - 1], route[k]));
      add("main", route.map((corner) => corners[corner]), metres(9), true);
      // Out of the gate, a road to the edge of the map, heading away from the centre.
      const p = corners[gate];
      const away = Math.atan2(p[1] - center[1], p[0] - center[0]);
      const road = path(gate, (corner) => outside(corners[corner]), (from, to, length, inside) => {
        if (inside) return Infinity;
        const a = corners[from],
          b = corners[to];
        const heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const turn = 1 - Math.cos(heading - away);
        return length * (1 + turn * 1.5) * (crossesRiver(a, b) ? 3 : 1);
      });
      if (road) add("road", road.map((corner) => corners[corner]), metres(6));
    }
  } else {
    // Avenues on every border between town districts.
    const arterial = metres(params.era === "cyberpunk" ? 26 : params.era === "modern" ? 20 : 14);
    const segments: [number, number][] = [];
    for (let ward = 0; ward < n; ward++) {
      if (!urban[ward]) continue;
      for (const side of diagram.sides[ward]) {
        if (side.other >= n || side.other < ward || !urban[side.other] || side.a === side.b) continue;
        if (inSea(corners[side.a]) || inSea(corners[side.b])) continue;
        segments.push([side.a, side.b]);
        major.add(edgeKey(side.a, side.b));
      }
    }
    for (const chain of chainUndirected(segments)) add("avenue", chain.map((corner) => corners[corner]), arterial, chain.length > 4);

    // Highways around and out of the city; railways in the industrial age; skyways between towers in cyberpunk.
    const spokes = (count: number, kind: Street["kind"], width: number, from: number) => {
      const offset = rng.float(0, Math.PI * 2);
      for (let k = 0; k < count; k++) {
        const angle = offset + (k * Math.PI * 2) / count + rng.float(-0.2, 0.2);
        const line: Point[] = [];
        for (let d = from; d < Math.hypot(W, H); d += 12) {
          const p: Point = [center[0] + Math.cos(angle) * d, center[1] + Math.sin(angle) * d];
          if (outside(p)) {
            line.push(p);
            break;
          }
          if (inSea(p)) break;
          line.push(p);
        }
        if (line.length > 3 && !inSea(line[line.length - 1])) add(kind, line, width);
      }
    };
    if (params.era === "modern" || params.era === "cyberpunk") {
      const ringRadius = radius * 1.08;
      let arc: Point[] = [];
      for (let k = 0; k <= 96; k++) {
        const angle = (k / 96) * Math.PI * 2;
        const p: Point = [center[0] + Math.cos(angle) * ringRadius, center[1] + Math.sin(angle) * ringRadius];
        if (inSea(p) || outside(p)) {
          add("highway", arc, metres(30));
          arc = [];
        } else arc.push(p);
      }
      add("highway", arc, metres(30));
      spokes(rng.int(4, 6), "highway", metres(30), ringRadius);
    }
    if (params.era === "industrial") spokes(2, "rail", metres(6), radius * 0.15);
    if (params.era === "cyberpunk") {
      const hubs = diagram.sites.filter((_, ward) => layout.kinds[ward] === "arcology" || layout.kinds[ward] === "commercial");
      for (let k = 1; k < hubs.length; k++) add("skyway", [hubs[0], hubs[k]], metres(10));
    }
  }

  // Bridges where streets meet the river.
  const bridges: [Point, Point][] = [];
  if (river) {
    for (const street of streets) {
      if (street.kind === "skyway") continue;
      for (let k = 1; k < street.points.length; k++) {
        const a = street.points[k - 1],
          b = street.points[k];
        for (let j = 1; j < river.points.length; j++) {
          const hit = segmentIntersection(a, b, river.points[j - 1], river.points[j]);
          if (!hit) continue;
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const half = river.width / 2 + metres(4);
          const ux = (b[0] - a[0]) / len,
            uy = (b[1] - a[1]) / len;
          bridges.push([[hit[0] - ux * half, hit[1] - uy * half], [hit[0] + ux * half, hit[1] + uy * half]]);
        }
      }
    }
  }
  return { streets, major, bridges };
}
