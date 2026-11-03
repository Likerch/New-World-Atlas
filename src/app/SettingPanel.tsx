// The world's age and setting: an era, a ready mix, or a custom setting made by turning the knobs. Choosing an era or
// a mix regrows the same world in that age at once; the knobs apply with a button.
import { useEffect, useState } from "react";
import { ERA_IDS, MIXES, RULES, SETTINGS, settingOf, techEra, type EraId, type Rule, type Setting } from "../core/index";
import type { T } from "./i18n";

interface Props {
  t: T;
  value: Partial<Setting> | undefined;
  onApply: (setting: Setting) => void;
  /** The knobs' button, when it does something other than regrow the world. */
  applyLabel?: string;
}

const same = (a: Setting, b: Setting) => JSON.stringify({ ...a, name: undefined }) === JSON.stringify({ ...b, name: undefined });

export function SettingPanel({ t, value, onApply, applyLabel }: Props) {
  const current = settingOf(value);
  const [draft, setDraft] = useState<Setting>(current);
  const key = JSON.stringify(value ?? null);
  useEffect(() => setDraft(settingOf(value)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const mix = Object.entries(MIXES).find(([, preset]) => same(preset, current))?.[0];
  const custom = !mix && !same(SETTINGS[current.era], current);
  const set = <K extends keyof Setting>(field: K, next: Setting[K]) => setDraft((old) => ({ ...old, [field]: next }));
  const choose = (choice: string) => onApply(choice.startsWith("mix:") ? MIXES[choice.slice(4)] : SETTINGS[choice as EraId]);
  const title = current.name ? (MIXES[current.name] ? t(`mix.${current.name}`) : current.name) : "";
  const describe = (setting: Setting) => [t(`setting.magic.${setting.magic}`), setting.decline ? `${t("setting.decline")} ${Math.round(setting.decline * 100)}%` : "", setting.rule !== "any" ? t(`rule.${setting.rule}`) : ""].filter(Boolean).join(" · ");

  return (
    <div className="setting">
      <h2>{t("panel.setting")}</h2>
      <label>
        {t("setting.era")}
        <select value={mix ? `mix:${mix}` : current.era} onChange={(event) => choose(event.target.value)}>
          <optgroup label={t("setting.eras")}>
            {ERA_IDS.map((era) => (
              <option key={era} value={era}>
                {t(`era.${era}`)}
              </option>
            ))}
          </optgroup>
          <optgroup label={t("setting.mixes")}>
            {Object.keys(MIXES).map((id) => (
              <option key={id} value={`mix:${id}`}>
                {t(`mix.${id}`)}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <p className="muted">
        {custom ? `${title ? `${title}: ` : ""}${t("setting.customOf", { era: t(`era.${current.era}`) })} · ` : ""}
        {t(mix ? `mix.about.${mix}` : `era.about.${current.era}`)}
        {custom ? ` · ${describe(current)}` : ""}
      </p>
      <details>
        <summary>{t("setting.custom")}</summary>
        <label>
          {t("setting.tech")}: {t(`era.${techEra(draft.tech)}`)}
          <input type="range" min={0} max={10} step={0.25} value={draft.tech} onChange={(event) => set("tech", Number(event.target.value))} />
        </label>
        <label>
          {t("setting.transport")}: {t(`era.${techEra(draft.transport)}`)}
          <input type="range" min={0} max={10} step={0.25} value={draft.transport} onChange={(event) => set("transport", Number(event.target.value))} />
        </label>
        <label>
          {t("setting.magic")}
          <select value={draft.magic} onChange={(event) => set("magic", Number(event.target.value))}>
            {[0, 1, 2, 3].map((level) => (
              <option key={level} value={level}>
                {t(`setting.magic.${level}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("setting.decline")}: {Math.round(draft.decline * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={draft.decline} onChange={(event) => set("decline", Number(event.target.value))} />
        </label>
        <label>
          {t("setting.density")}: ×{draft.density}
          <input type="range" min={0.25} max={4} step={0.25} value={draft.density} onChange={(event) => set("density", Number(event.target.value))} />
        </label>
        <label>
          {t("setting.rule")}
          <select value={draft.rule} onChange={(event) => set("rule", event.target.value as Rule)}>
            {RULES.map((rule) => (
              <option key={rule} value={rule}>
                {t(`rule.${rule}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("setting.name")}
          <input type="text" value={draft.name ?? ""} placeholder={t("setting.namePlaceholder")} onChange={(event) => set("name", event.target.value || undefined)} />
        </label>
        <p className="muted">{t("setting.hint")}</p>
        <button type="button" className="primary wide" onClick={() => onApply(draft)}>
          {applyLabel ?? t("setting.apply")}
        </button>
      </details>
    </div>
  );
}
