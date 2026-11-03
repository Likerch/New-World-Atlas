// A world's history, lived year by year before its map is drawn. Peoples found realms at their cradles; towns grow
// to what their land can feed and send settlers on; realms reach as far as their towns' weight carries, meet, make
// friends and enemies, fight battles, besiege and take towns, sack and raze them; rulers age, die and are followed by
// heirs or usurpers, and civil wars split realms in two; plague, famine, fire and the mountains themselves strike.
// The map shows how it all ended; the history keeps how it got there: every town ever founded (and when and how it
// fell), every realm, every ruler and captain of note, every event, and the borders as they stood every half-century.
//
// The years are lived in order, each from a stream of its own, so a longer history begins with the same years: "fifty
// years later" is the same world, lived on.
import { paletteColor } from "../color";
import { name, shiftLanguage, type Language } from "../language";
import { PriorityQueue } from "../queue";
import { createRng, type Rng } from "../random";
import { spacedPicks, suitability } from "./cultures";
import type { Burg, Culture, Ground, Marker, Planet, Relation, State } from "./model";
import { buildRoutes } from "./routes";
import { poleOf } from "./states";

export type FallCause = "conquest" | "sack" | "abandoned" | "plague" | "eruption";

/** A town of the history; its id is the planet's burg id (a fallen town keeps its number, marked removed). */
export interface PastTown {
  id: number;
  name: string;
  cell: number;
  culture: number;
  /** Who holds it now (or held it when it fell). */
  polity: number;
  founded: number;
  fell?: number;
  cause?: FallCause;
  /** Thousands of people: now, and at its height. */
  population: number;
  peak: number;
  walls: boolean;
  port: boolean;
  /** Every change of master: [year, polity]. */
  owners: [number, number][];
}

/** A realm of the history, from its founding to its fall (if it fell). */
export interface Polity {
  id: number;
  name: string;
  culture: number;
  language: Language;
  founded: number;
  fell?: number;
  /** Its seat, by town id. */
  capital: number;
  dynasty: string;
  /** Rulers in order, by figure id. */
  rulers: number[];
  /** The realm it broke away from. */
  parent?: number;
  color: string;
  /** Its seats over time: [year, town]. */
  seats: [number, number][];
}

export type FigureRole = "ruler" | "general" | "founder" | "rebel";

export interface Figure {
  id: number;
  name: string;
  born: number;
  died?: number;
  role: FigureRole;
  polity: number;
  /** Reigns or battles won: who is remembered. */
  renown: number;
  fate?: "age" | "battle" | "plague" | "murder";
}

export type EventKind = "founding" | "settled" | "war" | "peace" | "battle" | "siege" | "conquest" | "sack" | "fall" | "crowned" | "usurped" | "rebellion" | "alliance" | "plague" | "famine" | "eruption" | "fire" | "abandoned";

export interface PastEvent {
  id: number;
  year: number;
  kind: EventKind;
  /** Where: a town (by id) and/or a cell. */
  town?: number;
  cell?: number;
  /** Who: the realms in the order the event names them (the victor first), and the people involved. */
  polities: number[];
  figures: number[];
  /** The fallen, the dead or the people, when the event counts them. */
  count?: number;
}

export interface History {
  /** The present year: the history begins in year 1. */
  years: number;
  towns: PastTown[];
  polities: Polity[];
  figures: Figure[];
  events: PastEvent[];
  /** Borders as they stood every fifty years and today: the realm of each cell, and each town's size by its id. */
  eras: { year: number; owner: Uint16Array; sizes: Float32Array }[];
  /** The standing between realms at the end, -100 (war) to 100 (alliance), keyed "a-b" with a < b. */
  relations: Record<string, number>;
  /** Wars still being fought at the end. */
  wars: [number, number][];
}

/** Realms may change every so many years; finer would cost time and change little. */
const BORDER_YEARS = 5;
const ERA_YEARS = 50;

