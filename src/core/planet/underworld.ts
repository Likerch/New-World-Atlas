// The underworld beneath a planet: caverns under the land (most under the mountains), joined by tunnels, rivers in
// the dark and chasms; underground seas, fungal forests, magma under the volcanoes, crystal grottoes, the ruins of
// deep cities; peoples of the deep with their own tongues and settlements; and the ways down from the surface —
// the caves, mines and volcanoes of the planet map. The age adds its own: metro lines under the great cities of the
// machine ages (an undercity in the far future), bunkers under bases, vaults of survivors after the fall; a world
// without magic has no fantastic peoples of the deep, but in every age some folk live in its dark. Every cavern has its
// depth, every tunnel its length, danger and hazards; the great towns have catacombs or sewers below them; the deep
// holds its own places; peoples hold lands and keep quarrels and treaties.
import Delaunator from "delaunator";
import { paletteColor } from "../color";
import { createLanguage, name, type Language } from "../language";
import { createRng, type Rng } from "../random";
import { ageOf, settingOf, type EraId } from "../setting";
import { SEA_LEVEL, type Burg, type Planet } from "./model";

export type CavernKind = "cavern" | "fungal" | "sea" | "magma" | "crystal" | "ruins" | "abyss" | "settlement" | "metro" | "undercity" | "bunker" | "vault" | "catacombs" | "sewers";
export const CAVERN_KINDS: CavernKind[] = ["cavern", "fungal", "sea", "magma", "crystal", "ruins", "abyss", "settlement", "metro", "undercity", "bunker", "vault", "catacombs", "sewers"];
export const TUNNEL_KINDS: TunnelKind[] = ["passage", "river", "chasm", "line"];
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
  /** Metres below the surface. */
  depth: number;
  /** The town above it, for the undercrofts and stations under towns. */
  burg?: number;
  /** Taken away by the game master; the number stays so the others keep theirs. */
  removed?: boolean;
  /** Dug by the game master. */
  added?: boolean;
}

export interface DeepPeople {
  id: number;
  name: string;
  color: string;
  language: Language;
  /** What they are: deep dwarves, myconids… or, without magic, smugglers, mole people, a vault's clan. */
  kind: string;
  /** Their first settlement, by cavern. */
  capital: number;
  /** How they stand with each other people, by id. */
  relations: Record<number, DeepRelation>;
  /** Thousands, in their settlements. */
  population: number;
}

/** A tunnel's length (km), danger (1–3), what threatens on it, and whether it runs under the sea. */
export interface UnderWay {
  length: number;
  danger: number;
  hazard: string | null;
  undersea: boolean;
}

