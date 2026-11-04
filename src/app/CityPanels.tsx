// City mode: its settings on the left; on the right its quarters, places, streets, factions and directory, a search,
// and a card for what is selected — who runs it, who works there, what is said of it, where it leads, and the GM's
// edits of it.
import { useMemo, useState, type ReactNode } from "react";
import {
  addressOf,
  area,
  buildingTypeOf,
  CITY_LAYERS,
  CITY_THEMES,
  DESCENTS,
  ERAS,
  localFromLandmark,
  localFromPlace,
  nextPlaceId,
  pointInPolygon,
  PROPS,
  type City,
  type CityEdits,
  type CityLayerId,
  type CityParams,
  type CitySociety,
  type CityThemeId,
  type CustomPlace,
  type CustomWard,
  type LandmarkKind,
  type LocalLink,
  type ShopInfo,
  type WardKind,
} from "../core/index";
import { CityPlaceKinds, CityWardKinds, loadList, WARD_KINDS } from "./CityKinds";
import type { T } from "./i18n";
import { NumberInput } from "./NumberInput";
import { NpcCard, PeopleList, RumourList, say } from "./People";

const DIRECTIONS: [string, number][] = [
  ["E", 0],
  ["SE", Math.PI / 4],
  ["S", Math.PI / 2],
  ["SW", (3 * Math.PI) / 4],
  ["W", Math.PI],
  ["NW", (-3 * Math.PI) / 4],
  ["N", -Math.PI / 2],
  ["NE", -Math.PI / 4],
];
/** Places in the open: a square's well, a gallows, a camp's fire. They have no plan to open. */
const OPEN_AIR = new Set(["market-well", "gallows", "fire-pit", "sacred-stone", "animal-pen", "undercity", "vault-door", "launch-pad", "av-port", "old-ruins", "tents", "old-gate"]);
/** Kinds of place the GM can put on the map or turn a place into. */
const PLACE_KINDS: LandmarkKind[] = ["tavern", "temple", "keep", "smithy", "guildhall", "bathhouse", "gallows", "docks", "lighthouse", "mill", "barracks", "town-hall", "market-well", "palace", "cathedral", "bank", "mage-tower", "prison", "old-ruins", "station", "hospital", "police", "stadium", "university", "museum", "factory", "corp-hq", "ripperdoc", "netrunner-den", "night-market", "club", "undercity", "gang-hq", "theatre", "arena", "library", "lab", "barter-market", "water-still", "raider-fort", "vault-door", "scrapyard"];
const nearestDirection = (angle: number) => DIRECTIONS.reduce((best, item) => (Math.abs(Math.atan2(Math.sin(item[1] - angle), Math.cos(item[1] - angle))) < Math.abs(Math.atan2(Math.sin(best[1] - angle), Math.cos(best[1] - angle))) ? item : best))[1];

interface PanelProps {
  params: CityParams;
  set: <K extends keyof CityParams>(key: K, value: CityParams[K]) => void;
  theme: CityThemeId;
  setTheme: (theme: CityThemeId) => void;
  layers: Record<CityLayerId, boolean>;
  setLayers: (layers: Record<CityLayerId, boolean>) => void;
  influence: boolean;
  setInfluence: (on: boolean) => void;
  wardKinds: CustomWard[];
  placeKinds: CustomPlace[];
  onKinds: (wards: CustomWard[], places: CustomPlace[]) => void;
  /** Ways out: the country round the town, and the planet's underworld below it. */
  extra?: ReactNode;
  t: T;
}

