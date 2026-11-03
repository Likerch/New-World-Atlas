// Local maps on a battle grid: dungeons of rooms and corridors (crypts, temples, mines, sewers, bunkers, derelict
// ships, and for later ages factories, metro stations, labs, malls, vaults and starships), caves grown by cellular
// automata, and wilderness — forest, taiga, swamp, desert, mountain pass, coast, jungle, steppe, tundra, the sea floor,
// the wasteland after the fall — with streams, rivers, trails and a centrepiece. Every room or site is keyed for a game
// master: what it is, who is there and how many, what lies hidden, what will hurt, how it looks.
import { createLanguage, name, type Language } from "../language";
import { makeNpc } from "../people";
import { fbm, noise2 } from "../noise";
import { PriorityQueue } from "../queue";
import { createRng, hashString, randomSeed } from "../random";
import { boxOf, bridgeChasms, furnish, keyRoom, linkPoint, pathBetween, setTraps, spot, startOf, taken, veins, type Build } from "./build";
import { dungeon } from "./dungeon";
import { blocked, LOCAL_KINDS, LOCAL_THEMES, placeSeed, TILE, walk, type Keyed, type LocalFeature, type LocalGroup, type LocalMap, type LocalParams, type Purpose } from "./model";
import { NO_OWN, ownPlan, ownTables, ownThemeOf, type LocalOwn, type OwnPlan } from "./own";
import { countOf, leaderOf, magicOf, PURPOSES, tablesOf, wanderingOf, type Tables } from "./stock";

export * from "./model";

export function localParams(input: Partial<LocalParams> = {}): LocalParams {
  const seed = input.seed || randomSeed();
  const rng = createRng(seed).fork("local-params");
  const kind = input.kind ?? rng.pick(LOCAL_KINDS);
  return {
    seed,
    kind,
    theme: input.theme && LOCAL_THEMES[kind].includes(input.theme) ? input.theme : rng.pick(LOCAL_THEMES[kind]),
    width: kind === "wilderness" ? 96 : 64,
    height: kind === "wilderness" ? 64 : 44,
    rooms: kind === "dungeon" ? rng.int(9, 16) : 2,
    danger: 2,
    levels: kind === "wilderness" ? 1 : rng.int(1, 3),
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "")),
  };
}

/** Whoever rules a place, the same whichever level one starts from: the dweller its legend names, a tomb's dead ruler
 * risen where magic stirs, a tower's mage, a brigand camp's whole band; else the strongest thing of its kind. */
function lordOf(params: LocalParams, tables: Tables, language: Language, depth: number): LocalGroup | null {
  const base = placeSeed(params.seed);
  const facts = params.origin?.facts ?? {};
  const kind = params.origin?.kind;
  const band = (who: string, extra: Partial<LocalGroup> = {}): LocalGroup => {
    const count = extra.count ?? countOf(createRng(base).fork("lord-count"), who, params.danger, depth);
    const lead = leaderOf(who);
    return { who, count, boss: true, ...(lead && count > 1 ? { leader: makeNpc(`${base}/lord`, language, lead) } : {}), ...extra };
  };
  if (params.boss) return band(params.boss);
  if (kind === "tomb") return tables.magic >= 1 ? { who: "mummy", count: 1, boss: true, ...(facts.ruler ? { name: String(facts.ruler) } : {}) } : null;
  if (kind === "wizard-tower") return { who: "mage", count: 1, boss: true, ...(facts.mage ? { name: String(facts.mage) } : {}) };
  if (kind === "brigands") return band("bandits", { count: Math.max(3, Number(facts.band) || 8), leader: makeNpc(`${base}/lord`, language, "boss") });
  return band(createRng(base).fork("lord").pick(tables.lords));
}

/** Who lives in a lived-in place: a hold's deep folk, a monastery's monks, a vault's survivors, a working mine's
 * miners on its first level, a starship's crew. */
function residentsOf(params: LocalParams, depth: number, tables: Tables): string | undefined {
  const kind = params.origin?.kind;
  const facts = params.origin?.facts ?? {};
  if (params.theme === "hold") return "deep-folk";
  if (kind === "monastery" && depth === 1) return "monks";
  if (kind === "bunker") return Number(facts.dwellers) > 0 ? "survivors" : undefined;
  if (kind === "mine" && depth === 1 && tables.age !== "after") return "miners";
  if (params.theme === "vault" && !kind && createRng(placeSeed(params.seed)).fork("lived-in").chance(0.5)) return "survivors";
  if (params.theme === "starship" && createRng(placeSeed(params.seed)).fork("crewed").chance(0.5)) return "crew";
  return undefined;
}

