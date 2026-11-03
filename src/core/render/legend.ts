// Map legends. Every renderer says what is on its map — only what is actually there — as sections of entries, each a
// label key and a small swatch drawn the way the map draws that thing. The app turns the keys into words, shows the
// legend beside the map and can draw it into an exported image.

/** A small picture of one kind of thing: an area, a line, a symbol, or raw SVG in a 24 × 16 box. */
export type Swatch =
  | { fill: string; stroke?: string; dash?: string; opacity?: number; round?: boolean }
  | { line: string; width?: number; dash?: string; opacity?: number; over?: string; overWidth?: number; overDash?: string }
  | { glyph: string; color?: string; ring?: string; bg?: string }
  | { svg: string };

export interface LegendEntry {
  /** A label key for the app's dictionary, with values for its blanks; or a label already in words. */
  key?: string;
  vars?: Record<string, string | number>;
  label?: string;
  swatch: Swatch;
}

export interface LegendSection {
  key: string;
  entries: LegendEntry[];
}

const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

/** A swatch's markup, for a 24 × 16 view box. */
export function swatchSvg(swatch: Swatch): string {
  if ("svg" in swatch) return swatch.svg;
  if ("glyph" in swatch)
    return `${swatch.ring || swatch.bg ? `<circle cx="12" cy="8" r="7" fill="${swatch.bg ?? "none"}" stroke="${swatch.ring ?? "none"}" stroke-width="0.8"/>` : ""}<text x="12" y="12" text-anchor="middle" font-size="11" fill="${swatch.color ?? "currentColor"}" font-family="'Segoe UI Symbol', 'Segoe UI Emoji', 'Noto Sans Symbols', sans-serif">${esc(swatch.glyph)}</text>`;
  if ("line" in swatch) {
    const base = `<path d="M2,8H22" fill="none" stroke="${swatch.line}" stroke-width="${swatch.width ?? 1.6}" stroke-linecap="round"${swatch.dash ? ` stroke-dasharray="${swatch.dash}"` : ""}${swatch.opacity !== undefined ? ` opacity="${swatch.opacity}"` : ""}/>`;
    return swatch.over ? `${base}<path d="M2,8H22" fill="none" stroke="${swatch.over}" stroke-width="${swatch.overWidth ?? 0.8}"${swatch.overDash ? ` stroke-dasharray="${swatch.overDash}"` : ""}/>` : base;
  }
  const shape = swatch.round ? `<circle cx="12" cy="8" r="6.5"` : `<rect x="3" y="2" width="18" height="12" rx="2"`;
  return `${shape} fill="${swatch.fill}"${swatch.opacity !== undefined ? ` fill-opacity="${swatch.opacity}"` : ""} stroke="${swatch.stroke ?? "rgba(0,0,0,0.35)"}" stroke-width="0.8"${swatch.dash ? ` stroke-dasharray="${swatch.dash}"` : ""}/>`;
}

/** A line style taken from SVG stroke attributes, as a swatch. */
export function strokeSwatch(attributes: string, over?: string): Swatch {
  const get = (text: string, name: string) => new RegExp(`${name}="([^"]+)"`, "u").exec(text)?.[1];
  return {
    line: get(attributes, "stroke") ?? "#000",
    width: Number(get(attributes, "stroke-width") ?? 1.2) * 1.4,
    dash: get(attributes, "stroke-dasharray"),
    opacity: get(attributes, "opacity") ? Number(get(attributes, "opacity")) : undefined,
    ...(over ? { over: get(over, "stroke"), overWidth: Number(get(over, "stroke-width") ?? 0.6) * 1.4, overDash: get(over, "stroke-dasharray") } : {}),
  };
}

/** Counts the kinds present in a list, most common first. */
export function present<T>(items: T[]): T[] {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([item]) => item);
}

/** The legend drawn into a map image: a box of columns in the bottom-left corner. Labels are already in words. */
export function legendSvg(sections: { title: string; entries: { label: string; swatch: Swatch }[] }[], width: number, height: number, colours: { paper: string; ink: string }, scale = 1): string {
  const rows: ({ title: string } | { label: string; swatch: Swatch })[] = [];
  for (const section of sections) if (section.entries.length) rows.push({ title: section.title }, ...section.entries);
  if (!rows.length) return "";
  const line = 17 * scale;
  const column = 200 * scale;
  const perColumn = Math.max(4, Math.floor((height * 0.55) / line));
  const columns = Math.min(Math.ceil(rows.length / perColumn), Math.max(1, Math.floor((width * 0.8) / column)));
  const shown = rows.slice(0, columns * perColumn);
  const boxW = columns * column + 12 * scale;
  const boxH = Math.min(perColumn, shown.length) * line + 12 * scale;
  const x0 = 16 * scale,
    y0 = height - boxH - 16 * scale;
  const out = [`<g class="legend" font-family="'Segoe UI', Arial, sans-serif"><rect x="${x0}" y="${y0}" width="${boxW}" height="${boxH}" rx="${4 * scale}" fill="${colours.paper}" fill-opacity="0.92" stroke="${colours.ink}" stroke-width="${scale}"/>`];
  shown.forEach((row, index) => {
    const x = x0 + 6 * scale + Math.floor(index / perColumn) * column;
    const y = y0 + 6 * scale + (index % perColumn) * line;
    if ("title" in row) out.push(`<text x="${x}" y="${y + line * 0.72}" font-size="${10 * scale}" font-weight="700" letter-spacing="${scale}" fill="${colours.ink}">${esc(row.title.toUpperCase())}</text>`);
    else out.push(`<svg x="${x}" y="${y + scale}" width="${24 * scale}" height="${16 * scale}" viewBox="0 0 24 16" color="${colours.ink}">${swatchSvg(row.swatch)}</svg><text x="${x + 30 * scale}" y="${y + line * 0.72}" font-size="${11 * scale}" fill="${colours.ink}">${esc(row.label)}</text>`);
  });
  out.push(`</g>`);
  return out.join("");
}
