# UniPty

**Runtime-neutral PTY for Node, Bun, and Deno — one public contract, developer-selectable Backends.**

[![CI](https://github.com/jixoai/unipty/actions/workflows/ci.yml/badge.svg)](https://github.com/jixoai/unipty/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

English | [简体中文](README-zh.md)

Node, Bun, and Deno each expose a different PTY substrate — different
installation models, I/O representations, lifecycle semantics, and native
deployment constraints. UniPty turns that into **one small, honest contract**:
applications pick a Backend explicitly, and all substrate variation stays
behind a Core-owned seam. No implicit shell execution, no silent fallback to
pipes, no runtime substitution.

## Install

Core plus one Backend of your choice — the package you install is the engine
you get:

| Runtime | Install                                                                                | Backend package you are getting                   |
| ------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Node    | `npm install unipty @unipty/backend-node-pty`                                          | third-party `node-pty` prebuilds                  |
| Node    | `npm install unipty @unipty/backend-zigpty`                                            | third-party `zigpty` (Zig-built, zero-dependency) |
| Bun     | `bun add unipty @unipty/backend-bun`                                                   | runtime-native `Bun.Terminal`                     |
| Deno    | import via `npm:@unipty/backend-deno-sigma__pty-ffi` (run with `-A` for the FFI route) | vendored `@sigma/pty-ffi` dynamic libraries       |

Not sure which engine? The capability matrix under Choosing a Backend below
tells you exactly what each one gives you.

## Quickstart

```ts
import { UniPty } from "unipty";
import { createNodePtyBackend } from "@unipty/backend-node-pty";

const backend = await createNodePtyBackend(); // one-time readiness
const unipty = new UniPty({ backend });

const pty = unipty.spawn(["/bin/sh", "-i"], {
  cwd: process.cwd(),
  terminal: { cols: 120, rows: 40 },
});

for await (const text of pty.stream({ encoding: "utf8" })) {
  process.stdout.write(text);
}
pty.write("echo hello\n"); // boolean Write Readiness — see the contract table
pty.resize(80, 24); // character cells only
pty.terminate(); // request, never cascades into close
pty.close(); // transport close, never kills the child
const { exitCode, signal } = await pty.exited; // independent observation
```

Swapping engines is a one-line change — everything above is identical on
every route: `createZigptyBackend()` ([zigpty](packages/backend-zigpty)),
`createBunBackend()` ([bun](packages/backend-bun)), or
`createDenoSigmaPtyFfiBackend()` ([deno](packages/backend-deno-sigma__pty-ffi)).
Engine-specific behavior (options, permissions, capability differences) is
documented in each package's README.

## The contract at a glance

Everything you can call, and exactly what it promises:

| Surface                   | Semantics                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `spawn(argv, options)`    | synchronous; argv is structured data; geometry resolves per dimension (explicit → `COLUMNS`/`LINES` → host TTY → 80×24) |
| `stream({ encoding })`    | one active view per PTY (`active-stream` otherwise); cancellation detaches the view only                                |
| `write(data)` / `drain()` | boolean readiness; whole-value acceptance; typed saturation                                                             |
| `resize(cols, rows)`      | finite positive integer character cells; unsupported is explicit                                                        |
| `close()` / `terminate()` | idempotent, synchronous, non-cascading                                                                                  |
| `exited`                  | repeatably awaitable `{ exitCode, signal }`, independent of stream completion and close                                 |
| errors                    | stable `error.code`: `unsupported`, `closed`, `backpressure`, `invalid-argument`, `active-stream`                       |

Four behaviors most often trip people up, by design:

- **Structured launch** — Bun-style `spawn(argv, options)` with a non-empty
  argv vector. No string-command overload, no implicit shell; metacharacters
  are ordinary data.
- **Representation-selecting streams** — `pty.stream({ encoding: "utf8" | "bytes" })`.
  UTF-8 views prefer native text and otherwise decode bytes incrementally;
  bytes views yield native bytes only — re-encoded text is never claimed as
  raw output.
- **Boolean Write Readiness** — `write()` returning `false` means "pause and
  await `drain()`", never "retry"; saturation rejects one whole value with a
  typed `backpressure` failure. Never partial, never silent.
- **Non-cascading lifecycle** — `close()` never kills the child,
  `terminate()` never closes the transport, and `exited` survives both.
  `unipty.dispose()` blocks new spawns and waits for live PTYs before
  releasing the Backend exactly once.

## Choosing a Backend

### Official routes

| Package                                                                       | Runtime | Substrate (stated honestly)                                                                                     |
| ----------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| [`@unipty/backend-node-pty`](packages/backend-node-pty)                       | Node    | third-party `node-pty` via the `@lydell/node-pty` prebuilt distribution                                         |
| [`@unipty/backend-zigpty`](packages/backend-zigpty)                           | Node    | third-party `zigpty` — Zig-built NAPI prebuilds bundled in the npm tarball (hard native gate, no pipe fallback) |
| [`@unipty/backend-bun`](packages/backend-bun)                                 | Bun     | runtime-native `Bun.Terminal` (≥ 1.3.13 POSIX, ≥ 1.3.14 Windows)                                                |
| [`@unipty/backend-deno-sigma__pty-ffi`](packages/backend-deno-sigma__pty-ffi) | Deno    | third-party `@sigma/pty-ffi` over Rust `portable-pty`, vendored into a self-contained npm artifact              |

The Node routes adapt third-party libraries — neither is a native Node runtime
API, and the docs never claim otherwise. Deno is runtime metadata for the
last route, not its implementation identity.

### Capability differences (what the engines actually give you)

The public contract is identical on every route — structured argv, geometry
and resize, write readiness with drain and whole-value saturation rejection,
non-cascading close/terminate, bootstrap buffering, common error codes. The
engines underneath are not. This matrix is the honest difference surface to
consult before choosing a route: ✓ works out of the box, ⚠ needs an option or
carries a documented limitation, ✗ not provided.

| Capability                             | `node-pty`             | `zigpty`                                  | `bun`                         | `deno-sigma__pty-ffi`        | Notes                                                                                                                                                                                                           |
| -------------------------------------- | ---------------------- | ----------------------------------------- | ----------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Byte writes `pty.write(Uint8Array)`    | ✓                      | ⚠ `writeDecode` option                    | ✓                             | ✓                            | zigpty's substrate `write` is string-only; `writeDecode: true` installs a stateful, split-safe decoder (fatal policies reject the whole value)                                                                  |
| Native text output (`encoding:"utf8"`) | ✓                      | ✓                                         | ✗                             | ✗                            | bun and deno are byte-native in both directions; their utf8 views are decoded incrementally by Core (lossless)                                                                                                  |
| Windows target                         | ✓ ConPTY*              | ✗ fail-closed                             | ✓ ≥ 1.3.14*                   | ✗                            | *evidence-gated (see the catalog); zigpty refuses readiness on win32 because the substrate's `pause()`/`resume()` are no-ops there                                                                              |
| Kernel-level output backpressure       | ✓ master-socket pause  | ✓ public `pause`/`resume`                 | ✗ none at transport level     | ✗ internal channel + poll    | node-pty pauses the master socket; zigpty pauses via its public API (post-exit through the repossessed stream); bun documents no transport-level flow control; deno's FFI reader drains into an internal buffer |
| Independent transport-EOF signal       | ✓ socket `close` event | ⚠ real signal + quiescence                | ⚠ callback + synthesis        | ✓ read-loop `done`           | zigpty repossesses the master stream at exit (real `end`/`close`) with a 50 ms late-chunk-extending fallback; bun's Terminal `exit` callback is primary, exited-synthesis is the fallback                       |
| Transport read errors surfaced         | ✓ `unsupported`        | ✗ indistinguishable from EOF              | ✓                             | ✓ `unsupported`              | the zigpty substrate swallows stream errors entirely; the other three error the stream so a read failure is never silently presented as clean EOF                                                               |
| Signalled-death observation            | signal name            | signal name, `exitCode: 0`                | signal name, `exitCode: null` | `exitCode: 1`, signal `null` | each substrate reports a different shape; adapters pass it through verbatim and never fabricate a value the engine did not report                                                                               |
| Substrate distribution                 | platform sub-packages  | zero-dep, in-tarball prebuilds (8 tuples) | built into the runtime        | vendored dynamic libraries   | deno additionally needs FFI permission (`-A` / `--allow-ffi`); zigpty ships no install scripts at all; node-pty installs only the current platform's binary                                                     |

Exec failures are an exit observation (never a spawn exception) on every
route, and per-adapter details live in each package's README.

## Acquiring a Backend

Manual import is the first-class path — Core never needs the acquisition
layer:

```ts
const backend = await createBunBackend(); // or any official factory
const unipty = new UniPty({ backend });
```

For deterministic discovery, `@unipty/backend` stages the work: pure
resolution (no imports), metadata-only inspection (no initialization), then
selected-candidate initialization whose failures are terminal and structured:

```ts
import { autoResolveUniPtyBackend } from "@unipty/backend";

const backend = await autoResolveUniPtyBackend({
  candidates: ["@unipty/backend-node-pty"], // ordered preference
  from: import.meta.url, // caller-rooted base
});
```

Bundled deployments supply an explicit immutable manifest instead
(`defineUniPtyBackendManifest()`), generated by
`unipty-helper-backend manifest --candidate <pkg> --out backend-manifest.ts`.
See the [acquisition README](packages/backend/README.md) for the full staged
contract.

## Architecture (the 60-second version)

```text
application code
   │  public contract (spawn / stream / write / resize / lifecycle / exited)
   ▼
UniPty Core ──── owns every observable behaviour: views, conversion,
   │             bootstrap buffering, backpressure, errors, lifecycle state
   ▼
Ready Backend ── one injected, already-ready object per UniPty instance
   │             (native loading / connection / negotiation finished first)
   ▼
real PTY on node-pty / zigpty / Bun.Terminal / @sigma/pty-ffi
```

Design principles worth knowing before reading the code:

- **Substrate honesty.** Every adapter documents its substrate's real
  behaviour (kill-and-close primitives, unbounded internal buffers, signal
  opacity) instead of papering over it; support claims are evidence-gated —
  a tuple is `verified` only with a full public-contract pass against the
  installed artifact, and the release catalog is the sole source of that
  truth.
- **No hidden policy.** No implicit shell, no silent fallback to pipes, no
  second plugin registry, no capability/asset protocol. Extension points
  are explicit: Backend wrappers and opaque capability tokens
  (`pty.capability(token)`, matched by object identity).

The full design narrative lives in [架构设计.md](架构设计.md)（中文）.

## Packages

| Package                                                                       | npm                                                                      | What it is                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| [`unipty`](packages/unipty)                                                   | [npm](https://www.npmjs.com/package/unipty)                              | The public Core: `UniPty`, `Pty`, the Backend/Endpoint seam, common errors                                                |
| [`@unipty/backend`](packages/backend)                                         | [npm](https://www.npmjs.com/package/@unipty/backend)                     | Acquisition convenience: `resolveUniPtyBackend`, `inspectUniPtyBackend`, `autoResolveUniPtyBackend`, manifest constructor |
| [`@unipty/helper-backend`](packages/helper-backend)                           | [npm](https://www.npmjs.com/package/@unipty/helper-backend)              | Build-time manifest generator (`unipty-helper-backend manifest`)                                                          |
| [`@unipty/backend-node-pty`](packages/backend-node-pty)                       | [npm](https://www.npmjs.com/package/@unipty/backend-node-pty)            | Official Node route over third-party `node-pty`                                                                           |
| [`@unipty/backend-zigpty`](packages/backend-zigpty)                           | [npm](https://www.npmjs.com/package/@unipty/backend-zigpty)              | Official Node route over third-party `zigpty` (Zig-built NAPI prebuilds)                                                  |
| [`@unipty/backend-bun`](packages/backend-bun)                                 | [npm](https://www.npmjs.com/package/@unipty/backend-bun)                 | Official Bun route over runtime-native `Bun.Terminal`                                                                     |
| [`@unipty/backend-deno-sigma__pty-ffi`](packages/backend-deno-sigma__pty-ffi) | [npm](https://www.npmjs.com/package/@unipty/backend-deno-sigma__pty-ffi) | Official Deno route over vendored `@sigma/pty-ffi` (self-contained npm artifact)                                          |
| [`@unipty/shell-parser`](packages/shell-parser)                               | [npm](https://www.npmjs.com/package/@unipty/shell-parser)                | Optional ecosystem: argv/shell parsing over `unbash`                                                                      |
| [`@unipty/powershell-parser`](packages/powershell-parser)                     | [npm](https://www.npmjs.com/package/@unipty/powershell-parser)           | Optional ecosystem: PowerShell command parsing                                                                            |
| [`@unipty/conformance`](packages/conformance)                                 | — (private)                                                              | Installed-package conformance harness, evidence writer, release catalog aggregator                                        |
| [`@unipty/www`](packages/www)                                                 | — (private)                                                              | Static documentation site → [unipty.jixoai.com](https://unipty.jixoai.com)                                                |
| [`@unipty/example`](packages/example)                                         | — (private)                                                              | Local demo: tabbed xterm terminals over WebSocket, one runtime per backend                                                |

## Conformance & compatibility evidence

Every support claim flows through one seam: the public conformance suite runs
against **installed package artifacts** (packed, installed into an isolated
consumer, driven only through public exports). A full native pass emits one
positive Verification Evidence record; a deterministic aggregator validates
identity/tuple/commit uniqueness and emits the release catalog, which the
documentation site consumes **unchanged**. Failures stay CI diagnostics —
they never become permanent "unsupported" claims. The per-tuple truth for the
current release is the [compatibility catalog](https://unipty.jixoai.com/compatibility).

Local run:

```sh
pnpm --filter @unipty/conformance run conformance --backend node-pty --emit-evidence
```

## Documentation map

Where to go next, by intent:

| You want to…                                        | Go to                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Read the API in depth                               | [docs site](https://unipty.jixoai.com/docs) · [`unipty` README](packages/unipty/README.md)            |
| Pick an engine and see its options/limits           | that route's README (linked from the routes table in Choosing a Backend)                              |
| Resolve Backends automatically or bundle for deploy | [acquisition README](packages/backend/README.md) · [helper README](packages/helper-backend/README.md) |
| See what is verified per runtime/platform           | [compatibility catalog](https://unipty.jixoai.com/compatibility)                                      |
| Run a live terminal demo locally                    | [`packages/example`](packages/example) (`pnpm example`)                                               |
| Understand the design decisions                     | [架构设计.md](架构设计.md)（中文） · [capability specs](openspec/specs)                               |
| Contribute                                          | [贡献规范.md](贡献规范.md)（中文）                                                                    |
| Report an issue / discuss                           | [GitHub Issues](https://github.com/jixoai/unipty/issues)                                              |

Roadmap note: v1 is PTY-focused; persistence, reconnect, and remote hosts
belong to replaceable Backends and wrappers, not a second plugin lifecycle.

## Development

```sh
corepack pnpm install
pnpm build && pnpm typecheck && pnpm test
pnpm --filter @unipty/backend-zigpty test   # zigpty suite (real PTYs)
pnpm --filter @unipty/backend-bun test      # Bun suite (needs Bun)
cd packages/backend-deno-sigma__pty-ffi && deno test -A test/   # Deno suite
pnpm check:arch                             # package-graph ownership rules
```

## License

[MIT](LICENSE)
