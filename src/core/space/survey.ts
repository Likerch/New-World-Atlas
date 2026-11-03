// What a galaxy's stars and lanes add up to, read off the generated (and edited) galaxy: every star's main world
// profiled from its real system; the lanes that carry trade, those that are borders or dangers, and the only ways
// through (chokepoints); the powers in depth — ruler and heir, banner, ways, aims, who they fight and whom they trust;
// the powers' sectors; and a grid to find a star by.
import { coatOfArms, flagOf, logoOf, type Emblem } from "../heraldry";
import { makeNpc, WANTS, type Npc, type Role, type Want } from "../people";
import { PriorityQueue } from "../queue";
import { createRng } from "../random";
import type { SystemEdits } from "./edit";
import type { EmpireForm, Galaxy } from "./galaxy";
import type { WorldProfile } from "./profile";
import { generateSystem } from "./system";

export interface LaneInfo {
  /** Trade along it: 0 none, 1 local, 2 a trade route, 3 a main artery. */
  trade: number;
  /** It crosses from one power's space into another's. */
  border: boolean;
  /** 0 safe, 1 risky, 2 deadly. */
  danger: number;
  /** Cut it, and part of the galaxy is cut off. */
  choke: boolean;
}

export type PowerRelation = "war" | "rival" | "cold" | "neutral" | "trade" | "alliance" | "overlord" | "vassal";
export type Ethos = "expansionist" | "isolationist" | "mercantile" | "militarist" | "spiritual" | "scientific" | "xenophobic" | "xenophile" | "decadent" | "egalitarian" | "authoritarian";
const ETHOS: Ethos[] = ["expansionist", "isolationist", "mercantile", "militarist", "spiritual", "scientific", "xenophobic", "xenophile", "decadent", "egalitarian", "authoritarian"];

export interface PowerInfo {
  id: number;
  leader: Npc;
  heir: Npc;
  emblem: Emblem;
  ethos: Ethos[];
  goal: Want;
  /** Settled worlds, people and the best technology it holds. */
  worlds: number;
  people: number;
  tech: number;
  /** How it stands with each other power, by id. */
  relations: Record<number, PowerRelation>;
  /** Powers whose space touches its own. */
  neighbours: number[];
}

export interface Sector {
  id: number;
  /** Named after its chief star. */
  name: string;
  power: number;
  capital: number;
  stars: number;
}

export interface GalaxySurvey {
  worlds: WorldProfile[];
  /** One for each of the galaxy's lanes, in order. */
  lanes: LaneInfo[];
  /** Stars that are the only way through for a part of the galaxy. */
  chokes: boolean[];
  /** By power id; the first is nobody's. */
  powers: PowerInfo[];
  sectors: Sector[];
  /** Each star's sector, -1 for none. */
  sectorOf: number[];
  /** Jumps from each star to its power's capital (99 when it has none). */
  hops: number[];
}

/** Map units per square of the finding grid. */
export const GRID = 100;
const LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ";

/** The grid square a point is in: "F7". */
export function gridCell(x: number, y: number): string {
  return `${LETTERS[Math.max(0, Math.min(LETTERS.length - 1, Math.floor(x / GRID)))]}${Math.max(0, Math.floor(y / GRID)) + 1}`;
}
export const gridLetter = (column: number) => LETTERS[column] ?? "?";

/** Who leads a power of a form. */
const LEADER: Record<EmpireForm, Role> = { empire: "ruler", kingdom: "ruler", republic: "ruler", hegemony: "ruler", collective: "elder", union: "elder", dominion: "ruler", consortium: "boss", corporate: "boss", federation: "ruler", theocracy: "priest", hive: "elder", technocracy: "scholar", machine: "android", "pirate-kingdom": "captain", "nomad-fleet": "captain", junta: "captain", directorate: "boss" };

/** The ways each form leans to. */
const FORM_ETHOS: Partial<Record<EmpireForm, Ethos[]>> = {
  empire: ["expansionist", "authoritarian"],
  kingdom: ["authoritarian", "decadent"],
  republic: ["egalitarian", "mercantile"],
  hegemony: ["militarist", "expansionist"],
  collective: ["egalitarian", "scientific"],
  union: ["egalitarian", "xenophile"],
  dominion: ["authoritarian", "militarist"],
  consortium: ["mercantile"],
  corporate: ["mercantile", "expansionist"],
  federation: ["xenophile", "egalitarian"],
  theocracy: ["spiritual", "xenophobic"],
  hive: ["expansionist", "xenophobic"],
  technocracy: ["scientific"],
  machine: ["scientific", "isolationist"],
  "pirate-kingdom": ["militarist", "decadent"],
  "nomad-fleet": ["isolationist", "mercantile"],
  junta: ["militarist", "authoritarian"],
  directorate: ["mercantile", "authoritarian"],
};

