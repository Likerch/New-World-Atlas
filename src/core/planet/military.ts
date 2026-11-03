// Armies and fleets of the realms: how many bear arms by the realm's form and its people, what they fight with by the
// people's way of life, and where they stand — the guard in the capital, the marches facing rivals and enemies,
// garrisons in the great towns, fleets in the ports. The age decides what the four arms are (spears and slings in the
// stone age; pikes and muskets; tanks and air wings; drones and orbital batteries) and how many a realm can field.
import { createRng } from "../random";
import { ageOf, isClassic, settingOf, type EraId } from "../setting";
import type { CultureKind, Planet, StateForm } from "./model";

export type UnitKind = "infantry" | "archers" | "cavalry" | "artillery" | "fleet";
export type Stance = "guard" | "march" | "garrison" | "fleet";

export interface Regiment {
  id: number;
  state: number;
  /** Its number among the realm's armies (or fleets). */
  number: number;
  burg: number;
  x: number;
  y: number;
  stance: Stance;
  /** Men under arms by kind; sailors and marines for a fleet. */
  units: Record<UnitKind, number>;
  ships: number;
  total: number;
  /** For a march: the realm it faces. */
  facing: number;
}

const MOBILISATION: Record<StateForm, number> = { monarchy: 0.025, republic: 0.015, theocracy: 0.02, union: 0.02, tribal: 0.04, horde: 0.07, "free-city": 0.012, magocracy: 0.015, dictatorship: 0.03, corporate: 0.01, machine: 0.02, colony: 0.008, warlord: 0.08 };
const MIX: Record<CultureKind, [number, number, number, number]> = {
  // infantry, archers, cavalry, siege engines
  generic: [55, 20, 18, 7],
  river: [55, 25, 15, 5],
  lake: [55, 25, 15, 5],
  naval: [60, 25, 8, 7],
  nomadic: [10, 30, 60, 0],
  highland: [55, 30, 5, 10],
  hunting: [35, 55, 10, 0],
};
const NAVY: Record<CultureKind, number> = { naval: 0.35, river: 0.08, lake: 0.08, generic: 0.12, nomadic: 0, highland: 0.03, hunting: 0.02 };
const HOSTILE = new Set(["enemy", "rival", "suspicion"]);
/** Each age's arms (line, ranged, mobile, heavy), share of people under arms against the medieval world, and crew per ship. */
const AGE_ARMS: Record<EraId, { mix: [number, number, number, number]; mobilise: number; crew: number }> = {
  stone: { mix: [65, 35, 0, 0], mobilise: 1.5, crew: 12 },
  ancient: { mix: [60, 20, 15, 5], mobilise: 1, crew: 150 },
  medieval: { mix: [55, 20, 18, 7], mobilise: 1, crew: 120 },
  renaissance: { mix: [45, 30, 18, 7], mobilise: 0.9, crew: 250 },
  industrial: { mix: [65, 10, 12, 13], mobilise: 0.8, crew: 400 },
  modern: { mix: [50, 15, 22, 13], mobilise: 0.4, crew: 600 },
  cyberpunk: { mix: [40, 25, 20, 15], mobilise: 0.3, crew: 500 },
  "far-future": { mix: [30, 30, 25, 15], mobilise: 0.2, crew: 800 },
  "post-apocalypse": { mix: [60, 25, 12, 3], mobilise: 1.2, crew: 60 },
};
/** What a people's way of life adds to an age's mix: riders, hunters' bows, highland foot. */
const LEANING: Record<CultureKind, [number, number, number, number]> = { generic: [1, 1, 1, 1], river: [1, 1.1, 1, 1], lake: [1, 1.1, 1, 1], naval: [1, 1, 0.6, 1], nomadic: [0.5, 1.2, 2.5, 0.5], highland: [1.2, 1.2, 0.4, 1.2], hunting: [0.8, 1.8, 0.6, 0.5] };

const raised = new WeakMap<Planet, Regiment[]>();

