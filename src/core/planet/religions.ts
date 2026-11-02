// Faiths of the planet: a folk faith for every people; a few churches spreading from holy cities along easy ground,
// slowed by mountains, foreign peoples and hostile borders; small cults round a single town; and heresies breaking
// away from a church in its far provinces.
import { paletteColor } from "../color";
import { name } from "../language";
import { PriorityQueue } from "../queue";
import type { Rng } from "../random";
import type { Burg, Culture, CultureKind, Ground, Religion, ReligionForm, ReligionKind, State } from "./model";

const FOLK: Record<CultureKind, [ReligionForm, number][]> = {
  generic: [["ancestors", 3], ["nature", 3], ["animism", 2], ["sky", 1]],
  river: [["nature", 3], ["ancestors", 2], ["animism", 2]],
  lake: [["nature", 3], ["animism", 2], ["ancestors", 1]],
  naval: [["nature", 2], ["sky", 2], ["ancestors", 2]],
  nomadic: [["sky", 4], ["shamanism", 3], ["ancestors", 1]],
  highland: [["ancestors", 3], ["sky", 2], ["animism", 2]],
  hunting: [["shamanism", 4], ["animism", 3], ["nature", 1]],
};
const CHURCH: [ReligionForm, number][] = [["monotheism", 4], ["pantheon", 3], ["dualism", 2], ["henotheism", 2], ["philosophy", 1]];
const CULT: [ReligionForm, number][] = [["mystery", 3], ["sun", 2], ["moon", 2], ["fire", 2], ["death", 2], ["serpent", 1], ["dragon", 1]];

export function spreadReligions(
  ground: Ground,
  culture: Uint16Array,
  cultures: Culture[],
  burgs: Burg[],
  state: Uint16Array,
  states: State[],
  population: Float32Array,
  rng: Rng,
): { religion: Uint16Array; religions: Religion[] } {
  const { mesh, water } = ground;
  const religion = new Uint16Array(mesh.cells);
  const religions: Religion[] = [{ id: 0, name: "", kind: "folk", form: "animism", deity: "", color: "#888888", culture: 0, center: 0, parent: 0, cells: 0, area: 0, followers: 0 }];
  const hue = rng.next();
  const add = (kind: ReligionKind, form: ReligionForm, people: Culture, center: number, parent: number): Religion => {
    const id = religions.length;
    const folk = kind === "folk";
    const made: Religion = {
      id,
      name: name(people.language, rng, "people"),
      kind,
      form,
      deity: name(people.language, rng, "person"),
      color: paletteColor(id, hue, folk ? 0.22 : 0.62, folk ? 0.7 : 0.56),
      culture: people.id,
      center,
      parent,
      cells: 0,
      area: 0,
      followers: 0,
    };
    religions.push(made);
    return made;
  };

  // Every people keeps the faith of its forebears.
  const folkOf = new Uint16Array(cultures.length);
  for (const people of cultures.slice(1)) folkOf[people.id] = add("folk", rng.weighted(FOLK[people.kind]), people, 0, 0).id;
  for (let cell = 0; cell < mesh.cells; cell++) if (!water[cell]) religion[cell] = folkOf[culture[cell]];

  // A faith spreads from a cell over easy ground until it runs out of zeal; it only takes cells `may` allows.
  const landCells = mesh.cells - water.reduce((sum, value) => sum + value, 0);
  const reach = Math.sqrt(landCells);
  const spread = (sources: [Religion, number, number][], may: (cell: number, faith: Religion) => boolean) => {
    const cost = new Float64Array(mesh.cells).fill(Infinity);
    const queue = new PriorityQueue<[number, number]>();
    for (const [faith, cell] of sources) {
      cost[cell] = 0;
      religion[cell] = faith.id;
      queue.push([cell, faith.id], 0);
    }
    const limit = new Map(sources.map(([faith, , zeal]) => [faith.id, zeal]));
    for (let item = queue.pop(); item; item = queue.pop()) {
      const [[cell, id], spent] = item;
      if (spent > cost[cell]) continue;
      const faith = religions[id];
      for (const next of mesh.neighbors[cell]) {
        if (water[next] || !may(next, faith)) continue;
        const holder = states[state[cell]];
        const foreign = culture[next] !== culture[cell] ? 2 : 0;
        const border = state[next] !== state[cell] ? (holder?.relations[state[next]] === "enemy" || holder?.relations[state[next]] === "rival" ? 6 : 1.5) : 0;
        const step = spent + 1 + Math.max(0, ground.height[next] - 55) / 8 + foreign + border;
        if (step > (limit.get(id) ?? 0) || step >= cost[next]) continue;
        cost[next] = step;
        religion[next] = id;
        queue.push([next, id], step);
      }
    }
  };

  // Churches rise in a few capitals and compete for the land between them.
  const capitals = rng.shuffle(burgs.slice(1).filter((burg) => burg.capital));
  const churches = capitals.slice(0, Math.max(1, Math.min(6, Math.round(states.length / 4))));
  spread(
    churches.map((burg): [Religion, number, number] => [add("organized", rng.weighted(CHURCH), cultures[burg.culture] ?? cultures[1], burg.id, 0), burg.cell, reach * rng.float(0.6, 1.4)]),
    () => true,
  );

  // Heresies break away in a church's far towns; cults gather round a single town.
  const heresies: [Religion, number, number][] = [];
  for (const church of religions.filter((faith) => faith.kind === "organized")) {
    const holy = burgs[church.center];
    const size = religion.reduce((sum, id) => sum + (id === church.id ? 1 : 0), 0);
    if (size < 60 || !rng.chance(0.5)) continue;
    const far = burgs
      .slice(1)
      .filter((burg) => religion[burg.cell] === church.id && !burg.capital)
      .sort((a, b) => Math.hypot(b.x - holy.x, b.y - holy.y) - Math.hypot(a.x - holy.x, a.y - holy.y))[0];
    if (!far) continue;
    const faith = add("heresy", church.form, cultures[far.culture] ?? cultures[1], far.id, church.id);
    heresies.push([faith, far.cell, reach * rng.float(0.15, 0.35)]);
  }
  spread(heresies, (cell, faith) => religion[cell] === faith.parent && cell !== burgs[religions[faith.parent].center].cell);
  const towns = rng.shuffle(burgs.slice(1).filter((burg) => !burg.capital && religions[religion[burg.cell]].kind !== "heresy"));
  const cults = towns.slice(0, rng.int(1, 3)).map((burg): [Religion, number, number] => [add("cult", rng.weighted(CULT), cultures[burg.culture] ?? cultures[1], burg.id, 0), burg.cell, reach * rng.float(0.05, 0.15)]);
  spread(cults, (cell) => religions[religion[cell]].kind !== "cult");

  const km2 = ground.scale * ground.scale;
  for (let cell = 0; cell < mesh.cells; cell++) {
    if (water[cell] || !religion[cell]) continue;
    const faith = religions[religion[cell]];
    faith.cells++;
    faith.area += mesh.area[cell] * km2;
    faith.followers += population[cell];
  }
  for (const burg of burgs.slice(1)) religions[religion[burg.cell]].followers += burg.population;
  for (const faith of religions) {
    faith.area = Math.round(faith.area);
    faith.followers = Math.round(faith.followers * 10) / 10;
  }
  return { religion, religions };
}