/** The point on a map's edge a compass way leaves by (0 north, 2 east, 4 south, 6 west). */
function edgePoint(W: number, H: number, dir: number): [number, number] {
  const angle = ((dir % 8) * Math.PI) / 4;
  const dx = Math.sin(angle),
    dy = -Math.cos(angle);
  const t = Math.min(dx ? (dx > 0 ? (W - 1 - W / 2) / dx : -W / 2 / dx) : Infinity, dy ? (dy > 0 ? (H - 1 - H / 2) / dy : -H / 2 / dy) : Infinity);
  return [Math.max(0, Math.min(W - 1, Math.round(W / 2 + dx * t))), Math.max(0, Math.min(H - 1, Math.round(H / 2 + dy * t)))];
}

function cave(b: Build, plan: OwnPlan) {
  const { W, H, rng, params } = b;
  const at = (x: number, y: number) => x + y * W;
  const cavern = params.origin?.kind;
  let open = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) open[at(x, y)] = rng.chance(0.55) ? 1 : 0;
  for (let round = 0; round < 5; round++) {
    const next = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!open[at(x + dx, y + dy)]) walls++;
        next[at(x, y)] = walls >= 5 ? 0 : 1;
      }
    open = next;
  }
  // Where the levels meet is open ground on both; the way down is kept even on the last level.
  const up = b.depth > 1 ? linkPoint(params.seed, b.depth - 1, W, H) : null;
  const down = linkPoint(params.seed, b.depth, W, H);
  const disk = (cx: number, cy: number, r: number) => {
    for (let y = Math.max(1, cy - r); y <= Math.min(H - 2, cy + r); y++) for (let x = Math.max(1, cx - r); x <= Math.min(W - 2, cx + r); x++) if (Math.hypot(x - cx, y - cy) <= r) open[at(x, y)] = 1;
  };
  for (const p of [up, down]) if (p) disk(p[0], p[1], 3);
  const largest = () => {
    const region = new Int32Array(W * H).fill(-1);
    let best: number[] = [];
    for (let i = 0; i < W * H; i++) {
      if (!open[i] || region[i] >= 0) continue;
      const cells = [i];
      region[i] = i;
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k];
        for (const n of [c - 1, c + 1, c - W, c + W]) if (n >= 0 && n < W * H && open[n] && region[n] < 0) (region[n] = i, cells.push(n));
      }
      if (cells.length > best.length) best = cells;
    }
    return best;
  };
  // A winding tunnel from a point to the nearest of the main cave.
  const tunnel = (x: number, y: number, main: Set<number>) => {
    let target = -1,
      d0 = Infinity;
    for (const c of main) {
      const d = Math.hypot((c % W) - x, Math.floor(c / W) - y);
      if (d < d0) [d0, target] = [d, c];
    }
    if (target < 0) return;
    const tx = target % W,
      ty = Math.floor(target / W);
    for (let guard = 0; guard < W + H && (x !== tx || y !== ty); guard++) {
      if (rng.next() < Math.abs(tx - x) / (Math.abs(tx - x) + Math.abs(ty - y) || 1)) x += Math.sign(tx - x);
      else y += Math.sign(ty - y);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
        const nx = Math.max(0, Math.min(W - 1, x + dx)),
          ny = Math.max(0, Math.min(H - 1, y + dy));
        open[at(nx, ny)] = 1;
      }
    }
  };
  let main = new Set(largest());
  for (const p of [up, down]) if (p && !main.has(at(p[0], p[1]))) tunnel(p[0], p[1], main);
  // Ways off the map: a cavern's tunnels to its neighbours, else on the first level the way in from the surface.
  const ways: { x: number; y: number; to: string }[] = [];
  if (params.exits?.length) for (const exit of params.exits) ways.push({ ...xy(edgePoint(W, H, exit.dir)), to: exit.to || exit.kind });
  else if (b.depth === 1) {
    let near = -1,
      d0 = Infinity;
    for (const c of main) {
      const d = Math.min(c % W, W - 1 - (c % W), Math.floor(c / W), H - 1 - Math.floor(c / W));
      if (d < d0) [d0, near] = [d, c];
    }
    const x = near % W,
      y = Math.floor(near / W);
    const edges: [number, number, number][] = [
      [x, 0, y],
      [W - 1 - x, W - 1, y],
      [y, x, 0],
      [H - 1 - y, x, H - 1],
    ];
    const [, ex, ey] = edges.reduce((best, e) => (e[0] < best[0] ? e : best));
    ways.push({ x: ex, y: ey, to: "" });
  }
  for (const way of ways) {
    tunnel(way.x, way.y, main);
    open[at(way.x, way.y)] = 1;
  }
  main = new Set(largest());
  const best = [...main];
  for (const i of best) b.tiles[i] = TILE.floor;
  for (const way of ways) {
    b.tiles[at(way.x, way.y)] = TILE.floor;
    b.features.push({ x: way.x, y: way.y, kind: "exit", to: way.to });
  }
  if (up) b.features.push({ x: up[0], y: up[1], kind: "stairs-up" });
  const start = startOf(b);

  // Water in the low spots (a whole lake in an underground sea), lava in a magma chamber, stalagmites about.
  const damp = noise2(rng.fork("pools"));
  const sea = cavern === "sea";
  const magma = cavern === "magma";
  const pools: number[][] = [];
  for (const i of best) {
    const x = i % W,
      y = Math.floor(i / W);
    if (Math.hypot(x - (up?.[0] ?? -99), y - (up?.[1] ?? -99)) < 3 || Math.hypot(x - down[0], y - down[1]) < 3) continue;
    const v = fbm(damp, x / 14, y / 14, 3) + (sea ? 0.32 - Math.hypot(x / W - 0.5, y / H - 0.5) * 0.6 : 0);
    if (v > 0.35) {
      if (magma) pools.push([i]);
      else b.tiles[i] = v > 0.5 ? TILE.deep : TILE.water;
    } else if (rng.chance(0.015)) b.features.push({ x, y, kind: "stalagmite" });
  }
  // Lava only where it cuts nothing off.
  if (magma) {
    for (const [i] of pools) b.tiles[i] = TILE.lava;
    const dist = walk({ tiles: b.tiles, params }, new Map(), start);
    for (const [i] of pools) if ([i - 1, i + 1, i - W, i + W].some((n) => n >= 0 && n < W * H && !blocked(b.tiles[n]) && dist[n] === Infinity)) b.tiles[i] = TILE.stone;
  }
  // A crack across the cave (a whole abyss in one), bridged where it cuts the way.
  if (cavern === "abyss" || rng.chance(0.3)) {
    const crack = noise2(rng.fork("crack"));
    const vertical = rng.chance(0.5);
    const width = cavern === "abyss" ? 4 : 2;
    for (let k = 0; k < (vertical ? H : W); k++) {
      const mid = Math.round((vertical ? W : H) * (0.5 + 0.22 * crack(k / 18, 0.5)));
      for (let w = 0; w < width; w++) {
        const x = vertical ? mid + w : k,
          y = vertical ? k : mid + w;
        const c = at(x, y);
        if (x < 0 || y < 0 || x >= W || y >= H || blocked(b.tiles[c]) || taken(b, x, y)) continue;
        if ((up && Math.hypot(x - up[0], y - up[1]) < 3) || Math.hypot(x - down[0], y - down[1]) < 3) continue;
        b.tiles[c] = TILE.chasm;
      }
    }
    bridgeChasms(b, start);
  }
  const looks: Partial<Record<string, "mushroom" | "crystal" | "pillar">> = { fungal: "mushroom", crystal: "crystal", ruins: "pillar" };
  const strewn = cavern ? looks[cavern] : undefined;
  if (strewn) for (const i of best) if (b.tiles[i] === TILE.floor && rng.chance(0.03) && !taken(b, i % W, Math.floor(i / W))) b.features.push({ x: i % W, y: Math.floor(i / W), kind: strewn });

  // Chambers: the widest open spots, keyed.
  const width = new Float32Array(W * H);
  for (const i of best) {
    let r = 0;
    while (r < 8 && [i - r, i + r, i - r * W, i + r * W].every((n) => n >= 0 && n < W * H && !blocked(b.tiles[n]))) r++;
    width[i] = r;
  }
  const spots = [...best].filter((i) => !blocked(b.tiles[i])).sort((p, q) => width[q] - width[p]);
  const chosen: number[] = [];
  for (const i of spots) {
    if (chosen.length >= 6 + params.rooms) break;
    if (chosen.some((c) => Math.hypot((c % W) - (i % W), Math.floor(c / W) - Math.floor(i / W)) < 10)) continue;
    chosen.push(i);
  }
  // The way in is the chamber nearest the start; the rest rank by the walk from it, the lair (a hold's hoard) last.
  const dist = walk({ tiles: b.tiles, params }, new Map(), start);
  const near = (c: number) => Math.hypot((c % W) - (start % W), Math.floor(c / W) - Math.floor(start / W));
  chosen.sort((p, q) => near(p) - near(q));
  const entry = chosen[0];
  chosen.sort((p, q) => (p === entry ? -1 : q === entry ? 1 : Math.min(1e9, dist[p]) - Math.min(1e9, dist[q])));
  // Each spot of open ground belongs to the nearest chamber whose reach it lies in: chambers never share ground.
  const home = new Map<number, number>();
  for (const c of best) {
    let nearest = -1;
    let d0 = Infinity;
    for (const i of chosen) {
      const d = Math.hypot((c % W) - (i % W), Math.floor(c / W) - Math.floor(i / W));
      if (d < width[i] + 1 && d < d0) [d0, nearest] = [d, i];
    }
    if (nearest >= 0) home.set(c, nearest);
  }
  const hold = params.theme === "hold";
  const pool = plan.pool ?? PURPOSES[params.theme];
  const biggest = [...chosen].slice(1, -1).sort((p, q) => width[q] - width[p])[0];
  chosen.forEach((i, rank) => {
    const x = i % W,
      y = Math.floor(i / W);
    const last = rank === chosen.length - 1 && chosen.length > 1;
    const purpose: Keyed["purpose"] = rank === 0 ? "entrance" : last ? (hold ? "treasury" : "lair") : hold && i === biggest ? "great-hall" : plan.take(rng.pick(pool), false);
    const cells = best.filter((c) => home.get(c) === i);
    keyRoom(b, cells, x, y, purpose, { final: last && !hold });
  });
  if (hold && b.keyed.length > 1) b.keyed[b.keyed.length - 1].final = true;
  const dress = rng.fork("dress");
  for (const room of b.keyed) furnish(b, room, dress.fork(`room-${room.id}`));
  // A mine: rails from the way in to the deepest working, veins in its walls.
  if (params.theme === "mine") {
    const last = b.keyed[b.keyed.length - 1];
    if (last) {
      const path = pathBetween(b, start, last.cells.find((c) => !blocked(b.tiles[c])) ?? last.cells[0]);
      const laid = path.filter((c) => b.tiles[c] === TILE.floor && !taken(b, c % W, Math.floor(c / W)));
      for (const c of laid) b.tiles[c] = TILE.rail;
      if (laid.length > 8) {
        const c = laid[Math.floor(laid.length / 2)];
        b.features.push({ x: c % W, y: Math.floor(c / W), kind: "cart" });
      }
    }
    veins(b, best, 0.025, dress);
    for (const room of b.keyed.filter((k) => k.purpose === "mine-face")) veins(b, room.cells, 0.3, dress);
  }
  if (b.depth < (params.levels ?? 1)) {
    const [x, y] = taken(b, down[0], down[1]) || blocked(b.tiles[at(down[0], down[1])]) ? spot(b, best.filter((c) => Math.hypot((c % W) - down[0], Math.floor(c / W) - down[1]) < 5), down[0], down[1]) : down;
    b.features.push({ x, y, kind: "stairs-down" });
  }
  setTraps(b);
}

