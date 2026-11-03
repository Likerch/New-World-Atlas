// One floor of a building as an SVG plan: rooms, walls, doors with their swing, windows, stairs, furniture drawn from
// above, the yard round it, and an optional battle-map grid (1.5 m squares). One metre is `PX` pixels.
import type { BuildingPlan, Door, Floor, Furniture, LockKind, Material, Room, RoomKind, YardFeature } from "../building/plan";
import { outerWalls } from "../building/shapes";
import type { ItemKind, RoomMap } from "../building/room";
import { present, type LegendSection } from "./legend";

export const PX = 24;

const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

export type BuildingThemeId = "ink" | "color" | "blueprint";
export const BUILDING_THEMES: BuildingThemeId[] = ["ink", "color", "blueprint"];

interface Theme {
  paper: string;
  ground: string;
  yard: string;
  floor: string;
  cellar: string;
  wall: string;
  line: string;
  window: string;
  wood: string;
  dark: string;
  cloth: string;
  stone: string;
  fire: string;
  label: string;
  grid: string;
  rooms: Partial<Record<RoomKind, string>>;
}

const THEMES: Record<BuildingThemeId, Theme> = {
  ink: { paper: "#f4efe1", ground: "#e9e2cc", yard: "#e3e6c8", floor: "#fbf8ef", cellar: "#e6e0d2", wall: "#2f2b25", line: "#5a5348", window: "#9cc0d6", wood: "#c9a77c", dark: "#6b5a46", cloth: "#d8c9b0", stone: "#a8a091", fire: "#e0893a", label: "#3a342b", grid: "rgba(60,50,40,0.18)", rooms: {} },
  color: {
    paper: "#eef0e6",
    ground: "#dfe6cf",
    yard: "#cfe0b4",
    floor: "#f7f3ea",
    cellar: "#ddd6c8",
    wall: "#3b3631",
    line: "#6a5f53",
    window: "#7fb6e0",
    wood: "#c08f5a",
    dark: "#6a4d35",
    cloth: "#c96f5d",
    stone: "#a79f94",
    fire: "#ee7b2c",
    label: "#2c2722",
    grid: "rgba(40,40,40,0.15)",
    rooms: { kitchen: "#f3e6cf", bedroom: "#eae3f2", "guest-room": "#eae3f2", "common-room": "#f6e9d2", hall: "#f3ead9", nave: "#efe9dc", corridor: "#ece8e0", bath: "#dcedf3", toilet: "#dcedf3", storage: "#e6e0d3", cellar: "#ddd6c8", "throne-room": "#f4e3c8", "operating-room": "#dff0ee", "dance-floor": "#e8dcf3", "server-room": "#dde3ec" },
  },
  blueprint: { paper: "#1d3f6e", ground: "#1d3f6e", yard: "#204473", floor: "#22477a", cellar: "#1a3a66", wall: "#e8f2ff", line: "#9cc3ef", window: "#7fd3ff", wood: "#2d5890", dark: "#3a69a8", cloth: "#2f5f9a", stone: "#3a66a0", fire: "#9cc3ef", label: "#e8f2ff", grid: "rgba(207,227,255,0.18)", rooms: {} },
};

export interface BuildingRenderOptions {
  theme?: BuildingThemeId;
  /** Index into plan.floors. */
  floor?: number;
  grid?: boolean;
  /** A room's label: by its kind, or the GM's own name for that room. */
  label?: (kind: RoomKind, room: { id: number }) => string;
  highlight?: number | null;
  /** The roofs seen from above instead of a floor. */
  roof?: boolean;
  /** The players' view: hidden doors and the hatch down stay hidden. */
  players?: boolean;
  /** A room's number in the building's key, if it has one. */
  numbers?: (room: Room) => number | null | undefined;
  /** The street in front, as the reader writes it. */
  street?: string;
}

const n = (value: number, px = PX) => Math.round(value * px * 10) / 10;