export function simulateHistory(g: Ground, culture: Uint16Array, cultures: Culture[], options: { years: number; polities: number; tech: number }, rng: Rng, progress?: (share: number) => void): History {
  const { mesh, water } = g;
  const n = mesh.cells;
  const years = Math.max(1, Math.round(options.years));
  const setup = rng.fork("setup");

  // The land's worth: what a town there and its fields can feed.
  const room = new Float32Array(n);
  let landCells = 0;
  for (let cell = 0; cell < n; cell++) {
    if (water[cell]) continue;
    landCells++;
    let score = suitability(g, cell);
    if (g.river[cell] && g.coast[cell] === 1) score *= 1.3;
    if (mesh.edge[cell]) score *= 0.3;
    room[cell] = score;
  }
  const capacity = new Float32Array(n);
  for (let cell = 0; cell < n; cell++) {
    if (!room[cell]) continue;
    let around = 0;
    for (const next of mesh.neighbors[cell]) around += room[next];
    capacity[cell] = (room[cell] + around * 0.35) / 16;
  }
  const seaside = (cell: number) => mesh.neighbors[cell].some((next) => water[next] && (g.features[g.feature[next]].kind === "ocean" || g.features[g.feature[next]].cells > 25));
  const landmass = (cell: number) => g.feature[cell];
  const gap = mesh.spacing * 2.2;
  const growth = options.tech < 2 ? 0.02 : options.tech < 5 ? 0.03 : 0.04;
  // Peaks that may wake.
  const volcanoes = Array.from({ length: n }, (_, cell) => cell).filter((cell) => !water[cell] && g.height[cell] > 68 && mesh.neighbors[cell].every((next) => g.height[next] <= g.height[cell]));

  const towns: PastTown[] = [{ id: 0, name: "", cell: -1, culture: 0, polity: 0, founded: 0, population: 0, peak: 0, walls: false, port: false, owners: [] }];
  const polities: Polity[] = [{ id: 0, name: "", culture: 0, language: cultures[0].language, founded: 0, capital: 0, dynasty: "", rulers: [], color: "#999999", seats: [] }];
  const figures: Figure[] = [{ id: 0, name: "", born: 0, role: "ruler", polity: 0, renown: 0 }];
  const events: PastEvent[] = [];
  const eras: History["eras"] = [];
  const tongues = cultures.map((item) => ({ ...item.language }));
  const hue = setup.next();
  // How close a town stands to others: a site within the gap of a town is taken.
  const crowd = new Uint16Array(n);
  const townAt = new Int32Array(n);
  const near = (cell: number) => {
    const out: number[] = [];
    const seen = new Set([cell]);
    for (let ring = [cell]; ring.length; ) {
      const next: number[] = [];
      for (const c of ring) {
        if (Math.hypot(mesh.x[c] - mesh.x[cell], mesh.y[c] - mesh.y[cell]) > gap) continue;
        out.push(c);
        for (const m of mesh.neighbors[c]) if (!seen.has(m)) (seen.add(m), next.push(m));
      }
      ring = next;
    }
    return out;
  };
  const alive = (town: PastTown) => town.id > 0 && town.fell === undefined;
  const log = (event: Omit<PastEvent, "id">) => {
    events.push({ id: events.length, ...event });
    return events.length - 1;
  };

  const person = (polity: Polity, role: FigureRole, born: number, own: Rng, family = polity.dynasty) => {
    const figure: Figure = { id: figures.length, name: `${name({ ...polity.language }, own, "person")} ${family}`, born, role, polity: polity.id, renown: 0 };
    figures.push(figure);
    return figure;
  };
  const settle = (cell: number, polity: Polity, year: number, own: Rng, population: number) => {
    const town: PastTown = { id: towns.length, name: name(polity.language, own, own.chance(0.08) ? "fort" : "town"), cell, culture: culture[cell] || polity.culture, polity: polity.id, founded: year, population, peak: population, walls: false, port: seaside(cell), owners: [[year, polity.id]] };
    towns.push(town);
    townAt[cell] = town.id;
    for (const c of near(cell)) crowd[c]++;
    return town;
  };
  const found = (cell: number, year: number, own: Rng, parent?: Polity, language?: Language) => {
    const people = culture[cell] || parent?.culture || 1;
    const lang = language ?? tongues[people] ?? tongues[1];
    const polity: Polity = { id: polities.length, name: name(lang, own, "land"), culture: people, language: lang, founded: year, capital: 0, dynasty: name({ ...lang }, own, "person"), rulers: [], ...(parent ? { parent: parent.id } : {}), color: paletteColor(polities.length, hue, 0.6, 0.6), seats: [] };
    polities.push(polity);
    return polity;
  };
  // A new ruler: an heir of the house, or a usurper who founds a house of their own.
  const crown = (polity: Polity, year: number, own: Rng, heir: boolean) => {
    if (!heir && polity.rulers.length) polity.dynasty = name({ ...polity.language }, own, "person");
    const ruler = person(polity, "ruler", year - own.int(heir ? 14 : 22, heir ? 40 : 50), own);
    polity.rulers.push(ruler.id);
    return ruler;
  };
  const fall = (town: PastTown, year: number, cause: FallCause) => {
    town.fell = year;
    town.cause = cause;
    townAt[town.cell] = 0;
    for (const c of near(town.cell)) crowd[c]--;
  };

  // The cradles: the first realms, at the best land of each people, far apart.
  const cradles = spacedPicks(g, room.map((value, cell) => (culture[cell] ? value : 0)), Math.max(2, Math.round(options.polities * 0.7)), Math.sqrt((landCells * mesh.spacing * mesh.spacing) / Math.max(1, options.polities)) * 0.8, setup.fork("cradles"));
  for (const cell of cradles) {
    const own = setup.fork(`cradle-${cell}`);
    const polity = found(cell, 1, own);
    const seat = settle(cell, polity, 1, own, own.float(0.8, 2));
    polity.capital = seat.id;
    polity.seats.push([1, seat.id]);
    const founder = crown(polity, 1, own, false);
    founder.role = "founder";
    log({ year: 1, kind: "founding", town: seat.id, cell, polities: [polity.id], figures: [founder.id] });
  }

  // The realm of each cell: towns reach out by their weight, slowed by hills, forest and desert; water stops them.
  let owner = new Uint16Array(n);
  let pairs = new Map<string, number>();
  const terrain = (cell: number) => 1 + (g.height[cell] > 60 ? 2 : g.height[cell] > 45 ? 0.8 : 0) + (room[cell] < 15 ? 1.2 : 0);
  const borders = () => {
    const next = new Uint16Array(n);
    const best = new Float64Array(n).fill(Infinity);
    const queue = new PriorityQueue<[number, number, number]>();
    for (const town of towns) {
      if (!alive(town)) continue;
      const weight = Math.sqrt(town.population) + 0.6 + (polities[town.polity].capital === town.id ? 0.8 : 0);
      best[town.cell] = 0;
      next[town.cell] = town.polity;
      queue.push([town.cell, town.polity, weight], 0);
    }
    for (let entry = queue.pop(); entry; entry = queue.pop()) {
      const [[cell, id, weight], cost] = entry;
      if (cost > best[cell]) continue;
      for (const m of mesh.neighbors[cell]) {
        if (water[m]) continue;
        const total = cost + terrain(m) / weight;
        if (total > 7 || total >= best[m]) continue;
        best[m] = total;
        next[m] = id;
        queue.push([m, id, weight], total);
      }
    }
    owner = next;
    pairs = new Map();
    for (let cell = 0; cell < n; cell++) {
      if (!owner[cell]) continue;
      for (const m of mesh.neighbors[cell]) {
        if (!owner[m] || owner[m] === owner[cell] || owner[cell] > owner[m]) continue;
        pairs.set(`${owner[cell]}-${owner[m]}`, m);
      }
    }
  };
  borders();

  const relations = new Map<string, number>();
  const keyOf = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const allied = new Set<string>();
  const wars = new Map<string, { attacker: number; defender: number; start: number; score: number }>();
  const holdings = () => {
    const of = polities.map((): PastTown[] => []);
    for (const town of towns) if (alive(town)) of[town.polity].push(town);
    return of;
  };
  const strength = (list: PastTown[]) => list.reduce((sum, town) => sum + town.population, 0);
  const distance = (a: number, b: number) => Math.hypot(mesh.x[a] - mesh.x[b], mesh.y[a] - mesh.y[b]);
  // A realm whose last town is lost is gone; its seat moves when its seat is lost.
  const reseat = (polity: Polity, list: PastTown[], year: number) => {
    const left = list.filter((town) => alive(town) && town.polity === polity.id);
    if (!left.length) {
      if (polity.fell === undefined) {
        polity.fell = year;
        log({ year, kind: "fall", polities: [polity.id], figures: [] });
        for (const [key, war] of wars) if (war.attacker === polity.id || war.defender === polity.id) wars.delete(key);
      }
      return;
    }
    if (!left.some((town) => town.id === polity.capital)) {
      polity.capital = left.reduce((best, town) => (town.population > best.population ? town : best)).id;
      polity.seats.push([year, polity.capital]);
    }
  };

  for (let year = 2; year <= years; year++) {
    const yr = rng.fork(`year-${year}`);
    let holds = holdings();

    // Towns grow towards what their land can feed; crowded ones send settlers to found new towns.
    for (const town of towns) {
      if (!alive(town)) continue;
      const seat = polities[town.polity].capital === town.id;
      const fed = capacity[town.cell] * (seat ? 1.5 : 1) * (town.port ? 1.25 : 1) + 0.2;
      const atWar = [...wars.values()].some((war) => war.attacker === town.polity || war.defender === town.polity);
      town.population = Math.max(0, town.population + growth * (atWar ? 0.5 : 1) * town.population * (1 - town.population / fed) + yr.float(-0.004, 0.004) * town.population);
      town.peak = Math.max(town.peak, town.population);
      if (town.population < fed * 0.35 || !yr.chance(0.1)) continue;
      // A site near home, in the realm's own land or no one's; ports may send ships to other shores.
      const sites: number[] = [];
      const seen = new Set([town.cell]);
      for (let ring = [town.cell], step = 0; step < 6; step++) {
        const next: number[] = [];
        for (const c of ring)
          for (const m of mesh.neighbors[c]) {
            if (seen.has(m) || water[m]) continue;
            seen.add(m);
            next.push(m);
            if (!crowd[m] && room[m] > 10 && (!owner[m] || owner[m] === town.polity)) sites.push(m);
          }
        ring = next;
      }
      if (!sites.length && town.port && yr.chance(0.2)) {
        for (let attempt = 0; attempt < 30; attempt++) {
          const c = yr.int(0, n - 1);
          if (!water[c] && !crowd[c] && !owner[c] && room[c] > 20 && seaside(c)) {
            sites.push(c);
            break;
          }
        }
      }
      if (!sites.length) continue;
      const site = sites.reduce((best, c) => (room[c] > room[best] ? c : best));
      const settlers = Math.min(town.population * 0.15, 0.6);
      town.population -= settlers;
      const daughter = settle(site, polities[town.polity], year, yr.fork(`town-${towns.length}`), settlers);
      log({ year, kind: "settled", town: daughter.id, cell: site, polities: [town.polity], figures: [] });
    }

    // New peoples rise on empty land now and then, so the world keeps its many realms.
    const living = polities.filter((polity) => polity.id && polity.fell === undefined).length;
    if (living < options.polities * 1.2 && yr.chance(0.04)) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const c = yr.int(0, n - 1);
        if (water[c] || crowd[c] || owner[c] || room[c] < 25 || !culture[c]) continue;
        const own = yr.fork(`rise-${c}`);
        const polity = found(c, year, own);
        const seat = settle(c, polity, year, own, own.float(0.5, 1.2));
        polity.capital = seat.id;
        polity.seats.push([year, seat.id]);
        const founder = crown(polity, year, own, false);
        founder.role = "founder";
        log({ year, kind: "founding", town: seat.id, cell: c, polities: [polity.id], figures: [founder.id] });
        break;
      }
    }

    if (year % BORDER_YEARS === 0) borders();
    holds = holdings();

    // Neighbours warm or cool to each other: kin closer, strangers warier, every border a grievance.
    for (const pair of pairs.keys()) {
      const [a, b] = pair.split("-").map(Number);
      if (polities[a].fell !== undefined || polities[b].fell !== undefined) continue;
      const kin = polities[a].culture === polities[b].culture;
      const now = (relations.get(pair) ?? (kin ? 20 : -5)) + (kin ? 0.8 : -0.6) - 0.3 + yr.gauss(0, 4);
      relations.set(pair, Math.max(-100, Math.min(100, now)));
      if (now > 55 && !allied.has(pair) && yr.chance(0.05)) {
        allied.add(pair);
        log({ year, kind: "alliance", polities: [a, b], figures: [] });
      } else if (now < 25) allied.delete(pair);
      if (wars.has(pair) || allied.has(pair) || now > -35 || !yr.chance(0.06)) continue;
      const [first, second] = strength(holds[a]) >= strength(holds[b]) ? [a, b] : [b, a];
      if (strength(holds[first]) < 0.6 * strength(holds[second])) continue;
      wars.set(pair, { attacker: first, defender: second, start: year, score: 0 });
      log({ year, kind: "war", polities: [first, second], figures: [] });
    }

    // Wars: a battle a year on the border; a side that keeps winning lays siege to the other's nearest town.
    for (const [pair, war] of wars) {
      const att = polities[war.attacker];
      const def = polities[war.defender];
      if (att.fell !== undefined || def.fell !== undefined) {
        wars.delete(pair);
        continue;
      }
      if (yr.chance(0.8)) {
        const armies = [strength(holds[att.id]) * 0.04 * yr.float(0.6, 1.4), strength(holds[def.id]) * 0.04 * yr.float(0.6, 1.4)];
        const won = armies[0] >= armies[1] ? 0 : 1;
        const [winner, loser] = won === 0 ? [att, def] : [def, att];
        const fallen = Math.round((armies[0] + armies[1]) * 1000 * yr.float(0.05, 0.25));
        const where = pairs.get(pair) ?? towns[loser.capital].cell;
        // A captain may make a name, and a king may fall on the field.
        const captains: number[] = [];
        if (yr.chance(0.3)) {
          const captain = person(winner, "general", year - yr.int(25, 50), yr.fork("captain"), name({ ...winner.language }, yr.fork("captain-family"), "person"));
          captain.renown = 1;
          captains.push(captain.id);
        }
        const fallenKing = figures[loser.rulers[loser.rulers.length - 1]];
        if (fallenKing && fallenKing.died === undefined && yr.chance(0.05)) {
          fallenKing.died = year;
          fallenKing.fate = "battle";
          captains.push(fallenKing.id);
        }
        log({ year, kind: "battle", cell: where, polities: [winner.id, loser.id], figures: captains, count: fallen });
        for (const town of [...holds[att.id], ...holds[def.id]]) if (distance(town.cell, where) < gap * 2.5) town.population *= yr.float(0.95, 0.99);
        war.score += won === 0 ? 1 : -1;
        if (Math.abs(war.score) >= 2) {
          const besieger = war.score > 0 ? att : def;
          const besieged = war.score > 0 ? def : att;
          const targets = holds[besieged.id].filter(alive);
          if (targets.length) {
            const seat = towns[besieger.capital];
            const target = targets.reduce((best, town) => (distance(town.cell, seat.cell) < distance(best.cell, seat.cell) ? town : best));
            const odds = 0.35 + 0.1 * Math.abs(war.score) - (target.walls ? 0.2 : 0) - (besieged.capital === target.id ? 0.1 : 0);
            log({ year, kind: "siege", town: target.id, cell: target.cell, polities: [besieger.id, besieged.id], figures: [] });
            target.walls = true;
            if (yr.chance(odds)) {
              target.polity = besieger.id;
              target.owners.push([year, besieger.id]);
              log({ year, kind: "conquest", town: target.id, cell: target.cell, polities: [besieger.id, besieged.id], figures: [] });
              // Strangers may sack what they take; a small town sacked is razed.
              if (yr.chance(target.culture !== besieger.culture ? 0.4 : 0.1)) {
                const dead = Math.round(target.population * 650);
                target.population *= 0.35;
                log({ year, kind: "sack", town: target.id, cell: target.cell, polities: [besieger.id, besieged.id], figures: [], count: dead });
                if (target.population < 0.6 && besieged.capital !== target.id) fall(target, year, "sack");
              }
              reseat(besieged, holds[besieged.id], year);
              borders();
              holds = holdings();
            }
            war.score = 0;
          }
        }
      }
      if (wars.has(pair) && yr.chance(0.1 + (year - war.start) * 0.01)) {
        wars.delete(pair);
        relations.set(pair, -10);
        log({ year, kind: "peace", polities: [att.id, def.id], figures: [] });
      }
    }

    // Rulers age and die; an heir follows, or a usurper — and a usurper's realm may split in civil war.
    for (const polity of polities) {
      if (!polity.id || polity.fell !== undefined) continue;
      const ruler = figures[polity.rulers[polity.rulers.length - 1]];
      const age = year - ruler.born;
      if (ruler.died === undefined && !yr.chance(0.008 + Math.max(0, age - 50) * 0.004)) {
        ruler.renown += 0.05;
        continue;
      }
      if (ruler.died === undefined) {
        ruler.died = year;
        ruler.fate = yr.chance(0.06) ? "murder" : "age";
      }
      const own = yr.fork(`succession-${polity.id}`);
      const heir = own.chance(0.75);
      const next = crown(polity, year, own, heir);
      log({ year, kind: heir ? "crowned" : "usurped", polities: [polity.id], figures: [next.id, ruler.id] });
      const list = holds[polity.id].filter(alive);
      if (heir || list.length < 4 || !own.chance(0.35)) continue;
      // Civil war: the towns farthest from the seat follow a rebel of their own.
      const seat = towns[polity.capital];
      const far = [...list].sort((a, b) => distance(b.cell, seat.cell) - distance(a.cell, seat.cell)).slice(0, Math.max(1, Math.floor(list.length / 3)));
      const head = far.reduce((best, town) => (town.population > best.population ? town : best));
      // A realm broken off far away soon speaks a tongue of its own.
      const away = distance(head.cell, seat.cell) > mesh.width * 0.2 || landmass(head.cell) !== landmass(seat.cell);
      const rebel = found(head.cell, year, own.fork("rebels"), polity, away ? shiftLanguage(polity.language, own.fork("tongue")) : polity.language);
      rebel.capital = head.id;
      rebel.seats.push([year, head.id]);
      const leader = crown(rebel, year, own.fork("rebel-ruler"), false);
      leader.role = "rebel";
      for (const town of far) {
        town.polity = rebel.id;
        town.owners.push([year, rebel.id]);
      }
      log({ year, kind: "rebellion", town: head.id, cell: head.cell, polities: [rebel.id, polity.id], figures: [leader.id] });
      const pair = keyOf(rebel.id, polity.id);
      wars.set(pair, { attacker: polity.id, defender: rebel.id, start: year, score: 0 });
      relations.set(pair, -60);
      borders();
      holds = holdings();
    }

    // Plague runs along the roads between towns; famine starves a realm; fire takes a city; a mountain wakes.
    if (yr.chance(0.012)) {
      const list = towns.filter(alive);
      if (list.length) {
        const ports = list.filter((town) => town.port);
        const origin = yr.pick(ports.length ? ports : list);
        let dead = 0;
        for (const town of list) {
          if (distance(town.cell, origin.cell) > mesh.width * 0.22 || !yr.chance(0.75)) continue;
          const loss = town.population * yr.float(0.15, 0.45);
          dead += loss;
          town.population -= loss;
          if (town.population < 0.06) fall(town, year, "plague");
        }
        log({ year, kind: "plague", town: origin.id, cell: origin.cell, polities: [origin.polity], figures: [], count: Math.round(dead * 1000) });
      }
    }
    if (yr.chance(0.015)) {
      const realms = polities.filter((polity) => polity.id && polity.fell === undefined);
      if (realms.length) {
        const hungry = yr.pick(realms);
        let dead = 0;
        for (const town of holds[hungry.id]) {
          dead += town.population * 0.12;
          town.population *= 0.88;
        }
        log({ year, kind: "famine", polities: [hungry.id], figures: [], count: Math.round(dead * 1000) });
      }
    }
    for (const town of towns) {
      if (alive(town) && town.population > 15 && yr.chance(0.0012)) {
        town.population *= 0.93;
        log({ year, kind: "fire", town: town.id, cell: town.cell, polities: [town.polity], figures: [] });
      }
    }
    for (const peak of volcanoes) {
      if (!yr.chance(0.0005)) continue;
      let dead = 0;
      const struck: number[] = [];
      for (const town of towns) {
        if (!alive(town)) continue;
        const d = distance(town.cell, peak);
        if (d > mesh.spacing * 2.5) continue;
        const loss = town.population * (d < mesh.spacing * 1.2 ? 1 : 0.6);
        dead += loss;
        town.population -= loss;
        struck.push(town.polity);
        if (town.population < 0.06) fall(town, year, "eruption");
      }
      log({ year, kind: "eruption", cell: peak, polities: [...new Set(struck)], figures: [], count: Math.round(dead * 1000) });
    }

    // Towns too small to keep going are left; a realm without towns is gone.
    for (const town of towns) {
      if (!alive(town) || town.population >= 0.06) continue;
      fall(town, year, "abandoned");
      log({ year, kind: "abandoned", town: town.id, cell: town.cell, polities: [town.polity], figures: [] });
    }
    for (const polity of polities) if (polity.id && polity.fell === undefined) reseat(polity, towns, year);

    if (year % ERA_YEARS === 0) eras.push({ year, owner: owner.slice(), sizes: Float32Array.from(towns, (town) => (alive(town) ? town.population : 0)) });
    if (progress && year % 10 === 0) progress(year / years);
  }
  borders();
  eras.push({ year: years, owner: owner.slice(), sizes: Float32Array.from(towns, (town) => (alive(town) ? town.population : 0)) });

  return {
    years,
    towns,
    polities,
    figures,
    events,
    eras,
    relations: Object.fromEntries([...relations].filter(([pair]) => pairs.has(pair))),
    wars: [...wars.values()].map((war) => [war.attacker, war.defender]),
  };
}

