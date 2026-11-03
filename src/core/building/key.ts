// A building's key for the game master: who holds it and who lives there, and room by room who is in it, what of value
// lies there (and what is hidden), what clues a search turns up, what the room is like, and what people say about it —
// three rumours, one of them false. A hidden door leaves a draught to be found, the owner's secret a trace in their
// room, the hatch down a smell of the sewers. Everything is keyed by the plan's seed (and a room's reroll), so the same
// building always keeps the same people and the same secrets.
import type { Era } from "../city/model";
import { createLanguage, type Language } from "../language";
import { makeNpc, OWNER_SECRET, roleFits, rumoursOf, WANTS, type Hearsay, type Npc, type Role, type Rumour } from "../people";
import { createRng, type Rng } from "../random";
import { shopInventory, type ShopItem } from "./crafts";
import type { BuildingPlan, BuildingType, Floor, Room, RoomKind } from "./plan";

export interface Valuable {
  /** Dictionary key: "valuable.purse". */
  key: string;
  /** In the age's money. */
  value: number;
  /** Only a search finds it. */
  hidden: boolean;
}

export interface RoomEntry {
  level: number;
  room: number;
  /** The room's number in the key, counted from the ground floor up and the cellar last. */
  n: number;
  occupants: Npc[];
  valuables: Valuable[];
  clues: Hearsay[];
  /** What the room is like: "detail.smoky". */
  detail: string;
  rumours: Rumour[];
}

export interface BuildingKey {
  owner: Npc;
  /** The faction the owner serves, when the city says. */
  faction?: { id: string; name: string; kind: string };
  /** Everyone in the building, the owner first. */
  household: Npc[];
  rooms: RoomEntry[];
  inventory: ShopItem[];
  rumours: Rumour[];
  hook: Hearsay;
}

/** Who holds each kind of building. */
const OWNER: Partial<Record<BuildingType, Role>> = { tavern: "innkeeper", shop: "merchant", smithy: "smith", temple: "priest", keep: "noble", manor: "noble", warehouse: "merchant", clinic: "doctor", club: "boss", office: "boss", guildhall: "guildmaster", bank: "merchant", factory: "boss", station: "steward", school: "scholar", police: "captain", store: "merchant", lab: "scholar", "trading-post": "merchant", bunker: "captain", lighthouse: "warden", mill: "farmer", theatre: "bard", arena: "boss", prison: "warden", barracks: "captain", palace: "ruler", "mage-tower": "mage", hut: "elder", longhouse: "elder", domus: "noble", bathhouse: "steward", hydroponics: "farmer", "capsule-hotel": "steward", insula: "steward", tenement: "steward" };
/** Where the owner is found. */
const OWNER_ROOM: RoomKind[] = ["throne-room", "study", "office", "shop-floor", "common-room", "workshop", "nave", "lab", "ritual-room", "guard-room", "hall", "living-room", "bedroom"];

