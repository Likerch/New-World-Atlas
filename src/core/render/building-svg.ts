// One floor of a building as an SVG plan: rooms, walls, doors with their swing, windows, stairs, furniture drawn from
// above, the yard round it, and an optional battle-map grid (1.5 m squares). One metre is `PX` pixels.
import type { BuildingPlan, Floor, Furniture, RoomKind } from "../building/plan";

export const PX = 24;

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
  /** Room names in the reader's language. */
  label?: (kind: RoomKind) => string;
  highlight?: number | null;
}

const n = (value: number) => Math.round(value * PX * 10) / 10;

function piece(f: Furniture, th: Theme): string {
  const x = n(f.x),
    y = n(f.y),
    w = n(f.w),
    h = n(f.h);
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
  }
}

export function renderBuilding(plan: BuildingPlan, options: BuildingRenderOptions = {}): string {
  const th = THEMES[options.theme ?? "ink"];
  const floor: Floor = plan.floors[Math.max(0, Math.min(plan.floors.length - 1, options.floor ?? plan.floors.findIndex((f) => f.level === 0)))];
  const { width: W, depth: D } = plan.params;
  const bounds = plan.yard?.bounds ?? { x: -2, y: -2, w: W + 4, h: D + 4 };
  const pad = 1.5;
  const vx = bounds.x - pad,
    vy = bounds.y - pad - 1.2,
    vw = bounds.w + pad * 2,
    vh = bounds.h + pad * 2 + 1.2;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(vx)} ${n(vy)} ${n(vw)} ${n(vh)}" width="${n(vw)}" height="${n(vh)}" font-family="'Segoe UI', Arial, sans-serif">`);
  out.push(`<rect x="${n(vx)}" y="${n(vy)}" width="${n(vw)}" height="${n(vh)}" fill="${th.paper}"/>`);

  // The yard, seen from above whatever floor is shown.
  if (plan.yard) {
    const b = plan.yard.bounds;
    out.push(`<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="${th.yard}" stroke="${th.dark}" stroke-width="2" stroke-dasharray="6 3"/>`);
    for (const f of plan.yard.features) {
      const x = n(f.x),
        y = n(f.y),
        w = n(f.w),
        h = n(f.h);
      if (f.kind === "tree") out.push(`<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}" fill="#8fbf74" stroke="#4f7a3c" stroke-width="1"/>`);
      else if (f.kind === "well" || f.kind === "fountain") out.push(`<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}" fill="${th.stone}" stroke="${th.line}" stroke-width="1.2"/><circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 3}" fill="${th.window}"/>`);
      else if (f.kind === "bed") {
        let rows = "";
        for (let k = 4; k < h; k += 7) rows += `M${x + 2},${y + k}H${x + w - 2}`;
        out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#b89a6a" stroke="${th.line}" stroke-width="0.6"/><path d="${rows}" stroke="#6f8f4a" stroke-width="2"/>`);
      } else if (f.kind === "parking") {
        let lines = "";
        for (let k = 0; k <= w; k += n(2.5)) lines += `M${x + k},${y}V${y + h}`;
        out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#bdbdbd"/><path d="${lines}" stroke="#ffffff" stroke-width="1"/>`);
      } else out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f.kind === "hay" ? "#e2c66a" : th.wood}" stroke="${th.line}" stroke-width="1"/>`);
    }
  }

  // Rooms, then furniture (carpets first), then walls on top.
  const floorFill = floor.level < 0 ? th.cellar : th.floor;
  for (const room of floor.rooms) out.push(`<rect x="${n(room.x)}" y="${n(room.y)}" width="${n(room.w)}" height="${n(room.h)}" fill="${th.rooms[room.kind] ?? floorFill}"/>`);
  for (const room of floor.rooms.filter((r) => r.kind === "stairs")) {
    let steps = "";
    for (let y = room.y + 0.3; y < room.y + room.h - 0.2; y += 0.3) steps += `M${n(room.x + 0.2)},${n(y)}H${n(room.x + room.w - 0.2)}`;
    out.push(`<path d="${steps}" stroke="${th.line}" stroke-width="0.8"/><path d="M${n(room.x + room.w / 2)},${n(room.y + room.h - 0.3)}V${n(room.y + 0.4)}" stroke="${th.line}" stroke-width="1.2" marker-end="none"/>`);
  }
  for (const room of floor.rooms) for (const f of [...room.furniture].sort((a, b) => Number(b.kind === "carpet") - Number(a.kind === "carpet"))) out.push(piece(f, th));
  if (options.highlight !== null && options.highlight !== undefined) {
    const room = floor.rooms.find((r) => r.id === options.highlight);
    if (room) out.push(`<rect x="${n(room.x)}" y="${n(room.y)}" width="${n(room.w)}" height="${n(room.h)}" fill="#ffd34d" fill-opacity="0.22" stroke="#ffb300" stroke-width="3"/>`);
  }
  // Interior walls along every room edge, the outer wall heavier.
  for (const room of floor.rooms) out.push(`<rect x="${n(room.x)}" y="${n(room.y)}" width="${n(room.w)}" height="${n(room.h)}" fill="none" stroke="${th.wall}" stroke-width="${n(0.14)}"/>`);
  out.push(`<rect x="0" y="0" width="${n(W)}" height="${n(D)}" fill="none" stroke="${th.wall}" stroke-width="${n(floor.level < 0 ? 0.6 : 0.4)}"/>`);
  for (const win of floor.windows) out.push(`<path d="M${n(win.a[0])},${n(win.a[1])}L${n(win.b[0])},${n(win.b[1])}" stroke="${th.window}" stroke-width="${n(0.22)}"/><path d="M${n(win.a[0])},${n(win.a[1])}L${n(win.b[0])},${n(win.b[1])}" stroke="${th.wall}" stroke-width="1"/>`);
  for (const door of floor.doors) {
    const half = door.width / 2;
    const [cx, cy] = door.at;
    const gap = door.horizontal ? `<rect x="${n(cx - half)}" y="${n(cy - 0.25)}" width="${n(door.width)}" height="${n(0.5)}" fill="${floorFill}"/>` : `<rect x="${n(cx - 0.25)}" y="${n(cy - half)}" width="${n(0.5)}" height="${n(door.width)}" fill="${floorFill}"/>`;
    const swing = door.horizontal
      ? `<path d="M${n(cx - half)},${n(cy)}L${n(cx - half)},${n(cy - door.width)}A${n(door.width)},${n(door.width)} 0 0 1 ${n(cx + half)},${n(cy)}" fill="none" stroke="${th.line}" stroke-width="0.8"/>`
      : `<path d="M${n(cx)},${n(cy - half)}L${n(cx + door.width)},${n(cy - half)}A${n(door.width)},${n(door.width)} 0 0 1 ${n(cx)},${n(cy + half)}" fill="none" stroke="${th.line}" stroke-width="0.8"/>`;
    out.push(gap + swing);
  }

  // Room names.
  const label = options.label ?? ((kind: RoomKind) => kind.replace(/-/gu, " "));
  for (const room of floor.rooms) {
    if (room.w < 1.6 || room.h < 1.2) continue;
    const size = Math.max(9, Math.min(14, Math.min(room.w, room.h) * 3));
    out.push(`<text x="${n(room.x + room.w / 2)}" y="${n(room.y + room.h / 2) + size / 3}" text-anchor="middle" font-size="${size}" fill="${th.label}" stroke="${floorFill}" stroke-width="3" paint-order="stroke" opacity="0.9">${label(room.kind)}</text>`);
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