/** A way from a star: to where, how far, which lane (-1 for a gate or a wormhole) and a unique id. */
interface Way {
  to: number;
  cost: number;
  lane: number;
  edge: number;
}

export function surveyGalaxy(galaxy: Galaxy, systemEdits?: (star: number) => SystemEdits | null | undefined): GalaxySurvey {
  const n = galaxy.stars.length;
  const seed = galaxy.params.seed;
  const next: Way[][] = galaxy.stars.map(() => []);
  galaxy.lanes.forEach(([a, b], lane) => {
    const cost = Math.hypot(galaxy.stars[a].x - galaxy.stars[b].x, galaxy.stars[a].y - galaxy.stars[b].y);
    next[a].push({ to: b, cost, lane, edge: lane });
    next[b].push({ to: a, cost, lane, edge: lane });
  });
  // Gates and wormholes are ways too: cheap, and no lane of their own.
  [...(galaxy.gates ?? []), ...galaxy.wormholes].forEach(([a, b], k) => {
    const edge = galaxy.lanes.length + k;
    next[a].push({ to: b, cost: 5, lane: -1, edge });
    next[b].push({ to: a, cost: 5, lane: -1, edge });
  });

  // Jumps from each power's capital to its stars.
  const hops = new Array<number>(n).fill(99);
  for (const empire of galaxy.empires.slice(1)) {
    const seen = new Map([[empire.capital, 0]]);
    for (let queue = [empire.capital]; queue.length; ) {
      const after: number[] = [];
      for (const at of queue)
        for (const { to } of next[at])
          if (!seen.has(to)) {
            seen.set(to, seen.get(at)! + 1);
            after.push(to);
          }
      queue = after;
    }
    for (const star of galaxy.stars) if (star.empire === empire.id) hops[star.id] = seen.get(star.id) ?? 99;
  }
  const worlds = galaxy.stars.map((star) => generateSystem(galaxy, star.id, { hops: hops[star.id], edits: systemEdits?.(star.id) }).profile);

  const lanes = laneInfo(galaxy, worlds, next);
  const { chokeLanes, chokeStars } = chokepoints(n, next);
  chokeLanes.forEach((lane) => (lanes[lane].choke = true));

  // The powers in depth.
  const borders = new Set<string>();
  galaxy.lanes.forEach(([a, b]) => {
    const p = galaxy.stars[a].empire,
      q = galaxy.stars[b].empire;
    if (p && q && p !== q) borders.add(`${Math.min(p, q)}-${Math.max(p, q)}`);
  });
  const powers: PowerInfo[] = galaxy.empires.map((empire) => {
    const own = createRng(seed).fork(`power-${empire.id}`);
    const mine = galaxy.stars.filter((star) => star.empire === empire.id);
    const leans = FORM_ETHOS[empire.form] ?? [];
    const ethos: Ethos[] = [own.chance(0.75) && leans.length ? own.pick(leans) : own.pick(ETHOS)];
    const second = own.pick(ETHOS.filter((item) => item !== ethos[0] && !(item === "xenophobic" && ethos[0] === "xenophile") && !(item === "xenophile" && ethos[0] === "xenophobic")));
    if (own.chance(0.7)) ethos.push(second);
    const key = `${seed}/empire-${empire.id}`;
    const emblem: Emblem = ["consortium", "corporate", "directorate", "machine", "hive"].includes(empire.form)
      ? { kind: "logo", logo: logoOf(key, { machine: empire.form === "machine" || empire.form === "hive" }) }
      : ["empire", "kingdom", "dominion"].includes(empire.form)
        ? { kind: "arms", arms: coatOfArms(key) }
        : { kind: "flag", flag: flagOf(key, { federal: ["federation", "union", "republic"].includes(empire.form), faith: empire.form === "theocracy", future: true }) };
    return {
      id: empire.id,
      leader: makeNpc(`${key}/ruler`, empire.language, LEADER[empire.form] ?? "ruler", { secretChance: 0.55 }),
      heir: makeNpc(`${key}/heir`, empire.language, "heir"),
      emblem,
      ethos,
      goal: own.pick(WANTS),
      worlds: mine.filter((star) => star.settled).length,
      people: mine.reduce((sum, star) => sum + worlds[star.id].people, 0),
      tech: mine.reduce((best, star) => Math.max(best, worlds[star.id].tech), 0),
      relations: {},
      neighbours: [],
    };
  });
  for (let a = 1; a < powers.length; a++)
    for (let b = a + 1; b < powers.length; b++) {
      const touching = borders.has(`${a}-${b}`);
      if (touching) (powers[a].neighbours.push(b), powers[b].neighbours.push(a));
      const roll = createRng(seed).fork(`relation-${a}-${b}`);
      const hostile = [powers[a], powers[b]].some((p) => p.ethos.includes("xenophobic") || p.ethos.includes("militarist"));
      const traders = [powers[a], powers[b]].some((p) => p.ethos.includes("mercantile"));
      const size = [galaxy.empires[a].stars, galaxy.empires[b].stars];
      const lopsided = Math.max(...size) > Math.min(...size) * 3;
      const relation = roll.weighted<PowerRelation>(
        touching
          ? [["war", hostile ? 2 : 0.8], ["rival", 2], ["cold", 1.5], ["neutral", 1], ["trade", traders ? 2.5 : 1.2], ["alliance", 1], ["overlord", lopsided ? 1.5 : 0]]
          : [["neutral", 3], ["trade", traders ? 2 : 1], ["cold", 1], ["alliance", 0.6], ["rival", hostile ? 1.2 : 0.5]],
      );
      // The bigger one is the overlord, the other its vassal; each power's list says what the other is to it.
      const big = size[0] >= size[1] ? a : b;
      powers[a].relations[b] = relation === "overlord" ? (big === a ? "vassal" : "overlord") : relation;
      powers[b].relations[a] = relation === "overlord" ? (big === b ? "vassal" : "overlord") : relation;
    }

  const { sectors, sectorOf } = sectorize(galaxy, worlds, next);
  return { worlds, lanes, chokes: chokeStars, powers, sectors, sectorOf, hops };
}

