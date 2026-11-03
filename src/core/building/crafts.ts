// Shops and workshops by craft and age: what a baker, a chandler or a chrome dealer keeps on the shop floor, what
// they sell and for how much. A shop's craft is drawn from its seed, so the city's directory and the plan opened from
// it agree. Prices are in the age's own money ("price.medieval": silver; "price.cyberpunk": eddies).
import type { Era } from "../city/model";
import { createRng, hashString } from "../random";
import type { BuildingPlan, FurnitureKind } from "./plan";

export type Craft =
  | "baker"
  | "butcher"
  | "brewer"
  | "tailor"
  | "cobbler"
  | "chandler"
  | "apothecary"
  | "jeweller"
  | "weaponsmith"
  | "armourer"
  | "potter"
  | "draper"
  | "spicer"
  | "perfumer"
  | "printer"
  | "clockmaker"
  | "grocer"
  | "pawnbroker"
  | "gunsmith"
  | "electronics"
  | "chrome"
  | "fabricator"
  | "outfitter"
  | "scrapper"
  | "water-seller"
  | "flint-knapper";

interface CraftInfo {
  eras: Era[];
  /** What stands on its shop floor or in its workshop besides counter and shelves. */
  furniture: FurnitureKind[];
  /** Goods and their usual price in the age's money. */
  goods: [string, number][];
}

const OLD: Era[] = ["ancient", "medieval", "renaissance"];
export const CRAFTS: Record<Craft, CraftInfo> = {
  baker: { eras: [...OLD, "industrial", "modern"], furniture: ["oven"], goods: [["bread", 1], ["pie", 3], ["cake", 8], ["flour", 6]] },
  butcher: { eras: [...OLD, "industrial", "modern"], furniture: ["hooks"], goods: [["sausage", 3], ["ham", 12], ["mutton", 8], ["tallow", 2]] },
  brewer: { eras: ["medieval", "renaissance", "industrial"], furniture: ["vat", "barrel"], goods: [["ale", 2], ["cask", 20], ["mead", 5]] },
  tailor: { eras: [...OLD, "industrial", "modern"], furniture: ["loom", "bolts"], goods: [["shirt", 6], ["cloak", 15], ["fine-coat", 60], ["mending", 1]] },
  cobbler: { eras: ["medieval", "renaissance", "industrial"], furniture: ["bolts"], goods: [["boots", 12], ["shoes", 6], ["mending", 1]] },
  chandler: { eras: ["medieval", "renaissance", "industrial"], furniture: ["barrel"], goods: [["candles", 1], ["lamp-oil", 2], ["soap", 2], ["rope", 3]] },
  apothecary: { eras: [...OLD, "industrial", "modern", "cyberpunk"], furniture: ["still"], goods: [["salve", 10], ["herbs", 2], ["antidote", 25], ["sleeping-draught", 15]] },
  jeweller: { eras: [...OLD, "industrial", "modern", "cyberpunk"], furniture: ["display"], goods: [["silver-ring", 30], ["gold-chain", 120], ["gem", 200], ["brooch", 50]] },
  weaponsmith: { eras: OLD, furniture: ["rack"], goods: [["sword", 60], ["dagger", 8], ["spear", 10], ["crossbow", 70]] },
  armourer: { eras: ["medieval", "renaissance"], furniture: ["rack"], goods: [["helm", 25], ["mail", 150], ["shield", 15], ["plate", 800]] },
  potter: { eras: ["ancient", "medieval"], furniture: ["kiln"], goods: [["jug", 1], ["amphora", 3], ["plates", 2], ["oil-lamp", 1]] },
  draper: { eras: ["medieval", "renaissance", "industrial"], furniture: ["bolts"], goods: [["wool", 15], ["linen", 10], ["silk", 80]] },
  spicer: { eras: ["medieval", "renaissance"], furniture: ["barrel"], goods: [["pepper", 20], ["saffron", 60], ["cinnamon", 25], ["salt", 2]] },
  perfumer: { eras: OLD, furniture: ["still"], goods: [["perfume", 30], ["incense", 5], ["oils", 10]] },
  printer: { eras: ["renaissance", "industrial"], furniture: ["press"], goods: [["book", 20], ["map", 30], ["almanac", 4], ["broadsheet", 1]] },
  clockmaker: { eras: ["renaissance", "industrial"], furniture: ["display"], goods: [["pocket-watch", 80], ["clock", 200], ["mending", 5]] },
  grocer: { eras: ["industrial", "modern", "post-apocalypse"], furniture: ["barrel"], goods: [["tea", 3], ["coffee", 4], ["sugar", 2], ["tins", 2]] },
  pawnbroker: { eras: ["industrial", "modern", "cyberpunk", "post-apocalypse"], furniture: ["display"], goods: [["odd-lot", 15], ["pocket-watch", 40], ["jewellery", 60], ["pistol", 150]] },
  gunsmith: { eras: ["renaissance", "industrial", "modern", "cyberpunk", "post-apocalypse"], furniture: ["rack"], goods: [["pistol", 300], ["rifle", 700], ["ammo", 20], ["powder", 5]] },
  electronics: { eras: ["modern", "cyberpunk"], furniture: ["display"], goods: [["phone", 300], ["laptop", 900], ["radio", 40], ["batteries", 5]] },
  chrome: { eras: ["cyberpunk", "far-future"], furniture: ["display"], goods: [["optics", 1500], ["reflex-booster", 4000], ["subdermal", 2500], ["cyberdeck", 3000]] },
  fabricator: { eras: ["far-future"], furniture: ["display"], goods: [["printed-tools", 20], ["nanofab", 200], ["drone", 600]] },
  outfitter: { eras: ["far-future", "cyberpunk"], furniture: ["rack"], goods: [["vac-suit", 800], ["grav-boots", 400], ["rebreather", 120]] },
  scrapper: { eras: ["post-apocalypse"], furniture: ["crate"], goods: [["scrap", 2], ["spare-parts", 10], ["old-tech", 50], ["fuel", 15]] },
  "water-seller": { eras: ["post-apocalypse"], furniture: ["vat"], goods: [["clean-water", 5], ["purifier", 10], ["canned-food", 8]] },
  "flint-knapper": { eras: ["stone"], furniture: ["mat"], goods: [["flint-blade", 2], ["spearhead", 3], ["scraper", 1]] },
};
export const CRAFT_IDS = Object.keys(CRAFTS) as Craft[];

