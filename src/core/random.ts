// Seeded randomness. Every generator step draws from its own named stream (`fork`), so adding or changing one step
// never reshuffles the others and a map stays reproducible from its seed.

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  float(min: number, max: number): number;
  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
  /** Normally distributed, clamped to mean ± 3 sd. */
  gauss(mean: number, sd: number): number;
  shuffle<T>(items: T[]): T[];
  /** An independent stream derived from this seed and a label. */
  fork(label: string): Rng;
}

/** A 128-bit hash of a string as four 32-bit words (cyrb128). */
function hash128(text: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/** A stable 32-bit hash, for picking among options by a key. */
export function hashString(text: string): number {
  return hash128(text)[0];
}

export function createRng(seed: string | number): Rng {
  const key = String(seed);
  let [a, b, c, d] = hash128(key);
  // sfc32: small, fast and good enough for procedural content.
  const next = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const rng: Rng = {
    next,
    float: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted: (entries) => {
      const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= Math.max(0, weight);
        if (roll < 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    gauss: (mean, sd) => {
      const u = 1 - next();
      const v = next();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return mean + sd * Math.max(-3, Math.min(3, z));
    },
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
    fork: (label) => createRng(`${key}/${label}`),
  };
  return rng;
}

/** A short random seed for the "new map" button. */
export function randomSeed(): string {
  return Math.floor(Math.random() * 1e9).toString(36);
}
