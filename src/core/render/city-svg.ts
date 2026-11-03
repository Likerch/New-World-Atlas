// A city as an SVG string: water, fields and parks, buildings (towers cast shadows), streets and highways, bridges,
// walls with towers and gates, landmark icons and names, with a scale bar in metres. A stone-age camp gets a wooden
// palisade, the survivors' holds of a dead city scrap barricades; ruins are drawn broken.
import type { City, CityParams, Landmark, LandmarkKind, WardKind } from "../city/model";
import { pathData, smooth, type Point } from "../geometry";
import { toCyrillic } from "../language";
import { centroid } from "../polygon";
import { renderCoatOfArms } from "./heraldry-svg";
import { present, type LegendEntry, type LegendSection, type Swatch } from "./legend";

export type CityThemeId = "ink" | "color" | "parchment" | "blueprint" | "neon" | "future" | "wasteland";
export const CITY_THEMES: CityThemeId[] = ["ink", "color", "parchment", "blueprint", "neon", "future", "wasteland"];

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
  /** Paving of the market square. */
  plaza: string;
  pier: string;
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
  spaceport: "#dfe3ea",
  ruins: "#d8d2c8",
  settlement: "#e6d6b8",
  wasteland: "#d4cab4",
};

const THEMES: Record<CityThemeId, CityTheme> = {
  ink: { paper: "#f4efe1", water: "#c2d3d8", shore: "#5b5a52", field: ["#ebe4cc", "#e4dcc0"], fieldLine: "#b8ad8f", tree: "#d9dcc4", treeLine: "#6e6a58", building: "#cfc6b4", rich: "#c3b9a4", landmark: "#9f9480", line: "#3e3a33", tower: "#b7ad9a", shadow: "rgba(40,35,25,0.18)", street: "#f4efe1", casing: "#8c8473", highway: "#ffffff", wall: "#3e3a33", label: "#2d2a25", halo: "#f4efe1", tint: {}, font: "'Palatino Linotype', Georgia, serif", glow: false, plaza: "#e6dcc3", pier: "#b8a68a" },
  color: { paper: "#f2ede1", water: "#9cc4e0", shore: "#5a7d99", field: ["#e2e6b8", "#d8e0a8"], fieldLine: "#a9b07a", tree: "#9cc68a", treeLine: "#5c8a4e", building: "#d9a582", rich: "#cf9670", landmark: "#b5674a", line: "#6a4a3a", tower: "#b9a7a0", shadow: "rgba(30,30,40,0.22)", street: "#fbf8f1", casing: "#b9ab92", highway: "#f6d27a", wall: "#6b5a4a", label: "#2a2520", halo: "#fbf8f1", tint: COLOR_TINT, font: "'Segoe UI', Arial, sans-serif", glow: false, plaza: "#ead8ae", pier: "#b08a5c" },
  parchment: { paper: "#ecdfc0", water: "#cdbf98", shore: "#5d4a30", field: ["#e4d5b0", "#ddcca4"], fieldLine: "#a8936a", tree: "#d6c79f", treeLine: "#6d5a3d", building: "#c9b48a", rich: "#bfa77b", landmark: "#a48b5f", line: "#4a3a26", tower: "#b5a07a", shadow: null, street: "#ecdfc0", casing: "#8f7a55", highway: "#efe2c4", wall: "#4a3a26", label: "#3a2c1c", halo: "#ecdfc0", tint: {}, font: "'Palatino Linotype', Georgia, serif", glow: false, plaza: "#e0d0aa", pier: "#bfa77b" },
  blueprint: { paper: "#1d3f6e", water: "#163257", shore: "#9cc3ef", field: ["#22477a", "#244a7e"], fieldLine: "#3f68a0", tree: "#24497c", treeLine: "#8fb5e6", building: "#2a5288", rich: "#2d5890", landmark: "#3a69a8", line: "#cfe3ff", tower: "#33609c", shadow: null, street: "#1d3f6e", casing: "#8fb5e6", highway: "#cfe3ff", wall: "#ffffff", label: "#e8f2ff", halo: "#1d3f6e", tint: {}, font: "'Segoe UI', Arial, sans-serif", glow: false, plaza: "#244a7e", pier: "#3a69a8" },
  future: { paper: "#eef3f6", water: "#b9e2f2", shore: "#4fa9c9", field: ["#d9efdc", "#cfe9d4"], fieldLine: "#9cc9a6", tree: "#a8dbb5", treeLine: "#4f9a6a", building: "#ffffff", rich: "#f4fbff", landmark: "#bfe9f7", line: "#5c7d93", tower: "#e6f2fa", shadow: "rgba(40,80,110,0.16)", street: "#ffffff", casing: "#b7cbd8", highway: "#38c6e8", wall: "#38c6e8", label: "#1f3a4d", halo: "#eef3f6", tint: { arcology: "#dff2fb", commercial: "#e7f3f9", park: "#cdebd3", campus: "#e3f0e6", spaceport: "#dde6ee", industrial: "#e2e7eb", farm: "#d6eedb" }, font: "'Segoe UI', Arial, sans-serif", glow: false, plaza: "#e3eef4", pier: "#a9c6d6" },
  wasteland: { paper: "#d6c8a8", water: "#8e9a86", shore: "#4b4a3a", field: ["#c9bb8e", "#c2b384"], fieldLine: "#8c7d55", tree: "#a6a07a", treeLine: "#5d5a3f", building: "#a99b80", rich: "#b3a586", landmark: "#c0623a", line: "#3d342a", tower: "#9a8c74", shadow: "rgba(40,30,20,0.25)", street: "#cbbd9c", casing: "#8b7c60", highway: "#bba982", wall: "#5a3e2a", label: "#2e261d", halo: "#d6c8a8", tint: { settlement: "#e2cfa6", wasteland: "#c4b38c", ruins: "#cdbf9f" }, font: "'Segoe UI', Arial, sans-serif", glow: false, plaza: "#cdbd98", pier: "#7d6e55" },
  neon: { paper: "#0b0d14", water: "#06121f", shore: "#1f8fff", field: ["#11161d", "#131920"], fieldLine: "#1f2a33", tree: "#0f2a1f", treeLine: "#1fbf7f", building: "#161a26", rich: "#1b2030", landmark: "#2a1838", line: "#2b3a55", tower: "#1a1f33", shadow: "rgba(0,0,0,0.55)", street: "#0b0d14", casing: "#232c40", highway: "#ffcc33", wall: "#ff3d7f", label: "#e6f1ff", halo: "#0b0d14", tint: {}, font: "'Segoe UI', Arial, sans-serif", glow: true, plaza: "#141826", pier: "#1a2a3a" },
};

