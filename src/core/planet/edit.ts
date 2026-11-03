// The GM's world editor. Strokes of the relief brush are replayed before a world grows, so rivers, climate, peoples
// and realms all follow the new ground; then land is handed to other realms and towns are moved, founded or razed on
// the grown world. Towns keep their ids (a razed town is only marked), so the GM's names and notes stay put.
import type { Mesh } from "../mesh";
import type { Burg, Planet } from "./model";
import { buildRoutes } from "./routes";
import { poleOf } from "./states";

export interface PlanetEdits {
  /** Relief brush strokes: [x, y, radius, height change at the centre]. */
  terrain: [number, number, number, number][];
  /** Land given to another realm: cell → state. */
  owners: Record<number, number>;
  /** Towns moved, by id: where they stand now. */
  moved: Record<number, [number, number]>;
  /** Towns founded by the GM: [x, y, name, thousands of people]. Their ids follow the grown world's towns. */
  added: [number, number, string, number][];
  removed: number[];
}

export function emptyEdits(): PlanetEdits {
  return { terrain: [], owners: {}, moved: {}, added: [], removed: [] };
}

/** Raises or lowers the ground under each stroke, softly towards its rim. */
export function sculpt(mesh: Mesh, height: Float32Array, strokes: PlanetEdits["terrain"]): void {
  for (const [x, y, r, amount] of strokes) {
    for (let cell = 0; cell < mesh.cells; cell++) {
      const d = Math.hypot(mesh.x[cell] - x, mesh.y[cell] - y);
      if (d >= r) continue;
      const fall = 1 - (d / r) ** 2;
      height[cell] = Math.max(0, Math.min(100, height[cell] + amount * fall * fall));
    }
  }
}

/** The grown world with the GM's realms and towns: borders repainted, towns moved, founded and razed, roads relaid. */
export function editPlanet(planet: Planet, edits: PlanetEdits | null | undefined): Planet {
  if (!edits) return planet;
  const owners = Object.entries(edits.owners);
  const moved = Object.entries(edits.moved);
  if (!owners.length && !moved.length && !edits.added.length && !edits.removed.length) return planet;
  const { mesh, water } = planet;
  const state = planet.state.slice();
  const province = planet.province.slice();
  const burg = planet.burg.slice();
  const burgs: Burg[] = planet.burgs.map((town) => ({ ...town }));

  const given: number[] = [];
  for (const [key, owner] of owners) {
    const cell = Number(key);
    // A capital's ground stays its realm's.
    if (water[cell] || !planet.states[owner] || burgs[burg[cell]]?.capital) continue;
    state[cell] = owner;
    if (planet.provinces[province[cell]]?.state !== owner) given.push(cell);
  }
  // Land handed over joins the new realm's nearest province, so no land is left outside every province.
  for (const cell of given) {
    const owner = state[cell];
    let found = 0;
    const seen = new Set([cell]);
    for (let ring = [cell]; ring.length && !found; ) {
      const next: number[] = [];
      for (const c of ring) {
        for (const m of mesh.neighbors[c]) {
          if (seen.has(m)) continue;
          seen.add(m);
          if (!water[m] && state[m] === owner && planet.provinces[planet.province[m]]?.state === owner) found = planet.province[m];
          next.push(m);
        }
      }
      ring = next;
    }
    province[cell] = found;
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
    const people = planet.cultures[planet.culture[cell]] ?? planet.cultures[0];
    const town: Burg = {
      id: burgs.length,
      name,
      cell: -1,
      x,
      y,
      culture: planet.culture[cell],
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
  for (const id of edits.removed) {
    const town = burgs[id];
    if (!town || town.capital) continue;
    town.removed = true;
    if (burg[town.cell] === id) burg[town.cell] = 0;
  }
  for (const town of burgs.slice(1)) {
    if (town.cell < 0) continue;
    town.state = state[town.cell];
    town.province = province[town.cell];
  }

  // Realms recounted, roads relaid between the towns that stand.
  const km2 = planet.scale * planet.scale;
  const states = planet.states.map((item) => ({ ...item, cells: 0, area: 0, rural: 0, urban: 0, burgs: 0 }));
  for (let cell = 0; cell < mesh.cells; cell++) {
    if (water[cell]) continue;
    const realm = states[state[cell]];
    realm.cells++;
    realm.area += mesh.area[cell] * km2;
    realm.rural += planet.population[cell];
  }
  for (const town of burgs.slice(1)) {
    if (town.removed) continue;
    states[town.state].urban += town.population;
    states[town.state].burgs++;
  }
  for (const realm of states) realm.area = Math.round(realm.area);
  if (owners.length) {
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
  const routes = buildRoutes(
    planet,
    burgs.map((town) => (town.removed ? { ...town, state: -1, port: false } : town)),
    states,
  );
  return { ...planet, state, province, burg, burgs, states, routes };
}

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