/** Each lane's border, danger and trade. Trade runs on the cheapest ways between the galaxy's great worlds (capitals,
 * trade hubs, crowded worlds and great ports), each to its nearest few; the lanes most travelled are its arteries. */
function laneInfo(galaxy: Galaxy, worlds: WorldProfile[], next: Way[][]): LaneInfo[] {
  const n = galaxy.stars.length;
  const risk = (id: number) => {
    const star = galaxy.stars[id];
    let level = star.spectral === "BH" || star.spectral === "NS" ? 1 : 0;
    if (star.feature === "pirate-base" || star.feature === "leviathan") level = Math.max(level, 1);
    if (star.feature === "time-rift" || star.feature === "quarantine") level = 2;
    for (const zone of galaxy.zones ?? []) {
      if (zone.kind === "custom") continue;
      const dx = star.x - zone.x,
        dy = star.y - zone.y;
      const u = dx * Math.cos(zone.angle) + dy * Math.sin(zone.angle),
        v = -dx * Math.sin(zone.angle) + dy * Math.cos(zone.angle);
      if ((u / zone.r) ** 2 + (v / (zone.r * zone.squash)) ** 2 > 1) continue;
      level = Math.max(level, zone.kind === "dead-zone" || zone.kind === "plasma-sea" ? 2 : ["ion-storm", "gravity-rift", "radiation-belt", "asteroid-field"].includes(zone.kind) ? 1 : 0);
    }
    if (worlds[id].zone === "red") level = Math.max(level, 1);
    return level;
  };
  const danger = galaxy.stars.map((star) => risk(star.id));
  const lanes: LaneInfo[] = galaxy.lanes.map(([a, b]) => {
    const p = galaxy.stars[a].empire,
      q = galaxy.stars[b].empire;
    return { trade: 0, border: p !== q && (p > 0 || q > 0), danger: Math.max(danger[a], danger[b]), choke: false };
  });
  const great = galaxy.stars.filter((star) => star.capital || star.feature === "trade-hub" || worlds[star.id].population >= 8 || worlds[star.id].starport === "A").map((star) => star.id);
  const traffic = new Float64Array(galaxy.lanes.length);
  const weight = (id: number) => 1 + worlds[id].population + (galaxy.stars[id].capital ? 3 : 0) + (galaxy.stars[id].feature === "trade-hub" ? 3 : 0);
  for (const from of great) {
    // The cheapest ways out from this world; danger makes a lane dearer.
    const best = new Float64Array(n).fill(Infinity);
    const via = new Int32Array(n).fill(-1);
    const prev = new Int32Array(n).fill(-1);
    const queue = new PriorityQueue<number>();
    best[from] = 0;
    queue.push(from, 0);
    for (let entry = queue.pop(); entry; entry = queue.pop()) {
      const [at, cost] = entry;
      if (cost > best[at]) continue;
      for (const { to, cost: step, lane } of next[at]) {
        const total = cost + step * (1 + danger[to] * 1.5);
        if (total >= best[to]) continue;
        best[to] = total;
        via[to] = lane;
        prev[to] = at;
        queue.push(to, total);
      }
    }
    const partners = great.filter((to) => to !== from && Number.isFinite(best[to])).sort((x, y) => best[x] - best[y]).slice(0, 4);
    for (const to of partners) {
      const load = weight(from) * weight(to);
      for (let at = to; at !== from && prev[at] >= 0; at = prev[at]) if (via[at] >= 0) traffic[via[at]] += load;
    }
  }
  const busy = [...traffic].filter((value) => value > 0).sort((x, y) => y - x);
  const cut = (share: number) => busy[Math.floor(busy.length * share)] ?? Infinity;
  const [artery, route] = [cut(0.12), cut(0.45)];
  lanes.forEach((lane, k) => (lane.trade = traffic[k] <= 0 ? 0 : traffic[k] >= artery ? 3 : traffic[k] >= route ? 2 : 1));
  return lanes;
}

