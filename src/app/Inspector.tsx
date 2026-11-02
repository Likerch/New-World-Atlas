// The GM's side panel: what is at the clicked place, and every state, people, town, river and point of interest with
// its facts. Picking an entry highlights it and moves the map to it.
import { useMemo, useState } from "react";
import { altitude, BIOMES, latitudeOf, SEA_LEVEL, type Marker, type Planet } from "../core/index";
import { area, km, people } from "./format";
import type { T } from "./i18n";

export type SelectionKind = "cell" | "state" | "culture" | "burg" | "river" | "marker" | "province";
export interface Selection {
  kind: SelectionKind;
  id: number;
}
export type Tab = "place" | "states" | "cultures" | "burgs" | "rivers" | "markers";

interface Props {
  planet: Planet;
  t: T;
  nm: (name: string) => string;
  selection: Selection | null;
  onSelect: (selection: Selection, at?: [number, number]) => void;
  tab: Tab;
  setTab: (tab: Tab) => void;
  onOpenCity?: (burg: number) => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Link({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="link" onClick={onClick}>
      {label}
    </button>
  );
}

export function legendOf(marker: Marker, t: T, nm: (name: string) => string): string {
  const facts = Object.fromEntries(
    Object.entries(marker.facts).map(([key, value]) => {
      if (typeof value === "number") return [key, value];
      const term = t(`fact.${value}`);
      return [key, term === `fact.${value}` ? nm(value) : term];
    }),
  );
  return t(`legend.${marker.kind}`, facts);
}

export function Inspector({ planet, t, nm, selection, onSelect, tab, setTab, onOpenCity }: Props) {
  const [query, setQuery] = useState("");
  const tabs: Tab[] = ["place", "states", "cultures", "burgs", "rivers", "markers"];
  const stateName = (id: number) => (id ? t(`form.${planet.states[id].formKey}`, { name: nm(planet.states[id].name) }) : t("form.wild"));
  const provinceName = (id: number) => (id ? t(`province.${planet.provinces[id].formKey}`, { name: nm(planet.provinces[id].name) }) : "—");
  const pick = (kind: SelectionKind, id: number, at?: [number, number]) => onSelect({ kind, id }, at);
  const match = (name: string) => !query.trim() || nm(name).toLowerCase().includes(query.trim().toLowerCase());

  const card = useMemo(() => {
    if (!selection) return <p className="muted">{t("place.hint")}</p>;
    const { kind, id } = selection;
    if (kind === "cell") {
      const cell = id;
      const isWater = planet.water[cell] === 1;
      const feature = planet.features[planet.feature[cell]];
      const burg = planet.burg[cell];
      const river = planet.river[cell];
      return (
        <div className="card">
          <h3>{isWater ? `${t(`feature.${feature.kind}`)}${feature.name ? ` ${nm(feature.name)}` : ""}` : t(`biome.${BIOMES[planet.biome[cell]].key}`)}</h3>
          {isWater ? (
            <Row label={t("place.depth")} value={`${Math.round(((SEA_LEVEL - Math.min(SEA_LEVEL, planet.height[cell])) / SEA_LEVEL) * 6000)} ${t("unit.m")}`} />
          ) : (
            <Row label={t("place.height")} value={`${Math.round(altitude(planet.params, planet.height[cell]))} ${t("unit.m")}`} />
          )}
          <Row label={t("place.coords")} value={`${latitudeOf(planet.params, planet.mesh.y[cell]).toFixed(1)}°`} />
          <Row label={t("place.temperature")} value={`${planet.temperature[cell].toFixed(1)} °C`} />
          {!isWater ? <Row label={t("place.precipitation")} value={`${Math.round(planet.precipitation[cell])} ${t("unit.mm")}`} /> : null}
          {!isWater ? (
            <>
              <Row label={t("place.state")} value={<Link label={stateName(planet.state[cell])} onClick={() => pick("state", planet.state[cell])} />} />
              <Row label={t("place.province")} value={provinceName(planet.province[cell])} />
              <Row label={t("place.culture")} value={planet.culture[cell] ? <Link label={nm(planet.cultures[planet.culture[cell]].name)} onClick={() => pick("culture", planet.culture[cell])} /> : "—"} />
              <Row label={t("place.population")} value={people(planet.population[cell], t)} />
            </>
          ) : null}
          {river ? <Row label={t("place.river")} value={<Link label={nm(planet.rivers[river].name)} onClick={() => pick("river", river)} />} /> : null}
          {burg ? <Row label={t("panel.burgs")} value={<Link label={nm(planet.burgs[burg].name)} onClick={() => pick("burg", burg)} />} /> : null}
        </div>
      );
    }
    if (kind === "state") {
      const state = planet.states[id];
      const capital = planet.burgs[state.capital];
      return (
        <div className="card">
          <h3>
            <span className="swatch" style={{ background: state.color }} />
            {stateName(id)}
          </h3>
          {id ? <Row label={t("stat.capital")} value={<Link label={nm(capital.name)} onClick={() => pick("burg", capital.id, [capital.x, capital.y])} />} /> : null}
          <Row label={t("stat.area")} value={area(state.area, t)} />
          <Row label={t("stat.population")} value={`${people(state.rural + state.urban, t)} (${t("stat.urban")} ${people(state.urban, t)})`} />
          <Row label={t("stat.burgs")} value={state.burgs} />
          <Row label={t("stat.provinces")} value={planet.provinces.filter((province) => province.state === id).length} />
          {id ? <Row label={t("place.culture")} value={<Link label={nm(planet.cultures[state.culture].name)} onClick={() => pick("culture", state.culture)} />} /> : null}
          {state.neighbors.length ? (
            <>
              <h4>{t("stat.neighbors")}</h4>
              <ul className="plain">
                {state.neighbors.map((other) => (
                  <li key={other}>
                    <Link label={stateName(other)} onClick={() => pick("state", other, planet.states[other].pole)} /> — {t(`relation.${state.relations[other] ?? "neutral"}`)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      );
    }
    if (kind === "culture") {
      const culture = planet.cultures[id];
      const towns = planet.burgs.filter((burg) => burg.culture === id).slice(0, 8);
      return (
        <div className="card">
          <h3>
            <span className="swatch" style={{ background: culture.color }} />
            {nm(culture.name)}
          </h3>
          <Row label={t("stat.kind")} value={t(`culture.${culture.kind}`)} />
          <Row label={t("stat.population")} value={people(culture.population, t)} />
          <Row label={t("stat.cells")} value={culture.cells} />
          <p className="muted">{towns.map((burg) => nm(burg.name)).join(", ")}</p>
        </div>
      );
    }
    if (kind === "burg") {
      const burg = planet.burgs[id];
      const traits = (["capital", "port", "walls", "citadel", "temple", "market", "shanty"] as const).filter((trait) => burg[trait]).map((trait) => t(`burg.${trait}`));
      return (
        <div className="card">
          <h3>{nm(burg.name)}</h3>
          <Row label={t("stat.population")} value={people(burg.population, t)} />
          <Row label={t("place.state")} value={<Link label={stateName(burg.state)} onClick={() => pick("state", burg.state)} />} />
          <Row label={t("place.province")} value={provinceName(burg.province)} />
          <Row label={t("place.culture")} value={<Link label={nm(planet.cultures[burg.culture].name)} onClick={() => pick("culture", burg.culture)} />} />
          <p>{traits.join(" · ")}</p>
          {onOpenCity ? (
            <button type="button" className="primary wide" onClick={() => onOpenCity(burg.id)}>
              🏰 {t("action.openCity")}
            </button>
          ) : null}
        </div>
      );
    }
    if (kind === "river") {
      const river = planet.rivers[id];
      return (
        <div className="card">
          <h3>{nm(river.name)}</h3>
          <Row label={t("stat.length")} value={km(river.length, t)} />
          <Row label={t("stat.discharge")} value={`${Math.round(river.discharge).toLocaleString()} ${t("unit.m3s")}`} />
          <Row label={t("stat.flowsInto")} value={river.parent ? <Link label={nm(planet.rivers[river.parent].name)} onClick={() => pick("river", river.parent)} /> : t("stat.sea")} />
        </div>
      );
    }
    if (kind === "marker") {
      const marker = planet.markers[id];
      return (
        <div className="card">
          <h3>
            {t(`marker.${marker.kind}`)}
            {marker.name ? ` ${nm(marker.name)}` : ""}
          </h3>
          <p>{legendOf(marker, t, nm)}</p>
          <Row label={t("place.state")} value={stateName(planet.state[marker.cell])} />
        </div>
      );
    }
    return null;
  }, [selection, planet, t, nm, onOpenCity]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = (() => {
    switch (tab) {
      case "states":
        return planet.states
          .slice(1)
          .filter((state) => state.cells && match(state.name))
          .sort((a, b) => b.area - a.area)
          .map((state) => (
            <li key={state.id} aria-selected={selection?.kind === "state" && selection.id === state.id} onClick={() => pick("state", state.id, state.pole)}>
              <span className="swatch" style={{ background: state.color }} />
              <span className="grow">{stateName(state.id)}</span>
              <small>{people(state.rural + state.urban, t)}</small>
            </li>
          ));
      case "cultures":
        return planet.cultures
          .slice(1)
          .filter((culture) => match(culture.name))
          .sort((a, b) => b.population - a.population)
          .map((culture) => (
            <li key={culture.id} aria-selected={selection?.kind === "culture" && selection.id === culture.id} onClick={() => pick("culture", culture.id, [planet.mesh.x[culture.center], planet.mesh.y[culture.center]])}>
              <span className="swatch" style={{ background: culture.color }} />
              <span className="grow">{nm(culture.name)}</span>
              <small>{t(`culture.${culture.kind}`)}</small>
            </li>
          ));
      case "burgs":
        return planet.burgs
          .slice(1)
          .filter((burg) => match(burg.name))
          .sort((a, b) => b.population - a.population)
          .slice(0, 300)
          .map((burg) => (
            <li key={burg.id} aria-selected={selection?.kind === "burg" && selection.id === burg.id} onClick={() => pick("burg", burg.id, [burg.x, burg.y])}>
              <span className="grow">
                {burg.capital ? "★ " : ""}
                {nm(burg.name)}
              </span>
              <small>{people(burg.population, t)}</small>
            </li>
          ));
      case "rivers":
        return planet.rivers
          .slice(1)
          .filter((river) => match(river.name))
          .sort((a, b) => b.discharge - a.discharge)
          .map((river) => {
            const mid = river.cells[Math.floor(river.cells.length / 2)];
            return (
              <li key={river.id} aria-selected={selection?.kind === "river" && selection.id === river.id} onClick={() => pick("river", river.id, [planet.mesh.x[mid], planet.mesh.y[mid]])}>
                <span className="grow">{nm(river.name)}</span>
                <small>{km(river.length, t)}</small>
              </li>
            );
          });
      case "markers":
        return planet.markers
          .slice(1)
          .filter((marker) => match(`${t(`marker.${marker.kind}`)} ${marker.name}`))
          .map((marker) => (
            <li key={marker.id} aria-selected={selection?.kind === "marker" && selection.id === marker.id} onClick={() => pick("marker", marker.id, [marker.x, marker.y])}>
              <span className="grow">
                {t(`marker.${marker.kind}`)}
                {marker.name ? ` ${nm(marker.name)}` : ""}
              </span>
            </li>
          ));
      default:
        return null;
    }
  })();

  return (
    <aside className="inspector">
      <nav className="tabs">
        {tabs.map((name) => (
          <button key={name} type="button" aria-pressed={tab === name} onClick={() => setTab(name)}>
            {t(`panel.${name === "place" ? "place" : name}`)}
          </button>
        ))}
      </nav>
      {card}
      {tab !== "place" ? (
        <>
          <input className="search" value={query} placeholder={t("search")} onChange={(event) => setQuery(event.target.value)} />
          <ul className="list">{list}</ul>
        </>
      ) : null}
    </aside>
  );
}
