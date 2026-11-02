// Galaxies: stars laid out as spirals, bars, ellipses, rings or clusters; spectral classes in real proportions;
// hyperlanes between neighbours (always one connected network), wormholes between far stars, nebulae, interstellar
// powers that spread along the lanes, and points of interest for a game master.
import Delaunator from "delaunator";
import { paletteColor } from "../color";
import type { Point } from "../geometry";
import { createLanguage, name, type Language } from "../language";
import { PriorityQueue } from "../queue";
import { createRng, randomSeed, type Rng } from "../random";

export type GalaxyShape = "spiral" | "barred" | "elliptical" | "ring" | "clusters";
export const GALAXY_SHAPES: GalaxyShape[] = ["spiral", "barred", "elliptical", "ring", "clusters"];

export type SpectralClass = "O" | "B" | "A" | "F" | "G" | "K" | "M" | "WD" | "NS" | "BH";

export const SPECTRA: Record<SpectralClass, { weight: number; color: string; luminosity: number; size: number }> = {
  O: { weight: 0.004, color: "#9bb0ff", luminosity: 30000, size: 2.6 },
  B: { weight: 0.02, color: "#aabfff", luminosity: 1000, size: 2.2 },
  A: { weight: 0.04, color: "#cad7ff", luminosity: 20, size: 1.9 },
  F: { weight: 0.07, color: "#f8f7ff", luminosity: 3, size: 1.7 },
  G: { weight: 0.1, color: "#fff1c9", luminosity: 1, size: 1.6 },
  K: { weight: 0.15, color: "#ffc98a", luminosity: 0.4, size: 1.45 },
  M: { weight: 0.58, color: "#ff9a5c", luminosity: 0.04, size: 1.2 },
  WD: { weight: 0.025, color: "#e6f0ff", luminosity: 0.01, size: 1 },
  NS: { weight: 0.004, color: "#b4f5ff", luminosity: 0.001, size: 1 },
  BH: { weight: 0.002, color: "#111111", luminosity: 0, size: 1.8 },
};

export type EmpireForm = "empire" | "republic" | "hegemony" | "collective" | "union" | "dominion" | "consortium" | "federation" | "theocracy";
export type SpaceFeature = "ruins" | "station" | "anomaly" | "derelict" | "pirate-base" | "relay" | "shipyard" | "research" | "quarantine" | "wormhole";

export interface Star {
  id: number;
  x: number;
  y: number;
  name: string;
  spectral: SpectralClass;
  empire: number;
  capital: boolean;
  /** Inhabited by its owners (settled worlds). */
  settled: boolean;
  feature: SpaceFeature | null;
}

export interface Empire {
  id: number;
  name: string;
  form: EmpireForm;
  color: string;
  capital: number;
  stars: number;
  species: string;
  language: Language;
}

export interface Nebula {
  x: number;
  y: number;
  r: number;
  color: string;
  name: string;
}

export interface GalaxyParams {
  seed: string;
  shape: GalaxyShape;
  stars: number;
  arms: number;
  empires: number;
  width: number;
  height: number;
}

export interface Galaxy {
  params: GalaxyParams;
  name: string;
  stars: Star[];
  lanes: [number, number][];
  wormholes: [number, number][];
  empires: Empire[];
  nebulae: Nebula[];
  /** Light years per map unit. */
  scale: number;
}

const FORMS: EmpireForm[] = ["empire", "republic", "hegemony", "collective", "union", "dominion", "consortium", "federation", "theocracy"];
const FEATURES: [SpaceFeature, number][] = [["ruins", 3], ["station", 4], ["anomaly", 3], ["derelict", 3], ["pirate-base", 2], ["relay", 2], ["shipyard", 2], ["research", 2], ["quarantine", 1]];

export function galaxyParams(input: Partial<GalaxyParams> = {}): GalaxyParams {
  const seed = input.seed || randomSeed();
  const rng = createRng(seed).fork("galaxy-params");
  return {
    seed,
    shape: rng.weighted<GalaxyShape>([["spiral", 5], ["barred", 3], ["elliptical", 2], ["ring", 1], ["clusters", 1]]),
    stars: rng.int(500, 900),
    arms: rng.int(2, 5),
    empires: rng.int(5, 10),
    width: 1600,
    height: 1000,
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "")),
  };
}

