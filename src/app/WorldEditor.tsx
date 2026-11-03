// The world editor's panel on the planet level: the tool a click on the map uses (relief brushes, a heightmap from a
// picture, land given to a realm, a people, a faith or a province, towns moved, founded and razed, words and zones on
// the map, a close-up of a marked-out stretch), and for a realm or a town picked in the inspector its own edits: form
// of rule, colour, seat, merging, standing with neighbours; size, walls, harbour, a realm raised round it.
import { createRng, foundedSize, name, type Planet, type PlanetEdits, type Relation } from "../core/index";
import type { T } from "./i18n";
import type { Selection } from "./Inspector";
import { NumberInput } from "./NumberInput";

export type EditTool = "raise" | "lower" | "smooth" | "flatten" | "ridge" | "trench" | "sink" | "paint" | "people" | "faith" | "province" | "move" | "add" | "remove" | "label" | "zone" | "area";
const GROUPS: [string, EditTool[]][] = [
  ["relief", ["raise", "lower", "smooth", "flatten", "ridge", "trench", "sink"]],
  ["land", ["paint", "people", "faith", "province"]],
  ["towns", ["move", "add", "remove"]],
  ["marks", ["label", "zone", "area"]],
];
const BRUSHED: EditTool[] = ["raise", "lower", "smooth", "flatten", "ridge", "trench", "sink", "paint", "people", "faith", "province", "zone"];
const ZONES = ["front", "plague", "famine", "bandits", "storm", "radiation", "custom"];
const RELATIONS: Relation[] = ["ally", "friendly", "neutral", "suspicion", "rival", "enemy", "vassal", "suzerain"];
const FORMS = ["kingdom", "empire", "principality", "duchy", "grand-duchy", "republic", "merchant-republic", "federation", "confederation", "league", "union", "theocracy", "temple-state", "holy-see", "khanate", "horde", "tribes", "clans", "chiefdom", "city-state", "free-city", "polis", "dictatorship", "junta", "oligarchy", "technocracy", "magocracy", "corporate-state", "zaibatsu", "ai-directorate", "warlord-domain", "raider-clans", "protectorate", "colony"];

export interface Paint {
  realm: number;
  people: number;
  faith: number;
  province: number;
  zone: string;
}

interface Props {
  t: T;
  nm: (name: string) => string;
  planet: Planet;
  edits: PlanetEdits | null;
  tool: EditTool | null;
  setTool: (tool: EditTool | null) => void;
  brush: { radius: number; strength: number };
  setBrush: (brush: { radius: number; strength: number }) => void;
  paint: Paint;
  setPaint: (paint: Paint) => void;
  /** The town picked up by the move tool. */
  moving: number | null;
  /** The first point of a ridge, a trench or an area is set. */
  started: boolean;
  selection: Selection | null;
  /** A change to the edits (one undo step). */
  change: (next: (current: PlanetEdits) => PlanetEdits) => void;
  onImage: (file: File) => void;
  /** Relief and place names from a GeoJSON file (Azgaar's cells and burgs, or any GIS data). */
  onGeo?: (file: File) => void;
  canUndo: boolean;
  onUndo: () => void;
  onReset: () => void;
  /** The tools this map offers (a close-up has no relief brushes and no realm of its own to recast); all by default. */
  tools?: EditTool[];
}

/**
 * What a click with a tool in hand does to a map's edits: land handed to a realm, a people, a faith or a province;
 * words and zones laid down; towns moved, founded and razed. Relief strokes and boxes are the planet level's own.
 */
