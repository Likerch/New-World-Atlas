// What the land itself makes, and what the world is like through the year: waterfalls and rapids where rivers drop,
// fords where roads cross small rivers, passes where roads climb between peaks, reefs in warm shallows; seasons
// (summer and winter warmth, wider inland and towards the poles) and the Köppen climates they give; and zones of
// trouble on the map — fronts of the wars being fought, plague and famine of the last years, bandit country,
// magic storms, radiation, and the GM's own.
import { createRng } from "../random";
import { ageOf, settingOf } from "../setting";
import type { Marker, MarkerKind, Planet } from "./model";
import { SEA_LEVEL } from "./model";

/** The places the ground itself makes, which a world nobody lives on keeps. */
export const NATURAL_KINDS: MarkerKind[] = ["waterfall", "rapids", "reef", "volcano", "hot-spring", "cave", "giant-tree", "crater"];

/** Natural places along rivers, roads and coasts, appended to the map's places (they move none of the others). */
export function naturalPlaces(planet: Planet, markers: Marker[]): void {
  const { mesh, height, water } = planet;
  const rng = createRng(planet.params.seed).fork("nature");
  const taken = new Set(markers.map((marker) => marker.cell));
  const road = new Uint8Array(mesh.cells);
  for (const route of planet.routes.slice(1)) if (route.kind !== "sea" && route.kind !== "air") for (const cell of route.cells) road[cell] = 1;
  const add = (kind: MarkerKind, cell: number, facts: Marker["facts"]) => {
    // Not on a town: a ford at a town is its bridge, a fall its weir.
    if (taken.has(cell) || planet.burg?.[cell]) return;
    taken.add(cell);
    markers.push({ id: markers.length, kind, cell, x: mesh.x[cell], y: mesh.y[cell], name: "", facts });
  };
  const metres = (cell: number) => Math.max(0, ((height[cell] - SEA_LEVEL) / (100 - SEA_LEVEL)) * planet.params.peakHeight);
  let falls = 0;
  for (const river of planet.rivers.slice(1)) {
    for (let k = 1; k < river.cells.length && falls < 40; k++) {
      const drop = metres(river.cells[k - 1]) - metres(river.cells[k]);
      const at = river.cells[k - 1];
      if (drop > planet.params.peakHeight * 0.09 && metres(at) > 400) {
        add("waterfall", at, { river: river.name, height: Math.round(drop / 10) * 10 });
        falls++;
      } else if (drop > planet.params.peakHeight * 0.05 && rng.chance(0.3)) add("rapids", at, { river: river.name });
    }
  }
  let fords = 0;
  const flows = planet.rivers.slice(1).map((river) => river.discharge).sort((a, b) => a - b);
  const small = flows[Math.floor(flows.length * 0.6)] ?? 0;
  for (const river of planet.rivers.slice(1)) {
    if (river.discharge > small) continue;
    const crossing = river.cells.find((cell) => road[cell]);
    if (crossing !== undefined && fords < 30) {
      add("ford", crossing, { river: river.name });
      fords++;
    }
  }
  let passes = 0;
  for (let cell = 0; cell < mesh.cells && passes < 20; cell++) {
    if (!road[cell] || water[cell] || height[cell] < 52) continue;
    const higher = mesh.neighbors[cell].filter((next) => height[next] > height[cell] + 3).length;
    if (higher >= 2) {
      add("pass", cell, { height: Math.round(metres(cell) / 10) * 10 });
      passes++;
    }
  }
  let reefs = 0;
  for (let cell = 0; cell < mesh.cells && reefs < 15; cell++) {
    if (!water[cell] || planet.temperature[cell] < 23 || height[cell] < SEA_LEVEL - 4 || planet.coast[cell] !== -1) continue;
    if (!rng.chance(0.06)) continue;
    add("reef", cell, {});
    reefs++;
  }
}

/** Warmth of a cell in a season: half the year's swing above or below the mean, the swing wider towards the poles and
 * far from the sea; northern summer is southern winter. */
export function seasonalTemperature(planet: Planet, cell: number, season: "summer" | "winter"): number {
  const { latitudeNorth: north, latitudeSouth: south, height } = planet.params;
  const latitude = north - (planet.mesh.y[cell] / height) * (north - south);
  const inland = Math.max(0, planet.coast[cell]);
  const swing = (Math.abs(latitude) / 90) * 32 * (0.55 + Math.min(1, inland / 8) * 0.9);
  const sign = (season === "summer" ? 1 : -1) * (latitude >= 0 ? 1 : -1);
  return planet.temperature[cell] + (sign * swing) / 2;
}

/** The Köppen climates, with the colours atlases give them. */
export const KOPPEN = [
  ["Af", "#0000fe"], ["Am", "#0077ff"], ["Aw", "#46a9fa"],
  ["BWh", "#fe0000"], ["BWk", "#fe9695"], ["BSh", "#f5a301"], ["BSk", "#ffdb63"],
  ["Csa", "#ffff00"], ["Csb", "#c6c700"], ["Cfa", "#c6ff4e"], ["Cfb", "#66ff33"], ["Cfc", "#33c701"],
  ["Dfa", "#00ffff"], ["Dfb", "#38c7ff"], ["Dfc", "#007e7d"], ["Dfd", "#00455e"],
  ["ET", "#b2b2b2"], ["EF", "#686868"],
] as const;

