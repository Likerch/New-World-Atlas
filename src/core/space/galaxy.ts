// Galaxies: stars laid out as spirals, bars, ellipses, rings or clusters; spectral classes in real proportions;
// hyperlanes between neighbours (always one connected network), wormholes between far stars, nebulae, interstellar
// powers that spread along the lanes, and points of interest for a game master: ruins and stations, megastructures,
// graveyards of ships and things that live between the stars; regions of trouble (ion storms, dead zones, rifts);
// and whatever kinds of thing the game master invents. Free worlds outside the powers, peoples who have never left
// their world, jump gates joined in pairs; the world's setting tunes it all (who rules, how far things have fallen),
// and a galaxy opened from the universe brings what its node there had: a far power, a gate, the strange nearby.
import Delaunator from "delaunator";
import { paletteColor } from "../color";
import type { Point } from "../geometry";
import { createLanguage, name, type Language } from "../language";
import { PriorityQueue } from "../queue";
import { createRng, randomSeed, type Rng } from "../random";
import type { Rule, Setting } from "../setting";
import { cleanKind, type CustomKind } from "./custom";
import { spaceAge, type SpaceAge } from "./profile";

export type GalaxyShape = "spiral" | "barred" | "elliptical" | "ring" | "clusters";
export const GALAXY_SHAPES: GalaxyShape[] = ["spiral", "barred", "elliptical", "ring", "clusters"];

export type SpectralClass = "O" | "B" | "A" | "F" | "G" | "K" | "M" | "WD" | "NS" | "BH";

/** Each class: how common, its colour, its light (suns), its mass (suns, for the length of a year) and drawn size. */
export const SPECTRA: Record<SpectralClass, { weight: number; color: string; luminosity: number; mass: number; size: number }> = {
  O: { weight: 0.004, color: "#9bb0ff", luminosity: 30000, mass: 30, size: 2.6 },
  B: { weight: 0.02, color: "#aabfff", luminosity: 1000, mass: 8, size: 2.2 },
  A: { weight: 0.04, color: "#cad7ff", luminosity: 20, mass: 2, size: 1.9 },
  F: { weight: 0.07, color: "#f8f7ff", luminosity: 3, mass: 1.3, size: 1.7 },
  G: { weight: 0.1, color: "#fff1c9", luminosity: 1, mass: 1, size: 1.6 },
  K: { weight: 0.15, color: "#ffc98a", luminosity: 0.4, mass: 0.7, size: 1.45 },
  M: { weight: 0.58, color: "#ff9a5c", luminosity: 0.04, mass: 0.3, size: 1.2 },
  WD: { weight: 0.025, color: "#e6f0ff", luminosity: 0.01, mass: 0.6, size: 1 },
  NS: { weight: 0.004, color: "#b4f5ff", luminosity: 0.001, mass: 1.4, size: 1 },
  BH: { weight: 0.002, color: "#111111", luminosity: 0, mass: 10, size: 1.8 },
};

export type EmpireForm = "empire" | "republic" | "hegemony" | "collective" | "union" | "dominion" | "consortium" | "federation" | "theocracy" | "kingdom" | "hive" | "technocracy" | "corporate" | "machine" | "pirate-kingdom" | "nomad-fleet" | "junta" | "directorate";
export const EMPIRE_FORMS: EmpireForm[] = ["empire", "republic", "hegemony", "collective", "union", "dominion", "consortium", "federation", "theocracy", "kingdom", "hive", "technocracy", "corporate", "machine", "pirate-kingdom", "nomad-fleet", "junta", "directorate"];
/** What a power's people are. */
export type Nature = "human" | "humanoid" | "insectoid" | "reptilian" | "avian" | "aquatic" | "machine" | "energy" | "plantlike" | "lithoid" | "amorphous";
export type SpaceFeature =
  | "ruins"
  | "station"
  | "anomaly"
  | "derelict"
  | "pirate-base"
  | "relay"
  | "shipyard"
  | "research"
  | "quarantine"
  | "wormhole"
  | "dyson-sphere"
  | "ringworld"
  | "jump-gate"
  | "graveyard"
  | "leviathan"
  | "time-rift"
  | "rogue-planet"
  | "vault"
  | "trade-hub"
  | "mining"
  | "prison"
  | "beacon";