/** A place of the deep inside a cavern: a shrine, a hoard, a lost expedition, a toll gate… */
export interface UnderSite {
  id: number;
  cavern: number;
  kind: string;
  x: number;
  y: number;
  name: string;
  facts: Record<string, string | number>;
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
  /** For each tunnel, its way: length, danger, hazards. */
  ways: UnderWay[];
  sites: UnderSite[];
  /** Km per map unit, as on the planet above. */
  scale: number;
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
    caverns.push({ id: caverns.length, x, y, r: rng.float(0.2, 0.42) * spacing * (kind === "sea" ? 1.4 : 1), kind, name: "", people: 0, population: 0, depth: 0 });
  }
  // Tunnels: a spanning tree over the caverns plus some loops; a few are rivers in the dark, a few are chasms.
  const tunnels: [number, number, TunnelKind][] = [];
  if (caverns.length >= 3) {
    const points = caverns.map((c) => [c.x, c.y] as [number, number]);
    const d = Delaunator.from(points);
    const edges: [number, number, number][] = [];
    // An edge of the hull has a half-edge only one way round; those running the other way are kept apart.
    const rim: [number, number, number][] = [];
    for (let e = 0; e < d.triangles.length; e++) {
      const a = d.triangles[e],
        b = d.triangles[e % 3 === 2 ? e - 2 : e + 1];
      if (a < b) edges.push([a, b, Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1])]);
      else if (d.halfedges[e] === -1) rim.push([a, b, Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1])]);
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
    // Those hull edges join only what the others left apart, from a stream of their own: a cavern on the rim is never
    // cut off, and a world the others already joined keeps its tunnels as they were.
    const lone = rng.fork("rim");
    for (const [a, b] of rim.sort((p, q) => p[2] - q[2])) {
      if (root(a) === root(b)) continue;
      parent[root(a)] = root(b);
      tunnels.push([a, b, lone.weighted<TunnelKind>([["passage", 8], ["river", 2], ["chasm", 1]])]);
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
    peoples.push({ id, name: name(language, rng, "people"), color: paletteColor(id, hue, 0.55, 0.6), language, kind: "", capital: home.id, relations: {}, population: 0 });
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
  // A station under a town the GM razed is kept, taken away with its town, so the caverns after it keep their numbers.
  const age = ageOf(setting);
  const own = rng.fork("age");
  const stations: { cavern: number; x: number; y: number }[] = [];
  if (setting.tech >= 6.25) {
    const future = age === "far-future";
    const hubs = greatTowns(planet).slice(0, 10);
    const first = caverns.length;
    for (const town of hubs) {
      caverns.push({ id: caverns.length, x: town.x, y: town.y, r: spacing * (future ? 0.34 : 0.2), kind: future ? "undercity" : "metro", name: town.name, people: 0, population: 0, depth: 0, burg: town.id, ...(town.removed ? { removed: true } : {}) });
      if (!town.removed) stations.push({ cavern: caverns.length - 1, x: town.x, y: town.y });
    }
    // Lines: a spanning tree over the stations of each landmass.
    const live = stations.map((station) => station.cavern);
    const joined = new Set(live.slice(0, 1));
    while (joined.size < live.length) {
      let best: [number, number, number] | null = null;
      for (const a of joined)
        for (const b of live) {
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
    caverns.push({ id: caverns.length, x: marker.x, y: marker.y, r: spacing * own.float(0.12, 0.2), kind: vault ? "vault" : "bunker", name: marker.name, people: 0, population: vault ? Math.round((Number(marker.facts.dwellers) || 0) / 100) / 10 : 0, depth: 0 });
    stations.push({ cavern: caverns.length - 1, x: marker.x, y: marker.y });
  }

  // The age's stations, bunkers and vaults are dug down to the nearest natural cave, so the dark is one web.
  const BUILT: CavernKind[] = ["metro", "undercity", "bunker", "vault", "catacombs", "sewers"];
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
        cavern = { id: caverns.length, x: m.x, y: m.y, r: spacing * dug.float(0.15, 0.25), kind: m.kind === "volcano" ? "magma" : "cavern", name: name(wildTongue, dug, "plain"), people: 0, population: 0, depth: 0 };
        caverns.push(cavern);
        if (near) tunnels.push([near.id, cavern.id, "passage"]);
      }
      return { x: m.x, y: m.y, cavern: cavern.id, marker: m.id };
    })
    .filter(() => caverns.length > 0);
  for (const station of stations) entrances.push({ x: station.x, y: station.y, cavern: station.cavern, marker: 0 });
  const world: Underworld = { seed, name: name(peoples[0]?.language ?? createLanguage(rng.fork("n")), rng.fork("name"), "land"), width: W, height: H, caverns, tunnels, entrances, peoples, ways: [], sites: [], scale: planet.scale };
  deepen(world, planet, spacing);
  return world;
}

/** A town's size as the world grew it, before the GM set another. */
const sizeOf = (town: Burg) => town.grown ?? town.population;

/** The towns the age's works are dug under, the greatest first: the world's own towns as they grew, razed ones among
 * them, so a town the GM founds, razes or resizes renumbers no cavern. */
function greatTowns(planet: Planet): Burg[] {
  return planet.burgs
    .slice(1)
    .filter((town) => !town.founded)
    .sort((a, b) => sizeOf(b) - sizeOf(a));
}

