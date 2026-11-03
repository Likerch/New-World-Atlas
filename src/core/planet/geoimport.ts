// Relief and place names from GeoJSON: polygons with a height (Azgaar's "cells" export, or any GIS cells with an
// elevation) become a planet's relief, and named points (Azgaar's "burgs", any GIS places) become words on its map.
// Coordinates are read north-up and fitted into the map; heights from 0 to 100 are read on the Atlas's (and Azgaar's)
// own scale with the sea at 20, larger ones as metres above or below the sea.
import { SEA_LEVEL } from "./model";

type Box = [number, number, number, number];
type Ring = number[][];

export interface GeoRelief {
  width: number;
  height: number;
  heights: number[];
  /** The source's own bounds, so a file of places read later lands where the relief did. */
  box: Box;
}

export interface GeoImport {
  image?: GeoRelief;
  /** Words for the map: x, y (in the map's units), the name, its size. */
  labels: [number, number, string, number][];
}

const HEIGHT_KEYS = ["height", "h", "elevation", "elev", "altitude", "z"];
const NAME_KEYS = ["name", "Name", "NAME", "title"];

function inside(x: number, y: number, ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) hit = !hit;
  }
  return hit;
}

/** Reads a GeoJSON document for a map of the given size; null when it holds neither heights nor named places. */
export function fromGeoJSON(data: unknown, size: { width: number; height: number }, known?: Box): GeoImport | null {
  const doc = data as { type?: string; features?: unknown[] } | null;
  const features = (doc?.type === "FeatureCollection" ? doc.features : doc?.type === "Feature" ? [doc] : null) as
    | { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> | null }[]
    | null;
  if (!features?.length) return null;
  const cells: { rings: Ring[]; value: number }[] = [];
  const places: { at: number[]; name: string; big: boolean; weight: number }[] = [];
  for (const feature of features) {
    const props = feature.properties ?? {};
    const geometry = feature.geometry;
    if (!geometry) continue;
    const value = HEIGHT_KEYS.map((key) => props[key]).find((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (value !== undefined && (geometry.type === "Polygon" || geometry.type === "MultiPolygon")) {
      const polygons = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates) as Ring[][];
      for (const polygon of polygons) if (polygon?.[0]?.length > 2) cells.push({ rings: [polygon[0]], value });
    }
    const label = NAME_KEYS.map((key) => props[key]).find((v): v is string => typeof v === "string" && v.trim() !== "");
    if (label && geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
      const weight = Number(props.population ?? props.pop ?? 0) || 0;
      places.push({ at: geometry.coordinates as number[], name: label.trim(), big: Boolean(props.capital) || weight > 50, weight });
    }
  }
  if (!cells.length && !places.length) return null;

  // The source's bounds: the relief's own, or those a relief was read with before.
  let box: Box = known ?? [Infinity, Infinity, -Infinity, -Infinity];
  if (!known) {
    const grow = (x: number, y: number) => (box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]);
    if (cells.length) for (const cell of cells) for (const [x, y] of cell.rings[0]) grow(x, y);
    else for (const place of places) grow(place.at[0], place.at[1]);
  }
  const [x0, y0, x1, y1] = box;
  const span = Math.max(x1 - x0, 1e-9),
    rise = Math.max(y1 - y0, 1e-9);
  // Fitted whole into the map's frame, centred, north up.
  const fit = Math.min(size.width / span, size.height / rise);
  const toMap = (x: number, y: number): [number, number] => [(size.width - span * fit) / 2 + (x - x0) * fit, (size.height - rise * fit) / 2 + (y1 - y) * fit];

  const out: GeoImport = { labels: [] };
  if (cells.length) {
    const values = cells.map((cell) => cell.value);
    const low = Math.min(...values),
      high = Math.max(...values);
    const own = low >= 0 && high <= 100 && high >= SEA_LEVEL;
    const scale = (v: number) => (own ? v : v >= 0 ? SEA_LEVEL + (v / Math.max(high, 1)) * (100 - SEA_LEVEL) : SEA_LEVEL + (v / Math.max(-low, 1)) * SEA_LEVEL);
    const W = 200,
      H = Math.round((200 * size.height) / size.width);
    const heights = new Array<number>(W * H).fill(SEA_LEVEL / 2);
    for (const cell of cells) {
      const ring = cell.rings[0].map(([x, y]) => toMap(x, y)).map(([x, y]) => [(x / size.width) * W, (y / size.height) * H]);
      const xs = ring.map((p) => p[0]),
        ys = ring.map((p) => p[1]);
      const h = Math.round(scale(cell.value));
      for (let gy = Math.max(0, Math.floor(Math.min(...ys))); gy <= Math.min(H - 1, Math.ceil(Math.max(...ys))); gy++)
        for (let gx = Math.max(0, Math.floor(Math.min(...xs))); gx <= Math.min(W - 1, Math.ceil(Math.max(...xs))); gx++) if (inside(gx + 0.5, gy + 0.5, ring)) heights[gy * W + gx] = h;
    }
    out.image = { width: W, height: H, heights, box };
  }
  // The largest places first, so a crowded map keeps the ones that matter.
  for (const place of places.sort((a, b) => Number(b.big) - Number(a.big) || b.weight - a.weight).slice(0, 300)) {
    const [x, y] = toMap(place.at[0], place.at[1]);
    out.labels.push([Math.round(x), Math.round(y), place.name, place.big ? 13 : 9]);
  }
  return out;
}
