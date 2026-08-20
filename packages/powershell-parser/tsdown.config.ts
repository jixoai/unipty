import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  dts: true,
  sourcemap: true,
  target: "es2023",
  unbundle: true,
});
