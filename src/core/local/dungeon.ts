// Dungeons: rooms (plain, round halls, pillared halls) joined by corridors in a spanning tree with loops; a way in from
// the map's edge on the first level and stairs where each level meets the next; real secret rooms behind secret doors,
// chasms with bridges, locked doors with their keys reachable first. Themes build their own rooms: a crypt's niches and
// sarcophagi, a mine's rails, shafts and veins, a sewer's canals and cisterns, a metro's track and platforms. A ship
// (a starship or a derelict) is laid along a spine from its engines to its bridge, with airlocks on its hull.
import Delaunator from "delaunator";
import type { Rng } from "../random";
import { bridgeChasms, cellAt, flood, furnish, keyRoom, linkPoint, lockAndKey, markSecrets, niches, pathBetween, placeDoors, setTraps, startOf, taken, veins, type Build } from "./build";
import { doorsOf, TILE, walk, type Keyed, type Purpose } from "./model";
import { PURPOSES } from "./stock";
import type { OwnPlan } from "./own";

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "box" | "round" | "hall";
  cells: number[];
  tag?: "up" | "down" | "secret" | "platform";
  /** A ship's cabin with an airlock through the hull. */
  airlock?: boolean;
}

function roomCells(b: Build, room: Omit<Room, "cells">): number[] {
  const cells: number[] = [];
  const cx = room.x + (room.w - 1) / 2,
    cy = room.y + (room.h - 1) / 2;
  for (let y = room.y; y < room.y + room.h; y++)
    for (let x = room.x; x < room.x + room.w; x++) if (room.shape !== "round" || Math.hypot((x - cx) / (room.w / 2), (y - cy) / (room.h / 2)) <= 1.02) cells.push(cellAt(b, x, y));
  return cells;
}

const overlaps = (a: { x: number; y: number; w: number; h: number }, o: { x: number; y: number; w: number; h: number }, margin: number) => a.x < o.x + o.w + margin && o.x < a.x + a.w + margin && a.y < o.y + o.h + margin && o.y < a.y + a.h + margin;

