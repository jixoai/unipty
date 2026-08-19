import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/unipty.metadata.ts"],
  format: "esm",
  // Neutral (matching the sibling packages) emits `.js`/`.d.ts` outputs that
  // match package.json `exports`; `platform: "node"` makes tsdown switch to
  // `.mjs`/`.d.mts`, which would break the published subpaths.
  platform: "neutral",
  dts: true,
  sourcemap: true,
  target: "es2023",
  unbundle: true,
  // The substrate stays a runtime import (its prebuilt native addon must not
  // be bundled), and `#package.json` stays a package-local alias so metadata
  // identity is resolved by the installed package tree, not snapshotted.
  external: ["@lydell/node-pty", "#package.json"],
});
