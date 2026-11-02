// Relief. A template is a recipe of blob, ridge and channel operations on cell heights (0–100, sea at 20), the way a
// cartographer would sketch continents; fractal noise then roughens coasts and slopes.
import { fbm, noise2, ridged } from "../noise";
import type { Mesh } from "../mesh";
import type { Rng } from "../random";

export type TemplateId =
  | "continents"
  | "archipelago"
  | "pangea"
  | "high-island"
  | "low-island"
  | "peninsula"
  | "isthmus"
  | "inland-sea"
  | "shattered"
  | "fractal";

export const TEMPLATES: TemplateId[] = ["continents", "archipelago", "pangea", "high-island", "low-island", "peninsula", "isthmus", "inland-sea", "shattered", "fractal"];

type Range = [number, number];
type Step =
  | { op: "hill" | "pit" | "range" | "trough"; count: Range; height: Range; x: Range; y: Range }
  | { op: "strait"; width: Range; direction: "vertical" | "horizontal" }
  | { op: "mask"; power: number }
  | { op: "smooth"; factor: number }
  | { op: "add"; value: number; min: number; max: number }
  | { op: "multiply"; factor: number; min: number; max: number }
  | { op: "invert"; axis: "x" | "y" | "both"; chance: number }
  | { op: "fractal"; scale: number; amplitude: number; base: number };

const hill = (count: Range, height: Range, x: Range, y: Range): Step => ({ op: "hill", count, height, x, y });
const pit = (count: Range, height: Range, x: Range, y: Range): Step => ({ op: "pit", count, height, x, y });
const range = (count: Range, height: Range, x: Range, y: Range): Step => ({ op: "range", count, height, x, y });
const trough = (count: Range, height: Range, x: Range, y: Range): Step => ({ op: "trough", count, height, x, y });

