// Space maps. The galaxy: nebulae, territories of the powers (their stars' Voronoi cells, bordered where powers
// meet), hyperlanes, wormholes, glowing stars by class, names. A star system: the star, orbits, the habitable zone
// and the frost line, worlds drawn by kind with bands, rings and moons.
import type { Point } from "../geometry";
import { toCyrillic } from "../language";
import { SPECTRA, type Galaxy, type SpaceFeature } from "../space/galaxy";
import type { BodyKind, StarSystem } from "../space/system";
import type { Universe } from "../space/universe";
import { voronoi } from "../voronoi";

const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
const r1 = (value: number) => Math.round(value * 10) / 10;
const ring = (points: Point[]) => `M${points.map(([x, y]) => `${r1(x)},${r1(y)}`).join("L")}Z`;

const FEATURE_GLYPH: Record<SpaceFeature, string> = { ruins: "♜", station: "◇", anomaly: "✷", derelict: "⌬", "pirate-base": "☠", relay: "⌖", shipyard: "⚓", research: "⚗", quarantine: "☣", wormhole: "◎" };

export interface SpaceRenderOptions {
  script?: "latin" | "cyrillic";
  highlight?: number | null;
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
  }
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
  out.push(`<circle cx="${sx}" cy="${sy}" r="${spec.size * 40}" fill="url(#sun)"/>`);
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
    if (body.population) out.push(`<text x="${r1(x)}" y="${r1(y + size + 31)}" text-anchor="middle" font-size="9" fill="#36e0a0">◉ ${body.population.toLocaleString()} M</text>`);
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
    else if (g.kind === "dwarf") out.push(`<circle cx="${x}" cy="${y}" r="1.2" fill="#c8c8ff" opacity="0.8"/>${ring}`);
    else if (g.kind === "elliptical") out.push(`<ellipse cx="${x}" cy="${y}" rx="4" ry="2.6" fill="#ffd9a8" opacity="0.85" filter="url(#u-glow)" transform="rotate(${tilt} ${x} ${y})"/>${ring}`);
    else if (g.kind === "irregular") out.push(`<g fill="#bcd2ff" filter="url(#u-glow)"><circle cx="${x}" cy="${y}" r="1.6"/><circle cx="${r1(g.x + 2.4)}" cy="${r1(g.y - 1)}" r="1.1"/><circle cx="${r1(g.x - 1.5)}" cy="${r1(g.y + 2)}" r="0.9"/></g>${ring}`);
    else out.push(`<g transform="rotate(${tilt} ${x} ${y})" filter="url(#u-glow)"><ellipse cx="${x}" cy="${y}" rx="5" ry="1.8" fill="#cfe0ff" opacity="0.55"/><circle cx="${x}" cy="${y}" r="1.4" fill="#fff4dc"/>${g.kind === "ring" ? `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="2.4" fill="none" stroke="#9fd8ff" stroke-width="0.6"/>` : ""}</g>${ring}`);
    if (g.civilisations) out.push(`<circle cx="${r1(g.x + 4)}" cy="${r1(g.y - 4)}" r="1.4" fill="#36e0a0"/>`);
  }
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