export function raiseArmies(planet: Planet): Regiment[] {
  const cached = raised.get(planet);
  if (cached) return cached;
  const rng = createRng(`${planet.params.seed}/military`);
  const setting = settingOf(planet.params.setting);
  const classic = isClassic(setting);
  const arms = AGE_ARMS[ageOf(setting)];
  const afloat = setting.transport >= 0.5;
  const regiments: Regiment[] = [];
  const s = planet.mesh.spacing;
  for (const state of planet.states.slice(1)) {
    if (!state.cells) continue;
    const towns = planet.burgs.filter((burg) => burg.id && !burg.removed && burg.state === state.id);
    const capital = towns.find((burg) => burg.capital) ?? [...towns].sort((a, b) => b.population - a.population)[0];
    if (!capital || !towns.length) continue;
    const people = planet.cultures[state.culture]?.kind ?? "generic";
    const men = (state.rural + state.urban) * 1000 * MOBILISATION[state.form] * (classic ? 1 : arms.mobilise) * rng.float(0.8, 1.2);
    const ports = towns.filter((burg) => burg.port).sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population);
    const sailors = ports.length && afloat ? men * NAVY[people] : 0;
    const soldiers = men - sailors;
    const base = classic ? MIX[people] : arms.mix.map((share, k) => share * LEANING[people][k]);
    const mix = base.map((share) => share * rng.float(0.8, 1.2));
    const sum = mix.reduce((a, b) => a + b, 0);
    let number = 0;
    const raise = (burgId: number, stance: Stance, strength: number, facing = 0) => {
      const burg = planet.burgs[burgId];
      const [infantry, archers, cavalry, artillery] = mix.map((share) => Math.round(((strength * share) / sum) / 10) * 10);
      const total = infantry + archers + cavalry + artillery;
      if (total < 100) return;
      const here = regiments.filter((other) => other.burg === burgId).length;
      regiments.push({ id: regiments.length, state: state.id, number: ++number, burg: burgId, x: burg.x + here * s * 1.3, y: burg.y - s * 1.3, stance, units: { infantry, archers, cavalry, artillery, fleet: 0 }, ships: 0, total, facing });
    };

    // The marches: a town facing each hostile neighbour's capital.
    const foes = Object.entries(state.relations)
      .filter(([, relation]) => HOSTILE.has(relation))
      .map(([id]) => Number(id))
      .filter((id) => planet.burgs.some((burg) => burg.id && burg.state === id && burg.capital));
    const count = Math.max(1, Math.min(6, Math.round(soldiers / 12000)));
    const guard = count === 1 ? soldiers : soldiers * 0.3;
    raise(capital.id, "guard", guard);
    if (count > 1) {
      const marchShare = foes.length ? 0.45 : 0;
      for (const foe of foes.slice(0, Math.max(1, count - 2))) {
        const target = planet.burgs.find((burg) => burg.id && burg.state === foe && burg.capital)!;
        const town = towns.reduce((best, burg) => (Math.hypot(burg.x - target.x, burg.y - target.y) < Math.hypot(best.x - target.x, best.y - target.y) ? burg : best));
        raise(town.id, "march", (soldiers * marchShare) / Math.min(foes.length, Math.max(1, count - 2)), foe);
      }
      const garrisons = towns.filter((burg) => burg !== capital).sort((a, b) => b.population - a.population).slice(0, Math.max(1, count - 1 - foes.length));
      for (const town of garrisons) raise(town.id, "garrison", (soldiers * (0.7 - marchShare)) / garrisons.length);
    }

    // Fleets lie in the realm's chief ports.
    if (sailors > 300) {
      const fleets = Math.max(1, Math.min(3, Math.round(sailors / 4000), ports.length));
      let fleetNumber = 0;
      for (const port of ports.slice(0, fleets)) {
        const crew = Math.round(sailors / fleets / 10) * 10;
        const here = regiments.filter((other) => other.burg === port.id).length;
        regiments.push({ id: regiments.length, state: state.id, number: ++fleetNumber, burg: port.id, x: port.x + here * s * 1.3, y: port.y + s * 1.3, stance: "fleet", units: { infantry: 0, archers: 0, cavalry: 0, artillery: 0, fleet: crew }, ships: Math.max(1, Math.round(crew / (classic ? 120 : arms.crew))), total: crew, facing: 0 });
      }
    }
  }
  raised.set(planet, regiments);
  return regiments;
}
