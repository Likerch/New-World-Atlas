// The universe level: galaxies on the cosmic web (or a supercluster, or a local group), their superclusters, voids and
// the strange things among them; the powers that reached past their galaxies and the gates between galaxies. Tabs
// list galaxies, superclusters, voids, the strange and the powers, with a search. A galaxy's card shows its kind, its
// peoples by name, what the strange nearby did to it, its neighbours, and opens it (a double click does too). The game
// master changes a galaxy's kind and size, marks where the game is ("you are here"), and measures along the filaments.
// A setting of magic sees crystal spheres in the phlogiston, or the planes of existence.
import { useEffect, useMemo, useRef, useState } from "react";
import { CustomKinds, loadKinds, saveKinds } from "../CustomKinds";
import {
  anomalyDistance,
  anomalyPoint,
  cleanUniverseEdits,
  cosmicHooks,
  editUniverse,
  filamentPath,
  GALAXY_KINDS,
  galaxyNeighbours,
  galaxyOfNode,
  generateUniverse,
  mapKeyOf,
  OPENINGS,
  openingOfAnomaly,
  planetOfPlane,
  powersOf,
  renameUniverse,
  renderUniverse,
  systemOfSphere,
  UNIVERSE_PLACEMENTS,
  universeLegend,
  universeParams,
  type CustomKind,
  type GalaxyKind,
  type Setting,
  type Universe,
  type UniverseEdits,
  type UniverseParams,
} from "../../core/index";
import { NumberInput } from "../NumberInput";
import { CustomThing, HookList, Row, SearchBox, Strangeness } from "../SpaceCards";
import type { SpaceLinks } from "./space-links";
import type { Level, LevelContext } from "./types";

type Picked = { kind: "galaxy" | "anomaly" | "void" | "cluster" | "power"; id: number } | null;
type Tab = "galaxies" | "clusters" | "voids" | "strange" | "powers";

