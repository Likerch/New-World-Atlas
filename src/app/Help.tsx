// Help: the cheat sheet of keys and mouse moves (opened with ?), with the way to the lessons (Coach.tsx).
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

export function CheatSheet({ t, onClose, onLessons }: { t: T; onClose: () => void; onLessons: () => void }) {
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
      <button type="button" className="primary" onClick={onLessons}>
        🎓 {t("help.lessons")}
      </button>
    </Modal>
  );
}
