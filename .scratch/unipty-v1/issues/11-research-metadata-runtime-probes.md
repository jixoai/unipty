# Metadata Runtime And Bundle Probes

Type: research  
Status: resolved

> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai): runtime metadata
> compatibility; deferred-loader bundling; package-scope counterexample;
> evidence boundary.
>
> Original request (2026-08-19 Asia/Shanghai): use a reproducible local npm
> fixture to verify `./unipty.metadata`, package-local imports, JSON import
> syntax, `import.meta.resolve`, and side-effect-free metadata loading on Node,
> Bun, and Deno; then test the generated-manifest shape under bundling. Do not
> modify product code.

Part of: [UniPty v1 Wayfinder Map](../map.md)

## Result

One persistent probe now establishes two separate boundaries:

```text
unbundled package scope                   bundled consumer scope

#package.json ----> metadata              static metadata ----> manifest
#index -----------> private self-check                         |
                                                              +-> deferred load
                                                                  0 -> 1

metadata-time import.meta.resolve("#index") -- bundle --> runtime failure
```

Runtime observations:

| Runtime      | root + metadata `exports` | static `#package.json` | unbundled private `#index` | metadata entry loads | final entry loads |
| ------------ | ------------------------- | ---------------------- | -------------------------- | -------------------- | ----------------- |
| Node 24.19.0 | pass                      | pass                   | pass                       | `0`                  | `1`               |
| Bun 1.3.14   | pass                      | pass                   | pass                       | `0`                  | `1`               |
| Deno 2.9.5   | pass                      | pass                   | pass                       | `0`                  | `1`               |

Generated-manifest shape under code-splitting:

| Bundler/runtime | metadata evaluation | before deferred `load()` | after deferred `load()` | Backend export |
| --------------- | ------------------- | ------------------------ | ----------------------- | -------------- |
| Bun 1.3.14      | pass                | `0`                      | `1`                     | `true`         |
| Deno 2.9.5      | pass                | `0`                      | `1`                     | `true`         |

The positive bundle probe uses the agreed generated-module structure: one
static default import from `./unipty.metadata` and one literal dynamic import
inside `load()`. It proves that these two bundlers preserve deferred Backend
entry evaluation for this JavaScript fixture. It does not prove native addon or
FFI asset externalization.

The Bun counterexample builds successfully, but evaluating the output fails:

```text
Cannot find package '#index'
```

Its metadata module executed `import.meta.resolve("#index")`. Bun preserved the
expression while moving the module into the consumer bundle, where the
Backend package's private `imports` scope no longer applied. This is direct
evidence for banning package-scoped resolver execution during metadata module
evaluation.

## Repository Artifact

The reproducible probe is:

[`../probes/metadata-runtime-probe.sh.ts`](../probes/metadata-runtime-probe.sh.ts)

Run it from the repository root:

```sh
bun run .scratch/unipty-v1/probes/metadata-runtime-probe.sh.ts
```

The script creates an isolated temporary package under the host's temporary
directory, runs every probe, emits structured JSON, and removes the fixture in
a `finally` block. It does not install packages or modify product code.

## Fixture

The script creates this relevant shape:

```text
<temp>/
├── bundle-entry.mjs
├── manifest.mjs
├── probe.mjs
├── unsafe-bundle-entry.mjs
└── node_modules/@probe/unipty-backend/
    ├── package.json
    ├── index.js
    ├── probe.selfcheck.js
    ├── unipty.metadata.js
    └── unsafe.unipty.metadata.js
```

The package maps public and private subpaths independently:

```json
{
  "exports": {
    ".": "./index.js",
    "./probe.selfcheck": "./probe.selfcheck.js",
    "./unipty.metadata": "./unipty.metadata.js"
  },
  "imports": {
    "#package.json": "./package.json",
    "#index": "./index.js"
  }
}
```

The ordinary metadata module statically imports `#package.json` with
`with { type: "json" }`; it does not resolve or import `#index`. The separate
package-private self-check resolves `#index` only while running from its
original unbundled package scope. The Backend entry increments a global symbol
counter, making accidental eager evaluation observable.

The positive manifest is equivalent to:

```js
import metadata from "@probe/unipty-backend/unipty.metadata";

export default {
  entries: [
    {
      packageName: metadata.package.name,
      metadata,
      load: () => import("@probe/unipty-backend"),
    },
  ],
};
```

The unsafe metadata variant differs at the critical boundary:

```js
export default {
  indexUrl: import.meta.resolve("#index"),
};
```

## Commands And Observations

The script executes the runtime fixture as follows:

