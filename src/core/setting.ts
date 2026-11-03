// The world's age and setting: one profile every level reads, so a planet's towns, roads, places, armies, banners and
// faiths, its cities, buildings, dungeons and underworld all belong to the same time. An era is a preset; a custom
// setting starts from one and turns the knobs: technology, transport, magic, decline, density and the kind of rule.

export type EraId = "stone" | "ancient" | "medieval" | "renaissance" | "industrial" | "modern" | "cyberpunk" | "far-future" | "post-apocalypse";
export const ERA_IDS: EraId[] = ["stone", "ancient", "medieval", "renaissance", "industrial", "modern", "cyberpunk", "far-future", "post-apocalypse"];

/** Which kind of rule prevails: any, crowns, the people's vote, priests, the strong, money or machines. */
export type Rule = "any" | "crowns" | "people" | "faith" | "force" | "trade" | "machines";
export const RULES: Rule[] = ["any", "crowns", "people", "faith", "force", "trade", "machines"];

export interface Setting {
  /** The preset it started from. */
  era: EraId;
  /** 0 stone tools · 2 bronze · 3 iron and castles · 4 gunpowder · 5.5 steam · 7 our day · 8 cyberware · 9.5 starships. */
  tech: number;
  /** The technology of roads and craft, when it runs ahead or behind (rails in a world of knights). */
  transport: number;
  /** 0 none · 1 rare wonders · 2 common · 3 the world runs on it. */
  magic: number;
  /** 0 thriving · 1 ruins and survivors. */
  decline: number;
  /** People on top of the era's own numbers: 0.25 – 4. */
  density: number;
  rule: Rule;
  /** A custom setting's own name. */
  name?: string;
}

const preset = (era: EraId, tech: number, extra: Partial<Setting> = {}): Setting => ({ era, tech, transport: tech, magic: 0, decline: 0, density: 1, rule: "any", ...extra });

export const SETTINGS: Record<EraId, Setting> = {
  stone: preset("stone", 0),
  ancient: preset("ancient", 2),
  // The generator's first world: knights, castles and a few wonders.
  medieval: preset("medieval", 3, { magic: 1 }),
  renaissance: preset("renaissance", 4),
  industrial: preset("industrial", 5.5),
  modern: preset("modern", 7),
  cyberpunk: preset("cyberpunk", 8, { rule: "trade" }),
  "far-future": preset("far-future", 9.5),
  "post-apocalypse": preset("post-apocalypse", 7, { transport: 4, decline: 0.8 }),
};

/** Ready mixes for the custom setting. */
export const MIXES: Record<string, Setting> = {
  "high-fantasy": preset("medieval", 3, { magic: 3, name: "high-fantasy" }),
  mythic: preset("ancient", 2, { magic: 2, name: "mythic" }),
  "dark-ages": preset("medieval", 3, { decline: 0.5, density: 0.6, rule: "force", name: "dark-ages" }),
  steampunk: preset("industrial", 5.5, { transport: 6, name: "steampunk" }),
  gaslamp: preset("industrial", 5.5, { magic: 2, name: "gaslamp" }),
  "urban-fantasy": preset("modern", 7, { magic: 2, name: "urban-fantasy" }),
  "science-fantasy": preset("far-future", 9.5, { magic: 2, name: "science-fantasy" }),
  "dying-earth": preset("far-future", 9.5, { decline: 0.6, density: 0.4, magic: 1, name: "dying-earth" }),
};

/** A whole setting from a partial one: what is missing comes from its era's preset; no setting is the medieval world. */
export function settingOf(input?: Partial<Setting> | null): Setting {
  const base = SETTINGS[input?.era ?? "medieval"] ?? SETTINGS.medieval;
  const merged = { ...base, ...Object.fromEntries(Object.entries(input ?? {}).filter(([, value]) => value !== undefined)) } as Setting;
  if (input?.tech !== undefined && input.transport === undefined) merged.transport = input.tech;
  return merged;
}

/** The era a technology level belongs to. */
export function techEra(tech: number): Exclude<EraId, "post-apocalypse"> {
  return tech < 1 ? "stone" : tech < 2.5 ? "ancient" : tech < 3.5 ? "medieval" : tech < 4.75 ? "renaissance" : tech < 6.25 ? "industrial" : tech < 7.5 ? "modern" : tech < 8.75 ? "cyberpunk" : "far-future";
}

/** The era whose words and things a setting uses: its technology's, or the fallen world's once a machine age lies in ruins. */
export function ageOf(setting: Setting, tech = setting.tech): EraId {
  return setting.decline >= 0.5 && tech >= 5 ? "post-apocalypse" : techEra(tech);
}

/** The medieval world the generator was born with: such a setting must keep every old seed's world exactly. */
export function isClassic(setting: Setting): boolean {
  return techEra(setting.tech) === "medieval" && techEra(setting.transport) === "medieval" && setting.magic === 1 && setting.decline === 0 && setting.density === 1 && setting.rule === "any";
}

const RURAL: Record<Exclude<EraId, "post-apocalypse">, number> = { stone: 0.05, ancient: 0.6, medieval: 1, renaissance: 1.3, industrial: 2, modern: 3.5, cyberpunk: 4, "far-future": 3 };
const URBAN: Record<Exclude<EraId, "post-apocalypse">, number> = { stone: 0.03, ancient: 0.7, medieval: 1, renaissance: 1.6, industrial: 4, modern: 14, cyberpunk: 24, "far-future": 16 };

/** How many people the land feeds and how big towns grow, against the medieval world: by technology, thinned by decline. */
export function peopleOf(setting: Setting): { rural: number; urban: number } {
  const era = techEra(setting.tech);
  const left = 1 - Math.min(0.97, setting.decline);
  return { rural: RURAL[era] * left ** 1.5 * setting.density, urban: URBAN[era] * left ** 2.5 * setting.density };
}

/** A setting as short text for a link: its era or mix name, or the whole profile when it is custom. */
export function settingToText(setting: Partial<Setting> | undefined): string {
  if (!setting) return "";
  const whole = settingOf(setting);
  const same = (other: Setting) => JSON.stringify({ ...other, name: undefined }) === JSON.stringify({ ...whole, name: undefined });
  if (same(SETTINGS[whole.era]) && !whole.name) return whole.era;
  const mix = Object.entries(MIXES).find(([id, preset]) => same(preset) && (!whole.name || whole.name === id))?.[0];
  return mix ? `mix:${mix}` : JSON.stringify(whole);
}

/** The setting a link's text names; nothing for empty or unreadable text. */
export function settingFromText(text: string | null | undefined): Partial<Setting> | undefined {
  if (!text) return undefined;
  if (text.startsWith("mix:")) return MIXES[text.slice(4)];
  if (text in SETTINGS) return SETTINGS[text as EraId];
  try {
    const parsed = JSON.parse(text) as Partial<Setting>;
    return parsed && typeof parsed === "object" && ERA_IDS.includes(parsed.era as EraId) ? settingOf(parsed) : undefined;
  } catch {
    return undefined;
  }
}
