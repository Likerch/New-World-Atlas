// The star-system level: one star's worlds, moons and places, as a scheme or as orbits on a date, in deep space or as a
// brass orrery. Each world's card holds its life, gravity, day, sky and calendar, its governor and the way down (a
// planet, its chief city); each place its keepers and its way in (a station as a building, a wreck as a local map, a
// gate to the star it joins). The system's card holds its main world's profile, factions, rumours and hooks; the lanes
// out lead to the neighbouring systems. The game master edits worlds (kind, people, station, owner), puts worlds in
// and takes them out, and prints the system's card.
import { useEffect, useMemo, useRef, useState } from "react";
import { CustomKinds, loadKinds, saveKinds } from "../CustomKinds";
import { systemKeyOf, loneSystemKeyOf, siteKey, cleanKind,
  BODY_KINDS,
  bodyCode,
  bodyOf,
  bodyPoint,
  buildingOfSite,
  cityOfBody,
  cleanGalaxyEdits,
  cleanSystemEdits,
  countSystemEdits,
  editGalaxy,
  EMPIRE_FORMS,
  emptyGalaxyEdits,
  emptySystemEdits,
  exitPoint,
  exitsOf,
  FEATURE_GLYPH,
  generateGalaxy,
  generateLoneSystem,
  generateSystem,
  localOfBelt,
  localOfSite,
  mapKeyOf,
  moonPoint,
  OPENINGS,
  openingOf,
  planetFromBody,
  planetOfSite,
  randomSeed,
  renameGalaxy,
  renameSystem,
  renderSystem,
  SITE_GLYPH,
  sitePoint,
  siteLore,
  skyOf,
  SPECTRA,
  surveyGalaxy,
  SYSTEM_PLACEMENTS,
  SYSTEM_SIZE,
  systemLayout,
  systemLegend,
  systemLore,
  worldLore,
  type BodyKind,
  type CustomKind,
  type EmpireForm,
  type Galaxy,
  type GalaxyParams,
  type GalaxySurvey,
  type Setting,
  type Site,
  type SpaceFeature,
  type SpectralClass,
  type StarSystem,
  type SystemEdits,
  type SystemParams,
  type SystemStyle,
  type SystemView,
} from "../../core/index";
import type { T } from "../i18n";
import { NumberInput } from "../NumberInput";
import { PeopleList } from "../People";
import { CustomThing, LoreBlock, ProfileCard, Row } from "../SpaceCards";
import type { SpaceLinks } from "./space-links";
import type { Level, LevelContext } from "./types";
import { printPage } from "../desktop";

type Selection = { kind: "body"; id: number } | { kind: "moon"; body: number; moon: number } | { kind: "site"; id: number } | null;
type Tool = "add" | "remove";
const FEATURES = Object.keys(FEATURE_GLYPH) as SpaceFeature[];

/** How the system is shown, kept in this browser. */
function loadLook(): { view: SystemView; style: SystemStyle } {
  try {
    const saved = JSON.parse(localStorage.getItem("atlas.system.look") ?? "null");
    return { view: saved?.view === "orbits" ? "orbits" : "scheme", style: saved?.style === "orrery" ? "orrery" : "space" };
  } catch {
    return { view: "scheme", style: "space" };
  }
}

