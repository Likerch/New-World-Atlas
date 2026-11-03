// The universe at the largest scale: galaxies strung along the walls of great voids — the cosmic web — gathered into
// superclusters, joined by filaments. Each galaxy opens as a galaxy of its own shape. Among them, the strange: great
// attractors, cosmic strings, lensing rings, white holes, dark flows, relics of whoever came first; and the game
// master's own kinds of thing. The same map at the scale of one supercluster or of a local group of galaxies round a
// few giants; a young universe or an old one. Civilisations that reached past their galaxy spread along the filaments
// as powers and raise gates between galaxies; the strange marks the galaxies near it. A setting of magic sees the sky
// otherwise: crystal spheres adrift in the phlogiston, or the planes of existence round the world.
import Delaunator from "delaunator";
import { paletteColor } from "../color";
import { createLanguage, name, type Language } from "../language";
import { PriorityQueue } from "../queue";
import { createRng, randomSeed, type Rng } from "../random";
import type { Setting } from "../setting";
import { cleanKind, type CustomKind } from "./custom";
import { EMPIRE_FORMS, type EmpireForm, type GalaxyShape } from "./galaxy";
import { spaceAge } from "./profile";

export type GalaxyKind = "spiral" | "barred" | "elliptical" | "ring" | "irregular" | "dwarf" | "quasar" | "lenticular" | "starburst" | "colliding" | "ghost";
export const GALAXY_KINDS: GalaxyKind[] = ["spiral", "barred", "elliptical", "ring", "irregular", "dwarf", "quasar", "lenticular", "starburst", "colliding", "ghost"];

export type AnomalyKind = "great-attractor" | "cosmic-string" | "lens" | "white-hole" | "dark-flow" | "relic" | "supermassive" | "bubble-wall";
export const ANOMALY_KINDS: AnomalyKind[] = ["great-attractor", "cosmic-string", "lens", "white-hole", "dark-flow", "relic", "supermassive", "bubble-wall"];

/** How far the map reaches: the cosmic web, one supercluster, or a local group round a few giants. */
export type UniverseScale = "web" | "supercluster" | "group";
/** How the setting sees the sky: galaxies in the web, crystal spheres in the phlogiston, or planes of existence. */
export type Cosmology = "web" | "spheres" | "planes";
/** A young universe (bursts of new stars, quasars, few peoples) or an old one (ellipticals, dark galaxies, relics). */
export type Epoch = "young" | "now" | "old";
export type PlaneKind = "material" | "ethereal" | "astral" | "fire" | "water" | "air" | "earth" | "positive" | "negative" | "heaven" | "elysium" | "wilds" | "chaos" | "abyss" | "hell" | "order" | "dream" | "shadow" | "demiplane";

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
  /** The power of the universe that holds it. */
  power?: number;
  /** The strange things near enough to mark it. */
  touched?: AnomalyKind[];
  /** In the planes of existence: which plane it is. */
  plane?: PlaneKind;
}

export interface Supercluster {
  id: number;
  name: string;
  color: string;
}

export interface Void {
  id: number;
  x: number;
  y: number;
  r: number;
  name: string;
}

/** A civilisation that reached past its own galaxy: its home and the galaxies it holds along the filaments. */
export interface UniversePower {
  id: number;
  name: string;
  form: EmpireForm;
  color: string;
  home: number;
  galaxies: number;
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
  /** How many superclusters and voids there are, and the share of galaxies with civilisations. */
  clusters: number;
  voids: number;
  civilisations: number;
  epoch: Epoch;
  scale: UniverseScale;
  cosmology: Cosmology;
}

export interface Universe {
  params: UniverseParams;
  name: string;
  galaxies: GalaxyNode[];
  filaments: [number, number][];
  clusters: Supercluster[];
  voids: Void[];
  anomalies: Anomaly[];
  powers: UniversePower[];
  /** Gates raised between galaxies. */
  gates: [number, number][];
  /** Millions of light years per map unit. */
  scale: number;
  /** The galaxy the game is in (the game master's mark), if any. */
  home: number | null;
}

