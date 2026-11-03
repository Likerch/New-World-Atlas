// The universe at the largest scale: galaxies strung along the walls of great voids — the cosmic web — gathered into
// superclusters, joined by filaments. Each galaxy opens as a galaxy of its own shape. Among them, the strange: great
// attractors, cosmic strings, lensing rings, white holes, dark flows, relics of whoever came first; and the game
// master's own kinds of thing.
import Delaunator from "delaunator";
import { paletteColor } from "../color";
import { createLanguage, name } from "../language";
import { createRng, randomSeed, type Rng } from "../random";
import { cleanKind, type CustomKind } from "./custom";
import type { GalaxyShape } from "./galaxy";

export type GalaxyKind = "spiral" | "barred" | "elliptical" | "ring" | "irregular" | "dwarf" | "quasar" | "lenticular" | "starburst" | "colliding" | "ghost";

export type AnomalyKind = "great-attractor" | "cosmic-string" | "lens" | "white-hole" | "dark-flow" | "relic" | "supermassive" | "bubble-wall";
export const ANOMALY_KINDS: AnomalyKind[] = ["great-attractor", "cosmic-string", "lens", "white-hole", "dark-flow", "relic", "supermassive", "bubble-wall"];

export interface Anomaly {
  id: number;
  /** A built-in kind, or "custom" with the game master's kind id. */
  kind: AnomalyKind | "custom";
  custom?: string;
  x: number;
  y: number;
  /** Direction (a string's line, a flow's heading), radians. */
  angle: number;
  /** Reach in map units. */
  size: number;
  name: string;
}

export interface GalaxyNode {
  id: number;
  x: number;
  y: number;
  name: string;
  kind: GalaxyKind;
  /** How many stars its galaxy map gets. */
  stars: number;
  cluster: number;
  /** Civilisations that reach beyond their own stars. */
  civilisations: number;
}

export interface Supercluster {
  id: number;
  name: string;
  color: string;
}

export interface Void {
  x: number;
  y: number;
  r: number;
  name: string;
}

export interface UniverseParams {
  seed: string;
  galaxies: number;
  width: number;
  height: number;
  /** How much strangeness: 0 none, 1 the usual, up to 3. */
  anomalies: number;
  /** The game master's own kinds of thing. */
  custom: CustomKind[];
}

export interface Universe {
  params: UniverseParams;
  name: string;
  galaxies: GalaxyNode[];
  filaments: [number, number][];
  clusters: Supercluster[];
  voids: Void[];
  anomalies: Anomaly[];
}

export function universeParams(input: Partial<UniverseParams> = {}): UniverseParams {
  return { seed: input.seed || randomSeed(), galaxies: input.galaxies ?? 320, width: 1600, height: 1000, anomalies: 1, custom: [], ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== "")) };
}

/** The galaxy-map shape a galaxy of a kind is drawn with. */
export function shapeOf(kind: GalaxyKind): GalaxyShape {
  return kind === "barred" ? "barred" : kind === "elliptical" || kind === "dwarf" || kind === "quasar" || kind === "lenticular" || kind === "ghost" ? "elliptical" : kind === "ring" ? "ring" : kind === "irregular" || kind === "starburst" || kind === "colliding" ? "clusters" : "spiral";
}