const RECIPES: Record<TemplateId, Step[]> = {
  continents: [
    hill([1, 1], [80, 85], [60, 80], [40, 60]),
    hill([1, 1], [80, 85], [20, 30], [40, 60]),
    hill([6, 7], [15, 30], [25, 75], [15, 85]),
    { op: "multiply", factor: 0.6, min: 20, max: 100 },
    hill([8, 10], [5, 10], [15, 85], [20, 80]),
    range([1, 2], [30, 60], [5, 15], [25, 75]),
    range([1, 2], [30, 60], [80, 95], [25, 75]),
    range([0, 3], [30, 60], [80, 90], [20, 80]),
    { op: "strait", width: [2, 2], direction: "vertical" },
    { op: "strait", width: [1, 1], direction: "vertical" },
    { op: "smooth", factor: 3 },
    trough([3, 4], [15, 20], [15, 85], [20, 80]),
    trough([3, 4], [5, 10], [45, 55], [45, 55]),
    pit([3, 4], [10, 20], [15, 85], [20, 80]),
    { op: "mask", power: 4 },
  ],
  archipelago: [
    { op: "add", value: 11, min: 0, max: 100 },
    range([2, 3], [40, 60], [20, 80], [20, 80]),
    hill([5, 5], [15, 20], [10, 90], [30, 70]),
    hill([2, 2], [10, 15], [10, 30], [20, 80]),
    hill([2, 2], [10, 15], [60, 90], [20, 80]),
    { op: "smooth", factor: 3 },
    trough([10, 10], [20, 30], [5, 95], [5, 95]),
    { op: "strait", width: [2, 2], direction: "vertical" },
    { op: "strait", width: [2, 2], direction: "horizontal" },
  ],
  pangea: [
    hill([1, 2], [25, 40], [15, 50], [0, 10]),
    hill([1, 2], [5, 40], [50, 85], [0, 10]),
    hill([1, 2], [25, 40], [50, 85], [90, 100]),
    hill([1, 2], [5, 40], [15, 50], [90, 100]),
    hill([8, 12], [20, 40], [20, 80], [48, 52]),
    { op: "smooth", factor: 2 },
    { op: "multiply", factor: 0.7, min: 20, max: 100 },
    trough([3, 4], [25, 35], [5, 95], [10, 20]),
    trough([3, 4], [25, 35], [5, 95], [80, 90]),
    range([5, 6], [30, 40], [10, 90], [35, 65]),
  ],
  "high-island": [
    hill([1, 1], [90, 100], [55, 70], [45, 55]),
    { op: "add", value: 6, min: 0, max: 100 },
    hill([6, 8], [25, 35], [25, 70], [35, 65]),
    range([1, 1], [40, 50], [45, 55], [45, 55]),
    { op: "multiply", factor: 0.85, min: 20, max: 100 },
    { op: "mask", power: 5 },
    { op: "smooth", factor: 2 },
    trough([2, 3], [20, 30], [20, 30], [20, 30]),
    trough([2, 3], [20, 30], [60, 80], [70, 80]),
    hill([1, 1], [10, 15], [60, 60], [50, 50]),
    hill([1, 1], [10, 15], [70, 70], [70, 75]),
    pit([3, 5], [10, 30], [15, 85], [20, 80]),
  ],
  "low-island": [
    hill([1, 1], [90, 99], [60, 80], [45, 55]),
    hill([1, 2], [20, 30], [10, 30], [10, 90]),
    { op: "smooth", factor: 2 },
    hill([6, 7], [25, 35], [20, 70], [30, 70]),
    range([1, 1], [40, 50], [45, 55], [45, 55]),
    trough([2, 3], [20, 30], [15, 85], [20, 30]),
    trough([2, 3], [20, 30], [15, 85], [70, 80]),
    hill([1, 2], [10, 15], [5, 15], [20, 80]),
    hill([1, 1], [10, 15], [85, 95], [70, 80]),
    pit([4, 6], [10, 20], [15, 85], [20, 80]),
    { op: "add", value: 3, min: 0, max: 100 },
    { op: "multiply", factor: 0.45, min: 20, max: 100 },
    { op: "mask", power: 6 },
  ],
  peninsula: [
    range([2, 3], [20, 35], [40, 50], [0, 15]),
    { op: "add", value: 5, min: 0, max: 100 },
    hill([1, 1], [90, 100], [10, 90], [0, 5]),
    { op: "add", value: 13, min: 0, max: 100 },
    hill([3, 4], [3, 5], [5, 95], [80, 100]),
    hill([1, 2], [3, 5], [5, 95], [40, 60]),
    trough([5, 6], [10, 25], [5, 95], [5, 95]),
    { op: "smooth", factor: 3 },
    { op: "invert", axis: "y", chance: 0.4 },
  ],
  isthmus: [
    hill([5, 10], [15, 30], [0, 30], [0, 20]),
    hill([5, 10], [15, 30], [10, 50], [20, 40]),
    hill([5, 10], [15, 30], [30, 70], [40, 60]),
    hill([5, 10], [15, 30], [50, 90], [60, 80]),
    hill([5, 10], [15, 30], [70, 100], [80, 100]),
    { op: "smooth", factor: 2 },
    trough([4, 8], [15, 30], [0, 30], [0, 20]),
    trough([4, 8], [15, 30], [10, 50], [20, 40]),
    trough([4, 8], [15, 30], [30, 70], [40, 60]),
    trough([4, 8], [15, 30], [50, 90], [60, 80]),
    trough([4, 8], [15, 30], [70, 100], [80, 100]),
    { op: "invert", axis: "x", chance: 0.25 },
  ],
  "inland-sea": [
    range([4, 6], [30, 80], [0, 100], [0, 10]),
    range([4, 6], [30, 80], [0, 100], [90, 100]),
    hill([6, 8], [30, 50], [10, 90], [0, 5]),
    hill([6, 8], [30, 50], [10, 90], [95, 100]),
    trough([3, 6], [40, 50], [0, 100], [0, 10]),
    trough([3, 6], [40, 50], [0, 100], [90, 100]),
    { op: "smooth", factor: 3 },
    { op: "multiply", factor: 0.7, min: 20, max: 100 },
    { op: "add", value: 10, min: 0, max: 100 },
    { op: "invert", axis: "both", chance: 0.3 },
  ],
  shattered: [
    hill([8, 10], [35, 45], [15, 85], [25, 75]),
    range([5, 7], [30, 40], [10, 90], [20, 80]),
    trough([10, 14], [18, 26], [5, 95], [5, 95]),
    pit([8, 12], [15, 22], [15, 85], [20, 80]),
    { op: "smooth", factor: 2 },
    { op: "mask", power: 3 },
  ],
  fractal: [{ op: "fractal", scale: 2.2, amplitude: 70, base: 12 }, { op: "mask", power: 2 }],
};

