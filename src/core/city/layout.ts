// City layout: wards as Voronoi cells packed densely around the centre, the sea and the river, which wards are
// town proper, what each ward is for, and the wall with its gates and towers.
import { chainSegments, type Point } from "../geometry";
import { fbm, noise2 } from "../noise";
import { area, distanceToPolyline, pointInPolygon } from "../polygon";
import type { Rng } from "../random";
import { voronoi, type Voronoi } from "../voronoi";
import { organicEra, type CityParams, type Wall, type WardKind } from "./model";

export interface Layout {
  center: Point;
  /** Radius of the town proper, map units. */
  radius: number;
  /** Metres per map unit. */
  scale: number;
  diagram: Voronoi;
  sea: Point[] | null;
  river: { points: Point[]; width: number } | null;
  water: boolean[];
  urban: boolean[];
  kinds: WardKind[];
  wealth: number[];
  angles: number[];
  walls: Wall[];
  /** Corner ids of the gates in the wall. */
  gates: number[];
}

/** People per hectare in the built-up area, by era. */
const DENSITY = { stone: 60, ancient: 200, medieval: 220, renaissance: 260, industrial: 300, modern: 90, cyberpunk: 420, "far-future": 160, "post-apocalypse": 4 };

const isSeaAt = (sea: Point[] | null, p: Point) => !!sea && pointInPolygon(p, sea);

