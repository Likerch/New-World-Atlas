// Search across the world (Ctrl+K): the things of the map on screen, the world's maps, pages, names and notes.
import { useEffect, useRef, useState } from "react";
import { searchWorld, type Found, type WorldDoc } from "../core/index";
import type { T } from "./i18n";
import { useEscape } from "./keys";
import type { Hit } from "./levels/types";

export function Search({ t, world, here, onFound, onClose }: { t: T; world: WorldDoc; here: ((query: string) => Hit[]) | undefined; onFound: (found: Found) => void; onClose: () => void }) {
  useEscape(onClose);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  const local = query.trim() ? (here?.(query) ?? []).slice(0, 25) : [];
  const found = searchWorld(world, query);
  const all: { label: string; detail: string; icon: string; go: () => void }[] = [
    ...local.map((hit) => ({ label: hit.label, detail: hit.detail, icon: "📍", go: hit.select })),
    ...found.map((item) => ({ label: item.label, detail: item.context, icon: { page: "📖", map: "🗺", name: "✎", note: "📝" }[item.kind], go: () => onFound(item) })),
  ];
  const choose = (index: number) => {
    const item = all[index];
    if (!item) return;
    item.go();
    onClose();
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal search-box" role="dialog" aria-modal="true" aria-label={t("search.title")} onClick={(event) => event.stopPropagation()}>
        <input
          ref={field}
          className="search"
          value={query}
          placeholder={t("search.hint")}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") setCursor(Math.min(all.length - 1, cursor + 1));
            else if (event.key === "ArrowUp") setCursor(Math.max(0, cursor - 1));
            else if (event.key === "Enter") choose(cursor);
            else return;
            event.preventDefault();
          }}
        />
        <ul className="list">
          {all.map((item, index) => (
            <li key={index} aria-selected={index === cursor} onClick={() => choose(index)}>
              <span>{item.icon}</span>
              <span className="grow">
                <b>{item.label}</b>
                <small className="line">{item.detail}</small>
              </span>
            </li>
          ))}
        </ul>
        {query.trim() && !all.length ? <p className="muted">{t("search.nothing")}</p> : null}
      </div>
    </div>
  );
}
