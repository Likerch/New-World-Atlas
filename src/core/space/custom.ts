// The game master's own kinds of things for the space maps: a name, a mark and a colour, how many, where they turn
// up, and whether each is a point (a star's secret, a galaxy's oddity, a system's hidden base) or a region; what it
// is, whether the players may see it, and what kind of map it opens into. The generators place them from their own
// random streams, so adding one never moves anything else.
export type Placement = "anywhere" | "claimed" | "unclaimed" | "core" | "rim" | "nebula" | "void" | "filament" | "inner" | "habitable" | "outer" | "moons" | "belt";

/** What a thing opens into when the game master follows it: nothing, a local map of a kind, a building, a star
 * system, a planet or a galaxy. */
export type KindOpening = "none" | "derelict" | "station" | "ruins" | "cave" | "lab" | "wilds" | "system" | "planet" | "galaxy";

export interface CustomKind {
  id: string;
  name: string;
  /** One or two characters (an emoji works) drawn on the map. */
  glyph: string;
  color: string;
  count: number;
  where: Placement;
  /** A region rather than a point. */
  area: boolean;
  /** What it is, in the game master's words. */
  about?: string;
  /** Seen only by the game master: the players' view does not show it. */
  secret?: boolean;
  /** What it opens into. */
  opens?: KindOpening;
}

/** The placements that make sense on a galaxy map, the universe map and a star system. */
export const GALAXY_PLACEMENTS: Placement[] = ["anywhere", "claimed", "unclaimed", "core", "rim", "nebula"];
export const UNIVERSE_PLACEMENTS: Placement[] = ["anywhere", "core", "rim", "void", "filament"];
export const SYSTEM_PLACEMENTS: Placement[] = ["anywhere", "inner", "habitable", "outer", "moons", "belt"];
/** What a thing on each map may open into. */
export const OPENINGS: Record<"universe" | "galaxy" | "system", KindOpening[]> = {
  universe: ["none", "galaxy", "system", "derelict", "ruins", "lab"],
  galaxy: ["none", "system", "derelict", "station", "ruins", "cave", "lab", "wilds"],
  system: ["none", "derelict", "station", "ruins", "cave", "lab", "wilds", "planet"],
};
const ALL_OPENINGS: KindOpening[] = ["none", "derelict", "station", "ruins", "cave", "lab", "wilds", "system", "planet", "galaxy"];

/** Keeps a custom kind sane whatever was typed into it. */
export function cleanKind(kind: Partial<CustomKind>, index: number): CustomKind {
  return {
    id: kind.id || `kind-${index + 1}`,
    name: (kind.name ?? "").slice(0, 60),
    glyph: Array.from(kind.glyph || "✦").slice(0, 2).join(""),
    color: /^#[0-9a-f]{6}$/iu.test(kind.color ?? "") ? kind.color! : "#ffd27a",
    count: Math.max(0, Math.min(60, Math.round(kind.count ?? 3))),
    where: kind.where ?? "anywhere",
    area: !!kind.area,
    ...(kind.about ? { about: String(kind.about).slice(0, 1000) } : {}),
    ...(kind.secret ? { secret: true } : {}),
    ...(kind.opens && kind.opens !== "none" && ALL_OPENINGS.includes(kind.opens) ? { opens: kind.opens } : {}),
  };
}
