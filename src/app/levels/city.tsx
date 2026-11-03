// The city level: a city of its own or one opened from a planet town; its society (factions, owners, people, rumours),
// the GM's edits of its quarters, places and gates, and the ways down and out of it.
import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  buildingAt,
  cityFromBurg,
  cityLegend,
  cityParams,
  cityShops,
  citySociety,
  cityTiers,
  CITY_LAYERS,
  createLanguage,
  createRng,
  defaultCityTheme,
  editCity,
  generateCity,
  generateDistrict,
  influenceTints,
  mapKeyOf,
  nextPlaceId,
  localFromHall,
  localOutskirts,
  pointInPolygon,
  PROPS,
  renameCity,
  renderCity,
  renderTier,
  tierLegend,
  type City,
  type CityEdits,
  type CityLayerId,
  type CityParams,
  type CityThemeId,
  type LandmarkKind,
  type Language,
  type LocalLink,
  type Planet,
  type Tier,
} from "../../core/index";
import { loadList, saveList } from "../CityKinds";
import { CityControls, CityInspector, type CityPending, type CitySelection } from "../CityPanels";
import type { Level, LevelContext } from "./types";

const allOn = (ids: readonly CityLayerId[]) => Object.fromEntries(ids.map((id) => [id, true])) as Record<CityLayerId, boolean>;

