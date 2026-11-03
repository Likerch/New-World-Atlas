// The dual mesh every map level is built on: Voronoi cells around jittered points (the regions we colour and reason
// about) and their Delaunay triangles (whose centroids are the cell corners). A ring of "ghost" points outside the map
// keeps every real cell closed.
import Delaunator from "delaunator";
import type { Rng } from "./random";

/** One side of a cell: the neighbour across it (ghosts are >= mesh.cells) and the two corners it runs between. */
export interface Side {
  other: number;
  a: number;
  b: number;
}

export interface Mesh {
  width: number;
  height: number;
  /** Average distance between cell centres. */
  spacing: number;
  /** Number of real cells; ghost points come after them. */
  cells: number;
  x: Float64Array;
  y: Float64Array;
  /** Real neighbours of each cell. */
  neighbors: number[][];
  /** Every side of each cell in polygon order, ghosts included. */
  sides: Side[][];
  /** Corner ids of each cell's polygon. */
  corners: number[][];
  cornerX: Float64Array;
  cornerY: Float64Array;
  /** 1 for cells on the map's edge. */
  edge: Uint8Array;
  area: Float64Array;
  /** The cell whose centre is nearest to a point. */
  find(x: number, y: number): number;
}

const nextHalfedge = (e: number) => (e % 3 === 2 ? e - 2 : e + 1);

export function buildMesh(width: number, height: number, cellCount: number, rng: Rng): Mesh {
  const spacing = Math.sqrt((width * height) / cellCount);
  const columns = Math.max(2, Math.round(width / spacing));
  const rows = Math.max(2, Math.round(height / spacing));
  const stepX = width / columns;
  const stepY = height / rows;
  const coords: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      coords.push((column + 0.5 + rng.float(-0.45, 0.45)) * stepX, (row + 0.5 + rng.float(-0.45, 0.45)) * stepY);
    }
  }
  const cells = coords.length / 2;
  // Ghosts: a ring one step outside the map.
  for (let x = -stepX / 2; x <= width + stepX; x += stepX) coords.push(x, -stepY, x, height + stepY);
  for (let y = stepY / 2; y < height; y += stepY) coords.push(-stepX, y, width + stepX, y);

  const delaunay = new Delaunator(coords);
  const { triangles, halfedges } = delaunay;
  const triangleCount = triangles.length / 3;
  const cornerX = new Float64Array(triangleCount);
  const cornerY = new Float64Array(triangleCount);
  for (let t = 0; t < triangleCount; t++) {
    const p = triangles[3 * t],
      q = triangles[3 * t + 1],
      r = triangles[3 * t + 2];
    cornerX[t] = (coords[2 * p] + coords[2 * q] + coords[2 * r]) / 3;
    cornerY[t] = (coords[2 * p + 1] + coords[2 * q + 1] + coords[2 * r + 1]) / 3;
  }

  // An incoming half-edge for every point; for hull points, the one without a twin so circulation covers them fully.
  const inedge = new Int32Array(coords.length / 2).fill(-1);
  for (let e = 0; e < triangles.length; e++) {
    const end = triangles[nextHalfedge(e)];
    if (inedge[end] === -1 || halfedges[e] === -1) inedge[end] = e;
  }

  const x = new Float64Array(cells);
  const y = new Float64Array(cells);
  const neighbors: number[][] = new Array(cells);
  const sides: Side[][] = new Array(cells);
  const corners: number[][] = new Array(cells);
  const edge = new Uint8Array(cells);
  const area = new Float64Array(cells);
  for (let cell = 0; cell < cells; cell++) {
    x[cell] = coords[2 * cell];
    y[cell] = coords[2 * cell + 1];
    const cellSides: Side[] = [];
    const cellCorners: number[] = [];
    const start = inedge[cell];
    let incoming = start;
    do {
      const twin = halfedges[incoming];
      cellSides.push({ other: triangles[incoming], a: Math.floor(incoming / 3), b: twin === -1 ? Math.floor(incoming / 3) : Math.floor(twin / 3) });
      cellCorners.push(Math.floor(incoming / 3));
      incoming = halfedges[nextHalfedge(incoming)];
    } while (incoming !== -1 && incoming !== start);
    sides[cell] = cellSides;
    corners[cell] = cellCorners;
    neighbors[cell] = cellSides.map((side) => side.other).filter((other) => other < cells);
    if (neighbors[cell].length < cellSides.length) edge[cell] = 1;
    let sum = 0;
    for (let k = 0; k < cellCorners.length; k++) {
      const p = cellCorners[k],
        q = cellCorners[(k + 1) % cellCorners.length];
      sum += cornerX[p] * cornerY[q] - cornerX[q] * cornerY[p];
    }
    area[cell] = Math.abs(sum) / 2;
  }

  return withFind({ width, height, spacing, cells, x, y, neighbors, sides, corners, cornerX, cornerY, edge, area });
}

/** A mesh with its nearest-cell lookup: built with the mesh, and again for a mesh that came from a worker (which
 * cannot carry a function). */
export function withFind(mesh: Omit<Mesh, "find">): Mesh {
  const { width, height, spacing, cells, x, y } = mesh;
  const columns = Math.max(2, Math.round(width / spacing));
  const rows = Math.max(2, Math.round(height / spacing));
  const stepX = width / columns;
  const stepY = height / rows;
  // A bucket grid for nearest-cell lookups.
  const bucket = (value: number, step: number, count: number) => Math.min(count - 1, Math.max(0, Math.floor(value / step)));
  const grid: number[][] = Array.from({ length: columns * rows }, () => []);
  for (let cell = 0; cell < cells; cell++) grid[bucket(y[cell], stepY, rows) * columns + bucket(x[cell], stepX, columns)].push(cell);
  const find = (px: number, py: number) => {
    const column = bucket(px, stepX, columns);
    const row = bucket(py, stepY, rows);
    let best = 0;
    let bestDistance = Infinity;
    for (let r = Math.max(0, row - 2); r <= Math.min(rows - 1, row + 2); r++) {
      for (let c = Math.max(0, column - 2); c <= Math.min(columns - 1, column + 2); c++) {
        for (const cell of grid[r * columns + c]) {
          const distance = (x[cell] - px) ** 2 + (y[cell] - py) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = cell;
          }
        }
      }
    }
    return best;
  };
  return { ...mesh, find };
}
