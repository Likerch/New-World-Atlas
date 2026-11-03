// The underworld as SVG: the surface faint above (its coast, and if asked its rivers and towns), the lands of the deep
// peoples, caverns as lumpy blobs by kind, winding tunnels, rivers in the dark and chasms, tunnels under the sea and
// the hazards on them, settlements, places of the deep, ways down from the surface by kind, and a scale in km. A
// cross-section shows how deep each cavern lies under the land above a line; a ghost layer lays the dark over the
// planet's own map.
import { outline, pathData, smooth, type Point } from "../geometry";
import { toCyrillic } from "../language";
import { SEA_LEVEL, type Planet } from "../planet/model";
import type { CavernKind, Underworld } from "../planet/underworld";
import { present, type LegendEntry, type LegendSection, type Swatch } from "./legend";

const r1 = (value: number) => Math.round(value * 10) / 10;
const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
const FILL: Record<CavernKind, string> = { cavern: "#2c2a33", fungal: "#2d3a2c", sea: "#143049", magma: "#4a1c10", crystal: "#2b3348", ruins: "#3a3430", abyss: "#08080b", settlement: "#3a3328", metro: "#2a2f3a", undercity: "#1d2333", bunker: "#30343a", vault: "#2f3a33", catacombs: "#35302e", sewers: "#2a3530" };
const EDGE: Record<CavernKind, string> = { cavern: "#5a5666", fungal: "#7fb36a", sea: "#3f8fc4", magma: "#ff6a2b", crystal: "#9fd8ff", ruins: "#a8936a", abyss: "#3a3a48", settlement: "#e0b35a", metro: "#d9d36a", undercity: "#38c6e8", bunker: "#9aa4ad", vault: "#7fd8a0", catacombs: "#c8b8a0", sewers: "#8fae8a" };
const DANGER = ["#e8c22a", "#e8862a", "#e0402a"];
const SITE: Partial<Record<string, string>> = { shrine: "✦", hoard: "◆", "lost-expedition": "⚑", forge: "⚒", "spore-garden": "♣", "oracle-pool": "◉", "toll-gate": "⛩", outpost: "⌂", "prison-pit": "▣", "bone-field": "☠", "black-lake": "◍", "sunken-temple": "⛫", "smugglers-cache": "▤", "old-workings": "⚒" };

/** A lumpy cave outline round a centre. */
function blob(x: number, y: number, r: number, salt: number): string {
  const points: Point[] = [];
  for (let k = 0; k < 14; k++) {
    const angle = (k / 14) * Math.PI * 2;
    const wobble = 0.72 + 0.28 * Math.abs(Math.sin(salt * 12.9898 + k * 78.233));
    points.push([x + Math.cos(angle) * r * wobble, y + Math.sin(angle) * r * wobble]);
  }
  points.push(points[0]);
  return pathData(smooth(points, true, 2), true);
}

/** A tunnel's course: a bent middle, then rounded; and the bend, where its hazard is marked. */
function course(world: Underworld, a: number, b: number): { d: string; mid: Point } {
  const p = world.caverns[a],
    q = world.caverns[b];
  const bend = (((a * 31 + b * 17) % 13) / 13 - 0.5) * 0.5;
  const mid: Point = [(p.x + q.x) / 2 - (q.y - p.y) * bend, (p.y + q.y) / 2 + (q.x - p.x) * bend];
  return { d: pathData(smooth([[p.x, p.y], mid, [q.x, q.y]], false, 3), false), mid };
}

export interface UnderworldRenderOptions {
  script?: "latin" | "cyrillic";
  highlight?: number | null;
  /** A tunnel, by its index, drawn picked. */
  tunnel?: number | null;
  /** The surface's rivers and towns, faint. */
  surface?: boolean;
  /** The lands of the deep peoples. */
  lands?: boolean;
  /** A distance on the scale bar, in its words ("km"). */
  km?: string;
}

/** A round length for a scale bar between 60 and 160 map units long. */
function scaleBar(scale: number): number {
  for (const km of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]) if (km / scale >= 60) return km;
  return 5000;
}