export function defaultCityTheme(era: CityParams["era"]): CityThemeId {
  return era === "cyberpunk" ? "neon" : era === "far-future" ? "future" : era === "post-apocalypse" ? "wasteland" : era === "modern" || era === "industrial" ? "color" : era === "stone" ? "parchment" : "ink";
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
  "fire-pit": "♨",
  "chief-hut": "⌂",
  "flint-workshop": "⚒",
  "animal-pen": "⊞",
  "sacred-stone": "⊓",
  agora: "◉",
  theatre: "◠",
  arena: "◎",
  gymnasium: "⚑",
  library: "✎",
  lab: "⚗",
  "garden-dome": "◓",
  "ai-core": "⌬",
  "launch-pad": "⇑",
  "barter-market": "⚖",
  "water-still": "≈",
  "raider-fort": "☠",
  "vault-door": "⊟",
  scrapyard: "⚙",
  "radio-tower": "⫯",
  palace: "♛",
  cathedral: "✠",
  bank: "¤",
  "mage-tower": "✶",
  "old-ruins": "⌓",
  tents: "▲",
  prison: "⊞",
  "old-gate": "∩",
  custom: "✦",
};

export interface CityRenderOptions {
  theme?: CityThemeId;
  layers?: Partial<Record<CityLayerId, boolean>>;
  script?: "latin" | "cyrillic";
  /** A ward drawn with an emphasis outline. */
  highlight?: number | null;
  /** A place or a building singled out on the map (selected, or found by a search). */
  mark?: { landmark?: number | null; building?: number | null };
  /** Quarters washed in a colour: the faction that holds each, for the influence layer. */
  tints?: { ward: number; color: string; opacity: number }[];
  /** The players' view: places only the GM knows of stay off the map. */
  players?: boolean;
}

/** A place's mark: its kind's glyph, or the game master's own. */
export function landmarkGlyph(city: City, landmark: Landmark): { glyph: string; color: string | null } {
  if (landmark.kind === "custom") {
    const own = city.params.custom?.places.find((place) => place.id === landmark.custom);
    return { glyph: own?.glyph || LANDMARK_GLYPH.custom, color: own?.color ?? null };
  }
  return { glyph: LANDMARK_GLYPH[landmark.kind], color: null };
}

