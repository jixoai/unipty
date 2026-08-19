# Verification record — apply run 2026-08-20

Task 9.1 command log and 9.2 traceability audit for change
`add-unipty-v1-pty-platform`. All commands ran on the tested commit
`0b57425` from a clean install state (`corepack pnpm install` with the
committed lockfile).

## Environment identity

| Dimension    | Value                                      |
| ------------ | ------------------------------------------ |
| OS           | darwin (macOS, arm64)                      |
| Node         | v22.20.0                                   |
| Bun          | 1.3.14                                     |
| Deno         | 2.9.4                                      |
| pnpm         | 10.22.0 (corepack)                         |
| Tested commit| 0b57425 (HEAD, main)                       |

## Command log (all green)

| Command | Result |
| --- | --- |
| `pnpm build` | all 8 packages build |
| `pnpm typecheck` | clean (strict, no `any`) |
| `pnpm check:arch` | 8 packages, ownership rules hold |
| `pnpm fmt:check` (`oxfmt --check .`) | clean |
| `pnpm --filter unipty test` | 102/102 |
| `pnpm --filter @unipty/backend test` | 66/66 |
| `pnpm --filter @unipty/helper-backend test` | 24/24 |
| `pnpm --filter @unipty/backend-node-pty test` | 31/31 (real PTY) |
| `cd packages/backend-bun && bun test` | 22/22 (real PTY) |
| `cd packages/backend-deno-sigma__pty-ffi && deno test -A --no-check test/` | 25/25 (real FFI PTY, offline vendored assets) |
| `pnpm --filter @unipty/conformance test` | 67/67 |
| conformance profile — node-pty | 25/25 pass, 0 fail |
| conformance profile — bun (under Bun) | 25/25 pass, 0 fail |
| conformance profile — deno-sigma__pty-ffi (under Deno) | 25/25 pass, 0 fail |
| conformance profile — mock (harness self-check) | 24 pass + 1 recorded skip (pipe transport cannot propagate geometry; keeps the evidence gate closed) |
| installed-consumer acceptance (pack → isolated install → profile → evidence) | node-pty 25/25, bun 25/25, deno 25/25; three evidence records emitted |
| catalog aggregation (3 evidence + 3 metadata snapshots, exact commit) | routes: node=1 bun=1 deno=1; catalog written |
| `packages/www` build + static checks against the locally produced real catalog | all checks pass; catalog copied byte-identical (sha recorded) |

## Requirement-to-evidence summary (task 9.2)

- `runtime-neutral-pty` + `pty-backend-seam`: 25 named conformance
  scenarios per route with the requirement map in
  `packages/conformance/src/profile/traceability.ts` (checked by
  `runTraceabilityCheck()` and unit-tested); Core unit suite 102 tests.
- `backend-acquisition`: 66 package-level tests over 19 fixture packages
  covering resolve/inspect/autoResolve/manifest/CLI laws (metadata
  side-effect probes included in the backend packages' own suites).
- `official-pty-backends`: three packages implemented, metadata
  side-effect-free (probed per package), provenance honest
  (node-pty via @lydell prebuilt distribution — upstream 1.1.0 prebuilds
  fail posix_spawnp on darwin-arm64/node22; documented in READMEs).
- `pty-conformance-evidence`: profile + report + positive-only evidence
  writer + deterministic aggregator with route gate; local run produced
  three evidence records and one catalog from the tested commit.
- `documentation-site`: zero-dependency static site, byte-identical
  catalog copy, three-state presentation, retryable Pages workflow.
- Out-of-scope features absent: no persistence/reconnect, no second
  registry, no implicit shell execution, no signal API in the common
  surface, no asset report/copier/`./unipty.build` (arch check enforces
  the dependency directions; spec laws enforced by tests).

## Known substrate truths (documented, not contract violations)

- Deno `pty_close` kills and drops in one primitive: `close()` defers the
  physical close until child exit; a terminate-time unobserved exit
  settles `{null, null}` (recorded accommodation in the profile, README).
- Bun.Terminal output has no transport flow control: internal buffering is
  unbounded on the substrate side (README "Substrate truth").
- Bun child limitations (static `stdout.columns`, no `setRawMode`) are
  handled inside the conformance fixtures, not the public contract.

## Owner-only acceptance (deferred by design)

- 9.3 release artifact acceptance (npm publication is wired but
  Owner-gated in `release.yml`).
- 9.4 deployed-site visual acceptance and CNAME/DNS.
