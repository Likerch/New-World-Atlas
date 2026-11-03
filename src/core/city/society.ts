// Who runs a city and who lives in it, for the game master. The city's factions — guilds, noble houses, gangs, cults,
// churches, corporations, as its age has them — each grow from a home quarter and hold the quarters round it, more
// weakly the further out; where one holds most, the quarter is theirs. Every place has an owner (a person of the city,
// the same on every visit) and the people who work there; a place that is a faction's seat, or stands in a quarter a
// faction holds, answers to it — and the house opened from it keeps that owner, so power runs from the city's factions
// to the owners of its places to the people inside their buildings. Quarters have their people, trades, a headman,
// their look and smell, and three rumours (one false); shops have a craft, an owner and an address.
import { centroid, distanceToPolyline, pointInPolygon } from "../polygon";
import type { Point } from "../geometry";
import { makeFactions, makeNpc, roleFits, rumoursOf, WANTS, type Faction, type FactionKind, type Hearsay, type Npc, type Role, type Rumour } from "../people";
import { createRng } from "../random";
import { craftFor, type Craft } from "../building/crafts";
import { buildingTypeOf } from "../building/from-city";
import { organicEra, PROPS, type City, type Landmark, type LandmarkKind, type WardKind } from "./model";

export interface CityFaction extends Faction {
  /** Its hold on each quarter, 0–1, by ward id. */
  influence: Record<number, number>;
  /** The quarter it grew from. */
  home: number;
  /** The place that is its seat (a landmark id), if the city has one for it. */
  seat: number | null;
  color: string;
}

export interface PlaceInfo {
  landmark: number;
  owner: Npc;
  staff: Npc[];
  /** The faction the place answers to, by id. */
  faction: string | null;
  hook: Hearsay;
  rumours: Rumour[];
}

export interface WardInfo {
  ward: number;
  /** About how many people live there. */
  people: number;
  trades: Craft[];
  /** The faction holding the quarter and how firmly (0–1). */
  faction: string | null;
  share: number;
  headman: Npc;
  /** What it looks, sounds and smells like: keys ("wardtrait.tanneries"). */
  traits: string[];
  hook: Hearsay;
  rumours: Rumour[];
}

export interface Address {
  street: number;
  name: string;
  number: number;
}

export interface ShopInfo {
  building: number;
  ward: number;
  craft: Craft;
  owner: Npc;
  address: Address | null;
}

export interface CitySociety {
  factions: CityFaction[];
  /** Who governs: the ruler, the steward, the captain of the guard, the high priest (as the age has them). */
  council: Npc[];
  places: PlaceInfo[];
  wards: WardInfo[];
}

const COLORS = ["#c0392b", "#2f7fd0", "#2e9e5b", "#c98a1a", "#8a4fc9", "#1abc9c", "#d35400", "#7f8c8d"];

/** Quarters each kind of faction grows from. */
const HOME: Record<FactionKind, WardKind[]> = {
  guild: ["craftsmen", "merchants", "industrial", "old-town"],
  house: ["patriciate", "castle", "administration", "rich-residential"],
  gang: ["slum", "harbour", "combat-zone", "port", "megablock", "ruins"],
  cult: ["temple", "cemetery", "slum", "ruins"],
  order: ["temple", "castle", "military"],
  corporation: ["downtown", "commercial", "arcology", "industrial", "campus"],
  syndicate: ["port", "harbour", "commercial", "merchants"],
  clan: ["craftsmen", "settlement", "suburb"],
  militia: ["military", "settlement", "suburb"],
  council: ["administration", "plaza", "downtown", "old-town", "settlement"],
  rebels: ["slum", "residential", "combat-zone", "suburb", "wasteland"],
  church: ["temple", "plaza"],
};
/** Places that can be each kind of faction's seat. */
const SEAT: Record<FactionKind, LandmarkKind[]> = {
  guild: ["guildhall", "smithy", "factory", "docks"],
  house: ["palace", "keep", "town-hall"],
  gang: ["gang-hq", "raider-fort", "club", "tavern"],
  cult: ["sacred-stone", "undercity", "temple"],
  order: ["cathedral", "temple", "keep", "barracks"],
  corporation: ["corp-hq", "factory", "lab", "ai-core"],
  syndicate: ["docks", "night-market", "club", "bank"],
  clan: ["chief-hut", "barter-market"],
  militia: ["barracks", "police", "raider-fort"],
  council: ["town-hall", "agora", "market-well", "chief-hut", "water-still"],
  rebels: ["netrunner-den", "undercity", "tavern", "radio-tower"],
  church: ["cathedral", "temple"],
};
/** What kinds of place each kind of faction holds in a quarter it rules. */
const HOLDS: Record<FactionKind, LandmarkKind[]> = {
  guild: ["smithy", "guildhall", "mill", "docks", "factory", "bank"],
  house: ["keep", "palace", "town-hall", "theatre", "museum", "library", "mage-tower"],
  gang: ["tavern", "club", "gallows", "docks", "night-market", "bathhouse", "ripperdoc"],
  cult: ["undercity", "bathhouse", "sacred-stone"],
  order: ["temple", "hospital", "library", "cathedral"],
  corporation: ["factory", "hospital", "station", "club", "ripperdoc", "av-port", "stadium", "lab", "university", "night-market"],
  syndicate: ["docks", "tavern", "club", "night-market", "bank", "scrapyard"],
  clan: ["flint-workshop", "animal-pen", "fire-pit"],
  militia: ["barracks", "police", "water-still"],
  council: ["town-hall", "market-well", "agora", "barter-market", "station"],
  rebels: ["netrunner-den", "tavern", "radio-tower", "undercity"],
  church: ["temple", "hospital", "cathedral", "library"],
};

