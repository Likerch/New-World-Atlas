// An exact Voronoi diagram for a handful of sites (cities, districts): convex cells clipped to a frame, with shared
// corner ids so cells can be walked as a street graph. Distant ghost sites keep every real cell bounded.
import Delaunator from "delaunator";
import type { Point } from "./geometry";
import { ccw, centroid, clipConvex } from "./polygon";

export interface VoronoiSide {
  other: number;
  /** Corner ids (shared between neighbouring cells). */
  a: number;
  b: number;
}

export interface Voronoi {
  sites: Point[];
  /** Cells clipped to the frame, counter-clockwise. */
  cells: Point[][];
  /** Every corner of the unclipped diagram, by id. */
  corners: Point[];
  /** Sides of each cell; neighbours that are ghosts have other >= sites.length. */
  sides: VoronoiSide[][];
  neighbors: number[][];
}

const nextHalfedge = (e: number) => (e % 3 === 2 ? e - 2 : e + 1);

function circumcenter(a: Point, b: Point, c: Point): Point {
  const ad = a[0] * a[0] + a[1] * a[1];
  const bd = b[0] * b[0] + b[1] * b[1];
  const cd = c[0] * c[0] + c[1] * c[1];
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
  return [(ad * (b[1] - c[1]) + bd * (c[1] - a[1]) + cd * (a[1] - b[1])) / d, (ad * (c[0] - b[0]) + bd * (a[0] - c[0]) + cd * (b[0] - a[0])) / d];
}

export function voronoi(sites: Point[], width: number, height: number): Voronoi {
  const n = sites.length;
  const all = [...sites];
  const radius = Math.max(width, height) * 3;
  for (let k = 0; k < 24; k++) {
    const angle = (k / 24) * Math.PI * 2;
    all.push([width / 2 + Math.cos(angle) * radius, height / 2 + Math.sin(angle) * radius]);
  }
  const delaunay = Delaunator.from(all);
  const { triangles, halfedges } = delaunay;
  const corners: Point[] = [];
  for (let t = 0; t < triangles.length / 3; t++) corners.push(circumcenter(all[triangles[3 * t]], all[triangles[3 * t + 1]], all[triangles[3 * t + 2]]));
  const inedge = new Int32Array(all.length).fill(-1);
  for (let e = 0; e < triangles.length; e++) {
    const end = triangles[nextHalfedge(e)];
    if (inedge[end] === -1 || halfedges[e] === -1) inedge[end] = e;
  }
  const frame: Point[] = [[0, 0], [width, 0], [width, height], [0, height]];
  const cells: Point[][] = [];
  const sides: VoronoiSide[][] = [];
  const neighbors: number[][] = [];
  for (let site = 0; site < n; site++) {
    const own: VoronoiSide[] = [];
    const ring: Point[] = [];
    const start = inedge[site];
    let incoming = start;
    do {
      const twin = halfedges[incoming];
      const here = Math.floor(incoming / 3);
      own.push({ other: triangles[incoming], a: here, b: twin === -1 ? here : Math.floor(twin / 3) });
      ring.push(corners[here]);
      incoming = halfedges[nextHalfedge(incoming)];
    } while (incoming !== -1 && incoming !== start);
    sides.push(own);
    neighbors.push(own.map((side) => side.other).filter((other) => other < n));
    cells.push(ccw(clipConvex(ccw(ring), frame)));
  }
  return { sites, cells, corners, sides, neighbors };
}

/** Lloyd relaxation: sites move to their cells' centroids, evening out the cells. */
export function relax(sites: Point[], width: number, height: number, rounds: number, keep?: (index: number) => boolean): Point[] {
  let current = sites;
  for (let round = 0; round < rounds; round++) {
    const diagram = voronoi(current, width, height);
    current = current.map((site, index) => (keep?.(index) || diagram.cells[index].length < 3 ? site : centroid(diagram.cells[index])));
  }
  return current;
}
