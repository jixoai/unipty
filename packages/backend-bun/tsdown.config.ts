import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/unipty.metadata.ts"],
  format: "esm",
  platform: "bun",
  dts: true,
  sourcemap: true,
  target: "es2023",
  unbundle: true,
});