/** Who else is in a room: roles to draw from, and how many. */
const FOLK: Partial<Record<RoomKind, [Role[], number, number]>> = {
  "common-room": [["farmer", "sailor", "mercenary", "bard", "merchant", "thief", "guard", "hunter", "scavenger", "fixer"], 1, 5],
  kitchen: [["servant"], 1, 2],
  "guest-room": [["merchant", "mercenary", "monk", "spy", "bard", "pilot", "fixer", "scholar"], 0, 1],
  bedroom: [["heir", "servant"], 0, 1],
  "throne-room": [["guard", "steward", "noble"], 2, 3],
  barracks: [["guard", "mercenary"], 1, 5],
  armory: [["guard"], 0, 1],
  "guard-room": [["guard"], 1, 3],
  cell: [["prisoner"], 0, 1],
  nave: [["monk", "farmer", "merchant"], 1, 4],
  chapel: [["monk"], 0, 1],
  workshop: [["servant", "smith", "engineer"], 0, 2],
  "shop-floor": [["farmer", "servant", "sailor", "scavenger"], 0, 2],
  office: [["steward", "scholar", "engineer", "fixer"], 0, 2],
  study: [["scholar"], 0, 1],
  lab: [["scholar", "engineer", "doctor"], 1, 2],
  "operating-room": [["doctor", "healer"], 1, 1],
  "waiting-room": [["farmer", "sailor", "servant", "hacker", "scavenger"], 0, 3],
  "dance-floor": [["bard", "thief", "hacker", "fixer", "mercenary"], 2, 6],
  bar: [["servant"], 1, 1],
  vip: [["boss", "fixer", "noble"], 0, 2],
  "server-room": [["hacker"], 0, 1],
  classroom: [["scholar"], 1, 1],
  "machine-hall": [["engineer", "servant", "miner"], 1, 4],
  "boiler-room": [["engineer"], 0, 1],
  "ticket-hall": [["merchant", "pilot", "sailor", "farmer"], 1, 4],
  platform: [["merchant", "sailor", "pilot"], 0, 3],
  stage: [["bard"], 1, 3],
  auditorium: [["noble", "merchant", "farmer"], 0, 4],
  ballroom: [["noble", "servant", "bard"], 2, 6],
  gallery: [["noble", "scholar"], 0, 2],
  "ritual-room": [["mage", "cultist"], 0, 1],
  "mill-room": [["farmer", "servant"], 1, 2],
  lantern: [["warden"], 0, 1],
  canteen: [["guard", "servant"], 1, 4],
  "arena-floor": [["mercenary", "prisoner"], 1, 2],
  stands: [["farmer", "merchant", "thief"], 1, 5],
  "grow-room": [["farmer", "engineer"], 0, 2],
  capsules: [["merchant", "hacker", "fixer"], 0, 3],
  lobby: [["guard", "servant"], 0, 1],
  "pool-room": [["noble", "merchant"], 0, 3],
  hall: [["servant", "elder", "hunter"], 0, 2],
};

/** Things of value an age keeps about the house, and what each is worth in its money. */
const LOOT: Record<Era, [string, number][]> = {
  stone: [["amber", 3], ["flint-blade", 1], ["carved-idol", 4], ["furs", 2], ["shell-necklace", 2]],
  ancient: [["denarii", 10], ["silver-cup", 25], ["amphora", 6], ["scroll", 15], ["signet", 40], ["bronze-mirror", 12]],
  medieval: [["purse", 10], ["silver-candlestick", 20], ["ring", 40], ["fine-sword", 60], ["spices", 15], ["deed", 50], ["relic", 80], ["book", 30]],
  renaissance: [["purse", 15], ["silver-candlestick", 20], ["ring", 50], ["pistol", 60], ["spices", 20], ["deed", 60], ["painting", 120], ["book", 30]],
  industrial: [["banknotes", 20], ["pocket-watch", 40], ["revolver", 50], ["bonds", 100], ["jewellery", 80], ["letters", 5]],
  modern: [["cash", 300], ["laptop", 900], ["jewellery", 1200], ["pistol", 400], ["documents", 50], ["phone", 400]],
  cyberpunk: [["credstick", 500], ["cyberware", 3000], ["data-shard", 800], ["smart-gun", 1500], ["synth-drugs", 300]],
  "far-future": [["credit-chit", 400], ["prototype", 5000], ["data-core", 1500], ["nanites", 900], ["holo-art", 1200]],
  "post-apocalypse": [["ammo", 20], ["canned-food", 8], ["medkit", 40], ["fuel", 15], ["batteries", 10], ["old-tech", 60]],
};
/** Rooms where valuables are kept, and how many at most. */
const STASH: Partial<Record<RoomKind, number>> = { vault: 5, bedroom: 2, study: 2, office: 2, sacristy: 2, "throne-room": 2, cellar: 1, storage: 1, "guest-room": 1, vip: 2, armory: 2, chapel: 1, "ritual-room": 2, attic: 1, "server-room": 1, lab: 1 };

