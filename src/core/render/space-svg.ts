// Space maps. The galaxy: nebulae, regions of trouble, the powers' space traced as smooth territories with real
// borders and their names laid along them, sectors and a finding grid; hyperlanes with their trade routes, border
// crossings, dangers and chokepoints; gates and wormholes; glowing stars by class, travel zones, free worlds, natives,
// points of interest, names. A star system, as a scheme or as orbits on a date, in deep space or as a brass orrery:
// the star, orbits, the habitable zone and the frost line, worlds drawn by kind with bands, rings and moons, the places
// in it, the lanes out of it and a scale in AU. The universe: voids, filaments, galaxies by kind and the strange things
// among them.
import type { Point } from "../geometry";
import { toCyrillic } from "../language";
import type { CustomKind } from "../space/custom";
import { SPECTRA, type Galaxy, type SpaceFeature, type Star, type Zone, type ZoneKind } from "../space/galaxy";
import { GRID, gridLetter, type GalaxySurvey } from "../space/survey";
import type { Body, BodyKind, Site, SiteKind, StarSystem, SystemExit } from "../space/system";
import type { Anomaly, AnomalyKind, Universe } from "../space/universe";
import { present, type LegendEntry, type LegendSection, type Swatch } from "./legend";
import { anomalyPoint } from "../space/universe";

const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
const r1 = (value: number) => Math.round(value * 10) / 10;

export const FEATURE_GLYPH: Record<SpaceFeature, string> = {
  ruins: "♜",
  station: "◇",
  anomaly: "✷",
  derelict: "⌬",
  "pirate-base": "☠",
  relay: "⌖",
  shipyard: "⚓",
  research: "⚗",
  quarantine: "☣",
  wormhole: "◎",
  "dyson-sphere": "◉",
  ringworld: "⊚",
  "jump-gate": "⊗",
  graveyard: "✝",
  leviathan: "∿",
  "time-rift": "∞",
  "rogue-planet": "●",
  vault: "⊡",
  "trade-hub": "⚖",
  mining: "⛏",
  prison: "⛓",
  beacon: "✦",
};

/** How each place of a system is marked. */
export const SITE_GLYPH: Record<SiteKind, string> = {
  highport: "⊕",
  station: "◇",
  "military-base": "⚔",
  "trade-station": "⚖",
  "research-station": "⚗",
  habitat: "⌂",
  shipyard: "⚓",
  "mining-camp": "⛏",
  "pirate-den": "☠",
  prison: "⛓",
  "dyson-shell": "◉",
  ringworld: "⊚",
  gate: "⊗",
  graveyard: "✝",
  derelict: "⌬",
  ruins: "♜",
  vault: "⊡",
  relay: "⌖",
  beacon: "✦",
  anomaly: "✷",
  wormhole: "◎",
  leviathan: "∿",
  "time-rift": "∞",
  "rogue-planet": "●",
  cordon: "☣",
  custom: "✦",
};

/** How each region of trouble looks: its fill and its edge. */
export const ZONE_STYLE: Record<ZoneKind, { fill: string; edge: string }> = {
  "ion-storm": { fill: "#5fb8ff", edge: "#a8dcff" },
  "dead-zone": { fill: "#000000", edge: "#ff4d4d" },
  "dark-nebula": { fill: "#000000", edge: "#3a3550" },
  "radiation-belt": { fill: "#ffd23f", edge: "#ffd23f" },
  "asteroid-field": { fill: "#8c8577", edge: "#b3aa98" },
  "gravity-rift": { fill: "#a46bff", edge: "#d6b8ff" },
  "crystal-field": { fill: "#4de1ff", edge: "#b8f5ff" },
  "plasma-sea": { fill: "#ff6a3d", edge: "#ff9fd0" },
};

/** Colours of the travel zones and of lanes by trade and danger. */
const AMBER = "#ffb000";
const RED = "#ff3b3b";
const TRADE = "#ffd27a";

/** A small deterministic scatter for a region's texture. */
const scatterIn = (zone: Zone, count: number) =>
  Array.from({ length: count }, (_, k) => {
    const a = (k * 2.399963 + zone.id) % (Math.PI * 2);
    const r = Math.sqrt((k * 0.618034 + zone.id * 0.37) % 1) * zone.r;
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r * zone.squash;
    return [zone.x + x * Math.cos(zone.angle) - y * Math.sin(zone.angle), zone.y + x * Math.sin(zone.angle) + y * Math.cos(zone.angle)] as const;
  });

