import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./app.css";
import { desktop } from "./desktop";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installed as an app and opened without the network: the service worker keeps the built page (not during development,
// where it would hold on to stale modules, nor in the Windows app, which carries the page itself).
if (import.meta.env.PROD && !desktop && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => undefined));
}
