// The game master's own content for cities and buildings: kinds of building (rooms floor by floor), kinds of quarter
// (built like one of the generator's, named and coloured their own way), and kinds of place (a mark, what it is, what
// only the GM knows of it, what it opens into, how many and where). They are kept in this browser, so the next city
// starts with them; whatever a map uses travels with that map in the world.
import { BUILDING_TYPES, LOCAL_THEMES, type CustomBuildingType, type CustomPlace, type CustomWard, type RoomKind, type WardKind } from "../core/index";
import type { T } from "./i18n";
import { NumberInput } from "./NumberInput";

export function loadList<K extends string>(key: K): K extends "atlas.kinds.building" ? CustomBuildingType[] : K extends "atlas.kinds.city-wards" ? CustomWard[] : CustomPlace[] {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? "[]");
    return (Array.isArray(list) ? list : []) as never;
  } catch {
    return [] as never;
  }
}

export function saveList(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage may be off (a private window); the kinds still work for this session.
  }
}

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;

/** Rooms a GM's building can have. */
const ROOMS: RoomKind[] = ["hall", "common-room", "kitchen", "pantry", "bedroom", "guest-room", "storage", "workshop", "shop-floor", "office", "study", "chapel", "nave", "sacristy", "armory", "barracks", "throne-room", "bath", "cellar", "cell", "living-room", "dining", "lobby", "operating-room", "waiting-room", "dance-floor", "bar", "vip", "toilet", "server-room", "atrium", "garden", "classroom", "gym", "canteen", "machine-hall", "vault", "lab", "grow-room", "vestibule", "attic", "guard-room", "ballroom", "gallery", "ritual-room", "stage", "auditorium"];
/** Quarters a GM's kind can be built as, and where a GM's place can turn up. */
export const WARD_KINDS: WardKind[] = ["craftsmen", "merchants", "patriciate", "slum", "harbour", "temple", "castle", "military", "administration", "park", "cemetery", "suburb", "plaza", "old-town", "downtown", "commercial", "residential", "rich-residential", "industrial", "port", "campus", "megablock", "combat-zone", "arcology", "ruins", "settlement", "camp"];

function RoomList({ t, value, onChange }: { t: T; value: RoomKind[]; onChange: (next: RoomKind[]) => void }) {
  return (
    <div className="room-list">
      {value.map((kind, k) => (
        <span key={k} className="chip">
          <select value={kind} onChange={(event) => onChange(value.map((item, j) => (j === k ? (event.target.value as RoomKind) : item)))}>
            {ROOMS.map((room) => (
              <option key={room} value={room}>
                {t(`room.${room}`)}
              </option>
            ))}
          </select>
          <button type="button" className="ghost" aria-label={t("custom.remove")} onClick={() => onChange(value.filter((_, j) => j !== k))}>
            ✕
          </button>
        </span>
      ))}
      <button type="button" className="ghost" onClick={() => onChange([...value, "hall"])} title={t("custom.addRoom")}>
        +
      </button>
    </div>
  );
}

export function BuildingTypes({ t, value, onChange }: { t: T; value: CustomBuildingType[]; onChange: (next: CustomBuildingType[]) => void }) {
  const update = (index: number, change: Partial<CustomBuildingType>) => onChange(value.map((kind, k) => (k === index ? { ...kind, ...change } : kind)));
  return (
    <details className="custom-kinds" open={value.length > 0}>
      <summary>
        {t("custom.ownTypes")} ({value.length})
      </summary>
      <p className="muted">{t("custom.typesHint")}</p>
      {value.map((kind, index) => (
        <div key={kind.id} className="custom-kind">
          <div className="custom-row">
            <input className="grow" value={kind.name} placeholder={t("custom.name")} aria-label={t("custom.name")} onChange={(event) => update(index, { name: event.target.value.slice(0, 60) })} />
            <button type="button" className="ghost" aria-label={t("custom.remove")} title={t("custom.remove")} onClick={() => onChange(value.filter((_, k) => k !== index))}>
              ✕
            </button>
          </div>
          <input value={kind.description} placeholder={t("custom.description")} aria-label={t("custom.description")} onChange={(event) => update(index, { description: event.target.value.slice(0, 300) })} />
          <div className="custom-row">
            <NumberInput min={4} max={60} value={kind.width} aria-label={t("field.width")} title={t("field.width")} onChange={(width) => update(index, { width })} />
            <NumberInput min={4} max={40} value={kind.depth} aria-label={t("field.depth")} title={t("field.depth")} onChange={(depth) => update(index, { depth })} />
            <NumberInput min={1} max={20} value={kind.floors} aria-label={t("field.floors")} title={t("field.floors")} onChange={(floors) => update(index, { floors })} />
          </div>
          <small>{t("floor.ground")}</small>
          <RoomList t={t} value={kind.ground} onChange={(ground) => update(index, { ground })} />
          <small>{t("custom.upper")}</small>
          <RoomList t={t} value={kind.upper} onChange={(upper) => update(index, { upper })} />
          <small>{t("floor.cellar")}</small>
          <RoomList t={t} value={kind.cellar} onChange={(cellar) => update(index, { cellar })} />
        </div>
      ))}
      <button type="button" className="wide" onClick={() => onChange([...value, { id: newId("type"), name: "", description: "", ground: ["hall", "kitchen", "storage"], upper: ["bedroom", "bedroom"], cellar: [], width: 12, depth: 9, floors: 2 }])}>
        + {t("custom.addType")}
      </button>
    </details>
  );
}

