// Local maps as SVG battle maps: tiles merged into one path per kind, walls traced along the rock, caves with smoothed
// walls, trees, rocks, a stream and a trail in the wild, doors, stairs, traps and numbered keys for the GM.
import { chainSegments, pathData, smooth, type Point } from "../geometry";
import { TILE, type LocalFeatureKind, type LocalMap } from "../local/local";
import { present, type LegendEntry, type LegendSection } from "./legend";

export type LocalThemeId = "classic" | "parchment" | "dark";
export const LOCAL_STYLES: LocalThemeId[] = ["classic", "parchment", "dark"];

interface Style {
  rock: string;
  floor: string;
  wall: string;
  grid: string;
  water: string;
  deep: string;
  ink: string;
  key: string;
  keyText: string;
  tiles: Partial<Record<number, string>>;
}

const STYLES: Record<LocalThemeId, Style> = {
  classic: { rock: "#4f86c6", floor: "#ffffff", wall: "#1f3f6e", grid: "rgba(79,134,198,0.35)", water: "#a9d3f2", deep: "#6aa7d8", ink: "#1f3f6e", key: "#1f3f6e", keyText: "#ffffff", tiles: {} },
  parchment: { rock: "#7a6a52", floor: "#efe3c6", wall: "#3a2c1c", grid: "rgba(90,70,40,0.25)", water: "#b9c9c2", deep: "#8fa9a6", ink: "#3a2c1c", key: "#7a2e2e", keyText: "#efe3c6", tiles: {} },
  dark: { rock: "#121318", floor: "#3a3d46", wall: "#8a8f9c", grid: "rgba(255,255,255,0.08)", water: "#20456b", deep: "#122b47", ink: "#d8dbe3", key: "#c9a227", keyText: "#121318", tiles: {} },
};

const WILD: Record<number, string> = {
  [TILE.grass]: "#b9cf8a",
  [TILE.forest]: "#8fb46a",
  [TILE.thicket]: "#6f9a52",
  [TILE.stone]: "#bdb6a6",
  [TILE.sand]: "#ead9a7",
  [TILE.marsh]: "#9fb08a",
  [TILE.trail]: "#d6c08e",
  [TILE.snow]: "#f2f5f7",
  [TILE.cliff]: "#8d8577",
  [TILE.water]: "#8cc3e3",
  [TILE.deep]: "#4f8fc4",
  [TILE.rubble]: "#a39a8a",
};

const GLYPH: Partial<Record<LocalFeatureKind, string>> = { "stairs-up": "▲", "stairs-down": "▼", chest: "▣", altar: "✝", statue: "♟", trap: "T", terminal: "▤", crate: "☒", bones: "☠", tent: "▲", fire: "✹", pool: "◍" };

export interface LocalRenderOptions {
  style?: LocalThemeId;
  grid?: boolean;
  highlight?: number | null;
}

export function localPixels(map: LocalMap): number {
  return map.params.kind === "wilderness" ? 12 : 20;
}

