// The galaxy and star-system levels: stars, powers and lanes; then one system's worlds, any of which can be opened as
// a planet.
import { useMemo, useState } from "react";
import { GALAXY_SHAPES, localFromStar, galaxyParams, generateGalaxy, generateSystem, planetFromBody, renameGalaxy, renameSystem, renderGalaxy, renderSystem, SPECTRA, type Galaxy, type GalaxyParams, type PlanetParams, type StarSystem } from "../../core/index";
import type { Level, LevelContext } from "./types";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function useGalaxyLevel(ctx: LevelContext, openSystem: (galaxy: Galaxy, star: number) => void, openLocal: (galaxy: Galaxy, star: number) => void): Level {
  const { t, nm } = ctx;
  const [input, setInput] = useState<GalaxyParams>(() => galaxyParams());
  const [raw, setGalaxy] = useState<Galaxy | null>(null);
  const mapKey = raw ? `galaxy:${raw.params.seed}` : null;
  const names = ctx.names(mapKey);
  const galaxy = useMemo(() => (raw ? renameGalaxy(raw, names) : null), [raw, names]);
  const [star, setStar] = useState<number | null>(null);
  const [empire, setEmpire] = useState<number | null>(null);
  const [tab, setTab] = useState<"empires" | "stars">("empires");
  const [version, setVersion] = useState(0);
  const build = (next: GalaxyParams) =>
    ctx.run(() => {
      const made = generateGalaxy(next);
      setGalaxy(made);
      setInput(made.params);
      setStar(null);
      setEmpire(null);
      setVersion((v) => v + 1);
    });
  const set = <K extends keyof GalaxyParams>(key: K, value: GalaxyParams[K]) => setInput((current) => ({ ...current, [key]: value }));
  const svg = useMemo(() => (galaxy ? renderGalaxy(galaxy, { script: ctx.script, highlight: empire }) : ""), [galaxy, ctx.script, empire]);
  const selected = galaxy && star !== null ? galaxy.stars[star] : null;
  const empireName = (id: number) => (galaxy && id ? t(`eform.${galaxy.empires[id].form}`, { name: nm(galaxy.empires[id].name) }) : t("space.unclaimed"));

  return {
    id: "galaxy",
    icon: "🌌",
    title: galaxy?.name ?? null,
    seed: input.seed,
    setSeed: (seed) => set("seed", seed),
    generate: (seed) => build(seed ? { ...input, seed } : input),
    ensure: () => {
      if (!galaxy) build(input);
    },
    mapKey,
    selected: !galaxy ? null : star !== null ? { key: `star:${star}`, label: galaxy.stars[star].name } : empire !== null ? { key: `empire:${empire}`, label: galaxy.empires[empire].name } : { key: "world", label: galaxy.name },
    map: galaxy
      ? {
          svg,
          width: galaxy.params.width,
          height: galaxy.params.height,
          key: `galaxy-${version}`,
          onPick: (x, y) => {
            let best = -1;
            let distance = 12;
            for (const s of galaxy.stars) {
              const d = Math.hypot(s.x - x, s.y - y);
              if (d < distance) {
                distance = d;
                best = s.id;
              }
            }
            setStar(best >= 0 ? best : null);
            if (best >= 0) setEmpire(galaxy.stars[best].empire || null);
          },
        }
      : null,
    controls: (
      <>
        <h2>{t("view.galaxy")}</h2>
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
        {(["stars", "arms", "empires"] as const).map((key) => (
          <label key={key}>
            {t(`field.g${key}`)}
            <input type="number" min={key === "stars" ? 100 : 1} max={key === "stars" ? 2000 : 20} value={input[key]} onChange={(event) => set(key, Number(event.target.value))} />
          </label>
        ))}
      </>
    ),
    inspector: galaxy ? (
      <aside className="inspector">
        {selected ? (
          <div className="card">
            <h3>
              <span className="swatch" style={{ background: SPECTRA[selected.spectral].color }} />
              {nm(selected.name)}
            </h3>
            <Row label={t("space.class")} value={t(`spectral.${selected.spectral}`)} />
            <Row label={t("space.owner")} value={empireName(selected.empire)} />
            <Row label={t("space.settled")} value={t(selected.settled ? "yes" : "no")} />
            {selected.feature ? <Row label={t("space.feature")} value={t(`feature2.${selected.feature}`)} /> : null}
            <Row label={t("space.lanes")} value={galaxy.lanes.filter(([a, b]) => a === selected.id || b === selected.id).length} />
            <button type="button" className="primary wide" onClick={() => openSystem(galaxy, selected.id)}>
              ☀️ {t("action.openSystem")}
            </button>
            {localFromStar(galaxy, selected.id) ? (
              <button type="button" className="wide" onClick={() => openLocal(galaxy, selected.id)}>
                🗺️ {t("action.openLocal")}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="muted">{t("space.hint")}</p>
        )}
        <nav className="tabs">
          {(["empires", "stars"] as const).map((name) => (
            <button key={name} type="button" aria-pressed={tab === name} onClick={() => setTab(name)}>
              {t(`space.${name}`)}
            </button>
          ))}
        </nav>
        <ul className="list">
          {tab === "empires"
            ? galaxy.empires.slice(1).map((item) => (
                <li
                  key={item.id}
                  aria-selected={empire === item.id}
                  onClick={() => {
                    setEmpire(item.id);
                    setStar(item.capital);
                    ctx.focus(galaxy.stars[item.capital].x, galaxy.stars[item.capital].y);
                  }}
                >
                  <span className="swatch" style={{ background: item.color }} />
                  <span className="grow">{empireName(item.id)}</span>
                  <small>{item.stars}</small>
                </li>
              ))
            : galaxy.stars
                .filter((s) => s.capital || s.feature)
                .map((s) => (
                  <li
                    key={s.id}
                    aria-selected={star === s.id}
                    onClick={() => {
                      setStar(s.id);
                      ctx.focus(s.x, s.y);
                    }}
                  >
                    <span className="grow">
                      {s.capital ? "★ " : ""}
                      {nm(s.name)}
                    </span>
                    <small>{s.feature ? t(`feature2.${s.feature}`) : t(`spectral.${s.spectral}`)}</small>
                  </li>
                ))}
        </ul>
      </aside>
    ) : null,
    status: galaxy ? t("galaxy.summary", { stars: galaxy.stars.length, empires: galaxy.empires.length - 1, lanes: galaxy.lanes.length }) : "",
    data: () => (galaxy ? { format: "new-world-atlas/galaxy", version: 1, ...galaxy, empires: galaxy.empires.map(({ language: _l, ...e }) => e) } : null),
  };
}

export function useSystemLevel(ctx: LevelContext, openPlanet: (params: Partial<PlanetParams>) => void, back: (() => void) | null): Level & { open: (galaxy: Galaxy, star: number) => void } {
  const { t, nm } = ctx;
  const [rawSystem, setSystem] = useState<StarSystem | null>(null);
  const mapKey = rawSystem ? `system:${rawSystem.seed}` : null;
  const names = ctx.names(mapKey);
  const system = useMemo(() => (rawSystem ? renameSystem(rawSystem, names) : null), [rawSystem, names]);
  const [source, setSource] = useState<{ galaxy: Galaxy; star: number } | null>(null);
  const [body, setBody] = useState<number | null>(null);
  const svg = useMemo(() => (system ? renderSystem(system, { script: ctx.script, highlight: body }) : ""), [system, ctx.script, body]);
  const open = (galaxy: Galaxy, star: number) =>
    ctx.run(() => {
      setSource({ galaxy, star });
      setSystem(generateSystem(galaxy, star));
      setBody(null);
    });
  const selected = system && body !== null ? system.bodies[body] : null;

  return {
    id: "system",
    icon: "☀️",
    title: system?.name ?? null,
    seed: system?.seed ?? "",
    setSeed: () => undefined,
    generate: () => source && open(source.galaxy, source.star),
    ensure: () => undefined,
    open,
    mapKey,
    selected: !system ? null : body !== null ? { key: `body:${body}`, label: system.bodies[body].name } : { key: "world", label: system.name },
    map: system
      ? {
          svg,
          width: 1600,
          height: 1000,
          key: `system-${system.seed}`,
          onPick: (x, y) => {
            const maxOrbit = Math.max(system.frost * 1.2, ...system.bodies.map((b) => b.orbit), 1);
            const hit = system.bodies.find((b) => {
              const r = 90 + Math.sqrt(b.orbit / maxOrbit) * (1600 - 260);
              return Math.hypot(110 + Math.cos(b.angle) * r - x, 500 + Math.sin(b.angle) * r - y) < 26;
            });
            setBody(hit ? hit.id : null);
          },
        }
      : null,
    controls: (
      <>
        {back ? (
          <button type="button" className="back" onClick={back}>
            ← {t("action.backToGalaxy")}
          </button>
        ) : null}
        <p className="muted">{t("system.hint")}</p>
      </>
    ),
    inspector: system ? (
      <aside className="inspector">
        {selected ? (
          <div className="card">
            <h3>{nm(selected.name)}</h3>
            <Row label={t("stat.kind2")} value={t(`body.${selected.kind}`)} />
            <Row label={t("space.orbit")} value={`${selected.orbit.toFixed(2)} AU`} />
            <Row label={t("space.year")} value={`${selected.year.toLocaleString()} ${t("space.days")}`} />
            {selected.kind !== "belt" ? (
              <>
                <Row label={t("space.radius")} value={`${selected.radius.toFixed(1)} R⊕`} />
                <Row label={t("place.temperature")} value={`${selected.temperature - 273} °C`} />
                <Row label={t("space.atmosphere")} value={t(`atmo.${selected.atmosphere}`)} />
                <Row label={t("space.water")} value={`${Math.round(selected.water * 100)}%`} />
                <Row label={t("space.moons")} value={selected.moons.length} />
              </>
            ) : null}
            {selected.population ? <Row label={t("stat.population")} value={`${selected.population.toLocaleString()} ${t("unit.million")}`} /> : null}
            {!["gas-giant", "ice-giant", "belt"].includes(selected.kind) ? (
              <button type="button" className="primary wide" onClick={() => openPlanet(planetFromBody(system, selected.id))}>
                🌍 {t("action.openPlanet")}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="card">
            <h3>{nm(system.name)}</h3>
            <Row label={t("space.class")} value={t(`spectral.${system.spectral}`)} />
            <Row label={t("space.owner")} value={system.empire ? nm(system.empire) : t("space.unclaimed")} />
            <Row label={t("space.zone")} value={`${system.zone[0].toFixed(2)}–${system.zone[1].toFixed(2)} AU`} />
          </div>
        )}
        <ul className="list">
          {system.bodies.map((b) => (
            <li key={b.id} aria-selected={b.id === body} onClick={() => setBody(b.id)}>
              <span className="grow">
                {b.habitable ? "🌱 " : ""}
                {nm(b.name)}
              </span>
              <small>{t(`body.${b.kind}`)}</small>
            </li>
          ))}
        </ul>
      </aside>
    ) : null,
    status: system ? t("system.summary", { bodies: system.bodies.length, habitable: system.bodies.filter((b) => b.habitable).length }) : "",
    data: () => (system ? { format: "new-world-atlas/system", version: 1, ...system, language: undefined } : null),
  };
}
