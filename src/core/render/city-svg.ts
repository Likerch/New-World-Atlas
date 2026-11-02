// A city as an SVG string: water, fields and parks, buildings (towers cast shadows), streets and highways, bridges,
// walls with towers and gates, landmark icons and names, with a scale bar in metres.
import type { City, CityParams, LandmarkKind, WardKind } from "../city/model";
import { pathData, smooth, type Point } from "../geometry";
import { toCyrillic } from "../language";
import { centroid } from "../polygon";

export type CityThemeId = "ink" | "color" | "parchment" | "blueprint" | "neon";
export const CITY_THEMES: CityThemeId[] = ["ink", "color", "parchment", "blueprint", "neon"];

export type CityLayerId = "wards" | "fields" | "trees" | "buildings" | "streets" | "walls" | "labels" | "landmarks" | "frame";
export const CITY_LAYERS: CityLayerId[] = ["wards", "fields", "trees", "buildings", "streets", "walls", "labels", "landmarks", "frame"];

interface CityTheme {
  paper: string;
  water: string;
  shore: string;
  field: [string, string];
  fieldLine: string;
  tree: string;
  treeLine: string;
  building: string;
  rich: string;
  landmark: string;
  line: string;
  tower: string;
  shadow: string | null;
  street: string;
  casing: string;
  highway: string;
  wall: string;
  label: string;
  halo: string;
  /** Tints by ward kind; empty for none. */
  tint: Partial<Record<WardKind, string>>;
  font: string;
  glow: boolean;
}

const COLOR_TINT: Partial<Record<WardKind, string>> = {
  plaza: "#efe0b8",
  temple: "#e9dcc9",
  castle: "#d9d2c4",
  harbour: "#d8dfe6",
  patriciate: "#efe2cc",
  administration: "#e8dccb",
  slum: "#e3d9c8",
  park: "#cfe0b9",
  cemetery: "#d9dccb",
  downtown: "#e7e1d7",
  commercial: "#ece4d6",
  industrial: "#dad7d2",
  port: "#d6dde3",
  campus: "#e3e8d2",
  "rich-residential": "#e8ecd9",
  arcology: "#d9dbe4",
  megablock: "#dcdad8",
  "combat-zone": "#d6cbc0",
};

const THEMES: Record<CityThemeId, CityTheme> = {
  ink: { paper: "#f4efe1", water: "#c2d3d8", shore: "#5b5a52", field: ["#ebe4cc", "#e4dcc0"], fieldLine: "#b8ad8f", tree: "#d9dcc4", treeLine: "#6e6a58", building: "#cfc6b4", rich: "#c3b9a4", landmark: "#9f9480", line: "#3e3a33", tower: "#b7ad9a", shadow: "rgba(40,35,25,0.18)", street: "#f4efe1", casing: "#8c8473", highway: "#ffffff", wall: "#3e3a33", label: "#2d2a25", halo: "#f4efe1", tint: {}, font: "'Palatino Linotype', Georgia, serif", glow: false },
  color: { paper: "#f2ede1", water: "#9cc4e0", shore: "#5a7d99", field: ["#e2e6b8", "#d8e0a8"], fieldLine: "#a9b07a", tree: "#9cc68a", treeLine: "#5c8a4e", building: "#d9a582", rich: "#cf9670", landmark: "#b5674a", line: "#6a4a3a", tower: "#b9a7a0", shadow: "rgba(30,30,40,0.22)", street: "#fbf8f1", casing: "#b9ab92", highway: "#f6d27a", wall: "#6b5a4a", label: "#2a2520", halo: "#fbf8f1", tint: COLOR_TINT, font: "'Segoe UI', Arial, sans-serif", glow: false },
  parchment: { paper: "#ecdfc0", water: "#cdbf98", shore: "#5d4a30", field: ["#e4d5b0", "#ddcca4"], fieldLine: "#a8936a", tree: "#d6c79f", treeLine: "#6d5a3d", building: "#c9b48a", rich: "#bfa77b", landmark: "#a48b5f", line: "#4a3a26", tower: "#b5a07a", shadow: null, street: "#ecdfc0", casing: "#8f7a55", highway: "#efe2c4", wall: "#4a3a26", label: "#3a2c1c", halo: "#ecdfc0", tint: {}, font: "'Palatino Linotype', Georgia, serif", glow: false },
  blueprint: { paper: "#1d3f6e", water: "#163257", shore: "#9cc3ef", field: ["#22477a", "#244a7e"], fieldLine: "#3f68a0", tree: "#24497c", treeLine: "#8fb5e6", building: "#2a5288", rich: "#2d5890", landmark: "#3a69a8", line: "#cfe3ff", tower: "#33609c", shadow: null, street: "#1d3f6e", casing: "#8fb5e6", highway: "#cfe3ff", wall: "#ffffff", label: "#e8f2ff", halo: "#1d3f6e", tint: {}, font: "'Segoe UI', Arial, sans-serif", glow: false },
  neon: { paper: "#0b0d14", water: "#06121f", shore: "#1f8fff", field: ["#11161d", "#131920"], fieldLine: "#1f2a33", tree: "#0f2a1f", treeLine: "#1fbf7f", building: "#161a26", rich: "#1b2030", landmark: "#2a1838", line: "#2b3a55", tower: "#1a1f33", shadow: "rgba(0,0,0,0.55)", street: "#0b0d14", casing: "#232c40", highway: "#ffcc33", wall: "#ff3d7f", label: "#e6f1ff", halo: "#0b0d14", tint: {}, font: "'Segoe UI', Arial, sans-serif", glow: true },
};