/** The realm's lands at a year: the last border map drawn by then. */
export function bordersAt(history: History, year: number): Uint16Array {
  let found = history.eras[0]?.owner ?? new Uint16Array(0);
  for (const era of history.eras) if (era.year <= year) found = era.owner;
  return found;
}

/** Whether a town stood in a year. */
export function standing(town: PastTown, year: number): boolean {
  return town.id > 0 && town.founded <= year && (town.fell === undefined || town.fell > year);
}

/** Who held a town in a year. */
export function holderAt(town: PastTown, year: number): number {
  let holder = town.owners[0]?.[1] ?? town.polity;
  for (const [when, who] of town.owners) if (when <= year) holder = who;
  return holder;
}

/** Who sat where in a year. */
export function seatAt(polity: Polity, year: number): number {
  let seat = polity.seats[0]?.[1] ?? polity.capital;
  for (const [when, town] of polity.seats) if (when <= year) seat = town;
  return seat;
}

/** The towns standing at the end, as the map's towns (in the order of their founding); `order` gives each one's town
 * id, which becomes its burg id once the fallen are put back in their places. */
export function townsOfHistory(g: Ground, history: History, cultures: Culture[]): { burg: Int32Array; burgs: Burg[]; order: number[] } {
  const burg = new Int32Array(g.mesh.cells);
  const burgs: Burg[] = [{ id: 0, name: "", cell: -1, x: 0, y: 0, culture: 0, state: 0, province: 0, capital: false, port: false, population: 0, walls: false, citadel: false, temple: false, market: false, shanty: false, kind: "generic" }];
  const order = [0];
  for (const town of history.towns) {
    if (!town.id || town.fell !== undefined) continue;
    const polity = history.polities[town.polity];
    const capital = polity.fell === undefined && polity.capital === town.id;
    const id = burgs.length;
    const water = g.mesh.neighbors[town.cell].find((next) => g.water[next]);
    // Ports sit on the shore, not in the middle of their cell.
    const x = town.port && water !== undefined ? g.mesh.x[town.cell] + (g.mesh.x[water] - g.mesh.x[town.cell]) * 0.35 : g.mesh.x[town.cell];
    const y = town.port && water !== undefined ? g.mesh.y[town.cell] + (g.mesh.y[water] - g.mesh.y[town.cell]) * 0.35 : g.mesh.y[town.cell];
    const population = Math.max(0.05, Math.round(town.population * 100) / 100);
    burgs.push({ id, name: town.name, cell: town.cell, x, y, culture: town.culture, state: 0, province: 0, capital, port: town.port, population, walls: town.walls || (capital && population > 4) || population > 12, citadel: capital && population > 3, temple: population > 1.5, market: population > 1, shanty: population > 25, kind: cultures[town.culture]?.kind ?? "generic" });
    burg[town.cell] = id;
    order.push(town.id);
  }
  return { burg, burgs, order };
}

