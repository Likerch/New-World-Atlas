// Points of interest for a game master: places with a story attached. Each marker records the facts its legend is
// written from (who built it, when, what lies there), so the app can tell the story in any language.
import { name } from "../language";
import type { Rng } from "../random";
import type { Burg, Culture, Ground, Marker, MarkerKind, Route, State } from "./model";

const RESOURCES = ["iron", "copper", "silver", "gold", "salt", "coal", "gems", "tin", "obsidian", "marble"];
const MONSTERS = ["dragon", "troll", "wyvern", "giant spider", "basilisk", "wraith", "ogre", "griffin", "hydra", "werewolf"];

export function placeMarkers(g: Ground, culture: Uint16Array, cultures: Culture[], state: Uint16Array, states: State[], burgs: Burg[], burg: Int32Array, routes: Route[], rng: Rng): Marker[] {
  const n = g.mesh.cells;
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

  const peaks = land.filter((cell) => g.height[cell] > 68 && g.mesh.neighbors[cell].every((next) => g.height[next] <= g.height[cell]));
  pickFrom(peaks, Math.max(1, Math.round(peaks.length * 0.25)), "volcano", rng.fork("volcano"), (cell) => ({ status: rng.pick(["active", "dormant", "extinct"]), lastEruption: year() }));
  pickFrom(land.filter((cell) => g.height[cell] > 45 && g.height[cell] < 70), quota(0.002), "hot-spring", rng.fork("spring"), () => ({ temperature: rng.int(38, 90) }));
  pickFrom(land.filter((cell) => g.height[cell] > 40), quota(0.006), "mine", rng.fork("mine"), (cell) => ({ resource: rng.pick(RESOURCES), owner: stateName(cell) }));
  pickFrom(land.filter((cell) => g.height[cell] > 50), quota(0.003), "cave", rng.fork("cave"), () => ({ depth: rng.int(1, 9), dweller: rng.pick(MONSTERS) }));
  pickFrom(land.filter((cell) => g.height[cell] > 45 && g.coast[cell] > 4), quota(0.002), "monastery", rng.fork("monastery"), (cell) => ({ founded: year(), monks: rng.int(5, 120), people: (cultures[culture[cell]] ?? cultures[0]).name }));
  pickFrom(land.filter((cell) => g.biome[cell] === 6 || g.biome[cell] === 8), quota(0.002), "sacred-grove", rng.fork("grove"), () => ({ spirit: rng.pick(["stag", "owl", "oak", "wolf", "moon", "spring"]) }));
  pickFrom(land.filter((cell) => g.biome[cell] === 7 || g.biome[cell] === 8), quota(0.0008), "giant-tree", rng.fork("tree"), () => ({ age: rng.int(800, 9000) }));
  pickFrom(land.filter((cell) => [4, 5, 6].includes(g.biome[cell])), quota(0.004), "ruins", rng.fork("ruins"), () => ({ age: rng.int(200, 4000), builders: rng.pick(["elder empire", "giants", "forgotten kings", "sky people", "a lost tribe"]) }));
  pickFrom(land, quota(0.0005), "portal", rng.fork("portal"), () => ({ leadsTo: rng.pick(["fey realm", "underworld", "another world", "the stars", "the past"]) }));

  // Along the roads: bridges over big rivers, inns on long stretches, brigands far from towns.
  const roadCells = new Set<number>();
  for (const route of routes.slice(1)) if (route.kind !== "sea") for (const cell of route.cells) roadCells.add(cell);
  const ownBridges = rng.fork("bridge");
  for (const cell of roadCells) {
    const river = g.river[cell];
    if (river && g.rivers[river].discharge > 500 && ownBridges.chance(0.35)) add("bridge", cell, ownBridges, { river: g.rivers[river].name }, false);
  }
  const remote = [...roadCells].filter((cell) => ![...near(cell, 4)].some((other) => burg[other]));
  pickFrom(remote, Math.round(remote.length * 0.05), "inn", rng.fork("inn"), () => ({ host: rng.pick(["a retired soldier", "a widow", "an old dwarf", "twin brothers", "a runaway noble"]) }));
  pickFrom(remote, Math.round(remote.length * 0.03), "brigands", rng.fork("brigands"), () => ({ band: rng.int(5, 60) }));

  // Borders: watchtowers where roads cross, battlefields between old enemies.
  const borderCells = land.filter((cell) => state[cell] && g.mesh.neighbors[cell].some((next) => state[next] && state[next] !== state[cell]));
  pickFrom(borderCells.filter((cell) => roadCells.has(cell)), Math.round(borderCells.length * 0.02) + 1, "watchtower", rng.fork("tower"));
  const hostile = borderCells.filter((cell) => g.mesh.neighbors[cell].some((next) => ["enemy", "rival"].includes(states[state[cell]].relations[state[next]] ?? "")));
  pickFrom(hostile, Math.max(1, Math.round(hostile.length * 0.03)), "battlefield", rng.fork("battle"), (cell) => {
    const other = g.mesh.neighbors[cell].map((next) => state[next]).find((id) => id && id !== state[cell]) ?? 0;
    return { year: year(), sideA: stateName(cell), sideB: states[other]?.name ?? "", fallen: rng.int(300, 40000) };
  });

  // Coasts: lighthouses by sea lanes, shipwrecks offshore.
  const ownLight = rng.fork("lighthouse");
  for (const port of burgs.slice(1)) {
    if (!port.port || port.population < 3 || !ownLight.chance(0.5)) continue;
    const shore = g.mesh.neighbors[port.cell].find((next) => !g.water[next] && g.coast[next] === 1 && !burg[next]);
    if (shore !== undefined) add("lighthouse", shore, ownLight, { port: port.name }, false);
  }
  const shallows = cells.filter((cell) => g.water[cell] && g.coast[cell] === -2 && g.features[g.feature[cell]].kind === "ocean");
  pickFrom(shallows, Math.max(1, Math.round(shallows.length * 0.004)), "shipwreck", rng.fork("wreck"), () => ({ year: year(), cargo: rng.pick(["gold", "spices", "silk", "wine", "weapons", "slaves", "relics"]) }));
  return markers;
}
