# @unipty/powershell-parser

[English](./README.md) | [简体中文](./README-zh.md) · [GitHub](https://github.com/jixoai/unipty) · [Docs](https://unipty.jixoai.com)

Official PowerShell parser adapter for [UniPty](https://www.npmjs.com/package/unipty):
it classifies PowerShell command **text** toward UniPty's structured launch,
with the official PowerShell `Parser.ParseInput` API as its only semantic
authority. It never executes the input and never falls back to Bash-like
parsing.

The adapter runs inside an explicitly selected PowerShell host (`pwsh` by
default). The static adapter script travels as an `-EncodedCommand`; your
text travels separately as base64-encoded UTF-8 **on stdin**, so no caller
text is ever interpolated into a command line and no Windows console
code-page ambiguity applies.

## Usage

```ts
import { parsePowershell } from "@unipty/powershell-parser";

await parsePowershell('dotnet build -c "My Config"');
// → { kind: "argv", argv: ["dotnet", "build", "-c", "My Config"] }

await parsePowershell("a | b");
// → { kind: "script", language: "powershell", source: "a | b" }

await parsePowershell("echo 'unterminated");
// → { kind: "incomplete", diagnostics: [...] }
```

When the result is `argv`, the official parser proved exactly one command
with literal elements (literal strings, parameters like `-c`, and numeric
constants). When it is `script`, the text carries PowerShell semantics
(pipelines, redirection, `$variables`, subexpressions, multiple statements,
…) and **you** must explicitly accept that policy before launching anything.

## Host handling

```ts
import { isPowershellHostAvailable, PowershellParseError } from "@unipty/powershell-parser";

await isPowershellHostAvailable(); // → false when no pwsh exists

await parsePowershell("x", { host: "pwsh-preview" }); // explicit host choice
```

- Missing host → rejects with `PowershellParseError` code
  `capability-unavailable` (never a Bash-interpreted result).
- Host starts but exits non-zero, returns an unknown result kind, or emits
  malformed output → `host-failure` (never a silent `script` downgrade);
  exceeded budget (default 15 s, configurable via `timeoutMs`) →
  `host-timeout`.
- `Powershell 7+` (`pwsh`) is the default target; pass `options.host` for
  another executable (e.g. `powershell` for Windows PowerShell 5.1, which
  also has `Parser.ParseInput`).

## Diagnostics

Official `ParseError` records serialize as `{ message, errorId, incomplete,
range }` with UTF-16 extent offsets; errors flagged `IncompleteInput` map to
`incomplete`, all others to `invalid`.