export function piece(f: Furniture, th: Theme, px = PX): string {
  const x = n(f.x, px),
    y = n(f.y, px),
    w = n(f.w, px),
    h = n(f.h, px);
  const rect = (fill: string, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${th.line}" stroke-width="0.8"${extra}/>`;
  const circle = (fill: string, scale = 1) => `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 2 * scale}" fill="${fill}" stroke="${th.line}" stroke-width="0.8"/>`;
  switch (f.kind) {
    case "bed":
    case "bunk":
      return rect("#ffffff") + `<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${Math.min(h * 0.2, 12)}" fill="${th.cloth}" stroke="${th.line}" stroke-width="0.5"/>`;
    case "table":
    case "desk":
    case "counter":
      return rect(th.wood);
    case "round-table":
      return circle(th.wood);
    case "chair":
      return rect(th.dark);
    case "bench":
    case "pew":
      return rect(th.dark);
    case "hearth":
    case "forge":
    case "stove":
      return rect(th.stone) + `<rect x="${x + w * 0.25}" y="${y + h * 0.25}" width="${w * 0.5}" height="${h * 0.5}" fill="${th.fire}"/>`;
    case "barrel":
      return circle(th.wood) + circle("none", 0.6);
    case "crate":
      return rect(th.wood) + `<path d="M${x},${y}L${x + w},${y + h}M${x + w},${y}L${x},${y + h}" stroke="${th.line}" stroke-width="0.6"/>`;
    case "shelf":
    case "rack":
    case "wardrobe":
      return rect(th.dark);
    case "altar":
    case "throne":
      return rect("#d9b44a");
    case "chest":
      return rect(th.wood) + `<path d="M${x},${y + h / 2}H${x + w}" stroke="${th.line}" stroke-width="0.6"/>`;
    case "tub":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#dff3fb" stroke="${th.line}" stroke-width="0.8"/>`;
    case "toilet":
      return circle("#ffffff");
    case "sofa":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${th.cloth}" stroke="${th.line}" stroke-width="0.8"/>`;
    case "screen":
      return rect("#2d3a4f");
    case "operating-table":
      return rect("#ffffff") + circle("#bfe7f0", 0.4);
    case "anvil":
      return rect("#3e3e3e");
    case "plant":
      return circle("#6fa35c");
    case "booth":
      return rect("#7a4fb0");
    case "carpet":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#b0463c" fill-opacity="0.35" stroke="#b0463c" stroke-width="1.2" stroke-dasharray="4 2"/>`;
    case "pillar":
      return circle(th.stone);
    case "furs":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 3}" fill="#9a7650" stroke="${th.line}" stroke-width="0.6"/>`;
    case "mat":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#d8c08a" fill-opacity="0.6" stroke="#a88a50" stroke-width="0.8" stroke-dasharray="3 2"/>`;
    case "log":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="#7a5634" stroke="${th.line}" stroke-width="0.6"/>`;
    case "pot":
      return circle("#b8734a");
    case "holo-table":
      return rect("#e6f6fb") + `<rect x="${x + w * 0.15}" y="${y + h * 0.15}" width="${w * 0.7}" height="${h * 0.7}" fill="none" stroke="#38c6e8" stroke-width="1.2"/>`;
    case "pod":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="#ffffff" stroke="#38c6e8" stroke-width="1.2"/>`;
    case "replicator":
      return rect("#c9d3da") + `<rect x="${x + w * 0.3}" y="${y + h * 0.25}" width="${w * 0.4}" height="${h * 0.5}" fill="#38c6e8"/>`;
    case "mattress":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e9e1cc" stroke="${th.line}" stroke-width="0.6" stroke-dasharray="2 1.5"/>`;
    case "machine":
      return rect("#8a9099") + circle(th.dark, 0.45) + circle("#c9ced4", 0.18);
    case "locker":
      return rect("#a3acb6") + `<path d="M${x + w / 2},${y}V${y + h}" stroke="${th.line}" stroke-width="0.5"/>`;
    case "pool":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#9fd4ea" stroke="${th.line}" stroke-width="1"/><rect x="${x + 3}" y="${y + 3}" width="${Math.max(0, w - 6)}" height="${Math.max(0, h - 6)}" rx="2" fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.7"/>`;
    case "vat":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#cfe7c4" stroke="${th.line}" stroke-width="0.8"/><path d="M${x + w / 2},${y + 3}V${y + h - 3}" stroke="#5c9a4a" stroke-width="${Math.max(1.5, w * 0.35)}" stroke-dasharray="3 2" stroke-linecap="round"/>`;
    case "generator":
      return rect("#5f6773") + circle("#f2c94c", 0.42);
    case "oven":
      return rect(th.stone) + `<path d="M${x + w * 0.2},${y + h}V${y + h * 0.45}A${w * 0.3},${h * 0.3} 0 0 1 ${x + w * 0.8},${y + h * 0.45}V${y + h}Z" fill="${th.dark}"/><rect x="${x + w * 0.32}" y="${y + h * 0.62}" width="${w * 0.36}" height="${h * 0.25}" fill="${th.fire}"/>`;
    case "hooks": {
      let hooks = "";
      for (let k = 1; k < 5; k++) hooks += `<circle cx="${x + (w * k) / 5}" cy="${y + h * 0.75}" r="${Math.max(1.5, h * 0.22)}" fill="#b0463c" stroke="${th.line}" stroke-width="0.5"/>`;
      return `<path d="M${x},${y + h * 0.2}H${x + w}" stroke="${th.dark}" stroke-width="1.6"/>${hooks}`;
    }
    case "loom": {
      let warp = "";
      for (let k = 1; k < 8; k++) warp += `M${x + (w * k) / 8},${y + 2}V${y + h - 2}`;
      return rect(th.wood) + `<path d="${warp}" stroke="${th.cloth}" stroke-width="0.8"/>`;
    }
    case "bolts": {
      const colours = ["#b0463c", "#3c6fb0", "#c9a227", "#5c8a4e", "#7a4fb0"];
      let rolls = "";
      const count = Math.max(2, Math.floor(w / 9));
      for (let k = 0; k < count; k++) rolls += `<rect x="${x + (w * k) / count + 0.5}" y="${y}" width="${w / count - 1}" height="${h}" rx="2" fill="${colours[k % colours.length]}" stroke="${th.line}" stroke-width="0.5"/>`;
      return rolls;
    }
    case "kiln":
      return circle(th.stone) + circle(th.fire, 0.45);
    case "still":
      return circle("#c98a4a") + `<circle cx="${x + w * 0.8}" cy="${y + h * 0.2}" r="${Math.min(w, h) * 0.16}" fill="none" stroke="#8a5a33" stroke-width="1.2"/>`;
    case "press":
      return rect(th.dark) + circle("#8a9099", 0.35);
    case "display":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e3f2f8" stroke="${th.line}" stroke-width="0.8"/><path d="M${x + 2},${y + 2}L${x + w - 2},${y + h - 2}" stroke="#ffffff" stroke-width="1" opacity="0.8"/>`;
    case "millstone":
      return circle("#b9b2a5") + circle(th.dark, 0.18) + `<path d="M${x + w / 2},${y + 2}V${y + h - 2}M${x + 2},${y + h / 2}H${x + w - 2}" stroke="${th.line}" stroke-width="0.5" opacity="0.6"/>`;
    case "lantern": {
      let rays = "";
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        rays += `M${x + w / 2 + Math.cos(a) * w * 0.3},${y + h / 2 + Math.sin(a) * h * 0.3}L${x + w / 2 + Math.cos(a) * w * 0.5},${y + h / 2 + Math.sin(a) * h * 0.5}`;
      }
      return `<path d="${rays}" stroke="#e0a400" stroke-width="1.5"/>` + circle("#ffd34d", 0.55);
    }
    case "stands": {
      let tiers = "";
      for (let k = 1; k < 3; k++) tiers += `M${x},${y + (h * k) / 3}H${x + w}`;
      return rect(th.stone) + `<path d="${tiers}" stroke="${th.line}" stroke-width="0.5"/>`;
    }
    case "stage": {
      let planks = "";
      for (let px2 = x + 8; px2 < x + w; px2 += 8) planks += `M${px2},${y}V${y + h}`;
      return rect(th.wood) + `<path d="${planks}" stroke="${th.line}" stroke-width="0.4" opacity="0.6"/>`;
    }
    case "rubble": {
      // A heap of broken stones: a few lumps, placed by the heap's own position.
      let lumps = "";
      for (let k = 0; k < 4; k++) {
        const fx = ((Math.sin((f.x + k) * 12.9898 + f.y * 78.233) * 43758.5453) % 1 + 1) % 1;
        const fy = ((Math.sin((f.y + k) * 39.3468 + f.x * 11.135) * 24634.6345) % 1 + 1) % 1;
        lumps += `<circle cx="${x + w * (0.2 + fx * 0.6)}" cy="${y + h * (0.2 + fy * 0.6)}" r="${Math.min(w, h) * (0.16 + fx * 0.14)}" fill="${k % 2 ? th.stone : "#9a8d78"}" stroke="${th.line}" stroke-width="0.4"/>`;
      }
      return lumps;
    }
    case "circle": {
      const cx = x + w / 2,
        cy = y + h / 2,
        r = Math.min(w, h) / 2;
      const star = Array.from({ length: 5 }, (_, k) => {
        const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5;
        return `${k ? "L" : "M"}${cx + Math.cos(a) * r * 0.78},${cy + Math.sin(a) * r * 0.78}`;
      }).join("");
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#7a3fb0" stroke-width="1.2"/><circle cx="${cx}" cy="${cy}" r="${r * 0.82}" fill="none" stroke="#7a3fb0" stroke-width="0.6"/><path d="${star}Z" fill="none" stroke="#7a3fb0" stroke-width="0.8"/>`;
    }
    case "hatch":
      return rect(th.wood) + `<path d="M${x},${y + h / 3}H${x + w}M${x},${y + (2 * h) / 3}H${x + w}" stroke="${th.line}" stroke-width="0.6"/><circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) * 0.12}" fill="none" stroke="${th.dark}" stroke-width="1.2"/>`;
  }
}

/** The part of the plane a plan's drawing shows, in metres: the yard (or a margin round the house), room for the
 * floor's name above, the street in front when the house knows it, and its neighbours when it is built wall to wall. */
