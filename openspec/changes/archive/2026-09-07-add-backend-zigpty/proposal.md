> Orthogonal intents (maintained 2026-09-07 Asia/Shanghai): add the zigpty
> substrate as a fourth official Backend route.
>
> Original request (2026-09-07 Asia/Shanghai): 新增 backend zigpty
> (github.com/pithings/zigpty)，测试并验证通过后发布新版本。

## Why

The first phase shipped one route per runtime (`node-pty`, `Bun.Terminal`,
`@sigma/pty-ffi`). `zigpty` (npm `zigpty@0.2.1`, maintained by pi0/UnJS) is a
credible second Node-route substrate: Zig-built NAPI prebuilds for 8 tuples
bundled in-tarball (zero runtime dependencies, no postinstall, no install
scripts), a node-pty-compatible surface, and much smaller artifacts than the
node-pty distribution. The architecture never capped routes at one per
runtime; route identity is the substrate, so `zigpty` extends the official
set rather than replacing the node-pty route.

## What Changes

- New official package `@unipty/backend-zigpty` (route id `zigpty`,
  runtime target `node`), adapting substrate `zigpty` behind the standard
  `createZigptyBackend(options)` factory + `./unipty.metadata` protocol.
- Adapter-owned guards verified against the substrate sources (probe
  evidence 2026-09-07, darwin-arm64, Node 24):
  - factory readiness rejects `hasNative === false` with `unsupported` —
    the substrate's silent pipe-based fallback is never entered;
  - `close()` defers substrate `close()` until `exited` settles — the
    substrate close closes the master fd and explicitly sends `SIGHUP`,
    which would cascade transport close into child termination;
  - output-source completion is synthesized from `exited` settling (one
    macrotask deferred) because the substrate exposes no transport-EOF
    event — same pattern as the Bun route;
  - `write()` accepts text only (substrate signature); byte input is
    rejected unless the Backend-owned `writeDecode` option decodes it.
- Route registry keyed by route id instead of runtime: the catalog's
  `OFFICIAL_ROUTE_PACKAGES` becomes `node-pty | bun | deno-sigma__pty-ffi |
zigpty` → package names, and the first-phase release gate now requires
  one native passing tuple for **each of the four** routes.
- CI conformance matrix gains `zigpty` cells (ubuntu, macos; node runtime);
  release publish list gains the new package; architecture check,
  conformance runner maps, example app, and www route cards follow.
- Versioning: the new package joins at `0.2.0`; all other package versions
  are unchanged (release publish skips already-published versions), tag
  `v0.2.1`.

## Capabilities

### Added Capabilities

- `official-pty-backends`: the official zigpty route with its
  substrate-specific guards (native gate, deferred transport teardown,
  synthesized transport EOF, text-only input with optional `writeDecode`).
- `pty-conformance-evidence`: route registry keyed by route identity;
  release route-coverage gate spans every official route including zigpty.
