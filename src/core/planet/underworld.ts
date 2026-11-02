// The underworld beneath a planet: caverns under the land (most under the mountains), joined by tunnels, rivers in
// the dark and chasms; underground seas, fungal forests, magma under the volcanoes, crystal grottoes, the ruins of
// deep cities; peoples of the deep with their own tongues and settlements; and the ways down from the surface —
// the caves, mines and volcanoes of the planet map.
import Delaunator from "delaunator";
import { paletteColor } from "../color";
import { createLanguage, name, type Language } from "../language";
import { createRng } from "../random";
import { SEA_LEVEL, type Planet } from "./model";

export type CavernKind = "cavern" | "fungal" | "sea" | "magma" | "crystal" | "ruins" | "abyss" | "settlement";
export type TunnelKind = "passage" | "river" | "chasm";

export interface Cavern {
  id: number;
  x: number;
  y: number;
  r: number;
  kind: CavernKind;
  name: string;
  people: number;
  /** Thousands, for settlements. */
  population: number;
}

export interface DeepPeople {
  id: number;
  name: string;
  color: string;
  language: Language;
}

export interface Underworld {
  seed: string;
  name: string;
  width: number;
  height: number;
  caverns: Cavern[];
  tunnels: [number, number, TunnelKind][];
  /** Ways down: a planet marker (or a mountain) above a cavern. */
  entrances: { x: number; y: number; cavern: number; marker: number }[];
  peoples: DeepPeople[];
}

export function generateUnderworld(planet: Planet): Underworld {
  const seed = `${planet.params.seed}/underworld`;
  const rng = createRng(seed);
  const { mesh } = planet;
  const W = planet.params.width,
    H = planet.params.height;
  const land = Array.from({ length: mesh.cells }, (_, cell) => cell).filter((cell) => !planet.water[cell] && planet.height[cell] >= SEA_LEVEL);
  const spacing = Math.sqrt((land.length * mesh.spacing * mesh.spacing) / 70) * 0.9;
  // Caverns sit under the land, most of all under high ground.
  const caverns: Cavern[] = [];
  for (const cell of rng.shuffle([...land])) {
    if (caverns.length >= 90) break;
    if (!rng.chance(0.25 + Math.max(0, planet.height[cell] - 30) / 80)) continue;
    const x = mesh.x[cell],
      y = mesh.y[cell];
    if (caverns.some((c) => Math.hypot(c.x - x, c.y - y) < spacing)) continue;
    const high = planet.height[cell] > 60;
    const volcano = planet.markers.some((m) => m.kind === "volcano" && Math.hypot(m.x - x, m.y - y) < spacing);
    const kind: CavernKind = volcano ? "magma" : rng.weighted<CavernKind>([["cavern", 6], ["fungal", 3], ["sea", high ? 0.5 : 2], ["crystal", high ? 3 : 1], ["ruins", 1.5], ["abyss", high ? 1.5 : 0.5]]);
    caverns.push({ id: caverns.length, x, y, r: rng.float(0.2, 0.42) * spacing * (kind === "sea" ? 1.4 : 1), kind, name: "", people: 0, population: 0 });
  }
  // Tunnels: a spanning tree over the caverns plus some loops; a few are rivers in the dark, a few are chasms.
  const tunnels: [number, number, TunnelKind][] = [];
  if (caverns.length >= 3) {
    const points = caverns.map((c) => [c.x, c.y] as [number, number]);
    const d = Delaunator.from(points);
    const edges: [number, number, number][] = [];
    for (let e = 0; e < d.triangles.length; e++) {
      const a = d.triangles[e],
        b = d.triangles[e % 3 === 2 ? e - 2 : e + 1];
      if (a < b) edges.push([a, b, Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1])]);
    }
    edges.sort((p, q) => p[2] - q[2]);
    const parent = caverns.map((_, k) => k);
    const root = (k: number): number => (parent[k] === k ? k : (parent[k] = root(parent[k])));
    for (const [a, b, length] of edges) {
      const joined = root(a) === root(b);
      if (joined && (length > spacing * 2.2 || !rng.chance(0.25))) continue;
      if (!joined) parent[root(a)] = root(b);
      tunnels.push([a, b, rng.weighted<TunnelKind>([["passage", 8], ["river", 2], ["chasm", 1]])]);
    }
  }
  // Peoples of the deep: each holds a cluster of caverns round its first settlement.
  const peoples: DeepPeople[] = [];
  const hue = rng.next();
  const homes = rng.shuffle(caverns.filter((c) => c.kind === "cavern" || c.kind === "fungal" || c.kind === "crystal")).slice(0, rng.int(2, 4));
  for (const home of homes) {
    const language = createLanguage(rng.fork(`deep-${peoples.length}`));
    const id = peoples.length + 1;
    peoples.push({ id, name: name(language, rng, "people"), color: paletteColor(id, hue, 0.55, 0.6), language });
    home.kind = "settlement";
    home.people = id;
  }
  for (const cavern of caverns) {
    if (!cavern.people && peoples.length) {
      const nearest = homes.reduce((best, h) => (Math.hypot(h.x - cavern.x, h.y - cavern.y) < Math.hypot(best.x - cavern.x, best.y - cavern.y) ? h : best), homes[0]);
      if (Math.hypot(nearest.x - cavern.x, nearest.y - cavern.y) < spacing * 3) cavern.people = nearest.people;
    }
    const tongue = cavern.people ? peoples[cavern.people - 1].language : createLanguage(rng.fork("wild-deep"));
    if (cavern.people && cavern.kind !== "settlement" && cavern.kind !== "magma" && cavern.kind !== "abyss" && rng.chance(0.35)) cavern.kind = "settlement";
    if (cavern.kind === "settlement") cavern.population = Math.round(rng.float(0.5, 25) * 10) / 10;
    cavern.name = name(tongue, rng, cavern.kind === "settlement" ? "town" : "plain");
  }
  // Ways down: the planet's caves, mines and volcanoes over the nearest cavern.
  const entrances = planet.markers
    .slice(1)
    .filter((m) => m.kind === "cave" || m.kind === "mine" || m.kind === "volcano" || m.kind === "portal")
    .map((m) => {
      const cavern = caverns.reduce((best, c) => (Math.hypot(c.x - m.x, c.y - m.y) < Math.hypot(best.x - m.x, best.y - m.y) ? c : best), caverns[0]);
      return { x: m.x, y: m.y, cavern: cavern?.id ?? 0, marker: m.id };
    })
    .filter((e) => caverns.length > 0);
  return { seed, name: name(peoples[0]?.language ?? createLanguage(rng.fork("n")), rng.fork("name"), "land"), width: W, height: H, caverns, tunnels, entrances, peoples };
}
