// The countryside of a close-up: what the planet's coarse cells only hint at. The planet's rivers cut their beds first
// and its roads are laid again, so the close-up keeps the planet's geography; then the villages fall into a hierarchy
// (a few large ones with markets, many small, hamlets in the gaps), the land round them into fields, pastures and woods,
// the land between them into lordships, and the largest woods, marshes, hills and mountains get names.
import { name } from "../language";
import type { Mesh } from "../mesh";
import { PriorityQueue } from "../queue";
import type { Rng } from "../random";
import { settingOf } from "../setting";
import { SEA_LEVEL, type Burg, type Culture, type Fief, type Ground, type Landform, type LandformKind, type Planet, type RouteKind } from "./model";

type Project = (x: number, y: number) => readonly [number, number];

/** Land use: nothing (wild land, or water), fields, pasture, managed woods, orchards and vineyards. */
export const LAND_USE = ["wild", "fields", "pasture", "woods", "orchards"] as const;

/** Every point along a line, a third of a cell apart, so the cells it passes through form an unbroken chain. */
function along(mesh: Mesh, from: readonly [number, number], to: readonly [number, number], visit: (x: number, y: number, t: number) => void, first: boolean) {
  const count = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / (mesh.spacing / 3)));
  for (let k = first ? 0 : 1; k <= count; k++) visit(from[0] + ((to[0] - from[0]) * k) / count, from[1] + ((to[1] - from[1]) * k) / count, k / count);
}

const inFrame = (mesh: Mesh, x: number, y: number) => x >= 0 && y >= 0 && x <= mesh.width && y <= mesh.height;

/**
 * The planet's rivers cut a bed falling all the way to their mouths, so the close-up's water runs where the planet's
 * does. Returns where each river's course first lies in the frame and how much water the planet has it carry there
 * (m³/s): what of that the close-up's own land does not gather (its catchment lies beyond the frame) is brought in.
 */
export function carveRivers(planet: Planet, mesh: Mesh, height: Float32Array, toRegion: Project): [number, number][] {
  const sources: [number, number][] = [];
  const parent = planet.mesh;
  for (const river of planet.rivers.slice(1)) {
    const course = river.cells.map((cell) => ({ at: toRegion(parent.x[cell], parent.y[cell]), height: planet.height[cell], flux: planet.flux[cell] }));
    course.push({ at: toRegion(river.mouth[0], river.mouth[1]), height: SEA_LEVEL - 1, flux: river.discharge });
    let level = Infinity;
    let entered = false;
    for (let k = 1; k < course.length; k++) {
      const a = course[k - 1],
        b = course[k];
      along(
        mesh,
        a.at,
        b.at,
        (x, y, t) => {
          if (!inFrame(mesh, x, y)) return;
          const cell = mesh.find(x, y);
          if (height[cell] < SEA_LEVEL) return;
          if (!entered) {
            entered = true;
            sources.push([cell, a.flux + (b.flux - a.flux) * t]);
          }
          level = Math.min(level, a.height + (b.height - a.height) * t, height[cell]);
          height[cell] = Math.min(height[cell], Math.max(SEA_LEVEL + 0.05, level - 1.2));
        },
        k === 1,
      );
    }
  }
  return sources;
}

/** The planet's roads, trails and railways where they cross the frame, as chains of the close-up's cells. */
export function planetRoads(planet: Planet, mesh: Mesh, water: Uint8Array, toRegion: Project): [RouteKind, number[]][] {
  const out: [RouteKind, number[]][] = [];
  const parent = planet.mesh;
  for (const route of planet.routes.slice(1)) {
    if (route.kind === "sea" || route.kind === "air") continue;
    const points = route.cells.map((cell) => {
      const town = planet.burg[cell] ? planet.burgs[planet.burg[cell]] : null;
      return toRegion(town ? town.x : parent.x[cell], town ? town.y : parent.y[cell]);
    });
    let run: number[] = [];
    const close = () => {
      if (run.length > 1) out.push([route.kind, run]);
      run = [];
    };
    for (let k = 1; k < points.length; k++) {
      along(
        mesh,
        points[k - 1],
        points[k],
        (x, y) => {
          const cell = inFrame(mesh, x, y) ? mesh.find(x, y) : -1;
          if (cell < 0 || water[cell]) return close();
          if (run[run.length - 1] !== cell) run.push(cell);
        },
        k === 1,
      );
    }
    close();
  }
  return out;
}