function drawZone(zone: Zone, custom: Map<string, CustomKind>, out: string[]) {
  const t = `rotate(${r1((zone.angle * 180) / Math.PI)} ${r1(zone.x)} ${r1(zone.y)})`;
  const ellipse = (attrs: string) => `<ellipse cx="${r1(zone.x)}" cy="${r1(zone.y)}" rx="${r1(zone.r)}" ry="${r1(zone.r * zone.squash)}" transform="${t}" ${attrs}/>`;
  if (zone.kind === "custom") {
    const kind = custom.get(zone.custom ?? "");
    const color = kind?.color ?? "#ffd27a";
    out.push(ellipse(`fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-width="1.2" stroke-dasharray="6 4"`));
    out.push(`<text x="${r1(zone.x)}" y="${r1(zone.y + 5)}" text-anchor="middle" font-size="14" fill="${color}" font-family="'Segoe UI Symbol', 'Segoe UI Emoji', sans-serif">${esc(kind?.glyph ?? "✦")}</text>`);
    return;
  }
  const style = ZONE_STYLE[zone.kind];
  switch (zone.kind) {
    case "ion-storm": {
      out.push(ellipse(`fill="${style.fill}" opacity="0.14" filter="url(#soft)"`));
      for (let k = 0; k < 4; k++) {
        const pts = scatterIn({ ...zone, id: zone.id * 7 + k, r: zone.r * 0.8 }, 5);
        out.push(`<path d="M${pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join("L")}" fill="none" stroke="${style.edge}" stroke-width="0.9" opacity="0.7"/>`);
      }
      break;
    }
    case "dead-zone":
      out.push(ellipse(`fill="#000" fill-opacity="0.45" stroke="${style.edge}" stroke-width="1.2" stroke-dasharray="3 5" opacity="0.8"`));
      break;
    case "dark-nebula":
      out.push(ellipse(`fill="#000" opacity="0.65" filter="url(#soft)"`));
      break;
    case "radiation-belt":
      out.push(ellipse(`fill="${style.fill}" fill-opacity="0.06" stroke="${style.edge}" stroke-width="${r1(zone.r * 0.12)}" stroke-opacity="0.18" stroke-dasharray="2 4"`));
      break;
    case "asteroid-field":
      out.push(`<g fill="${style.edge}" opacity="0.7">${scatterIn(zone, 70).map(([x, y], k) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${k % 5 ? 0.7 : 1.3}"/>`).join("")}</g>`);
      break;
    case "gravity-rift": {
      const along = [-1, -0.6, -0.2, 0.2, 0.6, 1].map((s, k) => [zone.x + Math.cos(zone.angle) * s * zone.r + Math.sin(zone.angle) * (k % 2 ? 6 : -6), zone.y + Math.sin(zone.angle) * s * zone.r - Math.cos(zone.angle) * (k % 2 ? 6 : -6)]);
      const d = `M${along.map(([x, y]) => `${r1(x)},${r1(y)}`).join("L")}`;
      out.push(`<path d="${d}" fill="none" stroke="${style.fill}" stroke-width="7" opacity="0.25" filter="url(#glow)"/><path d="${d}" fill="none" stroke="#05060d" stroke-width="2.4"/><path d="${d}" fill="none" stroke="${style.edge}" stroke-width="0.6"/>`);
      break;
    }
    case "crystal-field":
      out.push(`<g fill="${style.fill}" fill-opacity="0.7" stroke="${style.edge}" stroke-width="0.3">${scatterIn(zone, 26).map(([x, y]) => `<path d="M${r1(x)},${r1(y - 2.4)}L${r1(x + 1.4)},${r1(y)}L${r1(x)},${r1(y + 2.4)}L${r1(x - 1.4)},${r1(y)}Z"/>`).join("")}</g>`);
      break;
    case "plasma-sea":
      out.push(ellipse(`fill="${style.fill}" opacity="0.2" filter="url(#soft)"`) + ellipse(`fill="none" stroke="${style.edge}" stroke-width="0.8" stroke-dasharray="1 3" opacity="0.6"`));
      break;
  }
}

/** Which layers of a galaxy map are drawn. */
export interface GalaxyLayers {
  territories: boolean;
  borders: boolean;
  sectors: boolean;
  grid: boolean;
  lanes: boolean;
  trade: boolean;
  danger: boolean;
  zones: boolean;
  labels: boolean;
}
export const GALAXY_LAYERS: (keyof GalaxyLayers)[] = ["territories", "borders", "sectors", "grid", "lanes", "trade", "danger", "zones", "labels"];
const DEFAULT_LAYERS: GalaxyLayers = { territories: true, borders: true, sectors: false, grid: false, lanes: true, trade: true, danger: true, zones: false, labels: true };

export interface SpaceRenderOptions {
  script?: "latin" | "cyrillic";
  highlight?: number | null;
  /** A region (galaxy) or an anomaly (universe) to ring. */
  highlightZone?: number | null;
  /** A star picked on a galaxy map. */
  highlightStar?: number | null;
  highlightAnomaly?: number | null;
  territories?: boolean;
  lanes?: boolean;
  labels?: boolean;
  /** What a survey of the galaxy adds: trade routes, borders, dangers, chokepoints, sectors, travel zones. */
  survey?: GalaxySurvey | null;
  layers?: Partial<GalaxyLayers>;
  /** Stars found by a search or a filter, ringed. */
  marked?: number[];
  /** A star the editor holds (the first end of a lane or a gate). */
  pending?: number | null;
  /** The players' view: the game master's secret things are not drawn. */
  players?: boolean;
}

/** Smooths a closed ring by cutting its corners (Chaikin). */
function chaikin(ring: Point[], rounds = 2): Point[] {
  let points = ring;
  for (let r = 0; r < rounds; r++) {
    const next: Point[] = [];
    for (let k = 0; k < points.length; k++) {
      const [ax, ay] = points[k];
      const [bx, by] = points[(k + 1) % points.length];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    points = next;
  }
  return points;
}

/** Pulls each point of a closed ring towards its neighbours: stairs become slopes. */
function relax(ring: Point[]): Point[] {
  return ring.map(([x, y], k) => {
    const [ax, ay] = ring[(k + ring.length - 1) % ring.length];
    const [bx, by] = ring[(k + 1) % ring.length];
    return [(ax + 2 * x + bx) / 4, (ay + 2 * y + by) / 4];
  });
}

const ringArea = (ring: Point[]) => ring.reduce((sum, [x, y], k) => sum + x * ring[(k + 1) % ring.length][1] - ring[(k + 1) % ring.length][0] * y, 0) / 2;

/** Space held by groups of stars (powers, sectors) as smooth closed outlines. Key 0 is nobody's and is not traced. */
export function territories(galaxy: Galaxy, groupOf: (star: Star) => number, step = 8): Map<number, Point[][]> {
  const { width: W, height: H } = galaxy.params;
  const reach = Math.sqrt((W * H) / Math.max(1, galaxy.stars.length)) * 1.4;
  return traceRegions(galaxy.stars.map((star) => ({ x: star.x, y: star.y, group: groupOf(star) })), W, H, reach, step);
}

/** Space held by groups of points as smooth closed outlines: every point of the map belongs to the nearest point within
 * reach, and marching squares trace where that changes. Group 0 is nobody's and is not traced. */
export function traceRegions(items: { x: number; y: number; group: number }[], W: number, H: number, reach: number, step = 8): Map<number, Point[][]> {
  const cols = Math.ceil(W / step) + 1,
    rows = Math.ceil(H / step) + 1;
  // Points in buckets as wide as their reach, so each spot of the map looks only at its neighbourhood.
  const bw = Math.ceil(W / reach) + 1;
  const buckets = new Map<number, (typeof items)[number][]>();
  for (const item of items) {
    const b = Math.floor(item.y / reach) * bw + Math.floor(item.x / reach);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(item);
  }
  const owner = new Int32Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = i * step,
        y = j * step;
      const bx = Math.floor(x / reach),
        by = Math.floor(y / reach);
      let best: (typeof items)[number] | null = null;
      let near = reach;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          for (const item of buckets.get((by + dy) * bw + bx + dx) ?? []) {
            const d = Math.hypot(item.x - x, item.y - y);
            if (d < near) (near = d), (best = item);
          }
      owner[j * cols + i] = best ? best.group : 0;
    }
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= cols || j >= rows ? 0 : owner[j * cols + i]);
  const groups = new Set(owner);
  groups.delete(0);
  const out = new Map<number, Point[][]>();
  // Edge midpoints in doubled grid units, so neighbouring cells share them exactly.
  const key = (x: number, y: number) => x * 100003 + y;
  const CASES: Record<number, [string, string][]> = { 1: [["L", "B"]], 2: [["B", "R"]], 3: [["L", "R"]], 4: [["T", "R"]], 5: [["T", "R"], ["L", "B"]], 6: [["T", "B"]], 7: [["L", "T"]], 8: [["L", "T"]], 9: [["T", "B"]], 10: [["L", "T"], ["B", "R"]], 11: [["T", "R"]], 12: [["L", "R"]], 13: [["B", "R"]], 14: [["L", "B"]] };
  for (const group of groups) {
    const links = new Map<number, number[]>();
    const where = new Map<number, Point>();
    const link = (a: [number, number], b: [number, number]) => {
      const ka = key(...a),
        kb = key(...b);
      where.set(ka, [(a[0] / 2) * step, (a[1] / 2) * step]);
      where.set(kb, [(b[0] / 2) * step, (b[1] / 2) * step]);
      (links.get(ka) ?? links.set(ka, []).get(ka)!).push(kb);
      (links.get(kb) ?? links.set(kb, []).get(kb)!).push(ka);
    };
    for (let j = -1; j < rows; j++)
      for (let i = -1; i < cols; i++) {
        const index = (at(i, j) === group ? 8 : 0) | (at(i + 1, j) === group ? 4 : 0) | (at(i + 1, j + 1) === group ? 2 : 0) | (at(i, j + 1) === group ? 1 : 0);
        if (index === 0 || index === 15) continue;
        const mid: Record<string, [number, number]> = { T: [2 * i + 1, 2 * j], R: [2 * i + 2, 2 * j + 1], B: [2 * i + 1, 2 * j + 2], L: [2 * i, 2 * j + 1] };
        for (const [a, b] of CASES[index]) link(mid[a], mid[b]);
      }
    const seen = new Set<number>();
    const rings: Point[][] = [];
    for (const start of links.keys()) {
      if (seen.has(start)) continue;
      const ring: Point[] = [];
      let previous = -1;
      for (let current = start; !seen.has(current); ) {
        seen.add(current);
        ring.push(where.get(current)!);
        const next = (links.get(current) ?? []).find((k) => k !== previous && !seen.has(k));
        if (next === undefined) break;
        previous = current;
        current = next;
      }
      if (ring.length >= 4) rings.push(chaikin(relax(relax(ring)), 1));
    }
    out.set(group, rings);
  }
  return out;
}

const ringPath = (rings: Point[][]) => rings.map((ring) => `M${ring.map(([x, y]) => `${r1(x)},${r1(y)}`).join("L")}Z`).join("");

/** Where a name is laid over a territory: the middle of its largest piece, along its stars' long axis, sized to fit. */
function labelOf(rings: Point[][], stars: Star[], text: string): { x: number; y: number; angle: number; size: number } | null {
  const biggest = rings.reduce<Point[] | null>((best, ring) => (!best || Math.abs(ringArea(ring)) > Math.abs(ringArea(best)) ? ring : best), null);
  if (!biggest || stars.length < 3) return null;
  const area = Math.abs(ringArea(biggest));
  const inside = stars.filter((star) => contains(biggest, star.x, star.y));
  const use = inside.length >= 3 ? inside : stars;
  const x = use.reduce((s, star) => s + star.x, 0) / use.length;
  const y = use.reduce((s, star) => s + star.y, 0) / use.length;
  // The long axis of the stars: the principal direction of their spread, turned no more than 35° off level.
  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (const star of use) (sxx += (star.x - x) ** 2), (syy += (star.y - y) ** 2), (sxy += (star.x - x) * (star.y - y));
  let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  angle = Math.max(-0.6, Math.min(0.6, angle));
  const size = Math.max(9, Math.min(30, (Math.sqrt(area) / Math.max(4, text.length)) * 1.5));
  return { x, y, angle, size };
}

function contains(ring: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    const [xi, yi] = ring[k],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function renderGalaxy(galaxy: Galaxy, options: SpaceRenderOptions = {}): string {
  const { width: W, height: H } = galaxy.params;
  const layers: GalaxyLayers = { ...DEFAULT_LAYERS, ...(options.territories === false ? { territories: false, borders: false } : {}), ...(options.lanes === false ? { lanes: false } : {}), ...(options.labels === false ? { labels: false } : {}), ...options.layers };
  const survey = options.survey ?? null;
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Segoe UI', Arial, sans-serif">`);
  out.push(`<defs><radialGradient id="core" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff3d6" stop-opacity="0.55"/><stop offset="0.35" stop-color="#b98cff" stop-opacity="0.12"/><stop offset="1" stop-color="#05060d" stop-opacity="0"/></radialGradient><filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter><filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="#05060d"/><ellipse cx="${W / 2}" cy="${H / 2}" rx="${W * 0.36}" ry="${H * 0.36}" fill="url(#core)"/>`);
  for (const nebula of galaxy.nebulae) out.push(`<circle cx="${r1(nebula.x)}" cy="${r1(nebula.y)}" r="${r1(nebula.r)}" fill="${nebula.color}" opacity="0.16" filter="url(#soft)"/>`);
  const custom = new Map((galaxy.params.custom ?? []).map((kind) => [kind.id, kind]));
  const hidden = (id?: string) => !!options.players && !!id && !!custom.get(id)?.secret;
  const zones = (galaxy.zones ?? []).filter((zone) => !hidden(zone.custom));
  for (const zone of zones) if (zone.kind !== "dark-nebula") drawZone(zone, custom, out);

  // The finding grid under everything else.
  if (layers.grid) {
    const lines: string[] = [];
    for (let x = GRID; x < W; x += GRID) lines.push(`M${x},0V${H}`);
    for (let y = GRID; y < H; y += GRID) lines.push(`M0,${y}H${W}`);
    out.push(`<path d="${lines.join("")}" stroke="#7d8fc9" stroke-opacity="0.18" stroke-width="0.6"/><g font-size="10" fill="#9fb0d8" opacity="0.7">`);
    for (let k = 0; k * GRID < W; k++) out.push(`<text x="${k * GRID + GRID / 2}" y="14" text-anchor="middle">${gridLetter(k)}</text>`);
    for (let k = 0; k * GRID < H; k++) out.push(`<text x="6" y="${k * GRID + GRID / 2 + 4}">${k + 1}</text>`);
    out.push(`</g>`);
  }
  // Territories traced as smooth outlines: a soft fill and a crisp border; sectors as dashed lines inside.
  const owned = layers.territories || layers.borders ? territories(galaxy, (star) => star.empire) : new Map<number, Point[][]>();
  for (const empire of galaxy.empires.slice(1)) {
    const rings = owned.get(empire.id);
    if (!rings?.length) continue;
    const d = ringPath(rings);
    if (layers.territories) out.push(`<path d="${d}" fill="${empire.color}" fill-opacity="${options.highlight === empire.id ? 0.3 : 0.14}" fill-rule="evenodd"/>`);
    if (layers.borders) out.push(`<path d="${d}" fill="none" stroke="${empire.color}" stroke-width="${options.highlight === empire.id ? 2.2 : 1.3}" stroke-opacity="0.85" stroke-linejoin="round"/>`);
  }
  if (layers.sectors && survey) {
    const sectors = territories(galaxy, (star) => survey.sectorOf[star.id] + 1);
    for (const sector of survey.sectors) {
      const rings = sectors.get(sector.id + 1);
      if (!rings?.length) continue;
      out.push(`<path d="${ringPath(rings)}" fill="none" stroke="${galaxy.empires[sector.power].color}" stroke-width="0.7" stroke-dasharray="3 3" stroke-opacity="0.7"/>`);
    }
  }
  if (layers.lanes) {
    const plain: string[] = [];
    const routes: [string, string][] = [];
    const risky: [string, number][] = [];
    const crossings: string[] = [];
    galaxy.lanes.forEach(([a, b], k) => {
      const d = `M${r1(galaxy.stars[a].x)},${r1(galaxy.stars[a].y)}L${r1(galaxy.stars[b].x)},${r1(galaxy.stars[b].y)}`;
      plain.push(d);
      const info = survey?.lanes[k];
      if (!info) return;
      if (layers.trade && info.trade >= 2) routes.push([d, info.trade === 3 ? "2.4" : "1.3"]);
      if (layers.danger && info.danger) risky.push([d, info.danger]);
      if (layers.borders && info.border) {
        // A short bar across a lane where it crosses into another power's space.
        const mx = (galaxy.stars[a].x + galaxy.stars[b].x) / 2,
          my = (galaxy.stars[a].y + galaxy.stars[b].y) / 2;
        const angle = Math.atan2(galaxy.stars[b].y - galaxy.stars[a].y, galaxy.stars[b].x - galaxy.stars[a].x) + Math.PI / 2;
        crossings.push(`M${r1(mx - Math.cos(angle) * 3)},${r1(my - Math.sin(angle) * 3)}L${r1(mx + Math.cos(angle) * 3)},${r1(my + Math.sin(angle) * 3)}`);
      }
      if (info.choke) {
        const mx = (galaxy.stars[a].x + galaxy.stars[b].x) / 2,
          my = (galaxy.stars[a].y + galaxy.stars[b].y) / 2;
        out.push(`<path d="M${r1(mx)},${r1(my - 3.2)}L${r1(mx + 3.2)},${r1(my)}L${r1(mx)},${r1(my + 3.2)}L${r1(mx - 3.2)},${r1(my)}Z" fill="#ff8a3d" stroke="#05060d" stroke-width="0.6"/>`);
      }
    });
    out.push(`<path d="${plain.join("")}" stroke="#6f8cc7" stroke-opacity="0.35" stroke-width="0.7"/>`);
    for (const width of ["1.3", "2.4"]) {
      const d = routes.filter(([, w]) => w === width).map(([path]) => path).join("");
      if (d) out.push(`<path d="${d}" stroke="${TRADE}" stroke-opacity="${width === "2.4" ? 0.75 : 0.5}" stroke-width="${width}" stroke-linecap="round"${width === "2.4" ? ` filter="url(#glow)"` : ""}/>`);
    }
    for (const level of [1, 2]) {
      const d = risky.filter(([, l]) => l === level).map(([path]) => path).join("");
      if (d) out.push(`<path d="${d}" stroke="${level === 2 ? RED : AMBER}" stroke-opacity="0.75" stroke-width="1" stroke-dasharray="1.5 2.5"/>`);
    }
    if (crossings.length) out.push(`<path d="${crossings.join("")}" stroke="#e6ecff" stroke-opacity="0.75" stroke-width="0.9"/>`);
    for (const [a, b] of galaxy.wormholes) {
      const s = galaxy.stars[a],
        e = galaxy.stars[b];
      const mx = (s.x + e.x) / 2 + (e.y - s.y) * 0.25,
        my = (s.y + e.y) / 2 - (e.x - s.x) * 0.25;
      out.push(`<path d="M${r1(s.x)},${r1(s.y)}Q${r1(mx)},${r1(my)} ${r1(e.x)},${r1(e.y)}" fill="none" stroke="#c77dff" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.8"/>`);
    }
    for (const [a, b] of galaxy.gates ?? []) {
      const s = galaxy.stars[a],
        e = galaxy.stars[b];
      out.push(`<path d="M${r1(s.x)},${r1(s.y)}L${r1(e.x)},${r1(e.y)}" fill="none" stroke="#4de1ff" stroke-width="1.1" stroke-dasharray="1 3" stroke-linecap="round" opacity="0.85"/>`);
    }
  }
  // The stars a selected star reaches in one jump.
  const chosen = options.highlightStar !== null && options.highlightStar !== undefined ? galaxy.stars[options.highlightStar] : null;
  if (chosen) {
    const near = galaxy.lanes.filter(([a, b]) => a === chosen.id || b === chosen.id).map(([a, b]) => galaxy.stars[a === chosen.id ? b : a]);
    out.push(`<g stroke="#ffd34d" fill="none">${near.map((star) => `<path d="M${r1(chosen.x)},${r1(chosen.y)}L${r1(star.x)},${r1(star.y)}" stroke-width="1.4" stroke-opacity="0.8"/><circle cx="${r1(star.x)}" cy="${r1(star.y)}" r="4.5" stroke-width="0.9" stroke-opacity="0.8"/>`).join("")}</g>`);
  }
  for (const star of galaxy.stars) {
    const spec = SPECTRA[star.spectral];
    const r = spec.size * (star.capital ? 1.6 : 1);
    if (star.spectral === "BH") out.push(`<circle cx="${r1(star.x)}" cy="${r1(star.y)}" r="${r1(r + 1.2)}" fill="#000" stroke="#ffb35c" stroke-width="0.9" filter="url(#glow)"/>`);
    else out.push(`<circle cx="${r1(star.x)}" cy="${r1(star.y)}" r="${r1(r)}" fill="${spec.color}" filter="url(#glow)"/>`);
    if (star.capital) out.push(`<circle cx="${r1(star.x)}" cy="${r1(star.y)}" r="${r1(r + 3)}" fill="none" stroke="${galaxy.empires[star.empire].color}" stroke-width="1.2"/>`);
    // A free world: a white ring; natives: a green dot below.
    if (star.independent) out.push(`<circle cx="${r1(star.x)}" cy="${r1(star.y)}" r="${r1(r + 2.4)}" fill="none" stroke="#e6ecff" stroke-width="0.7" stroke-dasharray="1.6 1.2"/>`);
    if (star.natives) out.push(`<circle cx="${r1(star.x)}" cy="${r1(star.y + r + 2.6)}" r="1.1" fill="#36e0a0"/>`);
    const zone = survey?.worlds[star.id]?.zone;
    if (layers.zones && zone && zone !== "green") out.push(`<circle cx="${r1(star.x)}" cy="${r1(star.y)}" r="${r1(r + 5)}" fill="none" stroke="${zone === "red" ? RED : AMBER}" stroke-width="1" stroke-opacity="0.85"/>`);
    if (survey?.chokes[star.id] && layers.lanes) out.push(`<rect x="${r1(star.x - r - 2.4)}" y="${r1(star.y - r - 2.4)}" width="${r1(2 * r + 4.8)}" height="${r1(2 * r + 4.8)}" fill="none" stroke="#ff8a3d" stroke-width="0.8" transform="rotate(45 ${r1(star.x)} ${r1(star.y)})"/>`);
    if (star.feature) out.push(`<text x="${r1(star.x + 4)}" y="${r1(star.y - 4)}" font-size="8" fill="${star.farGate ? "#4de1ff" : "#ffd27a"}" font-family="'Segoe UI Symbol', sans-serif">${FEATURE_GLYPH[star.feature]}</text>`);
    const own = star.custom && !hidden(star.custom) ? custom.get(star.custom) : undefined;
    if (own) out.push(`<text x="${r1(star.x - 4)}" y="${r1(star.y - 4)}" text-anchor="end" font-size="9" fill="${own.color}" font-family="'Segoe UI Symbol', 'Segoe UI Emoji', sans-serif">${esc(own.glyph)}</text>`);
  }
  for (const id of options.marked ?? []) {
    const star = galaxy.stars[id];
    if (star) out.push(`<circle cx="${r1(star.x)}" cy="${r1(star.y)}" r="6" fill="none" stroke="#36e0ff" stroke-width="1.2"/>`);
  }
  if (chosen) out.push(`<circle cx="${r1(chosen.x)}" cy="${r1(chosen.y)}" r="7" fill="none" stroke="#ffd34d" stroke-width="1.5"/>`);
  const pending = options.pending !== null && options.pending !== undefined ? galaxy.stars[options.pending] : null;
  if (pending) out.push(`<circle cx="${r1(pending.x)}" cy="${r1(pending.y)}" r="9" fill="none" stroke="#36e0a0" stroke-width="1.6" stroke-dasharray="3 2"/>`);
  // Dark nebulae swallow the starlight behind them.
  for (const zone of zones) if (zone.kind === "dark-nebula") drawZone(zone, custom, out);
  const picked = zones.find((zone) => zone.id === options.highlightZone);
  if (picked) out.push(`<ellipse cx="${r1(picked.x)}" cy="${r1(picked.y)}" rx="${r1(picked.r + 4)}" ry="${r1(picked.r * picked.squash + 4)}" transform="rotate(${r1((picked.angle * 180) / Math.PI)} ${r1(picked.x)} ${r1(picked.y)})" fill="none" stroke="#ffd34d" stroke-width="1.5"/>`);
  if (layers.labels) {
    out.push(`<g font-size="7" fill="#cfd9ff" opacity="0.85">`);
    for (const star of galaxy.stars) if (star.capital || star.feature || star.independent || (star.settled && star.id % 3 === 0)) out.push(`<text x="${r1(star.x + 4)}" y="${r1(star.y + 9)}">${text(star.name)}</text>`);
    out.push(`</g><g text-anchor="middle" font-weight="600">`);
    for (const empire of galaxy.empires.slice(1)) {
      const mine = galaxy.stars.filter((star) => star.empire === empire.id);
      const label = text(empire.name.toUpperCase());
      const place = labelOf(owned.get(empire.id) ?? [], mine, empire.name);
      if (place) out.push(`<text x="${r1(place.x)}" y="${r1(place.y)}" font-size="${r1(place.size)}" letter-spacing="${r1(place.size * 0.25)}" fill="${empire.color}" opacity="0.8" transform="rotate(${r1((place.angle * 180) / Math.PI)} ${r1(place.x)} ${r1(place.y)})" stroke="#05060d" stroke-width="2.5" stroke-opacity="0.6" paint-order="stroke">${label}</text>`);
      else if (mine.length >= 3) {
        const x = mine.reduce((s, star) => s + star.x, 0) / mine.length;
        const y = mine.reduce((s, star) => s + star.y, 0) / mine.length;
        out.push(`<text x="${r1(x)}" y="${r1(y)}" font-size="14" letter-spacing="4" fill="${empire.color}" opacity="0.8">${label}</text>`);
      }
    }
    out.push(`</g>`);
    if (layers.sectors && survey) out.push(`<g font-size="8" font-style="italic" fill="#e6ecff" opacity="0.6" text-anchor="middle">${survey.sectors.map((sector) => `<text x="${r1(galaxy.stars[sector.capital].x)}" y="${r1(galaxy.stars[sector.capital].y - 9)}">${text(galaxy.stars[sector.capital].name)}</text>`).join("")}</g>`);
    for (const nebula of galaxy.nebulae) out.push(`<text x="${r1(nebula.x)}" y="${r1(nebula.y)}" text-anchor="middle" font-size="9" font-style="italic" fill="${nebula.color}" opacity="0.7">${text(nebula.name)}</text>`);
    for (const zone of zones) out.push(`<text x="${r1(zone.x)}" y="${r1(zone.y + zone.r * zone.squash + 10)}" text-anchor="middle" font-size="8" font-style="italic" fill="${zone.kind === "custom" ? (custom.get(zone.custom ?? "")?.color ?? "#ffd27a") : ZONE_STYLE[zone.kind].edge}" opacity="0.8">${text(zone.name)}</text>`);
  }
  out.push(`<text x="20" y="34" font-size="20" letter-spacing="3" fill="#e6ecff" font-weight="600">${text(galaxy.name.toUpperCase())}</text>`);
  // Scale: ten thousand light years.
  const length = 10_000 / galaxy.scale;
  out.push(`<g fill="#cfd9ff" font-size="10"><rect x="${W - length - 30}" y="${H - 30}" width="${r1(length)}" height="3"/><text x="${W - 30}" y="${H - 36}" text-anchor="end">10 000 ly</text></g>`);
  out.push(`</svg>`);
  return out.join("");
}

