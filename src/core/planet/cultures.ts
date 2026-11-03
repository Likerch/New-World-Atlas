// Cultures: peoples rise where land is kind, take a character from their homeland (sailors on coasts, nomads on the
// steppe, highlanders in the mountains) and spread along the paths that suit them. Each speaks its own language.
import { paletteColor } from "../color";
import { createLanguage, name, shiftLanguage } from "../language";
import { PriorityQueue } from "../queue";
import type { Rng } from "../random";
import { BIOMES } from "./biomes";
import type { Culture, CultureKind, Ground } from "./model";

/** How well a cell feeds and shelters people: the base for cultures and towns alike. */
export function suitability(g: Ground, cell: number): number {
  if (g.water[cell]) return 0;
  let score = BIOMES[g.biome[cell]].habitability;
  if (!score) return 0;
  const river = g.river[cell];
  if (river) score *= 1.3 + Math.min(0.7, g.rivers[river].discharge / 6000);
  if (g.coast[cell] === 1) {
    const sea = g.mesh.neighbors[cell].some((next) => g.water[next] && g.features[g.feature[next]].kind === "ocean");
    score *= sea ? 1.25 : 1.12;
  }
  const height = g.height[cell];
  if (height > 50) score *= height > 70 ? 0.3 : 0.6;
  const t = g.temperature[cell];
  if (t < 0) score *= 0.5;
  else if (t > 28) score *= 0.8;
  return score;
}

/** The dry cell nearest a point that is not taken yet; good land first, any land when there is none near. */
export function nearestLand(g: Ground, x: number, y: number, taken: Set<number>): number {
  const start = g.mesh.find(x, y);
  let fallback = -1;
  const seen = new Set([start]);
  for (let ring = [start]; ring.length; ) {
    for (const cell of ring) {
      if (g.water[cell] || taken.has(cell)) continue;
      if (suitability(g, cell) > 0) return cell;
      if (fallback < 0) fallback = cell;
    }
    if (fallback >= 0) return fallback;
    const next: number[] = [];
    for (const cell of ring) for (const m of g.mesh.neighbors[cell]) if (!seen.has(m)) (seen.add(m), next.push(m));
    ring = next;
  }
  return start;
}

/** Picks well-spaced cells with the best scores, loosening the spacing until enough are found. */
export function spacedPicks(g: Ground, scores: Float32Array, count: number, spacing: number, rng: Rng, taken: number[] = []): number[] {
  const candidates = Array.from({ length: g.mesh.cells }, (_, cell) => cell)
    .filter((cell) => scores[cell] > 0)
    .map((cell) => [cell, scores[cell] * rng.float(0.5, 1)] as const)
    .sort((a, b) => b[1] - a[1])
    .map(([cell]) => cell);
  const picks: number[] = [];
  const all = [...taken];
  for (let gap = Math.max(spacing, g.mesh.spacing); picks.length < count && gap > g.mesh.spacing * 0.8; gap *= 0.8) {
    for (const cell of candidates) {
      if (picks.length >= count) break;
      const x = g.mesh.x[cell],
        y = g.mesh.y[cell];
      if (all.some((other) => (g.mesh.x[other] - x) ** 2 + (g.mesh.y[other] - y) ** 2 < gap * gap)) continue;
      picks.push(cell);
      all.push(cell);
    }
  }
  return picks;
}

const DRY = new Set([1, 2, 3, 4]);
const WILD = new Set([7, 8, 9, 10]);

function kindAt(g: Ground, cell: number, rng: Rng): CultureKind {
  const neighbors = g.mesh.neighbors[cell];
  const coastal = g.coast[cell] === 1 && neighbors.some((next) => g.water[next] && g.features[g.feature[next]].kind === "ocean");
  const island = g.features[g.feature[cell]].kind !== "continent";
  if (coastal && (island || rng.chance(0.35))) return "naval";
  if (neighbors.some((next) => g.water[next] && g.features[g.feature[next]].kind === "lake")) return "lake";
  if (g.river[cell] && g.rivers[g.river[cell]].discharge > 400) return "river";
  if (g.height[cell] > 50) return "highland";
  if (DRY.has(g.biome[cell]) && g.temperature[cell] > 8 && rng.chance(0.7)) return "nomadic";
  if (WILD.has(g.biome[cell])) return "hunting";
  return "generic";
}

