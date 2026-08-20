> Orthogonal intents (maintained 2026-08-20 Asia/Shanghai): ecosystem gap;
> shared result contract; two language packages; publication independence.
>
> Original request (2026-08-20 Asia/Shanghai): the Owner accepted the
> next-goal discussion that `@unipty/shell-parser` + PowerShell adapter is
> valuable now; the direction was fixed by the v1 living spec and shell-parser
> ecosystem research (2026-08-18), not reinvented here.

## Why

UniPty Core accepts only structured argv and never evaluates command text.
Consumers migrating from string-command tooling must currently hand-write that
translation. The v1 architecture already reserved optional official Shell
Parser packages that lower command text toward a structured launch without
ever executing it; research fixed `unbash` as the Bash thin-wrapper candidate
and the official `Parser.ParseInput` as the PowerShell semantic authority.
Nothing implements that reserved seam today.

## What Changes

- Add `@unipty/shell-parser`: a synchronous thin wrapper over `unbash` that
  classifies Bash command text into the shared result contract and never
  exposes the unbash AST.
- Add `@unipty/powershell-parser`: an async adapter that calls the official
  PowerShell `Parser.ParseInput` through an explicit `pwsh` host, reports a
  typed `capability-unavailable` failure when no host exists, and never falls
  back to Bash-like parsing.
- Fix the shared top-level classification contract (`argv | script |
incomplete | unsupported | invalid`) as the only stable boundary; one
  language's grammar is never the other's oracle.
- Add per-language fixture corpora as ordinary package unit tests; parser
  packages stay out of the PTY conformance/evidence matrix.
- Extend the release publishable set and the architecture ownership rules for
  the two new standalone packages; npm trusted publishers for the new names
  are an Owner-side prerequisite recorded in tasks.

## Capabilities

### New Capabilities

- `shell-parsing`: Optional official parser packages that classify command
  text into a direct structured launch, an explicit Shell Script Request, or
  invalid/incomplete/unsupported input, without executing anything and
  without leaking third-party ASTs.

## Impact

- New packages `packages/shell-parser` and `packages/powershell-parser`;
  no change to Core, Backend, acquisition, helper, or conformance code.
- `scripts/check-architecture.sh.ts` gains parser ownership rules (standalone;
  nothing depends on them at runtime).
- `.github/workflows/release.yml` publishable set grows by the two names,
  published first for atomicity.
- The first release carrying these packages requires Owner-configured npm
  trusted publishers for the new package names.
- Out of scope: the www release-catalog schema fix (landed separately in
  `586e24c`); this change only references the real catalog schema.
