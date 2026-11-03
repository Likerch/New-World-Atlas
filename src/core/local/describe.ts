// The story of a local map, for the game master: the hook that brings a party there (out of its legend when it has
// one: a tomb's ruler, a mine's ore, a camp's band), three rumours about it of which one is false, the bands in it as
// factions with their quarrels, and the people worth a name. Everything is keys and names; the app words it.
import { rumoursOf, type Faction, type FactionKind, type Hearsay, type Npc, type Rumour } from "../people";
import { createRng } from "../random";
import { canStep, doorsOf, placeSeed, type Keyed, type LocalGroup, type LocalMap } from "./model";
import { tablesFor } from "./local";
import { knownDweller } from "./stock";

export interface LocalStory {
  hook: Hearsay;
  rumours: Rumour[];
  factions: Faction[];
  people: Npc[];
}

/** What kind of faction a band of people makes. */
const FACTION_OF: Partial<Record<string, FactionKind>> = { bandits: "gang", thugs: "gang", gangers: "gang", raiders: "gang", smugglers: "syndicate", pirates: "gang", "void-pirates": "gang", "grave-robbers": "gang", scavengers: "clan", cultists: "cult", "temple-guards": "order", monks: "order", "corp-soldiers": "corporation", "security-guards": "corporation", soldiers: "militia", "deep-folk": "clan", nomads: "clan", "rival-hunters": "clan", survivors: "council", squatters: "clan", miners: "guild", crew: "council", netrunners: "syndicate", lizardfolk: "clan", merfolk: "clan", goblins: "clan", kobolds: "clan", orcs: "clan", wererats: "gang" };

/** A dweller's words: a known one by its dictionary key, a legend's own ("a-hermit", "bears") by the planet's words, the
 * game master's own as written. */
export const whoKey = (who: string) => (/\s/u.test(who) ? who : knownDweller(who) ? `@monster.${who}` : `@fact.${who.replace(/-/gu, " ")}`);
/** A find's words: loot by key, a ship's cargo by the planet's words. */
export const lootKey = (what: string) => (what.startsWith("fact:") ? `@fact.${what.slice(5)}` : /\s/u.test(what) ? what : `@treasure.${what}`);