/** Lanes and stars that are the only way through: a bridge or a cut vertex of the network whose loss cuts off at
 * least five stars on each side. Walked without recursion, so a big galaxy does not overflow the stack. */
function chokepoints(n: number, next: Way[][]): { chokeLanes: number[]; chokeStars: boolean[] } {
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const size = new Int32Array(n).fill(1);
  const chokeLanes: number[] = [];
  const chokeStars = new Array<boolean>(n).fill(false);
  let time = 0;
  for (let root = 0; root < n; root++) {
    if (disc[root] >= 0) continue;
    // The component's size, for what a cut leaves on the far side.
    let total = 0;
    for (const stack = [root], seen = new Set([root]); stack.length; total++) for (const { to } of next[stack.pop()!]) if (!seen.has(to)) (seen.add(to), stack.push(to));
    const stack: { at: number; via: Way | null; k: number }[] = [{ at: root, via: null, k: 0 }];
    disc[root] = low[root] = time++;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const ways = next[frame.at];
      if (frame.k < ways.length) {
        const way = ways[frame.k++];
        if (way.edge === frame.via?.edge) continue;
        if (disc[way.to] < 0) {
          disc[way.to] = low[way.to] = time++;
          stack.push({ at: way.to, via: way, k: 0 });
        } else low[frame.at] = Math.min(low[frame.at], disc[way.to]);
        continue;
      }
      stack.pop();
      const parent = stack[stack.length - 1];
      if (!parent) continue;
      low[parent.at] = Math.min(low[parent.at], low[frame.at]);
      size[parent.at] += size[frame.at];
      const beyond = size[frame.at];
      if (low[frame.at] > disc[parent.at] && frame.via && frame.via.lane >= 0 && beyond >= 5 && total - beyond >= 5) chokeLanes.push(frame.via.lane);
      if (low[frame.at] >= disc[parent.at] && beyond >= 5 && total - beyond - 1 >= 5) chokeStars[parent.at] = true;
    }
  }
  return { chokeLanes, chokeStars };
}

/** Each power's space cut into sectors of about fourteen stars round its greatest worlds, joined along its lanes. */
function sectorize(galaxy: Galaxy, worlds: WorldProfile[], next: Way[][]): { sectors: Sector[]; sectorOf: number[] } {
  const sectors: Sector[] = [];
  const sectorOf = new Array<number>(galaxy.stars.length).fill(-1);
  for (const empire of galaxy.empires.slice(1)) {
    const mine = galaxy.stars.filter((star) => star.empire === empire.id);
    if (mine.length < 6) continue;
    const want = Math.max(1, Math.round(mine.length / 14));
    const ranked = [empire.capital, ...mine.filter((star) => !star.capital).sort((a, b) => worlds[b.id].people - worlds[a.id].people || a.id - b.id).map((star) => star.id)];
    const seeds: number[] = [];
    for (const gap of [140, 90, 50])
      for (const id of ranked) {
        if (seeds.length >= want) break;
        const star = galaxy.stars[id];
        if (!seeds.includes(id) && seeds.every((other) => Math.hypot(galaxy.stars[other].x - star.x, galaxy.stars[other].y - star.y) > gap)) seeds.push(id);
      }
    const first = sectors.length;
    seeds.forEach((id, k) => sectors.push({ id: first + k, name: galaxy.stars[id].name, power: empire.id, capital: id, stars: 0 }));
    // Out from each sector's chief star along the power's own lanes; a star cut off joins the nearest.
    let queue = seeds.map((id, k) => ((sectorOf[id] = first + k), id));
    while (queue.length) {
      const after: number[] = [];
      for (const at of queue)
        for (const { to } of next[at])
          if (galaxy.stars[to].empire === empire.id && sectorOf[to] < 0) {
            sectorOf[to] = sectorOf[at];
            after.push(to);
          }
      queue = after;
    }
    for (const star of mine)
      if (sectorOf[star.id] < 0) sectorOf[star.id] = seeds.reduce((best, id, k) => (Math.hypot(galaxy.stars[id].x - star.x, galaxy.stars[id].y - star.y) < Math.hypot(galaxy.stars[seeds[best]].x - star.x, galaxy.stars[seeds[best]].y - star.y) ? k : best), 0) + first;
  }
  for (const id of sectorOf) if (id >= 0) sectors[id].stars++;
  return { sectors, sectorOf };
}
