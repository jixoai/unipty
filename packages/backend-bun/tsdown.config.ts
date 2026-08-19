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
  // `#package.json` stays a package-local alias so metadata identity is
  // resolved by the installed package tree, not snapshotted into the output.
  external: ["#package.json"],
});