export function editAt(planet: Planet, edits: PlanetEdits | null, tool: EditTool, x: number, y: number, o: { radius: number; paint: Paint; moving: number | null; setMoving: (id: number | null) => void; change: Props["change"]; t: T }): void {
  const { mesh } = planet;
  const at: [number, number] = [Math.round(x), Math.round(y)];
  const town = () => {
    let best = 0;
    for (const burg of planet.burgs.slice(1)) if (!burg.removed && Math.hypot(burg.x - x, burg.y - y) < mesh.spacing * 0.8 && (!best || Math.hypot(burg.x - x, burg.y - y) < Math.hypot(planet.burgs[best].x - x, planet.burgs[best].y - y))) best = burg.id;
    return best;
  };
  const handOver = (field: "owners" | "cultures" | "faiths" | "provinces", id: number) => {
    const given: Record<number, number> = {};
    for (let cell = 0; cell < mesh.cells; cell++) if (!planet.water[cell] && Math.hypot(mesh.x[cell] - x, mesh.y[cell] - y) < o.radius) given[cell] = id;
    o.change((current) => ({ ...current, [field]: { ...current[field], ...given } }));
  };
  if (tool === "paint") handOver("owners", o.paint.realm);
  else if (tool === "people") handOver("cultures", o.paint.people);
  else if (tool === "faith") handOver("faiths", o.paint.faith);
  else if (tool === "province") handOver("provinces", o.paint.province);
  else if (tool === "label") {
    const words = prompt(o.t("editor.labelText"));
    if (words) o.change((current) => ({ ...current, labels: [...(current.labels ?? []), [...at, words, 14]] }));
  } else if (tool === "zone") {
    const label = o.paint.zone === "custom" ? (prompt(o.t("editor.zoneLabel")) ?? "") : "";
    o.change((current) => ({ ...current, zones: [...(current.zones ?? []), [...at, o.radius, o.paint.zone, label]] }));
  } else if (tool === "move") {
    if (o.moving === null) o.setMoving(town() || null);
    else {
      const id = o.moving;
      o.change((current) => ({ ...current, moved: { ...current.moved, [id]: at } }));
      o.setMoving(null);
    }
  } else if (tool === "add") {
    const cell = mesh.find(x, y);
    if (planet.water[cell]) return;
    const people = planet.cultures[planet.culture[cell]] ?? planet.cultures[0];
    const founded = name({ ...people.language }, createRng(`${planet.params.seed}/founded-${edits?.added.length ?? 0}`), "town");
    o.change((current) => ({ ...current, added: [...current.added, [...at, founded, foundedSize(planet, cell)]] }));
  } else if (tool === "remove") {
    const id = town();
    if (id && !planet.burgs[id].capital) o.change((current) => ({ ...current, removed: [...current.removed, id] }));
  }
}