/** What a room is like, by its kind. */
const DETAILS: Partial<Record<RoomKind, string[]>> = {
  kitchen: ["smell-food", "smoky", "greasy"],
  cellar: ["damp", "cold", "smell-mould", "dusty"],
  storage: ["dusty", "cluttered", "damp"],
  pantry: ["smell-food", "cluttered"],
  attic: ["dusty", "draughty", "creaky-floor"],
  "common-room": ["noisy", "smoky", "sticky-floor"],
  bedroom: ["cramped", "creaky-floor", "tidy"],
  "guest-room": ["cramped", "creaky-floor", "draughty"],
  nave: ["smell-incense", "echoing", "cold"],
  chapel: ["smell-incense", "dim"],
  sacristy: ["smell-incense", "tidy"],
  workshop: ["hot", "noisy", "smell-metal"],
  "machine-hall": ["noisy", "hot", "greasy"],
  cell: ["damp", "cold", "dim"],
  barracks: ["cramped", "smell-sweat"],
  "throne-room": ["echoing", "lavish"],
  ballroom: ["lavish", "echoing"],
  "dance-floor": ["noisy", "dim"],
  "server-room": ["humming", "cold"],
};
const ANY_DETAIL = ["dim", "draughty", "tidy", "cluttered", "dusty", "creaky-floor"];
const CLUE_FLAVOUR = ["footprints", "bloodstain", "burnt-letter", "torn-cloth", "wet-boots", "scorch"];
const HOOKS = ["missing", "theft", "debt", "guest", "haunt", "sale"];
/** Rooms not worth a number in the key. */
const UNKEYED = new Set<RoomKind>(["stairs", "corridor", "passage"]);

const fit = (roles: Role[], era: Era) => roles.filter((role) => roleFits(role, era));

/** Who heads a plain household: the rich are noble (or bosses), the comfortable trade, the rest work the land or serve. */
function householder(wealth: number, era: Era): Role {
  if (era === "stone") return wealth > 0.6 ? "elder" : "hunter";
  if (era === "post-apocalypse") return wealth > 0.6 ? "boss" : "scavenger";
  const machine = ["industrial", "modern", "cyberpunk", "far-future"].includes(era);
  return wealth > 0.72 ? (machine ? "boss" : "noble") : wealth > 0.4 ? (machine ? "engineer" : "merchant") : machine ? "servant" : "farmer";
}

