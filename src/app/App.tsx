// New World Atlas: the game master's map table. Every level (planet, city, building, …) supplies its settings, map
// and inspector; the shell around them holds the tabs, the seed, export, the names' script and the language.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { localFromLandmark, localFromMarker, localFromStar, overlaySvg, randomSeed, toCyrillic, withOverlay, type LocalLink } from "../core/index";
import { useCampaign } from "./campaign";
import { GmPanel, type GmMode } from "./GmPanel";
import { translator, type Locale } from "./i18n";
import { useBuildingLevel } from "./levels/building";
import { useCityLevel } from "./levels/city";
import { useLocalLevel } from "./levels/local";
import { useRegionLevel } from "./levels/region";
import { usePlanetLevel } from "./levels/planet";
import { useGalaxyLevel, useSystemLevel } from "./levels/space";
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
  const store = useCampaign();
  const [mode, setMode] = useState<GmMode>("inspect");
  const [brush, setBrush] = useState(60);
  const [players, setPlayers] = useState(false);

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
    names: (key) => store.patch(key).names,
    players,
  };
  const go = (to: LevelId, from: LevelId) => {
    setCameFrom((current) => ({ ...current, [to]: from }));
  };

  const local = useLocalLevel(ctx, cameFrom.local ? () => setView(cameFrom.local!) : null);
  const openLocal = (link: LocalLink | null, from: LevelId) => {
    if (!link) return;
    go("local", from);
    local.open(link.params, link.language);
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
    (made, landmark) => openLocal(localFromLandmark(made, landmark), "city"),
  );
  const region = useRegionLevel(ctx, {
    openCity: (made, burg) => {
      go("city", "region");
      city.openFromBurg(made, burg);
    },
    openLocal: (made, marker) => openLocal(localFromMarker(made, marker), "region"),
    back: cameFrom.region ? () => setView(cameFrom.region!) : null,
  });
  const planet = usePlanetLevel(
    ctx,
    query.get("seed") || undefined,
    {
      openCity: (made, burg) => {
        go("city", "planet");
        city.openFromBurg(made, burg);
      },
      openLocal: (made, marker) => openLocal(localFromMarker(made, marker), "planet"),
      openRegion: (made, province) => {
        go("region", "planet");
        region.open(made, province);
      },
      openCountry: (made, state) => {
        go("region", "planet");
        region.openCountry(made, state);
      },
      back: cameFrom.planet ? () => setView(cameFrom.planet!) : null,
    },
  );
  const system = useSystemLevel(
    ctx,
    (params) => {
      go("planet", "system");
      planet.load(params);
      setView("planet");
    },
    cameFrom.system ? () => setView(cameFrom.system!) : null,
  );
  const galaxy = useGalaxyLevel(
    ctx,
    (made, star) => {
      go("system", "galaxy");
      system.open(made, star);
      setView("system");
    },
    (made, star) => openLocal(localFromStar(made, star), "galaxy"),
  );
  const levels: Level[] = [galaxy, system, planet, region, city, building, local];
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
  const patch = store.patch(level.mapKey);
  // Pins and fog scale with the map, so they stay readable on big and small maps alike.
  const overlayScale = map ? Math.max(0.6, Math.min(3, Math.max(map.width, map.height) / 1600)) : 1;
  const overlay = map ? overlaySvg(patch, map.width, map.height, players, overlayScale) : "";
  const exported = map ? withOverlay(map.svg, overlaySvg(patch, map.width, map.height, true, overlayScale), map.width, map.height) : "";
  const pick = (x: number, y: number) => {
    if (!map) return;
    if (mode === "pin" && level.mapKey) {
      const label = prompt(t("gm.pinLabel")) ?? "";
      store.update(level.mapKey, (p) => ({ ...p, pins: [...p.pins, { id: crypto.randomUUID(), x: Math.round(x), y: Math.round(y), label, note: "", color: "#d64545", hidden: false }] }));
    } else if ((mode === "reveal" || mode === "hide") && level.mapKey) {
      const r = brush * overlayScale;
      store.update(level.mapKey, (p) => ({
        ...p,
        fog: { ...p.fog, revealed: mode === "reveal" ? [...p.fog.revealed, [Math.round(x), Math.round(y), Math.round(r)]] : p.fog.revealed.filter(([cx, cy]) => Math.hypot(cx - x, cy - y) > r) },
      }));
    } else map.onPick(x, y);
  };
  let stage: ReactNode = null;
  if (map) stage = <MapView key={map.key} svg={map.svg} overlay={overlay} width={map.width} height={map.height} focus={focus} onPick={pick} />;

  return (
    <div className={players ? "app players" : "app"}>
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
            <button type="button" disabled={!map} onClick={() => map && download(`${fileName}.svg`, new Blob([exported], { type: "image/svg+xml" }))}>
              {t("action.exportSvg")}
            </button>
            <button type="button" disabled={!map} onClick={async () => map && download(`${fileName}.png`, await svgToPng(exported, map.width, map.height))}>
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
        {level.status && !players ? <div className="status">{level.status}</div> : null}
        <GmPanel t={t} store={store} mapKey={level.mapKey} selected={level.selected} mode={mode} setMode={setMode} brush={brush} setBrush={setBrush} players={players} setPlayers={setPlayers} />
      </main>
      {level.inspector ?? <aside className="inspector" />}
    </div>
  );
}
