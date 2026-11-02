// City mode: its settings on the left, its quarters and places on the right.
import { useState } from "react";
import { area, pointInPolygon, CITY_LAYERS, CITY_THEMES, ERAS, type City, type CityLayerId, type CityParams, type CityThemeId } from "../core/index";
import type { T } from "./i18n";

const DIRECTIONS: [string, number][] = [
  ["E", 0],
  ["SE", Math.PI / 4],
  ["S", Math.PI / 2],
  ["SW", (3 * Math.PI) / 4],
  ["W", Math.PI],
  ["NW", (-3 * Math.PI) / 4],
  ["N", -Math.PI / 2],
  ["NE", -Math.PI / 4],
];
const COMPASS_RU: Record<string, string> = { E: "восток", SE: "юго-восток", S: "юг", SW: "юго-запад", W: "запад", NW: "северо-запад", N: "север", NE: "северо-восток" };
const nearestDirection = (angle: number) => DIRECTIONS.reduce((best, item) => (Math.abs(Math.atan2(Math.sin(item[1] - angle), Math.cos(item[1] - angle))) < Math.abs(Math.atan2(Math.sin(best[1] - angle), Math.cos(best[1] - angle))) ? item : best))[1];

interface PanelProps {
  params: CityParams;
  set: <K extends keyof CityParams>(key: K, value: CityParams[K]) => void;
  theme: CityThemeId;
  setTheme: (theme: CityThemeId) => void;
  layers: Record<CityLayerId, boolean>;
  setLayers: (layers: Record<CityLayerId, boolean>) => void;
  t: T;
  ru: boolean;
}