export function renderUnderworld(world: Underworld, planet: Planet, options: UnderworldRenderOptions = {}): string {
  const W = world.width,
    H = world.height;
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const live = world.caverns.filter((c) => !c.removed);
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Segoe UI', Arial, sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="#121116"/>`);
  const coast = outline(planet.mesh, (cell) => !planet.water[cell])
    .map((loop) => pathData(smooth(loop, true, 2), true))
    .join("");
  out.push(`<path d="${coast}" fill="#1a1920" stroke="#46444f" stroke-width="1" stroke-dasharray="4 4" fill-rule="evenodd"/>`);
  if (options.surface) {
    // The surface above, faint: its rivers and its towns.
    const rivers = planet.rivers
      .slice(1)
      .filter((river) => river.cells.length > 2)
      .map((river) => pathData(smooth(river.cells.map((cell): Point => [planet.mesh.x[cell], planet.mesh.y[cell]]), false, 2), false))
      .join("");
    out.push(`<path d="${rivers}" fill="none" stroke="#2f5f86" stroke-width="1" opacity="0.6"/>`);
    out.push(`<g fill="#8a8494" font-size="8" opacity="0.7">`);
    for (const town of planet.burgs.slice(1)) if (!town.removed) out.push(`<circle cx="${r1(town.x)}" cy="${r1(town.y)}" r="${town.capital ? 2.2 : 1.4}"/>${town.population > 20 || town.capital ? `<text x="${r1(town.x + 4)}" y="${r1(town.y - 3)}">${text(town.name)}</text>` : ""}`);
    out.push(`</g>`);
  }
  if (options.lands !== false)
    for (const people of world.peoples) {
      const own = live.filter((c) => c.people === people.id);
      if (own.length) out.push(`<g fill="${people.color}" opacity="0.13">${own.map((c) => `<circle cx="${r1(c.x)}" cy="${r1(c.y)}" r="${r1(c.r * 2.3)}"/>`).join("")}</g>`);
    }
  world.tunnels.forEach(([a, b, kind], k) => {
    const way = world.ways[k];
    const picked = options.tunnel === k;
    if (kind === "line") {
      out.push(`<path d="M${r1(world.caverns[a].x)},${r1(world.caverns[a].y)}L${r1(world.caverns[b].x)},${r1(world.caverns[b].y)}" stroke="${picked ? "#ffd34d" : EDGE[world.caverns[a].kind]}" stroke-width="${picked ? 5 : 3}" opacity="0.85"/>`);
      return;
    }
    const { d, mid } = course(world, a, b);
    if (way?.undersea) out.push(`<path d="${d}" fill="none" stroke="#2f6f9a" stroke-width="11" opacity="0.35" stroke-linecap="round"/>`);
    if (picked) out.push(`<path d="${d}" fill="none" stroke="#ffd34d" stroke-width="10" opacity="0.6" stroke-linecap="round"/>`);
    if (kind === "chasm") out.push(`<path d="${d}" fill="none" stroke="#000" stroke-width="7"/><path d="${d}" fill="none" stroke="#5a5666" stroke-width="1" stroke-dasharray="2 3"/>`);
    else out.push(`<path d="${d}" fill="none" stroke="${kind === "river" ? "#2a6a9a" : "#3a3744"}" stroke-width="${kind === "river" ? 4 : 5}" stroke-linecap="round"/>`);
    if (way?.hazard) out.push(`<path d="M${r1(mid[0])},${r1(mid[1] - 4)}L${r1(mid[0] + 3.5)},${r1(mid[1] + 2.5)}L${r1(mid[0] - 3.5)},${r1(mid[1] + 2.5)}Z" fill="${DANGER[Math.max(0, Math.min(2, way.danger - 1))]}" stroke="#121116" stroke-width="0.6"/>`);
  });
  for (const cavern of live) {
    const highlighted = options.highlight === cavern.id;
    out.push(`<path d="${blob(cavern.x, cavern.y, cavern.r, cavern.id + 1)}" fill="${FILL[cavern.kind]}" stroke="${highlighted ? "#ffd34d" : EDGE[cavern.kind]}" stroke-width="${highlighted ? 2.5 : 1.2}"${cavern.added ? ` stroke-dasharray="3 2"` : ""}/>`);
    const people = cavern.people ? world.peoples[cavern.people - 1] : null;
    if (cavern.kind === "settlement") out.push(`<circle cx="${r1(cavern.x)}" cy="${r1(cavern.y)}" r="${people && people.capital === cavern.id ? 5 : 4}" fill="${people?.color ?? "#e0b35a"}" stroke="#121116" stroke-width="1.2"/>`);
  }
  // Places of the deep.
  out.push(`<g font-size="9" text-anchor="middle" font-family="'Segoe UI Symbol', sans-serif">`);
  for (const site of world.sites) out.push(`<text x="${r1(site.x)}" y="${r1(site.y + 3)}" fill="#e8d8a8">${SITE[site.kind] ?? "✦"}</text>`);
  out.push(`</g>`);
  // Ways down, each drawn as what it is: a cave mouth, a mine, a volcano's throat, a portal, a station, a bunker's
  // shaft, a vault's door, catacombs or a sewer under a town.
  for (const entrance of world.entrances) {
    if (world.caverns[entrance.cavern]?.removed) continue;
    const kind = descentOf(world, planet, entrance);
    out.push(descentMark(kind, entrance.x, entrance.y));
  }
  out.push(`<g text-anchor="middle" font-size="9" fill="#cfc6b0">`);
  for (const cavern of live) if (cavern.kind === "settlement" || cavern.kind === "ruins" || cavern.kind === "metro" || cavern.kind === "undercity" || cavern.kind === "vault" || cavern.kind === "bunker" || cavern.kind === "catacombs" || cavern.kind === "sewers" || cavern.r > 22) out.push(`<text x="${r1(cavern.x)}" y="${r1(cavern.y + cavern.r + 10)}"${cavern.kind === "settlement" ? ` font-weight="700"` : ` font-style="italic" fill="${EDGE[cavern.kind]}"`}>${text(cavern.name)}</text>`);
  out.push(`</g>`);
  if (world.scale) {
    const km = scaleBar(world.scale);
    const length = km / world.scale;
    out.push(`<g fill="#cfc6b0" font-size="10"><rect x="20" y="${H - 26}" width="${r1(length)}" height="4"/><text x="${r1(26 + length)}" y="${H - 20}">${km} ${esc(options.km ?? "km")}</text></g>`);
  }
  out.push(`<text x="20" y="34" font-size="20" letter-spacing="3" fill="#d8c79a" font-weight="600">${text(world.name.toUpperCase())}</text></svg>`);
  return out.join("");
}