export function defaultCityTheme(era: CityParams["era"]): CityThemeId {
  return era === "cyberpunk" ? "neon" : era === "modern" || era === "industrial" ? "color" : "ink";
}

const LANDMARK_GLYPH: Record<LandmarkKind, string> = {
  "market-well": "◉",
  temple: "✟",
  keep: "♜",
  tavern: "⚱",
  smithy: "⚒",
  guildhall: "⚖",
  bathhouse: "♨",
  gallows: "⊓",
  docks: "⚓",
  lighthouse: "☼",
  mill: "✣",
  barracks: "⚔",
  "town-hall": "⌂",
  station: "⇄",
  hospital: "✚",
  police: "★",
  stadium: "◎",
  university: "✎",
  museum: "♕",
  factory: "⚙",
  "corp-hq": "◆",
  ripperdoc: "✚",
  "netrunner-den": "⌘",
  "night-market": "¥",
  club: "♫",
  "av-port": "✈",
  undercity: "▼",
  "gang-hq": "☠",
};

export interface CityRenderOptions {
  theme?: CityThemeId;
  layers?: Partial<Record<CityLayerId, boolean>>;
  script?: "latin" | "cyrillic";
  /** A ward drawn with an emphasis outline. */
  highlight?: number | null;
}

const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const r1 = (value: number) => Math.round(value * 10) / 10;
const poly = (points: Point[]) => pathData([...points, points[0]], true);

