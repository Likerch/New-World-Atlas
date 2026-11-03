// New World Atlas: the game master's map table. One world (a saved project) is open at a time: its top map and every
// map reached from it by following links down. Every level (planet, city, building, …) supplies its settings, map and
// inspector; the shell holds the world and its outline, the tabs, the seed, export, the names' script and the language.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ageOf,
  buildingFromCity,
  buildingParams,
  cityParams,
  localFromCavern,
  cityFromBurg,
  editPlanet,
  ERA_BUILDINGS,
  galaxyParams,
  generatePlanet,
  legendSvg,
  levelsOf,
  localFromLandmark,
  localFromMarker,
  localParams,
  mapKeyOf,
  overlaySvg,
  pathTo,
  planetParams,
  randomSeed,
  renamePlanet,
  resolve,
  rootOf,
  settingAt,
  settingFromText,
  settingOf,
  SETTINGS,
  toCyrillic,
  visit,
  withOverlay,
  type EraId,
  type LocalLink,
  type LocalParams,
  type MapLevel,
  type Planet,
  type PlanetParams,
  type Setting,
  type WorldDoc,
  type WorldStep,
} from "../core/index";
import { worldStore } from "./campaign";
import { loadKinds } from "./CustomKinds";
import { GmPanel, type GmMode } from "./GmPanel";
import { translator, type Locale, type T } from "./i18n";
import { Legend, legendLabel } from "./Legend";
import { useBuildingLevel } from "./levels/building";
import { useCityLevel } from "./levels/city";
import { useLocalLevel } from "./levels/local";
import { useRegionLevel } from "./levels/region";
import { useUnderworldLevel } from "./levels/underworld";
import { usePlanetLevel } from "./levels/planet";
import { useGalaxyLevel, useSystemLevel, useUniverseLevel, type SpaceLinks } from "./levels/space";
import type { Level, LevelContext, LevelId } from "./levels/types";
import { MapView, type Focus } from "./MapView";
import { LEVEL_ICON, WorldLibrary } from "./WorldLibrary";
import { useWorlds, type Worlds } from "./worlds";
import { useListKeys } from "./keys";

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

/** A dungeon theme that fits an age, for a world that starts from a local map. */
const LOCAL_OF_AGE: Record<EraId, Partial<LocalParams>> = {
  stone: { kind: "cave", theme: "lair" },
  ancient: { kind: "dungeon", theme: "temple" },
  medieval: { kind: "dungeon", theme: "crypt" },
  renaissance: { kind: "dungeon", theme: "sewer" },
  industrial: { kind: "dungeon", theme: "factory" },
  modern: { kind: "dungeon", theme: "metro" },
  cyberpunk: { kind: "dungeon", theme: "lab" },
  "far-future": { kind: "dungeon", theme: "starship" },
  "post-apocalypse": { kind: "dungeon", theme: "vault" },
};

/** The first parameters of a world's top map: its start (seed…) in the world's age. */
function startOf(world: WorldDoc): Record<string, unknown> {
  const start = world.start ?? {};
  const era = ageOf(settingOf(world.setting));
  if (world.top === "planet") return { setting: world.setting, ...start };
  if (world.top === "city") return { era, ...start };
  if (world.top === "building") return { era, type: ERA_BUILDINGS[era][0], ...start };
  if (world.top === "local") return { ...LOCAL_OF_AGE[era], ...start };
  return { ...start };
}

export function App() {
  // The reader's language is remembered, and the page says which it is.
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem("atlas.locale");
      if (saved === "ru" || saved === "en") return saved;
    } catch {
      // Storage may be off.
    }
    return navigator.language?.startsWith("ru") ? "ru" : navigator.language ? "en" : "ru";
  });
  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem("atlas.locale", next);
    } catch {
      // Storage may be off; the choice holds for this visit.
    }
  };
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useListKeys();
  const t = useMemo(() => translator(locale), [locale]);
  const worlds = useWorlds(t("worlds.firstName"));
  // A world opened anew starts with fresh levels.
  return <WorldView key={worlds.world.id} t={t} locale={locale} setLocale={setLocale} worlds={worlds} />;
}