/** The kinds of deep peoples: those of a world with magic, and in every age the folk who live in its dark without. */
const FANTASTIC = ["deep-dwarves", "dark-elves", "myconids", "troglodytes", "fish-folk", "deep-gnomes"];
const FOLK: Record<EraId, string[]> = {
  stone: ["cave-clan", "cave-clan", "bat-folk"],
  ancient: ["outcasts", "miners-guild", "oracle-cult"],
  medieval: ["outcasts", "smugglers", "miners-guild"],
  renaissance: ["smugglers", "outcasts", "heretics"],
  industrial: ["tunnel-folk", "smugglers", "miners-guild"],
  modern: ["mole-people", "doomsday-cult", "tunnel-folk"],
  cyberpunk: ["tunnel-gang", "ai-hive", "mole-people"],
  "far-future": ["machine-colony", "xeno-hive", "exiles"],
  "post-apocalypse": ["vault-clan", "ghoul-tribe", "mutant-hive"],
};
export const RELATIONS = ["war", "feud", "truce", "trade", "alliance", "tribute", "tribute-from"] as const;
export type DeepRelation = (typeof RELATIONS)[number];
/** Places of the deep: by whether the world has magic. */
const SITES_MAGIC = ["shrine", "hoard", "lost-expedition", "forge", "spore-garden", "oracle-pool", "toll-gate", "outpost", "prison-pit", "bone-field", "black-lake", "sunken-temple"];
const SITES_PLAIN = ["lost-expedition", "toll-gate", "outpost", "bone-field", "black-lake", "smugglers-cache", "old-workings", "shrine"];
const HAZARDS: Record<TunnelKind, string[]> = {
  passage: ["cave-in", "bad-air", "squeeze", "flooding", "ambush", "toll", "maze"],
  river: ["rapids", "falls", "blind-fish", "cold", "whirlpool"],
  chasm: ["rope-bridge", "sheer-climb", "updraft", "loose-ledge"],
  line: ["derailed-train", "flooded-tunnel", "power-out", "patrol", "live-rail"],
};
const BUILT_KINDS: CavernKind[] = ["metro", "undercity", "bunker", "vault", "catacombs", "sewers"];

/** What the dark holds besides its caverns: the undercrofts of the great towns in ages before the metro, deep peoples
 * in every age with their lands and quarrels, how deep each cavern lies, how long and how dangerous each tunnel is and
 * whether it runs under the sea, and the places of the deep. Every part draws from a stream of its own, so the caverns,
 * tunnels and ways down above stay where they were. */
