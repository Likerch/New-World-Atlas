// Local maps as SVG battle maps: tiles merged into one path per kind, walls wherever one cannot step across (rooms
// walled off from passages but for their doors), caves with smoothed walls, a ship's hull against the stars, the sea
// floor under its water, trees, rocks, rivers, streams and a trail in the wild, doors with their locks, stairs, traps,
// keys and numbered rooms for the GM. The players' view hides secret rooms and doors, traps, keys and numbers.
import { chainSegments, pathData, smooth, type Point } from "../geometry";
import { blocked, canStep, doorsOf, TILE, walk, type LocalFeatureKind, type LocalMap } from "../local/model";
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
}

const STYLES: Record<LocalThemeId, Style> = {
  classic: { rock: "#4f86c6", floor: "#ffffff", wall: "#1f3f6e", grid: "rgba(79,134,198,0.35)", water: "#a9d3f2", deep: "#6aa7d8", ink: "#1f3f6e", key: "#1f3f6e", keyText: "#ffffff" },
  parchment: { rock: "#7a6a52", floor: "#efe3c6", wall: "#3a2c1c", grid: "rgba(90,70,40,0.25)", water: "#b9c9c2", deep: "#8fa9a6", ink: "#3a2c1c", key: "#7a2e2e", keyText: "#efe3c6" },
  dark: { rock: "#121318", floor: "#3a3d46", wall: "#8a8f9c", grid: "rgba(255,255,255,0.08)", water: "#20456b", deep: "#122b47", ink: "#d8dbe3", key: "#c9a227", keyText: "#121318" },
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
  [TILE.ice]: "#d7ecf5",
  [TILE.field]: "#c9c27a",
  [TILE.lava]: "#e2541f",
  [TILE.floor]: "#d8cdb2",
  [TILE.hull]: "#6b5a44",
  [TILE.kelp]: "#5f8f6a",
  [TILE.coral]: "#e8987f",
};
/** The sea floor seen through water. */
const SEA: Record<number, string> = { ...WILD, [TILE.sand]: "#c9c6a4", [TILE.stone]: "#8f9a9c", [TILE.deep]: "#2f5f86", [TILE.water]: "#5d8fb0", [TILE.kelp]: "#4f8a6c", [TILE.coral]: "#d98a7a", [TILE.floor]: "#9c8d72" };

const GLYPH: Partial<Record<LocalFeatureKind, string>> = { "stairs-up": "▲", "stairs-down": "▼", chest: "▣", altar: "✝", statue: "♟", trap: "T", terminal: "▤", crate: "☒", bones: "☠", tent: "▲", fire: "✹", pool: "◍", machine: "⚙", mushroom: "♣", crystal: "◆", vein: "✦", portal: "◎", grave: "✝", derrick: "♜", console: "▭" };
const COLOUR: Partial<Record<LocalFeatureKind, string>> = { fire: "#e0602a", crystal: "#5fb8e8", vein: "#c9a227", portal: "#a05ad8", mushroom: "#9a6ab8" };

export interface LocalRenderOptions {
  style?: LocalThemeId;
  grid?: boolean;
  highlight?: number | null;
  /** The players' view: no secret rooms or doors, traps, keys or GM's key numbers. */
  players?: boolean;
  /** The scale bar in metres or feet (a square of 1.5 m is 5 ft). */
  units?: "m" | "ft";
  /** Column letters and row numbers along the edges. */
  coords?: boolean;
}

export function localPixels(map: LocalMap): number {
  return map.params.kind === "wilderness" ? 12 : 20;
}

/** Feet in a square: the battle grid's five for a 1.5 m square. */
export function feetOf(cell: number): number {
  return cell === 1.5 ? 5 : Math.round(cell * 3.28);
}

/** Open tiles the players do not know of: ground found only through a secret door. */
export function secretCells(map: LocalMap): Set<number> {
  const W = map.params.width;
  const hidden = new Set(map.features.filter((f) => f.kind === "secret-door").map((f) => f.x + f.y * W));
  if (!hidden.size) return new Set();
  const way = map.features.find((f) => f.kind === "stairs-up") ?? map.features.find((f) => (f.kind === "exit" || f.kind === "airlock") && f.to === "");
  const start = way ? way.x + way.y * W : map.keyed[0]?.cells[0] ?? 0;
  const dist = walk(map, doorsOf(map), start, (c) => hidden.has(c));
  const out = new Set<number>(hidden);
  for (let c = 0; c < map.tiles.length; c++) if (!blocked(map.tiles[c]) && dist[c] === Infinity) out.add(c);
  return out;
}

