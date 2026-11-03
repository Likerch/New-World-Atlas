// A planet as GeoJSON, for other mapping tools: realms as polygons, towns and places as points, rivers and roads as
// lines, in longitude and latitude (a whole world spans 360°; a smaller map its true width at its middle latitude).
import { outline } from "../geometry";
import { wrapsRound } from "./geo";
import type { Planet } from "./model";

type Position = [number, number];

export function planetGeoJSON(planet: Planet): { type: "FeatureCollection"; features: unknown[] } {
  const { width, height, latitudeNorth: north, latitudeSouth: south } = planet.params;
  const middle = (north + south) / 2;
  const span = wrapsRound(planet.params) ? 360 : (width * planet.scale) / (111.32 * Math.max(0.05, Math.cos((middle * Math.PI) / 180)));
  const at = (x: number, y: number): Position => [Math.round(((x / width - 0.5) * span) * 1e5) / 1e5, Math.round((north - (y / height) * (north - south)) * 1e5) / 1e5];
  const cellAt = (cell: number) => at(planet.mesh.x[cell], planet.mesh.y[cell]);
  const features: unknown[] = [];
  for (const state of planet.states.slice(1)) {
    if (!state.cells) continue;
    const loops = outline(planet.mesh, (cell) => !planet.water[cell] && planet.state[cell] === state.id).map((loop) => {
      const ring = loop.map(([x, y]) => at(x, y));
      return [...ring, ring[0]];
    });
    features.push({ type: "Feature", properties: { kind: "realm", id: state.id, name: state.name, form: state.formKey, color: state.color, capital: planet.burgs[state.capital]?.name }, geometry: { type: "MultiPolygon", coordinates: loops.map((ring) => [ring]) } });
  }
  for (const burg of planet.burgs.slice(1)) if (!burg.removed) features.push({ type: "Feature", properties: { kind: "town", id: burg.id, name: burg.name, population: Math.round(burg.population * 1000), capital: burg.capital, port: burg.port, realm: planet.states[burg.state]?.name }, geometry: { type: "Point", coordinates: at(burg.x, burg.y) } });
  for (const river of planet.rivers.slice(1)) if (river.cells.length > 1) features.push({ type: "Feature", properties: { kind: "river", id: river.id, name: river.name, length: Math.round(river.length) }, geometry: { type: "LineString", coordinates: river.cells.map(cellAt) } });
  for (const route of planet.routes.slice(1)) if (route.cells.length > 1) features.push({ type: "Feature", properties: { kind: "route", id: route.id, road: route.kind, length: Math.round(route.length) }, geometry: { type: "LineString", coordinates: route.cells.map(cellAt) } });
  for (const marker of planet.markers.slice(1)) features.push({ type: "Feature", properties: { kind: "place", id: marker.id, place: marker.kind, name: marker.name, ...marker.facts }, geometry: { type: "Point", coordinates: at(marker.x, marker.y) } });
  return { type: "FeatureCollection", features };
}