/** A universe's parameters; a setting of magic sees crystal spheres unless told otherwise. */
export function universeParams(input: Partial<UniverseParams> = {}, setting?: Partial<Setting> | null): UniverseParams {
  return {
    seed: input.seed || randomSeed(),
    galaxies: input.galaxies ?? 320,
    width: 1600,
    height: 1000,
    anomalies: 1,
    custom: [],
    clusters: 7,
    voids: 12,
    civilisations: 0.3,
    epoch: "now",
    scale: "web",
    cosmology: setting && spaceAge(setting).fantasy ? "spheres" : "web",
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== "")),
  };
}

/** The galaxy-map shape a galaxy of a kind is drawn with. */
export function shapeOf(kind: GalaxyKind): GalaxyShape {
  return kind === "barred" ? "barred" : kind === "elliptical" || kind === "dwarf" || kind === "quasar" || kind === "lenticular" || kind === "ghost" ? "elliptical" : kind === "ring" ? "ring" : kind === "irregular" || kind === "starburst" || kind === "colliding" ? "clusters" : "spiral";
}

/** Kinds of galaxy by the universe's age. */
const KIND_WEIGHTS: Record<Epoch, [GalaxyKind, number][]> = {
  now: [["spiral", 40], ["barred", 18], ["elliptical", 22], ["ring", 3], ["irregular", 8], ["dwarf", 8], ["quasar", 1]],
  young: [["spiral", 30], ["barred", 10], ["elliptical", 8], ["ring", 3], ["irregular", 25], ["dwarf", 15], ["quasar", 9]],
  old: [["spiral", 25], ["barred", 15], ["elliptical", 45], ["ring", 2], ["irregular", 3], ["dwarf", 10], ["quasar", 0.2]],
};
const ANOMALY_WEIGHTS: Record<Epoch, [AnomalyKind, number][]> = {
  now: [["great-attractor", 1], ["cosmic-string", 2], ["lens", 3], ["white-hole", 1], ["dark-flow", 1.5], ["relic", 2], ["supermassive", 2], ["bubble-wall", 1]],
  young: [["great-attractor", 1], ["cosmic-string", 3], ["lens", 3], ["white-hole", 3], ["dark-flow", 1], ["relic", 0.3], ["supermassive", 2], ["bubble-wall", 1.5]],
  old: [["great-attractor", 1.5], ["cosmic-string", 1], ["lens", 2], ["white-hole", 0.3], ["dark-flow", 2], ["relic", 4], ["supermassive", 2], ["bubble-wall", 1]],
};
const CIVIL: Record<Epoch, number> = { young: 0.3, now: 1, old: 1.6 };
/** Millions of light years per map unit at each scale. */
const SCALE: Record<UniverseScale, number> = { web: 1.5, supercluster: 0.15, group: 0.004 };

/** Where the galaxies are: positions, the cluster of each, voids, and (for the smaller scales) set kinds and links. */
interface Layout {
  points: [number, number][];
  voids: Void[];
  clusterOf: number[];
  clusters: Supercluster[];
  /** Kinds already decided (a local group's giants and their satellites). */
  kinds?: (GalaxyKind | null)[];
  /** Links already decided; otherwise the Delaunay web. */
  links?: [number, number][];
  /** Galaxies in a rich cluster's heart (ellipticals gather there). */
  rich?: boolean[];
  inside: (x: number, y: number) => boolean;
}

