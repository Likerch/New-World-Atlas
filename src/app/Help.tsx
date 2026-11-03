// Help: the cheat sheet of keys and mouse moves (opened with ?), and a short tour of the screen on the first visit.
import { useState } from "react";
import type { T } from "./i18n";
import { Modal } from "./Modal";

const KEYS: [string, string][] = [
  ["?", "help.key.help"],
  ["1 … 9", "help.key.levels"],
  ["Ctrl+K, /", "help.key.search"],
  ["Ctrl+Z / Ctrl+Y", "help.key.undo"],
  ["+ / − / 0", "help.key.zoom"],
  ["← ↑ → ↓", "help.key.pan"],
  ["R", "help.key.ruler"],
  ["M", "help.key.minimap"],
  ["Esc", "help.key.escape"],
];
const MOUSE = ["help.mouse.click", "help.mouse.double", "help.mouse.right", "help.mouse.wheel", "help.mouse.drag", "help.mouse.pinch"];

export function CheatSheet({ t, onClose, onTour }: { t: T; onClose: () => void; onTour: () => void }) {
  return (
    <Modal className="cheat" label={t("help.title")} onClose={onClose} dismiss>
      <div className="modal-head">
        <h2>⌨ {t("help.title")}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label={t("action.close")}>
          ✕
        </button>
      </div>
      <table className="figures">
        <tbody>
          {KEYS.map(([keys, label]) => (
            <tr key={label}>
              <td>
                <kbd>{keys}</kbd>
              </td>
              <td>{t(label)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul>
        {MOUSE.map((label) => (
          <li key={label}>{t(label)}</li>
        ))}
      </ul>
      <button type="button" className="primary" onClick={onTour}>
        🧭 {t("help.tour")}
      </button>
    </Modal>
  );
}

const STEPS = ["levels", "map", "inspector", "controls", "gm", "world"] as const;

/** The tour: a card per part of the screen, pointing at it. */
export function Tour({ t, onClose }: { t: T; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  return (
    <Modal className={`tour tour-${STEPS[step]}`} label={t("help.tour")} onClose={onClose}>
      <p className="muted">
        {step + 1} / {STEPS.length}
      </p>
      <h2>{t(`tour.${STEPS[step]}.title`)}</h2>
      <p>{t(`tour.${STEPS[step]}.text`)}</p>
      <div className="row-buttons">
        <button type="button" className="ghost" onClick={onClose}>
          {t("tour.skip")}
        </button>
        {step ? (
          <button type="button" onClick={() => setStep(step - 1)}>
            ← {t("tour.back")}
          </button>
        ) : null}
        <button type="button" className="primary" onClick={() => (last ? onClose() : setStep(step + 1))}>
          {last ? t("tour.done") : `${t("tour.next")} →`}
        </button>
      </div>
    </Modal>
  );
}
