// Geometry shared by every level: outlines of cell groups, smoothing, SVG path strings, polygon maths.
import type { Mesh } from "./mesh";

export type Point = [number, number];

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Chains loose segments (corner id pairs) into paths; closed loops repeat their first point at the end. */
export function chainSegments(segments: [number, number][]): number[][] {
  const byStart = new Map<number, number[]>();
  for (let index = 0; index < segments.length; index++) {
    const start = segments[index][0];
    const list = byStart.get(start);
    if (list) list.push(index);
    else byStart.set(start, [index]);
  }
  const used = new Uint8Array(segments.length);
  const take = (start: number) => {
    const list = byStart.get(start);
    while (list?.length) {
      const index = list.pop()!;
      if (!used[index]) {
        used[index] = 1;
        return index;
      }
    }
    return -1;
  };
  const chains: number[][] = [];
  for (let first = 0; first < segments.length; first++) {
    if (used[first]) continue;
    used[first] = 1;
    const chain = [segments[first][0], segments[first][1]];
    for (;;) {
      const next = take(chain[chain.length - 1]);
      if (next === -1) break;
      chain.push(segments[next][1]);
      if (segments[next][1] === chain[0]) break;
    }
    chains.push(chain);
  }
  return chains;
}

/**
 * Outlines of the cells in a set, as closed corner loops. Outer rings and holes come together, so fill them with
 * the even-odd rule. Sides facing ghosts count as outside, which closes shapes beyond the map's edge.
 */
export function outline(mesh: Mesh, inside: (cell: number) => boolean): Point[][] {
  const segments: [number, number][] = [];
  for (let cell = 0; cell < mesh.cells; cell++) {
    if (!inside(cell)) continue;
    for (const side of mesh.sides[cell]) {
      if (side.other < mesh.cells && inside(side.other)) continue;
      segments.push([side.b, side.a]);
    }
  }
  return chainSegments(segments).map((chain) => chain.map((corner): Point => [mesh.cornerX[corner], mesh.cornerY[corner]]));
}

/** The borders between cells whose keys differ (both keys non-negative), as open or closed corner paths. */
export function borders(mesh: Mesh, key: (cell: number) => number): Point[][] {
  const segments: [number, number][] = [];
  for (let cell = 0; cell < mesh.cells; cell++) {
    const own = key(cell);
    if (own < 0) continue;
    for (const side of mesh.sides[cell]) {
      if (side.other >= mesh.cells || side.other < cell) continue;
      const theirs = key(side.other);
      if (theirs < 0 || theirs === own) continue;
      segments.push([side.a, side.b]);
    }
  }
  return chainUndirected(segments).map((chain) => chain.map((corner): Point => [mesh.cornerX[corner], mesh.cornerY[corner]]));
}

/** Chains undirected segments into paths that run between junctions (or around loops). */
export function chainUndirected(segments: [number, number][]): number[][] {
  const incident = new Map<number, number[]>();
  segments.forEach(([a, b], index) => {
    for (const vertex of [a, b]) {
      const list = incident.get(vertex);
      if (list) list.push(index);
      else incident.set(vertex, [index]);
    }
  });
  const used = new Uint8Array(segments.length);
  const walk = (start: number, first: number) => {
    const chain = [start];
    let vertex = start;
    let segment = first;
    for (;;) {
      used[segment] = 1;
      const [a, b] = segments[segment];
      vertex = a === vertex ? b : a;
      chain.push(vertex);
      const options = incident.get(vertex)!;
      if (options.length !== 2 || vertex === start) break;
      const next = options[0] === segment ? options[1] : options[0];
      if (used[next]) break;
      segment = next;
    }
    return chain;
  };
  const chains: number[][] = [];
  // Paths from junctions and loose ends first, then whatever loops remain.
  for (const [vertex, list] of incident) {
    if (list.length === 2) continue;
    for (const segment of list) if (!used[segment]) chains.push(walk(vertex, segment));
  }
  for (let segment = 0; segment < segments.length; segment++) if (!used[segment]) chains.push(walk(segments[segment][0], segment));
  return chains;
}

/** Chaikin corner cutting: rounds a polyline or ring. */
export function smooth(points: Point[], closed: boolean, iterations = 2): Point[] {
  let current = points;
  for (let round = 0; round < iterations; round++) {
    if (current.length < 3) return current;
    const next: Point[] = [];
    const count = closed ? current.length - 1 : current.length - 1;
    if (!closed) next.push(current[0]);
    for (let k = 0; k < count; k++) {
      const [ax, ay] = current[k];
      const [bx, by] = current[k + 1];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    if (closed) next.push(next[0]);
    else next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

const fmt = (value: number) => (Math.round(value * 10) / 10).toString();

/** An SVG path for a polyline or a closed ring. */
export function pathData(points: Point[], closed: boolean): string {
  if (!points.length) return "";
  let d = `M${fmt(points[0][0])},${fmt(points[0][1])}`;
  for (let k = 1; k < points.length; k++) d += `L${fmt(points[k][0])},${fmt(points[k][1])}`;
  return closed ? `${d}Z` : d;
}

export function polygonArea(points: Point[]): number {
  let sum = 0;
  for (let k = 0; k < points.length - 1; k++) sum += points[k][0] * points[k + 1][1] - points[k + 1][0] * points[k][1];
  return sum / 2;
}

/** A cell's polygon as points. */
export function cellPolygon(mesh: Mesh, cell: number): Point[] {
  return mesh.corners[cell].map((corner): Point => [mesh.cornerX[corner], mesh.cornerY[corner]]);
}