/** Who owns or keeps each kind of place. */
const OWNER: Partial<Record<LandmarkKind, Role>> = {
  "market-well": "steward", temple: "priest", keep: "noble", tavern: "innkeeper", smithy: "smith", guildhall: "guildmaster", bathhouse: "steward", gallows: "warden", docks: "captain", lighthouse: "warden", mill: "farmer", barracks: "captain", "town-hall": "ruler", station: "steward", hospital: "doctor", police: "captain", stadium: "boss", university: "scholar", museum: "scholar", factory: "boss", "corp-hq": "boss", ripperdoc: "doctor", "netrunner-den": "hacker", "night-market": "merchant", club: "boss", "av-port": "pilot", undercity: "thief", "gang-hq": "boss", "fire-pit": "elder", "chief-hut": "elder", "flint-workshop": "hunter", "animal-pen": "hunter", "sacred-stone": "shaman", agora: "steward", theatre: "bard", arena: "boss", gymnasium: "scholar", library: "scholar", lab: "scholar", "garden-dome": "farmer", "ai-core": "engineer", "launch-pad": "pilot", "barter-market": "merchant", "water-still": "engineer", "raider-fort": "boss", "vault-door": "warden", scrapyard: "scavenger", "radio-tower": "engineer", palace: "ruler", cathedral: "priest", bank: "merchant", "mage-tower": "mage", "old-ruins": "hermit", tents: "elder", prison: "warden", "old-gate": "guard", custom: "steward",
};
/** Who works at each kind of place besides the owner. */
const STAFF: Partial<Record<LandmarkKind, Role[]>> = {
  temple: ["monk", "servant"], keep: ["guard", "steward", "captain"], tavern: ["servant", "bard"], smithy: ["servant"], guildhall: ["merchant", "steward"], docks: ["sailor", "merchant"], barracks: ["guard", "mercenary"], "town-hall": ["steward", "guard"], hospital: ["healer", "doctor"], police: ["guard"], factory: ["engineer", "servant"], "corp-hq": ["guard", "fixer", "hacker"], ripperdoc: ["servant"], "netrunner-den": ["hacker"], club: ["guard", "bard"], "gang-hq": ["thief", "mercenary"], "chief-hut": ["hunter"], theatre: ["bard"], library: ["scholar"], lab: ["engineer"], "raider-fort": ["mercenary", "scavenger"], palace: ["guard", "steward", "servant", "noble"], cathedral: ["priest", "monk"], bank: ["guard", "steward"], "mage-tower": ["scholar", "servant"], prison: ["guard"], tents: ["hunter"],
};
const CITY_HOOKS = ["feud", "reward", "vanished", "smuggling", "sickness", "duel"];
/** What a quarter looks, sounds and smells like. */
const TRAITS: Partial<Record<WardKind, string[]>> = {
  craftsmen: ["tanneries", "hammering", "smoke", "washing-lines"],
  merchants: ["shop-signs", "crowds", "spices"],
  patriciate: ["gardens", "guards", "quiet"],
  slum: ["mud", "stench", "crowds", "rats"],
  harbour: ["gulls", "tar", "fish"],
  temple: ["bells", "incense", "pilgrims"],
  castle: ["guards", "banners"],
  military: ["drills", "guards"],
  administration: ["clerks", "banners", "quiet"],
  plaza: ["crowds", "criers"],
  cemetery: ["quiet", "crows"],
  suburb: ["gardens", "mud", "livestock"],
  downtown: ["traffic", "glass", "crowds"],
  commercial: ["neon", "traffic", "crowds"],
  residential: ["laundry", "children", "traffic"],
  "rich-residential": ["gardens", "guards", "quiet"],
  industrial: ["smoke", "sirens", "stench"],
  port: ["gulls", "cranes", "fish"],
  campus: ["students", "gardens"],
  "old-town": ["cobbles", "bells", "tourists"],
  arcology: ["glass", "drones"],
  megablock: ["neon", "crowds", "noise"],
  "combat-zone": ["gunfire", "burned-cars", "graffiti"],
  ruins: ["rubble", "silence", "crows"],
  settlement: ["smoke", "crowds", "mud"],
  spaceport: ["engines", "drones"],
};
const ANY_TRAITS = ["crowds", "quiet", "smoke", "mud"];

