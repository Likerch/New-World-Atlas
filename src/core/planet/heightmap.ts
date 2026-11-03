// Relief. A template is a recipe of blob, ridge and channel operations on cell heights (0–100, sea at 20), the way a
// cartographer would sketch continents; fractal noise then roughens coasts and slopes. One template grows the land
// from tectonic plates instead: mountains where plates collide, trenches and island arcs where one dives under
// another, rifts where they part. A GM may write a recipe of their own, and ask for a share of land.
import { fbm, noise2, ridged } from "../noise";
import type { Mesh } from "../mesh";
import { PriorityQueue } from "../queue";
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
  | "fractal"
  | "plates"
  | "twins"
  | "rift";

export const TEMPLATES: TemplateId[] = ["continents", "archipelago", "pangea", "high-island", "low-island", "peninsula", "isthmus", "inland-sea", "shattered", "fractal", "plates", "twins", "rift"];
/** The templates a world without one is given at random: the older ones, so a seed still gives the world it gave. */
export const RANDOM_TEMPLATES: TemplateId[] = ["continents", "archipelago", "pangea", "high-island", "low-island", "peninsula", "isthmus", "inland-sea", "shattered"];

type Range = [number, number];
type Step =
  | { op: "hill" | "pit" | "range" | "trough"; count: Range; height: Range; x: Range; y: Range }
  | { op: "strait"; width: Range; direction: "vertical" | "horizontal" }
  | { op: "mask"; power: number }
  | { op: "smooth"; factor: number }
  | { op: "add"; value: number; min: number; max: number }
  | { op: "multiply"; factor: number; min: number; max: number }
  | { op: "invert"; axis: "x" | "y" | "both"; chance: number }
  | { op: "fractal"; scale: number; amplitude: number; base: number }
  | { op: "plates"; count: Range };

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
  plates: [{ op: "plates", count: [8, 13] }, { op: "smooth", factor: 2 }],
  twins: [
    hill([1, 1], [70, 80], [18, 32], [30, 70]),
    hill([1, 1], [70, 80], [68, 82], [30, 70]),
    hill([4, 6], [15, 25], [10, 90], [15, 85]),
    { op: "multiply", factor: 0.6, min: 20, max: 100 },
    range([1, 2], [30, 50], [10, 40], [20, 80]),
    range([1, 2], [30, 50], [60, 90], [20, 80]),
    { op: "strait", width: [2, 3], direction: "vertical" },
    { op: "smooth", factor: 3 },
    pit([2, 3], [10, 18], [15, 85], [20, 80]),
    { op: "mask", power: 3 },
  ],
  rift: [
    hill([1, 1], [85, 95], [40, 60], [40, 60]),
    hill([5, 7], [20, 30], [15, 85], [15, 85]),
    { op: "multiply", factor: 0.65, min: 20, max: 100 },
    range([2, 3], [30, 50], [10, 90], [20, 80]),
    trough([2, 3], [40, 50], [44, 56], [15, 85]),
    { op: "smooth", factor: 2 },
    { op: "mask", power: 4 },
  ],
};

const OPS = ["hill", "pit", "range", "trough", "strait", "mask", "smooth", "add", "multiply", "invert", "fractal", "plates"] as const;

/** A template's recipe as text, one step a line, to start a recipe of one's own from. */
export function recipeText(template: TemplateId): string {
  const r = (range: Range) => (range[0] === range[1] ? `${range[0]}` : `${range[0]}-${range[1]}`);
  return RECIPES[template]
    .map((step) => {
      switch (step.op) {
        case "hill":
        case "pit":
        case "range":
        case "trough":
          return `${step.op} ${r(step.count)} ${r(step.height)} ${r(step.x)} ${r(step.y)}`;
        case "strait":
          return `strait ${r(step.width)} ${step.direction}`;
        case "mask":
          return `mask ${step.power}`;
        case "smooth":
          return `smooth ${step.factor}`;
        case "add":
          return `add ${step.value} ${step.min}-${step.max}`;
        case "multiply":
          return `multiply ${step.factor} ${step.min}-${step.max}`;
        case "invert":
          return `invert ${step.axis} ${step.chance}`;
        case "fractal":
          return `fractal ${step.scale} ${step.amplitude} ${step.base}`;
        case "plates":
          return `plates ${r(step.count)}`;
      }
    })
    .join("\n");
}