export function WorldEditor({ t, nm, planet, edits, tool, setTool, brush, setBrush, paint, setPaint, moving, started, selection, change, onImage, onGeo, canUndo, onUndo, onReset, tools }: Props) {
  const towns = edits ? Object.keys(edits.moved).length + edits.added.length + edits.removed.length + Object.keys(edits.towns ?? {}).length : 0;
  const realm = !tools && selection?.kind === "state" && selection.id ? planet.states[selection.id] : null;
  const town = selection?.kind === "burg" ? planet.burgs[selection.id] : null;
  const select = (label: string, value: number, items: { id: number; name: string }[], set: (id: number) => void) => (
    <label>
      {label}
      <select value={value} onChange={(event) => set(Number(event.target.value))}>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {nm(item.name)}
          </option>
        ))}
      </select>
    </label>
  );
  const realmEdit = (set: NonNullable<PlanetEdits["realms"]>[number]) =>
    realm && change((current) => ({ ...current, realms: { ...current.realms, [realm.id]: { ...current.realms?.[realm.id], ...set } } }));
  const townEdit = (id: number, set: NonNullable<PlanetEdits["towns"]>[number]) => change((current) => ({ ...current, towns: { ...current.towns, [id]: { ...current.towns?.[id], ...set } } }));
  return (
    <details className="editor" onToggle={(event) => !(event.currentTarget as HTMLDetailsElement).open && setTool(null)}>
      <summary>✏️ {t("editor.title")}</summary>
      {GROUPS.map(([group, all]) => [group, all.filter((id) => !tools || tools.includes(id))] as const).filter(([, shown]) => shown.length).map(([group, shown]) => (
        <div key={group}>
          <h4 className="muted">{t(`editor.group.${group}`)}</h4>
          <div className="floor-tabs">
            {shown.map((id) => (
              <button key={id} type="button" aria-pressed={tool === id} onClick={() => setTool(tool === id ? null : id)}>
                {t(`editor.tool.${id}`)}
              </button>
            ))}
          </div>
        </div>
      ))}
      {tool && BRUSHED.includes(tool) ? (
        <label>
          {t("editor.radius")}
          <input type="range" min={15} max={200} value={brush.radius} onChange={(event) => setBrush({ ...brush, radius: Number(event.target.value) })} />
        </label>
      ) : null}
      {tool === "raise" || tool === "lower" || tool === "ridge" || tool === "trench" ? (
        <label>
          {t("editor.strength")}
          <input type="range" min={2} max={30} value={brush.strength} onChange={(event) => setBrush({ ...brush, strength: Number(event.target.value) })} />
        </label>
      ) : null}
      {tool === "paint" ? select(t("editor.realm"), paint.realm, planet.states.slice(1).filter((item) => item.cells), (id) => setPaint({ ...paint, realm: id })) : null}
      {tool === "people" ? select(t("editor.people"), paint.people, planet.cultures.slice(1), (id) => setPaint({ ...paint, people: id })) : null}
      {tool === "faith" ? select(t("editor.faith"), paint.faith, planet.religions.slice(1), (id) => setPaint({ ...paint, faith: id })) : null}
      {tool === "province" ? select(t("editor.province"), paint.province, planet.provinces.slice(1), (id) => setPaint({ ...paint, province: id })) : null}
      {tool === "zone" ? (
        <label>
          {t("editor.zone")}
          <select value={paint.zone} onChange={(event) => setPaint({ ...paint, zone: event.target.value })}>
            {ZONES.map((kind) => (
              <option key={kind} value={kind}>
                {t(`zone2.${kind}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {tool ? <p className="muted">{moving !== null ? t("editor.hint.moving", { name: nm(planet.burgs[moving].name) }) : started ? t("editor.hint.second") : t(`editor.hint.${tool}`)}</p> : null}
      {!tools || tools.includes("raise") ? (
        <label>
          🖼 {t("editor.image")}
          <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && onImage(event.target.files[0])} />
        </label>
      ) : null}
      {onGeo && (!tools || tools.includes("raise")) ? (
        <label title={t("editor.geoHint")}>
          🗺 {t("editor.geo")}
          <input
            type="file"
            accept=".json,.geojson,application/json,application/geo+json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onGeo(file);
            }}
          />
        </label>
      ) : null}
      {edits?.image ? (
        <button type="button" onClick={() => change((current) => ({ ...current, image: undefined }))}>
          ✕ {t("editor.noImage")}
        </button>
      ) : null}

      {realm ? (
        <div className="gm-block">
          <h4>{t("editor.realmEdit", { name: nm(realm.name) })}</h4>
          <label>
            {t("editor.form")}
            <select value={realm.formKey} onChange={(event) => realmEdit({ formKey: event.target.value })}>
              {[...new Set([realm.formKey, ...FORMS])].map((key) => (
                <option key={key} value={key}>
                  {t(`form.${key}`, { name: nm(realm.name) })}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("editor.color")}
            <input type="color" value={/^#[0-9a-f]{6}$/iu.test(realm.color) ? realm.color : "#888888"} onChange={(event) => realmEdit({ color: event.target.value })} />
          </label>
          {select(
            t("editor.capital"),
            realm.capital,
            planet.burgs.filter((item) => item.id && !item.removed && item.state === realm.id),
            (id) => realmEdit({ capital: id }),
          )}
          <label>
            {t("editor.merge")}
            <select
              value=""
              onChange={(event) => {
                const into = Number(event.target.value);
                if (into && confirm(t("editor.mergeAsk", { name: nm(realm.name), into: nm(planet.states[into].name) }))) change((current) => ({ ...current, merged: [...(current.merged ?? []), [realm.id, into]] }));
              }}
            >
              <option value="">—</option>
              {planet.states.slice(1).filter((item) => item.cells && item.id !== realm.id).map((item) => (
                <option key={item.id} value={item.id}>
                  {nm(item.name)}
                </option>
              ))}
            </select>
          </label>
          {realm.neighbors.map((other) => (
            <label key={other}>
              {nm(planet.states[other].name)}
              <select value={realm.relations[other] ?? "neutral"} onChange={(event) => change((current) => ({ ...current, relations: [...(current.relations ?? []).filter(([a, b]) => !(a === realm.id && b === other) && !(a === other && b === realm.id)), [realm.id, other, event.target.value]] }))}>
                {RELATIONS.map((relation) => (
                  <option key={relation} value={relation}>
                    {t(`relation.${relation}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
      {town && !town.removed ? (
        <div className="gm-block">
          <h4>{t("editor.townEdit", { name: nm(town.name) })}</h4>
          <label>
            {t("editor.population")}
            <NumberInput min={0.01} max={50000} step="any" value={town.population} onChange={(value) => townEdit(town.id, { population: value })} />
          </label>
          {(["walls", "port"] as const).map((key) => (
            <label key={key} className="check">
              <input type="checkbox" checked={town[key]} onChange={(event) => townEdit(town.id, { [key]: event.target.checked })} />
              {t(`burg.${key}`)}
            </label>
          ))}
          {!town.capital ? (
            <div className="row-buttons">
              <button type="button" onClick={() => change((current) => ({ ...current, realms: { ...current.realms, [town.state]: { ...current.realms?.[town.state], capital: town.id } } }))}>
                ★ {t("editor.makeCapital")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const name = prompt(t("editor.raiseName"), town.name);
                  if (name) change((current) => ({ ...current, raised: [...(current.raised ?? []), { town: town.id, name, color: `#${Math.floor(0x404040 + Math.random() * 0x9f9f9f).toString(16).padStart(6, "0")}` }] }));
                }}
              >
                ⚑ {t("editor.raise")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {edits ? <p className="muted">{t("editor.summary", { terrain: edits.terrain.length, owners: Object.keys(edits.owners).length, towns })}</p> : null}
      <div className="gm-row">
        <button type="button" disabled={!canUndo} onClick={onUndo}>
          ↶ {t("editor.undo")}
        </button>
        <button type="button" disabled={!edits} onClick={onReset}>
          {t("editor.reset")}
        </button>
      </div>
    </details>
  );
}
