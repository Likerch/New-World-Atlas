// How the world's age reshapes its settlements: camps of a few hundred in the stone age, cities of millions in a
// modern one, survivors' holds after the fall; walls where walls are still built, slums where cities outgrow them.
import type { Rng } from "../random";
import { ageOf, isClassic, peopleOf, type Setting } from "../setting";
import type { Burg } from "./model";

export function settleAge(burgs: Burg[], setting: Setting, rng: Rng): void {
  if (isClassic(setting)) return;
  const { urban } = peopleOf(setting);
  const fallen = ageOf(setting) === "post-apocalypse";
  const { tech } = setting;
  for (const burg of burgs) {
    if (!burg.id) continue;
    const own = rng.fork(`burg-${burg.id}`);
    burg.population = Math.max(0.02, Math.round(burg.population * urban * own.float(0.85, 1.15) * 100) / 100);
    if (fallen) {
      burg.walls = own.chance(0.6);
      burg.citadel = burg.capital && own.chance(0.5);
      burg.shanty = own.chance(0.5);
    } else if (tech < 1) {
      // A camp: a palisade at most.
      burg.walls = burg.capital && own.chance(0.4);
      burg.citadel = false;
      burg.shanty = false;
      burg.market = false;
    } else if (tech >= 5) {
      // Old walls survive only round the oldest capitals of the first machine age.
      burg.walls = tech < 6.25 && burg.capital && own.chance(0.3);
      burg.citadel = tech < 6.25 && burg.citadel && own.chance(0.4);
      burg.shanty = burg.population > (tech >= 7.5 ? 200 : 60) && own.chance(0.7);
      burg.market = true;
    }
  }
}
