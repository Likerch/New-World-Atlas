// The game master's edits over a generated galaxy or star system. They live in the map's patch (changes.galaxy,
// changes.system), are laid over the generator's output every time it is made, and can be undone step by step or thrown
// away: a star repainted to another power or another class, a capital moved, a lane drawn or cut, a gate or a wonder
// set down; a world of another kind, its people, a station, an owner, a world put in or taken out.
import { pairGates, SPECTRA, type Galaxy, type SpaceFeature, type SpectralClass } from "./galaxy";
import type { Body, BodyKind } from "./system";

export interface StarEdit {
  spectral?: SpectralClass;
  /** The power that holds it (0 for nobody). */
  empire?: number;
  /** A wonder or point of interest set down, or null to clear it. */
  feature?: SpaceFeature | null;
  settled?: boolean;
}

export interface GalaxyEdits {
  stars: Record<number, StarEdit>;
  /** Capitals moved: power → star. */
  capitals: Record<number, number>;
  /** Lanes drawn and lanes cut, as pairs of stars. */
  added: [number, number][];
  cut: [number, number][];
  /** Gates joined by the game master. */
  gates: [number, number][];
}

export function emptyGalaxyEdits(): GalaxyEdits {
  return { stars: {}, capitals: {}, added: [], cut: [], gates: [] };
}

const pairs = (value: unknown): [number, number][] => (Array.isArray(value) ? value.filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((x) => Number.isInteger(x) && x >= 0)) : []);
const record = <T>(value: unknown, keep: (item: unknown) => item is T): Record<number, T> =>
  value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key, item]) => /^\d+$/u.test(key) && keep(item))) : {};

/** Edits as read from a patch (a file may say anything): only what makes sense is kept. */
export function cleanGalaxyEdits(raw: unknown): GalaxyEdits | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<GalaxyEdits>;
  return {
    stars: record(value.stars, (item): item is StarEdit => !!item && typeof item === "object"),
    capitals: record(value.capitals, (item): item is number => Number.isInteger(item)),
    added: pairs(value.added),
    cut: pairs(value.cut),
    gates: pairs(value.gates),
  };
}

const same = ([a, b]: [number, number], [c, d]: [number, number]) => (a === c && b === d) || (a === d && b === c);

/** How many edits there are, for the editor's summary. */
export function countGalaxyEdits(edits: GalaxyEdits | null | undefined): number {
  if (!edits) return 0;
  return Object.keys(edits.stars).length + Object.keys(edits.capitals).length + edits.added.length + edits.cut.length + edits.gates.length;
}

/** The galaxy with the game master's edits laid over it. Stars keep their ids, so names and notes stay put. */
export function editGalaxy(galaxy: Galaxy, edits: GalaxyEdits | null | undefined): Galaxy {
  if (!countGalaxyEdits(edits)) return galaxy;
  const e = edits!;
  const n = galaxy.stars.length;
  const valid = (id: number) => Number.isInteger(id) && id >= 0 && id < n;
  const stars = galaxy.stars.map((star) => ({ ...star }));
  const empires = galaxy.empires.map((empire) => ({ ...empire }));
  // Capitals first: the new capital is its power's, and settled.
  for (const [key, to] of Object.entries(e.capitals)) {
    const power = empires[Number(key)];
    if (!power || !Number(key) || !valid(to)) continue;
    if (stars[power.capital]) stars[power.capital].capital = false;
    Object.assign(stars[to], { capital: true, empire: power.id, settled: true, independent: false });
    power.capital = to;
  }
  for (const [key, change] of Object.entries(e.stars)) {
    const star = stars[Number(key)];
    if (!star) continue;
    if (change.spectral && SPECTRA[change.spectral]) star.spectral = change.spectral;
    if (change.feature !== undefined) {
      star.feature = change.feature;
      if (change.feature !== "jump-gate") delete star.farGate;
    }
    if (change.settled !== undefined && !star.capital) star.settled = change.settled;
    // A capital stays its power's: move the capital first.
    if (change.empire !== undefined && empires[change.empire] && !star.capital) star.empire = change.empire;
    star.independent = !star.empire && star.settled;
  }
  const lanes = galaxy.lanes.filter((lane) => !e.cut.some((cut) => same(cut, lane)));
  for (const lane of e.added) if (valid(lane[0]) && valid(lane[1]) && lane[0] !== lane[1] && !lanes.some((other) => same(other, lane))) lanes.push(lane);
  // Gates the game master joined, then the rest paired as the generator pairs them.
  const joined = e.gates.filter(([a, b]) => valid(a) && valid(b) && a !== b);
  for (const [a, b] of joined) for (const id of [a, b]) Object.assign(stars[id], { feature: "jump-gate" });
  const taken = new Set(joined.flat());
  const gates = [...joined, ...pairGates(stars.filter((star) => !taken.has(star.id)))];
  const wormholes = galaxy.wormholes.filter(([a, b]) => stars[a].feature === "wormhole" && stars[b].feature === "wormhole");
  for (const empire of empires) empire.stars = 0;
  for (const star of stars) empires[star.empire].stars++;
  return { ...galaxy, stars, empires, lanes, gates, wormholes };
}

