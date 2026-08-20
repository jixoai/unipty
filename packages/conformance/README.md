# @unipty/conformance

Private workspace package: the **installed-public-package conformance
harness**, the positive Verification Evidence writer, and the deterministic
release catalog aggregator. Not published; the sole acceptance seam for any
native PTY support claim.

Internal workspace package · [GitHub](https://github.com/jixoai/unipty) · [Workspace README](../../README.md)

## Law

Tests judge the packages a **consumer installs** — packed tarballs installed
into an isolated consumer — driven only through public exports and a real
child program in a real PTY. Adapter-internal tests and mocks support local
diagnostics but can never establish native support.

## Profile

25 named scenarios per Backend route cover the `runtime-neutral-pty` and
`pty-backend-seam` requirements: structured launch (metacharacters as data),
per-dimension geometry fallback, both stream representations with split
multibyte reconstruction, one-active-stream, detach-only cancellation,
bounded bootstrap ordering, write readiness/drain/whole-value saturation,
child-observed resize, separated EOF/exit observations, non-cascading
close/terminate, graceful disposal, capability identity, and stable error
codes. Requirement mapping lives in `src/profile/traceability.ts` and is
unit-checked for gaps.

```sh
# From the workspace (workspace-source run):
pnpm --filter @unipty/conformance run conformance --backend node-pty --emit-evidence
bun  packages/conformance/runners/run-profile.ts --backend bun --emit-evidence          # under Bun
deno run -A --no-check packages/conformance/runners/run-profile.ts \
  --backend deno-sigma__pty-ffi --emit-evidence                                         # under Deno
```

## Installed-consumer acceptance (the release gate seam)

```sh
node packages/conformance/scripts/pack-and-install.mjs node-pty
node packages/conformance/scripts/run-installed-profile.mjs node-pty node
```

Packs the publishable set, installs the tarballs into an isolated
`.conformance-install/` consumer (pnpm `--ignore-workspace`, registry-free
via `file:` + overrides), and runs the profile against the installed
artifacts. Evidence is emitted only on a full pass, named per route-tuple so
sibling platforms never overwrite each other.

## Evidence & catalog

- `emitVerificationEvidence` writes one record only after a complete pass
  with exact identity (packages, runtime, OS/arch/libc tuple, suite, commit,
  ISO-8601 time). Failed/skipped/partial runs emit nothing — a failure is a
  CI diagnostic, never a permanent "unsupported" claim.
- `runners/aggregate.ts` validates schema, identity, tuple normalization,
  commit match, uniqueness, and the required Node+Bun+Deno route coverage,
  then emits one stable-order catalog artifact. The release workflow
  (`release.yml`) feeds it every collected record; duplicates and
  contradictions are rejected, never silently deduplicated.
- Presentation derives exactly three states — `verified`,
  `declared-unverified`, `not-targeted` — consumed unchanged by
  [`packages/www`](../www/).

## Testing

```sh
pnpm --filter @unipty/conformance test   # 67 scenarios (report/evidence/catalog/traceability/fixtures)
```
