// The underworld level: the caverns beneath the planet, opened from the planet's settings.
import { useMemo, useState } from "react";
import { generateUnderworld, renderUnderworld, type Planet, type Underworld } from "../../core/index";
import type { Level, LevelContext } from "./types";

export function useUnderworldLevel(ctx: LevelContext, openCave: (world: Underworld, cavern: number) => void, back: (() => void) | null): Level & { open: (planet: Planet) => void } {
  const { t, nm } = ctx;
  const [state, setState] = useState<{ world: Underworld; planet: Planet } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const svg = useMemo(() => (state ? renderUnderworld(state.world, state.planet, { script: ctx.script, highlight: picked }) : ""), [state, ctx.script, picked]);
  const world = state?.world ?? null;
  const cavern = world && picked !== null ? world.caverns[picked] : null;
  return {
    id: "underworld",
    icon: "🕳",
    title: world?.name ?? null,
    seed: world?.seed ?? "",
    setSeed: () => undefined,
    generate: () => undefined,
    ensure: () => undefined,
    open: (planet) => {
      ctx.run(() => {
        setState({ world: generateUnderworld(planet), planet });
        setPicked(null);
      });
      ctx.show("underworld");
    },
    mapKey: world ? `underworld:${world.seed}` : null,
    selected: !world ? null : cavern ? { key: `cavern:${cavern.id}`, label: cavern.name } : { key: "world", label: world.name },
    map: world
      ? {
          svg,
          width: world.width,
          height: world.height,
          key: `underworld-${world.seed}`,
          onPick: (x, y) => {
            const hit = world.caverns.find((c) => Math.hypot(c.x - x, c.y - y) < Math.max(c.r, 8));
            setPicked(hit ? hit.id : null);
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
      </>
    ),
    inspector: world ? (
      <aside className="inspector">
        {cavern ? (
          <div className="card">
            <h3>{nm(cavern.name)}</h3>
            <div className="row">
              <span>{t("stat.kind2")}</span>
              <b>{t(`cavern.${cavern.kind}`)}</b>
            </div>
            {cavern.people ? (
              <div className="row">
                <span>{t("place.culture")}</span>
                <b>{nm(world.peoples[cavern.people - 1].name)}</b>
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
            <div className="row">
              <span>{t("underworld.ways")}</span>
              <b>{world.tunnels.filter(([a, b]) => a === cavern.id || b === cavern.id).length}</b>
            </div>
            <button type="button" className="primary wide" onClick={() => openCave(world, cavern.id)}>
              🗺️ {t("action.openLocal")}
            </button>
          </div>
        ) : (
          <p className="muted">{t("underworld.pick")}</p>
        )}
        <h4 className="muted">{t("underworld.peoples")}</h4>
        <ul className="list">
          {world.peoples.map((people) => (
            <li key={people.id}>
              <span className="swatch" style={{ background: people.color }} />
              <span className="grow">{nm(people.name)}</span>
              <small>{world.caverns.filter((c) => c.people === people.id && c.kind === "settlement").length}</small>
            </li>
          ))}
        </ul>
      </aside>
    ) : null,
    status: world ? t("underworld.summary", { caverns: world.caverns.length, tunnels: world.tunnels.length, entrances: world.entrances.length }) : "",
    data: () => (world ? { format: "new-world-atlas/underworld", version: 1, ...world, peoples: world.peoples.map(({ language: _l, ...p }) => p) } : null),
  };
}