/** Regions of trouble or wonder between the stars. */
export type ZoneKind = "ion-storm" | "dead-zone" | "dark-nebula" | "radiation-belt" | "asteroid-field" | "gravity-rift" | "crystal-field" | "plasma-sea";
export const ZONE_KINDS: ZoneKind[] = ["ion-storm", "dead-zone", "dark-nebula", "radiation-belt", "asteroid-field", "gravity-rift", "crystal-field", "plasma-sea"];

export interface Zone {
  id: number;
  /** A built-in kind, or "custom" with the game master's kind id. */
  kind: ZoneKind | "custom";
  custom?: string;
  x: number;
  y: number;
  r: number;
  /** Turn and flattening of its ellipse. */
  angle: number;
  squash: number;
  name: string;
}

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
  /** One of the game master's own kinds of thing found here. */
  custom?: string;
  /** Settled, but by no power: a free world. */
  independent?: boolean;
  /** People who have never left their world live here. */
  natives?: boolean;
  /** A gate to another galaxy: that galaxy's name. */
  farGate?: string;
}

export interface Empire {
  id: number;
  name: string;
  form: EmpireForm;
  color: string;
  capital: number;
  stars: number;
  species: string;
  /** What its people are. */
  nature: Nature;
  language: Language;
  /** The far power of the universe this one belongs to, by name. */
  branch?: string;
}

export interface Nebula {
  id: number;
  x: number;
  y: number;
  r: number;
  color: string;
  name: string;
}

export interface GalaxyParams {
  seed: string;
  /** Its name, when the universe map already gives it one. */
  name?: string;
  shape: GalaxyShape;
  stars: number;
  arms: number;
  empires: number;
  width: number;
  height: number;
  /** How much strangeness: 0 none, 1 the usual, up to 3. */
  anomalies: number;
  /** The game master's own kinds of thing. */
  custom: CustomKind[];
  /** What the galaxy's node in the universe hands down: the strange nearby, a gate to another galaxy, a far power. */
  origin?: GalaxyOrigin;
}

/** What a galaxy opened from the universe brings with it. */
export interface GalaxyOrigin {
  /** Strange things of the universe near it, by kind ("great-attractor", "white-hole"…). */
  touched?: string[];
  /** The galaxy a gate here leads to. */
  gate?: string;
  /** A power of the universe that holds this galaxy too. */
  power?: { name: string; form: EmpireForm; color: string };
}

export interface Galaxy {
  params: GalaxyParams;
  name: string;
  stars: Star[];
  lanes: [number, number][];
  wormholes: [number, number][];
  empires: Empire[];
  nebulae: Nebula[];
  zones: Zone[];
  /** Jump gates joined in pairs. */
  gates: [number, number][];
  /** Light years per map unit. */
  scale: number;
  /** The age the stars live in. */
  age: SpaceAge;
}

const FORMS: EmpireForm[] = ["empire", "republic", "hegemony", "collective", "union", "dominion", "consortium", "federation", "theocracy"];
/** Forms past the first nine, which a power takes now and then. */
const NEW_FORMS: EmpireForm[] = ["kingdom", "hive", "technocracy", "corporate", "machine", "pirate-kingdom", "nomad-fleet", "junta", "directorate"];
/** The forms a setting's kind of rule favours. */
const RULE_FORMS: Record<Rule, EmpireForm[]> = {
  any: [],
  crowns: ["empire", "kingdom", "dominion"],
  people: ["republic", "federation", "union"],
  faith: ["theocracy"],
  force: ["hegemony", "junta", "empire"],
  trade: ["consortium", "corporate", "directorate"],
  machines: ["machine", "collective", "technocracy"],
};
const NATURES: [Nature, number][] = [["human", 3], ["humanoid", 4], ["insectoid", 2], ["reptilian", 2], ["avian", 1.5], ["aquatic", 1.5], ["machine", 1], ["energy", 0.5], ["plantlike", 1], ["lithoid", 1], ["amorphous", 0.7]];
const FEATURES: [SpaceFeature, number][] = [["ruins", 3], ["station", 4], ["anomaly", 3], ["derelict", 3], ["pirate-base", 2], ["relay", 2], ["shipyard", 2], ["research", 2], ["quarantine", 1]];

