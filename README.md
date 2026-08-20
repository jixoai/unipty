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
pty.write("echo hello\n"); // boolean Write Readiness
pty.resize(80, 24); // character cells only
pty.terminate(); // request, never cascades into close
pty.close(); // transport close, never kills the child
const { exitCode, signal } = await pty.exited; // independent observation
```

## Highlights

- **Structured launch** — Bun-style `spawn(argv, options)` with a non-empty
  argv vector. No string-command overload, no implicit shell; metacharacters
  are ordinary data.
- **Representation-selecting streams** — `pty.stream({ encoding: "utf8" | "bytes" })`.
  UTF-8 views prefer native text and otherwise decode bytes incrementally;
  bytes views yield native bytes only — re-encoded text is never claimed as
  raw output.
- **Boolean Write Readiness** — `write()` returns `true`/`false` (both mean
  full acceptance; `false` only advises `drain()`), and saturation rejects one
  whole value with a typed `backpressure` failure. Never partial, never
  silent.
- **Non-cascading lifecycle** — `close()` and `terminate()` are idempotent,
  synchronous, and independent; the exit observation survives both.
- **Graceful disposal** — `unipty.dispose()` blocks new spawns instantly and
  waits for every live PTY before releasing the Backend exactly once.
- **Typed capability extensions** — opaque token lookup
  (`pty.capability(token)`) matched by object identity; no string registries.
- **Evidence-gated support claims** — a runtime/platform tuple is `verified`
  only when the public conformance suite passes against the installed package
  artifact. Everything else is honestly `declared-unverified` or
  `not-targeted`.

## Project goal & design

Node, Bun, and Deno each ship a different PTY story — installation models,
I/O representations, lifecycle semantics, native deployment constraints.
UniPty's goal is a **small, honest contract** that application code can rely
on across all three, with every substrate difference absorbed behind one
seam:

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
Backend Endpoint (Core-private) ── ordered tagged native chunks, write
   │             readiness/drain, resize, non-cascading close/terminate,
   ▼             repeatably-awaitable exit observation
real PTY on node-pty / Bun.Terminal / @sigma/pty-ffi
```

Design principles worth knowing before reading the code:

- **One contract, three runtimes.** The public API never references a
  runtime; the first-phase deliverable is all three official routes
  together — implementation, CI coverage, and release acceptance.
- **Substrate honesty.** Every adapter documents its substrate's real
  behaviour (kill-and-close primitives, unbounded internal buffers, signal
  opacity) instead of papering over it; support claims are evidence-gated.
- **No hidden policy.** No implicit shell, no silent fallback to pipes, no
  second plugin registry, no capability/asset protocol. Extension points
  are explicit: Backend wrappers and opaque capability tokens.
- **Evidence over labels.** A runtime/platform tuple is `verified` only
  with a full public-contract pass against the installed artifact; the
  release catalog is the sole source of that truth.

Deep dives: [架构设计.md](架构设计.md) (architecture) ·
[贡献规范.md](贡献规范.md) (contributing) ·
[capability specs](openspec/specs) (authoritative requirements).

## Official first-phase routes

| Package                                                                       | Runtime | Substrate (stated honestly)                                                                        |
| ----------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| [`@unipty/backend-node-pty`](packages/backend-node-pty)                       | Node    | third-party `node-pty` via the `@lydell/node-pty` prebuilt distribution                            |
| [`@unipty/backend-bun`](packages/backend-bun)                                 | Bun     | runtime-native `Bun.Terminal` (≥ 1.3.13 POSIX, ≥ 1.3.14 Windows)                                   |
| [`@unipty/backend-deno-sigma__pty-ffi`](packages/backend-deno-sigma__pty-ffi) | Deno    | third-party `@sigma/pty-ffi` over Rust `portable-pty`, vendored into a self-contained npm artifact |

The Node route adapts a third-party library — it is not a native Node runtime
API, and the docs never claim otherwise. Deno is runtime metadata for the
last route, not its implementation identity.

## Packages

