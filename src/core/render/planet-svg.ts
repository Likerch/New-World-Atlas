// The planet as an SVG string: shaded seas, land by biome or height, relief and forest icons, rivers that widen
// downstream, borders, roads, towns, labels that avoid each other, and a frame with a compass and a scale.
import { shade } from "../color";
import { borders, outline, pathData, smooth, type Point } from "../geometry";
import { toCyrillic } from "../language";
import { BIOMES } from "../planet/biomes";
import { oceanCurrents, windAt } from "../planet/currents";
import type { MarkerKind, Planet } from "../planet/model";
import { defaultLayers, THEME, type LayerId, type Theme, type ThemeId } from "./themes";

export interface RenderOptions {
  theme?: ThemeId;
  layers?: Partial<Record<LayerId, boolean>>;
  script?: "latin" | "cyrillic";
  /** A region drawn with an emphasis outline. */
  highlight?: { kind: "state" | "province" | "culture"; id: number } | null;
}

const SEA = 20;
const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const r1 = (value: number) => Math.round(value * 10) / 10;

function rings(loops: Point[][], iterations: number): string {
  let d = "";
  for (const loop of loops) {
    const first = loop[0];
    const last = loop[loop.length - 1];
    const closed = loop.length > 2 && first[0] === last[0] && first[1] === last[1];
    d += pathData(smooth(loop, closed, iterations), closed);
  }
  return d;
}

