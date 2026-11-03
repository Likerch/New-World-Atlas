// The GM's world editor. Strokes of the relief brush are replayed before a world grows, so rivers, climate, peoples
// and realms all follow the new ground; then land is handed to other realms and towns are moved, founded or razed on
// the grown world. Towns keep their ids (a razed town is only marked), so the GM's names and notes stay put.
import type { TroubleKind } from "./nature";
import type { Mesh } from "../mesh";
import type { Burg, Planet } from "./model";
import { buildRoutes } from "./routes";
import { poleOf } from "./states";
import { cellKm2 } from "./geo";

/** A relief stroke: [x, y, radius, strength, how, x2, y2]. How: 0 raise or lower by the strength, 1 smooth, 2 level the
 * ground to the strength's height, 3 a ridge (or, with a negative strength, a trench) from (x, y) to (x2, y2). */
export type Stroke = [number, number, number, number] | [number, number, number, number, number] | [number, number, number, number, number, number, number];

export interface PlanetEdits {
  /** Relief brush strokes. */
  terrain: Stroke[];
  /** A heightmap from a picture, 0–100 by row: it replaces the generated relief before any stroke. */
  image?: { width: number; height: number; heights: number[]; box?: [number, number, number, number] };
  /** Land given to another realm: cell → state. */
  owners: Record<number, number>;
  /** Towns moved, by id: where they stand now. */
  moved: Record<number, [number, number]>;
  /** Towns founded by the GM: [x, y, name, thousands of people]. Their ids follow the grown world's towns. */
  added: [number, number, string, number][];
  removed: number[];
  /** Land given to another people, faith or province: cell → id. */
  cultures?: Record<number, number>;
  faiths?: Record<number, number>;
  provinces?: Record<number, number>;
  /** A realm's form of rule, colour and seat changed by the GM. */
  realms?: Record<number, { form?: string; formKey?: string; color?: string; capital?: number }>;
  /** Realms swallowed by others: [swallowed, swallower]. */
  merged?: [number, number][];
  /** Realms the GM raised round a town: they take the town's province. */
  raised?: { town: number; name: string; color: string }[];
  /** How two realms stand, as the GM set it. */
  relations?: [number, number, string][];
  /** A town's size, walls and harbour set by the GM. */
  towns?: Record<number, { population?: number; walls?: boolean; port?: boolean }>;
  /** The GM's own words on the map: [x, y, text, size]. */
  labels?: [number, number, string, number][];
  /** The GM's zones: [x, y, radius, kind, label]. */
  zones?: [number, number, number, string, string?][];
}

export function emptyEdits(): PlanetEdits {
  return { terrain: [], owners: {}, moved: {}, added: [], removed: [] };
}

/** Works each stroke into the ground, softly towards its rim: raised or lowered, smoothed, levelled, or drawn out
 * into a ridge or a trench along a line. */
export function sculpt(mesh: Mesh, height: Float32Array, strokes: PlanetEdits["terrain"]): void {
  for (const stroke of strokes) {
    const [x, y, r, amount] = stroke;
    const how = stroke[4] ?? 0;
    const before = how === 1 ? height.slice() : null;
    for (let cell = 0; cell < mesh.cells; cell++) {
      let d = Math.hypot(mesh.x[cell] - x, mesh.y[cell] - y);
      if (how === 3) {
        // Distance to the ridge's line, not to a point.
        const [x2, y2] = [stroke[5] ?? x, stroke[6] ?? y];
        const length = Math.hypot(x2 - x, y2 - y) || 1;
        const along = Math.max(0, Math.min(1, ((mesh.x[cell] - x) * (x2 - x) + (mesh.y[cell] - y) * (y2 - y)) / (length * length)));
        d = Math.hypot(mesh.x[cell] - (x + (x2 - x) * along), mesh.y[cell] - (y + (y2 - y) * along));
      }
      if (d >= r) continue;
      const fall = (1 - (d / r) ** 2) ** 2;
      if (how === 1 && before) {
        const around = mesh.neighbors[cell];
        const mean = around.reduce((sum, next) => sum + before[next], before[cell]) / (around.length + 1);
        height[cell] = height[cell] + (mean - height[cell]) * fall;
      } else if (how === 2) height[cell] = height[cell] + (amount - height[cell]) * fall;
      else height[cell] = Math.max(0, Math.min(100, height[cell] + amount * fall));
    }
  }
}

