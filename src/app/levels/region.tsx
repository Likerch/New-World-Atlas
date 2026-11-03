// The region level: one province of the planet up close, with its villages, roads and local places.
import { useMemo, useState } from "react";
import { editPlanet, emptyEdits, type PlanetEdits, generateUnderworld, underworldGhostSvg, defaultLayers, eraTheme, generateArea, generateCountry, generateRegion, settingOf, LAYERS, planetToJson, renamePlanet, renderPlanet, THEMES, type LayerId, type Planet, type ThemeId, planetLegend } from "../../core/index";
import { Inspector, type Selection, type Tab } from "../Inspector";
import { selectedOf } from "./planet";
import { describePlanet, searchPlanet } from "../planetText";
import { useLayers } from "./layers";
import { editAt, WorldEditor, type EditTool, type Paint } from "../WorldEditor";

/** A close-up's own edits: its land's peoples and faiths, its villages, words and zones. Its relief and realms are the
 * planet's, edited there. */
const REGION_TOOLS: EditTool[] = ["people", "faith", "move", "add", "remove", "label", "zone"];
import type { Level, LevelContext } from "./types";

/** Where a close-up lies on its planet: the planet's land in small squares and the close-up's frame over it. */
function Locator({ planet, frame }: { planet: Planet; frame: [number, number, number, number] }) {
  const squares = useMemo(() => {
    const { width, height } = planet.params;
    const step = width / 72;
    const out: string[] = [];
    for (let y = step / 2; y < height; y += step) for (let x = step / 2; x < width; x += step) if (!planet.water[planet.mesh.find(x, y)]) out.push(`M${Math.round(x - step / 2)},${Math.round(y - step / 2)}h${Math.ceil(step)}v${Math.ceil(step)}h-${Math.ceil(step)}z`);
    return out.join("");
  }, [planet]);
  const [x0, y0, x1, y1] = frame;
  return (
    <svg className="locator" viewBox={`0 0 ${planet.params.width} ${planet.params.height}`} role="img">
      <rect width={planet.params.width} height={planet.params.height} fill="var(--sea, #bcd3e0)" />
      <path d={squares} fill="var(--land, #e8dfc4)" />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke="#c0392b" strokeWidth={Math.max(4, planet.params.width / 180)} />
    </svg>
  );
}

/** The provinces (or realms) that share a border with one: the planet's land cells next to its own. */
function neighboursOf(planet: Planet, of: "province" | "state", id: number): number[] {
  const owner = of === "province" ? planet.province : planet.state;
  const found = new Set<number>();
  for (let cell = 0; cell < planet.mesh.cells; cell++) {
    if (owner[cell] !== id || planet.water[cell]) continue;
    for (const next of planet.mesh.neighbors[cell]) if (!planet.water[next] && owner[next] && owner[next] !== id) found.add(owner[next]);
  }
  return [...found];
}