const adjacencyCache = new WeakMap<City, Map<number, number[]>>();
/** Which quarters touch: Voronoi cells share their corners. */
export function wardNeighbours(city: City): Map<number, number[]> {
  const cached = adjacencyCache.get(city);
  if (cached) return cached;
  const byCorner = new Map<string, number[]>();
  for (const ward of city.wards)
    for (const [x, y] of ward.polygon) {
      const key = `${Math.round(x * 10)}:${Math.round(y * 10)}`;
      const list = byCorner.get(key) ?? [];
      list.push(ward.id);
      byCorner.set(key, list);
    }
  const out = new Map<number, number[]>(city.wards.map((ward) => [ward.id, []]));
  for (const list of byCorner.values())
    for (const a of list)
      for (const b of list) if (a !== b && !out.get(a)!.includes(b)) out.get(a)!.push(b);
  adjacencyCache.set(city, out);
  return out;
}

const factionCache = new WeakMap<City, CityFaction[]>();
/** The city's factions and their hold on its quarters. */
export function cityFactions(city: City): CityFaction[] {
  const cached = factionCache.get(city);
  if (cached) return cached;
  const era = city.params.era;
  const key = `${city.params.seed}/society`;
  const count = Math.max(2, Math.min(7, Math.round(2 + Math.log2(1 + city.params.population / 3))));
  const urban = city.wards.filter((ward) => ward.urban);
  const pool = urban.length ? urban : city.wards;
  const rng = createRng(`${key}/homes`);
  const near = wardNeighbours(city);
  const factions: CityFaction[] = makeFactions(key, city.language, count, era).map((faction, k) => {
    const likes = HOME[faction.kind];
    const options = pool.filter((ward) => likes.includes(ward.kind));
    const home = (options.length ? rng.pick(options) : rng.pick(pool)).id;
    // Hold spreads from the home quarter, halving every step out, and is firmer in quarters of its liking.
    const influence: Record<number, number> = {};
    const reach = new Map<number, number>([[home, 0]]);
    const queue = [home];
    while (queue.length) {
      const at = queue.shift()!;
      const step = reach.get(at)!;
      if (step >= 4) continue;
      for (const next of near.get(at) ?? []) if (!reach.has(next)) (reach.set(next, step + 1), queue.push(next));
    }
    for (const [ward, step] of reach) {
      const kind = city.wards.find((w) => w.id === ward)?.kind;
      influence[ward] = faction.strength * 0.5 ** step * (kind && likes.includes(kind) ? 1.5 : 1);
    }
    return { ...faction, influence, home, seat: null, color: COLORS[k % COLORS.length] };
  });
  // Shares of each quarter: a faction's hold against all others' and against nobody's.
  for (const ward of city.wards) {
    const total = factions.reduce((sum, faction) => sum + (faction.influence[ward.id] ?? 0), 0) + 1;
    for (const faction of factions) if (faction.influence[ward.id]) faction.influence[ward.id] = Math.round((faction.influence[ward.id] / total) * 100) / 100;
  }
  // Seats: the nearest fitting place to home, one faction to a place.
  const taken = new Set<number>();
  for (const faction of factions) {
    const home = city.wards.find((ward) => ward.id === faction.home)!;
    const options = city.landmarks.filter((landmark) => SEAT[faction.kind].includes(landmark.kind) && !taken.has(landmark.id));
    const seat = options.sort((a, b) => Math.hypot(a.x - home.center[0], a.y - home.center[1]) - Math.hypot(b.x - home.center[0], b.y - home.center[1]))[0];
    if (seat) {
      faction.seat = seat.id;
      taken.add(seat.id);
    }
  }
  factionCache.set(city, factions);
  return factions;
}