export function renderCity(city: City, options: CityRenderOptions = {}): string {
  const themeId = options.theme ?? defaultCityTheme(city.params.era);
  const th = THEMES[themeId];
  const layers: Record<CityLayerId, boolean> = { wards: true, fields: true, trees: true, buildings: true, streets: true, walls: true, labels: true, landmarks: true, frame: true, ...options.layers };
  const { width: W, height: H } = city.params;
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const m = (metres: number) => metres / city.scale;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${esc(th.font)}">`);
  out.push(`<defs><clipPath id="city-clip"><rect width="${W}" height="${H}"/></clipPath>${th.glow ? `<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : ""}</defs>`);
  out.push(`<g clip-path="url(#city-clip)"><rect width="${W}" height="${H}" fill="${th.paper}"/>`);

  if (layers.wards) {
    for (const ward of city.wards) {
      const tint = th.tint[ward.kind];
      if (tint) out.push(`<path d="${poly(ward.polygon)}" fill="${tint}"/>`);
    }
  }
  const byKind = (kind: string) => city.buildings.filter((b) => b.kind === kind);
  if (layers.fields) {
    out.push(`<g stroke="${th.fieldLine}" stroke-width="0.5">`);
    byKind("field").forEach((b, k) => out.push(`<path d="${poly(b.polygon)}" fill="${th.field[k % 2]}"/>`));
    out.push(`</g>`);
  }
  // Water over the land, so the shore stays clean.
  if (city.sea) out.push(`<path d="${pathData(smooth([...city.sea, city.sea[0]], true, 1), true)}" fill="${th.water}" stroke="${th.shore}" stroke-width="1.4"/>`);
  if (city.river) {
    const d = pathData(smooth(city.river.points, false, 2), false);
    out.push(`<path d="${d}" fill="none" stroke="${th.shore}" stroke-width="${r1(city.river.width + 2.4)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${th.water}" stroke-width="${r1(city.river.width)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // Roads and avenues under the buildings' edges; highways and rail over them.
  const streetPath = (points: Point[]) => pathData(points, false);
  if (layers.streets) {
    for (const street of city.streets.filter((s) => s.kind === "road" || s.kind === "avenue" || s.kind === "main")) {
      const d = streetPath(street.points);
      out.push(`<path d="${d}" fill="none" stroke="${th.casing}" stroke-width="${r1(street.width + 1.4)}" stroke-linecap="round" stroke-linejoin="round" opacity="${street.kind === "main" ? 0.35 : 0.8}"/><path d="${d}" fill="none" stroke="${th.street}" stroke-width="${r1(street.width)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    for (const [a, b] of city.bridges) out.push(`<path d="M${r1(a[0])},${r1(a[1])}L${r1(b[0])},${r1(b[1])}" stroke="${th.line}" stroke-width="${r1(m(12))}" stroke-linecap="butt"/><path d="M${r1(a[0])},${r1(a[1])}L${r1(b[0])},${r1(b[1])}" stroke="${th.street}" stroke-width="${r1(m(8))}" stroke-linecap="butt"/>`);
  }

  if (layers.trees) {
    out.push(`<g fill="${th.tree}" stroke="${th.treeLine}" stroke-width="0.5">`);
    for (const tree of byKind("tree")) {
      const [cx, cy] = centroid(tree.polygon);
      const r = Math.hypot(tree.polygon[0][0] - cx, tree.polygon[0][1] - cy);
      out.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}"/>`);
    }
    out.push(`</g>`);
  }

  if (layers.buildings) {
    const shadows: string[] = [];
    const shapes: string[] = [];
    const neonLines = ["#38e1ff", "#ff3d7f", "#a46bff", "#ffcc33"];
    for (const building of city.buildings) {
      if (building.kind === "tree" || building.kind === "field") continue;
      const d = poly(building.polygon);
      if (building.kind === "grave") {
        shapes.push(`<path d="${d}" fill="${th.rich}" stroke="none" opacity="0.7"/>`);
        continue;
      }
      if (building.kind === "stall") {
        shapes.push(`<path d="${d}" fill="${themeId === "color" ? "#d9634a" : th.landmark}" stroke="${th.line}" stroke-width="0.3"/>`);
        continue;
      }
      const tall = building.floors >= 8;
      if (th.shadow && (tall || building.kind === "landmark")) {
        const off = Math.min(m(Math.min(building.floors, 120) * 0.9), 26);
        shadows.push(`<path d="${d}" transform="translate(${r1(off)},${r1(off * 0.8)})" fill="${th.shadow}"/>`);
      }
      const ward = city.wards.find((w) => w.id === building.ward);
      const fill = building.kind === "landmark" ? th.landmark : building.kind === "tower" ? th.tower : ward && ward.wealth > 0.7 ? th.rich : th.building;
      const stroke = th.glow && tall ? neonLines[building.floors % neonLines.length] : th.line;
      shapes.push(`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${th.glow && tall ? 0.8 : 0.45}"${th.glow && building.floors > 60 ? ` filter="url(#glow)"` : ""}/>`);
    }
    out.push(`<g>${shadows.join("")}</g><g stroke-linejoin="round">${shapes.join("")}</g>`);
  }

  if (layers.streets) {
    for (const street of city.streets) {
      const d = streetPath(street.kind === "highway" ? smooth(street.points, false, 2) : street.points);
      if (street.kind === "highway") out.push(`<path d="${d}" fill="none" stroke="${th.casing}" stroke-width="${r1(street.width + 2.5)}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${th.highway}" stroke-width="${r1(street.width)}" stroke-linecap="round"${th.glow ? ` filter="url(#glow)"` : ""}/>`);
      else if (street.kind === "rail") out.push(`<path d="${d}" fill="none" stroke="${th.line}" stroke-width="${r1(Math.max(1.2, street.width * 0.6))}"/><path d="${d}" fill="none" stroke="${th.paper}" stroke-width="${r1(Math.max(0.6, street.width * 0.3))}" stroke-dasharray="3 3"/>`);
      else if (street.kind === "skyway") out.push(`<path d="${d}" fill="none" stroke="${th.glow ? "#38e1ff" : th.line}" stroke-width="${r1(Math.max(1.5, street.width * 0.5))}" stroke-dasharray="6 3" opacity="0.85"${th.glow ? ` filter="url(#glow)"` : ""}/>`);
    }
  }

  if (layers.walls) {
    for (const wall of city.walls) {
      const width = wall.citadel ? m(5) : m(6.5);
      const ring = [...wall.ring, wall.ring[0]];
      out.push(`<path d="${pathData(ring, true)}" fill="none" stroke="${th.wall}" stroke-width="${r1(Math.max(1.6, width))}" stroke-linejoin="round"/>`);
      if (wall.bastions) {
        // Star-fort bastions: arrowheads at each corner, pointing outwards.
        const c = centroid(wall.ring);
        for (const p of wall.ring) {
          const dx = p[0] - c[0],
            dy = p[1] - c[1];
          const len = Math.hypot(dx, dy) || 1;
          const s = Math.max(m(22), 6);
          const ux = dx / len,
            uy = dy / len;
          out.push(`<path d="M${r1(p[0] - uy * s)},${r1(p[1] + ux * s)}L${r1(p[0] + ux * s * 1.6)},${r1(p[1] + uy * s * 1.6)}L${r1(p[0] + uy * s)},${r1(p[1] - ux * s)}Z" fill="${th.paper}" stroke="${th.wall}" stroke-width="${r1(Math.max(1, width * 0.6))}"/>`);
        }
      }
      const tower = Math.max(m(5), 2.2);
      for (const p of wall.towers) out.push(`<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${r1(tower)}" fill="${th.wall}"/>`);
      for (const p of wall.gates) out.push(`<rect x="${r1(p[0] - tower * 1.4)}" y="${r1(p[1] - tower * 1.4)}" width="${r1(tower * 2.8)}" height="${r1(tower * 2.8)}" fill="${th.paper}" stroke="${th.wall}" stroke-width="${r1(Math.max(1, width * 0.6))}"/>`);
    }
  }

  if (options.highlight !== null && options.highlight !== undefined) {
    const ward = city.wards.find((w) => w.id === options.highlight);
    if (ward) out.push(`<path d="${poly(ward.polygon)}" fill="#ffd34d" fill-opacity="0.15" stroke="#ffb300" stroke-width="2.5"/>`);
  }

  if (layers.landmarks) {
    const r = 6.5;
    out.push(`<g text-anchor="middle" font-family="'Segoe UI Symbol', 'Noto Sans Symbols', sans-serif">`);
    for (const landmark of city.landmarks) {
      out.push(`<g data-landmark="${landmark.id}"><circle cx="${r1(landmark.x)}" cy="${r1(landmark.y)}" r="${r}" fill="${th.halo}" stroke="${th.label}" stroke-width="0.8"/><text x="${r1(landmark.x)}" y="${r1(landmark.y + r * 0.42)}" font-size="${r * 1.2}" fill="${th.label}">${LANDMARK_GLYPH[landmark.kind]}</text></g>`);
    }
    out.push(`</g>`);
  }

  if (layers.labels) {
    const halo = `stroke="${th.halo}" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke"`;
    const named = city.streets.filter((street) => street.name && street.points.length > 2);
    out.push(`<defs>${named.map((street) => `<path id="st-${street.id}" d="${streetPath(street.points)}"/>`).join("")}</defs><g font-size="8" fill="${th.label}" font-style="italic" ${halo}>`);
    for (const street of named) out.push(`<text dy="2.8"><textPath href="#st-${street.id}" startOffset="50%" text-anchor="middle">${text(street.name)}</textPath></text>`);
    out.push(`</g><g text-anchor="middle" font-size="11" font-weight="600" letter-spacing="1.5" fill="${th.label}" opacity="0.75" ${halo}>`);
    for (const ward of city.wards) {
      if (!ward.urban || !ward.name || ward.kind === "plaza") continue;
      const [x, y] = centroid(ward.polygon);
      out.push(`<text x="${r1(x)}" y="${r1(y)}">${text(ward.name.toUpperCase())}</text>`);
    }
    out.push(`</g>`);
  }
  out.push(`</g>`);

  if (layers.frame) {
    out.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${th.label}" stroke-width="2"/>`);
    const title = text(city.name);
    const tw = Math.max(120, title.length * 13 + 40);
    out.push(`<rect x="16" y="16" width="${tw}" height="38" rx="3" fill="${th.halo}" fill-opacity="0.9" stroke="${th.label}"/><text x="${16 + tw / 2}" y="42" text-anchor="middle" font-size="20" letter-spacing="2" font-weight="600" fill="${th.label}">${title}</text>`);
    const target = (W / 6) * city.scale;
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const metres = [1, 2, 5, 10].map((k) => k * magnitude).reduce((best, value) => (Math.abs(value - target) < Math.abs(best - target) ? value : best));
    const length = metres / city.scale;
    const x0 = W - length - 30;
    const y0 = H - 30;
    const label = metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
    out.push(`<g font-size="10" text-anchor="middle" fill="${th.label}"><rect x="${r1(x0)}" y="${y0}" width="${r1(length / 2)}" height="5" fill="${th.label}"/><rect x="${r1(x0 + length / 2)}" y="${y0}" width="${r1(length / 2)}" height="5" fill="${th.halo}" stroke="${th.label}" stroke-width="0.8"/><text x="${r1(x0)}" y="${y0 - 5}">0</text><text x="${r1(x0 + length)}" y="${y0 - 5}">${label}</text></g>`);
  }
  out.push(`</svg>`);
  return out.join("");
}
