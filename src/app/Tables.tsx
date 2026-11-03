// A planet's figures as tables and bars: realms, peoples, faiths and the largest towns, sortable by any column.
import { Modal } from "./Modal";
import { useState } from "react";
import type { Planet } from "../core/index";
import { area, people } from "./format";
import type { T } from "./i18n";

type Row = { name: string; color?: string; values: number[] };

function Table({ t, columns, rows, show }: { t: T; columns: string[]; rows: Row[]; show: ((value: number) => string)[] }) {
  const [by, setBy] = useState(1);
  const sorted = [...rows].sort((a, b) => (by === 0 ? a.name.localeCompare(b.name) : b.values[by - 1] - a.values[by - 1]));
  const top = Math.max(1, ...rows.map((row) => row.values[Math.max(0, by - 1)]));
  return (
    <table className="figures">
      <thead>
        <tr>
          {[t("table.name"), ...columns].map((column, k) => (
            <th key={column} aria-sort={by === k ? "descending" : undefined} onClick={() => setBy(k)}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.name}>
            <td>
              {row.color ? <span className="swatch" style={{ background: row.color }} /> : null}
              {row.name}
            </td>
            {row.values.map((value, k) => (
              <td key={k}>
                {k === Math.max(0, by - 1) ? <span className="bar" style={{ width: `${Math.round((value / top) * 100)}%` }} /> : null}
                <span>{show[k](value)}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Tables({ t, nm, planet, onClose }: { t: T; nm: (name: string) => string; planet: Planet; onClose: () => void }) {
  const [tab, setTab] = useState<"realms" | "peoples" | "faiths" | "towns">("realms");
  const count = (value: number) => Math.round(value).toLocaleString(t.locale);
  const living = planet.burgs.filter((burg) => burg.id && !burg.removed);
  return (
    <Modal className="tables" label={t("table.title")} onClose={onClose}>
      <div className="modal-head">
        <h2>📊 {t("table.title")}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label={t("action.close")}>
          ✕
        </button>
      </div>
      <nav className="tabs">
        {(["realms", "peoples", "faiths", "towns"] as const).map((name) => (
          <button key={name} type="button" aria-pressed={tab === name} onClick={() => setTab(name)}>
            {t(`table.${name}`)}
          </button>
        ))}
      </nav>
      {tab === "realms" ? (
        <Table
          t={t}
          columns={[t("stat.population"), t("stat.area"), t("stat.burgs")]}
          show={[(value) => people(value, t), (value) => area(value, t), count]}
          rows={planet.states.slice(1).filter((state) => state.cells).map((state) => ({ name: t(`form.${state.formKey}`, { name: nm(state.name) }), color: state.color, values: [state.rural + state.urban, state.area, state.burgs] }))}
        />
      ) : tab === "peoples" ? (
        <Table t={t} columns={[t("stat.population"), t("stat.cells")]} show={[(value) => people(value, t), count]} rows={planet.cultures.slice(1).filter((item) => item.cells).map((item) => ({ name: nm(item.name), color: item.color, values: [item.population, item.cells] }))} />
      ) : tab === "faiths" ? (
        <Table t={t} columns={[t("religion.followers"), t("stat.area")]} show={[(value) => people(value, t), (value) => area(value, t)]} rows={planet.religions.slice(1).filter((item) => item.cells).map((item) => ({ name: nm(item.name), color: item.color, values: [item.followers, item.area] }))} />
      ) : (
        <Table
          t={t}
          columns={[t("stat.population")]}
          show={[(value) => people(value, t)]}
          rows={[...living].sort((a, b) => b.population - a.population).slice(0, 60).map((burg) => ({ name: `${burg.capital ? "★ " : ""}${nm(burg.name)}`, color: planet.states[burg.state]?.color, values: [burg.population] }))}
        />
      )}
    </Modal>
  );
}