export function useCityLevel(
  ctx: LevelContext,
  initialSeed: string | undefined,
  openBuilding: (city: City, index: number, entity: string, name: string) => void,
  back: (() => void) | null,
  openLocal: (link: LocalLink | null, entity: string) => void,
  /** The planet's underworld below the town, when the town hangs from a planet that is loaded. */
  below?: MutableRefObject<(() => void) | null>,
): Level & { city: City | null; openFromBurg: (planet: Planet, burg: number) => void } {
  const { t } = ctx;
  const pending = useRef(false);
  const [wardKinds, setWardKinds] = useState(() => loadList("atlas.kinds.city-wards"));
  const [placeKinds, setPlaceKinds] = useState(() => loadList("atlas.kinds.city-places"));
  const [input, setInput] = useState<CityParams>(() => cityParams({ seed: initialSeed, era: "medieval", ...(placeKinds.length ? { custom: { wards: wardKinds, places: placeKinds } } : {}) }));
  const [language, setLanguage] = useState<Language | null>(null);
  const [raw, setCity] = useState<City | null>(null);
  const [parents, setParents] = useState<City[]>([]);
  // A town's key: its seed and a print of what it grew from (another age, size or coast is another map); a quarter up
  // close is keyed under its whole city's.
  const keyOf = (made: City): string => {
    const whole = parents[0];
    return whole && made !== whole && made.params.seed.startsWith(`${whole.params.seed}/`) ? `${keyOf(whole)}${made.params.seed.slice(whole.params.seed.length)}` : mapKeyOf("city", made.params as unknown as Record<string, unknown>);
  };
  const mapKey = raw ? keyOf(raw) : null;
  const names = ctx.names(mapKey);
  // The GM's edits of this map (the whole city or a quarter up close), laid over what was generated.
  const editsOf = (key: string) => (ctx.patch(key).changes?.city ?? null) as CityEdits | null;
  const edits = mapKey ? editsOf(mapKey) : null;
  const setEdits = (change: (edits: CityEdits) => CityEdits) => ctx.update(mapKey, (p) => ({ ...p, changes: { ...p.changes, city: change((p.changes?.city ?? {}) as CityEdits) } }));
  const edited = useMemo(() => (raw ? editCity(raw, edits) : null), [raw, edits]);
  const city = useMemo(() => (edited ? renameCity(edited, names) : null), [edited, names]);
  // A quarter up close belongs to its whole city: the city's factions, council and the owners of its places; only the
  // close-up's own blocks get profiles of their own.
  const whole = parents.length ? parents[0] : null;
  const wholeKey = whole ? keyOf(whole) : null;
  const wholeEdits = wholeKey ? editsOf(wholeKey) : null;
  const wholeNames = ctx.names(wholeKey);
  const top = useMemo(() => (whole ? renameCity(editCity(whole, wholeEdits), wholeNames) : null), [whole, wholeEdits, wholeNames]);
  const society = useMemo(() => {
    if (!city) return null;
    const own = citySociety(city);
    if (!top) return own;
    const of = citySociety(top);
    return { ...of, wards: [...of.wards, ...own.wards.filter((ward) => !of.wards.some((other) => other.ward === ward.ward))] };
  }, [city, top]);
  const shops = useCallback(() => (city ? cityShops(city) : []), [city]);
  const [theme, setTheme] = useState<CityThemeId>("ink");
  const [layers, setLayers] = useState<Record<CityLayerId, boolean>>(allOn(CITY_LAYERS));
  const [influence, setInfluence] = useState(false);
  const [selection, setSelection] = useState<CitySelection>(null);
  const [waiting, setWaiting] = useState<CityPending>(null);
  const [time, setTime] = useState(0);
  const [tier, setTier] = useState<Tier>("street");

  const build = (next: CityParams, tongue: Language | null) => {
    pending.current = true;
    ctx.run(() => {
      pending.current = false;
      const started = performance.now();
      const made = generateCity(next, tongue ?? createLanguage(createRng(next.seed).fork("language")));
      setTime(Math.round(performance.now() - started));
      // A city of another age is drawn in that age's style; a new city starts on its streets.
      if (raw && made.params.era !== raw.params.era) setTheme(defaultCityTheme(made.params.era));
      setCity(made);
      setTier("street");
      setParents([]);
      setInput({ ...made.params, name: next.name });
      setSelection(null);
      setWaiting(null);
    });
  };
  const set = <K extends keyof CityParams>(key: K, value: CityParams[K]) => setInput((current) => ({ ...current, [key]: value }));
  const tiers = useMemo(() => (city && tier !== "street" ? cityTiers(city) : null), [city, tier]);
  const legend = useMemo(() => (city ? (tiers && tier !== "street" ? tierLegend(tiers, tier) : cityLegend(city, { theme, layers })) : undefined), [city, tiers, tier, theme, layers]);
  // Influence up close: the whole city's colours, the close-up's blocks in their quarter's.
  const tints = useMemo(() => {
    if (!city || !influence) return undefined;
    if (!top) return influenceTints(city);
    const outer = influenceTints(top);
    const focus = Number(city.params.seed.slice(city.params.seed.lastIndexOf("/ward-") + 6));
    const mine = outer.find((tint) => tint.ward === focus);
    return [...outer, ...(mine ? city.wards.filter((ward) => !top.wards.some((other) => other.id === ward.id)).map((ward) => ({ ...mine, ward: ward.id })) : [])];
  }, [city, influence, top]);
  const mark = { landmark: selection?.kind === "landmark" ? (selection.id as number) : null, building: selection?.kind === "building" ? (selection.id as number) : null };
  const svg = useMemo(
    () => (city ? (tiers ? renderTier(city, tiers, tier, { theme, layers, script: ctx.script }) : renderCity(city, { theme, layers, script: ctx.script, highlight: selection?.kind === "ward" ? (selection.id as number) : null, mark, tints, players: ctx.players })) : ""),
    [city, tiers, tier, theme, layers, ctx.script, selection, tints, ctx.players], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const era = city?.params.era;
  const highTier = city ? era === "modern" || era === "cyberpunk" || era === "far-future" : false;
  // A camp has no levels above or below its huts; an old town's rooftops are its upper level.
  const tierTabs: Tier[] = !city || era === "stone" || city.params.settlement === "village" || city.params.settlement === "hamlet" ? [] : (["upper", "street", "under"] as Tier[]).filter((item) => item !== "upper" || highTier || era === "industrial" || ["ancient", "medieval", "renaissance"].includes(era ?? ""));
  const kindsChanged = (wards: typeof wardKinds, places: typeof placeKinds) => {
    setWardKinds(wards);
    setPlaceKinds(places);
    saveList("atlas.kinds.city-wards", wards);
    saveList("atlas.kinds.city-places", places);
    set("custom", wards.length || places.length ? { wards, places } : undefined);
  };

  return {
    id: "city",
    legend,
    icon: "🏰",
    title: city?.name ?? null,
    seed: input.seed,
    setSeed: (seed) => set("seed", seed),
    generate: (seed) => {
      const next = seed ? { ...input, seed } : input;
      // The same town grown another way is another map: the maps opened from it go, so the GM is asked first (a new
      // seed is asked about by the app).
      const top = parents[0] ?? raw;
      if (!top || next.seed !== top.params.seed || ctx.regrow(keyOf(top), mapKeyOf("city", cityParams(next) as unknown as Record<string, unknown>))) build(next, language);
    },
    ensure: () => {
      // Only when nothing is on its way: an opened building or city must not be replaced by a fresh one.
      if (!city && !pending.current) build(input, language);
    },
    city,
    mapKey,
    worldKey: parents.length ? keyOf(parents[0]) : mapKey,
    params: (parents[0] ?? raw)?.params ? ((parents[0] ?? raw)!.params as unknown as Record<string, unknown>) : null,
    language,
    restore: (saved, tongue) => {
      const params = saved as unknown as CityParams;
      setLanguage(tongue ?? null);
      setTheme(defaultCityTheme(params.era));
      build(params, tongue ?? null);
    },
    selected: !city
      ? null
      : selection?.kind === "ward"
        ? { key: `ward:${selection.id}`, label: city.wards.find((w) => w.id === selection.id)?.name || t(`ward.${city.wards.find((w) => w.id === selection.id)?.kind}@${city.params.era}`) }
        : selection?.kind === "landmark"
          ? { key: `landmark:${selection.id}`, label: city.landmarks.find((l) => l.id === selection.id)?.name || t(`landmark.${city.landmarks.find((l) => l.id === selection.id)?.kind}@${city.params.era}`) }
          : selection?.kind === "building"
            ? { key: `building:${city.buildings[selection.id as number]?.key ?? selection.id}`, label: t(`bkind.${city.buildings[selection.id as number]?.kind}`) }
            : { key: "world", label: city.name },
    openFromBurg: (planet, burg) => {
      // A town opens in its world's own age; the era picker can show it in another.
      const { params, language: tongue } = cityFromBurg(planet, burg);
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
            // A click the GM asked for: where a place moves to, where a gate is opened.
            if (waiting?.action === "move") {
              setEdits((e) => ({ ...e, places: { ...e.places, ...(e.places?.added?.some((a) => a.id === waiting.place) ? { added: e.places!.added!.map((a) => (a.id === waiting.place ? { ...a, x, y } : a)) } : { moved: { ...e.places?.moved, [String(waiting.place)]: [x, y] } }) } }));
              setWaiting(null);
              return;
            }
            if (waiting?.action === "add") {
              const own = waiting.kind.startsWith("custom:") ? placeKinds.find((kind) => kind.id === waiting.kind.slice(7)) : undefined;
              setEdits((e) => {
                const id = nextPlaceId(city, e);
                return { ...e, places: { ...e.places, added: [...(e.places?.added ?? []), { id, kind: own ? "custom" : (waiting.kind as LandmarkKind), ...(own ? { custom: own.id, own } : {}), x, y }] } };
              });
              setWaiting(null);
              return;
            }
            if (waiting?.action === "gate") {
              setEdits((e) => ({ ...e, gates: { ...e.gates, added: [...(e.gates?.added ?? []), [x, y]] } }));
              setWaiting(null);
              return;
            }
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
        {parents.length ? (
          <button
            type="button"
            className="back"
            onClick={() => {
              setCity(parents[parents.length - 1]);
              setParents(parents.slice(0, -1));
              setSelection(null);
              setWaiting(null);
            }}
          >
            ← {t("action.backToWholeCity")}
          </button>
        ) : back ? (
          <button type="button" className="back" onClick={back}>
            ← {t("action.back")}
          </button>
        ) : null}
        {tierTabs.length ? (
          <div className="floor-tabs">
            {tierTabs.map((item) => (
              <button key={item} type="button" aria-pressed={tier === item} onClick={() => setTier(item)}>
                {t(`tier.${item}${(item === "under" || item === "upper") && !highTier ? ".old" : ""}`)}
              </button>
            ))}
          </div>
        ) : null}
        <CityControls
          params={input}
          set={set}
          theme={theme}
          setTheme={setTheme}
          layers={layers}
          setLayers={setLayers}
          influence={influence}
          setInfluence={setInfluence}
          wardKinds={wardKinds}
          placeKinds={placeKinds}
          onKinds={kindsChanged}
          t={t}
          extra={
            city && !ctx.players ? (
              <div className="ways">
                <button type="button" className="wide" onClick={() => openLocal(localOutskirts(city), "outskirts")}>
                  🌲 {t("action.outskirts")}
                </button>
                {below?.current ? (
                  <button type="button" className="wide" onClick={() => below.current?.()}>
                    ⛏ {t("action.underworld")}
                  </button>
                ) : null}
              </div>
            ) : null
          }
        />
      </>
    ),
    inspector:
      tiers && tier === "under" && city ? (
        <aside className="inspector">
          <h4 className="muted">{t(highTier ? "tier.under" : "tier.under.old")}</h4>
          <ul className="list keyed">
            {tiers.under.halls.map((hall) => (
              <li key={hall.id} onClick={() => ctx.focus(hall.center[0], hall.center[1])}>
                <span className="badge">{hall.id}</span>
                <span className="grow">
                  <b>{ctx.nm(hall.name)}</b>
                  <small className="line">{t(`hall.${hall.purpose}`)}</small>
                </span>
                {!ctx.players ? (
                  <button
                    type="button"
                    className="ghost"
                    title={t("action.openHall")}
                    aria-label={t("action.openHall")}
                    onClick={(event) => {
                      event.stopPropagation();
                      openLocal(localFromHall(city, tiers, hall.id), `hall:${hall.id}`);
                    }}
                  >
                    🗺️
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="muted">{t("tier.shafts", { count: tiers.under.shafts.length })}</p>
        </aside>
      ) : city && society ? (
        <CityInspector
          city={city}
          society={society}
          shops={shops}
          t={t}
          nm={ctx.nm}
          players={ctx.players}
          selection={selection}
          edits={edits ?? {}}
          setEdits={setEdits}
          closeUp={parents.length > 0}
          pending={waiting}
          setPending={setWaiting}
          wardKinds={wardKinds}
          placeKinds={placeKinds}
          onOpenBuilding={(index) => {
            // A building a close-up only enlarges opens as the building of the whole city (as does the house a place
            // stands on); a lot drawn only up close is its own, keyed under its quarter.
            let at = edited!;
            let id = index;
            const place = at.buildings[id]?.origin === undefined ? at.landmarks.find((l) => l.origin !== undefined && l.ward === at.buildings[id]?.ward && pointInPolygon([l.x, l.y], at.buildings[id].polygon)) : undefined;
            for (let k = parents.length - 1; k >= 0; k--) {
              const origin = at.buildings[id]?.origin ?? (place && k === parents.length - 1 ? place.origin : undefined);
              if (origin === undefined) break;
              id = origin;
              at = editCity(parents[k], editsOf(keyOf(parents[k])));
            }
            const top = parents[0] ?? raw!;
            const own = at.buildings[id]?.key ?? String(id);
            const entity = at.params.seed === top.params.seed ? `building:${own}` : `building:${at.params.seed.slice(top.params.seed.length + 1)}/${own}`;
            openBuilding(at, id, entity, ctx.names(keyOf(top))[entity] || names[`building:${city.buildings[index]?.key ?? index}`] || "");
          }}
          onOpenLocal={openLocal}
          onOpenDistrict={
            parents.length
              ? undefined
              : (ward) =>
                  ctx.run(() => {
                    setParents([...parents, raw!]);
                    setCity(generateDistrict(edited!, ward));
                    setSelection(null);
                    setWaiting(null);
                    setTime((v) => v + 1);
                  })
          }
          onSelect={(next, at) => {
            setSelection(next);
            if (at) ctx.focus(at[0], at[1]);
          }}
        />
      ) : null,
    status: city ? t("city.summary", { wards: city.wards.filter((ward) => ward.urban).length, buildings: city.buildings.filter((b) => !PROPS.includes(b.kind)).length, landmarks: city.landmarks.length, time }) : "",
    data: () => (city ? { format: "new-world-atlas/city", version: 1, ...city, language: undefined, society } : null),
  };
}