/** The cosmic web: voids first, galaxies on their walls, superclusters round far-apart seeds. */
function cosmicWeb(params: UniverseParams, rng: Rng, tongue: Language): Layout {
  const { width: W, height: H } = params;
  const voids: Void[] = [];
  for (let attempt = 0; attempt < 300 && voids.length < params.voids; attempt++) {
    const v = { id: voids.length, x: rng.float(0, W), y: rng.float(0, H), r: rng.float(90, 220), name: "" };
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
  const gather = rng.fork("clusters");
  const seeds = gather.shuffle(points.map((_, k) => k)).reduce<number[]>((list, k) => (list.length < params.clusters && list.every((s) => Math.hypot(points[s][0] - points[k][0], points[s][1] - points[k][1]) > Math.min(W, H) / 3.2) ? [...list, k] : list), []);
  const hue = gather.next();
  const clusters: Supercluster[] = seeds.map((_, k) => ({ id: k, name: name(tongue, gather, "land"), color: paletteColor(k, hue, 0.6, 0.62) }));
  const clusterOf = points.map(([x, y]) => seeds.reduce((best, s, k) => (Math.hypot(points[s][0] - x, points[s][1] - y) < Math.hypot(points[seeds[best]][0] - x, points[seeds[best]][1] - y) ? k : best), 0));
  return { points, voids, clusterOf, clusters, inside };
}

/** One supercluster close up: rich clusters as dense knots, galaxies strung between them, a few voids. */
function superCluster(params: UniverseParams, rng: Rng, tongue: Language): Layout {
  const { width: W, height: H } = params;
  const own = rng.fork("supercluster");
  const knots = Array.from({ length: Math.max(2, Math.min(9, params.clusters)) }, () => ({ x: own.float(160, W - 160), y: own.float(140, H - 140), sd: own.float(28, 60) }));
  const voids: Void[] = [];
  for (let attempt = 0; attempt < 200 && voids.length < Math.max(1, Math.round(params.voids / 3)); attempt++) {
    const v = { id: voids.length, x: own.float(0, W), y: own.float(0, H), r: own.float(110, 230), name: "" };
    if (voids.some((o) => Math.hypot(o.x - v.x, o.y - v.y) < o.r + v.r) || knots.some((k) => Math.hypot(k.x - v.x, k.y - v.y) < v.r + k.sd * 2)) continue;
    v.name = name(tongue, own, "plain");
    voids.push(v);
  }
  const inside = (x: number, y: number) => voids.some((v) => Math.hypot(x - v.x, y - v.y) < v.r * 0.8);
  // The knots joined into a chain (the cheapest tree), galaxies strung along it.
  const chain: [number, number][] = [];
  const joined = [0];
  while (joined.length < knots.length) {
    let best: [number, number, number] = [0, 0, Infinity];
    for (const a of joined) for (let b = 0; b < knots.length; b++) if (!joined.includes(b) && Math.hypot(knots[a].x - knots[b].x, knots[a].y - knots[b].y) < best[2]) best = [a, b, Math.hypot(knots[a].x - knots[b].x, knots[a].y - knots[b].y)];
    chain.push([best[0], best[1]]);
    joined.push(best[1]);
  }
  const points: [number, number][] = [];
  const rich: boolean[] = [];
  const clusterOf: number[] = [];
  for (let attempt = 0; attempt < params.galaxies * 40 && points.length < params.galaxies; attempt++) {
    const roll = own.next();
    let x: number, y: number, k: number, heart = false;
    if (roll < 0.6) {
      k = own.int(0, knots.length - 1);
      x = own.gauss(knots[k].x, knots[k].sd);
      y = own.gauss(knots[k].y, knots[k].sd);
      heart = Math.hypot(x - knots[k].x, y - knots[k].y) < knots[k].sd * 0.7;
    } else if (roll < 0.9 && chain.length) {
      const [a, b] = own.pick(chain);
      const t = own.next();
      x = knots[a].x + (knots[b].x - knots[a].x) * t + own.gauss(0, 18);
      y = knots[a].y + (knots[b].y - knots[a].y) * t + own.gauss(0, 18);
      k = t < 0.5 ? a : b;
    } else {
      x = own.float(10, W - 10);
      y = own.float(10, H - 10);
      k = knots.reduce((best, knot, j) => (Math.hypot(knot.x - x, knot.y - y) < Math.hypot(knots[best].x - x, knots[best].y - y) ? j : best), 0);
    }
    if (x < 10 || y < 10 || x > W - 10 || y > H - 10 || inside(x, y)) continue;
    if (points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < 49)) continue;
    points.push([x, y]);
    rich.push(heart);
    clusterOf.push(k);
  }
  const hue = own.next();
  const clusters = knots.map((_, k) => ({ id: k, name: name(tongue, own, "land"), color: paletteColor(k, hue, 0.6, 0.62) }));
  return { points, voids, clusterOf, clusters, rich, inside };
}