/**
 * A recipe written as text: "hill 1 80-85 60-80 40-60" (how many, how high, where across and down in per cent), the
 * same for range, pit and trough; "strait 2 vertical", "mask 4", "smooth 3", "add 10 0-100", "multiply 0.6 20-100",
 * "invert both 0.3", "fractal 2.2 70 12", "plates 8-13". Lines it cannot read are listed (from 1) and skipped.
 */
export function parseRecipe(text: string): { steps: Step[]; errors: number[] } {
  const steps: Step[] = [];
  const errors: number[] = [];
  const range = (word: string | undefined): Range | null => {
    const match = /^(-?\d*\.?\d+)(?:-(-?\d*\.?\d+))?$/u.exec(word ?? "");
    if (!match) return null;
    const a = Number(match[1]);
    const b = match[2] === undefined ? a : Number(match[2]);
    return [Math.min(a, b), Math.max(a, b)];
  };
  text.split(/\r?\n/u).forEach((line, index) => {
    const words = line.replace(/#.*$/u, "").trim().toLowerCase().split(/\s+/u).filter(Boolean);
    if (!words.length) return;
    const [op, ...rest] = words;
    const ranges = rest.map(range);
    const n = (k: number) => ranges[k]?.[0];
    let step: Step | null = null;
    if ((op === "hill" || op === "pit" || op === "range" || op === "trough") && ranges.length === 4 && ranges.every(Boolean)) {
      const [count, height, x, y] = ranges as Range[];
      // Heights within the map's range (a blob's height is a byte: larger or negative ones would wrap round).
      const clamp = (r: Range): Range => [Math.max(0, Math.min(100, r[0])), Math.max(0, Math.min(100, r[1]))];
      step = { op, count: [Math.max(0, Math.min(count[0], 60)), Math.max(0, Math.min(count[1], 60))], height: clamp(height), x, y };
    } else if (op === "strait" && ranges[0] && (rest[1] === "vertical" || rest[1] === "horizontal")) step = { op, width: ranges[0], direction: rest[1] };
    else if (op === "mask" && n(0) !== undefined) step = { op, power: n(0)! || 1 };
    else if (op === "smooth" && n(0) !== undefined) step = { op, factor: Math.max(1, n(0)!) };
    else if ((op === "add" || op === "multiply") && n(0) !== undefined && ranges[1]) step = op === "add" ? { op, value: n(0)!, min: ranges[1][0], max: ranges[1][1] } : { op, factor: n(0)!, min: ranges[1][0], max: ranges[1][1] };
    else if (op === "invert" && (rest[0] === "x" || rest[0] === "y" || rest[0] === "both") && n(1) !== undefined) step = { op, axis: rest[0], chance: n(1)! };
    else if (op === "fractal" && [0, 1, 2].every((k) => n(k) !== undefined)) step = { op, scale: n(0)!, amplitude: n(1)!, base: n(2)! };
    else if (op === "plates" && ranges[0]) step = { op, count: [Math.max(2, Math.min(40, ranges[0][0])), Math.max(2, Math.min(40, ranges[0][1]))] };
    if (step && (OPS as readonly string[]).includes(step.op)) steps.push(step);
    else errors.push(index + 1);
  });
  return { steps, errors };
}

/** Raises or lowers the relief, keeping its shape, so that the given share of the map stands above the sea. */
export function setLandShare(h: Float32Array, share: number): void {
  // By rank, not by value: cells of equal height (a flat sea floor) are split as the share asks, the higher-ranked up.
  const order = Array.from(h.keys()).sort((a, b) => h[a] - h[b] || a - b);
  const sea = Math.max(0, Math.min(order.length - 1, Math.floor(order.length * (1 - Math.max(0.01, Math.min(0.99, share))))));
  const low = h[order[0]],
    level = h[order[sea]],
    high = h[order[order.length - 1]];
  // The land keeps its shape up to its highest point (and at least some height above the sea).
  const top = Math.max(high, level + 1, SEA + 20);
  const next = new Float32Array(h.length);
  order.forEach((cell, rank) => {
    if (rank < sea) next[cell] = level > low ? ((h[cell] - low) / (level - low)) * (SEA - 0.5) : (rank / Math.max(1, sea)) * (SEA - 0.5);
    else next[cell] = SEA + 0.01 + (high > level ? ((h[cell] - level) / (high - level)) * (top - SEA - 0.01) : ((rank - sea) / Math.max(1, order.length - sea)) * (top - SEA - 0.01));
  });
  h.set(next);
}

const SEA = 20;

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

export function generateHeights(mesh: Mesh, template: TemplateId, rng: Rng, recipe?: string): Float32Array {
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

  /**
   * Tectonic plates: continental ones stand high and oceanic ones low; where they collide mountains rise (on the
   * continent, over a trench, where an ocean plate dives under it), where two ocean plates meet an arc of islands, and
   * where plates part a rift valley on land and a ridge on the sea floor. The effect fades a few cells from the seam.
   */
  const plates = (count: number) => {
    const plate = new Int16Array(mesh.cells).fill(-1);
    const queue = new PriorityQueue<number>();
    const pace: number[] = [];
    for (let k = 0; k < count; k++) {
      const seed = mesh.find(rng.float(0.04, 0.96) * W, rng.float(0.06, 0.94) * H);
      if (plate[seed] >= 0) continue;
      plate[seed] = pace.length;
      pace.push(rng.float(0.6, 1.4));
      queue.push(seed, 0);
    }
    // Plates grow at their own pace with a ragged edge, so their seams wander.
    for (let entry = queue.pop(); entry; entry = queue.pop()) {
      const [cell, cost] = entry;
      for (const next of mesh.neighbors[cell]) {
        if (plate[next] >= 0) continue;
        plate[next] = plate[cell];
        queue.push(next, cost + pace[plate[cell]] * rng.float(0.5, 1.5));
      }
    }
    const kinds = pace.map(() => rng.chance(0.42));
    if (!kinds.some(Boolean)) kinds[0] = true;
    const motion = pace.map(() => {
      const angle = rng.float(0, Math.PI * 2);
      const speed = rng.float(0.3, 1);
      return [Math.cos(angle) * speed, Math.sin(angle) * speed];
    });
    const base = kinds.map((land) => (land ? rng.float(30, 38) : rng.float(6, 12)));
    const lift = new Float32Array(mesh.cells);
    const set = new Uint8Array(mesh.cells);
    let ring: number[] = [];
    for (let cell = 0; cell < mesh.cells; cell++) {
      const a = plate[cell];
      let sum = 0,
        seams = 0;
      for (const next of mesh.neighbors[cell]) {
        const b = plate[next];
        if (b === a) continue;
        const dx = mesh.x[next] - mesh.x[cell],
          dy = mesh.y[next] - mesh.y[cell];
        const length = Math.hypot(dx, dy) || 1;
        const closing = ((motion[a][0] - motion[b][0]) * dx + (motion[a][1] - motion[b][1]) * dy) / length;
        const landA = kinds[a],
          landB = kinds[b];
        if (closing > 0) sum += closing * (landA && landB ? 62 : landA ? 46 : landB ? -14 : 18);
        else sum += -closing * (landA ? -16 : 7);
        seams++;
      }
      if (!seams) continue;
      lift[cell] = sum / seams;
      set[cell] = 1;
      ring.push(cell);
    }
    for (let step = 0; step < 6 && ring.length; step++) {
      const next: number[] = [];
      for (const cell of ring) {
        for (const m of mesh.neighbors[cell]) {
          if (set[m] || plate[m] !== plate[cell]) continue;
          set[m] = 2;
          next.push(m);
        }
      }
      for (const cell of next) {
        let sum = 0,
          from = 0;
        for (const m of mesh.neighbors[cell]) if (set[m] === 1) (sum += lift[m]), from++;
        lift[cell] = from ? (sum / from) * 0.68 : 0;
      }
      for (const cell of next) set[cell] = 1;
      ring = next;
    }
    const wobble = noise2(rng.fork("plates"));
    const s = 4 / Math.max(W, H);
    for (let cell = 0; cell < mesh.cells; cell++) h[cell] = Math.max(0, Math.min(100, base[plate[cell]] + lift[cell] + fbm(wobble, mesh.x[cell] * s, mesh.y[cell] * s, 4) * 14));
  };

  const inRange = (value: number, min: number, max: number) => value >= min && value <= max;

  const own = recipe ? parseRecipe(recipe).steps : [];
  for (const step of own.length ? own : RECIPES[template]) {
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
      case "plates":
        plates(count(step.count));
        break;
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
