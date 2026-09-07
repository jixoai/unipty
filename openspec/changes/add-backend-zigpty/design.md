# Design: add-backend-zigpty

## Context

Probe evidence (2026-09-07, darwin-arm64, Node 24.20.0, zigpty@0.2.1 from
npm) established every substrate fact below. The probe is reproducible ad
hoc (`npm i zigpty@0.2.1` in a scratch dir, then assert `hasNative`, the
pause/resume gating, the close-then-SIGHUP timing, `stty size` before/after
`resize`, and `onExit` payloads); every load-bearing assertion is encoded
permanently as real-PTY adapter tests in `packages/backend-zigpty/test/` and
as public-contract scenarios in the conformance suite, so the adapter never
depends on re-running the throwaway probe script.

| Fact                                                                                                       | Evidence                                                           |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `hasNative` gates the native addon; module load computes it                                                | `src/napi.ts` (`native === null` on prebuild resolve/load failure) |
| `spawn()` silently falls back to a pipe-based pseudo-PTY when `!hasNative`                                 | `src/index.ts` (`if (!hasNative \|\| options?.pipe)`)              |
| substrate `close()` cascades: closes master fd, then `kill(pid, SIGHUP)` if alive                          | `src/pty/unix.ts`; probe: child dead 400 ms after `close()`        |
| `kill(signal?)` signals only; transport untouched                                                          | probe + source                                                     |
| `pause()`/`resume()` gate master reads (public API, no private poking)                                     | probe: zero chunks while paused                                    |
| `onData` delivers `Buffer` when `encoding: null`, `string` when `"utf8"`                                   | probe                                                              |
| string `write` round-trips UTF-8 in both modes                                                             | probe (`héllo→世界`)                                               |
| `onExit` payload `{ exitCode: number, signal: number }`, `0` = no signal; signal-death keeps `exitCode: 0` | probe (SIGTERM → `{0, 15}`)                                        |
| exec failure: no throw; observed as immediate exit (code 1)                                                | probe                                                              |
| geometry delivery + `resize` visible to child (`TIOCSWINSZ`)                                               | probe (`29 61` → `50 100`)                                         |
| no transport-EOF event on the public surface                                                               | `src/pty/types.ts` (events: `onData`, `onExit` only)               |
| types ship as `dist/index.d.mts` siblings; no `using` syntax in dist (Node 22 safe)                        | tarball inspection                                                 |

## Adapter decisions

### 1. Native gate at readiness (never the pipe fallback)

`createZigptyBackend()` `await import("zigpty")` once, structurally narrows
`spawn`, and rejects `hasNative === false` with `UniPtyError("unsupported")`.
The pipe fallback would fake PTY semantics (`isatty` false, no kernel
geometry), which the evidence law forbids claiming as support.

### 2. Native representation surface

`ZigptyBackendOptions`:

- `encoding?: "buffer" | "utf8"` (default `"buffer"`): `"buffer"` maps to
  substrate `encoding: null` (byte output, Core decodes incrementally);
  `"utf8"` maps to substrate text output.
- `writeDecode?: true | TextDecoder` — allowed in **both** modes (deviation
  from the node-pty adapter, where buffer mode already accepts byte writes).
  zigpty's `write(data: string)` is text-only in both modes, so the strict
  endpoint rejects byte input with `unsupported` and `writeDecode` is the
  sanctioned byte-input convenience: a stateful per-Endpoint `TextDecoder`.
  Declared input: `"text"` strict / `"both"` with `writeDecode`.
  Atomicity (codex round-2): admission accounting runs on the RAW value
  before any decoder state advance; byte values are admitted raw and decoded
  at pump time. A value rejected by saturation therefore never touches
  decoder state — retrying the same bytes decodes identically (pinned by the
  "rejected value never advances decoder state" test). A fatal decode at
  pump time fails the input surface terminally (pending dropped, drain
  rejects with `invalid-argument`, later writes rethrow).
- `name`, `writeQueueBytes` (default 1 MiB, soft resume at 3/4): identical
  semantics to the node-pty adapter, including whole-value `backpressure`
  saturation rejection and boolean Write Readiness.

### 3. Lifecycle mapping

- `close()`: logical close (reject write/resize, reject drain waiters,
  complete the output source, `pause()` master reads) — and **defer** the
  substrate `close()` until `exited` settles, because substrate close
  SIGHUPs a live child (probe-confirmed cascade). Physical teardown after
  exit is safe: the liveness probe inside substrate close finds a dead pid
  and skips the signal.
- `terminate()`: substrate `kill()` default (`SIGHUP`), idempotent via
  adapter flag; ESRCH from an already-dead child is swallowed by try/catch.
- `exited`: `onExit` wrapped once; numeric signal → name through a reverse
  `os.constants.signals` map (`0` → `null`), `exitCode` passed through as
  reported. Repeatably awaitable; survives `close()`.
- Output source completion: synthesized from `exited` settling, deferred one
  macrotask so trailing chunks enqueue before EOF (Bun-route precedent —
  `Bun.Terminal` performs the same exit-driven synthesis when the transport
  callback does not fire). Declared substrate limits of the synthesis:
  post-leader-death output from descendants still holding the slave is cut,
  and a transport read error is indistinguishable from clean EOF. Backpressure
  wiring uses the public `pause()`/`resume()`.

### 4. Route registry re-keying

`OFFICIAL_ROUTE_PACKAGES` in `packages/conformance/src/catalog.ts` is keyed
by runtime (`node|bun|deno`); a second node-route collides. It becomes keyed
by route id (`node-pty`, `bun`, `deno-sigma__pty-ffi`, `zigpty`) — matching
the runner/CI route ids that already exist — and the coverage gate loop and
its unit tests follow. First-phase gate semantics are unchanged for the
existing three routes and now include zigpty.

### 5. Scope boundaries

- Targets declare `[{ runtime: "node", os: ["darwin", "linux"] }]` and the
  factory fails closed on win32: the substrate's public `pause()`/`resume()`
  are no-ops on Windows (0.2.1), so consumer-paced output backpressure cannot
  propagate there. A Windows prebuild existing is not usable support; the
  gate lifts only with real Windows conformance evidence. Bun-runtime cells
  remain future evidence work, presented as not-targeted until then.
- Substrate pinned exactly `zigpty@0.2.1` (0.x, active development).
- No capability tokens in v1 of this route (parity with node-pty route;
  `kill(signal)` exists but stays substrate-internal behind `terminate()`).