export function buildingView(plan: BuildingPlan): { x: number; y: number; w: number; h: number } {
  const { width: W, depth: D } = plan.params;
  const bounds = plan.yard?.bounds ?? { x: -2, y: -2, w: W + 4, h: D + 4 };
  const pad = 1.5;
  const view = { x: bounds.x - pad, y: bounds.y - pad - 1.2, w: bounds.w + pad * 2, h: bounds.h + pad * 2 + 1.2 };
  if (plan.params.street) view.h += 4.5;
  if (plan.params.terrace) ((view.x -= 5), (view.w += 10));
  return view;
}

/** What the walls are built of when the plan does not say: the age, the house, the purse. */
export function materialOf(plan: BuildingPlan): Material {
  const { era, type } = plan.params;
  if (plan.params.material) return plan.params.material;
  if (era === "stone" || type === "hut" || type === "longhouse") return type === "longhouse" ? "timber" : "hide";
  if (era === "post-apocalypse") return type === "bunker" ? "concrete" : "scrap";
  if (era === "far-future") return "composite";
  if (era === "cyberpunk") return type === "office" || type === "lab" ? "glass" : "concrete";
  if (era === "modern") return type === "office" || type === "store" ? "glass" : type === "house" ? "brick" : "concrete";
  if (era === "industrial") return "brick";
  const grand = ["temple", "keep", "palace", "prison", "barracks", "lighthouse", "mage-tower", "bank", "guildhall", "arena", "theatre", "bathhouse"].includes(type);
  if (era === "ancient") return grand || type === "domus" ? "stone" : "brick";
  return grand || (plan.params.wealth ?? 0.5) > 0.7 ? "stone" : "timber";
}

const MATERIAL_WALL: Record<Material, { colour: string | null; dash?: string }> = {
  hide: { colour: "#8a6a48", dash: "6 2" },
  timber: { colour: "#6b4a2e" },
  adobe: { colour: "#b08356" },
  stone: { colour: null },
  brick: { colour: "#8a3b2c" },
  concrete: { colour: "#5d6066" },
  glass: { colour: "#3c7fa8" },
  composite: { colour: "#4a8fb0" },
  scrap: { colour: "#6a5a48", dash: "5 2 2 2" },
};

const LOCK_MARK: Partial<Record<LockKind, string>> = { latch: "#8a7a62", simple: "#3a342b", good: "#3a342b", master: "#c9a227", bar: "#6b4a2e", keycard: "#2bb5d9", biometric: "#2bb5d9", magic: "#7a3fb0" };

