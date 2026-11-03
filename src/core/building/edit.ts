// The game master's edits over a generated plan, kept in the map's patch under "building": what a room is for (it is
// furnished anew for its new purpose), a room thrown again (new furniture and new people), what a door is made of and
// how it is locked, a door hidden or bricked up, and doors broken through between rooms. Each edit is keyed by floor
// and room (or door), so it can be undone on its own and survives the plan being opened again.
import { createRng } from "../random";
import { newDoor } from "./dress";
import { forAge, furnish, machineAge, type BuildingPlan, type DoorKind, type LockKind, type RoomKind } from "./plan";

export interface BuildingEdits {
  /** By "level:room": a new purpose, and how many times the room was thrown again. */
  rooms?: Record<string, { kind?: RoomKind; salt?: number }>;
  /** By "level:door index": what the door is, how it shuts, hidden, or bricked up. */
  doors?: Record<string, { kind?: DoorKind; lock?: LockKind; secret?: boolean; removed?: boolean }>;
  /** Doors broken through between two rooms of a floor (their indexes follow the plan's own). */
  added?: { level: number; a: number; b: number }[];
}

/** The rerolls of the rooms, for the key: "level:room" → count. */
export function roomSalts(edits: BuildingEdits | null | undefined): Record<string, number> {
  return Object.fromEntries(Object.entries(edits?.rooms ?? {}).flatMap(([key, value]) => (value.salt ? [[key, value.salt]] : [])));
}

/** A plan with the GM's edits laid over it; the plan itself is left as it was. */
export function editBuilding(plan: BuildingPlan, edits: BuildingEdits | null | undefined): BuildingPlan {
  if (!edits || (!Object.keys(edits.rooms ?? {}).length && !Object.keys(edits.doors ?? {}).length && !edits.added?.length)) return plan;
  const modern = machineAge(plan.params.era);
  const floors = plan.floors.map((floor) => ({ ...floor, rooms: floor.rooms.map((room) => ({ ...room, furniture: [...room.furniture] })), doors: floor.doors.map((door) => ({ ...door })), windows: floor.windows }));
  for (const floor of floors) {
    // New doors first, so their indexes are there to be edited.
    for (const add of edits.added ?? []) {
      if (add.level !== floor.level) continue;
      const a = floor.rooms.find((room) => room.id === add.a);
      const b = floor.rooms.find((room) => room.id === add.b);
      const door = a && b ? newDoor(floor, a, b, createRng(`${plan.params.seed}/edit/door-${floor.level}-${add.a}-${add.b}`), true) : null;
      if (door) floor.doors.push({ ...door, kind: "plain", lock: "none" });
    }
    // Rooms given a new purpose, or thrown again: furnished afresh from a stream of their own.
    for (const room of floor.rooms) {
      const change = edits.rooms?.[`${floor.level}:${room.id}`];
      if (!change || (!change.kind && !change.salt)) continue;
      if (change.kind) room.kind = change.kind;
      const rng = createRng(`${plan.params.seed}/edit/room-${floor.level}-${room.id}/${change.salt ?? 0}`);
      room.collapsed = false;
      room.furniture = forAge(furnish(room, floor.doors.filter((door) => door.rooms.includes(room.id)), plan.params.type, modern, rng), plan.params.era);
    }
    floor.doors.forEach((door, index) => {
      const change = edits.doors?.[`${floor.level}:${index}`];
      if (!change) return;
      if (change.kind) door.kind = change.kind;
      if (change.lock) door.lock = change.lock;
      if (change.secret !== undefined) door.secret = change.secret;
      // A bricked-up door stays in the list, so the others keep their numbers and it can be opened again.
      if (change.removed) door.walled = true;
    });
  }
  return { ...plan, floors };
}