export function CityControls({ params, set, theme, setTheme, layers, setLayers, t, ru }: PanelProps) {
  const direction = (key: "coast" | "river") => (
    <label className="check">
      <input type="checkbox" checked={params[key] !== null} onChange={(event) => set(key, event.target.checked ? Math.PI / 2 : null)} />
      {t(`field.${key}`)}
      {params[key] !== null ? (
        <select value={nearestDirection(params[key]!)} onChange={(event) => set(key, Number(event.target.value))}>
          {DIRECTIONS.map(([label, angle]) => (
            <option key={label} value={angle}>
              {ru ? COMPASS_RU[label] : label}
            </option>
          ))}
        </select>
      ) : null}
    </label>
  );
  return (
    <>
      <h2>{t("panel.city")}</h2>
      <label>
        {t("field.name")}
        <input value={params.name} onChange={(event) => set("name", event.target.value)} />
      </label>
      <label>
        {t("field.era")}
        <select value={params.era} onChange={(event) => set("era", event.target.value as CityParams["era"])}>
          {ERAS.map((era) => (
            <option key={era} value={era}>
              {t(`era.${era}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("field.population")}
        <input type="number" min={0.5} max={20000} step={0.5} value={params.population} onChange={(event) => set("population", Math.max(0.5, Number(event.target.value)))} />
      </label>
      {direction("coast")}
      {direction("river")}
      {(["walls", "citadel", "port", "temple", "market", "shanty"] as const).map((key) => (
        <label key={key} className="check">
          <input type="checkbox" checked={params[key]} onChange={(event) => set(key, event.target.checked)} />
          {t(`field.${key}`)}
        </label>
      ))}
      <label>
        {t("field.theme")}
        <select value={theme} onChange={(event) => setTheme(event.target.value as CityThemeId)}>
          {CITY_THEMES.map((id) => (
            <option key={id} value={id}>
              {t(`cityTheme.${id}`)}
            </option>
          ))}
        </select>
      </label>
      <h2>{t("panel.layers")}</h2>
      {CITY_LAYERS.map((id) => (
        <label key={id} className="check">
          <input type="checkbox" checked={layers[id]} onChange={(event) => setLayers({ ...layers, [id]: event.target.checked })} />
          {t(`cityLayer.${id}`)}
        </label>
      ))}
    </>
  );
}

export type CitySelection = { kind: "ward" | "landmark" | "building"; id: number } | null;

const wealthWord = (value: number) => (value > 0.75 ? "rich" : value > 0.5 ? "comfortable" : value > 0.25 ? "modest" : "poor");

export function CityInspector({ city, t, nm, selection, onSelect, onOpenBuilding, onOpenLocal }: { city: City; t: T; nm: (name: string) => string; selection: CitySelection; onSelect: (selection: CitySelection, at?: [number, number]) => void; onOpenBuilding: (index: number) => void; onOpenLocal: (landmark: number) => void }) {
  const [tab, setTab] = useState<"wards" | "landmarks" | "streets">("wards");
  const wardTitle = (id: number) => {
    const ward = city.wards.find((w) => w.id === id);
    if (!ward) return "";
    return `${t(`ward.${ward.kind}`)}${ward.name ? ` ${nm(ward.name)}` : ""}`;
  };
  const landmarkTitle = (id: number) => {
    const landmark = city.landmarks.find((l) => l.id === id)!;
    return `${t(`landmark.${landmark.kind}`)}${landmark.name ? ` «${nm(landmark.name)}»` : ""}`;
  };

  let card = <p className="muted">{t("city.hint")}</p>;
  if (selection?.kind === "ward") {
    const ward = city.wards.find((w) => w.id === selection.id);
    if (ward) {
      const places = city.landmarks.filter((landmark) => landmark.ward === ward.id);
      card = (
        <div className="card">
          <h3>{wardTitle(ward.id)}</h3>
          <div className="row">
            <span>{t("stat.hectares")}</span>
            <b>
              {((area(ward.polygon) * city.scale * city.scale) / 10_000).toFixed(1)} {t("unit.ha")}
            </b>
          </div>
          <div className="row">
            <span>{t("stat.buildings")}</span>
            <b>{ward.buildings}</b>
          </div>
          <div className="row">
            <span>{t("stat.wealth")}</span>
            <b>{t(`wealth.${wealthWord(ward.wealth)}`)}</b>
          </div>
          <div className="row">
            <span>{t("stat.inside")}</span>
            <b>{t(ward.urban ? "yes" : "no")}</b>
          </div>
          {places.length ? (
            <ul className="plain">
              {places.map((landmark) => (
                <li key={landmark.id}>
                  <button type="button" className="link" onClick={() => onSelect({ kind: "landmark", id: landmark.id }, [landmark.x, landmark.y])}>
                    {landmarkTitle(landmark.id)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    }
  } else if (selection?.kind === "building") {
    const building = city.buildings[selection.id];
    if (building)
      card = (
        <div className="card">
          <h3>{t(`bkind.${building.kind}`)}</h3>
          <div className="row">
            <span>{t("stat.floors")}</span>
            <b>{building.floors}</b>
          </div>
          <div className="row">
            <span>{t("panel.wards")}</span>
            <b>
              <button type="button" className="link" onClick={() => onSelect({ kind: "ward", id: building.ward })}>
                {wardTitle(building.ward)}
              </button>
            </b>
          </div>
          <button type="button" className="primary wide" onClick={() => onOpenBuilding(selection.id)}>
            🏠 {t("action.openBuilding")}
          </button>
        </div>
      );
  } else if (selection?.kind === "landmark") {
    const landmark = city.landmarks.find((l) => l.id === selection.id);
    if (landmark)
      card = (
        <div className="card">
          <h3>{landmarkTitle(landmark.id)}</h3>
          <div className="row">
            <span>{t("panel.wards")}</span>
            <b>
              <button type="button" className="link" onClick={() => onSelect({ kind: "ward", id: landmark.ward })}>
                {wardTitle(landmark.ward)}
              </button>
            </b>
          </div>
          {landmark.kind === "undercity" ? (
            <button type="button" className="primary wide" onClick={() => onOpenLocal(landmark.id)}>
              🗺️ {t("action.openLocal")}
            </button>
          ) : null}
          {(() => {
            const index = city.buildings.findIndex((b) => b.ward === landmark.ward && pointInPolygon([landmark.x, landmark.y], b.polygon));
            return index >= 0 ? (
              <button type="button" className="primary wide" onClick={() => onOpenBuilding(index)}>
                🏠 {t("action.openBuilding")}
              </button>
            ) : null;
          })()}
        </div>
      );
  }

  return (
    <aside className="inspector">
      <nav className="tabs">
        {(["wards", "landmarks", "streets"] as const).map((name) => (
          <button key={name} type="button" aria-pressed={tab === name} onClick={() => setTab(name)}>
            {t(`panel.${name}`)}
          </button>
        ))}
      </nav>
      {card}
      <div className="muted" style={{ marginBottom: 6 }}>
        {t("stat.scale")}: 1 : {Math.round(city.scale * 1000).toLocaleString()} ({city.scale.toFixed(2)} {t("unit.m")})
      </div>
      <ul className="list">
        {tab === "wards"
          ? city.wards
              .filter((ward) => ward.urban)
              .map((ward) => (
                <li key={ward.id} aria-selected={selection?.kind === "ward" && selection.id === ward.id} onClick={() => onSelect({ kind: "ward", id: ward.id }, ward.center)}>
                  <span className="grow">{wardTitle(ward.id)}</span>
                  <small>{ward.buildings}</small>
                </li>
              ))
          : tab === "landmarks"
            ? city.landmarks.map((landmark) => (
                <li key={landmark.id} aria-selected={selection?.kind === "landmark" && selection.id === landmark.id} onClick={() => onSelect({ kind: "landmark", id: landmark.id }, [landmark.x, landmark.y])}>
                  <span className="grow">{landmarkTitle(landmark.id)}</span>
                </li>
              ))
            : city.streets
                .filter((street) => street.name)
                .map((street) => (
                  <li key={street.id} onClick={() => onSelect(null, street.points[Math.floor(street.points.length / 2)])}>
                    <span className="grow">{nm(street.name)}</span>
                    <small>{t(`street.${street.kind}`)}</small>
                  </li>
                ))}
      </ul>
    </aside>
  );
}