function deepen(world: Underworld, planet: Planet, spacing: number) {
  const { caverns, tunnels, peoples } = world;
  const rng = createRng(world.seed);
  const setting = settingOf(planet.params.setting);
  const age = ageOf(setting);
  const natural = () => caverns.filter((c) => !BUILT_KINDS.includes(c.kind));
  const nearest = (list: Cavern[], x: number, y: number) => list.reduce<Cavern | null>((best, c) => (!best || Math.hypot(c.x - x, c.y - y) < Math.hypot(best.x - x, best.y - y) ? c : best), null);
  // Before the metro, the great towns have catacombs (old ages) or sewers (from the age of print), dug down to the caves;
  // a razed town's are kept, taken away with it, like its station.
  if (setting.tech < 6.25 && age !== "stone" && age !== "post-apocalypse") {
    const own = rng.fork("undercrofts");
    const kind: CavernKind = setting.tech >= 4 ? "sewers" : "catacombs";
    const towns = greatTowns(planet).filter((town) => sizeOf(town) >= 5).slice(0, 8);
    for (const town of towns) {
      const below = nearest(natural(), town.x, town.y);
      const node: Cavern = { id: caverns.length, x: town.x, y: town.y, r: spacing * own.float(0.14, 0.2), kind, name: town.name, people: 0, population: 0, burg: town.id, depth: 0, ...(town.removed ? { removed: true } : {}) };
      caverns.push(node);
      if (town.removed) continue;
      if (below) tunnels.push([below.id, node.id, "passage"]);
      world.entrances.push({ x: town.x, y: town.y, cavern: node.id, marker: 0 });
    }
  }
  // Deep peoples in a world without magic: the folk of its age who live below.
  const folk = rng.fork("folk");
  if (setting.magic < 1 && !peoples.length) {
    const homes = folk.shuffle(caverns.filter((c) => ["cavern", "fungal", "crystal", "ruins"].includes(c.kind))).slice(0, folk.int(1, 3));
    for (const home of homes) {
      const language = createLanguage(folk.fork(`folk-${peoples.length}`));
      const id = peoples.length + 1;
      peoples.push({ id, name: name(language, folk, "people"), color: paletteColor(id, folk.next(), 0.55, 0.6), language, kind: "", capital: home.id, relations: {}, population: 0 });
      home.kind = "settlement";
      home.people = id;
      home.population = Math.round(folk.float(0.2, 6) * 10) / 10;
      home.name = name({ ...language }, folk, "town");
    }
    for (const c of caverns) {
      if (c.people || BUILT_KINDS.includes(c.kind)) continue;
      const home = nearest(homes, c.x, c.y);
      if (home && Math.hypot(home.x - c.x, home.y - c.y) < spacing * 2.5) c.people = home.people;
    }
  }
  // Each people: its kind, its first settlement, how many they are, how it stands with the others.
  const kinds = rng.fork("kinds");
  for (const people of peoples) {
    people.kind = setting.magic >= 1 ? kinds.pick(FANTASTIC) : kinds.pick(FOLK[age]);
    const own = caverns.filter((c) => c.people === people.id);
    people.capital = (own.find((c) => c.kind === "settlement") ?? own[0])?.id ?? 0;
    people.population = Math.round(own.reduce((sum, c) => sum + c.population, 0) * 10) / 10;
    people.relations = {};
  }
  const ties = rng.fork("relations");
  for (let a = 0; a < peoples.length; a++)
    for (let b = a + 1; b < peoples.length; b++) {
      const touching = tunnels.some(([p, q]) => (caverns[p].people === peoples[a].id && caverns[q].people === peoples[b].id) || (caverns[q].people === peoples[a].id && caverns[p].people === peoples[b].id));
      const relation = ties.weighted<DeepRelation>(touching ? [["war", 3], ["feud", 3], ["truce", 2], ["trade", 2], ["tribute", 1.5], ["alliance", 1]] : [["trade", 3], ["truce", 2], ["alliance", 1.5], ["feud", 1]]);
      peoples[a].relations[peoples[b].id] = relation;
      // Tribute goes one way: the other side receives it.
      peoples[b].relations[peoples[a].id] = relation === "tribute" ? "tribute-from" : relation;
    }
  // How deep: the ways down are shallow, each tunnel on goes deeper; an abyss or magma lies far below, the age's own
  // works just under the streets.
  const deep = rng.fork("depth");
  const depth = new Float64Array(caverns.length).fill(Infinity);
  const queue: number[] = [];
  for (const e of world.entrances) if (depth[e.cavern] === Infinity) (depth[e.cavern] = deep.int(60, 300), queue.push(e.cavern));
  if (!queue.length && caverns.length) (depth[0] = 200, queue.push(0));
  for (let k = 0; k < queue.length; k++) {
    const c = queue[k];
    for (const [p, q] of tunnels) {
      const n = p === c ? q : q === c ? p : -1;
      if (n < 0 || depth[n] !== Infinity) continue;
      depth[n] = depth[c] + deep.int(150, 650);
      queue.push(n);
    }
  }
  // A way down opens on the upper dark, whatever lies below it.
  const mouths = new Set(world.entrances.map((e) => e.cavern));
  for (const c of caverns) {
    let d = depth[c.id] === Infinity ? 800 : depth[c.id];
    if (BUILT_KINDS.includes(c.kind)) d = c.kind === "bunker" || c.kind === "vault" ? deep.int(30, 120) : deep.int(10, 40);
    else if (mouths.has(c.id)) d = Math.min(d, 400);
    else if (c.kind === "abyss") d += deep.int(1200, 2500);
    else if (c.kind === "magma") d += deep.int(800, 1800);
    else if (c.kind === "sea") d += deep.int(100, 400);
    c.depth = Math.round(d / 10) * 10;
  }
  // Tunnels: their length, danger and what threatens on them; those under the sea say so.
  const ways = rng.fork("ways");
  world.ways = tunnels.map(([a, b, kind]) => wayOf(world, planet, a, b, kind, ways));
  // Places of the deep, each in a cavern of its kind.
  const own = rng.fork("sites");
  const tongue = createLanguage(own.fork("tongue"));
  const pool = setting.magic >= 1 ? SITES_MAGIC : SITES_PLAIN;
  const fits: Partial<Record<string, CavernKind[]>> = { "black-lake": ["sea"], "spore-garden": ["fungal"], forge: ["settlement", "magma"], hoard: ["abyss", "magma", "crystal", "cavern"], "sunken-temple": ["sea", "ruins"], "toll-gate": ["settlement", "cavern"], "old-workings": ["crystal", "cavern"], "smugglers-cache": ["cavern", "sewers", "catacombs"] };
  const count = Math.max(3, Math.round(natural().length / 5));
  for (let k = 0; k < count; k++) {
    const kind = own.pick(pool);
    const options = natural().filter((c) => !c.removed && (!fits[kind] || fits[kind]!.includes(c.kind)) && !world.sites.some((s) => s.cavern === c.id));
    if (!options.length) continue;
    const cavern = own.pick(options);
    const angle = own.float(0, Math.PI * 2);
    const facts: Record<string, string | number> = kind === "lost-expedition" ? { members: own.int(3, 12), years: own.int(1, 60) } : kind === "toll-gate" ? { toll: own.int(1, 20) } : kind === "bone-field" ? { dead: own.int(20, 2000) } : {};
    world.sites.push({ id: world.sites.length, cavern: cavern.id, kind, x: cavern.x + Math.cos(angle) * cavern.r * 0.5, y: cavern.y + Math.sin(angle) * cavern.r * 0.5, name: name(cavern.people ? { ...peoples[cavern.people - 1].language } : tongue, own, "plain"), facts });
  }
}