/** How fast blobs and ridges fade per step, tuned so shapes keep their size at any cell count. */
function fadeFor(cells: number, table: [number, number][]): number {
  if (cells <= table[0][0]) return table[0][1];
  for (let k = 1; k < table.length; k++) {
    if (cells <= table[k][0]) {
      const [c0, v0] = table[k - 1];
      const [c1, v1] = table[k];
      return v0 + ((v1 - v0) * (cells - c0)) / (c1 - c0);
    }
  }
  return table[table.length - 1][1];
}
const BLOB_FADE: [number, number][] = [[1_000, 0.93], [2_000, 0.95], [5_000, 0.97], [10_000, 0.98], [20_000, 0.99], [30_000, 0.991], [50_000, 0.993], [100_000, 0.994]];
const RIDGE_FADE: [number, number][] = [[1_000, 0.75], [2_000, 0.77], [5_000, 0.79], [10_000, 0.81], [20_000, 0.82], [30_000, 0.83], [50_000, 0.86], [100_000, 0.88]];

export function generateHeights(mesh: Mesh, template: TemplateId, rng: Rng): Float32Array {
  const h = new Float32Array(mesh.cells);
  const blobFade = fadeFor(mesh.cells, BLOB_FADE);
  const ridgeFade = fadeFor(mesh.cells, RIDGE_FADE);
  const W = mesh.width;
  const H = mesh.height;
  const pick = (r: Range) => rng.float(r[0], r[1]);
  const count = (r: Range) => rng.int(r[0], r[1]);
  const at = (x: Range, y: Range) => mesh.find((pick(x) / 100) * W, (pick(y) / 100) * H);

  const blob = (sign: 1 | -1, height: number, x: Range, y: Range) => {
    let start = at(x, y);
    // Hills grow on low ground, pits sink into high ground.
    for (let tries = 0; tries < 50 && (sign > 0 ? h[start] + height > 90 : h[start] < 20); tries++) start = at(x, y);
    // Whole units on purpose: truncation is part of the fade and keeps blobs from flooding the map.
    const change = new Uint8Array(mesh.cells);
    change[start] = height;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      for (const next of mesh.neighbors[cell]) {
        if (change[next]) continue;
        change[next] = change[cell] ** blobFade * rng.float(0.9, 1.1);
        if (change[next] > 1) queue.push(next);
      }
    }
    for (let cell = 0; cell < mesh.cells; cell++) h[cell] = Math.max(0, Math.min(100, h[cell] + sign * change[cell]));
  };

  /** A greedy, slightly wandering walk between two cells. */
  const walk = (from: number, to: number) => {
    const path = [from];
    const seen = new Set([from]);
    let cell = from;
    const tx = mesh.x[to],
      ty = mesh.y[to];
    while (cell !== to && path.length < mesh.cells) {
      let best = -1;
      let bestDistance = Infinity;
      for (const next of mesh.neighbors[cell]) {
        if (seen.has(next)) continue;
        let d = (mesh.x[next] - tx) ** 2 + (mesh.y[next] - ty) ** 2;
        if (rng.chance(0.15)) d /= 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = next;
        }
      }
      if (best === -1) break;
      cell = best;
      seen.add(cell);
      path.push(cell);
    }
    return path;
  };

  const ridge = (sign: 1 | -1, height: number, x: Range, y: Range) => {
    const start = at(x, y);
    let end = start;
    for (let tries = 0; tries < 50; tries++) {
      end = mesh.find(rng.float(0.1, 0.9) * W, rng.float(0.15, 0.85) * H);
      const d = Math.hypot(mesh.x[end] - mesh.x[start], mesh.y[end] - mesh.y[start]);
      if (d > W / 8 && d < W / 2) break;
    }
    const spine = walk(start, end);
    const used = new Uint8Array(mesh.cells);
    let ring = spine;
    for (const cell of ring) used[cell] = 1;
    let level = height;
    while (ring.length && level >= 2) {
      for (const cell of ring) h[cell] = Math.max(0, Math.min(100, h[cell] + sign * level * rng.float(0.85, 1.15)));
      level = level ** ridgeFade - 1;
      const next: number[] = [];
      for (const cell of ring) {
        for (const neighbor of mesh.neighbors[cell]) {
          if (used[neighbor]) continue;
          used[neighbor] = 1;
          next.push(neighbor);
        }
      }
      ring = next;
    }
    // Spurs: short downhill branches that break up a too-regular crest.
    if (sign > 0) {
      for (let k = 6; k < spine.length; k += 6) {
        let cell = spine[k];
        for (let step = 0; step < 6; step++) {
          const lower = mesh.neighbors[cell].reduce((best, next) => (h[next] < h[best] ? next : best), mesh.neighbors[cell][0]);
          h[lower] = (h[cell] * 2 + h[lower]) / 3;
          cell = lower;
        }
      }
    }
  };

  const strait = (width: number, direction: "vertical" | "horizontal") => {
    const vertical = direction === "vertical";
    const start = vertical ? mesh.find(rng.float(0.3, 0.7) * W, 2) : mesh.find(2, rng.float(0.3, 0.7) * H);
    const end = vertical ? mesh.find(rng.float(0.3, 0.7) * W, H - 2) : mesh.find(W - 2, rng.float(0.3, 0.7) * H);
    let ring = walk(start, end);
    const used = new Uint8Array(mesh.cells);
    for (let step = 0; step < width && ring.length; step++) {
      const next: number[] = [];
      for (const cell of ring) {
        if (used[cell]) continue;
        used[cell] = 1;
        h[cell] = Math.min(h[cell], rng.float(8, 18) - step * 2);
        for (const neighbor of mesh.neighbors[cell]) if (!used[neighbor]) next.push(neighbor);
      }
      ring = next;
    }
  };

  const inRange = (value: number, min: number, max: number) => value >= min && value <= max;

  for (const step of RECIPES[template]) {
    switch (step.op) {
      case "hill":
      case "pit": {
        for (let k = count(step.count); k > 0; k--) blob(step.op === "hill" ? 1 : -1, pick(step.height), step.x, step.y);
        break;
      }
      case "range":
      case "trough": {
        for (let k = count(step.count); k > 0; k--) ridge(step.op === "range" ? 1 : -1, pick(step.height), step.x, step.y);
        break;
      }
      case "strait":
        strait(count(step.width), step.direction);
        break;
      case "mask": {
        const power = Math.abs(step.power);
        for (let cell = 0; cell < mesh.cells; cell++) {
          const nx = (2 * mesh.x[cell]) / W - 1;
          const ny = (2 * mesh.y[cell]) / H - 1;
          let factor = (1 - nx * nx) * (1 - ny * ny);
          if (step.power < 0) factor = 1 - factor;
          h[cell] = (h[cell] * (power - 1) + h[cell] * factor) / power;
        }
        break;
      }
      case "smooth": {
        const next = new Float32Array(mesh.cells);
        for (let cell = 0; cell < mesh.cells; cell++) {
          let sum = h[cell];
          for (const neighbor of mesh.neighbors[cell]) sum += h[neighbor];
          const mean = sum / (mesh.neighbors[cell].length + 1);
          next[cell] = (h[cell] * (step.factor - 1) + mean) / step.factor;
        }
        h.set(next);
        break;
      }
      case "add":
        for (let cell = 0; cell < mesh.cells; cell++) if (inRange(h[cell], step.min, step.max)) h[cell] = Math.max(0, Math.min(100, h[cell] + step.value));
        break;
      case "multiply":
        for (let cell = 0; cell < mesh.cells; cell++) {
          if (!inRange(h[cell], step.min, step.max)) continue;
          // Land keeps sea level as its floor: scale only the part above it.
          h[cell] = step.min >= 20 ? 20 + (h[cell] - 20) * step.factor : h[cell] * step.factor;
        }
        break;
      case "invert": {
        if (!rng.chance(step.chance)) break;
        const copy = h.slice();
        for (let cell = 0; cell < mesh.cells; cell++) {
          const x = step.axis === "y" ? mesh.x[cell] : W - mesh.x[cell];
          const y = step.axis === "x" ? mesh.y[cell] : H - mesh.y[cell];
          h[cell] = copy[mesh.find(x, y)];
        }
        break;
      }
      case "fractal": {
        const base = noise2(rng.fork("fractal"));
        const crest = noise2(rng.fork("fractal-crest"));
        const s = step.scale / Math.max(W, H);
        for (let cell = 0; cell < mesh.cells; cell++) {
          const x = mesh.x[cell] * s;
          const y = mesh.y[cell] * s;
          const value = fbm(base, x, y, 6) * 0.75 + ridged(crest, x * 1.5, y * 1.5, 4) * 0.45;
          h[cell] = Math.max(0, Math.min(100, step.base + value * step.amplitude));
        }
        break;
      }
    }
  }

  // Fractal detail: crinkled coasts, uneven plains, broken crests.
  const detail = noise2(rng.fork("detail"));
  const s = 9 / Math.max(W, H);
  for (let cell = 0; cell < mesh.cells; cell++) {
    const n = fbm(detail, mesh.x[cell] * s, mesh.y[cell] * s, 4);
    const weight = h[cell] < 20 ? 2.5 : 4 + h[cell] * 0.06;
    h[cell] = Math.max(0, Math.min(100, h[cell] + n * weight));
  }
  return h;
}
