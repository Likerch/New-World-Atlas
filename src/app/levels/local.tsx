// The local-map level: dungeons, caves and wilderness on a battle grid, with the GM's key: the place's hook, rumours,
// factions and people, every room's look, dwellers, loot, traps, locks and ways on, the GM's edits and rerolls, a room
// as a scene, the next sheet of the wilds, and the GM's own rooms, themes and tables.
import { useMemo, useRef, useState } from "react";
import { editLocal, feetOf, generateLocal, LOCAL_KINDS, LOCAL_STYLES, LOCAL_THEMES, localLegend, localParams, localPixels, localScene, localStory, mapKeyOf, renameLocal, renderLocal, renderLocalScene, roomLinks, SCENE_ZOOM, tablesFor, type Language, type LocalChanges, type LocalLink, type LocalMap, type LocalParams, type LocalRoomEdit, type LocalThemeId } from "../../core/index";
import { NumberInput } from "../NumberInput";
import { FactionList, PeopleList, RumourList, say } from "../People";
import { bandLine, loadOwn, OwnEditor, purposeName, RoomCard, saveOwn } from "./local-panels";
import type { Level, LevelContext } from "./types";

export interface LocalLinks {
  /** Opens a place a room leads into (a game master's room that opens on another theme). */
  openDeeper?: (link: LocalLink, entity: string) => void;
  /** Shows the cave in the underworld it belongs to, if it is part of one. */
  toUnderworld?: (map: LocalMap) => boolean;
  /** The next map of this place (a floor down, the sheet beside) hangs from this one in the world. */
  follow?: (entity: string) => void;
}

const COMPASS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

