// The GM's side panel: what is at the clicked place, and every state, people, town, river and point of interest with
// its facts. Picking an entry highlights it and moves the map to it.
import { useMemo, useState } from "react";
import { cellKm2, ageOf, altitude, BIOMES, emblemOf, latitudeOf, localFromMarker, raiseArmies, renderEmblem, SEA_LEVEL, settingOf, techEra, type Emblem, type Marker, type PastEvent, type Planet, type RouteKind } from "../core/index";
import { Chronicle, eventText, RealmStory, TownStory } from "./Chronicle";
import { area, km, people } from "./format";
import type { T } from "./i18n";

export type SelectionKind = "cell" | "state" | "culture" | "religion" | "burg" | "river" | "marker" | "province" | "feature";
export interface Selection {
  kind: SelectionKind;
  id: number;
}
export type Tab = "place" | "states" | "cultures" | "religions" | "burgs" | "rivers" | "markers" | "chronicle";

interface Props {
  planet: Planet;
  t: T;
  nm: (name: string) => string;
  selection: Selection | null;
  onSelect: (selection: Selection, at?: [number, number]) => void;
  tab: Tab;
  setTab: (tab: Tab) => void;
  onOpenCity?: (burg: number) => void;
  onOpenRegion?: (province: number) => void;
  onOpenLocal?: (marker: number) => void;
  onOpenCountry?: (state: number) => void;
  /** A sheet of the map round a cell, opened as a close-up. */
  onOpenSheet?: (cell: number) => void;
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

function Arms({ emblem }: { emblem: Emblem | null }) {
  return emblem ? <div className="arms" dangerouslySetInnerHTML={{ __html: renderEmblem(emblem, { size: emblem.kind === "flag" ? 84 : 64 }) }} /> : null;
}

/** A marker's story; `age` picks the age's own wording where it has one. */
export function legendOf(marker: Marker, t: T, nm: (name: string) => string, age = ""): string {
  const facts = Object.fromEntries(
    Object.entries(marker.facts).map(([key, value]) => {
      if (typeof value === "number") return [key, value];
      const term = t(`fact.${value}`);
      return [key, term === `fact.${value}` ? nm(value) : term];
    }),
  );
  return t(`legend.${marker.kind}${age ? `@${age}` : ""}`, facts);
}

export function Inspector({ planet, t, nm, selection, onSelect, tab, setTab, onOpenCity, onOpenRegion, onOpenLocal, onOpenCountry, onOpenSheet }: Props) {
  const [query, setQuery] = useState("");
  // Long lists of towns come a page at a time.
  const [shown, setShown] = useState(300);
  // The age's own words for places, roads and arms.
  const setting = settingOf(planet.params.setting);
  const age = ageOf(setting);
  const at = (key: string, vars?: Record<string, string | number>) => t(`${key}@${age}`, vars);
  const tabs: Tab[] = ["place", "states", "cultures", "religions", "burgs", "rivers", "markers", ...(planet.history ? (["chronicle"] as Tab[]) : [])];
  // An event picked in the chronicle: its town if it still stands, else its place on the map.
  const pickEvent = (event: PastEvent) => {
    const town = event.town ? planet.burgs[event.town] : undefined;
    if (town && !town.removed) return pick("burg", town.id, [town.x, town.y]);
    const ruin = planet.markers.find((marker) => marker.facts.town === event.town && event.town);
    if (ruin) return pick("marker", ruin.id, [ruin.x, ruin.y]);
    if (event.cell !== undefined) pick("cell", event.cell, [planet.mesh.x[event.cell], planet.mesh.y[event.cell]]);
  };
  const stateName = (id: number) => (id ? t(`form.${planet.states[id].formKey}`, { name: nm(planet.states[id].name) }) : t("form.wild"));
  const provinceName = (id: number) => (id ? t(`province.${planet.provinces[id].formKey}`, { name: nm(planet.provinces[id].name) }) : "—");
  const pick = (kind: SelectionKind, id: number, at?: [number, number]) => onSelect({ kind, id }, at);
  const faithName = (id: number) => (id ? `${nm(planet.religions[id].name)} (${t(`religion.form.${planet.religions[id].form}`)})` : "—");
  const faithAt = (id: number) => <Link label={faithName(id)} onClick={() => pick("religion", id)} />;
  const featureName = (id: number) => `${t(`feature.${planet.features[id].kind}`)}${planet.features[id].name ? ` ${nm(planet.features[id].name)}` : ""}`;
  /** The heart of a sea or a landmass: the cell farthest from its shore. */
  const heartOf = (id: number): [number, number] => {
    let best = -1;
    for (let cell = 0; cell < planet.mesh.cells; cell++) if (planet.feature[cell] === id && (best < 0 || Math.abs(planet.coast[cell]) > Math.abs(planet.coast[best]))) best = cell;
    return best < 0 ? [0, 0] : [planet.mesh.x[best], planet.mesh.y[best]];
  };
  const match = (name: string) => !query.trim() || nm(name).toLowerCase().includes(query.trim().toLowerCase());

  const card = useMemo(() => {
    if (!selection) return planet.frame ? <RegionCard planet={planet} t={t} nm={nm} /> : <WorldCard planet={planet} t={t} nm={nm} />;
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
              <Row label={t("place.province")} value={planet.province[cell] ? <Link label={provinceName(planet.province[cell])} onClick={() => pick("province", planet.province[cell], planet.provinces[planet.province[cell]].pole)} /> : "—"} />
              <Row label={t("place.culture")} value={planet.culture[cell] ? <Link label={nm(planet.cultures[planet.culture[cell]].name)} onClick={() => pick("culture", planet.culture[cell])} /> : "—"} />
              <Row label={t("place.population")} value={people(planet.population[cell], t)} />
              <Row label={t("place.religion")} value={planet.religion[cell] ? faithAt(planet.religion[cell]) : "—"} />
              {planet.fief?.[cell] ? <Row label={at("place.fief")} value={<Link label={nm(planet.burgs[planet.fiefs![planet.fief[cell]].seat].name)} onClick={() => { const seat = planet.burgs[planet.fiefs![planet.fief![cell]].seat]; pick("burg", seat.id, [seat.x, seat.y]); }} />} /> : null}
              {planet.landUse ? <Row label={t("place.landuse")} value={t(`landuse.${planet.landUse[cell]}`)} /> : null}
            </>
          ) : null}
          {planet.feature[cell] ? <Row label={t(isWater ? "place.waters" : "place.landmass")} value={<Link label={featureName(planet.feature[cell])} onClick={() => pick("feature", planet.feature[cell], heartOf(planet.feature[cell]))} />} /> : null}
          {river ? <Row label={t("place.river")} value={<Link label={nm(planet.rivers[river].name)} onClick={() => pick("river", river)} />} /> : null}
          {burg ? <Row label={t("panel.burgs")} value={<Link label={nm(planet.burgs[burg].name)} onClick={() => pick("burg", burg)} />} /> : null}
          {!isWater && planet.province[cell] && onOpenRegion ? (
            <button type="button" className="primary wide" onClick={() => onOpenRegion(planet.province[cell])}>
              🗺 {t("action.openRegion")}
            </button>
          ) : null}
          {!isWater && onOpenSheet ? (
            <button type="button" className="wide" onClick={() => onOpenSheet(cell)}>
              📄 {t("action.sheetHere")}
            </button>
          ) : null}
        </div>
      );
    }
    if (kind === "state") {
      const state = planet.states[id];
      const capital = planet.burgs[state.capital];
      // The faith of most of the realm's land, and its armies and fleets.
      const faiths = new Map<number, number>();
      for (let cell = 0; cell < planet.mesh.cells; cell++) if (planet.state[cell] === id && planet.religion[cell]) faiths.set(planet.religion[cell], (faiths.get(planet.religion[cell]) ?? 0) + 1);
      const faith = [...faiths].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
      const regiments = id ? raiseArmies(planet).filter((regiment) => regiment.state === id) : [];
      return (
        <div className="card">
          <Arms emblem={emblemOf(planet, "state", id)} />
          <h3>
            <span className="swatch" style={{ background: state.color }} />
            {stateName(id)}
          </h3>
          {id && state.capital ? <Row label={t("stat.capital")} value={<Link label={nm(capital.name)} onClick={() => pick("burg", capital.id, [capital.x, capital.y])} />} /> : null}
          <Row label={t("stat.area")} value={area(state.area, t)} />
          <Row label={t("stat.population")} value={`${people(state.rural + state.urban, t)} (${t("stat.urban")} ${people(state.urban, t)})`} />
          <Row label={t("stat.burgs")} value={state.burgs} />
          <Row label={t("stat.provinces")} value={planet.provinces.filter((province) => province.state === id).length} />
          {id ? <Row label={t("place.culture")} value={<Link label={nm(planet.cultures[state.culture].name)} onClick={() => pick("culture", state.culture)} />} /> : null}
          {faith ? <Row label={t("place.religion")} value={faithAt(faith)} /> : null}
          {regiments.length ? (
            <>
              <h4>{t("army.title")}</h4>
              <Row label={t("army.total")} value={regiments.reduce((sum, regiment) => sum + regiment.total, 0).toLocaleString(t.locale)} />
              <ul className="plain">
                {regiments.map((regiment) => (
                  <li key={regiment.id} title={(["infantry", "archers", "cavalry", "artillery", "fleet"] as const).filter((unit) => regiment.units[unit]).map((unit) => `${at(`army.unit.${unit}`)} ${regiment.units[unit].toLocaleString(t.locale)}`).join(", ")}>
                    {t(`army.stance.${regiment.stance}`)} {regiment.number} — <Link label={nm(planet.burgs[regiment.burg].name)} onClick={() => pick("burg", regiment.burg, [regiment.x, regiment.y])} />, {regiment.total.toLocaleString(t.locale)}
                    {regiment.ships ? ` · ${at("army.ships", { count: regiment.ships })}` : ""}
                    {regiment.facing ? ` · ${t("army.facing", { name: nm(planet.states[regiment.facing].name) })}` : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {planet.history && state.polity ? <RealmStory t={t} nm={nm} history={planet.history} polity={state.polity} /> : null}
          {id && onOpenCountry ? (
            <button type="button" className="primary wide" onClick={() => onOpenCountry(id)}>
              🗺 {t("action.openCountry")}
            </button>
          ) : null}
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
    if (kind === "province") {
      const province = planet.provinces[id];
      let land = 0;
      let rural = 0;
      for (let cell = 0; cell < planet.mesh.cells; cell++) {
        if (planet.province[cell] !== id || planet.water[cell]) continue;
        land += cellKm2(planet, cell);
        rural += planet.population[cell];
      }
      const towns = planet.burgs.filter((burg) => burg.province === id && !burg.removed);
      const centre = planet.burgs[province.burg];
      return (
        <div className="card">
          <h3>
            <span className="swatch" style={{ background: province.color }} />
            {provinceName(id)}
          </h3>
          <Row label={t("place.state")} value={<Link label={stateName(province.state)} onClick={() => pick("state", province.state, planet.states[province.state].pole)} />} />
          {province.burg && centre && !centre.removed ? <Row label={t("province.centre")} value={<Link label={nm(centre.name)} onClick={() => pick("burg", centre.id, [centre.x, centre.y])} />} /> : null}
          <Row label={t("stat.area")} value={area(land, t)} />
          <Row label={t("stat.population")} value={people(rural + towns.reduce((sum, burg) => sum + burg.population, 0), t)} />
          <Row label={t("stat.burgs")} value={towns.length} />
          {onOpenRegion ? (
            <button type="button" className="primary wide" onClick={() => onOpenRegion(id)}>
              🗺 {t("action.openRegion")}
            </button>
          ) : null}
        </div>
      );
    }
    if (kind === "feature") {
      const feature = planet.features[id];
      let size = 0;
      const realms = new Set<number>();
      for (let cell = 0; cell < planet.mesh.cells; cell++) {
        if (planet.feature[cell] !== id) continue;
        size += cellKm2(planet, cell);
        if (feature.land && planet.state[cell]) realms.add(planet.state[cell]);
      }
      const ports = feature.land ? 0 : planet.burgs.filter((burg) => !burg.removed && burg.port && burg.cell >= 0 && planet.mesh.neighbors[burg.cell].some((next) => planet.feature[next] === id)).length;
      return (
        <div className="card">
          <h3>{featureName(id)}</h3>
          <Row label={t("stat.area")} value={area(size, t)} />
          {feature.land ? null : <Row label={t("feature.ports")} value={ports} />}
          {realms.size ? (
            <>
              <h4>{t("panel.states")}</h4>
              <ul className="plain">
                {[...realms].map((realm) => (
                  <li key={realm}>
                    <Link label={stateName(realm)} onClick={() => pick("state", realm, planet.states[realm].pole)} />
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
      const towns = planet.burgs.filter((burg) => burg.culture === id && !burg.removed).slice(0, 8);
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
          <Arms emblem={emblemOf(planet, "burg", id)} />
          <h3>{nm(burg.name)}</h3>
          {burg.tier ? <Row label={t("place.kind")} value={at(`tier.${burg.tier}`)} /> : null}
          <Row label={t("stat.population")} value={people(burg.population, t)} />
          <Row label={t("place.religion")} value={planet.religion[burg.cell] ? faithAt(planet.religion[burg.cell]) : "—"} />
          <Row label={t("place.state")} value={<Link label={stateName(burg.state)} onClick={() => pick("state", burg.state)} />} />
          <Row label={t("place.province")} value={provinceName(burg.province)} />
          <Row label={t("place.culture")} value={<Link label={nm(planet.cultures[burg.culture].name)} onClick={() => pick("culture", burg.culture)} />} />
          <p>{traits.join(" · ")}</p>
          {planet.history ? <TownStory t={t} nm={nm} history={planet.history} town={id} onPick={pickEvent} /> : null}
          {onOpenCity ? (
            <button type="button" className="primary wide" onClick={() => onOpenCity(burg.id)}>
              🏰 {t("action.openCity")}
            </button>
          ) : null}
        </div>
      );
    }
    if (kind === "religion") {
      const faith = planet.religions[id];
      const holy = planet.burgs[faith.center];
      return (
        <div className="card">
          <h3>
            <span className="swatch" style={{ background: faith.color }} />
            {nm(faith.name)}
          </h3>
          <Row label={t("stat.kind")} value={t(`religion.kind.${faith.kind}`)} />
          <Row label={t("religion.teaching")} value={t(`religion.form.${faith.form}`)} />
          <Row label={t("religion.deity")} value={nm(faith.deity)} />
          {faith.center ? <Row label={t("religion.center")} value={<Link label={nm(holy.name)} onClick={() => pick("burg", holy.id, [holy.x, holy.y])} />} /> : null}
          {faith.parent ? <Row label={t("religion.parent")} value={faithAt(faith.parent)} /> : null}
          <Row label={t("place.culture")} value={<Link label={nm(planet.cultures[faith.culture].name)} onClick={() => pick("culture", faith.culture)} />} />
          <Row label={t("religion.followers")} value={people(faith.followers, t)} />
          <Row label={t("stat.area")} value={area(faith.area, t)} />
        </div>
      );
    }
    if (kind === "river") {
      const river = planet.rivers[id];
      return (
        <div className="card">
          <h3>{nm(river.name)}</h3>
          <Row label={t("stat.length")} value={km(river.length, t)} />
          <Row label={t("stat.discharge")} value={`${Math.round(river.discharge).toLocaleString(t.locale)} ${t("unit.m3s")}`} />
          <Row label={t("stat.flowsInto")} value={river.parent ? <Link label={nm(planet.rivers[river.parent].name)} onClick={() => pick("river", river.parent)} /> : t("stat.sea")} />
        </div>
      );
    }
    if (kind === "marker") {
      const marker = planet.markers[id];
      return (
        <div className="card">
          <h3>
            {at(`marker.${marker.kind}`)}
            {marker.name ? ` ${nm(marker.name)}` : ""}
          </h3>
          <p>{legendOf(marker, t, nm, age)}</p>
          {planet.history && typeof marker.facts.town === "number" ? <TownStory t={t} nm={nm} history={planet.history} town={marker.facts.town} onPick={pickEvent} /> : null}
          {planet.history && typeof marker.facts.event === "number" && planet.history.events[marker.facts.event] ? <p className="muted">{eventText(t, nm, planet.history, planet.history.events[marker.facts.event])}</p> : null}
          <Row label={t("place.state")} value={stateName(planet.state[marker.cell])} />
          {onOpenLocal && localFromMarker(planet, marker.id) ? (
            <button type="button" className="primary wide" onClick={() => onOpenLocal(marker.id)}>
              🗺️ {t("action.openLocal")}
            </button>
          ) : null}
        </div>
      );
    }
    return null;
  }, [selection, planet, t, nm, onOpenCity, onOpenRegion, onOpenLocal, onOpenCountry]); // eslint-disable-line react-hooks/exhaustive-deps

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
      case "religions":
        return planet.religions
          .slice(1)
          .filter((faith) => faith.cells && match(faith.name))
          .sort((a, b) => b.followers - a.followers)
          .map((faith) => (
            <li key={faith.id} aria-selected={selection?.kind === "religion" && selection.id === faith.id} onClick={() => pick("religion", faith.id)}>
              <span className="swatch" style={{ background: faith.color }} />
              <span className="grow">{nm(faith.name)}</span>
              <small>{t(`religion.kind.${faith.kind}`)}</small>
            </li>
          ));
      case "burgs": {
        const towns = planet.burgs
          .slice(1)
          .filter((burg) => !burg.removed && match(burg.name))
          .sort((a, b) => b.population - a.population);
        const rows = towns.slice(0, shown).map((burg) => (
            <li key={burg.id} aria-selected={selection?.kind === "burg" && selection.id === burg.id} onClick={() => pick("burg", burg.id, [burg.x, burg.y])}>
              <span className="grow">
                {burg.capital ? "★ " : ""}
                {nm(burg.name)}
              </span>
              <small>{people(burg.population, t)}</small>
            </li>
          ));
        if (towns.length > shown)
          rows.push(
            <li key="more" className="more">
              <button type="button" className="link" onClick={() => setShown(shown + 300)}>
                {t("list.more", { count: towns.length - shown })}
              </button>
            </li>,
          );
        return rows;
      }
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
          .filter((marker) => match(`${at(`marker.${marker.kind}`)} ${marker.name}`))
          .map((marker) => (
            <li key={marker.id} aria-selected={selection?.kind === "marker" && selection.id === marker.id} onClick={() => pick("marker", marker.id, [marker.x, marker.y])}>
              <span className="grow">
                {at(`marker.${marker.kind}`)}
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
      {tab === "chronicle" && planet.history ? (
        <Chronicle t={t} nm={nm} history={planet.history} onPick={pickEvent} />
      ) : tab !== "place" ? (
        <>
          <input className="search" value={query} placeholder={t("search")} onChange={(event) => setQuery(event.target.value)} />
          <ul className="list">{list}</ul>
        </>
      ) : null}
    </aside>
  );
}

/** The world as a whole when nothing is picked: its age and setting, its roads and how many keep a faith. */
/** A close-up at a glance: its towns, villages and hamlets, lordships, how its land is used and its named land. */
function RegionCard({ planet, t, nm }: { planet: Planet; t: T; nm: (name: string) => string }) {
  const age = ageOf(settingOf(planet.params.setting));
  const living = planet.burgs.slice(1).filter((burg) => !burg.removed);
  const uses = [0, 0, 0, 0, 0];
  let land = 0;
  for (let cell = 0; cell < planet.mesh.cells; cell++) {
    if (planet.water[cell]) continue;
    land++;
    uses[planet.landUse?.[cell] ?? 0]++;
  }
  return (
    <div className="card">
      <h3>{nm(planet.name)}</h3>
      <Row label={t("region.card.towns")} value={living.filter((burg) => !burg.tier).length} />
      <Row label={t("region.card.villages")} value={living.filter((burg) => burg.tier === "village").length} />
      <Row label={t("region.card.hamlets")} value={living.filter((burg) => burg.tier === "hamlet").length} />
      <Row label={t("stat.population")} value={people(living.reduce((sum, burg) => sum + burg.population, 0), t)} />
      {planet.fiefs ? <Row label={t(`region.card.fiefs@${age}`)} value={planet.fiefs.length - 1} /> : null}
      <Row label={t("region.card.rivers")} value={planet.rivers.length - 1} />
      {planet.landUse && land ? (
        <>
          <h4>{t("place.landuse")}</h4>
          {uses.map((count, use) => (count ? <Row key={use} label={t(`landuse.${use}`)} value={`${Math.round((count / land) * 100)}%`} /> : null))}
        </>
      ) : null}
      {planet.landforms && planet.landforms.length > 1 ? (
        <>
          <h4>{t("region.card.landforms")}</h4>
          <p>{planet.landforms.slice(1).map((item) => t(`landform.${item.kind}`, { name: nm(item.name) })).join(" · ")}</p>
        </>
      ) : null}
      <p className="muted">{t("place.hint")}</p>
    </div>
  );
}

function WorldCard({ planet, t, nm }: { planet: Planet; t: T; nm: (name: string) => string }) {
  const setting = settingOf(planet.params.setting);
  const roadAge = ageOf(setting, setting.transport);
  const lengths = new Map<RouteKind, number>();
  for (const route of planet.routes.slice(1)) lengths.set(route.kind, (lengths.get(route.kind) ?? 0) + route.length);
  return (
    <div className="card">
      <h3>{nm(planet.name)}</h3>
      {planet.history ? <Row label={t("history.year")} value={planet.history.years} /> : null}
      <Row label={t("setting.era")} value={t(`era.${ageOf(setting)}`)} />
      {techEra(setting.tech) !== techEra(setting.transport) ? <Row label={t("setting.transport")} value={t(`era.${techEra(setting.transport)}`)} /> : null}
      <Row label={t("setting.magic")} value={t(`setting.magic.${setting.magic}`)} />
      {[...lengths].map(([kind, length]) => (
        <Row key={kind} label={t(`route.${kind}@${roadAge}`).replace(/^./u, (first) => first.toUpperCase())} value={km(length, t)} />
      ))}
      {planet.secular ? <Row label={t("religion.secular")} value={`${Math.round(planet.secular * 100)}%`} /> : null}
      <p className="muted">{t("place.hint")}</p>
    </div>
  );
}
