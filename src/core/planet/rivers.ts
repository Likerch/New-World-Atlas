// Water on land: pits fill into lakes, every cell drains to its lowest neighbour, rain gathers downstream, and the
// strongest channels become rivers with tributaries, discharge and length. In dry, hot lands a lake may lose more to
// the sun than it gathers: it has no outlet, turns salt, and no river leaves it.
import type { Point } from "../geometry";
import type { Mesh } from "../mesh";
import { PriorityQueue } from "../queue";
import { SEA_LEVEL, type River } from "./model";

export interface Hydrology {
  /** Freshwater lake cells (besides inland water already below sea level). */
  lake: Uint8Array;
  flux: Float32Array;
  river: Int32Array;
  rivers: River[];
  /** Where each cell drains to; -1 for the sea. */
  down: Int32Array;
  /** Lake cells of lakes with no outlet (salt lakes). */
  salt: Uint8Array;
}

/**
 * @param ocean cells of water bodies that reach the map's edge
 * @param scale km per map unit
 * @param brought water arriving from beyond the map (m³/s), by the cell it enters at
 * @param evaporation what open water loses to the sun, mm a year by cell; none keeps every lake open
 */
export function hydrology(mesh: Mesh, height: Float32Array, ocean: (cell: number) => boolean, rain: Float32Array, scale: number, brought?: Float32Array, evaporation?: Float32Array): Hydrology {
  const n = mesh.cells;
  // Priority flood from the sea and the map's edge: every depression fills up to its spill point.
  const filled = new Float32Array(n);
  const done = new Uint8Array(n);
  const queue = new PriorityQueue<number>();
  for (let cell = 0; cell < n; cell++) {
    if (ocean(cell) || mesh.edge[cell]) {
      filled[cell] = ocean(cell) ? height[cell] : Math.max(height[cell], SEA_LEVEL);
      done[cell] = 1;
      queue.push(cell, filled[cell]);
    }
  }
  const order: number[] = [];
  for (let item = queue.pop(); item; item = queue.pop()) {
    const [cell] = item;
    order.push(cell);
    for (const next of mesh.neighbors[cell]) {
      if (done[next]) continue;
      done[next] = 1;
      filled[next] = Math.max(height[next], filled[cell] + 1e-3);
      queue.push(next, filled[next]);
    }
  }

  // Deep enough pits on land hold lakes, if they are not mere puddles; inland water below sea level is a lake already.
  const lake = new Uint8Array(n);
  for (let cell = 0; cell < n; cell++) if (!ocean(cell) && (height[cell] < SEA_LEVEL || filled[cell] - height[cell] > 2.5)) lake[cell] = 1;
  const seen = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    if (!lake[start] || seen[start]) continue;
    const group = [start];
    seen[start] = 1;
    for (let head = 0; head < group.length; head++) {
      for (const next of mesh.neighbors[group[head]]) {
        if (lake[next] && !seen[next]) {
          seen[next] = 1;
          group.push(next);
        }
      }
    }
    if (group.length < 3 && group.every((cell) => height[cell] >= SEA_LEVEL)) for (const cell of group) lake[cell] = 0;
  }
  // A pit too shallow (or small) to hold a lake silts up to its brim: water crosses it on the level, never uphill.
  for (let cell = 0; cell < n; cell++) if (!ocean(cell) && !lake[cell] && filled[cell] > height[cell]) height[cell] = filled[cell];

  const down = new Int32Array(n).fill(-1);
  for (let cell = 0; cell < n; cell++) {
    if (ocean(cell)) continue;
    let best = -1;
    let level = filled[cell];
    for (const next of mesh.neighbors[cell]) {
      if (filled[next] < level) {
        level = filled[next];
        best = next;
      }
    }
    down[cell] = best;
  }

  // Runoff: millimetres a year over a cell's area, about 40 % of it reaching the rivers, in m³/s.
  const km2 = scale * scale;
  const flux = new Float32Array(n);
  let landRunoff = 0;
  let landCells = 0;
  for (let cell = 0; cell < n; cell++) {
    if (ocean(cell)) continue;
    flux[cell] = rain[cell] * mesh.area[cell] * km2 * 0.0317 * 0.4 * 1e-3;
    landRunoff += flux[cell];
    landCells++;
  }
  if (brought) for (let cell = 0; cell < n; cell++) if (!ocean(cell)) flux[cell] += brought[cell];
  const own = flux.slice();
  // Highest first, so a cell has all its inflow before passing it on.
  const gather = (closed: Uint8Array | null) => {
    for (let k = order.length - 1; k >= 0; k--) {
      const cell = order[k];
      if (down[cell] >= 0 && !closed?.[cell]) flux[down[cell]] += flux[cell] * (lake[cell] ? 0.9 : 1);
    }
  };
  gather(null);
  // A lake that the sun drinks faster than its rivers and its rain fill keeps all its water: it spills nowhere.
  const salt = new Uint8Array(n);
  if (evaporation) {
    const group = new Int32Array(n).fill(-1);
    const groups: number[][] = [];
    for (let start = 0; start < n; start++) {
      if (!lake[start] || group[start] >= 0) continue;
      const cells = [start];
      group[start] = groups.length;
      for (let head = 0; head < cells.length; head++) for (const next of mesh.neighbors[cells[head]]) if (lake[next] && group[next] < 0) (group[next] = groups.length), cells.push(next);
      groups.push(cells);
    }
    groups.forEach((cells, id) => {
      let gained = 0,
        lost = 0,
        wet = 0;
      for (const cell of cells) {
        wet += rain[cell] / cells.length;
        gained += rain[cell] * mesh.area[cell] * km2 * 0.0317 * 1e-3;
        lost += evaporation[cell] * mesh.area[cell] * km2 * 0.0317 * 1e-3;
        for (const next of mesh.neighbors[cell]) if (group[next] !== id && down[next] === cell) gained += flux[next];
      }
      // Only in dry lands: where it rains well, a lake fills until it spills.
      if (wet < 350 && lost >= gained) for (const cell of cells) salt[cell] = 1;
    });
    if (salt.some(Boolean)) {
      flux.set(own);
      gather(salt);
    }
  }

  const threshold = (landRunoff / Math.max(1, landCells)) * 7;
  const river = new Int32Array(n);
  const inflow = new Float32Array(n);
  const paths: number[][] = [[]];
  const ends: number[] = [-1];
  for (let k = order.length - 1; k >= 0; k--) {
    const cell = order[k];
    if (ocean(cell) || lake[cell] || flux[cell] < threshold) continue;
    let id = river[cell];
    if (!id) {
      id = paths.length;
      paths.push([]);
      ends.push(-1);
      river[cell] = id;
    }
    paths[id].push(cell);
    const next = down[cell];
    if (next < 0) continue;
    if (ocean(next) || lake[next]) {
      ends[id] = next;
      continue;
    }
    // At a confluence the stronger stream keeps its course; the weaker ends here as a tributary.
    if (!river[next] || flux[cell] > inflow[next]) {
      if (river[next]) ends[river[next]] = next;
      river[next] = id;
      inflow[next] = flux[cell];
    } else ends[id] = next;
  }

  // Keep rivers of some length; renumber them densely.
  const rivers: River[] = [{ id: 0, name: "", cells: [], mouth: [0, 0], discharge: 0, length: 0, parent: 0, width: 0 }];
  const renumber = new Int32Array(paths.length);
  const original = [0];
  for (let id = 1; id < paths.length; id++) {
    const cells = paths[id];
    if (cells.length < 3) continue;
    renumber[id] = rivers.length;
    original.push(id);
    const last = cells[cells.length - 1];
    const end = ends[id];
    const mouth: Point = end >= 0 ? [(mesh.x[last] + mesh.x[end]) / 2, (mesh.y[last] + mesh.y[end]) / 2] : [mesh.x[last], mesh.y[last]];
    let length = 0;
    for (let k = 1; k < cells.length; k++) length += Math.hypot(mesh.x[cells[k]] - mesh.x[cells[k - 1]], mesh.y[cells[k]] - mesh.y[cells[k - 1]]);
    length += Math.hypot(mouth[0] - mesh.x[last], mouth[1] - mesh.y[last]);
    const discharge = flux[last];
    rivers.push({ id: rivers.length, name: "", cells, mouth, discharge, length: length * scale, parent: end >= 0 && !ocean(end) && !lake[end] ? id : 0, width: Math.min(mesh.spacing * 0.45, 0.6 + Math.sqrt(discharge / threshold) * 0.35) });
  }
  // Parents are the rivers that own the confluence cell, under their new ids.
  for (const item of rivers.slice(1)) {
    const end = ends[original[item.id]];
    item.parent = item.parent && end >= 0 ? renumber[river[end]] : 0;
  }
  for (let cell = 0; cell < n; cell++) river[cell] = renumber[river[cell]];
  return { lake, flux, river, rivers, down, salt };
}