```sh
node probe.mjs
bun run probe.mjs
deno run --allow-read=<fixture> --node-modules-dir=manual probe.mjs
```

For each runtime, `packageUrl`, `metadataUrl`, the runtime-native resolution
observation, and the package-private self-check all pointed to the expected
fixture files. The structured result then reported:

```json
{
  "metadataPackageName": "@probe/unipty-backend",
  "metadataEntryLoads": 0,
  "finalEntryLoads": 1,
  "backendProbe": true
}
```

The bundle steps are:

```sh
bun build --target=bun --format=esm --splitting --outdir=<bun-out> bundle-entry.mjs
deno bundle --code-splitting --node-modules-dir=manual --no-lock --outdir <deno-out> bundle-entry.mjs
```

Both emitted programs reported:

```json
{
  "entryLoadsBeforeLoad": 0,
  "finalEntryLoads": 1,
  "backendProbe": true
}
```

The unsafe Bun build used the same options, succeeded, and then failed during
output evaluation with the package-scope diagnostic above. The probe treats a
successful unsafe run, or a failure unrelated to `#index`, as a probe failure.

A separate syntax comparison during the same research established that
`with { type: "json" }` works on all three exact runtime versions. The legacy
`assert { type: "json" }` form worked on Bun 1.3.14 but was rejected by Node
24.19.0 and Deno 2.9.5. The official template therefore uses `with`; the
persistent script guards the accepted form and does not retain the obsolete
syntax as a product fixture.

## Facts

1. These exact Node, Bun, and Deno versions honor the package `exports` map for
   the Backend root and `./unipty.metadata` in this local npm-layout fixture.
2. Static package identity through `#package.json` works in all three runtimes
   without evaluating the Backend entry.
3. `#index` resolves from an unbundled module inside the declaring package. It
   is package-private and is not a consumer discovery contract.
4. Importing metadata leaves the Backend entry counter at `0`; explicitly
   importing the root entry advances it to `1`.
5. Bun and Deno code-splitting preserve the manifest's static metadata and
   deferred literal Backend loader boundary for this fixture.
6. Bun bundling can preserve a package-scoped resolver expression after moving
   it outside the declaring package scope, producing a runtime failure.

## Architecture Consequences

- Official Backend metadata may statically import normalized package identity
  through package-local `#package.json`, or use equivalent build-time
  normalization when a toolchain cannot preserve that form.
- Metadata evaluation must never execute `import.meta.resolve("#index")` or
  another package-scoped resolver. `#index` is optional unbundled package
  self-observation only; it is not metadata, a build hook, or a manifest field.
- The public protocol surface remains only the exported
  `./unipty.metadata` subpath. Private `imports` aliases are implementation
  details.
- Generated manifests retain static metadata imports and literal deferred
  Backend imports. They do not embed physical package paths or metadata-time
  entry resolution.
- `resolve`, metadata import, Backend entry import, factory invocation, and
  readiness remain distinct evidence stages. None proves PTY contract support.

## Limitations

- The host is macOS arm64 (`Darwin 25.5.0`); this does not establish Windows,
  Linux, libc, or alternate architecture behavior.
- Deno uses local `node_modules` compatibility mode and an explicit read
  permission. Deno project import maps, `npm:` cache-only packages, and remote
  resolution remain separate paths.
- The positive bundle matrix covers Bun and Deno source bundlers only. It does
  not cover host tools such as Vite, esbuild, Rollup, or tsdown.
- The bundle uses JavaScript-only fixtures. Native addon, FFI library, dylib,
  external binary, and package externalization behavior were not established by
  this probe; issue 13 subsequently resolved their architecture ownership with
  separate real-spawn probes.
- The Bun counterexample proves this failure mode, not that every bundler fails
  identically. The architectural rule avoids depending on package scope after
  metadata has been transformed or relocated.
- These probes validate metadata and module-loading boundaries only. Public PTY
  contract conformance remains the sole source of verified Backend support.

## Primary Sources

- Node.js, _Packages: Subpath imports_:
  https://nodejs.org/api/packages.html#subpath-imports
- Node.js, _ECMAScript modules: `import.meta.resolve`, JSON modules, and import
  attributes_: https://nodejs.org/api/esm.html#importmetaresolvespecifier and
  https://nodejs.org/api/esm.html#json-modules
- Bun, _Module Resolution_:
  https://bun.com/docs/runtime/module-resolution
- Bun, _Bundler_:
  https://bun.com/docs/bundler
- Deno API, _ImportMeta.resolve_:
  https://docs.deno.com/api/web/~/ImportMeta.resolve
- Deno, _Bundling_:
  https://docs.deno.com/runtime/reference/bundling/