/** A local group: two or three giants, each with its satellites, and a few dwarfs adrift between them. */
function localGroup(params: UniverseParams, rng: Rng, tongue: Language): Layout {
  const { width: W, height: H } = params;
  const own = rng.fork("local-group");
  const count = Math.max(12, Math.min(80, params.galaxies));
  const giants = Array.from({ length: own.int(2, 3) }, (_, k) => ({ x: W * (0.25 + k * 0.28) + own.float(-60, 60), y: H / 2 + own.float(-220, 220), kind: own.weighted<GalaxyKind>([["spiral", 5], ["barred", 3], ["elliptical", 1]]) }));
  const points: [number, number][] = giants.map((g) => [g.x, g.y]);
  const kinds: (GalaxyKind | null)[] = giants.map((g) => g.kind);
  const clusterOf = giants.map((_, k) => k);
  const links: [number, number][] = [];
  for (let a = 0; a < giants.length; a++) for (let b = a + 1; b < giants.length; b++) links.push([a, b]);
  for (let attempt = 0; attempt < count * 40 && points.length < count; attempt++) {
    const field = own.chance(0.12);
    const host = own.int(0, giants.length - 1);
    const x = field ? own.float(40, W - 40) : own.gauss(giants[host].x, own.float(40, 120));
    const y = field ? own.float(40, H - 40) : own.gauss(giants[host].y, own.float(40, 120));
    if (x < 20 || y < 20 || x > W - 20 || y > H - 20 || points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < 900)) continue;
    const nearest = giants.reduce((best, g, k) => (Math.hypot(g.x - x, g.y - y) < Math.hypot(giants[best].x - x, giants[best].y - y) ? k : best), 0);
    links.push([nearest, points.length]);
    points.push([x, y]);
    kinds.push(own.weighted<GalaxyKind>([["dwarf", 8], ["irregular", 3], ["elliptical", 1]]));
    clusterOf.push(nearest);
  }
  const hue = own.next();
  const clusters = giants.map((_, k) => ({ id: k, name: name(tongue, own, "land"), color: paletteColor(k, hue, 0.6, 0.62) }));
  return { points, voids: [], clusterOf, clusters, kinds, links, inside: () => false };
}

/** The planes of existence round the world: the material plane in the middle within the ethereal; the inner planes of
 * the elements and energies; the astral sea; the outer planes of heavens, hells and everything between; demiplanes
 * adrift. Conduits join each to its neighbours. */
