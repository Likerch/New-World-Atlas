// The planet on a globe: an orthographic view of the mapped lands turned to any longitude and latitude, with the
// graticule, the edge of the known world, and the unknown seas beyond it. The map spans as many degrees of longitude
// as its scale gives; the rest of the sphere is open sea nobody has charted.
import { borders, outline, smooth, type Point } from "../geometry";
import { toCyrillic } from "../language";
import { BIOMES } from "../planet/biomes";
import type { Planet } from "../planet/model";
import { defaultLayers, THEME, type LayerId, type ThemeId } from "./themes";

export interface GlobeOptions {
  theme?: ThemeId;
  layers?: Partial<Record<LayerId, boolean>>;
  script?: "latin" | "cyrillic";
  /** The longitude and latitude at the centre of the view, degrees; the map's own centre is longitude 0. */
  lon?: number;
  lat?: number;
  /** A map point to ring: the selected place. */
  mark?: Point | null;
}

export const GLOBE_SIZE = 1000;
const R = 470;
const C = GLOBE_SIZE / 2;
const RAD = Math.PI / 180;
const r1 = (value: number) => Math.round(value * 10) / 10;
const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

/** Degrees of longitude and latitude the flat map covers. */
export function globeSpan(planet: Planet): { lon: number; lat: number } {
  const { width, height, latitudeNorth, latitudeSouth } = planet.params;
  const lat = latitudeNorth - latitudeSouth;
  return { lon: Math.min(360, (lat * width) / height), lat };
}

function projector(planet: Planet, options: GlobeOptions) {
  const { width: W, height: H, latitudeNorth } = planet.params;
  const span = globeSpan(planet);
  const lon0 = (options.lon ?? 0) * RAD,
    lat0 = (options.lat ?? centreLatitude(planet)) * RAD;
  const sin0 = Math.sin(lat0),
    cos0 = Math.cos(lat0);
  /** A map point to the globe: [x, y, facing us]. Points round the back are pushed out to the rim. */
  return (point: Point): [number, number, boolean] => {
    const lon = ((point[0] / W - 0.5) * span.lon) * RAD - lon0;
    const lat = (latitudeNorth - (point[1] / H) * span.lat) * RAD;
    const x = Math.cos(lat) * Math.sin(lon);
    const y = cos0 * Math.sin(lat) - sin0 * Math.cos(lat) * Math.cos(lon);
    const front = sin0 * Math.sin(lat) + cos0 * Math.cos(lat) * Math.cos(lon) >= 0;
    if (front) return [C + x * R, C - y * R, true];
    const length = Math.hypot(x, y) || 1;
    return [C + (x / length) * R, C - (y / length) * R, false];
  };
}

function centreLatitude(planet: Planet): number {
  return (planet.params.latitudeNorth + planet.params.latitudeSouth) / 2;
}

/** The map point under a click on the globe, or null off the sphere and off the map. */
export function globePick(planet: Planet, x: number, y: number, options: GlobeOptions = {}): Point | null {
  const px = (x - C) / R,
    py = (C - y) / R;
  const rho = Math.hypot(px, py);
  if (rho > 1) return null;
  const lat0 = (options.lat ?? centreLatitude(planet)) * RAD;
  const c = Math.asin(rho);
  const lat = rho ? Math.asin(Math.cos(c) * Math.sin(lat0) + (py * Math.sin(c) * Math.cos(lat0)) / rho) : lat0;
  const lon = (options.lon ?? 0) * RAD + Math.atan2(px * Math.sin(c), rho * Math.cos(lat0) * Math.cos(c) - py * Math.sin(lat0) * Math.sin(c));
  const span = globeSpan(planet);
  let degrees = lon / RAD;
  degrees = ((((degrees + 180) % 360) + 360) % 360) - 180;
  const mx = (degrees / span.lon + 0.5) * planet.params.width;
  const my = ((planet.params.latitudeNorth - lat / RAD) / span.lat) * planet.params.height;
  return mx >= 0 && mx <= planet.params.width && my >= 0 && my <= planet.params.height ? [mx, my] : null;
}

/** Flat shapes are traced once per planet and style; turning the globe only reprojects them. */
type Traced = { fills: [string, Point[][]][]; coast: Point[][]; lakes: Point[][]; rivers: [Point[], number][]; borders: Point[][] };
const traced = new WeakMap<Planet, Map<string, Traced>>();

