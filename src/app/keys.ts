// Keyboard helpers: Esc closes a dialog; the rows of every list can be reached with Tab and picked with Enter or Space.
import { useEffect } from "react";

export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

export function useListKeys() {
  useEffect(() => {
    const mark = () => document.querySelectorAll(".list li:not([tabindex])").forEach((row) => row.setAttribute("tabindex", "0"));
    const watcher = new MutationObserver(mark);
    watcher.observe(document.body, { childList: true, subtree: true });
    mark();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = (event.target as Element | null)?.closest?.(".list li");
      if (!row || row !== event.target) return;
      event.preventDefault();
      (row as HTMLElement).click();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      watcher.disconnect();
      document.removeEventListener("keydown", onKey);
    };
  }, []);
}
