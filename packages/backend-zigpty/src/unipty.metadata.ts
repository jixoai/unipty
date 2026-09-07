/**
> Orthogonal intents (2026-09-07): @unipty/backend-zigpty side-effect-free
> Metadata Protocol export.
>
> Original request (2026-09-07): official Backends declare identity and
> prefiltering targets without loading native code. This module evaluates
> only static data: package identity comes from the package-local
> `#package.json` alias, and no Backend entry, native addon, or
> package-scoped resolver is ever touched here.
 */

import type { UniPtyBackendMetadata } from "@unipty/backend";
import pkg from "#package.json" with { type: "json" };

/**
 * Metadata for the official zigpty route. The substrate is third-party
 * `zigpty` (Zig-built NAPI prebuilds bundled in the npm tarball); the
 * Backend identity and provenance must never claim a native Node runtime
 * PTY API. Targets declare the runtime level only — `os`/`arch` stay open
 * and evidence gating (not this declaration) limits verified-support claims.
 */
const metadata: UniPtyBackendMetadata = {
  schema: 1,
  package: {
    name: pkg.name,
    version: pkg.version,
  },
  backend: {
    id: "zigpty",
    factoryExport: "createZigptyBackend",
  },
  protocol: {
    core: [1],
  },
  targets: [{ runtime: "node" }],
  provenance: {
    kind: "third-party",
    substrate: "zigpty (Zig-built NAPI prebuilds bundled in the npm tarball)",
  },
};

export default metadata;
