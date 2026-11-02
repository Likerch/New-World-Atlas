// A city's other levels as SVG: the upper tier laid over the dimmed streets, or the underside on its own dark map.
import type { City } from "../city/model";
import type { HallPurpose, Tier, Tiers } from "../city/tiers";
import { pathData, smooth } from "../geometry";
import { toCyrillic } from "../language";
import { renderCity, type CityRenderOptions } from "./city-svg";

const r1 = (value: number) => Math.round(value * 10) / 10;
const ring = (points: [number, number][]) => `M${points.map(([x, y]) => `${r1(x)},${r1(y)}`).join("L")}Z`;
const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
const HALL_GLYPH: Record<HallPurpose, string> = { market: "¥", turf: "☠", metro: "Ⓜ", flooded: "≈", cult: "⛧", ossuary: "☩", smugglers: "⚓", squat: "⌂" };

export function renderTier(city: City, tiers: Tiers, tier: Tier, options: CityRenderOptions = {}): string {
  if (tier === "street") return renderCity(city, options);
  const { width: W, height: H } = city.params;
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const out: string[] = [];
  if (tier === "upper") {
    const base = renderCity(city, { ...options, layers: { ...options.layers, labels: false, landmarks: false } });
    out.push(`<rect width="${W}" height="${H}" fill="#05060c" opacity="0.62"/>`);
    out.push(`<defs><filter id="tier-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`);
    for (const roof of tiers.upper.roofs) out.push(`<path d="${ring(roof)}" fill="#1c2236" stroke="#38e1ff" stroke-width="0.9"/>`);
    out.push(`<path d="${tiers.upper.bridges.map(([a, b]) => `M${r1(a[0])},${r1(a[1])}L${r1(b[0])},${r1(b[1])}`).join("")}" stroke="#ff3d7f" stroke-width="2.2" stroke-linecap="round" filter="url(#tier-glow)"/>`);
    for (const [x, y] of tiers.upper.pads) out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="6" fill="#0b0d14" stroke="#ffcc33" stroke-width="1.5"/><text x="${r1(x)}" y="${r1(y + 3.5)}" text-anchor="middle" font-size="9" font-weight="700" fill="#ffcc33" font-family="Arial">H</text>`);
    return base.replace(/<\/svg>$/u, `${out.join("")}</svg>`);
  }
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Segoe UI', Arial, sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="#0d0e12"/>`);
  // The streets above, faintly, to keep one's bearings.
  out.push(`<path d="${city.wards.filter((w) => w.urban).map((w) => ring(w.polygon)).join("")}" fill="none" stroke="#2a2d36" stroke-width="0.8"/>`);
  if (tiers.under.sewer) out.push(`<path d="${pathData(smooth(tiers.under.sewer, false, 2), false)}" fill="none" stroke="#1f4a5c" stroke-width="10" stroke-linecap="round"/>`);
  for (const tunnel of tiers.under.tunnels) {
    const d = pathData(tunnel.points, false);
    out.push(`<path d="${d}" fill="none" stroke="#4a4f5c" stroke-width="${r1(tunnel.width + 3)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#2b2f38" stroke-width="${r1(tunnel.width)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const hall of tiers.under.halls) out.push(`<path d="${ring(hall.polygon)}" fill="#22252d" stroke="#8a6d3b" stroke-width="2"/>`);
  for (const [x, y] of tiers.under.shafts) out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="5" fill="#0d0e12" stroke="#c9a227" stroke-width="1.5"/><path d="M${r1(x - 2.5)},${r1(y - 3)}V${r1(y + 3)}M${r1(x + 2.5)},${r1(y - 3)}V${r1(y + 3)}M${r1(x - 2.5)},${r1(y)}H${r1(x + 2.5)}" stroke="#c9a227" stroke-width="1"/>`);
  for (const hall of tiers.under.halls) out.push(`<text x="${r1(hall.center[0])}" y="${r1(hall.center[1] - 9)}" text-anchor="middle" font-size="14" fill="#c9a227" font-family="'Segoe UI Symbol', sans-serif">${HALL_GLYPH[hall.purpose]}</text><text x="${r1(hall.center[0])}" y="${r1(hall.center[1] + 9)}" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="1" fill="#d8c79a">${hall.id}. ${text(hall.name.toUpperCase())}</text>`);
  out.push(`<text x="20" y="34" font-size="20" letter-spacing="3" fill="#d8c79a" font-weight="600">${text(city.name.toUpperCase())}</text>`);
  out.push(`</svg>`);
  return out.join("");
}
