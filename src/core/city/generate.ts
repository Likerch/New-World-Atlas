// The city pipeline: layout → streets → buildings → landmarks → the places a bigger town and its world add; and how a
// town on the planet becomes a city map that keeps its river, its coast, its walls, its people's language, its roads,
// its faith and arms, and what kind of town its realm and people make of it.
import { createLanguage, name, type Language } from "../language";
import { armsOf } from "../planet/arms";
import { BIOMES } from "../planet/biomes";
import { createRng, randomSeed } from "../random";
import { ageOf, isClassic, peopleOf, settingOf, SETTINGS } from "../setting";
import type { Planet } from "../planet/model";
import { buildBuildings } from "./buildings";
import { placeLandmarks } from "./landmarks";
import { layoutCity, type Layout } from "./layout";
import { ERAS, type City, type CityParams, type CityRoad, type Era, type Street } from "./model";
import { morePlaces } from "./places";
import { buildStreets, edgeKey, type StreetNet } from "./streets";
import { generateVillage } from "./village";

export function cityParams(input: Partial<CityParams> = {}): CityParams {
  const seed = input.seed || randomSeed();
  const rng = createRng(seed).fork("city-params");
  const era: Era = input.era ?? rng.pick(ERAS);
  const big = era === "modern" || era === "cyberpunk" || era === "far-future";
  const population = big ? Math.round(rng.float(200, 2500)) : Math.round(rng.float(3, 60) * 10) / 10;
  return {
    seed,
    name: "",
    width: 1200,
    height: 900,
    population: era === "stone" ? Math.round(population * 10) / 1000 : era === "post-apocalypse" ? Math.round(population * 3) / 10 : population,
    era,
    coast: rng.chance(0.45) ? rng.float(0, Math.PI * 2) : null,
    river: rng.chance(0.6) ? rng.float(0, Math.PI * 2) : null,
    walls: rng.chance(0.8),
    citadel: rng.chance(0.5),
    port: true,
    temple: true,
    market: true,
    shanty: rng.chance(0.4),
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
  };
}

/** The first stages of a town, which the GM's edits of its quarters build on again: its layout and its streets. */
export function cityStages(params: CityParams, language: Language): { layout: Layout; net: StreetNet } {
  const rng = createRng(params.seed);
  const layout = layoutCity(params, rng.fork("layout"));
  const net = buildStreets(params, layout, language, rng.fork("streets"));
  return { layout, net };
}

