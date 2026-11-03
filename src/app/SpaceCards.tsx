// Pieces the space levels share: a world's profile (its code, port, people, law, technology, trade codes, zone and
// tags), a power's card, the people, factions, rumours and hooks of a place, the strangeness choice, the layer
// toggles and a game master's thing with what it is and what it opens into.
import type { ReactNode } from "react";
import { ehex, renderEmblem, type CustomKind, type Emblem, type Faction, type Hearsay, type Npc, type Rumour, type WorldProfile } from "../core/index";
import type { T } from "./i18n";
import { FactionList, PeopleList, RumourList, say } from "./People";

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

const STRANGENESS = [0, 0.5, 1, 2, 3];

/** How much strangeness a map gets, as a choice. */
export function Strangeness({ t, value, onChange }: { t: T; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      {t("field.anomalies")}
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {STRANGENESS.map((level) => (
          <option key={level} value={level}>
            {t(`strange.${level}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Check boxes for a map's layers, kept in this browser. */
export function LayerToggles<K extends string>({ t, keys, value, onChange, prefix }: { t: T; keys: K[]; value: Record<K, boolean>; onChange: (next: Record<K, boolean>) => void; prefix: string }) {
  return (
    <details className="space-layers">
      <summary>{t("panel.layers")}</summary>
      {keys.map((key) => (
        <label key={key} className="check">
          <input type="checkbox" checked={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} />
          {t(`${prefix}.${key}`)}
        </label>
      ))}
    </details>
  );
}

/** Layer choices kept in this browser, falling back to the given ones. */
export function loadLayers<K extends string>(key: string, fallback: Record<K, boolean>): Record<K, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    return saved && typeof saved === "object" ? { ...fallback, ...saved } : fallback;
  } catch {
    return fallback;
  }
}
export function saveLayers(key: string, value: object) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be off; the choice holds for this visit.
  }
}

/** A world's profile: its code, then each part in words. */
export function ProfileCard({ t, profile, locale }: { t: T; profile: WorldProfile; locale: string }) {
  const people = profile.people;
  return (
    <div className="profile">
      <div className="uwp" title={t("profile.codeHint")}>
        <code>{profile.code}</code>
        <span className={`zone-badge ${profile.zone}`}>{t(`zone2.${profile.zone}`)}</span>
      </div>
      <Row label={t("profile.starport")} value={`${profile.starport} — ${t(`port.${profile.starport}`)}`} />
      <Row label={t("profile.size")} value={`${ehex(profile.size)} — ${profile.size ? `${(profile.size * 1600).toLocaleString(locale)} ${t("unit.km")}` : t("profile.size0")}`} />
      <Row label={t("profile.atmosphere")} value={`${ehex(profile.atmosphere)} — ${t(`air.${profile.atmosphere}`)}`} />
      <Row label={t("profile.hydrographics")} value={`${ehex(profile.hydrographics)} — ${profile.hydrographics * 10}%`} />
      <Row label={t("profile.population")} value={`${ehex(profile.population)} — ${people ? people.toLocaleString(locale) : t("profile.nobody")}`} />
      {profile.population ? <Row label={t("profile.government")} value={`${ehex(profile.government)} — ${t(`gov.${profile.government}`)}`} /> : null}
      {profile.population ? <Row label={t("profile.law")} value={`${ehex(profile.law)} — ${t(`law.${Math.min(9, Math.ceil(profile.law / 1.4))}`)}`} /> : null}
      {profile.population || profile.starport !== "X" ? <Row label={t("profile.tech")} value={`${ehex(profile.tech)} — ${t(`tl.${Math.min(15, profile.tech)}`)}`} /> : null}
      {profile.trade.length ? (
        <Row
          label={t("profile.trade")}
          value={profile.trade.map((code) => (
            <abbr key={code} title={t(`trade.${code}`)} className="trade-code">
              {code}
            </abbr>
          ))}
        />
      ) : null}
      {profile.bases.length ? <Row label={t("profile.bases")} value={profile.bases.map((base) => t(`base.${base}`)).join(", ")} /> : null}
      {profile.tags.map((tag) => (
        <p key={tag} className="tag-line">
          <b>{t(`tag.${tag}`)}.</b> {t(`tag.${tag}.about`)}
        </p>
      ))}
    </div>
  );
}

/** A power's banner, arms or logo. */
export function EmblemView({ emblem }: { emblem: Emblem }) {
  return <div className="arms" dangerouslySetInnerHTML={{ __html: renderEmblem(emblem, { size: emblem.kind === "flag" ? 84 : 64 }) }} />;
}

/** Hooks: what someone here would pay strangers to do. */
export function HookList({ t, nm, hooks }: { t: T; nm: (name: string) => string; hooks: Hearsay[] }) {
  if (!hooks.length) return null;
  return (
    <>
      <h4 className="muted">{t("hook.title")}</h4>
      <ul className="plain hooks">
        {hooks.map((hook, k) => (
          <li key={k}>{say(t, nm, hook)}</li>
        ))}
      </ul>
    </>
  );
}

/** Everyone and everything said about a place, in one block. */
export function LoreBlock({ t, nm, era, people = [], factions = [], rumours = [], hooks = [], players }: { t: T; nm: (name: string) => string; era: string; people?: Npc[]; factions?: Faction[]; rumours?: Rumour[]; hooks?: Hearsay[]; players: boolean }) {
  return (
    <>
      <PeopleList t={t} nm={nm} people={people} age={era} factions={factions} />
      <FactionList t={t} nm={nm} factions={factions} age={era} />
      <RumourList t={t} nm={nm} rumours={rumours} players={players} />
      <HookList t={t} nm={nm} hooks={hooks} />
    </>
  );
}

/** A game master's thing: its kind, what it is, whether it is secret, and the way into what it opens. */
export function CustomThing({ t, kind, onOpen }: { t: T; kind: CustomKind; onOpen?: () => void }) {
  return (
    <div className="custom-thing">
      <Row label={t("custom.found")} value={`${kind.glyph} ${kind.name || t("custom.unnamed")}${kind.secret ? ` · 🔒 ${t("custom.secret")}` : ""}`} />
      {kind.about ? <p className="muted">{kind.about}</p> : null}
      {onOpen && kind.opens && kind.opens !== "none" ? (
        <button type="button" className="wide" onClick={onOpen}>
          ↘ {t(`opens.${kind.opens}`)}
        </button>
      ) : null}
    </div>
  );
}

/** A searchable list header: a box and how many are shown of how many. */
export function SearchBox({ t, value, onChange, shown, total }: { t: T; value: string; onChange: (value: string) => void; shown: number; total: number }) {
  return (
    <div className="search-row">
      <input className="search" value={value} placeholder={t("search")} onChange={(event) => onChange(event.target.value)} />
      <small className="muted">{shown < total ? t("space.shownOf", { shown, total }) : t("space.count", { total })}</small>
    </div>
  );
}