/** The faction holding a quarter, and how firmly. */
export function wardHolder(factions: CityFaction[], ward: number): { faction: CityFaction | null; share: number } {
  let best: CityFaction | null = null;
  for (const faction of factions) if ((faction.influence[ward] ?? 0) > (best?.influence[ward] ?? 0)) best = faction;
  const share = best?.influence[ward] ?? 0;
  return share >= 0.3 ? { faction: best, share } : { faction: null, share };
}

/** The faction a place answers to: the one whose seat it is, or the holder of its quarter if that kind of faction holds
 * such places. */
export function placeFaction(city: City, landmark: Landmark): CityFaction | null {
  const factions = cityFactions(city);
  const seat = factions.find((faction) => faction.seat === landmark.id);
  if (seat) return seat;
  const { faction } = wardHolder(factions, landmark.ward);
  return faction && (HOLDS[faction.kind].includes(landmark.kind) || !organicEra(city.params.era)) ? faction : null;
}

/** The owner of a place: the same person whenever asked, by the place's id. */
export function placeOwnerKey(city: City, landmark: number): string {
  return `${city.params.seed}/landmark-${landmark}/owner`;
}
export function placeOwnerRole(city: City, landmark: Landmark): Role {
  const role = OWNER[landmark.kind] ?? "steward";
  return roleFits(role, city.params.era) ? role : "steward";
}

/** A building's address: the nearest named street, and its number counted along it, odd on one side, even on the other. */
export function addressOf(city: City, index: number): Address | null {
  const building = city.buildings[index];
  if (!building) return null;
  const at = centroid(building.polygon);
  let best: { street: (typeof city.streets)[number]; d: number } | null = null;
  for (const street of city.streets) {
    if (!street.name || street.kind === "rail" || street.kind === "skyway" || street.kind === "highway") continue;
    const d = distanceToPolyline(at, street.points);
    if (!best || d < best.d) best = { street, d };
  }
  if (!best || best.d * city.scale > 120) return null;
  // How far along the street the house stands, and on which side.
  let along = 0;
  let found = 0;
  let side = 1;
  let nearest = Infinity;
  const points = best.street.points;
  for (let k = 1; k < points.length; k++) {
    const [ax, ay] = points[k - 1];
    const [bx, by] = points[k];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const t = Math.max(0, Math.min(1, ((at[0] - ax) * (bx - ax) + (at[1] - ay) * (by - ay)) / (len * len)));
    const d = Math.hypot(ax + (bx - ax) * t - at[0], ay + (by - ay) * t - at[1]);
    if (d < nearest) {
      nearest = d;
      found = along + t * len;
      side = (bx - ax) * (at[1] - ay) - (by - ay) * (at[0] - ax) >= 0 ? 1 : 0;
    }
    along += len;
  }
  return { street: best.street.id, name: best.street.name, number: 2 * Math.floor((found * city.scale) / 14) + 1 + side };
}

