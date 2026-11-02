// The core may import only its own modules and its two small dependencies: no app code, no React, no DOM, no Node
// built-ins. That keeps it usable in the browser, in Node and inside Marinara Worlds.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/core/", import.meta.url));
const allowed = new Set(["delaunator", "simplex-noise"]);
const problems = [];

async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.name.endsWith(".ts")) {
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gu)) {
        const specifier = match[1] ?? match[2];
        if (specifier.startsWith(".")) {
          if (relative(root, join(dir, specifier)).startsWith("..")) problems.push(`${relative(root, path)} reaches outside the core: "${specifier}"`);
        } else if (!allowed.has(specifier)) problems.push(`${relative(root, path)} imports "${specifier}"`);
      }
      if (/\b(document|window|localStorage)\./u.test(source)) problems.push(`${relative(root, path)} touches the DOM`);
    }
  }
}

await scan(root);
if (problems.length) {
  console.error(`The core must stay independent:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("core boundary: ok");
