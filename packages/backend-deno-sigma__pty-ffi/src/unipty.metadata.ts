/**
 * > Orthogonal intents (2026-08-20): @unipty/backend-deno-sigma__pty-ffi
 * side-effect-free Metadata Protocol export.
 *
 * Original request (2026-08-17): official Backends declare identity and
 * prefiltering targets without loading native code. This module evaluates only
 * static data: package identity comes from the package-local `#package.json`
 * alias, and no Backend entry, FFI library, vendored asset, or package-scoped
 * resolver is ever touched here.
 */

import type { UniPtyBackendMetadata } from "@unipty/backend";
import pkg from "#package.json" with { type: "json" };

/**
 * Metadata for the official Deno route. The substrate is third-party
 * `@sigma/pty-ffi` over the Rust `portable-pty` crate; Deno is the runtime
 * this route targets, not the implementation identity, and this declaration
 * never claims a native Deno runtime PTY API. Targets declare the runtime
 * level only — `os`/`arch` stay open and evidence gating (not this
 * declaration) limits verified-support claims.
 */
const metadata: UniPtyBackendMetadata = {
  schema: 1,
  package: {
    name: pkg.name,
    version: pkg.version,
  },
  backend: {
    id: "deno-sigma__pty-ffi",
    factoryExport: "createDenoSigmaPtyFfiBackend",
  },
  protocol: {
    core: [1],
  },
  targets: [{ runtime: "deno" }],
  provenance: {
    kind: "third-party",
    substrate: "@sigma/pty-ffi (Rust portable-pty)",
  },
};

export default metadata;