/** Everyone and everything of the city's society. */
export function citySociety(city: City): CitySociety {
  const era = city.params.era;
  const seed = city.params.seed;
  const tongue = city.language;
  const factions = cityFactions(city);
  const byId = new Map(factions.map((faction) => [faction.id, faction]));
  const fits = (roles: Role[]) => roles.filter((role) => roleFits(role, era));

  const councilRoles = fits(era === "stone" ? ["elder", "shaman", "hunter"] : era === "post-apocalypse" ? ["boss", "captain", "doctor", "engineer"] : organicEra(era) ? ["ruler", "steward", "captain", "priest"] : ["ruler", "steward", "captain", "boss"]);
  const council = councilRoles.map((role, k) => makeNpc(`${seed}/council-${k}`, tongue, role, { secretChance: 0.5 }));

  // Places: their owners, their people, whom they answer to, what they want of heroes and what is said of them.
  const places: PlaceInfo[] = city.landmarks.map((landmark) => {
    const faction = placeFaction(city, landmark);
    const owner = makeNpc(placeOwnerKey(city, landmark.id), tongue, placeOwnerRole(city, landmark), { secretChance: 0.55, ...(faction ? { faction: faction.id } : {}) });
    const rng = createRng(`${seed}/landmark-${landmark.id}/people`);
    const roles = fits(STAFF[landmark.kind] ?? ["servant"]);
    const staff = roles.length ? Array.from({ length: rng.int(1, Math.min(3, roles.length + 1)) }, (_, k) => makeNpc(`${seed}/landmark-${landmark.id}/staff-${k}`, tongue, roles[k % roles.length], faction && k === 0 ? { faction: faction.id } : {})) : [];
    const truths: Hearsay[] = [];
    const lies: Hearsay[] = [];
    if (owner.secret) truths.push({ key: "rumour.person", vars: { name: owner.name, secret: `@secret.${owner.secret}` } });
    const someone = staff.find((npc) => npc.secret);
    if (someone) truths.push({ key: "rumour.person", vars: { name: someone.name, secret: `@secret.${someone.secret}` } });
    if (faction) truths.push({ key: "rumour.owner-faction", vars: { name: owner.name, faction: faction.name, kind: `@faction-kind.${faction.kind}` } });
    const other = factions.filter((f) => f !== faction);
    if (other.length) lies.push({ key: "rumour.owner-faction", vars: { name: owner.name, faction: rng.pick(other).name, kind: `@faction-kind.${rng.pick(other).kind}` } });
    lies.push({ key: "rumour.person", vars: { name: owner.name, secret: `@secret.${rng.pick(["debt", "affair", "crime", "cult", "spy", "smuggling", "murder"].filter((s) => s !== owner.secret))}` } });
    truths.push({ key: "rumour.want", vars: { name: owner.name, want: `@want.${owner.want}` } });
    lies.push({ key: "rumour.want", vars: { name: owner.name, want: `@want.${rng.pick(WANTS.filter((want) => want !== owner.want))}` } });
    const rival = faction ? faction.rivals.map((id) => byId.get(id)).find(Boolean) : undefined;
    const kind = rng.pick(CITY_HOOKS.filter((h) => h !== "feud" || rival));
    const hook: Hearsay = { key: `hook.city.${kind}`, vars: { name: owner.name, faction: faction?.name ?? "", rival: rival?.name ?? "", where: `@landmark.${landmark.kind}@${era}` } };
    return { landmark: landmark.id, owner, staff, faction: faction?.id ?? null, hook, rumours: rumoursOf(`${seed}/landmark-${landmark.id}`, truths, lies) };
  });

  // Quarters: their people, trades, holder, headman, look, a hook and rumours.
  const weight = (kind: WardKind) => (["plaza", "temple", "castle", "cemetery", "park", "farm", "wild", "spaceport", "wasteland"].includes(kind) ? 0.3 : kind === "slum" || kind === "megablock" || kind === "settlement" ? 2 : 1);
  const urban = city.wards.filter((ward) => ward.urban);
  const total = urban.reduce((sum, ward) => sum + ward.buildings * weight(ward.kind), 0) || 1;
  const wards: WardInfo[] = city.wards.map((ward) => {
    const rng = createRng(`${seed}/ward-${ward.id}/profile`);
    const { faction, share } = wardHolder(factions, ward.id);
    const trades = tradesOf(city, ward.id);
    const headRole = fits(organicEra(era) ? ["elder", "steward"] : ["steward", "boss", "fixer"])[0] ?? "elder";
    const headman = makeNpc(`${seed}/ward-${ward.id}/headman`, tongue, headRole, faction ? { faction: faction.id } : {});
    const traits = rng.shuffle([...(TRAITS[ward.kind] ?? ANY_TRAITS)]).slice(0, 2).map((trait) => `wardtrait.${trait}`);
    const truths: Hearsay[] = [];
    const lies: Hearsay[] = [];
    if (faction) {
      truths.push({ key: "rumour.ward-holder", vars: { faction: faction.name, kind: `@faction-kind.${faction.kind}` } });
      truths.push({ key: "rumour.faction-goal", vars: { faction: faction.name, kind: `@faction-kind.${faction.kind}`, goal: `@want.${faction.goal}` } });
      const others = factions.filter((f) => f !== faction);
      if (others.length) {
        const liar = rng.pick(others);
        lies.push({ key: "rumour.ward-holder", vars: { faction: liar.name, kind: `@faction-kind.${liar.kind}` } });
      }
    }
    if (headman.secret) truths.push({ key: "rumour.person", vars: { name: headman.name, secret: `@secret.${headman.secret}` } });
    truths.push({ key: "rumour.want", vars: { name: headman.name, want: `@want.${headman.want}` } });
    lies.push({ key: "rumour.person", vars: { name: headman.name, secret: `@secret.${rng.pick(["debt", "affair", "crime", "cult", "spy"].filter((s) => s !== headman.secret))}` } });
    const here = city.landmarks.filter((landmark) => landmark.ward === ward.id);
    if (here.length) {
      const place = rng.pick(here);
      truths.push({ key: "rumour.place-secret", vars: { where: `@landmark.${place.kind}@${era}` } });
    }
    const hookKind = rng.pick(CITY_HOOKS.filter((h) => h !== "feud" || faction?.rivals.length));
    const rival = faction?.rivals.map((id) => byId.get(id)).find(Boolean);
    const hook: Hearsay = { key: `hook.city.${hookKind}`, vars: { name: headman.name, faction: faction?.name ?? "", rival: rival?.name ?? "", where: `@ward.${ward.kind}@${era}` } };
    return { ward: ward.id, people: ward.urban ? Math.round((city.params.population * 1000 * ward.buildings * weight(ward.kind)) / total) : Math.round(ward.buildings * 4), trades, faction: faction?.id ?? null, share, headman, traits, hook, rumours: rumoursOf(`${seed}/ward-${ward.id}`, truths, lies) };
  });
  return { factions, council, places, wards };
}

