> Orthogonal intents (maintained 2026-08-20 Asia/Shanghai): wrapper policy;
> host adapter mechanics; shared contract shape; workspace integration.

## Context

The v1 living spec already fixes the boundary: parsing is an optional
official ecosystem concern; results are classifications, never a shared
cross-language AST; the PowerShell authority is the official
`Parser.ParseInput`. Research (2026-08-18) selected `unbash` 4.0.10 (ISC,
pure-JavaScript ESM, sync, source-positioned diagnostics) as the Bash
thin-wrapper candidate and rejected inventing a PowerShell JS grammar.

## Decisions

1. **Standalone packages.** `@unipty/shell-parser` depends only on `unbash`;
   `@unipty/powershell-parser` has zero npm dependencies (uses
   `node:child_process`). Neither depends on Core/Backend/acquisition/helper,
   and nothing depends on them; each re-declares the shared result shape
   locally (structural compatibility is the contract, not a shared runtime
   module). `platform: neutral` for the Bash package; `platform: node` for
   the host adapter.

2. **Bash downgrade policy is a whitelist, not a blacklist.** `argv` requires
   exactly one simple command where every word reduces to concatenated
   literal segments. Anything the walker cannot prove literal — variables,
   command/arithmetic/process substitutions, globs, tilde, brace expansion,
   redirects, assignment prefixes, pipelines/lists/compounds, background
   operators, heredocs, multiple statements, comments without a command — is
   `script` (shell semantics exist) or `unsupported` (walker cannot judge).
   unbash errors are `invalid`, except end-of-input-shaped errors which are
   `incomplete`. Root and all visited nested scripts' diagnostics are checked
   first; the unbash AST never appears in public types.

3. **PowerShell adapter mechanics.** Spawn the host with
   `-NoProfile -NonInteractive -NoLogo -EncodedCommand <base64(UTF-16LE
adapter)>`; the adapter is static package code, the user text travels on
   stdin, and the adapter prints one JSON object. Classification happens in
   PowerShell where the official AST object model lives: errors map by
   `IncompleteInput`; otherwise `argv` requires exactly one statement that is
   a one-element pipeline whose `CommandAst` has no redirections and only
   literal command elements (`StringConstantExpressionAst` values,
   `ParameterAst`/`ConstantExpressionAst` extent text); everything else is
   `script`. Host executable is caller-selectable (`pwsh` default). Missing
   host or failed start → typed error code `capability-unavailable`; host
   misbehaviour → `host-failure`; a bounded default timeout guards hangs.

4. **Shared edge policy.** Empty/whitespace-only input is `invalid` with a
   diagnostic; comment-only or statement-free input is `script` (a shell
   no-op is still shell semantics the caller must accept).

5. **Verification stays local.** Per-package vitest corpora mirror spec.md
   scenarios; PowerShell tests skip their host-dependent cases when no `pwsh`
   exists and always exercise the missing-host typed failure. The packages do
   not join the PTY conformance matrix or the release catalog.

6. **Publication.** Both packages join the release.yml publishable set at
   version 0.2.0. npm trusted publishers for the two new names are
   Owner-side prerequisites; until they exist, a tagged release must not
   include them.
