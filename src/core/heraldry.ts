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
  /** An early sign: one charge on a plain or halved field, no ordinary (a totem, a hoplite's shield). */
  simple?: boolean;
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
const FAVOURED: Record<keyof Omit<ArmsHints, "shield" | "simple">, Partial<Record<ChargeKind, number>>> = {
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

  if (hints.simple) {
    const field = rng.chance(0.4) ? rng.pick(METALS) : rng.weighted(COLOURS);
    const halved = rng.chance(0.25);
    return { shield: hints.shield ?? "round", field, division: halved ? "perPale" : "plain", division2: opposite(field), ordinary: "none", ordinaryTincture: opposite(field), charge: charge(), chargeTincture: opposite(field), count: 1 };
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

/** National flags of the machine ages: a field of stripes, crosses or a canton, with an emblem. */
export type FlagLayout = "plain" | "bicolor" | "bicolor-v" | "tricolor" | "tricolor-v" | "nordic" | "canton" | "diagonal" | "triangle" | "border" | "stripes" | "saltire" | "disc";
export type FlagEmblem = Extract<ChargeKind, "mullet" | "crescent" | "sun" | "roundel" | "wheel" | "tree" | "eagle" | "hammer" | "crossPattee" | "lozenge" | "anchor" | "tower" | "crown" | "key" | "sword">;

export interface Flag {
  layout: FlagLayout;
  /** Two or three colours, as CSS colours. */
  colors: string[];
  emblem: FlagEmblem | null;
  emblemColor: string;
  /** Stars in a ring or a row (federations). */
  count: number;
}

/** A company's mark: a shape, a sign inside it, and two colours. */
export type LogoShape = "circle" | "hex" | "square" | "diamond" | "shield";
export type LogoMark = "chevron" | "ring" | "bars" | "triangle" | "wave" | "bolt" | "eye" | "cross" | "orbit" | "grid";
export interface Logo {
  shape: LogoShape;
  mark: LogoMark;
  colors: [string, string];
}

export type Emblem = { kind: "arms"; arms: CoatOfArms } | { kind: "flag"; flag: Flag } | { kind: "logo"; logo: Logo };

const FLAG_COLORS: [string, number][] = [
  ["#c8102e", 5],
  ["#0039a6", 4],
  ["#009246", 3],
  ["#ffcd00", 3],
  ["#ffffff", 5],
  ["#111111", 2],
  ["#ff8200", 1],
  ["#75aadb", 1.5],
  ["#8d1b3d", 1],
  ["#5b2c83", 0.6],
];
const light = (color: string) => ["#ffffff", "#ffcd00", "#75aadb", "#ff8200"].includes(color);

export function flagOf(seed: string, hints: { federal?: boolean; faith?: boolean; naval?: boolean; future?: boolean } = {}): Flag {
  const rng = createRng(`${seed}/flag`);
  const layout = rng.weighted<FlagLayout>([
    ["tricolor", 4],
    ["tricolor-v", 4],
    ["bicolor", 3],
    ["bicolor-v", 1],
    ["nordic", hints.faith ? 4 : 1.5],
    ["canton", hints.federal ? 5 : 1.5],
    ["diagonal", 1],
    ["triangle", 1.5],
    ["border", 0.6],
    ["stripes", hints.federal ? 3 : 1],
    ["saltire", 0.8],
    ["disc", hints.future ? 3 : 1.2],
    ["plain", hints.future ? 3 : 0.8],
  ]);
  const colors: string[] = [];
  while (colors.length < 3) {
    const next = rng.weighted(FLAG_COLORS.filter(([color]) => !colors.includes(color)));
    // Neighbouring stripes contrast: light against dark.
    if (colors.length && light(next) === light(colors[colors.length - 1]) && rng.chance(0.75)) continue;
    colors.push(next);
  }
  const emblem: FlagEmblem | null = rng.chance(layout === "plain" || layout === "disc" ? 1 : 0.45)
    ? rng.weighted<FlagEmblem>([["mullet", hints.federal ? 8 : 4], ["crescent", 1.5], ["sun", 2], ["roundel", 1], ["wheel", hints.future ? 3 : 1], ["tree", 1], ["eagle", 2], ["hammer", 0.8], ["crossPattee", hints.faith ? 4 : 0.6], ["lozenge", 0.6], ["anchor", hints.naval ? 3 : 0.3], ["tower", 0.6], ["crown", 0.8], ["key", 0.3], ["sword", 0.6]])
    : null;
  const emblemColor = light(colors[0]) ? rng.pick(["#111111", "#c8102e", "#0039a6"]) : rng.pick(["#ffffff", "#ffcd00"]);
  return { layout, colors, emblem, emblemColor, count: emblem === "mullet" && hints.federal ? rng.int(5, 15) : 1 };
}

export function logoOf(seed: string, hints: { machine?: boolean } = {}): Logo {
  const rng = createRng(`${seed}/logo`);
  const palette: [string, string][] = [["#0b0f19", "#00e5ff"], ["#111111", "#ff2e63"], ["#f3f3f3", "#1d3557"], ["#1d1d1d", "#f9c80e"], ["#0f2027", "#2ecc71"], ["#ffffff", "#e63946"], ["#2b2d42", "#edf2f4"], ["#3a0ca3", "#f72585"]];
  return {
    shape: rng.weighted<LogoShape>([["circle", 3], ["hex", hints.machine ? 5 : 2], ["square", 2], ["diamond", 1.5], ["shield", 1]]),
    mark: rng.weighted<LogoMark>([["chevron", 2], ["ring", 2], ["bars", 2], ["triangle", 2], ["wave", 1.5], ["bolt", 1.5], ["eye", hints.machine ? 5 : 1], ["cross", 1], ["orbit", 1.5], ["grid", hints.machine ? 3 : 1]]),
    colors: rng.pick(palette),
  };
}
