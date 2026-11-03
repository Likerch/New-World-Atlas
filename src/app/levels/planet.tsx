// The planet level: world settings, the world map and its inspector.
import { useMemo, useRef, useState } from "react";
import { createRng, defaultLayers, editPlanet, mapKeyOf, eraTheme, emptyEdits, foundedSize, generatePlanet, GLOBE_RADIUS, GLOBE_SIZE, globePick, LAYERS, name, planetParams, planetToJson, renamePlanet, renderGlobe, renderPlanet, TEMPLATES, THEMES, type LayerId, type Planet, type PlanetEdits, type PlanetParams, type Setting, settingOf, type ThemeId, planetLegend } from "../../core/index";
import { Inspector, type Selection, type Tab } from "../Inspector";
import { SettingPanel } from "../SettingPanel";
import { WorldForm, type ZoomRange } from "../WorldForm";
import { WorldEditor, type EditTool } from "../WorldEditor";
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

/** Where a selection sits on the map, to ring it on the globe. */
function markOf(planet: Planet, selection: Selection | null): [number, number] | null {
  if (!selection) return null;
  if (selection.kind === "burg") return [planet.burgs[selection.id].x, planet.burgs[selection.id].y];
  if (selection.kind === "marker") return [planet.markers[selection.id].x, planet.markers[selection.id].y];
  if (selection.kind === "cell") return [planet.mesh.x[selection.id], planet.mesh.y[selection.id]];
  return null;
}

