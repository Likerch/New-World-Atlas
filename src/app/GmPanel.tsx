// The GM panel over the map: what a click does (inspect, drop a pin, reveal through the fog), the fog itself, the
// selected thing's new name and notes, the pins, the players' view, and the campaign file.
import { useRef, useState } from "react";
import type { Campaign, MapPatch, Pin } from "../core/index";
import type { CampaignStore } from "./campaign";
import type { T } from "./i18n";

export type GmMode = "inspect" | "pin" | "reveal" | "hide";

interface Props {
  t: T;
  store: CampaignStore;
  mapKey: string | null;
  selected: { key: string; label: string } | null;
  mode: GmMode;
  setMode: (mode: GmMode) => void;
  brush: number;
  setBrush: (size: number) => void;
  players: boolean;
  setPlayers: (players: boolean) => void;
}

const COLORS = ["#d64545", "#2f7fd0", "#2e9e5b", "#c98a1a", "#8a4fc9", "#1d1d1d"];

export function GmPanel({ t, store, mapKey, selected, mode, setMode, brush, setBrush, players, setPlayers }: Props) {
  const [open, setOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const patch: MapPatch = store.patch(mapKey);
  const update = (change: (p: MapPatch) => MapPatch) => store.update(mapKey, change);
  const setPin = (id: string, change: Partial<Pin>) => update((p) => ({ ...p, pins: p.pins.map((pin) => (pin.id === id ? { ...pin, ...change } : pin)) }));

  if (players)
    return (
      <div className="gm gm-min">
        <button type="button" onClick={() => setPlayers(false)}>
          ✕ {t("gm.leavePlayers")}
        </button>
      </div>
    );
  if (!open)
    return (
      <div className="gm gm-min">
        <button type="button" onClick={() => setOpen(true)}>
          🎲 {t("gm.title")}
        </button>
      </div>
    );
  return (
    <div className="gm">
      <div className="gm-head">
        <b>🎲 {t("gm.title")}</b>
        <button type="button" className="ghost" onClick={() => setOpen(false)} aria-label={t("gm.hide")}>
          ▾
        </button>
      </div>
      <div className="gm-modes">
        {(["inspect", "pin", "reveal", "hide"] as GmMode[]).map((name) => (
          <button key={name} type="button" aria-pressed={mode === name} onClick={() => setMode(name)} disabled={!mapKey || ((name === "reveal" || name === "hide") && !patch.fog.enabled)}>
            {t(`gm.mode.${name}`)}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={patch.fog.enabled} disabled={!mapKey} onChange={(event) => update((p) => ({ ...p, fog: { ...p.fog, enabled: event.target.checked } }))} />
        {t("gm.fog")}
      </label>
      {patch.fog.enabled ? (
        <div className="gm-row">
          <label>
            {t("gm.brush")}
            <input type="range" min={10} max={200} value={brush} onChange={(event) => setBrush(Number(event.target.value))} />
          </label>
          <button type="button" onClick={() => update((p) => ({ ...p, fog: { ...p.fog, revealed: [] } }))}>
            {t("gm.resetFog")}
          </button>
        </div>
      ) : null}
      <button type="button" className="wide" onClick={() => setPlayers(true)}>
        👁 {t("gm.players")}
      </button>

      {selected ? (
        <div className="gm-block">
          <h4>{selected.label}</h4>
          <input
            placeholder={t("gm.rename")}
            value={patch.names[selected.key] ?? ""}
            onChange={(event) =>
              update((p) => {
                const names = { ...p.names };
                if (event.target.value.trim()) names[selected.key] = event.target.value;
                else delete names[selected.key];
                return { ...p, names };
              })
            }
          />
          <textarea placeholder={t("gm.note")} rows={3} value={patch.notes[selected.key] ?? ""} onChange={(event) => update((p) => ({ ...p, notes: { ...p.notes, [selected.key]: event.target.value } }))} />
        </div>
      ) : (
        <p className="muted">{t("gm.selectHint")}</p>
      )}

      {patch.pins.length ? (
        <div className="gm-block">
          <h4>{t("gm.pins")}</h4>
          {patch.pins.map((pin) => (
            <div key={pin.id} className="gm-pin">
              <span className="swatch" style={{ background: pin.color }} onClick={() => setPin(pin.id, { color: COLORS[(COLORS.indexOf(pin.color) + 1) % COLORS.length] })} title={t("gm.color")} />
              <input value={pin.label} placeholder={t("gm.pinLabel")} onChange={(event) => setPin(pin.id, { label: event.target.value })} />
              <button type="button" className="ghost" title={t("gm.hidden")} aria-pressed={pin.hidden} onClick={() => setPin(pin.id, { hidden: !pin.hidden })}>
                {pin.hidden ? "🙈" : "👁"}
              </button>
              <button type="button" className="ghost" title={t("gm.delete")} onClick={() => update((p) => ({ ...p, pins: p.pins.filter((item) => item.id !== pin.id) }))}>
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="gm-row">
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([JSON.stringify(store.file(), null, 1)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "campaign.atlas.json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          }}
        >
          💾 {t("gm.save")}
        </button>
        <button type="button" onClick={() => file.current?.click()}>
          📂 {t("gm.load")}
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (event) => {
            const chosen = event.target.files?.[0];
            if (!chosen) return;
            try {
              const campaign = JSON.parse(await chosen.text()) as Campaign;
              if (campaign.format === "new-world-atlas/campaign") store.replace(campaign);
            } catch {
              // Not a campaign file: ignore it.
            }
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
