# @unipty/backend-zigpty

[English](./README.md) | [简体中文](./README-zh.md) · [GitHub](https://github.com/jixoai/unipty) · [Docs](https://unipty.jixoai.com)

Official UniPty Backend for Node runtimes, adapting the third-party
**zigpty** substrate (Zig-built NAPI prebuilds) — never a native Node runtime
PTY API.

- **Route identity:** `zigpty`
- **Provenance:** third-party [`zigpty`](https://www.npmjs.com/package/zigpty)
  (Zig PTY implementation, NAPI prebuilds bundled in the npm tarball)
- **Core protocol:** `1`

## Why `zigpty`?

`zigpty` ships self-contained NAPI prebuilds for eight tuples
(Linux/macOS/Windows × x64/arm64, glibc and musl) inside its own tarball:
zero runtime dependencies, no `optionalDependencies`, no post-install
scripts, no node-gyp — and a much smaller footprint than the node-pty
distribution. It exposes a node-pty-compatible surface, so this route is a
second Node substrate choice alongside `@unipty/backend-node-pty`, not a
replacement for it.

## Usage

```ts
import { UniPty } from "unipty";
import { createZigptyBackend } from "@unipty/backend-zigpty";

// One-time substrate load (resolves the in-tarball prebuild); everything
// after this point is synchronous.
const backend = await createZigptyBackend();

const unipty = new UniPty({ backend });
const pty = unipty.spawn(["/bin/sh", "-i"], {
  cwd: process.env.HOME,
  terminal: { cols: 120, rows: 40 },
});

const text = pty.stream({ encoding: "utf8" });
for await (const chunk of text) console.log(chunk);

pty.write("echo hi\n");
pty.terminate();
pty.close();
```

Acquisition is explicit: `await import()` + `createZigptyBackend()` remains
the deterministic path; `@unipty/backend`'s `autoResolveUniPtyBackend()` is
the convenience wrapper. Metadata is exported side-effect-free from
`@unipty/backend-zigpty/unipty.metadata` (schema 1; importing it loads no
native addon and creates no pty).

## Options

```ts
createZigptyBackend({
  encoding?: "buffer" | "utf8", // default "buffer"
  writeDecode?: true | TextDecoder,
  name?: string, // passed to the substrate; becomes $TERM in the child
  writeQueueBytes?: number, // bounded pending-write admission queue, default 1 MiB
  outputSpool?: true | { memoryBytes?: number; directory?: string },
})
```

| Mode                                 | Endpoint `native`                    | Output chunks                                                        | Input acceptance                                                      |
| ------------------------------------ | ------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `encoding: "buffer"` (default)       | `{ input: "text", output: "bytes" }` | `{ kind: "bytes", bytes }` (`Buffer` passes through as `Uint8Array`) | text only; byte writes fail with `unsupported`                        |
| `encoding: "buffer"` + `writeDecode` | `{ input: "both", output: "bytes" }` | `{ kind: "bytes", bytes }`                                           | text and bytes; bytes flow through one stateful adapter-owned decoder |
| `encoding: "utf8"`                   | `{ input: "text", output: "text" }`  | `{ kind: "text", text }`                                             | text only; byte writes fail with `unsupported`                        |
| `encoding: "utf8"` + `writeDecode`   | `{ input: "both", output: "text" }`  | `{ kind: "text", text }`                                             | text and bytes; bytes flow through one stateful adapter-owned decoder |

The substrate's `write` accepts strings only in every mode — unlike the
node-pty route, byte input always needs the Backend-owned `writeDecode`
convenience. `writeDecode: true` installs a non-fatal UTF-8 `TextDecoder`;
passing your own `TextDecoder` copies its encoding/fatal/BOM configuration
into a **per-PTY** stateful decoder — decoder state is never shared across
PTYs. A fatal decode failure rejects the whole value with `invalid-argument`
and the original `TypeError` as `cause`.

Write readiness: each Endpoint owns a bounded admission queue (default 1 MiB,
soft resume mark at three quarters; tune with `writeQueueBytes`). Values are
handed to the substrate whole, so `write()` returns `false` past the soft mark
(pause advice; `drain()` resolves below it) and rejects a whole value with
`backpressure` at the hard bound — never partial acceptance. Admission
accounting runs before any decoder state advance: byte values are admitted raw
and decoded at pump time, so a value rejected by saturation leaves the stateful
decoder exactly where it was and retrying the same bytes decodes identically.
A fatal `writeDecode` failure at pump time terminates the input surface: the
value is dropped, `drain()` rejects with `invalid-argument`, and later
`write()` calls rethrow the same failure. `drain()` is readiness recovery, not
a physical flush: the substrate's own fd write queue has no completion signal.

### Output memory bounding (`outputSpool`)

Off by default; enable it when a consumer may stall for unbounded time — and
above all on Windows, where the substrate's output flow control cannot reach
the kernel (see the Windows note below):

```ts
const backend = await createZigptyBackend({
  outputSpool: { memoryBytes: 4 * 1024 * 1024 }, // or just `true` for defaults
});
```

With the spool on, output records accumulate in a FIFO whose in-memory head is
bounded (`memoryBytes`, default 1 MiB); records beyond it spill to one
adapter-owned temp file under `directory` (default the OS temp directory) and
replay into the source strictly at the consumer's pace. The aggregate public
stream is byte-identical with and without the spool — text records round-trip
per complete record and chunk boundaries are preserved. A transport-EOF
request completes the source only after the spool has fully drained, so a
fast-exit tail is never cut; explicit `close()` (and stream cancellation)
still complete synchronously and drop undelivered records. On platforms where
the substrate can pause, a backlogged spool additionally propagates pressure
into the kernel, so the memory bound is the first-line buffer and the child
blocks only past it. Trade-offs to know: spill IO is synchronous, disk usage
while backlogged is unbounded by design (bounded only by the child's own
output), and the temp file is deleted on completion/close/cancellation — an
abruptly-killed process leaks it to OS tmp reaping. A failed spill (ENOSPC,
vanished directory) fails the output source with a typed error instead of
silently unbounding memory.

## Substrate behavior this adapter maps (and documents)

Verified against the installed `zigpty` 0.2.1 sources and live probes:

- **The native gate is hard.** `zigpty` silently falls back to a pipe-based
  pseudo-PTY when its prebuild cannot load (no real tty, no kernel
  winsize). This adapter checks `hasNative` at readiness and fails with
  `unsupported` instead — the fallback is never entered, so a ready Backend
  always means a real PTY substrate.
- **`close()` = logical transport release, no signal, deferred physical
  teardown.** The substrate's `close()` closes the master fd and then
  explicitly sends `SIGHUP` to a live child, so it would cascade close into
  termination. This adapter calls the substrate `close()` only after the
  exit observation settles (the substrate's internal liveness probe then has
  no pid to signal): the closed state, stream completion, and I/O rejection
  are immediate, while the child is never signaled by the close and the exit
  observation stays pending until true child death. Reads keep flowing after
  close (post-close chunks hit the discard path and the data path's own pause
  keeps any queue bounded): pausing them would defer the exit observation
  behind undrained output — the substrate defers `onExit` while paused reads
  hold a backlog (observed on darwin, 0.2.1).
- **`terminate()` = `kill()` with the substrate default signal** (`SIGHUP`),
  followed by a master-read resume. `ESRCH` for an already-dead child is
  swallowed, keeping it idempotent. Transport stays open. The resume is
  load-bearing: the substrate defers the exit observation while undrained
  output sits behind paused reads, so a killed flooded child would otherwise
  never settle `exited` until some reader resumed.
- **`exited`** wraps `onExit` once. The payload reports `signal` as a number
  (`0` = no signal); nonzero numbers map to their observed string form
  (`"SIGTERM"`). A signalled death keeps the substrate-reported numeric exit
  code (observed as `0`) — the adapter passes the observation through and
  never invents a `null` the substrate did not report.
- **Exec failures are exit observations, not spawn exceptions.** The
  substrate forks then execs; a missing executable produces an immediate
  `{ exitCode: 1, signal: null }` rather than a throw. Only argument-shaped
  failures surface as typed synchronous spawn errors (`invalid-argument` /
  `unsupported` with the original error as `cause`).
- **Geometry and resize** reach the child as real tty winsize updates.
- **Output backpressure propagates to the kernel where the substrate can
  pause.** Master reads pause whenever the Core-owned source falls behind
  and resume on pull (public substrate `pause()`/`resume()`; no private
  internals are touched). Without `outputSpool` that pause fires as soon as
  the source stops pulling; with it, the spool absorbs bursts up to its
  memory bound first and the pause (kernel pressure, which blocks the child
  instead of growing any queue) engages only past that bound.
- **Windows runs with declared buffering semantics.** The substrate ships a
  ConPTY prebuild, but its public `pause()`/`resume()` output flow control
  are no-ops there (0.2.1), so consumer-paced backpressure cannot propagate
  into the kernel — the same declared substrate-limitation class as the Deno
  route. Instead of refusing readiness, the route now runs and the
  Backend-owned `outputSpool` option is the memory bound: a stalled consumer
  costs bounded memory plus disk, never unbounded memory. Enable it on
  Windows. Verified support for Windows tuples remains evidence-gated
  (declared-unverified until public-contract evidence exists).
- **Transport EOF is synthesized.** The substrate exposes no transport-EOF
  event (only `onData`/`onExit`): after the child exits, the adapter
  completes the output source one macrotask later — the same synthesis the
  Bun route performs for `Bun.Terminal` — so trailing chunks still enqueue
  before completion. Declared substrate limits of that synthesis: output
  produced after session-leader death by descendants still holding the
  slave side is cut at completion, and a transport read error cannot be
  distinguished from clean EOF (the substrate surfaces neither signal).
- **Windows runs with declared buffering semantics** (see the section above):
  `os` in metadata targets stays open; presentation of any tuple as verified
  requires published public-contract evidence for the exact package versions
  (see the release catalog). Absent evidence, tuples are
  _declared-unverified_ — the declaration prefilters selection, it never
  promises native loadability.

## Deployment

- The prebuilt NAPI addons ship inside `zigpty`'s own tarball
  (`prebuilds/*.node`, resolved by platform at import time); installing this
  package with a normal package manager materializes the binaries with zero
  install scripts. A tuple without a prebuild fails readiness with
  `unsupported` — never a silent pipe fallback.
- Keep this package **external and resolver-visible** in host bundles (the
  same rule as any native-addon package): bundling or relocating the emitted
  modules detaches the substrate's `prebuilds/` tree. For bundled
  deployments, use `@unipty/helper-backend` to generate an explicit Backend
  manifest with deferred loaders.
- Pure Node deployment story: no FFI, no runtime flags, no permissions, no
  post-install compilation on the supported prebuilt platforms.

## Support status

Metadata declares the runtime level only (`targets: [{ runtime: "node" }]`);
`os`/`arch` stay open, and a tuple counts as **verified** only with published
public-contract evidence for the exact package versions (see the release
catalog). Absent evidence, tuples are _declared-unverified_ — the declaration
prefilters selection, it never promises native loadability.
