// The universe at the largest scale: galaxies strung along the walls of great voids — the cosmic web — gathered into
// superclusters, joined by filaments. Each galaxy opens as a galaxy of its own shape.
import Delaunator from "delaunator";
import { paletteColor } from "../color";
import { createLanguage, name } from "../language";
import { createRng, randomSeed } from "../random";
import type { GalaxyShape } from "./galaxy";

export type GalaxyKind = "spiral" | "barred" | "elliptical" | "ring" | "irregular" | "dwarf" | "quasar";

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
}

export interface Universe {
  params: UniverseParams;
  name: string;
  galaxies: GalaxyNode[];
  filaments: [number, number][];
  clusters: Supercluster[];
  voids: Void[];
}

export function universeParams(input: Partial<UniverseParams> = {}): UniverseParams {
  return { seed: input.seed || randomSeed(), galaxies: input.galaxies ?? 320, width: 1600, height: 1000, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== "")) };
}

/** The galaxy-map shape a galaxy of a kind is drawn with. */
export function shapeOf(kind: GalaxyKind): GalaxyShape {
  return kind === "barred" ? "barred" : kind === "elliptical" || kind === "dwarf" || kind === "quasar" ? "elliptical" : kind === "ring" ? "ring" : kind === "irregular" ? "clusters" : "spiral";
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
  return { params, name: name(tongue, rng.fork("name"), "land"), galaxies, filaments, clusters, voids };
}
