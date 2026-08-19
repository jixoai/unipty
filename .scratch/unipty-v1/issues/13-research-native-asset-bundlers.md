# Native Asset And Host Bundler Research

Type: research  
Status: resolved

> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai): package-native
> asset/distribution shapes; host-bundler JS/external behavior; Deno embedding;
> asset-report rejection; minimal helper boundary.
>
> Original request (2026-08-19 Asia/Shanghai): determine the actual native
> asset and installation shapes of official `node-pty`, Bun.Terminal, and
> `@sigma/pty-ffi`; exercise at least two host bundlers; decide whether a
> public cross-bundler asset report is justified. Do not change product code.

Part of: [UniPty v1 Wayfinder Map](../map.md)

## Result

There is no stable cross-bundler native-asset field model to publish. Delete the
v1 `@unipty/helper-backend` asset-report concept altogether: do not add a
report type, manifest field, `./unipty.build` subpath, copy step, downloader,
or externalization directive.

```text
@unipty/backend-node-pty        @unipty/backend-bun       @unipty/backend-deno-sigma__pty-ffi
package JS + .node/.dll         Bun runtime binary         npm JS + packaged .dylib/.so/.dll
          |                              |                            |
host external keeps package      no Backend package          build vendors noinit closure
installed and resolvable          asset to copy               factory selects packaged library
          |                              |                            |
deployment owns node_modules      Bun release owns runtime    Backend npm package owns asset tree
```

The shared law is deliberately smaller than a report: **the Backend package and
the host deployment own native materialization; Core, metadata, resolver,
manifest, and AutoResolve do not.**

## Primary-Source Facts

### Official `node-pty` 1.1.0

