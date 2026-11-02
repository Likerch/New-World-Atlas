// States grow from their capitals along the cheapest ground, slowed by foreign peoples, mountains, wastes and the sea;
// then they take a form and a name, sort out their neighbours, and split into provinces around their towns.
import { paletteColor, shade } from "../color";
import { name } from "../language";
import type { Point } from "../geometry";
import { PriorityQueue } from "../queue";
import type { Rng } from "../random";
import { BIOMES } from "./biomes";
import type { Burg, Culture, Ground, Province, Relation, State, StateForm } from "./model";

function growthCost(g: Ground, cell: number, state: State, culture: Uint16Array, cultures: Culture[]): number {
  if (g.water[cell]) return cultures[state.culture].kind === "naval" ? 120 : 900;
  let cost = culture[cell] === state.culture ? 0 : 100;
  cost += BIOMES[g.biome[cell]].cost;
  const height = g.height[cell];
  cost += height > 70 ? 2000 : height > 60 ? 700 : height > 50 ? 150 : 0;
  if (g.river[cell]) cost += 30;
  return cost;
}

/** The cell deepest inside a region: where its name sits best. */
function poleOf(g: Ground, owner: Uint16Array, id: number, cells: number[]): Point {
  const depth = new Int32Array(g.mesh.cells);
  let ring = cells.filter((cell) => g.mesh.neighbors[cell].some((next) => owner[next] !== id) || g.mesh.edge[cell]);
  for (const cell of ring) depth[cell] = 1;
  let deepest = ring[0] ?? cells[0];
  for (let step = 2; ring.length; step++) {
    const next: number[] = [];
    for (const cell of ring) {
      for (const neighbor of g.mesh.neighbors[cell]) {
        if (owner[neighbor] !== id || depth[neighbor]) continue;
        depth[neighbor] = step;
        next.push(neighbor);
        deepest = neighbor;
      }
    }
    ring = next;
  }
  return [g.mesh.x[deepest], g.mesh.y[deepest]];
}

function formOf(state: State, culture: Culture, burgs: number, cells: number, rng: Rng): [StateForm, string] {
  if (burgs <= 1 && cells < 40) return ["free-city", rng.pick(["free-city", "city-state"])];
  if (culture.kind === "nomadic" && rng.chance(0.6)) return ["horde", rng.pick(["horde", "khaganate", "khanate"])];
  if ((culture.kind === "hunting" || culture.kind === "highland") && rng.chance(0.35)) return ["tribal", rng.pick(["tribes", "chiefdom", "clans"])];
  const form = rng.weighted<StateForm>([["monarchy", 6], ["republic", 2], ["theocracy", 1], ["union", 1]]);
  const big = cells > 600;
  const small = cells < 120;
  switch (form) {
    case "monarchy":
      return ["monarchy", big ? rng.pick(["empire", "kingdom"]) : small ? rng.pick(["duchy", "principality", "march", "county"]) : rng.pick(["kingdom", "kingdom", "grand-duchy", "realm"])];
    case "republic":
      return ["republic", rng.pick(["republic", "commonwealth", "oligarchy", big ? "federation" : "republic"])];
    case "theocracy":
      return ["theocracy", rng.pick(["theocracy", "holy-see", "divine-realm"])];
    default:
      return ["union", rng.pick(["union", "league", "confederation"])];
  }
}

const PROVINCE_FORMS: Record<StateForm, string[]> = {
  monarchy: ["county", "duchy", "barony", "march", "shire"],
  republic: ["district", "canton", "territory", "region"],
  theocracy: ["diocese", "see", "parish"],
  union: ["member-state", "land", "canton"],
  tribal: ["clan-land", "territory"],
  horde: ["ulus", "camp", "yurt"],
  "free-city": ["ward", "district"],
};

