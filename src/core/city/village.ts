// A village or a hamlet instead of a town. A village strings its farmsteads along a road (a crossroads with a green, a
// well, a church with its graveyard, an inn, a smithy, a mill on the river); each farmstead is a house facing the road
// with a barn behind it round a yard, an orchard or a kitchen garden, and the strips of its fields beyond. A hamlet is a
// farmstead or a few round a shared yard at the end of a track. It is a City in shape, so its houses open as plans and
// its places as everywhere else.
import type { Point } from "../geometry";
import { name, type Language } from "../language";
import { fbm, noise2 } from "../noise";
import { area, ccw, centroid, distanceToPolyline, insetConvex, pointInPolygon, segmentIntersection, splitConvex } from "../polygon";
import { createRng } from "../random";
import { voronoi } from "../voronoi";
import type { Building, City, CityParams, Landmark, Street, Ward, WardKind } from "./model";

/** A rectangle of the given size centred on a point, its long side along a heading. */
function box(at: Point, along: number, length: number, depth: number): Point[] {
  const ux = Math.cos(along),
    uy = Math.sin(along);
  const vx = -uy,
    vy = ux;
  const l = length / 2,
    d = depth / 2;
  return [
    [at[0] - ux * l - vx * d, at[1] - uy * l - vy * d],
    [at[0] + ux * l - vx * d, at[1] + uy * l - vy * d],
    [at[0] + ux * l + vx * d, at[1] + uy * l + vy * d],
    [at[0] - ux * l + vx * d, at[1] - uy * l + vy * d],
  ];
}

/** A road across the frame through a point, bending a little. */
function road(at: Point, angle: number, reach: number, bend: (t: number) => number, from = -1): Point[] {
  const points: Point[] = [];
  const dir: Point = [Math.cos(angle), Math.sin(angle)];
  const side: Point = [-dir[1], dir[0]];
  for (let t = from * reach; t <= reach; t += 20) points.push([at[0] + dir[0] * t + side[0] * bend(t), at[1] + dir[1] * t + side[1] * bend(t)]);
  return points;
}

