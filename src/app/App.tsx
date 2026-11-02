// New World Atlas: the game master's map table. Every level (planet, city, building, …) supplies its settings, map
// and inspector; the shell around them holds the tabs, the seed, export, the names' script and the language.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { randomSeed, toCyrillic } from "../core/index";
import { translator, type Locale } from "./i18n";
import { useBuildingLevel } from "./levels/building";
import { useCityLevel } from "./levels/city";
import { usePlanetLevel } from "./levels/planet";
import type { Level, LevelContext, LevelId } from "./levels/types";
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

export function App() {
  const query = useMemo(() => new URLSearchParams(location.search), []);
  const [locale, setLocale] = useState<Locale>("ru");
  const t = useMemo(() => translator(locale), [locale]);
  const [script, setScript] = useState<"latin" | "cyrillic">("latin");
  const nm = useMemo(() => (name: string) => (script === "cyrillic" ? toCyrillic(name) : name), [script]);
  const [view, setView] = useState<LevelId>((query.get("view") as LevelId) || "planet");
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [cameFrom, setCameFrom] = useState<Partial<Record<LevelId, LevelId>>>({});

  const ctx: LevelContext = {
    t,
    nm,
    locale,
    script,
    focus: (x, y) => setFocus({ x, y, nonce: Date.now() }),
    run: (work) => {
      setBusy(true);
      setTimeout(() => {
        work();
        setBusy(false);
      }, 30);
    },
    show: setView,
  };
  const go = (to: LevelId, from: LevelId) => {
    setCameFrom((current) => ({ ...current, [to]: from }));
  };

  const building = useBuildingLevel(ctx, cameFrom.building ? () => setView(cameFrom.building!) : null);
  const city = useCityLevel(
    ctx,
    query.get("city") || undefined,
    (made, index) => {
      go("building", "city");
      building.openFromCity(made, index);
    },
    cameFrom.city ? () => setView(cameFrom.city!) : null,
  );
  const planet = usePlanetLevel(ctx, query.get("seed") || undefined, (made, burg) => {
    go("city", "planet");
    city.openFromBurg(made, burg);
  });
  const levels: Level[] = [planet, city, building];
  const level = levels.find((item) => item.id === view) ?? planet;

  useEffect(() => {
    level.ensure();
    const params = new URLSearchParams();
    params.set("view", level.id);
    if (planet.seed) params.set("seed", planet.seed);
    if (view === "city") params.set("city", city.seed);
    history.replaceState(null, "", `?${params}`);
  }, [view, planet.seed, city.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const fileName = `${(level.title ?? level.id).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}-${level.seed.replace(/\W+/gu, "-")}`;
  const map = level.map;
  let stage: ReactNode = null;
  if (map) stage = <MapView key={map.key} svg={map.svg} width={map.width} height={map.height} focus={focus} onPick={map.onPick} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>{t("app.title")}</strong>
        </div>
        <nav className="views">
          {levels.map((item) => (
            <button key={item.id} type="button" aria-pressed={item.id === view} onClick={() => setView(item.id)}>
              {item.icon} {t(`view.${item.id}`)}
              {item.title ? `: ${nm(item.title)}` : ""}
            </button>
          ))}
        </nav>
        <label className="seed">
          {t("field.seed")}
          <input value={level.seed} onChange={(event) => level.setSeed(event.target.value)} onKeyDown={(event) => event.key === "Enter" && level.generate()} title={t("seed.copy")} />
        </label>
        <button type="button" onClick={() => level.generate(randomSeed())} title={t("action.random")}>
          🎲
        </button>
        <button type="button" className="primary" onClick={() => level.generate()} disabled={busy}>
          {t("action.generate")}
        </button>
        <span className="grow" />
        <select value={script} aria-label={t("field.script")} onChange={(event) => setScript(event.target.value as "latin" | "cyrillic")}>
          <option value="latin">{t("script.latin")}</option>
          <option value="cyrillic">{t("script.cyrillic")}</option>
        </select>
        <details className="menu">
          <summary>{t("action.export")}</summary>
          <div>
            <button type="button" disabled={!map} onClick={() => map && download(`${fileName}.svg`, new Blob([map.svg], { type: "image/svg+xml" }))}>
              {t("action.exportSvg")}
            </button>
            <button type="button" disabled={!map} onClick={async () => map && download(`${fileName}.png`, await svgToPng(map.svg, map.width, map.height))}>
              {t("action.exportPng")}
            </button>
            <button
              type="button"
              disabled={!map}
              onClick={() => {
                const data = level.data();
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
      <aside className="controls">{level.controls}</aside>
      <main className="stage">
        {stage}
        {busy ? <div className="busy">{t("generating")}</div> : null}
        {level.status ? <div className="status">{level.status}</div> : null}
      </main>
      {level.inspector ?? <aside className="inspector" />}
    </div>
  );
}
