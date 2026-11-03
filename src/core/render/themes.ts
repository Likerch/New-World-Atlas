// Map styles. A theme only decides how data looks; switching it never changes the world. Each age has a style that
// suits it: a parchment for the ancients, a road atlas for our day, a hologram for the far future, a dusty map after
// the fall.
import { ageOf, type Setting } from "../setting";

export type ThemeId = "atlas" | "parchment" | "political" | "relief" | "night" | "nautical" | "modern" | "hud" | "wasteland";

export const THEMES: ThemeId[] = ["atlas", "parchment", "political", "relief", "night", "nautical", "modern", "hud", "wasteland"];

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
const BIOMES_MODERN = ["#aad3df", "#f5e9c6", "#ece7da", "#efe6c4", "#eef0d6", "#d4e8c2", "#c8e2b6", "#b9dba8", "#bcdcb9", "#cfe0c4", "#ece9df", "#ffffff", "#d3e6d2"];
const BIOMES_WASTE = ["#5f6f6b", "#d9c491", "#c9b993", "#cdb782", "#c6b98a", "#b8ad7d", "#aaa274", "#9e9a6c", "#a19d78", "#a8a084", "#c4b9a0", "#e4ddcc", "#a5a07c"];
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
  modern: {
    ocean: ["#9ccbe4", "#a3d0e7", "#aad3df", "#b3d9e8", "#bfe0ee"],
    land: "#f2efe9",
    biomes: BIOMES_MODERN,
    heights: null,
    lake: "#aad3df",
    river: "#7fb4d6",
    coast: "#7aa6c2",
    coastWidth: 0.8,
    stateFill: 0.18,
    border: "#8a7fa8",
    provinceBorder: "#b8b0cc",
    road: "#c98a3a",
    sea: "#5d8fb3",
    ink: "#5e5e5e",
    iconFill: "#ffffff",
    tree: "#b9dba8",
    burg: "#ffffff",
    burgStroke: "#3a3a3a",
    label: "#262626",
    halo: "#ffffff",
    waterLabel: "#4a7ea8",
    font: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    grid: "rgba(90,120,150,0.18)",
    paper: false,
  },
  hud: {
    ocean: ["#020a12", "#031019", "#041621", "#061c2a", "#082334"],
    land: "#06202b",
    biomes: null,
    heights: ["#06202b", "#072631", "#082c38", "#0a333f", "#0c3a47", "#0e414f", "#104858", "#135061", "#16586b", "#1a6176"],
    lake: "#041621",
    river: "#2bb7d9",
    coast: "#4de1ff",
    coastWidth: 1,
    stateFill: 0.12,
    border: "#7cf6ff",
    provinceBorder: "#2a8fa8",
    road: "#4de1ff",
    sea: "#2a8fa8",
    ink: "#4de1ff",
    iconFill: "#06202b",
    tree: "#0f3a3a",
    burg: "#bff7ff",
    burgStroke: "#020a12",
    label: "#bff7ff",
    halo: "#020a12",
    waterLabel: "#2a8fa8",
    font: "'Consolas', 'Cascadia Mono', 'Courier New', monospace",
    grid: "rgba(77,225,255,0.16)",
    paper: false,
  },
  wasteland: {
    ocean: ["#4a5856", "#53625f", "#5c6b67", "#677670", "#73817a"],
    land: "#cbb894",
    biomes: BIOMES_WASTE,
    heights: null,
    lake: "#6f7d72",
    river: "#5d6f6a",
    coast: "#3a3226",
    coastWidth: 1.2,
    stateFill: 0.15,
    border: "#7a2a1a",
    provinceBorder: "#8a5a3a",
    road: "#5a4a3a",
    sea: "#2f3a38",
    ink: "#4a3a2a",
    iconFill: "#cbb894",
    tree: "#8f8a62",
    burg: "#e9dcc0",
    burgStroke: "#2e261d",
    label: "#2e261d",
    halo: "#d9c9a6",
    waterLabel: "#2f3a38",
    font: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    grid: "rgba(70,55,35,0.16)",
    paper: true,
  },
};

/** The style that suits a world's age. */
export function eraTheme(setting: Setting): ThemeId {
  const age = ageOf(setting);
  return age === "stone" || age === "ancient" ? "parchment" : age === "modern" ? "modern" : age === "cyberpunk" ? "night" : age === "far-future" ? "hud" : age === "post-apocalypse" ? "wasteland" : "atlas";
}

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
  | "landmasses"
  | "events"
  | "markers"
  | "military"
  | "grid"
  | "temperature"
  | "precipitation"
  | "population"
  | "currents"
  | "winds"
  | "frame";

export const LAYERS: LayerId[] = ["depth", "biomes", "heights", "icons", "rivers", "states", "religions", "provinces", "borders", "routes", "burgs", "emblems", "labels", "landmasses", "markers", "events", "military", "grid", "temperature", "precipitation", "population", "currents", "winds", "frame"];

export function defaultLayers(theme: ThemeId): Record<LayerId, boolean> {
  return {
    depth: true,
    biomes: theme !== "political" && theme !== "relief" && theme !== "nautical" && theme !== "hud",
    heights: theme === "relief" || theme === "hud",
    icons: theme !== "political" && theme !== "nautical" && theme !== "modern" && theme !== "hud",
    rivers: true,
    states: theme !== "relief" && theme !== "nautical",
    religions: false,
    provinces: theme === "political",
    borders: true,
    routes: true,
    burgs: true,
    emblems: theme === "political" || theme === "modern" || theme === "hud",
    labels: true,
    // Continents' names crowd the realms' own: shown by default only where no realms are drawn.
    landmasses: theme === "relief" || theme === "nautical",
    markers: theme !== "political",
    // What history did lately, where: off unless the GM asks.
    events: false,
    military: false,
    grid: theme !== "political" && theme !== "modern",
    temperature: false,
    precipitation: false,
    population: false,
    currents: theme === "nautical",
    winds: false,
    frame: true,
  };
}