export function galaxyParams(input: Partial<GalaxyParams> = {}): GalaxyParams {
  const seed = input.seed || randomSeed();
  const rng = createRng(seed).fork("galaxy-params");
  const params: GalaxyParams = {
    seed,
    shape: rng.weighted<GalaxyShape>([["spiral", 5], ["barred", 3], ["elliptical", 2], ["ring", 1], ["clusters", 1]]),
    stars: rng.int(500, 900),
    arms: rng.int(2, 5),
    empires: rng.int(5, 10),
    width: 1600,
    height: 1000,
    anomalies: 1,
    custom: [],
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "")),
  };
  // The GM's kinds as a file or this browser gives them may say anything: only clean ones go on.
  params.custom = Array.isArray(params.custom) ? params.custom.map(cleanKind) : [];
  return params;
}

/** The features a star may have: what a file or an edit names otherwise is not one. */
export const SPACE_FEATURES: SpaceFeature[] = ["ruins", "station", "anomaly", "derelict", "pirate-base", "relay", "shipyard", "research", "quarantine", "wormhole", "dyson-sphere", "ringworld", "jump-gate", "graveyard", "leviathan", "time-rift", "rogue-planet", "vault", "trade-hub", "mining", "prison", "beacon"];

/** Wonders past the old points of interest: where each turns up, and how often. */
const WONDERS: [SpaceFeature, number, (star: Star) => boolean][] = [
  ["dyson-sphere", 1, (star) => ["O", "B", "A", "F", "G"].includes(star.spectral)],
  ["ringworld", 0.6, (star) => ["F", "G", "K"].includes(star.spectral)],
  ["jump-gate", 1.4, (star) => star.empire > 0],
  ["graveyard", 1.5, () => true],
  ["leviathan", 1, (star) => star.empire === 0],
  ["time-rift", 0.7, () => true],
  ["rogue-planet", 1.4, (star) => star.empire === 0],
  ["vault", 0.8, () => true],
  ["trade-hub", 1.6, (star) => star.empire > 0 && star.settled],
  ["mining", 2, (star) => star.empire > 0],
  ["prison", 0.9, (star) => star.empire > 0],
  ["beacon", 1.2, () => true],
];
const ZONE_WEIGHTS: [ZoneKind, number][] = [["ion-storm", 3], ["dead-zone", 2], ["dark-nebula", 2], ["radiation-belt", 2], ["asteroid-field", 3], ["gravity-rift", 1], ["crystal-field", 1], ["plasma-sea", 1]];

