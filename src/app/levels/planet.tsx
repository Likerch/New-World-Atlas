// The planet level: world settings, the world map and its inspector.
import { useEffect, useMemo, useRef, useState } from "react";
import { fromGeoJSON, REROLL_STAGES, parseRecipe, recipeText, generateUnderworld, underworldGhostSvg, sheetBox, editPlanet, mapKeyOf, pastPlanet, planetGeoJSON, eraTheme, emptyEdits, GLOBE_RADIUS, GLOBE_SIZE, globePick, LAYERS, planetParams, planetToJson, renamePlanet, renderGlobe, renderPlanet, TEMPLATES, THEMES, type LayerId, type Planet, type PlanetEdits, type PlanetParams, type Setting, settingOf, type ThemeId, planetLegend } from "../../core/index";
import { Inspector, type Selection, type Tab } from "../Inspector";
import { SettingPanel } from "../SettingPanel";
import { WorldForm, type ZoomRange } from "../WorldForm";
import { editAt, WorldEditor, type EditTool, type Paint } from "../WorldEditor";
import { planetActions } from "../planetActions";
import type { T } from "../i18n";
import { describePlanet, searchPlanet } from "../planetText";
import { growPlanet } from "../work";
import { Tables } from "../Tables";
import { hintOf } from "../i18n";
import { Section } from "../Section";
import { useLayers } from "./layers";
import type { Level, LevelContext } from "./types";
import { NumberInput } from "../NumberInput";

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
  { key: "growth", min: 0.3, max: 3, step: 0.1 },
  { key: "families", min: 0, max: 8, step: 1 },
];

/** Where a selection sits on the map, to ring it on the globe. */
function markOf(planet: Planet, selection: Selection | null): [number, number] | null {
  if (!selection) return null;
  if (selection.kind === "burg") return [planet.burgs[selection.id].x, planet.burgs[selection.id].y];
  if (selection.kind === "marker") return [planet.markers[selection.id].x, planet.markers[selection.id].y];
  if (selection.kind === "cell") return [planet.mesh.x[selection.id], planet.mesh.y[selection.id]];
  return null;
}

/** The selected thing's patch key and name, as the reader sees it (in the chosen script, a realm with its form of
 * rule); the world itself when nothing (or only a spot) is selected. */
export function selectedOf(planet: Planet | null, selection: Selection | null, t: T, nm: (name: string) => string): { key: string; label: string } | null {
  if (!planet) return null;
  if (!selection || selection.kind === "cell") return { key: "world", label: nm(planet.name) };
  const { kind, id } = selection;
  const lists = { state: planet.states, province: planet.provinces, culture: planet.cultures, religion: planet.religions, burg: planet.burgs, river: planet.rivers, marker: planet.markers, feature: planet.features } as const;
  const item = lists[kind as keyof typeof lists]?.[id];
  if (!item) return null;
  const label =
    kind === "state"
      ? id
        ? t(`form.${planet.states[id].formKey}`, { name: nm(item.name) })
        : t("form.wild")
      : kind === "province"
        ? t(`province.${planet.provinces[id].formKey}`, { name: nm(item.name) })
        : kind === "feature"
          ? `${t(`feature.${planet.features[id].kind}`)} ${nm(item.name)}`.trim()
          : kind === "marker"
            ? `${t(`marker.${planet.markers[id].kind}`)} ${nm(item.name)}`.trim()
            : nm(item.name) || kind;
  return { key: `${kind}:${id}`, label };
}

/** Ready sets of layers: what a political map, a physical map, a map for the players or a climate map shows. */
const PRESETS: Record<string, Partial<Record<LayerId, boolean>>> = {
  political: { depth: true, states: true, provinces: true, borders: true, routes: true, burgs: true, emblems: true, labels: true, frame: true },
  physical: { depth: true, biomes: true, heights: true, icons: true, rivers: true, ice: true, labels: true, landmasses: true, grid: true, frame: true },
  players: { depth: true, biomes: true, icons: true, rivers: true, ice: true, states: true, borders: true, routes: true, burgs: true, labels: true, markers: true, frame: true },
  climate: { depth: true, climate: true, rivers: true, ice: true, labels: true, frame: true },
  clean: { depth: true, biomes: true, rivers: true, borders: true, burgs: true, labels: true },
};

