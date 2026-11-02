// New World Atlas: the game master's map table. Settings on the left, the map in the middle, the inspector on the
// right; the planet and any of its towns (or a standalone city) are views of the same table.
import { useEffect, useMemo, useState } from "react";
import {
  cityFromBurg,
  cityParams,
  CITY_LAYERS,
  createLanguage,
  createRng,
  defaultCityTheme,
  defaultLayers,
  generateCity,
  generatePlanet,
  LAYERS,
  planetParams,
  planetToJson,
  pointInPolygon,
  randomSeed,
  renderCity,
  renderPlanet,
  TEMPLATES,
  THEMES,
  toCyrillic,
  type City,
  type CityLayerId,
  type CityParams,
  type CityThemeId,
  type Language,
  type LayerId,
  type Planet,
  type PlanetParams,
  type ThemeId,
} from "../core/index";
import { CityControls, CityInspector, type CitySelection } from "./CityPanels";
import { translator, type Locale } from "./i18n";
import { Inspector, type Selection, type Tab } from "./Inspector";
import { MapView, type Focus } from "./MapView";

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("render failed"));
    image.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
}

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

type View = "planet" | "city";
const allOn = (ids: readonly CityLayerId[]) => Object.fromEntries(ids.map((id) => [id, true])) as Record<CityLayerId, boolean>;