/**
 * The villages as a hierarchy: sizes fall off with rank (the best-placed first), the largest hold the markets, and the
 * last third are hamlets of a few households.
 */
export function rankVillages(villages: Burg[], rng: Rng): void {
  const markets = Math.max(1, Math.round(villages.length * 0.12));
  const hamlets = Math.round(villages.length * 0.67);
  villages.forEach((village, rank) => {
    const own = rng.fork(`village-${village.id}`);
    const hamlet = rank >= hamlets && rank >= markets;
    village.population = Math.round((hamlet ? own.float(0.02, 0.06) : 0.03 + 1.6 * (rank + 1) ** -0.72 * own.float(0.8, 1.2)) * 100) / 100;
    village.market = rank < markets;
    village.tier = hamlet ? "hamlet" : "village";
  });
}

/** Cheapest spread from sources over dry land: each cell takes the source that reaches it for the least cost. */
function spread(g: Ground, sources: { cell: number; reach: number }[], allowed: (from: number, to: number) => boolean) {
  const n = g.mesh.cells;
  const cost = new Float32Array(n).fill(Infinity);
  const owner = new Int32Array(n).fill(-1);
  const queue = new PriorityQueue<number>();
  sources.forEach((source, k) => {
    if (g.water[source.cell]) return;
    cost[source.cell] = 0;
    owner[source.cell] = k;
    queue.push(source.cell, 0);
  });
  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    const [cell, at] = entry;
    if (at > cost[cell]) continue;
    const reach = sources[owner[cell]].reach;
    for (const next of g.mesh.neighbors[cell]) {
      if (g.water[next] || !allowed(cell, next)) continue;
      const step = (Math.hypot(g.mesh.x[next] - g.mesh.x[cell], g.mesh.y[next] - g.mesh.y[cell]) * g.scale) / reach;
      if (at + step >= cost[next]) continue;
      cost[next] = at + step;
      owner[next] = owner[cell];
      queue.push(next, cost[next]);
    }
  }
  return { cost, owner };
}

/**
 * What the land round the settlements is used for. Reach grows with a place's size and with the age's farming; it is
 * measured in the close-up's cells, since its villages stand for many more than it can draw.
 */
export function landUseOf(g: Ground, burgs: Burg[]): Uint8Array {
  const { tech } = settingOf(g.params.setting);
  const farming = tech < 1 ? 0.4 : tech >= 6 ? 1.6 : 1;
  const cellKm = g.mesh.spacing * g.scale;
  const sources = burgs
    .slice(1)
    .filter((burg) => !burg.removed && burg.cell >= 0)
    .map((burg) => ({ cell: burg.cell, reach: cellKm * (burg.tier ? 1.1 : 1.8) * (0.7 + 0.5 * Math.sqrt(burg.population)) * farming }));
  const { cost } = spread(g, sources, () => true);
  const use = new Uint8Array(g.mesh.cells);
  for (let cell = 0; cell < g.mesh.cells; cell++) {
    if (g.water[cell]) continue;
    const d = cost[cell];
    const biome = g.biome[cell];
    const t = g.temperature[cell];
    if (biome === 11 || g.height[cell] > 66) continue;
    if (biome === 1 || biome === 2 || biome === 10) use[cell] = d < 1 ? 2 : 0;
    else if (biome === 12) use[cell] = d < 1.2 ? 2 : 0;
    else if (biome >= 5 && biome <= 9) use[cell] = d < 1 ? 1 : d < 2.2 ? 3 : 0;
    else use[cell] = d < 1 ? 1 : d < 2.5 ? 2 : 0;
    // Sunny slopes near the larger places carry orchards and vines.
    if (use[cell] === 1 && d < 0.6 && t > 11 && t < 24 && g.height[cell] > 26 && ((cell * 2654435761) >>> 0) % 3 === 0) use[cell] = 4;
  }
  return use;
}

/**
 * Lordships (or districts, in later ages): the land of each realm falls to its nearest seat, a town or one of the largest
 * villages (an eighth of them: in a machine age every village has its shops, so a market alone makes no seat).
 */