The official package's [published package manifest](https://raw.githubusercontent.com/microsoft/node-pty/main/package.json)
ships `prebuilds/`, C/C++ source, `binding.gyp`, and `scripts/prebuild.js`; its
install script first checks a platform/architecture prebuild and otherwise runs
`node-gyp rebuild`. The [prebuild script](https://raw.githubusercontent.com/microsoft/node-pty/main/scripts/prebuild.js)
tests `prebuilds/${process.platform}-${process.arch}` and deliberately falls
through to source compilation when it is absent (or when
`npm_config_build_from_source=true`). It is not a JavaScript-only dependency.

The installed macOS arm64 tarball in the probe contained `pty.node` under the
Darwin prebuild directory, Windows `pty.node`/`conpty.node` addons, and Windows
DLLs (`conpty.dll`, `winpty.dll`). The published package also contains C/C++
sources for the fallback build. The exact archive content is a package-release
fact, not a promise that every platform has a prebuild.

### Bun Terminal

[Bun's PTY documentation](https://bun.com/docs/runtime/child-process#terminal-pty-support)
defines terminal mode as a Bun runtime feature: `Bun.Terminal` uses `openpty()`
on Linux/macOS and ConPTY on Windows. No npm Backend package, addon path,
sidecar DLL, cache directory, or build-copy API is involved in the UniPty Bun
route. A Bun application bundle relies on the deployed Bun runtime version and
its platform support; it cannot materialize the runtime's own PTY substrate as
a package asset.

### `@sigma/pty-ffi` 0.42.0

The package's [FFI loader](https://jsr.io/@sigma/pty-ffi/0.42.0/src/ffi.ts)
uses `Deno.dlopen`; without a caller-supplied `libPath`, it delegates to
`@denosaurs/plug` and constructs a GitHub release URL by Deno OS/architecture.
Its [loader source](https://jsr.io/@denosaurs/plug/1.1.0/download.ts) selects a
cache location (default `DENO_DIR/plug`), downloads/copies the platform library,
then returns that cached path to `Deno.dlopen`. The actual assets are named
`libpty_<arch>.so` on Linux, `libpty_<arch>.dylib` on macOS, and `pty.dll` on
Windows, as exposed by [`libName()`](https://jsr.io/@sigma/pty-ffi/0.42.0/src/ffi.ts).

The package's [README](https://jsr.io/@sigma/pty-ffi/0.42.0/README.md) gives
the standalone deployment contract: use the `noinit` entry point, provide the
library path, and invoke `deno compile --allow-ffi --include <libPath>`.
[Deno's compile documentation](https://docs.deno.com/runtime/reference/cli/compile/#including-data-files-or-directories)
defines `--include` as explicit additional file/directory inclusion. This is a
Deno executable deployment operation, not an npm-package externalization rule.

## Host Bundler Facts

[Bun's bundler `external`](https://bun.com/docs/bundler#external) leaves an
external import unchanged for runtime resolution. [esbuild's `external`](https://esbuild.github.io/api/#external)
likewise excludes a file/package from the bundle and preserves its ESM import
for runtime evaluation. Neither API promises to discover, copy, relocate, or
validate the dynamic libraries used by the external package.

The same published APIs also show why a common wrapper is unsound: Bun can copy
an explicitly imported unknown-extension file with a loader, but that does not
understand `node-pty`'s runtime-computed addon path; esbuild externalization is
about module resolution, not Node-API asset deployment. They expose similarly
named external switches, not a common native-asset graph.

## Reproducible Measurements

Host: macOS arm64 (`Darwin 25.5.0`), Node `24.19.0`, Bun `1.3.14`, Deno
`2.9.5`, `node-pty@1.1.0`, `esbuild@0.28.2`.

### Node package: bundle versus external package

Run from repository root:

```sh
bun .scratch/unipty-v1/probes/native-asset-bundler-probe.sh.ts
```

The isolated fixture installs only `node-pty@1.1.0` and `esbuild@0.28.2`, then
deletes itself in `finally`. It runs the resulting `/bin/sh` PTY, rather than
only importing its module:

| Bundler                                         | JS-bundled result                                                 | External-package result                                                              | Copying `prebuilds/darwin-arm64` beside output                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Bun build `--target=node --format=cjs`          | bundle without assets rejects with `Failed to load native module` | `--external node-pty` preserves the package and the child emits `node-pty-bundle-ok` | still fails `posix_spawnp`; the bundled helper's runtime-relative path is not the copied package path |
| esbuild `--bundle --platform=node --format=cjs` | bundle without assets rejects with `Failed to load native module` | `--external:node-pty` preserves the package and the child emits `node-pty-bundle-ok` | the child runs successfully                                                                           |

Both unasseted bundles reject. The subsequent copy experiment proves that even
the tempting `assets: ["prebuilds/<tuple>"]` model would be wrong: esbuild's
CommonJS transform happened to use the output-relative addon path, while Bun's
bundled `node-pty` helper still required a package-relative executable helper
and failed at actual spawn. A successful JS bundle is not a `node-pty` native
deployment, and a copied addon directory is not a portable repair.

With `external`, the JS artifact still requires a deployment-resolvable
`node-pty` package directory containing the platform-compatible addon and any
companion files. Here both externalized artifacts did spawn and observe a child,
which establishes the package-external deployment path on this host. It still
does not establish public UniPty PTY conformance.

### Deno FFI path-owned route

The same probe bundles `jsr:@sigma/pty-ffi@0.42.0/noinit` with Deno code
splitting, downloads the official `libpty_arm64.dylib`, injects its absolute
path through `UNIPTY_PROBE_LIB_PATH`, and calls `instantiate(libraryPath)`.
The real PTY child emits `deno-ffi-bundle-ok` with a complete `--allow-ffi`
grant. A path-scoped `--allow-ffi=<dylib>` is insufficient because the
substrate uses `UnsafePointer`; factory/deployment ownership must therefore
document the required Deno permission shape rather than infer it from a file
report.

The source package is JSR-native: `npm view @sigma/pty-ffi` produced registry
`E404`. JSR's npm compatibility name is `@jsr/sigma__pty-ffi`, but the default
npm registry also returns `E404`; an npm consumer would need registry-specific
configuration to install it as an ordinary dependency.

The probe also placed a literal
`export { instantiate } from "jsr:@sigma/pty-ffi@0.42.0/noinit"` inside a local
npm package and imported that package from Deno. Deno delegated the npm package
module to its Node-compatible loader, which rejected the nested JSR URL:

```text
ERR_UNSUPPORTED_ESM_URL_SCHEME
Only file and data URLs are supported by the default ESM loader.
Received protocol 'jsr'
```

Therefore an npm-published UniPty Backend cannot leave this substrate specifier
in its runtime output. Successful direct Deno/JSR execution does not establish
that npm distribution shape.

## Decision: Self-contained npm Deno Backend

The Owner fixed `@unipty/backend-deno-sigma__pty-ffi` as an npm-only official
package. The pnpm build must bundle/vendor the JavaScript closure required from
the substrate's `noinit` entry and include the targeted native libraries in the
npm tarball. Published runtime modules contain no unresolved `jsr:` import.

The Backend factory selects the package-owned library for the exact runtime/OS/
architecture tuple and passes its path to the vendored `noinit` initializer.
The normal route does not depend on Plug download/cache behavior or JSR registry
configuration at application runtime. The package may keep its asset layout
private; metadata, Bundle Manifest, resolver, Core, and helper do not expose or
reconstruct it.

The release gate tests the packed npm artifact in an isolated Deno consumer,
checks that runtime output contains no `jsr:` specifier, and runs the public PTY
contract against the selected packaged library with full FFI permission. The
standard host-bundle recipe externalizes this Backend package so the npm asset
tree stays intact; any other layout is Backend-specific deployment work.

## Decision: No Public Asset Report

At least two host bundlers were exercised, but they establish only a shared
module-level observation:

```text
external package -> preserve specifier -> runtime resolves installed package
```

That observation cannot represent the three actual ownership models:

| Route            | Needed deployment data                                                  | Why no common field is sound                                                            |
| ---------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `node-pty`       | installed package tree, matching `.node`, possible build toolchain/DLLs | The package itself computes addon selection; a bundler has no complete native manifest. |
| Bun              | compatible Bun runtime binary                                           | There is no dependency asset to enumerate or copy.                                      |
| `@sigma/pty-ffi` | vendored `noinit` JS, package-owned tuple library, full FFI permission  | It is a Backend-package layout and permission contract, not module externalization.     |

Consequently, no two adapters expose a stable shared field model such as
`assets[]`, `source`, `destination`, `external`, or `copy`. Reusing those names
would either omit a required mechanism or misstate who performs it. V1 must
**reject** publishing an asset report, even as an advisory schema.

## Minimal UniPty Responsibility

- `@unipty/backend` and Core continue to own only metadata inspection,
  candidate selection, and deferred Backend module loading.
- `UniPtyBackendManifest` continues to contain static metadata plus a loader;
  it carries no native paths, URLs, permissions, external flags, or copy rules.
- `@unipty/helper-backend` continues to generate the explicit manifest from
  ordered candidates. It has no asset-report responsibility: it does not scan
  installed packages, infer asset paths, copy/download libraries, invoke a
  bundler, or modify deployment output.
- Each official Backend publishes its own deployment recipe next to its own
  release/build documentation. The Node recipe externalizes `node-pty`; the
  Deno Backend npm package vendors `noinit`, selects its packaged library, and
  documents full FFI permission. Both recipes keep the Backend package external
  when a host JavaScript bundle would otherwise detach package-owned assets.

## Limits

- The measurements cover macOS arm64 only. The `node-pty` archive's Windows
  files and the `@sigma/pty-ffi` documented Linux/Windows filenames were not
  loaded on this host.
- The probe runs a narrow child-output PTY check, not the full public UniPty
  contract. Native PTY support claims remain governed only by that contract
  suite.
- The external route assumes the deployment deliberately preserves a resolvable
  package installation. Serverless packaging, Electron, pnpm symlinks, OCI
  images, and code signing each need host-specific release acceptance.
- The self-contained Deno npm package has not been built yet. The current probe
  proves explicit-path initialization and rejects nested runtime `jsr:` imports;
  packed-tarball and public-contract results remain implementation acceptance.
- Vite, Rollup, and tsdown were not separately probed. They cannot make a
  public report justified while the two directly exercised bundlers and the
  three native route shapes lack common semantics.

## Sources

- Microsoft `node-pty`, [published package manifest](https://raw.githubusercontent.com/microsoft/node-pty/main/package.json)
  and [prebuild script](https://raw.githubusercontent.com/microsoft/node-pty/main/scripts/prebuild.js)
- Bun, [Bundler `external`](https://bun.com/docs/bundler#external) and
  [Terminal PTY support](https://bun.com/docs/runtime/child-process#terminal-pty-support)
- esbuild, [External](https://esbuild.github.io/api/#external)
- `@sigma/pty-ffi`, [FFI loader](https://jsr.io/@sigma/pty-ffi/0.42.0/src/ffi.ts)
  and [README](https://jsr.io/@sigma/pty-ffi/0.42.0/README.md)
- `@denosaurs/plug`, [download/cache implementation](https://jsr.io/@denosaurs/plug/1.1.0/download.ts)
- Deno, [compiled executable file inclusion](https://docs.deno.com/runtime/reference/cli/compile/#including-data-files-or-directories)
- JSR, [`@sigma/pty-ffi` package page](https://jsr.io/@sigma/pty-ffi)
