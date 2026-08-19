import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/unipty.metadata.ts"],
  format: "esm",
  platform: "neutral",
  dts: true,
  sourcemap: true,
  target: "es2023",
  unbundle: true,
  // `#package.json` is the package-local metadata alias and must survive into
  // dist as-is (resolved at runtime via package.json#imports); `unipty` is a
  // workspace dependency that stays external.
  external: ["#package.json", "unipty"],
});
