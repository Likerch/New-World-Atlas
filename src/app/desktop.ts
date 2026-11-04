// The Atlas runs in a browser and as a Windows app (Tauri, see src-tauri). What a browser does for a page and the app's
// window does not: saving a file where the GM chooses, and printing a page made on the fly.

/** Inside the Windows app: Tauri's bridge is there. */
export const desktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Saves a file: in the browser as a download, in the app through the system's "Save as" window. */
export async function saveFile(name: string, data: Blob | string, type = "application/octet-stream"): Promise<void> {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  if (desktop) {
    // The app's own command (src-tauri/src/main.rs), not Tauri's dialog plugin: that one swaps the page's confirm()
    // for an asynchronous one whose promise always reads as "yes".
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("save_file", new Uint8Array(await blob.arrayBuffer()), { headers: { "x-name": encodeURIComponent(name) } });
    } catch (error) {
      alert(String(error));
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Prints a page made on the fly (the atlas book, a house's key, a system's card) from a hidden frame: no window is
 * opened, which pop-up blockers and the app's window would refuse. */
export function printPage(html: string) {
  document.querySelector("iframe.print-frame")?.remove();
  const frame = document.createElement("iframe");
  frame.className = "print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) return;
    // The print window heads the pages, and names the PDF, by the app's title: the printed page's own, while it prints.
    const title = document.title;
    document.title = view.document.title || title;
    view.addEventListener("afterprint", () => {
      document.title = title;
      frame.remove();
    });
    view.focus();
    view.print();
  };
  frame.srcdoc = html;
  document.body.append(frame);
}
