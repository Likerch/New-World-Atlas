// The building level: floor plans, floor by floor, with the rooms' furnishings; the roofs from above; the building's
// key (who lives there, room by room what is there and what is said of it); the GM's edits of rooms and doors.
import { useMemo, useRef, useState } from "react";
import {
  BUILDING_SHAPES,
  BUILDING_THEMES,
  BUILDING_TYPES,
  DOOR_KINDS,
  LOCK_KINDS,
  MATERIALS,
  MAX_FLOORS,
  ERA_BUILDINGS,
  buildingFromCity,
  buildingKey,
  buildingLegend,
  buildingParams,
  buildingView,
  DOOR_WALL,
  editBuilding,
  ERAS,
  generateBuilding,
  generateRoom,
  localFromHatch,
  localFromCellar,
  mapKeyOf,
  materialOf,
  neighbours,
  PX,
  renderBuilding,
  renderRoom,
  roomSalts,
  ROOM_PX,
  sharedWall,
  TYPE_SHAPE,
  type BuildingEdits,
  type BuildingParams,
  type BuildingPlan,
  type BuildingThemeId,
  type City,
  type Language,
  type LocalLink,
  type RoomKind,
} from "../../core/index";
import { BuildingTypes, loadList, saveList } from "../CityKinds";
import { NumberInput } from "../NumberInput";
import { NpcCard, PeopleList, RumourList, say } from "../People";
import type { Level, LevelContext } from "./types";
import { printPage } from "../desktop";

/** Room kinds the GM can give a room. */
const ROOM_KINDS: RoomKind[] = ["hall", "common-room", "kitchen", "pantry", "bedroom", "guest-room", "storage", "workshop", "shop-floor", "office", "study", "chapel", "nave", "sacristy", "armory", "barracks", "throne-room", "bath", "cellar", "cell", "living-room", "dining", "lobby", "operating-room", "waiting-room", "dance-floor", "bar", "vip", "toilet", "server-room", "atrium", "garden", "classroom", "gym", "canteen", "machine-hall", "boiler-room", "vault", "lab", "grow-room", "capsules", "garage", "vestibule", "attic", "guard-room", "ballroom", "gallery", "ritual-room", "stage", "auditorium", "mill-room"];

