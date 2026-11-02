// The planet pipeline: relief → water bodies → climate → rivers and lakes → biomes → peoples → settlements → states
// and provinces → roads → points of interest. Each step draws from its own random stream of the seed.
import { name } from "../language";
import { buildMesh } from "../mesh";
import { createRng, randomSeed } from "../random";
import { biomeOf } from "./biomes";
import { precipitation, temperatures } from "./climate";
import { placeBurgs } from "./burgs";
import { settleCultures, suitability } from "./cultures";
import { markFeatures } from "./features";
import { generateHeights, TEMPLATES } from "./heightmap";
import { placeMarkers } from "./markers";
import { SEA_LEVEL, type Ground, type Planet, type PlanetParams } from "./model";
import { spreadReligions } from "./religions";
import { hydrology } from "./rivers";
import { buildRoutes } from "./routes";
import { formStates } from "./states";

/** Parameters for a seed: every unset value is rolled from the seed itself. */
export function planetParams(input: Partial<PlanetParams> = {}): PlanetParams {
  const seed = input.seed || randomSeed();
  const rng = createRng(seed).fork("params");
  const north = rng.int(15, 80);
  const span = rng.int(50, 110);
  return {
    seed,
    width: 1600,
    height: 1000,
    cells: 10_000,
    template: rng.pick(TEMPLATES.filter((template) => template !== "fractal")),
    latitudeNorth: north,
    latitudeSouth: Math.max(-90, north - span),
    temperatureEquator: 27,
    temperaturePole: -28,
    precipitation: 1,
    peakHeight: 6000,
    cultures: rng.int(8, 14),
    states: rng.int(10, 18),
    towns: 0,
    provinceShare: 0.35,
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "")),
  };
}

export function generatePlanet(input: Partial<PlanetParams> = {}): Planet {
  const params = planetParams(input);
  const rng = createRng(params.seed);
  const mesh = buildMesh(params.width, params.height, params.cells, rng.fork("mesh"));
  const height = generateHeights(mesh, params.template, rng.fork("relief"));
  const scale = ((params.latitudeNorth - params.latitudeSouth) * 111) / params.height;

  const sea = markFeatures(mesh, (cell) => height[cell] < SEA_LEVEL);
  const ocean = (cell: number) => height[cell] < SEA_LEVEL && sea.features[sea.feature[cell]].kind === "ocean";
  const temperature = temperatures(mesh, params, height, rng.fork("temperature"));
  const rain = precipitation(mesh, params, height, ocean, temperature, rng.fork("rain"));
  const hydro = hydrology(mesh, height, ocean, rain, scale);
  const water = new Uint8Array(mesh.cells);
  for (let cell = 0; cell < mesh.cells; cell++) water[cell] = ocean(cell) || hydro.lake[cell] ? 1 : 0;
  const { feature, features, coast } = markFeatures(mesh, (cell) => water[cell] === 1);

  const biome = new Uint8Array(mesh.cells);
  for (let cell = 0; cell < mesh.cells; cell++) {
    if (water[cell]) continue;
    const river = hydro.river[cell];
    const byLake = mesh.neighbors[cell].some((next) => water[next] && features[feature[next]].kind === "lake");
    const moisture = rain[cell] + (river ? Math.min(700, 120 + hydro.rivers[river].discharge / 20) : 0) + (byLake ? 150 : 0);
    // Marshes are patchy: only some low, soaked cells by a river or the shore turn to wetland.
    const patch = ((cell * 2654435761) >>> 0) % 3 === 0;
    biome[cell] = biomeOf(temperature[cell], moisture, height[cell] < 23, patch && (coast[cell] === 1 || river > 0));
  }

  const ground: Ground = { params, mesh, height, water, feature, features, coast, temperature, precipitation: rain, flux: hydro.flux, river: hydro.river, rivers: hydro.rivers, biome, scale };
  const { culture, cultures } = settleCultures(ground, params.cultures, rng.fork("cultures"));
  const { burg, burgs } = placeBurgs(ground, culture, cultures, params.states, params.towns, rng.fork("burgs"));
  const { state, states, province, provinces } = formStates(ground, culture, cultures, burgs, params.provinceShare, rng.fork("states"));

  // Country folk: thousands per cell, by how kind the land is.
  const population = new Float32Array(mesh.cells);
  const unit = mesh.spacing * mesh.spacing;
  for (let cell = 0; cell < mesh.cells; cell++) {
    if (water[cell]) continue;
    population[cell] = (suitability(ground, cell) * 0.3 * mesh.area[cell]) / unit;
    states[state[cell]].rural += population[cell];
    cultures[culture[cell]].population += population[cell];
  }
  for (const item of burgs.slice(1)) cultures[item.culture].population += item.population;
  const { religion, religions } = spreadReligions(ground, culture, cultures, burgs, state, states, population, rng.fork("religions"));

  // Names for the waters and lands, in the tongue of the people living there.
  const names = rng.fork("names");
  const speakerOf = (cells: number[]) => {
    const votes = new Map<number, number>();
    for (const cell of cells) if (culture[cell]) votes.set(culture[cell], (votes.get(culture[cell]) ?? 0) + 1);
    let bestId = 0;
    for (const [id, count] of votes) if (!bestId || count > (votes.get(bestId) ?? 0)) bestId = id;
    return cultures[bestId];
  };
  for (const river of hydro.rivers.slice(1)) river.name = name(speakerOf(river.cells).language, names, "river");
  const shoreOf = new Map<number, number[]>();
  for (let cell = 0; cell < mesh.cells; cell++) {
    if (!water[cell] && coast[cell] === 1) {
      for (const next of mesh.neighbors[cell]) if (water[next]) shoreOf.set(feature[next], [...(shoreOf.get(feature[next]) ?? []), cell]);
    }
  }
  const landOf = new Map<number, number[]>();
  for (let cell = 0; cell < mesh.cells; cell++) if (!water[cell]) landOf.set(feature[cell], [...(landOf.get(feature[cell]) ?? []), cell]);
  for (const item of features.slice(1)) {
    if (item.kind === "isle" || (item.kind === "lake" && item.cells < 3)) continue;
    const people = speakerOf(item.land ? landOf.get(item.id) ?? [] : shoreOf.get(item.id) ?? []);
    item.name = name(people.language, names, item.kind === "lake" ? "lake" : item.land ? "land" : "plain");
  }

  const routes = buildRoutes(ground, burgs, states);
  const markers = placeMarkers(ground, culture, cultures, state, states, burgs, burg, routes, rng.fork("markers"));
  const worldName = params.name || name((cultures[1] ?? cultures[0]).language, names, "land");
  return { ...ground, name: worldName, population, culture, cultures, religion, religions, burg, burgs, state, states, province, provinces, routes, markers };
}
