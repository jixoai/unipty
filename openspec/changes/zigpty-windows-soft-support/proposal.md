> Orthogonal intents (maintained 2026-09-07 Asia/Shanghai): soften the zigpty
> route's Windows stance from fail-closed to adapter-mediated, and add an
> adapter-owned disk spool that bounds output memory.
>
> Original request (2026-09-07 Asia/Shanghai): 先不用去管上游的，把我们自己
> 做好就好。我们不可能去管束所有的 backend，开发者可能有自己的 backend，
> 我们需要提供一些适配器来弥补各种需求，这才是我们的重点工作。另外，你
> 担心软暂停输出会导致内存狂涨，这方面可以在适配器那边提供磁盘化的方案。

## Why

The zigpty route currently fails closed on win32: the substrate ships a
ConPTY prebuild, but its public `pause()`/`resume()` are no-ops there
(zigpty 0.2.1 `WindowsPty`), so consumer-paced output backpressure cannot
propagate into the kernel and the adapter's output queue would grow without
bound. Waiting for upstream is not the plan. UniPty exists precisely because
substrates differ; bridging those differences inside adapter code (the Deno
route's "always drains and enqueues" buffering precedent) is the product's
core work, and third-party Backend authors face the same class of gap.

The memory cost of always-draining is real, so the adapter also gains a
disk-backed output spool: a bounded in-memory head, records spilled to a
temp file, replayed on demand. A stalled consumer then costs bounded memory
plus disk, not unbounded memory.

## What Changes

- `createZigptyBackend()` removes the `process.platform === "win32"`
  readiness gate. The `hasNative` hard gate stays; the route runs on
  Windows with declared substrate-level buffering semantics (the Deno-route
  class: output backpressure does not reach the kernel there).
- Metadata targets widen back to `{ runtime: "node" }` with `os` left open;
  Windows tuples remain `declared-unverified` until conformance evidence
  exists (evidence gating, not the declaration, limits support claims).
- New Backend-owned option `outputSpool?: true | { memoryBytes?, directory? }`:
  PTY output is admitted into a FIFO spool whose in-memory head is bounded
  (default 1 MiB); records beyond it spill to one temp file under
  `directory` (default `os.tmpdir()`), and a desiredSize-gated pump replays
  records into the private output source as the consumer pulls. Works on
  every platform; on win32 (no kernel backpressure) it is the recommended
  memory bound. Text records round-trip per complete record (UTF-8), so
  chunk boundaries and the aggregate stream are byte-identical.
- Stream-completion law under a spool: transport-EOF triggers set a pending
  flag instead of closing immediately; completion fires only when the spool
  has fully drained, so the fast-exit tail is never cut. Explicit `close()`
  still completes the source synchronously and drops undelivered spool
  content, deleting the temp file. Cancellation does the same.
- Documentation and matrices reclassify zigpty Windows from "fails closed"
  to "runs; output backpressure does not reach the kernel; `outputSpool`
  bounds memory" (root README ± zh, adapter README ± zh, www locales,
  AGENTS.md, living spec).

## Impact

- Affected code: `packages/backend-zigpty` (new `src/output-spool.ts`,
  endpoint integration, factory options, metadata), its tests, example
  worker config, docs surfaces listed above.
- Public surface growth is Backend-owned only (`outputSpool` option), per
  "numeric queue policy belongs to each Backend"; Core and the common
  contract are untouched.
- Incompatible-behavior note: none. `outputSpool` defaults to off; unix
  behavior without it is byte-identical to 0.2.1.
- CI: no new Windows cells in this change — conformance scripts use
  `new URL(...).pathname` repo roots and shell fixtures that are not yet
  win32-portable; recorded as follow-up work, and Windows stays
  declared-unverified until that evidence path exists.
- Release: version bump of `@unipty/backend-zigpty` only, after the
  delivery-workflow acceptance gate (example + docs + Owner sign-off).