/** A picture as a heightmap: 200 × 125 brightness values, black the sea floor and white the highest peaks. */
async function heightsOf(file: File): Promise<NonNullable<PlanetEdits["image"]>> {
  const url = URL.createObjectURL(file);
  try {
    const picture = new Image();
    picture.src = url;
    await picture.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 125;
    const pen = canvas.getContext("2d")!;
    pen.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const pixels = pen.getImageData(0, 0, canvas.width, canvas.height).data;
    const heights: number[] = [];
    for (let k = 0; k < pixels.length; k += 4) heights.push(Math.round(((pixels[k] * 0.3 + pixels[k + 1] * 0.59 + pixels[k + 2] * 0.11) / 255) * 100));
    return { width: canvas.width, height: canvas.height, heights };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface PlanetLinks {
  openCity: (planet: Planet, burg: number) => void;
  openRegion?: (planet: Planet, province: number) => void;
  openLocal?: (planet: Planet, marker: number) => void;
  /** The local map of a spot of open land, and the underworld below a way down. */
  openHere?: (planet: Planet, cell: number) => void;
  descend?: (planet: Planet, marker: number) => void;
  openBuilding?: (planet: Planet, marker: number) => void;
  openCountry?: (planet: Planet, state: number) => void;
  openUnderworld?: (planet: Planet) => void;
  /** A close-up of a box the GM marked out on the map. */
  openArea?: (planet: Planet, box: [number, number, number, number], title?: string) => void;
  back: (() => void) | null;
}

export function usePlanetLevel(ctx: LevelContext, initialSeed: string | undefined, initialSetting: Partial<Setting> | undefined, { openCity, openRegion, openLocal, openCountry, openUnderworld, openArea, openHere, descend, openBuilding, back }: PlanetLinks): Level & { planet: Planet | null; load: (params: Partial<PlanetParams>) => void; theme: ThemeId; layers: Record<LayerId, boolean> } {
  const { t } = ctx;
  const [params, setParams] = useState<PlanetParams>(() => planetParams({ seed: initialSeed, setting: initialSetting }));
  const [raw, setPlanet] = useState<Planet | null>(null);
  const mapKey = raw ? mapKeyOf("planet", raw.params as unknown as Record<string, unknown>) : null;
  const names = ctx.names(mapKey);
  // The GM's edits: relief strokes regrow the whole world from the new ground; realms and towns are laid over it.
  const edits = ctx.patch(mapKey).edits ?? null;
  const terrainKey = JSON.stringify([edits?.terrain ?? [], edits?.image?.heights.length ?? 0, edits?.image?.heights[Math.floor((edits?.image?.heights.length ?? 0) / 2)] ?? 0]);
  // Relief strokes regrow the whole world: that runs like any generation, with the busy sign up and the old shape on
  // screen meanwhile; when strokes come faster than the world grows, only the last is grown.
  const [regrown, setRegrown] = useState<{ raw: Planet; key: string; planet: Planet } | null>(null);
  const latest = useRef("");
  useEffect(() => {
    latest.current = terrainKey;
    if (!raw || (!edits?.terrain.length && !edits?.image) || (regrown?.raw === raw && regrown.key === terrainKey)) return;
    const terrain = edits.terrain;
    const image = edits.image;
    ctx.task(
      (report) => growPlanet(raw.params, terrain, report, image),
      (made) => {
        if (latest.current === terrainKey) setRegrown({ raw, key: terrainKey, planet: made });
      },
    );
  }, [raw, terrainKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const shaped = !raw ? null : !edits?.terrain.length && !edits?.image ? raw : regrown?.raw === raw ? regrown.planet : null;
  const planet = useMemo(() => (shaped ? renamePlanet(editPlanet(shaped, edits), names) : null), [shaped, edits, names]);
  const [tool, setTool] = useState<EditTool | null>(null);
  const [brush, setBrush] = useState({ radius: 60, strength: 12 });
  const [paint, setPaint] = useState<Paint>({ realm: 1, people: 1, faith: 1, province: 1, zone: "custom" });
  // The first point of a ridge, a trench or a close-up's box.
  const [start, setStart] = useState<[number, number] | null>(null);
  const [season, setSeason] = useState<"year" | "summer" | "winter">("year");
  const [tables, setTables] = useState(false);
  const [moving, setMoving] = useState<number | null>(null);
  const [history, setHistory] = useState<PlanetEdits[]>([]);
  // Bumped with each new world, so the map view starts afresh.
  const [time, setTime] = useState(0);
  // The map of a past year of the world's history, when the GM looks back.
  const [past, setPast] = useState<number | null>(null);
  const [theme, setTheme] = useState<ThemeId>(() => (initialSetting ? eraTheme(settingOf(initialSetting)) : "atlas"));
  const { layers, restyle, toggle, setAll } = useLayers(initialSetting ? eraTheme(settingOf(initialSetting)) : "atlas");
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

  // Worlds grow in a worker: the page stays alive, shows the stage and can stop a long history.
  const load = (next: Partial<PlanetParams>) => {
    pending.current = true;
    ctx.task(
      (report) => growPlanet({ ...params, ...next }, undefined, report),
      (made) => {
        pending.current = false;
        setTime((count) => count + 1);
        setPlanet(made);
        setParams(made.params);
        setSelection(null);
        setHistory([]);
        setMoving(null);
        setPast(null);
      },
    );
  };
  const set = <K extends keyof PlanetParams>(key: K, value: PlanetParams[K]) => setParams((current) => ({ ...current, [key]: value }));
  // The knobs were turned since the world on the map was grown.
  const changed = raw ? (Object.keys({ ...params, ...raw.params }) as (keyof PlanetParams)[]).some((key) => JSON.stringify(params[key]) !== JSON.stringify(raw.params[key])) : false;
  const highlight = selection && (selection.kind === "state" || selection.kind === "province" || selection.kind === "culture" || selection.kind === "religion") ? { kind: selection.kind, id: selection.id } : null;
  const ghost = useMemo(() => (planet && layers.underground ? underworldGhostSvg(generateUnderworld(planet)) : undefined), [planet, layers.underground]);
  const svg = useMemo(() => (!planet ? "" : globe ? renderGlobe(planet, { theme, layers, script: ctx.script, ...globe, mark: markOf(planet, selection), unknown, quick: turning }) : past !== null && planet.history ? renderPlanet(pastPlanet(planet, past), { theme, layers: { ...layers, provinces: false, routes: false, religions: false, emblems: false, military: false }, script: ctx.script, words: ctx.words }) : renderPlanet(planet, { theme, layers, script: ctx.script, highlight, words: ctx.words, ghost, ...(season !== "year" ? { season } : {}) })), [planet, theme, layers, ctx.script, highlight?.kind, highlight?.id, globe, globe && selection, unknown, turning, t, past, season, ctx.words, ghost]); // eslint-disable-line react-hooks/exhaustive-deps
  const legend = useMemo(() => (planet ? planetLegend(planet, { theme, layers }) : undefined), [planet, theme, layers]);
  const actions = useMemo(
    () =>
      planet
        ? planetActions(planet, t, ctx.nm, {
            city: (burg) => openCity(planet, burg),
            local: openLocal && ((marker) => openLocal(planet, marker)),
            region: openRegion && ((province) => openRegion(planet, province)),
            country: openCountry && ((state) => openCountry(planet, state)),
            here: openHere && ((cell) => openHere(planet, cell)),
            sheet: openArea && ((cell) => openArea(planet, sheetBox(planet, planet.mesh.x[cell], planet.mesh.y[cell]), t("region.sheet"))),
            descend: descend && ((marker) => descend(planet, marker)),
            building: openBuilding && ((marker) => openBuilding(planet, marker)),
          })
        : null,
    [planet, t], // eslint-disable-line react-hooks/exhaustive-deps
  );
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
    const at: [number, number] = [Math.round(x), Math.round(y)];
    if (tool === "raise" || tool === "lower") change((current) => ({ ...current, terrain: [...current.terrain, [...at, brush.radius, tool === "raise" ? brush.strength : -brush.strength]] }));
    else if (tool === "smooth") change((current) => ({ ...current, terrain: [...current.terrain, [...at, brush.radius, 0, 1]] }));
    else if (tool === "flatten") change((current) => ({ ...current, terrain: [...current.terrain, [...at, brush.radius, Math.round(planet.height[mesh.find(x, y)]), 2]] }));
    else if (tool === "sink") change((current) => ({ ...current, terrain: [...current.terrain, [...at, brush.radius, 12, 2]] }));
    else if (tool === "ridge" || tool === "trench" || tool === "area") {
      if (!start) return setStart(at);
      const [x0, y0] = start;
      setStart(null);
      if (tool === "area") return openArea?.(planet, [x0, y0, ...at]);
      change((current) => ({ ...current, terrain: [...current.terrain, [x0, y0, brush.radius, tool === "ridge" ? brush.strength : -brush.strength, 3, ...at]] }));
    } else editAt(planet, edits, tool, x, y, { radius: brush.radius, paint, moving, setMoving, change, t });
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
    selected: selectedOf(planet, selection, t, ctx.nm),
    search: (query) =>
      planet
        ? searchPlanet(planet, query, t, ctx.nm, (next, at) => {
            setSelection(next);
            setTab("place");
            ctx.focus(at[0], at[1]);
          })
        : [],
    describe: () => (planet ? describePlanet(planet, selection, t, ctx.nm) : ""),
    theme,
    layers,
    anchor: globe ? undefined : actions?.anchor,
    map: planet
      ? {
          ...(actions && !globe ? { hover: actions.hover, measure: actions.measure, ...(tool ? {} : { open: actions.open, menu: actions.menu }) } : {}),
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
        {raw && changed ? (
          <p className="notice">
            {t("params.changed")}{" "}
            <button type="button" className="primary" onClick={() => load({})}>
              {t("action.generate")}
            </button>
          </p>
        ) : null}
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
              restyle(style);
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
        <Section id="planet-age" title={t("panel.age")}>
          {planet?.history ? (
            <>
              <p className="muted">{t("history.now", { year: planet.history.years })}</p>
              <div className="row-buttons">
                {[25, 100].map((more) => (
                  <button key={more} type="button" onClick={() => load({ history: planet.history!.years + more })} title={t("history.laterHint")}>
                    {t("history.later", { years: more })}
                  </button>
                ))}
              </div>
              <label className="check">
                <input type="checkbox" checked={past !== null} onChange={(event) => setPast(event.target.checked ? Math.max(1, Math.round(planet.history!.years / 2)) : null)} />
                {t("history.pastMap")}
              </label>
              {past !== null ? (
                <label>
                  {t("history.inYear", { year: past })}
                  <input type="range" min={1} max={planet.history.years} step={1} value={past} onChange={(event) => setPast(Number(event.target.value))} />
                </label>
              ) : null}
            </>
          ) : planet && !planet.params.lifeless ? (
            <>
              <p className="muted">{t("history.none")}</p>
              <button type="button" className="wide" onClick={() => load({ history: 300 })}>
                📜 {t("history.live", { years: 300 })}
              </button>
            </>
          ) : null}
          <SettingPanel
            t={t}
            value={params.setting}
            onApply={(setting) => {
              // A new age brings the style that suits it; the GM can still pick another.
              const next = eraTheme(setting);
              setTheme(next);
              restyle(next);
              load({ setting });
            }}
          />
        </Section>
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
            paint={paint}
            setPaint={setPaint}
            moving={moving}
            started={start !== null}
            selection={selection}
            change={change}
            onImage={async (file) => {
              const image = await heightsOf(file);
              change((current) => ({ ...current, image }));
            }}
            onGeo={async (file) => {
              let read: ReturnType<typeof fromGeoJSON> = null;
              try {
                read = fromGeoJSON(JSON.parse(await file.text()), planet.params, edits?.image?.box);
              } catch {
                read = null;
              }
              if (!read) return alert(t("editor.geoNothing"));
              const { image, labels } = read;
              change((current) => ({ ...current, ...(image ? { image } : {}), labels: [...(current.labels ?? []), ...labels] }));
            }}
            canUndo={history.length > 0}
            onUndo={() => {
              const last = history[history.length - 1];
              setHistory((past) => past.slice(0, -1));
              ctx.update(mapKey, (patch) => ({ ...patch, edits: last }));
            }}
            onReset={() => change(() => emptyEdits())}
          />
        ) : null}
        <Section id="planet-generation" title={t("panel.world")}>
        <label>
          {t("field.theme")}
          <select
            value={theme}
            onChange={(event) => {
              const next = event.target.value as ThemeId;
              setTheme(next);
              restyle(next);
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
                {count.toLocaleString(t.locale)}
              </option>
            ))}
          </select>
        </label>
        {NUMBER_FIELDS.map(({ key, min, max, step }) => (
          <label key={key} title={hintOf(t, key)}>
            {t(`field.${key}`)}
            <NumberInput min={min} max={max} step={step} value={(params[key] as number | undefined) ?? 0} onChange={(value) => set(key, value as never)} />
          </label>
        ))}
        {raw ? (
          <>
            <h4 className="muted" title={t("reroll.hint")}>
              🎲 {t("reroll.title")}
            </h4>
            <div className="row-buttons">
              {REROLL_STAGES.map((stage) => (
                <button key={stage} type="button" title={t(`reroll.${stage}.hint`)} onClick={() => load({ reroll: { ...params.reroll, [stage]: (params.reroll?.[stage] ?? 0) + 1 } })}>
                  {t(`reroll.${stage}`)}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <details className="recipe">
          <summary>{t("relief.title")}</summary>
          <label className="check">
            <input type="checkbox" checked={params.land !== undefined} onChange={(event) => set("land", event.target.checked ? 0.35 : undefined)} />
            {t("field.land")}
          </label>
          {params.land !== undefined ? (
            <label>
              {Math.round(params.land * 100)}%
              <input type="range" min={5} max={95} value={Math.round(params.land * 100)} onChange={(event) => set("land", Number(event.target.value) / 100)} />
            </label>
          ) : null}
          <label>
            {t("relief.recipe")}
            <textarea rows={8} spellCheck={false} placeholder={t("relief.hint")} value={params.recipe ?? ""} onChange={(event) => set("recipe", event.target.value || undefined)} />
          </label>
          {params.recipe && parseRecipe(params.recipe).errors.length ? <p className="muted">{t("relief.errors", { lines: parseRecipe(params.recipe).errors.join(", ") })}</p> : null}
          <div className="row-buttons">
            <button type="button" onClick={() => set("recipe", recipeText(params.template))}>
              {t("relief.fromTemplate")}
            </button>
            <button type="button" className="primary" onClick={() => load({})}>
              {t("relief.grow")}
            </button>
          </div>
        </details>
        </Section>
        <Section id="planet-view" title={t("panel.layers")}>
        <div className="row-buttons">
          {Object.keys(PRESETS).map((name) => (
            <button key={name} type="button" onClick={() => setAll({ ...Object.fromEntries(LAYERS.map((id) => [id, false])), ...PRESETS[name] } as Record<LayerId, boolean>)}>
              {t(`preset.${name}`)}
            </button>
          ))}
          {planet ? (
            <button type="button" onClick={() => setTables(true)}>
              📊 {t("table.title")}
            </button>
          ) : null}
        </div>
        {tables && planet ? <Tables t={t} nm={ctx.nm} planet={planet} onClose={() => setTables(false)} /> : null}
        {layers.temperature ? (
          <label>
            {t("season.title")}
            <select value={season} onChange={(event) => setSeason(event.target.value as typeof season)}>
              {(["year", "summer", "winter"] as const).map((name) => (
                <option key={name} value={name}>
                  {t(`season.${name}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {LAYERS.filter((id) => id !== "landuse" && id !== "fiefs").map((id) => (
          <label key={id} className="check">
            <input type="checkbox" checked={layers[id]} onChange={(event) => toggle(id, event.target.checked)} />
            {t(`layer.${id}`)}
          </label>
        ))}
        </Section>
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
        onOpenHere={openHere ? (cell) => openHere(planet, cell) : undefined}
        onDescend={descend ? (marker) => descend(planet, marker) : undefined}
        onOpenBuilding={openBuilding ? (marker) => openBuilding(planet, marker) : undefined}
        onOpenCountry={openCountry ? (state) => openCountry(planet, state) : undefined}
        onOpenSheet={openArea ? (cell) => openArea(planet, sheetBox(planet, planet.mesh.x[cell], planet.mesh.y[cell]), t("region.sheet")) : undefined}
        onSelect={(next, at) => {
          setSelection(next);
          if (at) ctx.focus(at[0], at[1]);
        }}
      />
    ) : null,
    status: planet ? (past !== null ? t("history.pastStatus", { year: past }) : t("stats.summary", { states: planet.states.length - 1, burgs: planet.burgs.filter((burg) => burg.id && !burg.removed).length, rivers: planet.rivers.length - 1 })) : "",
    data: () => (planet ? planetToJson(planet) : null),
    exports: planet ? [{ label: t("action.exportGeoJson"), file: "geojson", make: () => new Blob([JSON.stringify(planetGeoJSON(planet))], { type: "application/geo+json" }) }] : [],
  };
}