function place(params: GalaxyParams, rng: Rng): Point[] {
  const { width: W, height: H } = params;
  const cx = W / 2,
    cy = H / 2;
  const R = Math.min(W, H) * 0.46;
  const points: Point[] = [];
  const minGap = Math.sqrt((W * H) / params.stars) * 0.42;
  const tryAdd = (x: number, y: number) => {
    if (x < 12 || y < 12 || x > W - 12 || y > H - 12) return;
    if (points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < minGap * minGap)) return;
    points.push([x, y]);
  };
  const tilt = rng.float(0, Math.PI);
  const squash = rng.float(0.55, 0.85);
  const project = (x: number, y: number): Point => {
    // Seen at an angle: squash along one axis, then turn.
    const sx = x,
      sy = y * squash;
    return [cx + sx * Math.cos(tilt) - sy * Math.sin(tilt), cy + sx * Math.sin(tilt) + sy * Math.cos(tilt)];
  };
  const clumps = Array.from({ length: rng.int(4, 7) }, () => [rng.float(-0.8, 0.8) * R, rng.float(-0.8, 0.8) * R, rng.float(0.12, 0.25) * R]);
  for (let attempt = 0; attempt < params.stars * 12 && points.length < params.stars; attempt++) {
    let x = 0,
      y = 0;
    const roll = rng.next();
    if (params.shape === "elliptical") {
      x = rng.gauss(0, R * 0.42);
      y = rng.gauss(0, R * 0.42);
    } else if (params.shape === "ring") {
      const angle = rng.float(0, Math.PI * 2);
      const r = roll < 0.12 ? Math.abs(rng.gauss(0, R * 0.12)) : rng.gauss(R * 0.72, R * 0.08);
      x = Math.cos(angle) * r;
      y = Math.sin(angle) * r;
    } else if (params.shape === "clusters") {
      const [kx, ky, kr] = rng.pick(clumps);
      x = rng.gauss(kx, kr);
      y = rng.gauss(ky, kr);
    } else if (roll < 0.18) {
      // The central bulge (or bar).
      x = rng.gauss(0, R * (params.shape === "barred" ? 0.3 : 0.12));
      y = rng.gauss(0, R * 0.09);
    } else {
      const arm = rng.int(0, params.arms - 1);
      const t = Math.sqrt(rng.next());
      const start = params.shape === "barred" ? R * 0.28 : R * 0.08;
      const r = start + t * (R - start);
      const angle = (arm * Math.PI * 2) / params.arms + (r / R) * 3.4 + rng.gauss(0, 0.28 * (1.1 - t * 0.5));
      x = Math.cos(angle) * r + rng.gauss(0, R * 0.03);
      y = Math.sin(angle) * r + rng.gauss(0, R * 0.03);
      if (params.shape === "barred" && r < R * 0.32) x *= 1.8;
    }
    const [px, py] = project(x, y);
    tryAdd(px, py);
  }
  return points;
}