export function layoutCity(params: CityParams, rng: Rng): Layout {
  const W = params.width;
  const H = params.height;
  const organic = organicEra(params.era);
  const radius = Math.min(W, H) * 0.3;
  const builtArea = (params.population * 1000) / (DENSITY[params.era] / 10_000);
  const scale = Math.sqrt(builtArea / Math.PI) / radius;
  // A dead city keeps the districts of the city it was, however few live there now.
  const wardCount = params.era === "post-apocalypse" ? 18 : organic ? Math.round(Math.min(70, Math.max(5, 4 + Math.sqrt(params.population) * 3.2))) : Math.round(Math.min(32, Math.max(7, 5 + Math.sqrt(params.population) * 0.75)));

  // Keep the town away from the sea; the centre shifts inland.
  let center: Point = [W / 2, H / 2];
  const toSea: Point | null = params.coast === null ? null : [Math.cos(params.coast), Math.sin(params.coast)];
  if (toSea) center = [W / 2 - toSea[0] * radius * 0.35, H / 2 - toSea[1] * radius * 0.35];

  // The coastline: a ragged line across the frame, the sea beyond it.
  let sea: Point[] | null = null;
  if (toSea) {
    const along: Point = [-toSea[1], toSea[0]];
    const wave = noise2(rng.fork("coast"));
    const reach = Math.hypot(W, H);
    const offset = radius * rng.float(0.75, 1.0);
    const shore: Point[] = [];
    for (let t = -reach; t <= reach; t += 8) {
      const d = offset + fbm(wave, t / 220, 0.5, 4) * radius * 0.35;
      shore.push([center[0] + toSea[0] * d + along[0] * t, center[1] + toSea[1] * d + along[1] * t]);
    }
    const far = (p: Point): Point => [p[0] + toSea[0] * reach * 2, p[1] + toSea[1] * reach * 2];
    sea = [...shore, far(shore[shore.length - 1]), far(shore[0])];
  }

  // Sites: darts thrown over the frame, each keeping a gap from the others. The gap is small in the town and widens
  // over the countryside; a noise field makes patches of big quarters and of small ones, and stretches the gap one
  // way in places, so some wards come out long and narrow (along a river, behind a wall) and no two look alike.
  const mean = Math.sqrt((Math.PI * radius * radius) / wardCount) * 1.02;
  const sizes = noise2(rng.fork("ward-sizes"));
  const lean = noise2(rng.fork("ward-lean"));
  const unequal = rng.float(0.75, 1.05);
  const gapAt = (p: Point) => {
    const d = Math.hypot(p[0] - center[0], p[1] - center[1]) / radius;
    return mean * (0.85 + 0.2 * Math.min(1, d)) * (1 + Math.max(0, d - 1) * 0.9) * Math.exp(unequal * fbm(sizes, p[0] / radius, p[1] / radius, 3));
  };
  const stretchAt = (p: Point): [number, number] => {
    const s = fbm(lean, p[0] / (radius * 1.3) + 7.1, p[1] / (radius * 1.3) - 3.4, 2);
    return [s * Math.PI * 1.5, 1 + Math.max(0, Math.abs(s) - 0.1) * 3.6];
  };
  const sites: Point[] = [];
  const gaps: number[] = [];
  for (let attempt = 0, misses = 0; attempt < 40_000 && misses < 2500; attempt++) {
    const p: Point = [rng.float(2, W - 2), rng.float(2, H - 2)];
    const gap = gapAt(p);
    const [angle, stretch] = stretchAt(p);
    const ux = Math.cos(angle),
      uy = Math.sin(angle);
    const near = sites.some((q, k) => {
      const dx = q[0] - p[0],
        dy = q[1] - p[1];
      // Measured in the stretched frame: closer along the lean, farther across it.
      const along = (dx * ux + dy * uy) * stretch,
        across = (dx * -uy + dy * ux) / stretch;
      return along * along + across * across < Math.min(gap, gaps[k]) ** 2;
    });
    if (near) {
      misses++;
      continue;
    }
    misses = 0;
    sites.push(p);
    gaps.push(gap);
  }
  const diagram = voronoi(sites, W, H);
  const n = diagram.sites.length;
  const centerOf = (ward: number) => diagram.sites[ward];
  const dist = (ward: number) => Math.hypot(centerOf(ward)[0] - center[0], centerOf(ward)[1] - center[1]);
  const water = diagram.cells.map((cell, ward) => isSeaAt(sea, centerOf(ward)) || area(cell) < 1);

  // The river: meanders through the town towards its mouth (into the sea when there is one).
  let river: Layout["river"] = null;
  if (params.river !== null) {
    let flow = params.river;
    if (toSea) flow = params.coast! + rng.float(-0.5, 0.5);
    const dir: Point = [Math.cos(flow), Math.sin(flow)];
    const side: Point = [-dir[1], dir[0]];
    const bend = noise2(rng.fork("river"));
    const shift = rng.float(-0.25, 0.25) * radius;
    const reach = Math.hypot(W, H) / 2 + 40;
    const points: Point[] = [];
    for (let t = -reach; t <= reach; t += 10) {
      const p: Point = [center[0] + dir[0] * t + side[0] * (shift + fbm(bend, t / 260, 3.1, 3) * radius * 0.45), center[1] + dir[1] * t + side[1] * (shift + fbm(bend, t / 260, 3.1, 3) * radius * 0.45)];
      points.push(p);
      if (isSeaAt(sea, p) && points.length > 2) break;
    }
    const width = Math.min(70, Math.max(7, rng.float(18, 45) / scale));
    river = { points, width };
  }

  // The town proper: the land wards nearest the centre.
  const land = Array.from({ length: n }, (_, ward) => ward).filter((ward) => !water[ward]);
  const byDistance = [...land].sort((a, b) => dist(a) * rng.float(0.95, 1.05) - dist(b) * rng.float(0.95, 1.05));
  const urban = new Array<boolean>(n).fill(false);
  if (organic) for (const ward of byDistance.slice(0, wardCount)) urban[ward] = true;
  else for (const ward of land) urban[ward] = dist(ward) < radius * 1.12;

  const kinds = new Array<WardKind>(n).fill("wild");
  const wealth = new Array<number>(n).fill(0.3);
  const angles = new Array<number>(n).fill(0);
  const near = (ward: number, test: (other: number) => boolean) => diagram.neighbors[ward].some(test);
  const coastal = (ward: number) => near(ward, (other) => water[other]);
  const riverside = (ward: number) => !!river && distanceToPolyline(centerOf(ward), river.points) < radius * 0.25;
  const edgeOfTown = (ward: number) => near(ward, (other) => !urban[other] && !water[other]);
  const urbanOrder = byDistance.filter((ward) => urban[ward]);
  const taken = new Set<number>();
  const assign = (ward: number | undefined, kind: WardKind) => {
    if (ward === undefined || taken.has(ward)) return;
    kinds[ward] = kind;
    taken.add(ward);
  };

  if (params.era === "stone") {
    // A camp: the gathering place with its fire, a sacred place, huts all round, gardens and pens outside.
    assign(urbanOrder[0], "plaza");
    if (params.temple || wardCount > 6) assign(urbanOrder.find((ward) => !taken.has(ward) && edgeOfTown(ward)), "temple");
    for (const ward of urbanOrder) {
      wealth[ward] = rng.float(0.1, 0.5);
      if (!taken.has(ward)) kinds[ward] = "craftsmen";
    }
    for (const ward of land) if (!urban[ward]) kinds[ward] = near(ward, (other) => urban[other]) && rng.chance(0.5) ? "farm" : "wild";
  } else if (organic) {
    if (params.market || params.era === "ancient") assign(urbanOrder[0], "plaza");
    if (params.temple) assign(urbanOrder.find((ward) => !taken.has(ward)), "temple");
    if (params.citadel) {
      const rim = urbanOrder.filter((ward) => edgeOfTown(ward) && !taken.has(ward) && !coastal(ward));
      assign(rim.sort((a, b) => area(diagram.cells[b]) - area(diagram.cells[a]))[0], "castle");
    }
    if (params.port && sea) for (const ward of urbanOrder.filter((w) => coastal(w) && !taken.has(w)).slice(0, Math.max(1, Math.round(wardCount / 5)))) assign(ward, "harbour");
    if (wardCount >= 12) assign(urbanOrder.slice(1, 6).find((ward) => !taken.has(ward)), "administration");
    if (params.walls && wardCount >= 10) assign(urbanOrder.filter((ward) => edgeOfTown(ward) && !taken.has(ward))[0], "military");
    if (wardCount >= 8) assign(urbanOrder.filter((ward) => edgeOfTown(ward) && !taken.has(ward)).pop(), "cemetery");
    for (const ward of urbanOrder) {
      const rank = urbanOrder.indexOf(ward) / Math.max(1, urbanOrder.length - 1);
      wealth[ward] = Math.max(0, Math.min(1, 1 - rank + rng.float(-0.2, 0.2) - (riverside(ward) ? 0.1 : 0)));
      if (taken.has(ward)) continue;
      if (rng.chance(0.05) && rank > 0.2) kinds[ward] = "park";
      else if (wealth[ward] > 0.75 && !edgeOfTown(ward)) kinds[ward] = "patriciate";
      else if (wealth[ward] > 0.5) kinds[ward] = "merchants";
      else if (wealth[ward] > 0.18 || !params.shanty) kinds[ward] = "craftsmen";
      else kinds[ward] = "slum";
    }
    for (const ward of land) {
      if (urban[ward]) continue;
      const next = near(ward, (other) => urban[other]);
      if (next && params.shanty && rng.chance(0.4)) kinds[ward] = "slum";
      else if (next && rng.chance(0.35)) kinds[ward] = "suburb";
      else kinds[ward] = dist(ward) < radius * 2.3 ? "farm" : "wild";
    }
  } else {
    const cyber = params.era === "cyberpunk";
    const modern = params.era === "modern";
    const future = params.era === "far-future";
    const fallen = params.era === "post-apocalypse";
    assign(urbanOrder[0], cyber || future ? "arcology" : params.era === "industrial" ? "old-town" : fallen ? "ruins" : "downtown");
    if (cyber || modern || future) for (const ward of urbanOrder.slice(1, 4)) assign(ward, cyber || future ? "commercial" : "downtown");
    // After the fall the survivors hold a ward or two of the dead city behind barricades.
    if (fallen) for (const ward of urbanOrder.slice(Math.floor(urbanOrder.length * 0.25)).filter((w) => !taken.has(w) && !coastal(w)).slice(0, params.population > 8 ? 2 : 1)) assign(ward, "settlement");
    if (params.port && sea) for (const ward of urbanOrder.filter((w) => coastal(w) && !taken.has(w)).slice(0, 2)) assign(ward, "port");
    if (modern || future) assign(urbanOrder.slice(Math.floor(urbanOrder.length / 3)).find((ward) => !taken.has(ward)), "campus");
    if (future) assign(urbanOrder.filter((ward) => edgeOfTown(ward) && !taken.has(ward) && !coastal(ward)).pop(), "spaceport");
    const holds = urbanOrder.filter((ward) => kinds[ward] === "settlement");
    for (const ward of urbanOrder) {
      const rank = urbanOrder.indexOf(ward) / Math.max(1, urbanOrder.length - 1);
      wealth[ward] = Math.max(0, Math.min(1, 1 - rank + rng.float(-0.25, 0.25)));
      angles[ward] = rng.float(0, Math.PI / 2);
      if (taken.has(ward)) continue;
      if (fallen) {
        kinds[ward] = holds.some((hold) => diagram.neighbors[ward].includes(hold)) && rng.chance(0.5) ? "farm" : rng.chance(0.15) ? "wasteland" : rng.chance(0.08) ? "industrial" : "ruins";
        continue;
      }
      if (future && rng.chance(0.22)) kinds[ward] = "park";
      else if (rank < 0.35) kinds[ward] = "commercial";
      else if ((riverside(ward) || coastal(ward) || rank > 0.8) && rng.chance(params.era === "industrial" ? 0.6 : 0.35)) kinds[ward] = "industrial";
      else if (rng.chance(cyber ? 0.03 : 0.1)) kinds[ward] = "park";
      else if (cyber) kinds[ward] = rank > 0.7 && rng.chance(0.5) ? "combat-zone" : "megablock";
      else kinds[ward] = wealth[ward] > 0.55 && rng.chance(0.5) ? "rich-residential" : "residential";
    }
    for (const ward of land) {
      if (urban[ward]) continue;
      angles[ward] = rng.float(0, Math.PI / 2);
      const next = near(ward, (other) => urban[other]);
      kinds[ward] = fallen ? (next && rng.chance(0.25) ? "slum" : "wild") : future ? (next && rng.chance(0.5) ? "park" : dist(ward) < radius * 2 ? "farm" : "wild") : next ? (cyber ? "combat-zone" : modern ? "suburb" : "farm") : dist(ward) < radius * 2 && !cyber ? "farm" : "wild";
    }
  }
  for (let ward = 0; ward < n; ward++) if (water[ward]) kinds[ward] = "wild";

  // Walls around the town proper (walled eras only), with a citadel ring of its own.
  const walls: Wall[] = [];
  const gates: number[] = [];
  if (organic && params.walls) {
    const segments: [number, number][] = [];
    for (let ward = 0; ward < n; ward++) {
      if (!urban[ward]) continue;
      for (const side of diagram.sides[ward]) if (side.other >= n || !urban[side.other]) segments.push([side.b, side.a]);
    }
    const rings = chainSegments(segments).filter((chain) => chain[0] === chain[chain.length - 1]);
    const ring = rings.sort((a, b) => b.length - a.length)[0] ?? [];
    const points = ring.slice(0, -1).map((corner) => diagram.corners[corner]);
    if (points.length > 3) {
      // Gates: spread around the ring, never facing the sea or standing in the river.
      const count = Math.max(2, Math.min(6, Math.round(2 + wardCount / 8)));
      const angleOf = (corner: number) => Math.atan2(diagram.corners[corner][1] - center[1], diagram.corners[corner][0] - center[0]);
      const usable = ring.slice(0, -1).filter((corner) => {
        const p = diagram.corners[corner];
        const out: Point = [p[0] + (p[0] - center[0]) * 0.15, p[1] + (p[1] - center[1]) * 0.15];
        return !isSeaAt(sea, out) && !(river && distanceToPolyline(p, river.points) < river.width * 1.5);
      });
      const start = rng.float(0, Math.PI * 2);
      for (let k = 0; k < count && usable.length; k++) {
        const target = start + (k * Math.PI * 2) / count;
        let best = usable[0];
        let gap = Infinity;
        for (const corner of usable) {
          const d = Math.abs(Math.atan2(Math.sin(angleOf(corner) - target), Math.cos(angleOf(corner) - target)));
          if (d < gap) {
            gap = d;
            best = corner;
          }
        }
        if (!gates.includes(best)) gates.push(best);
      }
      walls.push({ ring: points, towers: points.filter((_, index) => index % 2 === 0), gates: gates.map((corner) => diagram.corners[corner]), bastions: params.era === "renaissance", citadel: false });
    }
  }
  // Barricades round the survivors' holds: scrap walls with a gate, no towers.
  for (let ward = 0; ward < n; ward++) {
    if (kinds[ward] !== "settlement") continue;
    const ring = diagram.cells[ward];
    walls.push({ ring, towers: ring.filter((_, index) => index % 3 === 0), gates: [ring[Math.floor(rng.float(0, ring.length))]], bastions: false, citadel: false });
  }
  const castle = kinds.indexOf("castle");
  if (castle >= 0) walls.push({ ring: diagram.cells[castle], towers: diagram.cells[castle], gates: [], bastions: params.era === "renaissance", citadel: true });

  return { center, radius, scale, diagram, sea, river, water, urban, kinds, wealth, angles, walls, gates };
}
