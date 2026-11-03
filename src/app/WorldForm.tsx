// A new world in one go: its name and seed, its age, how much of the planet the map covers (the whole sphere, a
// hemisphere, a continent or a region), relief, climate, peoples and realms, and how far its map may be zoomed out
// and in. Nothing is made until the game master presses Create.
import { Modal } from "./Modal";
import { useState } from "react";
import { randomSeed, TEMPLATES, type PlanetParams } from "../core/index";
import type { T } from "./i18n";
import { SettingPanel } from "./SettingPanel";
import { NumberInput } from "./NumberInput";

export type Coverage = "planet" | "hemisphere" | "continent" | "region" | "custom";
const COVERAGES: Coverage[] = ["planet", "hemisphere", "continent", "region", "custom"];
/** Degrees of latitude each coverage spans. */
const SPAN: Record<Exclude<Coverage, "custom">, number> = { planet: 180, hemisphere: 110, continent: 60, region: 24 };

export type ZoomRange = [number, number];

function coverageOf(params: PlanetParams): Coverage {
  const span = params.latitudeNorth - params.latitudeSouth;
  if (span >= 179 && params.width >= params.height * 2) return "planet";
  return (Object.entries(SPAN).find(([, value]) => Math.abs(value - span) < 1)?.[0] as Coverage | undefined) ?? "custom";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}