export function CityControls({ params, set, theme, setTheme, layers, setLayers, influence, setInfluence, wardKinds, placeKinds, onKinds, extra, t }: PanelProps) {
  const direction = (key: "coast" | "river") => (
    <label className="check">
      <input type="checkbox" checked={params[key] !== null} onChange={(event) => set(key, event.target.checked ? Math.PI / 2 : null)} />
      {t(`field.${key}`)}
      {params[key] !== null ? (
        <select value={nearestDirection(params[key]!)} onChange={(event) => set(key, Number(event.target.value))}>
          {DIRECTIONS.map(([label, angle]) => (
            <option key={label} value={angle}>
              {t(`compass.${label}`)}
            </option>
          ))}
        </select>
      ) : null}
    </label>
  );
  return (
    <>
      <h2>{t("panel.city")}</h2>
      <label>
        {t("field.name")}
        <input value={params.name} onChange={(event) => set("name", event.target.value)} />
      </label>
      <label>
        {t("field.era")}
        <select value={params.era} onChange={(event) => set("era", event.target.value as CityParams["era"])}>
          {ERAS.map((era) => (
            <option key={era} value={era}>
              {t(`era.${era}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("field.settlement")}
        <select value={params.settlement ?? "town"} onChange={(event) => set("settlement", event.target.value === "town" ? undefined : (event.target.value as CityParams["settlement"]))}>
          {(["town", "village", "hamlet"] as const).map((kind) => (
            <option key={kind} value={kind}>
              {t(`settlement.${kind}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("field.population")}
        <NumberInput min={0.01} max={20000} step="any" value={params.population} onChange={(value) => set("population", value)} />
      </label>
      {direction("coast")}
      {direction("river")}
      {(["walls", "citadel", "port", "temple", "market", "shanty"] as const).map((key) => (
        <label key={key} className="check">
          <input type="checkbox" checked={params[key]} onChange={(event) => set(key, event.target.checked)} />
          {t(`field.${key}`)}
        </label>
      ))}
      <details className="editor" open={!!(params.growth || params.relief || params.lake || params.roadGates)}>
        <summary>{t("panel.growth")}</summary>
        <label className="check" title={t("field.cityGrowth.hint")}>
          <input type="checkbox" checked={!!params.growth} onChange={(event) => set("growth", event.target.checked || undefined)} />
          {t("field.cityGrowth")}
        </label>
        <label>
          {t("field.relief")}
          <input type="range" min={0} max={1} step={0.1} value={params.relief ?? 0} onChange={(event) => set("relief", Number(event.target.value) || undefined)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={!!params.lake} onChange={(event) => set("lake", event.target.checked || undefined)} />
          {t("field.lake")}
        </label>
        {params.roads?.length ? (
          <label className="check" title={t("field.roadGates.hint")}>
            <input type="checkbox" checked={!!params.roadGates} onChange={(event) => set("roadGates", event.target.checked || undefined)} />
            {t("field.roadGates")}
          </label>
        ) : null}
        {(["capital", "nomads"] as const).map((key) => (
          <label key={key} className="check">
            <input type="checkbox" checked={!!params[key]} onChange={(event) => set(key, event.target.checked || undefined)} />
            {t(`field.${key}`)}
          </label>
        ))}
        <label>
          {t("field.magic")}
          <select value={params.magic ?? 0} onChange={(event) => set("magic", Number(event.target.value) || undefined)}>
            {[0, 1, 2, 3].map((level) => (
              <option key={level} value={level}>
                {t(`magic.${level}`)}
              </option>
            ))}
          </select>
        </label>
      </details>
      <label>
        {t("field.theme")}
        <select value={theme} onChange={(event) => setTheme(event.target.value as CityThemeId)}>
          {CITY_THEMES.map((id) => (
            <option key={id} value={id}>
              {t(`cityTheme.${id}`)}
            </option>
          ))}
        </select>
      </label>
      <h2>{t("panel.layers")}</h2>
      {CITY_LAYERS.map((id) => (
        <label key={id} className="check">
          <input type="checkbox" checked={layers[id]} onChange={(event) => setLayers({ ...layers, [id]: event.target.checked })} />
          {t(`cityLayer.${id}`)}
        </label>
      ))}
      <label className="check">
        <input type="checkbox" checked={influence} onChange={(event) => setInfluence(event.target.checked)} />
        {t("cityLayer.influence")}
      </label>
      {extra}
      <CityWardKinds t={t} value={wardKinds} onChange={(next) => onKinds(next, placeKinds)} />
      <CityPlaceKinds t={t} value={placeKinds} types={loadList("atlas.kinds.building")} onChange={(next) => onKinds(wardKinds, next)} />
      {placeKinds.length ? <p className="muted">{t("custom.apply")}</p> : null}
    </>
  );
}

export type CitySelection = { kind: "ward" | "landmark" | "building" | "faction"; id: number | string } | null;

/** What a click on the map does next, when the GM has asked for it: move a place, put a new one down, open a gate. */
export type CityPending = { action: "move"; place: number } | { action: "add"; kind: string } | { action: "gate" } | null;

const wealthWord = (value: number) => (value > 0.75 ? "rich" : value > 0.5 ? "comfortable" : value > 0.25 ? "modest" : "poor");

interface InspectorProps {
  city: City;
  society: CitySociety;
  shops: () => ShopInfo[];
  t: T;
  nm: (name: string) => string;
  players: boolean;
  selection: CitySelection;
  onSelect: (selection: CitySelection, at?: [number, number]) => void;
  onOpenBuilding: (index: number) => void;
  onOpenLocal: (link: LocalLink | null, entity: string) => void;
  onOpenDistrict?: (ward: number) => void;
  edits: CityEdits;
  setEdits: (change: (edits: CityEdits) => CityEdits) => void;
  pending: CityPending;
  setPending: (pending: CityPending) => void;
  wardKinds: CustomWard[];
  placeKinds: CustomPlace[];
  /** A quarter up close: its blocks are not the city's quarters to rebuild, nor its wall to cut gates in. */
  closeUp?: boolean;
}

export function CityInspector({ city, society, shops, t, nm, players, selection, onSelect, onOpenBuilding, onOpenLocal, onOpenDistrict, edits, setEdits, pending, setPending, wardKinds, placeKinds, closeUp }: InspectorProps) {
  const [tab, setTab] = useState<"wards" | "landmarks" | "streets" | "factions" | "directory">("wards");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const era = city.params.era;
  const ownWard = (id?: string) => (id ? city.params.custom?.wards.find((kind) => kind.id === id) : undefined);
  const ownPlace = (id?: string) => (id ? city.params.custom?.places.find((kind) => kind.id === id) : undefined);
  const wardKindName = (ward: { kind: WardKind; custom?: string }) => ownWard(ward.custom)?.name || t(`ward.${ward.kind}@${era}`);
  const wardTitle = (id: number) => {
    const ward = city.wards.find((w) => w.id === id);
    if (!ward) return "";
    return `${wardKindName(ward)}${ward.name ? ` ${nm(ward.name)}` : ""}`;
  };
  const placeKindName = (landmark: { kind: LandmarkKind; custom?: string }) => (landmark.kind === "custom" ? ownPlace(landmark.custom)?.name || t("custom.unnamed") : t(`landmark.${landmark.kind}@${era}`));
  const landmarkTitle = (id: number) => {
    const landmark = city.landmarks.find((l) => l.id === id);
    if (!landmark) return "";
    return `${placeKindName(landmark)}${landmark.name ? ` «${nm(landmark.name)}»` : ""}`;
  };
  const factionOf = (id: string | null | undefined) => society.factions.find((faction) => faction.id === id);
  const factionTitle = (id: string | null | undefined) => {
    const faction = factionOf(id);
    return faction ? t(`faction.${faction.kind}`, { name: nm(faction.name) }) : "";
  };
  const words = (item: { key: string; vars: Record<string, string | number> }) => say(t, nm, item);
  const address = (index: number) => {
    const at = addressOf(city, index);
    return at ? t("city.address", { street: nm(at.name), n: at.number }) : null;
  };
  const setWard = (id: number, change: NonNullable<CityEdits["wards"]>[string] | null) =>
    setEdits((e) => {
      const wards = { ...e.wards };
      if (change) wards[String(id)] = { ...wards[String(id)], ...change };
      else delete wards[String(id)];
      return { ...e, wards };
    });
  const directory = useMemo(() => (tab === "directory" ? shops() : []), [tab, shops]);

  // A search over everything with a name: quarters, places, the people of the places, factions, streets.
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const hits: { label: string; hint: string; select: CitySelection; at?: [number, number] }[] = [];
    const match = (text: string) => text.toLowerCase().includes(q);
    for (const ward of city.wards) if (ward.urban && match(wardTitle(ward.id))) hits.push({ label: wardTitle(ward.id), hint: t("panel.wards"), select: { kind: "ward", id: ward.id }, at: ward.center });
    for (const landmark of city.landmarks) if (match(landmarkTitle(landmark.id))) hits.push({ label: landmarkTitle(landmark.id), hint: t("panel.landmarks"), select: { kind: "landmark", id: landmark.id }, at: [landmark.x, landmark.y] });
    for (const place of society.places)
      for (const npc of [place.owner, ...place.staff])
        if (match(nm(npc.name))) {
          const landmark = city.landmarks.find((l) => l.id === place.landmark);
          if (landmark) hits.push({ label: nm(npc.name), hint: `${t(`role.${npc.role}@${era}`)} · ${landmarkTitle(landmark.id)}`, select: { kind: "landmark", id: landmark.id }, at: [landmark.x, landmark.y] });
        }
    for (const faction of society.factions) if (match(factionTitle(faction.id))) hits.push({ label: factionTitle(faction.id), hint: t("panel.factions"), select: { kind: "faction", id: faction.id } });
    for (const street of city.streets) if (street.name && match(nm(street.name))) hits.push({ label: nm(street.name), hint: t(`street.${street.kind}`), select: null, at: street.points[Math.floor(street.points.length / 2)] });
    return hits.slice(0, 40);
  }, [query, city, society, t, nm]); // eslint-disable-line react-hooks/exhaustive-deps

  let card = <p className="muted">{t("city.hint")}</p>;
  if (selection?.kind === "ward") {
    const ward = city.wards.find((w) => w.id === selection.id);
    const info = society.wards.find((w) => w.ward === selection.id);
    if (ward && info) {
      const places = city.landmarks.filter((landmark) => landmark.ward === ward.id);
      const holder = factionOf(info.faction);
      const ring = city.growth?.rings[ward.id];
      const change = edits.wards?.[String(ward.id)];
      card = (
        <div className="card">
          <h3>{wardTitle(ward.id)}</h3>
          {ownWard(ward.custom) ? <p className="muted">{t("custom.builtAsKind", { kind: t(`ward.${ward.kind}@${era}`) })}</p> : null}
          <div className="row">
            <span>{t("stat.hectares")}</span>
            <b>
              {((area(ward.polygon) * city.scale * city.scale) / 10_000).toFixed(1)} {t("unit.ha")}
            </b>
          </div>
          <div className="row">
            <span>{t("stat.buildings")}</span>
            <b>{ward.buildings}</b>
          </div>
          {info.people ? (
            <div className="row">
              <span>{t("stat.people")}</span>
              <b>{info.people.toLocaleString(t.locale)}</b>
            </div>
          ) : null}
          <div className="row">
            <span>{t("stat.wealth")}</span>
            <b>{t(`wealth.${wealthWord(ward.wealth)}`)}</b>
          </div>
          <div className="row">
            <span>{t("stat.inside")}</span>
            <b>{t(ward.urban ? "yes" : "no")}</b>
          </div>
          {ring !== undefined && city.growth ? (
            <div className="row">
              <span>{t("stat.built")}</span>
              <b>{ring >= city.growth.ages.length ? t("growth.outside") : `${t(ring === 0 ? "growth.core" : "growth.ring", { n: ring })} · ${t(`era.${city.growth.ages[ring]}`)}`}</b>
            </div>
          ) : null}
          {holder ? (
            <div className="row">
              <span>{t("stat.holder")}</span>
              <b>
                <button type="button" className="link" onClick={() => onSelect({ kind: "faction", id: holder.id })}>
                  {factionTitle(holder.id)}
                </button>{" "}
                ({Math.round(info.share * 100)}%)
              </b>
            </div>
          ) : null}
          {info.trades.length ? (
            <p className="muted">
              {t("stat.trades")}: {info.trades.map((craft) => t(`craft.${craft}@${era}`)).join(", ")}
            </p>
          ) : null}
          <p className="muted">{info.traits.map((trait) => t(trait)).join(" · ")}</p>
          <h4 className="muted">{t("stat.headman")}</h4>
          <ul className="list people">
            <NpcCard t={t} nm={nm} npc={info.headman} age={era} factions={society.factions} />
          </ul>
          {!players ? <p className="muted">🎣 {words(info.hook)}</p> : null}
          <RumourList t={t} nm={nm} rumours={info.rumours} players={players} />
          {onOpenDistrict && ward.urban ? (
            <button type="button" className="primary wide" onClick={() => onOpenDistrict(ward.id)}>
              🔍 {t("action.openDistrict")}
            </button>
          ) : null}
          {places.length ? (
            <ul className="plain">
              {places.map((landmark) => (
                <li key={landmark.id}>
                  <button type="button" className="link" onClick={() => onSelect({ kind: "landmark", id: landmark.id }, [landmark.x, landmark.y])}>
                    {landmarkTitle(landmark.id)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!players && !closeUp ? (
            <details className="editor">
              <summary>✎ {t("edit.ward")}</summary>
              <label>
                {t("edit.kind")}
                <select
                  value={ward.custom ? `custom:${ward.custom}` : ward.kind}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.startsWith("custom:")) {
                      const own = wardKinds.find((kind) => kind.id === value.slice(7)) ?? ownWard(value.slice(7));
                      if (own) setWard(ward.id, { custom: own.id, own, kind: undefined });
                    } else setWard(ward.id, { kind: value as WardKind, custom: undefined, own: undefined });
                  }}
                >
                  {[...new Set([ward.kind, ...WARD_KINDS])].map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`ward.${kind}@${era}`)}
                    </option>
                  ))}
                  {[...wardKinds, ...(city.params.custom?.wards ?? []).filter((kind) => !wardKinds.some((own) => own.id === kind.id))].map((kind) => (
                    <option key={kind.id} value={`custom:${kind.id}`}>
                      ★ {kind.name || t("custom.unnamed")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("edit.wealth")}: {t(`wealth.${wealthWord(ward.wealth)}`)}
                <input type="range" min={0} max={1} step={0.05} value={ward.wealth} onChange={(event) => setWard(ward.id, { wealth: Number(event.target.value) })} />
              </label>
              <label>
                {t("edit.putPlace")}
                <select value={pending?.action === "add" ? pending.kind : ""} onChange={(event) => setPending(event.target.value ? { action: "add", kind: event.target.value } : null)}>
                  <option value="">—</option>
                  {PLACE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`landmark.${kind}@${era}`)}
                    </option>
                  ))}
                  {placeKinds.map((kind) => (
                    <option key={kind.id} value={`custom:${kind.id}`}>
                      ★ {kind.name || t("custom.unnamed")}
                    </option>
                  ))}
                </select>
              </label>
              {pending?.action === "add" ? <p className="muted">{t("edit.pickOnMap")}</p> : null}
              <div className="gm-row">
                <button type="button" onClick={() => setWard(ward.id, { salt: (change?.salt ?? 0) + 1 })}>
                  🎲 {t("edit.reroll")}
                </button>
                {change ? (
                  <button type="button" onClick={() => setWard(ward.id, null)}>
                    ↺ {t("edit.undo")}
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      );
    }
  } else if (selection?.kind === "building") {
    const index = selection.id as number;
    const building = city.buildings[index];
    if (building && building.polygon.length > 2)
      card = (
        <div className="card">
          <h3>{t(`btype.${buildingTypeOf(city, index)}@${era}`)}</h3>
          {address(index) ? (
            <div className="row">
              <span>{t("stat.address")}</span>
              <b>{address(index)}</b>
            </div>
          ) : null}
          <div className="row">
            <span>{t("stat.floors")}</span>
            <b>{building.floors}</b>
          </div>
          <div className="row">
            <span>{t("panel.wards")}</span>
            <b>
              <button type="button" className="link" onClick={() => onSelect({ kind: "ward", id: building.ward })}>
                {wardTitle(building.ward)}
              </button>
            </b>
          </div>
          <button type="button" className="primary wide" onClick={() => onOpenBuilding(index)}>
            🏠 {t("action.openBuilding")}
          </button>
          {!players ? (
            <label>
              ✎ {t("edit.addPlace")}
              <select
                value=""
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) return;
                  const x = building.polygon.reduce((sum, p) => sum + p[0], 0) / building.polygon.length;
                  const y = building.polygon.reduce((sum, p) => sum + p[1], 0) / building.polygon.length;
                  const own = value.startsWith("custom:") ? placeKinds.find((kind) => kind.id === value.slice(7)) : undefined;
                  setEdits((e) => {
                    const id = nextPlaceId(city, e);
                    return { ...e, places: { ...e.places, added: [...(e.places?.added ?? []), { id, kind: own ? "custom" : (value as LandmarkKind), ...(own ? { custom: own.id, own } : {}), x, y }] } };
                  });
                }}
              >
                <option value="">{t("edit.placeKind")}</option>
                {PLACE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`landmark.${kind}@${era}`)}
                  </option>
                ))}
                {placeKinds.map((kind) => (
                  <option key={kind.id} value={`custom:${kind.id}`}>
                    ★ {kind.name || t("custom.unnamed")}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      );
  } else if (selection?.kind === "landmark") {
    const landmark = city.landmarks.find((l) => l.id === selection.id);
    const info = society.places.find((p) => p.landmark === selection.id);
    if (landmark) {
      const index = OPEN_AIR.has(landmark.kind) ? -1 : city.buildings.findIndex((b) => b.ward === landmark.ward && !PROPS.includes(b.kind) && b.polygon.length > 2 && pointInPolygon([landmark.x, landmark.y], b.polygon));
      const own = ownPlace(landmark.custom);
      const way = landmark.kind === "undercity" || landmark.kind === "vault-door";
      const below = way ? localFromLandmark(city, landmark.id) : localFromPlace(city, landmark.id);
      const opensBuilding = own ? own.opens === "building" : true;
      const added = edits.places?.added?.some((a) => a.id === landmark.id);
      card = (
        <div className="card">
          <h3>{landmarkTitle(landmark.id)}</h3>
          {landmark.deity ? <p className="muted">{t("city.deity", { deity: nm(landmark.deity) })}</p> : null}
          {own?.description ? <p>{own.description}</p> : null}
          {own?.secret && !players ? <p className="secret">🔒 {own.secret}</p> : null}
          <div className="row">
            <span>{t("panel.wards")}</span>
            <b>
              <button type="button" className="link" onClick={() => onSelect({ kind: "ward", id: landmark.ward })}>
                {wardTitle(landmark.ward)}
              </button>
            </b>
          </div>
          {index >= 0 && address(index) ? (
            <div className="row">
              <span>{t("stat.address")}</span>
              <b>{address(index)}</b>
            </div>
          ) : null}
          {info ? (
            <>
              <h4 className="muted">{t("npc.owner")}</h4>
              <ul className="list people">
                <NpcCard t={t} nm={nm} npc={info.owner} age={era} factions={society.factions} />
              </ul>
              {info.faction ? (
                <p className="muted">
                  {t("npc.answersTo")}{" "}
                  <button type="button" className="link" onClick={() => onSelect({ kind: "faction", id: info.faction! })}>
                    {factionTitle(info.faction)}
                  </button>
                </p>
              ) : null}
              <PeopleList t={t} nm={nm} people={info.staff} age={era} factions={society.factions} />
              {!players ? <p className="muted">🎣 {words(info.hook)}</p> : null}
              <RumourList t={t} nm={nm} rumours={info.rumours} players={players} />
            </>
          ) : null}
          {below && !players ? (
            <button type="button" className="primary wide" onClick={() => onOpenLocal(below, `${way ? "landmark" : "below"}:${landmark.id}`)}>
              {way || own?.opens === "local" ? `🗺️ ${t("action.openLocal")}` : `⬇ ${t(DESCENTS[landmark.kind] === "crypt" && ["temple", "cathedral"].includes(landmark.kind) ? "action.crypt" : "action.descend")}`}
            </button>
          ) : null}
          {index >= 0 && opensBuilding ? (
            <button type="button" className="primary wide" onClick={() => onOpenBuilding(index)}>
              🏠 {t("action.openBuilding")}
            </button>
          ) : null}
          {!players ? (
            <details className="editor">
              <summary>✎ {t("edit.place")}</summary>
              <label>
                {t("edit.kind")}
                <select
                  value={landmark.kind === "custom" ? `custom:${landmark.custom}` : landmark.kind}
                  onChange={(event) => {
                    const value = event.target.value;
                    const mine = value.startsWith("custom:") ? placeKinds.find((k) => k.id === value.slice(7)) : undefined;
                    setEdits((e) => {
                      if (added) return { ...e, places: { ...e.places, added: (e.places?.added ?? []).map((a) => (a.id === landmark.id ? { ...a, kind: mine ? "custom" : (value as LandmarkKind), custom: mine?.id, own: mine } : a)) } };
                      // The GM's own kind goes along with the edit, so the place keeps its mark, name and secret wherever
                      // the city is opened.
                      const own = { ...e.places?.own };
                      if (mine) own[String(landmark.id)] = mine;
                      else delete own[String(landmark.id)];
                      return { ...e, places: { ...e.places, kinds: { ...e.places?.kinds, [String(landmark.id)]: value }, own } };
                    });
                  }}
                >
                  {[...new Set([landmark.kind, ...PLACE_KINDS])]
                    .filter((kind) => kind !== "custom")
                    .map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`landmark.${kind}@${era}`)}
                      </option>
                    ))}
                  {[...placeKinds, ...(city.params.custom?.places ?? []).filter((kind) => !placeKinds.some((p) => p.id === kind.id))].map((kind) => (
                    <option key={kind.id} value={`custom:${kind.id}`}>
                      ★ {kind.name || t("custom.unnamed")}
                    </option>
                  ))}
                </select>
              </label>
              <div className="gm-row">
                <button type="button" aria-pressed={pending?.action === "move" && pending.place === landmark.id} onClick={() => setPending(pending?.action === "move" ? null : { action: "move", place: landmark.id })}>
                  ✥ {t("edit.movePlace")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // A place the GM added leaves its id among the removed too, so no later place is given it (or its notes).
                    setEdits((e) => ({ ...e, places: { ...e.places, ...(added ? { added: (e.places?.added ?? []).filter((a) => a.id !== landmark.id) } : {}), removed: [...new Set([...(e.places?.removed ?? []), landmark.id])] } }));
                    onSelect(null);
                  }}
                >
                  ✕ {t("edit.removePlace")}
                </button>
              </div>
              {pending?.action === "move" ? <p className="muted">{t("edit.pickOnMap")}</p> : null}
            </details>
          ) : null}
        </div>
      );
    }
  } else if (selection?.kind === "faction") {
    const faction = factionOf(selection.id as string);
    if (faction) {
      const held = city.wards.filter((ward) => society.wards.find((w) => w.ward === ward.id)?.faction === faction.id);
      const seat = faction.seat !== null ? city.landmarks.find((l) => l.id === faction.seat) : undefined;
      card = (
        <div className="card">
          <h3>
            <span className="swatch" style={{ background: faction.color }} /> {factionTitle(faction.id)} {"●".repeat(faction.strength)}
          </h3>
          <p className="muted">{t("npc.wants", { want: t(`want.${faction.goal}`) })}</p>
          <h4 className="muted">{t("faction.leader")}</h4>
          <ul className="list people">
            <NpcCard t={t} nm={nm} npc={faction.leader} age={era} factions={society.factions} />
          </ul>
          {seat ? (
            <div className="row">
              <span>{t("faction.seat")}</span>
              <b>
                <button type="button" className="link" onClick={() => onSelect({ kind: "landmark", id: seat.id }, [seat.x, seat.y])}>
                  {landmarkTitle(seat.id)}
                </button>
              </b>
            </div>
          ) : null}
          <div className="row">
            <span>{t("faction.home")}</span>
            <b>
              <button type="button" className="link" onClick={() => onSelect({ kind: "ward", id: faction.home }, city.wards.find((w) => w.id === faction.home)?.center)}>
                {wardTitle(faction.home)}
              </button>
            </b>
          </div>
          {held.length ? (
            <p className="muted">
              {t("faction.holds", { n: held.length })}: {held.slice(0, 8).map((ward) => wardTitle(ward.id)).join(", ")}
            </p>
          ) : null}
          {faction.rivals.length ? <p className="muted">⚔ {faction.rivals.map(factionTitle).join(", ")}</p> : null}
          {faction.allies.length ? <p className="muted">🤝 {faction.allies.map(factionTitle).join(", ")}</p> : null}
          <p className="muted">{t("faction.places", { n: society.places.filter((place) => place.faction === faction.id).length })}</p>
        </div>
      );
    }
  }

  const wall = city.walls.find((item) => !item.citadel && !item.old);
  return (
    <aside className="inspector">
      <input className="search" type="search" value={query} placeholder={t("search.city")} aria-label={t("search.city")} onChange={(event) => setQuery(event.target.value)} />
      {query.trim().length >= 2 ? (
        <ul className="list">
          {found.length ? (
            found.map((hit, k) => (
              <li
                key={k}
                onClick={() => {
                  onSelect(hit.select, hit.at);
                  setQuery("");
                }}
              >
                <span className="grow">{hit.label}</span>
                <small>{hit.hint}</small>
              </li>
            ))
          ) : (
            <li className="muted">{t("search.none")}</li>
          )}
        </ul>
      ) : null}
      <nav className="tabs">
        {(["wards", "landmarks", "streets", "factions", "directory"] as const).map((name) => (
          <button key={name} type="button" data-tab={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
            {t(`panel.${name}`)}
          </button>
        ))}
      </nav>
      {card}
      <div className="muted" style={{ marginBottom: 6 }}>
        {t("stat.scale")}: 1 : {Math.round(city.scale * 1000).toLocaleString(t.locale)} ({city.scale.toFixed(2)} {t("unit.m")})
      </div>
      <ul className="list">
        {tab === "wards"
          ? city.wards
              .filter((ward) => ward.urban)
              .map((ward) => {
                const holder = factionOf(society.wards.find((w) => w.ward === ward.id)?.faction);
                return (
                  <li key={ward.id} aria-selected={selection?.kind === "ward" && selection.id === ward.id} onClick={() => onSelect({ kind: "ward", id: ward.id }, ward.center)}>
                    {holder ? <span className="swatch" style={{ background: holder.color }} /> : null}
                    <span className="grow">{wardTitle(ward.id)}</span>
                    <small>{ward.buildings}</small>
                  </li>
                );
              })
          : tab === "landmarks"
            ? city.landmarks.map((landmark) => (
                <li key={landmark.id} aria-selected={selection?.kind === "landmark" && selection.id === landmark.id} onClick={() => onSelect({ kind: "landmark", id: landmark.id }, [landmark.x, landmark.y])}>
                  <span className="grow">{landmarkTitle(landmark.id)}</span>
                  <small>{nm(society.places.find((p) => p.landmark === landmark.id)?.owner.name ?? "")}</small>
                </li>
              ))
            : tab === "streets"
              ? city.streets
                  .filter((street) => street.name)
                  .map((street) => (
                    <li key={street.id} onClick={() => onSelect(null, street.points[Math.floor(street.points.length / 2)])}>
                      <span className="grow">{nm(street.name)}</span>
                      <small>{t(`street.${street.kind}`)}</small>
                    </li>
                  ))
              : tab === "factions"
                ? [
                    ...society.factions.map((faction) => (
                      <li key={faction.id} aria-selected={selection?.kind === "faction" && selection.id === faction.id} onClick={() => onSelect({ kind: "faction", id: faction.id })}>
                        <span className="swatch" style={{ background: faction.color }} />
                        <span className="grow">{factionTitle(faction.id)}</span>
                        <small>{"●".repeat(faction.strength)}</small>
                      </li>
                    )),
                    <li key="council" className="muted" style={{ cursor: "default" }}>
                      {t("npc.council")}: {society.council.map((npc) => `${nm(npc.name)} (${t(`role.${npc.role}@${era}`)})`).join(", ")}
                    </li>,
                  ]
                : directory.slice(0, 300).map((shop) => (
                    <li key={shop.building} aria-selected={selection?.kind === "building" && selection.id === shop.building} onClick={() => onSelect({ kind: "building", id: shop.building }, city.buildings[shop.building]?.polygon[0])}>
                      <span className="grow">
                        {t(`craft.${shop.craft}@${era}`)} · {nm(shop.owner.name)}
                      </span>
                      <small>{shop.address ? `${nm(shop.address.name)}, ${shop.address.number}` : ""}</small>
                    </li>
                  ))}
      </ul>
      {tab === "directory" ? <p className="muted">{t("directory.count", { n: directory.length })}</p> : null}
      {tab === "directory" ? (
        <button
          type="button"
          className="wide"
          onClick={() => {
            // The town's directory as text: who governs, the factions, the places and their owners, the shops.
            const placeLine = (id: number) => {
              const info = society.places.find((p) => p.landmark === id);
              const landmark = city.landmarks.find((l) => l.id === id)!;
              const index = city.buildings.findIndex((b) => b.ward === landmark.ward && !PROPS.includes(b.kind) && b.polygon.length > 2 && pointInPolygon([landmark.x, landmark.y], b.polygon));
              return `- **${landmarkTitle(id)}** — ${info ? `${nm(info.owner.name)}, ${t(`role.${info.owner.role}@${era}`)}` : ""}${index >= 0 && address(index) ? ` · ${address(index)}` : ""}${info?.faction ? ` · ${factionTitle(info.faction)}` : ""}`;
            };
            const text = [
              `# ${nm(city.name)}`,
              "",
              `${t("npc.council")}: ${society.council.map((npc) => `${nm(npc.name)} (${t(`role.${npc.role}@${era}`)})`).join(", ")}`,
              "",
              `## ${t("panel.factions")}`,
              ...society.factions.map((faction) => `- **${factionTitle(faction.id)}** ${"●".repeat(faction.strength)} — ${nm(faction.leader.name)}, ${t(`role.${faction.leader.role}@${era}`)}; ${t("npc.wants", { want: t(`want.${faction.goal}`) })}`),
              "",
              `## ${t("panel.landmarks")}`,
              ...city.landmarks.map((landmark) => placeLine(landmark.id)),
              "",
              `## ${t("panel.directory")}`,
              ...directory.map((shop) => `- ${t(`craft.${shop.craft}@${era}`)} — ${nm(shop.owner.name)}${shop.address ? ` · ${nm(shop.address.name)}, ${shop.address.number}` : ""}`),
            ].join("\n");
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          📋 {copied ? t("action.copied") : t("action.copyGuide")}
        </button>
      ) : null}
      {!players && !closeUp && wall && city.params.settlement !== "village" && city.params.settlement !== "hamlet" ? (
        <details className="editor">
          <summary>
            {t("panel.gates")} ({wall.gates.length})
          </summary>
          <ul className="plain">
            {wall.gates.map((gate, k) => {
              const road = city.gateRoads?.[k];
              const to = road !== null && road !== undefined ? city.params.roads?.[road] : undefined;
              return (
                <li key={k}>
                  <button type="button" className="link" onClick={() => onSelect(null, gate)}>
                    {t("gate.n", { n: k + 1 })}
                  </button>{" "}
                  {to ? <small>{to.to ? t("gate.to", { town: nm(to.to), kind: t(`route.${to.kind}@${era}`) }) : t(`route.${to.kind}@${era}`)}</small> : null}{" "}
                  <button type="button" className="ghost" title={t("edit.removeGate")} aria-label={t("edit.removeGate")} onClick={() => setEdits((e) => ({ ...e, gates: { ...e.gates, removed: [...(e.gates?.removed ?? []), gate] } }))}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="gm-row">
            <button type="button" aria-pressed={pending?.action === "gate"} onClick={() => setPending(pending?.action === "gate" ? null : { action: "gate" })}>
              + {t("edit.addGate")}
            </button>
            {edits.gates?.added?.length || edits.gates?.removed?.length ? (
              <button type="button" onClick={() => setEdits((e) => ({ ...e, gates: undefined }))}>
                ↺ {t("edit.undo")}
              </button>
            ) : null}
          </div>
          {pending?.action === "gate" ? <p className="muted">{t("edit.pickWall")}</p> : null}
        </details>
      ) : null}
    </aside>
  );
}