export function localStory(map: LocalMap): LocalStory {
  const key = `local:${placeSeed(map.params.seed)}`;
  const rng = createRng(`${key}/story`);
  const place = map.name;
  const facts = map.params.origin?.facts ?? {};
  const origin = map.params.origin?.kind;
  const groups = map.keyed.flatMap((room) => room.monsters.map((group) => ({ room, group })));
  const lord = groups.find(({ group }) => group.boss)?.group;
  const prisoner = map.keyed.flatMap((room) => room.people ?? []).find((npc) => npc.role === "prisoner");
  const best = map.keyed.find((room) => room.final && room.treasure)?.treasure ?? map.keyed.find((room) => room.treasure)?.treasure;
  const named = (group: LocalGroup) => group.name ?? group.leader?.name;
  // The hook: the place's legend first, then who is held there, who rules it, what lies in it.
  let hook: Hearsay;
  if (origin === "tomb") hook = { key: "hook.tomb", vars: { ruler: String(facts.ruler ?? place), years: Number(facts.age) || 300 } };
  else if (origin === "mine") hook = { key: "hook.mine", vars: { ore: `@fact.${facts.resource ?? "iron"}`, place } };
  else if (origin === "brigands") hook = { key: "hook.brigands", vars: { band: Number(facts.band) || lord?.count || 8, name: (lord && named(lord)) || place } };
  else if (origin === "bunker") hook = Number(facts.dwellers) > 0 ? { key: "hook.vault", vars: { number: Number(facts.number) || 1, dwellers: Number(facts.dwellers) } } : { key: "hook.vault-dead", vars: { number: Number(facts.number) || 1 } };
  else if (origin === "monastery") hook = { key: "hook.monastery", vars: { monks: Number(facts.monks) || 12, place } };
  else if (origin === "shipwreck") hook = { key: "hook.wreck", vars: { cargo: `@fact.${facts.cargo ?? "gold"}`, years: Number(facts.year) || 50 } };
  else if (origin === "bridge") hook = { key: "hook.bridge", vars: { river: String(facts.river ?? map.params.river ?? place) } };
  else if (origin === "battlefield") hook = { key: "hook.battlefield", vars: { a: String(facts.sideA ?? "?"), b: String(facts.sideB ?? "?"), fallen: Number(facts.fallen) || 1000 } };
  else if (prisoner) hook = { key: "hook.prisoner", vars: { name: prisoner.name, place } };
  else if (lord) hook = { key: "hook.lord", vars: { who: lord.name ?? whoKey(lord.who), place } };
  else if (best) hook = { key: "hook.treasure", vars: { what: lootKey(best.what), place } };
  else hook = { key: "hook.lost", vars: { place } };

  // Rumours: what is so, and lies of the same kind with a wrong detail.
  const tables = tablesFor(map.params);
  const truths: Hearsay[] = [];
  const lies: Hearsay[] = [];
  if (lord) {
    truths.push({ key: "rumour.danger", vars: { who: whoKey(lord.who), where: place } });
    const other = tables.pool.filter((id) => id !== lord.who);
    if (other.length) lies.push({ key: "rumour.danger", vars: { who: whoKey(rng.pick(other)), where: place } });
  }
  if (best) {
    truths.push({ key: "rumour.treasure", vars: { what: lootKey(best.what), where: place } });
    const other = tables.loot.filter((id) => id !== best.what);
    if (other.length) lies.push({ key: "rumour.treasure", vars: { what: lootKey(rng.pick(other)), where: place } });
  }
  const secret = map.keyed.find((room) => room.secret);
  if (secret) truths.push({ key: "rumour.secret-room", vars: { where: place } });
  else lies.push({ key: "rumour.secret-room", vars: { where: place } });
  const trapped = map.keyed.find((room) => room.trap);
  if (trapped) truths.push({ key: "rumour.trap", vars: { what: `@trap.${trapped.trap}`, where: place } });
  const keyRoom = map.keyed.find((room) => room.key);
  const locked = keyRoom ? map.keyed.find((room) => room.lock === keyRoom.key) : undefined;
  if (keyRoom && locked) truths.push({ key: "rumour.key", vars: { door: purposeKey(locked), room: purposeKey(keyRoom) } });
  if (origin === "tomb") truths.push({ key: "rumour.history", vars: { event: `@history.sealed`, years: Number(facts.age) || 300 } });
  lies.push({ key: "rumour.danger", vars: { who: whoKey(rng.pick(tables.lords)), where: place } });
  const rumours = rumoursOf(key, truths, lies);

  // The bands of people in it, as factions: who leads each kind, how strong it is, whom it fights.
  const byKind = new Map<string, { group: LocalGroup; total: number }>();
  for (const { group } of groups) {
    if (!FACTION_OF[group.who] || !group.leader) continue;
    const known = byKind.get(group.who);
    if (!known) byKind.set(group.who, { group, total: group.count });
    else {
      known.total += group.count;
      if (group.count > known.group.count || group.boss) known.group = group;
    }
  }
  const factions: Faction[] = [...byKind.entries()].map(([who, { group, total }]) => {
    const id = `${key}/faction-${who}`;
    const surname = group.leader!.name.split(" ").slice(-1)[0];
    return { id, name: group.name ?? surname, kind: FACTION_OF[who]!, leader: { ...group.leader!, faction: id }, goal: group.leader!.want, strength: Math.max(1, Math.min(5, Math.round(total / 4))), rivals: [], allies: [] };
  });
  const quarrels = createRng(`${key}/factions`);
  for (let a = 0; a < factions.length; a++)
    for (let b = a + 1; b < factions.length; b++) {
      const roll = quarrels.next();
      if (roll < 0.6) (factions[a].rivals.push(factions[b].id), factions[b].rivals.push(factions[a].id));
      else if (roll < 0.85) (factions[a].allies.push(factions[b].id), factions[b].allies.push(factions[a].id));
    }
  // People worth a name: the leaders of bands and those alone in their rooms.
  const people = new Map<string, Npc>();
  for (const faction of factions) people.set(faction.leader.id, faction.leader);
  for (const { group } of groups) if (group.leader && !people.has(group.leader.id)) people.set(group.leader.id, group.leader);
  for (const room of map.keyed) for (const npc of room.people ?? []) people.set(npc.id, npc);
  return { hook, rumours, factions, people: [...people.values()] };
}

/** A room as the rumours name it: by what it is for. */
function purposeKey(room: Keyed): string {
  return room.purpose.startsWith("own:") ? room.name || room.purpose.slice(4) : `@purpose.${room.purpose}`;
}

/** Which rooms each room leads to: those reached from it without passing through another room. */
export function roomLinks(map: LocalMap): Map<number, number[]> {
  const W = map.params.width;
  const owner = new Int32Array(map.tiles.length).fill(0);
  for (const room of map.keyed) for (const c of room.cells) owner[c] = room.id;
  const doors = doorsOf(map);
  const out = new Map<number, number[]>();
  for (const room of map.keyed) {
    const found = new Set<number>();
    const seen = new Set<number>(room.cells);
    const queue = [...room.cells];
    for (let k = 0; k < queue.length; k++) {
      const c = queue[k];
      const x = c % W;
      for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W]) {
        if (n < 0 || n >= map.tiles.length || seen.has(n) || !canStep(map, doors, c, n)) continue;
        seen.add(n);
        if (owner[n] && owner[n] !== room.id) found.add(owner[n]);
        else if (!owner[n]) queue.push(n);
      }
    }
    out.set(room.id, [...found].sort((a, b) => a - b));
  }
  return out;
}
