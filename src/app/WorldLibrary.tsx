// The game master's worlds: the one open now (its name, setting and file), all the others, a new world from any top map,
// and worlds read from files.
import { Modal } from "./Modal";
import { useEffect, useRef, useState } from "react";
import { ERA_IDS, randomSeed, settingOf, SETTINGS, TOP_LEVELS, type EraId, type Setting, type TopLevel, type WorldDoc } from "../core/index";
import type { T } from "./i18n";
import { SettingPanel } from "./SettingPanel";
import type { NewWorld, Snapshot, Worlds } from "./worlds";

/** Worlds to try the Atlas on: each a different age, from a different top map. */
const DEMOS: { id: string; top: TopLevel; era: EraId; start: Record<string, unknown> }[] = [
  { id: "kingdoms", top: "planet", era: "medieval", start: { seed: "demo-kingdoms", template: "continents", history: 300 } },
  { id: "ruins", top: "planet", era: "post-apocalypse", start: { seed: "demo-ruins", template: "plates" } },
  { id: "opera", top: "galaxy", era: "far-future", start: { seed: "demo-opera" } },
  { id: "neon", top: "city", era: "cyberpunk", start: { seed: "demo-neon" } },
  { id: "crypt", top: "local", era: "medieval", start: { seed: "demo-crypt", kind: "dungeon", theme: "crypt", levels: 3 } },
];

export const LEVEL_ICON: Record<string, string> = { universe: "🌠", galaxy: "🌌", system: "☀️", planet: "🌍", region: "🗺", underworld: "🕳", city: "🏰", building: "🏠", local: "🗺️" };

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const fileName = (world: WorldDoc) => `${world.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-") || "world"}.atlas.json`;