function WorldView({ t, locale, setLocale, worlds }: { t: T; locale: Locale; setLocale: (locale: Locale) => void; worlds: Worlds }) {
  const { world } = worlds;
  const query = useMemo(() => new URLSearchParams(location.search), []);
  const script = world.script;
  const nm = useMemo(() => (name: string) => (script === "cyrillic" ? toCyrillic(name) : name), [script]);
  const shown = levelsOf(world.top);
  // A world opens on its top map; the map the GM was on is reopened as soon as the levels are ready.
  const [view, setView] = useState<LevelId>(world.top);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const [focus, setFocus] = useState<Focus | null>(null);
  const [library, setLibrary] = useState(false);
  const store = worldStore(world, worlds.update);
  const [mode, setMode] = useState<GmMode>("inspect");
  const [brush, setBrush] = useState(60);
  const [players, setPlayers] = useState(false);
  // The legend stays open or folded as the viewer left it.
  // On a narrow screen the legend starts folded, so it does not hide a third of the map.
  const [legendOpen, setLegendOpenState] = useState(() => {
    try {
      const saved = localStorage.getItem("atlas.legend");
      if (saved) return saved !== "closed";
    } catch {
      // Storage may be off.
    }
    return window.innerWidth > 900;
  });
  // A pin or fog brush in hand is put down when the GM goes to another kind of map.
  useEffect(() => setMode("inspect"), [view]);
  const exportMenu = useRef<HTMLDetailsElement>(null);
  const closeExport = () => exportMenu.current?.removeAttribute("open");
  const setLegendOpen = (open: boolean) => {
    setLegendOpenState(open);
    try {
      localStorage.setItem("atlas.legend", open ? "open" : "closed");
    } catch {
      // Storage may be off; the choice holds for this visit.
    }
  };

  const ctx: LevelContext = {
    t,
    nm,
    locale,
    script,
    focus: (x, y) => setFocus({ x, y, nonce: Date.now() }),
    run: (work) => {
      setBusy(true);
      setTimeout(() => {
        // A generator that throws must not leave the app waiting forever.
        try {
          work();
          setFailed("");
        } catch (problem) {
          console.error(problem);
          setFailed(problem instanceof Error ? problem.message : String(problem));
        } finally {
          setBusy(false);
        }
      }, 30);
    },
    show: setView,
    names: (key) => store.patch(key).names,
    patch: store.patch,
    update: store.update,
    players,
  };

  // Links down: a child map's parameters are derived from the parent, the GM's overrides laid on top, and the step
  // remembered so the world knows where the map hangs.
  const pending = useRef<Partial<Record<MapLevel, { parent: string | null; step: WorldStep; base: Record<string, unknown> | null }>>>({});
  const linkTo = (to: MapLevel, from: Level, entity: string, base: Record<string, unknown> | null) => {
    pending.current[to] = { parent: from.worldKey ?? from.mapKey ?? null, step: { entity }, base };
  };
  const back = (level: LevelId) => {
    const key = world.last.byLevel[level];
    const parent = key ? world.maps[key]?.parent : null;
    return parent ? () => openMap(parent) : null;
  };

  const local = useLocalLevel(ctx, back("local"));
  const openLocal = (from: Level, link: LocalLink | null, entity: string) => {
    if (!link) return;
    const base = localParams(link.params) as unknown as Record<string, unknown>;
    linkTo("local", from, entity, base);
    local.restore!(resolve(world, `local:${base.seed}`, base), link.language);
    setView("local");
  };
  const building = useBuildingLevel(ctx, back("building"));
  const city = useCityLevel(
    ctx,
    undefined,
    (made, index, entity, named) => {
      const params = buildingFromCity(made, index);
      // The GM's name for the building on the city map is the plan's name.
      const base = { ...params, ...(named ? { name: named } : {}) } as unknown as Record<string, unknown>;
      linkTo("building", city, entity, base);
      building.restore!(resolve(world, `building:${params.seed}`, base));
      setView("building");
    },
    back("city"),
    (made, landmark) => openLocal(city, localFromLandmark(made, landmark), `landmark:${landmark}`),
  );
  const openCity = (from: Level, made: Planet, burg: number) => {
    // A town of a close-up is its planet's town: it opens as the same city, hanging from the planet.
    const origin = made.burgs[burg]?.origin;
    if (origin && from.id === "region" && planet.planet && made.params.world === planet.planet.params.seed) return openCity(planet, planet.planet, origin);
    const { params, language } = cityFromBurg(made, burg);
    const base = params as unknown as Record<string, unknown>;
    linkTo("city", from, `burg:${burg}`, base);
    city.restore!(resolve(world, `city:${params.seed}`, base), language);
    setView("city");
  };
  const underworld = useUnderworldLevel(
    ctx,
    (made, cavern) => {
      const link = localFromCavern(made, cavern, underworld.of ? ageOf(settingOf(underworld.of.params.setting)) : undefined);
      if (link) openLocal(underworld, link, `cavern:${cavern}`);
    },
    back("underworld"),
  );
  const region = useRegionLevel(ctx, {
    openCity: (made, burg) => openCity(region, made, burg),
    openLocal: (made, marker) => openLocal(region, localFromMarker(made, marker), `marker:${marker}`),
    back: back("region"),
  });
  const planet = usePlanetLevel(ctx, undefined, undefined, {
    openCity: (made, burg) => openCity(planet, made, burg),
    openLocal: (made, marker) => openLocal(planet, localFromMarker(made, marker), `marker:${marker}`),
    openRegion: (made, province) => {
      linkTo("region", planet, `province:${province}`, null);
      region.open(made, province, planet.theme);
    },
    openUnderworld: (made) => {
      linkTo("underworld", planet, "underworld", null);
      underworld.open(made);
    },
    openCountry: (made, state) => {
      linkTo("region", planet, `state:${state}`, null);
      region.openCountry(made, state, planet.theme);
    },
    back: back("planet"),
  });
  // Links from the space maps: a star's system hangs from its galaxy (also when reached along a lane from another
  // system); places, worlds, colonies, galaxies and lone stars hang from the map they were opened on.
  const spaceLinks = (from: () => Level): SpaceLinks => ({
    openSystem: (made, star, survey) => {
      pending.current.system = { parent: mapKeyOf("galaxy", made.params as unknown as Record<string, unknown>), step: { entity: `star:${star}` }, base: { galaxy: made.params as unknown as Record<string, unknown>, star } };
      system.open(made, star, survey);
      setView("system");
    },
    openLoneSystem: (params, entity) => {
      const base = { seed: randomSeed(), ...params } as Record<string, unknown>;
      linkTo("system", from(), entity, base);
      system.restore!(resolve(world, `system:lone/${base.seed}`, base));
      setView("system");
    },
    openLocal: (link, entity) => openLocal(from(), link, entity),
    openBuilding: (params, entity) => {
      const base = buildingParams(params) as unknown as Record<string, unknown>;
      linkTo("building", from(), entity, base);
      building.restore!(resolve(world, `building:${base.seed}`, base));
      setView("building");
    },
    openCity: (params, language, entity) => {
      const base = cityParams(params) as unknown as Record<string, unknown>;
      linkTo("city", from(), entity, base);
      city.restore!(resolve(world, `city:${base.seed}`, base), language);
      setView("city");
    },
    openPlanet: (params, entity) => {
      // A world of a star system lives in its technology's age when it has one, else in the world's (or of a planet
      // above it the GM changed).
      const base = planetParams({ ...params, setting: params.setting ?? settingAt(world, from().worldKey ?? from().mapKey ?? null) }) as unknown as Record<string, unknown>;
      linkTo("planet", from(), entity, base);
      planet.restore!(resolve(world, `planet:${base.seed}`, base));
      setView("planet");
    },
    openGalaxy: (params, entity) => {
      const base = galaxyParams({ custom: loadKinds("atlas.kinds.galaxy"), ...params }) as unknown as Record<string, unknown>;
      linkTo("galaxy", from(), entity, base);
      galaxy.restore!(resolve(world, `galaxy:${base.seed}`, base));
      setView("galaxy");
    },
  });
  const system = useSystemLevel(ctx, spaceLinks(() => system), back("system"), world.setting);
  const galaxy = useGalaxyLevel(ctx, spaceLinks(() => galaxy), back("galaxy"), world.setting);
  const universe = useUniverseLevel(ctx, spaceLinks(() => universe), world.setting);
  const levels: Level[] = [universe, galaxy, system, planet, region, underworld, city, building, local];
  const byId = Object.fromEntries(levels.map((item) => [item.id, item])) as Record<LevelId, Level>;
  const level = byId[view] ?? byId[world.top];
  function levelKey(id: LevelId): string | null {
    const item = byId[id];
    return item ? item.worldKey ?? item.mapKey ?? null : null;
  }

  /** Opens a map of the world where it was left: its level shown, the map remade from what was saved. */
  function openMap(key: string) {
    const map = world.maps[key];
    if (!map) return;
    setView(map.level);
    if (levelKey(map.level) === key) return;
    if (map.level === "region" || map.level === "underworld") return reopenFromPlanet(key);
    byId[map.level].restore?.(map.params, map.language);
  }
  /** A region or the underworld is cut from its planet: remake the planet (with the GM's edits and names) first. */
  function reopenFromPlanet(key: string) {
    const map = world.maps[key];
    const parentKey = map?.parent;
    const parent = parentKey ? world.maps[parentKey] : null;
    if (!map || !parentKey || !parent || parent.level !== "planet") return;
    ctx.run(() => {
      const patch = world.patches[parentKey];
      const made = renamePlanet(editPlanet(generatePlanet(parent.params as Partial<PlanetParams>, patch?.edits?.terrain), patch?.edits ?? null), patch?.names ?? {});
      pending.current[map.level] = { parent: parentKey, step: map.step!, base: null };
      const of = map.params as { of?: string; id?: number };
      if (map.level === "underworld") underworld.open(made);
      else if (of.of === "state") region.openCountry(made, of.id ?? 0);
      else region.open(made, of.id ?? 0);
    });
  }

  // The world remembers every map shown in it: where it hangs, what it was derived from, what it was made from.
  const signature = levels.map((item) => `${item.id}|${item.worldKey ?? item.mapKey}|${JSON.stringify(item.params ?? null)}|${item.title}`).join("¦");
  useEffect(() => {
    for (const item of levels) {
      const key = item.worldKey ?? item.mapKey;
      if (!key || !item.params) continue;
      const known = world.maps[key];
      const link = pending.current[item.id];
      const top = item.id === world.top;
      if (!known && !link && !top) continue;
      if (known && !link && JSON.stringify(known.params) === JSON.stringify(item.params) && known.title === (item.title ?? "")) continue;
      delete pending.current[item.id];
      const params = item.params;
      worlds.update((current) => {
        let next = visit(current, key, { level: item.id, parent: link?.parent ?? null, step: link?.step ?? null, title: item.title ?? "", base: link?.base ?? null, params, language: item.language });
        // The top map carries the world's age: a planet its setting, a city or a building its era.
        if (top && item.id === "planet") {
          const setting = (params.setting ?? {}) as Partial<Setting>;
          if (JSON.stringify(setting) !== JSON.stringify(current.setting)) next = { ...next, setting };
        }
        if (top && (item.id === "city" || item.id === "building") && ageOf(settingOf(current.setting)) !== params.era) next = { ...next, setting: SETTINGS[params.era as EraId] };
        return next;
      });
    }
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  // On opening: the top map and the map the GM was on are remade from what was saved; a link from before worlds
  // (a planet's seed in the address) comes in as a world of its own.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const linked = query.get("seed");
    history.replaceState(null, "", `?view=${view}`);
    const root = rootOf(world);
    if (linked && !(world.top === "planet" && root && (root[1].params as { seed?: string }).seed === linked)) {
      worlds.create({ name: t("worlds.fromLink"), top: "planet", setting: settingFromText(query.get("world")) ?? {}, script, start: { seed: linked } });
      return;
    }
    const top = byId[world.top];
    if (root) top.restore?.(root[1].params, root[1].language);
    else if (world.start) top.restore?.(startOf(world));
    else top.ensure();
    const last = world.last.key ? world.maps[world.last.key] : null;
    if (last && last.level !== world.top) openMap(world.last.key!);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    history.replaceState(null, "", `?view=${view}`);
    const key = levelKey(view);
    if (key && world.maps[key] && world.last.key !== key) worlds.update((current) => ({ ...current, last: { ...current.last, key } }));
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const showLevel = (id: LevelId) => {
    // A tab of a level below the top shows the last map of that level opened in this world.
    const remembered = world.last.byLevel[id];
    if (!byId[id].map && remembered && world.maps[remembered]) openMap(remembered);
    else setView(id);
  };
  const generate = (seed?: string) => {
    const root = rootOf(world);
    const others = Object.keys(world.maps).length > 1;
    const newTop = level.id === world.top && (seed !== undefined || (root && (root[1].params as { seed?: string }).seed !== level.seed));
    if (newTop && others && !confirm(t("worlds.confirmNewTop"))) return;
    level.generate(seed);
  };
  const setWorldSetting = (setting: Setting) => {
    worlds.update((current) => ({ ...current, setting, updated: Date.now() }));
    const root = rootOf(world);
    if (!root) return;
    const params = root[1].params;
    if (world.top === "planet") planet.restore!({ ...params, setting });
    else if (world.top === "city") city.restore!({ ...params, era: ageOf(setting) }, root[1].language);
    else if (world.top === "building") building.restore!({ ...params, era: ageOf(setting) });
  };

  // The underworld is cut from its planet: when that planet is regrown or edited, the underworld shown follows it.
  useEffect(() => {
    const below = underworld.of;
    if (view === "underworld" && below && planet.planet && below !== planet.planet && below.params.seed === planet.planet.params.seed) underworld.open(planet.planet);
  }, [view, planet.planet]); // eslint-disable-line react-hooks/exhaustive-deps

  const here = levelKey(level.id);
  const trail = here && world.maps[here] ? pathTo(world, here) : [];
  const isTop = level.id === world.top;
  const fileName = `${(level.title ?? level.id).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}-${level.seed.replace(/\W+/gu, "-")}`;
  const map = level.map;
  const sheetKey = level.sheetKey === undefined ? level.mapKey : level.sheetKey;
  const patch = store.patch(sheetKey);
  // Pins and fog scale with the map, so they stay readable on big and small maps alike.
  const overlayScale = map ? Math.max(0.6, Math.min(3, Math.max(map.width, map.height) / 1600)) : 1;
  const overlay = map ? overlaySvg(patch, map.width, map.height, players, overlayScale) : "";
  // An exported image carries the legend when it is open on screen.
  const legendBox =
    map && legendOpen && level.legend?.length
      ? legendSvg(
          level.legend.map((section) => ({ title: t(section.key), entries: section.entries.map((entry) => ({ label: legendLabel(t, entry), swatch: entry.swatch })) })),
          map.width,
          map.height,
          { paper: "#fbf8f1", ink: "#2b2620" },
          overlayScale,
        )
      : "";
  const exported = map ? withOverlay(map.svg, overlaySvg(patch, map.width, map.height, true, overlayScale) + legendBox, map.width, map.height) : "";
  const pick = (x: number, y: number) => {
    if (!map) return;
    if (mode === "pin" && sheetKey) {
      const label = prompt(t("gm.pinLabel"));
      if (label === null) return;
      store.update(sheetKey, (p) => ({ ...p, pins: [...p.pins, { id: crypto.randomUUID(), x: Math.round(x), y: Math.round(y), label, note: "", color: "#d64545", hidden: false }] }));
    } else if ((mode === "reveal" || mode === "hide") && sheetKey) {
      const r = brush * overlayScale;
      store.update(sheetKey, (p) => ({
        ...p,
        fog: { ...p.fog, revealed: mode === "reveal" ? [...p.fog.revealed, [Math.round(x), Math.round(y), Math.round(r)]] : p.fog.revealed.filter(([cx, cy]) => Math.hypot(cx - x, cy - y) > r) },
      }));
    } else map.onPick(x, y);
  };
  let stage: ReactNode = null;
  if (map) stage = <MapView key={map.key} svg={map.svg} overlay={overlay} width={map.width} height={map.height} focus={focus} onPick={pick} onDrag={map.onDrag} onDragEnd={map.onDragEnd} zoomRange={map.zoomRange} labels={{ zoomIn: t("map.zoomIn"), zoomOut: t("map.zoomOut"), fit: t("map.fit") }} />;
  else if (!isTop && !busy) stage = <div className="empty-hint">{t("worlds.reach", { level: t(`view.${level.id}`) })}</div>;

  return (
    <div className={players ? "app players" : "app"}>
      <header className="topbar">
        <div className="brand">
          <strong>{t("app.title")}</strong>
        </div>
        <button type="button" className="world-button" onClick={() => setLibrary(true)} title={t("worlds.title")}>
          📚 {world.name || t("worlds.unnamed")} ▾
        </button>
        <nav className="views">
          {levels
            .filter((item) => shown.includes(item.id))
            .map((item) => (
              <button key={item.id} type="button" aria-pressed={item.id === view} onClick={() => showLevel(item.id)}>
                {item.icon} {t(`view.${item.id}`)}
                {item.title ? `: ${nm(item.title)}` : ""}
              </button>
            ))}
        </nav>
        {level.fixed ? null : (
          <label className="seed">
            {t("field.seed")}
            <input value={level.seed} readOnly={!isTop} title={isTop ? t("seed.copy") : t("worlds.seedDerived")} onChange={(event) => level.setSeed(event.target.value)} onKeyDown={(event) => event.key === "Enter" && isTop && generate()} />
          </label>
        )}
        {isTop ? (
          <button type="button" onClick={() => generate(randomSeed())} title={t("action.random")}>
            🎲
          </button>
        ) : null}
        {level.fixed ? null : (
          <button type="button" className="primary" onClick={() => generate()} disabled={busy || (!isTop && !map)}>
            {t("action.generate")}
          </button>
        )}
        <span className="grow" />
        {worlds.saveFailed ? <span className="warning" title={t("worlds.saveFailedHint")}>⚠ {t("worlds.saveFailed")}</span> : null}
        <select value={script} aria-label={t("field.script")} onChange={(event) => worlds.update((current) => ({ ...current, script: event.target.value as "latin" | "cyrillic", updated: Date.now() }))}>
          <option value="latin">{t("script.latin")}</option>
          <option value="cyrillic">{t("script.cyrillic")}</option>
        </select>
        <details className="menu" ref={exportMenu}>
          <summary>{t("action.export")}</summary>
          <div>
            <button
              type="button"
              disabled={!map}
              onClick={() => {
                closeExport();
                if (map) download(`${fileName}.svg`, new Blob([exported], { type: "image/svg+xml" }));
              }}
            >
              {t("action.exportSvg")}
            </button>
            <button
              type="button"
              disabled={!map}
              onClick={async () => {
                closeExport();
                if (!map) return;
                try {
                  download(`${fileName}.png`, await svgToPng(exported, map.width, map.height));
                } catch (problem) {
                  console.error(problem);
                  alert(t("export.pngFailed"));
                }
              }}
            >
              {t("action.exportPng")}
            </button>
            <button
              type="button"
              disabled={!map}
              onClick={() => {
                closeExport();
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
      <nav className="crumbs" aria-label={t("worlds.path")}>
        <button type="button" className="ghost" onClick={() => setLibrary(true)}>
          📚 {world.name || t("worlds.unnamed")}
        </button>
        {trail.map(([key, map]) => (
          <span key={key}>
            <span className="crumb-sep">›</span>
            <button type="button" className="ghost" aria-current={key === here ? "page" : undefined} onClick={() => openMap(key)}>
              {LEVEL_ICON[map.level]} {nm(map.title) || t(`view.${map.level}`)}
            </button>
          </span>
        ))}
      </nav>
      <aside className="controls">{level.controls}</aside>
      <main className="stage">
        {stage}
        {busy ? <div className="busy">{t("generating")}</div> : null}
        {failed && !busy ? (
          <div className="busy error" role="alert">
            {t("generation.failed", { reason: failed })}
          </div>
        ) : null}
        {level.status && !players ? <div className="status">{level.status}</div> : null}
        {map && !players ? <Legend t={t} sections={level.legend} open={legendOpen} setOpen={setLegendOpen} /> : null}
        <GmPanel t={t} store={store} mapKey={level.mapKey} sheetKey={sheetKey} selected={level.selected} mode={mode} setMode={setMode} brush={brush} setBrush={setBrush} players={players} setPlayers={setPlayers} />
      </main>
      {level.inspector ?? <aside className="inspector" />}
      {library ? <WorldLibrary t={t} worlds={worlds} onClose={() => setLibrary(false)} onWorldSetting={setWorldSetting} /> : null}
    </div>
  );
}
