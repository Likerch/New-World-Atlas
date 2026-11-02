// Map styles. A theme only decides how data looks; switching it never changes the world.

export type ThemeId = "atlas" | "parchment" | "political" | "relief" | "night" | "nautical";

export const THEMES: ThemeId[] = ["atlas", "parchment", "political", "relief", "night", "nautical"];

export interface Theme {
  /** Ocean shades from the deep sea to the shallows. */
  ocean: string[];
  land: string;
  /** Biome fills by biome id; null hides biomes. */
  biomes: string[] | null;
  /** Height bands from the lowlands up; null hides them. */
  heights: string[] | null;
  lake: string;
  river: string;
  coast: string;
  coastWidth: number;
  /** Opacity of state fills over the land. */
  stateFill: number;
  border: string;
  provinceBorder: string;
  road: string;
  sea: string;
  ink: string;
  iconFill: string;
  /** Tree crowns. */
  tree: string;
  burg: string;
  burgStroke: string;
  label: string;
  halo: string;
  waterLabel: string;
  font: string;
  grid: string;
  /** A soft paper grain over everything. */
  paper: boolean;
}

const BIOMES_ATLAS = ["#3e6e9e", "#f0dc9c", "#cfc6a2", "#d8cd85", "#c3d38d", "#a6c867", "#7db464", "#5fa451", "#4c9168", "#6c8a5e", "#bab59c", "#f2f6f7", "#8daa86"];
const BIOMES_SEPIA = ["#c9b991", "#ead7a6", "#dccfa8", "#e2d39e", "#d9d3a2", "#cfc893", "#c2bd86", "#b8b47c", "#b0ad80", "#b9b190", "#d6cdb0", "#f1ebdc", "#c4bf98"];
const BIOMES_NIGHT = ["#0e1a30", "#2a2a24", "#24272a", "#262b22", "#1f2a24", "#1b2a22", "#17281f", "#13261d", "#132521", "#18221f", "#22252a", "#2c3440", "#152420"];

