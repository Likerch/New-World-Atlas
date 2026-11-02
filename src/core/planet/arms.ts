// The arms of a planet's realms, provinces and towns, grown from the seed: a realm's arms show its people's way of
// life and its faith, a province differences its realm's, a town its province's.
import { coatOfArms, type ArmsHints, type CoatOfArms } from "../heraldry";
import type { Planet } from "./model";

export function armsOf(planet: Planet, kind: "state" | "province" | "burg", id: number): CoatOfArms | null {
  const seed = planet.params.world ?? planet.params.seed;
  if (kind === "state") {
    const state = planet.states[id];
    if (!id || !state) return null;
    const people = planet.cultures[state.culture]?.kind;
    const hints: ArmsHints = { naval: people === "naval", highland: people === "highland", nomadic: people === "nomadic" || state.form === "horde", faith: state.form === "theocracy" };
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
