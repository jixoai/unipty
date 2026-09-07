# Design: zigpty Windows soft support + adapter disk spool

## Context

The 0.2.1 adapter failed closed on win32 because the substrate's public
`pause()`/`resume()` are empty methods there (`WindowsPty` in zigpty
0.2.1 dist): the Endpoint's consumer-paced output backpressure (pause
master reads when `desiredSize <= 0`) has nothing to gate, so a stalled
consumer means an unbounded private-source queue. The Owner directive
(2026-09-07) reframes this: UniPty cannot discipline every substrate, and
bridging substrate gaps with adapter code is the product's core work —
with a disk-spill option to answer the memory-growth cost.

## Goals / Non-Goals

Goals:

- The zigpty route runs on Windows (soft support) with honestly declared
  buffering semantics, matching the Deno route's precedent class.
- Output memory is boundable by the deployer (`outputSpool`), at
  Backend-option level, without touching Core or the common contract.
- Delivery law preserved: no enqueued-record loss on natural EOF (the
  fast-exit tail), explicit close stays synchronous, cancellation drops.

Non-goals:

- Kernel-level backpressure on win32 (impossible without substrate work;
  upstream is explicitly out of scope for this change).
- Promoting the spool to a shared cross-backend package (no second
  consumer yet; the module is dependency-free and self-contained so
  promotion later is a move, not a rewrite).
- Windows CI conformance cells (scripts not win32-portable yet;
  `URL.pathname` repo roots + shell fixtures — follow-up task).
- Changing the default unix behavior (`outputSpool` defaults to off;
  without it everything is byte-identical to 0.2.1).

## Decisions

### D1. Soft support mirrors the Deno-route precedent, not a new mechanism

The Deno adapter already documents the exact same substrate shape: an
internal reader that cannot be paced, handled by "the pump therefore
always drains and enqueues" with a declared route-level limitation. The
zigpty endpoint on win32 inherits that stance: keep draining native
callbacks; `pauseReads()`/`resumeReads()` stay in the code path (they are
harmless no-ops on the substrate there) so one code path serves all
platforms. The factory gate goes; the `hasNative` hard gate stays (the
pipe pseudo-PTY fallback is never entered, on any platform).

### D2. The spool is a FIFO with a bounded memory head and a disk tail

One record per native chunk, written as
`[kind: 1 byte][length: uint32 LE][payload]`. Appends go to an in-memory
head; once the head exceeds `memoryBytes` the WHOLE head flushes to the
single spill file (append fd), so steady-state memory is bounded by
`memoryBytes` + one record. Ordering is disk-records-first-then-head —
correct because a flush only ever appends records older than everything
still arriving, and reads advance a monotonic offset. Two fds on one file
(append + sequential read) avoid shared-position interference.

Text chunks round-trip per complete record: each `onData` string is
independently complete, UTF-8 encode→decode per record is lossless, and
chunk boundaries are preserved, so the aggregate public stream is
byte-identical with and without the spool. The spool never re-chunks.

Synchronous `fs.writeSync`/`readSync`: spilling happens inside the native
data callback which is already synchronous, and replay happens in
`pull()`/microtask pumps. Async IO would reorder records for no gain at
terminal-output record sizes.

### D3. Pump gating and the completion law

A pump moves records spool→controller only while `desiredSize > 0`, so at
most the stream's own water-mark of records sits in the controller; the
spool absorbs bursts and stalls. Triggers: every append schedules a
microtask pump, and `pull()` pumps directly (recovery after a stall).

Transport-EOF triggers (repossessed-stream `end`/`close`/`error`, the
post-exit quiescence window, explicit `close()`) currently call
`finishStream()` directly. With a spool they instead request completion:
if the spool is non-empty the request sets a pending flag and keeps
pumping under the same `desiredSize` gate — the tail is delivered as the
consumer pulls, and completion fires only when the spool is empty. A
consumer that never resumes reading keeps the data waiting (same shape as
Core's bootstrap buffer) and the exit observation stays independent.
Explicit `close()` and source cancellation remain synchronous completions
that drop undelivered spool content and delete the temp file — consistent
with 0.2.1, where substrate-internal undelivered output is likewise not
preserved across close.

Spill IO failures fail the private source with a typed error (controller
error + cleanup); they are transport-class failures from the public
stream's point of view.

### D4. Option surface stays Backend-owned

`outputSpool?: true | { memoryBytes?: number; directory?: string }`
mirrors this package's existing `writeDecode: true | TextDecoder`
convenience-boolean pattern. Defaults: `memoryBytes` 1 MiB, `directory`
`os.tmpdir()`. Validation mirrors `writeQueueBytes` (positive integer,
`invalid-argument`). The temp file is
`unipty-spool-<pid>-<counter>.tmp` under the chosen directory, created
lazily at first spill, deleted on stream completion, close, or
cancellation; an abruptly-killed process leaks it to OS tmp reaping
(documented). Disk usage while stalled is unbounded by design — dropping
records would violate whole-value delivery.

## Risks / Trade-offs

- Windows runtime is unverified locally (no win32 host): the shared
  code paths are exercised on darwin; the platform-specific surface
  (native callbacks, no `_readable`, quiescence EOF, deferred substrate
  close) is code-reviewed against the substrate sources. Presentation
  stays `declared-unverified` until conformance evidence exists.
- Sync disk IO on the JS thread during heavy spilling adds latency to
  data delivery; acceptable for a bounded-memory opt-in and honest in
  the README.
- One spill file per Endpoint grows unboundedly while the consumer
  stalls (by design; memory is the scarce resource, disk and tmp reaping
  are the pressure valve).

## Migration Plan

Pure addition plus one gate removal; no breaking change. Unix consumers
that never set `outputSpool` observe identical behavior. Version bump on
`@unipty/backend-zigpty` follows the delivery workflow (example + docs +
Owner acceptance, then release).