function yardFeature(f: YardFeature, th: Theme): string {
  const x = n(f.x),
    y = n(f.y),
    w = n(f.w),
    h = n(f.h);
  if (f.kind === "tree") return `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}" fill="#8fbf74" stroke="#4f7a3c" stroke-width="1"/>`;
  if (f.kind === "well" || f.kind === "fountain") return `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}" fill="${th.stone}" stroke="${th.line}" stroke-width="1.2"/><circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 3}" fill="${th.window}"/>`;
  if (f.kind === "bed") {
    let rows = "";
    for (let k = 4; k < h; k += 7) rows += `M${x + 2},${y + k}H${x + w - 2}`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#b89a6a" stroke="${th.line}" stroke-width="0.6"/><path d="${rows}" stroke="#6f8f4a" stroke-width="2"/>`;
  }
  if (f.kind === "parking") {
    let lines = "";
    for (let k = 0; k <= w; k += n(2.5)) lines += `M${x + k},${y}V${y + h}`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#bdbdbd"/><path d="${lines}" stroke="#ffffff" stroke-width="1"/>`;
  }
  if (f.kind === "wheel") {
    let paddles = "";
    for (let k = 0; k <= 8; k++) paddles += `M${x},${y + (h * k) / 8}H${x + w}`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${th.wood}" stroke="${th.line}" stroke-width="1"/><path d="${paddles}" stroke="${th.line}" stroke-width="0.8"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f.kind === "hay" ? "#e2c66a" : th.wood}" stroke="${th.line}" stroke-width="1"/>`;
}

/** A door in the wall: the gap, then what fills it — a leaf that swings, a curtain, bars, glass, a gate of two leaves. */
function doorSvg(door: Door, floor: Floor, th: Theme, floorFill: string, players: boolean): string {
  const half = door.width / 2;
  const [cx, cy] = door.at;
  const into = floor.rooms.find((r) => r.id === (door.rooms[1] >= 0 ? door.rooms[1] : door.rooms[0]));
  const fill = (into && th.rooms[into.kind]) || floorFill;
  const s = into ? (door.horizontal ? Math.sign(into.y + into.h / 2 - cy) || -1 : Math.sign(into.x + into.w / 2 - cx) || 1) : -1;
  if (door.walled) return "";
  if (door.secret) {
    // Only the game master sees a hidden door: a dashed red mark on the wall.
    if (players) return "";
    return door.horizontal
      ? `<rect x="${n(cx - half)}" y="${n(cy) - 3}" width="${n(door.width)}" height="6" fill="none" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="3 2"/>`
      : `<rect x="${n(cx) - 3}" y="${n(cy - half)}" width="6" height="${n(door.width)}" fill="none" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="3 2"/>`;
  }
  const gap = door.horizontal ? `<rect x="${n(cx - half)}" y="${n(cy - 0.25)}" width="${n(door.width)}" height="${n(0.5)}" fill="${fill}"/>` : `<rect x="${n(cx - 0.25)}" y="${n(cy - half)}" width="${n(0.5)}" height="${n(door.width)}" fill="${fill}"/>`;
  const across = (stroke: string, width: number, dash = "") => (door.horizontal ? `<path d="M${n(cx - half)},${n(cy)}H${n(cx + half)}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>` : `<path d="M${n(cx)},${n(cy - half)}V${n(cy + half)}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`);
  const leaf = (from: number, to: number, sweep: number, stroke: string, width: number, dash = "") => {
    const r = Math.abs(to - from);
    return door.horizontal
      ? `<path d="M${n(from)},${n(cy)}L${n(from)},${n(cy + s * r)}A${n(r)},${n(r)} 0 0 ${sweep} ${n(to)},${n(cy)}" fill="none" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`
      : `<path d="M${n(cx)},${n(from)}L${n(cx + s * r)},${n(from)}A${n(r)},${n(r)} 0 0 ${sweep} ${n(cx)},${n(to)}" fill="none" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  };
  const sweepH = s < 0 ? 1 : 0;
  const sweepV = s > 0 ? 1 : 0;
  const lo = door.horizontal ? cx - half : cy - half;
  const hi = door.horizontal ? cx + half : cy + half;
  const mid = (lo + hi) / 2;
  const sweep = door.horizontal ? sweepH : sweepV;
  let body: string;
  switch (door.kind) {
    case "arch":
      body = "";
      break;
    case "curtain":
      body = across(th.cloth, 2.2, "2 1.5");
      break;
    case "bars": {
      let bars = "";
      for (let t = lo + 0.15; t < hi; t += 0.2) bars += door.horizontal ? `M${n(t)},${n(cy - 0.2)}V${n(cy + 0.2)}` : `M${n(cx - 0.2)},${n(t)}H${n(cx + 0.2)}`;
      body = across(th.wall, 1.2) + `<path d="${bars}" stroke="${th.wall}" stroke-width="1.2"/>`;
      break;
    }
    case "glass":
    case "sliding":
      body = across(th.window, 2) + across(th.line, 0.6);
      break;
    case "airlock":
      body = across(th.wall, 3) + across(th.window, 1.2);
      break;
    case "gate":
      body = leaf(lo, mid, sweep, th.line, 1) + leaf(hi, mid, 1 - sweep, th.line, 1);
      break;
    case "broken":
      body = door.horizontal ? `<path d="M${n(lo)},${n(cy)}L${n(hi - 0.2)},${n(cy + s * half)}" stroke="${th.line}" stroke-width="1" stroke-dasharray="3 2"/>` : `<path d="M${n(cx)},${n(lo)}L${n(cx + s * half)},${n(hi - 0.2)}" stroke="${th.line}" stroke-width="1" stroke-dasharray="3 2"/>`;
      break;
    case "heavy":
    case "iron":
      body = leaf(lo, hi, sweep, door.kind === "iron" ? th.wall : th.dark, 1.6);
      break;
    default:
      body = leaf(lo, hi, sweep, th.line, 0.8);
  }
  // The lock: a mark beside the door on the side it opens to.
  const mark = door.lock && LOCK_MARK[door.lock];
  const lock = mark ? (door.lock === "magic" ? `<path d="M${n(door.horizontal ? hi : cx + s * 0.35) + 3},${n(door.horizontal ? cy + s * 0.35 : hi)}l2.5,-3.5l2.5,3.5l-2.5,3.5z" fill="${mark}"/>` : `<rect x="${n(door.horizontal ? hi : cx + s * 0.35) + 1.5}" y="${n(door.horizontal ? cy + s * 0.35 : hi) - 2}" width="4" height="4" fill="${mark}"/>`) : "";
  return gap + body + lock;
}

/** Roofs seen from above: a gable along each wing, hipped on great houses, flat with vents in the machine ages,
 * battlements on castles and prisons, a cone on a round tower (an arena lies open), chimneys over the hearths. */
function roofSvg(plan: BuildingPlan, th: Theme): string {
  const { era, type, width: W, depth: D } = plan.params;
  const out: string[] = [];
  const round = plan.params.shape === "round";
  const flat = ["industrial", "modern", "cyberpunk", "far-future", "post-apocalypse"].includes(era) && type !== "house" && type !== "temple" || ["bunker", "station", "factory", "store"].includes(type);
  const castle = ["keep", "prison", "barracks"].includes(type) && !flat;
  const hipped = ["manor", "palace", "guildhall", "bank", "domus", "tavern"].includes(type);
  const thatch = era === "stone" || type === "hut" || type === "longhouse";
  const tile = thatch ? "#c9a75c" : era === "ancient" ? "#b5653f" : flat ? "#9a9da3" : era === "medieval" && materialOf(plan) === "timber" ? "#8a5a3c" : "#7a4a3a";
  if (round) {
    const r = W / 2;
    if (type === "arena") {
      out.push(`<circle cx="${n(r)}" cy="${n(r)}" r="${n(r)}" fill="${th.stone}" stroke="${th.wall}" stroke-width="${n(0.4)}"/><circle cx="${n(r)}" cy="${n(r)}" r="${n(r * 0.5)}" fill="#e2cf9a" stroke="${th.wall}" stroke-width="2"/>`);
      for (let k = 1; k < 4; k++) out.push(`<circle cx="${n(r)}" cy="${n(r)}" r="${n(r * (0.5 + k * 0.12))}" fill="none" stroke="${th.line}" stroke-width="0.7"/>`);
      return out.join("");
    }
    let rays = "";
    for (let k = 0; k < 16; k++) rays += `M${n(r)},${n(r)}L${n(r + Math.cos((k * Math.PI) / 8) * r)},${n(r + Math.sin((k * Math.PI) / 8) * r)}`;
    out.push(`<circle cx="${n(r)}" cy="${n(r)}" r="${n(r)}" fill="${tile}" stroke="${th.wall}" stroke-width="${n(0.3)}"/><path d="${rays}" stroke="${th.line}" stroke-width="0.6" opacity="0.6"/><circle cx="${n(r)}" cy="${n(r)}" r="${n(0.4)}" fill="${th.wall}"/>`);
    if (type === "lighthouse") out.push(`<circle cx="${n(r)}" cy="${n(r)}" r="${n(r * 0.35)}" fill="#ffd34d" stroke="#e0a400" stroke-width="2"/>`);
    return out.join("");
  }
  const wings = plan.wings ?? [{ x: 0, y: 0, w: W, h: D }];
  for (const wing of wings) {
    const x = n(wing.x),
      y = n(wing.y),
      w = n(wing.w),
      h = n(wing.h);
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${tile}" stroke="${th.wall}" stroke-width="${n(0.25)}"/>`);
    if (flat) {
      out.push(`<rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" fill="none" stroke="${th.line}" stroke-width="1" opacity="0.6"/>`);
      continue;
    }
    // The ridge runs along the long side; the slopes are shaded apart.
    const along = wing.w >= wing.h;
    const inset = hipped ? Math.min(wing.w, wing.h) / 2 : 0;
    if (along) {
      const ry = y + h / 2;
      out.push(`<path d="M${x},${y}L${n(wing.x + inset)},${ry}L${n(wing.x + wing.w - inset)},${ry}L${x + w},${y}Z" fill="#000" opacity="0.12"/><path d="M${n(wing.x + inset)},${ry}H${n(wing.x + wing.w - inset)}" stroke="${th.wall}" stroke-width="1.6"/>`);
      if (hipped) out.push(`<path d="M${x},${y}L${n(wing.x + inset)},${ry}L${x},${y + h}M${x + w},${y}L${n(wing.x + wing.w - inset)},${ry}L${x + w},${y + h}" stroke="${th.wall}" stroke-width="1" fill="none"/>`);
    } else {
      const rx = x + w / 2;
      out.push(`<path d="M${x},${y}L${rx},${n(wing.y + inset)}L${rx},${n(wing.y + wing.h - inset)}L${x},${y + h}Z" fill="#000" opacity="0.12"/><path d="M${rx},${n(wing.y + inset)}V${n(wing.y + wing.h - inset)}" stroke="${th.wall}" stroke-width="1.6"/>`);
      if (hipped) out.push(`<path d="M${x},${y}L${rx},${n(wing.y + inset)}L${x + w},${y}M${x},${y + h}L${rx},${n(wing.y + wing.h - inset)}L${x + w},${y + h}" stroke="${th.wall}" stroke-width="1" fill="none"/>`);
    }
    if (castle) {
      // Battlements: merlons all round the wall's top.
      let merlons = "";
      for (let t = 0; t < wing.w; t += 1.2) merlons += `<rect x="${n(wing.x + t)}" y="${y - 3}" width="${n(0.6)}" height="6" fill="${th.wall}"/><rect x="${n(wing.x + t)}" y="${y + h - 3}" width="${n(0.6)}" height="6" fill="${th.wall}"/>`;
      for (let t = 0; t < wing.h; t += 1.2) merlons += `<rect x="${x - 3}" y="${n(wing.y + t)}" width="6" height="${n(0.6)}" fill="${th.wall}"/><rect x="${x + w - 3}" y="${n(wing.y + t)}" width="6" height="${n(0.6)}" fill="${th.wall}"/>`;
      out.push(merlons);
    }
  }
  // Chimneys stand over the hearths, stoves and forges of the ground floor; vents and tanks on a flat roof.
  const ground = plan.floors.find((floor) => floor.level === 0) ?? plan.floors[0];
  const fires = ground.rooms.flatMap((room) => room.furniture.filter((f) => ["hearth", "stove", "forge", "oven", "kiln", "furnace"].includes(f.kind)));
  for (const f of fires) out.push(`<rect x="${n(f.x + f.w / 2 - 0.35)}" y="${n(f.y + f.h / 2 - 0.35)}" width="${n(0.7)}" height="${n(0.7)}" fill="${th.stone}" stroke="${th.wall}" stroke-width="1"/><circle cx="${n(f.x + f.w / 2)}" cy="${n(f.y + f.h / 2)}" r="${n(0.18)}" fill="#3a342b"/>`);
  if (flat)
    for (const [fx, fy] of [[0.2, 0.25], [0.7, 0.3], [0.45, 0.7]]) {
      const wing = wings[0];
      out.push(`<rect x="${n(wing.x + wing.w * fx)}" y="${n(wing.y + wing.h * fy)}" width="${n(1.4)}" height="${n(1)}" fill="#c9ced4" stroke="${th.line}" stroke-width="0.8"/>`);
    }
  if (plan.court) out.push(`<rect x="${n(plan.court.rect.x)}" y="${n(plan.court.rect.y)}" width="${n(plan.court.rect.w)}" height="${n(plan.court.rect.h)}" fill="${th.yard}" stroke="${th.wall}" stroke-width="1.5"/>${plan.court.features.map((f) => yardFeature(f, th)).join("")}`);
  return out.join("");
}

