> Orthogonal intents (maintained 2026-08-20 Asia/Shanghai): contract-first
> packages; corpus-driven classification; workspace wiring; Owner release
> prerequisites.

## 1. Contract and packages

- [x] 1.1 Scaffold `@unipty/shell-parser` (dep: `unbash`) and
      `@unipty/powershell-parser` (no deps) with the repo build/typecheck/test
      conventions and bilingual READMEs. (depends: none; verify: workspace
      install, build, and typecheck pass)
- [x] 1.2 Define each package's public result types implementing the shared
      classification contract without exposing third-party ASTs. (depends: 1.1;
      verify: declaration/type tests compile without `any`)

## 2. Bash thin wrapper

- [x] 2.1 Implement the whitelist walker: single simple command, all-literal
      words, nested-script diagnostics check, end-of-input vs invalid error
      split. (depends: 1.2; verify: corpus covers quoting, empty args, globs,
      tilde, variables, substitutions, redirects, pipelines, lists, compounds,
      background, assignments, heredocs, comments, unterminated quotes)
- [x] 2.2 Enforce the lexical-argv edge rules from review round 1: locale
      strings (`$"..."`) and ANSI-C strings containing NUL never claim argv;
      builtin-named commands stay lexical argv with caller-owned dispatch.
      (depends: 2.1; verify: corpus covers `echo $"x"`, NUL `$'..'` variants,
      `exec ls`, `cd /tmp`)

## 3. PowerShell adapter

- [x] 3.1 Implement the `-EncodedCommand` host adapter: stdin transport,
      official-parser classification, JSON result mapping, typed
      `capability-unavailable`/`host-failure`/timeout errors, selectable host.
      (depends: 1.2; verify: host-dependent tests skip without `pwsh`;
      missing-host and bogus-host paths always run)
- [x] 3.2 Enforce the round-1 transport and response contract: user text
      moves over stdin as base64 UTF-8 (no environment variable), and
      non-zero exit or unknown result kind is a typed host failure, never a
      `script` downgrade. (depends: 3.1; verify: stdin round-trip corpus plus
      a hostile-kind fixture via a stub host)

## 4. Workspace wiring

- [x] 4.1 Add parser ownership rules to `scripts/check-architecture.sh.ts`
      (standalone; nothing depends on them). (depends: 1.1; verify: `pnpm
check:arch` passes with the new packages)
- [x] 4.2 Add both names to the release publishable set. (depends: 1.1;
      verify: pack produces tarballs for both names)
- [x] 4.4 Make the publish order parser-first so a missing npm Trusted
      Publisher fails before any published package creates an irreversible
      partial release. (depends: 4.2; verify: the publish step lists parser
      packages before the core/backend/helper set)
- [x] 4.3 Full local gate: build, typecheck, test, `check:arch`, `fmt:check`.
      (depends: 2.1, 3.1, 4.1, 4.2; verify: all green on one command run)

## 5. Release prerequisites (Owner-side)

- [ ] 5.1 Owner configures npm trusted publishers for
      `@unipty/shell-parser` and `@unipty/powershell-parser` bound to
      release.yml before the first tag carrying them (v0.2.0). (Owner-only;
      verify: publish job authenticates without tokens)
