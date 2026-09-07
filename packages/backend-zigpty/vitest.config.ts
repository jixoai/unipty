import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Workspace-linked dependencies resolve through pnpm symlinks whose
    // realpath sits outside this package root; without aliasing, the vite
    // module runner can externalize them as /@fs/ URLs that Node cannot
    // load (observed on linux CI).
    alias: {
      unipty: fileURLToPath(new URL("../unipty/src/index.ts", import.meta.url)),
      "@unipty/backend": fileURLToPath(new URL("../backend/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.spec.ts"],
    environment: "node",
  },
});
