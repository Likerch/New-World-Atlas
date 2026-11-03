// The game master's patches for the maps of the open world: names, notes, pins, fog and planet edits. They live in the
// world and are saved with it; the GM panel can still save and load them alone as a campaign file.
import { emptyPatch, nameUp, type Campaign, type MapPatch, type WorldDoc } from "../core/index";

export interface CampaignStore {
  patch: (key: string | null) => MapPatch;
  update: (key: string | null, change: (patch: MapPatch) => MapPatch) => void;
  file: () => Campaign;
  replace: (campaign: Campaign) => void;
}

// A stable empty patch, so maps without GM changes do not re-render on every pass.
const EMPTY = emptyPatch();

export function worldStore(world: WorldDoc, update: (change: (world: WorldDoc) => WorldDoc) => void): CampaignStore {
  return {
    patch: (key) => (key && world.patches[key]) || EMPTY,
    update: (key, change) => {
      if (!key) return;
      update((current) => {
        const before = current.patches[key];
        const next = { ...current, patches: { ...current.patches, [key]: change(before ?? emptyPatch()) }, updated: Date.now() };
        return nameUp(next, key, before);
      });
    },
    file: () => ({ format: "new-world-atlas/campaign", version: 1, maps: world.patches }),
    replace: (campaign) => update((current) => ({ ...current, patches: campaign.maps ?? {}, updated: Date.now() })),
  };
}
