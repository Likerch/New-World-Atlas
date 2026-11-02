// Water and land bodies: oceans (water reaching the map's edge), lakes, continents, islands and isles; and the
// distance of every cell to the nearest coast, which shading, harbours and settlement all lean on.
import type { Mesh } from "../mesh";
import type { WaterOrLand } from "./model";

export interface FeatureMap {
  feature: Int32Array;
  features: WaterOrLand[];
  coast: Int8Array;
}

export function markFeatures(mesh: Mesh, water: (cell: number) => boolean): FeatureMap {
  const feature = new Int32Array(mesh.cells);
  const features: WaterOrLand[] = [{ id: 0, kind: "ocean", land: false, cells: 0, border: false, name: "" }];
  let landCells = 0;
  for (let cell = 0; cell < mesh.cells; cell++) if (!water(cell)) landCells++;
  for (let start = 0; start < mesh.cells; start++) {
    if (feature[start]) continue;
    const id = features.length;
    const isWater = water(start);
    feature[start] = id;
    const queue = [start];
    let border = false;
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      if (mesh.edge[cell]) border = true;
      for (const next of mesh.neighbors[cell]) {
        if (feature[next] || water(next) !== isWater) continue;
        feature[next] = id;
        queue.push(next);
      }
    }
    const size = queue.length;
    const kind = isWater ? (border ? "ocean" : "lake") : size > Math.max(60, landCells * 0.1) ? "continent" : size > 15 ? "island" : "isle";
    features.push({ id, kind, land: !isWater, cells: size, border, name: "" });
  }

  // Distance to the coast in whole cells, capped to fit a byte.
  const coast = new Int8Array(mesh.cells);
  let ring: number[] = [];
  for (let cell = 0; cell < mesh.cells; cell++) {
    const own = water(cell);
    if (mesh.neighbors[cell].some((next) => water(next) !== own)) {
      coast[cell] = own ? -1 : 1;
      ring.push(cell);
    }
  }
  for (let step = 2; ring.length && step < 120; step++) {
    const next: number[] = [];
    for (const cell of ring) {
      for (const neighbor of mesh.neighbors[cell]) {
        if (coast[neighbor]) continue;
        coast[neighbor] = water(neighbor) ? -step : step;
        next.push(neighbor);
      }
    }
    ring = next;
  }
  for (let cell = 0; cell < mesh.cells; cell++) if (!coast[cell]) coast[cell] = water(cell) ? -120 : 120;
  return { feature, features, coast };
}