export function useRegionLevel(
  ctx: LevelContext,
  links: { openCity: (region: Planet, burg: number) => void; openLocal: (region: Planet, marker: number) => void; openHere: (region: Planet, cell: number) => void; openUnderworld: (region: Planet, marker?: number) => void; openProvince: (planet: Planet, province: number) => void; openCountry: (planet: Planet, state: number) => void; back: (() => void) | null },
): Level & { open: (planet: Planet, province: number, style?: ThemeId, layers?: Record<LayerId, boolean>) => void; openCountry: (planet: Planet, state: number, style?: ThemeId, layers?: Record<LayerId, boolean>) => void; openArea: (planet: Planet, box: [number, number, number, number], style?: ThemeId, layers?: Record<LayerId, boolean>, title?: string) => void } {
  const { t } = ctx;
  const [raw, setRegion] = useState<Planet | null>(null);
  // The planet it was cut from: for the locator and the neighbours next door.
  const [parent, setParent] = useState<Planet | null>(null);
  const [of, setOf] = useState<{ of: "province" | "state" | "area"; id: number; box?: [number, number, number, number]; title?: string } | null>(null);
  const mapKey = raw ? `region:${raw.params.seed}` : null;
  const names = ctx.names(mapKey);
  const edits = ctx.patch(mapKey).edits ?? null;
  const region = useMemo(() => (raw ? renamePlanet(editPlanet(raw, edits), names) : null), [raw, edits, names]);
  const [tool, setTool] = useState<EditTool | null>(null);
  const [radius, setRadius] = useState(40);
  const [paint, setPaint] = useState<Paint>({ realm: 1, people: 1, faith: 1, province: 1, zone: "custom" });
  const [moving, setMoving] = useState<number | null>(null);
  const [history, setHistory] = useState<PlanetEdits[]>([]);
  const change = (next: (current: PlanetEdits) => PlanetEdits) => {
    setHistory((past) => [...past.slice(-40), edits ?? emptyEdits()]);
    ctx.update(mapKey, (patch) => ({ ...patch, edits: next(patch.edits ?? emptyEdits()) }));
  };
  const [theme, setTheme] = useState<ThemeId>("atlas");
  const { layers, restyle, toggle, setAll } = useLayers("atlas", { provinces: true });
  // A close-up is drawn in its planet's style and layers: the ones the GM has on the planet, else the ones its age
  // suggests; the countryside's own layers come on as the style has them.
  const styleOf = (planet: Planet, style?: ThemeId, shown?: Record<LayerId, boolean>) => {
    const next = style ?? eraTheme(settingOf(planet.params.setting));
    setTheme(next);
    setParent(planet);
    if (shown) setAll({ ...shown, landuse: defaultLayers(next).landuse, fiefs: shown.provinces || defaultLayers(next).fiefs, provinces: true });
    else restyle(next);
  };
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<Tab>("place");
  const [time, setTime] = useState(0);
  const highlight = selection && (selection.kind === "state" || selection.kind === "province" || selection.kind === "culture") ? { kind: selection.kind, id: selection.id } : null;
  const ghost = useMemo(() => (region && layers.underground ? underworldGhostSvg(generateUnderworld(region)) : undefined), [region, layers.underground]);
  const svg = useMemo(() => (region ? renderPlanet(region, { theme, layers, script: ctx.script, highlight, words: ctx.words, ghost }) : ""), [region, theme, layers, ctx.script, highlight?.kind, highlight?.id, t, ghost]); // eslint-disable-line react-hooks/exhaustive-deps
  const legend = useMemo(() => (region ? planetLegend(region, { theme, layers }) : undefined), [region, theme, layers]);

  return {
    id: "region",
    legend,
    icon: "🗺",
    title: region?.name ?? null,
    seed: region?.params.seed ?? "",
    setSeed: () => undefined,
    generate: () => undefined,
    ensure: () => undefined,
    mapKey,
    params: of,
    selected: selectedOf(region, selection, t, ctx.nm),
    search: (query) =>
      region
        ? searchPlanet(region, query, t, ctx.nm, (next, at) => {
            setSelection(next);
            setTab("place");
            ctx.focus(at[0], at[1]);
          })
        : [],
    describe: () => (region ? describePlanet(region, selection, t, ctx.nm) : ""),
    fixed: true,
    openArea: (planet, box, style, shown, title) => {
      styleOf(planet, style, shown);
      ctx.run(() => {
        setRegion(generateArea(planet, box, title ?? ctx.t("region.area")));
        setOf({ of: "area", id: 0, box, title });
        setTime((now) => now + 1);
        setSelection(null);
      });
      ctx.show("region");
    },
    openCountry: (planet, state, style, shown) => {
      styleOf(planet, style, shown);
      ctx.run(() => {
        const started = performance.now();
        setRegion(generateCountry(planet, state));
        setOf({ of: "state", id: state });
        setTime(Math.round(performance.now() - started));
        setSelection(null);
      });
      ctx.show("region");
    },
    open: (planet, province, style, shown) => {
      styleOf(planet, style, shown);
      ctx.run(() => {
        const started = performance.now();
        setRegion(generateRegion(planet, province));
        setOf({ of: "province", id: province });
        setTime(Math.round(performance.now() - started));
        setSelection(null);
      });
      ctx.show("region");
    },
    map: region
      ? {
          svg,
          width: region.params.width,
          height: region.params.height,
          key: `region-${region.params.seed}-${time}`,
          onPick: (x, y) => {
            if (tool) return editAt(region, edits, tool, x, y, { radius, paint, moving, setMoving, change, t });
            const cell = region.mesh.find(x, y);
            const marker = region.markers.slice(1).find((item) => Math.hypot(item.x - x, item.y - y) < region.mesh.spacing * 0.5);
            const burg = region.burg[cell];
            setSelection(marker ? { kind: "marker", id: marker.id } : burg && Math.hypot(region.burgs[burg].x - x, region.burgs[burg].y - y) < region.mesh.spacing * 0.6 ? { kind: "burg", id: burg } : { kind: "cell", id: cell });
            setTab("place");
          },
        }
      : null,
    controls: (
      <>
        {links.back ? (
          <button type="button" className="back" onClick={links.back}>
            ← {t("action.backToPlanet")}
          </button>
        ) : null}
        {!region ? <p className="muted">{t("region.hint")}</p> : null}
        {region && parent && region.frame ? (
          <>
            <h2>{t("region.locator")}</h2>
            <Locator planet={parent} frame={region.frame} />
          </>
        ) : null}
        {region && parent && of && of.of !== "area" ? (
          <>
            <h2>{t("region.neighbours")}</h2>
            <div className="row-buttons">
              {neighboursOf(parent, of.of, of.id).map((id) => (
                <button key={id} type="button" onClick={() => (of.of === "province" ? links.openProvince(parent, id) : links.openCountry(parent, id))}>
                  {ctx.nm(of.of === "province" ? parent.provinces[id].name : parent.states[id].name)}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {region ? (
          <WorldEditor
            t={t}
            nm={ctx.nm}
            planet={region}
            edits={edits}
            tool={tool}
            setTool={(next) => {
              setTool(next);
              setMoving(null);
            }}
            brush={{ radius, strength: 0 }}
            setBrush={(next) => setRadius(next.radius)}
            paint={paint}
            setPaint={setPaint}
            moving={moving}
            started={false}
            selection={selection}
            change={change}
            onImage={() => undefined}
            canUndo={history.length > 0}
            onUndo={() => {
              const last = history[history.length - 1];
              setHistory((past) => past.slice(0, -1));
              ctx.update(mapKey, (patch) => ({ ...patch, edits: last }));
            }}
            onReset={() => change(() => emptyEdits())}
            tools={REGION_TOOLS}
          />
        ) : null}
        {region ? (
          <button type="button" className="wide" onClick={() => links.openUnderworld(region)}>
            ⛏ {t("action.openUnderworld")}
          </button>
        ) : null}
        <label>
          {t("field.theme")}
          <select
            value={theme}
            onChange={(event) => {
              const next = event.target.value as ThemeId;
              setTheme(next);
              restyle(next);
            }}
          >
            {THEMES.map((id) => (
              <option key={id} value={id}>
                {t(`theme.${id}`)}
              </option>
            ))}
          </select>
        </label>
        <h2>{t("panel.layers")}</h2>
        {LAYERS.map((id) => (
          <label key={id} className="check">
            <input type="checkbox" checked={layers[id]} onChange={(event) => toggle(id, event.target.checked)} />
            {t(`layer.${id}`)}
          </label>
        ))}
      </>
    ),
    inspector: region ? (
      <Inspector
        planet={region}
        t={t}
        nm={ctx.nm}
        selection={selection}
        tab={tab}
        setTab={setTab}
        onOpenCity={(burg) => links.openCity(region, burg)}
        onOpenLocal={(marker) => links.openLocal(region, marker)}
        onOpenHere={(cell) => links.openHere(region, cell)}
        onDescend={(marker) => links.openUnderworld(region, marker)}
        onSelect={(next, at) => {
          setSelection(next);
          if (at) ctx.focus(at[0], at[1]);
        }}
      />
    ) : null,
    status: region ? t("region.summary", { burgs: region.burgs.length - 1, rivers: region.rivers.length - 1, markers: region.markers.length - 1, time }) : "",
    data: () => (region ? { ...planetToJson(region), format: "new-world-atlas/region" } : null),
  };
}
