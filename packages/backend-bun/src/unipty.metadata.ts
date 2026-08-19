/**
> Orthogonal intents (2026-08-20): @unipty/backend-bun side-effect-free
> Backend Metadata Protocol export.
>
> Package identity comes from the package-local `#package.json` import alias.
> Module evaluation constructs no terminal, imports no Backend entry module,
 * and never executes a package-scoped resolver such as
 * `import.meta.resolve("#index")`: bundling may move this module outside its
 * original package scope while preserving such an expression.
 */

import type { UniPtyBackendMetadata } from "@unipty/backend";
import pkg from "#package.json" with { type: "json" };

/**
 * Static metadata for the official Bun Backend.
 *
 * Target declarations are a runtime-level prefilter only: they imply neither
 * native loadability, Backend readiness, nor verified support. Verified
 * support claims come exclusively from the repository-owned Official Catalog.
 */
const metadata: UniPtyBackendMetadata = {
  schema: 1,
  package: { name: pkg.name, version: pkg.version },
  backend: { id: "bun", factoryExport: "createBunBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "bun" }],
  provenance: { kind: "runtime-native", substrate: "Bun.Terminal" },
};

export default Object.freeze(metadata);