export function generateCity(input: Partial<CityParams> = {}, tongue?: Language): City {
  const params = cityParams(input);
  // A copy of the people's language: the same town must get the same names however often it is opened. A city of its
  // own speaks a tongue of its own seed.
  const language = { ...(tongue ?? createLanguage(createRng(params.seed).fork("language"))) };
  // A village or a hamlet (a stone-age camp is already one).
  if ((params.settlement === "village" || params.settlement === "hamlet") && params.era !== "stone") return generateVillage(params, language);
  const rng = createRng(params.seed);
  const { layout, net } = cityStages(params, language);
  // Boulevards where old walls were pulled down are broad streets: the houses stand back from them.
  if (layout.boulevards?.length) for (const line of layout.oldLines ?? []) for (let k = 1; k < line.length; k++) net.major.add(edgeKey(line[k - 1], line[k]));
  const alleys: { ward: number; a: [number, number]; b: [number, number]; width: number }[] = [];
  const slope = layout.slope ?? undefined;
  const buildings = buildBuildings(params, layout, net, rng.fork("buildings"), { alleys, ...(slope ? { slope } : {}) });
  const landmarks = placeLandmarks(params, layout, buildings, language, rng.fork("landmarks"));
  // Places of a bigger town and of its world, after the first ones: those keep their numbers.
  const more = morePlaces(params, layout, buildings, landmarks, language, rng.fork("places"));
  landmarks.push(...more.landmarks);
  buildings.push(...more.buildings);
  // New names (old gates, alleys, boulevards) come from a copy of the tongue, so the quarters keep theirs.
  const laneTongue = { ...language };
  // The gates of an old wall still standing: where the main streets pass through it.
  if (layout.oldLines?.length && !layout.boulevards?.length) {
    const through = new Set([...net.major].flatMap((key) => key.split(":").map(Number)));
    const gates = rng.fork("old-gates");
    let next = landmarks.reduce((top, landmark) => Math.max(top, landmark.id), 0) + 1;
    for (const line of layout.oldLines)
      for (const corner of [...new Set(line)].filter((c) => through.has(c)).slice(0, 6)) {
        const [x, y] = layout.diagram.corners[corner];
        const ward = layout.diagram.sites.reduce((best, site, k) => (Math.hypot(site[0] - x, site[1] - y) < Math.hypot(layout.diagram.sites[best][0] - x, layout.diagram.sites[best][1] - y) ? k : best), 0);
        landmarks.push({ id: next++, kind: "old-gate", x, y, ward, name: name(laneTongue, gates, "plain") });
      }
  }
  // Alleys through the walled town's quarters, every other one named, after the streets the town already had.
  const lanes = rng.fork("alleys");
  const streets: Street[] = [...net.streets];
  for (const alley of alleys) streets.push({ id: streets.length, kind: "alley", points: [alley.a, alley.b], width: alley.width, name: lanes.chance(0.5) ? name(laneTongue, lanes, "plain") : "" });
  for (const ring of layout.boulevards ?? []) streets.push({ id: streets.length, kind: "boulevard", points: ring, width: Math.max(28 / layout.scale, 4), name: name(laneTongue, lanes, "plain") });
  const cityName = params.name || name(language, rng.fork("name"), "town");
  const counts = new Map<number, number>();
  for (const building of buildings) if (!["tree", "field", "grave", "fire", "stone", "mound", "pen", "rack", "boat"].includes(building.kind)) counts.set(building.ward, (counts.get(building.ward) ?? 0) + 1);
  const names = rng.fork("ward-names");
  const wards = layout.diagram.sites.map((site, id) => ({
    id,
    kind: layout.kinds[id],
    polygon: layout.diagram.cells[id],
    center: site,
    urban: layout.urban[id],
    name: layout.urban[id] && !layout.water[id] ? name(language, names, "plain") : "",
    wealth: layout.wealth[id],
    angle: layout.angles[id],
    buildings: counts.get(id) ?? 0,
  }));
  return {
    params: { ...params, name: cityName },
    name: cityName,
    scale: layout.scale,
    center: layout.center,
    wards: wards.filter((_, id) => !layout.water[id]),
    buildings,
    streets,
    walls: layout.walls,
    sea: layout.sea,
    river: layout.river,
    bridges: net.bridges,
    landmarks,
    language,
    ...(layout.lake ? { lake: layout.lake } : {}),
    ...(layout.rings ? { growth: { rings: Object.fromEntries(layout.rings.flatMap((ring, ward) => (layout.water[ward] ? [] : [[ward, ring]]))), ages: layout.ringAges ?? [] } } : {}),
    ...(params.roads?.length ? { gateRoads: gateRoads(layout.center, layout.walls, params.roads) } : {}),
  };
}

/** Which road of the world each gate of the town wall opens on: the nearest heading, each road to one gate. */
export function gateRoads(center: [number, number], walls: City["walls"], roads: CityRoad[]): (number | null)[] {
  const wall = walls.find((item) => !item.citadel && !item.old);
  if (!wall) return [];
  const out: (number | null)[] = wall.gates.map(() => null);
  const pairs = wall.gates.flatMap((gate, g) => roads.map((road, r) => {
    const heading = Math.atan2(gate[1] - center[1], gate[0] - center[0]);
    return { g, r, gap: Math.abs(Math.atan2(Math.sin(heading - road.angle), Math.cos(heading - road.angle))) };
  })).sort((a, b) => a.gap - b.gap);
  const used = new Set<number>();
  for (const pair of pairs) if (out[pair.g] === null && !used.has(pair.r) && pair.gap < Math.PI / 2) ((out[pair.g] = pair.r), used.add(pair.r));
  return out;
}

/** The city age of a planet's world: its setting's age. */
export function cityEraOf(planet: Planet): Era {
  return ageOf(settingOf(planet.params.setting));
}

