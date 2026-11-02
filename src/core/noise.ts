// Coherent noise on top of simplex-noise: fractal (fBm), ridged and domain-warped variants, all seeded.
import { createNoise2D, createNoise3D } from "simplex-noise";
import type { Rng } from "./random";

export type Noise2 = (x: number, y: number) => number;

export function noise2(rng: Rng): Noise2 {
  return createNoise2D(rng.next);
}

export function noise3(rng: Rng): (x: number, y: number, z: number) => number {
  return createNoise3D(rng.next);
}

/** Fractal Brownian motion in about [-1, 1]. */
export function fbm(noise: Noise2, x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += amplitude * noise(x * frequency, y * frequency);
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal in [0, 1]: sharp crests, for mountain chains and canyons. */
export function ridged(noise: Noise2, x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const n = 1 - Math.abs(noise(x * frequency, y * frequency));
    sum += amplitude * n * n;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / norm;
}

/** fBm sampled through another fBm: organic, swirling shapes. */
export function warped(noise: Noise2, warp: Noise2, x: number, y: number, strength = 0.5, octaves = 5): number {
  const dx = fbm(warp, x + 5.2, y + 1.3, 3);
  const dy = fbm(warp, x - 1.7, y + 9.2, 3);
  return fbm(noise, x + strength * dx, y + strength * dy, octaves);
}