/** The key of a building: `language` names its people; `salts` reroll single rooms ("level:room" → number). */
export function buildingKey(plan: BuildingPlan, language?: Language | null, salts: Record<string, number> = {}): BuildingKey {
  const { params } = plan;
  const era = params.era;
  const tongue = language ?? createLanguage(createRng(params.seed).fork("language"));
  const base = `${params.seed}/key`;
  const wealth = params.wealth ?? 0.5;
  // The owner: the city's person for this house when it says, else one of its own — a plain house's head by its purse.
  const role = (params.owner?.role as Role | undefined) || OWNER[params.type] || householder(wealth, era);
  const ownerRole = roleFits(role, era) ? role : householder(wealth, era);
  const owner = makeNpc(params.owner?.key ?? `${params.seed}/owner`, tongue, ownerRole, { secretChance: OWNER_SECRET, ...(params.owner?.faction ? { faction: params.owner.faction.id } : {}) });

  // Rooms in key order: the ground floor up, the cellar last.
  const order = [...plan.floors].sort((a, b) => (a.level < 0 ? 1000 : a.level) - (b.level < 0 ? 1000 : b.level));
  const rooms: { floor: Floor; room: Room; rng: Rng }[] = [];
  for (const floor of order) for (const room of floor.rooms) if (!UNKEYED.has(room.kind)) rooms.push({ floor, room, rng: createRng(`${base}/room-${floor.level}-${room.id}${salts[`${floor.level}:${room.id}`] ? `/r${salts[`${floor.level}:${room.id}`]}` : ""}`) });
  const ownerAt = OWNER_ROOM.map((kind) => rooms.find((entry) => entry.room.kind === kind)).find(Boolean);

  const loot = LOOT[era] ?? LOOT.medieval;
  const entries: RoomEntry[] = rooms.map(({ floor, room, rng }, index) => {
    const occupants: Npc[] = [];
    if (ownerAt && ownerAt.room === room && ownerAt.floor === floor) occupants.push(owner);
    const folk = FOLK[room.kind];
    if (folk && !room.collapsed) {
      const roles = fit(folk[0], era);
      const count = Math.round(rng.int(folk[1], folk[2]) * (0.6 + wealth * 0.6));
      for (let k = 0; k < count && roles.length; k++) occupants.push(makeNpc(`${base}/room-${floor.level}-${room.id}/person-${k}${salts[`${floor.level}:${room.id}`] ? `/r${salts[`${floor.level}:${room.id}`]}` : ""}`, tongue, rng.pick(roles), { secretChance: 0.3 }));
    }
    const valuables: Valuable[] = [];
    const most = STASH[room.kind] ?? 0;
    for (let k = rng.int(0, most); k > 0; k--) {
      if (!rng.chance(0.35 + wealth * 0.55)) continue;
      const [key, value] = rng.pick(loot);
      valuables.push({ key: `valuable.${key}`, value: Math.max(1, Math.round(value * (0.5 + wealth) * rng.float(0.7, 1.4))), hidden: rng.chance(0.3) });
    }
    const pool = DETAILS[room.kind] ?? ANY_DETAIL;
    const detail = room.collapsed ? "detail.fallen" : room.furniture.some((f) => f.kind === "circle") ? "detail.humming" : `detail.${rng.pick(wealth > 0.75 && rng.chance(0.4) ? ["lavish"] : pool)}`;
    return { level: floor.level, room: room.id, n: index + 1, occupants, valuables, clues: [], detail, rumours: [] };
  });
  const entryOf = (level: number, room: number) => entries.find((entry) => entry.level === level && entry.room === room);
  const kindOf = (level: number, room: number) => plan.floors.find((floor) => floor.level === level)?.rooms.find((r) => r.id === room)?.kind;

  // Clues: the owner's secret in the owner's room, a draught by every hidden door, the smell of what lies below.
  const clues = createRng(`${base}/clues`);
  if (owner.secret) {
    const at = (ownerAt && entryOf(ownerAt.floor.level, ownerAt.room.id)) ?? entries.find((entry) => ["bedroom", "study", "office", "cellar"].includes(kindOf(entry.level, entry.room) ?? "")) ?? entries[0];
    at?.clues.push({ key: `clue.${owner.secret}`, vars: { name: owner.name } });
  }
  for (const floor of plan.floors)
    for (const door of floor.doors.filter((d) => d.secret))
      for (const id of door.rooms) if (id >= 0) entryOf(floor.level, id)?.clues.push({ key: "clue.draught", vars: {} });
  for (const floor of plan.floors)
    for (const room of floor.rooms)
      if (room.furniture.some((f) => f.kind === "hatch")) entryOf(floor.level, room.id)?.clues.push({ key: "clue.hatch", vars: {} });
  for (const entry of entries) {
    if (entry.valuables.some((v) => v.hidden) && clues.chance(0.5)) entry.clues.push({ key: "clue.loose-board", vars: {} });
    if (entry.occupants.some((npc) => npc.role === "prisoner")) entry.clues.push({ key: "clue.scratches", vars: {} });
  }
  for (let k = clues.int(1, 2); k > 0 && entries.length; k--) clues.pick(entries).clues.push({ key: `clue.${clues.pick(CLUE_FLAVOUR)}`, vars: {} });

  // Rumours of each room: what is true of it, and a lie that sounds like it.
  const roomName = (level: number, room: number) => `@room.${kindOf(level, room)}`;
  const allSecrets = entries.flatMap((entry) => entry.occupants.filter((npc) => npc.secret));
  for (const entry of entries) {
    const truths: Hearsay[] = [];
    const lies: Hearsay[] = [];
    const here = roomName(entry.level, entry.room);
    for (const npc of entry.occupants.filter((p) => p.secret)) truths.push({ key: "rumour.person", vars: { name: npc.name, secret: `@secret.${npc.secret}` } });
    for (const v of entry.valuables.filter((item) => item.hidden)) truths.push({ key: "rumour.room-treasure", vars: { what: `@${v.key}`, where: here } });
    const floor = plan.floors.find((f) => f.level === entry.level)!;
    for (const door of floor.doors.filter((d) => d.secret && d.rooms.includes(entry.room))) {
      const other = door.rooms[0] === entry.room ? door.rooms[1] : door.rooms[0];
      truths.push({ key: "rumour.room-way", vars: { from: here, to: other >= 0 ? roomName(entry.level, other) : "@rumour.outside" } });
    }
    if (!truths.length) continue;
    const rng = createRng(`${base}/room-rumours-${entry.level}-${entry.room}`);
    const elsewhere = entries.filter((other) => other !== entry);
    if (elsewhere.length) {
      const away = rng.pick(elsewhere);
      lies.push({ key: "rumour.room-treasure", vars: { what: `@valuable.${rng.pick(loot)[0]}`, where: roomName(away.level, away.room) } });
      lies.push({ key: "rumour.room-way", vars: { from: here, to: roomName(away.level, away.room) } });
    }
    const liar = rng.pick([...entry.occupants, owner]);
    lies.push({ key: "rumour.person", vars: { name: liar.name, secret: `@secret.${rng.pick(["debt", "affair", "crime", "cult", "spy", "smuggling"].filter((s) => s !== liar.secret))}` } });
    entry.rumours = rumoursOf(`${base}/room-${entry.level}-${entry.room}`, truths, lies);
  }

  // The building's own rumours and its hook.
  const truths: Hearsay[] = [];
  const lies: Hearsay[] = [];
  if (owner.secret) truths.push({ key: "rumour.person", vars: { name: owner.name, secret: `@secret.${owner.secret}` } });
  const someSecret = allSecrets.find((npc) => npc !== owner);
  if (someSecret) truths.push({ key: "rumour.person", vars: { name: someSecret.name, secret: `@secret.${someSecret.secret}` } });
  const secretDoor = plan.floors.flatMap((floor) => floor.doors.filter((d) => d.secret).map((door) => ({ floor, door })))[0];
  if (secretDoor) truths.push({ key: "rumour.room-way", vars: { from: roomName(secretDoor.floor.level, secretDoor.door.rooms[0]), to: secretDoor.door.rooms[1] >= 0 ? roomName(secretDoor.floor.level, secretDoor.door.rooms[1]) : "@rumour.outside" } });
  const hoard = entries.find((entry) => entry.valuables.some((v) => v.hidden));
  if (hoard) truths.push({ key: "rumour.room-treasure", vars: { what: `@${hoard.valuables.find((v) => v.hidden)!.key}`, where: roomName(hoard.level, hoard.room) } });
  if (params.hatch) truths.push({ key: "rumour.hatch", vars: {} });
  if (params.owner?.faction) truths.push({ key: "rumour.owner-faction", vars: { name: owner.name, faction: params.owner.faction.name, kind: `@faction-kind.${params.owner.faction.kind}` } });
  // When the house hides little, people still talk about what its owner is after.
  truths.push({ key: "rumour.want", vars: { name: owner.name, want: `@want.${owner.want}` } });
  const fib = createRng(`${base}/lies`);
  lies.push({ key: "rumour.want", vars: { name: owner.name, want: `@want.${fib.pick(WANTS.filter((want) => want !== owner.want))}` } });
  const wrong = fib.pick(["debt", "affair", "crime", "cult", "spy", "smuggling", "murder", "curse"].filter((s) => s !== owner.secret));
  lies.push({ key: "rumour.person", vars: { name: owner.name, secret: `@secret.${wrong}` } });
  if (entries.length) {
    // One room, picked once: its floor and its number together.
    const what = fib.pick(loot)[0];
    const where = fib.pick(entries);
    lies.push({ key: "rumour.room-treasure", vars: { what: `@valuable.${what}`, where: roomName(where.level, where.room) } });
  }
  if (!params.hatch) lies.push({ key: "rumour.hatch", vars: {} });
  const rumours = rumoursOf(base, truths, lies);

  const hooks = createRng(`${base}/hook`);
  const spot = entries.length ? hooks.pick(entries) : null;
  const somewhere = spot ? roomName(spot.level, spot.room) : "@room.hall";
  const guest = entries.find((entry) => kindOf(entry.level, entry.room) === "guest-room" && entry.occupants.length);
  const hookKind = hooks.pick(HOOKS.filter((kind) => kind !== "guest" || guest));
  const hook: Hearsay = { key: `hook.${hookKind}`, vars: { name: owner.name, where: hookKind === "guest" && guest ? roomName(guest.level, guest.room) : somewhere, faction: params.owner?.faction?.name ?? "" } };

  const household = [owner, ...entries.flatMap((entry) => entry.occupants.filter((npc) => npc !== owner))];
  return { owner, ...(params.owner?.faction ? { faction: params.owner.faction } : {}), household, rooms: entries, inventory: shopInventory(plan), rumours, hook };
}
