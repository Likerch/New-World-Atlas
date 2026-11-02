// Procedural languages. Each culture gets its own phonology (sound inventory, syllable shapes, favourite clusters)
// and a few morphemes (town, land, river…), so its places sound related to each other and unlike the neighbours'.
// Words are written in a Latin orthography chosen to transliterate cleanly into Cyrillic.
import type { Rng } from "./random";

export interface Language {
  consonants: string[];
  vowels: string[];
  /** Consonant clusters allowed at the start of a syllable. */
  onsets: string[];
  /** Consonants allowed at the end of a syllable. */
  codas: string[];
  /** Syllable shapes with weights: C onset, V vowel, F coda. */
  shapes: [string, number][];
  minSyllables: number;
  maxSyllables: number;
  /** Morphemes for compound names. */
  morphemes: Record<"town" | "fort" | "land" | "river" | "mountain" | "lake" | "people", string[]>;
  /** How names join morphemes: "" (Tarnbur), "-" (Tarn-bur) or " " (Tarn Bur). */
  joiner: string;
}

const CONSONANTS = ["p", "t", "k", "b", "d", "g", "m", "n", "l", "r", "s", "z", "v", "f", "h", "sh", "zh", "ch", "kh", "ts", "th", "w", "y", "q", "j"];
const VOWELS = ["a", "e", "i", "o", "u"];
const CLUSTERS = ["st", "tr", "kr", "pr", "br", "dr", "gr", "bl", "kl", "pl", "gl", "sk", "sv", "sl", "sn", "sm", "zv", "zl", "shv", "khr", "thr", "fr", "fl", "vr", "dv", "tv", "kv", "ts"];

/** A gentle preference for some sounds over others, like real languages have. */
function weighted<T>(rng: Rng, items: T[]): [T, number][] {
  return rng.shuffle([...items]).map((item, index): [T, number] => [item, 1 / (index + 1) ** 0.6]);
}

export function createLanguage(rng: Rng): Language {
  const flavor = rng.pick(["flowing", "rugged", "sibilant", "open", "desert", "northern", "mixed"] as const);
  const pools: Record<typeof flavor, string[]> = {
    flowing: ["l", "n", "m", "r", "s", "v", "th", "y", "h", "d", "f", "w"],
    rugged: ["k", "g", "r", "d", "t", "z", "b", "kh", "sh", "m", "n", "v"],
    sibilant: ["s", "sh", "z", "zh", "ch", "ts", "v", "k", "t", "n", "m", "r", "l", "d"],
    open: ["p", "t", "k", "m", "n", "l", "h", "w", "s", "r"],
    desert: ["q", "k", "h", "s", "d", "z", "r", "m", "n", "l", "b", "f", "kh", "sh", "j", "t"],
    northern: ["b", "d", "g", "f", "h", "y", "k", "l", "m", "n", "r", "s", "t", "v", "th", "sk"],
    mixed: CONSONANTS,
  };
  const pool = pools[flavor].filter((sound) => sound.length <= 2 || sound === "sk");
  const consonants = rng.shuffle([...pool]).slice(0, rng.int(Math.min(7, pool.length), Math.min(14, pool.length)));
  const vowelCount = flavor === "open" ? 5 : rng.int(3, 5);
  const vowels = rng.shuffle([...VOWELS]).slice(0, vowelCount);
  if (!vowels.includes("a")) vowels[0] = "a";
  const onsets = CLUSTERS.filter((cluster) => [...cluster].every((letter) => consonants.some((c) => c.includes(letter)))).slice(0, flavor === "open" ? 0 : rng.int(1, 6));
  const codaPool = consonants.filter((sound) => ["n", "m", "l", "r", "s", "k", "t", "th", "sh", "d", "g", "z", "kh", "v"].includes(sound));
  const codas = flavor === "open" ? ["n"].filter((sound) => consonants.includes(sound)) : rng.shuffle(codaPool).slice(0, rng.int(2, Math.max(2, codaPool.length)));
  const shapes: [string, number][] =
    flavor === "open"
      ? [["CV", 6], ["V", 1], ["CVF", 1]]
      : flavor === "rugged" || flavor === "northern"
        ? [["CV", 3], ["CVF", 4], ["CCVF", 1], ["VF", 1]]
        : [["CV", 5], ["CVF", 3], ["V", 1], ["CCV", 1]];
  const lang: Language = {
    consonants,
    vowels,
    onsets,
    codas: codas.length ? codas : ["n"],
    shapes,
    minSyllables: 1,
    maxSyllables: flavor === "open" || flavor === "flowing" ? 3 : 2,
    morphemes: { town: [], fort: [], land: [], river: [], mountain: [], lake: [], people: [] },
    joiner: rng.weighted([["", 8], ["-", 1], [" ", 1]]),
  };
  const morpheme = (shape: string) => syllable(lang, rng, shape).toLowerCase();
  lang.morphemes = {
    town: Array.from({ length: rng.int(2, 3) }, () => morpheme(rng.pick(["CVF", "CV", "VF"]))),
    fort: [morpheme("CVF")],
    land: Array.from({ length: rng.int(1, 2) }, () => morpheme(rng.pick(["VF", "CV", "CVF"]))),
    river: [morpheme("CV")],
    mountain: [morpheme("CVF")],
    lake: [morpheme("CV")],
    people: [morpheme(rng.pick(["VF", "V", "CV"]))],
  };
  return lang;
}