/** A picture's heightmap laid over the map: each cell takes the height of the picture's pixel under it. */
export function heightsFromImage(mesh: Mesh, height: Float32Array, image: NonNullable<PlanetEdits["image"]>): void {
  for (let cell = 0; cell < mesh.cells; cell++) {
    const px = Math.min(image.width - 1, Math.floor((mesh.x[cell] / mesh.width) * image.width));
    const py = Math.min(image.height - 1, Math.floor((mesh.y[cell] / mesh.height) * image.height));
    height[cell] = image.heights[py * image.width + px] ?? height[cell];
  }
}

/** The grown world with the GM's realms and towns: borders repainted, towns moved, founded and razed, roads relaid. */
export function editPlanet(planet: Planet, edits: PlanetEdits | null | undefined): Planet {
  if (!edits) return planet;
  const owners = Object.entries(edits.owners);
  const moved = Object.entries(edits.moved);
  const more = [edits.cultures, edits.faiths, edits.provinces, edits.realms, edits.towns].some((list) => list && Object.keys(list).length) || [edits.merged, edits.raised, edits.relations, edits.labels, edits.zones].some((list) => list?.length);
  if (!owners.length && !moved.length && !edits.added.length && !edits.removed.length && !more) return planet;
  const { mesh, water } = planet;
  const state = planet.state.slice();
  const province = planet.province.slice();
  const culture = planet.culture.slice();
  const religion = planet.religion.slice();
  for (const [key, id] of Object.entries(edits.cultures ?? {})) if (!water[Number(key)] && planet.cultures[id]) culture[Number(key)] = id;
  for (const [key, id] of Object.entries(edits.faiths ?? {})) if (!water[Number(key)] && planet.religions[id]) religion[Number(key)] = id;
  const burg = planet.burg.slice();
  const burgs: Burg[] = planet.burgs.map((town) => ({ ...town }));

  const given: number[] = [];
  const realmsAfter = planet.states.length + (edits.raised?.length ?? 0);
  for (const [key, owner] of owners) {
    const cell = Number(key);
    // A capital's ground stays its realm's; a realm the GM raises counts from the world's last.
    if (water[cell] || !Number.isInteger(owner) || owner <= 0 || owner >= realmsAfter || burgs[burg[cell]]?.capital) continue;
    state[cell] = owner;
    if (planet.provinces[province[cell]]?.state !== owner) given.push(cell);
  }
  // Land handed over joins the new realm's nearest province, so no land is left outside every province: one spread out
  // from each realm's own provinces reaches all the land handed to it (not one search per cell).
  const handed = new Map<number, number[]>();
  for (const cell of given) (handed.get(state[cell]) ?? handed.set(state[cell], []).get(state[cell])!).push(cell);
  for (const [owner, cells] of handed) {
    const label = new Int32Array(mesh.cells).fill(-1);
    let ring: number[] = [];
    for (let cell = 0; cell < mesh.cells; cell++) {
      if (water[cell] || state[cell] !== owner || planet.provinces[planet.province[cell]]?.state !== owner) continue;
      label[cell] = planet.province[cell];
      ring.push(cell);
    }
    let left = cells.filter((cell) => label[cell] < 0).length;
    while (ring.length && left > 0) {
      const next: number[] = [];
      for (const c of ring) {
        for (const m of mesh.neighbors[c]) {
          if (label[m] >= 0) continue;
          label[m] = label[c];
          next.push(m);
        }
      }
      ring = next;
      left = cells.filter((cell) => label[cell] < 0).length;
    }
    for (const cell of cells) province[cell] = Math.max(0, label[cell]);
  }
  const stand = (town: Burg, x: number, y: number) => {
    const cell = mesh.find(x, y);
    if (water[cell] || (burg[cell] && burg[cell] !== town.id)) return false;
    // A capital stays in its own realm.
    if (town.capital && state[cell] !== town.state) return false;
    if (burg[town.cell] === town.id) burg[town.cell] = 0;
    // A town moved to the shore becomes a port; one moved inland is not one any more.
    const port = planet.coast[cell] === 1 && mesh.neighbors[cell].some((next) => water[next] && (planet.features[planet.feature[next]].kind === "ocean" || planet.features[planet.feature[next]].cells > 25));
    Object.assign(town, { x, y, cell, port });
    burg[cell] = town.id;
    return true;
  };
  for (const [id, [x, y]] of moved) if (burgs[Number(id)]) stand(burgs[Number(id)], x, y);
  for (const [x, y, name, population] of edits.added) {
    const cell = mesh.find(x, y);
    const people = planet.cultures[culture[cell]] ?? planet.cultures[0];
    const town: Burg = {
      id: burgs.length,
      name,
      cell: -1,
      x,
      y,
      culture: culture[cell],
      state: state[cell],
      province: province[cell],
      capital: false,
      port: planet.coast[cell] === 1,
      population,
      ...guardsOf(planet, population),
      shanty: false,
      kind: people.kind,
    };
    burgs.push(town);
    // A town that cannot stand there (water, another town) still takes its id, so later ones keep theirs.
    if (!stand(town, x, y)) town.removed = true;
  }
  // Realms the GM raised round a town take its province; swallowed realms give all their land to the swallower.
  const states = planet.states.map((item) => ({ ...item, cells: 0, area: 0, rural: 0, urban: 0, burgs: 0, relations: { ...item.relations } }));
  const provinces = planet.provinces.map((item) => ({ ...item }));
  for (const raised of edits.raised ?? []) {
    const town = burgs[raised.town];
    if (!town || town.removed || town.cell < 0 || town.capital) continue;
    const id = states.length;
    const from = state[town.cell];
    states.push({ ...states[from], id, name: raised.name, color: colour(raised.color) ?? states[from].color, capital: town.id, culture: town.culture, neighbors: [], relations: {}, pole: [town.x, town.y], polity: undefined });
    const home = province[town.cell];
    // Where the province also holds the old realm's seat, the new realm takes only the land nearer its own town, as a
    // province of its own; the old capital stays its realm's.
    const seat = burgs[states[from].capital];
    const split = !!home && !!seat && seat.cell >= 0 && province[seat.cell] === home && state[seat.cell] === from;
    const own = split ? provinces.length : home;
    if (split) provinces.push({ ...provinces[home], id: own, name: town.name, state: id, burg: town.id, center: town.cell, pole: [town.x, town.y] });
    const nearer = (cell: number) => Math.hypot(mesh.x[cell] - town.x, mesh.y[cell] - town.y) < Math.hypot(mesh.x[cell] - seat!.x, mesh.y[cell] - seat!.y);
    for (let cell = 0; cell < mesh.cells; cell++) {
      if (state[cell] !== from || !(home ? province[cell] === home : cell === town.cell) || (split && !nearer(cell))) continue;
      state[cell] = id;
      if (split) province[cell] = own;
    }
    if (home && provinces[home] && !split) provinces[home].state = id;
    // Land painted to this realm before it stood joins its province.
    for (let cell = 0; cell < mesh.cells; cell++) if (state[cell] === id && provinces[province[cell]]?.state !== id) province[cell] = own;
    town.capital = true;
  }
  // Land painted to a realm that was never raised (its town gone) stays where it was.
  for (let cell = 0; cell < mesh.cells; cell++) if (state[cell] >= states.length) (state[cell] = planet.state[cell]), (province[cell] = planet.province[cell]);
  for (const [gone, into] of edits.merged ?? []) {
    if (!states[gone] || !states[into] || gone === into) continue;
    for (let cell = 0; cell < mesh.cells; cell++) if (state[cell] === gone) state[cell] = into;
    for (const item of provinces) if (item.state === gone) item.state = into;
    const seat = burgs[states[gone].capital];
    if (seat) seat.capital = false;
  }
  for (const [key, id] of Object.entries(edits.provinces ?? {})) {
    const cell = Number(key);
    if (!water[cell] && provinces[id] && provinces[id].state === state[cell]) province[cell] = id;
  }
  for (const [key, set] of Object.entries(edits.realms ?? {})) {
    const realm = states[Number(key)];
    if (!realm) continue;
    if (set.form) realm.form = set.form as typeof realm.form;
    if (set.formKey) realm.formKey = set.formKey;
    if (colour(set.color)) realm.color = colour(set.color)!;
    const seat = set.capital !== undefined ? burgs[set.capital] : undefined;
    if (seat && !seat.removed && seat.cell >= 0 && state[seat.cell] === realm.id) {
      if (burgs[realm.capital]) burgs[realm.capital].capital = false;
      seat.capital = true;
      realm.capital = seat.id;
    }
  }
  for (const id of edits.removed) {
    const town = burgs[id];
    if (!town || town.capital) continue;
    town.removed = true;
    if (burg[town.cell] === id) burg[town.cell] = 0;
    // A razed seat leaves its province without one.
    for (const item of provinces) if (item.burg === id) item.burg = 0;
  }
  for (const [key, set] of Object.entries(edits.towns ?? {})) {
    const town = burgs[Number(key)];
    if (!town) continue;
    if (set.population !== undefined) town.population = Math.max(0.01, set.population);
    if (set.walls !== undefined) town.walls = set.walls;
    if (set.port !== undefined) town.port = set.port;
  }
  for (const town of burgs.slice(1)) {
    if (town.cell < 0) continue;
    town.state = state[town.cell];
    town.province = province[town.cell];
  }

  // Realms recounted, roads relaid between the towns that stand.
  for (let cell = 0; cell < mesh.cells; cell++) {
    if (water[cell]) continue;
    const realm = states[state[cell]];
    realm.cells++;
    realm.area += cellKm2(planet, cell);
    realm.rural += planet.population[cell];
  }
  for (const town of burgs.slice(1)) {
    if (town.removed) continue;
    states[town.state].urban += town.population;
    states[town.state].burgs++;
  }
  for (const realm of states) realm.area = Math.round(realm.area);
  if (owners.length || edits.raised?.length || edits.merged?.length) {
    // New borders: new neighbours (who meet as strangers), a new place for each realm's name.
    const cellsOf = states.map((): number[] => []);
    for (let cell = 0; cell < mesh.cells; cell++) if (!water[cell]) cellsOf[state[cell]].push(cell);
    for (const realm of states.slice(1)) {
      const neighbors = new Set<number>();
      for (const cell of cellsOf[realm.id]) for (const next of mesh.neighbors[cell]) if (!water[next] && state[next] && state[next] !== realm.id) neighbors.add(state[next]);
      realm.neighbors = [...neighbors];
      realm.relations = { ...realm.relations };
      for (const other of realm.neighbors) realm.relations[other] ??= "neutral";
      if (cellsOf[realm.id].length) realm.pole = poleOf(planet, state, realm.id, cellsOf[realm.id]);
    }
  }
  for (const [a, b, relation] of edits.relations ?? []) {
    if (!states[a] || !states[b]) continue;
    states[a].relations[b] = relation as never;
    states[b].relations[a] = (relation === "vassal" ? "suzerain" : relation === "suzerain" ? "vassal" : relation) as never;
  }
  // Only towns, borders and seats move roads: words, zones, peoples and faiths leave them as they were.
  const relay = owners.length || moved.length || edits.added.length || edits.removed.length || edits.raised?.length || edits.merged?.length || Object.values(edits.towns ?? {}).some((set) => set.port !== undefined) || Object.values(edits.realms ?? {}).some((set) => set.capital !== undefined);
  const routes = relay
    ? buildRoutes(
        planet,
        burgs.map((town) => (town.removed ? { ...town, state: -1, port: false } : town)),
        states.map((realm) => ({ ...realm, capital: realm.capital || (burgs.filter((town) => town.state === realm.id && town.id && !town.removed).sort((a, b) => b.population - a.population)[0]?.id ?? 0) })),
        planet.routes.filter((route) => route.given).map((route) => [route.kind, route.cells]),
      )
    : planet.routes;
  return { ...planet, state, province, provinces, culture, religion, burg, burgs, states, routes, ...(edits.labels?.length ? { gmLabels: edits.labels } : {}), ...(edits.zones?.length ? { gmZones: edits.zones.filter((zone) => TROUBLES.includes(zone[3] as TroubleKind)) } : {}) };
}

