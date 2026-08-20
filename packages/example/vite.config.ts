import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    // The worker never runs in the browser; keep bundlers away from it.
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
});