function planesOf(params: UniverseParams, rng: Rng, tongue: Language): Layout & { planes: PlaneKind[] } {
  const { width: W, height: H } = params;
  const own = rng.fork("planes");
  const cx = W / 2,
    cy = H / 2;
  const planes: PlaneKind[] = [];
  const points: [number, number][] = [];
  const clusterOf: number[] = [];
  const links: [number, number][] = [];
  const add = (kind: PlaneKind, r: number, angle: number, ring: number) => {
    planes.push(kind);
    points.push([cx + Math.cos(angle) * r * 1.45, cy + Math.sin(angle) * r]);
    clusterOf.push(ring);
    return points.length - 1;
  };
  const material = add("material", 0, 0, 0);
  const ethereal = add("ethereal", 70, -Math.PI / 2, 0);
  links.push([material, ethereal]);
  const inner = (["fire", "earth", "water", "air", "positive", "negative"] as PlaneKind[]).map((kind, k, all) => add(kind, 165, (k / all.length) * Math.PI * 2 + 0.3, 1));
  inner.forEach((id, k) => links.push([material, id], [id, inner[(k + 1) % inner.length]]));
  const astral = add("astral", 260, Math.PI / 2, 2);
  links.push([material, astral]);
  const OUTER: PlaneKind[] = ["heaven", "elysium", "wilds", "chaos", "abyss", "hell", "order", "dream", "shadow"];
  const outerCount = own.int(7, 9);
  const outer = own
    .shuffle([...OUTER])
    .slice(0, outerCount)
    .map((kind, k) => add(kind, 380, (k / outerCount) * Math.PI * 2 + own.float(-0.1, 0.1), 3));
  outer.forEach((id, k) => links.push([astral, id], [id, outer[(k + 1) % outer.length]]));
  for (let k = own.int(3, 6); k > 0; k--) {
    const id = add("demiplane", own.float(210, 320), own.float(0, Math.PI * 2), 2);
    const nearest = points.slice(0, -1).reduce((best, p, j) => (Math.hypot(p[0] - points[id][0], p[1] - points[id][1]) < Math.hypot(points[best][0] - points[id][0], points[best][1] - points[id][1]) ? j : best), 0);
    links.push([nearest, id]);
  }
  const clusters = ["inner", "transitive", "outer"].map((_, k) => ({ id: k + 1, name: name(tongue, own, "land"), color: ["#ffb35c", "#c9b8ff", "#7ad7ff"][k] }));
  return { points, voids: [], clusterOf, clusters: [{ id: 0, name: name(tongue, own, "land"), color: "#9fe0a8" }, ...clusters], kinds: planes.map(() => "irregular"), links, inside: () => false, planes };
}