export function useSystemLevel(ctx: LevelContext, links: SpaceLinks, back: (() => void) | null, setting?: Partial<Setting>): Level & { open: (galaxy: Galaxy, star: number, survey: GalaxySurvey | null) => void } {
  const { t, nm } = ctx;
  // A system cut from a galaxy regenerates from its star; otherwise the level makes a lone star of its own seed.
  const [source, setSource] = useState<{ galaxy: Galaxy; star: number; survey: GalaxySurvey | null } | null>(null);
  const [lone, setLone] = useState<SystemParams | null>(null);
  const [input, setInput] = useState<SystemParams>(() => ({ seed: randomSeed() }));
  const [kinds, setKinds] = useState<CustomKind[]>(() => loadKinds("atlas.kinds.system"));
  const [applied, setApplied] = useState<CustomKind[]>(kinds);
  // A galaxy's star is keyed by its galaxy as grown (not its seed alone); a lone system by what shapes it, apart from a
  // galaxy's star of the same seed.
  const mapKey = source ? systemKeyOf(source.galaxy.params, source.star) : lone ? loneSystemKeyOf(lone) : null;
  const patch = ctx.patch(mapKey);
  const edits = useMemo(() => cleanSystemEdits(patch.changes?.system), [patch.changes?.system]);
  const settingKey = JSON.stringify(setting ?? {});
  const raw = useMemo(() => (source ? generateSystem(source.galaxy, source.star, { edits, custom: applied }) : lone ? generateLoneSystem({ ...lone, custom: applied }, setting, edits) : null), [source, lone, edits, applied, settingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const system = useMemo(() => (raw ? renameSystem(raw, patch.names) : null), [raw, patch.names]);
  const [selection, setSelection] = useState<Selection>(null);
  const [look, setLookState] = useState(loadLook);
  const setLook = (next: Partial<typeof look>) => {
    const value = { ...look, ...next };
    setLookState(value);
    try {
      localStorage.setItem("atlas.system.look", JSON.stringify(value));
    } catch {
      // Storage may be off; the choice holds for this visit.
    }
  };
  const [day, setDay] = useState(0);
  const [tool, setTool] = useState<Tool | null>(null);
  const [addKind, setAddKind] = useState<BodyKind>("barren");
  const [history, setHistory] = useState<(SystemEdits | undefined)[]>([]);
  const exits = useMemo(() => (source ? exitsOf(source.galaxy, source.star) : []), [source]);
  const svg = useMemo(
    () => (system ? renderSystem(system, { script: ctx.script, highlight: selection?.kind === "body" ? selection.id : selection?.kind === "moon" ? selection.body : null, highlightMoon: selection?.kind === "moon" ? [selection.body, selection.moon] : null, highlightSite: selection?.kind === "site" ? selection.id : null, view: look.view, day, style: look.style, exits, players: ctx.players }) : ""),
    [system, ctx.script, selection, look, day, exits, ctx.players],
  );
  const legend = useMemo(() => (system ? systemLegend(system, { players: ctx.players, exits: exits.length > 0 }) : undefined), [system, ctx.players, exits]);
  const lore = useMemo(() => (system ? systemLore(system, source?.galaxy ?? null, source?.survey ?? null) : null), [system, source]);
  // The chain of power: the galaxy's power and its ruler, down to the governor of this system's main world.
  const chain = useMemo(() => {
    if (!system || !source?.survey || !system.context.power || system.profile.body === null) return null;
    const power = source.galaxy.empires[system.context.power];
    const ruler = source.survey.powers[system.context.power]?.leader;
    const governor = worldLore(system, system.profile.body)[0];
    if (!power || !ruler || !governor) return null;
    return t("space.chain", { power: t(`eform.${power.form}`, { name: nm(power.name) }), ruler: nm(ruler.name), governor: nm(governor.name), role: t(`role.${governor.role}`) });
  }, [system, source, t, nm]);
  const era = system?.age.era ?? "far-future";
  const reset = () => {
    setSelection(null);
    setHistory([]);
    setTool(null);
    setDay(0);
  };
  const open = (galaxy: Galaxy, star: number, survey: GalaxySurvey | null) => {
    setSource({ galaxy, star, survey });
    setLone(null);
    // The star decides its class and its people: nothing of a lone system made before stays in the form.
    setInput({ seed: `${galaxy.params.seed}/star-${star}` });
    reset();
  };
  const makeLone = (next: SystemParams, custom: CustomKind[] = kinds) => {
    setSource(null);
    setLone(next);
    setInput(next);
    setApplied(custom);
    reset();
  };
  // The galaxy a restored system hangs from, with the game master's edits and names on it.
  const restoreFrom = (params: Partial<GalaxyParams>, star: number) =>
    ctx.run(() => {
      const made = generateGalaxy(params, setting);
      const key = mapKeyOf("galaxy", made.params as unknown as Record<string, unknown>);
      const galaxyPatch = ctx.patch(key);
      const edited = editGalaxy(made, cleanGalaxyEdits(galaxyPatch.changes?.galaxy));
      open(renameGalaxy(edited, galaxyPatch.names), star, surveyGalaxy(edited));
    });
  const lastSetting = useRef(settingKey);
  useEffect(() => {
    if (lastSetting.current === settingKey) return;
    lastSetting.current = settingKey;
    if (source) restoreFrom(source.galaxy.params, source.star);
  }, [settingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The galaxy changed under this star (its owner repainted, a capital moved, lanes cut, names given): the system
  // follows it at once rather than at the next visit.
  const galaxyKey = source ? mapKeyOf("galaxy", source.galaxy.params as unknown as Record<string, unknown>) : null;
  const galaxyPatch = ctx.patch(galaxyKey);
  const galaxyPrint = `${galaxyKey}|${JSON.stringify(galaxyPatch.changes?.galaxy ?? null)}|${JSON.stringify(galaxyPatch.names)}`;
  const lastGalaxy = useRef(galaxyPrint);
  useEffect(() => {
    const before = lastGalaxy.current;
    lastGalaxy.current = galaxyPrint;
    if (before === galaxyPrint || !source || before.split("|")[0] !== galaxyKey) return;
    restoreFrom(source.galaxy.params, source.star);
  }, [galaxyPrint]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (next: (current: SystemEdits) => SystemEdits) => {
    setHistory((past) => [...past.slice(-40), patch.changes?.system as SystemEdits | undefined]);
    ctx.update(mapKey, (p) => ({ ...p, changes: { ...p.changes, system: next(cleanSystemEdits(p.changes?.system) ?? emptySystemEdits()) } }));
  };
  const editBody = (id: number, value: SystemEdits["bodies"][number]) => change((e) => ({ ...e, bodies: { ...e.bodies, [id]: { ...e.bodies[id], ...value } } }));
  /** The system's owner: a galaxy's star changes hands in the galaxy itself; a lone system keeps it here. */
  const setOwner = (value: string) => {
    if (source) {
      const key = mapKeyOf("galaxy", source.galaxy.params as unknown as Record<string, unknown>);
      ctx.update(key, (p) => {
        const current = cleanGalaxyEdits(p.changes?.galaxy) ?? emptyGalaxyEdits();
        return { ...p, changes: { ...p.changes, galaxy: { ...current, stars: { ...current.stars, [source.star]: { ...current.stars[source.star], empire: Number(value) } } } } };
      });
    } else change((e) => ({ ...e, owner: value }));
  };

  const selectedBody = system && selection?.kind === "body" ? bodyOf(system, selection.id) : system && selection?.kind === "moon" ? bodyOf(system, selection.body) : undefined;
  const selectedMoon = selectedBody && selection?.kind === "moon" ? selectedBody.moons[selection.moon] : undefined;
  const selectedSite = system && selection?.kind === "site" ? system.sites.find((s) => s.id === selection.id) : undefined;
  const custom = new Map((system?.custom ?? []).map((kind) => [kind.id, kind]));
  const siteName = (site: Site) => (site.kind === "custom" ? custom.get(site.custom ?? "")?.name || nm(site.name) : nm(site.name));
  const siteKind = (site: Site) => (site.kind === "custom" ? custom.get(site.custom ?? "")?.name || t("custom.unnamed") : t(`site.${site.kind}`));
  const owners = source ? source.galaxy.empires.slice(1) : [];

  const openSite = (site: Site) => {
    if (!system) return;
    const building = buildingOfSite(system, site);
    const local = localOfSite(system, site);
    const planet = planetOfSite(system, site);
    const kind = site.custom ? custom.get(site.custom) : undefined;
    const entity = `site:${site.kind}:${site.body ?? "free"}${site.moon !== undefined ? `:${site.moon}` : ""}`;
    if (kind) {
      const way = openingOf(kind, siteKey(system, site), siteName(site), system.age, system.language);
      if (way?.local) links.openLocal(way.local, entity);
      else if (way?.building) links.openBuilding(way.building, entity);
      else if (way?.planet) links.openPlanet(way.planet, entity);
      return;
    }
    if (building) links.openBuilding(building, entity);
    else if (planet) links.openPlanet(planet, entity);
    else if (local) links.openLocal(local, entity);
  };
  const leadsTo = (site: Site) => (typeof site.leads === "number" && source ? source.galaxy.stars[site.leads] : null);

  /** A click on the map: the editor's tool, else a place, a moon, a world or a belt's ring, else a way out. */
  const pick = (x: number, y: number) => {
    if (!system) return;
    const { view } = look;
    const bodies = system.bodies.filter((b) => !b.removed);
    if (tool === "add") {
      const { centre, maxOrbit } = systemLayout(system, view);
      const r = Math.hypot(x - centre[0], y - centre[1]);
      // The inverse of systemLayout's rOf: the same offsets and spans as the map is drawn with.
      const span = view === "orbits" ? [46, SYSTEM_SIZE.height / 2 - 110] : [90, SYSTEM_SIZE.width - 260];
      const orbit = Math.max(0.02, ((r - span[0]) / span[1]) ** 2 * maxOrbit);
      const angle = Math.atan2(y - centre[1], x - centre[0]);
      change((e) => ({ ...e, added: [...e.added, { orbit: Math.round(orbit * 1000) / 1000, kind: addKind, angle: Math.round(angle * 100) / 100 }] }));
      return;
    }
    const hidden = (s: Site) => ctx.players && !!s.custom && !!custom.get(s.custom)?.secret;
    const site = system.sites.find((s) => !hidden(s) && Math.hypot(sitePoint(system, s, view, day).x - x, sitePoint(system, s, view, day).y - y) < 9);
    if (site && !tool) return setSelection({ kind: "site", id: site.id });
    for (const b of bodies)
      for (let k = 0; k < b.moons.length; k++) {
        const at = moonPoint(system, b, k, view, day);
        if (!tool && Math.hypot(at.x - x, at.y - y) < at.r + 3) return setSelection({ kind: "moon", body: b.id, moon: k });
      }
    const hit =
      bodies.find((b) => b.kind !== "belt" && Math.hypot(bodyPoint(system, b, view, day).x - x, bodyPoint(system, b, view, day).y - y) < 26) ??
      bodies.find((b) => {
        const at = bodyPoint(system, b, view, day);
        return b.kind === "belt" && Math.abs(Math.hypot(x - at.centre[0], y - at.centre[1]) - at.r) < 10;
      });
    if (tool === "remove") {
      if (hit) change((e) => ({ ...e, removed: [...e.removed, hit.id] }));
      return;
    }
    if (hit) return setSelection({ kind: "body", id: hit.id });
    const exit = exits.find((e) => Math.hypot(exitPoint(system, e, view).x - x, exitPoint(system, e, view).y - y) < 18);
    if (exit && source) return links.openSystem(source.galaxy, exit.to, source.survey);
    setSelection(null);
  };
  const focusOn = (next: Selection) => {
    if (!system || !next) return;
    setSelection(next);
    const body = next.kind === "site" ? null : bodyOf(system, next.kind === "body" ? next.id : next.body);
    const at = next.kind === "site" ? sitePoint(system, system.sites.find((s) => s.id === next.id)!, look.view, day) : body ? (next.kind === "moon" ? moonPoint(system, body, next.moon, look.view, day) : bodyPoint(system, body, look.view, day)) : null;
    if (at) ctx.focus(at.x, at.y);
  };

  const selectedKey = !system ? null : selection?.kind === "body" ? `body:${selection.id}` : selection?.kind === "moon" ? `moon:${selection.body}:${selection.moon}` : selection?.kind === "site" ? `site:${selection.id}` : "world";
  return {
    id: "system",
    legend,
    icon: "☀️",
    title: system?.name ?? null,
    seed: input.seed,
    setSeed: (value) => setInput((current) => ({ ...current, seed: value })),
    generate: (value) => {
      const plain = input.spectral === undefined && input.settled === undefined && input.worlds === undefined && input.companion === undefined && input.feature === undefined && input.natives === undefined && input.form === undefined;
      if (!value && source && input.seed === `${source.galaxy.params.seed}/star-${source.star}` && plain) {
        setApplied(kinds);
        reset();
      } else makeLone(value ? { ...input, seed: value } : input);
    },
    ensure: () => {
      if (!system) makeLone(input);
    },
    open,
    mapKey,
    // A system cut from a galaxy is remembered by its galaxy and star; a lone one by its own parameters.
    params: system ? (source ? { galaxy: source.galaxy.params as unknown as Record<string, unknown>, star: source.star, ...(applied.length ? { custom: applied } : {}) } : ({ ...lone, ...(applied.length ? { custom: applied } : {}) } as unknown as Record<string, unknown>)) : null,
    restore: (saved) => {
      // The kinds the system was saved with, not the ones the panel holds now.
      const custom = (Array.isArray(saved.custom) ? (saved.custom as CustomKind[]) : []).map(cleanKind);
      setApplied(custom);
      if (saved.galaxy) restoreFrom(saved.galaxy as Partial<GalaxyParams>, saved.star as number);
      else makeLone(saved as unknown as SystemParams, custom);
    },
    selected: !system ? null : { key: selectedKey!, label: selectedSite ? siteName(selectedSite) : selectedMoon && selectedBody ? `${nm(selectedBody.name)} ${selectedMoon.name}` : selectedBody ? nm(selectedBody.name) : nm(system.name) },
    map: system
      ? {
          svg,
          width: SYSTEM_SIZE.width,
          height: SYSTEM_SIZE.height,
          key: `system-${system.seed}-${look.view}`,
          onPick: pick,
        }
      : null,
    controls: (
      <>
        {back ? (
          <button type="button" className="back" onClick={back}>
            ← {t("action.backToGalaxy")}
          </button>
        ) : null}
        <h2>{t("view.system")}</h2>
        <div className="floor-tabs">
          {(["scheme", "orbits"] as const).map((view) => (
            <button key={view} type="button" aria-pressed={look.view === view} onClick={() => setLook({ view })}>
              {t(`system.view.${view}`)}
            </button>
          ))}
        </div>
        {look.view === "orbits" ? (
          <label>
            {t("system.date", { days: day, years: Math.round((day / 365.25) * 10) / 10 })}
            <input type="range" min={0} max={3652} step={1} value={day} onChange={(event) => setDay(Number(event.target.value))} />
          </label>
        ) : null}
        <label>
          {t("field.theme")}
          <select value={look.style} onChange={(event) => setLook({ style: event.target.value as SystemStyle })}>
            <option value="space">{t("system.style.space")}</option>
            <option value="orrery">{t("system.style.orrery")}</option>
          </select>
        </label>
        {source ? <p className="muted">{t("system.fromGalaxy")}</p> : null}
        <details className="lone-settings" open={!source}>
          <summary>{t("system.lone")}</summary>
          <label>
            {t("space.class")}
            <select value={input.spectral ?? ""} onChange={(event) => setInput((current) => ({ ...current, spectral: (event.target.value || undefined) as SpectralClass | undefined }))}>
              <option value="">{t("system.anyStar")}</option>
              {(Object.keys(SPECTRA) as SpectralClass[]).map((key) => (
                <option key={key} value={key}>
                  {t(`spectral.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <TriState t={t} label={t("space.settled")} value={input.settled} onChange={(settled) => setInput((current) => ({ ...current, settled }))} />
          <TriState t={t} label={t("system.companion")} value={input.companion} onChange={(companion) => setInput((current) => ({ ...current, companion }))} />
          <TriState t={t} label={t("system.natives")} value={input.natives} onChange={(natives) => setInput((current) => ({ ...current, natives }))} />
          <label>
            {t("system.worlds")}
            <select value={input.worlds ?? ""} onChange={(event) => setInput((current) => ({ ...current, worlds: event.target.value === "" ? undefined : Number(event.target.value) }))}>
              <option value="">{t("system.byChance")}</option>
              {Array.from({ length: 15 }, (_, k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("space.feature")}
            <select value={input.feature ?? ""} onChange={(event) => setInput((current) => ({ ...current, feature: (event.target.value || undefined) as SpaceFeature | undefined }))}>
              <option value="">{t("geditor.noFeature")}</option>
              {FEATURES.map((key) => (
                <option key={key} value={key}>
                  {FEATURE_GLYPH[key]} {t(`feature2.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("system.form")}
            <select value={input.form ?? ""} onChange={(event) => setInput((current) => ({ ...current, form: (event.target.value || undefined) as EmpireForm | undefined }))}>
              <option value="">{t("system.byChance")}</option>
              {EMPIRE_FORMS.map((form) => (
                <option key={form} value={form}>
                  {t(`eform2.${form}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">{t("system.hint")}</p>
        </details>
        <CustomKinds
          t={t}
          value={kinds}
          places={SYSTEM_PLACEMENTS}
          openings={OPENINGS.system}
          onChange={(next) => {
            setKinds(next);
            saveKinds("atlas.kinds.system", next);
          }}
        />
        <p className="muted">{t("custom.apply")}</p>
        {system ? (
          <details className="editor" onToggle={(event) => !(event.currentTarget as HTMLDetailsElement).open && setTool(null)}>
            <summary>✏️ {t("seditor.title")}</summary>
            <div className="floor-tabs">
              {(["add", "remove"] as const).map((id) => (
                <button key={id} type="button" aria-pressed={tool === id} onClick={() => setTool(tool === id ? null : id)}>
                  {t(`seditor.tool.${id}`)}
                </button>
              ))}
            </div>
            {tool === "add" ? (
              <label>
                {t("stat.kind2")}
                <select value={addKind} onChange={(event) => setAddKind(event.target.value as BodyKind)}>
                  {BODY_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`body.${kind}`)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <p className="muted">{tool ? t(`seditor.hint.${tool}`) : t("seditor.cardHint")}</p>
            <label>
              {t("space.owner")}
              {source ? (
                <select value={source.galaxy.stars[source.star].empire} disabled={source.galaxy.stars[source.star].capital} onChange={(event) => setOwner(event.target.value)}>
                  <option value={0}>{t("space.unclaimed")}</option>
                  {owners.map((item) => (
                    <option key={item.id} value={item.id}>
                      {t(`eform.${item.form}`, { name: nm(item.name) })}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={edits?.owner ?? system.empire} placeholder={t("space.unclaimed")} onChange={(event) => setOwner(event.target.value)} />
              )}
            </label>
            {countSystemEdits(edits) ? <p className="muted">{t("seditor.summary", { count: countSystemEdits(edits) })}</p> : null}
            <div className="gm-row">
              <button
                type="button"
                disabled={!history.length}
                onClick={() => {
                  const last = history[history.length - 1];
                  setHistory((past) => past.slice(0, -1));
                  ctx.update(mapKey, (p) => ({ ...p, changes: { ...p.changes, system: last } }));
                }}
              >
                ↶ {t("editor.undo")}
              </button>
              <button type="button" disabled={!countSystemEdits(edits)} onClick={() => change(() => emptySystemEdits())}>
                {t("editor.reset")}
              </button>
            </div>
          </details>
        ) : null}
        {system ? (
          <button type="button" className="wide" onClick={() => printCard(system, t, nm, ctx.locale)}>
            🖨 {t("system.print")}
          </button>
        ) : null}
      </>
    ),
    inspector: system ? (
      <aside className="inspector">
        {selectedSite ? (
          <div className="card">
            <h3>
              {selectedSite.kind === "custom" ? custom.get(selectedSite.custom ?? "")?.glyph : SITE_GLYPH[selectedSite.kind]} {siteName(selectedSite)}
            </h3>
            <Row label={t("stat.kind2")} value={siteKind(selectedSite)} />
            {selectedSite.kind !== "custom" ? <p className="muted">{t(`site.${selectedSite.kind}.about`)}</p> : null}
            <Row label={t("site.where")} value={selectedSite.body !== null && bodyOf(system, selectedSite.body) ? `${nm(bodyOf(system, selectedSite.body)!.name)}${selectedSite.moon !== undefined ? ` ${bodyOf(system, selectedSite.body)!.moons[selectedSite.moon]?.name ?? ""}` : ""}` : `${selectedSite.orbit.toFixed(2)} AU`} />
            {selectedSite.crew ? <Row label={t("site.crew")} value={selectedSite.crew.toLocaleString(ctx.locale)} /> : null}
            {selectedSite.kind === "custom" && custom.get(selectedSite.custom ?? "") ? <CustomThing t={t} kind={custom.get(selectedSite.custom ?? "")!} onOpen={() => openSite(selectedSite)} /> : null}
            {typeof selectedSite.leads === "string" ? <p className="muted">⊗ {t("space.farGate", { name: nm(selectedSite.leads) })}</p> : null}
            {leadsTo(selectedSite) && source ? (
              <button type="button" className="wide" onClick={() => links.openSystem(source.galaxy, leadsTo(selectedSite)!.id, source.survey)}>
                ⊗ {t("site.goThrough", { name: nm(leadsTo(selectedSite)!.name) })}
              </button>
            ) : null}
            {selectedSite.kind !== "custom" && (buildingOfSite(system, selectedSite) || localOfSite(system, selectedSite) || planetOfSite(system, selectedSite)) ? (
              <button type="button" className="primary wide" onClick={() => openSite(selectedSite)}>
                {buildingOfSite(system, selectedSite) ? `🏠 ${t("action.openBuilding")}` : planetOfSite(system, selectedSite) ? `🌍 ${t("action.openPlanet")}` : `🗺️ ${t("action.openLocal")}`}
              </button>
            ) : null}
            {buildingOfSite(system, selectedSite) && localOfSite(system, selectedSite) ? (
              <button type="button" className="wide" onClick={() => links.openLocal(localOfSite(system, selectedSite)!, `site:${selectedSite.kind}:local`)}>
                🗺️ {t("action.openLocal")}
              </button>
            ) : null}
            <PeopleList t={t} nm={nm} people={siteLore(system, selectedSite)} age={era} />
          </div>
        ) : selectedBody ? (
          <BodyCard
            t={t}
            nm={nm}
            locale={ctx.locale}
            system={system}
            body={selectedBody.id}
            moon={selection?.kind === "moon" ? selection.moon : undefined}
            era={era}
            owners={owners.map((item) => t(`eform.${item.form}`, { name: nm(item.name) }))}
            edit={editBody}
            remove={(id) => change((e) => ({ ...e, removed: [...e.removed, id] }))}
            openPlanet={(params, entity) => links.openPlanet(params, entity)}
            openBelt={(id) => {
              const belt = localOfBelt(system, id);
              if (belt) links.openLocal(belt, `body:${id}`);
            }}
            openCity={(id, moon) => {
              const city = cityOfBody(system, id, moon);
              if (city) links.openCity(city.params, city.language, moon !== undefined ? `moon:${id}:${moon}/city` : `body:${id}/city`);
            }}
          />
        ) : (
          <div className="card">
            <h3>
              <span className="swatch" style={{ background: SPECTRA[system.spectral].color }} />
              {nm(system.name)}
            </h3>
            <Row label={t("space.class")} value={t(`spectral.${system.spectral}`)} />
            {system.companion ? <Row label={t("space.companion")} value={t(`spectral.${system.companion}`)} /> : null}
            <Row label={t("space.owner")} value={system.empire ? (system.context.form && edits?.owner === undefined ? t(`eform.${system.context.form}`, { name: nm(system.empire) }) : nm(system.empire)) : system.context.independent ? t("space.independent") : t("space.unclaimed")} />
            <Row label={t("space.zone")} value={`${system.zone[0].toFixed(2)}–${system.zone[1].toFixed(2)} AU`} />
            <Row label={t("legend.frost-line")} value={`${system.frost.toFixed(2)} AU`} />
            {system.context.zones.map((kind) => (
              <p key={kind} className="muted">
                <b>
                  {t("zone.inside")}: {t(`zone.${kind}`)}.
                </b>{" "}
                {t(`zone.${kind}.about`)}
              </p>
            ))}
            {chain ? <p className="muted">{chain}</p> : null}
            <ProfileCard t={t} profile={system.profile} locale={ctx.locale} />
            {lore ? <LoreBlock t={t} nm={nm} era={era} people={lore.people} factions={lore.factions} rumours={lore.rumours} hooks={lore.hooks} players={ctx.players} /> : null}
          </div>
        )}
        <h4 className="muted">{t("legend.worlds")}</h4>
        <ul className="list">
          {system.bodies
            .filter((b) => !b.removed)
            .flatMap((b) => [
              <li key={`b${b.id}`} aria-selected={selection?.kind === "body" && selection.id === b.id} onClick={() => focusOn({ kind: "body", id: b.id })}>
                <span className="grow">
                  {b.habitable ? "🌱 " : ""}
                  {b.natives ? "☘ " : ""}
                  {nm(b.name)}
                  {system.profile.body === b.id && system.profile.moon === undefined ? " ★" : ""}
                </span>
                <small>{t(`body.${b.kind}`)}</small>
              </li>,
              ...b.moons
                .map((m, k) => ({ m, k }))
                .filter(({ m }) => m.habitable || m.population)
                .map(({ m, k }) => (
                  <li key={`m${b.id}-${k}`} className="sub" aria-selected={selection?.kind === "moon" && selection.body === b.id && selection.moon === k} onClick={() => focusOn({ kind: "moon", body: b.id, moon: k })}>
                    <span className="grow">
                      ↳ {m.habitable ? "🌱 " : ""}
                      {nm(b.name)} {m.name}
                    </span>
                    <small>{t(`body.${m.kind}`)}</small>
                  </li>
                )),
            ])}
        </ul>
        {system.sites.length ? (
          <>
            <h4 className="muted">{t("legend.sites")}</h4>
            <ul className="list">
              {system.sites
                .filter((s) => !(ctx.players && s.custom && custom.get(s.custom)?.secret))
                .map((s) => (
                  <li key={s.id} aria-selected={selection?.kind === "site" && selection.id === s.id} onClick={() => focusOn({ kind: "site", id: s.id })}>
                    <span className="grow">
                      {s.kind === "custom" ? custom.get(s.custom ?? "")?.glyph : SITE_GLYPH[s.kind]} {siteName(s)}
                    </span>
                    <small>{siteKind(s)}</small>
                  </li>
                ))}
            </ul>
          </>
        ) : null}
        {exits.length && source ? (
          <>
            <h4 className="muted">{t("system.exits")}</h4>
            <ul className="list">
              {exits.map((exit) => (
                <li key={`${exit.kind}-${exit.to}`} onClick={() => links.openSystem(source.galaxy, exit.to, source.survey)}>
                  <span className="grow">
                    {exit.kind === "gate" ? "⊗" : exit.kind === "wormhole" ? "◎" : "→"} {nm(exit.name)}
                  </span>
                  <small>{t("system.lightYears", { ly: exit.distance })}</small>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </aside>
    ) : null,
    status: system ? [t("system.summary", { bodies: system.bodies.filter((b) => !b.removed).length, habitable: system.bodies.filter((b) => b.habitable && !b.removed).length }), t("system.places", { places: system.sites.length }), ...(countSystemEdits(edits) ? [t("seditor.summary", { count: countSystemEdits(edits) })] : [])].join(" · ") : "",
    data: () => (system ? { format: "new-world-atlas/system", version: 1, ...system, language: undefined, nativeTongue: undefined } : null),
  };
}

/** Yes, no, or let chance decide. */
function TriState({ t, label, value, onChange }: { t: T; label: string; value: boolean | undefined; onChange: (value: boolean | undefined) => void }) {
  return (
    <label>
      {label}
      <select value={value === undefined ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value === "true")}>
        <option value="">{t("system.byChance")}</option>
        <option value="true">{t("yes")}</option>
        <option value="false">{t("no")}</option>
      </select>
    </label>
  );
}

/** A world's (or a moon's) card: what it is, its life, sky and calendar, who governs it, the way down, the GM's edits. */
function BodyCard({ t, nm, locale, system, body: id, moon: moonIndex, era, owners, edit, remove, openPlanet, openCity, openBelt }: { t: T; nm: (name: string) => string; locale: string; system: StarSystem; body: number; moon?: number; era: string; owners: string[]; edit: (id: number, value: SystemEdits["bodies"][number]) => void; remove: (id: number) => void; openPlanet: (params: ReturnType<typeof planetFromBody>, entity: string) => void; openCity: (id: number, moon?: number) => void; openBelt: (id: number) => void }) {
  const body = bodyOf(system, id)!;
  const moon = moonIndex !== undefined ? body.moons[moonIndex] : undefined;
  const sky = skyOf(system, id, moonIndex);
  const giant = body.kind === "gas-giant" || body.kind === "ice-giant";
  const solid = moon ? true : !giant && body.kind !== "belt";
  const people = moon ? moon.population ?? 0 : body.population;
  const main = system.profile.body === id && system.profile.moon === moonIndex;
  const temperature = moon ? body.temperature - (moon.habitable ? 0 : 20) : body.temperature;
  const code = moon ? null : bodyCode(system.profile, body, system.seed);
  return (
    <div className="card">
      <h3>{moon ? `${nm(body.name)} ${moon.name}` : nm(body.name)}</h3>
      <Row label={t("stat.kind2")} value={t(`body.${moon ? moon.kind : body.kind}`)} />
      {moon ? <Row label={t("space.circles")} value={`${nm(body.name)} · ${t("space.radii", { n: moon.orbit ?? 0 })}`} /> : null}
      {!moon && body.homeworld ? <Row label={t("space.homeworld")} value={system.empire ? nm(system.empire) : "—"} /> : null}
      {!moon && body.natives ? <p className="muted">☘ {t("space.nativesWorld", { name: system.nativeTongue ? nm(body.name) : nm(body.name) })}</p> : null}
      {main ? <p className="muted">★ {t("space.mainWorld")}</p> : null}
      {code ? (
        <Row
          label={t("profile.code")}
          value={
            <>
              <code>{code.code}</code>
              {code.trade.map((item) => (
                <abbr key={item} title={t(`trade.${item}`)} className="trade-code">
                  {item}
                </abbr>
              ))}
            </>
          }
        />
      ) : null}
      <Row label={t("space.orbit")} value={`${body.orbit.toFixed(2)} AU`} />
      <Row label={t("space.year")} value={t("space.yearDays", { n: body.year })} />
      {body.kind !== "belt" ? (
        <>
          <Row label={t("space.radius")} value={`${(moon ? moon.radius : body.radius).toFixed(2)} R⊕`} />
          {!moon && body.gravity !== undefined ? <Row label={t("space.gravity")} value={`${body.gravity.toFixed(2)} g`} /> : null}
          <Row label={t("place.temperature")} value={`${temperature - 273} °C`} />
          {!moon ? <Row label={t("space.atmosphere")} value={t(`atmo.${body.atmosphere}`)} /> : null}
          {!moon ? <Row label={t("space.water")} value={`${Math.round(body.water * 100)}%`} /> : null}
          {!moon && body.habitability !== undefined ? <Row label={t("space.habitability")} value={`${body.habitability}/10 — ${t(`habit.${body.habitability <= 1 ? 0 : body.habitability <= 3 ? 1 : body.habitability <= 5 ? 2 : body.habitability <= 8 ? 3 : 4}`)}`} /> : null}
          {(moon ? moon.biosphere : body.biosphere) ? <Row label={t("space.biosphere")} value={t(`bio.${moon ? moon.biosphere : body.biosphere}`)} /> : null}
          {!moon ? <Row label={t("space.moons")} value={body.moons.length} /> : null}
        </>
      ) : null}
      {people ? <Row label={t("stat.population")} value={`${people.toLocaleString(locale)} ${t("unit.million")}`} /> : null}
      {!moon && body.owner ? <Row label={t("space.owner")} value={nm(body.owner)} /> : null}
      {sky ? (
        <details className="sky">
          <summary>{t("sky.title")}</summary>
          <p>
            {system.spectral === "BH"
              ? t("sky.blackHole")
              : t("sky.sun", { size: sky.sunSize, light: sky.sunLight, color: t(`sky.color.${system.spectral}`) })}
            {sky.companion ? ` ${t("sky.companion", { kind: t(`spectral.${sky.companion}`) })}` : ""}
          </p>
          {sky.parent ? <p>{t("sky.parent", { name: nm(sky.parent.name), size: sky.parent.size })}</p> : null}
          {sky.moons.length ? <p>{t("sky.moons", { list: sky.moons.map((m) => t("sky.moon", { name: m.name, size: m.size, month: m.month })).join("; ") })}</p> : null}
          {sky.planets.length ? <p>{t("sky.planets", { list: sky.planets.map((p) => `${nm(p.name)} (${t(`sky.${p.brightness}`)}${p.inner ? `, ${t("sky.inner")}` : ""})`).join(", ") })}</p> : null}
          <p>
            {sky.day ? t("sky.day", { hours: sky.day }) : t("sky.locked")} {sky.localYear ? t("sky.year", { days: sky.localYear }) : ""} {sky.months && sky.monthDays ? t("sky.months", { months: sky.months, days: sky.monthDays }) : ""}
          </p>
        </details>
      ) : null}
      {solid ? (
        <button type="button" className="primary wide" onClick={() => openPlanet(planetFromBody(system, id, moonIndex), moonIndex !== undefined ? `moon:${id}:${moonIndex}` : `body:${id}`)}>
          🌍 {t("action.openPlanet")}
        </button>
      ) : null}
      {!moon && body.kind === "belt" ? (
        <button type="button" className="primary wide" onClick={() => openBelt(id)}>
          🗺️ {t("action.openLocal")}
        </button>
      ) : null}
      {cityOfBody(system, id, moonIndex) ? (
        <button type="button" className="wide" onClick={() => openCity(id, moonIndex)}>
          🏙 {t(people < 50 && !(moon ? moon.habitable : body.habitable) ? "action.openHabitat" : "action.openCapital")}
        </button>
      ) : null}
      <PeopleList t={t} nm={nm} people={moon ? [] : worldLore(system, id)} age={body.natives ? "ancient" : era} />
      {!moon ? (
        <details className="editor">
          <summary>✏️ {t("seditor.world")}</summary>
          <label>
            {t("stat.kind2")}
            <select value={body.kind} onChange={(event) => edit(id, { kind: event.target.value as BodyKind })}>
              {BODY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`body.${kind}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("seditor.population")}
            <NumberInput min={0} max={100000} value={Math.round(body.population)} onChange={(value) => edit(id, { population: value })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={body.station} onChange={(event) => edit(id, { station: event.target.checked })} />
            {t("feature2.station")}
          </label>
          <label>
            {t("space.owner")}
            <input list={`owners-${id}`} value={body.owner ?? ""} placeholder={system.empire ? nm(system.empire) : t("space.unclaimed")} onChange={(event) => edit(id, { owner: event.target.value })} />
            <datalist id={`owners-${id}`}>
              {owners.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <button type="button" className="wide" onClick={() => remove(id)}>
            ✕ {t("seditor.remove")}
          </button>
        </details>
      ) : null}
    </div>
  );
}

const html = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

/** A printable card of the system: its star, main world profile, worlds and places. */
function printCard(system: StarSystem, t: T, nm: (name: string) => string, locale: string) {
  const p = system.profile;
  const rows = system.bodies
    .filter((b) => !b.removed)
    .map((b) => `<tr><td>${html(nm(b.name))}${system.profile.body === b.id ? " ★" : ""}</td><td>${html(t(`body.${b.kind}`))}</td><td>${b.orbit.toFixed(2)}</td><td>${b.kind === "belt" ? "" : `${b.temperature - 273} °C`}</td><td>${b.kind === "belt" ? "" : html(t(`atmo.${b.atmosphere}`))}</td><td>${b.population ? `${b.population.toLocaleString(locale)} ${html(t("unit.million"))}` : ""}</td><td>${b.moons.length || ""}</td></tr>`)
    .join("");
  const places = system.sites.map((s) => `<li>${html(s.kind === "custom" ? nm(s.name) : `${t(`site.${s.kind}`)} ${nm(s.name)}`)}</li>`).join("");
  const page = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${html(nm(system.name))}</title><style>body{font-family:Georgia,serif;margin:24px;color:#222}h1{margin:0 0 4px;letter-spacing:2px}code{font-size:18px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left;font-size:13px}.muted{color:#666}</style></head><body>
<h1>${html(nm(system.name).toUpperCase())}</h1>
<p class="muted">${html(t(`spectral.${system.spectral}`))}${system.companion ? ` + ${html(t(`spectral.${system.companion}`))}` : ""} · ${html(system.empire ? nm(system.empire) : t("space.unclaimed"))}</p>
<p><code>${p.code}</code> · ${html(t(`zone2.${p.zone}`))} · ${p.trade.join(" ")}</p>
<p>${html(t("profile.starport"))}: ${p.starport} — ${html(t(`port.${p.starport}`))}. ${html(t("profile.government"))}: ${html(t(`gov.${p.government}`))}. ${html(t("profile.tech"))}: ${html(t(`tl.${Math.min(15, p.tech)}`))}.</p>
${p.tags.map((tag) => `<p><b>${html(t(`tag.${tag}`))}.</b> ${html(t(`tag.${tag}.about`))}</p>`).join("")}
<table><tr><th>${html(t("legend.worlds"))}</th><th>${html(t("stat.kind2"))}</th><th>AU</th><th>${html(t("place.temperature"))}</th><th>${html(t("space.atmosphere"))}</th><th>${html(t("stat.population"))}</th><th>${html(t("space.moons"))}</th></tr>${rows}</table>
${places ? `<h3>${html(t("legend.sites"))}</h3><ul>${places}</ul>` : ""}
</body></html>`;
  printPage(page);
}