/** How each kind of way down is coloured, and its mark. */
const DESCENT: Record<string, string> = { cave: "#c9a227", mine: "#b8b8c0", volcano: "#ff6a2b", portal: "#c27bff", metro: "#d9d36a", undercity: "#38c6e8", bunker: "#9aa4ad", vault: "#7fd8a0", catacombs: "#c8b8a0", sewers: "#8fae8a" };
const DESCENT_GLYPH: Record<string, string> = { cave: "", mine: "⚒", volcano: "", portal: "◎", metro: "M", undercity: "◈", bunker: "☢", vault: "⛨", catacombs: "✝", sewers: "≋" };

function descentMark(kind: string, x: number, y: number): string {
  const colour = DESCENT[kind] ?? DESCENT.cave;
  if (kind === "cave" || kind === "volcano") return `<path d="M${r1(x - 4.5)},${r1(y - 3)}L${r1(x + 4.5)},${r1(y - 3)}L${r1(x)},${r1(y + 4.5)}Z" fill="${colour}" stroke="#121116" stroke-width="0.6"/>`;
  return `<circle cx="${r1(x)}" cy="${r1(y)}" r="5" fill="#121116" stroke="${colour}" stroke-width="1.4"/><text x="${r1(x)}" y="${r1(y + 3)}" text-anchor="middle" font-size="7" font-weight="700" fill="${colour}" font-family="'Segoe UI Symbol', sans-serif">${DESCENT_GLYPH[kind] ?? ""}</text>`;
}

function descentOf(world: Underworld, planet: Planet | null, entrance: Underworld["entrances"][number]): string {
  const kind = entrance.marker && planet ? planet.markers[entrance.marker]?.kind : world.caverns[entrance.cavern]?.kind;
  return kind && DESCENT[kind] ? kind : "cave";
}

export interface SectionOptions {
  script?: "latin" | "cyrillic";
  highlight?: number | null;
  /** The line the section is cut along, as a map y; caverns near it are drawn whole, the rest faint. */
  y?: number;
  /** Words for the tiers and the depth unit: upper, middle, deep, "km". */
  words?: { upper: string; middle: string; deep: string; km: string };
}