const xy = ([x, y]: [number, number]) => ({ x, y });

/** A number in [0, 1) from a key, the same wherever it is asked for. */
const unit = (key: string) => hashString(key) / 4294967296;

/** What stands at the heart of a wild place: its legend's own (a great tree, a ring of stones, a battlefield, a
 * bridge, a wreck…), else its land's. */
const CENTRE: Partial<Record<string, string>> = { "sacred-grove": "great-tree", "giant-tree": "great-tree", megalith: "stone-ring", "ley-nexus": "stone-ring", battlefield: "battlefield", bridge: "bridge", shipwreck: "wreck", volcano: "crater", crater: "crater", radiation: "crater", "hot-spring": "hot-pools", brigands: "bandit-camp", "oil-field": "derricks", biodome: "dome", "toxic-zone": "toxic-pool", "hunting-ground": "hunting-camp" };
const CENTRE_OF_LAND: Record<string, string[]> = { forest: ["great-tree", "ruined-tower"], taiga: ["hunting-camp", "stone-ring"], swamp: ["ruined-tower", "great-tree"], desert: ["oasis", "kurgan"], mountain: ["ruined-tower", "stone-ring"], coast: ["wreck", "ruined-tower"], wasteland: ["crater", "derricks"], jungle: ["ruined-tower", "great-tree"], steppe: ["kurgan", "stone-ring"], tundra: ["stone-ring", "hunting-camp"], seabed: ["wreck", "stone-ring"] };

