// The building level: floor plans, floor by floor, with the rooms' furnishings.
import { useMemo, useRef, useState } from "react";
import { BUILDING_THEMES, BUILDING_TYPES, ERA_BUILDINGS, buildingFromCity, buildingParams, ERAS, generateBuilding, generateRoom, PX, renderBuilding, renderRoom, ROOM_PX, type BuildingParams, type BuildingPlan, type BuildingThemeId, type City, buildingLegend } from "../../core/index";
import type { Level, LevelContext } from "./types";

export function useBuildingLevel(ctx: LevelContext, back: (() => void) | null): Level & { openFromCity: (city: City, index: number) => void } {
  const { t } = ctx;
  const pending = useRef(false);
  const [input, setInput] = useState<BuildingParams>(() => buildingParams({ type: "tavern" }));
  const [plan, setPlan] = useState<BuildingPlan | null>(null);
  const [floor, setFloor] = useState(0);
  const [theme, setTheme] = useState<BuildingThemeId>("ink");
  const [grid, setGrid] = useState(false);
  const [room, setRoom] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [close, setClose] = useState<number | null>(null);

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
      setVersion((v) => v + 1);
    });
  };
  const set = <K extends keyof BuildingParams>(key: K, value: BuildingParams[K]) => setInput((current) => ({ ...current, [key]: value }));
  // Names follow the building's age: a tavern after the fall is a saloon, a temple's nave in antiquity its cella.
  const era = plan?.params.era ?? input.era;
  const roomName = (kind: string | undefined) => t(`room.${kind}@${era}`);
  const typeName = (type: string) => t(`btype.${type}@${era}`);
  const mapKey = plan ? `building:${plan.params.seed}` : null;
  const names = ctx.names(mapKey);
  const current = plan?.floors[floor];
  // A room's name: the GM's own, else its kind in the building's age.
  const roomLabel = (id: number | null, kind: string | undefined) => (current && id !== null && names[`room:${current.level}:${id}`]) || roomName(kind);
  const svg = useMemo(() => (plan ? renderBuilding(plan, { theme, floor, grid, highlight: room, label: (kind, item) => roomLabel(item.id, kind) }) : ""), [plan, theme, floor, grid, room, t, names]); // eslint-disable-line react-hooks/exhaustive-deps
  const legend = useMemo(() => (plan ? buildingLegend(plan, { theme, floor }) : undefined), [plan, theme, floor]);
  const roomMap = useMemo(() => (plan && close !== null ? generateRoom(plan, floor, close) : null), [plan, floor, close]);
  const roomSvg = useMemo(() => (roomMap ? renderRoom(roomMap, { theme, grid: true, players: ctx.players, label: roomLabel(close, roomMap.kind) }) : ""), [roomMap, theme, ctx.players, t, era, names]); // eslint-disable-line react-hooks/exhaustive-deps
  const bounds = plan ? plan.yard?.bounds ?? { x: -2, y: -2, w: plan.params.width + 4, h: plan.params.depth + 4 } : null;
  const floorName = (level: number) => (level < 0 ? t("floor.cellar") : level === 0 ? t("floor.ground") : t("floor.upper", { n: level + 1 }));

  return {
    id: "building",
    legend,
    icon: "🏠",
    title: plan ? names.world || plan.params.name || typeName(plan.params.type) : null,
    mapKey,
    // Each floor and each room up close has its own pins and fog; the ground floor keeps the building's own.
    sheetKey: !mapKey || !current ? mapKey : close !== null ? `${mapKey}#room-${current.level}-${close}` : current.level === 0 ? mapKey : `${mapKey}#floor-${current.level}`,
    params: plan ? (plan.params as unknown as Record<string, unknown>) : null,
    restore: (saved) => build(saved as unknown as BuildingParams),
    selected: !plan || !current ? null : room !== null ? { key: `room:${current.level}:${room}`, label: roomLabel(room, current.rooms.find((r) => r.id === room)?.kind) } : { key: "world", label: plan.params.name || typeName(plan.params.type) },
    seed: input.seed,
    setSeed: (seed) => set("seed", seed),
    generate: (seed) => build(seed ? { ...input, seed } : input),
    ensure: () => {
      // Only when nothing is on its way: an opened building or city must not be replaced by a fresh one.
      if (!plan && !pending.current) build(input);
    },
    openFromCity: (city, index) => {
      build(buildingFromCity(city, index));
      ctx.show("building");
    },
    map: roomMap
      ? { svg: roomSvg, width: (roomMap.w + 1.6) * ROOM_PX, height: (roomMap.h + 1.6) * ROOM_PX, key: `room-${roomMap.seed}`, onPick: () => undefined }
      : plan && bounds
        ? {
            svg,
            width: (bounds.w + 3) * PX,
            height: (bounds.h + 4.2) * PX,
            key: `building-${version}`,
            onPick: (x, y) => {
              // The plan's origin sits inside the view box; undo its offset to get metres.
              const mx = x / PX + bounds.x - 1.5;
              const my = y / PX + bounds.y - 2.7;
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
            <button key={f.level} type="button" aria-pressed={index === floor} onClick={() => setFloor(index)}>
              {floorName(f.level)}
            </button>
          ))}
        </div>
        <h2>{t("panel.building")}</h2>
        <label>
          {t("field.type")}
          <select value={input.type} onChange={(event) => set("type", event.target.value as BuildingParams["type"])}>
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
          </select>
        </label>
        <label>
          {t("field.era")}
          <select
            value={input.era}
            onChange={(event) => {
              // A new age offers its own buildings; a type it never raised gives way to its first.
              const next = event.target.value as BuildingParams["era"];
              setInput((current) => ({ ...current, era: next, type: ERA_BUILDINGS[next].includes(current.type) ? current.type : ERA_BUILDINGS[next][0] }));
            }}
          >
            {ERAS.map((era) => (
              <option key={era} value={era}>
                {t(`era.${era}`)}
              </option>
            ))}
          </select>
        </label>
        {(["width", "depth", "floors"] as const).map((key) => (
          <label key={key}>
            {t(`field.${key}`)}
            <input type="number" min={key === "floors" ? 1 : 4} max={key === "floors" ? 6 : 60} value={input[key]} onChange={(event) => set(key, Number(event.target.value))} />
          </label>
        ))}
        {(["cellar", "yard"] as const).map((key) => (
          <label key={key} className="check">
            <input type="checkbox" checked={input[key]} onChange={(event) => set(key, event.target.checked)} />
            {t(`field.${key}`)}
          </label>
        ))}
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
      </>
    ),
    inspector:
      plan && current ? (
        <aside className="inspector">
          {(() => {
            const selected = current.rooms.find((r) => r.id === room);
            if (!selected) return <p className="muted">{t("building.hint")}</p>;
            const counts = new Map<string, number>();
            for (const f of selected.furniture) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
            return (
              <div className="card">
                <h3>{roomName(selected.kind)}</h3>
                <div className="row">
                  <span>{t("stat.size")}</span>
                  <b>
                    {selected.w.toFixed(1)} × {selected.h.toFixed(1)} {t("unit.m")} ({(selected.w * selected.h).toFixed(0)} {t("unit.m")}²)
                  </b>
                </div>
                <div className="row">
                  <span>{t("stat.furniture")}</span>
                  <b>{selected.furniture.length}</b>
                </div>
                <p className="muted">{[...counts].map(([kind, count]) => `${t(`furniture.${kind}`)}${count > 1 ? ` ×${count}` : ""}`).join(", ")}</p>
                {close === null ? (
                  <button type="button" className="primary wide" onClick={() => setClose(selected.id)}>
                    🔍 {t("action.openRoom")}
                  </button>
                ) : null}
                {roomMap && close === selected.id ? (
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
              </div>
            );
          })()}
          <h4 className="muted">{floorName(current.level)}</h4>
          <ul className="list">
            {current.rooms
              .filter((r) => r.kind !== "stairs")
              .map((r) => (
                <li key={r.id} aria-selected={r.id === room} onClick={() => setRoom(r.id)}>
                  <span className="grow">{roomName(r.kind)}</span>
                  <small>{(r.w * r.h).toFixed(0)} {t("unit.m")}²</small>
                </li>
              ))}
          </ul>
        </aside>
      ) : null,
    status: plan ? t("building.summary", { rooms: plan.floors.reduce((s, f) => s + f.rooms.length, 0), floors: plan.floors.length, w: plan.params.width, d: plan.params.depth }) : "",
    data: () => (plan ? { format: "new-world-atlas/building", version: 1, ...plan } : null),
  };
}
