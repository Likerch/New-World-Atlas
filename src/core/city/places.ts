// Places a town has beyond its first ones. A bigger town has more of them: more taverns and inns, parish churches,
// smithies, baths and guildhalls (hospitals, police and clubs in the machine ages). What the world gives a town shows:
// a palace in a capital, a cathedral in a holy or a great city, a bank, a mage's tower where there is magic, a prison,
// the ruins of an older town outside the walls, a nomads' camp of tents by a gate, the temples dedicated to the
// world's god. The game master's own kinds of place turn up in the quarters they belong in. All of it comes from
// streams of its own and is added after the generator's places, so those keep their numbers and their houses.
import type { Point } from "../geometry";
import { name, type Language } from "../language";
import { area, centroid, pointInPolygon } from "../polygon";
import { hashString, type Rng } from "../random";
import type { Layout } from "./layout";
import { organicEra, PROPS, type Building, type CityParams, type Landmark, type LandmarkKind, type WardKind } from "./model";

export function morePlaces(params: CityParams, layout: Layout, buildings: Building[], landmarks: Landmark[], language: Language, rng: Rng): { landmarks: Landmark[]; buildings: Building[] } {
  const out: Landmark[] = [];
  const extra: Building[] = [];
  const tongue = { ...language };
  const era = params.era;
  const pop = params.population;
  let next = landmarks.reduce((top, landmark) => Math.max(top, landmark.id), 0) + 1;
  const taken = new Set<Building>(buildings.filter((b) => landmarks.some((l) => l.ward === b.ward && b.polygon.length && pointInPolygon([l.x, l.y], b.polygon))));
  const wardsOf = (kinds: WardKind[]) => new Set(layout.diagram.sites.map((_, ward) => ward).filter((ward) => kinds.includes(layout.kinds[ward])));
  const add = (kind: LandmarkKind, at: Point, ward: number, named: boolean, own: Rng, extraFields: Partial<Landmark> = {}) => {
    out.push({ id: next++, kind, x: at[0], y: at[1], ward, name: named ? name(tongue, own, "plain") : "", ...extraFields });
  };
  /** A free building in the given quarters: the biggest, or one at random. */
  const place = (kind: LandmarkKind, kinds: WardKind[], own: Rng, biggest = false, named = true, extraFields: Partial<Landmark> = {}) => {
    const wards = wardsOf(kinds);
    const options = buildings.filter((b) => wards.has(b.ward) && !taken.has(b) && !PROPS.includes(b.kind) && b.kind !== "shed" && b.kind !== "ruin" && b.polygon.length > 2);
    if (!options.length) return false;
    const pick = biggest ? options.reduce((best, b) => (area(b.polygon) > area(best.polygon) ? b : best)) : own.pick(options);
    taken.add(pick);
    add(kind, centroid(pick.polygon), pick.ward, named, own, extraFields);
    return true;
  };

  // More of everything as the town grows.
  const grow = rng.fork("grow");
  const count = (over: number, per: number, most: number) => Math.max(0, Math.min(most, Math.floor((pop - over) / per)));
  if (organicEra(era) && era !== "stone") {
    for (let k = count(25, 6, 10); k > 0; k--) place("tavern", ["merchants", "craftsmen", "slum", "suburb", "harbour"], grow);
    for (let k = count(8, 12, 6); k > 0; k--) place("temple", ["craftsmen", "merchants", "suburb", "patriciate"], grow);
    for (let k = count(4, 12, 5); k > 0; k--) place("smithy", ["craftsmen", "suburb", "military"], grow);
    for (let k = count(10, 20, 3); k > 0; k--) place("bathhouse", ["merchants", "craftsmen"], grow);
    for (let k = count(15, 20, 3); k > 0; k--) place("guildhall", ["merchants", "craftsmen", "administration"], grow, true);
  } else if (era === "industrial") {
    for (let k = count(30, 30, 6); k > 0; k--) place("tavern", ["residential", "industrial", "old-town"], grow);
    for (let k = count(40, 50, 4); k > 0; k--) place("police", ["residential", "old-town"], grow, false, false);
    for (let k = count(60, 80, 3); k > 0; k--) place("hospital", ["residential", "commercial"], grow, true);
  } else if (era === "modern" || era === "cyberpunk") {
    for (let k = count(300, 400, 4); k > 0; k--) place("hospital", ["residential", "commercial", "megablock"], grow, true);
    for (let k = count(250, 300, 5); k > 0; k--) place("police", ["residential", "commercial", "megablock"], grow, false, false);
    for (let k = count(200, 200, 6); k > 0; k--) place("club", ["commercial", "downtown", "megablock"], grow);
    if (era === "cyberpunk") for (let k = count(300, 300, 4); k > 0; k--) place("ripperdoc", ["megablock", "combat-zone"], grow);
  }

  // What the world gives the town.
  const world = rng.fork("world");
  const faith = params.faith;
  const deity = faith?.deity ? { deity: faith.deity } : {};
  if (params.capital && era !== "stone") place("palace", ["castle", "administration", "patriciate", "downtown", "arcology", "settlement", "merchants"], world, true);
  if (organicEra(era) && era !== "stone" && (faith?.holy || pop > 30)) place("cathedral", ["temple", "merchants", "patriciate", "administration"], world, true, true, deity);
  if (["renaissance", "industrial", "modern", "cyberpunk"].includes(era) && pop > (organicEra(era) ? 8 : 200)) place("bank", ["merchants", "downtown", "commercial", "old-town", "administration"], world, true);
  if (((params.magic ?? 0) >= 2 || ((params.magic ?? 0) >= 1 && pop > 12)) && ["ancient", "medieval", "renaissance"].includes(era)) for (let k = (params.magic ?? 0) >= 2 ? 2 : 1; k > 0; k--) place("mage-tower", ["patriciate", "administration", "merchants", "craftsmen"], world);
  if ((organicEra(era) && era !== "stone" && pop > 30) || (era === "industrial" && pop > 80)) place("prison", ["military", "administration", "slum", "castle", "residential"], world, true, false);
  // The ruins of an older town out in the fields or the woods.
  if (organicEra(era) && era !== "stone" && hashString(`${params.seed}/old-ruins`) % 3 === 0) {
    const far = layout.diagram.sites.map((site, ward) => ({ site, ward })).filter(({ ward }) => !layout.urban[ward] && !layout.water[ward] && (layout.kinds[ward] === "wild" || layout.kinds[ward] === "farm"));
    const spot = far.sort((a, b) => Math.hypot(b.site[0] - layout.center[0], b.site[1] - layout.center[1]) - Math.hypot(a.site[0] - layout.center[0], a.site[1] - layout.center[1]))[Math.floor(world.float(0, Math.min(4, far.length)))];
    if (spot && spot.site[0] > 30 && spot.site[1] > 30 && spot.site[0] < params.width - 30 && spot.site[1] < params.height - 30) add("old-ruins", spot.site, spot.ward, true, world);
  }
  // The temples keep the world's god.
  if (faith?.deity) for (const landmark of [...landmarks, ...out]) if (landmark.kind === "temple" && !landmark.deity) landmark.deity = faith.deity;

  // Nomads camp in a ring of tents before a gate.
  if (params.nomads && era !== "stone") {
    const camp = rng.fork("camp");
    const wall = layout.walls.find((item) => !item.citadel);
    const gate = wall?.gates.length ? camp.pick(wall.gates) : null;
    const out2: Point = gate ? [gate[0] + (gate[0] - layout.center[0]) * 0.35, gate[1] + (gate[1] - layout.center[1]) * 0.35] : [layout.center[0] + layout.radius * 1.3, layout.center[1]];
    const at: Point = [Math.max(40, Math.min(params.width - 40, out2[0])), Math.max(40, Math.min(params.height - 40, out2[1]))];
    const m = (metres: number) => metres / layout.scale;
    const ring = Math.max(m(18), 10);
    const ward = layout.diagram.sites.reduce((best, site, k) => (Math.hypot(site[0] - at[0], site[1] - at[1]) < Math.hypot(layout.diagram.sites[best][0] - at[0], layout.diagram.sites[best][1] - at[1]) ? k : best), 0);
    const solid = buildings.filter((b) => !PROPS.includes(b.kind) && b.polygon.length > 2);
    for (let k = camp.int(8, 18); k > 0; k--) {
      const angle = camp.float(0, Math.PI * 2);
      const reach = ring * Math.sqrt(camp.float(0.1, 1));
      const c: Point = [at[0] + Math.cos(angle) * reach, at[1] + Math.sin(angle) * reach];
      const r = Math.max(m(camp.float(2.5, 4)), 1.4);
      if (layout.sea && pointInPolygon(c, layout.sea)) continue;
      if (solid.some((b) => pointInPolygon(c, b.polygon)) || extra.some((t) => Math.hypot(centroid(t.polygon)[0] - c[0], centroid(t.polygon)[1] - c[1]) < r * 2.2)) continue;
      extra.push({ polygon: Array.from({ length: 8 }, (_, j): Point => [c[0] + Math.cos((j * Math.PI) / 4) * r, c[1] + Math.sin((j * Math.PI) / 4) * r]), ward, kind: "tent", floors: 1 });
    }
    if (extra.length) add("tents", at, ward, true, camp);
  }

  // The game master's own kinds of place, in the quarters they belong in.
  const own = rng.fork("custom");
  for (const kind of params.custom?.places ?? []) {
    const kinds = kind.where.length ? kind.where : (layout.kinds.filter((_, ward) => layout.urban[ward]) as WardKind[]);
    const stream = own.fork(kind.id);
    for (let k = 0; k < Math.max(0, Math.min(30, kind.count)); k++) if (!place("custom", kinds, stream, false, true, { custom: kind.id })) break;
  }
  return { landmarks: out, buildings: extra };
}
