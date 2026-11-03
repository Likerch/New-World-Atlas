// The local-map level: dungeons, caves and wilderness on a battle grid, with the GM's key.
import { useMemo, useRef, useState } from "react";
import { generateLocal, LOCAL_KINDS, LOCAL_STYLES, LOCAL_THEMES, localParams, localPixels, renameLocal, renderLocal, type Language, type LocalMap, type LocalParams, type LocalThemeId, localLegend } from "../../core/index";
import type { Level, LevelContext } from "./types";

export function useLocalLevel(ctx: LevelContext, back: (() => void) | null): Level & { open: (params: Partial<LocalParams>, language: Language | null) => void } {
  const { t, nm } = ctx;
  const [input, setInput] = useState<LocalParams>(() => localParams({ kind: "dungeon" }));
  const [language, setLanguage] = useState<Language | null>(null);
  const [raw, setMap] = useState<LocalMap | null>(null);
  const mapKey = raw ? `local:${raw.params.seed}` : null;
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
  const svg = useMemo(() => (map ? renderLocal(map, { style, grid, highlight: keyed }) : ""), [map, style, grid, keyed]);
  const mapLegend = useMemo(() => (map ? localLegend(map, { style }) : undefined), [map, style]);
  const S = map ? localPixels(map) : 20;
  const legend = (k: LocalMap["keyed"][number]) =>
    [
      k.monsters.length ? `${t("local.monsters")}: ${k.monsters.map((m) => t(`monster.${m}`)).join(", ")}` : "",
      k.treasure ? `${t("local.treasure")}: ${t(`treasure.${k.treasure}`)}` : "",
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
    generate: (seed) => build(localParams({ ...input, seed: seed ?? input.seed }), language),
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
              build(localParams({ ...raw.params, seed: `${raw.params.seed.replace(/\/depth-\d+$/u, "")}/depth-${depth}`, depth, danger: Math.min(3, raw.params.danger + 1), boss: undefined, rooms: raw.params.rooms + 2 }), language);
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
              setInput(localParams({ seed: input.seed, kind }));
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
            <input type="number" min={key === "danger" ? 1 : key === "rooms" ? 1 : 24} max={key === "danger" ? 3 : key === "rooms" ? 30 : 160} value={input[key]} onChange={(event) => set(key, Number(event.target.value))} />
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
