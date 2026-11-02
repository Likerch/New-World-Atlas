// New World Atlas: the game master's map table. World settings on the left, the map in the middle, the inspector on
// the right.
import { useEffect, useMemo, useState } from "react";
import { defaultLayers, generatePlanet, LAYERS, planetParams, planetToJson, randomSeed, renderPlanet, TEMPLATES, THEMES, toCyrillic, type LayerId, type Planet, type PlanetParams, type ThemeId } from "../core/index";
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

export function App() {
  const [locale, setLocale] = useState<Locale>("ru");
  const t = useMemo(() => translator(locale), [locale]);
  const [params, setParams] = useState<PlanetParams>(() => planetParams({ seed: new URLSearchParams(location.search).get("seed") || undefined }));
  const [planet, setPlanet] = useState<Planet | null>(null);
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(0);
  const [theme, setTheme] = useState<ThemeId>("atlas");
  const [layers, setLayers] = useState<Record<LayerId, boolean>>(defaultLayers("atlas"));
  const [script, setScript] = useState<"latin" | "cyrillic">("latin");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<Tab>("place");
  const [focus, setFocus] = useState<Focus | null>(null);
  const nm = useMemo(() => (name: string) => (script === "cyrillic" ? toCyrillic(name) : name), [script]);

  const generate = (next: PlanetParams) => {
    setBusy(true);
    setSelection(null);
    // Let the "shaping the world" note paint before the work starts.
    setTimeout(() => {
      const started = performance.now();
      const made = generatePlanet(next);
      setTime(Math.round(performance.now() - started));
      setPlanet(made);
      setParams(made.params);
      setBusy(false);
      history.replaceState(null, "", `?seed=${encodeURIComponent(made.params.seed)}`);
    }, 30);
  };
  useEffect(() => generate(params), []); // eslint-disable-line react-hooks/exhaustive-deps

  const highlight = selection && (selection.kind === "state" || selection.kind === "province" || selection.kind === "culture") ? { kind: selection.kind, id: selection.id } : null;
  const svg = useMemo(() => (planet ? renderPlanet(planet, { theme, layers, script, highlight }) : ""), [planet, theme, layers, script, highlight?.kind, highlight?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof PlanetParams>(key: K, value: PlanetParams[K]) => setParams((current) => ({ ...current, [key]: value }));
  const fileName = planet ? `${planet.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}-${planet.params.seed}` : "world";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>{t("app.title")}</strong>
          <span>{t("app.subtitle")}</span>
        </div>
        <label className="seed">
          {t("field.seed")}
          <input value={params.seed} onChange={(event) => set("seed", event.target.value)} onKeyDown={(event) => event.key === "Enter" && generate(params)} title={t("seed.copy")} />
        </label>
        <button type="button" onClick={() => generate({ ...params, seed: randomSeed() })} title={t("action.random")}>
          🎲
        </button>
        <button type="button" className="primary" onClick={() => generate(params)} disabled={busy}>
          {t("action.generate")}
        </button>
        <span className="grow" />
        <select value={theme} aria-label={t("field.theme")} onChange={(event) => {
          const next = event.target.value as ThemeId;
          setTheme(next);
          setLayers(defaultLayers(next));
        }}>
          {THEMES.map((id) => (
            <option key={id} value={id}>
              {t(`theme.${id}`)}
            </option>
          ))}
        </select>
        <select value={script} aria-label={t("field.script")} onChange={(event) => setScript(event.target.value as "latin" | "cyrillic")}>
          <option value="latin">{t("script.latin")}</option>
          <option value="cyrillic">{t("script.cyrillic")}</option>
        </select>
        <details className="menu">
          <summary>{t("action.export")}</summary>
          <div>
            <button type="button" disabled={!planet} onClick={() => download(`${fileName}.svg`, new Blob([svg], { type: "image/svg+xml" }))}>
              {t("action.exportSvg")}
            </button>
            <button type="button" disabled={!planet} onClick={async () => planet && download(`${fileName}.png`, await svgToPng(svg, planet.params.width, planet.params.height))}>
              {t("action.exportPng")}
            </button>
            <button type="button" disabled={!planet} onClick={() => planet && download(`${fileName}.json`, new Blob([JSON.stringify(planetToJson(planet))], { type: "application/json" }))}>
              {t("action.exportJson")}
            </button>
          </div>
        </details>
        <button type="button" className="ghost" onClick={() => setLocale(locale === "ru" ? "en" : "ru")}>
          {locale === "ru" ? "EN" : "RU"}
        </button>
      </header>

      <aside className="controls">
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
      </aside>

      <main className="stage">
        {planet ? (
          <MapView
            svg={svg}
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
        {planet ? <div className="status">{t("stats.summary", { states: planet.states.length - 1, burgs: planet.burgs.length - 1, rivers: planet.rivers.length - 1, time })}</div> : null}
      </main>

      {planet ? (
        <Inspector
          planet={planet}
          t={t}
          nm={nm}
          selection={selection}
          tab={tab}
          setTab={setTab}
          onSelect={(next, at) => {
            setSelection(next);
            if (at) setFocus({ x: at[0], y: at[1], nonce: Date.now() });
          }}
        />
      ) : null}
    </div>
  );
}
