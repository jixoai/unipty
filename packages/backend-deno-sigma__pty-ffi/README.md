# @unipty/backend-deno-sigma__pty-ffi

Official UniPty Backend for the Deno runtime, adapting the third-party
[`@sigma/pty-ffi`](https://jsr.io/@sigma/pty-ffi) substrate — a Deno FFI
wrapper over the Rust [`portable-pty`](https://docs.rs/portable-pty) crate.

- **Provenance**: the implementation is `@sigma/pty-ffi` over Rust
  `portable-pty`. Deno is this route's _runtime metadata_, not its
  implementation identity; this package never claims a native Deno PTY API.
- **Distribution**: npm-only. The npm artifact is self-contained: it vendors
  the `@sigma/pty-ffi@0.42.0/noinit` JavaScript closure and the native dynamic
  libraries, so an installed consumer needs no JSR registry setup and nothing
  downloads at runtime. (`vendor/` is package-private layout, not a contract.)

## Required Deno permissions

The FFI library load needs `--allow-ffi`, importing the vendored modules
needs `--allow-read`, and `terminate()` discovers the child pid through a
`pgrep` child process (`--allow-run`) before signalling it with `Deno.kill`.
The pragmatic grant is `-A`:

```sh
deno run -A app.ts        # recommended
# or the minimal set:
deno run --allow-ffi --allow-read --allow-run app.ts
```

A missing FFI permission surfaces as a `UniPtyError` with code `unsupported`
whose message names the required flag (`Deno.errors.NotCapable` cause). If
pid discovery cannot run at terminate time (no `pgrep` on the host, or an
ambiguous listing), `terminate()` likewise fails explicitly with
`unsupported` rather than collapsing into the substrate's
kill-and-close primitive — close and terminate never cascade on this route.

## Usage

```ts
import { UniPty } from "unipty";
import { createDenoSigmaPtyFfiBackend } from "@unipty/backend-deno-sigma__pty-ffi";

const backend = await createDenoSigmaPtyFfiBackend();
const unipty = new UniPty({ backend });
const pty = unipty.spawn(["/bin/sh", "-c", "stty size"], {
  terminal: { cols: 101, rows: 37 },
});
// ... stream(), write(), resize(), terminate(), close() per the UniPty contract
```

Factory options (all optional):

- `libraryPath?: string | URL` — explicit dynamic-library override (escape
  hatch; a `URL` must be `file:`). Default: the vendored
  `vendor/lib/<os>-<arch>` library for the current Deno tuple.
- `queue?: { softBytes?: number; hardBytes?: number }` — bounded write-queue
  policy (defaults 256 KiB soft / 1 MiB hard).
- `pollIntervalMs?: number` — output poll cadence for the internal read pump
  (default 25 ms; the substrate read is non-blocking).

## Vendoring and build

`vendor/` is generated deterministically by
[`scripts/vendor.sh.ts`](scripts/vendor.sh.ts) (run with Deno ≥ 2.0):

- `vendor/js/` — the complete `jsr:@sigma/pty-ffi@0.42.0/noinit` module graph
  (`@denosaurs/plug`, `@std/*` included), mirrored from the local Deno cache
  and rewritten so every `jsr:` specifier becomes a relative one. A build gate
  scans `vendor/js/` and `dist/` and fails on any surviving `jsr:` specifier.
- `vendor/lib/<os>-<arch>/` — the native libraries from the
  `sigmaSd/deno-pty-ffi` GitHub release for 0.42.0, pinned by sha256:
  `darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `windows-x64`.
- `vendor/vendor-manifest.json` — manifest of every vendored file (source URL,
  size, sha256) plus the root `deno.lock` hash the versions were pinned from.

Versions are pinned from the repository root `deno.lock` (read-only): if the
resolved JSR graph or the lock drifts, vendoring fails instead of guessing.

```sh
corepack pnpm --filter @unipty/backend-deno-sigma__pty-ffi build:vendor  # full vendoring
corepack pnpm --filter @unipty/backend-deno-sigma__pty-ffi build        # ensure vendor -> tsdown -> jsr-free check
corepack pnpm --filter @unipty/backend-deno-sigma__pty-ffi test         # deno test -A --no-check test/
```

CI runs the default vendoring once (it may download the five release
libraries); the package `build` script uses `--ensure` so an intact `vendor/`
is not re-fetched, then rebuilds and re-runs the jsr-free scan. To add a
tuple, add the release asset (with its sha256) to `NATIVE_ASSETS` in
`scripts/vendor.sh.ts` and to the factory's `VENDORED_LIBRARIES` map.

## Substrate truth (read this before relying on lifecycle behaviour)

This adapter maps the substrate honestly rather than papering over it:

- **`pty_close` kills and drops in one primitive — so the adapter avoids it
  until it is safe.** The substrate's only teardown primitive kills the child
  first (portable-pty `ChildKiller`; SIGKILL on Unix) and then drops the
  transport. Endpoint `close()` is therefore a logical close: the physical
  `pty_close` is deferred until the child has exited (or the transport
  errored), when it can no longer kill a live child; a discard-mode exit
  watcher keeps draining so the independent exit observation stays
  settleable. Endpoint `terminate()` never calls `pty_close` on a live child:
  the child pid (discovered by diffing this process's direct children around
  the synchronous spawn, since the substrate does not expose it) is signalled
  with `SIGTERM`, and the live transport observes the real exit. When pid
  discovery was impossible — or the signal could not be delivered for any
  reason other than the child already being gone — `terminate()` fails
  explicitly with `unsupported`; it never collapses into `pty_close`.
- **Exit observation is read-based.** The exit code is only observable through
  reads that report completion. A terminate-by-pid exit is observed normally;
  a read failure leaves the result unobserved as `{ exitCode: null, signal:
null }`. An already-established observation survives close and is returned
  repeatably.
- **Signals are not distinguishable.** The substrate reports exit code `1` for
  signal-terminated children (SIGKILL and SIGTERM alike), so `signal` is
  always `null` on this route; this Backend never fabricates a signal name.
- **Input fidelity.** The substrate write path is String/CString-based: input
  containing NUL bytes is rejected with `invalid-argument` (the substrate
  would silently truncate it), and byte input must be strict UTF-8 to
  round-trip faithfully. Public `string` input is UTF-8 encoded.
- **Write readiness is proxy-based.** The substrate write channel has no
  completion signal, so the bounded queue is a window: crossing `softBytes`
  reports `false` (pause and `drain()`), exceeding `hardBytes` rejects the
  whole value with `backpressure`, and `drain()` releases the window after one
  event-loop turn (the substrate writer thread drains promptly). `drain()` is
  not a physical flush.
- **Output has no backpressure.** The substrate's reader thread always drains
  the PTY master into its own unbounded internal channel, so a stalled
  consumer cannot push back pressure to the child; the Endpoint pump always
  drains to keep that channel short and preserves exit observation
  independently of consumer pace.
- **Library lifetime.** The dlopen'd FFI library stays loaded until the Deno
  process exits; `dispose()` is a logical disposal that blocks new spawns
  only.

## Deployment note

Keep this package **external** in host bundles (do not inline it into a
bundle chunk) so `dist/` and `vendor/` stay adjacent inside the installed
package. A host layout that relocates the package must keep
`dist/index.js` and `vendor/` in the same relative arrangement this package
ships; there is no Core-level asset protocol for moving them.

## Testing

`deno test -A --no-check test/` runs 25 real-PTY tests through the vendored
assets only (no network is needed; the suite also passes when run without any
`--allow-net`). `--no-check` is deliberate: Deno 2.9's checker does not pair
the multi-file `.js`/`.d.ts` dist output of the workspace `unipty` /
`@unipty/backend` dependencies; type safety is enforced by
`corepack pnpm --filter @unipty/backend-deno-sigma__pty-ffi typecheck`
(tsc, strict).
