// The local map's panels: a room's card (how it looks, who is there and how many, what lies there, its locks and
// ways on) with the game master's editor, and the editor of his own rooms, themes and tables.
import { useState } from "react";
import { ERA_IDS, LOCAL_THEMES, NO_OWN, type Keyed, type LocalGroup, type LocalLoot, type LocalMap, type LocalOwn, type LocalRoomEdit, type OwnRoomKind, type OwnTable, type OwnTheme } from "../../core/index";
import type { T } from "../i18n";
import { NumberInput } from "../NumberInput";
import { NpcCard } from "../People";

const OWN_KEY = "atlas.local.own";

export function loadOwn(): LocalOwn {
  try {
    const own = JSON.parse(localStorage.getItem(OWN_KEY) ?? "null") as Partial<LocalOwn> | null;
    return { rooms: Array.isArray(own?.rooms) ? own.rooms : [], themes: Array.isArray(own?.themes) ? own.themes : [], tables: Array.isArray(own?.tables) ? own.tables : [] };
  } catch {
    return NO_OWN;
  }
}

export function saveOwn(own: LocalOwn) {
  try {
    localStorage.setItem(OWN_KEY, JSON.stringify(own));
  } catch {
    // Storage may be off (a private window); the content still works for this session.
  }
}

/** A dweller in words: its dictionary word, a legend's own by the planet's word, the game master's as written. */
export function dwellerName(t: T, id: string): string {
  if (/\s/u.test(id)) return id;
  const own = t(`monster.${id}`);
  if (own !== `monster.${id}`) return own;
  const told = t(`fact.${id.replace(/-/gu, " ")}`);
  return told !== `fact.${id.replace(/-/gu, " ")}` ? told : id.replace(/-/gu, " ");
}

/** A band in words: "skeletons ×5", a ruler by its name. */
export function bandLine(t: T, nm: (name: string) => string, group: LocalGroup): string {
  const who = dwellerName(t, group.who);
  const named = group.name ? t("local.named", { name: nm(group.name), who }) : who;
  return group.count > 1 ? t("local.band", { who: named, n: group.count }) : named;
}

/** A find in words, counted out when it is coin or the like. */
export function lootLine(t: T, loot: LocalLoot): string {
  const what = loot.what.startsWith("fact:") ? t(`fact.${loot.what.slice(5)}`) : /\s/u.test(loot.what) ? loot.what : t(`treasure.${loot.what}`);
  return loot.amount ? t("local.amount", { what, n: loot.amount }) : what;
}

/** A room's purpose in words: built-in, or one of the game master's own kinds by its name. */
export function purposeName(t: T, own: LocalOwn, purpose: string): string {
  if (purpose.startsWith("own:")) return own.rooms.find((room) => room.id === purpose.slice(4))?.name || t("own.room");
  return t(`purpose.${purpose}`);
}

const PURPOSES = ["entrance", "guard-room", "barracks", "shrine", "treasury", "prison", "library", "laboratory", "lair", "storage", "trap-room", "flooded", "tomb", "workshop", "server-room", "camp", "clearing", "ruin", "nest", "spring", "ossuary", "great-hall", "quarters", "mine-face", "cistern", "platform", "armory", "medbay", "dwelling", "ship-bridge", "engine-room", "airlock", "cargo-hold", "shop", "garden", "landmark"];

interface RoomCardProps {
  t: T;
  nm: (name: string) => string;
  map: LocalMap;
  room: Keyed;
  own: LocalOwn;
  /** Rooms it leads to. */
  next: number[];
  onPick: (id: number) => void;
  players: boolean;
  age?: string;
  /** The tables the place draws from: its dwellers, loot and traps, for the editor's lists. */
  pool: { dwellers: string[]; loot: string[]; traps: string[] };
  edit: LocalRoomEdit | undefined;
  onEdit: (change: LocalRoomEdit | null) => void;
  onScene: () => void;
  onOpen?: (theme: string) => void;
}

