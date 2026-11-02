// Bundles the core into one ES module (dependencies included) for other projects such as Marinara Worlds.
import { build } from "esbuild";

await build({
  entryPoints: ["src/core/index.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  outfile: "dist/lib/new-world-atlas-core.mjs",
  legalComments: "inline",
});
console.log("Built dist/lib/new-world-atlas-core.mjs");