function trace(planet: Planet, themeId: ThemeId, layers: Record<LayerId, boolean>): Traced {
  const key = `${themeId}:${layers.depth}:${layers.biomes}:${layers.heights}:${layers.states}`;
  const cache = traced.get(planet) ?? new Map<string, Traced>();
  traced.set(planet, cache);
  const hit = cache.get(key);
  if (hit) return hit;
  const theme = THEME[themeId];
  const { mesh, water, coast } = planet;
  const land = (cell: number) => !water[cell];
  const loops = (inside: (cell: number) => boolean, rounds: number) => outline(mesh, inside).map((loop) => smooth(loop, true, rounds));
  const fills: [string, Point[][]][] = [];
  if (layers.depth) [9, 6, 3, 1].forEach((level, k) => fills.push([theme.ocean[k + 1], loops((cell) => land(cell) || coast[cell] >= -level, 2)]));
  const landLoops = loops(land, 2);
  fills.push([theme.land, landLoops]);
  if (layers.biomes && theme.biomes) for (const biome of BIOMES.slice(1)) fills.push([theme.biomes[biome.id], loops((cell) => land(cell) && planet.biome[cell] === biome.id, 1)]);
  if (layers.heights && theme.heights) theme.heights.forEach((color, k) => fills.push([color, loops((cell) => land(cell) && planet.height[cell] >= 20 + k * 8, 2)]));
  if (layers.states && theme.stateFill > 0) for (const state of planet.states.slice(1)) fills.push([`${state.color}" fill-opacity="${theme.stateFill}`, loops((cell) => land(cell) && planet.state[cell] === state.id, 1)]);
  const made: Traced = {
    fills,
    coast: landLoops,
    lakes: loops((cell) => water[cell] === 1 && planet.features[planet.feature[cell]].kind === "lake", 2),
    rivers: planet.rivers.slice(1).map((river): [Point[], number] => [smooth([...river.cells.map((cell): Point => [mesh.x[cell], mesh.y[cell]]), river.mouth], false, 2), river.width]),
    borders: borders(mesh, (cell) => (water[cell] ? -1 : planet.state[cell])).map((line) => smooth(line, false, 1)),
  };
  cache.set(key, made);
  return made;
}