function wilderness(b: Build): { stream: [number, number][]; trail: [number, number][]; river: [number, number][] } {
  const { W, H, params } = b;
  const at = (x: number, y: number) => x + y * W;
  const [sx, sy] = params.sheet ?? [0, 0];
  // A sheet beyond the first draws its sites from its own stream; the land itself is one across all sheets.
  const rng = sx || sy ? b.rng.fork(`sheet-${sx}-${sy}`) : b.rng;
  const relief = noise2(b.rng.fork("relief"));
  const growth = noise2(b.rng.fork("growth"));
  const height = new Float32Array(W * H);
  const theme = params.theme;
  const seabed = theme === "seabed";
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const gx = x + sx * W,
        gy = y + sy * H;
      let h = fbm(relief, gx / 40, gy / 40, 4);
      if (theme === "mountain") h += Math.abs((((gx / W) % 1) + 1) % 1 - 0.5);
      if (theme === "coast") h += (gx / W - 0.35) * 1.6;
      height[at(x, y)] = h;
      const g = fbm(growth, gx / 18, gy / 18, 4);
      let tile: number = TILE.grass;
      if (theme === "desert") tile = g > 0.45 ? TILE.stone : g > 0.25 ? TILE.grass : TILE.sand;
      else if (theme === "swamp") tile = g > 0.25 ? TILE.water : g > 0 ? TILE.marsh : g > -0.3 ? TILE.forest : TILE.grass;
      else if (theme === "mountain") tile = h > 0.55 ? TILE.snow : h > 0.3 ? TILE.cliff : h > 0.15 ? TILE.stone : g > 0.2 ? TILE.forest : TILE.grass;
      else if (theme === "taiga") tile = g > 0.35 ? TILE.thicket : g > -0.05 ? TILE.forest : g > -0.35 ? TILE.grass : TILE.snow;
      else if (theme === "wasteland") tile = g > 0.4 ? TILE.rubble : g > 0.1 ? TILE.stone : g > -0.35 ? TILE.sand : TILE.grass;
      else if (theme === "jungle") tile = g > 0.3 ? TILE.thicket : g > -0.15 ? TILE.forest : g > -0.4 ? TILE.grass : TILE.marsh;
      else if (theme === "steppe") tile = g > 0.5 ? TILE.forest : g < -0.45 ? TILE.sand : g < -0.3 ? TILE.stone : TILE.grass;
      else if (theme === "tundra") tile = h < -0.35 ? TILE.ice : g > 0.3 ? TILE.stone : g > -0.1 ? TILE.snow : TILE.grass;
      else if (seabed) tile = h < -0.3 ? TILE.deep : g > 0.35 ? TILE.kelp : g > 0.22 ? TILE.coral : g < -0.35 ? TILE.stone : TILE.sand;
      else tile = g > 0.38 ? TILE.thicket : g > 0.02 ? TILE.forest : g > -0.45 ? TILE.grass : TILE.stone;
      if (theme === "coast" && h < -0.15) tile = h < -0.3 ? TILE.deep : h < -0.22 ? TILE.water : TILE.sand;
      b.tiles[at(x, y)] = tile;
    }
  // Under the sea one swims everywhere; on land deep water is no way across but by a bridge.
  const passable = (i: number) => seabed || (b.tiles[i] !== TILE.deep && !blocked(b.tiles[i]));
  // Water runs from north to south across every sheet of a column, so neighbours meet: a river if the place has one,
  // else a stream.
  const course = (label: string, amplitude: number): [number, number][] => {
    const meander = noise2(b.rng.fork(label));
    const x0 = W * (0.25 + 0.5 * unit(`${params.seed}/${label}-${sx}`));
    const out: [number, number][] = [];
    for (let y = 0; y < H; y++) {
      const x = Math.max(1, Math.min(W - 2, Math.round(x0 + amplitude * W * fbm(meander, (y + sy * H) / 30, sx * 3.1, 3))));
      // Sideways steps on the row above, so the water never runs corner to corner.
      if (out.length) for (let k = out[out.length - 1][0]; k !== x; ) out.push([(k += Math.sign(x - k)), y - 1]);
      out.push([x, y]);
    }
    return out;
  };
  let stream: [number, number][] = [];
  let river: [number, number][] = [];
  if (params.river !== undefined && !seabed) {
    river = course("river", 0.2);
    for (const [x, y] of river)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= W) continue;
        b.tiles[at(nx, y)] = Math.abs(dx) <= 1 ? TILE.deep : TILE.water;
      }
  } else if (theme !== "desert" && !seabed) {
    stream = course("stream", 0.16);
    for (const [x, y] of stream) if (b.tiles[at(x, y)] !== TILE.deep) b.tiles[at(x, y)] = TILE.water;
  }
  // A trail from the west edge to the east, avoiding thickets and water; it meets the trails of the sheets beside it at
  // their shared edges; bridges where it crosses water.
  const trail: [number, number][] = [];
  if (!seabed) {
    const rowAt = (k: number) => Math.round(H * (0.2 + 0.6 * unit(`${params.seed}/trail-${k}-${sy}`)));
    const cost = (i: number) => (blocked(b.tiles[i]) ? Infinity : b.tiles[i] === TILE.deep ? (river.length ? 14 : Infinity) : b.tiles[i] === TILE.cliff ? 25 : b.tiles[i] === TILE.thicket ? 8 : b.tiles[i] === TILE.forest || b.tiles[i] === TILE.snow ? 3 : b.tiles[i] === TILE.water || b.tiles[i] === TILE.marsh ? 6 : b.tiles[i] === TILE.stone ? 2 : 1);
    const row = rowAt(sx);
    let first = 0;
    while (first < W - 1 && !passable(at(first, row))) first++;
    const startCell = at(first, row);
    const goalRow = rowAt(sx + 1);
    const best = new Float64Array(W * H).fill(Infinity);
    const came = new Int32Array(W * H).fill(-1);
    const queue = new PriorityQueue<number>();
    best[startCell] = 0;
    queue.push(startCell, 0);
    let goal = -1;
    for (let entry = queue.pop(); entry; entry = queue.pop()) {
      const [i, c] = entry;
      if (c > best[i]) continue;
      // The trail heads for the row where the next sheet's begins, and takes any of the east edge if that one is lost.
      if (i % W === W - 1 && (Math.floor(i / W) === goalRow || !Number.isFinite(cost(at(W - 1, goalRow))))) {
        goal = i;
        break;
      }
      const x = i % W;
      for (const n of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (n < 0 || n >= W * H) continue;
        const step = cost(n) + (n % W === W - 1 ? Math.abs(Math.floor(n / W) - goalRow) * 2 : 0);
        if (!Number.isFinite(step) || c + step >= best[n]) continue;
        best[n] = c + step;
        came[n] = i;
        queue.push(n, c + step);
      }
    }
    for (let i = goal; i >= 0; i = came[i]) {
      trail.push([i % W, Math.floor(i / W)]);
      if (b.tiles[i] === TILE.water || b.tiles[i] === TILE.deep) b.features.push({ x: i % W, y: Math.floor(i / W), kind: "bridge" });
      else b.tiles[i] = TILE.trail;
    }
    trail.reverse();
  }
  // Trees and rocks as features.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = b.tiles[at(x, y)];
      if ((t === TILE.forest && rng.chance(0.35)) || (t === TILE.thicket && rng.chance(0.7)) || (t === TILE.marsh && rng.chance(0.08))) b.features.push({ x, y, kind: "tree" });
      else if ((t === TILE.stone && rng.chance(seabed ? 0.05 : 0.12)) || (t === TILE.cliff && rng.chance(0.2))) b.features.push({ x, y, kind: "rock" });
    }
  const clear = (cells: number[]) => {
    for (const c of cells) if (b.tiles[c] === TILE.forest || b.tiles[c] === TILE.thicket || b.tiles[c] === TILE.kelp) b.tiles[c] = seabed ? TILE.sand : TILE.grass;
    const inside = new Set(cells);
    for (let k = b.features.length - 1; k >= 0; k--) if ((b.features[k].kind === "tree" || b.features[k].kind === "rock") && inside.has(at(b.features[k].x, b.features[k].y))) b.features.splice(k, 1);
  };
  const discOf = (x: number, y: number, r: number) => {
    const cells: number[] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1 && x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) cells.push(at(x + dx, y + dy));
    return cells;
  };
  const placed: [number, number][] = [];
  // The centrepiece, on the first sheet: by the place's legend or its land.
  const origin = params.origin?.kind;
  const object = !sx && !sy ? (origin ? CENTRE[origin] : undefined) ?? (origin ? undefined : rng.pick(CENTRE_OF_LAND[theme] ?? ["stone-ring"])) : undefined;
  if (object) centrepiece(b, object, river, trail, placed, discOf, clear, rng);
  // Sites along or off the trail: each kind once, then any kind again.
  const sites: Purpose[] = seabed ? ["clearing", "ruin", "lair", "nest", "shrine"] : ["camp", "clearing", "ruin", "lair", "spring", "shrine"];
  const once = rng.shuffle([...sites]);
  const wanted = Array.from({ length: 3 + params.rooms }, (_, k) => (k < once.length ? once[k] : rng.pick(sites)));
  let finalGiven = b.keyed.some((k) => k.final);
  for (const purpose of wanted) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = rng.int(4, W - 5),
        y = rng.int(4, H - 5);
      const t = b.tiles[at(x, y)];
      if (!passable(at(x, y)) || t === TILE.cliff || t === TILE.water || t === TILE.deep || placed.some(([px, py]) => Math.hypot(px - x, py - y) < 14)) continue;
      placed.push([x, y]);
      const cells = discOf(x, y, 3);
      clear(cells);
      const final = purpose === "lair" && !finalGiven;
      if (final) finalGiven = true;
      const room = keyRoom(b, cells, x, y, purpose, { final, name: purpose === "ruin" || purpose === "shrine" ? name(b.language, rng, "plain") : "" });
      furnish(b, room, rng.fork(`room-${room.id}`));
      break;
    }
  }
  // A brigand camp keeps sentries on the trail: two posts, each a few of the band.
  if (origin === "brigands") {
    const camp = b.keyed.find((k) => k.final);
    const band = camp?.monsters.find((g) => g.boss);
    const posts = b.keyed.filter((k) => k !== camp && (k.purpose === "clearing" || k.purpose === "camp")).slice(0, 2);
    for (const post of posts)
      if (band && band.count > 6) {
        const few = 2 + (hashString(`${params.seed}/post-${post.id}`) % 2);
        band.count -= few;
        post.monsters = [{ who: "bandits", count: few }];
      }
  }
  setTraps(b);
  return { stream, trail, river };
}