/** The crafts plied in a quarter, most common first (at most four). */
function tradesOf(city: City, ward: number): Craft[] {
  const counts = new Map<Craft, number>();
  city.buildings.forEach((building, index) => {
    if (building.ward !== ward || PROPS.includes(building.kind) || building.kind === "shed") return;
    const type = buildingTypeOf(city, index);
    if (type !== "shop" && type !== "store" && type !== "trading-post") return;
    const craft = craftFor(`${city.params.seed}/building-${building.key ?? index}`, city.params.era);
    if (craft) counts.set(craft, (counts.get(craft) ?? 0) + 1);
  });
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([craft]) => craft);
}

/** The city's directory of shops: every house of the trading and craft quarters that opens as a shop, with its craft,
 * its owner (the same person as in its plan) and its address. */
export function cityShops(city: City): ShopInfo[] {
  const seed = city.params.seed;
  const era = city.params.era;
  const shops: ShopInfo[] = [];
  city.buildings.forEach((building, index) => {
    if (PROPS.includes(building.kind) || building.kind === "shed") return;
    const type = buildingTypeOf(city, index);
    if (type !== "shop" && type !== "store" && type !== "trading-post") return;
    const id = building.key ?? String(index);
    const craft = craftFor(`${seed}/building-${id}`, era);
    if (!craft) return;
    shops.push({ building: index, ward: building.ward, craft, owner: makeNpc(`${seed}/building-${id}/owner`, city.language, roleFits("merchant", era) ? "merchant" : "steward"), address: addressOf(city, index) });
  });
  return shops;
}

/** The colour of the faction holding each quarter, for the influence layer of the map. */
export function influenceTints(city: City): { ward: number; color: string; opacity: number }[] {
  const factions = cityFactions(city);
  return city.wards.flatMap((ward) => {
    const { faction, share } = wardHolder(factions, ward.id);
    return faction ? [{ ward: ward.id, color: faction.color, opacity: Math.min(0.6, 0.15 + share * 0.6) }] : [];
  });
}

/** Whether a point lies in a quarter (for places the GM puts on the map). */
export function wardAt(city: City, at: Point): number {
  return city.wards.find((ward) => pointInPolygon(at, ward.polygon))?.id ?? city.wards[0]?.id ?? 0;
}
