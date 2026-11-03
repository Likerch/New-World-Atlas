// The arms of a planet's realms, provinces and towns, grown from the seed: a realm's arms show its people's way of
// life and its faith, a province differences its realm's, a town its province's. The age decides what a realm flies:
// a totem or a single sign on a round shield in early ages, arms in the middle ages, flags in the machine ages, a
// company's logo where corporations or machines rule.
import { coatOfArms, flagOf, logoOf, type ArmsHints, type CoatOfArms, type Emblem } from "../heraldry";
import { settingOf } from "../setting";
import type { Planet } from "./model";

export function armsOf(planet: Planet, kind: "state" | "province" | "burg", id: number): CoatOfArms | null {
  const seed = planet.params.world ?? planet.params.seed;
  if (kind === "state") {
    const state = planet.states[id];
    if (!id || !state) return null;
    const people = planet.cultures[state.culture]?.kind;
    const early = settingOf(planet.params.setting).tech < 2.5;
    const hints: ArmsHints = { naval: people === "naval", highland: people === "highland", nomadic: people === "nomadic" || state.form === "horde", faith: state.form === "theocracy", ...(early ? ({ simple: true, shield: "round" } as const) : {}) };
    return coatOfArms(`${seed}/state-${id}`, hints);
  }
  if (kind === "province") {
    const province = planet.provinces[id];
    if (!id || !province) return null;
    return coatOfArms(`${seed}/province-${id}`, {}, armsOf(planet, "state", province.state));
  }
  const burg = planet.burgs[id];
  if (!id || !burg) return null;
  const parent = burg.province ? armsOf(planet, "province", burg.province) : armsOf(planet, "state", burg.state);
  // A planet's town keeps its arms in a close-up; a close-up's own villages get theirs from the close-up.
  const key = burg.origin !== undefined ? `${seed}/burg-${burg.origin}` : planet.params.world ? `${planet.params.seed}/village-${id}` : `${seed}/burg-${id}`;
  return coatOfArms(key, { naval: burg.port }, parent);
}

/** What a realm, province or town bears in the world's age: arms, a flag or a logo. */
export function emblemOf(planet: Planet, kind: "state" | "province" | "burg", id: number): Emblem | null {
  const seed = planet.params.world ?? planet.params.seed;
  const { tech } = settingOf(planet.params.setting);
  const state = kind === "state" ? planet.states[id] : null;
  if (state && id && tech >= 5) {
    if (state.form === "corporate" || state.form === "machine") return { kind: "logo", logo: logoOf(`${seed}/state-${id}`, { machine: state.form === "machine" }) };
    const people = planet.cultures[state.culture]?.kind;
    return { kind: "flag", flag: flagOf(`${seed}/state-${id}`, { federal: state.form === "union" || state.formKey.includes("federa"), faith: state.form === "theocracy", naval: people === "naval", future: tech >= 8.75 }) };
  }
  if (kind === "province" && id && tech >= 7.5 && planet.provinces[id]) return { kind: "flag", flag: flagOf(`${seed}/province-${id}`, { future: tech >= 8.75 }) };
  const arms = armsOf(planet, kind, id);
  return arms ? { kind: "arms", arms } : null;
}