| Package                                                                       | npm                                                                      | What it is                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| [`unipty`](packages/unipty)                                                   | [npm](https://www.npmjs.com/package/unipty)                              | The public Core: `UniPty`, `Pty`, the Backend/Endpoint seam, common errors                                                |
| [`@unipty/backend`](packages/backend)                                         | [npm](https://www.npmjs.com/package/@unipty/backend)                     | Acquisition convenience: `resolveUniPtyBackend`, `inspectUniPtyBackend`, `autoResolveUniPtyBackend`, manifest constructor |
| [`@unipty/helper-backend`](packages/helper-backend)                           | [npm](https://www.npmjs.com/package/@unipty/helper-backend)              | Build-time manifest generator (`unipty-helper-backend manifest`)                                                          |
| [`@unipty/backend-node-pty`](packages/backend-node-pty)                       | [npm](https://www.npmjs.com/package/@unipty/backend-node-pty)            | Official Node route over third-party `node-pty`                                                                           |
| [`@unipty/backend-bun`](packages/backend-bun)                                 | [npm](https://www.npmjs.com/package/@unipty/backend-bun)                 | Official Bun route over runtime-native `Bun.Terminal`                                                                     |
| [`@unipty/backend-deno-sigma__pty-ffi`](packages/backend-deno-sigma__pty-ffi) | [npm](https://www.npmjs.com/package/@unipty/backend-deno-sigma__pty-ffi) | Official Deno route over vendored `@sigma/pty-ffi` (self-contained npm artifact)                                          |
| [`@unipty/conformance`](packages/conformance)                                 | — (private)                                                              | Installed-package conformance harness, evidence writer, release catalog aggregator                                        |
| [`@unipty/www`](packages/www)                                                 | — (private)                                                              | Static documentation site → [unipty.jixoai.com](https://unipty.jixoai.com)                                                |
| [`@unipty/example`](packages/example)                                         | — (private)                                                              | Local demo: shadcn/ui tabbed xterm terminals over WebSocket, one runtime per backend                                      |

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

## Contract at a glance

| Surface                   | Semantics                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `spawn(argv, options)`    | synchronous; argv is structured data; geometry resolves per dimension (explicit → `COLUMNS`/`LINES` → host TTY → 80×24) |
| `stream({ encoding })`    | one active view per PTY (`active-stream` otherwise); cancellation detaches the view only                                |
| `write(data)` / `drain()` | boolean readiness; whole-value acceptance; typed saturation                                                             |
| `resize(cols, rows)`      | finite positive integer character cells; unsupported is explicit                                                        |
| `close()` / `terminate()` | idempotent, synchronous, non-cascading                                                                                  |
| `exited`                  | repeatably awaitable `{ exitCode, signal }`, independent of stream completion and close                                 |
| errors                    | stable `error.code`: `unsupported`, `closed`, `backpressure`, `invalid-argument`, `active-stream`                       |

## Conformance & compatibility evidence

Every support claim flows through one seam: the public conformance suite runs
against **installed package artifacts** (packed, installed into an isolated
consumer, driven only through public exports). A full native pass emits one
positive Verification Evidence record; a deterministic aggregator validates
identity/tuple/commit uniqueness and emits the release catalog, which the
documentation site consumes **unchanged**. Failures stay CI diagnostics —
they never become permanent "unsupported" claims.

Local run:

```sh
pnpm --filter @unipty/conformance run conformance --backend node-pty --emit-evidence
```

## Documentation & community

- **Site**: <https://unipty.jixoai.com> (GitHub Pages, consumes the release catalog)
- **Docs**: [架构设计](架构设计.md) (architecture) · [贡献规范](贡献规范.md) (contributing) · [capability specs](openspec/specs)
- **Specs**: the six capability specifications under [`openspec/specs/`](openspec/specs)
- **Issues / discussions**: <https://github.com/jixoai/unipty/issues>
- **Roadmap**: v1 is PTY-focused; persistence, reconnect, and remote hosts
  belong to replaceable Backends and wrappers, not a second plugin lifecycle.

## Development

```sh
corepack pnpm install
pnpm build && pnpm typecheck && pnpm test
pnpm --filter @unipty/backend-bun test      # Bun suite (needs Bun)
cd packages/backend-deno-sigma__pty-ffi && deno test -A test/   # Deno suite
pnpm check:arch                             # package-graph ownership rules
```

## License

[MIT](LICENSE)
