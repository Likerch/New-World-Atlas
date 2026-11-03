// A sector up close, the way a game master's sector map is drawn: its stars laid on a grid of numbered hexes, each
// world with its name, profile code, port, bases, travel zone and trade codes; the lanes between them, and stubs for
// the lanes that leave the sector, pointing at where they go.
import { toCyrillic } from "../language";
import type { Galaxy } from "../space/galaxy";
import type { GalaxySurvey } from "../space/survey";
import type { LegendSection } from "./legend";
import { FEATURE_GLYPH } from "./space-svg";

const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
const r1 = (value: number) => Math.round(value * 10) / 10;

export const SECTOR_SIZE = { width: 1600, height: 1000 };

export interface SectorHex {
  star: number;
  col: number;
  row: number;
  x: number;
  y: number;
}

export interface SectorLayout {
  hexes: SectorHex[];
  /** Hex radius, map units; columns and rows of the grid. */
  size: number;
  cols: number;
  rows: number;
  origin: [number, number];
}

/** Where a flat-topped hex of the grid stands. */
const hexCentre = (layout: Pick<SectorLayout, "size" | "origin">, col: number, row: number): [number, number] => [layout.origin[0] + col * layout.size * 1.5, layout.origin[1] + (row + (col % 2 ? 0.5 : 0)) * layout.size * Math.sqrt(3)];

/** The sector's stars laid on hexes, each in the hex nearest its place in the galaxy (the next free one if taken). */
export function sectorLayout(galaxy: Galaxy, survey: GalaxySurvey, sectorId: number): SectorLayout | null {
  const stars = galaxy.stars.filter((star) => survey.sectorOf[star.id] === sectorId);
  if (!stars.length) return null;
  const { width: W, height: H } = SECTOR_SIZE;
  const xs = stars.map((s) => s.x),
    ys = stars.map((s) => s.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Enough hexes for every star with room to spare, shaped like the sector.
  const span = Math.max(1, x1 - x0) / Math.max(1, y1 - y0);
  const cells = Math.max(stars.length * 1.7, 12);
  const rows = Math.max(3, Math.round(Math.sqrt(cells / Math.max(0.4, Math.min(2.5, span)))));
  const cols = Math.max(3, Math.ceil(cells / rows));
  const size = Math.min((W - 120) / (cols * 1.5 + 0.5), (H - 160) / ((rows + 0.5) * Math.sqrt(3)));
  const origin: [number, number] = [(W - (cols * 1.5 - 0.5) * size) / 2, 110 + (H - 140 - (rows + 0.5) * Math.sqrt(3) * size) / 2 + (size * Math.sqrt(3)) / 2];
  const taken = new Set<string>();
  const hexes: SectorHex[] = [];
  // Biggest worlds first, so they keep their own hex.
  for (const star of [...stars].sort((a, b) => survey.worlds[b.id].people - survey.worlds[a.id].people || a.id - b.id)) {
    const fx = (star.x - x0) / Math.max(1, x1 - x0),
      fy = (star.y - y0) / Math.max(1, y1 - y0);
    const want: [number, number] = [Math.round(fx * (cols - 1)), Math.round(fy * (rows - 1))];
    let best: [number, number] | null = null;
    for (let ring = 0; !best && ring < cols + rows; ring++)
      for (let dc = -ring; dc <= ring && !best; dc++)
        for (let dr = -ring; dr <= ring && !best; dr++) {
          const col = want[0] + dc,
            row = want[1] + dr;
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring || col < 0 || row < 0 || col >= cols || row >= rows || taken.has(`${col},${row}`)) continue;
          best = [col, row];
        }
    if (!best) continue;
    taken.add(`${best[0]},${best[1]}`);
    const [x, y] = hexCentre({ size, origin }, ...best);
    hexes.push({ star: star.id, col: best[0], row: best[1], x, y });
  }
  return { hexes, size, cols, rows, origin };
}

/** The star in the hex under a point of the sector map. */
export function sectorPick(layout: SectorLayout, x: number, y: number): number | null {
  const hit = layout.hexes.reduce<SectorHex | null>((best, hex) => (Math.hypot(hex.x - x, hex.y - y) < layout.size * 0.9 && (!best || Math.hypot(hex.x - x, hex.y - y) < Math.hypot(best.x - x, best.y - y)) ? hex : best), null);
  return hit ? hit.star : null;
}