const WORLD_COLORS: Record<BodyKind, [string, string]> = {
  lava: ["#ff6a2b", "#5a1a0a"],
  barren: ["#a59a8c", "#5e564c"],
  desert: ["#e3b66a", "#9a6a33"],
  terran: ["#4f9bd6", "#3f8a4e"],
  ocean: ["#2f7fd0", "#1d4f8f"],
  jungle: ["#3faa5a", "#1f6b3a"],
  tundra: ["#cfe1e8", "#8aa7b4"],
  ice: ["#e8f6ff", "#9cc9e6"],
  "gas-giant": ["#e0b88a", "#a5734a"],
  "ice-giant": ["#8fd3ea", "#3f8fb5"],
  belt: ["#8a8070", "#5a5246"],
};

/** A whole number in groups of three, the same on every machine (the map is not in the reader's locale). */
const group = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/gu, " ");

export type SystemView = "scheme" | "orbits";
export type SystemStyle = "space" | "orrery";

/** A system map's size, and how it is laid out: shared by the drawing and the clicks. */
export const SYSTEM_SIZE = { width: 1600, height: 1000 };

/** The star's place and the radius of an orbit (AU) on the map: a fan to the right (scheme), or rings round the
 * middle (orbits). Square-root distances, so the inner worlds do not crowd the star. */
export function systemLayout(system: StarSystem, view: SystemView = "scheme"): { centre: Point; rOf: (au: number) => number; maxOrbit: number } {
  const maxOrbit = Math.max(system.frost * 1.2, ...system.bodies.filter((b) => !b.removed).map((b) => b.orbit), ...(system.sites ?? []).map((s) => s.orbit), 1);
  const { width: W, height: H } = SYSTEM_SIZE;
  if (view === "orbits") return { centre: [W / 2, H / 2], rOf: (au) => 46 + Math.sqrt(Math.max(0, au) / maxOrbit) * (H / 2 - 110), maxOrbit };
  return { centre: [110, H / 2], rOf: (au) => 90 + Math.sqrt(Math.max(0, au) / maxOrbit) * (W - 260), maxOrbit };
}

/** Where on its orbit something is: as generated in the scheme (turned no further than the frame allows), moved on by
 * the date (days) in the orbits view. */
function angleOn(system: StarSystem, orbit: number, angle: number, view: SystemView, day: number): number {
  if (view !== "orbits") {
    const limit = Math.asin(Math.min(1, (SYSTEM_SIZE.height / 2 - 80) / Math.max(1, systemLayout(system, view).rOf(orbit))));
    return Math.max(-limit, Math.min(limit, angle));
  }
  if (!day) return angle;
  const year = 365.25 * Math.sqrt(orbit ** 3 / SPECTRA[system.spectral].mass);
  return angle + (2 * Math.PI * day) / Math.max(1, year);
}

/** How big a world is drawn. */
export const bodySize = (body: Pick<Body, "radius">) => 5 + Math.sqrt(body.radius) * 5;

export function bodyPoint(system: StarSystem, body: Body, view: SystemView = "scheme", day = 0): { x: number; y: number; r: number; centre: [number, number] } {
  const { centre, rOf } = systemLayout(system, view);
  const r = rOf(body.orbit);
  const angle = angleOn(system, body.orbit, body.angle, view, day);
  return { x: centre[0] + Math.cos(angle) * r, y: centre[1] + Math.sin(angle) * r, r, centre: [centre[0], centre[1]] };
}

