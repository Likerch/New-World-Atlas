// The GM panel over the map: what a click does (inspect, drop a pin, reveal through the fog), the fog itself, the
// selected thing's new name and notes, the pins, the players' view, and the campaign file.
import { useRef, useState } from "react";
import { readCampaign, type MapPatch, type Pin } from "../core/index";
import type { CampaignStore } from "./campaign";
import type { T } from "./i18n";

export type GmMode = "inspect" | "pin" | "reveal" | "hide";

interface Props {
  t: T;
  store: CampaignStore;
  mapKey: string | null;
  /** Where pins and fog of the view go; null when the view takes none. */
  sheetKey: string | null;
  selected: { key: string; label: string } | null;
  /** Opens the handbook page of the selected thing. */
  onPage?: () => void;
  /** Copies the selected thing's description. */
  onCopy?: () => void;
  mode: GmMode;
  setMode: (mode: GmMode) => void;
  brush: number;
  setBrush: (size: number) => void;
  players: boolean;
  setPlayers: (players: boolean) => void;
}

const COLORS = ["#d64545", "#2f7fd0", "#2e9e5b", "#c98a1a", "#8a4fc9", "#1d1d1d"];

export function GmPanel({ t, store, mapKey, sheetKey, selected, onPage, onCopy, mode, setMode, brush, setBrush, players, setPlayers }: Props) {
  const [open, setOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  // Names and notes belong to the map; pins and fog to the sheet on screen.
  const patch: MapPatch = store.patch(mapKey);
  const update = (change: (p: MapPatch) => MapPatch) => store.update(mapKey, change);
  const sheet: MapPatch = store.patch(sheetKey);
  const updateSheet = (change: (p: MapPatch) => MapPatch) => store.update(sheetKey, change);
  const setPin = (id: string, change: Partial<Pin>) => updateSheet((p) => ({ ...p, pins: p.pins.map((pin) => (pin.id === id ? { ...pin, ...change } : pin)) }));

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
          <button key={name} type="button" aria-pressed={mode === name} onClick={() => setMode(name)} disabled={name !== "inspect" && (!sheetKey || ((name === "reveal" || name === "hide") && !sheet.fog.enabled))}>
            {t(`gm.mode.${name}`)}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={sheet.fog.enabled} disabled={!sheetKey} onChange={(event) => updateSheet((p) => ({ ...p, fog: { ...p.fog, enabled: event.target.checked } }))} />
        {t("gm.fog")}
      </label>
      {mapKey && !sheetKey ? <p className="muted">{t("gm.flatOnly")}</p> : null}
      {sheet.fog.enabled ? (
        <div className="gm-row">
          <label>
            {t("gm.brush")}
            <input type="range" min={10} max={200} value={brush} onChange={(event) => setBrush(Number(event.target.value))} />
          </label>
          <button type="button" onClick={() => updateSheet((p) => ({ ...p, fog: { ...p.fog, revealed: [] } }))}>
            {t("gm.resetFog")}
          </button>
        </div>
      ) : null}
      <button type="button" className="wide" onClick={() => setPlayers(true)}>
        👁 {t("gm.players")}
      </button>

      {selected ? (
        <div className="gm-block">
          <div className="row-buttons">
            <h4 className="grow">{selected.label}</h4>
            {onPage ? (
              <button type="button" className="ghost" onClick={onPage} title={t("book.page")}>
                📖
              </button>
            ) : null}
            {onCopy ? (
              <button type="button" className="ghost" onClick={onCopy} title={t("book.copy")}>
                📋
              </button>
            ) : null}
          </div>
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

      {sheet.pins.length ? (
        <div className="gm-block">
          <h4>{t("gm.pins")}</h4>
          {sheet.pins.map((pin) => (
            <div key={pin.id} className="gm-pin">
              <span className="swatch" style={{ background: pin.color }} onClick={() => setPin(pin.id, { color: COLORS[(COLORS.indexOf(pin.color) + 1) % COLORS.length] })} title={t("gm.color")} />
              <input value={pin.label} placeholder={t("gm.pinLabel")} onChange={(event) => setPin(pin.id, { label: event.target.value })} />
              <button type="button" className="ghost" title={t("gm.hidden")} aria-pressed={pin.hidden} onClick={() => setPin(pin.id, { hidden: !pin.hidden })}>
                {pin.hidden ? "🙈" : "👁"}
              </button>
              <button type="button" className="ghost" title={t("gm.delete")} onClick={() => updateSheet((p) => ({ ...p, pins: p.pins.filter((item) => item.id !== pin.id) }))}>
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
              store.replace(readCampaign(JSON.parse(await chosen.text())));
            } catch {
              alert(t("gm.badFile"));
            }
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