/** Lays out a wild place's centrepiece as its first keyed site. */
function centrepiece(b: Build, object: string, river: [number, number][], trail: [number, number][], placed: [number, number][], discOf: (x: number, y: number, r: number) => number[], clear: (cells: number[]) => void, rng: Build["rng"]) {
  const { W, H, params } = b;
  const at = (x: number, y: number) => x + y * W;
  const facts = params.origin?.facts ?? {};
  // A bridge stands where the trail crosses the river; anything else near the middle, on dry land by the trail.
  let x = Math.round(W / 2),
    y = Math.round(H / 2);
  if (object === "bridge" && river.length) {
    const crossing = b.features.filter((f) => f.kind === "bridge");
    if (crossing.length) [x, y] = [crossing[Math.floor(crossing.length / 2)].x, crossing[Math.floor(crossing.length / 2)].y];
  } else if (trail.length) {
    const mid = trail[Math.floor(trail.length / 2)];
    x = Math.max(8, Math.min(W - 9, mid[0] + rng.int(-6, 6)));
    y = Math.max(8, Math.min(H - 9, mid[1] + (rng.chance(0.5) ? 7 : -7)));
  }
  const radius = object === "battlefield" || object === "wreck" || object === "dome" ? 7 : object === "bridge" ? 3 : 5;
  const cells = discOf(x, y, radius);
  if (object !== "bridge") clear(cells);
  placed.push([x, y]);
  const put = (px: number, py: number, kind: LocalFeature["kind"]) => {
    if (px < 0 || py < 0 || px >= W || py >= H || taken(b, px, py)) return;
    b.features.push({ x: px, y: py, kind, room: b.keyed.length + 1 });
  };
  const ring = (r: number, count: number, kind: LocalFeature["kind"], gap = -1) => {
    for (let k = 0; k < count; k++) {
      if (k === gap) continue;
      const a = (k / count) * Math.PI * 2;
      put(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), kind);
    }
  };
  const purpose: Purpose = object === "bandit-camp" ? "camp" : "landmark";
  switch (object) {
    case "great-tree":
      put(x, y, "great-tree");
      if (params.origin?.kind === "sacred-grove") put(x, y + 3, "altar");
      break;
    case "stone-ring":
      ring(4, Math.max(6, Math.min(16, Number(facts.stones) || Number(facts.lines) * 2 || 9)), "pillar");
      put(x, y, "altar");
      break;
    case "battlefield":
      for (const c of cells) if (rng.chance(0.12) && b.tiles[c] !== TILE.water) b.tiles[c] = TILE.rubble;
      for (let k = 0; k < 8; k++) put(x - 4 + (k % 4) * 2, y + (k < 4 ? -2 : 2), "grave");
      for (let k = 0; k < 6; k++) put(x + rng.int(-6, 6), y + rng.int(-6, 6), "bones");
      break;
    case "wreck": {
      // A ship on its side: a hull with three holds, broken open amidships.
      const L = 15,
        x0 = Math.max(1, Math.min(W - L - 2, x - 7)),
        y0 = Math.max(1, Math.min(H - 7, y - 2));
      const holds: number[][] = [[], [], []];
      for (let dx = 0; dx < L; dx++)
        for (let dy = 0; dy < 5; dy++) {
          const c = at(x0 + dx, y0 + dy);
          const bowTaper = dx > L - 4 && (dy === 0 || dy === 4);
          if (bowTaper) continue;
          const edge = dy === 0 || dy === 4 || dx === 0 || dx === L - 1 || dx === 5 || dx === 10;
          const door = (dx === 5 || dx === 10) && dy === 2;
          const breach = dx === 7 && dy === 4;
          b.tiles[c] = edge && !door && !breach ? TILE.hull : TILE.floor;
          if (!edge || door || breach) holds[dx < 5 ? 0 : dx < 10 ? 1 : 2].push(c);
        }
      const cargo = facts.cargo ? String(facts.cargo) : "";
      const ids: [Keyed["purpose"], number][] = [["quarters", 0], ["cargo-hold", 1], ["storage", 2]];
      for (const [p, k] of ids) {
        const room = keyRoom(b, holds[k], x0 + 2 + k * 5, y0 + 2, p, { object: k === 1 ? "wreck" : undefined });
        if (k === 1 && cargo) room.treasure = { what: `fact:${cargo}` };
        furnish(b, room, rng.fork(`room-${room.id}`));
      }
      placed.push([x0 + L, y0]);
      return;
    }
    case "crater": {
      const lava = params.origin?.kind === "volcano";
      for (const c of discOf(x, y, 5)) {
        const d = Math.hypot((c % W) - x, Math.floor(c / W) - y);
        b.tiles[c] = d < 2.5 ? (lava ? TILE.lava : TILE.water) : d < 4 ? TILE.stone : TILE.rubble;
      }
      break;
    }
    case "hot-pools":
      for (const [dx, dy] of [[-2, -1], [2, 0], [0, 2]]) {
        for (const c of discOf(x + dx, y + dy, 1)) b.tiles[c] = TILE.water;
        put(x + dx, y + dy, "pool");
      }
      break;
    case "bandit-camp": {
      const band = Math.max(3, Number(facts.band) || 8);
      ring(5, 22, "fence", 0);
      put(x, y, "fire");
      for (let k = 0; k < Math.min(8, Math.max(2, Math.round(band / 5))); k++) {
        const a = (k / Math.min(8, Math.max(2, Math.round(band / 5)))) * Math.PI * 2 + 0.4;
        put(Math.round(x + Math.cos(a) * 3), Math.round(y + Math.sin(a) * 3), "tent");
      }
      put(x + 1, y - 1, "chest");
      break;
    }
    case "derricks":
      for (let k = 0; k < 4; k++) put(x + rng.int(-4, 4), y + rng.int(-4, 4), "derrick");
      for (const c of discOf(x, y, 4)) if (rng.chance(0.15)) b.tiles[c] = TILE.rubble;
      break;
    case "dome":
      ring(6, 30, "fence", 7);
      for (const c of discOf(x, y, 5)) b.tiles[c] = rng.chance(0.5) ? TILE.field : TILE.forest;
      break;
    case "oasis":
      for (const c of discOf(x, y, 2)) b.tiles[c] = TILE.water;
      ring(3, 8, "tree");
      break;
    case "toxic-pool":
      for (const c of discOf(x, y, 2)) b.tiles[c] = TILE.water;
      for (let k = 0; k < 4; k++) put(x + rng.int(-4, 4), y + rng.int(-4, 4), "bones");
      break;
    case "hunting-camp":
      put(x, y, "fire");
      put(x + 2, y - 1, "tent");
      put(x - 2, y + 1, "tent");
      put(x + 1, y + 2, "crate");
      break;
    case "kurgan":
      for (const c of discOf(x, y, 3)) b.tiles[c] = TILE.stone;
      put(x, y, "grave");
      break;
    case "ruined-tower":
      ring(3, 10, "pillar", 2);
      for (const c of discOf(x, y, 2)) b.tiles[c] = TILE.rubble;
      break;
    case "bridge":
      break;
  }
  keyRoom(b, cells, x, y, purpose, { object, final: purpose === "camp" });
}

