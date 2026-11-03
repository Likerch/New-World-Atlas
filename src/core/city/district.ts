// A district up close: one quarter of a city enlarged. Alleys cut it into blocks; each block is a ring of narrow
// lots round a courtyard (small courtyards become closed "well" yards), with trees, sheds and a well inside. The
// neighbouring quarters, the river and the sea stay round it as context. The result is a City in shape, so its
// buildings open as floor plans like any other.
import type { Point } from "../geometry";
import { name } from "../language";
import { area, centroid, ccw, clipConvex, insetConvex, longestEdge, segmentIntersection, splitConvex } from "../polygon";
import { createRng } from "../random";
import { lots, scatter } from "./buildings";
import { organicEra, type Building, type City, type Street, type Ward } from "./model";

const FRAME_W = 1200;
const FRAME_H = 900;

export function generateDistrict(city: City, wardId: number): City {
  const focus = city.wards.find((ward) => ward.id === wardId)!;
  const seed = `${city.params.seed}/ward-${wardId}`;
  const rng = createRng(seed);
  const xs = focus.polygon.map((p) => p[0]);
  const ys = focus.polygon.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const f = Math.min((FRAME_W * 0.78) / (Math.max(...xs) - Math.min(...xs)), (FRAME_H * 0.78) / (Math.max(...ys) - Math.min(...ys)));
  const T = (p: Point): Point => [(p[0] - cx) * f + FRAME_W / 2, (p[1] - cy) * f + FRAME_H / 2];
  const scale = city.scale / f;
  const m = (metres: number) => metres / scale;
  const frame: Point[] = [[0, 0], [FRAME_W, 0], [FRAME_W, FRAME_H], [0, FRAME_H]];
  const organic = organicEra(city.params.era);
  const tongue = { ...city.language };

  // Context: the neighbouring quarters and their buildings, clipped to the frame.
  const wards: Ward[] = [];
  const buildings: Building[] = [];
  for (const ward of city.wards) {
    if (ward.id === focus.id) continue;
    const shape = ccw(clipConvex(ward.polygon.map(T), frame));
    if (shape.length < 3 || area(shape) < 1) continue;
    wards.push({ ...ward, polygon: shape, center: T(ward.center), urban: false });
  }
  const context = new Set(wards.map((ward) => ward.id));
  city.buildings.forEach((building, origin) => {
    if (!context.has(building.ward)) return;
    const shape = building.polygon.map(T);
    if (shape.every(([x, y]) => x >= 0 && y >= 0 && x <= FRAME_W && y <= FRAME_H)) buildings.push({ ...building, polygon: shape, origin });
  });

  // The quarter itself, back from the streets round it, cut into blocks by alleys.
  const outline = ccw(focus.polygon.map(T));
  const interior = insetConvex(outline, m(organic ? 4 : 8)) ?? outline;
  const streets: Street[] = [];
  const addStreet = (points: Point[], kind: Street["kind"], width: number, named: boolean) => streets.push({ id: streets.length, kind, points, width, name: named ? name(tongue, rng, "plain") : "" });
  outline.forEach((p, k) => addStreet([p, outline[(k + 1) % outline.length]], "main", m(organic ? 8 : 16), k % 2 === 0));
  const pieces: Point[][] = [interior];
  const cuts = Math.max(1, Math.min(6, Math.round((area(interior) * scale * scale) / (organic ? 5500 : 9000))));
  for (let k = 0; k < cuts; k++) {
    const largest = pieces.reduce((best, piece, index) => (area(piece) > area(pieces[best]) ? index : best), 0);
    const piece = pieces[largest];
    const edge = longestEdge(piece);
    const a = piece[edge],
      b = piece[(edge + 1) % piece.length];
    const at = centroid(piece);
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2 + rng.float(-0.15, 0.15);
    const dir: Point = [Math.cos(angle), Math.sin(angle)];
    const [left, right] = splitConvex(piece, at, dir);
    if (left.length < 3 || right.length < 3) continue;
    pieces.splice(largest, 1, left, right);
    // The alley follows the cut from side to side of the piece.
    const reach = Math.hypot(FRAME_W, FRAME_H);
    const far0: Point = [at[0] - dir[0] * reach, at[1] - dir[1] * reach];
    const far1: Point = [at[0] + dir[0] * reach, at[1] + dir[1] * reach];
    const ends = piece.map((p, j) => segmentIntersection(far0, far1, p, piece[(j + 1) % piece.length])).filter((p): p is Point => !!p);
    if (ends.length >= 2) addStreet([ends[0], ends[1]], "street", m(organic ? 4 : 10), rng.chance(0.5));
  }

  const blockWards: Ward[] = [];
  // Squares, temples, citadels, parks and graveyards keep their own layout, only larger.
  const keep = ["plaza", "temple", "castle", "park", "cemetery", "arcology"].includes(focus.kind);
  if (keep) {
    pieces.length = 0;
    blockWards.push({ ...focus, polygon: outline, center: T(focus.center), urban: true });
    city.buildings.forEach((building, origin) => {
      if (building.ward === focus.id) buildings.push({ ...building, polygon: building.polygon.map(T), origin });
    });
  }
  const tall = focus.kind === "megablock" || focus.kind === "downtown" || focus.kind === "commercial" || focus.kind === "arcology";
  const floors = (): number => (tall ? rng.int(12, 60) : organic ? rng.int(1, 3) + Math.round(focus.wealth) : rng.int(3, 8));
  const kind: Building["kind"] = tall ? "tower" : focus.kind === "industrial" || focus.kind === "port" || focus.kind === "harbour" ? "industrial" : "house";
  pieces.forEach((piece, index) => {
    const block = insetConvex(piece, m(organic ? 1.8 : 4));
    if (!block || area(block) < m(1) * m(1) * 60) return;
    const id = 10_000 + index;
    blockWards.push({ ...focus, id, polygon: block, center: centroid(block), urban: true, name: name(tongue, rng, "plain"), buildings: 0 });
    // Open ground stays open; factories and warehouses fill their blocks without courtyards.
    const depth = m(organic ? rng.float(8, 13) : rng.float(12, 18));
    const court = kind === "industrial" ? null : insetConvex(block, depth);
    if (!court || court.length !== block.length) {
      const parts: Point[][] = [];
      lots(block, m(1) * m(1) * (kind === "industrial" ? 1800 : 260), rng, parts);
      for (const part of parts) {
        const shape = insetConvex(part, m(0.8));
        if (shape) buildings.push({ polygon: shape, ward: id, kind, floors: floors() });
      }
      return;
    }
    // The ring of lots: one trapezoid per side, cut along the street into frontages.
    for (let k = 0; k < block.length; k++) {
      const p0 = block[k],
        p1 = block[(k + 1) % block.length];
      const q0 = court[k],
        q1 = court[(k + 1) % court.length];
      let strip: Point[] = [p0, p1, q1, q0];
      const length = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const u: Point = [(p1[0] - p0[0]) / length, (p1[1] - p0[1]) / length];
      const normal: Point = [-u[1], u[0]];
      const frontage = () => m(tall ? rng.float(20, 40) : organic ? rng.float(6, 12) : rng.float(10, 20));
      for (let t = frontage(); t < length - m(4) && strip.length >= 3; t += frontage()) {
        const [front, rest] = splitConvex(strip, [p0[0] + u[0] * t, p0[1] + u[1] * t], normal);
        const lot = area(front) > area(rest) ? rest : front;
        strip = area(front) > area(rest) ? front : rest;
        const shape = insetConvex(ccw(lot), m(0.35));
        if (shape) buildings.push({ polygon: shape, ward: id, kind, floors: floors() });
      }
      const shape = strip.length >= 3 ? insetConvex(ccw(strip), m(0.35)) : null;
      if (shape) buildings.push({ polygon: shape, ward: id, kind, floors: floors() });
    }
    const yard = insetConvex(court, m(0.6));
    if (!yard) return;
    buildings.push({ polygon: yard, ward: id, kind: "yard", floors: 0 });
    // A "well" yard is too small for more than a pump; larger ones get trees and sheds.
    if (area(yard) * scale * scale > 220) {
      const trees: Building[] = [];
      scatter(yard, Math.max(m(10), 8), rng, [m(1.8), m(3)], "tree", id, trees);
      buildings.push(...trees.slice(0, 40));
      const c = centroid(yard);
      const s = m(1.6);
      buildings.push({ polygon: [[c[0] - s, c[1] - s], [c[0] + s, c[1] - s], [c[0] + s, c[1] + s], [c[0] - s, c[1] + s]], ward: id, kind: "shed", floors: 1 });
    }
  });
  for (const ward of blockWards) ward.buildings = buildings.filter((b) => b.ward === ward.id && b.kind !== "tree" && b.kind !== "yard").length;

  // Landmarks of the quarter keep their place; each moves to the block it now stands in.
  const landmarks = city.landmarks
    .filter((landmark) => landmark.ward === focus.id)
    .map((landmark) => {
      const at = T([landmark.x, landmark.y]);
      const block = blockWards.reduce((best, ward) => (Math.hypot(ward.center[0] - at[0], ward.center[1] - at[1]) < Math.hypot(best.center[0] - at[0], best.center[1] - at[1]) ? ward : best), blockWards[0] ?? focus);
      return { ...landmark, x: at[0], y: at[1], ward: block.id };
    });
  return {
    params: { ...city.params, seed, name: focus.name || city.name, width: FRAME_W, height: FRAME_H },
    name: focus.name || city.name,
    scale,
    center: T(focus.center),
    wards: [...blockWards, ...wards],
    buildings,
    streets,
    walls: city.walls.map((wall) => ({ ...wall, ring: wall.ring.map(T), towers: wall.towers.map(T), gates: wall.gates.map(T) })),
    sea: city.sea ? city.sea.map(T) : null,
    river: city.river ? { points: city.river.points.map(T), width: city.river.width * f } : null,
    bridges: city.bridges.map(([a, b]) => [T(a), T(b)] as [Point, Point]),
    landmarks,
    language: city.language,
  };
}