export function renderLocal(map: LocalMap, options: LocalRenderOptions = {}): string {
  const { width: W, height: H } = map.params;
  const S = localPixels(map);
  const st = STYLES[options.style ?? "classic"];
  const wild = map.params.kind === "wilderness";
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * S} ${H * S}" width="${W * S}" height="${H * S}" font-family="'Segoe UI', Arial, sans-serif">`);
  out.push(`<rect width="${W * S}" height="${H * S}" fill="${wild ? WILD[TILE.grass] : st.rock}"/>`);
  const open = (t: number) => t !== TILE.rock;
  const at = (x: number, y: number) => x + y * W;

  // Tiles, one path per kind.
  const paths = new Map<number, string>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = map.tiles[at(x, y)];
      if (t === TILE.rock || (!wild && map.params.kind === "cave" && t === TILE.floor)) continue;
      paths.set(t, (paths.get(t) ?? "") + `M${x * S},${y * S}h${S}v${S}h${-S}Z`);
    }
  if (!wild && map.params.kind === "cave") {
    // Cave walls: the outline of the open ground, rounded.
    const segments: [number, number][] = [];
    const corner = (x: number, y: number) => x + y * (W + 1);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!open(map.tiles[at(x, y)])) continue;
        if (y === 0 || !open(map.tiles[at(x, y - 1)])) segments.push([corner(x, y), corner(x + 1, y)]);
        if (x === W - 1 || !open(map.tiles[at(x + 1, y)])) segments.push([corner(x + 1, y), corner(x + 1, y + 1)]);
        if (y === H - 1 || !open(map.tiles[at(x, y + 1)])) segments.push([corner(x + 1, y + 1), corner(x, y + 1)]);
        if (x === 0 || !open(map.tiles[at(x - 1, y)])) segments.push([corner(x, y + 1), corner(x, y)]);
      }
    const d = chainSegments(segments)
      .map((chain) => pathData(smooth(chain.map((c): Point => [(c % (W + 1)) * S, Math.floor(c / (W + 1)) * S]), true, 3), true))
      .join("");
    out.push(`<path d="${d}" fill="${st.floor}" fill-rule="evenodd" stroke="${st.wall}" stroke-width="3"/>`);
  }
  for (const [t, d] of paths) {
    const fill = wild ? WILD[t] ?? WILD[TILE.grass] : t === TILE.water ? st.water : t === TILE.deep ? st.deep : t === TILE.rubble ? st.grid : st.floor;
    out.push(`<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="0.5"/>`);
  }
  if (!wild && map.params.kind === "dungeon") {
    // Walls along every edge between open ground and rock.
    let d = "";
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!open(map.tiles[at(x, y)])) continue;
        if (y === 0 || !open(map.tiles[at(x, y - 1)])) d += `M${x * S},${y * S}h${S}`;
        if (y === H - 1 || !open(map.tiles[at(x, y + 1)])) d += `M${x * S},${(y + 1) * S}h${S}`;
        if (x === 0 || !open(map.tiles[at(x - 1, y)])) d += `M${x * S},${y * S}v${S}`;
        if (x === W - 1 || !open(map.tiles[at(x + 1, y)])) d += `M${(x + 1) * S},${y * S}v${S}`;
      }
    out.push(`<path d="${d}" stroke="${st.wall}" stroke-width="3" stroke-linecap="square"/>`);
  }
  if (wild) {
    if (map.stream.length > 1) out.push(`<path d="${pathData(smooth(map.stream.map(([x, y]): Point => [(x + 0.5) * S, (y + 0.5) * S]), false, 2), false)}" fill="none" stroke="${WILD[TILE.deep]}" stroke-width="${S * 0.7}" stroke-linecap="round"/>`);
    if (map.trail.length > 1) out.push(`<path d="${pathData(smooth(map.trail.map(([x, y]): Point => [(x + 0.5) * S, (y + 0.5) * S]), false, 2), false)}" fill="none" stroke="#8a6a3a" stroke-width="${S * 0.35}" stroke-dasharray="${S * 0.6} ${S * 0.4}"/>`);
  }
  if (options.grid !== false && !wild) {
    let g = "";
    for (let x = 0; x <= W; x++) g += `M${x * S},0V${H * S}`;
    for (let y = 0; y <= H; y++) g += `M0,${y * S}H${W * S}`;
    out.push(`<path d="${g}" stroke="${st.grid}" stroke-width="1"/>`);
  }
  if (options.highlight !== null && options.highlight !== undefined) {
    const keyed = map.keyed.find((k) => k.id === options.highlight);
    if (keyed) out.push(`<path d="${keyed.cells.map((c) => `M${(c % W) * S},${Math.floor(c / W) * S}h${S}v${S}h${-S}Z`).join("")}" fill="#ffd34d" fill-opacity="0.3"/>`);
  }

  // Features.
  for (const f of map.features) {
    const cx = (f.x + 0.5) * S,
      cy = (f.y + 0.5) * S;
    if (f.kind === "tree") out.push(`<circle cx="${cx}" cy="${cy}" r="${S * 0.6}" fill="#4f7d3a" stroke="#2f4f22" stroke-width="1"/>`);
    else if (f.kind === "rock") out.push(`<path d="M${cx - S * 0.45},${cy + S * 0.35}L${cx - S * 0.2},${cy - S * 0.4}L${cx + S * 0.4},${cy - S * 0.2}L${cx + S * 0.45},${cy + S * 0.4}Z" fill="#9a9284" stroke="#5e584d" stroke-width="1"/>`);
    else if (f.kind === "pillar" || f.kind === "stalagmite") out.push(`<circle cx="${cx}" cy="${cy}" r="${S * 0.32}" fill="${wild ? "#bdb6a6" : st.wall}"/>`);
    else if (f.kind === "door" || f.kind === "locked-door" || f.kind === "secret-door") {
      const horizontal = !open(map.tiles[at(f.x - 1, f.y)]) || !open(map.tiles[at(f.x + 1, f.y)]);
      const w = horizontal ? S * 0.8 : S * 0.3,
        h = horizontal ? S * 0.3 : S * 0.8;
      out.push(`<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${f.kind === "secret-door" ? "none" : st.floor}" stroke="${st.wall}" stroke-width="2"${f.kind === "secret-door" ? ` stroke-dasharray="3 2"` : ""}/>`);
      if (f.kind === "locked-door") out.push(`<circle cx="${cx}" cy="${cy}" r="2.5" fill="${st.wall}"/>`);
      if (f.kind === "secret-door") out.push(`<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${st.wall}">S</text>`);
    } else if (f.kind === "bridge") out.push(`<rect x="${cx - S * 0.6}" y="${cy - S * 0.5}" width="${S * 1.2}" height="${S}" fill="#a07a4a" stroke="#5a4428"/>`);
    else {
      const glyph = GLYPH[f.kind] ?? "•";
      out.push(`<text x="${cx}" y="${cy + S * 0.3}" text-anchor="middle" font-size="${S * 0.85}" fill="${f.kind === "fire" ? "#e0602a" : f.kind === "pool" ? st.deep : wild ? "#3a2c1c" : st.ink}" font-family="'Segoe UI Symbol', sans-serif">${glyph}</text>`);
    }
  }
  // Keys.
  for (const k of map.keyed) {
    const cx = k.x * S + (map.params.kind === "dungeon" ? 0 : S / 2),
      cy = k.y * S + (map.params.kind === "dungeon" ? 0 : S / 2);
    out.push(`<circle cx="${cx}" cy="${cy}" r="${S * 0.55}" fill="${st.key}" stroke="#fff" stroke-width="1.5"/><text x="${cx}" y="${cy + S * 0.22}" text-anchor="middle" font-size="${S * 0.6}" font-weight="700" fill="${st.keyText}">${k.id}</text>`);
  }
  // Scale: ten squares (or tiles) with their length.
  const metres = 10 * map.cell;
  out.push(`<g font-size="11" fill="${wild ? "#3a2c1c" : st.ink}"><rect x="10" y="${H * S - 18}" width="${10 * S}" height="5" fill="${wild ? "#3a2c1c" : st.ink}"/><text x="${10 * S + 16}" y="${H * S - 12}">${metres} m</text></g>`);
  out.push(`</svg>`);
  return out.join("");
}