/** A stable pseudo-random number in [0, 1) for a cell and a purpose. */
function noiseAt(cell: number, salt: number): number {
  let h = Math.imul(cell ^ (salt * 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function symbols(theme: Theme): string {
  const ink = theme.ink;
  const fill = theme.iconFill;
  const tree = theme.tree;
  return [
    `<symbol id="i-mountain" viewBox="0 0 20 12" overflow="visible"><path d="M1,12L8,2.2L10,4.6L12.2,1.4L19,12Z" fill="${fill}" stroke="${ink}" stroke-width="0.8" stroke-linejoin="round"/><path d="M12.2,1.4L14.2,12H19Z" fill="${ink}" opacity="0.28"/><path d="M8,2.2L9.2,6.5M12.2,1.4L12.9,5.2" stroke="${ink}" stroke-width="0.45" fill="none"/></symbol>`,
    `<symbol id="i-hill" viewBox="0 0 14 6" overflow="visible"><path d="M1,6Q7,-1.6 13,6" fill="${fill}" stroke="${ink}" stroke-width="0.8"/><path d="M7.4,1.8Q10.4,2.6 11.6,6" fill="none" stroke="${ink}" stroke-width="0.4" opacity="0.6"/></symbol>`,
    `<symbol id="i-deciduous" viewBox="0 0 8 10" overflow="visible"><path d="M4,10V6.4" stroke="${ink}" stroke-width="0.8"/><circle cx="4" cy="4.2" r="3.3" fill="${tree}" stroke="${ink}" stroke-width="0.6"/></symbol>`,
    `<symbol id="i-jungle" viewBox="0 0 10 10" overflow="visible"><path d="M5,10V6.6" stroke="${ink}" stroke-width="0.8"/><circle cx="3.6" cy="4.8" r="2.9" fill="${shade(tree, -0.2)}" stroke="${ink}" stroke-width="0.5"/><circle cx="6.4" cy="4" r="3.2" fill="${shade(tree, -0.12)}" stroke="${ink}" stroke-width="0.5"/></symbol>`,
    `<symbol id="i-conifer" viewBox="0 0 8 11" overflow="visible"><path d="M4,0.5L7.4,8H0.6Z" fill="${shade(tree, -0.15)}" stroke="${ink}" stroke-width="0.6" stroke-linejoin="round"/><path d="M4,8V10.6" stroke="${ink}" stroke-width="0.8"/></symbol>`,
    `<symbol id="i-palm" viewBox="0 0 10 10" overflow="visible"><path d="M5,10Q4.4,6 5.5,3" stroke="${ink}" stroke-width="0.8" fill="none"/><path d="M5.5,3Q2,2 0.6,4.2M5.5,3Q8.6,1.6 9.6,4.2M5.5,3Q4,0 2,0.6M5.5,3Q7,0 9,1" stroke="${ink}" stroke-width="0.7" fill="none"/></symbol>`,
    `<symbol id="i-grass" viewBox="0 0 8 4" overflow="visible"><path d="M1,4L2,1.2M3.6,4L4,0.6M6,4L5.6,1.4" stroke="${ink}" stroke-width="0.55" opacity="0.7"/></symbol>`,
    `<symbol id="i-dune" viewBox="0 0 12 4" overflow="visible"><path d="M0.5,4Q4,0 7,2.6Q9,1.2 11.5,4" fill="none" stroke="${ink}" stroke-width="0.65" opacity="0.75"/></symbol>`,
    `<symbol id="i-swamp" viewBox="0 0 10 5" overflow="visible"><path d="M1,5L1.5,1.6M3,5V0.6M5,5L4.6,2M2,5H8M7,5L7.5,2M8.6,5V1" stroke="${ink}" stroke-width="0.5"/></symbol>`,
  ].join("");
}

const MARKER_GLYPH: Record<MarkerKind, string> = {
  volcano: "▲",
  "hot-spring": "♨",
  mine: "⚒",
  bridge: "≡",
  lighthouse: "☼",
  ruins: "♜",
  battlefield: "⚔",
  monastery: "✟",
  cave: "◒",
  "sacred-grove": "♣",
  shipwreck: "⚓",
  brigands: "☠",
  inn: "⌂",
  watchtower: "♖",
  "giant-tree": "♠",
  portal: "◎",
};

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function renderPlanet(planet: Planet, options: RenderOptions = {}): string {
  const themeId = options.theme ?? "atlas";
  const theme = THEME[themeId];
  const layers = { ...defaultLayers(themeId), ...options.layers };
  const { mesh, water, coast, params } = planet;
  const W = params.width;
  const H = params.height;
  const s = mesh.spacing;
  const text = (value: string) => esc(options.script === "cyrillic" ? toCyrillic(value) : value);
  const out: string[] = [];
  const land = (cell: number) => !water[cell];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${esc(theme.font)}">`);
  const landPath = rings(outline(mesh, land), 2);
  out.push(`<defs><clipPath id="map-clip"><rect width="${W}" height="${H}"/></clipPath><clipPath id="land-clip"><path d="${landPath}"/></clipPath>${symbols(theme)}`);
  if (theme.paper) out.push(`<filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.17  0 0 0 0.16 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>`);
  out.push(`</defs><g clip-path="url(#map-clip)">`);

  // Seas: darker away from the coast.
  out.push(`<rect width="${W}" height="${H}" fill="${theme.ocean[0]}"/>`);
  if (layers.depth) {
    const levels = [9, 6, 3, 1];
    levels.forEach((level, k) => {
      const shape = rings(outline(mesh, (cell) => land(cell) || coast[cell] >= -level), 3);
      out.push(`<path d="${shape}" fill="${theme.ocean[k + 1]}" fill-rule="evenodd"/>`);
    });
  }

  // A sea chart: depth lines, soundings, rhumb lines from compass roses, shoals.
  if (themeId === "nautical") {
    for (const level of [6, 12, 17]) {
      const isobath = rings(outline(mesh, (cell) => land(cell) || planet.height[cell] >= level), 3);
      out.push(`<path d="${isobath}" fill="none" stroke="${theme.sea}" stroke-width="0.6" stroke-dasharray="${level === 17 ? "2 2" : "6 3"}" opacity="0.6" fill-rule="evenodd"/>`);
    }
    const roses = Array.from({ length: mesh.cells }, (_, cell) => cell)
      .filter((cell) => water[cell])
      .sort((a, b) => coast[a] - coast[b])
      .filter((cell, k, list) => list.slice(0, k).every((other) => Math.hypot(mesh.x[other] - mesh.x[cell], mesh.y[other] - mesh.y[cell]) > W / 3))
      .slice(0, 2);
    const rays: string[] = [];
    for (const cell of roses) for (let k = 0; k < 16; k++) rays.push(`M${r1(mesh.x[cell])},${r1(mesh.y[cell])}l${r1(Math.cos((k * Math.PI) / 8) * W * 1.5)},${r1(Math.sin((k * Math.PI) / 8) * W * 1.5)}`);
    out.push(`<path d="${rays.join("")}" stroke="${theme.sea}" stroke-width="0.4" opacity="0.35"/>`);
    const soundings: string[] = [];
    const step = s * 3.2;
    for (let y = step / 2; y < H; y += step) {
      for (let x = step / 2; x < W; x += step) {
        const cell = mesh.find(x + ((y / step) % 2) * step * 0.5, y);
        if (!water[cell]) continue;
        const depth = Math.round(((SEA - Math.min(SEA, planet.height[cell])) / SEA) * 600) * 10;
        soundings.push(`<text x="${r1(mesh.x[cell])}" y="${r1(mesh.y[cell])}">${depth}</text>`);
      }
    }
    out.push(`<g font-size="5.5" fill="${theme.sea}" opacity="0.75" text-anchor="middle" font-style="italic">${soundings.join("")}</g>`);
    const shoals = Array.from({ length: mesh.cells }, (_, cell) => cell).filter((cell) => water[cell] && coast[cell] === -1 && planet.height[cell] > SEA - 2 && noiseAt(cell, 7) < 0.35);
    out.push(`<g font-size="7" fill="${theme.border}" text-anchor="middle">${shoals.map((cell) => `<text x="${r1(mesh.x[cell])}" y="${r1(mesh.y[cell] + 2)}">✱</text>`).join("")}</g>`);
  }

  // Land, then what covers it.
  out.push(`<path d="${landPath}" fill="${theme.land}" fill-rule="evenodd"/>`);
  out.push(`<g clip-path="url(#land-clip)">`);
  if (layers.biomes && theme.biomes) {
    for (const biome of BIOMES.slice(1)) {
      const shape = rings(outline(mesh, (cell) => land(cell) && planet.biome[cell] === biome.id), 1);
      if (shape) out.push(`<path d="${shape}" fill="${theme.biomes[biome.id]}" stroke="${theme.biomes[biome.id]}" stroke-width="0.6" fill-rule="evenodd"/>`);
    }
  }
  if (layers.heights && theme.heights) {
    theme.heights.forEach((color, k) => {
      const level = 20 + k * 8;
      const shape = rings(outline(mesh, (cell) => land(cell) && planet.height[cell] >= level), 2);
      if (shape) out.push(`<path d="${shape}" fill="${color}" fill-rule="evenodd"/>`);
    });
  }
  if (layers.states && theme.stateFill > 0) {
    for (const state of planet.states.slice(1)) {
      const shape = rings(outline(mesh, (cell) => land(cell) && planet.state[cell] === state.id), 1);
      if (shape) out.push(`<path d="${shape}" fill="${state.color}" fill-opacity="${theme.stateFill}" fill-rule="evenodd"/>`);
    }
  }
  out.push(`</g>`);

  // Lakes and the coastline over the land fills.
  const lakePath = rings(outline(mesh, (cell) => water[cell] === 1 && planet.features[planet.feature[cell]].kind === "lake"), 2);
  if (lakePath) out.push(`<path d="${lakePath}" fill="${theme.lake}" stroke="${theme.coast}" stroke-width="${theme.coastWidth * 0.7}" fill-rule="evenodd"/>`);
  out.push(`<path d="${landPath}" fill="none" stroke="${theme.coast}" stroke-width="${theme.coastWidth}" stroke-linejoin="round"/>`);

  // Relief and vegetation icons, back to front.
  if (layers.icons) {
    const icons: [number, string, number, number, number, number][] = [];
    for (let cell = 0; cell < mesh.cells; cell++) {
      if (!land(cell) || planet.burg[cell] || coast[cell] === 1) continue;
      const h = planet.height[cell];
      const jx = (noiseAt(cell, 1) - 0.5) * s * 0.5;
      const jy = (noiseAt(cell, 2) - 0.5) * s * 0.5;
      const x = mesh.x[cell] + jx;
      const y = mesh.y[cell] + jy;
      if (h > 62) {
        const w = s * (1.25 + (h - 62) / 30);
        icons.push([y, "i-mountain", x - w / 2, y - w * 0.6 + s * 0.3, w, w * 0.6]);
      } else if (h > 48 && noiseAt(cell, 3) < 0.55) {
        const w = s * 1.05;
        icons.push([y, "i-hill", x - w / 2, y - w * 0.43 + s * 0.2, w, w * 0.43]);
      } else {
        const icon = BIOMES[planet.biome[cell]].icon;
        const density = { none: 0, dune: 0.3, grass: 0.18, palm: 0.4, deciduous: 0.6, jungle: 0.65, conifer: 0.65, swamp: 0.55, ice: 0 }[icon];
        if (noiseAt(cell, 4) >= density) continue;
        const size = { none: 0, dune: 1, grass: 0.6, palm: 0.7, deciduous: 0.55, jungle: 0.65, conifer: 0.5, swamp: 0.7, ice: 0 }[icon] * s;
        const ratio = { none: 1, dune: 0.33, grass: 0.5, palm: 1, deciduous: 1.25, jungle: 1, conifer: 1.37, swamp: 0.5, ice: 1 }[icon];
        icons.push([y, `i-${icon}`, x - size / 2, y - size * ratio, size, size * ratio]);
      }
    }
    icons.sort((a, b) => a[0] - b[0]);
    out.push(`<g>${icons.map(([, id, x, y, w, h]) => `<use href="#${id}" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}"/>`).join("")}</g>`);
  }

  // Rivers, widening downstream.
  const riverPaths: Record<number, string> = {};
  if (layers.rivers) {
    out.push(`<g fill="none" stroke="${theme.river}" stroke-linecap="round" stroke-linejoin="round">`);
    for (const river of planet.rivers.slice(1)) {
      const points: Point[] = river.cells.map((cell): Point => [mesh.x[cell], mesh.y[cell]]);
      points.push(river.mouth);
      const line = smooth(points, false, 2);
      riverPaths[river.id] = pathData(line, false);
      const chunks = 5;
      for (let k = 0; k < chunks; k++) {
        const from = Math.floor((k * (line.length - 1)) / chunks);
        const to = Math.floor(((k + 1) * (line.length - 1)) / chunks);
        if (to <= from) continue;
        const width = river.width * (0.25 + (0.75 * (k + 1)) / chunks);
        out.push(`<path d="${pathData(line.slice(from, to + 1), false)}" stroke-width="${r1(width * 10) / 10}"/>`);
      }
    }
    out.push(`</g>`);
  }

  // Borders: provinces dotted, states dashed over them.
  if (layers.provinces) {
    const lines = borders(mesh, (cell) => (water[cell] ? -1 : planet.province[cell]));
    out.push(`<path d="${lines.map((line) => pathData(smooth(line, false, 1), false)).join("")}" fill="none" stroke="${theme.provinceBorder}" stroke-width="0.6" stroke-dasharray="1 1.6" opacity="0.8"/>`);
  }
  if (layers.borders) {
    const lines = borders(mesh, (cell) => (water[cell] ? -1 : planet.state[cell]));
    const d = lines.map((line) => pathData(smooth(line, false, 1), false)).join("");
    out.push(`<path d="${d}" fill="none" stroke="${theme.halo}" stroke-width="2.4" opacity="0.35"/><path d="${d}" fill="none" stroke="${theme.border}" stroke-width="1.2" stroke-dasharray="4 2.2" stroke-linecap="round"/>`);
  }

  // Roads and sea lanes.
  if (layers.routes) {
    const style = {
      highway: `stroke="${theme.road}" stroke-width="1.4"`,
      road: `stroke="${theme.road}" stroke-width="0.9"`,
      trail: `stroke="${theme.road}" stroke-width="0.7" stroke-dasharray="1.6 1.4"`,
      sea: `stroke="${theme.sea}" stroke-width="0.8" stroke-dasharray="4 3" opacity="0.6"`,
    };
    out.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">`);
    for (const route of planet.routes.slice(1)) {
      const points = route.cells.map((cell): Point => {
        const burg = planet.burgs[planet.burg[cell]];
        return planet.burg[cell] ? [burg.x, burg.y] : [mesh.x[cell], mesh.y[cell]];
      });
      out.push(`<path d="${pathData(smooth(points, false, 2), false)}" ${style[route.kind]}/>`);
    }
    out.push(`</g>`);
  }

  // Winds over everything, currents over the sea: arrows on a coarse grid.
  const arrow = (x: number, y: number, ux: number, uy: number, length: number, color: string, width: number) => {
    const ex = x + ux * length,
      ey = y + uy * length;
    const hx = -uy * length * 0.25,
      hy = ux * length * 0.25;
    return `<path d="M${r1(x)},${r1(y)}L${r1(ex)},${r1(ey)}M${r1(ex - ux * length * 0.35 + hx)},${r1(ey - uy * length * 0.35 + hy)}L${r1(ex)},${r1(ey)}L${r1(ex - ux * length * 0.35 - hx)},${r1(ey - uy * length * 0.35 - hy)}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round"/>`;
  };
  if (layers.currents) {
    const { u, v } = oceanCurrents(planet);
    const step = s * 2.6;
    const arrows: string[] = [];
    for (let y = step / 2; y < H; y += step) {
      for (let x = step / 2; x < W; x += step) {
        const cell = mesh.find(x, y);
        if (!water[cell] || (!u[cell] && !v[cell])) continue;
        arrows.push(arrow(mesh.x[cell], mesh.y[cell], u[cell], v[cell], s * 1.3, coast[cell] >= -2 ? "#2f7fd0" : "#5a9bd6", 0.9));
      }
    }
    out.push(`<g opacity="0.7">${arrows.join("")}</g>`);
  }
  if (layers.winds) {
    const step = s * 5;
    const arrows: string[] = [];
    for (let y = step / 2; y < H; y += step) {
      const latitude = params.latitudeNorth - (y / H) * (params.latitudeNorth - params.latitudeSouth);
      const [ux, uy] = windAt(latitude);
      for (let x = step / 2; x < W; x += step) arrows.push(arrow(x, y, ux, uy, s * 2.2, "#7a6a9a", 1.2));
    }
    out.push(`<g opacity="0.55">${arrows.join("")}</g>`);
  }

  if (options.highlight) {
    const { kind, id } = options.highlight;
    const owner = kind === "state" ? planet.state : kind === "province" ? planet.province : planet.culture;
    const shape = rings(outline(mesh, (cell) => land(cell) && owner[cell] === id), 1);
    out.push(`<path d="${shape}" fill="#ffd34d" fill-opacity="0.18" stroke="#ffb300" stroke-width="2.4" fill-rule="evenodd"/>`);
  }

  // Points of interest.
  if (layers.markers) {
    const r = s * 0.24;
    out.push(`<g text-anchor="middle" font-family="'Segoe UI Symbol', 'Noto Sans Symbols', sans-serif">`);
    for (const marker of planet.markers.slice(1)) {
      out.push(`<g data-marker="${marker.id}"><circle cx="${r1(marker.x)}" cy="${r1(marker.y)}" r="${r1(r)}" fill="${theme.halo}" stroke="${theme.ink}" stroke-width="0.5"/><text x="${r1(marker.x)}" y="${r1(marker.y + r * 0.42)}" font-size="${r1(r * 1.25)}" fill="${theme.ink}">${MARKER_GLYPH[marker.kind]}</text></g>`);
    }
    out.push(`</g>`);
  }

  // Towns: capitals as ringed dots, towns by size.
  const placed: Box[] = [];
  if (layers.burgs) {
    out.push(`<g stroke="${theme.burgStroke}">`);
    for (const burg of planet.burgs.slice(1)) {
      if (burg.capital) {
        const r = s * 0.3;
        out.push(`<circle cx="${r1(burg.x)}" cy="${r1(burg.y)}" r="${r1(r)}" fill="${theme.burg}" stroke-width="0.9"/><circle cx="${r1(burg.x)}" cy="${r1(burg.y)}" r="${r1(r * 0.42)}" fill="${theme.burgStroke}" stroke="none"/>`);
      } else {
        const r = s * (0.11 + Math.min(0.11, burg.population / 300));
        out.push(`<circle cx="${r1(burg.x)}" cy="${r1(burg.y)}" r="${r1(r)}" fill="${theme.burg}" stroke-width="0.6"/>`);
      }
      placed.push({ x0: burg.x - s * 0.3, y0: burg.y - s * 0.3, x1: burg.x + s * 0.3, y1: burg.y + s * 0.3 });
    }
    out.push(`</g>`);
  }

  if (layers.labels) {
    const halo = `stroke="${theme.halo}" stroke-width="2.2" stroke-linejoin="round" paint-order="stroke"`;
    // Seas and lakes.
    out.push(`<g font-style="italic" text-anchor="middle" fill="${theme.waterLabel}">`);
    for (const feature of planet.features.slice(1)) {
      if (feature.land || !feature.name) continue;
      let best = -1;
      for (let cell = 0; cell < mesh.cells; cell++) if (planet.feature[cell] === feature.id && (best < 0 || coast[cell] < coast[best])) best = cell;
      if (best < 0) continue;
      const lake = feature.kind === "lake";
      const size = lake ? Math.min(9, 5 + feature.cells / 15) : 15;
      out.push(`<text x="${r1(mesh.x[best])}" y="${r1(mesh.y[best])}" font-size="${r1(size)}" letter-spacing="${lake ? 0.5 : 3}" ${lake ? `fill="${theme.coast}"` : ""}>${text(feature.name)}</text>`);
    }
    out.push(`</g>`);
    // Rivers: the largest ones, along their course.
    const big = planet.rivers.slice(1).filter((river) => river.cells.length > 8).sort((a, b) => b.discharge - a.discharge).slice(0, 14);
    if (layers.rivers && big.length) {
      out.push(`<defs>${big.map((river) => `<path id="rv-${river.id}" d="${riverPaths[river.id]}"/>`).join("")}</defs><g font-style="italic" font-size="6.5" fill="${theme.river}" ${halo}>`);
      for (const river of big) out.push(`<text dy="-2.5"><textPath href="#rv-${river.id}" startOffset="45%" text-anchor="middle">${text(river.name)}</textPath></text>`);
      out.push(`</g>`);
    }
    // States, large and faint, along each state's long axis on a gentle arch; then towns on top, never colliding.
    const moments = planet.states.map(() => [0, 0, 0, 0, 0, 0]);
    for (let cell = 0; cell < mesh.cells; cell++) {
      if (water[cell] || !planet.state[cell]) continue;
      const m = moments[planet.state[cell]];
      const x = mesh.x[cell],
        y = mesh.y[cell];
      m[0]++;
      m[1] += x;
      m[2] += y;
      m[3] += x * x;
      m[4] += y * y;
      m[5] += x * y;
    }
    const arches: string[] = [];
    const names: string[] = [];
    for (const state of planet.states.slice(1)) {
      const [count, sx, sy, sxx, syy, sxy] = moments[state.id];
      if (!state.cells || !count) continue;
      const cxx = sxx / count - (sx / count) ** 2;
      const cyy = syy / count - (sy / count) ** 2;
      const cxy = sxy / count - (sx / count) * (sy / count);
      let angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      angle = Math.max(-0.7, Math.min(0.7, angle));
      const size = Math.max(9, Math.min(30, 5 + Math.sqrt(state.cells) * 1.1));
      const label = text(state.name.toUpperCase());
      const length = label.length * size * (0.62 + 0.22) * 1.15 + size;
      const ux = Math.cos(angle),
        uy = Math.sin(angle);
      // A pole off this map (a state seen only in part) falls back to the middle of its visible land.
      const inside = state.pole[0] >= 0 && state.pole[0] <= W && state.pole[1] >= 0 && state.pole[1] <= H;
      const [px, py] = inside ? state.pole : [sx / count, sy / count];
      const bend = length * 0.1;
      arches.push(`<path id="sl-${state.id}" d="M${r1(px - (ux * length) / 2)},${r1(py - (uy * length) / 2)}Q${r1(px + uy * bend)},${r1(py - ux * bend)} ${r1(px + (ux * length) / 2)},${r1(py + (uy * length) / 2)}"/>`);
      const color = themeId === "night" ? state.color : shade(state.color, -0.55);
      names.push(`<text font-size="${r1(size)}" letter-spacing="${r1(size * 0.22)}" fill="${color}" opacity="0.85" stroke="${theme.halo}" stroke-width="${r1(size * 0.14)}" stroke-opacity="0.6" paint-order="stroke" dy="${r1(size * 0.35)}"><textPath href="#sl-${state.id}" startOffset="50%">${label}</textPath></text>`);
    }
    out.push(`<defs>${arches.join("")}</defs><g text-anchor="middle" font-weight="600">${names.join("")}</g>`);
    const towns = planet.burgs.slice(1).sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population);
    out.push(`<g fill="${theme.label}" ${halo}>`);
    for (const burg of towns) {
      const size = burg.capital ? 10 : burg.population > 15 ? 7.5 : 6.2;
      const label = text(burg.name);
      const width = label.length * size * 0.56;
      const offset = s * (burg.capital ? 0.42 : 0.28);
      const tries: [number, number, string][] = [
        [burg.x + offset, burg.y + size * 0.35, "start"],
        [burg.x - offset, burg.y + size * 0.35, "end"],
        [burg.x, burg.y - offset - size * 0.15, "middle"],
        [burg.x, burg.y + offset + size * 0.85, "middle"],
      ];
      for (const [x, y, anchor] of tries) {
        const x0 = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
        const box = { x0, y0: y - size * 0.8, x1: x0 + width, y1: y + size * 0.2 };
        if (box.x0 < 2 || box.x1 > W - 2 || box.y0 < 2 || box.y1 > H - 2) continue;
        if (placed.some((other) => overlaps(box, other))) continue;
        placed.push(box);
        out.push(`<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" text-anchor="${anchor}"${burg.capital ? ` font-weight="700"` : ""} class="${burg.capital ? "capital" : burg.population > 15 ? "town" : "village"}">${label}</text>`);
        break;
      }
    }
    out.push(`</g>`);
  }

  if (theme.paper) out.push(`<rect width="${W}" height="${H}" filter="url(#paper)" fill="#fff"/>`);
  if (layers.grid) {
    const north = params.latitudeNorth;
    const south = params.latitudeSouth;
    const lines: string[] = [];
    for (let lat = Math.ceil(south / 10) * 10; lat <= north; lat += 10) {
      const y = ((north - lat) / (north - south)) * H;
      lines.push(`M0,${r1(y)}H${W}`);
    }
    const step = (10 * 111) / planet.scale;
    for (let x = step; x < W; x += step) lines.push(`M${r1(x)},0V${H}`);
    out.push(`<path d="${lines.join("")}" stroke="${theme.grid}" stroke-width="0.6" fill="none"/>`);
  }
  out.push(`</g>`);
  if (layers.frame) out.push(frame(planet, theme, text));
  out.push(`</svg>`);
  return out.join("");
}

/** Border, title, compass rose and scale bar. */
function frame(planet: Planet, theme: Theme, text: (value: string) => string): string {
  const { width: W, height: H } = planet.params;
  const parts: string[] = [`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${theme.ink}" stroke-width="2"/>`];
  // Title cartouche.
  const title = text(planet.name);
  const tw = Math.max(120, title.length * 13 + 40);
  parts.push(`<g><rect x="16" y="16" width="${tw}" height="38" rx="3" fill="${theme.halo}" fill-opacity="0.88" stroke="${theme.ink}" stroke-width="1"/><text x="${16 + tw / 2}" y="42" text-anchor="middle" font-size="20" letter-spacing="2" fill="${theme.label}" font-weight="600">${title}</text></g>`);
  // Compass rose.
  const cx = 70;
  const cy = H - 80;
  const rays: string[] = [];
  for (let k = 0; k < 16; k++) {
    const angle = (k * Math.PI) / 8;
    const long = k % 4 === 0 ? 46 : k % 2 === 0 ? 30 : 18;
    const side = k % 4 === 0 ? 7 : 4;
    const tip: Point = [cx + Math.sin(angle) * long, cy - Math.cos(angle) * long];
    const left: Point = [cx + Math.sin(angle - Math.PI / 2) * side, cy - Math.cos(angle - Math.PI / 2) * side];
    const right: Point = [cx + Math.sin(angle + Math.PI / 2) * side, cy - Math.cos(angle + Math.PI / 2) * side];
    rays.push(`<path d="M${r1(left[0])},${r1(left[1])}L${r1(tip[0])},${r1(tip[1])}L${r1(right[0])},${r1(right[1])}Z" fill="${k % 2 ? theme.halo : theme.ink}" stroke="${theme.ink}" stroke-width="0.5"/>`);
  }
  parts.push(`<g opacity="0.9"><circle cx="${cx}" cy="${cy}" r="34" fill="none" stroke="${theme.ink}" stroke-width="0.6"/>${rays.reverse().join("")}<text x="${cx}" y="${cy - 52}" text-anchor="middle" font-size="12" font-weight="700" fill="${theme.ink}">N</text></g>`);
  // Scale bar: a round distance about a tenth of the map wide.
  const target = (W / 10) * planet.scale;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const km = [1, 2, 5, 10].map((m) => m * magnitude).reduce((best, value) => (Math.abs(value - target) < Math.abs(best - target) ? value : best));
  const length = km / planet.scale;
  const x0 = W - length - 30;
  const y0 = H - 30;
  parts.push(`<g fill="${theme.ink}" font-size="10" text-anchor="middle"><rect x="${r1(x0)}" y="${y0}" width="${r1(length / 2)}" height="5" fill="${theme.ink}"/><rect x="${r1(x0 + length / 2)}" y="${y0}" width="${r1(length / 2)}" height="5" fill="${theme.halo}" stroke="${theme.ink}" stroke-width="0.8"/><text x="${r1(x0)}" y="${y0 - 5}">0</text><text x="${r1(x0 + length)}" y="${y0 - 5}">${km} km</text></g>`);
  return parts.join("");
}
