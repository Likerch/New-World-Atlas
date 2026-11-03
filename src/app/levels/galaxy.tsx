// The galaxy level: stars, powers and lanes, wonders and regions of trouble. A star's card holds its world's profile,
// its people, rumours and hooks and its ways in; a power's card its ruler, banner, ways and quarrels. Search and
// filters find stars by name, power, port, zone or tag; layers show trade, borders, dangers, sectors and the grid. The
// game master's editor repaints stars, moves capitals, draws and cuts lanes, joins gates and sets wonders down, all
// kept in the map's patch, undoable and resettable.
import { useEffect, useMemo, useRef, useState } from "react";
import { CustomKinds, loadKinds, saveKinds } from "../CustomKinds";
import {
  cleanGalaxyEdits,
  cleanSystemEdits,
  countGalaxyEdits,
  editGalaxy,
  emptyGalaxyEdits,
  FEATURE_GLYPH,
  GALAXY_LAYERS,
  GALAXY_PLACEMENTS,
  GALAXY_SHAPES,
  galaxyLegend,
  galaxyParams,
  generateGalaxy,
  gridCell,
  inEllipse,
  mapKeyOf,
  OPENINGS,
  openingOf,
  renameGalaxy,
  renderGalaxy,
  siteOfStar,
  SPECTRA,
  starLore,
  surveyGalaxy,
  WORLD_TAGS,
  type Galaxy,
  type GalaxyEdits,
  type GalaxyLayers,
  type GalaxyParams,
  type Setting,
  type SpaceFeature,
  type SpectralClass,
  type Starport,
  type Zone,
} from "../../core/index";
import { NumberInput } from "../NumberInput";
import { NpcCard } from "../People";
import { CustomThing, EmblemView, LayerToggles, loadLayers, LoreBlock, ProfileCard, Row, saveLayers, SearchBox, Strangeness } from "../SpaceCards";
import type { SpaceLinks } from "./space-links";
import type { Level, LevelContext } from "./types";

const FEATURES: SpaceFeature[] = Object.keys(FEATURE_GLYPH) as SpaceFeature[];
const LAYER_DEFAULTS: GalaxyLayers = { territories: true, borders: true, sectors: false, grid: false, lanes: true, trade: true, danger: true, zones: false, labels: true };
type Tool = "paint" | "capital" | "lane" | "gate";
const TOOLS: Tool[] = ["paint", "capital", "lane", "gate"];
type Tab = "empires" | "stars" | "zones" | "sectors";

/** How stars are filtered in the list (and ringed on the map). */
interface Filter {
  query: string;
  power: string;
  port: string;
  zone: string;
  tag: string;
  kind: string;
}
const NO_FILTER: Filter = { query: "", power: "", port: "", zone: "", tag: "", kind: "" };

