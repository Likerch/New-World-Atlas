// Coats of arms by the rules of heraldry: a shield, a field (plain or divided), an ordinary and charges, in tinctures
// that keep metal off metal and colour off colour. A province's or a town's arms grow from its realm's: the same field
// with a difference, the way younger branches of a house bore their father's arms.
import { createRng } from "./random";

export type Tincture = "or" | "argent" | "gules" | "azure" | "vert" | "purpure" | "sable";
export type ShieldShape = "heater" | "french" | "spanish" | "round" | "kite";
export type Division = "plain" | "perPale" | "perFess" | "perBend" | "perBendSinister" | "perChevron" | "perSaltire" | "quarterly" | "gyronny" | "paly" | "barry" | "bendy" | "chequy";
export type Ordinary = "none" | "fess" | "pale" | "bend" | "chevron" | "cross" | "saltire" | "chief" | "bordure" | "pall" | "pile";
export type ChargeKind =
  | "mullet"
  | "crescent"
  | "sun"
  | "crossPattee"
  | "tower"
  | "crown"
  | "key"
  | "sword"
  | "tree"
  | "fleur"
  | "eagle"
  | "fish"
  | "anchor"
  | "mountain"
  | "wheel"
  | "roundel"
  | "lozenge"
  | "annulet"
  | "hammer"
  | "heart"
  | "bell"
  | "horseshoe"
  | "ship";

export interface CoatOfArms {
  shield: ShieldShape;
  field: Tincture;
  division: Division;
  /** The second tincture of a divided field. */
  division2: Tincture;
  ordinary: Ordinary;
  ordinaryTincture: Tincture;
  charge: ChargeKind | null;
  chargeTincture: Tincture;
  count: number;
}

/** What the bearer is: seafarers favour anchors and ships, highlanders mountains and hammers, and so on. */
export interface ArmsHints {
  naval?: boolean;
  highland?: boolean;
  nomadic?: boolean;
  faith?: boolean;
  shield?: ShieldShape;
}

export const METALS: Tincture[] = ["or", "argent"];
const COLOURS: [Tincture, number][] = [["gules", 4], ["azure", 4], ["vert", 2], ["purpure", 1], ["sable", 2]];
const isMetal = (tincture: Tincture) => tincture === "or" || tincture === "argent";

const DIVISIONS: [Division, number][] = [
  ["plain", 10],
  ["perPale", 3],
  ["perFess", 3],
  ["perBend", 2],
  ["perBendSinister", 1],
  ["perChevron", 1.5],
  ["perSaltire", 1],
  ["quarterly", 2.5],
  ["gyronny", 0.6],
  ["paly", 1],
  ["barry", 1.2],
  ["bendy", 0.6],
  ["chequy", 0.6],
];
const PATTERNS: Division[] = ["gyronny", "paly", "barry", "bendy", "chequy"];
const ORDINARIES: [Ordinary, number][] = [
  ["none", 6],
  ["fess", 1.5],
  ["pale", 1],
  ["bend", 1.5],
  ["chevron", 1.5],
  ["cross", 1.5],
  ["saltire", 1],
  ["chief", 2],
  ["bordure", 1.2],
  ["pall", 0.5],
  ["pile", 0.5],
];
const CHARGES: Record<ChargeKind, number> = {
  mullet: 3,
  crescent: 2,
  sun: 1.5,
  crossPattee: 2,
  tower: 2.5,
  crown: 1.5,
  key: 1,
  sword: 1.5,
  tree: 1.5,
  fleur: 2.5,
  eagle: 3,
  fish: 1,
  anchor: 0.5,
  mountain: 1,
  wheel: 1,
  roundel: 1.5,
  lozenge: 1,
  annulet: 1,
  hammer: 0.7,
  heart: 0.6,
  bell: 0.5,
  horseshoe: 1,
  ship: 0.5,
};
const FAVOURED: Record<keyof Omit<ArmsHints, "shield">, Partial<Record<ChargeKind, number>>> = {
  naval: { anchor: 6, fish: 4, ship: 6 },
  highland: { mountain: 5, tower: 2, hammer: 3 },
  nomadic: { horseshoe: 5, crescent: 2, sun: 2, tower: 0, ship: 0, anchor: 0 },
  faith: { crossPattee: 3, sun: 2, key: 2, bell: 3 },
};

export function coatOfArms(seed: string, hints: ArmsHints = {}, parent?: CoatOfArms | null): CoatOfArms {
  const rng = createRng(`${seed}/arms`);
  const opposite = (tincture: Tincture): Tincture => (isMetal(tincture) ? rng.weighted(COLOURS) : rng.pick(METALS));
  const charge = (): ChargeKind => {
    const weights = { ...CHARGES };
    for (const key of ["naval", "highland", "nomadic", "faith"] as const) {
      if (!hints[key]) continue;
      for (const [kind, factor] of Object.entries(FAVOURED[key]) as [ChargeKind, number][]) weights[kind] *= factor;
    }
    return rng.weighted(Object.entries(weights).filter(([, weight]) => weight > 0) as [ChargeKind, number][]);
  };

  // A cadet branch: the parent's field, with a bordure or a chief added, or new charges.
  if (parent && rng.chance(0.7)) {
    const arms = { ...parent };
    const mark = rng.weighted<"bordure" | "chief" | "charge">([["bordure", 2], ["chief", 2], ["charge", 3]]);
    if (mark === "charge" || parent.ordinary === mark) {
      arms.charge = charge();
      arms.count = arms.ordinary === "none" || arms.ordinary === "bordure" || arms.ordinary === "chief" ? rng.weighted([[1, 4], [2, 1], [3, 3]]) : 1;
    } else {
      arms.ordinary = mark;
      arms.ordinaryTincture = opposite(parent.field);
      if (mark === "chief") arms.chargeTincture = opposite(arms.ordinaryTincture);
    }
    return arms;
  }

  const shield = hints.shield ?? rng.weighted<ShieldShape>([["heater", 6], ["french", 3], ["spanish", 2], ["kite", 1], ["round", hints.nomadic ? 3 : 0.4]]);
  const field = rng.chance(0.42) ? rng.pick(METALS) : rng.weighted(COLOURS);
  const division = rng.weighted(DIVISIONS);
  const division2 = opposite(field);
  const pattern = PATTERNS.includes(division);
  const ordinary: Ordinary = pattern ? rng.weighted<Ordinary>([["none", 6], ["chief", 2], ["bordure", 1]]) : rng.weighted(ORDINARIES);
  const ordinaryTincture = opposite(field);
  const onChief = ordinary === "chief";
  // A bare plain field says nothing: it always bears a charge.
  const charged = (division === "plain" && ordinary === "none") || (pattern ? onChief && rng.chance(0.8) : rng.chance(ordinary === "none" || ordinary === "bordure" || onChief ? 0.8 : 0.4));
  const crowded = ordinary === "none" || ordinary === "bordure" || onChief || ordinary === "fess" || ordinary === "chevron";
  return {
    shield,
    field,
    division,
    division2,
    ordinary,
    ordinaryTincture,
    charge: charged ? charge() : null,
    chargeTincture: onChief ? opposite(ordinaryTincture) : ordinary === "cross" || ordinary === "saltire" || ordinary === "pall" || ordinary === "pile" ? opposite(ordinaryTincture) : opposite(field),
    count: !crowded ? (ordinary === "pale" || ordinary === "bend" ? 2 : 1) : ordinary === "fess" || ordinary === "chevron" ? 3 : rng.weighted([[1, 5], [2, 1.5], [3, 2.5]]),
  };
}