/** A colour as a file may give it: only a #hex colour is drawn. */
const colour = (value: unknown): string | undefined => (typeof value === "string" && /^#[0-9a-f]{3,8}$/iu.test(value) ? value : undefined);
const TROUBLES: TroubleKind[] = ["front", "plague", "famine", "bandits", "storm", "radiation", "custom"];

/** A town's walls, citadel, temple and market as the world's own towns of its size have them. */
function guardsOf(planet: Planet, population: number): Pick<Burg, "walls" | "citadel" | "temple" | "market"> {
  const peers = planet.burgs.slice(1).filter((town) => !town.removed && !town.capital);
  const share = (test: (town: Burg) => boolean, bigger: (town: Burg) => boolean) => {
    const like = peers.filter(bigger);
    return like.length ? like.filter(test).length / like.length >= 0.5 : false;
  };
  const near = (town: Burg) => town.population >= population * 0.5 && town.population <= population * 2;
  return { walls: share((t) => t.walls, near), citadel: share((t) => t.citadel, near), temple: share((t) => t.temple, near), market: share((t) => t.market, near) };
}

/** The size a town founded by the GM starts at: the realm's usual town, else the world's. */
export function foundedSize(planet: Planet, cell: number): number {
  const realm = planet.state[cell];
  const sizes = (test: (town: Burg) => boolean) => planet.burgs.slice(1).filter((town) => !town.removed && !town.capital && test(town)).map((town) => town.population).sort((a, b) => a - b);
  const own = sizes((town) => town.state === realm);
  const all = own.length ? own : sizes(() => true);
  return all.length ? all[Math.floor(all.length / 2)] : 2;
}
