// A city's other levels. Above the streets (modern and cyberpunk): the roofs of the tall towers, bridges between
// them, landing pads on the tallest; above an old town, its rooftops — planks laid between close roofs for those who
// would rather not use the streets, and the bell towers and keeps to keep a lookout from. Below (every era —
// catacombs and sewers in old towns, cisterns in antiquity, sewer works and the first underground in the age of
// steam, an undercity in the new, vaults and bunkers after the fall): tunnels under the main streets, halls under the
// crowded quarters, shafts down, a sewer channel along the river.
import type { Point } from "../geometry";
import { name } from "../language";
import { centroid, insetConvex } from "../polygon";
import { createRng } from "../random";
import { organicEra, type City } from "./model";

export type Tier = "upper" | "street" | "under";
export type HallPurpose = "market" | "turf" | "metro" | "flooded" | "cult" | "ossuary" | "smugglers" | "squat" | "cistern" | "vault" | "bunker";

export interface Hall {
  id: number;
  polygon: Point[];
  center: Point;
  name: string;
  purpose: HallPurpose;
}

export interface Tiers {
  /** Towers' roofs, skybridges and pads; an old town's rooftops, the planks between them and its lookouts. */
  upper: { roofs: Point[][]; bridges: [Point, Point][]; pads: Point[]; rooftops: Point[][]; planks: [Point, Point][]; lookouts: Point[] };
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
  // An old town's rooftops: the taller houses of its crowded quarters, planks across the narrow gaps between them.
  const rooftops: Point[][] = [];
  const planks: [Point, Point][] = [];
  const lookouts: Point[] = [];
  if (city.params.era !== "stone" && (old || city.params.era === "industrial")) {
    const crowded = new Set(city.wards.filter((w) => ["craftsmen", "merchants", "slum", "old-town", "harbour", "patriciate", "administration", "residential"].includes(w.kind)).map((w) => w.id));
    const roofs = city.buildings.filter((b) => b.kind === "house" && b.floors >= 2 && crowded.has(b.ward) && b.polygon.length > 2).slice(0, 2500);
    rooftops.push(...roofs.map((b) => b.polygon));
    const own = rng.fork("roofs");
    const tops = roofs.map((b) => centroid(b.polygon));
    const reach = Math.max(m(10), 3);
    for (let i = 0; i < tops.length && planks.length < 500; i++) {
      if (!own.chance(0.35)) continue;
      let best = -1;
      let d = Infinity;
      for (let j = 0; j < tops.length; j++) {
        if (j === i || roofs[j].ward !== roofs[i].ward) continue;
        const e = Math.hypot(tops[j][0] - tops[i][0], tops[j][1] - tops[i][1]);
        if (e < d && e < reach) ((d = e), (best = j));
      }
      if (best >= 0) planks.push([tops[i], tops[best]]);
    }
    for (const landmark of city.landmarks) if (["temple", "cathedral", "keep", "palace", "mage-tower", "lighthouse", "old-gate", "town-hall"].includes(landmark.kind)) lookouts.push([landmark.x, landmark.y]);
  }

  // Below: tunnels under the main streets, halls under the crowded quarters.
  const tunnels = city.streets.filter((s) => s.kind === "main" || s.kind === "avenue" || s.kind === "highway" || s.kind === "rail").map((s) => ({ points: s.points, width: Math.max(m(old ? 3 : 9), 2) }));
  const crowded = city.wards.filter((w) => w.urban && ["slum", "craftsmen", "merchants", "temple", "megablock", "combat-zone", "industrial", "residential", "downtown", "commercial", "old-town", "harbour", "port", "ruins", "settlement"].includes(w.kind));
  const halls: Hall[] = [];
  // Each age keeps its own things underground.
  const era = city.params.era;
  const purposes: HallPurpose[] =
    era === "ancient"
      ? ["ossuary", "cistern", "cult", "smugglers", "flooded"]
      : era === "industrial"
        ? ["flooded", "metro", "smugglers", "cult", "squat"]
        : era === "post-apocalypse"
          ? ["vault", "bunker", "squat", "turf", "market", "cult"]
          : old
            ? ["ossuary", "smugglers", "cult", "flooded", "market", "squat"]
            : ["market", "turf", "metro", "flooded", "cult", "smugglers", "squat"];
  const first: HallPurpose = era === "industrial" ? "flooded" : era === "post-apocalypse" ? "vault" : old ? "ossuary" : "market";
  for (const ward of rng.shuffle([...crowded]).slice(0, Math.max(2, Math.round(crowded.length * 0.45)))) {
    const shape = insetConvex(ward.polygon, Math.sqrt(Math.abs(ward.polygon.reduce((s, p, k) => s + p[0] * ward.polygon[(k + 1) % ward.polygon.length][1] - ward.polygon[(k + 1) % ward.polygon.length][0] * p[1], 0) / 2)) * 0.28);
    if (!shape) continue;
    const purpose = halls.length === 0 ? first : rng.pick(purposes);
    halls.push({ id: halls.length + 1, polygon: shape, center: centroid(shape), name: name(tongue, rng, "plain"), purpose });
  }
  // Shafts: at the ways down the city already knows, and along the tunnels.
  const shafts: Point[] = city.landmarks.filter((l) => l.kind === "undercity").map((l) => [l.x, l.y]);
  for (const hall of halls) shafts.push(hall.center);
  return { upper: { roofs: towers.map((b) => b.polygon), bridges, pads, rooftops, planks, lookouts }, under: { tunnels, halls, shafts, sewer: city.river?.points ?? null } };
}
