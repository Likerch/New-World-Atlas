// Map layers follow the style until the GM switches one: a new style or age then keeps the GM's own choices.
import { useState } from "react";
import { defaultLayers, type LayerId, type ThemeId } from "../../core/index";

export function useLayers(style: ThemeId, extra: Partial<Record<LayerId, boolean>> = {}) {
  const [own, setOwn] = useState<Partial<Record<LayerId, boolean>>>({});
  const [layers, setLayers] = useState<Record<LayerId, boolean>>(() => ({ ...defaultLayers(style), ...extra }));
  return {
    layers,
    restyle: (next: ThemeId) => setLayers({ ...defaultLayers(next), ...extra, ...own }),
    /** A whole set of layers at once, kept as the GM's own choice. */
    setAll: (next: Record<LayerId, boolean>) => {
      setLayers(next);
      setOwn(next);
    },
    toggle: (id: LayerId, on: boolean) => {
      setLayers((current) => ({ ...current, [id]: on }));
      setOwn((current) => ({ ...current, [id]: on }));
    },
  };
}
