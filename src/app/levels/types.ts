// What every map level (galaxy, system, planet, region, city, building, local map) gives the app shell.
import type { ReactNode } from "react";
import type { Language, LegendSection, MapPatch } from "../../core/index";
import type { Locale, T } from "../i18n";

export type LevelId = "universe" | "galaxy" | "system" | "planet" | "region" | "underworld" | "city" | "building" | "local";

export interface LevelContext {
  t: T;
  nm: (name: string) => string;
  locale: Locale;
  script: "latin" | "cyrillic";
  /** Moves the map to a point. */
  focus: (x: number, y: number) => void;
  /** Runs heavy work after the "busy" note has painted. */
  run: (work: () => void) => void;
  /** Switches the visible level. */
  show: (level: LevelId) => void;
  /** The GM's new names for a map's things. */
  names: (mapKey: string | null) => Record<string, string>;
  /** A map's whole GM patch, and a change to it. */
  patch: (mapKey: string | null) => MapPatch;
  update: (mapKey: string | null, change: (patch: MapPatch) => MapPatch) => void;
  /** The players' view is on: hide what only the GM should see. */
  players: boolean;
}

export interface Level {
  id: LevelId;
  icon: string;
  /** The current map's name for the tab, if one exists. */
  title: string | null;
  seed: string;
  setSeed: (seed: string) => void;
  generate: (seed?: string) => void;
  /** The map; a globe also turns when dragged. */
  map: { svg: string; width: number; height: number; key: string; onPick: (x: number, y: number) => void; onDrag?: (dx: number, dy: number) => void; onDragEnd?: () => void; zoomRange?: [number, number] } | null;
  controls: ReactNode;
  inspector: ReactNode;
  /** What the map's colours, lines and marks mean. */
  legend?: LegendSection[];
  /** For the world: the map's place in it (when it differs from mapKey: a globe, a quarter close-up), the parameters
   * it was made from and the language its names came from. */
  worldKey?: string | null;
  params?: Record<string, unknown> | null;
  language?: Language | null;
  /** Opens a map of this level from saved parameters (the world's top map, or one met again). */
  restore?: (params: Record<string, unknown>, language?: Language | null) => void;
  status: string;
  /** Data for the JSON export. */
  data: () => unknown;
  /** A map cut wholly from its parent (a region, the underworld): it has no seed or settings of its own to make anew. */
  fixed?: boolean;
  /** Opens the level for the first time (generates if nothing exists yet). */
  ensure: () => void;
  /** Identity of the map shown, for the GM's patch. */
  mapKey: string | null;
  /** Where pins and fog go when the map shows several sheets (a building's floors, a room up close); null when they
   * cannot be laid on this view (a globe). Unset: the map's own patch. */
  sheetKey?: string | null;
  /** The thing selected on it, for renaming and notes; "world" for the map itself. */
  selected: { key: string; label: string } | null;
}