/** The height of a section drawing. */
export const SECTION_HEIGHT = 560;

/** Where a cavern stands in a section: its x along the map, its y by depth. */
export function sectionPoint(world: Underworld, cavern: Underworld["caverns"][number]): [number, number] {
  return [cavern.x, depthY(world, cavern.depth)];
}

/** A depth's height in a section: by its square root, so the crowded upper dark spreads out. */
function depthY(world: Underworld, depth: number): number {
  const deepest = Math.max(1000, ...world.caverns.filter((c) => !c.removed).map((c) => c.depth)) * 1.08;
  return 130 + Math.sqrt(Math.max(0, depth) / deepest) * (SECTION_HEIGHT - 170);
}

/** The underworld cut along a line: the land above in profile, the tiers of the dark, caverns by depth. */
export function renderUnderworldSection(world: Underworld, planet: Planet, options: SectionOptions = {}): string {
  const W = world.width;
  const Hs = SECTION_HEIGHT;
  const y0 = options.y ?? world.height / 2;
  const band = world.height / 7;
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const live = world.caverns.filter((c) => !c.removed);
  const deepest = Math.max(1000, ...live.map((c) => c.depth)) * 1.08;
  const yOf = (depth: number) => depthY(world, depth);
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hs}" width="${W}" height="${Hs}" font-family="'Segoe UI', Arial, sans-serif">`];
  out.push(`<rect width="${W}" height="${Hs}" fill="#121116"/><rect width="${W}" height="130" fill="#1b2433"/>`);
  // The land above the line, in profile: heights over sea level, the sea flat.
  const top: Point[] = [];
  for (let x = 0; x <= W; x += 4) {
    const cell = planet.mesh.find(Math.min(W - 1, x), y0);
    const land = !planet.water[cell];
    top.push([x, land ? 130 - Math.max(2, (planet.height[cell] - SEA_LEVEL) * 1.3) : 128]);
  }
  out.push(`<path d="M0,130${top.map(([x, y]) => `L${x},${r1(y)}`).join("")}L${W},130Z" fill="#4a5a3a" stroke="#7a8a5a" stroke-width="1"/>`);
  out.push(`<rect y="126" width="${W}" height="4" fill="#2f5f86" opacity="0.5"/>`);
  // The tiers of the dark.
  const words = options.words;
  for (const [depth, label] of [
    [600, words?.middle],
    [2000, words?.deep],
  ] as const) {
    if (depth > deepest) continue;
    out.push(`<path d="M0,${r1(yOf(depth))}H${W}" stroke="#46444f" stroke-dasharray="6 6"/>${label ? `<text x="${W - 10}" y="${r1(yOf(depth) + 14)}" text-anchor="end" font-size="11" fill="#8a8494">${esc(label)}</text>` : ""}`);
  }
  if (words) out.push(`<text x="${W - 10}" y="146" text-anchor="end" font-size="11" fill="#8a8494">${esc(words.upper)}</text>`);
  for (let km = 1; km * 1000 < deepest; km++) out.push(`<text x="6" y="${r1(yOf(km * 1000) + 4)}" font-size="10" fill="#8a8494">${km} ${esc(words?.km ?? "km")}</text><path d="M0,${r1(yOf(km * 1000))}h4" stroke="#8a8494"/>`);
  const near = (c: Underworld["caverns"][number]) => Math.abs(c.y - y0) < band;
  // Shafts from the surface down to the ways in near the line.
  for (const e of world.entrances) {
    const c = world.caverns[e.cavern];
    if (!c || c.removed || Math.abs(e.y - y0) > band) continue;
    out.push(`<path d="M${r1(e.x)},128V${r1(yOf(c.depth))}" stroke="#c9a227" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.8"/>`);
  }
  for (const [a, b, kind] of world.tunnels) {
    const p = world.caverns[a],
      q = world.caverns[b];
    if (p.removed || q.removed) continue;
    const seen = near(p) && near(q);
    out.push(`<path d="M${r1(p.x)},${r1(yOf(p.depth))}L${r1(q.x)},${r1(yOf(q.depth))}" stroke="${kind === "river" ? "#2a6a9a" : kind === "line" ? "#d9d36a" : kind === "chasm" ? "#000" : "#4a4754"}" stroke-width="${seen ? 3 : 1.5}" opacity="${seen ? 0.9 : 0.25}"/>`);
  }
  for (const c of live) {
    const seen = near(c);
    const y = yOf(c.depth);
    const r = Math.max(3, Math.min(14, c.r * 0.5));
    out.push(`<ellipse cx="${r1(c.x)}" cy="${r1(y)}" rx="${r1(r * 1.6)}" ry="${r1(r)}" fill="${FILL[c.kind]}" stroke="${options.highlight === c.id ? "#ffd34d" : EDGE[c.kind]}" stroke-width="${options.highlight === c.id ? 2.5 : 1.2}" opacity="${seen || options.highlight === c.id ? 1 : 0.3}"/>`);
    if (seen && (c.kind === "settlement" || c.r > 20 || options.highlight === c.id)) out.push(`<text x="${r1(c.x)}" y="${r1(y + r + 11)}" text-anchor="middle" font-size="9" fill="#cfc6b0">${text(c.name)}</text>`);
  }
  out.push(`</svg>`);
  return out.join("");
}