export function WorldLibrary({ t, worlds, onClose, onWorldSetting }: { t: T; worlds: Worlds; onClose: () => void; onWorldSetting: (setting: Setting) => void }) {
  // Esc closes the library; a click beside it does not, so a name being typed is not lost.
  const { world } = worlds;
  const [draft, setDraft] = useState<NewWorld>(() => ({ name: "", top: "planet", setting: {}, script: "latin", start: { seed: randomSeed() } }));
  const [error, setError] = useState("");
  const [shots, setShots] = useState<Snapshot[]>([]);
  useEffect(() => {
    worlds.snapshots(world.id).then(setShots);
  }, [world.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const picker = useRef<HTMLInputElement>(null);
  const when = (time: number) => new Date(time).toLocaleString(t.locale);
  const era = (setting: Partial<Setting>) => t(`era.${settingOf(setting).era}`);

  return (
    <Modal label={t("worlds.title")} onClose={onClose}>
      <div className="modal-head">
        <h2>{t("worlds.title")}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label={t("action.close")}>
          ✕
        </button>
      </div>
      <div className="modal-grid">
        <section>
          <h3>{t("worlds.current")}</h3>
          <label>
            {t("worlds.name")}
            <input value={world.name} onChange={(event) => worlds.rename(world.id, event.target.value)} />
          </label>
          <p className="muted">
            {LEVEL_ICON[world.top]} {t(`top.${world.top}`)} · {t("worlds.maps", { n: Object.keys(world.maps).length })} · {era(world.setting)}
          </p>
          <SettingPanel t={t} value={world.setting} onApply={onWorldSetting} applyLabel={t("worlds.applySetting")} />
          <p className="muted">{t("worlds.settingHint")}</p>
          <div className="row-buttons">
            <button type="button" onClick={() => download(fileName(world), world)}>
              💾 {t("worlds.save")}
            </button>
            <button type="button" onClick={() => worlds.duplicate(world.id, t("worlds.copySuffix"))}>
              ⧉ {t("worlds.duplicate")}
            </button>
            <button
              type="button"
              onClick={async () => {
                const label = prompt(t("worlds.snapshotLabel"), new Date().toLocaleString(t.locale));
                if (label === null) return;
                await worlds.snapshot(label);
                setShots(await worlds.snapshots(world.id));
              }}
            >
              📸 {t("worlds.snapshot")}
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={!!worlds.list.find((item) => item.id === world.id)?.template} onChange={(event) => worlds.setTemplate(world.id, event.target.checked)} />
            {t("worlds.isTemplate")}
          </label>
          {shots.length ? (
            <>
              <h4 className="muted">{t("worlds.snapshots")}</h4>
              <ul className="list world-list">
                {shots.map((shot) => (
                  <li key={shot.at}>
                    <span className="grow">
                      {shot.label}
                      <small className="line">
                        {when(shot.at)} · {t("worlds.maps", { n: Object.keys(shot.world.maps).length })}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="ghost"
                      title={t("worlds.goBack")}
                      onClick={() => {
                        if (confirm(t("worlds.confirmGoBack", { label: shot.label }))) {
                          worlds.goBack(shot);
                          onClose();
                        }
                      }}
                    >
                      ↺
                    </button>
                    <button type="button" className="ghost" title={t("worlds.branch")} onClick={() => worlds.branch(shot, `${world.name} — ${shot.label}`).then(onClose)}>
                      ⑂
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        <section>
          <h3>{t("worlds.all")}</h3>
          <ul className="list world-list">
            {worlds.list.map((item) => (
              <li key={item.id} aria-selected={item.id === world.id}>
                <span className="grow" onClick={() => worlds.open(item.id)} title={t("worlds.open")}>
                  <b>
                    {LEVEL_ICON[item.top]} {item.name || t("worlds.unnamed")}
                  </b>
                  <small className="line">
                    {t(`top.${item.top}`)} · {ERA_IDS.includes(item.era as never) ? t(`era.${item.era}`) : item.era} · {t("worlds.maps", { n: item.maps })} · {when(item.updated)}
                  </small>
                </span>
                {item.template ? (
                  <button type="button" className="ghost" title={t("worlds.fromTemplate")} onClick={() => worlds.fromTemplate(item.id, t("worlds.fromTemplateName", { name: item.name || t("worlds.unnamed") })).then(onClose)}>
                    ＋
                  </button>
                ) : null}
                <button type="button" className="ghost" title={t("worlds.save")} onClick={async () => download(`${item.name || "world"}.atlas.json`, await worlds.file(item.id))}>
                  💾
                </button>
                <button
                  type="button"
                  className="ghost"
                  title={t("worlds.delete")}
                  onClick={() => {
                    worlds.remove(item.id);
                  }}
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="wide" onClick={() => picker.current?.click()}>
            📂 {t("worlds.load")}
          </button>
          <input
            ref={picker}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              try {
                const data = JSON.parse(await file.text());
                // The same world from another table: merge its notes into this one, or keep it as a copy.
                await worlds.load(data, worlds.has(data) && confirm(t("worlds.mergeAsk")));
                setError("");
                onClose();
              } catch (problem) {
                setError(t("worlds.badFile", { reason: problem instanceof Error ? problem.message : String(problem) }));
              }
            }}
          />
          {error ? <p className="error">{error}</p> : null}
          {worlds.trash.length ? (
            <>
              <h3>{t("worlds.trash")}</h3>
              <ul className="list world-list">
                {worlds.trash.map((item) => (
                  <li key={item.line.id}>
                    <span className="grow">
                      {LEVEL_ICON[item.line.top]} {item.line.name || t("worlds.unnamed")}
                      <small className="line">{when(item.at)}</small>
                    </span>
                    <button type="button" className="ghost" title={t("worlds.restore")} onClick={() => worlds.restore(item.line.id)}>
                      ↺
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      title={t("worlds.purge")}
                      onClick={() => {
                        if (confirm(t("worlds.confirmPurge", { name: item.line.name || t("worlds.unnamed") }))) worlds.purge([item.line.id]);
                      }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="wide"
                onClick={() => {
                  if (confirm(t("worlds.confirmEmpty", { count: worlds.trash.length }))) worlds.purge(worlds.trash.map((item) => item.line.id));
                }}
              >
                🗑 {t("worlds.emptyTrash")}
              </button>
            </>
          ) : null}
        </section>
        <section>
          <h3>{t("worlds.new")}</h3>
          <label>
            {t("worlds.name")}
            <input value={draft.name} placeholder={t("worlds.namePlaceholder")} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <p className="muted">{t("worlds.topHint")}</p>
          <div className="top-picker">
            {TOP_LEVELS.map((top) => (
              <button key={top} type="button" aria-pressed={draft.top === top} onClick={() => setDraft({ ...draft, top: top as TopLevel })} title={t(`top.about.${top}`)}>
                <span>{LEVEL_ICON[top]}</span> {t(`top.${top}`)}
              </button>
            ))}
          </div>
          <p className="muted">{t(`top.about.${draft.top}`)}</p>
          <label>
            {t("field.seed")}
            <span className="inline">
              <input value={String(draft.start.seed ?? "")} onChange={(event) => setDraft({ ...draft, start: { ...draft.start, seed: event.target.value } })} />
              <button type="button" onClick={() => setDraft({ ...draft, start: { ...draft.start, seed: randomSeed() } })} title={t("action.random")}>
                🎲
              </button>
            </span>
          </label>
          <SettingPanel t={t} value={draft.setting} onApply={(setting) => setDraft({ ...draft, setting })} applyLabel={t("world.useSetting")} />
          <label>
            {t("field.script")}
            <select value={draft.script} onChange={(event) => setDraft({ ...draft, script: event.target.value as "latin" | "cyrillic" })}>
              <option value="latin">{t("script.latin")}</option>
              <option value="cyrillic">{t("script.cyrillic")}</option>
            </select>
          </label>
          <button
            type="button"
            className="primary wide"
            onClick={() => {
              worlds.create({ ...draft, name: draft.name.trim() || t("worlds.defaultName", { top: t(`top.${draft.top}`) }) });
              onClose();
            }}
          >
            ✨ {t("worlds.create")}
          </button>
          <h3>{t("demo.title")}</h3>
          <div className="row-buttons">
            {DEMOS.map((demo) => (
              <button
                key={demo.id}
                type="button"
                title={t(`demo.${demo.id}.hint`)}
                onClick={() => {
                  worlds.create({ name: t(`demo.${demo.id}`), top: demo.top, setting: SETTINGS[demo.era], script: draft.script, start: demo.start });
                  onClose();
                }}
              >
                {LEVEL_ICON[demo.top]} {t(`demo.${demo.id}`)}
              </button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