export function useLocalLevel(ctx: LevelContext, back: (() => void) | null, links: LocalLinks = {}): Level & { open: (params: Partial<LocalParams>, language: Language | null) => void } {
  const { t, nm } = ctx;
  const [input, setInput] = useState<LocalParams>(() => localParams({ kind: "dungeon" }));
  const [language, setLanguage] = useState<Language | null>(null);
  const [raw, setMap] = useState<LocalMap | null>(null);
  const [own, setOwnState] = useState(loadOwn);
  const setOwn = (next: typeof own) => {
    setOwnState(next);
    saveOwn(next);
  };
  const mapKey = raw ? mapKeyOf("local", raw.params as unknown as Record<string, unknown>) : null;
  const patch = ctx.patch(mapKey);
  const names = patch.names;
  const changes = patch.changes?.local as LocalChanges | undefined;
  const map = useMemo(() => (raw ? renameLocal(editLocal(raw, changes, language, own), names) : null), [raw, changes, language, own, names]);
  const story = useMemo(() => (map ? localStory(map) : null), [map]);
  const next = useMemo(() => (map ? roomLinks(map) : new Map<number, number[]>()), [map]);
  const [style, setStyle] = useState<LocalThemeId>("classic");
  const [grid, setGrid] = useState(true);
  const [coords, setCoords] = useState(false);
  const [units, setUnits] = useState<"m" | "ft">("m");
  const [keyed, setKeyed] = useState<number | null>(null);
  const [scene, setScene] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [above, setAbove] = useState<LocalMap[]>([]);
  const pending = useRef(false);
  const build = (params: LocalParams, tongue: Language | null) => {
    pending.current = true;
    ctx.run(() => {
      pending.current = false;
      const made = generateLocal(params, tongue ?? undefined, own);
      setMap(made);
      setInput(made.params);
      if (!(params.depth && params.depth > 1)) setAbove([]);
      setKeyed(null);
      setScene(null);
      setVersion((v) => v + 1);
    });
  };
  const set = <K extends keyof LocalParams>(key: K, value: LocalParams[K]) => setInput((current) => ({ ...current, [key]: value }));
  const age = map?.params.age;
  const tables = useMemo(() => (map ? tablesFor(map.params, own) : null), [map, own]);
  const pool = useMemo(
    () => ({
      dwellers: tables ? [...new Set([...tables.pool, ...tables.lords, ...(tables.residents ? [tables.residents] : []), ...(tables.own?.dwellers.map((d) => d.who) ?? [])])] : [],
      loot: tables ? [...new Set([...tables.loot, ...(tables.own?.loot ?? [])])] : [],
      traps: tables ? [...new Set([...tables.traps, ...(tables.own?.traps ?? [])])] : [],
    }),
    [tables],
  );
  const edit = (id: number, change: LocalRoomEdit | null) =>
    ctx.update(mapKey, (p) => {
      const rooms = { ...((p.changes?.local as LocalChanges | undefined)?.rooms ?? {}) };
      if (change) rooms[String(id)] = change;
      else delete rooms[String(id)];
      return { ...p, changes: { ...(p.changes ?? {}), local: { rooms } } };
    });
  const shown = useMemo(() => (map && scene !== null ? localScene(map, scene) : null), [map, scene]);
  const svg = useMemo(() => {
    if (!map) return "";
    if (shown) return renderLocalScene(map, shown, { style, grid, players: ctx.players, units });
    return renderLocal(map, { style, grid, highlight: keyed, players: ctx.players, units, coords });
  }, [map, shown, style, grid, keyed, ctx.players, units, coords]);
  const mapLegend = useMemo(() => (map ? localLegend(map, { style }) : undefined), [map, style]);
  const S = map ? localPixels(map) : 20;
  const room = map && keyed !== null ? map.keyed.find((k) => k.id === keyed) ?? null : null;
  const hidden = (k: LocalMap["keyed"][number]) => ctx.players && k.secret;
  const exits = map ? map.features.filter((f) => f.kind === "exit" && f.to && f.to !== "line") : [];
  const wild = map?.params.kind === "wilderness";
  const sheet = map?.params.sheet ?? [0, 0];
  const goSheet = (dx: number, dy: number) => {
    if (!raw) return;
    const to: [number, number] = [sheet[0] + dx, sheet[1] + dy];
    const { sheet: _old, ...rest } = raw.params;
    links.follow?.(`sheet:${to[0]},${to[1]}`);
    build(localParams({ ...rest, ...(to[0] || to[1] ? { sheet: to } : {}) }), language);
  };
  const compass = (x: number, y: number) => {
    if (!map) return "";
    const angle = Math.atan2(x - map.params.width / 2, -(y - map.params.height / 2));
    return t(`compass.${COMPASS[(Math.round(angle / (Math.PI / 4)) + 8) % 8]}`);
  };
  const metres = (tiles: number) => Math.round(tiles * (units === "ft" ? feetOf(map?.cell ?? 1.5) : map?.cell ?? 1.5));

  return {
    id: "local",
    legend: mapLegend,
    icon: "🗺️",
    title: map ? nm(map.name) : null,
    seed: input.seed,
    setSeed: (seed) => set("seed", seed),
    // A new seed is a new place: it starts at its way in, on its first sheet, not where the old one was seen.
    generate: (seed) => {
      const { sheet: _sheet, ...rest } = input;
      build(localParams(seed && seed !== input.seed ? { ...rest, seed, depth: 1 } : { ...input, seed: seed ?? input.seed }), language);
    },
    ensure: () => {
      if (!map && !pending.current) build(input, language);
    },
    mapKey,
    // A room shown as a scene takes its own pins and fog.
    sheetKey: scene !== null && mapKey ? `${mapKey}/room-${scene}` : mapKey,
    params: raw ? (raw.params as unknown as Record<string, unknown>) : null,
    language,
    restore: (saved, tongue) => {
      setLanguage(tongue ?? null);
      build(localParams(saved as Partial<LocalParams>), tongue ?? null);
    },
    selected: !map ? null : keyed !== null ? { key: `keyed:${keyed}`, label: `${keyed}. ${purposeName(t, own, map.keyed.find((k) => k.id === keyed)?.purpose ?? "")}` } : { key: "world", label: map.name },
    open: (params, tongue) => {
      setLanguage(tongue);
      setStyle(params.kind === "wilderness" ? "classic" : params.theme === "bunker" || params.theme === "derelict" || params.theme === "starship" ? "dark" : "classic");
      build(localParams(params), tongue);
      ctx.show("local");
    },
    map: map
      ? shown
        ? { svg, width: shown.w * S * SCENE_ZOOM, height: shown.h * S * SCENE_ZOOM, key: `local-${version}-scene-${shown.room}`, onPick: () => undefined }
        : {
            svg,
            width: map.params.width * S,
            height: map.params.height * S,
            key: `local-${version}`,
            onPick: (x, y) => {
              const cell = Math.floor(x / S) + Math.floor(y / S) * map.params.width;
              const hit = map.keyed.find((k) => k.cells.includes(cell) && !hidden(k));
              setKeyed(hit ? hit.id : null);
            },
          }
      : null,
    controls: (
      <>
        {scene !== null ? (
          <button type="button" className="primary wide" onClick={() => setScene(null)}>
            ← {t("local.backToMap")}
          </button>
        ) : null}
        {raw && raw.features.some((f) => f.kind === "stairs-down") ? (
          <button
            type="button"
            className="primary wide"
            onClick={() => {
              const depth = (raw.params.depth ?? 1) + 1;
              setAbove([...above, raw]);
              links.follow?.(`depth:${depth}`);
              // The same place one level deeper: its name, its ruler (who waits on the last level) and how deep it goes.
              build(localParams({ ...raw.params, seed: `${raw.params.seed.replace(/\/depth-\d+$/u, "")}/depth-${depth}`, depth, danger: Math.min(3, raw.params.danger + 1), rooms: raw.params.rooms + 2, name: raw.name }), language);
            }}
          >
            ⬇ {t("local.down")}
          </button>
        ) : null}
        {above.length ? (
          <button
            type="button"
            className="wide"
            onClick={() => {
              setMap(above[above.length - 1]);
              setInput(above[above.length - 1].params);
              setAbove(above.slice(0, -1));
              setKeyed(null);
              setScene(null);
              setVersion((v) => v + 1);
            }}
          >
            ⬆ {t("local.up")}
          </button>
        ) : null}
        {map && links.toUnderworld && (map.params.kind === "cave" || map.params.seed.includes("/underworld/cavern-")) ? (
          <button type="button" className="wide" onClick={() => links.toUnderworld!(map) || alert(t("local.noUnderworld"))}>
            🕳 {t("local.toUnderworld")}
          </button>
        ) : null}
        {back ? (
          <button type="button" className="back" onClick={back}>
            ← {t("action.back")}
          </button>
        ) : null}
        <h2>{t("view.local")}</h2>
        {wild && map ? (
          <div className="sheet-nav">
            <span className="muted">{t("local.sheet", { x: sheet[0], y: sheet[1] })}</span>
            <div className="sheet-arrows">
              {(
                [
                  ["n", 0, -1, "↑"],
                  ["w", -1, 0, "←"],
                  ["e", 1, 0, "→"],
                  ["s", 0, 1, "↓"],
                ] as const
              ).map(([dir, dx, dy, arrow]) => (
                <button key={dir} type="button" onClick={() => goSheet(dx, dy)} aria-label={t("local.nextSheet", { dir: t(`compass.${dir}`) })} title={t("local.nextSheet", { dir: t(`compass.${dir}`) })}>
                  {arrow}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <label>
          {t("field.kind")}
          <select
            value={input.kind}
            onChange={(event) => {
              const kind = event.target.value as LocalParams["kind"];
              // Another kind of place keeps its danger, its ruler, its name and its world.
              setInput(localParams({ seed: input.seed, kind, danger: input.danger, boss: input.boss, name: input.name, age: input.age, magic: input.magic }));
            }}
          >
            {LOCAL_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`lkind.${kind}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("field.ltheme")}
          <select
            value={input.own ? `own:${input.own}` : input.theme}
            onChange={(event) => {
              const value = event.target.value;
              const mine = value.startsWith("own:") ? own.themes.find((item) => item.id === value.slice(4)) : null;
              setInput((current) => {
                const { own: _own, ...rest } = current;
                return mine ? { ...rest, theme: mine.base, own: mine.id } : { ...rest, theme: value as LocalParams["theme"] };
              });
            }}
          >
            {LOCAL_THEMES[input.kind].map((theme) => (
              <option key={theme} value={theme}>
                {t(`ltheme.${theme}`)}
              </option>
            ))}
            {own.themes
              .filter((item) => item.kind === input.kind)
              .map((item) => (
                <option key={item.id} value={`own:${item.id}`}>
                  ★ {item.name || t("own.theme")}
                </option>
              ))}
          </select>
        </label>
        {(["width", "height", "rooms", "danger"] as const).map((key) => (
          <label key={key}>
            {t(`field.l${key}`)}
            <NumberInput min={key === "danger" ? 1 : key === "rooms" ? 1 : 24} max={key === "danger" ? 3 : key === "rooms" ? 30 : 160} value={input[key]} onChange={(value) => set(key, value)} />
          </label>
        ))}
        <label>
          {t("field.theme")}
          <select value={style} onChange={(event) => setStyle(event.target.value as LocalThemeId)}>
            {LOCAL_STYLES.map((id) => (
              <option key={id} value={id}>
                {t(`lstyle.${id}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />
          {t("field.grid")}
        </label>
        <label className="check">
          <input type="checkbox" checked={coords} onChange={(event) => setCoords(event.target.checked)} />
          {t("local.coords")}
        </label>
        <label>
          {t("local.units")}
          <select value={units} onChange={(event) => setUnits(event.target.value as "m" | "ft")}>
            <option value="m">{t("local.metres")}</option>
            <option value="ft">{t("local.feet")}</option>
          </select>
        </label>
        <OwnEditor t={t} own={own} onChange={setOwn} onApply={() => build(input, language)} />
      </>
    ),
    inspector: map ? (
      <aside className="inspector">
        <h4 className="muted">
          {t("local.level", { n: map.params.depth ?? 1 })}
          {(map.params.levels ?? 1) > 1 ? ` / ${map.params.levels}` : ""} · {t(`lkind.${map.params.kind}`)} · {t(`ltheme.${map.params.theme}`)} · {units === "ft" ? `${feetOf(map.cell)} ${t("unit.ft")}` : `${map.cell} ${t("unit.m")}`} / ▢
        </h4>
        {shown ? (
          <div className="card">
            <h3>
              🎭 {shown.room}. {purposeName(t, own, map.keyed.find((k) => k.id === shown.room)?.purpose ?? "")}
            </h3>
            <ul className="plain">
              {map.keyed
                .find((k) => k.id === shown.room)
                ?.monsters.map((group, g) => (
                  <li key={g}>
                    <b>{String.fromCharCode(65 + g)}</b> — {bandLine(t, nm, group)}
                  </li>
                ))}
            </ul>
            <p className="muted">{t(shown.dark ? "local.sceneDark" : "local.sceneLit")}</p>
            <p className="muted">{t("local.sceneCover")}</p>
          </div>
        ) : room && !hidden(room) ? (
          <RoomCard
            t={t}
            nm={nm}
            map={map}
            room={room}
            own={own}
            next={(next.get(room.id) ?? []).filter((id) => !ctx.players || !map.keyed.find((k) => k.id === id)?.secret)}
            onPick={setKeyed}
            players={ctx.players}
            age={age}
            pool={pool}
            edit={changes?.rooms?.[String(room.id)]}
            onEdit={(change) => edit(room.id, change)}
            onScene={() => setScene(room.id)}
            onOpen={
              links.openDeeper
                ? (theme) => {
                    const kind = (LOCAL_THEMES.cave as string[]).includes(theme) ? "cave" : (LOCAL_THEMES.wilderness as string[]).includes(theme) ? "wilderness" : "dungeon";
                    links.openDeeper!({ params: { seed: `${map.params.seed}/room-${room.id}`, kind, theme: theme as LocalParams["theme"], danger: map.params.danger, age: map.params.age, ...(map.params.magic !== undefined ? { magic: map.params.magic } : {}) }, language }, `keyed:${room.id}`);
                  }
                : undefined
            }
          />
        ) : story ? (
          <div className="card">
            <h3>{nm(map.name)}</h3>
            {!ctx.players ? <p className="read-aloud">{say(t, nm, story.hook)}</p> : null}
          </div>
        ) : null}
        {!shown && story && !ctx.players ? (
          <>
            <RumourList t={t} nm={nm} rumours={story.rumours} players={ctx.players} />
            <FactionList t={t} nm={nm} factions={story.factions} age={age} />
            <PeopleList t={t} nm={nm} people={story.people} age={age} factions={story.factions} />
          </>
        ) : null}
        {exits.length && !shown ? (
          <>
            <h4 className="muted">{t("local.waysOut")}</h4>
            <ul className="plain">
              {exits.map((f) => (
                <li key={`${f.x},${f.y}`}>
                  {compass(f.x, f.y)} → {nm(f.to!)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <h4 className="muted">{t("local.key")}</h4>
        <ul className="list keyed">
          {map.keyed
            .filter((k) => !hidden(k))
            .map((k) => (
              <li key={k.id} aria-selected={k.id === keyed} onClick={() => setKeyed(k.id)}>
                <span className="badge">{k.id}</span>
                <span className="grow">
                  <b>
                    {purposeName(t, own, k.purpose)}
                    {k.object ? ` · ${t(`object.${k.object}`)}` : ""}
                    {k.name ? ` «${nm(k.name)}»` : ""}
                    {k.lock ? " 🔒" : ""}
                    {k.key && !ctx.players ? " ⚷" : ""}
                  </b>
                  {k.monsters.length && !ctx.players ? <small className="line">{k.monsters.map((group) => bandLine(t, nm, group)).join("; ")}</small> : null}
                </span>
              </li>
            ))}
        </ul>
        {!ctx.players && map.wandering.length ? (
          <>
            <h4 className="muted">{t("local.wandering")}</h4>
            <ol className="plain wandering">
              {map.wandering.map((group, k) => (
                <li key={k}>{bandLine(t, nm, group)}</li>
              ))}
            </ol>
          </>
        ) : null}
      </aside>
    ) : null,
    status: map ? t("local.summary", { keyed: map.keyed.length, w: metres(map.params.width), h: metres(map.params.height), unit: t(units === "ft" ? "unit.ft" : "unit.m") }) : "",
    data: () => (map ? { format: "new-world-atlas/local", version: 2, ...map, tiles: Array.from(map.tiles), story } : null),
  };
}
