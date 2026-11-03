// What stands in each ward. Walled towns cut their quarters into narrow lots fronting the streets; planned cities lay
// a street grid in every district (each at its own angle) and fill the blocks by purpose — houses, towers, factories,
// megablocks, an arcology. Fields, parks and graveyards get their own patterns. Nothing is built in the water. A stone-age
// camp is a scatter of huts; antiquity lays its houses on one street grid; the far future raises green towers far
// apart; after the fall the city is a field of ruins round the survivors' crowded holds.
import type { Point } from "../geometry";
import { area, centroid, ccw, clipConvex, distanceToPolyline, insetConvex, longestEdge, pointInPolygon, rotate, splitConvex } from "../polygon";
import type { Rng } from "../random";
import type { Layout } from "./layout";
import { organicEra, type Building, type BuildingKind, type CityParams, type WardKind } from "./model";
import { edgeKey, type StreetNet } from "./streets";

interface Rule {
  /** Lot size in square metres. */
  lot: number;
  /** Share of lots left empty (yards, gardens, ruins). */
  empty: number;
  floors: [number, number];
  kind: BuildingKind;
  /** Gap between buildings, metres. */
  gap: number;
  /** Grid block size, metres (planned districts). */
  block?: number;
}

const RULES: Partial<Record<WardKind, Rule>> = {
  patriciate: { lot: 380, empty: 0.22, floors: [2, 3], kind: "house", gap: 1.6 },
  merchants: { lot: 170, empty: 0.05, floors: [2, 3], kind: "house", gap: 0.9 },
  craftsmen: { lot: 120, empty: 0.06, floors: [1, 2], kind: "house", gap: 0.8 },
  slum: { lot: 55, empty: 0.12, floors: [1, 1], kind: "house", gap: 0.7 },
  harbour: { lot: 320, empty: 0.08, floors: [1, 2], kind: "industrial", gap: 1.5 },
  administration: { lot: 480, empty: 0.15, floors: [2, 4], kind: "house", gap: 2 },
  military: { lot: 420, empty: 0.2, floors: [1, 2], kind: "house", gap: 3 },
  suburb: { lot: 260, empty: 0.15, floors: [1, 2], kind: "house", gap: 2 },
  "old-town": { lot: 160, empty: 0.06, floors: [2, 4], kind: "house", gap: 1 },
  downtown: { lot: 1300, empty: 0.06, floors: [10, 70], kind: "tower", gap: 5, block: 78 },
  commercial: { lot: 1000, empty: 0.06, floors: [6, 30], kind: "tower", gap: 4, block: 88 },
  residential: { lot: 380, empty: 0.06, floors: [3, 9], kind: "house", gap: 3, block: 105 },
  "rich-residential": { lot: 700, empty: 0.25, floors: [1, 3], kind: "house", gap: 6, block: 125 },
  industrial: { lot: 3200, empty: 0.12, floors: [1, 3], kind: "industrial", gap: 6, block: 175 },
  port: { lot: 2800, empty: 0.1, floors: [1, 2], kind: "industrial", gap: 6, block: 165 },
  campus: { lot: 2400, empty: 0.4, floors: [3, 7], kind: "house", gap: 10, block: 145 },
  megablock: { lot: 1e9, empty: 0.03, floors: [30, 90], kind: "tower", gap: 6, block: 125 },
  "combat-zone": { lot: 70, empty: 0.35, floors: [1, 4], kind: "house", gap: 1.5, block: 62 },
};

const MODERN_SUBURB: Rule = { lot: 230, empty: 0.12, floors: [1, 2], kind: "house", gap: 5, block: 120 };
/** Towers of the far future stand far apart among gardens. */
const FUTURE_RULES: Partial<Record<WardKind, Rule>> = {
  commercial: { lot: 2000, empty: 0.15, floors: [30, 150], kind: "tower", gap: 12, block: 110 },
  residential: { lot: 1500, empty: 0.3, floors: [12, 60], kind: "tower", gap: 14, block: 130 },
  "rich-residential": { lot: 2500, empty: 0.45, floors: [4, 20], kind: "tower", gap: 18, block: 150 },
  industrial: { lot: 4000, empty: 0.2, floors: [2, 6], kind: "industrial", gap: 10, block: 190 },
};
/** The dead city: blocks of broken buildings, scrapyards, and the survivors' shacks packed inside their barricades. */
const FALLEN_RULES: Partial<Record<WardKind, Rule>> = {
  ruins: { lot: 900, empty: 0.38, floors: [0, 6], kind: "ruin", gap: 5, block: 100 },
  industrial: { lot: 3000, empty: 0.45, floors: [0, 2], kind: "ruin", gap: 8, block: 170 },
  port: { lot: 2800, empty: 0.4, floors: [0, 2], kind: "ruin", gap: 8, block: 165 },
  settlement: { lot: 60, empty: 0.05, floors: [1, 2], kind: "house", gap: 0.8 },
  slum: { lot: 70, empty: 0.3, floors: [1, 1], kind: "house", gap: 1.2 },
};

