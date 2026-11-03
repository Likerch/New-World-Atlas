// The game master's own kinds of thing for a space map: each a row with its mark, colour, name, how many, where it
// turns up and whether it is a region; what it is, whether the players may see it, and what it opens into. They are
// kept in this browser, so the next map starts with them.
import type { CustomKind, KindOpening, Placement } from "../core/index";
import type { T } from "./i18n";
import { NumberInput } from "./NumberInput";

export function loadKinds(key: string): CustomKind[] {
  try {
    const kinds = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(kinds) ? kinds : [];
  } catch {
    return [];
  }
}

export function saveKinds(key: string, kinds: CustomKind[]) {
  try {
    localStorage.setItem(key, JSON.stringify(kinds));
  } catch {
    // Storage may be off (a private window); the kinds still work for this session.
  }
}

export function CustomKinds({ t, value, places, openings, onChange }: { t: T; value: CustomKind[]; places: Placement[]; openings?: KindOpening[]; onChange: (next: CustomKind[]) => void }) {
  const update = (index: number, patch: Partial<CustomKind>) => onChange(value.map((kind, k) => (k === index ? { ...kind, ...patch } : kind)));
  return (
    <details className="custom-kinds" open={value.length > 0}>
      <summary>
        {t("custom.title")} ({value.length})
      </summary>
      <p className="muted">{t("custom.hint")}</p>
      {value.map((kind, index) => (
        <div key={kind.id} className="custom-kind">
          <div className="custom-row">
            <input className="glyph" value={kind.glyph} maxLength={4} aria-label={t("custom.glyph")} title={t("custom.glyph")} onChange={(event) => update(index, { glyph: event.target.value })} />
            <input type="color" value={kind.color} aria-label={t("custom.color")} title={t("custom.color")} onChange={(event) => update(index, { color: event.target.value })} />
            <input className="grow" value={kind.name} placeholder={t("custom.name")} aria-label={t("custom.name")} onChange={(event) => update(index, { name: event.target.value })} />
            <button type="button" className="ghost" aria-label={t("custom.remove")} title={t("custom.remove")} onClick={() => onChange(value.filter((_, k) => k !== index))}>
              ✕
            </button>
          </div>
          <div className="custom-row">
            <NumberInput min={0} max={60} value={kind.count} aria-label={t("custom.count")} title={t("custom.count")} onChange={(value) => update(index, { count: value })} />
            <select className="grow" value={kind.where} aria-label={t("custom.where")} onChange={(event) => update(index, { where: event.target.value as Placement })}>
              {places.map((place) => (
                <option key={place} value={place}>
                  {t(`place2.${place}`)}
                </option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={kind.area} onChange={(event) => update(index, { area: event.target.checked })} />
              {t("custom.area")}
            </label>
          </div>
          <textarea className="custom-about" rows={2} value={kind.about ?? ""} placeholder={t("custom.about")} aria-label={t("custom.about")} onChange={(event) => update(index, { about: event.target.value })} />
          <div className="custom-row">
            {openings ? (
              <select className="grow" value={kind.opens ?? "none"} aria-label={t("custom.opens")} title={t("custom.opens")} onChange={(event) => update(index, { opens: event.target.value as KindOpening })}>
                {openings.map((opening) => (
                  <option key={opening} value={opening}>
                    {t(`opens.${opening}`)}
                  </option>
                ))}
              </select>
            ) : null}
            <label className="check" title={t("custom.secretHint")}>
              <input type="checkbox" checked={!!kind.secret} onChange={(event) => update(index, { secret: event.target.checked })} />
              🔒 {t("custom.secret")}
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="wide" onClick={() => onChange([...value, { id: `kind-${Date.now().toString(36)}`, name: "", glyph: "✦", color: "#ffd27a", count: 4, where: "anywhere", area: false }])}>
        + {t("custom.add")}
      </button>
    </details>
  );
}
