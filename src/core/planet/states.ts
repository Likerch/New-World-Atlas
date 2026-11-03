// States grow from their capitals along the cheapest ground, slowed by foreign peoples, mountains, wastes and the sea;
// then they take a form and a name, sort out their neighbours, and split into provinces around their towns.
import { paletteColor, shade } from "../color";
import { name } from "../language";
import type { Point } from "../geometry";
import { PriorityQueue } from "../queue";
import type { Rng } from "../random";
import { ageOf, isClassic, settingOf, type EraId, type Rule, type Setting } from "../setting";
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
export function poleOf(g: Ground, owner: Uint16Array, id: number, cells: number[]): Point {
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

/** The forms a realm of each age may take, by weight, and the titles each form bears there. */
type Titles = (big: boolean, small: boolean, rng: Rng) => string;
const AGE_FORMS: Record<EraId, { single: [StateForm, string[]]; forms: [StateForm, number, Titles][] }> = {
  stone: { single: ["tribal", ["band", "tribes", "clans"]], forms: [["tribal", 10, (big, _small, rng) => rng.pick(big ? ["tribes", "chiefdom"] : ["band", "clans", "tribes", "chiefdom"])]] },
  ancient: {
    single: ["free-city", ["polis", "city-state"]],
    forms: [
      ["monarchy", 5, (big, small, rng) => (big ? rng.pick(["empire", "kingdom"]) : small ? rng.pick(["principality", "satrapy"]) : "kingdom")],
      ["republic", 2, (_big, _small, rng) => rng.pick(["republic", "oligarchy"])],
      ["theocracy", 1.5, (_big, _small, rng) => rng.pick(["temple-state", "theocracy"])],
      ["union", 1, (_big, _small, rng) => rng.pick(["league", "confederation"])],
      ["tribal", 2, (_big, _small, rng) => rng.pick(["tribes", "chiefdom"])],
    ],
  },
  medieval: {
    single: ["free-city", ["free-city", "city-state"]],
    forms: [
      ["monarchy", 6, (big, small, rng) => (big ? rng.pick(["empire", "kingdom"]) : small ? rng.pick(["duchy", "principality", "march", "county"]) : rng.pick(["kingdom", "kingdom", "grand-duchy", "realm"]))],
      ["republic", 2, (big, _small, rng) => rng.pick(["republic", "commonwealth", "oligarchy", big ? "federation" : "republic"])],
      ["theocracy", 1, (_big, _small, rng) => rng.pick(["theocracy", "holy-see", "divine-realm"])],
      ["union", 1, (_big, _small, rng) => rng.pick(["union", "league", "confederation"])],
    ],
  },
  renaissance: {
    single: ["free-city", ["free-city", "city-state", "merchant-republic"]],
    forms: [
      ["monarchy", 6, (big, small, rng) => (big ? rng.pick(["empire", "kingdom"]) : small ? rng.pick(["duchy", "principality", "electorate"]) : rng.pick(["kingdom", "grand-duchy", "electorate"]))],
      ["republic", 2.5, (_big, _small, rng) => rng.pick(["republic", "merchant-republic", "commonwealth", "oligarchy"])],
      ["theocracy", 0.8, (_big, _small, rng) => rng.pick(["holy-see", "theocracy"])],
      ["union", 1, (_big, _small, rng) => rng.pick(["confederation", "league", "united-provinces"])],
    ],
  },
  industrial: {
    single: ["free-city", ["free-city", "city-state"]],
    forms: [
      ["monarchy", 5, (big, small, rng) => (big ? "empire" : small ? rng.pick(["grand-duchy", "principality"]) : "kingdom")],
      ["republic", 4, (big, _small, rng) => (big ? rng.pick(["republic", "federation"]) : "republic")],
      ["union", 1.5, (_big, _small, rng) => rng.pick(["confederation", "union"])],
      ["dictatorship", 1, (_big, _small, rng) => rng.pick(["dictatorship", "directorate"])],
      ["colony", 1.5, (_big, _small, rng) => rng.pick(["colony", "protectorate", "dominion"])],
      ["theocracy", 0.3, () => "theocracy"],
    ],
  },
  modern: {
    single: ["free-city", ["city-state", "principality"]],
    forms: [
      ["republic", 7, (big, _small, rng) => (big ? rng.pick(["federal-republic", "republic"]) : rng.pick(["republic", "republic", "peoples-republic"]))],
      ["monarchy", 2, (_big, _small, rng) => rng.pick(["kingdom", "emirate", "sultanate"])],
      ["union", 2, (_big, _small, rng) => rng.pick(["federation", "union", "commonwealth"])],
      ["dictatorship", 2, (_big, _small, rng) => rng.pick(["dictatorship", "junta", "peoples-republic"])],
      ["theocracy", 0.6, () => "theocratic-republic"],
      ["colony", 0.5, (_big, _small, rng) => rng.pick(["territory", "protectorate"])],
      ["corporate", 0.3, () => "company-state"],
    ],
  },
  cyberpunk: {
    single: ["free-city", ["free-port", "sprawl", "city-state"]],
    forms: [
      ["corporate", 5, (_big, _small, rng) => rng.pick(["corporate-state", "zaibatsu", "free-trade-zone", "conglomerate"])],
      ["republic", 2, (_big, _small, rng) => rng.pick(["republic", "free-state"])],
      ["union", 1.5, (_big, _small, rng) => rng.pick(["federation", "bloc"])],
      ["dictatorship", 2, (_big, _small, rng) => rng.pick(["junta", "security-state"])],
      ["machine", 0.5, () => "ai-directorate"],
      ["theocracy", 0.3, () => "theocratic-republic"],
    ],
  },
  "far-future": {
    single: ["free-city", ["city-state", "free-port"]],
    forms: [
      ["union", 4, (_big, _small, rng) => rng.pick(["federation", "commonwealth", "hegemony", "concord"])],
      ["monarchy", 2, (_big, _small, rng) => rng.pick(["imperium", "dominion"])],
      ["republic", 2, (_big, _small, rng) => rng.pick(["republic", "technocracy"])],
      ["corporate", 2, (_big, _small, rng) => rng.pick(["conglomerate", "combine"])],
      ["machine", 2, (_big, _small, rng) => rng.pick(["ai-directorate", "synthetic-collective", "hive-mind"])],
      ["colony", 2, (_big, _small, rng) => rng.pick(["colony", "outpost", "mandate"])],
    ],
  },
  "post-apocalypse": {
    single: ["free-city", ["settlement", "enclave"]],
    forms: [
      ["warlord", 5, (_big, _small, rng) => rng.pick(["warlord-domain", "raider-clans", "warband"])],
      ["free-city", 3, (_big, _small, rng) => rng.pick(["settlement", "enclave"])],
      ["republic", 1, (_big, _small, rng) => rng.pick(["remnant-republic", "council"])],
      ["theocracy", 1, () => "cult-state"],
      ["dictatorship", 1, () => "junta"],
      ["tribal", 2, (_big, _small, rng) => rng.pick(["tribes", "clans"])],
    ],
  },
};
const BIAS: Record<Rule, Partial<Record<StateForm, number>>> = {
  any: {},
  crowns: { monarchy: 4 },
  people: { republic: 3, union: 3, "free-city": 2 },
  faith: { theocracy: 6 },
  force: { dictatorship: 4, warlord: 4, horde: 4, monarchy: 1.5 },
  trade: { corporate: 4, "free-city": 2, republic: 1.5 },
  machines: { machine: 6 },
};

/** A realm's form in a world that is not the classic one: by its age, the rule that prevails and how common magic is. */
function settingForm(setting: Setting, culture: Culture, burgs: number, cells: number, rng: Rng): [StateForm, string] {
  const age = ageOf(setting);
  const plan = AGE_FORMS[age];
  if (burgs <= 1 && cells < 40) return [plan.single[0], rng.pick(plan.single[1])];
  const early = setting.tech < 5 || age === "post-apocalypse";
  if (early && culture.kind === "nomadic" && rng.chance(0.6)) return age === "post-apocalypse" ? ["warlord", "raider-clans"] : ["horde", rng.pick(["horde", "khaganate", "khanate"])];
  if (setting.tech >= 1 && setting.tech < 3.5 && (culture.kind === "hunting" || culture.kind === "highland") && rng.chance(0.35)) return ["tribal", rng.pick(["tribes", "chiefdom", "clans"])];
  const big = cells > 600;
  const small = cells < 120;
  const bias = BIAS[setting.rule];
  const options = plan.forms.map(([form, weight, titles]): [[StateForm, Titles], number] => [[form, titles], weight * (bias[form] ?? 1)]);
  // Trade before the age of companies means merchant republics.
  if (setting.rule === "trade" && setting.tech < 5) for (const option of options) if (option[0][0] === "republic") option[1] *= 3;
  if (setting.magic >= 2) options.push([["magocracy", (_big, _small, own) => own.pick(["magocracy", "arcane-realm", "mage-council"])], setting.magic >= 3 ? 2.5 : 1]);
  const [form, titles] = rng.weighted(options);
  return [form, titles(big, small, rng)];
}

const PROVINCE_FORMS: Record<StateForm, string[]> = {
  monarchy: ["county", "duchy", "barony", "march", "shire"],
  republic: ["district", "canton", "territory", "region"],
  theocracy: ["diocese", "see", "parish"],
  union: ["member-state", "land", "canton"],
  tribal: ["clan-land", "territory"],
  horde: ["ulus", "camp", "yurt"],
  "free-city": ["ward", "district"],
  magocracy: ["domain", "district"],
  dictatorship: ["province", "region", "military-district"],
  corporate: ["sector", "zone", "division"],
  machine: ["sector", "node", "grid"],
  colony: ["district", "territory"],
  warlord: ["turf", "domain", "camp"],
};
/** Later ages call the old realms' lands provinces, regions and states, earlier ones satrapies and nomes. */
const AGE_PROVINCES: Partial<Record<EraId, Partial<Record<StateForm, string[]>>>> = {
  ancient: { monarchy: ["satrapy", "province", "nome"], republic: ["province", "district"], theocracy: ["nome", "temple-land"] },
  industrial: { monarchy: ["province", "county", "region"], republic: ["province", "department", "district"], union: ["state", "land", "member-state"] },
  modern: { monarchy: ["province", "region"], republic: ["region", "province", "department", "district"], union: ["state", "land", "republic"], theocracy: ["province", "region"] },
  cyberpunk: { republic: ["district", "zone", "region"], union: ["state", "zone"] },
  "far-future": { monarchy: ["sector", "dominion", "province"], republic: ["sector", "district"], union: ["state", "sector", "member-state"] },
  "post-apocalypse": { theocracy: ["parish", "domain"], republic: ["district", "ward"], dictatorship: ["military-district", "zone"], "free-city": ["ward", "camp"] },
};

/** Realms a lived history hands over: who holds each cell, and each realm's name, people and seat (a burg id). */
export interface GivenRealms {
  owner: Uint16Array;
  realms: { polity: number; name: string; culture: number; capital: number }[];
  /** How two of them stand, by their history ids. */
  relation: (a: number, b: number) => Relation;
}

export function formStates(g: Ground, culture: Uint16Array, cultures: Culture[], burgs: Burg[], provinceShare: number, rng: Rng, given?: GivenRealms) {
  const n = g.mesh.cells;
  const setting = settingOf(g.params.setting);
  const classic = isClassic(setting);
  const hue = rng.next();
  const states: State[] = [
    { id: 0, name: "", formKey: "wild", form: "tribal", color: "#bbbbbb", capital: 0, culture: 0, expansionism: 0, cells: 0, area: 0, burgs: 0, rural: 0, urban: 0, pole: [0, 0], neighbors: [], relations: {} },
  ];
  const polityOf: number[] = [0];
  for (const capital of burgs.filter((item) => item.capital)) {
    const id = states.length;
    const own = rng.fork(`state-${id}`);
    const people = cultures[capital.culture];
    const realm = given?.realms.find((item) => item.capital === capital.id);
    polityOf[id] = realm?.polity ?? 0;
    states.push({
      id,
      name: realm ? realm.name : name(people.language, own, own.chance(0.5) ? "land" : "plain"),
      ...(realm ? { polity: realm.polity } : {}),
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
  // A lived history has drawn the borders already.
  const stateOf = new Map(polityOf.map((polity, id) => [polity, id]));
  if (given) for (let cell = 0; cell < n; cell++) state[cell] = g.water[cell] ? 0 : stateOf.get(given.owner[cell]) ?? 0;
  for (const item of given ? [] : states.slice(1)) {
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
  for (let cell = 0; cell < (given ? 0 : n); cell++) {
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
    [item.form, item.formKey] = classic ? formOf(item, cultures[item.culture], item.burgs, item.cells, own) : settingForm(setting, cultures[item.culture], item.burgs, item.cells, own);
    item.pole = item.cells ? poleOf(g, state, item.id, cellsOf[item.id]) : item.pole;
  }
  states[0].cells = cellsOf[0].length;

  // Diplomacy: kin are friendlier, the big lean on the small, old borders breed grudges.
  for (const item of states.slice(1)) {
    for (const other of item.neighbors) {
      if (item.relations[other]) continue;
      if (given) {
        item.relations[other] = given.relation(polityOf[item.id], polityOf[other]);
        states[other].relations[item.id] = item.relations[other];
        continue;
      }
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
    const forms = AGE_PROVINCES[ageOf(setting)]?.[item.form] ?? PROVINCE_FORMS[item.form];
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