export function RoomCard({ t, nm, map, room, own, next, onPick, players, age, pool, edit, onEdit, onScene, onOpen }: RoomCardProps) {
  const [editing, setEditing] = useState(false);
  const lockOf = room.lock ? map.keyed.find((other) => other.key === room.lock) : undefined;
  const opens = room.key ? map.keyed.find((other) => other.lock === room.key) : undefined;
  const portal = map.features.find((f) => f.kind === "portal" && f.room === room.id);
  const set = (change: Partial<LocalRoomEdit>) => onEdit({ ...(edit ?? {}), ...change });
  const groups = room.monsters;
  return (
    <div className="card room-card">
      <h3>
        {room.id}. {purposeName(t, own, room.purpose)}
        {room.object ? ` · ${t(`object.${room.object}`)}` : ""}
        {room.name ? ` «${nm(room.name)}»` : ""}
      </h3>
      {room.text ? <p className="read-aloud">{room.text}</p> : null}
      {!room.text || room.purpose.startsWith("own:") ? <p className="read-aloud">{room.look.map((key) => t(key)).join(" ")}</p> : null}
      {groups.length ? (
        <div className="row">
          <span>{t("local.monsters")}</span>
          <b>{groups.map((group) => bandLine(t, nm, group)).join("; ")}</b>
        </div>
      ) : null}
      {groups
        .filter((group) => group.leader)
        .map((group) => (
          <ul key={group.leader!.id} className="list people">
            <NpcCard t={t} nm={nm} npc={group.leader!} age={age} />
          </ul>
        ))}
      {room.people?.length ? (
        <ul className="list people">
          {room.people.map((npc) => (
            <NpcCard key={npc.id} t={t} nm={nm} npc={npc} age={age} />
          ))}
        </ul>
      ) : null}
      {room.treasure && !players ? (
        <div className="row">
          <span>{t("local.treasure")}</span>
          <b>{lootLine(t, room.treasure)}</b>
        </div>
      ) : null}
      {room.trap && !players ? (
        <div className="row">
          <span>{t("local.trap")}</span>
          <b>{t(`trap.${room.trap}`)}</b>
        </div>
      ) : null}
      {room.lock ? <p className="muted">🔒 {lockOf ? t("local.locked", { n: lockOf.id }) : t("local.lockedNoKey")}</p> : null}
      {room.key && !players ? <p className="muted">⚷ {opens ? t("local.holdsKey", { n: opens.id }) : t("local.holdsKeyAny")}</p> : null}
      {room.secret && !players ? <p className="muted secret">{t("local.secretRoom")}</p> : null}
      {next.length ? (
        <div className="row-buttons">
          <span className="muted">{t("local.leadsTo")}</span>
          {next.map((id) => (
            <button key={id} type="button" className="ghost" onClick={() => onPick(id)}>
              → {id}. {purposeName(t, own, map.keyed.find((other) => other.id === id)?.purpose ?? "")}
            </button>
          ))}
        </div>
      ) : null}
      <div className="row-buttons">
        <button type="button" onClick={onScene}>
          🎭 {t("local.scene")}
        </button>
        {portal?.to && onOpen ? (
          <button type="button" className="primary" onClick={() => onOpen(portal.to!)}>
            🗺️ {t("local.opensInto", { theme: t(`ltheme.${portal.to}`) })}
          </button>
        ) : null}
        {!players ? (
          <button type="button" aria-pressed={editing} onClick={() => setEditing(!editing)}>
            ✎ {t("local.edit")}
          </button>
        ) : null}
      </div>
      {editing && !players ? (
        <div className="room-edit">
          <label>
            {t("local.purpose")}
            <select value={room.purpose} onChange={(event) => set({ purpose: event.target.value as Keyed["purpose"] })}>
              {[...PURPOSES.map((id) => [id, t(`purpose.${id}`)]), ...own.rooms.map((kind) => [`own:${kind.id}`, kind.name || t("own.room")])].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">{t("local.monsters")}</span>
          {groups.map((group, k) => (
            <div key={k} className="custom-row">
              <select className="grow" value={group.who} aria-label={t("local.monsters")} onChange={(event) => set({ monsters: groups.map((g, j) => (j === k ? { ...g, who: event.target.value } : g)) })}>
                {[...new Set([group.who, ...pool.dwellers])].map((id) => (
                  <option key={id} value={id}>
                    {dwellerName(t, id)}
                  </option>
                ))}
              </select>
              <NumberInput min={1} max={200} value={group.count} aria-label={t("local.count")} title={t("local.count")} onChange={(value) => set({ monsters: groups.map((g, j) => (j === k ? { ...g, count: value } : g)) })} />
              <button type="button" className="ghost" aria-label={t("custom.remove")} title={t("custom.remove")} onClick={() => set({ monsters: groups.filter((_, j) => j !== k) })}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="wide" onClick={() => set({ monsters: [...groups, { who: pool.dwellers[0] ?? "giant-rats", count: 3 }] })}>
            + {t("local.addBand")}
          </button>
          <label>
            {t("local.treasure")}
            <select value={room.treasure?.what ?? ""} onChange={(event) => set({ treasure: event.target.value ? { what: event.target.value } : null })}>
              <option value="">{t("local.none")}</option>
              {[...new Set([...(room.treasure ? [room.treasure.what] : []), ...pool.loot])].map((id) => (
                <option key={id} value={id}>
                  {lootLine(t, { what: id })}
                </option>
              ))}
            </select>
          </label>
          {room.treasure ? (
            <label>
              {t("local.count")}
              <NumberInput min={0} max={1000000} value={room.treasure.amount ?? 0} onChange={(value) => set({ treasure: { ...room.treasure!, ...(value ? { amount: value } : { amount: undefined }) } })} />
            </label>
          ) : null}
          <label>
            {t("local.trap")}
            <select value={room.trap ?? ""} onChange={(event) => set({ trap: event.target.value || null })}>
              <option value="">{t("local.none")}</option>
              {[...new Set([...(room.trap ? [room.trap] : []), ...pool.traps])].map((id) => (
                <option key={id} value={id}>
                  {/\s/u.test(id) ? id : t(`trap.${id}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("local.text")}
            <textarea rows={3} value={edit?.text ?? ""} placeholder={room.look.map((key) => t(key)).join(" ")} onChange={(event) => set({ text: event.target.value })} />
          </label>
          <div className="row-buttons">
            <button type="button" onClick={() => onEdit({ ...(edit ?? {}), reroll: (edit?.reroll ?? 0) + 1, monsters: undefined, treasure: undefined, trap: undefined, purpose: undefined })}>
              🎲 {t("local.reroll")}
            </button>
            <button type="button" className="ghost" disabled={!edit} onClick={() => onEdit(null)}>
              ↺ {t("local.reset")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The game master's own rooms, themes and tables for local maps, kept in this browser. */
export function OwnEditor({ t, own, onChange, onApply }: { t: T; own: LocalOwn; onChange: (next: LocalOwn) => void; onApply: () => void }) {
  const id = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const room = (k: number, change: Partial<OwnRoomKind>) => onChange({ ...own, rooms: own.rooms.map((item, j) => (j === k ? { ...item, ...change } : item)) });
  const theme = (k: number, change: Partial<OwnTheme>) => onChange({ ...own, themes: own.themes.map((item, j) => (j === k ? { ...item, ...change } : item)) });
  const table = (k: number, change: Partial<OwnTable>) => onChange({ ...own, tables: own.tables.map((item, j) => (j === k ? { ...item, ...change } : item)) });
  const built = [...LOCAL_THEMES.dungeon, ...LOCAL_THEMES.cave];
  const allThemes = [...LOCAL_THEMES.dungeon, ...LOCAL_THEMES.cave, ...LOCAL_THEMES.wilderness];
  const total = own.rooms.length + own.themes.length + own.tables.length;
  return (
    <details className="custom-kinds" open={total > 0}>
      <summary>
        {t("own.title")} ({total})
      </summary>
      <p className="muted">{t("own.hint")}</p>
      <h4 className="muted">{t("own.rooms")}</h4>
      {own.rooms.map((item, k) => (
        <div key={item.id} className="custom-kind">
          <div className="custom-row">
            <input className="grow" value={item.name} placeholder={t("custom.name")} aria-label={t("custom.name")} onChange={(event) => room(k, { name: event.target.value })} />
            <button type="button" className="ghost" aria-label={t("custom.remove")} title={t("custom.remove")} onClick={() => onChange({ ...own, rooms: own.rooms.filter((_, j) => j !== k) })}>
              ✕
            </button>
          </div>
          <textarea rows={2} value={item.text} placeholder={t("own.text")} aria-label={t("own.text")} onChange={(event) => room(k, { text: event.target.value })} />
          <div className="custom-row">
            <select className="grow" value={item.themes[0] ?? ""} aria-label={t("own.where")} title={t("own.where")} onChange={(event) => room(k, { themes: event.target.value ? [event.target.value] : [] })}>
              <option value="">{t("own.anywhere")}</option>
              {[...built, ...own.themes.map((item2) => item2.id)].map((id2) => (
                <option key={id2} value={id2}>
                  {own.themes.find((item2) => item2.id === id2)?.name || t(`ltheme.${id2}`)}
                </option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={item.secret} onChange={(event) => room(k, { secret: event.target.checked })} />
              {t("own.secret")}
            </label>
          </div>
          <label>
            {t("own.opens")}
            <select value={item.opens} onChange={(event) => room(k, { opens: event.target.value })}>
              <option value="">{t("local.none")}</option>
              {allThemes.map((id2) => (
                <option key={id2} value={id2}>
                  {t(`ltheme.${id2}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}
      <button type="button" className="wide" onClick={() => onChange({ ...own, rooms: [...own.rooms, { id: id(), name: "", text: "", secret: false, opens: "", themes: [] }] })}>
        + {t("own.addRoom")}
      </button>
      <h4 className="muted">{t("own.themes")}</h4>
      {own.themes.map((item, k) => (
        <div key={item.id} className="custom-kind">
          <div className="custom-row">
            <input className="grow" value={item.name} placeholder={t("custom.name")} aria-label={t("custom.name")} onChange={(event) => theme(k, { name: event.target.value })} />
            <button type="button" className="ghost" aria-label={t("custom.remove")} title={t("custom.remove")} onClick={() => onChange({ ...own, themes: own.themes.filter((_, j) => j !== k) })}>
              ✕
            </button>
          </div>
          <label>
            {t("own.base")}
            <select
              value={`${item.kind}:${item.base}`}
              onChange={(event) => {
                const [kind, base] = event.target.value.split(":");
                theme(k, { kind: kind as OwnTheme["kind"], base: base as OwnTheme["base"] });
              }}
            >
              {(["dungeon", "cave"] as const).flatMap((kind) =>
                LOCAL_THEMES[kind].map((base) => (
                  <option key={`${kind}:${base}`} value={`${kind}:${base}`}>
                    {t(`lkind.${kind}`)} · {t(`ltheme.${base}`)}
                  </option>
                )),
              )}
            </select>
          </label>
          <div className="purpose-picks">
            {[...PURPOSES.filter((p) => !["entrance", "lair", "tomb", "landmark"].includes(p)).map((p) => [p, t(`purpose.${p}`)]), ...own.rooms.map((kind) => [`own:${kind.id}`, kind.name || t("own.room")])].map(([p, label]) => (
              <label key={p} className="check">
                <input type="checkbox" checked={item.rooms.includes(p)} onChange={(event) => theme(k, { rooms: event.target.checked ? [...item.rooms, p] : item.rooms.filter((x) => x !== p) })} />
                {label}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="wide" onClick={() => onChange({ ...own, themes: [...own.themes, { id: `own-${id()}`, name: "", kind: "dungeon", base: "crypt", rooms: [] }] })}>
        + {t("own.addTheme")}
      </button>
      <h4 className="muted">{t("own.tables")}</h4>
      {own.tables.map((item, k) => (
        <div key={item.id} className="custom-kind">
          <div className="custom-row">
            <select className="grow" value={item.what} aria-label={t("own.what")} onChange={(event) => table(k, { what: event.target.value as OwnTable["what"] })}>
              {(["dwellers", "loot", "traps"] as const).map((what) => (
                <option key={what} value={what}>
                  {t(`own.${what}`)}
                </option>
              ))}
            </select>
            <button type="button" className="ghost" aria-label={t("custom.remove")} title={t("custom.remove")} onClick={() => onChange({ ...own, tables: own.tables.filter((_, j) => j !== k) })}>
              ✕
            </button>
          </div>
          <div className="custom-row">
            <select className="grow" value={item.theme} aria-label={t("field.ltheme")} onChange={(event) => table(k, { theme: event.target.value })}>
              <option value="any">{t("own.anyTheme")}</option>
              {[...allThemes, ...own.themes.map((item2) => item2.id)].map((id2) => (
                <option key={id2} value={id2}>
                  {own.themes.find((item2) => item2.id === id2)?.name || t(`ltheme.${id2}`)}
                </option>
              ))}
            </select>
            <select className="grow" value={item.age} aria-label={t("own.age")} onChange={(event) => table(k, { age: event.target.value })}>
              <option value="any">{t("own.anyAge")}</option>
              {ERA_IDS.map((era) => (
                <option key={era} value={era}>
                  {t(`era.${era}`)}
                </option>
              ))}
            </select>
          </div>
          <textarea rows={3} value={item.entries} placeholder={t(item.what === "dwellers" ? "own.dwellersHint" : "own.entriesHint")} aria-label={t("own.entries")} onChange={(event) => table(k, { entries: event.target.value })} />
        </div>
      ))}
      <button type="button" className="wide" onClick={() => onChange({ ...own, tables: [...own.tables, { id: id(), what: "dwellers", theme: "any", age: "any", entries: "" }] })}>
        + {t("own.addTable")}
      </button>
      <button type="button" className="primary wide" onClick={onApply}>
        {t("own.apply")}
      </button>
    </details>
  );
}