/** The selected thing's patch key and name; the world itself when nothing (or only a spot) is selected. */
export function selectedOf(planet: Planet | null, selection: Selection | null): { key: string; label: string } | null {
  if (!planet) return null;
  if (!selection || selection.kind === "cell") return { key: "world", label: planet.name };
  const lists = { state: planet.states, province: planet.provinces, culture: planet.cultures, religion: planet.religions, burg: planet.burgs, river: planet.rivers, marker: planet.markers } as const;
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

export function usePlanetLevel(ctx: LevelContext, initialSeed: string | undefined, initialSetting: Partial<Setting> | undefined, { openCity, openRegion, openLocal, openCountry, openUnderworld, back }: PlanetLinks): Level & { planet: Planet | null; load: (params: Partial<PlanetParams>) => void } {
  const { t } = ctx;
  const [params, setParams] = useState<PlanetParams>(() => planetParams({ seed: initialSeed, setting: initialSetting }));
  const [raw, setPlanet] = useState<Planet | null>(null);
  const mapKey = raw ? mapKeyOf("planet", raw.params as unknown as Record<string, unknown>) : null;
  const names = ctx.names(mapKey);
  // The GM's edits: relief strokes regrow the whole world from the new ground; realms and towns are laid over it.
  const edits = ctx.patch(mapKey).edits ?? null;
  const terrainKey = JSON.stringify(edits?.terrain ?? []);
  const shaped = useMemo(() => (raw && edits?.terrain.length ? generatePlanet(raw.params, edits.terrain) : raw), [raw, terrainKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const planet = useMemo(() => (shaped ? renamePlanet(editPlanet(shaped, edits), names) : null), [shaped, edits, names]);
  const [tool, setTool] = useState<EditTool | null>(null);
  const [brush, setBrush] = useState({ radius: 60, strength: 12 });
  const [realm, setRealm] = useState(1);
  const [moving, setMoving] = useState<number | null>(null);
  const [history, setHistory] = useState<PlanetEdits[]>([]);
  const [time, setTime] = useState(0);
  const [theme, setTheme] = useState<ThemeId>(() => (initialSetting ? eraTheme(settingOf(initialSetting)) : "atlas"));
  const [layers, setLayers] = useState<Record<LayerId, boolean>>(() => defaultLayers(initialSetting ? eraTheme(settingOf(initialSetting)) : "atlas"));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<Tab>("place");
  // The globe view: where it is turned to, or null for the flat map.
  const [globe, setGlobe] = useState<{ lon: number; lat: number } | null>(null);
  const [unknown, setUnknown] = useState(true);
  // The new-world form, and how far the world map may be zoomed out and in (kept in this browser).
  const [form, setForm] = useState(false);
  const [zoom, setZoom] = useState<ZoomRange>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("atlas.zoom") ?? "null");
      return Array.isArray(saved) && saved.length === 2 ? (saved as ZoomRange) : [0.8, 40];
    } catch {
      return [0.8, 40];
    }
  });
  // Dragging turns the globe: moves gather into one turn per frame, drawn roughly until the mouse lets go.
  const [turning, setTurning] = useState(false);
  const spin = useRef({ dx: 0, dy: 0, frame: 0 });
  const turn = (dx: number, dy: number) => {
    const s = spin.current;
    s.dx += dx;
    s.dy += dy;
    setTurning(true);
    if (s.frame) return;
    s.frame = requestAnimationFrame(() => {
      const degrees = 180 / (Math.PI * GLOBE_RADIUS);
      const { dx: x, dy: y } = s;
      s.dx = s.dy = s.frame = 0;
      setGlobe((g) => g && { lon: ((((g.lon - x * degrees + 180) % 360) + 360) % 360) - 180, lat: Math.max(-90, Math.min(90, g.lat + y * degrees)) });
    });
  };
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
      setHistory([]);
      setMoving(null);
    });
  };
  const set = <K extends keyof PlanetParams>(key: K, value: PlanetParams[K]) => setParams((current) => ({ ...current, [key]: value }));
  const highlight = selection && (selection.kind === "state" || selection.kind === "province" || selection.kind === "culture" || selection.kind === "religion") ? { kind: selection.kind, id: selection.id } : null;
  const svg = useMemo(() => (!planet ? "" : globe ? renderGlobe(planet, { theme, layers, script: ctx.script, ...globe, mark: markOf(planet, selection), unknown, quick: turning }) : renderPlanet(planet, { theme, layers, script: ctx.script, highlight })), [planet, theme, layers, ctx.script, highlight?.kind, highlight?.id, globe, globe && selection, unknown, turning]); // eslint-disable-line react-hooks/exhaustive-deps
  const legend = useMemo(() => (planet ? planetLegend(planet, { theme, layers }) : undefined), [planet, theme, layers]);
  const pick = (x: number, y: number) => {
    if (!planet) return;
    const cell = planet.mesh.find(x, y);
    const marker = planet.markers.slice(1).find((item) => Math.hypot(item.x - x, item.y - y) < planet.mesh.spacing * 0.3);
    const burg = planet.burg[cell];
    setSelection(marker ? { kind: "marker", id: marker.id } : burg && Math.hypot(planet.burgs[burg].x - x, planet.burgs[burg].y - y) < planet.mesh.spacing * 0.4 ? { kind: "burg", id: burg } : { kind: "cell", id: cell });
    setTab("place");
  };
  const change = (next: (current: PlanetEdits) => PlanetEdits) => {
    setHistory((past) => [...past.slice(-40), edits ?? emptyEdits()]);
    ctx.update(mapKey, (patch) => ({ ...patch, edits: next(patch.edits ?? emptyEdits()) }));
  };
  /** What a click does with an editor tool in hand. */
  const sculpt = (x: number, y: number) => {
    if (!planet || !tool) return;
    const { mesh } = planet;
    const town = () => {
      let best = 0;
      for (const burg of planet.burgs.slice(1)) if (!burg.removed && Math.hypot(burg.x - x, burg.y - y) < mesh.spacing * 0.8 && (!best || Math.hypot(burg.x - x, burg.y - y) < Math.hypot(planet.burgs[best].x - x, planet.burgs[best].y - y))) best = burg.id;
      return best;
    };
    const at: [number, number] = [Math.round(x), Math.round(y)];
    if (tool === "raise" || tool === "lower") change((current) => ({ ...current, terrain: [...current.terrain, [...at, brush.radius, tool === "raise" ? brush.strength : -brush.strength]] }));
    else if (tool === "paint") {
      const owners: Record<number, number> = {};
      for (let cell = 0; cell < mesh.cells; cell++) if (!planet.water[cell] && Math.hypot(mesh.x[cell] - x, mesh.y[cell] - y) < brush.radius) owners[cell] = realm;
      change((current) => ({ ...current, owners: { ...current.owners, ...owners } }));
    } else if (tool === "move") {
      if (moving === null) setMoving(town() || null);
      else {
        const id = moving;
        change((current) => ({ ...current, moved: { ...current.moved, [id]: at } }));
        setMoving(null);
      }
    } else if (tool === "add") {
      const cell = mesh.find(x, y);
      if (planet.water[cell]) return;
      const people = planet.cultures[planet.culture[cell]] ?? planet.cultures[0];
      const founded = name({ ...people.language }, createRng(`${planet.params.seed}/founded-${edits?.added.length ?? 0}`), "town");
      change((current) => ({ ...current, added: [...current.added, [...at, founded, foundedSize(planet, cell)]] }));
    } else {
      const id = town();
      if (id && !planet.burgs[id].capital) change((current) => ({ ...current, removed: [...current.removed, id] }));
    }
  };

  return {
    id: "planet",
    icon: "🌍",
    title: planet?.name ?? null,
    seed: params.seed,
    setSeed: (seed) => set("seed", seed),
    // A new seed is a new world: it takes a name from its own people, not the last world's.
    generate: (seed) => load(seed ? { seed, name: "" } : {}),
    ensure: () => {
      // Only when nothing is on its way: a world opened from a star system must not be replaced.
      if (!planet && !pending.current) load({});
    },
    planet,
    load,
    legend,
    worldKey: mapKey,
    params: raw ? (raw.params as unknown as Record<string, unknown>) : null,
    restore: (saved) => load({ name: undefined, world: undefined, setting: undefined, ...(saved as Partial<PlanetParams>) }),
    mapKey,
    // Pins and fog are laid on the flat map; the globe shows the world without them, its names and notes still at hand.
    sheetKey: globe ? null : mapKey,
    selected: selectedOf(planet, selection),
    map: planet
      ? {
          svg,
          width: globe ? GLOBE_SIZE : planet.params.width,
          height: globe ? GLOBE_SIZE : planet.params.height,
          key: `planet-${planet.params.seed}-${time}-${globe ? "globe" : "map"}-${zoom.join(":")}`,
          zoomRange: zoom,
          onPick: (x, y) => {
            if (!globe) return tool ? sculpt(x, y) : pick(x, y);
            const point = globePick(planet, x, y, globe);
            if (point) pick(point[0], point[1]);
          },
          ...(globe ? { onDrag: turn, onDragEnd: () => setTurning(false) } : {}),
        }
      : null,
    controls: (
      <>
        {back ? (
          <button type="button" className="back" onClick={back}>
            ← {t("action.backToSystem")}
          </button>
        ) : null}
        <button type="button" className="primary wide" onClick={() => setForm(true)}>
          🌍 {t("world.planetForm")}
        </button>
        {form ? (
          <WorldForm
            t={t}
            initial={{ ...params, name: params.name ?? "" }}
            zoom={zoom}
            onClose={() => setForm(false)}
            onCreate={(next, range) => {
              setForm(false);
              setZoom(range);
              try {
                localStorage.setItem("atlas.zoom", JSON.stringify(range));
              } catch {
                // Storage may be off; the range holds for this visit.
              }
              const style = eraTheme(settingOf(next.setting));
              setTheme(style);
              setLayers(defaultLayers(style));
              setGlobe(null);
              load(next);
            }}
          />
        ) : null}
        {planet && openUnderworld ? (
          <button type="button" className="wide" onClick={() => openUnderworld(planet)}>
            🕳 {t("action.openUnderworld")}
          </button>
        ) : null}
        {planet ? (
          <div className="floor-tabs">
            <button type="button" aria-pressed={!globe} onClick={() => setGlobe(null)}>
              🗺 {t("view.flat")}
            </button>
            <button type="button" aria-pressed={!!globe} onClick={() => setGlobe({ lon: 0, lat: Math.round((planet.params.latitudeNorth + planet.params.latitudeSouth) / 2) })}>
              🌐 {t("view.globe")}
            </button>
          </div>
        ) : null}
        {globe ? (
          <>
            <p className="muted">{t("globe.drag")}</p>
            <label>
              {t("globe.lon")}: {Math.round(globe.lon)}°
              <input type="range" min={-180} max={180} step={1} value={Math.round(globe.lon)} onChange={(event) => setGlobe({ ...globe, lon: Number(event.target.value) })} />
            </label>
            <label>
              {t("globe.lat")}: {Math.round(globe.lat)}°
              <input type="range" min={-90} max={90} step={1} value={Math.round(globe.lat)} onChange={(event) => setGlobe({ ...globe, lat: Number(event.target.value) })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={unknown} onChange={(event) => setUnknown(event.target.checked)} />
              {t("globe.unknown")}
            </label>
          </>
        ) : null}
        <SettingPanel
          t={t}
          value={params.setting}
          onApply={(setting) => {
            // A new age brings the style that suits it; the GM can still pick another.
            const next = eraTheme(setting);
            setTheme(next);
            setLayers(defaultLayers(next));
            load({ setting });
          }}
        />
        {planet && !globe ? (
          <WorldEditor
            t={t}
            nm={ctx.nm}
            planet={planet}
            edits={edits}
            tool={tool}
            setTool={(next) => {
              setTool(next);
              setMoving(null);
            }}
            brush={brush}
            setBrush={setBrush}
            realm={realm}
            setRealm={setRealm}
            moving={moving}
            canUndo={history.length > 0}
            onUndo={() => {
              const last = history[history.length - 1];
              setHistory((past) => past.slice(0, -1));
              ctx.update(mapKey, (patch) => ({ ...patch, edits: last }));
            }}
            onReset={() => change(() => emptyEdits())}
          />
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