/** The tint of a quarter of the game master's own kind. */
const customTint = (city: City, ward: { custom?: string }) => (ward.custom ? city.params.custom?.wards.find((kind) => kind.id === ward.custom)?.color : undefined);

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
  const stone = city.params.era === "stone";
  out.push(`<defs><clipPath id="city-clip"><rect width="${W}" height="${H}"/></clipPath>${stone ? `<filter id="clearing" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${r1(Math.max(3, m(6)))}"/></filter>` : ""}${th.glow ? `<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : ""}</defs>`);
  out.push(`<g clip-path="url(#city-clip)"><rect width="${W}" height="${H}" fill="${th.paper}"/>`);

  // A camp has no quarters to tint: a clearing of trodden earth opens in the forest round the huts and gardens.
  if (layers.wards && stone) out.push(`<g fill="${th.plaza}" filter="url(#clearing)">${city.wards.filter((ward) => ward.urban || ward.kind === "farm").map((ward) => `<path d="${poly(ward.polygon)}"/>`).join("")}</g>`);
  else if (layers.wards) {
    for (const ward of city.wards) {
      const own = customTint(city, ward);
      const tint = own ?? (ward.kind === "plaza" ? th.plaza : th.tint[ward.kind]);
      if (tint) out.push(`<path d="${poly(ward.polygon)}" fill="${tint}"${own ? ` fill-opacity="0.45"` : ""}/>`);
    }
  }
  if (city.lake) out.push(`<path d="${pathData(smooth([...city.lake, city.lake[0]], true, 2), true)}" fill="${th.water}" stroke="${th.shore}" stroke-width="1.2"/>`);
  const byKind = (kind: string) => city.buildings.filter((b) => b.kind === kind);
  if (layers.fields) {
    out.push(`<g stroke="${th.fieldLine}" stroke-width="0.5">`);
    byKind("field").forEach((b, k) => out.push(`<path d="${poly(b.polygon)}" fill="${th.field[k % 2]}"/>`));
    out.push(`</g>`);
    // Courtyards: gardens behind the houses.
    for (const yard of byKind("yard")) out.push(`<path d="${poly(yard.polygon)}" fill="${th.field[1]}" stroke="${th.fieldLine}" stroke-width="0.4"/>`);
  }
  // Water over the land, so the shore stays clean.
  if (city.sea) out.push(`<path d="${pathData(smooth([...city.sea, city.sea[0]], true, 1), true)}" fill="${th.water}" stroke="${th.shore}" stroke-width="1.4"/>`);
  if (city.river) {
    const d = pathData(smooth(city.river.points, false, 2), false);
    out.push(`<path d="${d}" fill="none" stroke="${th.shore}" stroke-width="${r1(city.river.width + 2.4)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${th.water}" stroke-width="${r1(city.river.width)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  if (layers.buildings) for (const pier of byKind("pier")) out.push(`<path d="${poly(pier.polygon)}" fill="${th.pier}" stroke="${th.line}" stroke-width="0.5"/>`);

  // Roads and avenues under the buildings' edges; highways and rail over them.
  const streetPath = (points: Point[]) => pathData(points, false);
  if (layers.streets) {
    for (const street of city.streets.filter((s) => s.kind === "road" || s.kind === "avenue" || s.kind === "main")) {
      const d = streetPath(street.points);
      out.push(`<path d="${d}" fill="none" stroke="${th.casing}" stroke-width="${r1(street.width + 1.4)}" stroke-linecap="round" stroke-linejoin="round" opacity="${street.kind === "main" ? 0.35 : 0.8}"/><path d="${d}" fill="none" stroke="${th.street}" stroke-width="${r1(street.width)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    for (const street of city.streets.filter((s) => s.kind === "path")) out.push(`<path d="${pathData(smooth(street.points, false, 2), false)}" fill="none" stroke="${th.casing}" stroke-width="${r1(Math.max(0.8, street.width))}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${r1(Math.max(2, m(3)))} ${r1(Math.max(1, m(1.2)))}" opacity="0.75"/>`);
    // Alleys: lanes cut through the quarters between the rows of houses.
    for (const street of city.streets.filter((s) => s.kind === "alley")) out.push(`<path d="${streetPath(street.points)}" fill="none" stroke="${th.street}" stroke-width="${r1(street.width)}" stroke-linecap="butt" opacity="0.95"/>`);
    // Boulevards where the old walls stood: a broad way with a row of trees down either side.
    for (const street of city.streets.filter((s) => s.kind === "boulevard")) {
      const d = streetPath(street.points);
      out.push(`<path d="${d}" fill="none" stroke="${th.casing}" stroke-width="${r1(street.width + 1.4)}" stroke-linejoin="round" opacity="0.8"/><path d="${d}" fill="none" stroke="${th.street}" stroke-width="${r1(street.width)}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${th.treeLine}" stroke-width="${r1(Math.max(1.2, street.width * 0.18))}" stroke-dasharray="${r1(Math.max(1.2, m(2.5)))} ${r1(Math.max(1.5, m(5)))}" stroke-linecap="round" opacity="0.7"/>`);
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
    // Neon by district: each kind of quarter glows in its own pair of colours.
    const neon: Partial<Record<WardKind, [string, string]>> = { commercial: ["#ff3d7f", "#38e1ff"], megablock: ["#a46bff", "#38e1ff"], arcology: ["#ffcc33", "#ffffff"], industrial: ["#ff9f1a", "#ffcc33"], "combat-zone": ["#ff4d4d", "#ff9f1a"], port: ["#2bd9c4", "#38e1ff"] };
    const wardById = new Map(city.wards.map((ward) => [ward.id, ward]));
    city.buildings.forEach((building, index) => {
      if (building.kind === "tree" || building.kind === "field" || building.kind === "pier" || building.kind === "yard" || building.kind === "gone") return;
      const d = poly(building.polygon);
      if (building.kind === "tent") {
        // A round tent: felt or hide, the smoke hole in the middle.
        const [cx, cy] = centroid(building.polygon);
        const r = Math.hypot(building.polygon[0][0] - cx, building.polygon[0][1] - cy);
        shapes.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${th.rich}" stroke="${th.line}" stroke-width="0.5"/><path d="M${r1(cx - r)},${r1(cy)}H${r1(cx + r)}M${r1(cx)},${r1(cy - r)}V${r1(cy + r)}" stroke="${th.line}" stroke-width="0.3" opacity="0.6"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(Math.max(0.4, r * 0.2))}" fill="${th.line}"/>`);
        return;
      }
      if (building.kind === "grave") {
        shapes.push(`<path d="${d}" fill="${th.rich}" stroke="none" opacity="0.7"/>`);
        return;
      }
      if (building.kind === "ruin") {
        shapes.push(`<path d="${d}" fill="${th.building}" fill-opacity="0.45" stroke="${th.line}" stroke-width="0.6" stroke-dasharray="${r1(Math.max(1.5, m(4)))} ${r1(Math.max(1, m(2.5)))}"/>`);
        return;
      }
      if (building.kind === "hut") {
        // A round hut: thatch in rings, the smoke hole, the door towards the fire.
        const [cx, cy] = centroid(building.polygon);
        const r = Math.hypot(building.polygon[0][0] - cx, building.polygon[0][1] - cy);
        const toward = Math.atan2(city.center[1] - cy, city.center[0] - cx);
        const dx = Math.cos(toward),
          dy = Math.sin(toward);
        shapes.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${th.building}" stroke="${th.line}" stroke-width="0.5"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r * 0.58)}" fill="none" stroke="${th.line}" stroke-width="0.3" opacity="0.5"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(Math.max(0.4, r * 0.16))}" fill="${th.line}"/><path d="M${r1(cx + dx * r * 0.75)},${r1(cy + dy * r * 0.75)}L${r1(cx + dx * r * 1.25)},${r1(cy + dy * r * 1.25)}" stroke="${th.line}" stroke-width="${r1(Math.max(0.6, r * 0.35))}"/>`);
        return;
      }
      if (building.kind === "longhouse") {
        const [a, b] = [building.polygon[0], building.polygon[6]];
        shapes.push(`<path d="${pathData(smooth([...building.polygon, building.polygon[0]], true, 1), true)}" fill="${th.building}" stroke="${th.line}" stroke-width="0.6"/><path d="M${r1(a[0] + (b[0] - a[0]) * 0.08)},${r1(a[1] + (b[1] - a[1]) * 0.08)}L${r1(b[0] + (a[0] - b[0]) * 0.08)},${r1(b[1] + (a[1] - b[1]) * 0.08)}" stroke="${th.line}" stroke-width="0.6" opacity="0.7"/>`);
        return;
      }
      if (building.kind === "fire") {
        // The hearth: a ring of stones round the embers, logs to sit on round it.
        const [cx, cy] = centroid(building.polygon);
        const r = Math.hypot(building.polygon[0][0] - cx, building.polygon[0][1] - cy);
        const ring = Array.from({ length: 8 }, (_, k) => `<circle cx="${r1(cx + Math.cos((k * Math.PI) / 4) * r)}" cy="${r1(cy + Math.sin((k * Math.PI) / 4) * r)}" r="${r1(Math.max(0.5, r * 0.28))}" fill="${th.tower}" stroke="${th.line}" stroke-width="0.3"/>`).join("");
        const logs = Array.from({ length: 5 }, (_, k) => {
          const angle = (k * Math.PI * 2) / 5 + 0.3;
          const x = cx + Math.cos(angle) * r * 3.2,
            y = cy + Math.sin(angle) * r * 3.2;
          return `<path d="M${r1(x - Math.sin(angle) * r)},${r1(y + Math.cos(angle) * r)}L${r1(x + Math.sin(angle) * r)},${r1(y - Math.cos(angle) * r)}" stroke="#7a5634" stroke-width="${r1(Math.max(0.8, r * 0.45))}" stroke-linecap="round"/>`;
        }).join("");
        shapes.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r * 5)}" fill="${th.casing}" opacity="0.18"/>${logs}<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r * 0.8)}" fill="#e0893a"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r * 0.4)}" fill="#ffd36b"/>${ring}`);
        return;
      }
      if (building.kind === "stone") {
        shapes.push(`<path d="${d}" fill="${th.tower}" stroke="${th.line}" stroke-width="0.6"/>`);
        return;
      }
      if (building.kind === "mound") {
        const [cx, cy] = centroid(building.polygon);
        const r = Math.hypot(building.polygon[0][0] - cx, building.polygon[0][1] - cy);
        shapes.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${th.field[1]}" stroke="${th.line}" stroke-width="0.5"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r * 0.62)}" fill="none" stroke="${th.line}" stroke-width="0.35" opacity="0.6"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r * 0.28)}" fill="none" stroke="${th.line}" stroke-width="0.35" opacity="0.6"/>`);
        return;
      }
      if (building.kind === "pen") {
        const [cx, cy] = centroid(building.polygon);
        const r = Math.hypot(building.polygon[0][0] - cx, building.polygon[0][1] - cy);
        shapes.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${th.field[0]}" fill-opacity="0.6" stroke="#7a5634" stroke-width="${r1(Math.max(0.7, m(0.5)))}" stroke-dasharray="${r1(Math.max(1, m(0.8)))} ${r1(Math.max(0.6, m(0.5)))}"/>`);
        return;
      }
      if (building.kind === "rack") {
        const [a, b] = building.polygon;
        shapes.push(`<path d="M${r1(a[0])},${r1(a[1])}L${r1(b[0])},${r1(b[1])}" stroke="#7a5634" stroke-width="${r1(Math.max(0.6, m(0.35)))}"/><circle cx="${r1(a[0])}" cy="${r1(a[1])}" r="${r1(Math.max(0.5, m(0.3)))}" fill="#7a5634"/><circle cx="${r1(b[0])}" cy="${r1(b[1])}" r="${r1(Math.max(0.5, m(0.3)))}" fill="#7a5634"/>`);
        return;
      }
      if (building.kind === "boat") {
        shapes.push(`<path d="${d}" fill="#8a5a33" stroke="${th.line}" stroke-width="0.4"/>`);
        return;
      }
      if (building.kind === "stall") {
        shapes.push(`<path d="${d}" fill="${themeId === "color" ? (index % 3 ? "#d9634a" : "#e0b04a") : th.landmark}" stroke="${th.line}" stroke-width="0.3"/>`);
        return;
      }
      const tall = building.floors >= 8;
      if (th.shadow && (tall || building.kind === "landmark")) {
        const off = Math.min(m(Math.min(building.floors, 120) * 0.9), 26);
        shadows.push(`<path d="${d}" transform="translate(${r1(off)},${r1(off * 0.8)})" fill="${th.shadow}"/>`);
      }
      const ward = wardById.get(building.ward);
      const fill = building.kind === "landmark" ? th.landmark : building.kind === "tower" ? th.tower : ward && ward.wealth > 0.7 ? th.rich : th.building;
      const pair = (ward && neon[ward.kind]) ?? ["#4d7cff", "#a46bff"];
      const stroke = th.glow && (tall || building.kind === "industrial") ? pair[index % 5 === 0 ? 1 : 0] : th.line;
      shapes.push(`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${th.glow && tall ? 0.8 : 0.45}"${th.glow && building.floors > 60 ? ` filter="url(#glow)"` : ""}/>`);
    });
    out.push(`<g>${shadows.join("")}</g><g stroke-linejoin="round">${shapes.join("")}</g>`);
  }

  if (layers.streets) {
    for (const street of city.streets) {
      const d = streetPath(street.kind === "highway" ? smooth(street.points, false, 2) : street.points);
      if (street.kind === "highway") out.push(`<path d="${d}" fill="none" stroke="${th.casing}" stroke-width="${r1(street.width + 2.5)}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${th.highway}" stroke-width="${r1(street.width)}" stroke-linecap="round"${th.glow ? ` filter="url(#glow)"` : ""}/>`);
      else if (street.kind === "rail" && city.params.era === "far-future") out.push(`<path d="${d}" fill="none" stroke="#38c6e8" stroke-width="${r1(Math.max(2, street.width * 0.7))}" opacity="0.35"/><path d="${d}" fill="none" stroke="#1f8fb3" stroke-width="${r1(Math.max(0.8, street.width * 0.25))}"/>`);
      else if (street.kind === "rail") out.push(`<path d="${d}" fill="none" stroke="${th.line}" stroke-width="${r1(Math.max(1.2, street.width * 0.6))}"/><path d="${d}" fill="none" stroke="${th.paper}" stroke-width="${r1(Math.max(0.6, street.width * 0.3))}" stroke-dasharray="3 3"/>`);
      else if (street.kind === "skyway") out.push(`<path d="${d}" fill="none" stroke="${th.glow ? "#38e1ff" : th.line}" stroke-width="${r1(Math.max(1.5, street.width * 0.5))}" stroke-dasharray="6 3" opacity="0.85"${th.glow ? ` filter="url(#glow)"` : ""}/>`);
    }
  }

  if (layers.walls) {
    const era = city.params.era;
    for (const wall of city.walls) {
      const ring = [...wall.ring, wall.ring[0]];
      // A palisade of stakes round a camp; scrap barricades round a hold after the fall.
      if (era === "stone" || era === "post-apocalypse") {
        const stakes = era === "stone";
        out.push(`<path d="${pathData(stakes ? smooth(ring, true, 2) : ring, true)}" fill="none" stroke="${stakes ? "#7a5634" : th.wall}" stroke-width="${r1(Math.max(1.4, m(stakes ? 1.5 : 3)))}" stroke-dasharray="${stakes ? "1.2 0.8" : "5 2 2 2"}" stroke-linejoin="round"/>`);
        for (const p of wall.gates) out.push(`<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${r1(Math.max(2, m(4)))}" fill="${th.paper}" stroke="${stakes ? "#7a5634" : th.wall}" stroke-width="1"/>`);
        continue;
      }
      const width = wall.citadel ? m(5) : m(6.5);
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

  for (const tint of options.tints ?? []) {
    const ward = city.wards.find((w) => w.id === tint.ward);
    if (ward) out.push(`<path d="${poly(ward.polygon)}" fill="${tint.color}" fill-opacity="${r1(tint.opacity * 100) / 100}" stroke="${tint.color}" stroke-opacity="0.5" stroke-width="1"/>`);
  }
  if (options.highlight !== null && options.highlight !== undefined) {
    const ward = city.wards.find((w) => w.id === options.highlight);
    if (ward) out.push(`<path d="${poly(ward.polygon)}" fill="#ffd34d" fill-opacity="0.15" stroke="#ffb300" stroke-width="2.5"/>`);
  }
  const marked = options.mark?.building;
  if (marked !== null && marked !== undefined && city.buildings[marked]) out.push(`<path d="${poly(city.buildings[marked].polygon)}" fill="#ffd34d" fill-opacity="0.55" stroke="#e08a00" stroke-width="2"/>`);

  if (layers.landmarks) {
    const r = 6.5;
    out.push(`<g text-anchor="middle" font-family="'Segoe UI Symbol', 'Noto Sans Symbols', sans-serif">`);
    for (const landmark of city.landmarks) {
      const { glyph, color } = landmarkGlyph(city, landmark);
      const lit = options.mark?.landmark === landmark.id;
      if (lit) out.push(`<circle cx="${r1(landmark.x)}" cy="${r1(landmark.y)}" r="${r * 1.9}" fill="#ffd34d" fill-opacity="0.45" stroke="#e08a00" stroke-width="1.6"/>`);
      out.push(`<g data-landmark="${landmark.id}"><circle cx="${r1(landmark.x)}" cy="${r1(landmark.y)}" r="${r}" fill="${color ?? th.halo}" stroke="${th.label}" stroke-width="${lit ? 1.6 : 0.8}"/><text x="${r1(landmark.x)}" y="${r1(landmark.y + r * 0.42)}" font-size="${r * 1.2}" fill="${color ? "#ffffff" : th.label}">${esc(glyph)}</text></g>`);
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
    // The town's arms beside its name.
    if (city.params.arms) out.push(renderCoatOfArms(city.params.arms, { at: { x: 22 + tw, y: 12, width: 40 } }));
    // North, up the map.
    const nx = W - 40,
      ny = 44;
    out.push(`<g><circle cx="${nx}" cy="${ny}" r="17" fill="${th.halo}" fill-opacity="0.85" stroke="${th.label}" stroke-width="0.8"/><path d="M${nx},${ny - 14}L${nx + 6},${ny + 6}L${nx},${ny + 2}L${nx - 6},${ny + 6}Z" fill="${th.label}"/><text x="${nx}" y="${ny - 19}" text-anchor="middle" font-size="11" font-weight="700" fill="${th.label}">N</text></g>`);
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

/** What a city map shows, for its legend. */
export function cityLegend(city: City, options: CityRenderOptions = {}): LegendSection[] {
  const themeId = options.theme ?? defaultCityTheme(city.params.era);
  const th = THEMES[themeId];
  const layers: Record<CityLayerId, boolean> = { wards: true, fields: true, trees: true, buildings: true, streets: true, walls: true, labels: true, landmarks: true, frame: true, ...options.layers };
  const era = city.params.era;
  const wards: LegendEntry[] = [];
  if (layers.wards && era === "stone") wards.push({ key: "legend.clearing", swatch: { fill: th.plaza } });
  else if (layers.wards) {
    for (const kind of present(city.wards.filter((w) => !w.custom).map((w) => w.kind))) {
      const tint = kind === "plaza" ? th.plaza : th.tint[kind];
      if (tint) wards.push({ key: `ward.${kind}@${era}`, swatch: { fill: tint } });
    }
    // The game master's own kinds of quarter, by their own names.
    for (const id of present(city.wards.flatMap((w) => (w.custom ? [w.custom] : [])))) {
      const own = city.params.custom?.wards.find((kind) => kind.id === id);
      if (own) wards.push({ label: own.name || "?", swatch: { fill: own.color, opacity: 0.45 } });
    }
  }
  const looks: Partial<Record<string, Swatch>> = {
    house: { fill: th.building, stroke: th.line },
    tower: { fill: th.tower, stroke: th.line },
    industrial: { fill: th.building, stroke: th.line },
    landmark: { fill: th.landmark, stroke: th.line },
    stall: { fill: themeId === "color" ? "#d9634a" : th.landmark, stroke: th.line },
    hut: { svg: `<circle cx="12" cy="8" r="5.5" fill="${th.building}" stroke="${th.line}" stroke-width="0.7"/><circle cx="12" cy="8" r="3.2" fill="none" stroke="${th.line}" stroke-width="0.4" opacity="0.6"/><circle cx="12" cy="8" r="0.9" fill="${th.line}"/>` },
    longhouse: { svg: `<rect x="3" y="4" width="18" height="8" rx="4" fill="${th.building}" stroke="${th.line}" stroke-width="0.7"/><path d="M5,8H19" stroke="${th.line}" stroke-width="0.6"/>` },
    ruin: { fill: th.building, opacity: 0.45, stroke: th.line, dash: "3 2" },
    field: { fill: th.field[0], stroke: th.fieldLine },
    tree: { fill: th.tree, stroke: th.treeLine, round: true },
    grave: { fill: th.rich },
    pier: { fill: th.pier, stroke: th.line },
    yard: { fill: th.field[1], stroke: th.fieldLine },
    shed: { fill: th.building, stroke: th.line },
    fire: { svg: `<circle cx="12" cy="8" r="5" fill="#e0893a" stroke="${th.tower}" stroke-width="1.6" stroke-dasharray="1.6 1"/><circle cx="12" cy="8" r="2.2" fill="#ffd36b"/>` },
    stone: { svg: `<rect x="9" y="3" width="6" height="10" rx="1.5" fill="${th.tower}" stroke="${th.line}" stroke-width="0.7"/>` },
    mound: { svg: `<circle cx="12" cy="8" r="6" fill="${th.field[1]}" stroke="${th.line}" stroke-width="0.6"/><circle cx="12" cy="8" r="3.6" fill="none" stroke="${th.line}" stroke-width="0.4"/>` },
    pen: { svg: `<circle cx="12" cy="8" r="6" fill="${th.field[0]}" fill-opacity="0.6" stroke="#7a5634" stroke-width="1" stroke-dasharray="1.4 0.9"/>` },
    rack: { svg: `<path d="M5,8H19" stroke="#7a5634" stroke-width="1.2"/><circle cx="5" cy="8" r="1.2" fill="#7a5634"/><circle cx="19" cy="8" r="1.2" fill="#7a5634"/>` },
    boat: { svg: `<path d="M3,8L12,5.5L21,8L12,10.5Z" fill="#8a5a33" stroke="${th.line}" stroke-width="0.5"/>` },
    tent: { svg: `<circle cx="12" cy="8" r="5.5" fill="${th.rich}" stroke="${th.line}" stroke-width="0.6"/><circle cx="12" cy="8" r="1" fill="${th.line}"/>` },
  };
  const buildings = layers.buildings ? present(city.buildings.map((b) => b.kind)).flatMap((kind) => (looks[kind] ? [{ key: `bkind.${kind}`, swatch: looks[kind]! }] : [])) : [];
  const streets: LegendEntry[] = [];
  if (layers.streets)
    for (const kind of present(city.streets.map((s) => s.kind))) {
      const swatch: Swatch =
        kind === "highway"
          ? { line: th.casing, width: 6, over: th.highway, overWidth: 4 }
          : kind === "rail"
            ? era === "far-future"
              ? { line: "#38c6e8", width: 4, opacity: 0.5, over: "#1f8fb3", overWidth: 1.4 }
              : { line: th.line, width: 3, over: th.paper, overWidth: 1.5, overDash: "3 3" }
            : kind === "skyway"
              ? { line: th.glow ? "#38e1ff" : th.line, width: 2, dash: "6 3" }
              : kind === "path"
                ? { line: th.casing, width: 1.8, dash: "3 1.2" }
                : kind === "alley"
                  ? { line: th.building, width: 5, over: th.street, overWidth: 1.6 }
                  : kind === "boulevard"
                    ? { line: th.casing, width: 7, over: th.street, overWidth: 5, overDash: "" }
                    : { line: th.casing, width: 5.5, over: th.street, overWidth: 3.5 };
      streets.push({ key: `street.${kind}`, swatch });
    }
  const water: LegendEntry[] = [];
  if (city.sea) water.push({ key: "legend.sea", swatch: { fill: th.water, stroke: th.shore } });
  if (city.river) water.push({ key: "legend.river", swatch: { line: th.water, width: 4.5 } });
  if (city.lake) water.push({ key: "legend.lake", swatch: { fill: th.water, stroke: th.shore, round: true } });
  const defences: LegendEntry[] = [];
  if (layers.walls && city.walls.length) {
    if (era === "stone") defences.push({ key: "legend.palisade", swatch: { line: "#7a5634", width: 2.4, dash: "1.2 0.8" } });
    else if (era === "post-apocalypse") defences.push({ key: "legend.barricade", swatch: { line: th.wall, width: 3, dash: "5 2 2 2" } });
    else
      defences.push(
        { key: "legend.wall", swatch: { svg: `<path d="M2,8H22" stroke="${th.wall}" stroke-width="3"/><circle cx="8" cy="8" r="2.6" fill="${th.wall}"/><circle cx="18" cy="8" r="2.6" fill="${th.wall}"/>` } },
        { key: "legend.gate", swatch: { svg: `<path d="M2,8H22" stroke="${th.wall}" stroke-width="3"/><rect x="8" y="4" width="8" height="8" fill="${th.paper}" stroke="${th.wall}" stroke-width="1.4"/>` } },
      );
  }
  const landmarks: LegendEntry[] = layers.landmarks ? present(city.landmarks.filter((l) => l.kind !== "custom").map((l) => l.kind)).map((kind) => ({ key: `landmark.${kind}@${era}`, swatch: { glyph: LANDMARK_GLYPH[kind], color: th.label, ring: th.label, bg: th.halo } })) : [];
  if (layers.landmarks)
    for (const id of present(city.landmarks.flatMap((l) => (l.kind === "custom" && l.custom ? [l.custom] : [])))) {
      const own = city.params.custom?.places.find((place) => place.id === id);
      if (own) landmarks.push({ label: own.name || "?", swatch: { glyph: own.glyph || LANDMARK_GLYPH.custom, color: "#ffffff", ring: th.label, bg: own.color } });
    }
  return [
    { key: "legend.wards", entries: wards },
    { key: "legend.buildings", entries: buildings },
    { key: "legend.streets", entries: streets },
    { key: "legend.water", entries: water },
    { key: "legend.defences", entries: defences },
    { key: "legend.landmarks", entries: landmarks },
  ].filter((section) => section.entries.length);
}