/** The crafts an age has. */
export const craftsOf = (era: Era): Craft[] => CRAFT_IDS.filter((craft) => CRAFTS[craft].eras.includes(era));

/** A shop's craft, the same wherever it is asked for: in the city's directory and in the plan opened from it. */
export function craftFor(seed: string, era: Era): Craft | undefined {
  const crafts = craftsOf(era);
  return crafts.length ? crafts[hashString(`${seed}/craft`) % crafts.length] : undefined;
}

export interface ShopItem {
  /** Dictionary key of the goods: "goods.bread". */
  key: string;
  price: number;
  stock: number;
}

/** What a shop has on its shelves today: its craft's goods, priced by the house's purse and a little haggling. */
export function shopInventory(plan: BuildingPlan): ShopItem[] {
  const craft = plan.params.craft as Craft | undefined;
  const info = craft ? CRAFTS[craft] : undefined;
  if (!info) return [];
  const rng = createRng(`${plan.params.seed}/stock`);
  const wealth = plan.params.wealth ?? 0.5;
  return info.goods.map(([goods, price]) => ({ key: `goods.${goods}`, price: Math.max(1, Math.round(price * (0.8 + wealth * 0.5) * rng.float(0.85, 1.2))), stock: rng.int(price > 500 ? 0 : 1, price > 500 ? 3 : price > 50 ? 6 : 20) }));
}
