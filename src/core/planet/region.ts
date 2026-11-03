// A region: one province of a planet seen up close. A finer mesh over the province (and a margin round it) inherits
// relief, climate, peoples and borders from the planet and adds fine detail. The planet's rivers cut their beds first,
// so the water runs where it runs on the planet (and keeps its names), and the planet's roads and places stay where
// they were. Villages and hamlets fill the land between the planet's towns, ranked from market villages down to
// hamlets; their fields, pastures and woods, the lordships between them and the named woods, marshes and hills make
// the countryside. It is a Planet in shape, so everything that shows or opens a planet works on it.
import { name } from "../language";
import { buildMesh } from "../mesh";
import { fbm, noise2 } from "../noise";
import { createRng } from "../random";
import { isClassic, peopleOf, settingOf } from "../setting";
import { settleAge } from "./age";
import { biomeOf } from "./biomes";
import { suitability } from "./cultures";
import { markFeatures } from "./features";
import { placeMarkers } from "./markers";
import { evaporationOf, SEA_LEVEL, type Burg, type Ground, type Planet } from "./model";
import { hydrology } from "./rivers";
import { buildRoutes } from "./routes";
import { carveRivers, fiefsOf, landformsOf, landUseOf, planetRoads, rankVillages } from "./countryside";
import { cellKm2 } from "./geo";

export function generateRegion(planet: Planet, provinceId: number, cells?: number): Planet {
  return closeUp(planet, (cell) => planet.province[cell] === provinceId, planet.provinces[provinceId].name, `province-${provinceId}`, cells);
}

/** A whole state up close: the same as a province, over all of its land. */
/** A close-up of any stretch of the map the GM marked out: the land in a box, with whatever stands on it. */
export function generateArea(planet: Planet, box: [number, number, number, number], title: string, cells?: number): Planet {
  const [x0, y0, x1, y1] = [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])];
  return closeUp(planet, (cell) => planet.mesh.x[cell] >= x0 && planet.mesh.x[cell] <= x1 && planet.mesh.y[cell] >= y0 && planet.mesh.y[cell] <= y1 && !planet.water[cell], title, `area-${Math.round(x0)}-${Math.round(y0)}-${Math.round(x1)}-${Math.round(y1)}`, cells, [x0, y0, x1, y1]);
}

/** The box of a sheet so many kilometres wide (and 10/16 as tall) centred on a point of the map. */
export function sheetBox(planet: Planet, x: number, y: number, km = 200): [number, number, number, number] {
  const half = km / planet.scale / 2;
  return [x - half, y - half * 0.625, x + half, y + half * 0.625];
}

export function generateCountry(planet: Planet, stateId: number, cells?: number): Planet {
  return closeUp(planet, (cell) => planet.state[cell] === stateId && !planet.water[cell], planet.states[stateId].name, `state-${stateId}`, cells);
}