export function useUniverseLevel(ctx: LevelContext, links: SpaceLinks, setting?: Partial<Setting>): Level {
  const { t, nm } = ctx;
  const [input, setInput] = useState<UniverseParams>(() => universeParams({ custom: loadKinds("atlas.kinds.universe") }, setting));
  const [raw, setUniverse] = useState<Universe | null>(null);
  const universeKey = raw ? mapKeyOf("universe", raw.params as unknown as Record<string, unknown>) : null;
  const patch = ctx.patch(universeKey);
  const edits = useMemo(() => cleanUniverseEdits(patch.changes?.universe), [patch.changes?.universe]);
  const edited = useMemo(() => (raw ? editUniverse(raw, edits) : null), [raw, edits]);
  const universe = useMemo(() => (edited ? renameUniverse(edited, patch.names) : null), [edited, patch.names]);
  const [picked, setPicked] = useState<Picked>(null);
  const [tab, setTab] = useState<Tab>("galaxies");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [names, setNames] = useState<"notable" | "all" | "none">("notable");
  const [borders, setBorders] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [ruler, setRuler] = useState<{ from: number; to: number | null } | null>(null);
  const [version, setVersion] = useState(0);
  const last = useRef({ id: -1, at: 0 });
  const settingKey = JSON.stringify(setting ?? {});
  const build = (next: UniverseParams) =>
    ctx.run(() => {
      const made = generateUniverse(next, setting);
      setUniverse(made);
      setInput(made.params);
      setPicked(null);
      setRuler(null);
      setVersion((v) => v + 1);
    });
  const lastSetting = useRef(settingKey);
  useEffect(() => {
    if (lastSetting.current === settingKey) return;
    lastSetting.current = settingKey;
    if (raw) build(raw.params);
  }, [settingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof UniverseParams>(key: K, value: UniverseParams[K]) => setInput((current) => ({ ...current, [key]: value }));

  const path = useMemo(() => (universe && ruler && ruler.to !== null ? filamentPath(universe, ruler.from, ruler.to) : null), [universe, ruler]);
  const cosmology = universe?.params.cosmology ?? "web";
  const unit = (mly: number) => (mly >= 1 ? t("universe.mly", { n: Math.round(mly * 10) / 10 }) : t("universe.kly", { n: Math.round(mly * 1000) }));
  const query2 = query.trim().toLowerCase();
  const found = useMemo(() => (universe ? universe.galaxies.filter((g) => (!query2 || g.name.toLowerCase().includes(query2) || nm(g.name).toLowerCase().includes(query2)) && (!kindFilter || (kindFilter === "civilised" ? g.civilisations > 0 : kindFilter === "power" ? g.power !== undefined : kindFilter === "touched" ? !!g.touched?.length : g.kind === kindFilter))) : []), [universe, query2, kindFilter, nm]);
  const filtering = !!query2 || !!kindFilter;
  // Without a filter the list shows the notable galaxies.
  const listed = filtering ? found : found.filter((g) => g.civilisations || g.kind === "quasar" || g.power !== undefined || g.id === universe?.home || g.plane);
  const svg = useMemo(
    () =>
      universe
        ? renderUniverse(universe, {
            script: ctx.script,
            highlight: picked?.kind === "galaxy" ? picked.id : null,
            highlightAnomaly: picked?.kind === "anomaly" ? picked.id : null,
            highlightCluster: picked?.kind === "cluster" ? picked.id : null,
            highlightVoid: picked?.kind === "void" ? picked.id : null,
            marked: filtering ? found.map((g) => g.id) : [],
            ruler: path?.path ?? (ruler ? [ruler.from] : null),
            rulerLabel: path ? t("universe.ruler", { length: unit(path.length * universe.scale), hops: path.path.length - 1 }) : undefined,
            hereLabel: t("universe.here"),
            names,
            borders,
            players: ctx.players,
          })
        : "",
    [universe, ctx.script, picked, filtering, found, path, ruler, names, borders, ctx.players, t], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const legend = useMemo(() => (universe ? universeLegend(universe, ctx.players) : undefined), [universe, ctx.players]);
  const ukinds = new Map((universe?.params.custom ?? []).map((kind): [string, CustomKind] => [kind.id, kind]));
  const anomalyName = (kind: string, custom?: string) => (kind === "custom" ? ukinds.get(custom ?? "")?.name || t("custom.unnamed") : t(`anomaly.${kind}${cosmology === "spheres" ? "@spheres" : ""}`));
  const galaxyWord = (key: string) => t(`${key}${cosmology === "web" ? "" : `@${cosmology}`}`);

  const change = (next: (current: UniverseEdits) => UniverseEdits) => ctx.update(universeKey, (p) => ({ ...p, changes: { ...p.changes, universe: next(cleanUniverseEdits(p.changes?.universe) ?? { galaxies: {} }) } }));
  /** A galaxy opens as the universe shows it: a galaxy map, a crystal sphere's system, or a plane as a world. */
  const open = (id: number) => {
    if (!universe) return;
    if (cosmology === "spheres") links.openLoneSystem(systemOfSphere(universe, id), `galaxy:${id}`);
    else if (cosmology === "planes") links.openPlanet(planetOfPlane(universe, id), `galaxy:${id}`);
    else links.openGalaxy(galaxyOfNode(universe, id), `galaxy:${id}`);
  };
  const openAnomaly = (id: number) => {
    if (!universe) return;
    const way = openingOfAnomaly(universe, id);
    if (way?.galaxy) links.openGalaxy(way.galaxy, `anomaly:${id}`);
    else if (way?.system) links.openLoneSystem(way.system, `anomaly:${id}`);
    else if (way?.local) links.openLocal(way.local, `anomaly:${id}`);
  };
  const pickOnly = (kind: NonNullable<Picked>["kind"], id: number | null) => setPicked(id === null ? null : { kind, id });
  const focusGalaxy = (id: number) => {
    if (!universe) return;
    pickOnly("galaxy", id);
    ctx.focus(universe.galaxies[id].x, universe.galaxies[id].y);
  };
  const selected = universe && picked?.kind === "galaxy" ? universe.galaxies[picked.id] : null;
  const strange = universe && picked?.kind === "anomaly" ? universe.anomalies[picked.id] : null;
  const bubble = universe && picked?.kind === "void" ? universe.voids[picked.id] : null;
  const cluster = universe && picked?.kind === "cluster" ? universe.clusters.find((c) => c.id === picked.id) : null;
  const power = universe && picked?.kind === "power" ? universe.powers[picked.id] : null;
  const peoples = useMemo(() => (universe && selected && cosmology === "web" ? powersOf(galaxyOfNode(universe, selected.id).seed!, Math.max(selected.civilisations, selected.power !== undefined ? 1 : 0), setting) : []), [universe, selected, cosmology, settingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const hooks = useMemo(() => (universe && picked && picked.kind !== "power" ? cosmicHooks(universe, picked as { kind: "galaxy" | "anomaly" | "void" | "cluster"; id: number }) : []), [universe, picked]);
  const galaxyLink = (id: number) => (
    <button type="button" className="link" onClick={() => focusGalaxy(id)}>
      {nm(universe!.galaxies[id].name)}
    </button>
  );

  return {
    id: "universe",
    legend,
    icon: "🌠",
    title: universe?.name ?? null,
    seed: input.seed,
    setSeed: (seed) => setInput((current) => ({ ...current, seed })),
    generate: (seed) => build(seed ? { ...input, seed } : input),
    ensure: () => {
      if (!universe) build(input);
    },
    mapKey: universeKey,
    params: universe ? (universe.params as unknown as Record<string, unknown>) : null,
    restore: (saved) => build(universeParams(saved as Partial<UniverseParams>, setting)),
    selected: !universe
      ? null
      : selected
        ? { key: `galaxy:${selected.id}`, label: nm(selected.name) }
        : strange
          ? { key: `anomaly:${strange.id}`, label: `${anomalyName(strange.kind, strange.custom)} ${nm(strange.name)}` }
          : bubble
            ? { key: `void:${bubble.id}`, label: `${galaxyWord("universe.void")} ${nm(bubble.name)}` }
            : cluster
              ? { key: `cluster:${cluster.id}`, label: `${galaxyWord("universe.cluster")} ${nm(cluster.name)}` }
              : power
                ? { key: `upower:${power.id}`, label: t(`eform.${power.form}`, { name: nm(power.name) }) }
                : { key: "world", label: nm(universe.name) },
    map: universe
      ? {
          svg,
          width: universe.params.width,
          height: universe.params.height,
          key: `universe-${version}`,
          onPick: (x, y) => {
            let best = -1;
            let distance = cosmology === "planes" ? 26 : 10;
            for (const g of universe.galaxies) {
              const d = Math.hypot(g.x - x, g.y - y);
              if (d < distance) {
                distance = d;
                best = g.id;
              }
            }
            if (best >= 0) {
              // The ruler: the first galaxy, then the second; a third click starts again.
              if (measuring) return setRuler((current) => (!current || current.to !== null ? { from: best, to: null } : { ...current, to: best }));
              // A second click on the same galaxy soon after opens it.
              const now = Date.now();
              if (last.current.id === best && now - last.current.at < 450) {
                last.current = { id: -1, at: 0 };
                return open(best);
              }
              last.current = { id: best, at: now };
              return pickOnly("galaxy", best);
            }
            // Off the galaxies, the strange thing drawn nearest the click (along a string, round a bubble's arc,
            // inside a region); else the void it falls in; else nothing.
            let near: number | null = null;
            let gap = Infinity;
            for (const a of universe.anomalies) {
              if (ctx.players && a.custom && universe.params.custom.find((kind) => kind.id === a.custom)?.secret) continue;
              const d = anomalyDistance(a, x, y);
              const reach = a.kind === "cosmic-string" || a.kind === "bubble-wall" ? 10 : Math.max(12, a.kind === "great-attractor" || a.kind === "dark-flow" || a.kind === "custom" ? a.size : 12);
              if (d < reach && d < gap) {
                gap = d;
                near = a.id;
              }
            }
            if (near !== null) return pickOnly("anomaly", near);
            const hollow = universe.voids.find((v) => Math.hypot(v.x - x, v.y - y) < v.r * 0.8);
            pickOnly("void", hollow ? hollow.id : null);
          },
        }
      : null,
    controls: (
      <>
        <h2>{t("view.universe")}</h2>
        <label>
          {t("universe.cosmology")}
          <select value={input.cosmology} onChange={(event) => set("cosmology", event.target.value as UniverseParams["cosmology"])}>
            {(["web", "spheres", "planes"] as const).map((item) => (
              <option key={item} value={item}>
                {t(`cosmology.${item}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">{t(`cosmology.${input.cosmology}.about`)}</p>
        {input.cosmology !== "planes" ? (
          <>
            {input.cosmology === "web" ? (
              <label>
                {t("universe.scale")}
                <select value={input.scale} onChange={(event) => set("scale", event.target.value as UniverseParams["scale"])}>
                  {(["web", "supercluster", "group"] as const).map((item) => (
                    <option key={item} value={item}>
                      {t(`uscale.${item}`)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              {t("field.ugalaxies")}
              <NumberInput min={input.scale === "group" ? 12 : 50} max={input.scale === "group" ? 80 : 800} value={input.galaxies} onChange={(value) => set("galaxies", value)} />
            </label>
            <label>
              {t("universe.clusters")}
              <NumberInput min={1} max={12} value={input.clusters} onChange={(value) => set("clusters", value)} />
            </label>
            {input.scale !== "group" ? (
              <label>
                {t("universe.voids")}
                <NumberInput min={0} max={24} value={input.voids} onChange={(value) => set("voids", value)} />
              </label>
            ) : null}
            <label>
              {t("universe.civShare", { share: Math.round(input.civilisations * 100) })}
              <input type="range" min={0} max={0.9} step={0.05} value={input.civilisations} onChange={(event) => set("civilisations", Number(event.target.value))} />
            </label>
            <div className="floor-tabs">
              {(["young", "now", "old"] as const).map((epoch) => (
                <button key={epoch} type="button" aria-pressed={input.epoch === epoch} title={t(`epoch.${epoch}.about`)} onClick={() => set("epoch", epoch)}>
                  {t(`epoch.${epoch}`)}
                </button>
              ))}
            </div>
            <Strangeness t={t} value={input.anomalies} onChange={(value) => set("anomalies", value)} />
          </>
        ) : null}
        <CustomKinds
          t={t}
          value={input.custom}
          places={UNIVERSE_PLACEMENTS}
          openings={OPENINGS.universe}
          onChange={(next) => {
            set("custom", next);
            saveKinds("atlas.kinds.universe", next);
          }}
        />
        <p className="muted">{t("custom.apply")}</p>
        {universe ? (
          <details className="space-layers">
            <summary>{t("panel.layers")}</summary>
            <label>
              {t("universe.names")}
              <select value={names} onChange={(event) => setNames(event.target.value as typeof names)}>
                {(["notable", "all", "none"] as const).map((item) => (
                  <option key={item} value={item}>
                    {t(`universe.names.${item}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={borders} onChange={(event) => setBorders(event.target.checked)} />
              {galaxyWord("universe.borders")}
            </label>
          </details>
        ) : null}
        {universe && cosmology !== "planes" ? (
          <button
            type="button"
            className="wide"
            data-tour="universe-ruler"
            aria-pressed={measuring}
            onClick={() => {
              setMeasuring(!measuring);
              setRuler(null);
            }}
          >
            📏 {t(measuring ? "universe.measureStop" : "universe.measure")}
          </button>
        ) : null}
        {measuring ? <p className="muted">{path ? t("universe.ruler", { length: unit(path.length * universe!.scale), hops: path.path.length - 1 }) : ruler ? t("universe.measureSecond") : t("universe.measureFirst")}</p> : null}
      </>
    ),
    inspector: universe ? (
      <aside className="inspector">
        {selected ? (
          <div className="card">
            <h3>{nm(selected.name)}</h3>
            {selected.id === universe.home ? <p className="muted">📍 {t("universe.here")}</p> : null}
            <Row label={t("stat.kind2")} value={cosmology === "planes" ? t(`plane.${selected.plane ?? "material"}`) : cosmology === "spheres" ? t("legend.sphere") : t(`gkind.${selected.kind}`)} />
            {cosmology === "planes" ? <p className="muted">{t(`plane.${selected.plane ?? "material"}.about`)}</p> : null}
            <Row label={galaxyWord("universe.cluster")} value={universe.clusters[selected.cluster] ? <button type="button" className="link" onClick={() => pickOnly("cluster", selected.cluster)}>{nm(universe.clusters[selected.cluster].name)}</button> : "—"} />
            {cosmology === "web" ? <Row label={t("universe.stars")} value={selected.stars.toLocaleString(ctx.locale)} /> : null}
            <Row label={t("universe.civilisations")} value={selected.civilisations} />
            {peoples.length ? <Row label={t("space.empires")} value={peoples.map((p, k) => (k === 0 && selected.power !== undefined ? t(`eform.${universe.powers[selected.power].form}`, { name: nm(universe.powers[selected.power].name) }) : t(`eform.${p.form}`, { name: nm(p.name) }))).join(", ")} /> : null}
            {selected.power !== undefined && universe.powers[selected.power] ? (
              <Row
                label={t("universe.heldBy")}
                value={
                  <button type="button" className="link" onClick={() => pickOnly("power", selected.power!)}>
                    {t(`eform.${universe.powers[selected.power].form}`, { name: nm(universe.powers[selected.power].name) })}
                  </button>
                }
              />
            ) : null}
            {(selected.touched ?? []).map((kind) => (
              <p key={kind} className="muted">
                ✷ <b>{anomalyName(kind)}:</b> {t(`touch.${kind}`)}
              </p>
            ))}
            {universe.gates
              .filter(([a, b]) => a === selected.id || b === selected.id)
              .map(([a, b]) => (
                <Row key={`${a}-${b}`} label={t("universe.gateTo")} value={galaxyLink(a === selected.id ? b : a)} />
              ))}
            <Row
              label={galaxyWord("universe.neighbours")}
              value={galaxyNeighbours(universe, selected.id)
                .slice(0, 8)
                .map((id, k) => (
                  <span key={id}>
                    {k ? ", " : ""}
                    {galaxyLink(id)}
                  </span>
                ))}
            />
            <button type="button" className="primary wide" onClick={() => open(selected.id)}>
              {cosmology === "spheres" ? `☀️ ${t("action.openSphere")}` : cosmology === "planes" ? `🌍 ${t("action.openPlane")}` : `🌌 ${t("action.openGalaxy")}`}
            </button>
            <p className="muted">{galaxyWord("universe.doubleClick")}</p>
            <HookList t={t} nm={nm} hooks={hooks} />
            <details className="editor">
              <summary>✏️ {galaxyWord("ueditor.title")}</summary>
              {cosmology === "web" ? (
                <>
                  <label>
                    {t("stat.kind2")}
                    <select value={selected.kind} onChange={(event) => change((e) => ({ ...e, galaxies: { ...e.galaxies, [selected.id]: { ...e.galaxies[selected.id], kind: event.target.value as GalaxyKind } } }))}>
                      {GALAXY_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {t(`gkind.${kind}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("universe.stars")}
                    <NumberInput min={100} max={2000} value={selected.stars} onChange={(value) => change((e) => ({ ...e, galaxies: { ...e.galaxies, [selected.id]: { ...e.galaxies[selected.id], stars: value } } }))} />
                  </label>
                </>
              ) : null}
              <label>
                {t("universe.civilisations")}
                <NumberInput min={0} max={20} value={selected.civilisations} onChange={(value) => change((e) => ({ ...e, galaxies: { ...e.galaxies, [selected.id]: { ...e.galaxies[selected.id], civilisations: value } } }))} />
              </label>
              <label className="check">
                <input type="checkbox" checked={universe.home === selected.id} onChange={(event) => change((e) => ({ ...e, home: event.target.checked ? selected.id : null }))} />
                📍 {t("universe.here")}
              </label>
              <div className="gm-row">
                <button type="button" disabled={!edits || !Object.keys(edits.galaxies).length} onClick={() => change((e) => ({ ...e, galaxies: {} }))}>
                  {t("editor.reset")}
                </button>
              </div>
            </details>
          </div>
        ) : strange ? (
          <div className="card">
            <h3>{nm(strange.name)}</h3>
            <Row label={t("stat.kind2")} value={anomalyName(strange.kind, strange.custom)} />
            {strange.kind === "custom" ? ukinds.get(strange.custom ?? "") ? <CustomThing t={t} kind={ukinds.get(strange.custom ?? "")!} /> : null : <p className="muted">{t(`anomaly.${strange.kind}.about`)}</p>}
            {strange.kind !== "custom" ? <p className="muted">{t(`touch.${strange.kind}`)}</p> : null}
            {strange.kind !== "custom" ? (
              <Row
                label={t("universe.touched")}
                value={universe.galaxies
                  .filter((g) => g.touched?.includes(strange.kind as never))
                  .slice(0, 10)
                  .map((g, k) => (
                    <span key={g.id}>
                      {k ? ", " : ""}
                      {galaxyLink(g.id)}
                    </span>
                  ))}
              />
            ) : null}
            {openingOfAnomaly(universe, strange.id) ? (
              <button type="button" className="primary wide" onClick={() => openAnomaly(strange.id)}>
                ↘ {t("action.openAnomaly")}
              </button>
            ) : null}
            <HookList t={t} nm={nm} hooks={hooks} />
          </div>
        ) : bubble ? (
          <div className="card">
            <h3>{nm(bubble.name)}</h3>
            <Row label={t("stat.kind2")} value={galaxyWord("universe.void")} />
            <Row label={t("universe.across")} value={unit(bubble.r * 2 * universe.scale)} />
            <Row label={t("universe.wall")} value={universe.galaxies.filter((g) => Math.abs(Math.hypot(g.x - bubble.x, g.y - bubble.y) - bubble.r) < 30).length} />
            <Row label={t("universe.strangeInside")} value={universe.anomalies.filter((a) => Math.hypot(anomalyPoint(a)[0] - bubble.x, anomalyPoint(a)[1] - bubble.y) < bubble.r).map((a) => nm(a.name)).join(", ") || "—"} />
            <HookList t={t} nm={nm} hooks={hooks} />
          </div>
        ) : cluster ? (
          <div className="card">
            <h3>{nm(cluster.name)}</h3>
            <Row label={t("stat.kind2")} value={galaxyWord("universe.cluster")} />
            {(() => {
              const members = universe.galaxies.filter((g) => g.cluster === cluster.id);
              const biggest = members.reduce<(typeof members)[number] | null>((best, g) => (!best || g.stars > best.stars ? g : best), null);
              const kinds = [...new Set(members.map((g) => g.kind))].map((kind) => [kind, members.filter((g) => g.kind === kind).length] as const).sort((a, b) => b[1] - a[1]);
              const held = [...new Set(members.flatMap((g) => (g.power !== undefined ? [g.power] : [])))];
              return (
                <>
                  <Row label={t("universe.galaxies")} value={members.length} />
                  <Row label={t("universe.civilisations")} value={members.reduce((sum, g) => sum + g.civilisations, 0)} />
                  {cosmology === "web" ? <Row label={t("universe.stars")} value={members.reduce((sum, g) => sum + g.stars, 0).toLocaleString(ctx.locale)} /> : null}
                  {cosmology === "web" ? <Row label={t("universe.kinds")} value={kinds.slice(0, 3).map(([kind, n]) => `${t(`gkind.${kind}`)} ${n}`).join(", ")} /> : null}
                  {biggest ? <Row label={t("universe.biggest")} value={galaxyLink(biggest.id)} /> : null}
                  {held.length ? <Row label={t("universe.powers")} value={held.map((id) => nm(universe.powers[id].name)).join(", ")} /> : null}
                </>
              );
            })()}
            <HookList t={t} nm={nm} hooks={hooks} />
          </div>
        ) : power ? (
          <div className="card">
            <h3>
              <span className="swatch" style={{ background: power.color }} />
              {t(`eform.${power.form}`, { name: nm(power.name) })}
            </h3>
            <Row label={t("universe.home")} value={galaxyLink(power.home)} />
            <Row label={t("universe.galaxies")} value={power.galaxies} />
            <p className="muted">{t("universe.powerAbout")}</p>
          </div>
        ) : (
          <p className="muted">{t(cosmology === "web" ? "universe.hint" : `universe.hint.${cosmology}`)}</p>
        )}
        <nav className="tabs">
          {(["galaxies", "clusters", "voids", "strange", "powers"] as const).map((name) => (
            <button key={name} type="button" data-tab={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
              {galaxyWord(`utab.${name}`)}
            </button>
          ))}
        </nav>
        {tab === "galaxies" ? (
          <div className="filters">
            <SearchBox t={t} value={query} onChange={setQuery} shown={Math.min(200, listed.length)} total={filtering ? found.length : universe.galaxies.length} />
            <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} aria-label={t("stat.kind2")}>
              <option value="">{t("filter.allGalaxies")}</option>
              <option value="civilised">{t("filter.civilised")}</option>
              <option value="power">{t("filter.held")}</option>
              <option value="touched">{t("filter.touched")}</option>
              {cosmology === "web" ? GALAXY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`gkind.${kind}`)}
                </option>
              )) : null}
            </select>
          </div>
        ) : null}
        <ul className="list">
          {tab === "galaxies"
            ? listed.slice(0, 200).map((g) => (
                <li key={g.id} aria-selected={picked?.kind === "galaxy" && picked.id === g.id} onClick={() => focusGalaxy(g.id)}>
                  <span className="grow">
                    {g.id === universe.home ? "📍 " : ""}
                    {nm(g.name)}
                  </span>
                  <small>{g.plane ? t(`plane.${g.plane}`) : g.civilisations ? `◉ ${g.civilisations}` : t(`gkind.${g.kind}`)}</small>
                </li>
              ))
            : tab === "clusters"
              ? universe.clusters.map((c) => (
                  <li key={c.id} aria-selected={cluster?.id === c.id} onClick={() => pickOnly("cluster", c.id)}>
                    <span className="swatch" style={{ background: c.color }} />
                    <span className="grow">{nm(c.name)}</span>
                    <small>{universe.galaxies.filter((g) => g.cluster === c.id).length}</small>
                  </li>
                ))
              : tab === "voids"
                ? universe.voids.map((v) => (
                    <li
                      key={v.id}
                      aria-selected={bubble?.id === v.id}
                      onClick={() => {
                        pickOnly("void", v.id);
                        ctx.focus(v.x, v.y);
                      }}
                    >
                      <span className="grow">{nm(v.name)}</span>
                      <small>{unit(v.r * 2 * universe.scale)}</small>
                    </li>
                  ))
                : tab === "powers"
                  ? universe.powers.map((p) => (
                      <li key={p.id} aria-selected={power?.id === p.id} onClick={() => pickOnly("power", p.id)}>
                        <span className="swatch" style={{ background: p.color }} />
                        <span className="grow">{t(`eform.${p.form}`, { name: nm(p.name) })}</span>
                        <small>{p.galaxies}</small>
                      </li>
                    ))
                  : universe.anomalies
                      .filter((a) => !(ctx.players && a.custom && ukinds.get(a.custom)?.secret))
                      .map((a) => (
                        <li
                          key={a.id}
                          aria-selected={strange?.id === a.id}
                          onClick={() => {
                            pickOnly("anomaly", a.id);
                            const [fx, fy] = anomalyPoint(a);
                            ctx.focus(fx, fy);
                          }}
                        >
                          <span className="grow">{nm(a.name)}</span>
                          <small>{anomalyName(a.kind, a.custom)}</small>
                        </li>
                      ))}
        </ul>
      </aside>
    ) : null,
    status: universe
      ? [
          t(cosmology === "web" ? "universe.summary" : `universe.summary.${cosmology}`, { galaxies: universe.galaxies.length, clusters: universe.clusters.length, voids: universe.voids.length }),
          ...(universe.powers.length ? [t("universe.powersCount", { powers: universe.powers.length })] : []),
          ...(universe.gates.length ? [t(`universe.gatesCount${cosmology === "web" ? "" : `@${cosmology}`}`, { gates: universe.gates.length })] : []),
        ].join(" · ")
      : "",
    data: () => (universe ? { format: "new-world-atlas/universe", version: 1, ...universe } : null),
  };
}