export function renderSector(galaxy: Galaxy, survey: GalaxySurvey, sectorId: number, options: { script?: "latin" | "cyrillic"; highlightStar?: number | null; title?: string; subtitle?: string } = {}): string {
  const layout = sectorLayout(galaxy, survey, sectorId);
  const { width: W, height: H } = SECTOR_SIZE;
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Segoe UI', Arial, sans-serif"><rect width="${W}" height="${H}" fill="#f6f2e8"/>`];
  const sector = survey.sectors[sectorId];
  if (!layout || !sector) return `${out.join("")}</svg>`;
  const { size } = layout;
  const power = galaxy.empires[sector.power];
  const hexPath = (x: number, y: number) => `M${Array.from({ length: 6 }, (_, k) => `${r1(x + Math.cos((k * Math.PI) / 3) * size)},${r1(y + Math.sin((k * Math.PI) / 3) * size)}`).join("L")}Z`;
  // The grid, numbered column then row as a sector map is.
  const grid: string[] = [];
  const numbers: string[] = [];
  for (let col = 0; col < layout.cols; col++)
    for (let row = 0; row < layout.rows; row++) {
      const [x, y] = hexCentre(layout, col, row);
      grid.push(hexPath(x, y));
      numbers.push(`<text x="${r1(x)}" y="${r1(y - size * 0.62)}">${String(col + 1).padStart(2, "0")}${String(row + 1).padStart(2, "0")}</text>`);
    }
  out.push(`<path d="${grid.join("")}" fill="#ffffff" fill-opacity="0.55" stroke="#9a8f7c" stroke-width="0.8"/><g font-size="${r1(size * 0.2)}" fill="#9a8f7c" text-anchor="middle">${numbers.join("")}</g>`);
  const at = new Map(layout.hexes.map((hex) => [hex.star, hex]));
  // Lanes inside the sector, and stubs towards the stars beyond it.
  const inside: string[] = [];
  const stubs: string[] = [];
  for (const [a, b] of galaxy.lanes) {
    const ha = at.get(a),
      hb = at.get(b);
    if (ha && hb) inside.push(`M${r1(ha.x)},${r1(ha.y)}L${r1(hb.x)},${r1(hb.y)}`);
    else if (ha || hb) {
      const from = (ha ?? hb)!;
      const self = galaxy.stars[from.star],
        far = galaxy.stars[ha ? b : a];
      const angle = Math.atan2(far.y - self.y, far.x - self.x);
      stubs.push(`<path d="M${r1(from.x)},${r1(from.y)}L${r1(from.x + Math.cos(angle) * size * 1.4)},${r1(from.y + Math.sin(angle) * size * 1.4)}" stroke="#7d6f5a" stroke-width="1.2" stroke-dasharray="3 3"/><text x="${r1(from.x + Math.cos(angle) * size * 1.6)}" y="${r1(from.y + Math.sin(angle) * size * 1.6)}" font-size="${r1(size * 0.18)}" fill="#7d6f5a" text-anchor="middle">${text(far.name)}</text>`);
    }
  }
  out.push(`<path d="${inside.join("")}" stroke="#7d6f5a" stroke-width="1.6" stroke-opacity="0.7"/>${stubs.join("")}`);
  for (const hex of layout.hexes) {
    const star = galaxy.stars[hex.star];
    const world = survey.worlds[hex.star];
    const r = size * 0.16;
    if (world.zone !== "green") out.push(`<circle cx="${r1(hex.x)}" cy="${r1(hex.y)}" r="${r1(size * 0.55)}" fill="none" stroke="${world.zone === "red" ? "#c0392b" : "#e0a000"}" stroke-width="1.6"/>`);
    // A world with water is a filled disc, a dry one a ring; nothing solid, a small dot.
    out.push(world.body === null ? `<circle cx="${r1(hex.x)}" cy="${r1(hex.y)}" r="${r1(r * 0.4)}" fill="#2b2620"/>` : `<circle cx="${r1(hex.x)}" cy="${r1(hex.y)}" r="${r1(r)}" fill="${world.hydrographics ? "#2f6fb0" : "#ffffff"}" stroke="#2b2620" stroke-width="1"/>`);
    if (star.capital) out.push(`<circle cx="${r1(hex.x)}" cy="${r1(hex.y)}" r="${r1(r + 4)}" fill="none" stroke="${power.color}" stroke-width="1.6"/>`);
    out.push(`<text x="${r1(hex.x)}" y="${r1(hex.y - r - 4)}" text-anchor="middle" font-size="${r1(size * 0.24)}" font-weight="700" fill="#2b2620">${world.starport}</text>`);
    const bases = [world.bases.includes("naval") ? "★" : "", world.bases.includes("scout") ? "▲" : "", world.bases.includes("pirate") ? "☠" : "", world.bases.includes("research") ? "⚗" : ""].join("");
    if (bases) out.push(`<text x="${r1(hex.x - size * 0.42)}" y="${r1(hex.y + 4)}" font-size="${r1(size * 0.2)}" fill="#8a4b2a">${bases}</text>`);
    if (star.feature) out.push(`<text x="${r1(hex.x + size * 0.32)}" y="${r1(hex.y + 4)}" font-size="${r1(size * 0.2)}" fill="#8a4b2a" font-family="'Segoe UI Symbol', sans-serif">${FEATURE_GLYPH[star.feature]}</text>`);
    out.push(`<text x="${r1(hex.x)}" y="${r1(hex.y + r + size * 0.24)}" text-anchor="middle" font-size="${r1(size * 0.2)}" font-weight="${world.population >= 9 ? 700 : 400}" fill="#2b2620">${text(world.population >= 9 ? star.name.toUpperCase() : star.name)}</text>`);
    out.push(`<text x="${r1(hex.x)}" y="${r1(hex.y + r + size * 0.46)}" text-anchor="middle" font-size="${r1(size * 0.17)}" fill="#5a5046" font-family="Consolas, monospace">${world.code}</text>`);
    if (world.trade.length) out.push(`<text x="${r1(hex.x)}" y="${r1(hex.y + r + size * 0.64)}" text-anchor="middle" font-size="${r1(size * 0.14)}" fill="#7d6f5a">${world.trade.join(" ")}</text>`);
    if (options.highlightStar === hex.star) out.push(`<path d="${hexPath(hex.x, hex.y)}" fill="none" stroke="#d64545" stroke-width="2.4"/>`);
  }
  out.push(`<text x="24" y="44" font-size="26" font-weight="700" letter-spacing="3" fill="${power.color}">${text((options.title ?? sector.name).toUpperCase())}</text><text x="24" y="68" font-size="13" fill="#5a5046">${esc(options.subtitle ?? `${power.name} · ${layout.hexes.length} ★`)}</text>`);
  out.push(`</svg>`);
  return out.join("");
}

