// The planet level: world settings, the world map and its inspector.
import { useMemo, useRef, useState } from "react";
import { defaultLayers, generatePlanet, LAYERS, planetParams, planetToJson, renamePlanet, renderPlanet, TEMPLATES, THEMES, type LayerId, type Planet, type PlanetParams, type ThemeId } from "../../core/index";
import { Inspector, type Selection, type Tab } from "../Inspector";
import type { Level, LevelContext } from "./types";

const NUMBER_FIELDS: { key: keyof PlanetParams; min: number; max: number; step: number }[] = [
  { key: "latitudeNorth", min: -90, max: 90, step: 1 },
  { key: "latitudeSouth", min: -90, max: 90, step: 1 },
  { key: "temperatureEquator", min: -20, max: 50, step: 1 },
  { key: "temperaturePole", min: -60, max: 20, step: 1 },
  { key: "precipitation", min: 0.1, max: 3, step: 0.1 },
  { key: "peakHeight", min: 500, max: 12000, step: 100 },
  { key: "cultures", min: 1, max: 40, step: 1 },
  { key: "states", min: 1, max: 60, step: 1 },
  { key: "towns", min: 0, max: 2000, step: 10 },
  { key: "provinceShare", min: 0, max: 1, step: 0.05 },
];

/** The selected thing's patch key and name; the world itself when nothing (or only a spot) is selected. */
export function selectedOf(planet: Planet | null, selection: Selection | null): { key: string; label: string } | null {
  if (!planet) return null;
  if (!selection || selection.kind === "cell") return { key: "world", label: planet.name };
  const lists = { state: planet.states, province: planet.provinces, culture: planet.cultures, burg: planet.burgs, river: planet.rivers, marker: planet.markers } as const;
  const item = lists[selection.kind as keyof typeof lists]?.[selection.id];
  return item ? { key: `${selection.kind}:${selection.id}`, label: item.name || selection.kind } : null;
}

export interface PlanetLinks {
  openCity: (planet: Planet, burg: number) => void;
  openRegion?: (planet: Planet, province: number) => void;
  openLocal?: (planet: Planet, marker: number) => void;
  openCountry?: (planet: Planet, state: number) => void;
  openUnderworld?: (planet: Planet) => void;
  back: (() => void) | null;
}

