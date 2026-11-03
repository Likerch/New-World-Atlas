// The sky of a world and its calendar: how wide and bright its sun looks against ours from Earth, a companion sun,
// its moons (how big they look and how long their months run), the parent world hanging over a moon, which other
// worlds shine in its sky; and its day, its year in its own days, and the months a calendar would count.
import { SPECTRA, type SpectralClass } from "./galaxy";
import type { Body, StarSystem } from "./system";

export interface Sky {
  /** Hours; 0 for a world that always turns one face to what it circles. */
  day: number;
  /** Earth days, and in the world's own days (none for a world with no day). */
  year: number;
  localYear: number | null;
  /** The sun against ours as seen from Earth: its width and its light. 0 wide for a black hole. */
  sunSize: number;
  sunLight: number;
  spectral: SpectralClass;
  companion: SpectralClass | null;
  /** Moons as seen from here, against our Moon as seen from Earth, and their months in Earth days. */
  moons: { name: string; size: number; month: number }[];
  /** For a moon: the world it circles, against our Moon from Earth. */
  parent: { name: string; size: number } | null;
  /** Other worlds bright in the sky, brightest first; inner ones are morning and evening stars. */
  planets: { name: string; inner: boolean; brightness: "brilliant" | "bright" | "faint" }[];
  /** Months in a year by the largest moon, and their length in local days. */
  months: number | null;
  monthDays: number | null;
}

/** Our Moon from Earth, radians wide. */
const MOON = (2 * 0.273) / 60.3;
const massOf = (body: Pick<Body, "kind" | "radius">) => (body.kind === "gas-giant" || body.kind === "ice-giant" ? Math.pow(body.radius, 2.4) : Math.max(0.01, body.radius ** 3 * (body.kind === "ice" ? 0.4 : 1)));
/** A month in Earth days, for a moon this many of its world's radii out. */
const monthOf = (world: Pick<Body, "kind" | "radius">, orbit: number) => 27.32 * Math.sqrt(((orbit * Math.max(world.radius, 0.05)) / 60.3) ** 3 / massOf(world));

/** A star's radius in suns: main-sequence stars by mass, the dead ones tiny. */
function starRadius(spectral: SpectralClass): number {
  if (spectral === "BH") return 0;
  if (spectral === "NS") return 1.5e-5;
  if (spectral === "WD") return 0.012;
  return Math.pow(SPECTRA[spectral].mass, 0.8);
}

export function skyOf(system: StarSystem, bodyId: number, moonIndex?: number): Sky | null {
  const body = system.bodies.find((b) => b.id === bodyId && !b.removed);
  if (!body || body.kind === "belt") return null;
  const moon = moonIndex !== undefined ? body.moons[moonIndex] : undefined;
  const orbit = Math.max(body.orbit, 1e-3);
  // A moon's day is its month: it keeps one face to its world.
  const month = moon ? monthOf(body, moon.orbit ?? 20) : 0;
  const day = moon ? Math.round(month * 24 * 10) / 10 : body.day ?? 24;
  const year = body.year;
  const moons = (moon ? [] : body.moons).map((m) => ({ name: m.name, size: Math.round(((2 * m.radius) / ((m.orbit ?? 20) * Math.max(body.radius, 0.05)) / MOON) * 100) / 100, month: Math.round(monthOf(body, m.orbit ?? 20) * 10) / 10 }));
  const largest = moons.reduce<(typeof moons)[number] | null>((best, m) => (!best || m.size > best.size ? m : best), null);
  const L = system.luminosity;
  const planets = system.bodies
    .filter((other) => other.id !== bodyId && !other.removed && other.kind !== "belt")
    .map((other) => {
      const apart = Math.max(0.02, Math.abs(other.orbit - orbit));
      return { name: other.name, inner: other.orbit < orbit, light: (other.radius ** 2 * L) / (other.orbit ** 2 * apart ** 2) };
    })
    .filter((other) => other.light > 0.01)
    .sort((a, b) => b.light - a.light)
    .slice(0, 4)
    .map(({ name, inner, light }) => ({ name, inner, brightness: light > 5 ? ("brilliant" as const) : light > 0.2 ? ("bright" as const) : ("faint" as const) }));
  const local = (days: number) => (day > 0 ? Math.round((days * 24) / day) : null);
  return {
    day,
    year,
    localYear: local(year),
    sunSize: Math.round((starRadius(system.spectral) / orbit) * 1000) / 1000,
    sunLight: Math.round((L / orbit ** 2) * 1000) / 1000,
    spectral: system.spectral,
    companion: system.companion,
    moons,
    parent: moon ? { name: body.name, size: Math.round((2 * Math.atan(1 / (moon.orbit ?? 20))) / MOON) } : null,
    planets,
    months: largest && largest.month > 1 ? Math.max(1, Math.round(year / largest.month)) : null,
    monthDays: largest && largest.month > 1 ? local(largest.month) : null,
  };
}