export function fiefsOf(g: Ground, state: Uint16Array, burgs: Burg[]): { fief: Uint16Array; fiefs: Fief[] } {
  const villages = burgs.filter((burg) => burg.tier === "village" && !burg.removed).sort((a, b) => b.population - a.population);
  const least = villages[Math.max(0, Math.round(villages.length * 0.12) - 1)]?.population ?? Infinity;
  const seats = burgs.slice(1).filter((burg) => !burg.removed && burg.cell >= 0 && state[burg.cell] && (!burg.tier || (burg.tier === "village" && burg.population >= least)));
  const { owner } = spread(
    g,
    seats.map((seat) => ({ cell: seat.cell, reach: 1 + Math.sqrt(seat.population) * (seat.tier ? 1 : 1.6) })),
    (from, to) => state[from] === state[to],
  );
  const fief = new Uint16Array(g.mesh.cells);
  const fiefs: Fief[] = [{ id: 0, seat: 0, state: 0, cells: 0 }];
  for (const seat of seats) fiefs.push({ id: fiefs.length, seat: seat.id, state: state[seat.cell], cells: 0 });
  for (let cell = 0; cell < g.mesh.cells; cell++) {
    if (owner[cell] < 0 || !state[cell]) continue;
    fief[cell] = owner[cell] + 1;
    fiefs[owner[cell] + 1].cells++;
  }
  return { fief, fiefs };
}

/** What kind of named land a cell belongs to, if any. */
function landformOf(g: Ground, cell: number): LandformKind | null {
  if (g.water[cell]) return null;
  const biome = g.biome[cell];
  if (g.height[cell] >= 62) return "mountains";
  if (biome === 12) return "marsh";
  if (biome >= 5 && biome <= 9) return "forest";
  if (g.height[cell] >= 44) return "hills";
  if (biome === 1 || biome === 2) return "desert";
  if (biome === 10) return "heath";
  return null;
}

/** The largest woods, marshes, hills, mountains, deserts and heaths, named in the tongue of the people who live there. */
export function landformsOf(g: Ground, culture: Uint16Array, cultures: Culture[], rng: Rng): Landform[] {
  const n = g.mesh.cells;
  const group = new Int32Array(n).fill(-1);
  const found: { kind: LandformKind; cells: number[] }[] = [];
  for (let start = 0; start < n; start++) {
    const kind = landformOf(g, start);
    if (!kind || group[start] >= 0) continue;
    const cells = [start];
    group[start] = found.length;
    for (let head = 0; head < cells.length; head++) {
      for (const next of g.mesh.neighbors[cells[head]]) {
        if (group[next] < 0 && landformOf(g, next) === kind) {
          group[next] = found.length;
          cells.push(next);
        }
      }
    }
    found.push({ kind, cells });
  }
  const least = Math.max(25, n / 250);
  const landforms: Landform[] = [];
  for (const { kind, cells } of found.filter((item) => item.cells.length >= least).sort((a, b) => b.cells.length - a.cells.length).slice(0, 14)) {
    const own = rng.fork(`landform-${cells[0]}`);
    // The label stands at the heart: the cell the most steps away from the landform's edge.
    const id = group[cells[0]];
    const depth = new Int32Array(cells.length);
    const index = new Map(cells.map((cell, k) => [cell, k]));
    let ring = cells.filter((cell) => g.mesh.neighbors[cell].some((next) => group[next] !== id));
    const seen = new Set(ring);
    for (let step = 1; ring.length; step++) {
      const next: number[] = [];
      for (const cell of ring) for (const m of g.mesh.neighbors[cell]) if (group[m] === id && !seen.has(m)) (seen.add(m), next.push(m), (depth[index.get(m)!] = step));
      ring = next;
    }
    const heart = cells[depth.indexOf(Math.max(...depth))];
    const people = cultures[culture[heart]] ?? cultures[0];
    landforms.push({ id: landforms.length + 1, kind, name: name(people.language, own, kind === "mountains" ? "mountain" : "plain"), x: g.mesh.x[heart], y: g.mesh.y[heart], cells: cells.length });
    // Mountains get their highest summit named too.
    if (kind === "mountains") {
      const top = cells.reduce((best, cell) => (g.height[cell] > g.height[best] ? cell : best), cells[0]);
      landforms.push({ id: landforms.length + 1, kind: "peak", name: name(people.language, own, "mountain"), x: g.mesh.x[top], y: g.mesh.y[top], cells: 1, cell: top });
    }
  }
  return [{ id: 0, kind: "forest", name: "", x: 0, y: 0, cells: 0 }, ...landforms];
}
