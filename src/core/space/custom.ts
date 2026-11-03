// The game master's own kinds of things for the space maps: a name, a mark and a colour, how many, where they turn
// up, and whether each is a point (a star's secret, a galaxy's oddity) or a region. The generators place them from
// their own random streams, so adding one never moves anything else.
export type Placement = "anywhere" | "claimed" | "unclaimed" | "core" | "rim" | "nebula" | "void" | "filament";

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
}

/** The placements that make sense on a galaxy map and on the universe map. */
export const GALAXY_PLACEMENTS: Placement[] = ["anywhere", "claimed", "unclaimed", "core", "rim", "nebula"];
export const UNIVERSE_PLACEMENTS: Placement[] = ["anywhere", "core", "rim", "void", "filament"];

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
  };
}