export const THEME: Record<ThemeId, Theme> = {
  atlas: {
    ocean: ["#35628f", "#41709e", "#5283b0", "#6896c0", "#82abd0"],
    land: "#e9e2c9",
    biomes: BIOMES_ATLAS,
    heights: null,
    lake: "#8cbbe0",
    river: "#4f86bd",
    coast: "#2c4a66",
    coastWidth: 1.1,
    stateFill: 0.22,
    border: "#7a2e2e",
    provinceBorder: "#7a2e2e",
    road: "#8a5a32",
    sea: "#e8f0f8",
    ink: "#4f4231",
    iconFill: "#f1ead6",
    tree: "#7fa966",
    burg: "#ffffff",
    burgStroke: "#2b2b2b",
    label: "#2a2520",
    halo: "#f7f2e4",
    waterLabel: "#dbe8f5",
    font: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
    grid: "rgba(255,255,255,0.18)",
    paper: false,
  },
  parchment: {
    ocean: ["#b9a77c", "#c3b287", "#cdbd93", "#d6c8a0", "#e0d3ae"],
    land: "#efe2c4",
    biomes: BIOMES_SEPIA,
    heights: null,
    lake: "#d6c8a0",
    river: "#6f5c40",
    coast: "#4a3a28",
    coastWidth: 1.3,
    stateFill: 0.12,
    border: "#6b3a2a",
    provinceBorder: "#8b5a3a",
    road: "#6b5a44",
    sea: "#5d4c34",
    ink: "#5b4630",
    iconFill: "#efe2c4",
    tree: "#d8cfa6",
    burg: "#efe2c4",
    burgStroke: "#3a2c1c",
    label: "#3a2c1c",
    halo: "#efe2c4",
    waterLabel: "#5d4c34",
    font: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
    grid: "rgba(90,70,40,0.18)",
    paper: true,
  },
  political: {
    ocean: ["#8fb9df", "#97bfe2", "#a0c5e5", "#a9cbe8", "#b3d1ec"],
    land: "#f3f0e7",
    biomes: null,
    heights: null,
    lake: "#a9cbe8",
    river: "#6a9ccb",
    coast: "#4a6a8a",
    coastWidth: 0.9,
    stateFill: 0.7,
    border: "#2b2b2b",
    provinceBorder: "#555555",
    road: "#6b6b6b",
    sea: "#ffffff",
    ink: "#555555",
    iconFill: "#ffffff",
    tree: "#cfd8c0",
    burg: "#ffffff",
    burgStroke: "#222222",
    label: "#1e1e1e",
    halo: "#ffffff",
    waterLabel: "#ffffff",
    font: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    grid: "rgba(255,255,255,0.35)",
    paper: false,
  },
  relief: {
    ocean: ["#1f3f5f", "#264b6e", "#2f587c", "#3a668b", "#4a789b"],
    land: "#7fae6b",
    biomes: null,
    heights: ["#6ea561", "#8db66a", "#b7c47a", "#d8cf8c", "#d9b97c", "#c39a6a", "#a7805c", "#8f7058", "#b9aca2", "#f2eeea"],
    lake: "#5d8fb8",
    river: "#3f78ad",
    coast: "#1a3550",
    coastWidth: 0.9,
    stateFill: 0,
    border: "#3b2a2a",
    provinceBorder: "#3b2a2a",
    road: "#5b3b2a",
    sea: "#cfe0ef",
    ink: "#3e3a30",
    iconFill: "#e8dcc4",
    tree: "#5d8c4c",
    burg: "#ffffff",
    burgStroke: "#1e1e1e",
    label: "#1e1e1e",
    halo: "#f4efe2",
    waterLabel: "#cfe0ef",
    font: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    grid: "rgba(255,255,255,0.15)",
    paper: false,
  },
  nautical: {
    ocean: ["#cfdcd8", "#d7e2dd", "#dfe8e2", "#e7eee7", "#eef3ec"],
    land: "#e8dcb8",
    biomes: null,
    heights: null,
    lake: "#d7e2dd",
    river: "#5f8796",
    coast: "#33424a",
    coastWidth: 1.4,
    stateFill: 0,
    border: "#8a4a3a",
    provinceBorder: "#8a4a3a",
    road: "#8a7a5a",
    sea: "#2f5d73",
    ink: "#33424a",
    iconFill: "#e8dcb8",
    tree: "#c9c29a",
    burg: "#e8dcb8",
    burgStroke: "#33424a",
    label: "#2a3238",
    halo: "#eef3ec",
    waterLabel: "#2f5d73",
    font: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
    grid: "rgba(51,66,74,0.16)",
    paper: true,
  },
  night: {
    ocean: ["#05080f", "#070c18", "#0a1122", "#0d172d", "#111e3a"],
    land: "#141b28",
    biomes: BIOMES_NIGHT,
    heights: null,
    lake: "#0d1a33",
    river: "#2b8cff",
    coast: "#38e1ff",
    coastWidth: 0.9,
    stateFill: 0.16,
    border: "#ff3d7f",
    provinceBorder: "#a33a6a",
    road: "#38e1ff",
    sea: "#5f7fa8",
    ink: "#3f5f80",
    iconFill: "#141b28",
    tree: "#1d3a2c",
    burg: "#ffe14d",
    burgStroke: "#05080f",
    label: "#e6f1ff",
    halo: "#05080f",
    waterLabel: "#5f7fa8",
    font: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    grid: "rgba(56,225,255,0.10)",
    paper: false,
  },
};

export type LayerId =
  | "depth"
  | "biomes"
  | "heights"
  | "icons"
  | "rivers"
  | "states"
  | "religions"
  | "provinces"
  | "borders"
  | "routes"
  | "burgs"
  | "emblems"
  | "labels"
  | "markers"
  | "military"
  | "grid"
  | "currents"
  | "winds"
  | "frame";

export const LAYERS: LayerId[] = ["depth", "biomes", "heights", "icons", "rivers", "states", "religions", "provinces", "borders", "routes", "burgs", "emblems", "labels", "markers", "military", "grid", "currents", "winds", "frame"];

export function defaultLayers(theme: ThemeId): Record<LayerId, boolean> {
  return {
    depth: true,
    biomes: theme !== "political" && theme !== "relief" && theme !== "nautical",
    heights: theme === "relief",
    icons: theme !== "political" && theme !== "nautical",
    rivers: true,
    states: theme !== "relief" && theme !== "nautical",
    religions: false,
    provinces: theme === "political",
    borders: true,
    routes: true,
    burgs: true,
    emblems: theme === "political",
    labels: true,
    markers: theme !== "political",
    military: false,
    grid: theme !== "political",
    currents: theme === "nautical",
    winds: false,
    frame: true,
  };
}