export function CityWardKinds({ t, value, onChange }: { t: T; value: CustomWard[]; onChange: (next: CustomWard[]) => void }) {
  const update = (index: number, change: Partial<CustomWard>) => onChange(value.map((kind, k) => (k === index ? { ...kind, ...change } : kind)));
  return (
    <details className="custom-kinds" open={value.length > 0}>
      <summary>
        {t("custom.ownWards")} ({value.length})
      </summary>
      <p className="muted">{t("custom.wardsHint")}</p>
      {value.map((kind, index) => (
        <div key={kind.id} className="custom-kind">
          <div className="custom-row">
            <input type="color" value={kind.color} aria-label={t("custom.color")} title={t("custom.color")} onChange={(event) => update(index, { color: event.target.value })} />
            <input className="grow" value={kind.name} placeholder={t("custom.name")} aria-label={t("custom.name")} onChange={(event) => update(index, { name: event.target.value.slice(0, 60) })} />
            <button type="button" className="ghost" aria-label={t("custom.remove")} title={t("custom.remove")} onClick={() => onChange(value.filter((_, k) => k !== index))}>
              ✕
            </button>
          </div>
          <div className="custom-row">
            <select className="grow" value={kind.base} aria-label={t("custom.builtAs")} title={t("custom.builtAs")} onChange={(event) => update(index, { base: event.target.value as WardKind })}>
              {WARD_KINDS.map((ward) => (
                <option key={ward} value={ward}>
                  {t(`ward.${ward}`)}
                </option>
              ))}
            </select>
            <input type="range" min={0} max={1} step={0.05} value={kind.wealth} aria-label={t("stat.wealth")} title={t("stat.wealth")} onChange={(event) => update(index, { wealth: Number(event.target.value) })} />
          </div>
        </div>
      ))}
      <button type="button" className="wide" onClick={() => onChange([...value, { id: newId("ward"), name: "", color: "#8a4fc9", base: "craftsmen", wealth: 0.5 }])}>
        + {t("custom.addWard")}
      </button>
    </details>
  );
}

export function CityPlaceKinds({ t, value, types, onChange }: { t: T; value: CustomPlace[]; types: CustomBuildingType[]; onChange: (next: CustomPlace[]) => void }) {
  const update = (index: number, change: Partial<CustomPlace>) => onChange(value.map((kind, k) => (k === index ? { ...kind, ...change } : kind)));
  const themes = [...LOCAL_THEMES.dungeon, ...LOCAL_THEMES.cave, ...LOCAL_THEMES.wilderness];
  return (
    <details className="custom-kinds" open={value.length > 0}>
      <summary>
        {t("custom.ownPlaces")} ({value.length})
      </summary>
      <p className="muted">{t("custom.placesHint")}</p>
      {value.map((kind, index) => (
        <div key={kind.id} className="custom-kind">
          <div className="custom-row">
            <input className="glyph" value={kind.glyph} maxLength={4} aria-label={t("custom.glyph")} title={t("custom.glyph")} onChange={(event) => update(index, { glyph: Array.from(event.target.value).slice(0, 2).join("") })} />
            <input type="color" value={kind.color} aria-label={t("custom.color")} title={t("custom.color")} onChange={(event) => update(index, { color: event.target.value })} />
            <input className="grow" value={kind.name} placeholder={t("custom.name")} aria-label={t("custom.name")} onChange={(event) => update(index, { name: event.target.value.slice(0, 60) })} />
            <button type="button" className="ghost" aria-label={t("custom.remove")} title={t("custom.remove")} onClick={() => onChange(value.filter((_, k) => k !== index))}>
              ✕
            </button>
          </div>
          <input value={kind.description} placeholder={t("custom.description")} aria-label={t("custom.description")} onChange={(event) => update(index, { description: event.target.value.slice(0, 300) })} />
          <input value={kind.secret} placeholder={t("custom.secret")} aria-label={t("custom.secret")} onChange={(event) => update(index, { secret: event.target.value.slice(0, 300) })} />
          <div className="custom-row">
            <select value={kind.opens} aria-label={t("custom.opens")} title={t("custom.opens")} onChange={(event) => update(index, { opens: event.target.value as CustomPlace["opens"], target: event.target.value === "building" ? "house" : event.target.value === "local" ? "crypt" : "" })}>
              {(["none", "building", "local"] as const).map((opens) => (
                <option key={opens} value={opens}>
                  {t(`custom.opens.${opens}`)}
                </option>
              ))}
            </select>
            {kind.opens === "building" ? (
              <select className="grow" value={kind.target} onChange={(event) => update(index, { target: event.target.value })}>
                {BUILDING_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`btype.${type}`)}
                  </option>
                ))}
                {types.map((type) => (
                  <option key={type.id} value={`custom:${type.id}`}>
                    {type.name || t("custom.unnamed")}
                  </option>
                ))}
              </select>
            ) : kind.opens === "local" ? (
              <select className="grow" value={kind.target} onChange={(event) => update(index, { target: event.target.value })}>
                {themes.map((theme) => (
                  <option key={theme} value={theme}>
                    {t(`ltheme.${theme}`)}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="custom-row">
            <NumberInput min={0} max={30} value={kind.count} aria-label={t("custom.count")} title={t("custom.count")} onChange={(count) => update(index, { count })} />
            <select className="grow" value={kind.where[0] ?? ""} aria-label={t("custom.where")} title={t("custom.where")} onChange={(event) => update(index, { where: event.target.value ? [event.target.value as WardKind] : [] })}>
              <option value="">{t("custom.anywhereInTown")}</option>
              {WARD_KINDS.map((ward) => (
                <option key={ward} value={ward}>
                  {t(`ward.${ward}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      <button type="button" className="wide" onClick={() => onChange([...value, { id: newId("place"), name: "", glyph: "✦", color: "#8a4fc9", description: "", secret: "", opens: "none", target: "", count: 2, where: [] }])}>
        + {t("custom.addPlace")}
      </button>
    </details>
  );
}