export interface BodyEdit {
  kind?: BodyKind;
  /** Millions of people. */
  population?: number;
  station?: boolean;
  /** Who holds this world, when not the system's owner. */
  owner?: string;
}

export interface SystemEdits {
  bodies: Record<number, BodyEdit>;
  /** Worlds put in: where and of what kind. */
  added: { orbit: number; kind: BodyKind; angle: number }[];
  /** Worlds taken out, by id. */
  removed: number[];
  /** The power holding the system, by name ("" for nobody); unset keeps the generated owner. */
  owner?: string;
}

export function emptySystemEdits(): SystemEdits {
  return { bodies: {}, added: [], removed: [] };
}

const KINDS: BodyKind[] = ["lava", "barren", "desert", "terran", "ocean", "jungle", "tundra", "ice", "gas-giant", "ice-giant", "belt"];

export function cleanSystemEdits(raw: unknown): SystemEdits | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<SystemEdits>;
  return {
    bodies: record(value.bodies, (item): item is BodyEdit => !!item && typeof item === "object"),
    added: Array.isArray(value.added) ? value.added.filter((item) => item && KINDS.includes(item.kind) && Number.isFinite(item.orbit) && item.orbit > 0).map((item) => ({ orbit: item.orbit, kind: item.kind, angle: Number(item.angle) || 0 })) : [],
    removed: Array.isArray(value.removed) ? value.removed.filter((id) => Number.isInteger(id)) : [],
    ...(typeof value.owner === "string" ? { owner: value.owner.slice(0, 80) } : {}),
  };
}

export function countSystemEdits(edits: SystemEdits | null | undefined): number {
  if (!edits) return 0;
  return Object.keys(edits.bodies).length + edits.added.length + edits.removed.length + (edits.owner !== undefined ? 1 : 0);
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

/** A world made another kind: the air, water, size and warmth that kind has (the GM may make any world a garden). */
function reshape(body: Body, kind: BodyKind, star: { luminosity: number }): void {
  const giant = kind === "gas-giant" || kind === "ice-giant";
  const living = kind === "terran" || kind === "ocean" || kind === "jungle";
  const natural = 278 * Math.pow(Math.max(star.luminosity, 1e-5), 0.25) / Math.sqrt(body.orbit);
  body.kind = kind;
  body.radius = kind === "belt" ? 0 : giant ? Math.max(body.radius, kind === "gas-giant" ? 9 : 4) : Math.max(0.3, Math.min(1.8, body.radius || 1));
  body.atmosphere = giant ? "thick" : living ? "breathable" : kind === "belt" || kind === "barren" ? "none" : kind === "lava" ? "toxic" : "thin";
  body.water = { ocean: 0.9, terran: 0.65, jungle: 0.5, tundra: 0.4, desert: 0.05, ice: 0.8 }[kind as string] ?? 0;
  body.habitable = living;
  body.temperature = Math.round(living ? Math.max(270, Math.min(305, natural * 1.06)) : kind === "lava" ? Math.max(700, natural) : natural * (giant ? 1.25 : 1));
  if (kind === "belt") (body.moons = [], (body.rings = false));
}

/** Worlds with the game master's edits: changed, put in (after the last id) or taken out (marked, ids kept). */
export function applySystemEdits(bodies: Body[], edits: SystemEdits | null | undefined, star: { name: string; luminosity: number; spectral: SpectralClass }): Body[] {
  if (!countSystemEdits(edits)) return bodies;
  const e = edits!;
  const out = bodies.map((b) => ({ ...b }));
  for (const body of out) {
    const change = e.bodies[body.id];
    if (!change) continue;
    if (change.kind && KINDS.includes(change.kind) && change.kind !== body.kind) reshape(body, change.kind, star);
    if (change.population !== undefined && Number.isFinite(change.population)) body.population = Math.max(0, change.population);
    if (change.station !== undefined) body.station = !!change.station;
    if (change.owner !== undefined) body.owner = change.owner;
  }
  let next = out.reduce((max, b) => Math.max(max, b.id), -1) + 1;
  for (const add of e.added) {
    const body: Body = { id: next, name: `${star.name} ${ROMAN[next] ?? next + 1}`, kind: add.kind, orbit: add.orbit, angle: add.angle, radius: 1, temperature: 0, atmosphere: "none", water: 0, year: Math.round(365.25 * Math.sqrt(add.orbit ** 3 / SPECTRA[star.spectral].mass)), moons: [], rings: false, population: 0, station: false, habitable: false, added: true };
    reshape(body, add.kind, star);
    const change = e.bodies[next];
    if (change?.kind && KINDS.includes(change.kind)) reshape(body, change.kind, star);
    if (change?.population !== undefined) body.population = Math.max(0, change.population);
    if (change?.station !== undefined) body.station = !!change.station;
    if (change?.owner !== undefined) body.owner = change.owner;
    out.push(body);
    next++;
  }
  for (const body of out) if (e.removed.includes(body.id)) body.removed = true;
  return out.sort((a, b) => a.orbit - b.orbit);
}
