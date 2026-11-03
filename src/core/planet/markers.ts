// Points of interest for a game master: places with a story attached. Each marker records the facts its legend is
// written from (who built it, when, what lies there), so the app can tell the story in any language. What stands on
// the land follows the world's setting: standing stones and hunting grounds in the stone age, factories and airports
// in a modern one, spaceports in the far future, craters and vaults after the fall, wizards' towers where magic is
// common.
import { name } from "../language";
import type { Rng } from "../random";
import { ageOf, isClassic, settingOf, type EraId } from "../setting";
import type { Burg, Culture, Ground, Marker, MarkerKind, Route, State } from "./model";

const RESOURCES = ["iron", "copper", "silver", "gold", "salt", "coal", "gems", "tin", "obsidian", "marble"];
const MONSTERS = ["dragon", "troll", "wyvern", "giant spider", "basilisk", "wraith", "ogre", "griffin", "hydra", "werewolf"];
const BUILDERS = ["elder empire", "giants", "forgotten kings", "sky people", "a lost tribe"];
const HOSTS = ["a retired soldier", "a widow", "an old dwarf", "twin brothers", "a runaway noble"];
const CARGO = ["gold", "spices", "silk", "wine", "weapons", "slaves", "relics"];
const PORTALS = ["fey realm", "underworld", "another world", "the stars", "the past"];

/** The words of each age for what lies in mines, caves, ruins and wrecks, and who keeps the inns. */
const OF_AGE: Record<EraId, { resources: string[]; dwellers: string[]; builders: string[]; hosts: string[]; cargo: string[] }> = {
  stone: { resources: ["flint", "ochre", "obsidian", "amber", "salt", "clay"], dwellers: ["cave bears", "cave lions", "bats", "the spirits", "a lost tribe"], builders: ["giants", "the first people", "the old ones"], hosts: HOSTS, cargo: CARGO },
  ancient: { resources: ["copper", "tin", "silver", "gold", "salt", "marble", "obsidian"], dwellers: ["bears", "wolves", "bats", "outlaws", "a hermit"], builders: ["giants", "forgotten kings", "the old ones", "a lost tribe"], hosts: ["a freedman", "a widow", "a retired legionary", "twin brothers"], cargo: ["wine", "bronze", "silver", "spices", "relics", "slaves"] },
  medieval: { resources: RESOURCES, dwellers: ["bears", "wolves", "bats", "outlaws", "smugglers", "a hermit"], builders: BUILDERS, hosts: ["a retired soldier", "a widow", "a former monk", "twin brothers", "a runaway noble"], cargo: CARGO },
  renaissance: { resources: RESOURCES, dwellers: ["bears", "wolves", "bats", "outlaws", "smugglers", "a hermit"], builders: BUILDERS, hosts: ["a retired soldier", "a widow", "a former monk", "twin brothers", "a runaway noble"], cargo: ["gold", "spices", "silk", "wine", "weapons", "tea", "relics"] },
  industrial: { resources: ["coal", "iron", "copper", "silver", "gold", "salt", "tin", "lead"], dwellers: ["bats", "smugglers", "a hermit", "outlaws", "a secret lab"], builders: ["the ancients", "elder empire", "forgotten kings", "a lost tribe"], hosts: ["a retired sergeant", "a widow", "a railway man", "twin brothers"], cargo: ["coal", "gold", "tea", "weapons", "silk"] },
  modern: { resources: ["coal", "iron", "copper", "uranium", "lithium", "bauxite", "gold", "rare earths"], dwellers: ["bats", "smugglers", "squatters", "a hermit", "a secret lab"], builders: ["an ancient civilisation", "a medieval kingdom", "a forgotten empire"], hosts: ["a trucker's widow", "a retired cop", "an old couple", "twin brothers"], cargo: ["containers", "oil", "weapons", "gold", "cars"] },
  cyberpunk: { resources: ["rare earths", "lithium", "uranium", "cobalt", "platinum"], dwellers: ["smugglers", "squatters", "a rogue AI", "a secret lab", "a gang"], builders: ["the old city", "a failed corporation", "an ancient civilisation"], hosts: ["an android", "a retired cop", "an ex-netrunner", "twin brothers"], cargo: ["containers", "data cores", "weapons", "reactor parts"] },
  "far-future": { resources: ["rare earths", "platinum", "cobalt", "exotic crystals", "deep-core metals"], dwellers: ["a rogue AI", "feral drones", "an alien nest", "a secret lab", "squatters"], builders: ["precursors", "the first colony", "old-earth colonists", "the machine war"], hosts: ["an android", "a retired pilot", "a hermit AI", "twin sisters"], cargo: ["containers", "data cores", "reactor parts", "alien relics"] },
  "post-apocalypse": { resources: ["scrap", "fuel", "copper", "uranium", "clean water"], dwellers: ["mutants", "feral dogs", "raiders", "ghouls", "a sealed vault"], builders: ["the old world", "a city of millions", "the last army"], hosts: ["an old trader", "a scavenger family", "an ex-raider", "twin brothers"], cargo: ["containers", "medicine", "fuel", "weapons"] },
};