/** Where a moon is drawn round its world. */
export function moonPoint(system: StarSystem, body: Body, index: number, view: SystemView = "scheme", day = 0): { x: number; y: number; r: number } {
  const at = bodyPoint(system, body, view, day);
  const angle = (index / Math.max(1, body.moons.length)) * Math.PI * 2;
  const size = bodySize(body);
  return { x: at.x + Math.cos(angle) * (size + 9), y: at.y + Math.sin(angle) * (size + 9), r: 1.5 + body.moons[index].radius * 4 };
}

/** Where a place of the system is drawn: beside its world or moon, or on an orbit of its own. */
export function sitePoint(system: StarSystem, site: Site, view: SystemView = "scheme", day = 0): { x: number; y: number } {
  const body = site.body !== null ? system.bodies.find((b) => b.id === site.body && !b.removed) : undefined;
  if (body) {
    if (site.moon !== undefined && body.moons[site.moon]) {
      const moon = moonPoint(system, body, site.moon, view, day);
      return { x: moon.x + 7, y: moon.y - 7 };
    }
    const at = bodyPoint(system, body, view, day);
    const stack = system.sites.filter((s) => s.body === site.body && s.moon === undefined).indexOf(site);
    const angle = -Math.PI / 4 - stack * 0.55;
    const size = bodySize(body) + 14;
    return { x: at.x + Math.cos(angle) * size, y: at.y + Math.sin(angle) * size };
  }
  const { centre, rOf } = systemLayout(system, view);
  const angle = angleOn(system, site.orbit, site.angle, view, day);
  return { x: centre[0] + Math.cos(angle) * rOf(site.orbit), y: centre[1] + Math.sin(angle) * rOf(site.orbit) };
}

/** Where a way out of the system is drawn: at the map's edge, in its direction on the galaxy map. */
export function exitPoint(system: StarSystem, exit: SystemExit, view: SystemView = "scheme"): { x: number; y: number } {
  const { centre } = systemLayout(system, view);
  const { width: W, height: H } = SYSTEM_SIZE;
  const dx = Math.cos(exit.angle),
    dy = Math.sin(exit.angle);
  const inset = 34;
  const tx = dx > 0 ? (W - inset - centre[0]) / dx : dx < 0 ? (inset - centre[0]) / dx : Infinity;
  const ty = dy > 0 ? (H - inset - 30 - centre[1]) / dy : dy < 0 ? (inset + 40 - centre[1]) / dy : Infinity;
  const t = Math.min(tx, ty);
  return { x: centre[0] + dx * t, y: centre[1] + dy * t };
}

/** A region of trouble as it looks from inside a system: a wash over the whole map. */
function regionOver(kind: ZoneKind, W: number, H: number): string {
  const style = ZONE_STYLE[kind];
  const scatter = (count: number, draw: (x: number, y: number, k: number) => string) => Array.from({ length: count }, (_, k) => draw(((k * 0.618034) % 1) * W, ((k * 0.381966 + (k % 7) * 0.13) % 1) * H, k)).join("");
  switch (kind) {
    case "ion-storm":
      return `<rect width="${W}" height="${H}" fill="${style.fill}" opacity="0.06"/><g stroke="${style.edge}" stroke-width="0.8" opacity="0.35" fill="none">${Array.from({ length: 7 }, (_, k) => `<path d="M${(k * 233) % W},0l40,120l-30,40l50,160l-20,60l45,180"/>`).join("")}</g>`;
    case "dead-zone":
      return `<rect width="${W}" height="${H}" fill="#000" opacity="0.25"/><rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="${style.edge}" stroke-width="2" stroke-dasharray="6 8" opacity="0.6"/>`;
    case "dark-nebula":
      return `<rect width="${W}" height="${H}" fill="#000" opacity="0.4"/>`;
    case "radiation-belt":
      return `<rect width="${W}" height="${H}" fill="${style.fill}" opacity="0.05"/><rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="${style.edge}" stroke-width="10" stroke-opacity="0.12" stroke-dasharray="4 10"/>`;
    case "asteroid-field":
      return `<g fill="${style.edge}" opacity="0.35">${scatter(320, (x, y, k) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${k % 6 ? 0.8 : 1.6}"/>`)}</g>`;
    case "gravity-rift":
      return `<path d="M0,${r1(H * 0.2)}L${r1(W * 0.3)},${r1(H * 0.35)}L${r1(W * 0.5)},${r1(H * 0.3)}L${r1(W * 0.75)},${r1(H * 0.55)}L${W},${r1(H * 0.5)}" fill="none" stroke="${style.fill}" stroke-width="10" opacity="0.15"/><path d="M0,${r1(H * 0.2)}L${r1(W * 0.3)},${r1(H * 0.35)}L${r1(W * 0.5)},${r1(H * 0.3)}L${r1(W * 0.75)},${r1(H * 0.55)}L${W},${r1(H * 0.5)}" fill="none" stroke="${style.edge}" stroke-width="0.8" opacity="0.6"/>`;
    case "crystal-field":
      return `<g fill="${style.fill}" fill-opacity="0.35">${scatter(120, (x, y) => `<path d="M${r1(x)},${r1(y - 3)}L${r1(x + 1.8)},${r1(y)}L${r1(x)},${r1(y + 3)}L${r1(x - 1.8)},${r1(y)}Z"/>`)}</g>`;
    case "plasma-sea":
      return `<rect width="${W}" height="${H}" fill="${style.fill}" opacity="0.08"/>`;
  }
}

export interface SystemRenderOptions {
  script?: "latin" | "cyrillic";
  /** The world picked, a moon of it, or a place. */
  highlight?: number | null;
  highlightMoon?: [number, number] | null;
  highlightSite?: number | null;
  view?: SystemView;
  /** Days on from the generated positions, for the orbits view. */
  day?: number;
  style?: SystemStyle;
  /** Ways out of the system, drawn at the edge. */
  exits?: SystemExit[];
  /** The players' view: the game master's secret things are not drawn. */
  players?: boolean;
}

export function renderSystem(system: StarSystem, options: SystemRenderOptions = {}): string {
  const { width: W, height: H } = SYSTEM_SIZE;
  const view = options.view ?? "scheme";
  const day = options.day ?? 0;
  const brass = options.style === "orrery";
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const { centre, rOf, maxOrbit } = systemLayout(system, view);
  const [sx, sy] = centre;
  const spec = SPECTRA[system.spectral];
  const ink = brass ? "#f3e3b9" : "#dfe7ff";
  const line = brass ? "#b08d57" : "#3a4a6a";
  const bodies = system.bodies.filter((b) => !b.removed);
  const custom = new Map((system.custom ?? []).map((kind) => [kind.id, kind]));
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${brass ? "Georgia, 'Times New Roman', serif" : "'Segoe UI', Arial, sans-serif"}">`);
  out.push(`<defs><radialGradient id="sun"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="${spec.color}"/><stop offset="1" stop-color="${spec.color}" stop-opacity="0"/></radialGradient><radialGradient id="brass" cx="35%" cy="35%" r="75%"><stop offset="0" stop-color="#f6dc96"/><stop offset="0.6" stop-color="#c9a24a"/><stop offset="1" stop-color="#7a5a22"/></radialGradient><radialGradient id="wood" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="#2e2014"/><stop offset="1" stop-color="#120c07"/></radialGradient>`);
  for (const [kind, [light, dark]] of Object.entries(WORLD_COLORS)) out.push(`<radialGradient id="w-${kind}" cx="35%" cy="35%" r="70%"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`);
  out.push(`</defs><rect width="${W}" height="${H}" fill="${brass ? "url(#wood)" : "#04050b"}"/>`);
  // The regions of trouble the star lies in wash over the whole system.
  for (const zone of system.context?.zones ?? []) out.push(regionOver(zone, W, H));
  // Habitable zone and frost line.
  const [zi, zo] = system.zone;
  out.push(`<circle cx="${sx}" cy="${sy}" r="${r1((rOf(zi) + rOf(zo)) / 2)}" fill="none" stroke="#36e0a0" stroke-opacity="${brass ? 0.1 : 0.12}" stroke-width="${r1(Math.max(4, rOf(zo) - rOf(zi)))}"/>`);
  out.push(`<circle cx="${sx}" cy="${sy}" r="${r1(rOf(system.frost))}" fill="none" stroke="${brass ? "#d9c9a4" : "#9cc9e6"}" stroke-opacity="0.5" stroke-dasharray="6 6"/>`);
  // Wonders round the star itself: a Dyson shell, a ringworld.
  for (const site of system.sites ?? []) {
    if (site.kind === "dyson-shell") out.push(`<circle cx="${sx}" cy="${sy}" r="${r1(rOf(site.orbit))}" fill="none" stroke="#ffd27a" stroke-width="5" stroke-dasharray="14 4" stroke-opacity="0.55"/>`);
    if (site.kind === "ringworld") out.push(`<circle cx="${sx}" cy="${sy}" r="${r1(rOf(site.orbit))}" fill="none" stroke="#5fbf6a" stroke-width="7" stroke-opacity="0.55"/><circle cx="${sx}" cy="${sy}" r="${r1(rOf(site.orbit))}" fill="none" stroke="#2f7fd0" stroke-width="2" stroke-opacity="0.6" stroke-dasharray="20 9"/>`);
  }
  // The star: a black hole is a dark disc in its glowing ring of infalling matter, not a light; brass for the orrery.
  if (system.spectral === "BH") out.push(`<ellipse cx="${sx}" cy="${sy}" rx="${spec.size * 34}" ry="${spec.size * 9}" fill="none" stroke="#ffb35c" stroke-width="5" opacity="0.75" transform="rotate(-14 ${sx} ${sy})"/><circle cx="${sx}" cy="${sy}" r="${spec.size * 14}" fill="#000" stroke="#ffb35c" stroke-width="2"/>`);
  else if (brass) {
    const r = spec.size * (system.spectral === "WD" || system.spectral === "NS" ? 10 : 18);
    out.push(`<g stroke="#c9a24a" stroke-width="2">${Array.from({ length: 16 }, (_, k) => `<path d="M${r1(sx + Math.cos((k * Math.PI) / 8) * r * 1.1)},${r1(sy + Math.sin((k * Math.PI) / 8) * r * 1.1)}L${r1(sx + Math.cos((k * Math.PI) / 8) * r * (k % 2 ? 1.45 : 1.7))},${r1(sy + Math.sin((k * Math.PI) / 8) * r * (k % 2 ? 1.45 : 1.7))}"/>`).join("")}</g><circle cx="${sx}" cy="${sy}" r="${r1(r)}" fill="url(#brass)" stroke="#7a5a22" stroke-width="1.5"/>`);
  } else out.push(`<circle cx="${sx}" cy="${sy}" r="${spec.size * (system.spectral === "WD" || system.spectral === "NS" ? 20 : 40)}" fill="url(#sun)"/>`);
  if (system.companion) out.push(`<circle cx="${sx - 40}" cy="${sy + 60}" r="14" fill="${brass ? "url(#brass)" : SPECTRA[system.companion].color}"/>`);
  for (const body of bodies) {
    const r = rOf(body.orbit);
    const { x, y } = bodyPoint(system, body, view, day);
    const highlighted = options.highlight === body.id;
    if (body.kind === "belt") {
      out.push(`<circle cx="${sx}" cy="${sy}" r="${r1(r)}" fill="none" stroke="${brass ? "#d9c9a4" : "#a69a86"}" stroke-opacity="${highlighted ? 0.9 : 0.55}" stroke-width="7" stroke-dasharray="1.5 3.5"/>`);
      out.push(`<text x="${r1(x)}" y="${r1(y + 22)}" text-anchor="middle" font-size="11" fill="${brass ? "#d9c9a4" : "#a69a86"}">${text(body.name)}</text>`);
      continue;
    }
    out.push(`<circle cx="${sx}" cy="${sy}" r="${r1(r)}" fill="none" stroke="${highlighted ? "#ffd34d" : line}" stroke-width="${highlighted ? 1.6 : brass ? 1.4 : 0.8}"${brass ? ` stroke-opacity="0.8"` : ""}/>`);
    // The orrery's arm from the sun to each world.
    if (brass) out.push(`<path d="M${sx},${sy}L${r1(x)},${r1(y)}" stroke="#c9a24a" stroke-width="2" stroke-opacity="0.75"/>`);
    const size = bodySize(body);
    if (body.rings) out.push(`<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(size * 1.9)}" ry="${r1(size * 0.5)}" fill="none" stroke="#d9c9a4" stroke-width="2" opacity="0.8" transform="rotate(-18 ${r1(x)} ${r1(y)})"/>`);
    out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(size)}" fill="url(#w-${body.kind})" stroke="${highlighted ? "#ffd34d" : brass ? "#c9a24a" : "none"}" stroke-width="2"/>`);
    if (body.kind === "gas-giant" || body.kind === "ice-giant") for (let k = -2; k <= 2; k++) out.push(`<path d="M${r1(x - size * 0.9)},${r1(y + k * size * 0.3)}H${r1(x + size * 0.9)}" stroke="#000" stroke-opacity="0.12" stroke-width="${r1(size * 0.12)}"/>`);
    if (body.habitable) out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(size + 3)}" fill="none" stroke="#36e0a0" stroke-width="1.2" stroke-dasharray="3 2"/>`);
    body.moons.forEach((moon, k) => {
      const at = moonPoint(system, body, k, view, day);
      const picked = options.highlightMoon && options.highlightMoon[0] === body.id && options.highlightMoon[1] === k;
      out.push(`<circle cx="${r1(at.x)}" cy="${r1(at.y)}" r="${r1(at.r)}" fill="url(#w-${moon.kind})"${picked ? ` stroke="#ffd34d" stroke-width="1.4"` : moon.habitable ? ` stroke="#36e0a0" stroke-width="0.8"` : ""}/>`);
      if (moon.population) out.push(`<circle cx="${r1(at.x + at.r + 1.5)}" cy="${r1(at.y - at.r - 1.5)}" r="1.2" fill="#36e0a0"/>`);
    });
    if (body.station) out.push(`<rect x="${r1(x + size + 4)}" y="${r1(y - size - 8)}" width="6" height="6" fill="none" stroke="#ffd27a" stroke-width="1.2" transform="rotate(45 ${r1(x + size + 7)} ${r1(y - size - 5)})"/>`);
    if (body.natives) out.push(`<text x="${r1(x - size - 6)}" y="${r1(y - size)}" text-anchor="end" font-size="11" fill="#36e0a0">☘</text>`);
    out.push(`<text x="${r1(x)}" y="${r1(y + size + 18)}" text-anchor="middle" font-size="12" fill="${ink}">${text(body.name)}</text>`);
    if (body.population) out.push(`<text x="${r1(x)}" y="${r1(y + size + 31)}" text-anchor="middle" font-size="9" fill="#36e0a0">◉ ${group(body.population)} M</text>`);
  }
  // Places: beside their worlds and moons, or out on orbits of their own.
  for (const site of system.sites ?? []) {
    const kind = site.custom ? custom.get(site.custom) : undefined;
    if (options.players && kind?.secret) continue;
    const at = sitePoint(system, site, view, day);
    const color = kind?.color ?? (site.kind === "pirate-den" || site.kind === "prison" || site.kind === "cordon" ? "#ff7a5c" : "#ffd27a");
    const picked = options.highlightSite === site.id;
    if (site.body === null && site.kind !== "dyson-shell" && site.kind !== "ringworld") out.push(`<circle cx="${sx}" cy="${sy}" r="${r1(rOf(site.orbit))}" fill="none" stroke="${color}" stroke-opacity="0.15" stroke-dasharray="2 6"/>`);
    out.push(`<circle cx="${r1(at.x)}" cy="${r1(at.y)}" r="7.5" fill="${brass ? "#1b130c" : "#04050b"}" fill-opacity="0.7" stroke="${picked ? "#ffd34d" : color}" stroke-width="${picked ? 1.6 : 0.7}"/>`);
    out.push(`<text x="${r1(at.x)}" y="${r1(at.y + 4)}" text-anchor="middle" font-size="10" fill="${color}" font-family="'Segoe UI Symbol', 'Segoe UI Emoji', sans-serif">${esc(kind?.glyph ?? SITE_GLYPH[site.kind])}</text>`);
    if (site.body === null || site.main) out.push(`<text x="${r1(at.x)}" y="${r1(at.y + 18)}" text-anchor="middle" font-size="9" font-style="italic" fill="${color}" opacity="0.85">${text(site.name)}</text>`);
  }
  // Ways out: lanes, gates and wormholes, at the edge in their direction.
  for (const exit of options.exits ?? []) {
    const at = exitPoint(system, exit, view);
    const color = exit.kind === "gate" ? "#4de1ff" : exit.kind === "wormhole" ? "#c77dff" : brass ? "#d9c9a4" : "#9fb0d8";
    const deg = r1((exit.angle * 180) / Math.PI);
    out.push(`<g fill="${color}"><path d="M8,0L-6,-6L-3,0L-6,6Z" transform="translate(${r1(at.x)} ${r1(at.y)}) rotate(${deg})"/><text x="${r1(at.x - Math.cos(exit.angle) * 14)}" y="${r1(at.y - Math.sin(exit.angle) * 14 + 4)}" text-anchor="${Math.cos(exit.angle) > 0.3 ? "end" : Math.cos(exit.angle) < -0.3 ? "start" : "middle"}" font-size="10">${text(exit.name)} · ${group(exit.distance)} ly</text></g>`);
  }
  // A scale in AU along the line from the star to the right.
  // Ticks no closer than their labels need.
  const ticks = [0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000].filter((au) => au <= maxOrbit * 1.05 && rOf(au) - rOf(0) > 30).reduce<number[]>((kept, au) => (!kept.length || rOf(au) - rOf(kept[kept.length - 1]) > 48 ? [...kept, au] : kept), []);
  const scaleY = H - 16;
  out.push(`<g stroke="${brass ? "#c9a24a" : "#6f8cc7"}" fill="${brass ? "#d9c9a4" : "#9fb0d8"}" font-size="10" text-anchor="middle"><path d="M${r1(sx + rOf(0))},${scaleY}H${r1(sx + rOf(maxOrbit))}" stroke-width="1"/>${ticks.map((au) => `<path d="M${r1(sx + rOf(au))},${scaleY - 4}V${scaleY + 4}" stroke-width="1"/><text x="${r1(sx + rOf(au))}" y="${scaleY - 7}" stroke="none">${au} AU</text>`).join("")}</g>`);
  out.push(`<text x="20" y="34" font-size="20" letter-spacing="3" fill="${brass ? "#f6dc96" : "#e6ecff"}" font-weight="600">${text(system.name.toUpperCase())}</text><text x="20" y="54" font-size="12" fill="${brass ? "#d9c9a4" : "#9fb0d8"}">${system.spectral}${system.companion ? ` + ${system.companion}` : ""}${system.profile ? ` · ${system.profile.code}` : ""}${view === "orbits" && day ? ` · +${group(day)} d` : ""}</text>`);
  out.push(`</svg>`);
  return out.join("");
}

