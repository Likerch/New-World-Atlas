// The campaign: the GM's patches for every map visited, kept in the browser between sessions and saved as a file.
import { useEffect, useState } from "react";
import { emptyPatch, type Campaign, type MapPatch } from "../core/index";

const STORAGE = "new-world-atlas/campaign";

function load(): Record<string, MapPatch> {
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as Campaign).maps ?? {} : {};
  } catch {
    return {};
  }
}

const EMPTY = emptyPatch();

export function useCampaign() {
  const [maps, setMaps] = useState<Record<string, MapPatch>>(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ format: "new-world-atlas/campaign", version: 1, maps } satisfies Campaign));
    } catch {
      // Storage may be full or blocked; the campaign still lives for this session and can be saved as a file.
    }
  }, [maps]);
  // A stable empty patch, so maps without GM changes do not re-render on every pass.
  const patch = (key: string | null): MapPatch => (key && maps[key]) || EMPTY;
  const update = (key: string | null, change: (patch: MapPatch) => MapPatch) => {
    if (!key) return;
    setMaps((current) => ({ ...current, [key]: change(current[key] ?? emptyPatch()) }));
  };
  return {
    patch,
    update,
    file: (): Campaign => ({ format: "new-world-atlas/campaign", version: 1, maps }),
    replace: (campaign: Campaign) => setMaps(campaign.maps ?? {}),
  };
}

export type CampaignStore = ReturnType<typeof useCampaign>;