/** What a sector map's marks mean. */
export function sectorLegend(galaxy: Galaxy, survey: GalaxySurvey, sectorId: number): LegendSection[] {
  const color = galaxy.empires[survey.sectors[sectorId]?.power ?? 1]?.color ?? "#8a4b2a";
  return [
    {
      key: "legend.worlds",
      entries: [
        { key: "legend.wet", swatch: { fill: "#2f6fb0", round: true, stroke: "#2b2620" } },
        { key: "legend.dry", swatch: { fill: "#ffffff", round: true, stroke: "#2b2620" } },
        { key: "legend.nothing", swatch: { svg: `<circle cx="12" cy="8" r="2" fill="#2b2620"/>` } },
        { key: "legend.capital-star", swatch: { svg: `<circle cx="12" cy="8" r="3" fill="#2f6fb0"/><circle cx="12" cy="8" r="6" fill="none" stroke="${color}" stroke-width="1.4"/>` } },
        { key: "zone2.amber", swatch: { svg: `<circle cx="12" cy="8" r="6.5" fill="none" stroke="#e0a000" stroke-width="1.4"/>` } },
        { key: "zone2.red", swatch: { svg: `<circle cx="12" cy="8" r="6.5" fill="none" stroke="#c0392b" stroke-width="1.4"/>` } },
      ],
    },
    {
      key: "profile.bases",
      entries: [
        { key: "base.naval", swatch: { glyph: "★", color: "#8a4b2a" } },
        { key: "base.scout", swatch: { glyph: "▲", color: "#8a4b2a" } },
        { key: "base.pirate", swatch: { glyph: "☠", color: "#8a4b2a" } },
        { key: "base.research", swatch: { glyph: "⚗", color: "#8a4b2a" } },
      ],
    },
    {
      key: "legend.ways",
      entries: [
        { key: "legend.hyperlane", swatch: { line: "#7d6f5a", width: 1.6 } },
        { key: "legend.lane-out", swatch: { line: "#7d6f5a", width: 1.2, dash: "3 3" } },
      ],
    },
  ];
}