export function renderBuilding(plan: BuildingPlan, options: BuildingRenderOptions = {}): string {
  const th = THEMES[options.theme ?? "ink"];
  const floor: Floor = plan.floors[Math.max(0, Math.min(plan.floors.length - 1, options.floor ?? plan.floors.findIndex((f) => f.level === 0)))];
  const { width: W, depth: D } = plan.params;
  const round = plan.params.shape === "round";
  const R = W / 2;
  const { x: vx, y: vy, w: vw, h: vh } = buildingView(plan);
  const players = !!options.players;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(vx)} ${n(vy)} ${n(vw)} ${n(vh)}" width="${n(vw)}" height="${n(vh)}" font-family="'Segoe UI', Arial, sans-serif">`);
  out.push(`<rect x="${n(vx)}" y="${n(vy)}" width="${n(vw)}" height="${n(vh)}" fill="${th.paper}"/>`);
  out.push(`<defs><pattern id="fallen" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0V8" stroke="${th.line}" stroke-width="1.4" opacity="0.5"/></pattern>${round ? `<clipPath id="round-wall"><circle cx="${n(R)}" cy="${n(R)}" r="${n(R)}"/></clipPath>` : ""}</defs>`);

  // Round it: the street in front, the neighbours' walls either side of a house built wall to wall.
  const yardBottom = plan.yard ? plan.yard.bounds.y + plan.yard.bounds.h : D;
  if (plan.params.street) {
    const top = yardBottom + 0.6;
    out.push(`<rect x="${n(vx)}" y="${n(top)}" width="${n(vw)}" height="${n(4)}" fill="${th.ground}" stroke="${th.line}" stroke-width="0.6"/><path d="M${n(vx)},${n(top + 2)}H${n(vx + vw)}" stroke="${th.line}" stroke-width="0.8" stroke-dasharray="8 6" opacity="0.6"/><text x="${n(W / 2)}" y="${n(top + 3.3)}" text-anchor="middle" font-size="12" font-style="italic" fill="${th.label}">${esc(options.street ?? `${plan.params.street}${plan.params.house ? `, ${plan.params.house}` : ""}`)}</text>`);
  }
  if (plan.params.terrace)
    for (const [x0, x1] of [[vx, (plan.yard?.bounds.x ?? 0) - 0.1], [(plan.yard ? plan.yard.bounds.x + plan.yard.bounds.w : W) + 0.1, vx + vw]])
      out.push(`<rect x="${n(x0)}" y="${n(0)}" width="${n(Math.max(0, x1 - x0))}" height="${n(D)}" fill="url(#fallen)" stroke="${th.wall}" stroke-width="${n(0.3)}"/>`);

  // The yard, seen from above whatever floor is shown.
  if (plan.yard) {
    const b = plan.yard.bounds;
    out.push(`<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="${th.yard}" stroke="${th.dark}" stroke-width="2" stroke-dasharray="6 3"/>`);
    // A gate in the fence before the front door, and the path up to it.
    const entry = plan.floors.find((f) => f.level === 0)?.doors.find((door) => door.rooms[1] === -1 && Math.abs(door.at[1] - D) < 0.01);
    if (entry) {
      const gx = entry.at[0];
      const fence = b.y + b.h;
      out.push(`<rect x="${n(gx - 0.6)}" y="${n(D)}" width="${n(1.2)}" height="${n(fence - D)}" fill="${th.ground}"/><rect x="${n(gx - 0.9)}" y="${n(fence) - 3}" width="${n(1.8)}" height="6" fill="${th.yard}"/><rect x="${n(gx - 0.9) - 3}" y="${n(fence) - 4}" width="4" height="8" fill="${th.dark}"/><rect x="${n(gx + 0.9) - 1}" y="${n(fence) - 4}" width="4" height="8" fill="${th.dark}"/>`);
    }
    for (const f of plan.yard.features) out.push(yardFeature(f, th));
  }

  if (options.roof) {
    out.push(roofSvg(plan, th));
  } else {
    // An open court in the middle of a courtyard house.
    if (plan.court) out.push(`<rect x="${n(plan.court.rect.x)}" y="${n(plan.court.rect.y)}" width="${n(plan.court.rect.w)}" height="${n(plan.court.rect.h)}" fill="${th.yard}"/>${plan.court.features.map((f) => yardFeature(f, th)).join("")}`);
    // Rooms, then furniture (carpets first), then walls on top; a round tower keeps all of it inside its wall.
    const floorFill = floor.level < 0 ? th.cellar : th.floor;
    out.push(round ? `<g clip-path="url(#round-wall)">` : `<g>`);
    for (const room of floor.rooms) out.push(`<rect x="${n(room.x)}" y="${n(room.y)}" width="${n(room.w)}" height="${n(room.h)}" fill="${th.rooms[room.kind] ?? floorFill}"/>${room.collapsed ? `<rect x="${n(room.x)}" y="${n(room.y)}" width="${n(room.w)}" height="${n(room.h)}" fill="url(#fallen)"/>` : ""}`);
    for (const room of floor.rooms.filter((r) => r.kind === "stairs")) {
      const above = plan.floors.some((f) => f.level > floor.level);
      const below = plan.floors.some((f) => f.level < floor.level);
      if (round) {
        // A spiral stair: steps fanning round a newel post.
        const cx = room.x + room.w / 2,
          cy = room.y + room.h / 2,
          r = Math.min(room.w, room.h) / 2 - 0.15;
        let fan = "";
        for (let k = 0; k < 12; k++) fan += `M${n(cx)},${n(cy)}L${n(cx + Math.cos((k * Math.PI) / 6) * r)},${n(cy + Math.sin((k * Math.PI) / 6) * r)}`;
        out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${th.line}" stroke-width="1"/><path d="${fan}" stroke="${th.line}" stroke-width="0.7"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(0.25)}" fill="${th.line}"/>`);
        continue;
      }
      let steps = "";
      for (let y = room.y + 0.3; y < room.y + room.h - 0.2; y += 0.3) steps += `M${n(room.x + 0.2)},${n(y)}H${n(room.x + room.w - 0.2)}`;
      // The run of the flight, with a head where it leads: up to the floor above, down to the one below.
      const cx = room.x + room.w / 2;
      const top = room.y + 0.4;
      const bottom = room.y + room.h - 0.3;
      const head = (y: number, dir: number) => `M${n(cx - 0.35)},${n(y - dir * 0.45)}L${n(cx)},${n(y)}L${n(cx + 0.35)},${n(y - dir * 0.45)}`;
      out.push(`<path d="${steps}" stroke="${th.line}" stroke-width="0.8"/><path d="M${n(cx)},${n(bottom)}V${n(top)}${above ? head(top, -1) : ""}${below ? head(bottom, 1) : ""}" stroke="${th.line}" stroke-width="1.2" fill="none"/>`);
      // A lift beside the stair in a tall house of the machine ages.
      if (plan.floors.filter((f) => f.level >= 0).length >= 4 && ["modern", "cyberpunk", "far-future"].includes(plan.params.era) && room.w >= 2) out.push(`<rect x="${n(room.x + 0.15)}" y="${n(room.y + room.h - 1.6)}" width="${n(1.4)}" height="${n(1.4)}" fill="${th.stone}" stroke="${th.wall}" stroke-width="1.2"/><path d="M${n(room.x + 0.15)},${n(room.y + room.h - 1.6)}l${n(1.4)},${n(1.4)}M${n(room.x + 1.55)},${n(room.y + room.h - 1.6)}l${-n(1.4)},${n(1.4)}" stroke="${th.wall}" stroke-width="0.8"/>`);
    }
    for (const room of floor.rooms) for (const f of [...room.furniture].sort((a, b) => Number(b.kind === "carpet") - Number(a.kind === "carpet"))) if (!(players && f.kind === "hatch")) out.push(piece(f, th));
    if (options.highlight !== null && options.highlight !== undefined) {
      const room = floor.rooms.find((r) => r.id === options.highlight);
      if (room) out.push(`<rect x="${n(room.x)}" y="${n(room.y)}" width="${n(room.w)}" height="${n(room.h)}" fill="#ffd34d" fill-opacity="0.22" stroke="#ffb300" stroke-width="3"/>`);
    }
    // Interior walls along every room edge.
    for (const room of floor.rooms) out.push(`<rect x="${n(room.x)}" y="${n(room.y)}" width="${n(room.w)}" height="${n(room.h)}" fill="none" stroke="${th.wall}" stroke-width="${n(0.14)}"/>`);
    out.push(`</g>`);
    // The outer wall, heavier, in the colour of what it is built of.
    const material = MATERIAL_WALL[materialOf(plan)];
    const wallColour = options.theme === "color" && material.colour ? material.colour : th.wall;
    const dash = material.dash ? ` stroke-dasharray="${material.dash}"` : "";
    const outer = n(floor.level < 0 ? 0.6 : 0.4);
    if (round) out.push(`<circle cx="${n(R)}" cy="${n(R)}" r="${n(R)}" fill="none" stroke="${wallColour}" stroke-width="${outer}"${dash}/>`);
    else if (plan.wings) out.push(`<path d="${outerWalls(floor.rooms).map((wall) => `M${n(wall.a[0])},${n(wall.a[1])}L${n(wall.b[0])},${n(wall.b[1])}`).join("")}" stroke="${wallColour}" stroke-width="${outer}" stroke-linecap="square"${dash}/>`);
    else out.push(`<rect x="0" y="0" width="${n(W)}" height="${n(D)}" fill="none" stroke="${wallColour}" stroke-width="${outer}"${dash}/>`);
    for (const win of floor.windows) {
      out.push(`<path d="M${n(win.a[0])},${n(win.a[1])}L${n(win.b[0])},${n(win.b[1])}" stroke="${win.boarded ? th.wood : th.window}" stroke-width="${n(0.22)}"/><path d="M${n(win.a[0])},${n(win.a[1])}L${n(win.b[0])},${n(win.b[1])}" stroke="${th.wall}" stroke-width="1"${win.boarded ? ` stroke-dasharray="2 2"` : ""}/>`);
    }
    for (const door of floor.doors) out.push(doorSvg(door, floor, th, floorFill, players));

    // Room names, and the key's numbers in the corner.
    const label = options.label ?? ((kind: RoomKind) => kind.replace(/-/gu, " "));
    for (const room of floor.rooms) {
      if (room.w < 1.6 || room.h < 1.2) continue;
      const size = Math.max(9, Math.min(14, Math.min(room.w, room.h) * 3));
      const cx = room.x + room.w / 2;
      const cy = room.y + room.h / 2;
      out.push(`<text x="${n(cx)}" y="${n(cy) + size / 3}" text-anchor="middle" font-size="${size}" fill="${th.label}" stroke="${floorFill}" stroke-width="3" paint-order="stroke" opacity="0.9">${esc(label(room.kind, room))}</text>`);
      const number = options.numbers?.(room);
      if (number) out.push(`<g><circle cx="${n(cx)}" cy="${n(cy) - size * 0.9}" r="8" fill="${th.label}"/><text x="${n(cx)}" y="${n(cy) - size * 0.9 + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="${floorFill}">${number}</text></g>`);
    }
  }

  if (options.grid) {
    let lines = "";
    for (let x = Math.floor(vx / 1.5) * 1.5; x <= vx + vw; x += 1.5) lines += `M${n(x)},${n(vy)}V${n(vy + vh)}`;
    for (let y = Math.floor(vy / 1.5) * 1.5; y <= vy + vh; y += 1.5) lines += `M${n(vx)},${n(y)}H${n(vx + vw)}`;
    out.push(`<path d="${lines}" stroke="${th.grid}" stroke-width="1"/>`);
  }
  // Scale bar: five metres.
  const sx = vx + 0.8,
    sy = vy + 0.8;
  out.push(`<g fill="${th.label}" font-size="11"><rect x="${n(sx)}" y="${n(sy)}" width="${n(2.5)}" height="5" fill="${th.wall}"/><rect x="${n(sx + 2.5)}" y="${n(sy)}" width="${n(2.5)}" height="5" fill="${th.paper}" stroke="${th.wall}"/><text x="${n(sx + 5) + 6}" y="${n(sy) + 6}">5 m</text></g>`);
  out.push(`</svg>`);
  return out.join("");
}