/** The cost for a culture of a kind to step into a cell. */
function stepCost(g: Ground, cell: number, kind: CultureKind, homeBiome: number): number {
  if (g.water[cell]) {
    if (kind === "naval") return 25;
    if (kind === "lake" && g.features[g.feature[cell]].kind === "lake") return 30;
    return 700;
  }
  const biome = g.biome[cell];
  let cost = biome === homeBiome ? 10 : BIOMES[biome].cost;
  if (kind === "nomadic" && !DRY.has(biome)) cost *= 3;
  if (kind === "hunting" && WILD.has(biome)) cost *= 0.5;
  const height = g.height[cell];
  if (kind === "highland") cost += height < 40 ? 250 : 0;
  else cost += height > 70 ? 700 : height > 60 ? 300 : 0;
  if (kind === "river") cost += g.river[cell] ? 0 : 100;
  else if (g.river[cell]) cost += 20;
  if (kind === "naval" && g.coast[cell] > 3) cost += 120;
  return cost;
}

export function settleCultures(g: Ground, count: number, rng: Rng, anchors?: [number, number][]): { culture: Uint16Array; cultures: Culture[] } {
  const n = g.mesh.cells;
  const scores = new Float32Array(n);
  let landCells = 0;
  for (let cell = 0; cell < n; cell++) {
    scores[cell] = suitability(g, cell);
    if (!g.water[cell]) landCells++;
  }
  const spacing = Math.sqrt((landCells * g.mesh.spacing * g.mesh.spacing) / Math.max(1, count)) * 0.8;
  const taken = new Set<number>();
  const centers = anchors ? anchors.map(([x, y]) => {
    const cell = nearestLand(g, x, y, taken);
    taken.add(cell);
    return cell;
  }) : spacedPicks(g, scores, count, spacing, rng.fork("centers"));
  const hue = rng.next();
  // Families of tongues: a few proto-languages, each people's tongue a daughter of one of them.
  const families = Math.max(0, Math.min(8, Math.round(g.params.families ?? 0)));
  const protos = Array.from({ length: families }, (_, k) => {
    const own = rng.fork(`family-${k}`);
    const language = createLanguage(own.fork("language"));
    return { language, name: name(language, own, "people") };
  });
  const cultures: Culture[] = [
    { id: 0, name: "", kind: "generic", language: createLanguage(rng.fork("wild")), center: -1, color: "#999999", expansionism: 0, cells: 0, population: 0 },
  ];
  for (const center of centers) {
    const id = cultures.length;
    const own = rng.fork(`culture-${id}`);
    const kind = kindAt(g, center, own);
    const proto = protos.length ? protos[(id - 1) % protos.length] : null;
    const language = proto ? shiftLanguage(proto.language, own.fork("language")) : createLanguage(own.fork("language"));
    const boost = kind === "nomadic" ? 1.5 : kind === "naval" ? 1.3 : kind === "hunting" ? 0.8 : 1;
    cultures.push({ id, name: name(language, own, "people"), kind, language, center, color: paletteColor(id, hue, 0.45, 0.66), expansionism: own.float(1, 2) * boost, cells: 0, population: 0, ...(proto ? { family: proto.name } : {}) });
  }

  const culture = new Uint16Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const queue = new PriorityQueue<[number, number]>();
  for (const item of cultures.slice(1)) {
    best[item.center] = 0;
    culture[item.center] = item.id;
    queue.push([item.center, item.id], 0);
  }
  const limit = 12_000;
  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    const [[cell, id], priority] = entry;
    if (priority > best[cell]) continue;
    const owner = cultures[id];
    const homeBiome = g.biome[owner.center];
    for (const next of g.mesh.neighbors[cell]) {
      const total = priority + stepCost(g, next, owner.kind, homeBiome) / owner.expansionism;
      if (total > limit || total >= best[next]) continue;
      best[next] = total;
      if (!g.water[next]) culture[next] = id;
      queue.push([next, id], total);
    }
  }
  for (let cell = 0; cell < n; cell++) if (g.water[cell]) culture[cell] = 0;
  for (let cell = 0; cell < n; cell++) cultures[culture[cell]].cells++;
  return { culture, cultures };
}