/** Cuts a convex polygon into lots of about a target area, splitting across its longest side each time. */
export function lots(poly: Point[], target: number, rng: Rng, out: Point[][], depth = 0): void {
  const size = area(poly);
  if (size < target * rng.float(1.1, 1.9) || depth > 14) {
    out.push(poly);
    return;
  }
  const edge = longestEdge(poly);
  const a = poly[edge];
  const b = poly[(edge + 1) % poly.length];
  const t = rng.float(0.38, 0.62);
  const at: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2 + rng.float(-0.12, 0.12);
  for (const half of splitConvex(poly, at, [Math.cos(angle), Math.sin(angle)])) if (half.length >= 3 && area(half) > target * 0.15) lots(half, target, rng, out, depth + 1);
}

/** Parallel strips across a polygon: open fields. */
function strips(poly: Point[], angle: number, width: number): Point[][] {
  const dir: Point = [Math.cos(angle), Math.sin(angle)];
  const normal: Point = [-dir[1], dir[0]];
  const c = centroid(poly);
  const offsets = poly.map((p) => (p[0] - c[0]) * normal[0] + (p[1] - c[1]) * normal[1]);
  const out: Point[][] = [];
  let rest = poly;
  for (let t = Math.max(...offsets) - width; t > Math.min(...offsets) && rest.length >= 3; t -= width) {
    const [beyond, remaining] = splitConvex(rest, [c[0] + normal[0] * t, c[1] + normal[1] * t], dir);
    if (beyond.length >= 3) out.push(beyond);
    rest = remaining;
  }
  if (rest.length >= 3) out.push(rest);
  return out;
}

/** Blocks of a street grid at an angle, clipped to a convex district. */
function grid(poly: Point[], angle: number, block: number, street: number): Point[][] {
  const c = centroid(poly);
  const local = poly.map((p) => rotate(p, c, -angle));
  const xs = local.map((p) => p[0]);
  const ys = local.map((p) => p[1]);
  const out: Point[][] = [];
  const step = block + street;
  const x0 = Math.min(...xs) - ((Math.min(...xs) - c[0]) % step) - step;
  const y0 = Math.min(...ys) - ((Math.min(...ys) - c[1]) % step) - step;
  for (let x = x0; x < Math.max(...xs); x += step) {
    for (let y = y0; y < Math.max(...ys); y += step) {
      const rect: Point[] = [[x, y], [x + block, y], [x + block, y + block], [x, y + block]].map((p) => rotate(p as Point, c, angle));
      const clipped = clipConvex(rect, poly);
      if (clipped.length >= 3 && area(clipped) > block * block * 0.18) out.push(ccw(clipped));
    }
  }
  return out;
}

export function scatter(poly: Point[], spacing: number, rng: Rng, size: [number, number], kind: BuildingKind, ward: number, out: Building[]) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const count = Math.round(area(poly) / (spacing * spacing));
  for (let k = 0; k < count; k++) {
    const p: Point = [rng.float(Math.min(...xs), Math.max(...xs)), rng.float(Math.min(...ys), Math.max(...ys))];
    if (!pointInPolygon(p, poly)) continue;
    const r = rng.float(size[0], size[1]);
    const shape: Point[] = Array.from({ length: 6 }, (_, j) => [p[0] + Math.cos((j * Math.PI) / 3) * r, p[1] + Math.sin((j * Math.PI) / 3) * r]);
    out.push({ polygon: shape, ward, kind, floors: 0 });
  }
}