/** Pixels per metre on a room map. */
export const ROOM_PX = 60;

const ITEM_GLYPH: Record<ItemKind, string> = { candle: "🕯", mug: "◘", plate: "◯", book: "▤", jar: "⚱", coins: "◉", letter: "✉", key: "⚷", weapon: "⚔", bottle: "♁", lamp: "☀", papers: "▭", datapad: "▯", credstick: "▬", rug: "", bones: "☠", rubbish: "∴", relic: "✧", cushion: "▢", tools: "⚒" };

/** One room as a battle map: walls with doors and windows, furniture, items, cover and light; hidden finds for the GM. */
export function renderRoom(room: RoomMap, options: { theme?: BuildingThemeId; grid?: boolean; players?: boolean; label?: string } = {}): string {
  const th = THEMES[options.theme ?? "ink"];
  const P = ROOM_PX;
  const pad = 0.8;
  const W = (room.w + pad * 2) * P,
    H = (room.h + pad * 2) * P;
  const o = pad * P;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Segoe UI', Arial, sans-serif">`);
  out.push(`<defs><marker id="stair-head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10Z" fill="${th.dark}"/></marker><radialGradient id="light"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.45"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="${th.paper}"/><g transform="translate(${o},${o})">`);
  // A room of a round tower keeps to its curved wall.
  const round = room.round;
  if (round) out.push(`<defs><clipPath id="room-round"><circle cx="${round.cx * P}" cy="${round.cy * P}" r="${round.r * P}"/></clipPath></defs><g clip-path="url(#room-round)">`);
  out.push(`<rect width="${room.w * P}" height="${room.h * P}" fill="${th.rooms[room.kind as RoomKind] ?? th.floor}"/>`);
  for (const [x, y, r] of room.lights) out.push(`<circle cx="${x * P}" cy="${y * P}" r="${r * P}" fill="url(#light)"/>`);
  for (const item of room.items.filter((i) => i.kind === "rug")) out.push(`<rect x="${(item.x - 1.4) * P}" y="${(item.y - 1) * P}" width="${2.8 * P}" height="${2 * P}" rx="6" fill="#b0463c" fill-opacity="0.3" stroke="#b0463c" stroke-dasharray="6 3"/>`);
  // A stairwell up close: its treads across the long side, the run's arrow to where it leads.
  if (room.kind === "stairs") {
    const long = room.h >= room.w;
    let treads = "";
    for (let t = 0.3; t < (long ? room.h : room.w) - 0.1; t += 0.3) treads += long ? `M${0.15 * P},${t * P}H${(room.w - 0.15) * P}` : `M${t * P},${0.15 * P}V${(room.h - 0.15) * P}`;
    out.push(`<path d="${treads}" stroke="${th.line}" stroke-width="1.4"/>`);
    const go = (up: boolean) => (long ? `M${(room.w / 2) * P},${(up ? room.h - 0.4 : 0.4) * P}V${(up ? 0.5 : room.h - 0.5) * P}` : `M${(up ? 0.4 : room.w - 0.4) * P},${(room.h / 2) * P}H${(up ? room.w - 0.5 : 0.5) * P}`);
    if (room.flights?.up) out.push(`<path d="${go(true)}" stroke="${th.dark}" stroke-width="3" marker-end="url(#stair-head)"/><text x="${(long ? room.w / 2 + 0.3 : room.w - 0.6) * P}" y="${(long ? 0.6 : room.h / 2 - 0.3) * P}" font-size="14" font-weight="700" fill="${th.dark}">▲</text>`);
    if (room.flights?.down) out.push(`<text x="${(long ? room.w / 2 + 0.3 : 0.4) * P}" y="${(long ? room.h - 0.3 : room.h / 2 + 0.6) * P}" font-size="14" font-weight="700" fill="${th.dark}">▼</text>`);
  }
  for (const f of [...room.furniture].sort((a, b) => Number(b.kind === "carpet") - Number(a.kind === "carpet"))) out.push(piece(f, th, P));
  if (!options.players) for (const c of room.cover) out.push(`<rect x="${c.x * P - 3}" y="${c.y * P - 3}" width="${c.w * P + 6}" height="${c.h * P + 6}" fill="none" stroke="#e0a400" stroke-width="2" ${c.full ? "" : `stroke-dasharray="6 4"`} opacity="0.8"/>`);
  for (const item of room.items) {
    if (item.kind === "rug" || (item.hidden && options.players)) continue;
    const glyph = ITEM_GLYPH[item.kind];
    if (item.hidden) out.push(`<circle cx="${item.x * P}" cy="${item.y * P}" r="13" fill="none" stroke="#c0392b" stroke-width="2" stroke-dasharray="4 3"/><text x="${item.x * P}" y="${item.y * P + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="#c0392b">?</text>`);
    else out.push(`<text x="${item.x * P}" y="${item.y * P + 6}" text-anchor="middle" font-size="16" fill="${th.dark}" font-family="'Segoe UI Symbol', 'Segoe UI Emoji', sans-serif">${glyph}</text>`);
  }
  if (options.grid !== false) {
    let g = "";
    for (let x = 0; x <= room.w + 1e-6; x += 1.5) g += `M${x * P},0V${room.h * P}`;
    for (let y = 0; y <= room.h + 1e-6; y += 1.5) g += `M0,${y * P}H${room.w * P}`;
    out.push(`<path d="${g}" stroke="${th.grid}" stroke-width="1.2"/>`);
  }
  // Walls, then the openings cut into them.
  const wall = 0.3 * P;
  out.push(`<rect width="${room.w * P}" height="${room.h * P}" fill="none" stroke="${th.wall}" stroke-width="${wall}"/>`);
  if (round) out.push(`</g><defs><clipPath id="room-box"><rect width="${room.w * P}" height="${room.h * P}"/></clipPath></defs><circle cx="${round.cx * P}" cy="${round.cy * P}" r="${round.r * P}" fill="none" stroke="${th.wall}" stroke-width="${wall * 1.4}" clip-path="url(#room-box)"/>`);
  for (const exit of room.exits) {
    const [x, y] = exit.at;
    const half = (exit.width / 2) * P;
    const cx = x * P,
      cy = y * P;
    if (exit.kind === "door") {
      // A hidden door is the GM's alone: a dashed red mark where the wall gives.
      if (exit.secret) {
        if (!options.players) out.push(exit.horizontal ? `<rect x="${cx - half}" y="${cy - wall / 2}" width="${half * 2}" height="${wall}" fill="none" stroke="#c0392b" stroke-width="2.5" stroke-dasharray="6 4"/>` : `<rect x="${cx - wall / 2}" y="${cy - half}" width="${wall}" height="${half * 2}" fill="none" stroke="#c0392b" stroke-width="2.5" stroke-dasharray="6 4"/>`);
        continue;
      }
      const floorColour = th.rooms[room.kind as RoomKind] ?? th.floor;
      out.push(exit.horizontal ? `<rect x="${cx - half}" y="${cy - wall}" width="${half * 2}" height="${wall * 2}" fill="${floorColour}"/>` : `<rect x="${cx - wall}" y="${cy - half}" width="${wall * 2}" height="${half * 2}" fill="${floorColour}"/>`);
      if (exit.door === "arch") continue;
      if (exit.door === "curtain" || exit.door === "bars" || exit.door === "glass" || exit.door === "sliding" || exit.door === "airlock") {
        const stroke = exit.door === "curtain" ? th.cloth : exit.door === "bars" ? th.wall : th.window;
        out.push(exit.horizontal ? `<path d="M${cx - half},${cy}H${cx + half}" stroke="${stroke}" stroke-width="${exit.door === "bars" ? 4 : 6}"${exit.door === "curtain" || exit.door === "bars" ? ` stroke-dasharray="4 4"` : ""}/>` : `<path d="M${cx},${cy - half}V${cy + half}" stroke="${stroke}" stroke-width="${exit.door === "bars" ? 4 : 6}"${exit.door === "curtain" || exit.door === "bars" ? ` stroke-dasharray="4 4"` : ""}/>`);
        continue;
      }
      const heavy = exit.door === "heavy" || exit.door === "iron";
      out.push(exit.horizontal ? `<path d="M${cx - half},${cy}A${half * 2},${half * 2} 0 0 1 ${cx + half},${cy - half * 2}" fill="none" stroke="${th.line}" stroke-width="${heavy ? 3 : 1.5}"${exit.door === "broken" ? ` stroke-dasharray="6 4"` : ""}/>` : `<path d="M${cx},${cy - half}A${half * 2},${half * 2} 0 0 1 ${cx + half * 2},${cy + half}" fill="none" stroke="${th.line}" stroke-width="${heavy ? 3 : 1.5}"${exit.door === "broken" ? ` stroke-dasharray="6 4"` : ""}/>`);
    } else out.push(exit.horizontal ? `<rect x="${cx - half}" y="${cy - wall / 3}" width="${half * 2}" height="${(wall * 2) / 3}" fill="${th.window}"/>` : `<rect x="${cx - wall / 3}" y="${cy - half}" width="${(wall * 2) / 3}" height="${half * 2}" fill="${th.window}"/>`);
  }
  out.push(`</g>`);
  if (options.label) out.push(`<text x="${o}" y="${o * 0.62}" font-size="18" font-weight="600" fill="${th.label}">${esc(options.label)}</text>`);
  out.push(`<g fill="${th.label}" font-size="12"><rect x="${W - o - 1.5 * P}" y="${H - o * 0.55}" width="${1.5 * P}" height="5" fill="${th.wall}"/><text x="${W - o - 1.5 * P - 6}" y="${H - o * 0.55 + 6}" text-anchor="end">1.5 m</text></g>`);
  out.push(`</svg>`);
  return out.join("");
}

