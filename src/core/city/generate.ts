// The city pipeline: layout → streets → buildings → landmarks; and how a town on the planet becomes a city map that
// keeps its river, its coast, its walls and its people's language.
import { createLanguage, name } from "../language";
import { createRng, randomSeed } from "../random";
import type { Planet } from "../planet/model";
import { buildBuildings } from "./buildings";
import { placeLandmarks } from "./landmarks";
import { layoutCity } from "./layout";
import { ERAS, type City, type CityParams, type Era } from "./model";
import { buildStreets } from "./streets";

export function cityParams(input: Partial<CityParams> = {}): CityParams {
  const seed = input.seed || randomSeed();
  const rng = createRng(seed).fork("city-params");
  const era: Era = input.era ?? rng.pick(ERAS);
  const big = era === "modern" || era === "cyberpunk";
  return {
    seed,
    name: "",
    width: 1200,
    height: 900,
    population: big ? Math.round(rng.float(200, 2500)) : Math.round(rng.float(3, 60) * 10) / 10,
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

export function generateCity(input: Partial<CityParams> = {}, language = createLanguage(createRng(input.seed ?? "city").fork("language"))): City {
  const params = cityParams(input);
  // A copy of the people's language: the same town must get the same names however often it is opened.
  language = { ...language };
  const rng = createRng(params.seed);
  const layout = layoutCity(params, rng.fork("layout"));
  const net = buildStreets(params, layout, language, rng.fork("streets"));
  const buildings = buildBuildings(params, layout, net, rng.fork("buildings"));
  const landmarks = placeLandmarks(params, layout, buildings, language, rng.fork("landmarks"));
  const cityName = params.name || name(language, rng.fork("name"), "town");
  const counts = new Map<number, number>();
  for (const building of buildings) if (building.kind !== "tree" && building.kind !== "field" && building.kind !== "grave") counts.set(building.ward, (counts.get(building.ward) ?? 0) + 1);
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
    streets: net.streets,
    walls: layout.walls,
    sea: layout.sea,
    river: layout.river,
    bridges: net.bridges,
    landmarks,
    language,
  };
}

/** City parameters for a town of a generated planet: its size, river, coast, defences and people. */
export function cityFromBurg(planet: Planet, burgId: number, era: Era): { params: CityParams; language: City["language"] } {
  const burg = planet.burgs[burgId];
  const { mesh } = planet;
  const cell = burg.cell;
  const waterAround = mesh.neighbors[cell].filter((next) => planet.water[next]);
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
  const modern = era === "modern" || era === "cyberpunk";
  return {
    params: cityParams({
      seed: `${planet.params.seed}/burg-${burgId}`,
      name: burg.name,
      population: Math.max(0.5, modern ? burg.population * 25 : burg.population),
      era,
      coast,
      river,
      walls: burg.walls,
      citadel: burg.citadel,
      port: burg.port,
      temple: burg.temple,
      market: burg.market,
      shanty: burg.shanty,
    }),
    language: planet.cultures[burg.culture].language,
  };
}
