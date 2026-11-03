// The planet's geometry in kilometres: what a cell of the map measures on the ground.
import type { Mesh } from "../mesh";
import type { PlanetParams } from "./model";

/** A map of the whole planet: its longitudes go all the way round, so its left and right edges are one meridian. */
export function wrapsRound(params: PlanetParams): boolean {
  return params.latitudeNorth - params.latitudeSouth >= 179 && params.width >= params.height * 2 - 1;
}

/** A cell's area in km². A whole world is drawn plate carrée, so a cell near the poles covers far less ground than one
 * of the same size at the equator; a smaller map is drawn true to scale. */
export function cellKm2(world: { params: PlanetParams; mesh: Mesh; scale: number }, cell: number): number {
  const flat = world.mesh.area[cell] * world.scale * world.scale;
  if (!wrapsRound(world.params)) return flat;
  const { latitudeNorth: north, latitudeSouth: south, height } = world.params;
  const latitude = north - (world.mesh.y[cell] / height) * (north - south);
  return flat * Math.max(0.02, Math.cos((latitude * Math.PI) / 180));
}
