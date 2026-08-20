# Verification record — apply run 2026-08-20

Change `add-shell-parser-ecosystem`: both parser packages implemented,
reviewed through two Codex rounds, published in release v0.2.0, and the site
redeployed from that release's catalog artifact.

## Review loop

| Round | Reviewer      | Model                 | Result                                                                                             |
| ----- | ------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| 1     | Codex (Herdr) | gpt-5.6-terra / xhigh | 4.5/10 — 3×P0: Bash argv semantic claim, PowerShell stdin contract violation, partial-release risk |
| 2     | Codex (Herdr) | gpt-5.6-terra / xhigh | 8.3/10 — all P0s verified closed; 1 governance P1 resolved by spec adjudication (`22929b9`)        |

## Local gate (tested commit `2e6c90d` → spec-only follow-up `22929b9`)

- `pnpm build`, `pnpm typecheck`, `pnpm check:arch` (11 packages), `pnpm
fmt:check` — pass.
- `@unipty/shell-parser` — 67/67, including round-1 corpus additions
  (`$"..."` locale strings, NUL-bearing `$'...'`, `exec`/`cd` lexical argv).
- `@unipty/powershell-parser` — 36/36 against a portable pwsh 7.6.5 host,
  including the base64-stdin non-ASCII round trip and three stub-host
  hostile-response cases; CI ubuntu runners exercise the same full suite
  (run 32359567929).
- `node packages/www/scripts/check-site.mjs` — pass on both fixtures.
- `openspec validate add-shell-parser-ecosystem --strict` — valid.

## Release evidence (tag `v0.2.0`, commit `22929b9`)

- CI run 32361331549: 11/11 jobs green; 6 native conformance artifacts
  (bun/deno/node-pty × macos/ubuntu).
- Release run 32361565977: route coverage + catalog aggregation green;
  publish green — all eight packages at 0.2.0 on npm via Trusted
  Publishing, including `@unipty/shell-parser` and
  `@unipty/powershell-parser` (task 5.1 Owner gate satisfied and verified).
- `catalog.json` attached to the v0.2.0 GitHub release; deploy-www run
  32361888339 redeployed the site from it (live page shows v0.2.0).

## Known non-blocking notes

- Sequential npm publish cannot be fully transactional; the parser-first
  order plus the Owner-side dual Trusted-Publisher gate is the recorded
  atomicity decision (spec delta, `22929b9`).
- The pre-existing Bun real-PTY geometry unit test is timing-sensitive under
  heavy parallel local load (passes serially and in CI); not introduced or
  affected by this change.
