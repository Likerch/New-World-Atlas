// The city level: a city of its own or one opened from a planet town.
import { useMemo, useRef, useState } from "react";
import { buildingAt, cityFromBurg, cityParams, CITY_LAYERS, createLanguage, createRng, defaultCityTheme, generateCity, pointInPolygon, renameCity, renderCity, type City, type CityLayerId, type CityParams, type CityThemeId, type Language, type Planet } from "../../core/index";
import { CityControls, CityInspector, type CitySelection } from "../CityPanels";
import type { Level, LevelContext } from "./types";

const allOn = (ids: readonly CityLayerId[]) => Object.fromEntries(ids.map((id) => [id, true])) as Record<CityLayerId, boolean>;

export function useCityLevel(ctx: LevelContext, initialSeed: string | undefined, openBuilding: (city: City, index: number) => void, back: (() => void) | null, openLocal: (city: City, landmark: number) => void): Level & { city: City | null; openFromBurg: (planet: Planet, burg: number) => void } {
  const { t } = ctx;
  const pending = useRef(false);
  const [input, setInput] = useState<CityParams>(() => cityParams({ seed: initialSeed, era: "medieval" }));
  const [language, setLanguage] = useState<Language | null>(null);
  const [raw, setCity] = useState<City | null>(null);
  const mapKey = raw ? `city:${raw.params.seed}` : null;
  const names = ctx.names(mapKey);
  const city = useMemo(() => (raw ? renameCity(raw, names) : null), [raw, names]);
  const [theme, setTheme] = useState<CityThemeId>("ink");
  const [layers, setLayers] = useState<Record<CityLayerId, boolean>>(allOn(CITY_LAYERS));
  const [selection, setSelection] = useState<CitySelection>(null);
  const [time, setTime] = useState(0);

  const build = (next: CityParams, tongue: Language | null) => {
    pending.current = true;
    ctx.run(() => {
      pending.current = false;
      const started = performance.now();
      const made = generateCity(next, tongue ?? createLanguage(createRng(next.seed).fork("language")));
      setTime(Math.round(performance.now() - started));
      setCity(made);
      setInput({ ...made.params, name: next.name });
      setSelection(null);
    });
  };
  const set = <K extends keyof CityParams>(key: K, value: CityParams[K]) => setInput((current) => ({ ...current, [key]: value }));
  const svg = useMemo(() => (city ? renderCity(city, { theme, layers, script: ctx.script, highlight: selection?.kind === "ward" ? selection.id : null }) : ""), [city, theme, layers, ctx.script, selection]);

  return {
    id: "city",
    icon: "🏰",
    title: city?.name ?? null,
    seed: input.seed,
    setSeed: (seed) => set("seed", seed),
    generate: (seed) => build(seed ? { ...input, seed } : input, language),
    ensure: () => {
      // Only when nothing is on its way: an opened building or city must not be replaced by a fresh one.
      if (!city && !pending.current) build(input, language);
    },
    city,
    mapKey,
    selected: !city
      ? null
      : selection?.kind === "ward"
        ? { key: `ward:${selection.id}`, label: city.wards.find((w) => w.id === selection.id)?.name || t(`ward.${city.wards.find((w) => w.id === selection.id)?.kind}`) }
        : selection?.kind === "landmark"
          ? { key: `landmark:${selection.id}`, label: city.landmarks.find((l) => l.id === selection.id)?.name || t(`landmark.${city.landmarks.find((l) => l.id === selection.id)?.kind}`) }
          : selection?.kind === "building"
            ? { key: `building:${selection.id}`, label: t(`bkind.${city.buildings[selection.id]?.kind}`) }
            : { key: "world", label: city.name },
    openFromBurg: (planet, burg) => {
      const { params, language: tongue } = cityFromBurg(planet, burg, input.era);
      setLanguage(tongue);
      setTheme(defaultCityTheme(params.era));
      build(params, tongue);
      ctx.show("city");
    },
    map: city
      ? {
          svg,
          width: city.params.width,
          height: city.params.height,
          key: `city-${city.params.seed}-${city.params.era}-${time}`,
          onPick: (x, y) => {
            const landmark = city.landmarks.find((item) => Math.hypot(item.x - x, item.y - y) < 8);
            if (landmark) return setSelection({ kind: "landmark", id: landmark.id });
            const building = buildingAt(city, [x, y]);
            if (building >= 0) return setSelection({ kind: "building", id: building });
            const ward = city.wards.find((item) => pointInPolygon([x, y], item.polygon));
            setSelection(ward ? { kind: "ward", id: ward.id } : null);
          },
        }
      : null,
    controls: (
      <>
        {back ? (
          <button type="button" className="back" onClick={back}>
            ← {t("action.back")}
          </button>
        ) : null}
        <CityControls
          params={input}
          set={set}
          theme={theme}
          setTheme={(next) => {
            setTheme(next);
          }}
          layers={layers}
          setLayers={setLayers}
          t={t}
          ru={ctx.locale === "ru"}
        />
      </>
    ),
    inspector: city ? (
      <CityInspector
        city={city}
        t={t}
        nm={ctx.nm}
        selection={selection}
        onOpenBuilding={(index) => openBuilding(city, index)}
        onOpenLocal={(landmark) => openLocal(city, landmark)}
        onSelect={(next, at) => {
          setSelection(next);
          if (at) ctx.focus(at[0], at[1]);
        }}
      />
    ) : null,
    status: city ? t("city.summary", { wards: city.wards.filter((ward) => ward.urban).length, buildings: city.buildings.filter((b) => !["tree", "field", "grave", "pier"].includes(b.kind)).length, landmarks: city.landmarks.length, time }) : "",
    data: () => (city ? { format: "new-world-atlas/city", version: 1, ...city, language: undefined } : null),
  };
}