/** Everything the universe map can show besides its galaxies. */
export interface UniverseRenderOptions {
  script?: "latin" | "cyrillic";
  highlight?: number | null;
  highlightAnomaly?: number | null;
  highlightCluster?: number | null;
  highlightVoid?: number | null;
  /** Galaxies found by a search or a filter, ringed. */
  marked?: number[];
  /** A way along the filaments to draw, and its length in words. */
  ruler?: number[] | null;
  rulerLabel?: string;
  /** The words for the game master's "you are here" mark. */
  hereLabel?: string;
  /** Which galaxies are named: the notable ones, all, or none. */
  names?: "notable" | "all" | "none";
  /** Superclusters drawn with their borders. */
  borders?: boolean;
  /** The players' view: the game master's secret things are not drawn. */
  players?: boolean;
}

const PLANE_COLOR: Record<string, string> = { material: "#4fbf8f", ethereal: "#9fb6d8", astral: "#d8d8f0", fire: "#ff6a2b", water: "#2f7fd0", air: "#cfeaff", earth: "#a5734a", positive: "#ffffff", negative: "#2a2a2a", heaven: "#ffd76a", elysium: "#7ed957", wilds: "#2f9e57", chaos: "#a64dff", abyss: "#8b1a1a", hell: "#d62828", order: "#9aa6b2", dream: "#ff9fd0", shadow: "#555a66", demiplane: "#3fd6c6" };

/** The cosmic web: voids, filaments, galaxies by kind and size, superclusters and their borders, the powers of the
 * universe and their gates, the strange; or, for a setting of magic, crystal spheres in the phlogiston or the planes. */
