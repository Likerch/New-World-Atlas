// The underworld beneath a planet: caverns under the land (most under the mountains), joined by tunnels, rivers in
// the dark and chasms; underground seas, fungal forests, magma under the volcanoes, crystal grottoes, the ruins of
// deep cities; peoples of the deep with their own tongues and settlements; and the ways down from the surface —
// the caves, mines and volcanoes of the planet map. The age adds its own: metro lines under the great cities of the
// machine ages (an undercity in the far future), bunkers under bases, vaults of survivors after the fall; a world
// without magic has no peoples of the deep.
import Delaunator from "delaunator";
import { paletteColor } from "../color";
import { createLanguage, name, type Language } from "../language";
import { createRng } from "../random";
import { ageOf, settingOf } from "../setting";
import { SEA_LEVEL, type Planet } from "./model";

export type CavernKind = "cavern" | "fungal" | "sea" | "magma" | "crystal" | "ruins" | "abyss" | "settlement" | "metro" | "undercity" | "bunker" | "vault";
export type TunnelKind = "passage" | "river" | "chasm" | "line";

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
  const setting = settingOf(planet.params.setting);
  const homes = setting.magic >= 1 ? rng.shuffle(caverns.filter((c) => c.kind === "cavern" || c.kind === "fungal" || c.kind === "crystal")).slice(0, rng.int(2, 4)) : [];
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
  // The age's underground: stations under the greatest towns joined by lines, bunkers and vaults under their markers.
  const age = ageOf(setting);
  const own = rng.fork("age");
  const stations: { cavern: number; x: number; y: number }[] = [];
  if (setting.tech >= 6.25) {
    const future = age === "far-future";
    const hubs = planet.burgs
      .slice(1)
      .filter((burg) => !burg.removed)
      .sort((a, b) => b.population - a.population)
      .slice(0, 10);
    const first = caverns.length;
    for (const town of hubs) {
      caverns.push({ id: caverns.length, x: town.x, y: town.y, r: spacing * (future ? 0.34 : 0.2), kind: future ? "undercity" : "metro", name: town.name, people: 0, population: 0 });
      stations.push({ cavern: caverns.length - 1, x: town.x, y: town.y });
    }
    // Lines: a spanning tree over the stations of each landmass.
    const joined = new Set([first]);
    while (joined.size < hubs.length) {
      let best: [number, number, number] | null = null;
      for (const a of joined)
        for (let b = first; b < caverns.length; b++) {
          if (joined.has(b)) continue;
          const d = Math.hypot(caverns[a].x - caverns[b].x, caverns[a].y - caverns[b].y);
          if (!best || d < best[2]) best = [a, b, d];
        }
      if (!best) break;
      joined.add(best[1]);
      if (planet.feature[hubs[best[0] - first].cell] === planet.feature[hubs[best[1] - first].cell]) tunnels.push([best[0], best[1], "line"]);
    }
  }
  for (const marker of planet.markers.slice(1)) {
    if (marker.kind !== "base" && marker.kind !== "bunker") continue;
    // (Bunkers and vaults are joined to the caves below with the stations, further down.)
    const vault = marker.kind === "bunker";
    caverns.push({ id: caverns.length, x: marker.x, y: marker.y, r: spacing * own.float(0.12, 0.2), kind: vault ? "vault" : "bunker", name: marker.name, people: 0, population: vault ? Math.round((Number(marker.facts.dwellers) || 0) / 100) / 10 : 0 });
    stations.push({ cavern: caverns.length - 1, x: marker.x, y: marker.y });
  }

  // The age's stations, bunkers and vaults are dug down to the nearest natural cave, so the dark is one web.
  const BUILT: CavernKind[] = ["metro", "undercity", "bunker", "vault"];
  const landOf = (x: number, y: number) => planet.feature[mesh.find(x, y)];
  const natural = () => caverns.filter((c) => !BUILT.includes(c.kind));
  const nearestOf = (list: Cavern[], x: number, y: number) => list.reduce<Cavern | null>((best, c) => (!best || Math.hypot(c.x - x, c.y - y) < Math.hypot(best.x - x, best.y - y) ? c : best), null);
  for (const station of stations) {
    const below = nearestOf(natural(), station.x, station.y);
    if (below) tunnels.push([below.id, station.cavern, "passage"]);
  }
  // Ways down: the planet's caves, mines and volcanoes, and portals that open on the underworld, each over a cave of
  // its own landmass close beneath it; where there is none, a cave is there below it, dug through to the rest.
  const dug = rng.fork("ways-down");
  const wildTongue = createLanguage(rng.fork("wild-deep"));
  const entrances = planet.markers
    .slice(1)
    .filter((m) => m.kind === "cave" || m.kind === "mine" || m.kind === "volcano" || (m.kind === "portal" && m.facts.leadsTo === "underworld"))
    .map((m) => {
      const land = landOf(m.x, m.y);
      let cavern = nearestOf(natural().filter((c) => landOf(c.x, c.y) === land), m.x, m.y);
      if (!cavern || Math.hypot(cavern.x - m.x, cavern.y - m.y) > spacing * 1.6) {
        const near = nearestOf(natural(), m.x, m.y);
        cavern = { id: caverns.length, x: m.x, y: m.y, r: spacing * dug.float(0.15, 0.25), kind: m.kind === "volcano" ? "magma" : "cavern", name: name(wildTongue, dug, "plain"), people: 0, population: 0 };
        caverns.push(cavern);
        if (near) tunnels.push([near.id, cavern.id, "passage"]);
      }
      return { x: m.x, y: m.y, cavern: cavern.id, marker: m.id };
    })
    .filter(() => caverns.length > 0);
  for (const station of stations) entrances.push({ x: station.x, y: station.y, cavern: station.cavern, marker: 0 });
  return { seed, name: name(peoples[0]?.language ?? createLanguage(rng.fork("n")), rng.fork("name"), "land"), width: W, height: H, caverns, tunnels, entrances, peoples };
}