/** A tunnel's length (km, winding), danger and hazard, and whether it passes under the sea. */
function wayOf(world: Underworld, planet: Planet, a: number, b: number, kind: TunnelKind, rng: Rng): UnderWay {
  const p = world.caverns[a],
    q = world.caverns[b];
  let undersea = false;
  for (let k = 1; k < 8 && !undersea; k++) {
    const cell = planet.mesh.find(p.x + ((q.x - p.x) * k) / 8, p.y + ((q.y - p.y) * k) / 8);
    if (planet.water[cell] && planet.features[planet.feature[cell]]?.kind === "ocean") undersea = true;
  }
  const harsh = [p, q].some((c) => c.kind === "abyss" || c.kind === "magma") ? 1 : 0;
  const danger = Math.max(1, Math.min(3, 1 + harsh + (kind === "chasm" ? 1 : 0) + (rng.chance(0.35) ? 1 : 0) - (kind === "line" ? 1 : 0)));
  return { length: Math.max(1, Math.round(Math.hypot(q.x - p.x, q.y - p.y) * (world.scale || 1) * (kind === "line" ? 1.05 : 1.35))), danger, hazard: rng.chance(0.25 + danger * 0.2) ? rng.pick(HAZARDS[kind]) : null, undersea };
}

/** The game master's changes to an underworld: caverns of another kind or people, removed or added; tunnels cut or
 * dug. Kept under `changes.underworld` of the underworld's patch. */
export interface UnderworldChanges {
  caverns?: Record<string, { kind?: CavernKind; people?: number; removed?: boolean }>;
  added?: { x: number; y: number; kind: CavernKind; people: number }[];
  cut?: [number, number][];
  joined?: [number, number, TunnelKind][];
}