/** What a local map shows, for its legend: its ground, the things on it and the GM's numbered keys. */
export function localLegend(map: LocalMap, options: LocalRenderOptions = {}): LegendSection[] {
  const st = STYLES[options.style ?? "classic"];
  const wild = map.params.kind === "wilderness";
  const names = Object.fromEntries(Object.entries(TILE).map(([name, id]) => [id, name])) as Record<number, string>;
  const ground: LegendEntry[] = present(Array.from(map.tiles)).map((t) => ({
    key: `tile.${names[t]}${!wild && t === TILE.rock ? "@underground" : ""}`,
    swatch: { fill: wild ? WILD[t] ?? WILD[TILE.grass] : t === TILE.rock ? st.rock : t === TILE.water ? st.water : t === TILE.deep ? st.deep : t === TILE.rubble ? st.grid : st.floor, stroke: st.wall },
  }));
  if (map.stream.length > 1) ground.push({ key: "legend.stream", swatch: { line: WILD[TILE.deep], width: 4 } });
  const drawn: Partial<Record<string, string>> = {
    tree: `<circle cx="12" cy="8" r="6" fill="#4f7d3a" stroke="#2f4f22" stroke-width="1"/>`,
    rock: `<path d="M5,13L8,3L18,5L19,13Z" fill="#9a9284" stroke="#5e584d" stroke-width="1"/>`,
    pillar: `<circle cx="12" cy="8" r="4" fill="${wild ? "#bdb6a6" : st.wall}"/>`,
    stalagmite: `<circle cx="12" cy="8" r="4" fill="${wild ? "#bdb6a6" : st.wall}"/>`,
    door: `<rect x="6" y="5" width="12" height="6" fill="${st.floor}" stroke="${st.wall}" stroke-width="2"/>`,
    "locked-door": `<rect x="6" y="5" width="12" height="6" fill="${st.floor}" stroke="${st.wall}" stroke-width="2"/><circle cx="12" cy="8" r="1.6" fill="${st.wall}"/>`,
    "secret-door": `<rect x="6" y="3" width="12" height="10" fill="none" stroke="${st.wall}" stroke-width="1.6" stroke-dasharray="3 2"/><text x="12" y="12" text-anchor="middle" font-size="9" font-weight="700" fill="${st.wall}">S</text>`,
    bridge: `<rect x="4" y="3" width="16" height="10" fill="#a07a4a" stroke="#5a4428"/>`,
  };
  const things: LegendEntry[] = present(map.features.map((f) => f.kind)).flatMap((kind): LegendEntry[] => {
    if (drawn[kind]) return [{ key: `lfeature.${kind}`, swatch: { svg: drawn[kind]! } }];
    const glyph = GLYPH[kind];
    return glyph ? [{ key: `lfeature.${kind}`, swatch: { glyph, color: kind === "fire" ? "#e0602a" : kind === "pool" ? st.deep : wild ? "#3a2c1c" : st.ink } }] : [];
  });
  if (map.keyed.length) things.push({ key: "legend.key", swatch: { svg: `<circle cx="12" cy="8" r="6.5" fill="${st.key}"/><text x="12" y="11.5" text-anchor="middle" font-size="9" font-weight="700" fill="${st.keyText}">1</text>` } });
  return [
    { key: "legend.ground", entries: ground },
    { key: "legend.features", entries: things },
  ].filter((section) => section.entries.length);
}