const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

export function renderLocal(map: LocalMap, options: LocalRenderOptions = {}): string {
  const { width: W, height: H } = map.params;
  const S = localPixels(map);
  const st = STYLES[options.style ?? "classic"];
  const wild = map.params.kind === "wilderness";
  const sea = map.params.theme === "seabed";
  const palette = sea ? SEA : WILD;
  const ship = map.params.theme === "starship" || map.params.theme === "derelict";
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * S} ${H * S}" width="${W * S}" height="${H * S}" font-family="'Segoe UI', Arial, sans-serif">`);
  out.push(`<rect width="${W * S}" height="${H * S}" fill="${wild ? palette[TILE.grass] : ship ? "#07080d" : st.rock}"/>`);
  const at = (x: number, y: number) => x + y * W;
  const hidden = options.players ? secretCells(map) : new Set<number>();
  const tileOf = (c: number) => (hidden.has(c) ? TILE.rock : map.tiles[c]);
  const open = (t: number) => !blocked(t);
  if (ship) {
    // Stars beyond the hull, the same for the same place.
    let seed = W * 31 + H;
    for (let k = 0; k < (W * H) / 30; k++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const x = (seed % (W * S)) + 0.5;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const y = (seed % (H * S)) + 0.5;
      out.push(`<circle cx="${x}" cy="${y}" r="${k % 7 === 0 ? 1.4 : 0.7}" fill="#dfe6ff" opacity="${k % 3 === 0 ? 0.9 : 0.5}"/>`);
    }
  }

  // Tiles, one path per kind.
  const cave = map.params.kind === "cave";
  const paths = new Map<number, string>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = tileOf(at(x, y));
      if (t === TILE.rock || (cave && t === TILE.floor)) continue;
      paths.set(t, (paths.get(t) ?? "") + `M${x * S},${y * S}h${S}v${S}h${-S}Z`);
    }
  if (cave) {
    // Cave walls: the outline of the open ground, rounded.
    const segments: [number, number][] = [];
    const corner = (x: number, y: number) => x + y * (W + 1);
    const ground = (x: number, y: number) => tileOf(at(x, y)) !== TILE.rock;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!ground(x, y)) continue;
        if (y === 0 || !ground(x, y - 1)) segments.push([corner(x, y), corner(x + 1, y)]);
        if (x === W - 1 || !ground(x + 1, y)) segments.push([corner(x + 1, y), corner(x + 1, y + 1)]);
        if (y === H - 1 || !ground(x, y + 1)) segments.push([corner(x + 1, y + 1), corner(x, y + 1)]);
        if (x === 0 || !ground(x - 1, y)) segments.push([corner(x, y + 1), corner(x, y)]);
      }
    const d = chainSegments(segments)
      .map((chain) => pathData(smooth(chain.map((c): Point => [(c % (W + 1)) * S, Math.floor(c / (W + 1)) * S]), true, 3), true))
      .join("");
    out.push(`<path d="${d}" fill="${st.floor}" fill-rule="evenodd" stroke="${st.wall}" stroke-width="3"/>`);
  }
  const fillOf = (t: number) => {
    if (t === TILE.chasm) return "#050507";
    if (t === TILE.lava) return "#e2541f";
    if (t === TILE.hull) return "#3d4250";
    if (wild) return palette[t] ?? palette[TILE.grass];
    if (t === TILE.water) return st.water;
    if (t === TILE.deep) return st.deep;
    if (t === TILE.rubble) return st.grid;
    if (t === TILE.field) return "#a9c48a";
    if (t === TILE.platform) return st.floor;
    if (t === TILE.stone) return "#bdb6a6";
    return st.floor;
  };
  for (const [t, d] of paths) out.push(`<path d="${d}" fill="${fillOf(t)}" stroke="${fillOf(t)}" stroke-width="0.5"/>`);
  // Rails: two lines and their ties along each run.
  let rails = "";
  for (let c = 0; c < map.tiles.length; c++) {
    if (tileOf(c) !== TILE.rail) continue;
    const x = c % W,
      y = Math.floor(c / W);
    const horizontal = (x > 0 && map.tiles[c - 1] === TILE.rail) || (x < W - 1 && map.tiles[c + 1] === TILE.rail);
    if (horizontal) rails += `M${x * S},${y * S + S * 0.3}h${S}M${x * S},${y * S + S * 0.7}h${S}M${x * S + S * 0.5},${y * S + S * 0.2}v${S * 0.6}`;
    else rails += `M${x * S + S * 0.3},${y * S}v${S}M${x * S + S * 0.7},${y * S}v${S}M${x * S + S * 0.2},${y * S + S * 0.5}h${S * 0.6}`;
  }
  if (rails) out.push(`<path d="${rails}" stroke="#6b5a44" stroke-width="1.4" fill="none"/>`);
  if (sea) out.push(`<rect width="${W * S}" height="${H * S}" fill="#2f6f9a" opacity="0.18"/>`);
  if (map.params.kind === "dungeon") {
    // Walls wherever one cannot step between two open tiles, and along the rock; a platform's open edge in yellow.
    const doors = doorsOf(map);
    const view = { tiles: Uint8Array.from(map.tiles, (_, c) => tileOf(c)), params: map.params };
    let d = "";
    let edge = "";
    const side = (c: number, n: number, line: string) => {
      const tn = n < 0 ? TILE.rock : view.tiles[n];
      if (tn === TILE.chasm || tn === TILE.lava) return;
      if (!open(tn)) d += line;
      else if (!canStep(view, doors, c, n)) d += line;
      else if ((view.tiles[c] === TILE.platform && tn === TILE.rail) || (view.tiles[c] === TILE.rail && tn === TILE.platform)) edge += line;
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = at(x, y);
        if (!open(view.tiles[c])) continue;
        side(c, y > 0 ? c - W : -1, `M${x * S},${y * S}h${S}`);
        side(c, y < H - 1 ? c + W : -1, `M${x * S},${(y + 1) * S}h${S}`);
        side(c, x > 0 ? c - 1 : -1, `M${x * S},${y * S}v${S}`);
        side(c, x < W - 1 ? c + 1 : -1, `M${(x + 1) * S},${y * S}v${S}`);
      }
    out.push(`<path d="${d}" stroke="${ship ? "#9aa4b8" : st.wall}" stroke-width="3" stroke-linecap="square"/>`);
    if (edge) out.push(`<path d="${edge}" stroke="#e8c22a" stroke-width="2.5"/>`);
  }
  // A chasm's lip.
  let lip = "";
  for (let c = 0; c < map.tiles.length; c++) {
    if (tileOf(c) !== TILE.chasm) continue;
    const x = c % W,
      y = Math.floor(c / W);
    if (y > 0 && open(tileOf(c - W))) lip += `M${x * S},${y * S}h${S}`;
    if (y < H - 1 && open(tileOf(c + W))) lip += `M${x * S},${(y + 1) * S}h${S}`;
    if (x > 0 && open(tileOf(c - 1))) lip += `M${x * S},${y * S}v${S}`;
    if (x < W - 1 && open(tileOf(c + 1))) lip += `M${(x + 1) * S},${y * S}v${S}`;
  }
  if (lip) out.push(`<path d="${lip}" stroke="#5a5666" stroke-width="1.5" stroke-dasharray="3 2"/>`);
  if (wild) {
    if (map.stream.length > 1) out.push(`<path d="${pathData(smooth(map.stream.map(([x, y]): Point => [(x + 0.5) * S, (y + 0.5) * S]), false, 2), false)}" fill="none" stroke="${palette[TILE.deep]}" stroke-width="${S * 0.7}" stroke-linecap="round"/>`);
    if (map.trail.length > 1) out.push(`<path d="${pathData(smooth(map.trail.map(([x, y]): Point => [(x + 0.5) * S, (y + 0.5) * S]), false, 2), false)}" fill="none" stroke="#8a6a3a" stroke-width="${S * 0.35}" stroke-dasharray="${S * 0.6} ${S * 0.4}"/>`);
  }
  if (options.grid !== false) {
    let g = "";
    for (let x = 0; x <= W; x++) g += `M${x * S},0V${H * S}`;
    for (let y = 0; y <= H; y++) g += `M0,${y * S}H${W * S}`;
    out.push(`<path d="${g}" stroke="${wild ? "rgba(60,50,30,0.16)" : ship ? "rgba(160,180,220,0.12)" : st.grid}" stroke-width="1"/>`);
  }
  if (options.highlight !== null && options.highlight !== undefined) {
    const keyed = map.keyed.find((k) => k.id === options.highlight);
    if (keyed && !(options.players && keyed.cells.some((c) => hidden.has(c)))) out.push(`<path d="${keyed.cells.map((c) => `M${(c % W) * S},${Math.floor(c / W) * S}h${S}v${S}h${-S}Z`).join("")}" fill="#ffd34d" fill-opacity="0.3"/>`);
  }

  // Features; the players see no traps, keys or secret things, and a secret door is only wall to them.
  const ink = wild ? "#3a2c1c" : ship ? "#c9d3e8" : st.ink;
  for (const f of map.features) {
    const cx = (f.x + 0.5) * S,
      cy = (f.y + 0.5) * S;
    const c = at(f.x, f.y);
    if (options.players && (f.kind === "trap" || f.kind === "key" || hidden.has(c))) continue;
    switch (f.kind) {
      case "tree":
        out.push(`<circle cx="${cx}" cy="${cy}" r="${S * 0.6}" fill="${sea ? "#3f7a5a" : "#4f7d3a"}" stroke="#2f4f22" stroke-width="1"/>`);
        break;
      case "great-tree":
        out.push(`<circle cx="${cx}" cy="${cy}" r="${S * 2.6}" fill="#3f6f2e" stroke="#24401a" stroke-width="2"/><circle cx="${cx - S * 0.8}" cy="${cy - S * 0.7}" r="${S * 1.2}" fill="#4f8a3a"/><circle cx="${cx}" cy="${cy}" r="${S * 0.45}" fill="#6b4a2a"/>`);
        break;
      case "rock":
        out.push(`<path d="M${cx - S * 0.45},${cy + S * 0.35}L${cx - S * 0.2},${cy - S * 0.4}L${cx + S * 0.4},${cy - S * 0.2}L${cx + S * 0.45},${cy + S * 0.4}Z" fill="#9a9284" stroke="#5e584d" stroke-width="1"/>`);
        break;
      case "pillar":
      case "stalagmite":
        out.push(`<circle cx="${cx}" cy="${cy}" r="${S * 0.32}" fill="${wild ? "#bdb6a6" : st.wall}"/>`);
        break;
      case "fence":
        out.push(`<circle cx="${cx}" cy="${cy}" r="${S * 0.22}" fill="#7a5a32" stroke="#3a2c1c" stroke-width="0.8"/>`);
        break;
      case "door":
      case "locked-door":
      case "secret-door": {
        const horizontal = !open(map.tiles[at(f.x - 1, f.y)]) || !open(map.tiles[at(f.x + 1, f.y)]);
        const w = horizontal ? S * 0.8 : S * 0.3,
          h = horizontal ? S * 0.3 : S * 0.8;
        out.push(`<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${f.kind === "secret-door" ? "none" : st.floor}" stroke="${st.wall}" stroke-width="2"${f.kind === "secret-door" ? ` stroke-dasharray="3 2"` : ""}/>`);
        if (f.kind === "locked-door") out.push(`<circle cx="${cx}" cy="${cy}" r="2.5" fill="${st.wall}"/>${f.lock && !options.players ? `<text x="${cx + S * 0.45}" y="${cy - S * 0.3}" font-size="${S * 0.45}" font-weight="700" fill="#b5562e">${f.lock}</text>` : ""}`);
        if (f.kind === "secret-door") out.push(`<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${st.wall}">S</text>`);
        break;
      }
      case "bridge":
        out.push(`<rect x="${f.x * S - 1}" y="${f.y * S - 1}" width="${S + 2}" height="${S + 2}" fill="#a07a4a" stroke="#5a4428"/><path d="M${f.x * S},${cy}h${S}" stroke="#5a4428" stroke-width="0.8"/>`);
        break;
      case "niche":
        out.push(`<rect x="${f.x * S + S * 0.2}" y="${f.y * S + S * 0.2}" width="${S * 0.6}" height="${S * 0.6}" fill="${st.floor}" stroke="${st.wall}" stroke-width="1"/>`);
        break;
      case "coffin":
        out.push(`<path d="M${cx - S * 0.25},${cy - S * 0.45}h${S * 0.5}l${S * 0.1},${S * 0.3}l${-S * 0.15},${S * 0.6}h${-S * 0.4}l${-S * 0.15},${-S * 0.6}Z" fill="#8a6a4a" stroke="${st.wall}" stroke-width="1"/>`);
        break;
      case "bunk":
        out.push(`<rect x="${f.x * S + S * 0.12}" y="${f.y * S + S * 0.15}" width="${S * 0.76}" height="${S * 0.7}" rx="2" fill="#c8cdd8" stroke="${st.wall}" stroke-width="1"/><rect x="${f.x * S + S * 0.18}" y="${f.y * S + S * 0.2}" width="${S * 0.25}" height="${S * 0.6}" fill="#fff"/>`);
        break;
      case "reactor":
        out.push(`<circle cx="${cx}" cy="${cy}" r="${S * 0.9}" fill="#1f3550" stroke="#38c6e8" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${S * 0.35}" fill="#7fe8ff"/>`);
        break;
      case "airlock":
        out.push(`<circle cx="${cx}" cy="${cy}" r="${S * 0.45}" fill="#3d4250" stroke="#e8c22a" stroke-width="2"/><path d="M${cx - S * 0.3},${cy}h${S * 0.6}M${cx},${cy - S * 0.3}v${S * 0.6}" stroke="#e8c22a" stroke-width="1.5"/>`);
        break;
      case "cart":
        out.push(`<rect x="${f.x * S + S * 0.15}" y="${f.y * S + S * 0.2}" width="${S * 0.7}" height="${S * 0.6}" fill="#6b5a44" stroke="#3a2c1c" stroke-width="1"/>`);
        break;
      case "shaft":
        out.push(`<rect x="${f.x * S + 2}" y="${f.y * S + 2}" width="${S - 4}" height="${S - 4}" fill="#050507" stroke="#6b5a44" stroke-width="2"/><path d="M${f.x * S + 2},${f.y * S + 2}l${S - 4},${S - 4}M${f.x * S + S - 2},${f.y * S + 2}l${-(S - 4)},${S - 4}" stroke="#6b5a44" stroke-width="1"/>`);
        break;
      case "grate":
        out.push(`<rect x="${f.x * S + 3}" y="${f.y * S + 3}" width="${S - 6}" height="${S - 6}" fill="none" stroke="${st.wall}" stroke-width="1"/><path d="M${f.x * S + S * 0.38},${f.y * S + 3}v${S - 6}M${f.x * S + S * 0.62},${f.y * S + 3}v${S - 6}" stroke="${st.wall}" stroke-width="1"/>`);
        break;
      case "exit": {
        // An arrow out of the map at its edge.
        const dx = f.x === 0 ? -1 : f.x === W - 1 ? 1 : 0,
          dy = f.y === 0 ? -1 : f.y === H - 1 ? 1 : 0;
        out.push(`<path d="M${cx - dy * S * 0.35 - dx * S * 0.2},${cy - dx * S * 0.35 - dy * S * 0.2}L${cx + dx * S * 0.4},${cy + dy * S * 0.4}L${cx + dy * S * 0.35 - dx * S * 0.2},${cy + dx * S * 0.35 - dy * S * 0.2}Z" fill="#2e9e5b" stroke="#fff" stroke-width="1"/>`);
        break;
      }
      case "key":
        out.push(`<text x="${cx}" y="${cy + S * 0.3}" text-anchor="middle" font-size="${S * 0.8}" fill="#b5562e" font-family="'Segoe UI Symbol', sans-serif">⚷</text><text x="${cx + S * 0.45}" y="${cy - S * 0.2}" font-size="${S * 0.45}" font-weight="700" fill="#b5562e">${f.lock ?? ""}</text>`);
        break;
      default: {
        const glyph = GLYPH[f.kind] ?? "•";
        out.push(`<text x="${cx}" y="${cy + S * 0.3}" text-anchor="middle" font-size="${S * 0.85}" fill="${COLOUR[f.kind] ?? (f.kind === "pool" ? st.deep : ink)}" font-family="'Segoe UI Symbol', sans-serif">${glyph}</text>`);
      }
    }
  }
  // Keys, for the GM: each on a free tile of its room nearest the middle, never over a thing standing in the room.
  const busy = new Set(map.features.flatMap((f) => (f.kind === "great-tree" ? [-1] : [at(f.x, f.y)])));
  for (const k of options.players ? [] : map.keyed) {
    const free = k.cells.filter((c) => !busy.has(c) && open(map.tiles[c]) && ![c - 1, c + 1].some((n) => busy.has(n) && map.features.some((f) => at(f.x, f.y) === n && f.kind.endsWith("door"))));
    const c = free.length ? free.reduce((best, c2) => (Math.hypot((c2 % W) + 0.5 - k.x, Math.floor(c2 / W) + 0.5 - k.y) < Math.hypot((best % W) + 0.5 - k.x, Math.floor(best / W) + 0.5 - k.y) ? c2 : best)) : -1;
    const cx = c >= 0 ? ((c % W) + 0.5) * S : k.x * S + (map.params.kind === "dungeon" ? 0 : S / 2),
      cy = c >= 0 ? (Math.floor(c / W) + 0.5) * S : k.y * S + (map.params.kind === "dungeon" ? 0 : S / 2);
    out.push(`<circle cx="${cx}" cy="${cy}" r="${S * 0.55}" fill="${st.key}" stroke="#fff" stroke-width="1.5"/><text x="${cx}" y="${cy + S * 0.22}" text-anchor="middle" font-size="${S * 0.6}" font-weight="700" fill="${st.keyText}">${k.id}</text>`);
  }
  if (options.coords) {
    // Letters across the top, numbers down the side, as on a battle mat.
    const label = (k: number) => (k < 26 ? String.fromCharCode(65 + k) : String.fromCharCode(65 + Math.floor(k / 26) - 1) + String.fromCharCode(65 + (k % 26)));
    const g: string[] = [`<g font-size="${S * 0.42}" fill="${ink}" opacity="0.75" text-anchor="middle">`];
    for (let x = 0; x < W; x++) g.push(`<text x="${(x + 0.5) * S}" y="${S * 0.42}">${label(x)}</text>`);
    for (let y = 0; y < H; y++) g.push(`<text x="${S * 0.32}" y="${(y + 0.65) * S}">${y + 1}</text>`);
    g.push(`</g>`);
    out.push(g.join(""));
  }
  // Scale: ten squares with their length.
  const length = options.units === "ft" ? `${10 * feetOf(map.cell)} ft` : `${10 * map.cell} m`;
  out.push(`<g font-size="11" fill="${ink}"><rect x="10" y="${H * S - 18}" width="${10 * S}" height="5" fill="${ink}"/><text x="${10 * S + 16}" y="${H * S - 12}">${esc(length)}</text></g>`);
  out.push(`</svg>`);
  return out.join("");
}

