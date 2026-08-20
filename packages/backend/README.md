# @unipty/backend

Backend acquisition convenience: caller-rooted pure resolution, side-effect-free
metadata inspection, deterministic AutoResolve, and the explicit bundle-manifest
constructor. This is a convenience layer — never Core fallback and never a
second plugin registry.

English | [简体中文](../../README-zh.md#包一览) · [Workspace root](../../README.md)

## The staged contract

```text
resolveUniPtyBackend(pkg, { from })   → locations only; no imports, no output
inspectUniPtyBackend(resolution)      → metadata import + validation only
autoResolveUniPtyBackend(options)     → selected candidate: import + factory + ready
```

### Pure resolution

```ts
import { resolveUniPtyBackend } from "@unipty/backend";

const report = await resolveUniPtyBackend("@unipty/backend-bun", {
  from: import.meta.url, // caller-owned base; required
});
if (report.status === "resolved") {
  report.packageUrl; // package entry location
  report.metadataUrl; // ./unipty.metadata location (absent → metadata-missing later)
}
```

Never imports modules, never scans `node_modules`, never writes output.
Resolution runs on the host runtime's native resolver
(`node:module` `createRequire` rooted at `from` — verified on Node, Bun, Deno).

### Metadata-only inspection

```ts
import { inspectUniPtyBackend } from "@unipty/backend";

const inspection = await inspectUniPtyBackend(report); // accepts ONLY a resolved report
// → "compatible" | "incompatible" | "metadata-missing" | "metadata-invalid"
```

Imports the metadata subpath only — never the Backend entry, never a factory.
Compatibility checks the declared `protocol.core` majors against
`UNIPTY_CORE_PROTOCOL_MAJOR` and prefilters targets by runtime/OS/arch.

### AutoResolve

```ts
import { autoResolveUniPtyBackend } from "@unipty/backend";

const backend = await autoResolveUniPtyBackend({
  candidates: ["@unipty/backend-node-pty", "@unipty/backend-bun"], // ordered
  from: import.meta.url,
  onWarning: (w) => console.warn(w.code, w.packageName, w.stage),
});
```

- Explicit candidates process in caller order (first compatible wins).
  Unavailable configured candidates emit a structured
  `candidate-unavailable` warning (default sink: `console.warn`).
- With no selection, fallback candidates derive from the consumer's
  `package.json` dependencies — exactly one compatible result is required,
  multiple reject as `ambiguous`. Priority is never inferred from
  dependency or filesystem order.
- Once a candidate is selected, its import / factory-export / factory-call /
  readiness failures reject with a structured `backend-initialization`
  error preserving package, stage, inspection report, and cause — AutoResolve
  never silently tries the next Backend.

### Explicit bundle manifest

Bundlers cannot reliably collect arbitrary dynamic imports, so bundled
deployments register candidates statically:

```ts
import { defineUniPtyBackendManifest, autoResolveUniPtyBackend } from "@unipty/backend";
import metadata0 from "@unipty/backend-node-pty/unipty.metadata";

const manifest = defineUniPtyBackendManifest({
  entries: [
    {
      packageName: "@unipty/backend-node-pty",
      metadata: metadata0,
      load: () => import("@unipty/backend-node-pty"), // literal specifier
    },
  ],
});

const backend = await autoResolveUniPtyBackend({
  manifest,
  candidates: ["@unipty/backend-node-pty"],
});
```

Validation rejects empty sets, duplicates, metadata/package mismatches,
missing factory exports, and non-callable loaders — without invoking any
loader. With a manifest, AutoResolve performs no filesystem resolution at
all. Generate modules with [`@unipty/helper-backend`](../helper-backend/README.md).

## Metadata protocol (for Backend authors)

Official Backends expose a side-effect-free `./unipty.metadata` subpath
default-exporting:

```ts
type UniPtyBackendMetadata = {
  readonly schema: 1;
  readonly package: { readonly name: string; readonly version: string };
  readonly backend: { readonly id: string; readonly factoryExport: string };
  readonly protocol: { readonly core: readonly number[] }; // e.g. [1]
  readonly targets: readonly {
    readonly runtime: "node" | "bun" | "deno";
    readonly os?: readonly string[];
    readonly arch?: readonly string[];
    readonly libc?: readonly string[];
  }[];
  readonly provenance?: {
    readonly kind: "runtime-native" | "third-party" | "external-system";
    readonly substrate: string;
  };
};
```

Metadata never claims maturity, verification, capabilities, assets, or
official status — those are release-catalog facts, and this validator
rejects such fields. `./unipty.metadata` is a UniPty protocol, not a general
npm discovery standard; third-party packages may omit it (they stay manually
acquirable, and manifest entries can still select them).

## Testing

```sh
pnpm --filter @unipty/backend test   # 66 scenarios over 19 fixture packages
```
