// Climate: temperature from latitude and altitude; rain carried by the prevailing winds of each latitude band, picked
// up over water, wrung out by mountains and missing in their lee.
import { fbm, noise2 } from "../noise";
import type { Mesh } from "../mesh";
import type { Rng } from "../random";
import { SEA_LEVEL, type PlanetParams } from "./model";

export function latitudeOf(params: PlanetParams, y: number): number {
  return params.latitudeNorth - (y / params.height) * (params.latitudeNorth - params.latitudeSouth);
}

/** Metres above sea level for a land height (0–100 scale). */
export function altitude(params: PlanetParams, height: number): number {
  if (height < SEA_LEVEL) return 0;
  return ((height - SEA_LEVEL) / (100 - SEA_LEVEL)) ** 1.5 * params.peakHeight;
}

export function temperatures(mesh: Mesh, params: PlanetParams, height: Float32Array, rng: Rng): Float32Array {
  const out = new Float32Array(mesh.cells);
  const wobble = noise2(rng);
  const s = 4 / Math.max(mesh.width, mesh.height);
  for (let cell = 0; cell < mesh.cells; cell++) {
    const latitude = latitudeOf(params, mesh.y[cell]);
    const base = params.temperaturePole + (params.temperatureEquator - params.temperaturePole) * Math.cos((latitude * Math.PI) / 180) ** 1.1;
    const lapse = (altitude(params, height[cell]) / 1000) * 6.5;
    out[cell] = base - lapse + fbm(wobble, mesh.x[cell] * s, mesh.y[cell] * s, 3) * 2;
  }
  return out;
}

/** Which way the wind blows along x at a latitude: -1 westward (trade and polar easterlies), +1 eastward. */
function windX(latitude: number): number {
  const a = Math.abs(latitude);
  return a < 30 || a > 60 ? -1 : 1;
}

/** How much moisture air of this latitude brings: the wet tropics, dry horse latitudes, rainy mid-latitudes. */
function bandMoisture(latitude: number): number {
  const a = Math.abs(latitude);
  if (a < 8) return 1.25;
  if (a < 18) return 1.0;
  if (a < 34) return 0.55;
  if (a < 45) return 0.85;
  if (a < 62) return 1.0;
  return 0.6;
}

export function precipitation(mesh: Mesh, params: PlanetParams, height: Float32Array, water: (cell: number) => boolean, temperature: Float32Array, rng: Rng): Float32Array {
  const latitude = Float32Array.from({ length: mesh.cells }, (_, cell) => latitudeOf(params, mesh.y[cell]));
  const order = Array.from({ length: mesh.cells }, (_, cell) => cell).sort((a, b) => mesh.x[a] * windX(latitude[a]) - mesh.x[b] * windX(latitude[b]));
  const moisture = new Float32Array(mesh.cells);
  const rain = new Float32Array(mesh.cells);
  for (const cell of order) {
    const dir = windX(latitude[cell]);
    // Air arrives from upwind neighbours in the same wind band; at the map's edge, from an assumed open ocean.
    let incoming = 0;
    let sources = 0;
    let upwindHeight = height[cell];
    for (const next of mesh.neighbors[cell]) {
      if (windX(latitude[next]) !== dir || (mesh.x[next] - mesh.x[cell]) * dir >= 0) continue;
      incoming += moisture[next];
      upwindHeight = Math.min(upwindHeight, height[next]);
      sources++;
    }
    let air = sources ? incoming / sources : bandMoisture(latitude[cell]);
    const capacity = Math.max(0.15, Math.min(1.6, 0.55 + temperature[cell] * 0.035)) * bandMoisture(latitude[cell]) * 1.2;
    if (water(cell)) {
      air = Math.min(capacity, air + 0.08 + Math.max(0, temperature[cell]) * 0.004);
      rain[cell] = air * 0.08;
    } else {
      const climb = Math.max(0, height[cell] - upwindHeight);
      const share = Math.min(0.85, 0.07 + climb * 0.035 + Math.max(0, air - capacity) * 0.5);
      const fall = air * share;
      rain[cell] = fall;
      // Forests and soil give back part of the rain, so the interior is not bone dry.
      air = air - fall + fall * 0.55;
    }
    moisture[cell] = air;
  }
  // Soften the stripes the sweep leaves and convert to millimetres a year.
  const wobble = noise2(rng);
  const s = 6 / Math.max(mesh.width, mesh.height);
  const out = new Float32Array(mesh.cells);
  for (let cell = 0; cell < mesh.cells; cell++) {
    let sum = rain[cell] * 2;
    for (const next of mesh.neighbors[cell]) sum += rain[next];
    const value = sum / (mesh.neighbors[cell].length + 2);
    out[cell] = Math.max(0, value * 9000 * params.precipitation * (1 + fbm(wobble, mesh.x[cell] * s, mesh.y[cell] * s, 3) * 0.35));
  }
  return out;
}