export function dungeon(b: Build, own: OwnPlan) {
  if (b.params.theme === "starship" || b.params.theme === "derelict") return ship(b, own);
  const { W, H, rng, params } = b;
  const theme = params.theme;
  const rooms: Room[] = [];
  const inBounds = (r: { x: number; y: number; w: number; h: number }) => r.x >= 2 && r.y >= 2 && r.x + r.w <= W - 2 && r.y + r.h <= H - 2;
  // Where this level meets the ones above and below: the same spots on both, so stairs line up. The way down is kept
  // even on the last level, so a place's depth never moves its rooms.
  const up = b.depth > 1 ? linkPoint(params.seed, b.depth - 1, W, H) : null;
  const down = linkPoint(params.seed, b.depth, W, H);
  const around = (p: [number, number], tag: Room["tag"]): Room => {
    const w = 5,
      h = 4;
    const x = Math.max(2, Math.min(W - 2 - w, p[0] - 2)),
      y = Math.max(2, Math.min(H - 2 - h, p[1] - 1));
    const room = { x, y, w, h, shape: "box" as const, tag };
    return { ...room, cells: roomCells(b, room) };
  };
  if (up) rooms.push(around(up, "up"));
  const below = around(down, "down");
  const merged = rooms.find((r) => overlaps(r, below, 2));
  if (merged) {
    // Both ways in one room: it grows to hold both.
    const x0 = Math.min(merged.x, below.x),
      y0 = Math.min(merged.y, below.y);
    const room = { x: x0, y: y0, w: Math.max(merged.x + merged.w, below.x + below.w) - x0, h: Math.max(merged.y + merged.h, below.y + below.h) - y0, shape: "box" as const, tag: "up" as const };
    rooms[rooms.indexOf(merged)] = { ...room, cells: roomCells(b, room) };
  } else rooms.push(below);

  // A metro's line runs across the whole map, its platforms beside it.
  let track = -1;
  if (theme === "metro") {
    for (let attempt = 0; attempt < 20 && track < 0; attempt++) {
      const row = rng.int(Math.round(H * 0.3), Math.round(H * 0.65));
      if (!rooms.some((r) => r.y < row + 4 && row - 2 < r.y + r.h)) track = row;
    }
    if (track >= 0) {
      const length = rng.int(12, 18);
      for (let attempt = 0; attempt < 20; attempt++) {
        const x = rng.int(3, W - length - 3);
        const top = { x, y: track - 3, w: length, h: 3, shape: "box" as const, tag: "platform" as const };
        const bottom = { x, y: track + 2, w: length, h: 3, shape: "box" as const, tag: "platform" as const };
        if (rooms.some((r) => overlaps(r, top, 2) || overlaps(r, bottom, 2))) continue;
        rooms.push({ ...top, cells: roomCells(b, top) }, { ...bottom, cells: roomCells(b, bottom) });
        break;
      }
    }
  }
  const clearOfTrack = (r: { x: number; y: number; w: number; h: number }) => track < 0 || r.y > track + 3 || r.y + r.h < track - 1;

  for (let attempt = 0; attempt < 500 && rooms.length < params.rooms + (up ? 1 : 0) + rooms.filter((r) => r.tag === "platform").length; attempt++) {
    const roll = rng.next();
    const shape: Room["shape"] = roll < 0.14 ? "round" : roll < 0.24 ? "hall" : "box";
    const size = shape === "round" ? 2 * rng.int(3, 5) + 1 : 0;
    const w = shape === "round" ? size : shape === "hall" ? rng.int(9, 13) : rng.int(4, 10),
      h = shape === "round" ? size : shape === "hall" ? rng.int(6, 8) : rng.int(4, 8);
    const box = { x: rng.int(2, Math.max(2, W - w - 2)), y: rng.int(2, Math.max(2, H - h - 2)), w, h };
    if (!inBounds(box) || !clearOfTrack(box) || rooms.some((o) => overlaps(box, o, 2))) continue;
    rooms.push({ ...box, shape, cells: roomCells(b, { ...box, shape }) });
  }
  for (const room of rooms) for (const c of room.cells) b.tiles[c] = room.tag === "platform" ? TILE.platform : TILE.floor;
  if (track >= 0) for (let x = 0; x < W; x++) for (const y of [track, track + 1]) b.tiles[cellAt(b, x, y)] = TILE.rail;

  // Corridors: a spanning tree over the rooms and a few loops, carved as L-shapes; a sewer's are canals, a walkway
  // either side of the water.
  const canal = theme === "sewer";
  const centres = rooms.map((r) => [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)] as [number, number]);
  const carve = (x: number, y: number, water = false) => {
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
    const c = cellAt(b, x, y);
    if (b.tiles[c] === TILE.rock) b.tiles[c] = water ? TILE.water : TILE.corridor;
  };
  const leg = (x0: number, y0: number, x1: number, y1: number) => {
    const horizontal = y0 === y1;
    for (let k = 0; k <= Math.abs(horizontal ? x1 - x0 : y1 - y0); k++) {
      const x = horizontal ? Math.min(x0, x1) + k : x0,
        y = horizontal ? y0 : Math.min(y0, y1) + k;
      if (canal) {
        carve(x, y, true);
        carve(horizontal ? x : x - 1, horizontal ? y - 1 : y);
        carve(horizontal ? x : x + 1, horizontal ? y + 1 : y);
      } else carve(x, y);
    }
  };
  const edges: [number, number, number][] = [];
  if (centres.length >= 3) {
    const d = Delaunator.from(centres);
    for (let e = 0; e < d.triangles.length; e++) {
      const a = d.triangles[e],
        c = d.triangles[e % 3 === 2 ? e - 2 : e + 1];
      if (a < c) edges.push([a, c, Math.hypot(centres[a][0] - centres[c][0], centres[a][1] - centres[c][1])]);
    }
  } else if (centres.length === 2) edges.push([0, 1, 1]);
  edges.sort((p, q) => p[2] - q[2]);
  const parent = centres.map((_, k) => k);
  const root = (k: number): number => (parent[k] === k ? k : (parent[k] = root(parent[k])));
  for (const [a, c] of edges) {
    const joined = root(a) === root(c);
    if (joined && !rng.chance(0.22)) continue;
    if (!joined) parent[root(a)] = root(c);
    const [ax, ay] = centres[a],
      [cx, cy] = centres[c];
    if (rng.chance(0.5)) {
      leg(ax, ay, cx, ay);
      leg(cx, ay, cx, cy);
    } else {
      leg(ax, ay, ax, cy);
      leg(ax, cy, cx, cy);
    }
  }

  // The way in from the surface: a passage from the room nearest the map's edge out to that edge.
  const edgeOf = (r: Room) => Math.min(r.x, W - r.x - r.w, r.y, H - r.y - r.h);
  const plain = rooms.filter((r) => !r.tag);
  let entry = up ? rooms.find((r) => r.tag === "up")! : (plain.length ? plain : rooms).reduce((best, r) => (edgeOf(r) < edgeOf(best) ? r : best));
  if (!up && entry) {
    const [cx, cy] = [entry.x + Math.floor(entry.w / 2), entry.y + Math.floor(entry.h / 2)];
    const ways: [number, number, number, number][] = [
      [entry.x, cx, -1, 0],
      [W - entry.x - entry.w, cx, 1, 0],
      [entry.y, cy, 0, -1],
      [H - entry.y - entry.h, cy, 0, 1],
    ];
    const [, , dx, dy] = ways.reduce((best, way) => (way[0] < best[0] ? way : best));
    let x = dx ? (dx < 0 ? entry.x - 1 : entry.x + entry.w) : cx,
      y = dy ? (dy < 0 ? entry.y - 1 : entry.y + entry.h) : cy;
    for (; x >= 0 && y >= 0 && x < W && y < H; x += dx, y += dy) {
      const c = cellAt(b, x, y);
      if (b.tiles[c] === TILE.rock) b.tiles[c] = canal && (x === cx || y === cy) ? TILE.water : TILE.corridor;
      if (canal) for (const [sx, sy] of dx ? [[x, y - 1], [x, y + 1]] : [[x - 1, y], [x + 1, y]]) if (sx >= 0 && sy >= 0 && sx < W && sy < H && b.tiles[cellAt(b, sx, sy)] === TILE.rock) b.tiles[cellAt(b, sx, sy)] = TILE.corridor;
    }
    const ex = Math.max(0, Math.min(W - 1, x - dx)),
      ey = Math.max(0, Math.min(H - 1, y - dy));
    b.tiles[cellAt(b, ex, ey)] = TILE.corridor;
    b.features.push({ x: ex, y: ey, kind: "exit", to: "" });
  }
  if (track >= 0) for (const x of [0, W - 1]) b.features.push({ x, y: track, kind: "exit", to: "line" });
  // Where a canal meets a room the water runs under a grate.
  if (canal)
    for (let c = 0; c < b.tiles.length; c++) {
      if (b.tiles[c] !== TILE.water) continue;
      const x = c % W;
      if ([x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W].some((n) => n >= 0 && n < b.tiles.length && (b.tiles[n] === TILE.floor || b.tiles[n] === TILE.platform))) {
        b.tiles[c] = TILE.corridor;
        b.features.push({ x, y: Math.floor(c / W), kind: "grate" });
      }
    }

  // Secret rooms: a small room in the rock beside another, through a secret door in their wall.
  const secretRooms = 1 + (params.rooms >= 14 ? 1 : 0);
  const hosts = rng.shuffle(rooms.filter((r) => !r.tag && r !== entry && r.shape !== "round"));
  for (const host of hosts) {
    if (rooms.filter((r) => r.tag === "secret").length >= secretRooms) break;
    const w = rng.int(3, 5),
      h = rng.int(3, 4);
    const sides = rng.shuffle([0, 1, 2, 3]);
    for (const side of sides) {
      const midY = host.y + Math.floor((host.h - h) / 2),
        midX = host.x + Math.floor((host.w - w) / 2);
      const box = side === 0 ? { x: host.x + host.w + 1, y: midY, w, h } : side === 1 ? { x: host.x - w - 1, y: midY, w, h } : side === 2 ? { x: midX, y: host.y + host.h + 1, w, h } : { x: midX, y: host.y - h - 1, w, h };
      if (box.x < 1 || box.y < 1 || box.x + box.w > W - 1 || box.y + box.h > H - 1) continue;
      let clear = true;
      for (let y = box.y - 1; y <= box.y + box.h && clear; y++) for (let x = box.x - 1; x <= box.x + box.w && clear; x++) if (b.tiles[cellAt(b, x, y)] !== TILE.rock) clear = false;
      if (!clear) continue;
      const gap = side === 0 ? [box.x - 1, box.y + Math.floor(h / 2)] : side === 1 ? [box.x + w, box.y + Math.floor(h / 2)] : side === 2 ? [box.x + Math.floor(w / 2), box.y - 1] : [box.x + Math.floor(w / 2), box.y + h];
      const room: Room = { ...box, shape: "box", tag: "secret", cells: [] };
      room.cells = roomCells(b, room);
      for (const c of room.cells) b.tiles[c] = TILE.floor;
      b.tiles[cellAt(b, gap[0], gap[1])] = TILE.corridor;
      b.features.push({ x: gap[0], y: gap[1], kind: "secret-door" });
      rooms.push(room);
      break;
    }
  }

  placeDoors(b, rooms.map((r) => r.cells));
  // A chasm splits a great room, a bridge across it; the ground inside each door stays, so every door has a ledge.
  const split = rng.shuffle(rooms.filter((r) => !r.tag && r !== entry && r.shape !== "round" && Math.max(r.w, r.h) >= 8));
  if (split.length && rng.chance(0.55)) {
    const r = split[0];
    const across = r.w >= r.h;
    const at0 = across ? r.x + Math.floor(r.w / 2) - 1 : r.y + Math.floor(r.h / 2) - 1;
    const bridgeAt = across ? r.y + rng.int(1, r.h - 2) : r.x + rng.int(1, r.w - 2);
    const doors = doorsOf(b);
    for (let k = 0; k < (across ? r.h : r.w); k++)
      for (const t of [at0, at0 + 1]) {
        const x = across ? t : r.x + k,
          y = across ? r.y + k : t;
        const c = cellAt(b, x, y);
        if ([c - 1, c + 1, c - W, c + W].some((n) => doors.has(n))) continue;
        if ((across ? y : x) === bridgeAt) {
          b.features.push({ x, y, kind: "bridge" });
          continue;
        }
        b.tiles[c] = TILE.chasm;
      }
    r.cells = r.cells.filter((c) => b.tiles[c] !== TILE.chasm);
  }
  // Stairs where the levels meet.
  if (up) b.features.push({ x: up[0], y: up[1], kind: "stairs-up" });
  if (b.depth < (params.levels ?? 1) && !taken(b, down[0], down[1])) b.features.push({ x: down[0], y: down[1], kind: "stairs-down" });
  const start = startOf(b);
  bridgeChasms(b, start);
  // A few doors on loops are secret shortcuts: never the only way to a room.
  const map = { tiles: b.tiles, params };
  const all = rooms.filter((r) => r.tag !== "secret");
  for (const door of b.features.filter((f) => f.kind === "door")) {
    if (!rng.chance(0.07)) continue;
    door.kind = "secret-door";
    const hidden = new Set(b.features.filter((f) => f.kind === "secret-door").map((f) => f.x + f.y * W));
    const dist = walk(map, doorsOf(b), start, (c) => hidden.has(c));
    if (all.some((r) => r.cells.every((c) => dist[c] === Infinity))) door.kind = "door";
  }

  // Purposes: the way in first; the rest by how far one walks from it; the ruler's room last.
  const dist = walk(map, doorsOf(b), start);
  const reach = (r: Room) => Math.min(...r.cells.map((c) => dist[c]));
  const open = rooms.filter((r) => r.tag !== "secret").sort((p, q) => reach(p) - reach(q));
  entry = open.find((r) => r === entry) ?? open[0];
  const order = [entry, ...open.filter((r) => r !== entry)];
  const final = order.length > 1 ? order.filter((r) => r.tag !== "platform").pop()! : null;
  const pool = own.pool ?? PURPOSES[theme];
  const biggest = order.filter((r) => r !== entry && r !== final && !r.tag).sort((p, q) => q.cells.length - p.cells.length)[0];
  const purposeOf = (r: Room, rank: number): Keyed["purpose"] => {
    if (r === entry) return "entrance";
    if (r === final) return theme === "crypt" ? "tomb" : theme === "vault" && b.tables.residents ? "great-hall" : "lair";
    if (r.tag === "platform") return "platform";
    if (theme === "sewer" && r.shape === "round") return "cistern";
    if ((theme === "temple" || theme === "vault") && r === biggest) return "great-hall";
    if (rank === 1) return "guard-room";
    return rng.pick(pool);
  };
  const keyed: Keyed[] = [];
  order.forEach((r, rank) => {
    const purpose = own.take(purposeOf(r, rank), false);
    const box = r;
    keyed.push(keyRoom(b, r.cells, box.x + box.w / 2, box.y + box.h / 2, purpose, { final: r === final }));
  });
  for (const r of rooms.filter((room) => room.tag === "secret")) keyed.push(keyRoom(b, r.cells, r.x + r.w / 2, r.y + r.h / 2, own.take(rng.pick<Purpose>(["treasury", "treasury", "shrine", "library", "prison"]), true), { secret: true }));

  // Furnishing, then the theme's own: a crypt's niches, a mine's rails and veins, rubble in the ruined ones.
  const dress = b.rng.fork("dress");
  for (const room of keyed) {
    if (room.purpose === "flooded") flood(b, room, dress);
    if (room.purpose === "cistern") {
      const r = rooms[order.indexOf(rooms.find((x) => x.cells === room.cells)!)] ?? null;
      const cx = (r?.x ?? 0) + ((r?.w ?? 1) - 1) / 2,
        cy = (r?.y ?? 0) + ((r?.h ?? 1) - 1) / 2;
      for (const c of room.cells) if (Math.hypot((c % W) - cx, Math.floor(c / W) - cy) < (r?.w ?? 0) / 2 - 1.5) b.tiles[c] = TILE.deep;
    }
    furnish(b, room, dress.fork(`room-${room.id}`));
  }
  const corridorCells = () => Array.from(b.tiles.keys()).filter((c) => b.tiles[c] === TILE.corridor);
  if (theme === "crypt") {
    niches(b, corridorCells(), 0.16, dress);
    for (const room of keyed.filter((k) => k.purpose === "ossuary" || k.purpose === "tomb")) niches(b, room.cells, 0.5, dress);
  }
  if (theme === "mine") {
    // Rails from the way in to the farthest working, carts on them; veins in the walls by the workings.
    const finalRoom = keyed.find((k) => k.final) ?? keyed[keyed.length - 1];
    const path = pathBetween(b, start, finalRoom.cells[Math.floor(finalRoom.cells.length / 2)]);
    const roomCellsAll = new Set(keyed.flatMap((k) => k.cells));
    const doors = doorsOf(b);
    const laid = path.filter((c) => b.tiles[c] === TILE.corridor && !doors.has(c) && !roomCellsAll.has(c));
    for (const c of laid) b.tiles[c] = TILE.rail;
    for (let k = 0; k < Math.min(2, Math.floor(laid.length / 12)); k++) {
      const c = laid[dress.int(0, laid.length - 1)];
      if (!taken(b, c % W, Math.floor(c / W))) b.features.push({ x: c % W, y: Math.floor(c / W), kind: "cart" });
    }
    veins(b, corridorCells(), 0.03, dress);
    for (const room of keyed.filter((k) => k.purpose === "mine-face")) veins(b, room.cells, 0.35, dress);
  }
  if (["mine", "metro", "factory", "mall"].includes(theme))
    for (let k = 0; k < W * H * 0.01; k++) {
      const i = dress.int(0, W * H - 1);
      if (b.tiles[i] === TILE.corridor && !taken(b, i % W, Math.floor(i / W))) b.tiles[i] = TILE.rubble;
    }

  markSecrets(b);
  const locks = b.rng.fork("locks");
  const treasury = keyed.find((k) => k.purpose === "treasury" && !k.secret);
  const finalKeyed = keyed.find((k) => k.final);
  const targets = [locks.chance(0.5) ? treasury : undefined, locks.chance(0.55) ? finalKeyed : undefined].filter((k): k is Keyed => !!k);
  lockAndKey(b, targets, locks);
  setTraps(b);
}

