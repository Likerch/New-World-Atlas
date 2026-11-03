// People, factions and rumours as the inspectors of every level show them: one look everywhere.
import type { Faction, Hearsay, Npc, Rumour } from "../core/index";
import type { T } from "./i18n";

/** A rumour or any hearsay in words: "@key" values are looked up, names are written in the chosen script. */
export function say(t: T, nm: (name: string) => string, item: Hearsay): string {
  const vars = Object.fromEntries(Object.entries(item.vars).map(([key, value]) => [key, typeof value === "string" ? (value.startsWith("@") ? t(value.slice(1)) : nm(value)) : value]));
  return t(item.key, vars);
}

/** A person in one line for lists, and their wants and secret beneath for the GM. */
export function NpcCard({ t, nm, npc, age, factions = [] }: { t: T; nm: (name: string) => string; npc: Npc; age?: string; factions?: Faction[] }) {
  const faction = npc.faction ? factions.find((item) => item.id === npc.faction) : undefined;
  return (
    <li className="npc">
      <span className="grow">
        <b>{nm(npc.name)}</b>, {t(`role.${npc.role}${age ? `@${age}` : ""}`)} · {t("npc.age", { age: npc.age })}
        <small className="line">
          {t(`trait.${npc.trait}`)} · {t("npc.wants", { want: t(`want.${npc.want}`) })}
          {faction ? ` · ${t(`faction.${faction.kind}`, { name: nm(faction.name) })}` : ""}
        </small>
        {npc.secret ? <small className="line secret">🔒 {t(`secret.${npc.secret}`)}</small> : null}
      </span>
    </li>
  );
}

export function PeopleList({ t, nm, people, age, factions }: { t: T; nm: (name: string) => string; people: Npc[]; age?: string; factions?: Faction[] }) {
  if (!people.length) return null;
  return (
    <>
      <h4 className="muted">{t("npc.people")}</h4>
      <ul className="list people">
        {people.map((npc) => (
          <NpcCard key={npc.id} t={t} nm={nm} npc={npc} age={age} factions={factions} />
        ))}
      </ul>
    </>
  );
}

export function FactionList({ t, nm, factions, age }: { t: T; nm: (name: string) => string; factions: Faction[]; age?: string }) {
  if (!factions.length) return null;
  const nameOf = (id: string) => {
    const item = factions.find((faction) => faction.id === id);
    return item ? t(`faction.${item.kind}`, { name: nm(item.name) }) : "";
  };
  return (
    <>
      <h4 className="muted">{t("npc.factions")}</h4>
      <ul className="list factions">
        {factions.map((faction) => (
          <li key={faction.id}>
            <span className="grow">
              <b>{t(`faction.${faction.kind}`, { name: nm(faction.name) })}</b> {"●".repeat(faction.strength)}
              <small className="line">
                {t("npc.leads", { name: nm(faction.leader.name), role: t(`role.${faction.leader.role}${age ? `@${age}` : ""}`) })} · {t("npc.wants", { want: t(`want.${faction.goal}`) })}
              </small>
              {faction.rivals.length ? <small className="line">⚔ {faction.rivals.map(nameOf).join(", ")}</small> : null}
              {faction.allies.length ? <small className="line">🤝 {faction.allies.map(nameOf).join(", ")}</small> : null}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Three rumours; the GM sees which one is false, the players' view does not. */
export function RumourList({ t, nm, rumours, players }: { t: T; nm: (name: string) => string; rumours: Rumour[]; players?: boolean }) {
  if (!rumours.length) return null;
  return (
    <>
      <h4 className="muted">{t("npc.rumours")}</h4>
      <ul className="plain rumours">
        {rumours.map((item, k) => (
          <li key={k}>
            «{say(t, nm, item)}»{!players && !item.true ? <small className="secret"> — {t("npc.false")}</small> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