export function App() {
  const [locale, setLocale] = useState<Locale>("ru");
  const t = useMemo(() => translator(locale), [locale]);
  const query = new URLSearchParams(location.search);
  const [view, setView] = useState<View>(query.get("view") === "city" ? "city" : "planet");
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(0);
  const [script, setScript] = useState<"latin" | "cyrillic">("latin");
  const nm = useMemo(() => (name: string) => (script === "cyrillic" ? toCyrillic(name) : name), [script]);
  const [focus, setFocus] = useState<Focus | null>(null);

  // Planet.
  const [params, setParams] = useState<PlanetParams>(() => planetParams({ seed: query.get("seed") || undefined }));
  const [planet, setPlanet] = useState<Planet | null>(null);
  const [theme, setTheme] = useState<ThemeId>("atlas");
  const [layers, setLayers] = useState<Record<LayerId, boolean>>(defaultLayers("atlas"));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<Tab>("place");

  // City.
  const [cityInput, setCityInput] = useState<CityParams>(() => cityParams({ seed: query.get("city") || undefined, era: "medieval" }));
  const [cityLanguage, setCityLanguage] = useState<Language | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [cityTheme, setCityTheme] = useState<CityThemeId>("ink");
  const [cityLayers, setCityLayers] = useState<Record<CityLayerId, boolean>>(allOn(CITY_LAYERS));
  const [citySelection, setCitySelection] = useState<CitySelection>(null);
  const [cityTime, setCityTime] = useState(0);
  const [fromBurg, setFromBurg] = useState<number | null>(null);

  const later = (work: () => void) => {
    setBusy(true);
    // Let the "shaping the world" note paint before the work starts.
    setTimeout(() => {
      work();
      setBusy(false);
    }, 30);
  };
  const generate = (next: PlanetParams) =>
    later(() => {
      const started = performance.now();
      const made = generatePlanet(next);
      setTime(Math.round(performance.now() - started));
      setPlanet(made);
      setParams(made.params);
      setSelection(null);
      setFromBurg(null);
      history.replaceState(null, "", `?seed=${encodeURIComponent(made.params.seed)}`);
    });
  const buildCity = (next: CityParams, language: Language | null) =>
    later(() => {
      const started = performance.now();
      const made = generateCity(next, language ?? createLanguage(createRng(next.seed).fork("language")));
      setCityTime(Math.round(performance.now() - started));
      setCity(made);
      setCityInput({ ...made.params, name: next.name });
      setCitySelection(null);
    });
  useEffect(() => {
    generate(params);
    if (view === "city") buildCity(cityInput, null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCity = (burgId: number) => {
    if (!planet) return;
    const { params: next, language } = cityFromBurg(planet, burgId, cityInput.era);
    setCityLanguage(language);
    setFromBurg(burgId);
    setCityTheme(defaultCityTheme(next.era));
    setView("city");
    buildCity(next, language);
  };
  const showCity = () => {
    setView("city");
    if (!city) buildCity(cityInput, cityLanguage);
  };

  const highlight = selection && (selection.kind === "state" || selection.kind === "province" || selection.kind === "culture") ? { kind: selection.kind, id: selection.id } : null;
  const planetSvg = useMemo(() => (planet ? renderPlanet(planet, { theme, layers, script, highlight }) : ""), [planet, theme, layers, script, highlight?.kind, highlight?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const citySvg = useMemo(() => (city ? renderCity(city, { theme: cityTheme, layers: cityLayers, script, highlight: citySelection?.kind === "ward" ? citySelection.id : null }) : ""), [city, cityTheme, cityLayers, script, citySelection]);

  const set = <K extends keyof PlanetParams>(key: K, value: PlanetParams[K]) => setParams((current) => ({ ...current, [key]: value }));
  const setCityParam = <K extends keyof CityParams>(key: K, value: CityParams[K]) => setCityInput((current) => ({ ...current, [key]: value }));
  const onCity = view === "city";
  const svg = onCity ? citySvg : planetSvg;
  const size = onCity ? city?.params : planet?.params;
  const title = onCity ? city?.name : planet?.name;
  const fileName = `${(title ?? "map").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}-${onCity ? cityInput.seed.replace(/\W+/gu, "-") : params.seed}`;
  const seedValue = onCity ? cityInput.seed : params.seed;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>{t("app.title")}</strong>
        </div>
        <nav className="views">
          <button type="button" aria-pressed={!onCity} onClick={() => setView("planet")}>
            🌍 {t("view.planet")}
            {planet ? `: ${nm(planet.name)}` : ""}
          </button>
          <button type="button" aria-pressed={onCity} onClick={showCity}>
            🏰 {t("view.city")}
            {city ? `: ${nm(city.name)}` : ""}
          </button>
        </nav>
        <label className="seed">
          {t("field.seed")}
          <input
            value={seedValue}
            onChange={(event) => (onCity ? setCityParam("seed", event.target.value) : set("seed", event.target.value))}
            onKeyDown={(event) => event.key === "Enter" && (onCity ? buildCity(cityInput, cityLanguage) : generate(params))}
            title={t("seed.copy")}
          />
        </label>
        <button type="button" onClick={() => (onCity ? buildCity({ ...cityInput, seed: randomSeed() }, cityLanguage) : generate({ ...params, seed: randomSeed() }))} title={t("action.random")}>
          🎲
        </button>
        <button type="button" className="primary" onClick={() => (onCity ? buildCity(cityInput, cityLanguage) : generate(params))} disabled={busy}>
          {t("action.generate")}
        </button>
        <span className="grow" />
        {!onCity ? (
          <select
            value={theme}
            aria-label={t("field.theme")}
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
        ) : null}
        <select value={script} aria-label={t("field.script")} onChange={(event) => setScript(event.target.value as "latin" | "cyrillic")}>
          <option value="latin">{t("script.latin")}</option>
          <option value="cyrillic">{t("script.cyrillic")}</option>
        </select>
        <details className="menu">
          <summary>{t("action.export")}</summary>
          <div>
            <button type="button" disabled={!svg} onClick={() => download(`${fileName}.svg`, new Blob([svg], { type: "image/svg+xml" }))}>
              {t("action.exportSvg")}
            </button>
            <button type="button" disabled={!svg || !size} onClick={async () => size && download(`${fileName}.png`, await svgToPng(svg, size.width, size.height))}>
              {t("action.exportPng")}
            </button>
            <button
              type="button"
              disabled={onCity ? !city : !planet}
              onClick={() => {
                const data = onCity && city ? { format: "new-world-atlas/city", version: 1, ...city, language: undefined } : planet ? planetToJson(planet) : null;
                if (data) download(`${fileName}.json`, new Blob([JSON.stringify(data)], { type: "application/json" }));
              }}
            >
              {t("action.exportJson")}
            </button>
          </div>
        </details>
        <button type="button" className="ghost" onClick={() => setLocale(locale === "ru" ? "en" : "ru")}>
          {locale === "ru" ? "EN" : "RU"}
        </button>
      </header>

      <aside className="controls">
        {onCity ? (
          <>
            {fromBurg !== null && planet ? (
              <button type="button" className="back" onClick={() => setView("planet")}>
                ← {t("action.backToPlanet")}
              </button>
            ) : null}
            <CityControls params={cityInput} set={setCityParam} theme={cityTheme} setTheme={setCityTheme} layers={cityLayers} setLayers={setCityLayers} t={t} ru={locale === "ru"} />
          </>
        ) : (
          <>
            <h2>{t("panel.world")}</h2>
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
        )}
      </aside>

      <main className="stage">
        {onCity && city ? (
          <MapView
            key={`city-${city.params.seed}-${city.params.era}-${cityTime}`}
            svg={citySvg}
            width={city.params.width}
            height={city.params.height}
            focus={focus}
            onPick={(x, y) => {
              const landmark = city.landmarks.find((item) => Math.hypot(item.x - x, item.y - y) < 8);
              if (landmark) return setCitySelection({ kind: "landmark", id: landmark.id });
              const ward = city.wards.find((item) => pointInPolygon([x, y], item.polygon));
              setCitySelection(ward ? { kind: "ward", id: ward.id } : null);
            }}
          />
        ) : null}
        {!onCity && planet ? (
          <MapView
            key={`planet-${planet.params.seed}-${time}`}
            svg={planetSvg}
            width={planet.params.width}
            height={planet.params.height}
            focus={focus}
            onPick={(x, y) => {
              const cell = planet.mesh.find(x, y);
              const marker = planet.markers.slice(1).find((item) => Math.hypot(item.x - x, item.y - y) < planet.mesh.spacing * 0.3);
              const burg = planet.burg[cell];
              setSelection(marker ? { kind: "marker", id: marker.id } : burg && Math.hypot(planet.burgs[burg].x - x, planet.burgs[burg].y - y) < planet.mesh.spacing * 0.4 ? { kind: "burg", id: burg } : { kind: "cell", id: cell });
              setTab("place");
            }}
          />
        ) : null}
        {busy ? <div className="busy">{t("generating")}</div> : null}
        {onCity && city ? <div className="status">{t("city.summary", { wards: city.wards.filter((ward) => ward.urban).length, buildings: city.buildings.filter((b) => b.kind !== "tree" && b.kind !== "field" && b.kind !== "grave").length, landmarks: city.landmarks.length, time: cityTime })}</div> : null}
        {!onCity && planet ? <div className="status">{t("stats.summary", { states: planet.states.length - 1, burgs: planet.burgs.length - 1, rivers: planet.rivers.length - 1, time })}</div> : null}
      </main>

      {onCity && city ? (
        <CityInspector
          city={city}
          t={t}
          nm={nm}
          selection={citySelection}
          onSelect={(next, at) => {
            setCitySelection(next);
            if (at) setFocus({ x: at[0], y: at[1], nonce: Date.now() });
          }}
        />
      ) : null}
      {!onCity && planet ? (
        <Inspector
          planet={planet}
          t={t}
          nm={nm}
          selection={selection}
          tab={tab}
          setTab={setTab}
          onOpenCity={openCity}
          onSelect={(next, at) => {
            setSelection(next);
            if (at) setFocus({ x: at[0], y: at[1], nonce: Date.now() });
          }}
        />
      ) : null}
    </div>
  );
}
