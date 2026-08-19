/**
> Orthogonal intents (2026-08-20): helper test one-time setup — link the
 * fixture consumer and build the workspace packages that generated modules
 * and the CLI subprocess execute against.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { linkConsumerNodeModules } from "./setup.ts";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const tsdownBin = fileURLToPath(new URL("../../../node_modules/.bin/tsdown", import.meta.url));

function build(packageDir: string): void {
  const result = spawnSync(tsdownBin, {
    cwd: `${repoRoot}packages/${packageDir}`,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Failed to build packages/${packageDir} for helper tests`);
  }
}

export function setup(): void {
  linkConsumerNodeModules();
  // Generated modules import "@unipty/backend" and the CLI subprocess runs
  // the built bin, so both dist outputs (and Core's) must be current.
  build("unipty");
  build("backend");
  build("helper-backend");
}