function place(params: GalaxyParams, rng: Rng): Point[] {
  const { width: W, height: H } = params;
  const cx = W / 2,
    cy = H / 2;
  const R = Math.min(W, H) * 0.46;
  const points: Point[] = [];
  // The gap between stars narrows if a shape (a thin ring, a few clusters) cannot hold the stars asked for.
  let minGap = Math.sqrt((W * H) / params.stars) * 0.42;
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
  for (let attempt = 0, pass = 1; points.length < params.stars && minGap > 1; attempt++) {
    if (attempt >= params.stars * 12 * pass) {
      pass++;
      minGap *= 0.8;
    }
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

/** A galaxy of the given parameters, in the world's setting (none, or the classic medieval world, is the far future). */
export function generateGalaxy(input: Partial<GalaxyParams> = {}, setting?: Partial<Setting> | null): Galaxy {
  const params = galaxyParams(input);
  const age = spaceAge(setting);
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
  const empires: Empire[] = [{ id: 0, name: "", form: "empire", color: "#666666", capital: -1, stars: 0, species: "", nature: "humanoid", language: tongues[0] }];
  const sunlike = stars.filter((star) => ["F", "G", "K"].includes(star.spectral)).map((star) => star.id);
  const gap = Math.min(params.width, params.height) / Math.sqrt(params.empires) / 1.6;
  const hue = rng.next();
  // Capitals well apart at sunlike stars; if too few fit, closer together, then at any star that is no dead one.
  const capitals = rng.fork("capitals");
  const others = stars.filter((star) => !["F", "G", "K", "BH", "NS"].includes(star.spectral)).map((star) => star.id);
  for (const [pool, spread] of [[sunlike, gap], [sunlike, gap / 2], [others, gap / 2]] as const) {
    for (const id of capitals.shuffle([...pool])) {
      if (empires.length > params.empires) break;
      if (empires.slice(1).some((empire) => empire.capital === id || Math.hypot(stars[empire.capital].x - stars[id].x, stars[empire.capital].y - stars[id].y) < spread)) continue;
      const language = tongues[(empires.length - 1) % tongues.length];
      empires.push({ ...founding(rng, empires.length, language), color: paletteColor(empires.length, hue, 0.7, 0.58), capital: id, stars: 0, language });
    }
    if (empires.length > params.empires) break;
  }
  // Forms past the first nine and the forms the setting's rule favours; what each power's people are; the far power of
  // the universe that holds one of them. Each from a stream of its own, so stars, names and borders stay where they were.
  reform(empires.slice(1), rng, age);
  const branch = params.origin?.power;
  if (branch && empires[1]) Object.assign(empires[1], { name: branch.name, form: branch.form, color: branch.color, branch: branch.name });
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
  // Names: no two stars share one (a tongue may come up with another's word; a catalogue number may repeat).
  const given = new Set<string>();
  for (const star of stars) {
    empires[star.empire].stars++;
    if (star.empire) star.settled = star.capital || (["F", "G", "K", "M"].includes(star.spectral) && names.chance(best[star.id] < typical * 3 ? 0.55 : 0.2));
    const tongue = star.empire ? empires[star.empire].language : tongues[star.id % tongues.length];
    const make = (spoken: boolean) => (spoken ? name(tongue, names, "plain") : `${names.pick(["HD", "GJ", "KIC", "TYC", "LHS", "WISE"])} ${names.int(100, 9999)}`);
    const spoken = star.empire > 0 || names.chance(0.35);
    let called = make(spoken);
    for (let k = 0; given.has(called) && k < 6; k++) called = make(spoken);
    for (let k = 2; given.has(called); k++) called = `${called.replace(/ [IVX]+$/u, "")} ${["", "", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][k] ?? k}`;
    given.add(called);
    star.name = called;
  }

  // Free worlds out of the powers' reach (more where the setting is crowded or fallen), and peoples who never left
  // their world, each from a stream of its own.
  const free = rng.fork("independents");
  const share = Math.min(0.5, 0.07 * age.setting.density * (1 + age.setting.decline));
  for (const star of stars) if (!star.empire && ["F", "G", "K", "M"].includes(star.spectral) && free.chance(share)) Object.assign(star, { settled: true, independent: true });
  const tribes = rng.fork("natives");
  for (const star of stars) if (!star.capital && ["F", "G", "K"].includes(star.spectral) && tribes.chance(0.03)) star.natives = true;

  // Points of interest, wormholes and nebulae.
  const features = rng.fork("features");
  const strange = Math.max(0, Math.min(3, params.anomalies));
  for (const star of stars) if (!star.capital && features.chance(0.08 * strange)) star.feature = features.weighted(FEATURES);
  const wormholes: [number, number][] = [];
  // Wormholes only where the galaxy is strange at all, and only between stars with nothing else there.
  for (let k = features.int(1, 3), open = strange > 0; k > 0 && open; k--) {
    let a = features.int(0, n - 1);
    for (let step = 0; step < n && (stars[a].feature || stars[a].capital); step++) a = (a + 1) % n;
    const far = stars.filter((star) => !star.feature && !star.capital && Math.hypot(star.x - stars[a].x, star.y - stars[a].y) > Math.min(params.width, params.height) * 0.5);
    if (!far.length) continue;
    const b = features.pick(far).id;
    wormholes.push([a, b]);
    stars[a].feature = "wormhole";
    stars[b].feature = "wormhole";
  }
  const nebulae: Nebula[] = Array.from({ length: features.int(4, 9) }, (_, id) => {
    const star = features.pick(stars);
    return { id, x: star.x + features.float(-40, 40), y: star.y + features.float(-40, 40), r: features.float(40, 130), color: features.pick(["#ff4fa3", "#3fd6ff", "#7a5cff", "#ff8a3d", "#36e0a0"]), name: name(features.pick(tongues), features, "plain") };
  });
  // Wonders and regions of trouble, each from a stream of its own, so the older features stay where they were.
  const wonders = rng.fork("wonders");
  for (const star of stars) {
    if (star.capital || star.feature || !wonders.chance(0.035 * strange)) continue;
    const options = WONDERS.filter(([, , fits]) => fits(star));
    if (options.length) star.feature = wonders.weighted(options.map(([kind, weight]): [SpaceFeature, number] => [kind, weight]));
  }
  // A fallen age leaves ruins, wrecks, graveyards and sealed worlds.
  if (age.setting.decline > 0) {
    const ruin = rng.fork("fallen");
    for (const star of stars) if (!star.capital && !star.feature && ruin.chance(age.setting.decline * 0.12)) star.feature = ruin.pick<SpaceFeature>(["ruins", "derelict", "graveyard", "quarantine", "ruins"]);
  }
  const zoneRng = rng.fork("zones");
  const zones: Zone[] = [];
  for (let k = Math.round(zoneRng.int(3, 7) * strange); k > 0; k--) {
    const star = zoneRng.pick(stars);
    zones.push({ id: zones.length, kind: zoneRng.weighted(ZONE_WEIGHTS), x: star.x + zoneRng.float(-20, 20), y: star.y + zoneRng.float(-20, 20), r: zoneRng.float(30, 95), angle: zoneRng.float(0, Math.PI), squash: zoneRng.float(0.45, 1), name: name(zoneRng.pick(tongues), zoneRng, "plain") });
  }
  const cx = params.width / 2,
    cy = params.height / 2;
  const R = Math.min(params.width, params.height) * 0.46;
  touch(params, stars, zones, tongues, rng);
  // A gate to another galaxy stands on the rim; the galaxy's own gates answer each other in pairs.
  if (params.origin?.gate) {
    const rim = rng.fork("far-gate");
    const options = stars.filter((star) => !star.capital && !star.feature && Math.hypot(star.x - cx, star.y - cy) > R * 0.6);
    if (options.length) Object.assign(rim.pick(options), { feature: "jump-gate", farGate: params.origin.gate });
  }
  const gates = pairGates(stars);
  // The game master's own kinds: points at fitting stars, or regions round them.
  (params.custom ?? []).map(cleanKind).forEach((kind) => {
    const own = rng.fork(`custom-${kind.id}`);
    const fits = (star: Star) => {
      const d = Math.hypot(star.x - cx, star.y - cy) / R;
      return kind.where === "claimed" ? star.empire > 0 : kind.where === "unclaimed" ? star.empire === 0 : kind.where === "core" ? d < 0.35 : kind.where === "rim" ? d > 0.7 : kind.where === "nebula" ? nebulae.some((n) => Math.hypot(n.x - star.x, n.y - star.y) < n.r) : true;
    };
    const options = own.shuffle(stars.filter((star) => fits(star) && !star.capital && (kind.area || !star.custom)));
    for (const star of options.slice(0, kind.count)) {
      if (kind.area) zones.push({ id: zones.length, kind: "custom", custom: kind.id, x: star.x, y: star.y, r: own.float(35, 80), angle: own.float(0, Math.PI), squash: own.float(0.55, 1), name: kind.name || name(own.pick(tongues), own, "plain") });
      else star.custom = kind.id;
    }
  });
  return { params, name: params.name || name(tongues[0], rng.fork("galaxy-name"), "land"), stars, lanes, wormholes, empires, nebulae, zones, gates, scale: 100_000 / Math.min(params.width, params.height), age };
}

/** A power as it is founded: its name, first form and people, from its own stream and its tongue. */
function founding(rng: Rng, id: number, language: Language): Pick<Empire, "id" | "name" | "form" | "species" | "nature"> {
  const own = rng.fork(`empire-${id}`);
  // The order of the draws is the order they always had: the name, the form, the people.
  const called = name(language, own, "land");
  const form = own.pick(FORMS);
  return { id, name: called, form, species: name(language, own, "people"), nature: "humanoid" };
}

/** Forms past the first nine and the forms the setting's rule favours, and what each power's people are. */
function reform(powers: Pick<Empire, "form" | "nature">[], rng: Rng, age: SpaceAge) {
  const forms = rng.fork("forms");
  const favoured = RULE_FORMS[age.setting.rule] ?? [];
  for (const power of powers) {
    if (favoured.length && forms.chance(0.7)) power.form = forms.pick(favoured);
    else if (forms.chance(0.3)) power.form = forms.pick(NEW_FORMS);
    power.nature = power.form === "machine" ? "machine" : power.form === "hive" && forms.chance(0.7) ? "insectoid" : forms.weighted(NATURES);
  }
}

/** The powers a galaxy of this seed will hold, named and formed as its map will have them (the first ones, if the
 * galaxy finds room for fewer): the universe shows them before the galaxy is made. */
export function powersOf(seed: string, count: number, setting?: Partial<Setting> | null): Pick<Empire, "name" | "form" | "species" | "nature">[] {
  const rng = createRng(seed);
  const tongues = Array.from({ length: 10 }, (_, k) => createLanguage(rng.fork(`tongue-${k}`)));
  const powers = Array.from({ length: count }, (_, k) => founding(rng, k + 1, tongues[k % tongues.length]));
  reform(powers, rng, spaceAge(setting));
  return powers;
}

/** Each gate joined to the nearest other gate, its own power's first; a gate left over stands dormant. */
export function pairGates(stars: Star[]): [number, number][] {
  const open = stars.filter((star) => star.feature === "jump-gate" && !star.farGate);
  const linked = new Set<number>();
  const gates: [number, number][] = [];
  for (const a of open) {
    if (linked.has(a.id)) continue;
    const far = (b: Star) => Math.hypot(a.x - b.x, a.y - b.y) * (b.empire === a.empire ? 1 : 2);
    const b = open.filter((other) => other !== a && !linked.has(other.id)).reduce<Star | null>((pick, other) => (!pick || far(other) < far(pick) ? other : pick), null);
    if (!b) continue;
    linked.add(a.id).add(b.id);
    gates.push([a.id, b.id]);
  }
  return gates;
}

/** What the strange things of the universe near a galaxy leave in it: rifts, storms, seas of plasma, a wandering black
 * hole, precursor vaults, breaks in time. Each from a stream of its own, so a galaxy without them is as it was. */
function touch(params: GalaxyParams, stars: Star[], zones: Zone[], tongues: Language[], rng: Rng) {
  const W = params.width,
    H = params.height;
  for (const kind of params.origin?.touched ?? []) {
    const own = rng.fork(`origin-${kind}`);
    const region = (zone: ZoneKind, r: [number, number], squash: [number, number] = [0.45, 1], at = own.pick(stars)) =>
      zones.push({ id: zones.length, kind: zone, x: at.x + own.float(-20, 20), y: at.y + own.float(-20, 20), r: own.float(...r), angle: own.float(0, Math.PI), squash: own.float(...squash), name: name(own.pick(tongues), own, "plain") });
    const featureless = () => stars.filter((star) => !star.capital && !star.feature);
    if (kind === "great-attractor") for (let k = 0; k < 2; k++) region("gravity-rift", [60, 110]);
    else if (kind === "cosmic-string") zones.push({ id: zones.length, kind: "gravity-rift", x: W / 2 + own.float(-120, 120), y: H / 2 + own.float(-80, 80), r: Math.min(W, H) * 0.42, angle: own.float(0, Math.PI), squash: 0.08, name: name(own.pick(tongues), own, "plain") });
    else if (kind === "lens") region("crystal-field", [50, 90]);
    else if (kind === "white-hole") for (let k = 0; k < 2; k++) region("plasma-sea", [50, 100]);
    else if (kind === "dark-flow") for (let k = 0; k < 2; k++) region("ion-storm", [60, 120], [0.3, 0.6]);
    else if (kind === "relic") for (const star of own.shuffle(featureless()).slice(0, 3)) star.feature = own.pick<SpaceFeature>(["vault", "ruins", "vault"]);
    else if (kind === "supermassive") {
      const lonely = featureless().filter((star) => !star.empire && !star.settled);
      if (!lonely.length) continue;
      const hole = own.pick(lonely);
      hole.spectral = "BH";
      region("dead-zone", [40, 70], [0.7, 1], hole);
    } else if (kind === "bubble-wall") {
      for (const star of own.shuffle(featureless()).slice(0, 2)) star.feature = "time-rift";
      region("dead-zone", [50, 90]);
    }
  }
}