export function editUnderworld(world: Underworld, changes: UnderworldChanges | undefined): Underworld {
  if (!changes || (!Object.keys(changes.caverns ?? {}).length && !changes.added?.length && !changes.cut?.length && !changes.joined?.length)) return world;
  const caverns = world.caverns.map((c) => ({ ...c }));
  const typical = [...caverns].sort((p, q) => p.r - q.r)[Math.floor(caverns.length / 2)]?.r ?? 10;
  (changes.added ?? []).forEach((add, k) => {
    const near = caverns.reduce<Cavern | null>((best, c) => (!best || Math.hypot(c.x - add.x, c.y - add.y) < Math.hypot(best.x - add.x, best.y - add.y) ? c : best), null);
    const tongue = add.people && world.peoples[add.people - 1] ? { ...world.peoples[add.people - 1].language } : createLanguage(createRng(`${world.seed}/added-tongue`));
    caverns.push({ id: caverns.length, x: add.x, y: add.y, r: typical, kind: add.kind, name: name(tongue, createRng(`${world.seed}/added-${k}`), add.kind === "settlement" ? "town" : "plain"), people: add.people, population: add.kind === "settlement" ? 1 : 0, depth: near?.depth ?? 300, added: true });
  });
  for (const [id, change] of Object.entries(changes.caverns ?? {})) {
    const c = caverns[Number(id)];
    if (!c) continue;
    if (change.kind) {
      c.kind = change.kind;
      if (c.kind === "settlement" && !c.population) c.population = 1;
    }
    if (change.people !== undefined) c.people = world.peoples[change.people - 1] ? change.people : 0;
    if (change.removed) c.removed = true;
  }
  const cut = (a: number, b: number) => (changes.cut ?? []).some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  const gone = (c: number) => !caverns[c] || caverns[c].removed;
  const tunnels: Underworld["tunnels"] = [];
  const ways: UnderWay[] = [];
  world.tunnels.forEach((tunnel, k) => {
    if (cut(tunnel[0], tunnel[1]) || gone(tunnel[0]) || gone(tunnel[1])) return;
    tunnels.push(tunnel);
    ways.push(world.ways[k]);
  });
  for (const [a, b, kind] of changes.joined ?? []) {
    if (gone(a) || gone(b) || a === b || tunnels.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) continue;
    tunnels.push([a, b, kind]);
    ways.push({ length: Math.max(1, Math.round(Math.hypot(caverns[a].x - caverns[b].x, caverns[a].y - caverns[b].y) * (world.scale || 1) * 1.35)), danger: 1, hazard: null, undersea: false });
  }
  return { ...world, caverns, tunnels, ways, entrances: world.entrances.filter((e) => !gone(e.cavern)), sites: world.sites.filter((s) => !gone(s.cavern)) };
}

/** How deep a cavern lies, by tier: the upper dark (under 600 m), the middle (under 2 km) and the deep. */
export function tierOf(cavern: Cavern): 1 | 2 | 3 {
  return cavern.depth < 600 ? 1 : cavern.depth < 2000 ? 2 : 3;
}

/** The cavern under a point of the planet: the one a way down there opens on, else the nearest within reach. */
export function cavernBelow(world: Underworld, x: number, y: number): Cavern | null {
  const way = world.entrances.find((e) => Math.hypot(e.x - x, e.y - y) < 1e-6);
  if (way) return world.caverns[way.cavern] ?? null;
  const live = world.caverns.filter((c) => !c.removed);
  const near = live.reduce<Cavern | null>((best, c) => (!best || Math.hypot(c.x - x, c.y - y) < Math.hypot(best.x - x, best.y - y) ? c : best), null);
  return near && Math.hypot(near.x - x, near.y - y) < near.r * 3 ? near : null;
}

/** The cavern a planet marker's way down opens on. */
export function cavernOfMarker(world: Underworld, marker: number): Cavern | null {
  const way = world.entrances.find((e) => e.marker === marker);
  return way ? world.caverns[way.cavern] ?? null : null;
}