export function placeMarkers(g: Ground, culture: Uint16Array, cultures: Culture[], state: Uint16Array, states: State[], burgs: Burg[], burg: Int32Array, routes: Route[], rng: Rng): Marker[] {
  const n = g.mesh.cells;
  const setting = settingOf(g.params.setting);
  const classic = isClassic(setting);
  const age = ageOf(setting);
  const { tech, transport, magic } = setting;
  const fallen = age === "post-apocalypse";
  const words = OF_AGE[age];
  const markers: Marker[] = [{ id: 0, kind: "ruins", cell: -1, x: 0, y: 0, name: "", facts: {} }];
  const taken = new Uint8Array(n);
  const near = (cell: number, radius: number) => {
    let ring = [cell];
    const seen = new Set(ring);
    for (let step = 0; step < radius; step++) {
      const next: number[] = [];
      for (const c of ring) for (const m of g.mesh.neighbors[c]) if (!seen.has(m)) (seen.add(m), next.push(m));
      ring = next;
    }
    return seen;
  };
  const tongue = (cell: number) => (cultures[culture[cell]] ?? cultures[0]).language;
  const add = (kind: MarkerKind, cell: number, own: Rng, facts: Record<string, string | number> = {}, label = true) => {
    if (taken[cell] || burg[cell]) return false;
    for (const other of near(cell, 1)) taken[other] = 1;
    markers.push({ id: markers.length, kind, cell, x: g.mesh.x[cell] + own.float(-0.2, 0.2) * g.mesh.spacing, y: g.mesh.y[cell] + own.float(-0.2, 0.2) * g.mesh.spacing, name: label ? name(tongue(cell), own, "plain") : "", facts });
    return true;
  };
  const cells = Array.from({ length: n }, (_, cell) => cell);
  const land = cells.filter((cell) => !g.water[cell]);
  const quota = (share: number) => Math.max(1, Math.round(land.length * share));
  const pickFrom = (pool: number[], count: number, kind: MarkerKind, own: Rng, facts: (cell: number) => Record<string, string | number> = () => ({})) => {
    for (const cell of own.shuffle([...pool])) {
      if (count <= 0) break;
      if (add(kind, cell, own, facts(cell))) count--;
    }
  };
  const year = () => rng.int(20, 900);
  const stateName = (cell: number) => states[state[cell]]?.name ?? "";
  // The classic world keeps its lists, so every old seed grows the same places.
  const resources = classic ? RESOURCES : words.resources;
  const dwellers = classic || magic >= 1 ? MONSTERS : words.dwellers;
  const builders = classic ? BUILDERS : words.builders;
  const hosts = classic ? HOSTS : words.hosts;
  const cargo = classic ? CARGO : words.cargo;
  const portals = tech >= 8 ? ["another dimension", "a parallel world", "the stars", "the past", "underworld"] : PORTALS;

  const peaks = land.filter((cell) => g.height[cell] > 68 && g.mesh.neighbors[cell].every((next) => g.height[next] <= g.height[cell]));
  pickFrom(peaks, Math.max(1, Math.round(peaks.length * 0.25)), "volcano", rng.fork("volcano"), (cell) => ({ status: rng.pick(["active", "dormant", "extinct"]), lastEruption: year() }));
  pickFrom(land.filter((cell) => g.height[cell] > 45 && g.height[cell] < 70), quota(0.002), "hot-spring", rng.fork("spring"), () => ({ temperature: rng.int(38, 90) }));
  pickFrom(land.filter((cell) => g.height[cell] > 40), quota(0.006), "mine", rng.fork("mine"), (cell) => ({ resource: rng.pick(resources), owner: stateName(cell) }));
  pickFrom(land.filter((cell) => g.height[cell] > 50), quota(0.003), "cave", rng.fork("cave"), () => ({ depth: rng.int(1, 9), dweller: rng.pick(dwellers) }));
  if (tech >= 2.5 && tech < 8.75) pickFrom(land.filter((cell) => g.height[cell] > 45 && g.coast[cell] > 4), quota(0.002), "monastery", rng.fork("monastery"), (cell) => ({ founded: year(), monks: rng.int(5, 120), people: (cultures[culture[cell]] ?? cultures[0]).name }));
  if (tech < 4.75 || magic >= 1) pickFrom(land.filter((cell) => g.biome[cell] === 6 || g.biome[cell] === 8), quota(0.002), "sacred-grove", rng.fork("grove"), () => ({ spirit: rng.pick(["stag", "owl", "oak", "wolf", "moon", "spring"]) }));
  if (magic >= 1) pickFrom(land.filter((cell) => g.biome[cell] === 7 || g.biome[cell] === 8), quota(0.0008), "giant-tree", rng.fork("tree"), () => ({ age: rng.int(800, 9000) }));
  pickFrom(land.filter((cell) => [4, 5, 6].includes(g.biome[cell])), quota(fallen ? 0.008 : 0.004 * (1 + setting.decline * 2)), "ruins", rng.fork("ruins"), () => ({ age: fallen ? rng.int(20, 200) : rng.int(200, 4000), builders: rng.pick(builders) }));
  if (magic >= 1) pickFrom(land, quota(0.0005 * (magic >= 3 ? 3 : 1)), "portal", rng.fork("portal"), () => ({ leadsTo: rng.pick(portals) }));

  // Along the roads: bridges over big rivers, inns on long stretches, brigands far from towns.
  const roadCells = new Set<number>();
  for (const route of routes.slice(1)) if (route.kind !== "sea" && route.kind !== "air") for (const cell of route.cells) roadCells.add(cell);
  const ownBridges = rng.fork("bridge");
  if (transport >= 1.5) {
    for (const cell of roadCells) {
      const river = g.river[cell];
      if (river && g.rivers[river].discharge > 500 && ownBridges.chance(0.35)) add("bridge", cell, ownBridges, { river: g.rivers[river].name }, false);
    }
  }
  const remote = [...roadCells].filter((cell) => ![...near(cell, 4)].some((other) => burg[other]));
  if (transport >= 1.5) pickFrom(remote, Math.round(remote.length * 0.05), "inn", rng.fork("inn"), () => ({ host: rng.pick(hosts) }));
  if (tech >= 1) pickFrom(remote, Math.round(remote.length * (fallen ? 0.08 : 0.03)), "brigands", rng.fork("brigands"), () => ({ band: rng.int(5, 60) }));

  // Borders: watchtowers where roads cross, battlefields between old enemies.
  const borderCells = land.filter((cell) => state[cell] && g.mesh.neighbors[cell].some((next) => state[next] && state[next] !== state[cell]));
  if (tech >= 1.5) pickFrom(borderCells.filter((cell) => roadCells.has(cell)), Math.round(borderCells.length * 0.02) + 1, "watchtower", rng.fork("tower"));
  const hostile = borderCells.filter((cell) => g.mesh.neighbors[cell].some((next) => ["enemy", "rival"].includes(states[state[cell]].relations[state[next]] ?? "")));
  if (tech >= 1)
    pickFrom(hostile, Math.max(1, Math.round(hostile.length * 0.03)), "battlefield", rng.fork("battle"), (cell) => {
      const other = g.mesh.neighbors[cell].map((next) => state[next]).find((id) => id && id !== state[cell]) ?? 0;
      return { year: year(), sideA: stateName(cell), sideB: states[other]?.name ?? "", fallen: rng.int(300, 40000) };
    });

  // Coasts: lighthouses by sea lanes, shipwrecks offshore.
  const ownLight = rng.fork("lighthouse");
  if (transport >= 1.5) {
    for (const port of burgs.slice(1)) {
      if (!port.port || port.population < 3 || !ownLight.chance(0.5)) continue;
      const shore = g.mesh.neighbors[port.cell].find((next) => !g.water[next] && g.coast[next] === 1 && !burg[next]);
      if (shore !== undefined) add("lighthouse", shore, ownLight, { port: port.name }, false);
    }
  }
  const shallows = cells.filter((cell) => g.water[cell] && g.coast[cell] === -2 && g.features[g.feature[cell]].kind === "ocean");
  if (transport >= 1) pickFrom(shallows, Math.max(1, Math.round(shallows.length * 0.004)), "shipwreck", rng.fork("wreck"), () => ({ year: year(), cargo: rng.pick(cargo) }));
  if (classic) return markers;

  // The age's own places, each from its own stream so the older kinds above stay where they were.
  const own = rng.fork("age");
  const towns = burgs
    .slice(1)
    .filter((town) => !town.removed)
    .sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population);
  const outskirts = (kind: MarkerKind, from: Burg[], facts: (town: Burg) => Record<string, string | number>) => {
    for (const town of from) {
      const cell = own.shuffle([...near(town.cell, 2)].filter((next) => !g.water[next])).find((next) => !taken[next] && !burg[next]);
      if (cell !== undefined) add(kind, cell, own, facts(town), false);
    }
  };
  const person = (cell: number) => name(tongue(cell), own, "person");
  if (age === "stone" || age === "ancient") pickFrom(land.filter((cell) => g.height[cell] > 24 && g.height[cell] < 60), quota(age === "stone" ? 0.003 : 0.0012), "megalith", own, () => ({ stones: own.int(5, 60), purpose: own.pick(["the sun", "the moon", "the dead", "the seasons"]) }));
  if (age === "stone") pickFrom(land.filter((cell) => [3, 4, 9, 10].includes(g.biome[cell])), quota(0.003), "hunting-ground", own, () => ({ game: own.pick(["mammoth", "bison", "deer", "wild horses", "reindeer", "aurochs"]) }));
  if (tech >= 0.5 && tech < 3.5) pickFrom(land.filter((cell) => [1, 2].includes(g.biome[cell]) || (g.height[cell] > 28 && g.height[cell] < 50)), quota(0.0015), "tomb", own, (cell) => ({ ruler: person(cell), age: own.int(100, 3000) }));
  if (age === "ancient" || magic >= 2) pickFrom(land.filter((cell) => g.height[cell] > 45), quota(0.0006), "oracle", own, (cell) => ({ god: person(cell) }));
  // The great places by the cities come first, before factories and plants crowd their outskirts.
  if (transport >= 6.5 && !fallen && towns.length) outskirts("airport", towns.slice(0, Math.min(24, realmsHere(states) + 4)), (town) => ({ town: town.name }));
  if (tech >= 7.5 && !fallen) {
    outskirts("arcology", towns.slice(0, 5), (town) => ({ people: own.int(50, 900), corp: name(tongue(town.cell), own, "people") }));
    if (tech < 9) pickFrom(land.filter((cell) => g.coast[cell] > 2), quota(0.0005), "data-haven", own, (cell) => ({ owner: person(cell) }));
    pickFrom(land, quota(tech >= 9 ? 0.0003 : 0.001), "toxic-zone", own, () => ({ cause: own.pick(["a chemical spill", "nuclear waste", "a nanite swarm", "a bio-leak"]) }));
  }
  if (transport >= 8 && !fallen) {
    const lowLatitude = towns.slice(0, 12).sort((a, b) => Math.abs(latitudeOf(g, a.cell)) - Math.abs(latitudeOf(g, b.cell)));
    outskirts("spaceport", lowLatitude.slice(0, transport >= 9 ? 3 : 1), (town) => ({ flights: own.int(transport >= 9 ? 300 : 4, transport >= 9 ? 5000 : 60), town: town.name }));
  }
  if (tech >= 9 && !fallen) {
    const equator = [...land].sort((a, b) => Math.abs(latitudeOf(g, a)) - Math.abs(latitudeOf(g, b)));
    for (const cell of equator) if (add("space-elevator", cell, own, { height: 36000 })) break;
    pickFrom(land.filter((cell) => [1, 2, 10, 11].includes(g.biome[cell])), quota(0.0008), "terraformer", own, () => ({ work: own.pick(["warming the air", "seeding rain", "cleaning the sea", "making soil"]) }));
    pickFrom(land, quota(0.0006), "biodome", own, () => ({ biome: own.pick(["rainforest", "orchards", "old-earth fields", "a coral sea"]) }));
  }
  if (tech >= 5 && !fallen) outskirts("factory", towns.slice(0, Math.min(40, Math.ceil(towns.length * (tech >= 6.25 ? 0.3 : 0.2)))), (town) => ({ makes: own.pick(tech >= 8 ? ["robots", "chips", "drones", "cyberware", "chemicals"] : tech >= 6.25 ? ["steel", "cars", "chemicals", "electronics", "weapons"] : ["steel", "textiles", "machines", "ships", "weapons"]), town: town.name }));
  if (tech >= 5.5) {
    const dammed = new Set<number>();
    const sites = land.filter((cell) => {
      const river = g.river[cell];
      if (!river || g.height[cell] < 32 || g.rivers[river].discharge < 600 || dammed.has(river)) return false;
      dammed.add(river);
      return true;
    });
    pickFrom(sites, Math.ceil(sites.length * 0.5), "dam", own, (cell) => ({ river: g.rivers[g.river[cell]].name }));
  }
  if (tech >= 6.25) {
    outskirts("power-plant", towns.slice(0, Math.min(16, Math.ceil(towns.length * 0.1))), () => ({ fuel: own.pick(tech >= 9 ? ["fusion", "antimatter", "solar"] : tech >= 7.5 ? ["fusion", "nuclear", "solar", "geothermal"] : ["coal", "nuclear", "gas", "hydro", "solar"]), power: own.int(300, 5000) }));
    if (tech < 9) pickFrom([...land.filter((cell) => [1, 2, 10].includes(g.biome[cell])), ...cells.filter((cell) => g.water[cell] && g.coast[cell] === -1 && g.features[g.feature[cell]].kind === "ocean")], quota(0.0012), "oil-field", own, () => ({ output: own.int(20, 900) }));
    pickFrom(borderCells, Math.ceil(borderCells.length * 0.015), "base", own, (cell) => ({ owner: stateName(cell), branch: own.pick(tech >= 9 ? ["orbital defence", "drone", "marine"] : ["army", "air", "missile", "marine"]) }));
  }
  if (fallen) {
    pickFrom(land, quota(0.0015), "crater", own, () => ({ size: own.int(1, 20), year: own.int(10, 150) }));
    pickFrom(land, quota(0.002), "radiation", own, () => ({ level: own.pick(["low", "high", "lethal"]) }));
    pickFrom(land, quota(0.0008), "crash-site", own, () => ({ craft: own.pick(tech >= 9 ? ["starship", "orbital station", "warship"] : ["airliner", "bomber", "satellite", "train"]) }));
    pickFrom(land.filter((cell) => g.height[cell] > 30), quota(0.001), "bunker", own, () => ({ number: own.int(1, 120), dwellers: own.int(0, 900) }));
  }
  if (magic >= 2) {
    pickFrom(land, quota(0.0008 * (magic >= 3 ? 2 : 1)), "wizard-tower", own, (cell) => ({ mage: person(cell), school: own.pick(["fire", "storms", "illusion", "necromancy", "the stars", "time"]) }));
    pickFrom(land, quota(0.0005 * (magic >= 3 ? 2 : 1)), "ley-nexus", own, () => ({ lines: own.int(3, 9) }));
  }
  return markers;
}

/** A cell's latitude in degrees. */
function latitudeOf(g: Ground, cell: number): number {
  return g.params.latitudeNorth - (g.mesh.y[cell] / g.params.height) * (g.params.latitudeNorth - g.params.latitudeSouth);
}

/** How many realms a map holds: every realm of a planet; in a close-up, only those with land in the frame (and the
 * count stays what it always was for a whole planet). */
export function realmsHere(states: { id: number; cells: number }[]): number {
  return states.length - states.filter((s) => s.id && !s.cells).length;
}
