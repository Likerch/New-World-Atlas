// Polygon tools for the finer levels (cities, districts, buildings): convex clipping and splitting, insets, areas,
// distances. Polygons are open point lists in counter-clockwise order unless stated otherwise.
import type { Point } from "./geometry";

export function signedArea(poly: Point[]): number {
  let sum = 0;
  for (let k = 0; k < poly.length; k++) {
    const [ax, ay] = poly[k];
    const [bx, by] = poly[(k + 1) % poly.length];
    sum += ax * by - bx * ay;
  }
  return sum / 2;
}

export const area = (poly: Point[]) => Math.abs(signedArea(poly));

/** Counter-clockwise in screen space (y down) means a positive signed area here. */
export function ccw(poly: Point[]): Point[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

export function centroid(poly: Point[]): Point {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0,
    cy = 0;
  for (let k = 0; k < poly.length; k++) {
    const [ax, ay] = poly[k];
    const [bx, by] = poly[(k + 1) % poly.length];
    const cross = ax * by - bx * ay;
    cx += (ax + bx) * cross;
    cy += (ay + by) * cross;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Which side of the line a→b a point lies on: > 0 left, < 0 right. */
const side = (a: Point, b: Point, p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

function intersect(a: Point, b: Point, c: Point, d: Point): Point {
  const a1 = b[1] - a[1],
    b1 = a[0] - b[0],
    c1 = a1 * a[0] + b1 * a[1];
  const a2 = d[1] - c[1],
    b2 = c[0] - d[0],
    c2 = a2 * c[0] + b2 * c[1];
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-12) return [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
  return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
}

/** Keeps the part of a polygon on the left of the directed line a→b (one Sutherland–Hodgman pass). */
export function clipHalf(poly: Point[], a: Point, b: Point): Point[] {
  const out: Point[] = [];
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k];
    const q = poly[(k + 1) % poly.length];
    const sp = side(a, b, p) >= 0;
    const sq = side(a, b, q) >= 0;
    if (sp) out.push(p);
    if (sp !== sq) out.push(intersect(p, q, a, b));
  }
  return out;
}

/** The part of any polygon inside a convex counter-clockwise clip polygon. */
export function clipConvex(subject: Point[], clip: Point[]): Point[] {
  let out = subject;
  const orientation = signedArea(clip) >= 0 ? 1 : -1;
  for (let k = 0; k < clip.length && out.length; k++) {
    const a = clip[k];
    const b = clip[(k + 1) % clip.length];
    out = orientation > 0 ? clipHalf(out, a, b) : clipHalf(out, b, a);
  }
  return out;
}

/** Splits a convex polygon by the line through a point along a direction. */
export function splitConvex(poly: Point[], at: Point, dir: Point): [Point[], Point[]] {
  const b: Point = [at[0] + dir[0], at[1] + dir[1]];
  return [clipHalf(poly, at, b), clipHalf(poly, b, at)];
}

/**
 * Moves every edge of a convex polygon inwards by its own distance (edge k runs from point k to point k+1).
 * Returns null when the polygon vanishes.
 */
export function insetConvex(poly: Point[], distances: number[] | number): Point[] | null {
  const p = ccw(poly);
  const sign = signedArea(poly) < 0 ? -1 : 1;
  const n = p.length;
  const dist = (k: number) => (typeof distances === "number" ? distances : distances[sign > 0 ? k : (n - 2 - k + n) % n] ?? 0);
  // Each edge as a half-plane shifted inwards; intersect them all.
  let out: Point[] = p;
  for (let k = 0; k < n; k++) {
    const a = p[k];
    const b = p[(k + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // With a positive area the inside lies to the left of a→b; shift the edge that way.
    const nx = (a[1] - b[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const d = dist(k);
    out = clipHalf(out, [a[0] + nx * d, a[1] + ny * d], [b[0] + nx * d, b[1] + ny * d]);
    if (out.length < 3) return null;
  }
  return area(out) > 1e-6 ? out : null;
}

export function pointInPolygon(point: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Where segments a–b and c–d cross, if they do. */
export function segmentIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r: Point = [b[0] - a[0], b[1] - a[1]];
  const s: Point = [d[0] - c[0], d[1] - c[1]];
  const denom = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / denom;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * r[0], a[1] + t * r[1]] : null;
}

export function distanceToPolyline(p: Point, line: Point[]): number {
  let best = Infinity;
  for (let k = 1; k < line.length; k++) best = Math.min(best, distanceToSegment(p, line[k - 1], line[k]));
  return best;
}

/** The index of the longest edge. */
export function longestEdge(poly: Point[]): number {
  let best = 0;
  let length = -1;
  for (let k = 0; k < poly.length; k++) {
    const [ax, ay] = poly[k];
    const [bx, by] = poly[(k + 1) % poly.length];
    const l = (bx - ax) ** 2 + (by - ay) ** 2;
    if (l > length) {
      length = l;
      best = k;
    }
  }
  return best;
}

export function rotate(point: Point, center: Point, angle: number): Point {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const dx = point[0] - center[0],
    dy = point[1] - center[1];
  return [center[0] + dx * c - dy * s, center[1] + dx * s + dy * c];
}
