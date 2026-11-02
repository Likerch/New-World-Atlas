// Winds and ocean currents. Prevailing winds follow the latitude bands (trade winds, westerlies, polar easterlies);
// surface currents follow the wind out at sea and bend along the coasts near land, which closes them into gyres.
import type { Planet } from "./model";

/** The prevailing wind at a latitude as a screen vector (x east, y south), unit length. */
export function windAt(latitude: number): [number, number] {
  const a = Math.abs(latitude);
  const towardEquator = latitude >= 0 ? 1 : -1; // north of the equator, the equator lies down the map
  if (a < 30) return normalize([-1, 0.35 * towardEquator]);
  if (a < 60) return normalize([1, -0.3 * towardEquator]);
  return normalize([-1, 0.25 * towardEquator]);
}

function normalize([x, y]: [number, number]): [number, number] {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/** Surface current per cell (zero on land). */
export function oceanCurrents(planet: Planet): { u: Float32Array; v: Float32Array } {
  const { mesh, params, water, coast } = planet;
  const u = new Float32Array(mesh.cells);
  const v = new Float32Array(mesh.cells);
  for (let cell = 0; cell < mesh.cells; cell++) {
    if (!water[cell]) continue;
    const latitude = params.latitudeNorth - (mesh.y[cell] / params.height) * (params.latitudeNorth - params.latitudeSouth);
    let [wx, wy] = windAt(latitude);
    if (coast[cell] >= -3) {
      // Near land the water runs along the shore: the tangent of the coast-distance field, signed with the wind.
      let gx = 0,
        gy = 0;
      for (const next of mesh.neighbors[cell]) {
        const d = coast[next] - coast[cell];
        gx += (mesh.x[next] - mesh.x[cell]) * d;
        gy += (mesh.y[next] - mesh.y[cell]) * d;
      }
      const g = Math.hypot(gx, gy);
      if (g > 1e-6) {
        let tx = -gy / g,
          ty = gx / g;
        if (tx * wx + ty * wy < 0) [tx, ty] = [-tx, -ty];
        const blend = coast[cell] >= -1 ? 0.85 : 0.5;
        [wx, wy] = normalize([wx * (1 - blend) + tx * blend, wy * (1 - blend) + ty * blend]);
      }
    }
    u[cell] = wx;
    v[cell] = wy;
  }
  return { u, v };
}
