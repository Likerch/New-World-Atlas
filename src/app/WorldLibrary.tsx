// The game master's worlds: the one open now (its name, setting and file), all the others, a new world from any top map,
// and worlds read from files.
import { useRef, useState } from "react";
import { ERA_IDS, randomSeed, settingOf, TOP_LEVELS, type Setting, type TopLevel, type WorldDoc } from "../core/index";
import type { T } from "./i18n";
import { SettingPanel } from "./SettingPanel";
import type { NewWorld, Worlds } from "./worlds";

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
  const { world } = worlds;
  const [draft, setDraft] = useState<NewWorld>(() => ({ name: "", top: "planet", setting: {}, script: "latin", start: { seed: randomSeed() } }));
  const [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const when = (time: number) => new Date(time).toLocaleString();
  const era = (setting: Partial<Setting>) => t(`era.${settingOf(setting).era}`);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={t("worlds.title")} onClick={(event) => event.stopPropagation()}>
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
            </div>
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
                  <button type="button" className="ghost" title={t("worlds.save")} onClick={() => download(`${item.name || "world"}.atlas.json`, worlds.file(item.id))}>
                    💾
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    title={t("worlds.delete")}
                    onClick={() => {
                      if (confirm(t("worlds.confirmDelete", { name: item.name || t("worlds.unnamed") }))) worlds.remove(item.id);
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
                  worlds.load(JSON.parse(await file.text()));
                  setError("");
                  onClose();
                } catch (problem) {
                  setError(t("worlds.badFile", { reason: problem instanceof Error ? problem.message : String(problem) }));
                }
              }}
            />
            {error ? <p className="error">{error}</p> : null}
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
          </section>
        </div>
      </div>
    </div>
  );
}