export function WorldForm({ t, initial, zoom, onCreate, onClose }: { t: T; initial: PlanetParams; zoom: ZoomRange; onCreate: (params: PlanetParams, zoom: ZoomRange) => void; onClose: () => void }) {
  const [params, setParams] = useState<PlanetParams>(initial);
  // Esc closes the form; a click beside it does not, so nothing typed is lost by a slip.
  const [range, setRange] = useState<ZoomRange>(zoom);
  const [coverage, setCoverage] = useState<Coverage>(() => coverageOf(initial));
  const [centre, setCentre] = useState(() => Math.round((initial.latitudeNorth + initial.latitudeSouth) / 2));
  const set = <K extends keyof PlanetParams>(key: K, value: PlanetParams[K]) => setParams((current) => ({ ...current, [key]: value }));
  const number = (key: keyof PlanetParams, min: number, max: number, step = 1) => (
    <NumberInput min={min} max={max} step={step} value={params[key] as number} onChange={(value) => set(key, value as never)} />
  );
  // The whole planet is drawn twice as wide as tall, so its longitudes wrap the globe; the rest keep the usual frame.
  const cover = (next: Coverage, middle = centre) => {
    setCoverage(next);
    if (next === "custom") return;
    if (next === "planet") return setParams((current) => ({ ...current, width: 2000, height: 1000, latitudeNorth: 90, latitudeSouth: -90 }));
    const span = SPAN[next];
    const north = Math.min(90, Math.round(middle + span / 2));
    setParams((current) => ({ ...current, width: 1600, height: 1000, latitudeNorth: north, latitudeSouth: Math.max(-90, north - span) }));
  };
  const tall = Math.round((params.latitudeNorth - params.latitudeSouth) * 111);
  const wide = Math.round((tall * params.width) / params.height);

  return (
    <Modal label={t("world.title")} onClose={onClose}>
      <div className="modal-head">
        <h2>{t("world.title")}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label={t("action.cancel")}>
          ✕
        </button>
      </div>
      <div className="modal-grid">
        <section>
          <h3>{t("world.basics")}</h3>
          <Field label={t("world.name")}>
            <input value={params.name ?? ""} placeholder={t("world.namePlaceholder")} onChange={(event) => set("name", event.target.value)} />
          </Field>
          <Field label={t("field.seed")}>
            <span className="inline">
              <input value={params.seed} onChange={(event) => set("seed", event.target.value)} />
              <button type="button" onClick={() => set("seed", randomSeed())} title={t("action.random")}>
                🎲
              </button>
            </span>
          </Field>
          <SettingPanel t={t} value={params.setting} onApply={(setting) => set("setting", setting)} applyLabel={t("world.useSetting")} />
        </section>
        <section>
          <h3>{t("world.extent")}</h3>
          <Field label={t("world.coverage")}>
            <select value={coverage} onChange={(event) => cover(event.target.value as Coverage)}>
              {COVERAGES.map((id) => (
                <option key={id} value={id}>
                  {t(`coverage.${id}`)}
                </option>
              ))}
            </select>
          </Field>
          {coverage !== "planet" && coverage !== "custom" ? (
            <Field label={`${t("world.centre")}: ${centre}°`}>
              <input
                type="range"
                min={-70}
                max={70}
                value={centre}
                onChange={(event) => {
                  setCentre(Number(event.target.value));
                  cover(coverage, Number(event.target.value));
                }}
              />
            </Field>
          ) : null}
          {coverage === "custom" ? (
            <>
              <Field label={t("field.latitudeNorth")}>{number("latitudeNorth", -90, 90)}</Field>
              <Field label={t("field.latitudeSouth")}>{number("latitudeSouth", -90, 90)}</Field>
            </>
          ) : null}
          <p className="muted">{t("world.size", { w: wide, h: tall })}</p>
          <Field label={t("field.template")}>
            <select value={params.template} onChange={(event) => set("template", event.target.value as PlanetParams["template"])}>
              {TEMPLATES.map((id) => (
                <option key={id} value={id}>
                  {t(`template.${id}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("field.cells")}>
            <select value={params.cells} onChange={(event) => set("cells", Number(event.target.value))}>
              {[3000, 5000, 10000, 20000, 30000, 50000].map((count) => (
                <option key={count} value={count}>
                  {count.toLocaleString(t.locale)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("field.peakHeight")}>{number("peakHeight", 500, 12000, 100)}</Field>
          <h3>{t("world.climate")}</h3>
          <Field label={t("field.temperatureEquator")}>{number("temperatureEquator", -20, 50)}</Field>
          <Field label={t("field.temperaturePole")}>{number("temperaturePole", -60, 20)}</Field>
          <Field label={t("field.precipitation")}>{number("precipitation", 0.1, 3, 0.1)}</Field>
        </section>
        <section>
          <h3>{t("world.peoples")}</h3>
          <Field label={t("field.cultures")}>{number("cultures", 1, 40)}</Field>
          <Field label={t("field.states")}>{number("states", 1, 60)}</Field>
          <Field label={t("field.towns")}>{number("towns", 0, 2000, 10)}</Field>
          <Field label={t("field.provinceShare")}>{number("provinceShare", 0, 1, 0.05)}</Field>
          <Field label={t("field.growth")}>{number("growth", 0.3, 3, 0.1)}</Field>
          <Field label={t("history.depth")}>
            <select value={params.history ?? 0} onChange={(event) => set("history", Number(event.target.value) || undefined)}>
              {[0, 200, 400, 700, 1000].map((years) => (
                <option key={years} value={years}>
                  {years ? t("history.years", { years }) : t("history.noneShort")}
                </option>
              ))}
            </select>
          </Field>
          <p className="muted">{t("history.depthHint")}</p>
          <h3>{t("world.scale")}</h3>
          <Field label={`${t("world.zoomOut")}: ×${range[0]}`}>
            <input type="range" min={0.3} max={1} step={0.05} value={range[0]} onChange={(event) => setRange([Number(event.target.value), range[1]])} />
          </Field>
          <Field label={`${t("world.zoomIn")}: ×${range[1]}`}>
            <input type="range" min={4} max={200} step={1} value={range[1]} onChange={(event) => setRange([range[0], Number(event.target.value)])} />
          </Field>
          <p className="muted">{t("world.scaleHint", { far: Math.round(wide / range[0]), near: Math.max(1, Math.round(wide / range[1])) })}</p>
        </section>
      </div>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          {t("action.cancel")}
        </button>
        <button type="button" className="primary" onClick={() => onCreate(params, range)}>
          {t("world.create")}
        </button>
      </div>
    </Modal>
  );
}