/** A ship: its hull along the map, stern to the west and bow to the east; a spine corridor from the engine room aft to
 * the bridge forward; cabins either side of the spine; airlocks on the hull, one of them the way aboard. Each deck
 * meets the next at a lift that stands in the same place on both. A derelict's hull is breached and its decks strewn
 * with wreckage. */
function ship(b: Build, own: OwnPlan) {
  const { W, H, rng, params } = b;
  const derelict = params.theme === "derelict";
  const cy = Math.floor(H / 2);
  const stern = 3,
    bow = W - 4;
  const half = Math.floor(H * 0.32);
  const halfAt = (x: number) => {
    const t = (x - stern) / (bow - stern);
    if (t < 0.06) return Math.round(half * (0.75 + t * 4));
    if (t > 0.72) return Math.max(2, Math.round(half * (1 - (t - 0.72) / 0.28)));
    return half;
  };
  for (let x = stern; x <= bow; x++) for (let y = cy - halfAt(x); y <= cy + halfAt(x); y++) if (y > 0 && y < H - 1) b.tiles[cellAt(b, x, y)] = TILE.hull;
  const rooms: Room[] = [];
  const box = (x: number, y: number, w: number, h: number, tag?: Room["tag"]): Room => {
    const r = { x, y, w, h, shape: "box" as const, tag };
    return { ...r, cells: roomCells(b, r) };
  };
  // Engines aft, the bridge in the bow.
  const engineEnd = stern + 6;
  const engines = box(stern + 1, cy - halfAt(stern + 1) + 1, engineEnd - stern - 1, 2 * halfAt(stern + 1) - 1);
  const bridgeStart = bow - Math.max(6, Math.round((bow - stern) * 0.16));
  const bridgeCells: number[] = [];
  for (let x = bridgeStart; x < bow; x++) for (let y = cy - halfAt(x) + 1; y <= cy + halfAt(x) - 1; y++) bridgeCells.push(cellAt(b, x, y));
  const bridge: Room = { x: bridgeStart, y: cy - halfAt(bridgeStart) + 1, w: bow - bridgeStart, h: 2 * halfAt(bridgeStart) - 1, shape: "box", cells: bridgeCells };
  rooms.push(engines, bridge);
  for (let x = engineEnd; x < bridgeStart; x++) b.tiles[cellAt(b, x, cy)] = TILE.corridor;
  // Lifts where the decks meet: on one side of the spine or the other by the deck, the same on both decks.
  const lift = (n: number, tag: Room["tag"]) => {
    const [lx] = linkPoint(params.seed, n, W, H);
    const x = Math.max(engineEnd + 3, Math.min(bridgeStart - 4, lx));
    const top = n % 2 === 0;
    return box(x - 1, top ? cy - 4 : cy + 2, 3, 3, tag);
  };
  const lifts = [b.depth > 1 ? lift(b.depth - 1, "up") : null, lift(b.depth, "down")].filter((r): r is Room => !!r);
  if (lifts.length === 2 && overlaps(lifts[0], lifts[1], 1)) lifts.pop();
  rooms.push(...lifts);
  // Cabins along both sides of the spine, a wall between each.
  for (const top of [true, false]) {
    let x = engineEnd + 1;
    while (x < bridgeStart - 3) {
      const w = rng.int(4, 8);
      const x1 = Math.min(bridgeStart - 2, x + w);
      const reach = Math.min(halfAt(x) - 1, halfAt(x1) - 1, 7);
      const y0 = top ? cy - reach : cy + 2,
        y1 = top ? cy - 2 : cy + reach;
      const cabin = box(x, y0, x1 - x, y1 - y0 + 1);
      if (cabin.w >= 3 && cabin.h >= 2 && !lifts.some((l) => overlaps(l, cabin, 0))) rooms.push(cabin);
      else if (lifts.some((l) => overlaps(l, cabin, 0))) {
        // A lift stands here: the cabin keeps clear of it.
        const l = lifts.find((item) => overlaps(item, cabin, 0))!;
        if (l.x - 1 - x >= 3) rooms.push(box(x, y0, l.x - 1 - x, y1 - y0 + 1));
        x = l.x + l.w + 1;
        continue;
      }
      x = x1 + 1;
    }
  }
  for (const room of rooms) for (const c of room.cells) b.tiles[c] = TILE.floor;
  // Each cabin opens on the spine.
  for (const room of rooms) {
    if (room === engines || room === bridge) continue;
    const top = room.y < cy;
    const dx = room.x + Math.floor(room.w / 2);
    for (let y = top ? room.y + room.h : cy + 1; top ? y < cy : y < room.y; y++) b.tiles[cellAt(b, dx, y)] = TILE.corridor;
  }
  // Airlocks: through the hull from two cabins near the middle; the first is the way aboard on the top deck.
  const airlocks: [number, number][] = [];
  for (const top of [true, false]) {
    const cabins = rooms.filter((r) => r !== engines && r !== bridge && !r.tag && (top ? r.y < cy : r.y > cy));
    const cabin = cabins[Math.floor(cabins.length / 2)];
    if (!cabin) continue;
    const ax = cabin.x + Math.floor(cabin.w / 2);
    let out = top ? cabin.y - 1 : cabin.y + cabin.h;
    while (out > 0 && out < H - 1 && b.tiles[cellAt(b, ax, out)] === TILE.hull) {
      b.tiles[cellAt(b, ax, out)] = TILE.corridor;
      out += top ? -1 : 1;
    }
    // The hatch stands just outside the hull; the way to it is walked like a passage.
    b.tiles[cellAt(b, ax, out)] = TILE.corridor;
    airlocks.push([ax, out]);
    cabin.airlock = true;
  }
  placeDoors(b, rooms.map((r) => r.cells));
  airlocks.forEach(([x, y], k) => b.features.push({ x, y, kind: "airlock", ...(k === 0 && b.depth === 1 ? { to: "" } : {}) }));
  const upLift = lifts.find((l) => l.tag === "up");
  const downLift = lifts.find((l) => l.tag === "down");
  if (upLift) b.features.push({ x: upLift.x + 1, y: upLift.y + 1, kind: "stairs-up" });
  if (downLift && b.depth < (params.levels ?? 1)) b.features.push({ x: downLift.x + 1, y: downLift.y + 1, kind: "stairs-down" });
  // A derelict: holes in its hull, wreckage in its passages.
  if (derelict)
    for (let k = 0; k < 3; k++) {
      const x = rng.int(engineEnd, bridgeStart),
        top = rng.chance(0.5);
      const y = top ? cy - halfAt(x) : cy + halfAt(x);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (b.tiles[cellAt(b, x + dx, y + dy)] === TILE.hull) b.tiles[cellAt(b, x + dx, y + dy)] = TILE.rock;
    }
  const start = startOf(b);
  const map = { tiles: b.tiles, params };
  const dist = walk(map, doorsOf(b), start);
  const reach = (r: Room) => Math.min(...r.cells.map((c) => dist[c]));
  const order = [...rooms].sort((p, q) => reach(p) - reach(q));
  const entry = upLift ?? rooms.find((r) => r.airlock) ?? order[0];
  const ordered = [entry, ...order.filter((r) => r !== entry)];
  // Whoever holds the ship holds its bridge or its engines, whichever lies farther in.
  const final = reach(bridge) >= reach(engines) ? bridge : engines;
  const pool = own.pool ?? PURPOSES[params.theme];
  const keyed: Keyed[] = [];
  ordered.forEach((r) => {
    const special: Keyed["purpose"] | null = r === entry ? (r.tag === "up" ? "entrance" : "airlock") : r === bridge ? "ship-bridge" : r === engines ? "engine-room" : r.airlock ? "airlock" : null;
    const purpose = special ?? own.take(rng.pick(pool), false);
    keyed.push(keyRoom(b, r.cells, r.x + r.w / 2, r.y + r.h / 2, purpose, { final: r === final }));
  });
  // The first room aboard is the way in, whatever it looks like.
  if (keyed[0].purpose === "airlock" && b.depth === 1) keyed[0].purpose = "entrance";
  const dress = b.rng.fork("dress");
  for (const room of keyed) furnish(b, room, dress.fork(`room-${room.id}`));
  if (derelict)
    for (let k = 0; k < W * H * 0.012; k++) {
      const i = dress.int(0, W * H - 1);
      if (b.tiles[i] === TILE.corridor && !taken(b, i % W, Math.floor(i / W))) b.tiles[i] = TILE.rubble;
    }
  const locks = b.rng.fork("locks");
  const finalKeyed = keyed.find((k) => k.final);
  lockAndKey(b, locks.chance(0.6) && finalKeyed ? [finalKeyed] : [], locks);
  setTraps(b);
}
