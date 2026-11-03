// The history of a world as the GM reads it: the chronicle of events, a town's own story, a realm's rulers.
import { useState } from "react";
import type { History, PastEvent } from "../core/index";
import type { T } from "./i18n";

/** The kinds of event the chronicle can be narrowed to. */
const GROUPS: Record<string, PastEvent["kind"][]> = {
  wars: ["war", "peace", "battle", "siege", "conquest", "sack", "alliance"],
  realms: ["founding", "fall", "crowned", "usurped", "rebellion"],
  towns: ["settled", "abandoned", "fire"],
  disasters: ["plague", "famine", "eruption"],
};

/** An event in words, with the names of who and where in the chosen script. */
export function eventText(t: T, nm: (name: string) => string, history: History, event: PastEvent): string {
  const realm = (k: number) => nm(history.polities[event.polities[k]]?.name ?? "");
  const figure = (k: number) => nm(history.figures[event.figures[k]]?.name ?? "");
  const key = event.kind === "battle" && event.figures.length && history.figures[event.figures[0]]?.role === "general" ? "event.battle.led" : `event.${event.kind}`;
  return t(key, { year: event.year, a: realm(0), b: realm(1), town: event.town ? nm(history.towns[event.town]?.name ?? "") : "", who: figure(0), was: figure(1), count: event.count ?? 0 });
}

function EventRow({ t, nm, history, event, onPick }: { t: T; nm: (name: string) => string; history: History; event: PastEvent; onPick?: (event: PastEvent) => void }) {
  return (
    <li onClick={onPick ? () => onPick(event) : undefined}>
      <span className="badge">{event.year}</span>
      <span className="grow">{eventText(t, nm, history, event)}</span>
    </li>
  );
}

/** The whole chronicle, newest first, narrowed by kind and by a word. */
export function Chronicle({ t, nm, history, onPick }: { t: T; nm: (name: string) => string; history: History; onPick: (event: PastEvent) => void }) {
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(200);
  const word = query.trim().toLowerCase();
  const list = history.events
    .filter((event) => group === "all" || GROUPS[group].includes(event.kind))
    .filter((event) => !word || eventText(t, nm, history, event).toLowerCase().includes(word) || String(event.year) === word)
    .reverse();
  return (
    <>
      <p className="muted">{t("history.now", { year: history.years })}</p>
      <div className="row-buttons">
        <select value={group} onChange={(event) => setGroup(event.target.value)} aria-label={t("history.kinds")}>
          <option value="all">{t("history.all")}</option>
          {Object.keys(GROUPS).map((key) => (
            <option key={key} value={key}>
              {t(`history.group.${key}`)}
            </option>
          ))}
        </select>
        <input className="search" value={query} placeholder={t("search")} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <ul className="list keyed chronicle">
        {list.slice(0, shown).map((event) => (
          <EventRow key={event.id} t={t} nm={nm} history={history} event={event} onPick={onPick} />
        ))}
        {list.length > shown ? (
          <li className="more">
            <button type="button" className="link" onClick={() => setShown(shown + 200)}>
              {t("list.more", { count: list.length - shown })}
            </button>
          </li>
        ) : null}
      </ul>
    </>
  );
}

/** A town's own story: when it was founded, whose it was, what befell it. */
export function TownStory({ t, nm, history, town, onPick }: { t: T; nm: (name: string) => string; history: History; town: number; onPick?: (event: PastEvent) => void }) {
  const own = history.towns[town];
  if (!own) return null;
  const events = history.events.filter((event) => event.town === town);
  return (
    <>
      <h4>{t("history.story")}</h4>
      <p className="muted">
        {t("history.founded", { year: own.founded, by: nm(history.polities[own.owners[0]?.[1] ?? own.polity]?.name ?? "") })}
        {own.fell !== undefined ? ` ${t(`history.fell.${own.cause ?? "abandoned"}`, { year: own.fell })}` : ""}
      </p>
      <ul className="list keyed chronicle">
        {events.slice(-8).map((event) => (
          <EventRow key={event.id} t={t} nm={nm} history={history} event={event} onPick={onPick} />
        ))}
      </ul>
    </>
  );
}

/** A realm's story: its founding, its house and its rulers with their reigns. */
export function RealmStory({ t, nm, history, polity }: { t: T; nm: (name: string) => string; history: History; polity: number }) {
  const realm = history.polities[polity];
  if (!realm) return null;
  const rulers = realm.rulers.map((id) => history.figures[id]);
  // A reign begins when the one before it ended (the first, at the founding).
  const began = (k: number) => (k ? rulers[k - 1].died ?? rulers[k - 1].born : realm.founded);
  const first = Math.max(0, rulers.length - 6);
  const parent = realm.parent ? history.polities[realm.parent] : null;
  return (
    <>
      <h4>{t("history.story")}</h4>
      <p className="muted">
        {t("history.realmFounded", { year: realm.founded })}
        {parent ? ` ${t("history.brokeAway", { from: nm(parent.name) })}` : ""} {t("history.house", { name: nm(realm.dynasty) })}
      </p>
      <ul className="plain">
        {rulers.slice(first).map((ruler, k) => (
          <li key={ruler.id}>
            {nm(ruler.name)} — {t("history.reign", { from: began(first + k), to: ruler.died ?? t("history.today") })}
            {ruler.fate && ruler.fate !== "age" ? ` (${t(`history.fate.${ruler.fate}`)})` : ""}
          </li>
        ))}
      </ul>
    </>
  );
}