export function generateGalaxy(input: Partial<GalaxyParams> = {}): Galaxy {
  const params = galaxyParams(input);
  const rng = createRng(params.seed);
  const points = place(params, rng.fork("stars"));
  const n = points.length;
  const tongues = Array.from({ length: 10 }, (_, k) => createLanguage(rng.fork(`tongue-${k}`)));
  const names = rng.fork("names");
  const spectra = Object.entries(SPECTRA).map(([key, value]) => [key as SpectralClass, value.weight] as const);
  const stars: Star[] = points.map(([x, y], id) => ({ id, x, y, name: "", spectral: names.weighted(spectra), empire: 0, capital: false, settled: false, feature: null }));

  // Hyperlanes: short Delaunay edges, plus the spanning tree that keeps the network whole.
  const delaunay = Delaunator.from(points);
  const edges: [number, number, number][] = [];
  for (let e = 0; e < delaunay.triangles.length; e++) {
    const a = delaunay.triangles[e];
    const b = delaunay.triangles[e % 3 === 2 ? e - 2 : e + 1];
    if (a < b) edges.push([a, b, Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1])]);
  }
  edges.sort((x, y) => x[2] - y[2]);
  const parent = points.map((_, k) => k);
  const root = (k: number): number => (parent[k] === k ? k : (parent[k] = root(parent[k])));
  const typical = edges[Math.floor(edges.length * 0.35)]?.[2] ?? 30;
  const lanes: [number, number][] = [];
  const degree = new Array<number>(n).fill(0);
  for (const [a, b, length] of edges) {
    const joined = root(a) === root(b);
    if (!joined) parent[root(a)] = root(b);
    if (!joined || (length < typical * 1.25 && degree[a] < 4 && degree[b] < 4 && rng.chance(0.8))) {
      lanes.push([a, b]);
      degree[a]++;
      degree[b]++;
    }
  }
  const neighbors: { to: number; length: number }[][] = points.map(() => []);
  for (const [a, b] of lanes) {
    const length = Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]);
    neighbors[a].push({ to: b, length });
    neighbors[b].push({ to: a, length });
  }

  // Powers: capitals at sunlike stars well apart, spreading along the lanes.
  const empires: Empire[] = [{ id: 0, name: "", form: "empire", color: "#666666", capital: -1, stars: 0, species: "", language: tongues[0] }];
  const sunlike = stars.filter((star) => ["F", "G", "K"].includes(star.spectral)).map((star) => star.id);
  const gap = Math.min(params.width, params.height) / Math.sqrt(params.empires) / 1.6;
  const hue = rng.next();
  for (const id of rng.fork("capitals").shuffle([...sunlike])) {
    if (empires.length > params.empires) break;
    if (empires.slice(1).some((empire) => Math.hypot(stars[empire.capital].x - stars[id].x, stars[empire.capital].y - stars[id].y) < gap)) continue;
    const own = rng.fork(`empire-${empires.length}`);
    const language = tongues[(empires.length - 1) % tongues.length];
    empires.push({ id: empires.length, name: name(language, own, "land"), form: own.pick(FORMS), color: paletteColor(empires.length, hue, 0.7, 0.58), capital: id, stars: 0, species: name(language, own, "people"), language });
  }
  const best = new Float64Array(n).fill(Infinity);
  const queue = new PriorityQueue<[number, number]>();
  const reach = empires.map(() => rng.float(0.7, 1.4));
  for (const empire of empires.slice(1)) {
    best[empire.capital] = 0;
    stars[empire.capital].empire = empire.id;
    stars[empire.capital].capital = true;
    queue.push([empire.capital, empire.id], 0);
  }
  const limit = typical * 7;
  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    const [[star, owner], cost] = entry;
    if (cost > best[star]) continue;
    for (const { to, length } of neighbors[star]) {
      const hazard = stars[to].spectral === "BH" || stars[to].spectral === "NS" ? 3 : 1;
      const total = cost + (length * hazard) / reach[owner];
      if (total > limit || total >= best[to]) continue;
      best[to] = total;
      stars[to].empire = owner;
      queue.push([to, owner], total);
    }
  }
  for (const star of stars) {
    empires[star.empire].stars++;
    if (star.empire) star.settled = star.capital || (["F", "G", "K", "M"].includes(star.spectral) && names.chance(best[star.id] < typical * 3 ? 0.55 : 0.2));
    const tongue = star.empire ? empires[star.empire].language : tongues[star.id % tongues.length];
    star.name = star.empire || names.chance(0.35) ? name(tongue, names, "plain") : `${names.pick(["HD", "GJ", "KIC", "TYC", "LHS", "WISE"])} ${names.int(100, 9999)}`;
  }

  // Points of interest, wormholes and nebulae.
  const features = rng.fork("features");
  for (const star of stars) if (!star.capital && features.chance(0.08)) star.feature = features.weighted(FEATURES);
  const wormholes: [number, number][] = [];
  for (let k = features.int(1, 3); k > 0; k--) {
    const a = features.int(0, n - 1);
    const far = stars.filter((star) => Math.hypot(star.x - stars[a].x, star.y - stars[a].y) > Math.min(params.width, params.height) * 0.5);
    if (!far.length) continue;
    const b = features.pick(far).id;
    wormholes.push([a, b]);
    stars[a].feature = "wormhole";
    stars[b].feature = "wormhole";
  }
  const nebulae: Nebula[] = Array.from({ length: features.int(4, 9) }, () => {
    const star = features.pick(stars);
    return { x: star.x + features.float(-40, 40), y: star.y + features.float(-40, 40), r: features.float(40, 130), color: features.pick(["#ff4fa3", "#3fd6ff", "#7a5cff", "#ff8a3d", "#36e0a0"]), name: name(features.pick(tongues), features, "plain") };
  });
  return { params, name: name(tongues[0], rng.fork("galaxy-name"), "land"), stars, lanes, wormholes, empires, nebulae, scale: 100_000 / Math.min(params.width, params.height) };
}
