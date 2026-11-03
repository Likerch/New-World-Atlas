// Settlements: capitals on the best land far apart, then towns filling the good ground between them; size from the
// land's wealth, ports on sheltered coasts, walls, citadels, temples and markets by size and rank.
import { name } from "../language";
import type { Rng } from "../random";
import { nearestLand, spacedPicks, suitability } from "./cultures";
import type { Burg, Culture, Ground } from "./model";

export function placeBurgs(g: Ground, culture: Uint16Array, cultures: Culture[], capitalCount: number, townCount: number, rng: Rng, anchors?: [number, number, boolean][]): { burg: Int32Array; burgs: Burg[] } {
  const n = g.mesh.cells;
  const scores = new Float32Array(n);
  let landCells = 0;
  for (let cell = 0; cell < n; cell++) {
    if (g.water[cell]) continue;
    landCells++;
    // Confluences and estuaries draw towns; the map's very edge does not.
    let score = suitability(g, cell);
    if (g.river[cell] && g.coast[cell] === 1) score *= 1.3;
    if (g.mesh.edge[cell]) score *= 0.3;
    scores[cell] = score;
  }
  const cellArea = g.mesh.spacing * g.mesh.spacing;
  let capitals: number[];
  let others: number[];
  if (anchors) {
    // A reshaped world keeps every town, in order, on the dry land nearest where it stood.
    const taken = new Set<number>();
    const at = anchors.map(([x, y, capital]) => {
      const cell = nearestLand(g, x, y, taken);
      taken.add(cell);
      return [cell, capital] as const;
    });
    capitals = at.filter(([, capital]) => capital).map(([cell]) => cell);
    others = at.filter(([, capital]) => !capital).map(([cell]) => cell);
  } else {
    capitals = spacedPicks(g, scores, capitalCount, Math.sqrt((landCells * cellArea) / Math.max(1, capitalCount)) * 0.75, rng.fork("capitals"));
    const towns = townCount > 0 ? townCount : Math.round(landCells / 18);
    others = spacedPicks(g, scores, towns, Math.sqrt((landCells * cellArea) / Math.max(1, towns)) * 0.55, rng.fork("towns"), capitals);
  }

  const burg = new Int32Array(n);
  const burgs: Burg[] = [
    { id: 0, name: "", cell: -1, x: 0, y: 0, culture: 0, state: 0, province: 0, capital: false, port: false, population: 0, walls: false, citadel: false, temple: false, market: false, shanty: false, kind: "generic" },
  ];
  const all = [...capitals, ...others];
  for (let k = 0; k < all.length; k++) {
    const cell = all[k];
    const id = burgs.length;
    const own = rng.fork(`burg-${id}`);
    const capital = k < capitals.length;
    const owner = cultures[culture[cell]] ?? cultures[0];
    // A port needs open water next door: the sea or a large lake.
    const water = g.mesh.neighbors[cell].filter((next) => g.water[next] && (g.features[g.feature[next]].kind === "ocean" || g.features[g.feature[next]].cells > 25));
    const port = water.length > 0 && (capital || owner.kind === "naval" || own.chance(0.65));
    let population = Math.max(0.2, (scores[cell] / 8) * own.gauss(1, 0.35));
    if (capital) population = population * 1.4 + 3;
    if (port) population *= 1.25;
    population = Math.round(population * 100) / 100;
    let x = g.mesh.x[cell];
    let y = g.mesh.y[cell];
    if (port) {
      // Ports sit on the shore, not in the middle of their cell.
      const shore = water[0];
      x = x + (g.mesh.x[shore] - x) * 0.35;
      y = y + (g.mesh.y[shore] - y) * 0.35;
    }
    burgs.push({
      id,
      name: name(owner.language, own, own.chance(0.08) ? "fort" : "town"),
      cell,
      x,
      y,
      culture: owner.id,
      state: 0,
      province: 0,
      capital,
      port,
      population,
      walls: capital ? population > 4 || own.chance(0.6) : population > 12 ? own.chance(0.8) : own.chance(0.15),
      citadel: capital ? own.chance(0.8) : population > 25 && own.chance(0.5),
      temple: population > 10 || own.chance(0.3),
      market: population > 4 || own.chance(0.2),
      shanty: population > 30 && own.chance(0.6),
      kind: port ? "naval" : owner.kind,
    });
    burg[cell] = id;
  }
  return { burg, burgs };
}
