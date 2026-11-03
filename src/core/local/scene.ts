// One room of a local map up close, for a fight or a scene: the room and a little around it, its dwellers as numbered
// tokens (a band's leader and the place's ruler stand out), what gives cover, where the light falls (torches in old
// places, lamps in later ones, nothing but fire in a cave), and the ways out.
import { createRng } from "../random";
import { blocked, TILE, type LocalFeatureKind, type LocalMap } from "./model";
import { localPixels, renderLocal, type LocalRenderOptions } from "../render/local-svg";
import { ageGroupOf } from "./stock";

export interface SceneToken {
  x: number;
  y: number;
  /** Which band (A, B, …) and which one of it (1, 2, …). */
  group: number;
  n: number;
  boss?: boolean;
  leader?: boolean;
}

export interface LocalScene {
  room: number;
  /** The tiles shown: a box round the room. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  tokens: SceneToken[];
  /** Light sources: tile, reach in tiles. */
  lights: { x: number; y: number; r: number }[];
  cover: { x: number; y: number; full: boolean }[];
  /** Doors, stairs and ways out of the room. */
  exits: { x: number; y: number; kind: LocalFeatureKind }[];
  /** No light of its own: a cave, a derelict, a place long dark. */
  dark: boolean;
}

const FULL: LocalFeatureKind[] = ["pillar", "statue", "rock", "tree", "stalagmite", "machine", "reactor", "great-tree", "derrick"];
const HALF: LocalFeatureKind[] = ["crate", "coffin", "altar", "bunk", "console", "chest", "cart", "terminal", "fence", "grave", "mushroom", "crystal"];
const EXITS: LocalFeatureKind[] = ["door", "locked-door", "secret-door", "stairs-up", "stairs-down", "exit", "airlock", "portal"];

export function localScene(map: LocalMap, roomId: number): LocalScene | null {
  const room = map.keyed.find((k) => k.id === roomId);
  if (!room) return null;
  const W = map.params.width,
    H = map.params.height;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const c of room.cells) {
    x0 = Math.min(x0, c % W);
    x1 = Math.max(x1, c % W);
    y0 = Math.min(y0, Math.floor(c / W));
    y1 = Math.max(y1, Math.floor(c / W));
  }
  x0 = Math.max(0, x0 - 2);
  y0 = Math.max(0, y0 - 2);
  x1 = Math.min(W - 1, x1 + 2);
  y1 = Math.min(H - 1, y1 + 2);
  const inBox = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const near = (x: number, y: number) => inBox(x, y) && room.cells.some((c) => Math.abs((c % W) - x) + Math.abs(Math.floor(c / W) - y) <= 1);
  const things = map.features.filter((f) => inBox(f.x, f.y));
  const busy = new Set(things.map((f) => f.x + f.y * W));
  // Tokens on free dry floor, the boss and leaders farthest from the way in, the rest spread about.
  const rng = createRng(`${map.params.seed}/scene-${roomId}`);
  const free = rng.shuffle(room.cells.filter((c) => !busy.has(c) && !blocked(map.tiles[c]) && map.tiles[c] !== TILE.deep));
  const door = things.find((f) => EXITS.includes(f.kind) && near(f.x, f.y));
  const far = (c: number) => (door ? Math.hypot((c % W) - door.x, Math.floor(c / W) - door.y) : 0);
  const tokens: SceneToken[] = [];
  room.monsters.forEach((group, g) => {
    for (let n = 1; n <= group.count && free.length; n++) {
      const lead = (group.boss && n === 1) || (group.leader && n === 1);
      if (lead) free.sort((p, q) => far(q) - far(p));
      const c = free.shift()!;
      tokens.push({ x: c % W, y: Math.floor(c / W), group: g, n, ...(group.boss && n === 1 ? { boss: true } : {}), ...(group.leader && n === 1 ? { leader: true } : {}) });
    }
  });
  // Light: torches by the walls in old places, lamps overhead later; fires light themselves.
  const age = ageGroupOf(map.params);
  const dark = map.params.kind === "cave" || map.params.theme === "derelict" || map.params.theme === "crypt" || age === "after";
  const lights: LocalScene["lights"] = things.filter((f) => f.kind === "fire" || f.kind === "reactor" || f.kind === "portal" || f.kind === "crystal").map((f) => ({ x: f.x, y: f.y, r: f.kind === "crystal" ? 2 : 5 }));
  if (map.params.kind !== "wilderness" && !dark) {
    const step = age === "old" || age === "primal" ? 4 : 3;
    for (const c of room.cells) {
      const x = c % W,
        y = Math.floor(c / W);
      const byWall = [c - 1, c + 1, c - W, c + W].some((n) => n >= 0 && n < map.tiles.length && map.tiles[n] === TILE.rock);
      if ((age === "old" || age === "primal" ? byWall : true) && x % step === 0 && y % step === 0) lights.push({ x, y, r: age === "old" || age === "primal" ? 4 : 5 });
    }
  }
  const cover = things.filter((f) => FULL.includes(f.kind) || HALF.includes(f.kind)).map((f) => ({ x: f.x, y: f.y, full: FULL.includes(f.kind) }));
  const exits = things.filter((f) => EXITS.includes(f.kind) && near(f.x, f.y)).map((f) => ({ x: f.x, y: f.y, kind: f.kind }));
  return { room: roomId, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1, tokens, lights, cover, exits, dark };
}

