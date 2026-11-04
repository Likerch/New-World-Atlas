import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** The build's own files, listed for the service worker to keep at install: the Atlas then opens offline after one visit. */
function precache(): Plugin {
  return {
    name: "atlas-precache",
    apply: "build",
    generateBundle(_, bundle) {
      this.emitFile({ type: "asset", fileName: "precache.json", source: JSON.stringify(Object.keys(bundle).filter((file) => !file.endsWith(".map"))) });
    },
  };
}

export default defineConfig({
  plugins: [react(), precache()],
  // The Windows app's Rust build (src-tauri/target) is not the page's: watching it crashes on locked files.
  server: { port: 5173, watch: { ignored: ["**/src-tauri/**"] } },
});
