# @unipty/backend-bun

[English](./README.md) | [简体中文](./README-zh.md) · [GitHub](https://github.com/jixoai/unipty) · [Docs](https://unipty.jixoai.com)

Official [UniPty](https://www.npmjs.com/package/unipty) Backend adapting the **runtime-native
`Bun.Terminal`** substrate. It runs only inside the Bun runtime:
`Bun.Terminal` ships with Bun itself (>= 1.3.13 on Linux/macOS, >= 1.3.14 on
Windows via ConPTY), so this package has no native dependency of its own.

- **Provenance**: `runtime-native` over `Bun.Terminal`; the child process is
  started with `Bun.spawn(argv, { terminal })`. This is Bun's own PTY API,
  not a Node API and not a third-party binding.
- **Representation**: native **bytes** in both directions. Output chunks from
  the terminal `data` callback are passed through as `Uint8Array` without
  copying or re-encoding; string input is UTF-8 encoded because the endpoint
  is byte-native.
- **Metadata**: the side-effect-free `./unipty.metadata` subpath declares
  schema 1, Backend id `bun`, factory export `createBunBackend`, Core protocol
  `[1]`, and the runtime-level target `bun`. Target declarations only
  prefilter selection; verified support comes exclusively from the
  repository-owned Official Catalog, never from this package.

## Usage

```ts
import { UniPty } from "unipty";
import { createBunBackend } from "@unipty/backend-bun";

const backend = await createBunBackend();
const unipty = new UniPty({ backend });

const pty = unipty.spawn(["/bin/bash", "-lc", "htop"], { terminal: { cols: 120, rows: 40 } });
pty.write("q");
const stream = pty.stream({ encoding: "utf8" });
for await (const text of stream) console.log(text);
```

The factory is the only acquisition step: outside Bun, on a Bun without
`Bun.Terminal`, or below the platform's version floor it rejects with a typed
`unsupported` failure. A ready backend needs no further readiness work, and
`dispose()` resolves immediately because the substrate is owned by the Bun
runtime — it releases nothing of its own and never touches live PTYs.

## Write queue policy

Numeric queue policy is Backend-owned (it is not a UniPty core option). Each
PTY gets a bounded pending-write queue:

| Setting                               | Value                           |
| ------------------------------------- | ------------------------------- |
| Hard bound (`writeQueueBytes` option) | 1 MiB (1048576 bytes)           |
| Soft resume mark                      | 3/4 of the hard bound (768 KiB) |

`write()` admits one complete value into the queue synchronously, then an
asynchronous pump hands segments to `Bun.Terminal.write` in order:

- While pending bytes stay at or below the soft mark, `write()` returns
  `true`.
- Above the soft mark the value is still fully accepted but `write()` returns
  `false`: pause and await `drain()`, never retry the value.
- A value that would push pending bytes past the hard bound is rejected as a
  whole with a typed `backpressure` failure — never partially accepted,
  never silently dropped. Backpressure is advisory, so later smaller writes
  may still succeed while capacity remains.
- `drain()` resolves when pending bytes fall back to the soft mark (or the
  queue empties) and rejects with `closed` if input becomes unusable first.

Accepted values are copied into queue-owned memory so callers may reuse,
detach, or transfer their buffers after `write()` returns. The measured
substrate itself applies no write backpressure (a 2026-08-20 probe pushed
200 MiB through `Bun.Terminal.write` against a non-reading child with no
partial acceptance), which makes this queue the only backpressure boundary.

## Substrate semantics recorded by this adapter

- **Exit observation**: `exited` awaits the child's `exited` promise, then
  reports `{ exitCode, signal }` from the subprocess `exitCode`/`signalCode`
  facts. Bun resolves `exited` as `128 + signal` for signalled death while
  `exitCode` stays `null` and `signalCode` carries the name (for example
  `{ exitCode: null, signal: "SIGTERM" }` after `terminate()`); when neither
  fact is observable the honest report is `null`/`null`.
- **`close()`** calls `terminal.close()` only — a transport close with no
  child signal. A child that later dies after losing its controlling terminal
  is terminated by the operating system, not by this call; the exit
  observation survives close and settles independently. After close,
  `write()`, `resize()`, and `drain()` reject with the common `closed` code.
- **`terminate()`** calls `Bun.Subprocess.kill()` (default SIGTERM) once,
  idempotently, and never closes the transport.
- **`resize(cols, rows)`** maps to `terminal.resize` over character cells;
  a substrate rejection surfaces as a typed `unsupported` failure with the
  original cause preserved.
- **Output stream completion** follows the PTY transport only (clean EOF
  completes; a transport read failure errors the stream). It never
  synthesizes the child exit result, and the exit observation never
  synthesizes stream completion. The Terminal `exit` callback reports
  transport teardown — not child completion — so on child exit the adapter
  synthesizes the master EOF the substrate fails to deliver and the
  independent exit observation comes from `Subprocess.exited`.
- The PTY slave starts in canonical mode with kernel echo; child programs
  that need raw input must set it themselves.

## Deployment

The deployed Bun runtime supplies the entire substrate. Version floors:
1.3.13 (Linux/macOS, where `Bun.Terminal` was introduced) and 1.3.14
(Windows ConPTY). A runtime/platform tuple is presented as **verified** only
when the repository-owned Official Catalog carries passing public-contract
evidence for the exact package and tuple; otherwise the declared target is
**declared-unverified**, and absence of evidence is never a permanent
unsupported claim.

### Windows ConPTY byte fidelity

Bun documents ConPTY output as not byte-identical to the child's raw byte
stream (it passes through the Windows console API). This adapter makes no
byte-fidelity claim: ConPTY output is surfaced as native Terminal Bytes
exactly as the substrate reports it — bytes in, bytes out, no re-encoding —
and consumers that need byte-exact streams should not rely on ConPTY
rewriting being absent.

## Substrate truth: output buffering

`Bun.Terminal` pushes output through a `data` callback with no transport-level
flow control, and the substrate's internal reader thread already buffers the
master side without a bound. Core's bootstrap backpressure therefore pauses
_its_ pump, but this adapter cannot propagate that pause into the substrate:
while no consumer drains (for example, a full bootstrap buffer before the
first view), output accumulates inside Bun's internal buffer. The adapter's
bounded write queue is the only backpressure boundary this route owns. This
is a documented substrate limitation, not a UniPty contract change.
