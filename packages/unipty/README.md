# unipty

The runtime-neutral PTY Core: the public `UniPty` / `Pty` contract, the
Backend/Endpoint seam for adapter authors, common errors, and capability
tokens. Core owns every observable PTY behaviour; concrete Backends own their
native substrate.

[English](./README.md) | [简体中文](./README-zh.md) · [GitHub](https://github.com/jixoai/unipty) · [Docs](https://unipty.jixoai.com)

## Install

```sh
pnpm add unipty @unipty/backend-node-pty   # or the Bun / Deno route
```

Core has **no** Backend dependency: you inject one already-ready Backend.

## Usage

```ts
import { UniPty } from "unipty";
import { createNodePtyBackend } from "@unipty/backend-node-pty";

const backend = await createNodePtyBackend();
const unipty = new UniPty({ backend });

// Structured launch: no string-command overload, no implicit shell.
const pty = unipty.spawn(["/bin/sh", "-i"], {
  cwd: process.cwd(),
  env: { ...process.env, TERM: "xterm-256color" },
  terminal: { cols: 120, rows: 40 },
});

// One active stream per PTY; pick the representation explicitly.
const reader = pty.stream({ encoding: "utf8" }).getReader();
// pty.stream({ encoding: "bytes" }) → ReadableStream<Uint8Array> (native bytes only)

// Boolean Write Readiness: either value means the whole input was accepted.
const ready = pty.write("ls -la\n");
if (!ready) await pty.drain(); // pause advice, never a retry instruction

pty.resize(80, 24); // finite positive integer character cells
pty.terminate(); // synchronous request; does NOT close the transport
pty.close(); // publishes `closed`; does NOT terminate the child

const { exitCode, signal } = await pty.exited; // independent of streams/close

await unipty.dispose(); // blocks new spawns, waits for PTYs, releases Backend once
```

## Public surface

| Export                                                                    | Role                                                                                                       |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `UniPty<TBackend>`                                                        | Configured Core instance; `backend`, synchronous `spawn()`, graceful `dispose()`                           |
| `Pty`                                                                     | `stream`, `write`, `drain`, `resize`, `close`, `terminate`, `exited`, `closed`, `capability`               |
| `UniPtyError` / `UniPtyErrorCode`                                         | Stable failure discriminants: `unsupported`, `closed`, `backpressure`, `invalid-argument`, `active-stream` |
| `ReadyPtyBackend`, `BackendEndpoint`, `StructuredLaunch`                  | The Backend-author seam (below)                                                                            |
| `NativeChunk`, `NativeInput`, `NativeRepresentation`, `BackendExitResult` | Tagged native data plane                                                                                   |
| `CapabilityToken`, `defineCapabilityToken`                                | Opaque, identity-matched extension tokens                                                                  |
| `UNIPTY_CORE_PROTOCOL_MAJOR`                                              | Core protocol identity Backends declare against                                                            |

### Semantics worth knowing

- **Geometry** resolves per dimension: explicit `terminal` value → valid
  host `COLUMNS`/`LINES` → trustworthy host TTY → `80 × 24`. Explicitly
  invalid values fail with `invalid-argument`.
- **Stream cancellation detaches only the view**: input, transport, and the
  child stay alive; a later view sees only post-subscription output. Startup
  output is retained in a bounded bootstrap buffer until the first view.
- **Backpressure is advisory**: `false` never locks future writes; saturation
  rejects one whole value with `backpressure` — no partial acceptance, no
  unbounded queues.
- **`close()`/`terminate()` never cascade**; an established exit observation
  settles even after close.

## For Backend authors

Implement the ready-Backend seam and hand the ready object to Core:

```ts
import type { ReadyPtyBackend, BackendEndpoint, StructuredLaunch } from "unipty";

function createMyBackend(): Promise<MyBackend> {
  /* one-time readiness */
}

class MyBackend implements ReadyPtyBackend {
  spawn(launch: StructuredLaunch): BackendEndpoint {
    // synchronous; typed launch failures; one ordered NativeChunk source,
    // repeatably-awaitable `exited`, write/drain/resize/close/terminate.
  }
  async dispose(): Promise<void> {}
}
```

Endpoint law: you supply native transport facts only — Core owns public
streams, conversion, bootstrap buffering, backpressure semantics, common
errors, and lifecycle state. Expose an official `./unipty.metadata`
subpath and an async `createXxxBackend(options)` factory; declare
`protocol.core: [1]`. See the
[workspace README](../../README.md#packages) for the official route packages
and the [acquisition layer](../backend/README.md) for the metadata protocol.

## Testing

```sh
pnpm --filter unipty test   # 102 unit scenarios over an in-memory Endpoint
```