/** City parameters for a town of a generated planet: its size, river, coast, defences and people; by default in the world's own age. */
export function cityFromBurg(planet: Planet, burgId: number, era: Era = cityEraOf(planet)): { params: CityParams; language: City["language"] } {
  const burg = planet.burgs[burgId];
  const { mesh } = planet;
  const cell = burg.cell;
  let waterAround = mesh.neighbors[cell].filter((next) => planet.water[next]);
  // A port on a fine close-up mesh may sit a few cells from its water: look a little further.
  for (let ring = mesh.neighbors[cell], step = 0; burg.port && !waterAround.length && step < 3; step++) {
    ring = [...new Set(ring.flatMap((c) => mesh.neighbors[c]))];
    waterAround = ring.filter((next) => planet.water[next]);
  }
  const coast = waterAround.length ? Math.atan2(waterAround.reduce((s, c) => s + mesh.y[c], 0) / waterAround.length - mesh.y[cell], waterAround.reduce((s, c) => s + mesh.x[c], 0) / waterAround.length - mesh.x[cell]) : null;
  let river: number | null = null;
  const riverId = planet.river[cell];
  if (riverId) {
    const path = planet.rivers[riverId].cells;
    const at = path.indexOf(cell);
    const from = path[Math.max(0, at - 1)];
    const to = at + 1 < path.length ? path[at + 1] : null;
    river = to === null ? Math.atan2(planet.rivers[riverId].mouth[1] - mesh.y[from], planet.rivers[riverId].mouth[0] - mesh.x[from]) : Math.atan2(mesh.y[to] - mesh.y[from], mesh.x[to] - mesh.x[from]);
  }
  // A town already sized by its world's age keeps its people; one seen in another age grows or shrinks to it. The classic
  // world keeps its old rule, so its towns open as they always did.
  const world = settingOf(planet.params.setting);
  const modern = era === "modern" || era === "cyberpunk";
  const population = isClassic(world) ? (modern ? burg.population * 25 : burg.population) : (burg.population * peopleOf(SETTINGS[era]).urban) / peopleOf(world).urban;
  // What the world gives the town: its roads out, its faith and god, its arms, its land, whether it rules and who camps by it.
  const roads: CityRoad[] = [];
  for (const route of planet.routes ?? []) {
    // Sea lanes leave from the docks and air routes from the field, not through a gate.
    if (route.kind === "sea" || route.kind === "air") continue;
    const at = route.cells.indexOf(cell);
    if (at < 0) continue;
    for (const step of [-1, 1]) {
      const near = route.cells[at + step];
      if (near === undefined) continue;
      let to = "";
      for (let k = at + step; k >= 0 && k < route.cells.length; k += step) {
        const other = planet.burg?.[route.cells[k]];
        if (other && other !== burgId && planet.burgs[other] && !planet.burgs[other].removed) {
          to = planet.burgs[other].name;
          break;
        }
      }
      const angle = Math.atan2(mesh.y[near] - mesh.y[cell], mesh.x[near] - mesh.x[cell]);
      if (!roads.some((road) => Math.abs(Math.atan2(Math.sin(road.angle - angle), Math.cos(road.angle - angle))) < 0.35)) roads.push({ angle: Math.round(angle * 1000) / 1000, to, kind: route.kind });
    }
  }
  const religion = planet.religions?.[planet.religion?.[cell] ?? 0];
  const faith = religion && religion.id ? { name: religion.name, deity: religion.deity, holy: religion.center === (burg.origin ?? burgId) } : undefined;
  const state = planet.states[burg.state];
  const nomads = planet.cultures[burg.culture]?.kind === "nomadic" || state?.form === "horde";
  const arms = armsOf(planet, "burg", burgId);
  const biome = BIOMES[planet.biome[cell]]?.key;
  return {
    params: cityParams({
      // A town of a close-up is its planet's town: the same city, whichever map it is opened from.
      seed: `${planet.params.world ?? planet.params.seed}/burg-${burg.origin ?? burgId}`,
      name: burg.name,
      // A hamlet stays a hamlet: a few dozen people, not a town of five hundred.
      population: Math.max(era === "stone" ? 0.03 : burg.population < 0.5 ? 0.05 : 0.5, isClassic(world) ? population : Math.round(population * 100) / 100),
      era,
      coast,
      river,
      walls: burg.walls,
      citadel: burg.citadel,
      port: burg.port,
      temple: burg.temple,
      market: burg.market,
      shanty: burg.shanty,
      ...(roads.length ? { roads } : {}),
      ...(burg.capital ? { capital: true } : {}),
      ...(faith ? { faith } : {}),
      ...(nomads ? { nomads: true } : {}),
      ...(world.magic ? { magic: world.magic } : {}),
      ...(biome ? { biome } : {}),
      ...(arms && era !== "stone" ? { arms } : {}),
      // A close-up's villages and hamlets open as what they are, not as small towns.
      ...(burg.tier ? { settlement: burg.tier } : {}),
    }),
    language: planet.cultures[burg.culture].language,
  };
}