export function usePlanetLevel(ctx: LevelContext, initialSeed: string | undefined, { openCity, openRegion, openLocal, openCountry, openUnderworld, back }: PlanetLinks): Level & { planet: Planet | null; load: (params: Partial<PlanetParams>) => void } {
  const { t } = ctx;
  const [params, setParams] = useState<PlanetParams>(() => planetParams({ seed: initialSeed }));
  const [raw, setPlanet] = useState<Planet | null>(null);
  const mapKey = raw ? `planet:${raw.params.seed}` : null;
  const names = ctx.names(mapKey);
  const planet = useMemo(() => (raw ? renamePlanet(raw, names) : null), [raw, names]);
  const [time, setTime] = useState(0);
  const [theme, setTheme] = useState<ThemeId>("atlas");
  const [layers, setLayers] = useState<Record<LayerId, boolean>>(defaultLayers("atlas"));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<Tab>("place");
  const pending = useRef(false);

  const load = (next: Partial<PlanetParams>) => {
    pending.current = true;
    ctx.run(() => {
      pending.current = false;
      const started = performance.now();
      const made = generatePlanet({ ...params, ...next });
      setTime(Math.round(performance.now() - started));
      setPlanet(made);
      setParams(made.params);
      setSelection(null);
    });
  };
  const set = <K extends keyof PlanetParams>(key: K, value: PlanetParams[K]) => setParams((current) => ({ ...current, [key]: value }));
  const highlight = selection && (selection.kind === "state" || selection.kind === "province" || selection.kind === "culture") ? { kind: selection.kind, id: selection.id } : null;
  const svg = useMemo(() => (planet ? renderPlanet(planet, { theme, layers, script: ctx.script, highlight }) : ""), [planet, theme, layers, ctx.script, highlight?.kind, highlight?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    id: "planet",
    icon: "🌍",
    title: planet?.name ?? null,
    seed: params.seed,
    setSeed: (seed) => set("seed", seed),
    generate: (seed) => load(seed ? { seed } : {}),
    ensure: () => {
      // Only when nothing is on its way: a world opened from a star system must not be replaced.
      if (!planet && !pending.current) load({});
    },
    planet,
    load,
    mapKey,
    selected: selectedOf(planet, selection),
    map: planet
      ? {
          svg,
          width: planet.params.width,
          height: planet.params.height,
          key: `planet-${planet.params.seed}-${time}`,
          onPick: (x, y) => {
            const cell = planet.mesh.find(x, y);
            const marker = planet.markers.slice(1).find((item) => Math.hypot(item.x - x, item.y - y) < planet.mesh.spacing * 0.3);
            const burg = planet.burg[cell];
            setSelection(marker ? { kind: "marker", id: marker.id } : burg && Math.hypot(planet.burgs[burg].x - x, planet.burgs[burg].y - y) < planet.mesh.spacing * 0.4 ? { kind: "burg", id: burg } : { kind: "cell", id: cell });
            setTab("place");
          },
        }
      : null,
    controls: (
      <>
        {back ? (
          <button type="button" className="back" onClick={back}>
            ← {t("action.backToSystem")}
          </button>
        ) : null}
        {planet && openUnderworld ? (
          <button type="button" className="wide" onClick={() => openUnderworld(planet)}>
            🕳 {t("action.openUnderworld")}
          </button>
        ) : null}
        <h2>{t("panel.world")}</h2>
        <label>
          {t("field.theme")}
          <select
            value={theme}
            onChange={(event) => {
              const next = event.target.value as ThemeId;
              setTheme(next);
              setLayers(defaultLayers(next));
            }}
          >
            {THEMES.map((id) => (
              <option key={id} value={id}>
                {t(`theme.${id}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("field.template")}
          <select value={params.template} onChange={(event) => set("template", event.target.value as PlanetParams["template"])}>
            {TEMPLATES.map((id) => (
              <option key={id} value={id}>
                {t(`template.${id}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("field.cells")}
          <select value={params.cells} onChange={(event) => set("cells", Number(event.target.value))}>
            {[3000, 5000, 10000, 20000, 30000, 50000].map((count) => (
              <option key={count} value={count}>
                {count.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        {NUMBER_FIELDS.map(({ key, min, max, step }) => (
          <label key={key}>
            {t(`field.${key}`)}
            <input type="number" min={min} max={max} step={step} value={params[key] as number} onChange={(event) => set(key, Number(event.target.value) as never)} />
          </label>
        ))}
        <h2>{t("panel.layers")}</h2>
        {LAYERS.map((id) => (
          <label key={id} className="check">
            <input type="checkbox" checked={layers[id]} onChange={(event) => setLayers({ ...layers, [id]: event.target.checked })} />
            {t(`layer.${id}`)}
          </label>
        ))}
      </>
    ),
    inspector: planet ? (
      <Inspector
        planet={planet}
        t={t}
        nm={ctx.nm}
        selection={selection}
        tab={tab}
        setTab={setTab}
        onOpenCity={(burg) => openCity(planet, burg)}
        onOpenRegion={openRegion ? (province) => openRegion(planet, province) : undefined}
        onOpenLocal={openLocal ? (marker) => openLocal(planet, marker) : undefined}
        onOpenCountry={openCountry ? (state) => openCountry(planet, state) : undefined}
        onSelect={(next, at) => {
          setSelection(next);
          if (at) ctx.focus(at[0], at[1]);
        }}
      />
    ) : null,
    status: planet ? t("stats.summary", { states: planet.states.length - 1, burgs: planet.burgs.length - 1, rivers: planet.rivers.length - 1, time }) : "",
    data: () => (planet ? planetToJson(planet) : null),
  };
}