/** Each land cell's Köppen climate, as an index into KOPPEN (-1 for water). */
export function koppenOf(planet: Planet): Int8Array {
  const out = new Int8Array(planet.mesh.cells).fill(-1);
  const index = (code: string) => KOPPEN.findIndex(([name]) => name === code);
  for (let cell = 0; cell < planet.mesh.cells; cell++) {
    if (planet.water[cell]) continue;
    const mean = planet.temperature[cell];
    const hot = Math.max(seasonalTemperature(planet, cell, "summer"), seasonalTemperature(planet, cell, "winter"));
    const cold = Math.min(seasonalTemperature(planet, cell, "summer"), seasonalTemperature(planet, cell, "winter"));
    const rain = planet.precipitation[cell];
    let code: string;
    if (hot < 10) code = hot > 0 ? "ET" : "EF";
    else if (rain < 20 * mean + 280) code = `${rain < (20 * mean + 280) / 2 ? "BW" : "BS"}${mean >= 18 ? "h" : "k"}`;
    else if (cold >= 18) code = rain >= 2000 ? "Af" : rain >= 1500 ? "Am" : "Aw";
    else if (cold > -3) code = rain < 650 && mean > 13 ? (hot >= 22 ? "Csa" : "Csb") : hot >= 22 ? "Cfa" : hot >= 15 ? "Cfb" : "Cfc";
    else code = cold < -38 ? "Dfd" : hot >= 22 ? "Dfa" : hot >= 15 ? "Dfb" : "Dfc";
    out[cell] = index(code);
  }
  return out;
}

export type TroubleKind = "front" | "plague" | "famine" | "bandits" | "storm" | "radiation" | "custom";
export interface Trouble {
  kind: TroubleKind;
  cells: number[];
  /** The GM's own word for a zone they drew. */
  label?: string;
}

/** Zones of trouble the world is in now: fronts of its wars, plague and famine of the last years, bandit country
 * round the brigands, magic storms in a world of strong magic, radiation after the fall — and the GM's own. */
export function zonesOf(planet: Planet): Trouble[] {
  const { mesh, water } = planet;
  const zones: Trouble[] = [];
  const disc = (x: number, y: number, r: number) => Array.from({ length: mesh.cells }, (_, cell) => cell).filter((cell) => Math.hypot(mesh.x[cell] - x, mesh.y[cell] - y) <= r);
  const ring = (cell: number, steps: number) => disc(mesh.x[cell], mesh.y[cell], mesh.spacing * steps);
  // Fronts: where realms at war meet.
  for (const state of planet.states.slice(1)) {
    for (const other of state.neighbors) {
      if (other < state.id || state.relations[other] !== "enemy") continue;
      const cells = new Set<number>();
      for (let cell = 0; cell < mesh.cells; cell++) {
        if (planet.state[cell] !== state.id || water[cell]) continue;
        if (mesh.neighbors[cell].some((next) => planet.state[next] === other)) for (const near of ring(cell, 1.5)) if (!water[near]) cells.add(near);
      }
      if (cells.size) zones.push({ kind: "front", cells: [...cells] });
    }
  }
  const history = planet.history;
  if (history) {
    for (const event of history.events) {
      if (history.years - event.year > 12 || event.cell === undefined) continue;
      if (event.kind === "plague") zones.push({ kind: "plague", cells: ring(event.cell, 5).filter((cell) => !water[cell]) });
      if (event.kind === "famine") {
        const realm = planet.states.find((state) => state.polity === event.polities[0]);
        if (realm) zones.push({ kind: "famine", cells: Array.from({ length: mesh.cells }, (_, cell) => cell).filter((cell) => planet.state[cell] === realm.id) });
      }
    }
  }
  for (const marker of planet.markers.slice(1)) {
    if (marker.kind === "brigands") zones.push({ kind: "bandits", cells: ring(marker.cell, 3).filter((cell) => !water[cell]) });
    if (marker.kind === "radiation" || marker.kind === "toxic-zone") zones.push({ kind: "radiation", cells: ring(marker.cell, 4) });
  }
  const setting = settingOf(planet.params.setting);
  if (setting.magic >= 2) {
    const rng = createRng(planet.params.seed).fork("storms");
    for (let k = rng.int(1, setting.magic >= 3 ? 4 : 2); k > 0; k--) zones.push({ kind: "storm", cells: disc(rng.float(0, planet.params.width), rng.float(0, planet.params.height), mesh.spacing * rng.float(3, 7)) });
  }
  if (ageOf(setting) === "post-apocalypse" && !zones.some((zone) => zone.kind === "radiation")) {
    const rng = createRng(planet.params.seed).fork("fallout");
    for (let k = rng.int(2, 4); k > 0; k--) zones.push({ kind: "radiation", cells: disc(rng.float(0, planet.params.width), rng.float(0, planet.params.height), mesh.spacing * rng.float(2, 5)) });
  }
  for (const [x, y, r, kind, label] of planet.gmZones ?? []) zones.push({ kind: kind as TroubleKind, cells: disc(x, y, r), ...(label ? { label } : {}) });
  return zones.filter((zone) => zone.cells.length);
}
