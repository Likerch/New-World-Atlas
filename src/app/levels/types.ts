// What every map level (galaxy, system, planet, region, city, building, local map) gives the app shell.
import type { ReactNode } from "react";
import type { Locale, T } from "../i18n";

export type LevelId = "galaxy" | "system" | "planet" | "region" | "city" | "building" | "local";

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
  map: { svg: string; width: number; height: number; key: string; onPick: (x: number, y: number) => void } | null;
  controls: ReactNode;
  inspector: ReactNode;
  status: string;
  /** Data for the JSON export. */
  data: () => unknown;
  /** Opens the level for the first time (generates if nothing exists yet). */
  ensure: () => void;
  /** Identity of the map shown, for the GM's patch. */
  mapKey: string | null;
  /** The thing selected on it, for renaming and notes; "world" for the map itself. */
  selected: { key: string; label: string } | null;
}