/** What a local map shows, for its legend: its ground, the things on it and the GM's numbered keys. */
export function localLegend(map: LocalMap, options: LocalRenderOptions = {}): LegendSection[] {
  const st = STYLES[options.style ?? "classic"];
  const wild = map.params.kind === "wilderness";
  const palette = map.params.theme === "seabed" ? SEA : WILD;
  const names = Object.fromEntries(Object.entries(TILE).map(([name, id]) => [id, name])) as Record<number, string>;
  const ship = map.params.theme === "starship" || map.params.theme === "derelict";
  const fill = (t: number) => (t === TILE.chasm ? "#050507" : t === TILE.lava ? "#e2541f" : t === TILE.hull ? "#3d4250" : wild ? palette[t] ?? palette[TILE.grass] : t === TILE.rock ? (ship ? "#07080d" : st.rock) : t === TILE.water ? st.water : t === TILE.deep ? st.deep : t === TILE.rubble ? st.grid : st.floor);
  const ground: LegendEntry[] = present(Array.from(map.tiles)).map((t) => ({
    key: `tile.${names[t]}${!wild && t === TILE.rock ? (ship ? "@space" : "@underground") : ""}`,
    swatch: t === TILE.rail ? { svg: `<rect x="3" y="2" width="18" height="12" fill="${st.floor}"/><path d="M3,6H21M3,10H21M7,4V12M12,4V12M17,4V12" stroke="#6b5a44" stroke-width="1.2"/>` } : { fill: fill(t), stroke: st.wall },
  }));
  if (map.stream.length > 1) ground.push({ key: "legend.stream", swatch: { line: palette[TILE.deep], width: 4 } });
  if (map.features.some((f) => f.kind === "exit")) ground.push({ key: "lfeature.exit", swatch: { svg: `<path d="M6,4L18,8L6,12Z" fill="#2e9e5b"/>` } });
  const drawn: Partial<Record<string, string>> = {
    tree: `<circle cx="12" cy="8" r="6" fill="#4f7d3a" stroke="#2f4f22" stroke-width="1"/>`,
    "great-tree": `<circle cx="12" cy="8" r="7" fill="#3f6f2e" stroke="#24401a" stroke-width="1"/><circle cx="12" cy="8" r="2" fill="#6b4a2a"/>`,
    rock: `<path d="M5,13L8,3L18,5L19,13Z" fill="#9a9284" stroke="#5e584d" stroke-width="1"/>`,
    pillar: `<circle cx="12" cy="8" r="4" fill="${wild ? "#bdb6a6" : st.wall}"/>`,
    stalagmite: `<circle cx="12" cy="8" r="4" fill="${wild ? "#bdb6a6" : st.wall}"/>`,
    fence: `<circle cx="7" cy="8" r="2" fill="#7a5a32"/><circle cx="12" cy="8" r="2" fill="#7a5a32"/><circle cx="17" cy="8" r="2" fill="#7a5a32"/>`,
    door: `<rect x="6" y="5" width="12" height="6" fill="${st.floor}" stroke="${st.wall}" stroke-width="2"/>`,
    "locked-door": `<rect x="6" y="5" width="12" height="6" fill="${st.floor}" stroke="${st.wall}" stroke-width="2"/><circle cx="12" cy="8" r="1.6" fill="${st.wall}"/>`,
    "secret-door": `<rect x="6" y="3" width="12" height="10" fill="none" stroke="${st.wall}" stroke-width="1.6" stroke-dasharray="3 2"/><text x="12" y="12" text-anchor="middle" font-size="9" font-weight="700" fill="${st.wall}">S</text>`,
    bridge: `<rect x="4" y="3" width="16" height="10" fill="#a07a4a" stroke="#5a4428"/>`,
    niche: `<rect x="8" y="4" width="8" height="8" fill="${st.floor}" stroke="${st.wall}"/>`,
    coffin: `<path d="M9,2h6l1,4l-2,8h-4l-2,-8Z" fill="#8a6a4a" stroke="${st.wall}"/>`,
    bunk: `<rect x="5" y="3" width="14" height="10" rx="2" fill="#c8cdd8" stroke="${st.wall}"/>`,
    reactor: `<circle cx="12" cy="8" r="6" fill="#1f3550" stroke="#38c6e8" stroke-width="1.5"/><circle cx="12" cy="8" r="2.5" fill="#7fe8ff"/>`,
    airlock: `<circle cx="12" cy="8" r="5.5" fill="#3d4250" stroke="#e8c22a" stroke-width="1.5"/><path d="M8,8H16M12,4V12" stroke="#e8c22a"/>`,
    cart: `<rect x="6" y="4" width="12" height="8" fill="#6b5a44" stroke="#3a2c1c"/>`,
    shaft: `<rect x="6" y="2" width="12" height="12" fill="#050507" stroke="#6b5a44" stroke-width="1.5"/>`,
    grate: `<rect x="6" y="3" width="12" height="10" fill="none" stroke="${st.wall}"/><path d="M10,3V13M14,3V13" stroke="${st.wall}"/>`,
    key: `<text x="12" y="13" text-anchor="middle" font-size="12" fill="#b5562e">⚷</text>`,
  };
  const things: LegendEntry[] = present(map.features.map((f) => f.kind)).flatMap((kind): LegendEntry[] => {
    if (kind === "exit") return [];
    if (drawn[kind]) return [{ key: `lfeature.${kind}`, swatch: { svg: drawn[kind]! } }];
    const glyph = GLYPH[kind];
    return glyph ? [{ key: `lfeature.${kind}`, swatch: { glyph, color: COLOUR[kind] ?? (kind === "pool" ? st.deep : wild ? "#3a2c1c" : st.ink) } }] : [];
  });
  if (map.keyed.length) things.push({ key: "legend.key", swatch: { svg: `<circle cx="12" cy="8" r="6.5" fill="${st.key}"/><text x="12" y="11.5" text-anchor="middle" font-size="9" font-weight="700" fill="${st.keyText}">1</text>` } });
  return [
    { key: "legend.ground", entries: ground },
    { key: "legend.features", entries: things },
  ].filter((section) => section.entries.length);
}
