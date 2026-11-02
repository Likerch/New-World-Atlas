// Runs every tests/*.regression.ts with tsx; stops at the first failure.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const dir = fileURLToPath(new URL("../tests/", import.meta.url));
for (const name of readdirSync(dir).filter((file) => file.endsWith(".regression.ts")).sort()) {
  const result = spawnSync(process.execPath, ["--import", "tsx", join(dir, name)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