export function renderGlobe(planet: Planet, options: GlobeOptions = {}): string {
  const themeId = options.theme ?? "atlas";
  const theme = THEME[themeId];
  const layers = { ...defaultLayers(themeId), ...options.layers };
  const { width: W, height: H } = planet.params;
  const project = projector(planet, options);
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const shapes = trace(planet, themeId, layers);

  // A filled shape keeps the parts that face us, closed along the rim; a line is cut where it goes round the back.
  const area = (rings: Point[][]) => {
    let d = "";
    for (const ring of rings) {
      const projected = ring.map(project);
      if (!projected.some((p) => p[2])) continue;
      d += `M${projected.map((p) => `${r1(p[0])},${r1(p[1])}`).join("L")}Z`;
    }
    return d;
  };
  const line = (points: Point[]) => {
    let d = "";
    let pen = false;
    for (const point of points) {
      const [x, y, front] = project(point);
      if (!front) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${r1(x)},${r1(y)}`;
      pen = true;
    }
    return d;
  };
  const dense = (from: Point, to: Point, steps: number) => Array.from({ length: steps + 1 }, (_, k): Point => [from[0] + ((to[0] - from[0]) * k) / steps, from[1] + ((to[1] - from[1]) * k) / steps]);

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GLOBE_SIZE} ${GLOBE_SIZE}" width="${GLOBE_SIZE}" height="${GLOBE_SIZE}" font-family="${esc(theme.font)}">`);
  out.push(
    `<defs><clipPath id="globe-clip"><circle cx="${C}" cy="${C}" r="${R}"/></clipPath>` +
      `<radialGradient id="globe-shade" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>` +
      `<pattern id="unknown" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0V10" stroke="${theme.ink}" stroke-width="0.6" opacity="0.18"/></pattern></defs>`,
  );
  out.push(`<rect width="${GLOBE_SIZE}" height="${GLOBE_SIZE}" fill="${themeId === "night" || themeId === "hud" ? "#05070d" : "#0e1420"}"/>`);
  out.push(`<circle cx="${C}" cy="${C}" r="${R + 10}" fill="none" stroke="#7fb4ff" stroke-width="14" opacity="0.12"/>`);
  out.push(`<g clip-path="url(#globe-clip)"><circle cx="${C}" cy="${C}" r="${R}" fill="${theme.ocean[0]}"/><circle cx="${C}" cy="${C}" r="${R}" fill="url(#unknown)"/>`);
  const edge: Point[] = [...dense([0, 0], [W, 0], 60), ...dense([W, 0], [W, H], 40), ...dense([W, H], [0, H], 60), ...dense([0, H], [0, 0], 40)];
  out.push(`<path d="${area([edge])}" fill="${theme.ocean[0]}"/>`);
  for (const [fill, rings] of shapes.fills) {
    const d = area(rings);
    if (d) out.push(`<path d="${d}" fill="${fill}" fill-rule="evenodd"/>`);
  }
  const lakes = area(shapes.lakes);
  if (lakes) out.push(`<path d="${lakes}" fill="${theme.lake}" fill-rule="evenodd"/>`);
  out.push(`<path d="${shapes.coast.map((ring) => line([...ring, ring[0]])).join("")}" fill="none" stroke="${theme.coast}" stroke-width="${theme.coastWidth}" stroke-linejoin="round"/>`);
  if (layers.rivers) out.push(`<g fill="none" stroke="${theme.river}" stroke-linecap="round">${shapes.rivers.map(([points, width]) => `<path d="${line(points)}" stroke-width="${r1(Math.max(0.5, width * 0.8))}"/>`).join("")}</g>`);
  if (layers.borders) out.push(`<path d="${shapes.borders.map(line).join("")}" fill="none" stroke="${theme.border}" stroke-width="1" stroke-dasharray="4 2.2"/>`);
  // The graticule every 15°, across the whole sphere.
  const span = globeSpan(planet);
  const toMap = (lon: number, lat: number): Point => [(lon / span.lon + 0.5) * W, ((planet.params.latitudeNorth - lat) / span.lat) * H];
  const grid: string[] = [];
  for (let lon = -180; lon < 180; lon += 15) grid.push(line(Array.from({ length: 61 }, (_, k) => toMap(lon, -90 + k * 3))));
  for (let lat = -75; lat <= 75; lat += 15) grid.push(line(Array.from({ length: 121 }, (_, k) => toMap(-180 + k * 3, lat))));
  out.push(`<path d="${grid.join("")}" fill="none" stroke="${theme.grid}" stroke-width="0.8"/>`);
  out.push(`<path d="${line(Array.from({ length: 121 }, (_, k) => toMap(-180 + k * 3, 0)))}" fill="none" stroke="${theme.grid}" stroke-width="1.8"/>`);
  out.push(`<path d="${line(edge)}" fill="none" stroke="${theme.ink}" stroke-width="1.2" stroke-dasharray="6 4" opacity="0.6"/>`);
  // Towns and names on the side that faces us.
  if (layers.burgs) {
    for (const burg of planet.burgs.slice(1)) {
      if (burg.removed || (!burg.capital && burg.population < 20)) continue;
      const [x, y, front] = project([burg.x, burg.y]);
      if (front) out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${burg.capital ? 3.4 : 2}" fill="${theme.burg}" stroke="${theme.burgStroke}" stroke-width="1"/>`);
    }
  }
  if (layers.labels) {
    out.push(`<g text-anchor="middle" fill="${theme.label}" stroke="${theme.halo}" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round">`);
    for (const state of planet.states.slice(1)) {
      if (!state.cells) continue;
      const [x, y, front] = project(state.pole);
      if (front && Math.hypot(x - C, y - C) < R * 0.9) out.push(`<text x="${r1(x)}" y="${r1(y)}" font-size="${r1(Math.min(22, 9 + Math.sqrt(state.cells) * 0.35))}" letter-spacing="1.5" font-weight="600">${text(state.name.toUpperCase())}</text>`);
    }
    for (const burg of planet.burgs.slice(1)) {
      if (!burg.capital || burg.removed) continue;
      const [x, y, front] = project([burg.x, burg.y]);
      if (front && Math.hypot(x - C, y - C) < R * 0.92) out.push(`<text x="${r1(x)}" y="${r1(y - 6)}" font-size="10">${text(burg.name)}</text>`);
    }
    out.push(`</g>`);
  }
  if (options.mark) {
    const [x, y, front] = project(options.mark);
    if (front) out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="9" fill="none" stroke="#ffd34d" stroke-width="2.5"/>`);
  }
  out.push(`<circle cx="${C}" cy="${C}" r="${R}" fill="url(#globe-shade)"/></g>`);
  out.push(`<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#9cc4ff" stroke-width="1.5" opacity="0.5"/>`);
  out.push(`<text x="${C}" y="${GLOBE_SIZE - 6}" text-anchor="middle" font-size="16" letter-spacing="3" fill="#d8dfe8">${text(planet.name.toUpperCase())}</text></svg>`);
  return out.join("");
}
