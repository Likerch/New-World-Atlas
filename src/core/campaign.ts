// A game master's layer over generated maps: renamed things, notes, pins, fog of war and a planet's world edits. A map
// is identified by its level and seed, so the same generated map always finds its patch again; a campaign is all
// patches together.
import type { City } from "./city/model";
import type { LocalMap } from "./local/local";
import type { PlanetEdits } from "./planet/edit";
import type { Planet } from "./planet/model";
import type { Underworld } from "./planet/underworld";
import type { Galaxy } from "./space/galaxy";
import type { StarSystem } from "./space/system";
import type { Universe } from "./space/universe";

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
  /** A planet's edits from the world editor. */
  edits?: PlanetEdits;
  /** Other levels' edits over what was generated (a galaxy's, a city's, a building's…), each under its own name, so
   * they can be undone or thrown away one by one. */
  changes?: Record<string, unknown>;
}

export interface Campaign {
  format: "new-world-atlas/campaign";
  version: 1;
  maps: Record<string, MapPatch>;
}

export function emptyPatch(): MapPatch {
  return { names: {}, notes: {}, pins: [], fog: { enabled: false, revealed: [] } };
}

/** A patch as read from a file or an older world: whatever is missing is there, empty. */
export function cleanPatch(raw: Partial<MapPatch> | null | undefined): MapPatch {
  const fog = raw?.fog;
  return {
    ...raw,
    names: raw?.names && typeof raw.names === "object" ? raw.names : {},
    notes: raw?.notes && typeof raw.notes === "object" ? raw.notes : {},
    pins: Array.isArray(raw?.pins) ? raw.pins : [],
    fog: { enabled: !!fog?.enabled, revealed: Array.isArray(fog?.revealed) ? fog.revealed : [] },
  };
}

/** A campaign file, checked: anything else is refused (the app says so) rather than quietly ignored. */
export function readCampaign(data: unknown): Campaign {
  const file = data as Partial<Campaign> | null;
  if (!file || file.format !== "new-world-atlas/campaign" || !file.maps || typeof file.maps !== "object") throw new Error("not a campaign file");
  return { format: "new-world-atlas/campaign", version: 1, maps: Object.fromEntries(Object.entries(file.maps).map(([key, patch]) => [key, cleanPatch(patch)])) };
}

/** A pin's colour as written in a file is used only if it is a colour. */
const colourOf = (value: unknown) => (typeof value === "string" && /^#[0-9a-f]{3,8}$/iu.test(value) ? value : "#d64545");

const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

/** Pins and fog as an SVG fragment over a map of the given size; the players' view hides GM-only pins and makes fog opaque. */
export function overlaySvg(patch: MapPatch, width: number, height: number, players: boolean, scale = 1): string {
  const out: string[] = [];
  if (patch.fog.enabled) {
    out.push(`<defs><mask id="fog-mask"><rect width="${width}" height="${height}" fill="white"/>${patch.fog.revealed.map(([x, y, r]) => `<circle cx="${Number(x) || 0}" cy="${Number(y) || 0}" r="${Number(r) || 0}" fill="black"/>`).join("")}</mask></defs>`);
    out.push(`<rect width="${width}" height="${height}" fill="#0c0d12" opacity="${players ? 1 : 0.55}" mask="url(#fog-mask)"/>`);
  }
  for (const pin of patch.pins) {
    if (players && pin.hidden) continue;
    const r = 7 * scale;
    // Whatever a file says, only numbers and a colour reach the drawing.
    const x = Number(pin.x) || 0;
    const y = Number(pin.y) || 0;
    out.push(`<g><path d="M${x},${y}l${-r * 0.8},${-r * 1.6}a${r},${r} 0 1 1 ${r * 1.6},0z" fill="${colourOf(pin.color)}" stroke="#ffffff" stroke-width="${1.5 * scale}" opacity="${pin.hidden ? 0.6 : 1}"/><circle cx="${x}" cy="${y - r * 2.1}" r="${r * 0.35}" fill="#ffffff"/>`);
    if (pin.label) out.push(`<text x="${x}" y="${y - r * 3.2}" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="${12 * scale}" font-weight="600" fill="#1d1d1d" stroke="#ffffff" stroke-width="${3 * scale}" paint-order="stroke">${esc(String(pin.label))}</text>`);
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
  return { ...galaxy, name: names.world ?? galaxy.name, stars: rename(galaxy.stars, "star", names), empires: rename(galaxy.empires, "empire", names), zones: rename(galaxy.zones, "zone", names), nebulae: rename(galaxy.nebulae, "nebula", names) };
}

export function renameSystem(system: StarSystem, names: Record<string, string>): StarSystem {
  if (!Object.keys(names).length) return system;
  return { ...system, name: names.world ?? system.name, bodies: rename(system.bodies, "body", names) };
}

export function renameLocal(map: LocalMap, names: Record<string, string>): LocalMap {
  if (!Object.keys(names).length) return map;
  return { ...map, name: names.world ?? map.name, keyed: rename(map.keyed, "keyed", names) };
}

export function renameUniverse(universe: Universe, names: Record<string, string>): Universe {
  if (!Object.keys(names).length) return universe;
  return { ...universe, name: names.world ?? universe.name, galaxies: rename(universe.galaxies, "galaxy", names), anomalies: rename(universe.anomalies, "anomaly", names), voids: rename(universe.voids, "void", names), clusters: rename(universe.clusters, "cluster", names) };
}

export function renameUnderworld(world: Underworld, names: Record<string, string>): Underworld {
  if (!Object.keys(names).length) return world;
  return { ...world, name: names.world ?? world.name, caverns: rename(world.caverns, "cavern", names) };
}