export function generateUniverse(input: Partial<UniverseParams> = {}): Universe {
  const params = universeParams(input);
  const rng = createRng(params.seed).fork("universe");
  const { width: W, height: H } = params;
  const tongue = createLanguage(rng.fork("tongue"));
  // Voids: great empty bubbles; galaxies gather on their walls.
  const voids: Void[] = [];
  for (let attempt = 0; attempt < 300 && voids.length < 12; attempt++) {
    const v = { x: rng.float(0, W), y: rng.float(0, H), r: rng.float(90, 220), name: "" };
    if (voids.some((o) => Math.hypot(o.x - v.x, o.y - v.y) < (o.r + v.r) * 0.85)) continue;
    v.name = name(tongue, rng, "plain");
    voids.push(v);
  }
  const wallness = (x: number, y: number) => {
    let best = Infinity;
    for (const v of voids) best = Math.min(best, Math.abs(Math.hypot(x - v.x, y - v.y) - v.r));
    return best;
  };
  const inside = (x: number, y: number) => voids.some((v) => Math.hypot(x - v.x, y - v.y) < v.r * 0.8);
  const points: [number, number][] = [];
  for (let attempt = 0; attempt < params.galaxies * 40 && points.length < params.galaxies; attempt++) {
    const x = rng.float(10, W - 10),
      y = rng.float(10, H - 10);
    if (inside(x, y) || !rng.chance(Math.exp(-wallness(x, y) / 35))) continue;
    if (points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < 64)) continue;
    points.push([x, y]);
  }
  // Superclusters: the nearest of a few far-apart seeds.
  const seeds = rng.shuffle(points.map((_, k) => k)).reduce<number[]>((list, k) => (list.length < 7 && list.every((s) => Math.hypot(points[s][0] - points[k][0], points[s][1] - points[k][1]) > Math.min(W, H) / 3.2) ? [...list, k] : list), []);
  const hue = rng.next();
  const clusters: Supercluster[] = seeds.map((_, k) => ({ id: k, name: name(tongue, rng, "land"), color: paletteColor(k, hue, 0.6, 0.62) }));
  const galaxies: GalaxyNode[] = points.map(([x, y], id) => {
    const cluster = seeds.reduce((best, s, k) => (Math.hypot(points[s][0] - x, points[s][1] - y) < Math.hypot(points[seeds[best]][0] - x, points[seeds[best]][1] - y) ? k : best), 0);
    const kind = rng.weighted<GalaxyKind>([["spiral", 40], ["barred", 18], ["elliptical", 22], ["ring", 3], ["irregular", 8], ["dwarf", 8], ["quasar", 1]]);
    const stars = kind === "dwarf" ? rng.int(150, 300) : kind === "quasar" ? rng.int(300, 500) : rng.int(450, 900);
    return { id, x, y, name: name(tongue, rng, "plain"), kind, stars, cluster, civilisations: rng.chance(0.3) ? rng.int(1, 6) : 0 };
  });
  // Filaments: short links of the Delaunay web that do not cut across a void.
  const filaments: [number, number][] = [];
  if (points.length >= 3) {
    const d = Delaunator.from(points);
    for (let e = 0; e < d.triangles.length; e++) {
      const a = d.triangles[e],
        b = d.triangles[e % 3 === 2 ? e - 2 : e + 1];
      if (a > b) continue;
      const [ax, ay] = points[a],
        [bx, by] = points[b];
      if (Math.hypot(ax - bx, ay - by) > 70 || inside((ax + bx) / 2, (ay + by) / 2)) continue;
      filaments.push([a, b]);
    }
  }
  // Rarer kinds of galaxy, from a stream of their own so the old ones keep their kinds.
  const strange = Math.max(0, Math.min(3, params.anomalies));
  const odd = rng.fork("odd-galaxies");
  for (const g of galaxies) {
    if (!odd.chance(0.1 * strange)) continue;
    g.kind = g.kind === "elliptical" ? "lenticular" : g.kind === "dwarf" ? "ghost" : g.kind === "irregular" ? "starburst" : odd.pick<GalaxyKind>(["lenticular", "starburst", "colliding", "colliding"]);
    if (g.kind === "ghost") g.civilisations = 0;
  }
  // The strange: anywhere but deep in a void, except what belongs to the voids.
  const weird = rng.fork("anomalies");
  const anomalies: Anomaly[] = [];
  const spot = (where: "anywhere" | "core" | "rim" | "void" | "filament", from: Rng = weird) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (where === "void" && voids.length) {
        const v = from.pick(voids);
        const angle = from.float(0, Math.PI * 2),
          r = from.float(0, v.r * 0.6);
        return [v.x + Math.cos(angle) * r, v.y + Math.sin(angle) * r] as const;
      }
      if (where === "filament" && filaments.length) {
        const [a, b] = from.pick(filaments);
        const t = from.next();
        return [galaxies[a].x + (galaxies[b].x - galaxies[a].x) * t, galaxies[a].y + (galaxies[b].y - galaxies[a].y) * t] as const;
      }
      const x = from.float(40, W - 40),
        y = from.float(40, H - 40);
      const d = Math.hypot(x - W / 2, y - H / 2) / (Math.min(W, H) / 2);
      if (where === "core" && d > 0.45) continue;
      if (where === "rim" && d < 0.75) continue;
      if (where === "anywhere" && inside(x, y)) continue;
      return [x, y] as const;
    }
    return [from.float(40, W - 40), from.float(40, H - 40)] as const;
  };
  const WHERE: Record<AnomalyKind, "anywhere" | "void" | "filament"> = { "great-attractor": "anywhere", "cosmic-string": "anywhere", lens: "filament", "white-hole": "void", "dark-flow": "anywhere", relic: "filament", supermassive: "filament", "bubble-wall": "anywhere" };
  for (let k = Math.round(weird.int(5, 9) * strange); k > 0; k--) {
    const kind = weird.weighted<AnomalyKind>([["great-attractor", 1], ["cosmic-string", 2], ["lens", 3], ["white-hole", 1], ["dark-flow", 1.5], ["relic", 2], ["supermassive", 2], ["bubble-wall", 1]]);
    const [x, y] = spot(WHERE[kind]);
    const size = kind === "cosmic-string" ? weird.float(180, 420) : kind === "great-attractor" ? weird.float(70, 130) : kind === "bubble-wall" ? weird.float(160, 320) : kind === "dark-flow" ? weird.float(60, 110) : weird.float(8, 18);
    anomalies.push({ id: anomalies.length, kind, x, y, angle: weird.float(0, Math.PI * 2), size, name: name(tongue, weird, "plain") });
  }
  (params.custom ?? []).map(cleanKind).forEach((kind) => {
    const own = rng.fork(`custom-${kind.id}`);
    const where = kind.where === "claimed" || kind.where === "unclaimed" || kind.where === "nebula" ? "anywhere" : kind.where;
    for (let k = 0; k < kind.count; k++) {
      // Each kind draws its places from its own stream, so one kind never moves another.
      const [x, y] = spot(where, own);
      anomalies.push({ id: anomalies.length, kind: "custom", custom: kind.id, x, y, angle: own.float(0, Math.PI * 2), size: kind.area ? own.float(40, 90) : own.float(8, 14), name: kind.name || name(tongue, own, "plain") });
    }
  });
  return { params, name: name(tongue, rng.fork("name"), "land"), galaxies, filaments, clusters, voids, anomalies };
}