export function generateVillage(params: CityParams, language: Language): City {
  const rng = createRng(params.seed).fork("village");
  const W = params.width,
    H = params.height;
  const hamlet = params.settlement === "hamlet";
  const scale = hamlet ? 0.3 : Math.max(0.6, Math.min(1.3, 0.55 + params.population * 0.5));
  const m = (metres: number) => metres / scale;
  const center: Point = [W / 2, H / 2];
  const reach = Math.hypot(W, H);
  const wave = noise2(rng.fork("bend"));
  const along = rng.float(0, Math.PI);
  const streets: Street[] = [];
  const tongue = { ...language };
  const named = (on: boolean) => (on ? name(tongue, rng, "plain") : "");

  // The sea along one side, and the river through.
  let sea: Point[] | null = null;
  if (params.coast !== null) {
    const toSea: Point = [Math.cos(params.coast), Math.sin(params.coast)];
    const off = Math.min(W, H) * 0.42;
    const sideways: Point = [-toSea[1], toSea[0]];
    const shore: Point[] = [];
    for (let t = -reach; t <= reach; t += 10) {
      const d = off + fbm(wave, t / 200, 4.2, 3) * m(40);
      shore.push([center[0] + toSea[0] * d + sideways[0] * t, center[1] + toSea[1] * d + sideways[1] * t]);
    }
    sea = [...shore, [shore[shore.length - 1][0] + toSea[0] * reach * 2, shore[shore.length - 1][1] + toSea[1] * reach * 2], [shore[0][0] + toSea[0] * reach * 2, shore[0][1] + toSea[1] * reach * 2]];
  }
  const wetSea = (p: Point) => !!sea && pointInPolygon(p, sea);
  let river: City["river"] = null;
  if (params.river !== null) {
    const shift = rng.float(-0.2, 0.2) * Math.min(W, H);
    const points = road([center[0] + Math.cos(params.river + Math.PI / 2) * shift, center[1] + Math.sin(params.river + Math.PI / 2) * shift], params.river, reach / 2, (t) => fbm(wave, t / 300, 9.1, 3) * m(60)).filter((p, k, all) => k < 2 || !wetSea(all[k - 1]));
    river = { points, width: Math.max(4, m(rng.float(8, 18))) };
  }
  const wet = (poly: Point[]) => poly.some((p) => wetSea(p) || (!!river && distanceToPolyline(p, river.points) < river.width / 2 + m(2)));

  // The roads: the high street through, a lane off it at the crossroads; a hamlet's track from the edge to its yard.
  const bendMain = (t: number) => fbm(wave, t / 400, 1.3, 3) * m(35);
  // A hamlet's track runs from the edge of the map and ends in its yard, in the middle.
  const main = hamlet ? road(center, along, reach / 2, (t) => bendMain(t) * Math.min(1, t / m(60)), 0) : road(center, along, reach / 2, bendMain);
  streets.push({ id: 0, kind: hamlet ? "path" : "road", points: main.filter((p) => !wetSea(p)), width: m(hamlet ? 3 : 7), name: named(!hamlet) });
  const roads = [streets[0].points];
  if (!hamlet) {
    const branch = road(center, along + Math.PI / 2 + rng.float(-0.5, 0.5), reach / 2, (t) => fbm(wave, t / 400, 6.7, 3) * m(30), rng.chance(0.5) ? -1 : 0);
    streets.push({ id: 1, kind: "road", points: branch.filter((p) => !wetSea(p)), width: m(6), name: named(rng.chance(0.6)) });
    roads.push(streets[1].points);
  }
  const bridges: [Point, Point][] = [];
  if (river)
    for (const street of streets)
      for (let k = 1; k < street.points.length; k++)
        for (let j = 1; j < river.points.length; j++) {
          const hit = segmentIntersection(street.points[k - 1], street.points[k], river.points[j - 1], river.points[j]);
          if (!hit) continue;
          const len = Math.hypot(street.points[k][0] - street.points[k - 1][0], street.points[k][1] - street.points[k - 1][1]) || 1;
          const ux = (street.points[k][0] - street.points[k - 1][0]) / len,
            uy = (street.points[k][1] - street.points[k - 1][1]) / len;
          const half = river.width / 2 + m(3);
          bridges.push([[hit[0] - ux * half, hit[1] - uy * half], [hit[0] + ux * half, hit[1] + uy * half]]);
        }

  // Sites: plots along the roads (both sides), the green and the churchyard by the crossing, fields and woods beyond.
  const sites: Point[] = [];
  const plotKinds: WardKind[] = [];
  const frontage = m(hamlet ? 30 : rng.float(28, 40));
  const setback = m(hamlet ? 22 : 26);
  const homes = hamlet ? rng.int(1, 4) : Math.max(6, Math.min(60, Math.round((params.population * 1000) / 5.5)));
  const nearRoad = (p: Point) => roads.some((line) => distanceToPolyline(p, line) < setback * 0.6);
  if (hamlet) {
    // A few farmsteads round the yard at the track's end, none on the track itself.
    for (let k = 0, placed = 0; k < homes * 5 && placed < homes; k++) {
      const angle = along + Math.PI / 2 + ((k + 0.5) / (homes * 5)) * Math.PI * 1.6 - Math.PI * 0.3 + rng.float(-0.1, 0.1);
      const site: Point = [center[0] + Math.cos(angle) * m(34), center[1] + Math.sin(angle) * m(34)];
      // Not in the river or the sea, and not crowding the last one.
      if (wetSea(site) || (river && distanceToPolyline(site, river.points) < river.width / 2 + m(18)) || sites.some((q) => Math.hypot(q[0] - site[0], q[1] - site[1]) < m(28))) continue;
      sites.push(site);
      plotKinds.push("farmstead");
      placed++;
    }
  } else {
    sites.push(center);
    plotKinds.push("plaza");
    let placed = 0;
    for (let step = 1; placed < homes && step < 60; step++)
      for (const line of roads)
        for (const sign of [-1, 1])
          for (const dir of [-1, 1]) {
            if (placed >= homes) break;
            // Walk along the road from the crossing, a plot on either side.
            const target = step * frontage;
            let walked = 0;
            const order = dir > 0 ? line : [...line].reverse();
            const mid = order.reduce((best, p, k) => (Math.hypot(p[0] - center[0], p[1] - center[1]) < Math.hypot(order[best][0] - center[0], order[best][1] - center[1]) ? k : best), 0);
            for (let k = mid + 1; k < order.length; k++) {
              const a = order[k - 1],
                b = order[k];
              const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
              if (walked + len < target) {
                walked += len;
                continue;
              }
              const t = (target - walked) / len;
              const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
              const nx = (-(b[1] - a[1]) / len) * sign,
                ny = ((b[0] - a[0]) / len) * sign;
              const site: Point = [p[0] + nx * setback, p[1] + ny * setback];
              if (site[0] > 20 && site[1] > 20 && site[0] < W - 20 && site[1] < H - 20 && !wetSea(site) && !(river && distanceToPolyline(site, river.points) < river.width + m(10)) && sites.every((q) => Math.hypot(q[0] - site[0], q[1] - site[1]) > frontage * 0.7)) {
                sites.push(site);
                plotKinds.push(placed === 0 ? "temple" : "farmstead");
                placed++;
              }
              break;
            }
          }
  }
  // Fields and woods all round, thinner further out.
  for (let k = 0; k < 160; k++) {
    const p: Point = [rng.float(10, W - 10), rng.float(10, H - 10)];
    if (sites.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < m(hamlet ? 45 : 70))) continue;
    sites.push(p);
    plotKinds.push(wetSea(p) ? "wild" : Math.hypot(p[0] - center[0], p[1] - center[1]) < Math.min(W, H) * (hamlet ? 0.38 : 0.45) || rng.chance(0.3) ? "farm" : "wild");
  }
  const diagram = voronoi(sites, W, H);

  const wards: Ward[] = [];
  const buildings: Building[] = [];
  const landmarks: Landmark[] = [];
  const add = (kind: Landmark["kind"], at: Point, ward: number, own: boolean, extra: Partial<Landmark> = {}) => landmarks.push({ id: landmarks.length + 1, kind, x: at[0], y: at[1], ward, name: own ? name(tongue, rng, "plain") : "", ...extra });
  const modern = !["stone", "ancient", "medieval", "renaissance", "industrial"].includes(params.era);
  const fallen = params.era === "post-apocalypse";
  diagram.cells.forEach((cell, id) => {
    const kind = plotKinds[id];
    const site = diagram.sites[id];
    if (cell.length < 3 || area(cell) < 1 || wetSea(site)) return;
    const urban = kind === "farmstead" || kind === "plaza" || kind === "temple";
    wards.push({ id, kind, polygon: cell, center: site, urban, name: kind === "plaza" && !hamlet ? name(tongue, rng, "plain") : "", wealth: rng.float(0.2, 0.6), angle: 0, buildings: 0 });
    const own = rng.fork(`plot-${id}`);
    const inner = insetConvex(cell, m(3)) ?? cell;
    const push = (polygon: Point[], buildingKind: Building["kind"], floors: number) => {
      if (!wet(polygon) && !roads.some((line) => polygon.some((p) => distanceToPolyline(p, line) < m(4)))) buildings.push({ polygon, ward: id, kind: buildingKind, floors });
    };
    // The way the plot faces: towards the nearest road.
    const facing = (() => {
      let best: Point = site;
      let d = Infinity;
      for (const line of roads)
        for (const p of line) {
          const e = Math.hypot(p[0] - site[0], p[1] - site[1]);
          if (e < d) ((d = e), (best = p));
        }
      return Math.atan2(best[1] - site[1], best[0] - site[0]);
    })();
    const toward = (dist: number): Point => [site[0] + Math.cos(facing) * dist, site[1] + Math.sin(facing) * dist];
    if (kind === "farmstead") {
      // The house along the road, the barn behind it, the yard between, the orchard or garden at the back.
      push(box(toward(m(8)), facing + Math.PI / 2, m(own.float(10, 15)), m(own.float(7, 9))), "house", own.int(1, 2));
      push(box(toward(-m(10)), facing + Math.PI / 2, m(own.float(12, 18)), m(own.float(7, 10))), modern ? "shed" : "industrial", 1);
      push(box(toward(-m(1)), facing + Math.PI / 2, m(10), m(6)), "yard", 0);
      for (let k = own.int(3, 8); k > 0; k--) {
        const at: Point = [site[0] + own.float(-1, 1) * m(16), site[1] + own.float(-1, 1) * m(16)];
        const r = m(own.float(1.8, 3));
        const tree = Array.from({ length: 6 }, (_, j): Point => [at[0] + Math.cos((j * Math.PI) / 3) * r, at[1] + Math.sin((j * Math.PI) / 3) * r]);
        if (pointInPolygon(at, inner) && !buildings.some((b) => b.ward === id && b.kind !== "tree" && pointInPolygon(at, b.polygon))) push(tree, "tree", 0);
      }
      return;
    }
    if (kind === "plaza") {
      // The green: a well in the middle, the inn and the smithy by it.
      add("market-well", site, id, false);
      return;
    }
    if (kind === "temple") {
      const chapel = box(toward(m(10)), facing + Math.PI / 2, m(fallen ? 8 : 18), m(fallen ? 6 : 9));
      push(chapel, "landmark", 1);
      add("temple", centroid(chapel), id, true, params.faith?.deity ? { deity: params.faith.deity } : {});
      for (let row = 0; row < 3; row++) for (let col = -3; col <= 3; col++) push(box([site[0] - Math.cos(facing) * m(4 + row * 4) + Math.cos(facing + Math.PI / 2) * m(col * 3), site[1] - Math.sin(facing) * m(4 + row * 4) + Math.sin(facing + Math.PI / 2) * m(col * 3)], facing, m(2), m(1.2)), "grave", 0);
      return;
    }
    if (kind === "farm") {
      // Strips of field across the plot.
      const angle = facing + own.float(-0.4, 0.4);
      const dir: Point = [Math.cos(angle), Math.sin(angle)];
      let rest = inner;
      const width = m(own.float(18, 30));
      const c = centroid(inner);
      const normal: Point = [-dir[1], dir[0]];
      const offsets = inner.map((p) => (p[0] - c[0]) * normal[0] + (p[1] - c[1]) * normal[1]);
      for (let t = Math.max(...offsets) - width; t > Math.min(...offsets) && rest.length >= 3; t -= width) {
        const [beyond, remaining] = splitConvex(rest, [c[0] + normal[0] * t, c[1] + normal[1] * t], dir);
        const field = beyond.length >= 3 ? insetConvex(beyond, m(1.2)) : null;
        if (field) push(field, "field", 0);
        rest = remaining;
      }
      if (rest.length >= 3) {
        const field = insetConvex(rest, m(1.2));
        if (field) push(field, "field", 0);
      }
      return;
    }
    // Woods.
    const xs = inner.map((p) => p[0]),
      ys = inner.map((p) => p[1]);
    const count = Math.round(area(inner) / (m(14) * m(14)));
    for (let k = 0; k < count; k++) {
      const at: Point = [own.float(Math.min(...xs), Math.max(...xs)), own.float(Math.min(...ys), Math.max(...ys))];
      if (!pointInPolygon(at, inner)) continue;
      const r = m(own.float(2.5, 4.5));
      push(Array.from({ length: 6 }, (_, j): Point => [at[0] + Math.cos((j * Math.PI) / 3) * r, at[1] + Math.sin((j * Math.PI) / 3) * r]), "tree", 0);
    }
  });
  for (const ward of wards) ward.buildings = buildings.filter((b) => b.ward === ward.id && (b.kind === "house" || b.kind === "industrial" || b.kind === "landmark" || b.kind === "shed")).length;

  // The inn and the smithy nearest the green; a mill by the river; a hamlet's well in its yard.
  const houses = buildings.filter((b) => b.kind === "house");
  const byGreen = [...houses].sort((a, b) => Math.hypot(centroid(a.polygon)[0] - center[0], centroid(a.polygon)[1] - center[1]) - Math.hypot(centroid(b.polygon)[0] - center[0], centroid(b.polygon)[1] - center[1]));
  if (!hamlet && byGreen[0]) add(fallen ? "barter-market" : "tavern", centroid(byGreen[0].polygon), byGreen[0].ward, true);
  if (!hamlet && byGreen[1] && params.era !== "stone") add(fallen ? "water-still" : "smithy", centroid(byGreen[1].polygon), byGreen[1].ward, true);
  if (river && !hamlet && !modern) {
    const mill = [...houses].sort((a, b) => distanceToPolyline(centroid(a.polygon), river.points) - distanceToPolyline(centroid(b.polygon), river.points))[0];
    if (mill && distanceToPolyline(centroid(mill.polygon), river.points) < m(120)) add("mill", centroid(mill.polygon), mill.ward, false);
  }
  if (hamlet) {
    const ward = wards.find((w) => pointInPolygon(center, w.polygon))?.id ?? wards[0]?.id ?? 0;
    add("market-well", center, ward, false);
  }
  const village = params.name || name(tongue, rng.fork("name"), "town");
  return {
    params: { ...params, name: village },
    name: village,
    scale,
    center,
    wards: wards.map((ward) => ({ ...ward, polygon: ccw(ward.polygon) })),
    buildings,
    streets,
    walls: [],
    sea,
    river,
    bridges,
    landmarks,
    language,
  };
}
