# @unipty/shell-parser

[English](./README.md) | [简体中文](./README-zh.md) · [GitHub](https://github.com/jixoai/unipty) · [Docs](https://unipty.jixoai.com)

Official Bash shell parser for [UniPty](https://www.npmjs.com/package/unipty): it
classifies command **text** toward UniPty's structured launch without ever
executing anything. It is an optional ecosystem package — the UniPty core has
no string-command overload and never evaluates text through a shell.

It is a thin wrapper over [`unbash`](https://www.npmjs.com/package/unbash)
(pinned exactly) whose only public surface is the classification result; the
unbash AST is never exposed.

## Usage

```ts
import { parse } from "@unipty/shell-parser";

parse("git status --force");
// → { kind: "argv", argv: ["git", "status", "--force"] }

parse("ls *.txt | wc -l");
// → { kind: "script", language: "bash", source: "ls *.txt | wc -l" }

parse("echo 'unterminated");
// → { kind: "incomplete", diagnostics: [...] }
```

When the result is `argv`, the text was **lexically** one simple command of
literal words (quoting and empty arguments preserved) — a direct-launch
candidate you can feed to `unipty.spawn(argv)`. Executable resolution (PATH,
builtins, functions, aliases) stays **your** decision; the parser never
claims process-launch equivalence for a command name. When the result is
`script`, the text carries shell semantics (pipelines, redirection,
expansions, substitutions, globs, tilde, background, assignments, locale
strings, compound statements, …) and **you** must explicitly accept the
named shell policy before launching anything.

## Classification policy

- `argv` — exactly one simple command; every word is literal after static
  quote processing; no expansions, substitutions, globs, tilde, escapes,
  locale strings (`$"..."`), ANSI-C strings containing NUL, redirects,
  assignment prefixes, operators, or compound constructs.
- `script` — parses cleanly and has shell semantics (or is comment-only /
  carries a shebang); returned with the original source unchanged.
- `incomplete` / `invalid` — unbash diagnostics, split by end-of-input-shaped
  messages; diagnostics carry UTF-16 source ranges.
- `unsupported` — a word construct the walker cannot judge; never guessed.

Escaped metacharacters (`echo \*`) and unquoted bracket characters
(`[ -f x ]`) also classify as `script`: the walker proves literalness from
raw word text, so anything ambiguous stays a shell request.

## Requirements

Pure JavaScript with zero platform APIs: works in Node, Bun, and Deno
wherever ESM imports resolve. No relationship to `unipty` at runtime — the
packages are structurally compatible by design, not by dependency.
