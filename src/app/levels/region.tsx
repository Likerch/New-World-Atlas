// The region level: one province of the planet up close, with its villages, roads and local places.
import { useMemo, useState } from "react";
import { eraTheme, generateCountry, generateRegion, settingOf, LAYERS, planetToJson, renamePlanet, renderPlanet, THEMES, type Planet, type ThemeId, planetLegend } from "../../core/index";
import { Inspector, type Selection, type Tab } from "../Inspector";
import { selectedOf } from "./planet";
import { useLayers } from "./layers";
import type { Level, LevelContext } from "./types";

export function useRegionLevel(ctx: LevelContext, links: { openCity: (region: Planet, burg: number) => void; openLocal: (region: Planet, marker: number) => void; back: (() => void) | null }): Level & { open: (planet: Planet, province: number, style?: ThemeId) => void; openCountry: (planet: Planet, state: number, style?: ThemeId) => void } {
  const { t } = ctx;
  const [raw, setRegion] = useState<Planet | null>(null);
  const [of, setOf] = useState<{ of: "province" | "state"; id: number } | null>(null);
  const mapKey = raw ? `region:${raw.params.seed}` : null;
  const names = ctx.names(mapKey);
  const region = useMemo(() => (raw ? renamePlanet(raw, names) : null), [raw, names]);
  const [theme, setTheme] = useState<ThemeId>("atlas");
  const { layers, restyle, toggle } = useLayers("atlas", { provinces: true });
  // A close-up is drawn in its planet's style: the one the GM has on the planet, else the one its age suggests.
  const styleOf = (planet: Planet, style?: ThemeId) => {
    const next = style ?? eraTheme(settingOf(planet.params.setting));
    setTheme(next);
    restyle(next);
  };
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<Tab>("place");
  const [time, setTime] = useState(0);
  const highlight = selection && (selection.kind === "state" || selection.kind === "province" || selection.kind === "culture") ? { kind: selection.kind, id: selection.id } : null;
  const svg = useMemo(() => (region ? renderPlanet(region, { theme, layers, script: ctx.script, highlight, words: { km: t("unit.km"), atEquator: t("scale.equator") } }) : ""), [region, theme, layers, ctx.script, highlight?.kind, highlight?.id, t]); // eslint-disable-line react-hooks/exhaustive-deps
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
    fixed: true,
    openCountry: (planet, state, style) => {
      styleOf(planet, style);
      ctx.run(() => {
        const started = performance.now();
        setRegion(generateCountry(planet, state));
        setOf({ of: "state", id: state });
        setTime(Math.round(performance.now() - started));
        setSelection(null);
      });
      ctx.show("region");
    },
    open: (planet, province, style) => {
      styleOf(planet, style);
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