/** How much bigger a scene is drawn than its map. */
export const SCENE_ZOOM = 2.5;

const TOKEN = ["#c0392b", "#2f7fd0", "#2e9e5b", "#c98a1a", "#8a4fc9", "#1d1d1d"];

/** A scene as SVG: the room cut from its map and drawn larger, the dark round it, the light, cover and tokens. */
export function renderLocalScene(map: LocalMap, scene: LocalScene, options: LocalRenderOptions = {}): string {
  const S = localPixels(map);
  const k = SCENE_ZOOM;
  const inner = renderLocal(map, { ...options, highlight: null, coords: false }).replace(/^<svg[^>]*>/u, "").replace(/<\/svg>$/u, "");
  const w = scene.w * S * k,
    h = scene.h * S * k;
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="'Segoe UI', Arial, sans-serif">`];
  out.push(`<defs><radialGradient id="scene-light"><stop offset="0" stop-color="#fff3c4" stop-opacity="0.55"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient><mask id="scene-dark"><rect width="${w}" height="${h}" fill="white"/>${scene.lights.map((l) => `<circle cx="${(l.x - scene.x0 + 0.5) * S * k}" cy="${(l.y - scene.y0 + 0.5) * S * k}" r="${l.r * S * k}" fill="black" opacity="0.85"/>`).join("")}</mask></defs>`);
  out.push(`<g transform="scale(${k}) translate(${-scene.x0 * S},${-scene.y0 * S})">${inner}</g>`);
  // Darkness where no light reaches: deep in a cave, half-dark under torches.
  out.push(`<rect width="${w}" height="${h}" fill="#05060a" opacity="${scene.dark ? 0.55 : 0.25}" mask="url(#scene-dark)"/>`);
  for (const l of scene.lights) out.push(`<circle cx="${(l.x - scene.x0 + 0.5) * S * k}" cy="${(l.y - scene.y0 + 0.5) * S * k}" r="${l.r * S * k * 0.6}" fill="url(#scene-light)"/>`);
  // Cover: a shield on what stops a blow, half or whole.
  for (const c of scene.cover) out.push(`<path d="M${(c.x - scene.x0 + 0.78) * S * k},${(c.y - scene.y0 + 0.08) * S * k}h${S * k * 0.18}v${S * k * 0.14}l${-S * k * 0.09},${S * k * 0.08}l${-S * k * 0.09},${-S * k * 0.08}Z" fill="${c.full ? "#2e9e5b" : "#c98a1a"}" stroke="#fff" stroke-width="1"/>`);
  for (const t of options.players ? scene.tokens.filter(() => true) : scene.tokens) {
    const cx = (t.x - scene.x0 + 0.5) * S * k,
      cy = (t.y - scene.y0 + 0.5) * S * k;
    const r = S * k * (t.boss ? 0.46 : 0.38);
    out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${TOKEN[t.group % TOKEN.length]}" stroke="${t.boss ? "#ffd34d" : t.leader ? "#ffffff" : "#1d1d1d"}" stroke-width="${t.boss || t.leader ? 3 : 1.5}"/><text x="${cx}" y="${cy + r * 0.38}" text-anchor="middle" font-size="${r * 1.05}" font-weight="700" fill="#fff">${String.fromCharCode(65 + (t.group % 26))}${t.n}</text>`);
  }
  out.push(`</svg>`);
  return out.join("");
}