export function generateLocal(input: Partial<LocalParams> = {}, language?: Language, own: LocalOwn = NO_OWN): LocalMap {
  const params = localParams(input);
  // A place of the game master's own theme is built like the theme it borrows.
  const ownTheme = ownThemeOf(params, own);
  const shaped: LocalParams = ownTheme && ownTheme.kind === params.kind ? { ...params, theme: ownTheme.base } : params;
  const rng = createRng(params.seed).fork("local");
  const tongue = language ? { ...language } : createLanguage(rng.fork("language"));
  const depth = params.depth ?? 1;
  const tables = tablesOf(shaped);
  tables.own = ownTables(shaped, own);
  tables.residents = residentsOf(shaped, depth, tables);
  // Whoever rules the place waits on its last level, the same whichever level one starts from.
  const lord = depth >= (params.levels ?? 1) ? lordOf(shaped, tables, tongue, depth) : null;
  const b: Build = { params: shaped, W: params.width, H: params.height, tiles: new Uint8Array(params.width * params.height), keyed: [], features: [], rng: rng.fork(params.kind === "dungeon" ? "dungeon" : params.kind === "cave" ? "cave" : "wild"), tables, lord, language: tongue, key: `local:${params.seed}`, depth };
  const plan = ownPlan(shaped, own, rng.fork("own"));
  let ways: { stream: [number, number][]; trail: [number, number][]; river: [number, number][] } = { stream: [], trail: [], river: [] };
  if (params.kind === "dungeon") dungeon(b, plan);
  else if (params.kind === "cave") cave(b, plan);
  else ways = wilderness(b);
  // The legend done: a tomb holds its ruler; the game master's rooms read their own words and open where they say.
  const facts = params.origin?.facts ?? {};
  const final = b.keyed.find((k) => k.final);
  if (final && params.origin?.kind === "tomb" && facts.ruler) final.name = String(facts.ruler);
  for (const room of b.keyed) {
    if (!room.purpose.startsWith("own:")) continue;
    const kind = own.rooms.find((item) => `own:${item.id}` === room.purpose);
    if (!kind) continue;
    if (kind.text) room.text = kind.text;
    if (kind.opens) {
      const box = boxOf(b, room.cells);
      const [x, y] = spot(b, room.cells, box.x + box.w / 2, box.y + box.h / 2);
      b.features.push({ x, y, kind: "portal", to: kind.opens, room: room.id });
    }
  }
  return {
    params,
    name: params.name || name(tongue, rng.fork("name"), "plain"),
    cell: params.kind === "wilderness" ? 5 : 1.5,
    tiles: b.tiles,
    keyed: b.keyed,
    features: b.features,
    stream: ways.stream,
    trail: ways.trail,
    river: ways.river,
    wandering: wanderingOf(rng.fork("wandering"), tables, params.danger, depth),
  };
}

/** The tables a place draws from, for an editor that rolls its rooms anew. */
export function tablesFor(params: LocalParams, own: LocalOwn = NO_OWN): Tables {
  const ownTheme = ownThemeOf(params, own);
  const shaped = ownTheme && ownTheme.kind === params.kind ? { ...params, theme: ownTheme.base } : params;
  const tables = tablesOf(shaped);
  tables.own = ownTables(shaped, own);
  tables.residents = residentsOf(shaped, params.depth ?? 1, tables);
  return tables;
}

export { magicOf };