export function generateUniverse(input: Partial<UniverseParams> = {}, setting?: Partial<Setting> | null): Universe {
  const params = universeParams(input, setting);
  const rng = createRng(params.seed).fork("universe");
  const { width: W, height: H } = params;
  const tongue = createLanguage(rng.fork("tongue"));
  const plane = params.cosmology === "planes";
  const layout: Layout & { planes?: PlaneKind[] } = plane ? planesOf(params, rng, tongue) : params.scale === "group" ? localGroup(params, rng, tongue) : params.scale === "supercluster" ? superCluster(params, rng, tongue) : cosmicWeb(params, rng, tongue);
  const { points, voids, clusters, inside } = layout;
  // Each galaxy draws its kind, size and peoples from a stream of its own, and its name from a tongue of its own, so
  // asking for more galaxies leaves the first ones as they were.
  const galaxyTongue = { ...tongue };
  const share = Math.min(0.95, params.civilisations * CIVIL[params.epoch]);
  const galaxies: GalaxyNode[] = points.map(([x, y], id) => {
    const own = rng.fork(`galaxy-${id}`);
    const weights = layout.rich?.[id] ? KIND_WEIGHTS.old : KIND_WEIGHTS[params.epoch];
    const drawn = own.weighted<GalaxyKind>(weights);
    const kind = layout.kinds?.[id] ?? drawn;
    const stars = kind === "dwarf" ? own.int(150, 300) : kind === "quasar" ? own.int(300, 500) : own.int(450, 900);
    const node: GalaxyNode = { id, x, y, name: name(galaxyTongue, own, plane ? "land" : "plain"), kind, stars, cluster: layout.clusterOf[id] ?? 0, civilisations: own.chance(share) ? own.int(1, 6) : 0 };
    if (layout.planes) node.plane = layout.planes[id];
    return node;
  });
  // Filaments: short links of the Delaunay web that do not cut across a void.
  const filaments: [number, number][] = layout.links ? [...layout.links] : [];
  if (!layout.links && points.length >= 3) {
    const reach = params.scale === "supercluster" ? 90 : 70;
    const d = Delaunator.from(points);
    for (let e = 0; e < d.triangles.length; e++) {
      const a = d.triangles[e],
        b = d.triangles[e % 3 === 2 ? e - 2 : e + 1];
      if (a > b) continue;
      const [ax, ay] = points[a],
        [bx, by] = points[b];
      if (Math.hypot(ax - bx, ay - by) > reach || inside((ax + bx) / 2, (ay + by) / 2)) continue;
      filaments.push([a, b]);
    }
  }
  // Rarer kinds of galaxy, from a stream of their own so the old ones keep their kinds.
  const strange = Math.max(0, Math.min(3, params.anomalies));
  const odd = rng.fork("odd-galaxies");
  if (!plane)
    for (const g of galaxies) {
      if (!odd.chance(0.1 * strange)) continue;
      const rare: GalaxyKind[] = params.epoch === "young" ? ["starburst", "colliding", "colliding", "starburst"] : params.epoch === "old" ? ["lenticular", "lenticular", "ghost", "colliding"] : ["lenticular", "starburst", "colliding", "colliding"];
      g.kind = g.kind === "elliptical" ? "lenticular" : g.kind === "dwarf" ? "ghost" : g.kind === "irregular" ? "starburst" : odd.pick<GalaxyKind>(rare);
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
  for (let k = plane ? 0 : Math.round(weird.int(5, 9) * strange); k > 0; k--) {
    const kind = weird.weighted<AnomalyKind>(ANOMALY_WEIGHTS[params.epoch]);
    const [x, y] = spot(WHERE[kind]);
    const size = kind === "cosmic-string" ? weird.float(180, 420) : kind === "great-attractor" ? weird.float(70, 130) : kind === "bubble-wall" ? weird.float(160, 320) : kind === "dark-flow" ? weird.float(60, 110) : weird.float(8, 18);
    anomalies.push({ id: anomalies.length, kind, x, y, angle: weird.float(0, Math.PI * 2), size, name: name(tongue, weird, "plain") });
  }
  (params.custom ?? []).map(cleanKind).forEach((kind) => {
    const own = rng.fork(`custom-${kind.id}`);
    const where = kind.where === "core" || kind.where === "rim" || kind.where === "void" || kind.where === "filament" ? kind.where : "anywhere";
    for (let k = 0; k < kind.count; k++) {
      // Each kind draws its places from its own stream, so one kind never moves another.
      const [x, y] = spot(where, own);
      anomalies.push({ id: anomalies.length, kind: "custom", custom: kind.id, x, y, angle: own.float(0, Math.PI * 2), size: kind.area ? own.float(40, 90) : own.float(8, 14), name: kind.name || name(tongue, own, "plain") });
    }
  });
  // The strange marks the galaxies near it.
  for (const a of anomalies) {
    if (a.kind === "custom") continue;
    const reach = a.kind === "great-attractor" || a.kind === "dark-flow" ? a.size : a.kind === "cosmic-string" || a.kind === "bubble-wall" ? 22 : 40;
    for (const g of galaxies) if (anomalyDistance(a, g.x, g.y) < reach && !(g.touched ?? []).includes(a.kind)) g.touched = [...(g.touched ?? []), a.kind];
  }
  const powers = spreadPowers(galaxies, filaments, rng.fork("powers"), tongue);
  const gates = raiseGates(galaxies, filaments, powers, rng.fork("gates"), strange);
  return { params, name: name(tongue, rng.fork("name"), "land"), galaxies, filaments, clusters, voids, anomalies, powers, gates, scale: SCALE[plane ? "group" : params.scale], home: null };
}

/** Civilisations that reached past their galaxy: some homes of the peoples become powers, spreading a few links along
 * the filaments; the first to come holds a galaxy. */
function spreadPowers(galaxies: GalaxyNode[], filaments: [number, number][], rng: Rng, tongue: Language): UniversePower[] {
  const homes = rng.shuffle(galaxies.filter((g) => g.civilisations >= 2 && g.kind !== "ghost")).slice(0, Math.max(0, Math.round(galaxies.filter((g) => g.civilisations).length / 9)));
  if (!homes.length) return [];
  const next = galaxies.map(() => [] as number[]);
  for (const [a, b] of filaments) (next[a].push(b), next[b].push(a));
  const hue = rng.next();
  const powers: UniversePower[] = homes.map((g, k) => ({ id: k, name: name({ ...tongue }, rng.fork(`power-${k}`), "land"), form: rng.pick(EMPIRE_FORMS), color: paletteColor(k, hue, 0.75, 0.6), home: g.id, galaxies: 0 }));
  const reach = powers.map(() => rng.int(2, 5));
  const depth = new Map<number, number>();
  let queue: [number, number][] = [];
  powers.forEach((power) => {
    galaxies[power.home].power = power.id;
    depth.set(power.home, 0);
    queue.push([power.home, power.id]);
  });
  while (queue.length) {
    const after: [number, number][] = [];
    for (const [at, owner] of queue)
      for (const to of next[at]) {
        if (depth.has(to) || galaxies[to].kind === "ghost" || depth.get(at)! + 1 > reach[owner]) continue;
        depth.set(to, depth.get(at)! + 1);
        galaxies[to].power = owner;
        after.push([to, owner]);
      }
    queue = after;
  }
  for (const g of galaxies) if (g.power !== undefined) powers[g.power].galaxies++;
  return powers;
}

/** Gates between galaxies: a power joins its far-flung galaxies; old peoples far apart find each other. */
function raiseGates(galaxies: GalaxyNode[], filaments: [number, number][], powers: UniversePower[], rng: Rng, strange: number): [number, number][] {
  const gates: [number, number][] = [];
  const has = (a: number, b: number) => gates.some(([x, y]) => (x === a && y === b) || (x === b && y === a)) || filaments.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (const power of powers) {
    const held = galaxies.filter((g) => g.power === power.id && g.id !== power.home);
    const far = held.sort((a, b) => Math.hypot(b.x - galaxies[power.home].x, b.y - galaxies[power.home].y) - Math.hypot(a.x - galaxies[power.home].x, a.y - galaxies[power.home].y))[0];
    if (far && rng.chance(0.7) && !has(power.home, far.id)) gates.push([power.home, far.id]);
  }
  const peoples = galaxies.filter((g) => g.civilisations >= 3);
  for (let k = Math.round(rng.int(0, 2) * Math.max(0.5, strange)); k > 0 && peoples.length > 1; k--) {
    const a = rng.pick(peoples);
    const options = peoples.filter((b) => b !== a && Math.hypot(a.x - b.x, a.y - b.y) > 250);
    if (!options.length) continue;
    const b = rng.pick(options);
    if (!has(a.id, b.id)) gates.push([a.id, b.id]);
  }
  return gates;
}

/** Where an anomaly is seen: its centre, or for a bubble's wall the middle of its arc. */
export function anomalyPoint(a: Anomaly): [number, number] {
  return a.kind === "bubble-wall" ? [a.x + Math.cos(a.angle) * a.size, a.y + Math.sin(a.angle) * a.size] : [a.x, a.y];
}

/** How far a point is from what is drawn of an anomaly: along a cosmic string, round a bubble's arc, from a centre. */
export function anomalyDistance(a: Anomaly, x: number, y: number): number {
  if (a.kind === "cosmic-string") {
    const along = Math.max(-a.size, Math.min(a.size, (x - a.x) * Math.cos(a.angle) + (y - a.y) * Math.sin(a.angle)));
    return Math.hypot(x - (a.x + Math.cos(a.angle) * along), y - (a.y + Math.sin(a.angle) * along));
  }
  if (a.kind === "bubble-wall") {
    const turn = Math.atan2(Math.sin(Math.atan2(y - a.y, x - a.x) - a.angle), Math.cos(Math.atan2(y - a.y, x - a.x) - a.angle));
    return Math.abs(turn) <= 0.95 ? Math.abs(Math.hypot(x - a.x, y - a.y) - a.size) : Infinity;
  }
  return Math.hypot(x - a.x, y - a.y);
}

/** The game master's edits of a universe: a galaxy of another kind or another size, and the galaxy the game is in. */
export interface UniverseEdits {
  galaxies: Record<number, { kind?: GalaxyKind; stars?: number; civilisations?: number }>;
  home?: number | null;
}

export function cleanUniverseEdits(raw: unknown): UniverseEdits | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<UniverseEdits>;
  const galaxies = value.galaxies && typeof value.galaxies === "object" ? Object.fromEntries(Object.entries(value.galaxies).filter(([key, item]) => /^\d+$/u.test(key) && item && typeof item === "object")) : {};
  return { galaxies, ...(Number.isInteger(value.home) ? { home: value.home } : {}) };
}