function closeUp(planet: Planet, inside: (cell: number) => boolean, title: string, key: string, wanted?: number, box?: [number, number, number, number]): Planet {
  const parent = planet.mesh;
  const own = Array.from({ length: parent.cells }, (_, cell) => cell).filter(inside);
  const xs = own.map((cell) => parent.x[cell]);
  const ys = own.map((cell) => parent.y[cell]);
  // The province's box with a margin (a box the GM marked out is the frame itself), stretched to the map's 16:10 frame.
  let x0 = box ? box[0] : Math.min(...xs),
    x1 = box ? box[2] : Math.max(...xs),
    y0 = box ? box[1] : Math.min(...ys),
    y1 = box ? box[3] : Math.max(...ys);
  const margin = box ? 0 : Math.max(x1 - x0, y1 - y0) * 0.18 + parent.spacing * 2;
  x0 -= margin;
  x1 += margin;
  y0 -= margin;
  y1 += margin;
  const W = 1600,
    H = 1000;
  if ((x1 - x0) / (y1 - y0) > W / H) {
    const grow = ((x1 - x0) * H) / W - (y1 - y0);
    y0 -= grow / 2;
    y1 += grow / 2;
  } else {
    const grow = ((y1 - y0) * W) / H - (x1 - x0);
    x0 -= grow / 2;
    x1 += grow / 2;
  }
  const k = (x1 - x0) / W;
  // Detail by the frame's real size: about 30 km² a cell, so a small province is not stretched thin nor a vast one
  // blurred, within what a browser draws briskly.
  const frameKm2 = (x1 - x0) * (y1 - y0) * planet.scale * planet.scale * (own.length ? own.reduce((sum, cell) => sum + cellKm2(planet, cell), 0) / own.reduce((sum, cell) => sum + parent.area[cell] * planet.scale * planet.scale, 0) : 1);
  const cells = wanted ?? Math.round(Math.max(5000, Math.min(12000, frameKm2 / 30)));
  const toParent = (x: number, y: number) => [x0 + x * k, y0 + y * k] as const;
  const toRegion = (x: number, y: number) => [(x - x0) / k, (y - y0) / k] as const;

  const seed = `${planet.params.seed}/${key}`;
  const rng = createRng(seed);
  const params = { ...planet.params, seed, world: planet.params.world ?? planet.params.seed, name: title, width: W, height: H, cells, latitudeNorth: planet.params.latitudeNorth - (y0 / planet.params.height) * (planet.params.latitudeNorth - planet.params.latitudeSouth), latitudeSouth: planet.params.latitudeNorth - (y1 / planet.params.height) * (planet.params.latitudeNorth - planet.params.latitudeSouth) };
  const mesh = buildMesh(W, H, cells, rng.fork("mesh"));
  const n = mesh.cells;
  const scale = planet.scale * k;

  // Inherit by inverse-distance weighting over the nearest planet cell and its neighbours; add detail.
  const height = new Float32Array(n);
  const temperature = new Float32Array(n);
  const rain = new Float32Array(n);
  const nearest = new Int32Array(n);
  const detail = noise2(rng.fork("detail"));
  for (let cell = 0; cell < n; cell++) {
    const [px, py] = toParent(mesh.x[cell], mesh.y[cell]);
    const c = parent.find(px, py);
    nearest[cell] = c;
    let sum = 0,
      h = 0,
      t = 0,
      r = 0;
    for (const p of [c, ...parent.neighbors[c]]) {
      const w = 1 / ((parent.x[p] - px) ** 2 + (parent.y[p] - py) ** 2 + 1e-3);
      sum += w;
      h += planet.height[p] * w;
      t += planet.temperature[p] * w;
      r += planet.precipitation[p] * w;
    }
    const wobble = fbm(detail, mesh.x[cell] / 140, mesh.y[cell] / 140, 5);
    height[cell] = Math.max(0, Math.min(100, h / sum + wobble * (h / sum > SEA_LEVEL - 4 && h / sum < SEA_LEVEL + 4 ? 5 : 3)));
    temperature[cell] = t / sum;
    rain[cell] = Math.max(0, (r / sum) * (1 + wobble * 0.25));
  }

  const sources = carveRivers(planet, mesh, height, toRegion);
  const sea = markFeatures(mesh, (cell) => height[cell] < SEA_LEVEL);
  const ocean = (cell: number) => height[cell] < SEA_LEVEL && sea.features[sea.feature[cell]].kind === "ocean";
  // The water a river gathers beyond the frame is brought in where it enters (or rises): what the planet has it carry
  // there, less what the close-up's own land gives it.
  const gathered = hydrology(mesh, height, ocean, rain, scale).flux;
  const brought = new Float32Array(n);
  for (const [cell, flux] of sources) brought[cell] += Math.max(0, flux - gathered[cell]);
  const hydro = hydrology(mesh, height, ocean, rain, scale, brought, evaporationOf(temperature));
  const water = new Uint8Array(n);
  for (let cell = 0; cell < n; cell++) water[cell] = ocean(cell) || hydro.lake[cell] ? 1 : 0;
  const { feature, features, coast } = markFeatures(mesh, (cell) => water[cell] === 1);
  for (let cell = 0; cell < n; cell++) if (hydro.salt[cell]) features[feature[cell]].salt = true;
  const biome = new Uint8Array(n);
  for (let cell = 0; cell < n; cell++) {
    if (water[cell]) continue;
    const river = hydro.river[cell];
    const moisture = rain[cell] + (river ? Math.min(700, 120 + hydro.rivers[river].discharge / 20) : 0);
    biome[cell] = biomeOf(temperature[cell], moisture, height[cell] < 23, ((cell * 2654435761) >>> 0) % 3 === 0 && (coast[cell] === 1 || river > 0));
  }
  const culture = new Uint16Array(n);
  const religion = new Uint16Array(n);
  const state = new Uint16Array(n);
  const provinceOf = new Uint16Array(n);
  for (let cell = 0; cell < n; cell++) {
    if (water[cell]) continue;
    // Land the planet called sea keeps the nearest land's owners.
    let c = nearest[cell];
    if (planet.water[c]) c = parent.neighbors[c].find((p) => !planet.water[p]) ?? c;
    culture[cell] = planet.culture[c];
    religion[cell] = planet.religion[c];
    state[cell] = planet.state[c];
    provinceOf[cell] = planet.province[c];
  }
  const ground: Ground = { params, mesh, height, water, feature, features, coast, temperature, precipitation: rain, flux: hydro.flux, river: hydro.river, rivers: hydro.rivers, biome, scale };

  // Each people's tongue is copied for this close-up: names come out the same however often or after whatever else the
  // region is opened, and a village never repeats another's name.
  const cultures = planet.cultures.map((item) => ({ ...item, language: { ...item.language } }));
  // Rivers keep the planet's names where they run in the same bed.
  const names = rng.fork("names");
  for (const river of hydro.rivers.slice(1)) {
    const last = river.cells[river.cells.length - 1];
    const parentRiver = planet.river[nearest[last]] || planet.river[nearest[river.cells[Math.floor(river.cells.length / 2)]]];
    river.name = parentRiver ? planet.rivers[parentRiver].name : name(cultures[culture[last]]?.language ?? cultures[0].language, names, "river");
  }
  for (const item of features.slice(1)) {
    const any = Array.from({ length: n }, (_, cell) => cell).find((cell) => feature[cell] === item.id);
    if (any !== undefined) item.name = planet.features[planet.feature[nearest[any]]]?.name ?? "";
  }

  // Towns of the planet, then villages and hamlets on good land between them.
  const burg = new Int32Array(n);
  const burgs: Burg[] = [{ ...planet.burgs[0] }];
  for (const town of planet.burgs.slice(1)) {
    if (town.removed) continue;
    if (town.x < x0 || town.x > x1 || town.y < y0 || town.y > y1) continue;
    const [x, y] = toRegion(town.x, town.y);
    // The finer coast may have moved: take the nearest dry cell within a few rings.
    let cell = mesh.find(x, y);
    let ring = [cell];
    const seen = new Set(ring);
    for (let step = 0; water[cell] && step < 8; step++) {
      const next: number[] = [];
      for (const c of ring) for (const m of mesh.neighbors[c]) if (!seen.has(m)) (seen.add(m), next.push(m));
      const dry = next.find((c) => !water[c]);
      if (dry !== undefined) cell = dry;
      ring = next;
    }
    if (water[cell] || burg[cell]) continue;
    const id = burgs.length;
    burgs.push({ ...town, id, cell, x, y, origin: town.origin ?? town.id });
    burg[cell] = id;
  }
  const scores = new Float32Array(n);
  for (let cell = 0; cell < n; cell++) scores[cell] = inside(nearest[cell]) && !water[cell] ? suitability(ground, cell) : 0;
  const villages = Math.min(160, Math.round(own.length * 1.6 + 8));
  const spacing = mesh.spacing * 3.2;
  const candidates = Array.from({ length: n }, (_, cell) => cell)
    .filter((cell) => scores[cell] > 0)
    .sort((a, b) => scores[b] * ((a * 7919) % 97 + 50) - scores[a] * ((b * 7919) % 97 + 50));
  const villagers = rng.fork("villages");
  for (const cell of candidates) {
    if (burgs.length > villages + 20) break;
    if (burgs.some((b) => b.cell >= 0 && Math.hypot(b.x - mesh.x[cell], b.y - mesh.y[cell]) < spacing)) continue;
    const people = cultures[culture[cell]] ?? cultures[0];
    const id = burgs.length;
    const port = coast[cell] === 1 && villagers.chance(0.4);
    burgs.push({
      id,
      name: name(people.language, villagers, villagers.chance(0.15) ? "fort" : "town"),
      cell,
      x: mesh.x[cell],
      y: mesh.y[cell],
      culture: culture[cell],
      state: state[cell],
      province: provinceOf[cell],
      capital: false,
      port,
      population: Math.round(villagers.float(0.05, 0.9) * 100) / 100,
      walls: villagers.chance(0.05),
      citadel: false,
      temple: villagers.chance(0.4),
      market: villagers.chance(0.25),
      shanty: false,
      kind: people.kind,
    });
    burg[cell] = id;
  }

  // Villages grow and are guarded by the world's age, like its towns; the best placed are the largest.
  const setting = settingOf(planet.params.setting);
  const villageList = burgs.filter((village) => village.id && village.origin === undefined);
  rankVillages(villageList, rng.fork("ranks"));
  settleAge(villageList, setting, rng.fork("age"));
  const rural = isClassic(setting) ? 1 : peopleOf(setting).rural;

  // Roads: planet's road builder over a copy of the states whose "capital" is their biggest town here.
  // The realms as they stand in this frame: how much of each is here decides how many airports and air routes it gets.
  const here = new Map<number, number>();
  for (let cell = 0; cell < n; cell++) if (!water[cell] && inside(nearest[cell])) here.set(state[cell], (here.get(state[cell]) ?? 0) + 1);
  const states = planet.states.map((s) => ({ ...s, cells: s.id ? here.get(s.id) ?? 0 : s.cells, pole: toRegion(s.pole[0], s.pole[1]) as [number, number], capital: burgs.find((b) => b.capital && b.state === s.id)?.id ?? 0 }));
  const roadStates = states.map((s) => ({ ...s, capital: s.capital || (burgs.filter((b) => b.state === s.id && b.id).sort((a, b) => b.population - a.population)[0]?.id ?? 0) }));
  const routes = buildRoutes(ground, burgs, roadStates, planetRoads(planet, mesh, water, toRegion));
  // The planet's own places keep their spot; the close-up's new ones keep clear of them.
  const local = placeMarkers(ground, culture, cultures, state, states, burgs, burg, routes, rng.fork("markers"));
  const markers = [local[0]];
  for (const place of planet.markers.slice(1)) {
    if (place.x < x0 || place.x > x1 || place.y < y0 || place.y > y1) continue;
    const [x, y] = toRegion(place.x, place.y);
    const cell = mesh.find(x, y);
    if (burg[cell]) continue;
    markers.push({ ...place, id: markers.length, cell, x, y, origin: place.id });
  }
  for (const place of local.slice(1)) if (!markers.some((other) => Math.hypot(other.x - place.x, other.y - place.y) < mesh.spacing * 2.5)) markers.push({ ...place, id: markers.length });
  const population = new Float32Array(n);
  // Country folk per cell, scaled to the cell's real size.
  for (let cell = 0; cell < n; cell++) if (!water[cell]) population[cell] = (suitability(ground, cell) * 0.3 * mesh.area[cell] * k * k * rural) / (parent.spacing * parent.spacing);
  const provinces = planet.provinces.map((p) => ({ ...p, pole: toRegion(p.pole[0], p.pole[1]) as [number, number], burg: burgs.find((b) => b.origin === p.burg)?.id ?? 0 }));
  const landUse = landUseOf(ground, burgs);
  const { fief, fiefs } = fiefsOf(ground, state, burgs);
  const landforms = landformsOf(ground, culture, cultures, rng.fork("landforms"));
  return { ...ground, name: title, population, culture, cultures: planet.cultures, religion, religions: planet.religions, burg, burgs, state, states, province: provinceOf, provinces, routes, markers, frame: [x0, y0, x1, y1], landUse, fief, fiefs, landforms };
}