export function useGalaxyLevel(ctx: LevelContext, links: SpaceLinks, back: (() => void) | null = null, setting?: Partial<Setting>): Level & { load: (params: Partial<GalaxyParams>) => void } {
  const { t, nm } = ctx;
  const [input, setInput] = useState<GalaxyParams>(() => galaxyParams({ custom: loadKinds("atlas.kinds.galaxy") }));
  const [raw, setGalaxy] = useState<Galaxy | null>(null);
  const mapKey = raw ? mapKeyOf("galaxy", raw.params as unknown as Record<string, unknown>) : null;
  const patch = ctx.patch(mapKey);
  const names = patch.names;
  const edits = useMemo(() => cleanGalaxyEdits(patch.changes?.galaxy), [patch.changes?.galaxy]);
  const edited = useMemo(() => (raw ? editGalaxy(raw, edits) : null), [raw, edits]);
  // A world the game master reshaped in its system shows its new profile here too.
  const systemEdits = (id: number) => (edited ? cleanSystemEdits(ctx.patch(`system:${edited.params.seed}/star-${id}`).changes?.system) : null);
  const systemEditsKey = edited ? edited.stars.map((star) => (systemEdits(star.id) ? `${star.id}:${JSON.stringify(systemEdits(star.id))}` : "")).filter(Boolean).join("|") : "";
  const survey = useMemo(() => (edited ? surveyGalaxy(edited, systemEdits) : null), [edited, systemEditsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const galaxy = useMemo(() => (edited ? renameGalaxy(edited, names) : null), [edited, names]);
  const [star, setStar] = useState<number | null>(null);
  const [empire, setEmpire] = useState<number | null>(null);
  const [zone, setZone] = useState<number | null>(null);
  const [nebula, setNebula] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("empires");
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [layers, setLayersState] = useState<GalaxyLayers>(() => loadLayers("atlas.layers.galaxy", LAYER_DEFAULTS));
  const setLayers = (next: GalaxyLayers) => (setLayersState(next), saveLayers("atlas.layers.galaxy", next));
  const [tool, setTool] = useState<Tool | null>(null);
  const [power, setPower] = useState(1);
  const [pending, setPending] = useState<number | null>(null);
  const [history, setHistory] = useState<GalaxyEdits[]>([]);
  const [version, setVersion] = useState(0);
  const loading = useRef(false);
  const settingKey = JSON.stringify(setting ?? {});
  const build = (next: GalaxyParams) =>
    ctx.run(() => {
      loading.current = false;
      const made = generateGalaxy(next, setting);
      setGalaxy(made);
      setInput(made.params);
      setStar(null);
      setEmpire(null);
      setZone(null);
      setNebula(null);
      setHistory([]);
      setPending(null);
      setVersion((v) => v + 1);
    });
  // The world's setting changed: the same galaxy, grown again in it.
  const lastSetting = useRef(settingKey);
  useEffect(() => {
    if (lastSetting.current === settingKey) return;
    lastSetting.current = settingKey;
    if (raw) build(raw.params);
  }, [settingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof GalaxyParams>(key: K, value: GalaxyParams[K]) => setInput((current) => ({ ...current, [key]: value }));

  const kinds = new Map((galaxy?.params.custom ?? []).map((kind) => [kind.id, kind]));
  const filtering = Object.values(filter).some(Boolean);
  const matches = useMemo(() => {
    if (!galaxy || !survey) return [];
    const query = filter.query.trim().toLowerCase();
    return galaxy.stars.filter((s) => {
      const world = survey.worlds[s.id];
      if (query && !s.name.toLowerCase().includes(query) && !nm(s.name).toLowerCase().includes(query)) return false;
      if (filter.power && String(s.empire) !== filter.power) return false;
      if (filter.port && world.starport !== filter.port) return false;
      if (filter.zone && (filter.zone === "any" ? world.zone === "green" : world.zone !== filter.zone)) return false;
      if (filter.tag && !world.tags.includes(filter.tag as never)) return false;
      if (filter.kind === "notable" && !(s.capital || s.feature || s.custom || s.independent || s.natives)) return false;
      if (filter.kind === "settled" && !world.population) return false;
      if (filter.kind === "independent" && !s.independent) return false;
      if (filter.kind === "natives" && !s.natives) return false;
      if (filter.kind === "choke" && !survey.chokes[s.id]) return false;
      if (filter.kind === "feature" && !s.feature) return false;
      return true;
    });
  }, [galaxy, survey, filter, nm]);
  const marked = useMemo(() => (filtering ? matches.map((s) => s.id) : []), [filtering, matches]);
  // Without a filter the list shows the notable stars.
  const listed = filtering ? matches : matches.filter((s) => s.capital || s.feature || s.custom || s.independent || s.natives);
  const svg = useMemo(() => (galaxy ? renderGalaxy(galaxy, { script: ctx.script, highlight: empire, highlightZone: zone, highlightStar: star, survey, layers, marked, pending, players: ctx.players }) : ""), [galaxy, ctx.script, empire, zone, star, survey, layers, marked, pending, ctx.players]);
  const legend = useMemo(() => (galaxy ? galaxyLegend(galaxy, survey, layers, ctx.players) : undefined), [galaxy, survey, layers, ctx.players]);
  const zoneName = (z: Zone) => (z.kind === "custom" ? kinds.get(z.custom ?? "")?.name || t("custom.unnamed") : t(`zone.${z.kind}`));
  const selected = galaxy && star !== null ? galaxy.stars[star] : null;
  const empireName = (id: number) => (galaxy && id ? t(`eform.${galaxy.empires[id].form}`, { name: nm(galaxy.empires[id].name) }) : t("space.unclaimed"));
  const lore = useMemo(() => (galaxy && survey && star !== null ? starLore(galaxy, survey, star) : null), [galaxy, survey, star]);
  const era = galaxy?.age.era ?? "far-future";

  /** Edits go through here, so each one can be undone. */
  const change = (next: (current: GalaxyEdits) => GalaxyEdits) => {
    setHistory((past) => [...past.slice(-40), edits ?? emptyGalaxyEdits()]);
    ctx.update(mapKey, (p) => ({ ...p, changes: { ...p.changes, galaxy: next(cleanGalaxyEdits(p.changes?.galaxy) ?? emptyGalaxyEdits()) } }));
  };
  const editStar = (id: number, patchStar: GalaxyEdits["stars"][number]) => change((e) => ({ ...e, stars: { ...e.stars, [id]: { ...e.stars[id], ...patchStar } } }));
  const sameLane = (a: [number, number], b: [number, number]) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
  /** What a click does with an editor tool in hand. */
  const applyTool = (id: number) => {
    if (!galaxy || !tool) return;
    const target = galaxy.stars[id];
    if (tool === "paint") {
      if (!target.capital) editStar(id, { empire: power });
    } else if (tool === "capital") {
      if (power > 0) change((e) => ({ ...e, capitals: { ...e.capitals, [power]: id } }));
    } else if (pending === null) setPending(id);
    else if (pending !== id) {
      const pair: [number, number] = [pending, id];
      if (tool === "lane") {
        const exists = galaxy.lanes.some((lane) => sameLane(lane, pair));
        change((e) => {
          if (exists) return e.added.some((lane) => sameLane(lane, pair)) ? { ...e, added: e.added.filter((lane) => !sameLane(lane, pair)) } : { ...e, cut: [...e.cut, pair] };
          return e.cut.some((lane) => sameLane(lane, pair)) ? { ...e, cut: e.cut.filter((lane) => !sameLane(lane, pair)) } : { ...e, added: [...e.added, pair] };
        });
      } else change((e) => ({ ...e, gates: e.gates.some((gate) => sameLane(gate, pair)) ? e.gates.filter((gate) => !sameLane(gate, pair)) : [...e.gates, pair] }));
      setPending(null);
    }
  };
  const pickStar = (id: number) => {
    if (!galaxy) return;
    setStar(id);
    setZone(null);
    setNebula(null);
    setEmpire(galaxy.stars[id].empire || null);
    ctx.focus(galaxy.stars[id].x, galaxy.stars[id].y);
  };
  const openCustom = (id: number) => {
    if (!galaxy) return;
    const s = galaxy.stars[id];
    const kind = s.custom ? kinds.get(s.custom) : undefined;
    if (!kind) return;
    const way = openingOf(kind, `${galaxy.params.seed}/star-${id}`, nm(s.name), galaxy.age, s.empire ? galaxy.empires[s.empire].language : null);
    if (kind.opens === "system") links.openSystem(galaxy, id, survey);
    else if (way?.local) links.openLocal(way.local, `star:${id}:${kind.id}`);
    else if (way?.building) links.openBuilding(way.building, `star:${id}:${kind.id}`);
  };
  const world = selected && survey ? survey.worlds[selected.id] : null;
  const info = galaxy && survey && empire ? survey.powers[empire] : null;
  const neighbours = selected && galaxy ? galaxy.lanes.filter(([a, b]) => a === selected.id || b === selected.id).map(([a, b]) => (a === selected.id ? b : a)) : [];
  const gateTo = selected && galaxy ? (galaxy.gates ?? []).find(([a, b]) => a === selected.id || b === selected.id) : undefined;
  const site = selected && galaxy ? siteOfStar(galaxy, selected.id) : null;

  return {
    id: "galaxy",
    legend,
    icon: "🌌",
    title: galaxy?.name ?? null,
    seed: input.seed,
    setSeed: (seed) => set("seed", seed),
    generate: (seed) => build(seed ? { ...input, seed } : input),
    ensure: () => {
      if (!galaxy && !loading.current) build(input);
    },
    load: (params) => {
      loading.current = true;
      build(galaxyParams(params));
      ctx.show("galaxy");
    },
    mapKey,
    params: raw ? (raw.params as unknown as Record<string, unknown>) : null,
    restore: (saved) => build(galaxyParams(saved as Partial<GalaxyParams>)),
    selected: !galaxy
      ? null
      : star !== null
        ? { key: `star:${star}`, label: nm(galaxy.stars[star].name) }
        : zone !== null
          ? { key: `zone:${zone}`, label: `${zoneName(galaxy.zones[zone])} ${nm(galaxy.zones[zone].name)}` }
          : nebula !== null
            ? { key: `nebula:${nebula}`, label: `${t("legend.nebula")} ${nm(galaxy.nebulae[nebula].name)}` }
            : empire !== null
              ? { key: `empire:${empire}`, label: empireName(empire) }
              : { key: "world", label: nm(galaxy.name) },
    map: galaxy
      ? {
          svg,
          width: galaxy.params.width,
          height: galaxy.params.height,
          key: `galaxy-${version}`,
          onPick: (x, y) => {
            // A star under the click; else a region; else the power whose space it is; else a nebula; else nothing.
            let best = -1;
            let distance = Infinity;
            for (const s of galaxy.stars) {
              const d = Math.hypot(s.x - x, s.y - y);
              if (d < distance) {
                distance = d;
                best = s.id;
              }
            }
            const onStar = best >= 0 && distance < 12;
            if (tool) {
              if (onStar) applyTool(best);
              return;
            }
            const region = onStar ? undefined : galaxy.zones.find((z) => inEllipse(z, x, y));
            const reach = Math.sqrt((galaxy.params.width * galaxy.params.height) / galaxy.stars.length) * 1.4;
            const realm = !onStar && !region && best >= 0 && distance < reach ? galaxy.stars[best].empire : 0;
            const cloud = !onStar && !region && !realm ? galaxy.nebulae.find((n) => Math.hypot(n.x - x, n.y - y) < n.r * 0.7) : undefined;
            setStar(onStar ? best : null);
            setZone(region ? region.id : null);
            setNebula(cloud ? cloud.id : null);
            setEmpire(onStar ? galaxy.stars[best].empire || null : realm || null);
          },
        }
      : null,
    controls: (
      <>
        {back ? (
          <button type="button" className="back" onClick={back}>
            ← {t("action.backToUniverse")}
          </button>
        ) : null}
        <h2>{t("view.galaxy")}</h2>
        {raw?.params.origin ? <p className="muted">{t("galaxy.fromUniverse")}</p> : null}
        <label>
          {t("field.shape")}
          <select value={input.shape} onChange={(event) => set("shape", event.target.value as GalaxyParams["shape"])}>
            {GALAXY_SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {t(`shape.${shape}`)}
              </option>
            ))}
          </select>
        </label>
        {(["stars", "arms", "empires"] as const)
          .filter((key) => key !== "arms" || input.shape === "spiral" || input.shape === "barred")
          .map((key) => (
            <label key={key}>
              {t(`field.g${key}`)}
              <NumberInput min={key === "stars" ? 100 : key === "empires" ? 0 : 1} max={key === "stars" ? 2000 : 20} value={input[key]} onChange={(value) => set(key, value)} />
            </label>
          ))}
        <Strangeness t={t} value={input.anomalies} onChange={(value) => set("anomalies", value)} />
        {galaxy && galaxy.age.setting.era !== "far-future" ? <p className="muted">{t("galaxy.age", { era: t(`era.${galaxy.age.setting.era}`), tech: galaxy.age.tech })}</p> : null}
        <CustomKinds
          t={t}
          value={input.custom}
          places={GALAXY_PLACEMENTS}
          openings={OPENINGS.galaxy}
          onChange={(next) => {
            set("custom", next);
            saveKinds("atlas.kinds.galaxy", next);
          }}
        />
        <p className="muted">{t("custom.apply")}</p>
        <LayerToggles t={t} keys={GALAXY_LAYERS} value={layers} onChange={setLayers} prefix="glayer" />
        {galaxy ? (
          <details className="editor" onToggle={(event) => !(event.currentTarget as HTMLDetailsElement).open && (setTool(null), setPending(null))}>
            <summary>✏️ {t("geditor.title")}</summary>
            <div className="floor-tabs">
              {TOOLS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={tool === id}
                  onClick={() => {
                    setTool(tool === id ? null : id);
                    setPending(null);
                  }}
                >
                  {t(`geditor.tool.${id}`)}
                </button>
              ))}
            </div>
            {tool === "paint" || tool === "capital" ? (
              <label>
                {t("geditor.power")}
                <select value={power} onChange={(event) => setPower(Number(event.target.value))}>
                  {tool === "paint" ? <option value={0}>{t("space.unclaimed")}</option> : null}
                  {galaxy.empires.slice(1).map((item) => (
                    <option key={item.id} value={item.id}>
                      {empireName(item.id)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {tool ? <p className="muted">{pending !== null ? t("geditor.second", { name: nm(galaxy.stars[pending].name) }) : t(`geditor.hint.${tool}`)}</p> : <p className="muted">{t("geditor.cardHint")}</p>}
            {countGalaxyEdits(edits) ? <p className="muted">{t("geditor.summary", { count: countGalaxyEdits(edits) })}</p> : null}
            <div className="gm-row">
              <button
                type="button"
                disabled={!history.length}
                onClick={() => {
                  const last = history[history.length - 1];
                  setHistory((past) => past.slice(0, -1));
                  ctx.update(mapKey, (p) => ({ ...p, changes: { ...p.changes, galaxy: last } }));
                }}
              >
                ↶ {t("editor.undo")}
              </button>
              <button type="button" disabled={!countGalaxyEdits(edits)} onClick={() => change(() => emptyGalaxyEdits())}>
                {t("editor.reset")}
              </button>
            </div>
          </details>
        ) : null}
      </>
    ),
    inspector:
      galaxy && survey ? (
        <aside className="inspector">
          {selected && world ? (
            <div className="card">
              <h3>
                <span className="swatch" style={{ background: SPECTRA[selected.spectral].color }} />
                {nm(selected.name)}
              </h3>
              <Row label={t("space.class")} value={t(`spectral.${selected.spectral}`)} />
              <Row
                label={t("space.owner")}
                value={
                  selected.empire ? (
                    <button type="button" className="link" onClick={() => (setStar(null), setEmpire(selected.empire))}>
                      {empireName(selected.empire)}
                      {selected.capital ? ` · ${t("space.capital")}` : ""}
                    </button>
                  ) : selected.independent ? (
                    t("space.independent")
                  ) : (
                    t("space.unclaimed")
                  )
                }
              />
              <Row label={t("space.grid")} value={`${gridCell(selected.x, selected.y)}${survey.sectorOf[selected.id] >= 0 ? ` · ${t("sector.name", { name: nm(galaxy.stars[survey.sectors[survey.sectorOf[selected.id]].capital].name) })}` : ""}`} />
              {selected.natives ? <p className="muted">☘ {t("space.nativesHere")}</p> : null}
              <ProfileCard t={t} profile={world} locale={ctx.locale} />
              {selected.feature ? <Row label={t("space.feature")} value={`${FEATURE_GLYPH[selected.feature]} ${t(`feature2.${selected.feature}`)}`} /> : null}
              {selected.feature ? <p className="muted">{t(`feature2.${selected.feature}.about`)}</p> : null}
              {selected.farGate ? <p className="muted">⊗ {t("space.farGate", { name: nm(selected.farGate) })}</p> : null}
              {gateTo ? (
                <Row
                  label={t("space.gateTo")}
                  value={
                    <button type="button" className="link" onClick={() => pickStar(gateTo[0] === selected.id ? gateTo[1] : gateTo[0])}>
                      {nm(galaxy.stars[gateTo[0] === selected.id ? gateTo[1] : gateTo[0]].name)}
                    </button>
                  }
                />
              ) : selected.feature === "jump-gate" && !selected.farGate ? (
                <p className="muted">{t("space.gateDormant")}</p>
              ) : null}
              {selected.custom && kinds.get(selected.custom) ? <CustomThing t={t} kind={kinds.get(selected.custom)!} onOpen={() => openCustom(selected.id)} /> : null}
              {galaxy.zones
                .filter((z) => inEllipse(z, selected.x, selected.y))
                .map((z) => (
                  <Row key={z.id} label={t("zone.inside")} value={zoneName(z)} />
                ))}
              {survey.chokes[selected.id] ? <p className="muted">◆ {t("space.chokeStar")}</p> : null}
              <Row
                label={t("space.lanes")}
                value={neighbours.map((id, k) => (
                  <span key={id}>
                    {k ? ", " : ""}
                    <button type="button" className="link" onClick={() => pickStar(id)}>
                      {nm(galaxy.stars[id].name)}
                    </button>
                  </span>
                ))}
              />
              <button type="button" className="primary wide" onClick={() => links.openSystem(galaxy, selected.id, survey)}>
                ☀️ {t("action.openSystem")}
              </button>
              {site ? (
                <button type="button" className="wide" onClick={() => links.openLocal(site, `star:${selected.id}`)}>
                  🗺️ {t("action.openLocal")}
                </button>
              ) : null}
              {lore ? <LoreBlock t={t} nm={nm} era={era} people={lore.people} rumours={lore.rumours} hooks={lore.hooks} players={ctx.players} /> : null}
              <details className="editor">
                <summary>✏️ {t("geditor.star")}</summary>
                <label>
                  {t("space.class")}
                  <select value={selected.spectral} onChange={(event) => editStar(selected.id, { spectral: event.target.value as SpectralClass })}>
                    {(Object.keys(SPECTRA) as SpectralClass[]).map((key) => (
                      <option key={key} value={key}>
                        {t(`spectral.${key}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("space.owner")}
                  <select value={selected.empire} disabled={selected.capital} onChange={(event) => editStar(selected.id, { empire: Number(event.target.value) })}>
                    <option value={0}>{t("space.unclaimed")}</option>
                    {galaxy.empires.slice(1).map((item) => (
                      <option key={item.id} value={item.id}>
                        {empireName(item.id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("space.feature")}
                  <select value={selected.feature ?? ""} onChange={(event) => editStar(selected.id, { feature: (event.target.value || null) as SpaceFeature | null })}>
                    <option value="">{t("geditor.noFeature")}</option>
                    {FEATURES.map((key) => (
                      <option key={key} value={key}>
                        {FEATURE_GLYPH[key]} {t(`feature2.${key}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={selected.settled} disabled={selected.capital} onChange={(event) => editStar(selected.id, { settled: event.target.checked })} />
                  {t("space.settled")}
                </label>
                {selected.empire && !selected.capital ? (
                  <button type="button" className="wide" onClick={() => change((e) => ({ ...e, capitals: { ...e.capitals, [selected.empire]: selected.id } }))}>
                    ★ {t("geditor.makeCapital")}
                  </button>
                ) : null}
              </details>
            </div>
          ) : zone !== null && galaxy.zones[zone] ? (
            <div className="card">
              <h3>{nm(galaxy.zones[zone].name)}</h3>
              <Row label={t("stat.kind2")} value={zoneName(galaxy.zones[zone])} />
              <Row label={t("zone.stars")} value={galaxy.stars.filter((s) => inEllipse(galaxy.zones[zone], s.x, s.y)).length} />
              {galaxy.zones[zone].kind === "custom" ? (
                kinds.get(galaxy.zones[zone].custom ?? "") ? <CustomThing t={t} kind={kinds.get(galaxy.zones[zone].custom ?? "")!} /> : null
              ) : (
                <p className="muted">{t(`zone.${galaxy.zones[zone].kind}.about`)}</p>
              )}
            </div>
          ) : empire !== null && info && galaxy.empires[empire] ? (
            <div className="card">
              <h3>
                <span className="swatch" style={{ background: galaxy.empires[empire].color }} />
                {empireName(empire)}
              </h3>
              <EmblemView emblem={info.emblem} />
              <Row label={t("power.people")} value={`${nm(galaxy.empires[empire].species)} · ${t(`nature.${galaxy.empires[empire].nature}`)}`} />
              <Row
                label={t("legend.capital")}
                value={
                  <button type="button" className="link" onClick={() => pickStar(galaxy.empires[empire].capital)}>
                    {nm(galaxy.stars[galaxy.empires[empire].capital].name)}
                  </button>
                }
              />
              {galaxy.empires[empire].branch ? <p className="muted">{t("power.branch")}</p> : null}
              <Row label={t("power.stars")} value={t("power.holds", { stars: galaxy.empires[empire].stars, worlds: info.worlds })} />
              <Row label={t("profile.population")} value={info.people.toLocaleString(ctx.locale)} />
              <Row label={t("profile.tech")} value={t(`tl.${info.tech}`)} />
              <Row label={t("power.ethos")} value={info.ethos.map((item) => t(`ethos.${item}`)).join(", ")} />
              <Row label={t("power.goal")} value={t(`want.${info.goal}`)} />
              <h4 className="muted">{t("power.court")}</h4>
              <ul className="list people">
                <NpcCard t={t} nm={nm} npc={info.leader} age={era} />
                <NpcCard t={t} nm={nm} npc={info.heir} age={era} />
              </ul>
              <h4 className="muted">{t("power.relations")}</h4>
              <ul className="list">
                {Object.entries(info.relations).map(([other, relation]) => (
                  <li key={other} onClick={() => setEmpire(Number(other))}>
                    <span className="swatch" style={{ background: galaxy.empires[Number(other)].color }} />
                    <span className="grow">{empireName(Number(other))}</span>
                    <small className={`relation ${relation}`}>{t(`relation.${relation}`)}</small>
                  </li>
                ))}
              </ul>
              {survey.sectors.some((sector) => sector.power === empire) ? (
                <>
                  <h4 className="muted">{t("space.sectors")}</h4>
                  <ul className="list">
                    {survey.sectors
                      .filter((sector) => sector.power === empire)
                      .map((sector) => (
                        <li key={sector.id} onClick={() => pickStar(sector.capital)}>
                          <span className="grow">{t("sector.name", { name: nm(galaxy.stars[sector.capital].name) })}</span>
                          <small>{sector.stars}</small>
                        </li>
                      ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : (
            <p className="muted">{t("space.hint")}</p>
          )}
          <nav className="tabs">
            {(["empires", "stars", "zones", "sectors"] as const).map((name) => (
              <button key={name} type="button" aria-pressed={tab === name} onClick={() => setTab(name)}>
                {t(`space.${name}`)}
              </button>
            ))}
          </nav>
          {tab === "stars" ? (
            <div className="filters">
              <SearchBox t={t} value={filter.query} onChange={(query) => setFilter({ ...filter, query })} shown={Math.min(200, listed.length)} total={filtering ? matches.length : galaxy.stars.length} />
              <select value={filter.kind} onChange={(event) => setFilter({ ...filter, kind: event.target.value })} aria-label={t("filter.kind")}>
                <option value="">{t("filter.allStars")}</option>
                {["notable", "settled", "independent", "natives", "feature", "choke"].map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`filter.${kind}`)}
                  </option>
                ))}
              </select>
              <select value={filter.power} onChange={(event) => setFilter({ ...filter, power: event.target.value })} aria-label={t("space.owner")}>
                <option value="">{t("filter.anyPower")}</option>
                <option value="0">{t("space.unclaimed")}</option>
                {galaxy.empires.slice(1).map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {empireName(item.id)}
                  </option>
                ))}
              </select>
              <select value={filter.port} onChange={(event) => setFilter({ ...filter, port: event.target.value })} aria-label={t("profile.starport")}>
                <option value="">{t("filter.anyPort")}</option>
                {(["A", "B", "C", "D", "E", "X"] as Starport[]).map((port) => (
                  <option key={port} value={port}>
                    {port} — {t(`port.${port}`)}
                  </option>
                ))}
              </select>
              <select value={filter.zone} onChange={(event) => setFilter({ ...filter, zone: event.target.value })} aria-label={t("filter.zone")}>
                <option value="">{t("filter.anyZone")}</option>
                <option value="any">{t("filter.warned")}</option>
                <option value="amber">{t("zone2.amber")}</option>
                <option value="red">{t("zone2.red")}</option>
              </select>
              <select value={filter.tag} onChange={(event) => setFilter({ ...filter, tag: event.target.value })} aria-label={t("filter.tag")}>
                <option value="">{t("filter.anyTag")}</option>
                {WORLD_TAGS.map((tag) => (
                  <option key={tag} value={tag}>
                    {t(`tag.${tag}`)}
                  </option>
                ))}
              </select>
              {filtering ? (
                <button type="button" className="ghost" onClick={() => setFilter(NO_FILTER)}>
                  ✕ {t("filter.clear")}
                </button>
              ) : null}
            </div>
          ) : null}
          <ul className="list">
            {tab === "empires"
              ? galaxy.empires.slice(1).map((item) => (
                  <li
                    key={item.id}
                    aria-selected={empire === item.id}
                    onClick={() => {
                      setEmpire(item.id);
                      setStar(null);
                      ctx.focus(galaxy.stars[item.capital].x, galaxy.stars[item.capital].y);
                    }}
                  >
                    <span className="swatch" style={{ background: item.color }} />
                    <span className="grow">{empireName(item.id)}</span>
                    <small>{item.stars}</small>
                  </li>
                ))
              : tab === "zones"
                ? galaxy.zones.map((z) => (
                    <li
                      key={z.id}
                      aria-selected={zone === z.id}
                      onClick={() => {
                        setZone(z.id);
                        setStar(null);
                        ctx.focus(z.x, z.y);
                      }}
                    >
                      <span className="grow">{nm(z.name)}</span>
                      <small>{zoneName(z)}</small>
                    </li>
                  ))
                : tab === "sectors"
                  ? survey.sectors.map((sector) => (
                      <li key={sector.id} onClick={() => pickStar(sector.capital)}>
                        <span className="swatch" style={{ background: galaxy.empires[sector.power].color }} />
                        <span className="grow">{t("sector.name", { name: nm(galaxy.stars[sector.capital].name) })}</span>
                        <small>{sector.stars}</small>
                      </li>
                    ))
                  : listed.slice(0, 200).map((s) => (
                      <li key={s.id} aria-selected={star === s.id} onClick={() => pickStar(s.id)}>
                        <span className="grow">
                          {s.capital ? "★ " : ""}
                          {nm(s.name)}
                        </span>
                        <small>
                          <code>{survey.worlds[s.id].code}</code> {s.feature ? FEATURE_GLYPH[s.feature] : s.custom ? kinds.get(s.custom)?.glyph : ""}
                        </small>
                      </li>
                    ))}
          </ul>
        </aside>
      ) : null,
    // Fewer stars or powers than asked are said so, not silently given.
    status: galaxy
      ? [
          t("galaxy.summary", { stars: galaxy.stars.length, empires: galaxy.empires.length - 1, lanes: galaxy.lanes.length }),
          t("galaxy.zones", { zones: galaxy.zones.length }),
          ...(survey ? [t("galaxy.settledWorlds", { worlds: survey.worlds.filter((w) => w.population).length })] : []),
          ...(galaxy.stars.length < galaxy.params.stars ? [t("galaxy.fewerStars", { asked: galaxy.params.stars })] : []),
          ...(galaxy.empires.length - 1 < galaxy.params.empires ? [t("galaxy.fewerEmpires", { asked: galaxy.params.empires })] : []),
          ...(countGalaxyEdits(edits) ? [t("geditor.summary", { count: countGalaxyEdits(edits) })] : []),
        ].join(" · ")
      : "",
    data: () =>
      galaxy
        ? {
            format: "new-world-atlas/galaxy",
            version: 1,
            ...galaxy,
            age: undefined,
            empires: galaxy.empires.map(({ language: _l, ...e }) => e),
            survey: survey ? { worlds: survey.worlds, lanes: survey.lanes, chokes: survey.chokes, powers: survey.powers, sectors: survey.sectors } : null,
          }
        : null,
  };
}