export function formStates(g: Ground, culture: Uint16Array, cultures: Culture[], burgs: Burg[], provinceShare: number, rng: Rng) {
  const n = g.mesh.cells;
  const hue = rng.next();
  const states: State[] = [
    { id: 0, name: "", formKey: "wild", form: "tribal", color: "#bbbbbb", capital: 0, culture: 0, expansionism: 0, cells: 0, area: 0, burgs: 0, rural: 0, urban: 0, pole: [0, 0], neighbors: [], relations: {} },
  ];
  for (const capital of burgs.filter((item) => item.capital)) {
    const id = states.length;
    const own = rng.fork(`state-${id}`);
    const people = cultures[capital.culture];
    states.push({
      id,
      name: name(people.language, own, own.chance(0.5) ? "land" : "plain"),
      formKey: "kingdom",
      form: "monarchy",
      color: paletteColor(id, hue, 0.55, 0.6),
      capital: capital.id,
      culture: capital.culture,
      expansionism: own.float(0.9, 1.6) * (people.kind === "nomadic" ? 1.3 : 1),
      cells: 0,
      area: 0,
      burgs: 0,
      rural: 0,
      urban: 0,
      pole: [capital.x, capital.y],
      neighbors: [],
      relations: {},
    });
    capital.state = id;
  }

  const state = new Uint16Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const queue = new PriorityQueue<[number, number]>();
  for (const item of states.slice(1)) {
    const cell = burgs[item.capital].cell;
    best[cell] = 0;
    state[cell] = item.id;
    queue.push([cell, item.id], 0);
  }
  const limit = 20_000;
  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    const [[cell, id], priority] = entry;
    if (priority > best[cell]) continue;
    const owner = states[id];
    for (const next of g.mesh.neighbors[cell]) {
      // A capital is never taken by another state.
      if (best[next] === 0) continue;
      const total = priority + growthCost(g, next, owner, culture, cultures) / owner.expansionism;
      if (total > limit || total >= best[next]) continue;
      best[next] = total;
      state[next] = g.water[next] ? 0 : id;
      queue.push([next, id], total);
    }
  }
  for (let cell = 0; cell < n; cell++) if (g.water[cell]) state[cell] = 0;
  // Enclaves: a lone cell surrounded by one other state joins it.
  for (let cell = 0; cell < n; cell++) {
    if (!state[cell] || best[cell] === 0) continue;
    const around = g.mesh.neighbors[cell].filter((next) => !g.water[next]).map((next) => state[next]);
    if (around.length && around.every((other) => other === around[0]) && around[0] !== state[cell]) state[cell] = around[0];
  }

  // Statistics, neighbours, form, pole.
  const cellsOf: number[][] = states.map(() => []);
  const km2 = g.scale * g.scale;
  for (let cell = 0; cell < n; cell++) {
    if (g.water[cell]) continue;
    cellsOf[state[cell]].push(cell);
    states[state[cell]].area += g.mesh.area[cell] * km2;
  }
  for (const item of burgs.slice(1)) {
    item.state = state[item.cell];
    states[item.state].burgs++;
    states[item.state].urban += item.population;
  }
  for (const item of states.slice(1)) {
    item.cells = cellsOf[item.id].length;
    const neighbors = new Set<number>();
    for (const cell of cellsOf[item.id]) for (const next of g.mesh.neighbors[cell]) if (state[next] && state[next] !== item.id) neighbors.add(state[next]);
    item.neighbors = [...neighbors];
    const own = rng.fork(`form-${item.id}`);
    [item.form, item.formKey] = formOf(item, cultures[item.culture], item.burgs, item.cells, own);
    item.pole = item.cells ? poleOf(g, state, item.id, cellsOf[item.id]) : item.pole;
  }
  states[0].cells = cellsOf[0].length;

  // Diplomacy: kin are friendlier, the big lean on the small, old borders breed grudges.
  for (const item of states.slice(1)) {
    for (const other of item.neighbors) {
      if (item.relations[other]) continue;
      const own = rng.fork(`relation-${Math.min(item.id, other)}-${Math.max(item.id, other)}`);
      const them = states[other];
      const kin = item.culture === them.culture;
      let relation: Relation = own.weighted<Relation>(
        kin ? [["ally", 3], ["friendly", 4], ["neutral", 3], ["suspicion", 1], ["rival", 1]] : [["ally", 1], ["friendly", 2], ["neutral", 4], ["suspicion", 3], ["rival", 2], ["enemy", 2]],
      );
      let back: Relation = relation;
      if (kin && (item.cells > them.cells * 4 || them.cells > item.cells * 4) && own.chance(0.4)) {
        const bigFirst = item.cells > them.cells;
        relation = bigFirst ? "suzerain" : "vassal";
        back = bigFirst ? "vassal" : "suzerain";
      }
      item.relations[other] = relation;
      them.relations[item.id] = back;
    }
  }

  // Provinces: around the capital and the largest towns of each state.
  const province = new Uint16Array(n);
  const provinces: Province[] = [{ id: 0, name: "", formKey: "", state: 0, center: -1, burg: 0, color: "#cccccc", cells: 0, pole: [0, 0] }];
  for (const item of states.slice(1)) {
    const own = rng.fork(`provinces-${item.id}`);
    const towns = burgs.filter((burg) => burg.state === item.id).sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population);
    const count = Math.max(1, Math.min(towns.length, Math.round(towns.length * provinceShare)));
    const centers = towns.slice(0, count);
    const forms = PROVINCE_FORMS[item.form];
    const front = new PriorityQueue<[number, number]>();
    const reach = new Float64Array(n).fill(Infinity);
    for (const center of centers) {
      const id = provinces.length;
      const people = cultures[center.culture];
      provinces.push({
        id,
        name: own.chance(0.6) ? center.name : name(people.language, own, "land"),
        formKey: own.pick(forms),
        state: item.id,
        center: center.cell,
        burg: center.id,
        color: shade(item.color, own.float(-0.25, 0.3)),
        cells: 0,
        pole: [center.x, center.y],
      });
      reach[center.cell] = 0;
      province[center.cell] = id;
      front.push([center.cell, id], 0);
    }
    for (let entry = front.pop(); entry; entry = front.pop()) {
      const [[cell, id], priority] = entry;
      if (priority > reach[cell]) continue;
      for (const next of g.mesh.neighbors[cell]) {
        if (state[next] !== item.id || g.water[next]) continue;
        const total = priority + BIOMES[g.biome[next]].cost / 10 + (g.height[next] > 60 ? 30 : 0) + (g.river[next] && !g.river[cell] ? 15 : 0);
        if (total >= reach[next]) continue;
        reach[next] = total;
        province[next] = id;
        front.push([next, id], total);
      }
    }
    // Detached islands join the nearest province centre of their state.
    for (const cell of cellsOf[item.id]) {
      if (province[cell]) continue;
      let nearest = provinces.length - centers.length;
      let distance = Infinity;
      for (let id = provinces.length - centers.length; id < provinces.length; id++) {
        const center = provinces[id].center;
        const d = (g.mesh.x[center] - g.mesh.x[cell]) ** 2 + (g.mesh.y[center] - g.mesh.y[cell]) ** 2;
        if (d < distance) {
          distance = d;
          nearest = id;
        }
      }
      province[cell] = nearest;
    }
  }
  const provinceCells: number[][] = provinces.map(() => []);
  for (let cell = 0; cell < n; cell++) if (province[cell]) provinceCells[province[cell]].push(cell);
  for (const item of provinces.slice(1)) {
    item.cells = provinceCells[item.id].length;
    if (item.cells) item.pole = poleOf(g, province, item.id, provinceCells[item.id]);
  }
  for (const item of burgs.slice(1)) item.province = province[item.cell];
  return { state, states, province, provinces };
}
