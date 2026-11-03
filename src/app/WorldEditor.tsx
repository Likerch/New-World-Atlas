// The world editor's panel on the planet level: the tool a click on the map uses (relief brush, realm paint, moving,
// founding and razing towns), its brush, undo and reset.
import type { Planet, PlanetEdits } from "../core/index";
import type { T } from "./i18n";

export type EditTool = "raise" | "lower" | "paint" | "move" | "add" | "remove";
const TOOLS: EditTool[] = ["raise", "lower", "paint", "move", "add", "remove"];

interface Props {
  t: T;
  nm: (name: string) => string;
  planet: Planet;
  edits: PlanetEdits | null;
  tool: EditTool | null;
  setTool: (tool: EditTool | null) => void;
  brush: { radius: number; strength: number };
  setBrush: (brush: { radius: number; strength: number }) => void;
  realm: number;
  setRealm: (realm: number) => void;
  /** The town picked up by the move tool. */
  moving: number | null;
  canUndo: boolean;
  onUndo: () => void;
  onReset: () => void;
}

export function WorldEditor({ t, nm, planet, edits, tool, setTool, brush, setBrush, realm, setRealm, moving, canUndo, onUndo, onReset }: Props) {
  const towns = edits ? Object.keys(edits.moved).length + edits.added.length + edits.removed.length : 0;
  return (
    <details className="editor" onToggle={(event) => !(event.currentTarget as HTMLDetailsElement).open && setTool(null)}>
      <summary>✏️ {t("editor.title")}</summary>
      <div className="floor-tabs">
        {TOOLS.map((id) => (
          <button key={id} type="button" aria-pressed={tool === id} onClick={() => setTool(tool === id ? null : id)}>
            {t(`editor.tool.${id}`)}
          </button>
        ))}
      </div>
      {tool === "raise" || tool === "lower" || tool === "paint" ? (
        <label>
          {t("editor.radius")}
          <input type="range" min={15} max={200} value={brush.radius} onChange={(event) => setBrush({ ...brush, radius: Number(event.target.value) })} />
        </label>
      ) : null}
      {tool === "raise" || tool === "lower" ? (
        <label>
          {t("editor.strength")}
          <input type="range" min={2} max={30} value={brush.strength} onChange={(event) => setBrush({ ...brush, strength: Number(event.target.value) })} />
        </label>
      ) : null}
      {tool === "paint" ? (
        <label>
          {t("editor.realm")}
          <select value={realm} onChange={(event) => setRealm(Number(event.target.value))}>
            {planet.states.slice(1).map((state) => (
              <option key={state.id} value={state.id}>
                {nm(state.name)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {tool ? <p className="muted">{moving !== null ? t("editor.hint.moving", { name: nm(planet.burgs[moving].name) }) : t(`editor.hint.${tool}`)}</p> : null}
      {edits ? <p className="muted">{t("editor.summary", { terrain: edits.terrain.length, owners: Object.keys(edits.owners).length, towns })}</p> : null}
      <div className="gm-row">
        <button type="button" disabled={!canUndo} onClick={onUndo}>
          ↶ {t("editor.undo")}
        </button>
        <button type="button" disabled={!edits} onClick={onReset}>
          {t("editor.reset")}
        </button>
      </div>
    </details>
  );
}