function pickWeighted(rng: Rng, items: string[]): string {
  return rng.weighted(items.map((item, index): [string, number] => [item, 1 / (index + 1) ** 0.5]));
}

function syllable(lang: Language, rng: Rng, shape: string): string {
  let out = "";
  for (let k = 0; k < shape.length; k++) {
    const part = shape[k];
    if (part === "C") {
      // "CC" is a cluster from the onset list when the language has one.
      if (shape[k + 1] === "C") {
        out += lang.onsets.length ? rng.pick(lang.onsets) : pickWeighted(rng, lang.consonants);
        k++;
      } else out += pickWeighted(rng, lang.consonants);
    } else if (part === "V") out += pickWeighted(rng, lang.vowels);
    else out += pickWeighted(rng, lang.codas);
  }
  return out;
}

/** Joins sounds and tidies what reads badly: tripled letters, doubled clusters. */
function tidy(text: string): string {
  return text
    .replace(/(.)\1\1+/gu, "$1$1")
    .replace(/([^aeiou\s-])\1(?=[^aeiou])/gu, "$1")
    .replace(/(sh|zh|ch|kh|th|h)h+/gu, "$1")
    .replace(/q(?=[^aeiou])/gu, "k")
    .replace(/([^aeiou\s-]{2})([^aeiou\s-]{2,})/gu, (_match, a: string, b: string) => a + b[b.length - 1]);
}

const capitalize = (text: string) => text.replace(/(^|[\s-])(\p{L})/gu, (_match, before: string, letter: string) => before + letter.toUpperCase());

/** A bare word of the language. */
export function word(lang: Language, rng: Rng, min = lang.minSyllables, max = lang.maxSyllables): string {
  const count = rng.int(min, max);
  let out = "";
  for (let k = 0; k < count; k++) out += syllable(lang, rng, rng.weighted(lang.shapes));
  return tidy(out);
}

const used = new WeakMap<Language, Set<string>>();

/** A fresh name of a kind; names never repeat within a language. */
export function name(lang: Language, rng: Rng, kind: "town" | "fort" | "land" | "river" | "mountain" | "lake" | "people" | "person" | "plain"): string {
  const seen = used.get(lang) ?? new Set<string>();
  used.set(lang, seen);
  for (let attempt = 0; attempt < 30; attempt++) {
    const root = word(lang, rng, 1, attempt > 15 ? lang.maxSyllables + 1 : lang.maxSyllables);
    let text = root;
    const suffixes = kind === "plain" || kind === "person" ? [] : lang.morphemes[kind];
    const chance = { town: 0.55, fort: 0.7, land: 0.6, river: 0.25, mountain: 0.4, lake: 0.3, people: 0.9, person: 0, plain: 0 }[kind];
    if (suffixes.length && rng.chance(chance)) text = tidy(root + (kind === "people" ? "" : lang.joiner) + rng.pick(suffixes));
    if (text.length < 3 || text.length > 16) continue;
    const display = capitalize(text);
    if (seen.has(display)) continue;
    seen.add(display);
    return display;
  }
  return capitalize(word(lang, rng, 2, 3));
}

const CYRILLIC: [string, string][] = [
  ["shch", "щ"], ["sh", "ш"], ["zh", "ж"], ["ch", "ч"], ["kh", "х"], ["ts", "ц"], ["th", "т"],
  ["ya", "я"], ["yu", "ю"], ["yo", "ё"], ["ye", "е"], ["y", "й"], ["j", "дж"], ["w", "в"], ["q", "к"],
  ["a", "а"], ["b", "б"], ["v", "в"], ["g", "г"], ["d", "д"], ["e", "е"], ["z", "з"], ["i", "и"], ["k", "к"],
  ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"],
  ["f", "ф"], ["h", "х"], ["c", "к"], ["x", "кс"],
];

/** The same name in Cyrillic: Eldor → Элдор, Shavarkh → Шаварх. */
export function toCyrillic(text: string): string {
  let out = "";
  const lower = text.toLowerCase();
  for (let k = 0; k < lower.length; ) {
    const atWordStart = k === 0 || /[\s-]/u.test(lower[k - 1]);
    if (lower[k] === "e" && atWordStart) {
      out += text[k] === "E" ? "Э" : "э";
      k++;
      continue;
    }
    const match = CYRILLIC.find(([latin]) => lower.startsWith(latin, k));
    if (!match) {
      out += text[k];
      k++;
      continue;
    }
    const upper = text[k] !== lower[k];
    out += upper ? match[1][0].toUpperCase() + match[1].slice(1) : match[1];
    k += match[0].length;
  }
  return out;
}