/** The underworld as a faint layer over its planet's map: tunnels and caverns, the ways down marked. */
export function underworldGhostSvg(world: Underworld): string {
  const out: string[] = [`<g class="underworld-ghost" opacity="0.4" pointer-events="none">`];
  for (const [a, b, kind] of world.tunnels) {
    if (world.caverns[a].removed || world.caverns[b].removed) continue;
    out.push(`<path d="${course(world, a, b).d}" fill="none" stroke="${kind === "river" ? "#2a6a9a" : kind === "line" ? "#d9d36a" : "#5a5666"}" stroke-width="2" stroke-dasharray="${kind === "chasm" ? "2 3" : "none"}"/>`);
  }
  for (const c of world.caverns) if (!c.removed) out.push(`<path d="${blob(c.x, c.y, c.r, c.id + 1)}" fill="${FILL[c.kind]}" stroke="${EDGE[c.kind]}" stroke-width="1"/>`);
  out.push(`</g>`);
  return out.join("");
}

/** What the underworld map shows, for its legend. `planet` tells the ways down apart. */
export function underworldLegend(world: Underworld, planet: Planet | null = null): LegendSection[] {
  const caverns: LegendEntry[] = present(world.caverns.filter((c) => !c.removed).map((c) => c.kind)).map((kind) => ({ key: `cavern.${kind}`, swatch: { fill: FILL[kind], stroke: EDGE[kind], round: true } }));
  const look: Record<string, Swatch> = {
    passage: { line: "#3a3744", width: 5 },
    river: { line: "#2a6a9a", width: 4 },
    chasm: { line: "#000000", width: 6, over: "#5a5666", overWidth: 1, overDash: "2 3" },
    // Lines run in the colour of their stations: the metro's, or the undercity's.
    line: { line: world.caverns.some((c) => c.kind === "undercity") ? EDGE.undercity : EDGE.metro, width: 3 },
  };
  const ways: LegendEntry[] = present(world.tunnels.map(([, , kind]) => kind)).map((kind) => ({ key: `tunnel.${kind}`, swatch: look[kind] }));
  if (world.ways.some((way) => way.undersea)) ways.push({ key: "underworld.undersea", swatch: { line: "#2f6f9a", width: 8, opacity: 0.5 } });
  for (const danger of present(world.ways.filter((way) => way.hazard).map((way) => way.danger))) ways.push({ key: `underworld.hazard${danger}`, swatch: { svg: `<path d="M12,3L17,12H7Z" fill="${DANGER[Math.max(0, Math.min(2, danger - 1))]}"/>` } });
  for (const kind of present(world.entrances.map((entrance) => descentOf(world, planet, entrance)))) ways.push({ key: `descent.${kind}`, swatch: { svg: descentMark(kind, 12, 8) } });
  const places: LegendEntry[] = present(world.sites.map((site) => site.kind)).map((kind) => ({ key: `usite.${kind}`, swatch: { glyph: SITE[kind] ?? "✦", color: "#e8d8a8", bg: "#121116" } }));
  const peoples: LegendEntry[] = world.peoples.map((people) => ({ label: people.name, swatch: { fill: people.color, round: true } }));
  return [
    { key: "legend.caverns", entries: caverns },
    { key: "legend.ways", entries: ways },
    { key: "underworld.places", entries: places },
    { key: "underworld.peoples", entries: peoples },
  ].filter((section) => section.entries.length);
}
