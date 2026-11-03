// A modal window on the browser's own <dialog>: it keeps focus inside, Esc closes the topmost one, and the page
// behind is inert. `dismiss` also closes it on a click outside (for a search, not for a form being filled in).
import { useEffect, useRef, type ReactNode } from "react";

export function Modal({ label, className = "", onClose, dismiss = false, children }: { label: string; className?: string; onClose: () => void; dismiss?: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${className}`.trim()}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (dismiss && event.target === dialog.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
