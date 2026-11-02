// Plain JSON of a planet for saving and for other tools (Marinara Worlds, VTTs, GIS): parameters to regenerate it
// exactly, per-cell layers, and every entity with its facts.
import type { Planet } from "./model";

export interface PlanetJson {
  format: "new-world-atlas/planet";
  version: 1;
  name: string;
  params: Planet["params"];
  /** Km per map unit. */
  scale: number;
  cells: {
    x: number[];
    y: number[];
    height: number[];
    water: number[];
    biome: number[];
    temperature: number[];
    precipitation: number[];
    river: number[];
    culture: number[];
    state: number[];
    province: number[];
    burg: number[];
    population: number[];
  };
  features: Planet["features"];
  rivers: Planet["rivers"];
  cultures: Omit<Planet["cultures"][number], "language">[];
  burgs: Planet["burgs"];
  states: Planet["states"];
  provinces: Planet["provinces"];
  routes: Planet["routes"];
  markers: Planet["markers"];
}

const round = (values: ArrayLike<number>, digits = 1) => Array.from(values, (value) => Math.round(value * 10 ** digits) / 10 ** digits);

export function planetToJson(planet: Planet): PlanetJson {
  return {
    format: "new-world-atlas/planet",
    version: 1,
    name: planet.name,
    params: planet.params,
    scale: planet.scale,
    cells: {
      x: round(planet.mesh.x),
      y: round(planet.mesh.y),
      height: round(planet.height),
      water: Array.from(planet.water),
      biome: Array.from(planet.biome),
      temperature: round(planet.temperature),
      precipitation: round(planet.precipitation, 0),
      river: Array.from(planet.river),
      culture: Array.from(planet.culture),
      state: Array.from(planet.state),
      province: Array.from(planet.province),
      burg: Array.from(planet.burg),
      population: round(planet.population, 2),
    },
    features: planet.features,
    rivers: planet.rivers,
    cultures: planet.cultures.map(({ language: _language, ...culture }) => culture),
    burgs: planet.burgs,
    states: planet.states,
    provinces: planet.provinces,
    routes: planet.routes,
    markers: planet.markers,
  };
}