export function buildBuildings(params: CityParams, layout: Layout, net: StreetNet, rng: Rng): Building[] {
  const { diagram, sea, river, urban, kinds, wealth, angles, scale, center } = layout;
  const m = (metres: number) => metres / scale;
  // Level of detail: on a metropolis map one lot, block or tree may stand for several, so the map stays drawable.
  const lotArea = (metres2: number) => Math.max(metres2 / (scale * scale), 26);
  const span = (metres: number, least: number) => Math.max(m(metres), least);
  const organic = organicEra(params.era);
  const out: Building[] = [];
  const wet = (poly: Point[]) => poly.some((p) => (sea && pointInPolygon(p, sea)) || (river && distanceToPolyline(p, river.points) < river.width / 2 + m(1.5)));
  const streetHalf = m(organic ? 2.4 : params.era === "industrial" ? 4 : params.era === "modern" ? 5 : 6);
  const majorHalf = m(organic ? 5 : params.era === "cyberpunk" ? 13 : params.era === "modern" ? 10 : 7);
  const wallGap = params.walls && organic ? m(9) : streetHalf;
  const roads = net.streets.filter((street) => street.kind === "road" || street.kind === "main");
  // Antiquity lays every house block on one grid, whatever the ward's shape.
  const gridAngle = rng.fork("grid").float(0, Math.PI / 2);

  for (let ward = 0; ward < diagram.sites.length; ward++) {
    const kind = kinds[ward];
    const cell = diagram.cells[ward];
    if (layout.water[ward] || cell.length < 3) continue;
    const own = rng.fork(`ward-${ward}`);
    // Each side steps back by half the width of the street (or the wall's clear strip) along it.
    const widths = cell.map((a, k) => {
      const b = cell[(k + 1) % cell.length];
      const side = diagram.sides[ward].find((s) => {
        const pa = diagram.corners[s.a],
          pb = diagram.corners[s.b];
        const near = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5;
        return (near(pa, a) && near(pb, b)) || (near(pa, b) && near(pb, a));
      });
      if (!side) return streetHalf;
      if (net.major.has(edgeKey(side.a, side.b))) return majorHalf;
      if (side.other < diagram.sites.length && layout.water[side.other]) return m(3);
      if (urban[ward] && (side.other >= diagram.sites.length || !urban[side.other])) return wallGap;
      return streetHalf;
    });
    const inner = insetConvex(cell, widths);
    if (!inner) continue;
    const push = (polygon: Point[], buildingKind: BuildingKind, floors: number) => {
      if (!wet(polygon)) out.push({ polygon, ward, kind: buildingKind, floors });
    };

    if (kind === "farm") {
      const toCenter = Math.atan2(diagram.sites[ward][1] - center[1], diagram.sites[ward][0] - center[0]);
      for (const strip of strips(inner, toCenter + own.float(-0.6, 0.6), span(own.float(22, 45), 6))) {
        const field = insetConvex(strip, m(1.5));
        if (field) push(field, "field", 0);
      }
      continue;
    }
    if (kind === "park" || (kind === "wild" && params.era !== "cyberpunk")) {
      scatter(inner, kind === "park" ? span(11, 6) : span(26, 16), own, [span(2.5, 1.6), span(4.5, 2.6)], "tree", ward, out);
      continue;
    }
    if (kind === "wild") continue;
    if (params.era === "stone") {
      // Huts scattered round the gathering place; the sacred place keeps a single standing stone.
      if (kind === "temple") {
        const stone = insetConvex(inner, Math.sqrt(area(inner)) * 0.44);
        if (stone) push(stone, "landmark", 1);
      } else if (kind !== "plaza") scatter(inner, span(12, 4.5), own, [span(2.6, 1.4), span(4.2, 2.2)], "hut", ward, out);
      continue;
    }
    if (kind === "wasteland") {
      scatter(inner, span(60, 12), own, [span(4, 1.5), span(14, 4)], "ruin", ward, out);
      continue;
    }
    if (kind === "spaceport") {
      // Launch pads in a row, hangars along the edge.
      for (const block of grid(inner, angles[ward], span(120, 14), span(40, 5))) {
        const pad = insetConvex(block, m(18));
        if (pad) push(pad, own.chance(0.6) ? "landmark" : "industrial", 1);
      }
      continue;
    }
    if (kind === "cemetery") {
      const chapel = insetConvex(inner, Math.sqrt(area(inner)) * 0.38);
      if (chapel) push(chapel, "landmark", 1);
      for (const plot of grid(inner, own.float(0, Math.PI), span(2.2, 1.4), span(3.5, 2.2))) push(plot, "grave", 0);
      continue;
    }
    if (kind === "plaza") {
      // Rows of market stalls around an open middle where the well stands.
      const market = insetConvex(inner, Math.sqrt(area(inner)) * 0.12);
      const middle = insetConvex(inner, Math.sqrt(area(inner)) * 0.36);
      if (market) {
        for (const stall of grid(market, angles[ward] || own.float(0, Math.PI), span(3.2, 1.6), span(3.4, 1.2))) {
          if (middle && pointInPolygon(centroid(stall), middle)) continue;
          if (own.chance(0.35)) continue;
          push(stall, "stall", 1);
        }
      }
      continue;
    }
    if (kind === "temple" || kind === "castle") {
      const core = insetConvex(inner, Math.sqrt(area(inner)) * (kind === "temple" ? 0.3 : 0.26));
      if (core) push(core, "landmark", kind === "temple" ? 4 : 5);
      // Lesser buildings round the edge.
      const ring: Point[][] = [];
      lots(inner, lotArea(260), own, ring);
      for (const lot of ring) {
        const c = centroid(lot);
        if (core && pointInPolygon(c, core)) continue;
        if (own.chance(0.55)) continue;
        const house = insetConvex(lot, m(1.2));
        if (house && (!core || !house.some((p) => pointInPolygon(p, core)))) push(house, "house", 2);
      }
      continue;
    }
    if (kind === "arcology") {
      const tower = insetConvex(inner, Math.sqrt(area(inner)) * 0.2);
      if (tower) push(tower, "tower", own.int(180, 320));
      for (const block of grid(inner, angles[ward], span(70, 10), span(12, 1.5))) {
        if (tower && block.some((p) => pointInPolygon(p, tower))) continue;
        const b = insetConvex(block, m(5));
        if (b) push(b, "tower", own.int(25, 90));
      }
      continue;
    }

    const rule = (params.era === "far-future" ? FUTURE_RULES[kind] : params.era === "post-apocalypse" ? FALLEN_RULES[kind] : undefined) ?? (!organic && kind === "suburb" ? MODERN_SUBURB : RULES[kind] ?? RULES.craftsmen!);
    const nearRoad = (poly: Point[]) => roads.some((road) => distanceToPolyline(centroid(poly), road.points) < m(45));
    const cells =
      params.era === "ancient"
        ? grid(inner, gridAngle, span(38, 8), span(5, 1))
        : rule.block && !organic && kind !== "old-town"
          ? grid(inner, angles[ward], span(rule.block, 9), span(params.era === "cyberpunk" ? 12 : params.era === "modern" ? 10 : 8, 1.2))
          : [inner];
    for (const block of cells) {
      const parts: Point[][] = [];
      if (kind === "megablock") parts.push(block);
      else lots(block, lotArea(rule.lot), own, parts);
      for (const lot of parts) {
        if (own.chance(rule.empty)) continue;
        if (kind === "suburb" && organic && !nearRoad(lot)) continue;
        if (kind === "slum" && !urban[ward] && !nearRoad(lot) && own.chance(0.6)) continue;
        const shape = insetConvex(lot, m(rule.gap));
        if (!shape || area(shape) < Math.min(lotArea(12), 3)) continue;
        const floors = own.int(rule.floors[0], rule.floors[1]) + (organic ? Math.round(wealth[ward]) : 0);
        // A ruin keeps only part of its walls.
        const ruined = rule.kind === "ruin" ? insetConvex(shape, m(own.float(0, rule.gap))) : shape;
        if (ruined) push(ruined, rule.kind === "tower" && floors < 8 ? "house" : rule.kind, floors);
      }
    }
  }
  // Piers: wooden or stone jetties from the harbour shore out into the sea.
  if (sea && params.port && params.coast !== null) {
    const toSea: Point = [Math.cos(params.coast), Math.sin(params.coast)];
    const shore = sea.slice(0, -2);
    const harbours = diagram.sites.map((_, ward) => ward).filter((ward) => kinds[ward] === "harbour" || kinds[ward] === "port");
    const own = rng.fork("piers");
    const placed: Point[] = [];
    const gap = organic ? span(35, 10) : span(70, 14);
    for (let k = 1; k < shore.length - 1; k++) {
      const p = shore[k];
      const inland: Point = [p[0] - toSea[0] * span(8, 3), p[1] - toSea[1] * span(8, 3)];
      const ward = harbours.find((w) => pointInPolygon(inland, diagram.cells[w]));
      if (ward === undefined || placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < gap)) continue;
      const tx = shore[k + 1][0] - shore[k - 1][0],
        ty = shore[k + 1][1] - shore[k - 1][1];
      const tl = Math.hypot(tx, ty) || 1;
      let nx = -ty / tl,
        ny = tx / tl;
      if (nx * toSea[0] + ny * toSea[1] < 0) [nx, ny] = [-nx, -ny];
      const length = organic ? span(own.float(25, 55), 8) : span(own.float(60, 140), 14);
      const half = (organic ? span(5, 2) : span(12, 3)) / 2;
      const ux = tx / tl,
        uy = ty / tl;
      const base: Point = [p[0] - nx * span(3, 1), p[1] - ny * span(3, 1)];
      const tip: Point = [p[0] + nx * length, p[1] + ny * length];
      out.push({ polygon: [[base[0] - ux * half, base[1] - uy * half], [tip[0] - ux * half, tip[1] - uy * half], [tip[0] + ux * half, tip[1] + uy * half], [base[0] + ux * half, base[1] + uy * half]], ward, kind: "pier", floors: 0 });
      placed.push(p);
    }
  }
  return out;
}
