// The underworld as SVG: the surface coastline faint above, caverns as lumpy blobs by kind, winding tunnels, rivers in
// the dark and chasms, settlements of the deep peoples, ways down from the surface.
import { outline, pathData, smooth, type Point } from "../geometry";
import { toCyrillic } from "../language";
import type { Planet } from "../planet/model";
import type { CavernKind, Underworld } from "../planet/underworld";

const r1 = (value: number) => Math.round(value * 10) / 10;
const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
const FILL: Record<CavernKind, string> = { cavern: "#2c2a33", fungal: "#2d3a2c", sea: "#143049", magma: "#4a1c10", crystal: "#2b3348", ruins: "#3a3430", abyss: "#08080b", settlement: "#3a3328", metro: "#2a2f3a", undercity: "#1d2333", bunker: "#30343a", vault: "#2f3a33" };
const EDGE: Record<CavernKind, string> = { cavern: "#5a5666", fungal: "#7fb36a", sea: "#3f8fc4", magma: "#ff6a2b", crystal: "#9fd8ff", ruins: "#a8936a", abyss: "#3a3a48", settlement: "#e0b35a", metro: "#d9d36a", undercity: "#38c6e8", bunker: "#9aa4ad", vault: "#7fd8a0" };

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

export function renderUnderworld(world: Underworld, planet: Planet, options: { script?: "latin" | "cyrillic"; highlight?: number | null } = {}): string {
  const W = world.width,
    H = world.height;
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Segoe UI', Arial, sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="#121116"/>`);
  const coast = outline(planet.mesh, (cell) => !planet.water[cell])
    .map((loop) => pathData(smooth(loop, true, 2), true))
    .join("");
  out.push(`<path d="${coast}" fill="#1a1920" stroke="#46444f" stroke-width="1" stroke-dasharray="4 4" fill-rule="evenodd"/>`);
  for (const [a, b, kind] of world.tunnels) {
    const p = world.caverns[a],
      q = world.caverns[b];
    // A tunnel wanders: a bent middle, then rounded.
    const bend = (((a * 31 + b * 17) % 13) / 13 - 0.5) * 0.5;
    const mid: Point = [(p.x + q.x) / 2 - (q.y - p.y) * bend, (p.y + q.y) / 2 + (q.x - p.x) * bend];
    const d = pathData(smooth([[p.x, p.y], mid, [q.x, q.y]], false, 3), false);
    if (kind === "line") {
      out.push(`<path d="M${r1(world.caverns[a].x)},${r1(world.caverns[a].y)}L${r1(world.caverns[b].x)},${r1(world.caverns[b].y)}" stroke="${EDGE[world.caverns[a].kind]}" stroke-width="3" opacity="0.85"/>`);
      continue;
    }
    if (kind === "chasm") out.push(`<path d="${d}" fill="none" stroke="#000" stroke-width="7"/><path d="${d}" fill="none" stroke="#5a5666" stroke-width="1" stroke-dasharray="2 3"/>`);
    else out.push(`<path d="${d}" fill="none" stroke="${kind === "river" ? "#2a6a9a" : "#3a3744"}" stroke-width="${kind === "river" ? 4 : 5}" stroke-linecap="round"/>`);
  }
  for (const cavern of world.caverns) {
    const highlighted = options.highlight === cavern.id;
    out.push(`<path d="${blob(cavern.x, cavern.y, cavern.r, cavern.id + 1)}" fill="${FILL[cavern.kind]}" stroke="${highlighted ? "#ffd34d" : EDGE[cavern.kind]}" stroke-width="${highlighted ? 2.5 : 1.2}"/>`);
    const people = cavern.people ? world.peoples[cavern.people - 1] : null;
    if (cavern.kind === "settlement") out.push(`<circle cx="${r1(cavern.x)}" cy="${r1(cavern.y)}" r="4" fill="${people?.color ?? "#e0b35a"}" stroke="#121116" stroke-width="1.2"/>`);
  }
  for (const entrance of world.entrances) out.push(`<path d="M${r1(entrance.x - 4)},${r1(entrance.y - 3)}L${r1(entrance.x + 4)},${r1(entrance.y - 3)}L${r1(entrance.x)},${r1(entrance.y + 4)}Z" fill="#c9a227"/>`);
  out.push(`<g text-anchor="middle" font-size="9" fill="#cfc6b0">`);
  for (const cavern of world.caverns) if (cavern.kind === "settlement" || cavern.kind === "ruins" || cavern.kind === "metro" || cavern.kind === "undercity" || cavern.kind === "vault" || cavern.r > 22) out.push(`<text x="${r1(cavern.x)}" y="${r1(cavern.y + cavern.r + 10)}"${cavern.kind === "settlement" ? ` font-weight="700"` : ` font-style="italic" fill="${EDGE[cavern.kind]}"`}>${text(cavern.name)}</text>`);
  out.push(`</g><text x="20" y="34" font-size="20" letter-spacing="3" fill="#d8c79a" font-weight="600">${text(world.name.toUpperCase())}</text></svg>`);
  return out.join("");
}
