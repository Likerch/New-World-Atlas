// What a planet-shaped map (a planet, a region, a sheet) offers under the cursor: its name in a tooltip, the map a
// double-click opens, the right-click menu of every map that opens there, and distances in kilometres (great-circle on
// a whole world, true to scale on a smaller map).
import { buildingOfMarker, BIOMES, latitudeOf, localAt, localFromMarker, wrapsRound, type Planet } from "../core/index";
import { km, people } from "./format";
import type { T } from "./i18n";
import type { MenuItem } from "./MapView";

export interface PlanetOpeners {
  city?: (burg: number) => void;
  local?: (marker: number) => void;
  region?: (province: number) => void;
  country?: (state: number) => void;
  here?: (cell: number) => void;
  sheet?: (cell: number) => void;
  descend?: (marker: number) => void;
  building?: (marker: number) => void;
}

const DEEP = new Set(["cave", "mine", "volcano"]);

export function planetActions(planet: Planet, t: T, nm: (name: string) => string, open: PlanetOpeners) {
  const { mesh } = planet;
  /** The town or place a click at this point means, as the map's own click does: within a fraction of a cell. */
  const at = (x: number, y: number) => {
    const cell = mesh.find(x, y);
    const marker = planet.markers.slice(1).find((item) => Math.hypot(item.x - x, item.y - y) < mesh.spacing * 0.35);
    const id = planet.burg[cell];
    const burg = id && !planet.burgs[id].removed && Math.hypot(planet.burgs[id].x - x, planet.burgs[id].y - y) < mesh.spacing * 0.5 ? planet.burgs[id] : null;
    return { cell, marker, burg };
  };
  const deep = (kind: string, facts: Record<string, string | number>) => DEEP.has(kind) || (kind === "portal" && facts.leadsTo === "underworld");
  return {
    hover: (x: number, y: number): string | null => {
      const { cell, marker, burg } = at(x, y);
      if (marker) return `${t(`marker.${marker.kind}`)}${marker.name ? ` ${nm(marker.name)}` : ""}`;
      if (burg) return `${burg.capital ? "★ " : ""}${nm(burg.name)} · ${people(burg.population, t)}`;
      if (planet.water[cell]) {
        const water = planet.features[planet.feature[cell]];
        return water?.name ? nm(water.name) : null;
      }
      const province = planet.provinces[planet.province[cell]];
      const realm = planet.states[planet.state[cell]];
      return [t(`biome.${BIOMES[planet.biome[cell]].key}`), province?.id ? nm(province.name) : "", realm?.id ? nm(realm.name) : ""].filter(Boolean).join(" · ");
    },
    open: (x: number, y: number) => {
      const { cell, marker, burg } = at(x, y);
      if (burg && open.city) return open.city(burg.id);
      if (marker && open.building && buildingOfMarker(planet, marker.id)) return open.building(marker.id);
      if (marker && open.local && localFromMarker(planet, marker.id)) return open.local(marker.id);
      if (planet.water[cell]) return;
      if (open.region && planet.province[cell]) return open.region(planet.province[cell]);
      if (open.here && localAt(planet, cell)) open.here(cell);
    },
    menu: (x: number, y: number): MenuItem[] => {
      const { cell, marker, burg } = at(x, y);
      const items: MenuItem[] = [];
      if (burg && open.city) items.push({ label: `🏰 ${t("action.openCity")}: ${nm(burg.name)}`, run: () => open.city!(burg.id) });
      if (marker && open.local && localFromMarker(planet, marker.id)) items.push({ label: `🗺️ ${t("action.openLocal")}${marker.name ? `: ${nm(marker.name)}` : ""}`, run: () => open.local!(marker.id) });
      if (marker && open.building && buildingOfMarker(planet, marker.id)) items.push({ label: `🏠 ${t("action.openBuilding")}${marker.name ? `: ${nm(marker.name)}` : ""}`, run: () => open.building!(marker.id) });
      if (marker && open.descend && deep(marker.kind, marker.facts)) items.push({ label: `🕳 ${t("action.toUnderworld")}`, run: () => open.descend!(marker.id) });
      if (!planet.water[cell]) {
        if (open.region && planet.province[cell]) items.push({ label: `🗺 ${t("action.openRegion")}: ${nm(planet.provinces[planet.province[cell]].name)}`, run: () => open.region!(planet.province[cell]) });
        if (open.country && planet.state[cell]) items.push({ label: `🗺 ${t("action.openCountry")}: ${nm(planet.states[planet.state[cell]].name)}`, run: () => open.country!(planet.state[cell]) });
        if (open.here && !burg && localAt(planet, cell)) items.push({ label: `🗺️ ${t("action.localHere")}`, run: () => open.here!(cell) });
        if (open.sheet) items.push({ label: `📄 ${t("action.sheetHere")}`, run: () => open.sheet!(cell) });
      }
      return items;
    },
    /** Where a map opened from this one hangs: its town, place, province, realm, spot or box. */
    anchor: (entity: string): [number, number] | null => {
      const [kind, value = ""] = entity.split(":");
      const id = Number(value);
      if (kind === "burg" && planet.burgs[id]) return [planet.burgs[id].x, planet.burgs[id].y];
      if (kind === "marker" && planet.markers[id]) return [planet.markers[id].x, planet.markers[id].y];
      if (kind === "province" && planet.provinces[id]) return planet.provinces[id].pole;
      if (kind === "state" && planet.states[id]) return planet.states[id].pole;
      if (kind === "cell" && id < mesh.cells) return [mesh.x[id], mesh.y[id]];
      if (kind === "area") {
        const [x0, y0, x1, y1] = value.split(",").map(Number);
        return [(x0 + x1) / 2, (y0 + y1) / 2];
      }
      return null;
    },
    measure: (x0: number, y0: number, x1: number, y1: number): string => {
      if (!wrapsRound(planet.params)) return km(Math.hypot(x1 - x0, y1 - y0) * planet.scale, t);
      // On a whole world: along the great circle, longitude running the map's width all the way round.
      const rad = Math.PI / 180;
      const lat0 = latitudeOf(planet.params, y0) * rad,
        lat1 = latitudeOf(planet.params, y1) * rad;
      const dLon = ((x1 - x0) / planet.params.width) * 2 * Math.PI;
      const h = Math.sin((lat1 - lat0) / 2) ** 2 + Math.cos(lat0) * Math.cos(lat1) * Math.sin(dLon / 2) ** 2;
      const radius = (111 * 180) / Math.PI;
      return km(2 * radius * Math.asin(Math.min(1, Math.sqrt(h))), t);
    },
  };
}