/** What a floor plan shows, for its legend: the furniture on the floor shown, walls, doors, windows and stairs. */
export function buildingLegend(plan: BuildingPlan, options: BuildingRenderOptions = {}): LegendSection[] {
  const th = THEMES[options.theme ?? "ink"];
  const floor = plan.floors[Math.max(0, Math.min(plan.floors.length - 1, options.floor ?? plan.floors.findIndex((f) => f.level === 0)))];
  const things = present(floor.rooms.flatMap((room) => room.furniture.map((f) => f.kind)).filter((kind) => !(options.players && kind === "hatch")));
  const structure = [
    { key: "legend.wall", swatch: { line: th.wall, width: 3.2 } },
    { key: "legend.door", swatch: { svg: `<path d="M2,13H8M16,13H22" stroke="${th.wall}" stroke-width="2.4"/><path d="M8,13A8,8 0 0 1 16,5" fill="none" stroke="${th.line}" stroke-width="0.7"/><path d="M8,13V5" stroke="${th.line}" stroke-width="1"/>` } },
    { key: "legend.window", swatch: { svg: `<path d="M2,8H22" stroke="${th.wall}" stroke-width="3"/><path d="M7,8H17" stroke="${th.window}" stroke-width="2.4"/>` } },
    ...(floor.rooms.some((r) => r.kind === "stairs") ? [{ key: "room.stairs", swatch: { svg: `<rect x="4" y="2" width="16" height="12" fill="${th.floor}" stroke="${th.line}" stroke-width="0.7"/>${[6, 9, 12, 15, 18].map((x) => `<path d="M${x},2V14" stroke="${th.line}" stroke-width="0.6"/>`).join("")}` } }] : []),
    ...(floor.windows.some((w) => w.boarded) ? [{ key: "legend.boarded", swatch: { svg: `<path d="M2,8H22" stroke="${th.wall}" stroke-width="3"/><path d="M7,8H17" stroke="${th.wood}" stroke-width="2.4" stroke-dasharray="2 2"/>` } }] : []),
    ...(floor.rooms.some((r) => r.collapsed) ? [{ key: "legend.collapsed", swatch: { svg: `<rect x="3" y="2" width="18" height="12" fill="${th.floor}" stroke="${th.line}" stroke-width="0.7"/><path d="M3,10L9,2M3,16L15,2M9,16L21,2M15,16L21,8" stroke="${th.line}" stroke-width="0.8" opacity="0.6"/>` } }] : []),
    ...(!options.players && floor.doors.some((d) => d.secret) ? [{ key: "legend.secretDoor", swatch: { svg: `<path d="M2,8H22" stroke="${th.wall}" stroke-width="3"/><rect x="8" y="5" width="8" height="6" fill="none" stroke="#c0392b" stroke-width="1.4" stroke-dasharray="2 1.5"/>` } }] : []),
  ];
  // Doors by what they are, and locks by how they shut.
  const doors = present(floor.doors.filter((d) => !d.secret && d.kind && d.kind !== "plain").map((d) => d.kind!)).map((kind) => ({ key: `door.${kind}`, swatch: { svg: `<path d="M2,8H22" stroke="${th.wall}" stroke-width="3"/><rect x="8" y="5" width="8" height="6" fill="${th.floor}"/>${kind === "arch" ? "" : `<path d="M8,8H16" stroke="${kind === "curtain" ? th.cloth : kind === "bars" ? th.wall : kind === "glass" || kind === "sliding" || kind === "airlock" ? th.window : th.line}" stroke-width="${kind === "heavy" || kind === "iron" ? 2.4 : 1.6}"${kind === "bars" || kind === "curtain" || kind === "broken" ? ` stroke-dasharray="1.5 1"` : ""}/>`}` } }));
  const locks = present(floor.doors.filter((d) => !d.secret && d.lock && LOCK_MARK[d.lock]).map((d) => d.lock!)).map((lock) => ({ key: `lock.${lock}`, swatch: { svg: lock === "magic" ? `<path d="M12,3l4,5l-4,5l-4,-5z" fill="${LOCK_MARK[lock]}"/>` : `<rect x="9" y="5" width="6" height="6" fill="${LOCK_MARK[lock]}"/>` } }));
  return [
    { key: "legend.structure", entries: structure },
    { key: "legend.doors", entries: doors },
    { key: "legend.locks", entries: locks },
    { key: "legend.furniture", entries: things.map((kind) => ({ key: `furniture.${kind}`, swatch: { svg: piece({ kind, x: 0.2, y: 0.15, w: 2, h: 1.3, round: false }, th, 10) } })) },
  ].filter((section) => section.entries.length);
}
