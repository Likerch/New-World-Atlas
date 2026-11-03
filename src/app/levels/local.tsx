// The local-map level: dungeons, caves and wilderness on a battle grid, with the GM's key.
import { useMemo, useRef, useState } from "react";
import { generateLocal, mapKeyOf, LOCAL_KINDS, LOCAL_STYLES, LOCAL_THEMES, localParams, localPixels, renameLocal, renderLocal, type Language, type LocalMap, type LocalParams, type LocalThemeId, localLegend } from "../../core/index";
import type { Level, LevelContext } from "./types";
import { NumberInput } from "../NumberInput";

export function useLocalLevel(ctx: LevelContext, back: (() => void) | null): Level & { open: (params: Partial<LocalParams>, language: Language | null) => void } {
  const { t, nm } = ctx;
  const [input, setInput] = useState<LocalParams>(() => localParams({ kind: "dungeon" }));
  const [language, setLanguage] = useState<Language | null>(null);
  const [raw, setMap] = useState<LocalMap | null>(null);
  const mapKey = raw ? mapKeyOf("local", raw.params as unknown as Record<string, unknown>) : null;
  const names = ctx.names(mapKey);
  const map = useMemo(() => (raw ? renameLocal(raw, names) : null), [raw, names]);
  const [style, setStyle] = useState<LocalThemeId>("classic");
  const [grid, setGrid] = useState(true);
  const [keyed, setKeyed] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [above, setAbove] = useState<LocalMap[]>([]);
  const pending = useRef(false);
  const build = (next: LocalParams, tongue: Language | null) => {
    pending.current = true;
    ctx.run(() => {
      pending.current = false;
      const made = generateLocal(next, tongue ?? undefined);
      setMap(made);
      setInput(made.params);
      if (!(next.depth && next.depth > 1)) setAbove([]);
      setKeyed(null);
      setVersion((v) => v + 1);
    });
  };
  const set = <K extends keyof LocalParams>(key: K, value: LocalParams[K]) => setInput((current) => ({ ...current, [key]: value }));
  const svg = useMemo(() => (map ? renderLocal(map, { style, grid, highlight: keyed, players: ctx.players }) : ""), [map, style, grid, keyed, ctx.players]);
  // A dweller of the age (cave bears, a rogue AI) is named as the planet's legend names it.
  const monster = (id: string) => {
    const own = t(`monster.${id}`);
    if (own !== `monster.${id}`) return own;
    const told = t(`fact.${id.replace(/-/gu, " ")}`);
    return told !== `fact.${id.replace(/-/gu, " ")}` ? told : id.replace(/-/gu, " ");
  };
  const mapLegend = useMemo(() => (map ? localLegend(map, { style }) : undefined), [map, style]);
  const S = map ? localPixels(map) : 20;
  const legend = (k: LocalMap["keyed"][number]) =>
    [
      k.monsters.length ? `${t("local.monsters")}: ${k.monsters.map((g) => `${g.count > 1 ? `${g.count} ` : ""}${monster(g.who)}`).join(", ")}` : "",
      k.treasure ? `${t("local.treasure")}: ${t(`treasure.${k.treasure.what}`)}` : "",
      k.trap ? `${t("local.trap")}: ${t(`trap.${k.trap}`)}` : "",
      k.secret ? t("local.secret") : "",
    ].filter(Boolean);

  return {
    id: "local",
    legend: mapLegend,
    icon: "🗺️",
    title: map ? nm(map.name) : null,
    seed: input.seed,
    setSeed: (seed) => set("seed", seed),
    // A new seed is a new place: it starts at its way in, not on the level the old one was seen at.
    generate: (seed) => build(localParams({ ...input, seed: seed ?? input.seed, ...(seed && seed !== input.seed ? { depth: 1 } : {}) }), language),
    ensure: () => {
      if (!map && !pending.current) build(input, language);
    },
    mapKey,
    params: raw ? (raw.params as unknown as Record<string, unknown>) : null,
    language,
    restore: (saved, tongue) => {
      setLanguage(tongue ?? null);
      build(localParams(saved as Partial<LocalParams>), tongue ?? null);
    },
    selected: !map ? null : keyed !== null ? { key: `keyed:${keyed}`, label: `${keyed}. ${t(`purpose.${map.keyed.find((k) => k.id === keyed)?.purpose}`)}` } : { key: "world", label: map.name },
    open: (params, tongue) => {
      setLanguage(tongue);
      setStyle(params.kind === "wilderness" ? "classic" : params.theme === "bunker" || params.theme === "derelict" ? "dark" : "classic");
      build(localParams(params), tongue);
      ctx.show("local");
    },
    map: map
      ? {
          svg,
          width: map.params.width * S,
          height: map.params.height * S,
          key: `local-${version}`,
          onPick: (x, y) => {
            const cell = Math.floor(x / S) + Math.floor(y / S) * map.params.width;
            const hit = map.keyed.find((k) => k.cells.includes(cell));
            setKeyed(hit ? hit.id : null);
          },
        }
      : null,
    controls: (
      <>
        {raw && raw.features.some((f) => f.kind === "stairs-down") ? (
          <button
            type="button"
            className="primary wide"
            onClick={() => {
              const depth = (raw.params.depth ?? 1) + 1;
              setAbove([...above, raw]);
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
              setVersion((v) => v + 1);
            }}
          >
            ⬆ {t("local.up")}
          </button>
        ) : null}
        {back ? (
          <button type="button" className="back" onClick={back}>
            ← {t("action.back")}
          </button>
        ) : null}
        <h2>{t("view.local")}</h2>
        <label>
          {t("field.kind")}
          <select
            value={input.kind}
            onChange={(event) => {
              const kind = event.target.value as LocalParams["kind"];
              // Another kind of place keeps its danger, its ruler, its name and its age.
              setInput(localParams({ seed: input.seed, kind, danger: input.danger, boss: input.boss, name: input.name, age: input.age }));
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
          <select value={input.theme} onChange={(event) => set("theme", event.target.value as LocalParams["theme"])}>
            {LOCAL_THEMES[input.kind].map((theme) => (
              <option key={theme} value={theme}>
                {t(`ltheme.${theme}`)}
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
      </>
    ),
    inspector: map ? (
      <aside className="inspector">
        <h4 className="muted">
          {t("local.level", { n: map.params.depth ?? 1 })} · {t(`lkind.${map.params.kind}`)} · {t(`ltheme.${map.params.theme}`)} · {map.cell} {t("unit.m")} / ▢
        </h4>
        <ul className="list keyed">
          {map.keyed.map((k) => (
            <li key={k.id} aria-selected={k.id === keyed} onClick={() => setKeyed(k.id)}>
              <span className="badge">{k.id}</span>
              <span className="grow">
                <b>
                  {t(`purpose.${k.purpose}`)}
                  {k.name ? ` «${nm(k.name)}»` : ""}
                </b>
                {legend(k).map((line) => (
                  <small key={line} className="line">
                    {line}
                  </small>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </aside>
    ) : null,
    status: map ? t("local.summary", { keyed: map.keyed.length, w: Math.round(map.params.width * map.cell), h: Math.round(map.params.height * map.cell) }) : "",
    data: () => (map ? { format: "new-world-atlas/local", version: 1, ...map, tiles: Array.from(map.tiles) } : null),
  };
}
