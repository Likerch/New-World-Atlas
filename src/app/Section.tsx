// A part of a side panel that folds away under its heading; whether it is open is remembered in this browser.
import { useState, type ReactNode } from "react";

export function Section({ id, title, open = true, children }: { id: string; title: string; open?: boolean; children: ReactNode }) {
  const key = `atlas.section.${id}`;
  const [shown, setShown] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? open : saved === "1";
    } catch {
      return open;
    }
  });
  return (
    <details
      className="section"
      open={shown}
      onToggle={(event) => {
        const now = event.currentTarget.open;
        setShown(now);
        try {
          localStorage.setItem(key, now ? "1" : "0");
        } catch {
          // A private window: the section just opens as it did.
        }
      }}
    >
      <summary>
        <h2>{title}</h2>
      </summary>
      {children}
    </details>
  );
}