export function editUniverse(universe: Universe, edits: UniverseEdits | null | undefined): Universe {
  if (!edits || (!Object.keys(edits.galaxies).length && edits.home === undefined)) return universe;
  const galaxies = universe.galaxies.map((g) => {
    const change = edits.galaxies[g.id];
    if (!change) return g;
    return { ...g, ...(change.kind && GALAXY_KINDS.includes(change.kind) ? { kind: change.kind } : {}), ...(Number.isFinite(change.stars) ? { stars: Math.max(100, Math.min(2000, Math.round(change.stars!))) } : {}), ...(Number.isFinite(change.civilisations) ? { civilisations: Math.max(0, Math.min(20, Math.round(change.civilisations!))) } : {}) };
  });
  const home = edits.home !== undefined && edits.home !== null && galaxies[edits.home] ? edits.home : null;
  return { ...universe, galaxies, home };
}

/** The way between two galaxies along the filaments (and gates): the galaxies passed and the length in map units. */
export function filamentPath(universe: Universe, from: number, to: number): { path: number[]; length: number } | null {
  const next = universe.galaxies.map(() => [] as { to: number; cost: number }[]);
  for (const [a, b] of [...universe.filaments, ...universe.gates]) {
    const cost = Math.hypot(universe.galaxies[a].x - universe.galaxies[b].x, universe.galaxies[a].y - universe.galaxies[b].y);
    next[a].push({ to: b, cost });
    next[b].push({ to: a, cost });
  }
  const best = new Float64Array(universe.galaxies.length).fill(Infinity);
  const prev = new Int32Array(universe.galaxies.length).fill(-1);
  const queue = new PriorityQueue<number>();
  best[from] = 0;
  queue.push(from, 0);
  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    const [at, cost] = entry;
    if (at === to) break;
    if (cost > best[at]) continue;
    for (const way of next[at]) {
      if (cost + way.cost >= best[way.to]) continue;
      best[way.to] = cost + way.cost;
      prev[way.to] = at;
      queue.push(way.to, best[way.to]);
    }
  }
  if (!Number.isFinite(best[to])) return null;
  const path = [to];
  for (let at = to; at !== from; at = prev[at]) path.unshift(prev[at]);
  return { path, length: best[to] };
}

/** The galaxies a galaxy is joined to by filaments and gates. */
export function galaxyNeighbours(universe: Universe, id: number): number[] {
  return [...universe.filaments, ...universe.gates].filter(([a, b]) => a === id || b === id).map(([a, b]) => (a === id ? b : a));
}