/** The realms standing at the end, for the map's states: their names, peoples, seats and standing with each other. */
export function realmsOfHistory(history: History, burgs: Burg[], order: number[]): { polity: number; name: string; culture: number; capital: number }[] {
  const burgOf = new Map(order.map((town, id) => [town, id]));
  return history.polities.filter((polity) => polity.id && polity.fell === undefined && burgOf.has(polity.capital)).map((polity) => ({ polity: polity.id, name: polity.name, culture: polity.culture, capital: burgOf.get(polity.capital)! }));
}

/** How two realms stand at the end of the history, in the map's words. */
export function standingOf(history: History, a: number, b: number): Relation {
  if (history.wars.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return "enemy";
  const value = history.relations[a < b ? `${a}-${b}` : `${b}-${a}`] ?? 0;
  return value > 55 ? "ally" : value > 25 ? "friendly" : value > -10 ? "neutral" : value > -35 ? "suspicion" : "rival";
}

/** What the past left on the land: ruins of fallen towns (the greatest of them), fields of the bloodiest battles and
 * tombs of the most remembered rulers, as places on the map with their stories. */
export function marksOfHistory(g: Ground, history: History, markers: Marker[]): void {
  const taken = new Set(markers.map((marker) => marker.cell));
  const place = (cell: number) => {
    if (!taken.has(cell)) return cell;
    return g.mesh.neighbors[cell].find((next) => !g.water[next] && !taken.has(next)) ?? -1;
  };
  const add = (kind: Marker["kind"], cell: number, name: string, facts: Marker["facts"]) => {
    const at = place(cell);
    if (at < 0) return;
    taken.add(at);
    markers.push({ id: markers.length, kind, cell: at, x: g.mesh.x[at], y: g.mesh.y[at], name, facts });
  };
  const named = (id: number) => history.polities[id]?.name ?? "";
  const fallen = history.towns.filter((town) => town.id && town.fell !== undefined).sort((a, b) => b.peak - a.peak).slice(0, 60);
  for (const town of fallen) add("ruins", town.cell, town.name, { age: history.years - town.fell!, builders: named(town.owners[0]?.[1] ?? town.polity), town: town.id });
  const battles = history.events.filter((event) => event.kind === "battle" && event.cell !== undefined).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const fields = new Set<number>();
  for (const battle of battles) {
    if (fields.size >= 12 || fields.has(battle.cell!)) continue;
    fields.add(battle.cell!);
    add("battlefield", battle.cell!, "", { year: battle.year, sideA: named(battle.polities[0]), sideB: named(battle.polities[1]), fallen: battle.count ?? 0, event: battle.id });
  }
  const great = history.figures.filter((figure) => figure.role === "ruler" && figure.died !== undefined).sort((a, b) => b.renown - a.renown).slice(0, 5);
  for (const ruler of great) {
    const seat = history.towns[seatAt(history.polities[ruler.polity], ruler.died!)];
    if (seat) add("tomb", seat.cell, "", { ruler: ruler.name, age: history.years - ruler.died!, figure: ruler.id });
  }
}

/** Puts the fallen towns back among the map's towns, so every town of the history has its own number as a burg:
 * a living one with its map entry, a fallen one as a razed slot. */
export function renumberTowns(history: History, burgs: Burg[], order: number[]): { burgs: Burg[]; to: Int32Array } {
  const to = new Int32Array(burgs.length);
  const all: Burg[] = history.towns.map((town) => ({ id: town.id, name: town.name, cell: -1, x: 0, y: 0, culture: town.culture, state: 0, province: 0, capital: false, port: false, removed: true, population: 0, walls: false, citadel: false, temple: false, market: false, shanty: false, kind: "generic" }));
  all[0] = { ...burgs[0], removed: undefined };
  delete all[0].removed;
  for (let k = 1; k < burgs.length; k++) {
    to[k] = order[k];
    all[order[k]] = { ...burgs[k], id: order[k] };
  }
  return { burgs: all, to };
}

/** The world as it stood in a year of its history: the realms of the day within their borders and the towns that
 * stood, at their size of the time — for drawing the map of a past age. Roads, provinces and faiths are today's and
 * are left out. */
export function pastPlanet(planet: Planet, year: number): Planet {
  const history = planet.history;
  if (!history) return planet;
  const { mesh, water } = planet;
  const owner = bordersAt(history, year);
  let sizes = history.eras[0]?.sizes ?? new Float32Array(0);
  for (const era of history.eras) if (era.year <= year) sizes = era.sizes;
  const state = new Uint16Array(mesh.cells);
  const cellsOf = history.polities.map((): number[] => []);
  for (let cell = 0; cell < mesh.cells; cell++) {
    state[cell] = water[cell] ? 0 : owner[cell] ?? 0;
    if (state[cell]) cellsOf[state[cell]].push(cell);
  }
  const states: State[] = history.polities.map((polity) => ({
    ...planet.states[0],
    id: polity.id,
    name: polity.name,
    color: polity.color,
    capital: seatAt(polity, year),
    culture: polity.culture,
    cells: cellsOf[polity.id].length,
    pole: cellsOf[polity.id].length ? poleOf(planet, state, polity.id, cellsOf[polity.id]) : [0, 0],
    neighbors: [],
    relations: {},
    polity: polity.id,
  }));
  states[0] = planet.states[0];
  const burg = new Int32Array(mesh.cells);
  const burgs: Burg[] = history.towns.map((town) => {
    if (!standing(town, year)) return { ...planet.burgs[0], id: town.id, name: town.name, removed: true };
    const holder = holderAt(town, year);
    const population = Math.max(0.05, sizes[town.id] || town.peak * 0.5);
    burg[town.cell] = town.id;
    return { ...planet.burgs[0], id: town.id, name: town.name, cell: town.cell, x: mesh.x[town.cell], y: mesh.y[town.cell], culture: town.culture, state: holder, capital: seatAt(history.polities[holder], year) === town.id, port: town.port, population, walls: town.walls && population > 2, temple: population > 1.5, market: population > 1, kind: planet.cultures[town.culture]?.kind ?? "generic" };
  });
  burgs[0] = planet.burgs[0];
  const natural = planet.markers.filter((marker, k) => k === 0 || ["volcano", "hot-spring", "crater", "giant-tree", "megalith"].includes(marker.kind)).map((marker, k) => ({ ...marker, id: k }));
  // The roads of the day, between the towns that stood (a razed slot is no stop on any road).
  const routes = buildRoutes(planet, burgs.map((town) => (town.removed ? { ...town, state: -1, port: false } : town)), states);
  return { ...planet, state, states, burg, burgs, province: new Uint16Array(mesh.cells), provinces: [planet.provinces[0]], routes, markers: natural, religion: new Uint16Array(mesh.cells), religions: [planet.religions[0]] };
}
