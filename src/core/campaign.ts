// A game master's layer over generated maps: renamed things, notes, pins, and fog of war. A map is identified by its
// level and seed, so the same generated map always finds its patch again; a campaign is all patches together.
import type { City } from "./city/model";
import type { LocalMap } from "./local/local";
import type { Planet } from "./planet/model";
import type { Galaxy } from "./space/galaxy";
import type { StarSystem } from "./space/system";

export interface Pin {
  id: string;
  x: number;
  y: number;
  label: string;
  note: string;
  color: string;
  /** Seen only by the GM. */
  hidden: boolean;
}

export interface MapPatch {
  /** New names by entity key ("state:3", "burg:12", "ward:4", "star:10", "keyed:2"…). */
  names: Record<string, string>;
  notes: Record<string, string>;
  pins: Pin[];
  fog: { enabled: boolean; revealed: [number, number, number][] };
}

export interface Campaign {
  format: "new-world-atlas/campaign";
  version: 1;
  maps: Record<string, MapPatch>;
}

export function emptyPatch(): MapPatch {
  return { names: {}, notes: {}, pins: [], fog: { enabled: false, revealed: [] } };
}

const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

/** Pins and fog as an SVG fragment over a map of the given size; the players' view hides GM-only pins and makes fog opaque. */
export function overlaySvg(patch: MapPatch, width: number, height: number, players: boolean, scale = 1): string {
  const out: string[] = [];
  if (patch.fog.enabled) {
    out.push(`<defs><mask id="fog-mask"><rect width="${width}" height="${height}" fill="white"/>${patch.fog.revealed.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="black"/>`).join("")}</mask></defs>`);
    out.push(`<rect width="${width}" height="${height}" fill="#0c0d12" opacity="${players ? 1 : 0.55}" mask="url(#fog-mask)"/>`);
  }
  for (const pin of patch.pins) {
    if (players && pin.hidden) continue;
    const r = 7 * scale;
    out.push(`<g><path d="M${pin.x},${pin.y}l${-r * 0.8},${-r * 1.6}a${r},${r} 0 1 1 ${r * 1.6},0z" fill="${pin.color}" stroke="#ffffff" stroke-width="${1.5 * scale}" opacity="${pin.hidden ? 0.6 : 1}"/><circle cx="${pin.x}" cy="${pin.y - r * 2.1}" r="${r * 0.35}" fill="#ffffff"/>`);
    if (pin.label) out.push(`<text x="${pin.x}" y="${pin.y - r * 3.2}" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="${12 * scale}" font-weight="600" fill="#1d1d1d" stroke="#ffffff" stroke-width="${3 * scale}" paint-order="stroke">${esc(pin.label)}</text>`);
    out.push(`</g>`);
  }
  return out.join("");
}

/** A map SVG with the overlay on top, for export: the map is nested so its own view box is kept. */
export function withOverlay(svg: string, overlay: string, width: number, height: number): string {
  if (!overlay) return svg;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${svg.replace("<svg ", `<svg x="0" y="0" `)}${overlay}</svg>`;
}

const rename = <T extends { id: number; name: string }>(items: T[], prefix: string, names: Record<string, string>): T[] => (Object.keys(names).some((key) => key.startsWith(`${prefix}:`)) ? items.map((item) => (names[`${prefix}:${item.id}`] ? { ...item, name: names[`${prefix}:${item.id}`] } : item)) : items);

export function renamePlanet(planet: Planet, names: Record<string, string>): Planet {
  if (!Object.keys(names).length) return planet;
  return {
    ...planet,
    name: names.world ?? planet.name,
    states: rename(planet.states, "state", names),
    provinces: rename(planet.provinces, "province", names),
    cultures: rename(planet.cultures, "culture", names),
    religions: rename(planet.religions, "religion", names),
    burgs: rename(planet.burgs, "burg", names),
    rivers: rename(planet.rivers, "river", names),
    markers: rename(planet.markers, "marker", names),
    features: rename(planet.features, "feature", names),
  };
}

export function renameCity(city: City, names: Record<string, string>): City {
  if (!Object.keys(names).length) return city;
  return { ...city, name: names.world ?? city.name, wards: rename(city.wards, "ward", names), landmarks: rename(city.landmarks, "landmark", names), streets: rename(city.streets, "street", names) };
}

export function renameGalaxy(galaxy: Galaxy, names: Record<string, string>): Galaxy {
  if (!Object.keys(names).length) return galaxy;
  return { ...galaxy, name: names.world ?? galaxy.name, stars: rename(galaxy.stars, "star", names), empires: rename(galaxy.empires, "empire", names) };
}

export function renameSystem(system: StarSystem, names: Record<string, string>): StarSystem {
  if (!Object.keys(names).length) return system;
  return { ...system, name: names.world ?? system.name, bodies: rename(system.bodies, "body", names) };
}

export function renameLocal(map: LocalMap, names: Record<string, string>): LocalMap {
  if (!Object.keys(names).length) return map;
  return { ...map, name: names.world ?? map.name, keyed: rename(map.keyed, "keyed", names) };
}
