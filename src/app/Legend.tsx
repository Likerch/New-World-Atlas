// The map's legend beside it: what each colour, line and mark on the current map means. Only what the map shows is
// listed; the panel folds away to a button.
import { swatchSvg, type LegendEntry, type LegendSection } from "../core/index";
import type { T } from "./i18n";

/** An entry's words, starting with a capital (some labels are made to sit inside a sentence). */
export function legendLabel(t: T, entry: LegendEntry): string {
  const label = entry.label ?? t(entry.key ?? "", entry.vars);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function Legend({ t, sections, open, setOpen }: { t: T; sections: LegendSection[] | undefined; open: boolean; setOpen: (open: boolean) => void }) {
  if (!sections?.length) return null;
  if (!open)
    return (
      <button type="button" className="legend-toggle" onClick={() => setOpen(true)}>
        ☰ {t("legend.title")}
      </button>
    );
  return (
    <div className="legend">
      <div className="legend-head">
        <strong>{t("legend.title")}</strong>
        <button type="button" className="ghost" onClick={() => setOpen(false)} aria-label={t("legend.hide")} title={t("legend.hide")}>
          ✕
        </button>
      </div>
      {sections.map((section) => (
        <div key={section.key} className="legend-section">
          <h4>{t(section.key)}</h4>
          <ul>
            {section.entries.map((entry, k) => (
              <li key={k}>
                <svg width="24" height="16" viewBox="0 0 24 16" aria-hidden="true" dangerouslySetInnerHTML={{ __html: swatchSvg(entry.swatch) }} />
                <span>{legendLabel(t, entry)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
