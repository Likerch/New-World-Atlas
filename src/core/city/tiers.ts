// A city's other levels. Above the streets (modern and cyberpunk): the roofs of the tall towers, bridges between
// them, landing pads on the tallest. Below (every era — catacombs and sewers in old towns, an undercity in the new):
// tunnels under the main streets, halls under the crowded quarters, shafts down, a sewer channel along the river.
import type { Point } from "../geometry";
import { name } from "../language";
import { centroid, insetConvex } from "../polygon";
import { createRng } from "../random";
import { organicEra, type City } from "./model";

export type Tier = "upper" | "street" | "under";
export type HallPurpose = "market" | "turf" | "metro" | "flooded" | "cult" | "ossuary" | "smugglers" | "squat";

export interface Hall {
  id: number;
  polygon: Point[];
  center: Point;
  name: string;
  purpose: HallPurpose;
}

export interface Tiers {
  upper: { roofs: Point[][]; bridges: [Point, Point][]; pads: Point[] };
  under: { tunnels: { points: Point[]; width: number }[]; halls: Hall[]; shafts: Point[]; sewer: Point[] | null };
}

export function cityTiers(city: City): Tiers {
  const rng = createRng(`${city.params.seed}/tiers`);
  const m = (metres: number) => metres / city.scale;
  const old = organicEra(city.params.era);
  const tongue = { ...city.language };

  // Above: towers of twenty-five floors and more.
  const towers = city.buildings.filter((b) => b.kind === "tower" && b.floors >= 25);
  const tops = towers.map((b) => centroid(b.polygon));
  const bridges: [Point, Point][] = [];
  const linked = new Set<string>();
  tops.forEach((a, i) => {
    const near = tops
      .map((b, j) => [j, Math.hypot(a[0] - b[0], a[1] - b[1])] as const)
      .filter(([j, d]) => j !== i && d < Math.max(m(140), 18))
      .sort((p, q) => p[1] - q[1])
      .slice(0, 2);
    for (const [j] of near) {
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (linked.has(key)) continue;
      linked.add(key);
      bridges.push([a, tops[j]]);
    }
  });
  for (const street of city.streets) if (street.kind === "skyway") bridges.push([street.points[0], street.points[street.points.length - 1]]);
  // Landing pads crown the thirty tallest towers.
  const pads = [...towers].sort((a, b) => b.floors - a.floors).slice(0, 30).map((b) => centroid(b.polygon));

  // Below: tunnels under the main streets, halls under the crowded quarters.
  const tunnels = city.streets.filter((s) => s.kind === "main" || s.kind === "avenue" || s.kind === "highway" || s.kind === "rail").map((s) => ({ points: s.points, width: Math.max(m(old ? 3 : 9), 2) }));
  const crowded = city.wards.filter((w) => w.urban && ["slum", "craftsmen", "merchants", "temple", "megablock", "combat-zone", "industrial", "residential", "downtown", "commercial", "old-town", "harbour", "port", "ruins", "settlement"].includes(w.kind));
  const halls: Hall[] = [];
  const purposes: HallPurpose[] = old ? ["ossuary", "smugglers", "cult", "flooded", "market", "squat"] : ["market", "turf", "metro", "flooded", "cult", "smugglers", "squat"];
  for (const ward of rng.shuffle([...crowded]).slice(0, Math.max(2, Math.round(crowded.length * 0.45)))) {
    const shape = insetConvex(ward.polygon, Math.sqrt(Math.abs(ward.polygon.reduce((s, p, k) => s + p[0] * ward.polygon[(k + 1) % ward.polygon.length][1] - ward.polygon[(k + 1) % ward.polygon.length][0] * p[1], 0) / 2)) * 0.28);
    if (!shape) continue;
    const purpose = halls.length === 0 ? (old ? "ossuary" : "market") : rng.pick(purposes);
    halls.push({ id: halls.length + 1, polygon: shape, center: centroid(shape), name: name(tongue, rng, "plain"), purpose });
  }
  // Shafts: at the ways down the city already knows, and along the tunnels.
  const shafts: Point[] = city.landmarks.filter((l) => l.kind === "undercity").map((l) => [l.x, l.y]);
  for (const hall of halls) shafts.push(hall.center);
  return { upper: { roofs: towers.map((b) => b.polygon), bridges, pads }, under: { tunnels, halls, shafts, sewer: city.river?.points ?? null } };
}