export function renderUniverse(universe: Universe, options: UniverseRenderOptions = {}): string {
  const { width: W, height: H } = universe.params;
  const cosmology = universe.params.cosmology ?? "web";
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${cosmology === "web" ? "'Segoe UI', Arial, sans-serif" : "Georgia, 'Times New Roman', serif"}">`);
  out.push(`<defs><filter id="u-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="u-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter><linearGradient id="phlogiston" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1340"/><stop offset="0.35" stop-color="#3a1f2e"/><stop offset="0.7" stop-color="#10324a"/><stop offset="1" stop-color="#1d3a24"/></linearGradient><radialGradient id="crystal" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="0.4" stop-color="#bfe8ff" stop-opacity="0.25"/><stop offset="1" stop-color="#6f8cc7" stop-opacity="0.15"/></radialGradient><radialGradient id="planes-bg" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#1c1630"/><stop offset="1" stop-color="#07050f"/></radialGradient></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="${cosmology === "spheres" ? "url(#phlogiston)" : cosmology === "planes" ? "url(#planes-bg)" : "#020309"}"/>`);
  const g = universe.galaxies;
  if (cosmology === "planes") {
    // The ethereal round the material plane, the astral sea round the inner planes.
    out.push(`<ellipse cx="${W / 2}" cy="${H / 2}" rx="${r1(70 * 1.45)}" ry="70" fill="none" stroke="#9fb6d8" stroke-width="10" stroke-opacity="0.12"/><ellipse cx="${W / 2}" cy="${H / 2}" rx="${r1(260 * 1.45)}" ry="260" fill="none" stroke="#d8d8f0" stroke-width="40" stroke-opacity="0.07"/><ellipse cx="${W / 2}" cy="${H / 2}" rx="${r1(380 * 1.45)}" ry="380" fill="none" stroke="#7ad7ff" stroke-width="1" stroke-opacity="0.25" stroke-dasharray="4 8"/>`);
    out.push(`<path d="${universe.filaments.map(([a, b]) => `M${r1(g[a].x)},${r1(g[a].y)}L${r1(g[b].x)},${r1(g[b].y)}`).join("")}" stroke="#d8d8f0" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="2 4"/>`);
    for (const node of g) {
      const r = node.plane === "material" ? 22 : node.plane === "demiplane" ? 9 : node.plane === "ethereal" || node.plane === "astral" ? 12 : 16;
      const color = PLANE_COLOR[node.plane ?? "material"];
      out.push(`<circle cx="${r1(node.x)}" cy="${r1(node.y)}" r="${r}" fill="${color}" fill-opacity="0.85" stroke="${options.highlight === node.id ? "#ffd34d" : "#e6ecff"}" stroke-width="${options.highlight === node.id ? 2.4 : 0.8}" filter="url(#u-glow)"/>`);
      out.push(`<text x="${r1(node.x)}" y="${r1(node.y + r + 14)}" text-anchor="middle" font-size="12" fill="#e6ecff">${text(node.name)}</text>`);
    }
  } else {
    // Superclusters: their soft glow and, if asked, their borders traced like a power's.
    if (cosmology === "web") for (const v of universe.voids) out.push(`<circle cx="${r1(v.x)}" cy="${r1(v.y)}" r="${r1(v.r)}" fill="#000000" stroke="#1b1f3a" stroke-width="1" stroke-dasharray="3 6"${options.highlightVoid === v.id ? ` stroke="#ffd34d"` : ""}/>`);
    else for (const v of universe.voids) out.push(`<circle cx="${r1(v.x)}" cy="${r1(v.y)}" r="${r1(v.r)}" fill="#05030a" fill-opacity="0.35" stroke="${options.highlightVoid === v.id ? "#ffd34d" : "#5a3f6a"}" stroke-dasharray="2 6"/>`);
    for (const node of g) out.push(`<circle cx="${r1(node.x)}" cy="${r1(node.y)}" r="16" fill="${universe.clusters[node.cluster]?.color ?? "#5566aa"}" opacity="0.06" filter="url(#u-soft)"/>`);
    if (options.borders && g.length) {
      const reach = Math.sqrt((W * H) / g.length) * 1.6;
      const rings = traceRegions(g.map((node) => ({ x: node.x, y: node.y, group: node.cluster + 1 })), W, H, reach, 10);
      for (const cluster of universe.clusters) {
        const d = ringPath(rings.get(cluster.id + 1) ?? []);
        if (d) out.push(`<path d="${d}" fill="${cluster.color}" fill-opacity="${options.highlightCluster === cluster.id ? 0.12 : 0.04}" stroke="${cluster.color}" stroke-opacity="${options.highlightCluster === cluster.id ? 0.9 : 0.45}" stroke-width="${options.highlightCluster === cluster.id ? 1.8 : 1}" fill-rule="evenodd"/>`);
      }
    }
    // Filaments, or the phlogiston's currents between the spheres.
    if (cosmology === "spheres") out.push(`<g fill="none" stroke-width="1.4" stroke-opacity="0.45">${universe.filaments.map(([a, b], k) => `<path d="M${r1(g[a].x)},${r1(g[a].y)}Q${r1((g[a].x + g[b].x) / 2 + (g[b].y - g[a].y) * 0.2)},${r1((g[a].y + g[b].y) / 2 - (g[b].x - g[a].x) * 0.2)} ${r1(g[b].x)},${r1(g[b].y)}" stroke="${["#ff9fd0", "#ffd27a", "#7ad7ff", "#9fe0a8", "#c9b8ff"][k % 5]}"/>`).join("")}</g>`);
    else out.push(`<path d="${universe.filaments.map(([a, b]) => `M${r1(g[a].x)},${r1(g[a].y)}L${r1(g[b].x)},${r1(g[b].y)}`).join("")}" stroke="#6c6fd8" stroke-opacity="0.28" stroke-width="0.8"/>`);
    // Gates between galaxies, and the powers' rings round what they hold.
    for (const [a, b] of universe.gates ?? []) {
      const mx = (g[a].x + g[b].x) / 2 + (g[b].y - g[a].y) * 0.18,
        my = (g[a].y + g[b].y) / 2 - (g[b].x - g[a].x) * 0.18;
      out.push(`<path d="M${r1(g[a].x)},${r1(g[a].y)}Q${r1(mx)},${r1(my)} ${r1(g[b].x)},${r1(g[b].y)}" fill="none" stroke="#4de1ff" stroke-width="1" stroke-dasharray="1 3" stroke-linecap="round" opacity="0.8"/>`);
    }
    const powers = universe.powers ?? [];
    for (const node of g) if (node.power !== undefined && powers[node.power]) out.push(`<circle cx="${r1(node.x)}" cy="${r1(node.y)}" r="${node.id === powers[node.power].home ? 9 : 7}" fill="${powers[node.power].color}" fill-opacity="0.12" stroke="${powers[node.power].color}" stroke-width="${node.id === powers[node.power].home ? 1.4 : 0.7}" stroke-opacity="0.8"/>`);
    for (const node of g) {
      // Bigger galaxies, bigger marks.
      const giant = universe.params.scale === "group" && node.id < universe.clusters.length;
      const k = giant ? 3 : Math.max(0.65, Math.min(1.5, Math.sqrt(node.stars / 600)));
      const x = r1(node.x),
        y = r1(node.y);
      const tilt = (node.id * 47) % 180;
      const ring = options.highlight === node.id ? `<circle cx="${x}" cy="${y}" r="${r1(9 * k)}" fill="none" stroke="#ffd34d" stroke-width="1.5"/>` : "";
      const t = `translate(${x} ${y}) scale(${r1(k * 10) / 10}) translate(${-x} ${-y})`;
      let mark: string;
      if (cosmology === "spheres") mark = `<circle cx="${x}" cy="${y}" r="6" fill="url(#crystal)" stroke="#e6f4ff" stroke-width="0.6"/><circle cx="${x}" cy="${y}" r="1.4" fill="${node.civilisations ? "#fff1c9" : "#ffd27a"}"/>`;
      else if (node.kind === "quasar") mark = `<g filter="url(#u-glow)"><circle cx="${x}" cy="${y}" r="2.4" fill="#ffffff"/><path d="M${x},${r1(node.y - 9)}V${r1(node.y + 9)}" stroke="#9fd8ff" stroke-width="0.8" transform="rotate(${tilt} ${x} ${y})"/></g>`;
      else if (node.kind === "lenticular") mark = `<g transform="rotate(${tilt} ${x} ${y})" filter="url(#u-glow)"><ellipse cx="${x}" cy="${y}" rx="5" ry="1" fill="#ffe7c2" opacity="0.8"/><circle cx="${x}" cy="${y}" r="1.6" fill="#fff4dc"/></g>`;
      else if (node.kind === "starburst") mark = `<g filter="url(#u-glow)"><circle cx="${x}" cy="${y}" r="2" fill="#bfe8ff"/><path d="M${r1(node.x - 4)},${y}H${r1(node.x + 4)}M${x},${r1(node.y - 4)}V${r1(node.y + 4)}" stroke="#ff9fd0" stroke-width="0.6"/></g>`;
      else if (node.kind === "colliding") mark = `<g transform="rotate(${tilt} ${x} ${y})" filter="url(#u-glow)"><ellipse cx="${r1(node.x - 2.2)}" cy="${y}" rx="3.6" ry="1.5" fill="#cfe0ff" opacity="0.6"/><ellipse cx="${r1(node.x + 2.2)}" cy="${r1(node.y + 0.8)}" rx="3.2" ry="1.4" fill="#ffd9a8" opacity="0.6" transform="rotate(40 ${r1(node.x + 2.2)} ${r1(node.y + 0.8)})"/><path d="M${r1(node.x + 4)},${r1(node.y + 1)}Q${r1(node.x + 9)},${r1(node.y + 5)} ${r1(node.x + 12)},${r1(node.y + 2)}" fill="none" stroke="#cfe0ff" stroke-width="0.5" opacity="0.6"/></g>`;
      else if (node.kind === "ghost") mark = `<circle cx="${x}" cy="${y}" r="3.2" fill="none" stroke="#8a8fb8" stroke-width="0.5" stroke-dasharray="1 1.4" opacity="0.7"/>`;
      else if (node.kind === "dwarf") mark = `<circle cx="${x}" cy="${y}" r="1.2" fill="#c8c8ff" opacity="0.8"/>`;
      else if (node.kind === "elliptical") mark = `<ellipse cx="${x}" cy="${y}" rx="4" ry="2.6" fill="#ffd9a8" opacity="0.85" filter="url(#u-glow)" transform="rotate(${tilt} ${x} ${y})"/>`;
      else if (node.kind === "irregular") mark = `<g fill="#bcd2ff" filter="url(#u-glow)"><circle cx="${x}" cy="${y}" r="1.6"/><circle cx="${r1(node.x + 2.4)}" cy="${r1(node.y - 1)}" r="1.1"/><circle cx="${r1(node.x - 1.5)}" cy="${r1(node.y + 2)}" r="0.9"/></g>`;
      else mark = `<g transform="rotate(${tilt} ${x} ${y})" filter="url(#u-glow)"><ellipse cx="${x}" cy="${y}" rx="5" ry="1.8" fill="#cfe0ff" opacity="0.55"/><circle cx="${x}" cy="${y}" r="1.4" fill="#fff4dc"/>${node.kind === "ring" ? `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="2.4" fill="none" stroke="#9fd8ff" stroke-width="0.6"/>` : ""}</g>`;
      out.push(`<g transform="${t}">${mark}</g>${ring}`);
      if (node.civilisations) out.push(`<circle cx="${r1(node.x + 4 * k)}" cy="${r1(node.y - 4 * k)}" r="1.4" fill="#36e0a0"/>`);
    }
  }
  for (const id of options.marked ?? []) if (g[id]) out.push(`<circle cx="${r1(g[id].x)}" cy="${r1(g[id].y)}" r="8" fill="none" stroke="#36e0ff" stroke-width="1.2"/>`);
  const custom = new Map((universe.params.custom ?? []).map((kind) => [kind.id, kind]));
  const anomalies = (universe.anomalies ?? []).filter((a) => !(options.players && a.custom && custom.get(a.custom)?.secret));
  for (const anomaly of anomalies) out.push(drawAnomaly(anomaly, custom, options.highlightAnomaly === anomaly.id));
  out.push(`<g text-anchor="middle" font-size="8" font-style="italic" fill="#c9b8ff" opacity="0.75">${anomalies.map((a) => `<text x="${r1(anomalyPoint(a)[0])}" y="${r1(anomalyPoint(a)[1] + (a.kind === "cosmic-string" ? 0 : a.kind === "bubble-wall" ? -8 : Math.max(a.size, 10) + 9))}">${text(a.name)}</text>`).join("")}</g>`);
  if (cosmology !== "planes") {
    out.push(`<g text-anchor="middle" font-size="9" fill="${cosmology === "spheres" ? "#c9a8d8" : "#5a5f8a"}" font-style="italic">${universe.voids.map((v) => `<text x="${r1(v.x)}" y="${r1(v.y)}">${text(v.name)}</text>`).join("")}</g>`);
    // Galaxy names: the notable ones (peoples, quasars, the biggest, a power's home), or all of them.
    const names = options.names ?? "notable";
    const homes = new Set((universe.powers ?? []).map((p) => p.home));
    if (names !== "none") out.push(`<g font-size="${names === "all" ? 5.5 : 7}" fill="#cfd9ff" opacity="0.8">${g.filter((node) => names === "all" || node.civilisations || node.kind === "quasar" || node.stars >= 850 || homes.has(node.id) || node.id === universe.home).map((node) => `<text x="${r1(node.x + 5)}" y="${r1(node.y + 8)}">${text(node.name)}</text>`).join("")}</g>`);
    out.push(`<g text-anchor="middle" font-size="15" letter-spacing="4" font-weight="600">`);
    universe.clusters.forEach((cluster) => {
      const members = g.filter((node) => node.cluster === cluster.id);
      if (!members.length) return;
      const x = members.reduce((s, node) => s + node.x, 0) / members.length;
      const y = members.reduce((s, node) => s + node.y, 0) / members.length;
      out.push(`<text x="${r1(x)}" y="${r1(y)}" fill="${cluster.color}" opacity="0.75">${text(cluster.name.toUpperCase())}</text>`);
    });
    out.push(`</g>`);
    // The powers' names at their homes.
    out.push(`<g text-anchor="middle" font-size="10" font-weight="600" letter-spacing="1.5">${(universe.powers ?? []).map((p) => `<text x="${r1(g[p.home].x)}" y="${r1(g[p.home].y - 12)}" fill="${p.color}" stroke="#020309" stroke-width="2.5" paint-order="stroke">${text(p.name.toUpperCase())}</text>`).join("")}</g>`);
  }
  // A way along the filaments, measured.
  if (options.ruler && options.ruler.length > 1) {
    const d = `M${options.ruler.map((id) => `${r1(g[id].x)},${r1(g[id].y)}`).join("L")}`;
    out.push(`<path d="${d}" fill="none" stroke="#ffd34d" stroke-width="2.2" stroke-opacity="0.85" stroke-linejoin="round"/>`);
    const end = g[options.ruler[options.ruler.length - 1]];
    if (options.rulerLabel) out.push(`<text x="${r1(end.x + 8)}" y="${r1(end.y - 8)}" font-size="12" font-weight="600" fill="#ffd34d" stroke="#020309" stroke-width="3" paint-order="stroke">${esc(options.rulerLabel)}</text>`);
  }
  // The game master's "you are here".
  const home = universe.home !== null && universe.home !== undefined ? g[universe.home] : null;
  if (home) out.push(`<g><path d="M${r1(home.x)},${r1(home.y - 6)}l-5,-11a6,6 0 1 1 10,0z" fill="#ff5c5c" stroke="#ffffff" stroke-width="1"/><circle cx="${r1(home.x)}" cy="${r1(home.y - 20)}" r="2" fill="#ffffff"/>${options.hereLabel ? `<text x="${r1(home.x)}" y="${r1(home.y - 30)}" text-anchor="middle" font-size="11" font-weight="600" fill="#ffffff" stroke="#020309" stroke-width="3" paint-order="stroke">${esc(options.hereLabel)}</text>` : ""}</g>`);
  // A scale in millions of light years.
  if (cosmology === "web") {
    const span = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((mly) => mly / universe.scale >= W / 10) ?? 500;
    const length = span / (universe.scale || 1);
    out.push(`<g fill="#cfd9ff" font-size="10"><rect x="${r1(W - length - 30)}" y="${H - 30}" width="${r1(length)}" height="3"/><text x="${W - 30}" y="${H - 36}" text-anchor="end">${span} Mly</text></g>`);
  }
  out.push(`<text x="20" y="34" font-size="20" letter-spacing="3" fill="#e6ecff" font-weight="600">${text(universe.name.toUpperCase())}</text></svg>`);
  return out.join("");
}

export const ANOMALY_COLOR: Record<AnomalyKind, string> = {
  "great-attractor": "#c77dff",
  "cosmic-string": "#e8f4ff",
  lens: "#9fd8ff",
  "white-hole": "#ffffff",
  "dark-flow": "#7a8cff",
  relic: "#ffd27a",
  supermassive: "#ffb35c",
  "bubble-wall": "#4de1ff",
};

function drawAnomaly(a: Anomaly, custom: Map<string, CustomKind>, picked: boolean): string {
  const x = r1(a.x),
    y = r1(a.y);
  const [px, py] = anomalyPoint(a);
  const ring = !picked ? "" : a.kind === "bubble-wall" ? `<path d="M${r1(a.x + Math.cos(a.angle - 0.9) * a.size)},${r1(a.y + Math.sin(a.angle - 0.9) * a.size)}A${r1(a.size)},${r1(a.size)} 0 0 1 ${r1(a.x + Math.cos(a.angle + 0.9) * a.size)},${r1(a.y + Math.sin(a.angle + 0.9) * a.size)}" fill="none" stroke="#ffd34d" stroke-width="3" opacity="0.8"/>` : `<circle cx="${r1(px)}" cy="${r1(py)}" r="${r1(Math.min(a.size, 40) + 6)}" fill="none" stroke="#ffd34d" stroke-width="1.5"/>`;
  if (a.kind === "custom") {
    const kind = custom.get(a.custom ?? "");
    const color = kind?.color ?? "#ffd27a";
    const area = kind?.area ? `<circle cx="${x}" cy="${y}" r="${r1(a.size)}" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-width="1" stroke-dasharray="5 4"/>` : "";
    return `${area}<text x="${x}" y="${r1(a.y + 5)}" text-anchor="middle" font-size="14" fill="${color}" font-family="'Segoe UI Symbol', 'Segoe UI Emoji', sans-serif">${esc(kind?.glyph ?? "✦")}</text>${ring}`;
  }
  const color = ANOMALY_COLOR[a.kind];
  const dx = Math.cos(a.angle),
    dy = Math.sin(a.angle);
  switch (a.kind) {
    case "great-attractor":
      return `<g fill="none" stroke="${color}" opacity="0.5">${[1, 0.7, 0.42, 0.2].map((k) => `<circle cx="${x}" cy="${y}" r="${r1(a.size * k)}" stroke-width="${r1(0.6 + (1 - k))}" stroke-dasharray="${r1(a.size * k * 0.4)} ${r1(a.size * k * 0.25)}"/>`).join("")}</g><circle cx="${x}" cy="${y}" r="2.5" fill="${color}" filter="url(#u-glow)"/>${ring}`;
    case "cosmic-string":
      return `<path d="M${r1(a.x - dx * a.size)},${r1(a.y - dy * a.size)}L${r1(a.x + dx * a.size)},${r1(a.y + dy * a.size)}" stroke="#9fd8ff" stroke-width="5" opacity="0.15" filter="url(#u-soft)"/><path d="M${r1(a.x - dx * a.size)},${r1(a.y - dy * a.size)}L${r1(a.x + dx * a.size)},${r1(a.y + dy * a.size)}" stroke="${color}" stroke-width="0.8" opacity="0.9"/>${ring}`;
    case "lens":
      return `<circle cx="${x}" cy="${y}" r="${r1(a.size * 0.5)}" fill="none" stroke="${color}" stroke-width="1.6" opacity="0.8" filter="url(#u-glow)" stroke-dasharray="${r1(a.size * 0.9)} ${r1(a.size * 0.25)}"/><circle cx="${x}" cy="${y}" r="1.2" fill="#ffe7c2"/>${ring}`;
    case "white-hole":
      return `<g filter="url(#u-glow)"><circle cx="${x}" cy="${y}" r="3.4" fill="#ffffff"/>${Array.from({ length: 8 }, (_, k) => `<path d="M${r1(a.x + Math.cos((k * Math.PI) / 4) * 5)},${r1(a.y + Math.sin((k * Math.PI) / 4) * 5)}L${r1(a.x + Math.cos((k * Math.PI) / 4) * 12)},${r1(a.y + Math.sin((k * Math.PI) / 4) * 12)}" stroke="#ffffff" stroke-width="0.6"/>`).join("")}</g>${ring}`;
    case "dark-flow":
      return `<g stroke="${color}" stroke-width="0.8" opacity="0.6">${Array.from({ length: 9 }, (_, k) => {
        const ox = a.x + ((k % 3) - 1) * a.size * 0.5,
          oy = a.y + (Math.floor(k / 3) - 1) * a.size * 0.5;
        return `<path d="M${r1(ox - dx * 7)},${r1(oy - dy * 7)}L${r1(ox + dx * 7)},${r1(oy + dy * 7)}M${r1(ox + dx * 7 - dx * 3 - dy * 2.5)},${r1(oy + dy * 7 - dy * 3 + dx * 2.5)}L${r1(ox + dx * 7)},${r1(oy + dy * 7)}L${r1(ox + dx * 7 - dx * 3 + dy * 2.5)},${r1(oy + dy * 7 - dy * 3 - dx * 2.5)}" fill="none"/>`;
      }).join("")}</g>${ring}`;
    case "relic":
      return `<path d="${Array.from({ length: 6 }, (_, k) => `${k ? "L" : "M"}${r1(a.x + Math.cos((k * Math.PI) / 3) * 6)},${r1(a.y + Math.sin((k * Math.PI) / 3) * 6)}`).join("")}Z" fill="none" stroke="${color}" stroke-width="1.2" filter="url(#u-glow)"/><circle cx="${x}" cy="${y}" r="1.4" fill="${color}"/>${ring}`;
    case "supermassive":
      return `<ellipse cx="${x}" cy="${y}" rx="8" ry="3" fill="none" stroke="${color}" stroke-width="1.4" filter="url(#u-glow)" transform="rotate(${r1((a.angle * 180) / Math.PI)} ${x} ${y})"/><circle cx="${x}" cy="${y}" r="3" fill="#000" stroke="${color}" stroke-width="0.6"/>${ring}`;
    case "bubble-wall": {
      const from = a.angle - 0.9,
        to = a.angle + 0.9;
      return `<path d="M${r1(a.x + Math.cos(from) * a.size)},${r1(a.y + Math.sin(from) * a.size)}A${r1(a.size)},${r1(a.size)} 0 0 1 ${r1(a.x + Math.cos(to) * a.size)},${r1(a.y + Math.sin(to) * a.size)}" fill="none" stroke="${color}" stroke-width="1.2" stroke-dasharray="8 4" opacity="0.55"/>${ring}`;
    }
  }
}


/** The game master's kinds on a space map, for its legend. */
function customEntries(kinds: CustomKind[], used: Set<string>, players = false): LegendEntry[] {
  return kinds.filter((kind) => used.has(kind.id) && !(players && kind.secret)).map((kind) => ({ label: kind.name || kind.glyph, swatch: kind.area ? { svg: `<ellipse cx="12" cy="8" rx="9" ry="6" fill="${kind.color}" fill-opacity="0.15" stroke="${kind.color}" stroke-dasharray="3 2"/><text x="12" y="11.5" text-anchor="middle" font-size="9" fill="${kind.color}">${esc(kind.glyph)}</text>` } : { glyph: kind.glyph, color: kind.color } }));
}

export function galaxyLegend(galaxy: Galaxy, survey: GalaxySurvey | null = null, shown: Partial<GalaxyLayers> = {}, players = false): LegendSection[] {
  const layers = { ...DEFAULT_LAYERS, ...shown };
  const stars: LegendEntry[] = present(galaxy.stars.map((s) => s.spectral)).map((spectral) => ({
    key: `spectral.${spectral}`,
    swatch: spectral === "BH" ? { svg: `<circle cx="12" cy="8" r="4" fill="#000" stroke="#ffb35c" stroke-width="1.2"/>` } : { fill: SPECTRA[spectral].color, round: true, stroke: "none" },
  }));
  if (galaxy.stars.some((s) => s.independent)) stars.push({ key: "legend.independent", swatch: { svg: `<circle cx="12" cy="8" r="2" fill="#fff1c9"/><circle cx="12" cy="8" r="5" fill="none" stroke="#e6ecff" stroke-width="0.8" stroke-dasharray="1.6 1.2"/>` } });
  if (galaxy.stars.some((s) => s.natives)) stars.push({ key: "legend.natives", swatch: { svg: `<circle cx="12" cy="6" r="2" fill="#fff1c9"/><circle cx="12" cy="11" r="1.4" fill="#36e0a0"/>` } });
  if (layers.zones && survey?.worlds.some((w) => w.zone === "amber")) stars.push({ key: "zone2.amber", swatch: { svg: `<circle cx="12" cy="8" r="2" fill="#fff1c9"/><circle cx="12" cy="8" r="6" fill="none" stroke="${AMBER}" stroke-width="1"/>` } });
  if (layers.zones && survey?.worlds.some((w) => w.zone === "red")) stars.push({ key: "zone2.red", swatch: { svg: `<circle cx="12" cy="8" r="2" fill="#fff1c9"/><circle cx="12" cy="8" r="6" fill="none" stroke="${RED}" stroke-width="1"/>` } });
  const owner = galaxy.empires[1];
  const space: LegendEntry[] = [
    ...(owner && (layers.territories || layers.borders) ? [{ key: "legend.territory", swatch: { fill: owner.color, opacity: 0.35, stroke: owner.color } }, { key: "legend.capital-star", swatch: { svg: `<circle cx="12" cy="8" r="2.4" fill="#fff1c9"/><circle cx="12" cy="8" r="5.5" fill="none" stroke="${owner.color}" stroke-width="1.2"/>` } }] : []),
    ...(layers.sectors && survey?.sectors.length ? [{ key: "legend.sector", swatch: { line: owner?.color ?? "#9fb0d8", width: 1, dash: "3 3" } }] : []),
    ...(layers.lanes ? [{ key: "legend.hyperlane", swatch: { line: "#6f8cc7", width: 1.2, opacity: 0.7 } }] : []),
    ...(layers.lanes && layers.trade && survey?.lanes.some((l) => l.trade >= 2) ? [{ key: "legend.trade", swatch: { line: TRADE, width: 2.4, opacity: 0.8 } }] : []),
    ...(layers.lanes && layers.borders && survey?.lanes.some((l) => l.border) ? [{ key: "legend.crossing", swatch: { svg: `<path d="M2,8H22" stroke="#6f8cc7" stroke-width="1"/><path d="M12,4V12" stroke="#e6ecff" stroke-width="1.2"/>` } }] : []),
    ...(layers.lanes && layers.danger && survey?.lanes.some((l) => l.danger) ? [{ key: "legend.danger", swatch: { line: AMBER, width: 1.4, dash: "1.5 2.5" } }] : []),
    ...(layers.lanes && survey && (survey.lanes.some((l) => l.choke) || survey.chokes.some(Boolean)) ? [{ key: "legend.choke", swatch: { svg: `<path d="M12,4.5L15.5,8L12,11.5L8.5,8Z" fill="#ff8a3d"/>` } }] : []),
    ...(galaxy.wormholes.length ? [{ key: "feature2.wormhole", swatch: { line: "#c77dff", width: 1.6, dash: "5 4" } }] : []),
    ...(galaxy.gates?.length ? [{ key: "legend.gate-link", swatch: { line: "#4de1ff", width: 1.4, dash: "1 3" } }] : []),
    ...(galaxy.nebulae.length ? [{ key: "legend.nebula", swatch: { fill: galaxy.nebulae[0].color, opacity: 0.35, round: true, stroke: "none" } }] : []),
    ...(layers.grid ? [{ key: "legend.grid", swatch: { svg: `<path d="M8,1V15M16,1V15M1,8H23" stroke="#7d8fc9" stroke-width="0.8"/>` } }] : []),
  ];
  const wonders: LegendEntry[] = present(galaxy.stars.flatMap((s) => (s.feature ? [s.feature] : []))).map((feature) => ({ key: `feature2.${feature}`, swatch: { glyph: FEATURE_GLYPH[feature], color: "#ffd27a" } }));
  const zones: LegendEntry[] = present((galaxy.zones ?? []).flatMap((z) => (z.kind === "custom" ? [] : [z.kind]))).map((kind) => ({ key: `zone.${kind}`, swatch: { fill: ZONE_STYLE[kind].fill, stroke: ZONE_STYLE[kind].edge, opacity: kind === "dead-zone" || kind === "dark-nebula" ? 0.7 : 0.35, round: true } }));
  const used = new Set([...galaxy.stars.flatMap((s) => (s.custom ? [s.custom] : [])), ...(galaxy.zones ?? []).flatMap((z) => (z.custom ? [z.custom] : []))]);
  return [
    { key: "legend.stars", entries: stars },
    { key: "legend.space", entries: space },
    { key: "legend.wonders", entries: wonders },
    { key: "legend.zones", entries: zones },
    { key: "legend.custom", entries: customEntries(galaxy.params.custom ?? [], used, players) },
  ].filter((section) => section.entries.length);
}

export function systemLegend(system: StarSystem, options: { players?: boolean; exits?: boolean } = {}): LegendSection[] {
  const suns: LegendEntry[] = [system.spectral, ...(system.companion ? [system.companion] : [])].map((spectral, k) => ({
    key: k ? "legend.companion" : `spectral.${spectral}`,
    vars: k ? { kind: spectral } : undefined,
    swatch: spectral === "BH" ? { svg: `<circle cx="12" cy="8" r="5" fill="#000" stroke="#ffb35c" stroke-width="1.6"/>` } : { fill: SPECTRA[spectral].color, round: true },
  }));
  const bodies = system.bodies.filter((b) => !b.removed);
  const worlds: LegendEntry[] = present(bodies.map((b) => b.kind)).map((kind) => ({
    key: `body.${kind}`,
    swatch: kind === "belt" ? { line: "#a69a86", width: 5, dash: "1.5 3.5" } : { svg: `<circle cx="12" cy="8" r="6" fill="${WORLD_COLORS[kind][0]}" stroke="${WORLD_COLORS[kind][1]}" stroke-width="1.6"/>` },
  }));
  if (bodies.some((b) => b.natives)) worlds.push({ key: "legend.natives", swatch: { glyph: "☘", color: "#36e0a0" } });
  const orbits: LegendEntry[] = [
    { key: "space.zone", swatch: { line: "#36e0a0", width: 6, opacity: 0.3 } },
    { key: "legend.frost-line", swatch: { line: "#9cc9e6", width: 1.2, dash: "4 3" } },
    ...(bodies.some((b) => b.habitable) ? [{ key: "legend.habitable", swatch: { svg: `<circle cx="12" cy="8" r="6" fill="none" stroke="#36e0a0" stroke-width="1.2" stroke-dasharray="3 2"/>` } }] : []),
    ...(bodies.some((b) => b.rings) ? [{ key: "legend.rings", swatch: { svg: `<ellipse cx="12" cy="8" rx="10" ry="3" fill="none" stroke="#d9c9a4" stroke-width="1.4"/><circle cx="12" cy="8" r="3.5" fill="#e0b88a"/>` } }] : []),
    ...(bodies.some((b) => b.station) ? [{ key: "feature2.station", swatch: { svg: `<rect x="9" y="5" width="6" height="6" fill="none" stroke="#ffd27a" stroke-width="1.2" transform="rotate(45 12 8)"/>` } }] : []),
    ...(bodies.some((b) => b.population || b.moons.some((m) => m.population)) ? [{ key: "legend.population", swatch: { glyph: "◉", color: "#36e0a0" } }] : []),
    ...(options.exits ? [{ key: "legend.exit", swatch: { svg: `<path d="M18,8L6,3L9,8L6,13Z" fill="#9fb0d8"/>` } }] : []),
  ];
  const custom = new Map((system.custom ?? []).map((kind) => [kind.id, kind]));
  const places: LegendEntry[] = present((system.sites ?? []).filter((s) => s.kind !== "custom").map((s) => s.kind)).map((kind) => ({ key: `site.${kind}`, swatch: { glyph: SITE_GLYPH[kind], color: kind === "pirate-den" || kind === "prison" || kind === "cordon" ? "#ff7a5c" : "#ffd27a" } }));
  const used = new Set((system.sites ?? []).flatMap((s) => (s.custom ? [s.custom] : [])));
  const regions: LegendEntry[] = (system.context?.zones ?? []).map((kind) => ({ key: `zone.${kind}`, swatch: { fill: ZONE_STYLE[kind].fill, stroke: ZONE_STYLE[kind].edge, opacity: 0.35 } }));
  return [
    { key: "legend.stars", entries: suns },
    { key: "legend.worlds", entries: worlds },
    { key: "legend.orbits", entries: orbits },
    { key: "legend.zones", entries: regions },
    { key: "legend.sites", entries: places },
    { key: "legend.custom", entries: customEntries([...custom.values()], used, options.players) },
  ].filter((section) => section.entries.length);
}

const GALAXY_LOOK: Record<string, Swatch> = {
  spiral: { svg: `<ellipse cx="12" cy="8" rx="8" ry="3" fill="#cfe0ff" opacity="0.6"/><circle cx="12" cy="8" r="2" fill="#fff4dc"/>` },
  barred: { svg: `<ellipse cx="12" cy="8" rx="8" ry="3" fill="#cfe0ff" opacity="0.6"/><rect x="8" y="7" width="8" height="2" fill="#fff4dc"/>` },
  ring: { svg: `<ellipse cx="12" cy="8" rx="8" ry="4" fill="none" stroke="#9fd8ff" stroke-width="1"/><circle cx="12" cy="8" r="1.6" fill="#fff4dc"/>` },
  elliptical: { svg: `<ellipse cx="12" cy="8" rx="6" ry="4" fill="#ffd9a8" opacity="0.85"/>` },
  lenticular: { svg: `<ellipse cx="12" cy="8" rx="8" ry="1.6" fill="#ffe7c2"/><circle cx="12" cy="8" r="2.2" fill="#fff4dc"/>` },
  irregular: { svg: `<circle cx="10" cy="8" r="2.4" fill="#bcd2ff"/><circle cx="14" cy="6" r="1.6" fill="#bcd2ff"/><circle cx="13" cy="11" r="1.3" fill="#bcd2ff"/>` },
  dwarf: { fill: "#c8c8ff", round: true, stroke: "none" },
  quasar: { svg: `<circle cx="12" cy="8" r="2.6" fill="#ffffff"/><path d="M12,1V15" stroke="#9fd8ff" stroke-width="1"/>` },
  starburst: { svg: `<circle cx="12" cy="8" r="2.6" fill="#bfe8ff"/><path d="M6,8H18M12,2V14" stroke="#ff9fd0" stroke-width="0.8"/>` },
  colliding: { svg: `<ellipse cx="9" cy="8" rx="5" ry="2" fill="#cfe0ff" opacity="0.7"/><ellipse cx="15" cy="9" rx="4.5" ry="2" fill="#ffd9a8" opacity="0.7" transform="rotate(40 15 9)"/>` },
  ghost: { svg: `<circle cx="12" cy="8" r="5" fill="none" stroke="#8a8fb8" stroke-width="0.8" stroke-dasharray="1 1.4"/>` },
};
const ANOMALY_GLYPH: Record<AnomalyKind, string> = { "great-attractor": "◎", "cosmic-string": "╱", lens: "○", "white-hole": "✺", "dark-flow": "⇉", relic: "⬡", supermassive: "●", "bubble-wall": "◜" };

export function universeLegend(universe: Universe, players = false): LegendSection[] {
  const galaxies: LegendEntry[] = (universe.params.cosmology ?? "web") === "spheres" ? [] : present(universe.galaxies.map((g) => g.kind)).map((kind) => ({ key: `gkind.${kind}`, swatch: GALAXY_LOOK[kind] }));
  const cosmology = universe.params.cosmology ?? "web";
  if (cosmology === "planes") return [{ key: "legend.planes", entries: present(universe.galaxies.map((g) => g.plane ?? "material")).map((plane) => ({ key: `plane.${plane}`, swatch: { fill: PLANE_COLOR[plane], round: true } })) }];
  const web: LegendEntry[] = [
    ...(cosmology === "spheres" ? [{ key: "legend.sphere", swatch: { svg: `<circle cx="12" cy="8" r="6" fill="#bfe8ff" fill-opacity="0.3" stroke="#e6f4ff" stroke-width="0.8"/><circle cx="12" cy="8" r="1.5" fill="#ffd27a"/>` } }, { key: "legend.current", swatch: { line: "#ff9fd0", width: 1.4, opacity: 0.7 } }] : [{ key: "legend.filament", swatch: { line: "#6c6fd8", width: 1.2, opacity: 0.6 } }]),
    ...(universe.voids.length ? [{ key: cosmology === "spheres" ? "legend.doldrums" : "legend.void", swatch: { svg: `<circle cx="12" cy="8" r="6.5" fill="#000" stroke="#1b1f3a" stroke-width="1" stroke-dasharray="2 3"/>` } }] : []),
    ...(universe.galaxies.some((g) => g.civilisations) ? [{ key: "legend.civilisation", swatch: { fill: "#36e0a0", round: true, stroke: "none" } }] : []),
    ...((universe.powers ?? []).map((p) => ({ label: p.name, swatch: { svg: `<circle cx="12" cy="8" r="6" fill="${p.color}" fill-opacity="0.15" stroke="${p.color}" stroke-width="1.2"/>` } }))),
    ...(universe.gates?.length ? [{ key: "legend.ugate", swatch: { line: "#4de1ff", width: 1.4, dash: "1 3" } }] : []),
    ...(universe.home !== null && universe.home !== undefined ? [{ key: "legend.here", swatch: { glyph: "📍", color: "#ff5c5c" } }] : []),
  ];
  const strange: LegendEntry[] = present((universe.anomalies ?? []).flatMap((a) => (a.kind === "custom" ? [] : [a.kind]))).map((kind) => ({ key: `anomaly.${kind}`, swatch: { glyph: ANOMALY_GLYPH[kind], color: ANOMALY_COLOR[kind] } }));
  const used = new Set((universe.anomalies ?? []).flatMap((a) => (a.custom ? [a.custom] : [])));
  return [
    { key: "legend.galaxies", entries: galaxies },
    { key: "legend.web", entries: web },
    { key: "legend.strange", entries: strange },
    { key: "legend.custom", entries: customEntries(universe.params.custom ?? [], used, players) },
  ].filter((section) => section.entries.length);
}
