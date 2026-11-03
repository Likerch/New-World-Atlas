// Space maps. The galaxy: nebulae, regions of trouble, territories of the powers (their stars' Voronoi cells,
// bordered where powers meet), hyperlanes, wormholes, glowing stars by class, points of interest, names. A star
// system: the star, orbits, the habitable zone and the frost line, worlds drawn by kind with bands, rings and moons.
// The universe: voids, filaments, galaxies by kind and the strange things among them.
import type { Point } from "../geometry";
import { toCyrillic } from "../language";
import type { CustomKind } from "../space/custom";
import { SPECTRA, type Galaxy, type SpaceFeature, type Zone, type ZoneKind } from "../space/galaxy";
import type { BodyKind, StarSystem } from "../space/system";
import type { Anomaly, AnomalyKind, Universe } from "../space/universe";
import { voronoi } from "../voronoi";
import { present, type LegendEntry, type LegendSection, type Swatch } from "./legend";
import { anomalyPoint } from "../space/universe";

const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
const r1 = (value: number) => Math.round(value * 10) / 10;
const ring = (points: Point[]) => `M${points.map(([x, y]) => `${r1(x)},${r1(y)}`).join("L")}Z`;

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

/** A small deterministic scatter for a region's texture. */
const scatterIn = (zone: Zone, count: number) =>
  Array.from({ length: count }, (_, k) => {
    const a = (k * 2.399963 + zone.id) % (Math.PI * 2);
    const r = Math.sqrt(((k * 0.618034 + zone.id * 0.37) % 1)) * zone.r;
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
}

export function renderGalaxy(galaxy: Galaxy, options: SpaceRenderOptions = {}): string {
  const { width: W, height: H } = galaxy.params;
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Segoe UI', Arial, sans-serif">`);
  out.push(`<defs><radialGradient id="core" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff3d6" stop-opacity="0.55"/><stop offset="0.35" stop-color="#b98cff" stop-opacity="0.12"/><stop offset="1" stop-color="#05060d" stop-opacity="0"/></radialGradient><filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter><filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="#05060d"/><ellipse cx="${W / 2}" cy="${H / 2}" rx="${W * 0.36}" ry="${H * 0.36}" fill="url(#core)"/>`);
  for (const nebula of galaxy.nebulae) out.push(`<circle cx="${r1(nebula.x)}" cy="${r1(nebula.y)}" r="${r1(nebula.r)}" fill="${nebula.color}" opacity="0.16" filter="url(#soft)"/>`);
  const custom = new Map((galaxy.params.custom ?? []).map((kind) => [kind.id, kind]));
  const zones = galaxy.zones ?? [];
  for (const zone of zones) if (zone.kind !== "dark-nebula") drawZone(zone, custom, out);

  if (options.territories !== false) {
    const diagram = voronoi(galaxy.stars.map((star): Point => [star.x, star.y]), W, H);
    // A star's territory reaches only so far: clip cells to a disc round the star.
    const reach = Math.sqrt((W * H) / galaxy.stars.length) * 1.4;
    const cellOf = (id: number) => diagram.cells[id].map((p): Point => {
      const s: Point = [galaxy.stars[id].x, galaxy.stars[id].y];
      const d = Math.hypot(p[0] - s[0], p[1] - s[1]);
      return d > reach ? [s[0] + ((p[0] - s[0]) * reach) / d, s[1] + ((p[1] - s[1]) * reach) / d] : p;
    });
    for (const empire of galaxy.empires.slice(1)) {
      const d = galaxy.stars.filter((star) => star.empire === empire.id).map((star) => ring(cellOf(star.id))).join("");
      if (d) out.push(`<path d="${d}" fill="${empire.color}" fill-opacity="${options.highlight === empire.id ? 0.32 : 0.16}" stroke="${empire.color}" stroke-opacity="0.12" stroke-width="0.6"/>`);
    }
  }
  if (options.lanes !== false) {
    const lanes = galaxy.lanes.map(([a, b]) => `M${r1(galaxy.stars[a].x)},${r1(galaxy.stars[a].y)}L${r1(galaxy.stars[b].x)},${r1(galaxy.stars[b].y)}`).join("");
    out.push(`<path d="${lanes}" stroke="#6f8cc7" stroke-opacity="0.35" stroke-width="0.7"/>`);
    for (const [a, b] of galaxy.wormholes) {
      const s = galaxy.stars[a],
        e = galaxy.stars[b];
      const mx = (s.x + e.x) / 2 + (e.y - s.y) * 0.25,
        my = (s.y + e.y) / 2 - (e.x - s.x) * 0.25;
      out.push(`<path d="M${r1(s.x)},${r1(s.y)}Q${r1(mx)},${r1(my)} ${r1(e.x)},${r1(e.y)}" fill="none" stroke="#c77dff" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.8"/>`);
    }
  }
  for (const star of galaxy.stars) {
    const spec = SPECTRA[star.spectral];
    const r = spec.size * (star.capital ? 1.6 : 1);
    if (star.spectral === "BH") out.push(`<circle cx="${r1(star.x)}" cy="${r1(star.y)}" r="${r1(r + 1.2)}" fill="#000" stroke="#ffb35c" stroke-width="0.9" filter="url(#glow)"/>`);
    else out.push(`<circle cx="${r1(star.x)}" cy="${r1(star.y)}" r="${r1(r)}" fill="${spec.color}" filter="url(#glow)"/>`);
    if (star.capital) out.push(`<circle cx="${r1(star.x)}" cy="${r1(star.y)}" r="${r1(r + 3)}" fill="none" stroke="${galaxy.empires[star.empire].color}" stroke-width="1.2"/>`);
    if (star.feature) out.push(`<text x="${r1(star.x + 4)}" y="${r1(star.y - 4)}" font-size="8" fill="#ffd27a" font-family="'Segoe UI Symbol', sans-serif">${FEATURE_GLYPH[star.feature]}</text>`);
    const own = star.custom ? custom.get(star.custom) : undefined;
    if (own) out.push(`<text x="${r1(star.x - 4)}" y="${r1(star.y - 4)}" text-anchor="end" font-size="9" fill="${own.color}" font-family="'Segoe UI Symbol', 'Segoe UI Emoji', sans-serif">${esc(own.glyph)}</text>`);
  }
  const chosen = options.highlightStar !== null && options.highlightStar !== undefined ? galaxy.stars[options.highlightStar] : null;
  if (chosen) out.push(`<circle cx="${r1(chosen.x)}" cy="${r1(chosen.y)}" r="7" fill="none" stroke="#ffd34d" stroke-width="1.5"/>`);
  // Dark nebulae swallow the starlight behind them.
  for (const zone of zones) if (zone.kind === "dark-nebula") drawZone(zone, custom, out);
  const picked = zones.find((zone) => zone.id === options.highlightZone);
  if (picked) out.push(`<ellipse cx="${r1(picked.x)}" cy="${r1(picked.y)}" rx="${r1(picked.r + 4)}" ry="${r1(picked.r * picked.squash + 4)}" transform="rotate(${r1((picked.angle * 180) / Math.PI)} ${r1(picked.x)} ${r1(picked.y)})" fill="none" stroke="#ffd34d" stroke-width="1.5"/>`);
  if (options.labels !== false) {
    out.push(`<g font-size="7" fill="#cfd9ff" opacity="0.85">`);
    for (const star of galaxy.stars) if (star.capital || star.feature || (star.settled && star.id % 3 === 0)) out.push(`<text x="${r1(star.x + 4)}" y="${r1(star.y + 9)}">${text(star.name)}</text>`);
    out.push(`</g><g text-anchor="middle" font-size="16" letter-spacing="4" font-weight="600">`);
    for (const empire of galaxy.empires.slice(1)) {
      const own = galaxy.stars.filter((star) => star.empire === empire.id);
      if (own.length < 3) continue;
      const x = own.reduce((s, star) => s + star.x, 0) / own.length;
      const y = own.reduce((s, star) => s + star.y, 0) / own.length;
      out.push(`<text x="${r1(x)}" y="${r1(y)}" fill="${empire.color}" opacity="0.8">${text(empire.name.toUpperCase())}</text>`);
    }
    out.push(`</g>`);
    for (const nebula of galaxy.nebulae) out.push(`<text x="${r1(nebula.x)}" y="${r1(nebula.y)}" text-anchor="middle" font-size="9" font-style="italic" fill="${nebula.color}" opacity="0.7">${text(nebula.name)}</text>`);
    for (const zone of zones) out.push(`<text x="${r1(zone.x)}" y="${r1(zone.y + zone.r * zone.squash + 10)}" text-anchor="middle" font-size="8" font-style="italic" fill="${zone.kind === "custom" ? custom.get(zone.custom ?? "")?.color ?? "#ffd27a" : ZONE_STYLE[zone.kind].edge}" opacity="0.8">${text(zone.name)}</text>`);
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
const group = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/gu, "\u2009");

/** A system map's size, and where a world is drawn on it: shared by the drawing and the clicks. */
export const SYSTEM_SIZE = { width: 1600, height: 1000 };
export function bodyPoint(system: StarSystem, body: StarSystem["bodies"][number]): { x: number; y: number; r: number; centre: [number, number] } {
  const maxOrbit = Math.max(system.frost * 1.2, ...system.bodies.map((b) => b.orbit), 1);
  const r = 90 + Math.sqrt(body.orbit / maxOrbit) * (SYSTEM_SIZE.width - 260);
  const centre: [number, number] = [110, SYSTEM_SIZE.height / 2];
  return { x: centre[0] + Math.cos(body.angle) * r, y: centre[1] + Math.sin(body.angle) * r, r, centre };
}

export function renderSystem(system: StarSystem, options: SpaceRenderOptions = {}): string {
  const W = 1600,
    H = 1000;
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const sx = 110,
    sy = H / 2;
  const maxOrbit = Math.max(system.frost * 1.2, ...system.bodies.map((body) => body.orbit), 1);
  const rOf = (au: number) => 90 + Math.sqrt(au / maxOrbit) * (W - 260);
  const spec = SPECTRA[system.spectral];
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Segoe UI', Arial, sans-serif">`);
  out.push(`<defs><radialGradient id="sun"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="${spec.color}"/><stop offset="1" stop-color="${spec.color}" stop-opacity="0"/></radialGradient>`);
  for (const [kind, [light, dark]] of Object.entries(WORLD_COLORS)) out.push(`<radialGradient id="w-${kind}" cx="35%" cy="35%" r="70%"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`);
  out.push(`</defs><rect width="${W}" height="${H}" fill="#04050b"/>`);
  // Habitable zone and frost line.
  const [zi, zo] = system.zone;
  out.push(`<circle cx="${sx}" cy="${sy}" r="${r1((rOf(zi) + rOf(zo)) / 2)}" fill="none" stroke="#36e0a0" stroke-opacity="0.12" stroke-width="${r1(Math.max(4, rOf(zo) - rOf(zi)))}"/>`);
  out.push(`<circle cx="${sx}" cy="${sy}" r="${r1(rOf(system.frost))}" fill="none" stroke="#9cc9e6" stroke-opacity="0.5" stroke-dasharray="6 6"/>`);
  // The star: a black hole is a dark disc in its glowing ring of infalling matter, not a light.
  if (system.spectral === "BH") out.push(`<ellipse cx="${sx}" cy="${sy}" rx="${spec.size * 34}" ry="${spec.size * 9}" fill="none" stroke="#ffb35c" stroke-width="5" opacity="0.75" transform="rotate(-14 ${sx} ${sy})"/><circle cx="${sx}" cy="${sy}" r="${spec.size * 14}" fill="#000" stroke="#ffb35c" stroke-width="2"/>`);
  else out.push(`<circle cx="${sx}" cy="${sy}" r="${spec.size * (system.spectral === "WD" || system.spectral === "NS" ? 20 : 40)}" fill="url(#sun)"/>`);
  if (system.companion) out.push(`<circle cx="${sx - 40}" cy="${sy + 60}" r="14" fill="${SPECTRA[system.companion].color}"/>`);
  for (const body of system.bodies) {
    const r = rOf(body.orbit);
    const x = sx + Math.cos(body.angle) * r;
    const y = sy + Math.sin(body.angle) * r;
    const highlighted = options.highlight === body.id;
    if (body.kind === "belt") {
      out.push(`<circle cx="${sx}" cy="${sy}" r="${r1(r)}" fill="none" stroke="#a69a86" stroke-opacity="0.55" stroke-width="7" stroke-dasharray="1.5 3.5"/>`);
      out.push(`<text x="${r1(x)}" y="${r1(y + 22)}" text-anchor="middle" font-size="11" fill="#a69a86">${text(body.name)}</text>`);
      continue;
    }
    out.push(`<circle cx="${sx}" cy="${sy}" r="${r1(r)}" fill="none" stroke="${highlighted ? "#ffd34d" : "#3a4a6a"}" stroke-width="${highlighted ? 1.6 : 0.8}"/>`);
    const size = 5 + Math.sqrt(body.radius) * 5;
    if (body.rings) out.push(`<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(size * 1.9)}" ry="${r1(size * 0.5)}" fill="none" stroke="#d9c9a4" stroke-width="2" opacity="0.8" transform="rotate(-18 ${r1(x)} ${r1(y)})"/>`);
    out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(size)}" fill="url(#w-${body.kind})" stroke="${highlighted ? "#ffd34d" : "none"}" stroke-width="2"/>`);
    if (body.kind === "gas-giant" || body.kind === "ice-giant") for (let k = -2; k <= 2; k++) out.push(`<path d="M${r1(x - size * 0.9)},${r1(y + k * size * 0.3)}H${r1(x + size * 0.9)}" stroke="#000" stroke-opacity="0.12" stroke-width="${r1(size * 0.12)}"/>`);
    if (body.habitable) out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(size + 3)}" fill="none" stroke="#36e0a0" stroke-width="1.2" stroke-dasharray="3 2"/>`);
    body.moons.forEach((moon, k) => {
      const angle = (k / Math.max(1, body.moons.length)) * Math.PI * 2;
      out.push(`<circle cx="${r1(x + Math.cos(angle) * (size + 9))}" cy="${r1(y + Math.sin(angle) * (size + 9))}" r="${r1(1.5 + moon.radius * 4)}" fill="url(#w-${moon.kind})"/>`);
    });
    if (body.station) out.push(`<rect x="${r1(x + size + 4)}" y="${r1(y - size - 8)}" width="6" height="6" fill="none" stroke="#ffd27a" stroke-width="1.2" transform="rotate(45 ${r1(x + size + 7)} ${r1(y - size - 5)})"/>`);
    out.push(`<text x="${r1(x)}" y="${r1(y + size + 18)}" text-anchor="middle" font-size="12" fill="#dfe7ff">${text(body.name)}</text>`);
    if (body.population) out.push(`<text x="${r1(x)}" y="${r1(y + size + 31)}" text-anchor="middle" font-size="9" fill="#36e0a0">◉ ${group(body.population)} M</text>`);
  }
  out.push(`<text x="20" y="34" font-size="20" letter-spacing="3" fill="#e6ecff" font-weight="600">${text(system.name.toUpperCase())}</text><text x="20" y="54" font-size="12" fill="#9fb0d8">${system.spectral}${system.companion ? ` + ${system.companion}` : ""}</text>`);
  out.push(`</svg>`);
  return out.join("");
}

/** The cosmic web: voids, filaments, galaxies by kind, superclusters. */
export function renderUniverse(universe: Universe, options: SpaceRenderOptions = {}): string {
  const { width: W, height: H } = universe.params;
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Segoe UI', Arial, sans-serif">`);
  out.push(`<defs><filter id="u-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="u-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="#020309"/>`);
  for (const v of universe.voids) out.push(`<circle cx="${r1(v.x)}" cy="${r1(v.y)}" r="${r1(v.r)}" fill="#000000" stroke="#1b1f3a" stroke-width="1" stroke-dasharray="3 6"/>`);
  for (const g of universe.galaxies) out.push(`<circle cx="${r1(g.x)}" cy="${r1(g.y)}" r="16" fill="${universe.clusters[g.cluster]?.color ?? "#5566aa"}" opacity="0.06" filter="url(#u-soft)"/>`);
  out.push(`<path d="${universe.filaments.map(([a, b]) => `M${r1(universe.galaxies[a].x)},${r1(universe.galaxies[a].y)}L${r1(universe.galaxies[b].x)},${r1(universe.galaxies[b].y)}`).join("")}" stroke="#6c6fd8" stroke-opacity="0.28" stroke-width="0.8"/>`);
  for (const g of universe.galaxies) {
    const x = r1(g.x),
      y = r1(g.y);
    const tilt = (g.id * 47) % 180;
    const ring = options.highlight === g.id ? `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="#ffd34d" stroke-width="1.5"/>` : "";
    if (g.kind === "quasar") out.push(`<g filter="url(#u-glow)"><circle cx="${x}" cy="${y}" r="2.4" fill="#ffffff"/><path d="M${x},${r1(g.y - 9)}V${r1(g.y + 9)}" stroke="#9fd8ff" stroke-width="0.8" transform="rotate(${tilt} ${x} ${y})"/></g>${ring}`);
    else if (g.kind === "lenticular") out.push(`<g transform="rotate(${tilt} ${x} ${y})" filter="url(#u-glow)"><ellipse cx="${x}" cy="${y}" rx="5" ry="1" fill="#ffe7c2" opacity="0.8"/><circle cx="${x}" cy="${y}" r="1.6" fill="#fff4dc"/></g>${ring}`);
    else if (g.kind === "starburst") out.push(`<g filter="url(#u-glow)"><circle cx="${x}" cy="${y}" r="2" fill="#bfe8ff"/><path d="M${r1(g.x - 4)},${y}H${r1(g.x + 4)}M${x},${r1(g.y - 4)}V${r1(g.y + 4)}" stroke="#ff9fd0" stroke-width="0.6"/></g>${ring}`);
    else if (g.kind === "colliding") out.push(`<g transform="rotate(${tilt} ${x} ${y})" filter="url(#u-glow)"><ellipse cx="${r1(g.x - 2.2)}" cy="${y}" rx="3.6" ry="1.5" fill="#cfe0ff" opacity="0.6"/><ellipse cx="${r1(g.x + 2.2)}" cy="${r1(g.y + 0.8)}" rx="3.2" ry="1.4" fill="#ffd9a8" opacity="0.6" transform="rotate(40 ${r1(g.x + 2.2)} ${r1(g.y + 0.8)})"/><path d="M${r1(g.x + 4)},${r1(g.y + 1)}Q${r1(g.x + 9)},${r1(g.y + 5)} ${r1(g.x + 12)},${r1(g.y + 2)}" fill="none" stroke="#cfe0ff" stroke-width="0.5" opacity="0.6"/></g>${ring}`);
    else if (g.kind === "ghost") out.push(`<circle cx="${x}" cy="${y}" r="3.2" fill="none" stroke="#8a8fb8" stroke-width="0.5" stroke-dasharray="1 1.4" opacity="0.7"/>${ring}`);
    else if (g.kind === "dwarf") out.push(`<circle cx="${x}" cy="${y}" r="1.2" fill="#c8c8ff" opacity="0.8"/>${ring}`);
    else if (g.kind === "elliptical") out.push(`<ellipse cx="${x}" cy="${y}" rx="4" ry="2.6" fill="#ffd9a8" opacity="0.85" filter="url(#u-glow)" transform="rotate(${tilt} ${x} ${y})"/>${ring}`);
    else if (g.kind === "irregular") out.push(`<g fill="#bcd2ff" filter="url(#u-glow)"><circle cx="${x}" cy="${y}" r="1.6"/><circle cx="${r1(g.x + 2.4)}" cy="${r1(g.y - 1)}" r="1.1"/><circle cx="${r1(g.x - 1.5)}" cy="${r1(g.y + 2)}" r="0.9"/></g>${ring}`);
    else out.push(`<g transform="rotate(${tilt} ${x} ${y})" filter="url(#u-glow)"><ellipse cx="${x}" cy="${y}" rx="5" ry="1.8" fill="#cfe0ff" opacity="0.55"/><circle cx="${x}" cy="${y}" r="1.4" fill="#fff4dc"/>${g.kind === "ring" ? `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="2.4" fill="none" stroke="#9fd8ff" stroke-width="0.6"/>` : ""}</g>${ring}`);
    if (g.civilisations) out.push(`<circle cx="${r1(g.x + 4)}" cy="${r1(g.y - 4)}" r="1.4" fill="#36e0a0"/>`);
  }
  const custom = new Map((universe.params.custom ?? []).map((kind) => [kind.id, kind]));
  for (const anomaly of universe.anomalies ?? []) out.push(drawAnomaly(anomaly, custom, options.highlightAnomaly === anomaly.id));
  out.push(`<g text-anchor="middle" font-size="8" font-style="italic" fill="#c9b8ff" opacity="0.75">${(universe.anomalies ?? []).map((a) => `<text x="${r1(anomalyPoint(a)[0])}" y="${r1(anomalyPoint(a)[1] + (a.kind === "cosmic-string" ? 0 : a.kind === "bubble-wall" ? -8 : Math.max(a.size, 10) + 9))}">${text(a.name)}</text>`).join("")}</g>`);
  out.push(`<g text-anchor="middle" font-size="9" fill="#5a5f8a" font-style="italic">${universe.voids.map((v) => `<text x="${r1(v.x)}" y="${r1(v.y)}">${text(v.name)}</text>`).join("")}</g>`);
  out.push(`<g text-anchor="middle" font-size="15" letter-spacing="4" font-weight="600">`);
  universe.clusters.forEach((cluster) => {
    const members = universe.galaxies.filter((g) => g.cluster === cluster.id);
    if (!members.length) return;
    const x = members.reduce((s, g) => s + g.x, 0) / members.length;
    const y = members.reduce((s, g) => s + g.y, 0) / members.length;
    out.push(`<text x="${r1(x)}" y="${r1(y)}" fill="${cluster.color}" opacity="0.75">${text(cluster.name.toUpperCase())}</text>`);
  });
  out.push(`</g><text x="20" y="34" font-size="20" letter-spacing="3" fill="#e6ecff" font-weight="600">${text(universe.name.toUpperCase())}</text></svg>`);
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
function customEntries(kinds: CustomKind[], used: Set<string>): LegendEntry[] {
  return kinds.filter((kind) => used.has(kind.id)).map((kind) => ({ label: kind.name || kind.glyph, swatch: kind.area ? { svg: `<ellipse cx="12" cy="8" rx="9" ry="6" fill="${kind.color}" fill-opacity="0.15" stroke="${kind.color}" stroke-dasharray="3 2"/><text x="12" y="11.5" text-anchor="middle" font-size="9" fill="${kind.color}">${esc(kind.glyph)}</text>` } : { glyph: kind.glyph, color: kind.color } }));
}

export function galaxyLegend(galaxy: Galaxy): LegendSection[] {
  const stars: LegendEntry[] = present(galaxy.stars.map((s) => s.spectral)).map((spectral) => ({
    key: `spectral.${spectral}`,
    swatch: spectral === "BH" ? { svg: `<circle cx="12" cy="8" r="4" fill="#000" stroke="#ffb35c" stroke-width="1.2"/>` } : { fill: SPECTRA[spectral].color, round: true, stroke: "none" },
  }));
  const owner = galaxy.empires[1];
  const space: LegendEntry[] = [
    ...(owner ? [{ key: "legend.territory", swatch: { fill: owner.color, opacity: 0.35 } }, { key: "legend.capital-star", swatch: { svg: `<circle cx="12" cy="8" r="2.4" fill="#fff1c9"/><circle cx="12" cy="8" r="5.5" fill="none" stroke="${owner.color}" stroke-width="1.2"/>` } }] : []),
    { key: "legend.hyperlane", swatch: { line: "#6f8cc7", width: 1.2, opacity: 0.7 } },
    ...(galaxy.wormholes.length ? [{ key: "feature2.wormhole", swatch: { line: "#c77dff", width: 1.6, dash: "5 4" } }] : []),
    ...(galaxy.nebulae.length ? [{ key: "legend.nebula", swatch: { fill: galaxy.nebulae[0].color, opacity: 0.35, round: true, stroke: "none" } }] : []),
  ];
  const wonders: LegendEntry[] = present(galaxy.stars.flatMap((s) => (s.feature ? [s.feature] : []))).map((feature) => ({ key: `feature2.${feature}`, swatch: { glyph: FEATURE_GLYPH[feature], color: "#ffd27a" } }));
  const zones: LegendEntry[] = present((galaxy.zones ?? []).flatMap((z) => (z.kind === "custom" ? [] : [z.kind]))).map((kind) => ({ key: `zone.${kind}`, swatch: { fill: ZONE_STYLE[kind].fill, stroke: ZONE_STYLE[kind].edge, opacity: kind === "dead-zone" || kind === "dark-nebula" ? 0.7 : 0.35, round: true } }));
  const used = new Set([...galaxy.stars.flatMap((s) => (s.custom ? [s.custom] : [])), ...(galaxy.zones ?? []).flatMap((z) => (z.custom ? [z.custom] : []))]);
  return [
    { key: "legend.stars", entries: stars },
    { key: "legend.space", entries: space },
    { key: "legend.wonders", entries: wonders },
    { key: "legend.zones", entries: zones },
    { key: "legend.custom", entries: customEntries(galaxy.params.custom ?? [], used) },
  ].filter((section) => section.entries.length);
}

export function systemLegend(system: StarSystem): LegendSection[] {
  const suns: LegendEntry[] = [system.spectral, ...(system.companion ? [system.companion] : [])].map((spectral, k) => ({
    key: k ? "legend.companion" : `spectral.${spectral}`,
    vars: k ? { kind: spectral } : undefined,
    swatch: spectral === "BH" ? { svg: `<circle cx="12" cy="8" r="5" fill="#000" stroke="#ffb35c" stroke-width="1.6"/>` } : { fill: SPECTRA[spectral].color, round: true },
  }));
  const worlds: LegendEntry[] = present(system.bodies.map((b) => b.kind)).map((kind) => ({
    key: `body.${kind}`,
    swatch: kind === "belt" ? { line: "#a69a86", width: 5, dash: "1.5 3.5" } : { svg: `<circle cx="12" cy="8" r="6" fill="${WORLD_COLORS[kind][0]}" stroke="${WORLD_COLORS[kind][1]}" stroke-width="1.6"/>` },
  }));
  const orbits: LegendEntry[] = [
    { key: "space.zone", swatch: { line: "#36e0a0", width: 6, opacity: 0.3 } },
    { key: "legend.frost-line", swatch: { line: "#9cc9e6", width: 1.2, dash: "4 3" } },
    ...(system.bodies.some((b) => b.habitable) ? [{ key: "legend.habitable", swatch: { svg: `<circle cx="12" cy="8" r="6" fill="none" stroke="#36e0a0" stroke-width="1.2" stroke-dasharray="3 2"/>` } }] : []),
    ...(system.bodies.some((b) => b.rings) ? [{ key: "legend.rings", swatch: { svg: `<ellipse cx="12" cy="8" rx="10" ry="3" fill="none" stroke="#d9c9a4" stroke-width="1.4"/><circle cx="12" cy="8" r="3.5" fill="#e0b88a"/>` } }] : []),
    ...(system.bodies.some((b) => b.station) ? [{ key: "feature2.station", swatch: { svg: `<rect x="9" y="5" width="6" height="6" fill="none" stroke="#ffd27a" stroke-width="1.2" transform="rotate(45 12 8)"/>` } }] : []),
    ...(system.bodies.some((b) => b.population) ? [{ key: "legend.population", swatch: { glyph: "◉", color: "#36e0a0" } }] : []),
  ];
  return [
    { key: "legend.stars", entries: suns },
    { key: "legend.worlds", entries: worlds },
    { key: "legend.orbits", entries: orbits },
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

export function universeLegend(universe: Universe): LegendSection[] {
  const galaxies: LegendEntry[] = present(universe.galaxies.map((g) => g.kind)).map((kind) => ({ key: `gkind.${kind}`, swatch: GALAXY_LOOK[kind] }));
  const web: LegendEntry[] = [
    { key: "legend.filament", swatch: { line: "#6c6fd8", width: 1.2, opacity: 0.6 } },
    { key: "legend.void", swatch: { svg: `<circle cx="12" cy="8" r="6.5" fill="#000" stroke="#1b1f3a" stroke-width="1" stroke-dasharray="2 3"/>` } },
    ...(universe.galaxies.some((g) => g.civilisations) ? [{ key: "legend.civilisation", swatch: { fill: "#36e0a0", round: true, stroke: "none" } }] : []),
  ];
  const strange: LegendEntry[] = present((universe.anomalies ?? []).flatMap((a) => (a.kind === "custom" ? [] : [a.kind]))).map((kind) => ({ key: `anomaly.${kind}`, swatch: { glyph: ANOMALY_GLYPH[kind], color: ANOMALY_COLOR[kind] } }));
  const used = new Set((universe.anomalies ?? []).flatMap((a) => (a.custom ? [a.custom] : [])));
  return [
    { key: "legend.galaxies", entries: galaxies },
    { key: "legend.web", entries: web },
    { key: "legend.strange", entries: strange },
    { key: "legend.custom", entries: customEntries(universe.params.custom ?? [], used) },
  ].filter((section) => section.entries.length);
}
