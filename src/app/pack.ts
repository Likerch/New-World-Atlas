// A pack of the GM's own content (kinds of places, quarters, buildings, rooms, themes and tables, kept in this browser),
// saved to a file and read into another browser or after a clean-up. Reading merges: what is already here stays, and
// what the pack brings that is not here is added.
const OWN = /^atlas\.(kinds\.|local\.own$)/u;

export interface Pack {
  format: "new-world-atlas/pack";
  version: 1;
  items: Record<string, unknown>;
}

export function packOwn(): Pack {
  const items: Record<string, unknown> = {};
  for (let k = 0; k < localStorage.length; k++) {
    const key = localStorage.key(k);
    if (!key || !OWN.test(key)) continue;
    try {
      items[key] = JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
      // Not ours to read: left out.
    }
  }
  return { format: "new-world-atlas/pack", version: 1, items };
}

/** Lists: what is not here yet (by id, else by its whole content) is added; records: merged field by field. */
function merge(here: unknown, brought: unknown): unknown {
  if (Array.isArray(here) && Array.isArray(brought)) {
    const keyOf = (item: unknown) => (item && typeof item === "object" && "id" in item ? `id:${String((item as { id: unknown }).id)}` : JSON.stringify(item));
    const seen = new Set(here.map(keyOf));
    return [...here, ...brought.filter((item) => !seen.has(keyOf(item)))];
  }
  if (here && brought && typeof here === "object" && typeof brought === "object" && !Array.isArray(here) && !Array.isArray(brought)) {
    const out: Record<string, unknown> = { ...(here as Record<string, unknown>) };
    for (const [key, value] of Object.entries(brought as Record<string, unknown>)) out[key] = key in out ? merge(out[key], value) : value;
    return out;
  }
  return here ?? brought;
}

/** Reads a pack into this browser; returns how many kinds of content it touched, or null if it is not a pack. */
export function readPack(data: unknown): number | null {
  const pack = data as Partial<Pack> | null;
  if (!pack || pack.format !== "new-world-atlas/pack" || !pack.items || typeof pack.items !== "object") return null;
  let count = 0;
  for (const [key, value] of Object.entries(pack.items)) {
    if (!OWN.test(key)) continue;
    let here: unknown = null;
    try {
      here = JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
      here = null;
    }
    localStorage.setItem(key, JSON.stringify(merge(here, value)));
    count++;
  }
  return count;
}