export function useBuildingLevel(ctx: LevelContext, back: (() => void) | null, openLocal?: (link: LocalLink | null, entity: string) => void): Level & { openFromCity: (city: City, index: number) => void } {
  const { t, nm } = ctx;
  const pending = useRef(false);
  const [input, setInput] = useState<BuildingParams>(() => buildingParams({ type: "tavern" }));
  const [raw, setPlan] = useState<BuildingPlan | null>(null);
  const [language, setLanguage] = useState<Language | null>(null);
  const [floor, setFloor] = useState(0);
  const [theme, setTheme] = useState<BuildingThemeId>("ink");
  const [grid, setGrid] = useState(false);
  const [roof, setRoof] = useState(false);
  const [room, setRoom] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [close, setClose] = useState<number | null>(null);
  const [kinds, setKinds] = useState(() => loadList("atlas.kinds.building"));

  const build = (next: BuildingParams) => {
    pending.current = true;
    ctx.run(() => {
      pending.current = false;
      const made = generateBuilding(next);
      setPlan(made);
      setInput(made.params);
      setFloor(Math.max(0, made.floors.findIndex((f) => f.level === 0)));
      setRoom(null);
      setClose(null);
      setRoof(false);
      setVersion((v) => v + 1);
    });
  };
  const set = <K extends keyof BuildingParams>(key: K, value: BuildingParams[K]) => setInput((current) => ({ ...current, [key]: value }));
  // A house's key: its seed and a print of what it was built as (another type, size or floors is another plan).
  const mapKey = raw ? mapKeyOf("building", raw.params as unknown as Record<string, unknown>) : null;
  const patch = ctx.patch(mapKey);
  const edits = (patch.changes?.building ?? null) as BuildingEdits | null;
  const setEdits = (change: (edits: BuildingEdits) => BuildingEdits) => ctx.update(mapKey, (p) => ({ ...p, changes: { ...p.changes, building: change((p.changes?.building ?? {}) as BuildingEdits) } }));
  // The GM's edits laid over the plan, and the key of who and what is in it.
  const plan = useMemo(() => (raw ? editBuilding(raw, edits) : null), [raw, edits]);
  const key = useMemo(() => (plan ? buildingKey(plan, language, roomSalts(edits)) : null), [plan, language, edits]);
  // Names follow the building's age: a tavern after the fall is a saloon, a temple's nave in antiquity its cella.
  const era = plan?.params.era ?? input.era;
  const roomName = (kind: string | undefined) => t(`room.${kind}@${era}`);
  const typeName = (type: string, params?: BuildingParams) => (type === "custom" ? params?.customType?.name || t("custom.unnamed") : t(`btype.${type}@${era}`));
  const names = ctx.names(mapKey);
  const current = plan?.floors[floor];
  // A room's name: the GM's own, else its kind in the building's age.
  const roomLabel = (id: number | null, kind: string | undefined) => (current && id !== null && names[`room:${current.level}:${id}`]) || roomName(kind);
  const numberOf = (level: number, id: number) => key?.rooms.find((entry) => entry.level === level && entry.room === id)?.n ?? null;
  const streetLabel = plan?.params.street ? `${nm(plan.params.street)}${plan.params.house ? `, ${plan.params.house}` : ""}` : undefined;
  const svg = useMemo(() => (plan && current ? renderBuilding(plan, { theme, floor, grid, roof, highlight: room, players: ctx.players, street: streetLabel, numbers: (r) => numberOf(current.level, r.id), label: (kind, item) => roomLabel(item.id, kind) }) : ""), [plan, theme, floor, grid, roof, room, t, names, ctx.players, key, streetLabel]); // eslint-disable-line react-hooks/exhaustive-deps
  // The roof seen from above has no furniture to explain.
  const legend = useMemo(() => (plan && !roof ? buildingLegend(plan, { theme, floor, players: ctx.players }) : undefined), [plan, theme, floor, ctx.players, roof]);
  const roomMap = useMemo(() => (plan && close !== null ? generateRoom(plan, floor, close) : null), [plan, floor, close]);
  const roomSvg = useMemo(() => (roomMap ? renderRoom(roomMap, { theme, grid: true, players: ctx.players, label: roomLabel(close, roomMap.kind) }) : ""), [roomMap, theme, ctx.players, t, era, names]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = plan ? buildingView(plan) : null;
  const floorName = (level: number) => (plan && plan.params.attic && level === plan.params.floors ? t("floor.attic") : level < 0 ? t("floor.cellar") : level === 0 ? t("floor.ground") : t("floor.upper", { n: level + 1 }));
  const words = (item: { key: string; vars: Record<string, string | number> }) => say(t, nm, item);
  const money = (n: number) => t(`price.${era}`, { n });

  // Walk to a room: on this floor, or up and down the stairs to the stairwell of the next floor.
  const goTo = (level: number, id: number) => {
    if (!plan) return;
    const index = plan.floors.findIndex((f) => f.level === level);
    if (index < 0) return;
    setFloor(index);
    setRoom(id);
    setClose(null);
    setRoof(false);
  };

  // A sheet to print: every floor with its numbers, and the key below.
  const printSheet = () => {
    if (!plan || !key) return;
    const title = plan.params.name ? nm(plan.params.name) : typeName(plan.params.type, plan.params);
    const esc = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
    const sheets = plan.floors.map((f, index) => `<section><h2>${esc(floorName(f.level))}</h2>${renderBuilding(plan, { theme, floor: index, numbers: (r) => numberOf(f.level, r.id), label: (kind, item) => names[`room:${f.level}:${item.id}`] || roomName(kind), street: streetLabel })}</section>`).join("");
    const entries = key.rooms
      .map((item) => {
        const kind = plan.floors.find((f) => f.level === item.level)?.rooms.find((r) => r.id === item.room)?.kind;
        const lines = [
          item.occupants.length ? `${t("key.occupants")}: ${item.occupants.map((npc) => `${nm(npc.name)} (${t(`role.${npc.role}@${era}`)})`).join(", ")}` : "",
          item.valuables.length ? `${t("key.valuables")}: ${item.valuables.map((v) => `${t(v.key)} — ${money(v.value)}${v.hidden ? ` (${t("room.hidden")})` : ""}`).join(", ")}` : "",
          item.clues.length ? `${t("key.clues")}: ${item.clues.map(words).join("; ")}` : "",
        ].filter(Boolean);
        return `<li><b>${item.n}. ${esc(names[`room:${item.level}:${item.room}`] || roomName(kind))}</b> — ${esc(t(item.detail))}${lines.map((line) => `<br/>${esc(line)}`).join("")}</li>`;
      })
      .join("");
    printPage(`<!doctype html><html lang="${ctx.locale}"><head><meta charset="utf-8"/><title>${esc(title)}</title><style>body{font-family:'Segoe UI',Arial,sans-serif;margin:24px;color:#2b2620}section{page-break-inside:avoid;margin-bottom:24px}svg{max-width:100%;height:auto}li{margin:4px 0}</style></head><body><h1>${esc(title)}</h1><p>${esc(`${t("npc.owner")}: ${nm(key.owner.name)}, ${t(`role.${key.owner.role}@${era}`)} · ${words(key.hook)}`)}</p>${sheets}<h2>${esc(t("key.title"))}</h2><ol style="list-style:none;padding:0">${entries}</ol></body></html>`);
  };

  const selectedRoom = current?.rooms.find((r) => r.id === room);
  const entry = selectedRoom && current ? key?.rooms.find((item) => item.level === current.level && item.room === selectedRoom.id) : undefined;
  const roomEdit = selectedRoom && current ? edits?.rooms?.[`${current.level}:${selectedRoom.id}`] : undefined;

  return {
    id: "building",
    legend,
    icon: "🏠",
    title: plan ? names.world || plan.params.name || typeName(plan.params.type, plan.params) : null,
    mapKey,
    // Each floor and each room up close has its own pins and fog; the ground floor keeps the building's own.
    sheetKey: !mapKey || !current ? mapKey : close !== null ? `${mapKey}#room-${current.level}-${close}` : roof ? `${mapKey}#roof` : current.level === 0 ? mapKey : `${mapKey}#floor-${current.level}`,
    params: raw ? (raw.params as unknown as Record<string, unknown>) : null,
    language,
    restore: (saved, tongue) => {
      setLanguage(tongue ?? null);
      build(saved as unknown as BuildingParams);
    },
    selected: !plan || !current ? null : room !== null ? { key: `room:${current.level}:${room}`, label: roomLabel(room, current.rooms.find((r) => r.id === room)?.kind) } : { key: "world", label: plan.params.name || typeName(plan.params.type, plan.params) },
    seed: input.seed,
    setSeed: (seed) => set("seed", seed),
    generate: (seed) => {
      const next = seed ? { ...input, seed } : input;
      // The same house built another way is another map: the maps opened from it go, so the GM is asked first.
      if (!raw || next.seed !== raw.params.seed || ctx.regrow(mapKey, mapKeyOf("building", generateBuilding(next).params as unknown as Record<string, unknown>))) build(next);
    },
    ensure: () => {
      // Only when nothing is on its way: an opened building or city must not be replaced by a fresh one.
      if (!plan && !pending.current) build(input);
    },
    openFromCity: (city, index) => {
      setLanguage(city.language);
      build(buildingFromCity(city, index));
      ctx.show("building");
    },
    map: roomMap
      ? { svg: roomSvg, width: (roomMap.w + 1.6) * ROOM_PX, height: (roomMap.h + 1.6) * ROOM_PX, key: `room-${roomMap.seed}`, onPick: () => undefined }
      : plan && view
        ? {
            svg,
            width: view.w * PX,
            height: view.h * PX,
            key: `building-${version}`,
            onPick: (x, y) => {
              if (roof) return;
              // The plan's origin sits inside the view box; undo its offset to get metres.
              const mx = x / PX + view.x;
              const my = y / PX + view.y;
              const hit = current?.rooms.find((r) => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h);
              setRoom(hit ? hit.id : null);
            },
          }
        : null,
    controls: (
      <>
        {close !== null ? (
          <button type="button" className="back" onClick={() => setClose(null)}>
            ← {t("action.backToFloor")}
          </button>
        ) : null}
        {back ? (
          <button type="button" className="back" onClick={back}>
            ← {t("action.backToCity")}
          </button>
        ) : null}
        <h2>{t("panel.floors")}</h2>
        <div className="floor-tabs">
          {plan?.floors.map((f, index) => (
            <button
              key={f.level}
              type="button"
              aria-pressed={index === floor && !roof}
              onClick={() => {
                // Another floor has other rooms: the room picked and the room up close stay behind.
                setFloor(index);
                setRoof(false);
                setRoom(null);
                setClose(null);
              }}
            >
              {floorName(f.level)}
            </button>
          ))}
          {plan ? (
            <button
              type="button"
              aria-pressed={roof}
              onClick={() => {
                setRoof(!roof);
                setClose(null);
              }}
            >
              {t("floor.roof")}
            </button>
          ) : null}
        </div>
        <h2>{t("panel.building")}</h2>
        <label>
          {t("field.type")}
          <select
            value={input.type === "custom" ? `custom:${input.customType?.id ?? ""}` : input.type}
            onChange={(event) => {
              const value = event.target.value;
              if (value.startsWith("custom:")) {
                const own = kinds.find((kind) => kind.id === value.slice(7));
                if (own) setInput((before) => ({ ...before, type: "custom", customType: own, width: own.width, depth: own.depth, floors: own.floors, cellar: own.cellar.length > 0, shape: undefined }));
                return;
              }
              const type = value as BuildingParams["type"];
              setInput((before) => ({ ...before, type, customType: undefined, shape: TYPE_SHAPE[type] }));
            }}
          >
            <optgroup label={t("building.ofAge")}>
              {ERA_BUILDINGS[input.era].map((type) => (
                <option key={type} value={type}>
                  {t(`btype.${type}@${input.era}`)}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("building.otherAges")}>
              {BUILDING_TYPES.filter((type) => !ERA_BUILDINGS[input.era].includes(type)).map((type) => (
                <option key={type} value={type}>
                  {t(`btype.${type}@${input.era}`)}
                </option>
              ))}
            </optgroup>
            {kinds.length || input.type === "custom" ? (
              <optgroup label={t("custom.ownTypes")}>
                {input.type === "custom" && input.customType && !kinds.some((kind) => kind.id === input.customType!.id) ? <option value={`custom:${input.customType.id}`}>{input.customType.name || t("custom.unnamed")}</option> : null}
                {kinds.map((kind) => (
                  <option key={kind.id} value={`custom:${kind.id}`}>
                    {kind.name || t("custom.unnamed")}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <label>
          {t("field.era")}
          <select
            value={input.era}
            onChange={(event) => {
              // A new age offers its own buildings; a type it never raised gives way to its first.
              const next = event.target.value as BuildingParams["era"];
              setInput((before) => ({ ...before, era: next, type: before.type === "custom" || ERA_BUILDINGS[next].includes(before.type) ? before.type : ERA_BUILDINGS[next][0] }));
            }}
          >
            {ERAS.map((item) => (
              <option key={item} value={item}>
                {t(`era.${item}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("field.shape")}
          <select value={input.shape ?? "rect"} onChange={(event) => set("shape", event.target.value === "rect" ? undefined : (event.target.value as BuildingParams["shape"]))}>
            {BUILDING_SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {t(`bshape.${shape}`)}
              </option>
            ))}
          </select>
        </label>
        {(["width", "depth", "floors"] as const).map((field) => (
          <label key={field}>
            {t(`field.${field}`)}
            <NumberInput min={field === "floors" ? 1 : 4} max={field === "floors" ? MAX_FLOORS : 60} value={input[field]} onChange={(value) => set(field, value)} />
          </label>
        ))}
        {(["cellar", "yard", "attic", "hatch"] as const).map((field) => (
          <label key={field} className="check">
            <input type="checkbox" checked={!!input[field]} onChange={(event) => set(field, event.target.checked)} />
            {t(`field.${field}`)}
          </label>
        ))}
        <label>
          {t("field.material")}
          <select value={input.material ?? ""} onChange={(event) => set("material", (event.target.value || undefined) as BuildingParams["material"])}>
            <option value="">{t("material.auto")}</option>
            {MATERIALS.map((material) => (
              <option key={material} value={material}>
                {t(`material.${material}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("field.decay")}
          <input type="range" min={0} max={1} step={0.1} value={input.decay ?? 0} onChange={(event) => set("decay", Number(event.target.value) || undefined)} />
        </label>
        <label>
          {t("field.magic")}
          <select value={input.magic ?? 0} onChange={(event) => set("magic", Number(event.target.value) || undefined)}>
            {[0, 1, 2, 3].map((level) => (
              <option key={level} value={level}>
                {t(`magic.${level}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("field.theme")}
          <select value={theme} onChange={(event) => setTheme(event.target.value as BuildingThemeId)}>
            {BUILDING_THEMES.map((id) => (
              <option key={id} value={id}>
                {t(`btheme.${id}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />
          {t("field.grid")}
        </label>
        <BuildingTypes
          t={t}
          value={kinds}
          onChange={(next) => {
            setKinds(next);
            saveList("atlas.kinds.building", next);
          }}
        />
      </>
    ),
    inspector:
      plan && current && key ? (
        <aside className="inspector">
          {!selectedRoom ? (
            <div className="card">
              <h3>{plan.params.name ? nm(plan.params.name) : typeName(plan.params.type, plan.params)}</h3>
              <div className="row">
                <span>{t("field.type")}</span>
                <b>{typeName(plan.params.type, plan.params)}</b>
              </div>
              {plan.params.type === "custom" && plan.params.customType?.description ? <p className="muted">{plan.params.customType.description}</p> : null}
              {streetLabel ? (
                <div className="row">
                  <span>{t("stat.address")}</span>
                  <b>{streetLabel}</b>
                </div>
              ) : null}
              <div className="row">
                <span>{t("field.material")}</span>
                <b>{t(`material.${materialOf(plan)}`)}</b>
              </div>
              {plan.params.decay ? (
                <div className="row">
                  <span>{t("field.decay")}</span>
                  <b>{t(`decay.${plan.params.decay > 0.7 ? "ruin" : plan.params.decay > 0.35 ? "worn" : "shabby"}`)}</b>
                </div>
              ) : null}
              {plan.params.magic ? (
                <div className="row">
                  <span>{t("field.magic")}</span>
                  <b>{t(`magic.${plan.params.magic}`)}</b>
                </div>
              ) : null}
              <h4 className="muted">{t("npc.owner")}</h4>
              <ul className="list people">
                <NpcCard t={t} nm={nm} npc={key.owner} age={era} />
              </ul>
              {key.faction ? <p className="muted">{t("npc.answers", { faction: t(`faction.${key.faction.kind}`, { name: nm(key.faction.name) }) })}</p> : null}
              {!ctx.players ? <p className="muted">🎣 {words(key.hook)}</p> : null}
              {key.inventory.length ? (
                <>
                  <h4 className="muted">{t("shop.goods", { craft: t(`craft.${plan.params.craft}@${era}`) })}</h4>
                  <ul className="plain">
                    {key.inventory.map((item) => (
                      <li key={item.key}>
                        {t(item.key)} — {money(item.price)} {item.stock ? `(${t("shop.stock", { n: item.stock })})` : `(${t("shop.none")})`}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <RumourList t={t} nm={nm} rumours={key.rumours} players={ctx.players} />
              <PeopleList t={t} nm={nm} people={key.household.slice(1, 12)} age={era} />
              <button type="button" className="wide" data-tour="print-sheet" onClick={printSheet}>
                🖨 {t("action.printSheet")}
              </button>
              <p className="muted">{t("building.hint")}</p>
            </div>
          ) : (
            (() => {
              const counts = new Map<string, number>();
              for (const f of selectedRoom.furniture) if (!(ctx.players && f.kind === "hatch")) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
              const ways = neighbours(current, selectedRoom.id).filter((way) => !way.door.walled && (!way.door.secret || !ctx.players));
              const doorKey = (index: number) => `${current.level}:${index}`;
              // Rooms a door can be broken through to: by the very test the new door is made by.
              const touching = current.rooms.filter((other) => other.id !== selectedRoom.id && other.kind !== "stairs" && !neighbours(current, selectedRoom.id).some((way) => way.room === other.id) && sharedWall(selectedRoom, other, DOOR_WALL));
              const hatch = selectedRoom.furniture.some((f) => f.kind === "hatch");
              const setDoor = (index: number, change: NonNullable<BuildingEdits["doors"]>[string]) => setEdits((e) => ({ ...e, doors: { ...e.doors, [doorKey(index)]: { ...e.doors?.[doorKey(index)], ...change } } }));
              const roomKey = `${current.level}:${selectedRoom.id}`;
              return (
                <div className="card">
                  <h3>
                    {entry ? `${entry.n}. ` : ""}
                    {roomLabel(selectedRoom.id, selectedRoom.kind)}
                  </h3>
                  <div className="row">
                    <span>{t("stat.size")}</span>
                    <b>
                      {selectedRoom.w.toFixed(1)} × {selectedRoom.h.toFixed(1)} {t("unit.m")} ({(selectedRoom.w * selectedRoom.h).toFixed(0)} {t("unit.m")}²)
                    </b>
                  </div>
                  {entry ? <p className="muted">{t(entry.detail)}</p> : null}
                  <p className="muted">{[...counts].map(([kind, count]) => `${t(`furniture.${kind}`)}${count > 1 ? ` ×${count}` : ""}`).join(", ")}</p>
                  {entry ? <PeopleList t={t} nm={nm} people={entry.occupants} age={era} /> : null}
                  {entry && entry.valuables.some((v) => !v.hidden || !ctx.players) ? (
                    <>
                      <h4 className="muted">{t("key.valuables")}</h4>
                      <ul className="plain">
                        {entry.valuables
                          .filter((v) => !v.hidden || !ctx.players)
                          .map((v, k) => (
                            <li key={k}>
                              {t(v.key)} — {money(v.value)}
                              {v.hidden ? <small className="secret"> — {t("room.hidden")}</small> : null}
                            </li>
                          ))}
                      </ul>
                    </>
                  ) : null}
                  {entry && entry.clues.length && !ctx.players ? (
                    <>
                      <h4 className="muted">{t("key.clues")}</h4>
                      <ul className="plain">
                        {entry.clues.map((clue, k) => (
                          <li key={k}>🔎 {words(clue)}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {entry ? <RumourList t={t} nm={nm} rumours={entry.rumours} players={ctx.players} /> : null}
                  <h4 className="muted">{t("building.ways")}</h4>
                  <div className="ways">
                    {ways.map((way) => (
                      <button key={way.index} type="button" className="link" disabled={way.room < 0} onClick={() => goTo(current.level, way.room)}>
                        → {way.room < 0 ? t("building.outside") : roomLabel(way.room, current.rooms.find((r) => r.id === way.room)?.kind)}
                        {way.door.secret ? ` (${t("edit.secret")})` : ""}
                      </button>
                    ))}
                    {selectedRoom.kind === "stairs"
                      ? plan.floors
                          .filter((f) => Math.abs(f.level - current.level) === 1)
                          .map((f) => {
                            const stair = f.rooms.find((r) => r.kind === "stairs") ?? f.rooms[0];
                            return (
                              <button key={f.level} type="button" className="link" onClick={() => goTo(f.level, stair.id)}>
                                {f.level > current.level ? "↑" : "↓"} {floorName(f.level)}
                              </button>
                            );
                          })
                      : null}
                  </div>
                  {hatch && openLocal && !ctx.players ? (
                    <button type="button" className="primary wide" onClick={() => openLocal(localFromHatch(plan, language), `hatch:${current.level}:${selectedRoom.id}`)}>
                      ⬇ {t("action.downHatch")}
                    </button>
                  ) : null}
                  {current.level < 0 && openLocal && !ctx.players && localFromCellar(plan, language) ? (
                    <button type="button" className="wide" onClick={() => openLocal(localFromCellar(plan, language), "cellar")}>
                      🕯 {t("action.cellarDeep")}
                    </button>
                  ) : null}
                  {close === null ? (
                    <button type="button" className="primary wide" onClick={() => setClose(selectedRoom.id)}>
                      🔍 {t("action.openRoom")}
                    </button>
                  ) : null}
                  {roomMap && close === selectedRoom.id ? (
                    <>
                      <h4>{t("room.items")}</h4>
                      <ul className="plain">
                        {roomMap.items
                          .filter((item) => item.kind !== "rug" && (!item.hidden || !ctx.players))
                          .map((item, k) => (
                            <li key={k}>
                              {t(`item.${item.kind}`)}
                              {item.hidden ? ` — ${t("room.hidden")}` : ""}
                            </li>
                          ))}
                      </ul>
                      <p className="muted">{t("room.cover", { full: roomMap.cover.filter((c) => c.full).length, half: roomMap.cover.filter((c) => !c.full).length })}</p>
                    </>
                  ) : null}
                  {!ctx.players ? (
                    <details className="editor">
                      <summary>✎ {t("edit.room")}</summary>
                      <label>
                        {t("edit.purpose")}
                        <select value={selectedRoom.kind} onChange={(event) => setEdits((e) => ({ ...e, rooms: { ...e.rooms, [roomKey]: { ...e.rooms?.[roomKey], kind: event.target.value as RoomKind } } }))}>
                          {[...new Set([selectedRoom.kind, ...ROOM_KINDS])].map((kind) => (
                            <option key={kind} value={kind}>
                              {roomName(kind)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="gm-row">
                        <button type="button" onClick={() => setEdits((e) => ({ ...e, rooms: { ...e.rooms, [roomKey]: { ...e.rooms?.[roomKey], salt: (e.rooms?.[roomKey]?.salt ?? 0) + 1 } } }))}>
                          🎲 {t("edit.reroll")}
                        </button>
                        {roomEdit ? (
                          <button
                            type="button"
                            onClick={() =>
                              setEdits((e) => {
                                const rooms = { ...e.rooms };
                                delete rooms[roomKey];
                                return { ...e, rooms };
                              })
                            }
                          >
                            ↺ {t("edit.undo")}
                          </button>
                        ) : null}
                      </div>
                      <h4 className="muted">{t("edit.doors")}</h4>
                      {neighbours(current, selectedRoom.id).map((way) => (
                        <div key={way.index} className="door-edit">
                          <small>→ {way.room < 0 ? t("building.outside") : roomLabel(way.room, current.rooms.find((r) => r.id === way.room)?.kind)}</small>
                          <div className="custom-row">
                            <select value={way.door.kind ?? "plain"} aria-label={t("edit.doorKind")} onChange={(event) => setDoor(way.index, { kind: event.target.value as (typeof DOOR_KINDS)[number] })}>
                              {DOOR_KINDS.map((kind) => (
                                <option key={kind} value={kind}>
                                  {t(`door.${kind}`)}
                                </option>
                              ))}
                            </select>
                            <select value={way.door.lock ?? "none"} aria-label={t("edit.lock")} onChange={(event) => setDoor(way.index, { lock: event.target.value as (typeof LOCK_KINDS)[number] })}>
                              {LOCK_KINDS.map((lock) => (
                                <option key={lock} value={lock}>
                                  {t(`lock.${lock}`)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="custom-row">
                            <label className="check">
                              <input type="checkbox" checked={!!way.door.secret} onChange={(event) => setDoor(way.index, { secret: event.target.checked })} />
                              {t("edit.secret")}
                            </label>
                            <label className="check">
                              <input type="checkbox" checked={!!way.door.walled} onChange={(event) => setDoor(way.index, { removed: event.target.checked })} />
                              {t("edit.walled")}
                            </label>
                          </div>
                        </div>
                      ))}
                      {touching.length ? (
                        <label>
                          {t("edit.addDoor")}
                          <select
                            value=""
                            onChange={(event) => {
                              const other = Number(event.target.value);
                              if (event.target.value !== "" && Number.isFinite(other)) setEdits((e) => ({ ...e, added: [...(e.added ?? []), { level: current.level, a: selectedRoom.id, b: other }] }));
                            }}
                          >
                            <option value="">—</option>
                            {touching.map((other) => (
                              <option key={other.id} value={other.id}>
                                {roomLabel(other.id, other.kind)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </details>
                  ) : null}
                  <button type="button" className="link" data-tour="whole-building" onClick={() => setRoom(null)}>
                    ← {t("building.whole")}
                  </button>
                </div>
              );
            })()
          )}
          <h4 className="muted">{roof ? t("floor.roof") : floorName(current.level)}</h4>
          <ul className="list keyed">
            {current.rooms
              .filter((r) => r.kind !== "stairs")
              .map((r) => (
                <li key={r.id} aria-selected={r.id === room} onClick={() => setRoom(r.id)}>
                  {numberOf(current.level, r.id) ? <span className="badge">{numberOf(current.level, r.id)}</span> : null}
                  <span className="grow">{roomLabel(r.id, r.kind)}</span>
                  <small>{(r.w * r.h).toFixed(0)} {t("unit.m")}²</small>
                </li>
              ))}
          </ul>
        </aside>
      ) : null,
    status: plan ? t("building.summary", { rooms: plan.floors.reduce((s, f) => s + f.rooms.length, 0), floors: plan.floors.length, w: plan.params.width, d: plan.params.depth }) : "",
    data: () => (plan ? { format: "new-world-atlas/building", version: 1, ...plan, key } : null),
  };
}
