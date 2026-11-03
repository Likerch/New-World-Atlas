// The underworld level: the caverns beneath the planet, opened from the planet's settings. A plan or a cross-section,
// the surface and the peoples' lands as layers; a list of caverns; a cavern's card with its depth, people, tunnels,
// places, folk and rumours, its town above and the surface over it; a tunnel's card; the peoples and how they stand
// with each other; and the game master's edits: caverns of another kind or people, removed or added, tunnels cut or dug.
import { useMemo, useState } from "react";
import { ageOf, CAVERN_KINDS, crowdOf, editUnderworld, generateUnderworld, makeNpc, mapKeyOf, renameUnderworld, renderUnderworld, renderUnderworldSection, rumoursOf, SECTION_HEIGHT, sectionPoint, settingOf, tierOf, TUNNEL_KINDS, underworldLegend, type CavernKind, type Hearsay, type Planet, type TunnelKind, type Underworld, type UnderworldChanges } from "../../core/index";
import { NpcCard, RumourList } from "../People";
import type { Level, LevelContext } from "./types";

export interface UnderworldLinks {
  /** Opens the town above a cavern (its catacombs, sewers or station). */
  openCity?: (planet: Planet, burg: number) => void;
}

type Tool = "join" | "add" | null;

export function useUnderworldLevel(ctx: LevelContext, openCave: (world: Underworld, cavern: number) => void, back: (() => void) | null, links: UnderworldLinks = {}): Level & { open: (planet: Planet, focus?: { cavern?: number; marker?: number }) => void; of: Planet | null } {
  const { t, nm } = ctx;
  const [state, setState] = useState<{ world: Underworld; planet: Planet } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [tunnel, setTunnel] = useState<number | null>(null);
  const [view, setView] = useState<"plan" | "section">("plan");
  const [surface, setSurface] = useState(false);
  const [lands, setLands] = useState(true);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>(null);
  const [newKind, setNewKind] = useState<CavernKind>("cavern");
  const [newWay, setNewWay] = useState<TunnelKind>("passage");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<CavernKind | "">("");
  // The underworld is its planet's: its key follows the planet's own (its settings' print) and the GM's relief strokes.
  const mapKey = state ? `underworld:${mapKeyOf("planet", state.planet.params as unknown as Record<string, unknown>).slice("planet:".length)}/underworld${state.planet.relief ? `~${state.planet.relief}` : ""}` : null;
  const patch = ctx.patch(mapKey);
  const changes = patch.changes?.underworld as UnderworldChanges | undefined;
  const world = useMemo(() => (state ? renameUnderworld(editUnderworld(state.world, changes), patch.names) : null), [state, changes, patch.names]);
  const age = state ? ageOf(settingOf(state.planet.params.setting)) : "medieval";
  const change = (edit: (current: UnderworldChanges) => UnderworldChanges) =>
    ctx.update(mapKey, (p) => ({ ...p, changes: { ...(p.changes ?? {}), underworld: edit({ ...((p.changes?.underworld as UnderworldChanges | undefined) ?? {}) }) } }));
  const svg = useMemo(() => {
    if (!state || !world) return "";
    if (view === "section") return renderUnderworldSection(world, state.planet, { script: ctx.script, highlight: picked, y: picked !== null ? world.caverns[picked]?.y : undefined, words: { upper: t("underworld.tier1"), middle: t("underworld.tier2"), deep: t("underworld.tier3"), km: t("unit.km") } });
    return renderUnderworld(world, state.planet, { script: ctx.script, highlight: picked, tunnel, surface, lands, km: t("unit.km") });
  }, [state, world, ctx.script, picked, tunnel, view, surface, lands, t]);
  const legend = useMemo(() => (world && state ? underworldLegend(world, state.planet) : undefined), [world, state]);
  const cavern = world && picked !== null ? world.caverns[picked] ?? null : null;
  const kindOf = (kind: string) => t(`cavern.${kind}`);
  const pick = (id: number | null, focus = false) => {
    setPicked(id);
    setTunnel(null);
    if (focus && id !== null && world && view === "plan") ctx.focus(world.caverns[id].x, world.caverns[id].y);
  };
  // The folk of a settlement and the rumours told of a cavern: the same every visit.
  const folk = useMemo(() => {
    if (!world || !cavern || !cavern.people || cavern.kind !== "settlement") return [];
    const people = world.peoples[cavern.people - 1];
    return crowdOf(`${mapKey}/cavern-${cavern.id}`, people.language, ["elder", "smith", "priest", "guard", "merchant", "miner", "shaman", "hunter"], 3, age);
  }, [world, cavern, mapKey, age]);
  const rumours = useMemo(() => {
    if (!world || !cavern) return [];
    const truths: Hearsay[] = [];
    const lies: Hearsay[] = [];
    const site = world.sites.find((s) => s.cavern === cavern.id);
    const otherSite = world.sites.find((s) => s.cavern !== cavern.id);
    if (site) truths.push({ key: "urumour.site", vars: { where: cavern.name, what: `@usite.${site.kind}` } });
    if (otherSite) lies.push({ key: "urumour.site", vars: { where: cavern.name, what: `@usite.${otherSite.kind}` } });
    world.tunnels.forEach(([a, b], k) => {
      if (a !== cavern.id && b !== cavern.id) return;
      const way = world.ways[k];
      const other = world.caverns[a === cavern.id ? b : a];
      if (way?.hazard) truths.push({ key: "urumour.hazard", vars: { from: cavern.name, to: other.name, hazard: `@hazard.${way.hazard}` } });
      else lies.push({ key: "urumour.hazard", vars: { from: cavern.name, to: other.name, hazard: "@hazard.cave-in" } });
    });
    truths.push({ key: "urumour.depth", vars: { where: cavern.name, depth: cavern.depth } });
    if (cavern.people) {
      const people = world.peoples[cavern.people - 1];
      for (const [other, relation] of Object.entries(people.relations)) {
        const them = world.peoples[Number(other) - 1];
        if (!them) continue;
        truths.push({ key: "urumour.people", vars: { people: people.name, other: them.name, relation: `@relation.${relation}` } });
        lies.push({ key: "urumour.people", vars: { people: people.name, other: them.name, relation: `@relation.${relation === "war" ? "alliance" : "war"}` } });
      }
    }
    return rumoursOf(`${mapKey}/cavern-${cavern.id}`, truths, lies);
  }, [world, cavern, mapKey]);
  const list = world ? world.caverns.filter((c) => !c.removed && (!kindFilter || c.kind === kindFilter) && (!query || nm(c.name).toLowerCase().includes(query.toLowerCase()))) : [];
  const ways = (id: number) => (world ? world.tunnels.map((tunnelItem, k) => ({ tunnel: tunnelItem, k })).filter(({ tunnel: [a, b] }) => a === id || b === id) : []);
  const wayLine = (k: number, from: number) => {
    if (!world) return "";
    const [a, b, kind] = world.tunnels[k];
    const way = world.ways[k];
    const other = world.caverns[a === from ? b : a];
    return [`→ ${nm(other.name)}`, t(`tunnel.${kind}`), way ? t("underworld.km", { n: way.length }) : "", way ? "⚠".repeat(way.danger) : "", way?.hazard ? t(`hazard.${way.hazard}`) : "", way?.undersea ? t("underworld.underSea") : ""].filter(Boolean).join(" · ");
  };
  const toggleRemoved = (id: number, removed: boolean) => change((c) => ({ ...c, caverns: { ...(c.caverns ?? {}), [id]: { ...(c.caverns?.[id] ?? {}), removed } } }));
  const setCavern = (id: number, edit: { kind?: CavernKind; people?: number }) => change((c) => ({ ...c, caverns: { ...(c.caverns ?? {}), [id]: { ...(c.caverns?.[id] ?? {}), ...edit } } }));

  return {
    id: "underworld",
    legend,
    icon: "🕳",
    title: world?.name ?? null,
    seed: world?.seed ?? "",
    setSeed: () => undefined,
    generate: () => undefined,
    ensure: () => undefined,
    of: state?.planet ?? null,
    open: (planet, focus) => {
      ctx.run(() => {
        const made = generateUnderworld(planet);
        setState({ world: made, planet });
        const at = focus?.cavern ?? (focus?.marker ? made.entrances.find((e) => e.marker === focus.marker)?.cavern : undefined);
        setPicked(at ?? null);
        setTunnel(null);
        if (at !== undefined) ctx.focus(made.caverns[at].x, made.caverns[at].y);
      });
      ctx.show("underworld");
    },
    mapKey,
    fixed: true,
    // The section is drawn on its own sheet: pins and fog go on the plan.
    sheetKey: view === "section" ? null : mapKey,
    params: world ? {} : null,
    selected: !world ? null : cavern ? { key: `cavern:${cavern.id}`, label: cavern.name } : { key: "world", label: world.name },
    map:
      world && state
        ? {
            svg,
            width: world.width,
            height: view === "section" ? SECTION_HEIGHT : world.height,
            key: `underworld-${world.seed}-${view}`,
            onPick: (x, y) => {
              const live = world.caverns.filter((c) => !c.removed);
              if (view === "section") {
                const hit = live.reduce<{ id: number; d: number } | null>((best, c) => {
                  const [sx, sy] = sectionPoint(world, c);
                  const d = Math.hypot(sx - x, sy - y);
                  return d < 14 && (!best || d < best.d) ? { id: c.id, d } : best;
                }, null);
                pick(hit ? hit.id : null);
                return;
              }
              const hit = live.find((c) => Math.hypot(c.x - x, c.y - y) < Math.max(c.r, 8));
              if (editing && tool === "add" && !hit) {
                change((c) => ({ ...c, added: [...(c.added ?? []), { x: Math.round(x), y: Math.round(y), kind: newKind, people: 0 }] }));
                setTool(null);
                return;
              }
              if (editing && tool === "join" && hit && picked !== null && hit.id !== picked) {
                change((c) => ({ ...c, joined: [...(c.joined ?? []), [picked, hit.id, newWay]] }));
                setTool(null);
                pick(hit.id);
                return;
              }
              if (hit) return pick(hit.id);
              // Near a tunnel: pick the tunnel.
              let best = -1,
                d0 = 7;
              world.tunnels.forEach(([a, b], k) => {
                const p = world.caverns[a],
                  q = world.caverns[b];
                const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
                const u = Math.max(0, Math.min(1, ((x - p.x) * (q.x - p.x) + (y - p.y) * (q.y - p.y)) / (len * len)));
                const d = Math.hypot(p.x + (q.x - p.x) * u - x, p.y + (q.y - p.y) * u - y);
                if (d < d0) [d0, best] = [d, k];
              });
              setPicked(null);
              setTunnel(best >= 0 ? best : null);
            },
          }
        : null,
    controls: (
      <>
        {back ? (
          <button type="button" className="back" onClick={back}>
            ← {t("action.backToPlanet")}
          </button>
        ) : null}
        <p className="muted">{t(world ? "underworld.legend" : "underworld.hint")}</p>
        {world ? (
          <>
            <div className="row-buttons">
              {(["plan", "section"] as const).map((id) => (
                <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>
                  {t(`underworld.view.${id}`)}
                </button>
              ))}
            </div>
            {view === "section" ? <p className="muted">{t("underworld.sectionHint")}</p> : null}
            <label className="check">
              <input type="checkbox" checked={surface} onChange={(event) => setSurface(event.target.checked)} />
              {t("underworld.surface")}
            </label>
            <label className="check">
              <input type="checkbox" checked={lands} onChange={(event) => setLands(event.target.checked)} />
              {t("underworld.lands")}
            </label>
            {!ctx.players ? (
              <details className="custom-kinds" open={editing} onToggle={(event) => setEditing((event.target as HTMLDetailsElement).open)}>
                <summary>✎ {t("underworld.edit")}</summary>
                <p className="muted">{t("underworld.editHint")}</p>
                <label>
                  {t("underworld.newKind")}
                  <select value={newKind} onChange={(event) => setNewKind(event.target.value as CavernKind)}>
                    {CAVERN_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kindOf(kind)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="wide" aria-pressed={tool === "add"} onClick={() => setTool(tool === "add" ? null : "add")}>
                  ＋ {t("underworld.addCavern")}
                </button>
                <label>
                  {t("underworld.newWay")}
                  <select value={newWay} onChange={(event) => setNewWay(event.target.value as TunnelKind)}>
                    {TUNNEL_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`tunnel.${kind}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="wide" disabled={picked === null} aria-pressed={tool === "join"} onClick={() => setTool(tool === "join" ? null : "join")}>
                  ⤳ {t("underworld.join")}
                </button>
                {tool ? <p className="muted">{t(tool === "add" ? "underworld.addHint" : "underworld.joinHint")}</p> : null}
                <button type="button" className="wide ghost" disabled={!changes} onClick={() => confirm(t("underworld.resetConfirm")) && ctx.update(mapKey, (p) => ({ ...p, changes: { ...(p.changes ?? {}), underworld: undefined } }))}>
                  ↺ {t("underworld.reset")}
                </button>
              </details>
            ) : null}
          </>
        ) : null}
      </>
    ),
    inspector: world ? (
      <aside className="inspector">
        {cavern ? (
          <div className="card">
            <h3>{nm(cavern.name)}</h3>
            <div className="row">
              <span>{t("stat.kind2")}</span>
              <b>{kindOf(cavern.kind)}</b>
            </div>
            <div className="row">
              <span>{t("underworld.depth")}</span>
              <b>
                {t("underworld.metres", { n: cavern.depth })} · {t(`underworld.tier${tierOf(cavern)}`)}
              </b>
            </div>
            {cavern.people ? (
              <div className="row">
                <span>{t("place.culture")}</span>
                <b>
                  {nm(world.peoples[cavern.people - 1].name)} · {t(`deep.${world.peoples[cavern.people - 1].kind}`)}
                </b>
              </div>
            ) : null}
            {cavern.population ? (
              <div className="row">
                <span>{t("stat.population")}</span>
                <b>
                  {cavern.population} {t("unit.thousand")}
                </b>
              </div>
            ) : null}
            {(() => {
              const way = world.entrances.find((e) => e.cavern === cavern.id && e.marker);
              const marker = way && state ? state.planet.markers[way.marker] : null;
              return marker ? (
                <div className="row">
                  <span>{t("underworld.wayDown")}</span>
                  <b>
                    {t(`marker.${marker.kind}`)}
                    {marker.name ? ` ${nm(marker.name)}` : ""}
                  </b>
                </div>
              ) : null;
            })()}
            {cavern.burg && state ? (
              <div className="row">
                <span>{t("underworld.townAbove")}</span>
                <b>{nm(state.planet.burgs[cavern.burg]?.name ?? "")}</b>
              </div>
            ) : null}
            <h4 className="muted">{t("underworld.ways")}</h4>
            <ul className="plain">
              {ways(cavern.id).map(({ tunnel: [a, b], k }) => (
                <li key={k} className="way-line">
                  <button type="button" className="ghost" onClick={() => pick(a === cavern.id ? b : a, true)}>
                    {wayLine(k, cavern.id)}
                  </button>
                  {editing ? (
                    <button type="button" className="ghost" title={t("underworld.cut")} aria-label={t("underworld.cut")} onClick={() => change((c) => ({ ...c, cut: [...(c.cut ?? []), [a, b]], joined: (c.joined ?? []).filter(([p, q]) => !((p === a && q === b) || (p === b && q === a))) }))}>
                      ✂
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {world.sites.filter((s) => s.cavern === cavern.id).length ? (
              <>
                <h4 className="muted">{t("underworld.places")}</h4>
                <ul className="plain">
                  {world.sites
                    .filter((s) => s.cavern === cavern.id)
                    .map((s) => (
                      <li key={s.id}>
                        <b>{t(`usite.${s.kind}`)}</b> «{nm(s.name)}» — {t(`usite.${s.kind}.about`, s.facts)}
                      </li>
                    ))}
                </ul>
              </>
            ) : null}
            {folk.length ? (
              <>
                <h4 className="muted">{t("npc.people")}</h4>
                <ul className="list people">
                  {folk.map((npc) => (
                    <NpcCard key={npc.id} t={t} nm={nm} npc={npc} age={age} />
                  ))}
                </ul>
              </>
            ) : null}
            {!ctx.players ? <RumourList t={t} nm={nm} rumours={rumours} players={ctx.players} /> : null}
            <div className="row-buttons">
              <button type="button" className="primary" onClick={() => openCave(world, cavern.id)}>
                🗺️ {t("action.openLocal")}
              </button>
              <button
                type="button"
                onClick={() => {
                  ctx.show("planet");
                  ctx.focus(cavern.x, cavern.y);
                }}
              >
                ⬆ {t("underworld.toSurface")}
              </button>
              {cavern.burg && links.openCity && state ? (
                <button type="button" onClick={() => links.openCity!(state.planet, cavern.burg!)}>
                  🏙 {t("underworld.openTown")}
                </button>
              ) : null}
            </div>
            {editing ? (
              <div className="room-edit">
                <label>
                  {t("stat.kind2")}
                  <select value={cavern.kind} onChange={(event) => setCavern(cavern.id, { kind: event.target.value as CavernKind })}>
                    {CAVERN_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kindOf(kind)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("place.culture")}
                  <select value={cavern.people} onChange={(event) => setCavern(cavern.id, { people: Number(event.target.value) })}>
                    <option value={0}>{t("underworld.nobody")}</option>
                    {world.peoples.map((people) => (
                      <option key={people.id} value={people.id}>
                        {nm(people.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="wide ghost" onClick={() => (toggleRemoved(cavern.id, true), pick(null))}>
                  🗑 {t("underworld.remove")}
                </button>
              </div>
            ) : null}
          </div>
        ) : tunnel !== null && world.tunnels[tunnel] ? (
          <div className="card">
            <h3>{t(`tunnel.${world.tunnels[tunnel][2]}`)}</h3>
            <p>
              {nm(world.caverns[world.tunnels[tunnel][0]].name)} ⟷ {nm(world.caverns[world.tunnels[tunnel][1]].name)}
            </p>
            {world.ways[tunnel] ? (
              <>
                <div className="row">
                  <span>{t("underworld.length")}</span>
                  <b>{t("underworld.km", { n: world.ways[tunnel].length })}</b>
                </div>
                <div className="row">
                  <span>{t("underworld.danger")}</span>
                  <b>{"⚠".repeat(world.ways[tunnel].danger)}</b>
                </div>
                {world.ways[tunnel].hazard ? (
                  <div className="row">
                    <span>{t("underworld.hazard")}</span>
                    <b>{t(`hazard.${world.ways[tunnel].hazard}`)}</b>
                  </div>
                ) : null}
                {world.ways[tunnel].undersea ? <p className="muted">🌊 {t("underworld.underSeaLong")}</p> : null}
              </>
            ) : null}
            {editing ? (
              <button
                type="button"
                className="wide ghost"
                onClick={() => {
                  const [a, b] = world.tunnels[tunnel];
                  change((c) => ({ ...c, cut: [...(c.cut ?? []), [a, b]], joined: (c.joined ?? []).filter(([p, q]) => !((p === a && q === b) || (p === b && q === a))) }));
                  setTunnel(null);
                }}
              >
                ✂ {t("underworld.cut")}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="muted">{t("underworld.pick")}</p>
        )}
        <h4 className="muted">{t("underworld.peoples")}</h4>
        <ul className="list deep-peoples">
          {world.peoples.map((people) => {
            const home = world.caverns[people.capital];
            const leader = makeNpc(`${mapKey}/people-${people.id}/leader`, people.language, "elder");
            return (
              <li
                key={people.id}
                onClick={() => {
                  if (home && !home.removed) pick(home.id, true);
                }}
              >
                <span className="swatch" style={{ background: people.color }} />
                <span className="grow">
                  <b>{nm(people.name)}</b> · {t(`deep.${people.kind}`)}
                  <small className="line">
                    {t("underworld.holds", { n: world.caverns.filter((c) => c.people === people.id && !c.removed).length })}
                    {people.population ? ` · ${people.population} ${t("unit.thousand")}` : ""}
                    {home ? ` · ${t("underworld.capital", { name: nm(home.name) })}` : ""}
                  </small>
                  <small className="line">{t("npc.leads", { name: nm(leader.name), role: t(`role.${leader.role}`) })}</small>
                  {Object.entries(people.relations).map(([other, relation]) => (
                    <small key={other} className="line">
                      {relation === "war" || relation === "feud" ? "⚔" : relation === "alliance" || relation === "trade" ? "🤝" : "·"} {t(`relation.${relation}`)}: {nm(world.peoples[Number(other) - 1]?.name ?? "")}
                    </small>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
        <h4 className="muted">{t("underworld.list")}</h4>
        <div className="custom-row">
          <input className="grow" value={query} placeholder={t("search")} aria-label={t("search")} onChange={(event) => setQuery(event.target.value)} />
          <select value={kindFilter} aria-label={t("stat.kind2")} onChange={(event) => setKindFilter(event.target.value as CavernKind | "")}>
            <option value="">{t("underworld.allKinds")}</option>
            {CAVERN_KINDS.filter((kind) => world.caverns.some((c) => c.kind === kind && !c.removed)).map((kind) => (
              <option key={kind} value={kind}>
                {kindOf(kind)}
              </option>
            ))}
          </select>
        </div>
        <ul className="list caverns">
          {list.map((c) => (
            <li key={c.id} aria-selected={c.id === picked} onClick={() => pick(c.id, true)}>
              <span className="swatch" style={{ background: c.people ? world.peoples[c.people - 1]?.color : "transparent" }} />
              <span className="grow">
                {nm(c.name)}
                <small className="line">
                  {kindOf(c.kind)} · {t("underworld.metres", { n: c.depth })}
                </small>
              </span>
            </li>
          ))}
        </ul>
        {editing && world.caverns.some((c) => c.removed) ? (
          <>
            <h4 className="muted">{t("underworld.removed")}</h4>
            <ul className="plain">
              {world.caverns
                .filter((c) => c.removed)
                .map((c) => (
                  <li key={c.id}>
                    {nm(c.name)}{" "}
                    <button type="button" className="ghost" onClick={() => toggleRemoved(c.id, false)}>
                      ↺ {t("underworld.restore")}
                    </button>
                  </li>
                ))}
            </ul>
          </>
        ) : null}
      </aside>
    ) : null,
    status: world ? t("underworld.summary", { caverns: world.caverns.filter((c) => !c.removed).length, tunnels: world.tunnels.length, entrances: world.entrances.length }) : "",
    data: () => (world ? { format: "new-world-atlas/underworld", version: 2, ...world, peoples: world.peoples.map(({ language: _l, ...p }) => p) } : null),
  };
}
