/**
> Orthogonal intents (2026-08-20): unbash thin-wrapper classification —
 * error triage and the literal-word whitelist walker.
 *
 * Original request (2026-08-18 research judgment 1): map unbash's AST and
 * diagnostics onto the classification contract without leaking its AST; any
 * error, expansion, substitution, pipeline, redirect, or non-single-literal
 * command must never claim a safe `argv` downgrade.
 */

import { parse as parseUnbash } from "unbash";
import type { ParsedScript, Word, WordPart } from "unbash";
import type { ShellParseDiagnostic, ShellParseResult } from "./result.ts";

/**
 * unbash 4.0.10 reports end-of-input-shaped failures through these message
 * shapes ("unterminated double quote", "unterminated command substitution",
 * "expected command after '|'"). The dependency is pinned exactly so this
 * heuristic stays deterministic; any other message is treated as invalid.
 */
const INCOMPLETE_MESSAGE_PATTERN =
  /unterminated|end of (?:the )?input|unexpected end|expected \w+ after/i;

const PARTLESS_FORBIDDEN = /[\*\?\[\\$`]/;

/** A walked word is exactly literal, carries shell semantics, or cannot be judged. */
type WordOutcome = { kind: "literal"; value: string } | { kind: "shell" } | { kind: "unprovable" };

function literalWord(word: Word): WordOutcome {
  if (word.parts === undefined) {
    // Partless words are raw unquoted text: any escape, glob, expansion, or
    // leading-tilde character keeps the shell's runtime semantics alive.
    if (PARTLESS_FORBIDDEN.test(word.text) || word.text.startsWith("~")) {
      return { kind: "shell" };
    }
    return { kind: "literal", value: word.value };
  }
  for (const part of word.parts) {
    if (!partIsLiteral(part)) {
      return partIsKnown(part) ? { kind: "shell" } : { kind: "unprovable" };
    }
  }
  return { kind: "literal", value: word.value };
}

function partIsKnown(part: WordPart): boolean {
  switch (part.type) {
    case "Literal":
    case "SingleQuoted":
    case "AnsiCQuoted":
    case "DoubleQuoted":
    case "LocaleString":
    case "SimpleExpansion":
    case "ParameterExpansion":
    case "CommandExpansion":
    case "ArithmeticExpansion":
    case "ProcessSubstitution":
    case "ExtendedGlob":
    case "BraceExpansion":
      return true;
    default:
      return false;
  }
}

function partIsLiteral(part: WordPart): boolean {
  switch (part.type) {
    case "Literal":
    case "SingleQuoted":
      // Static escape processing only; no runtime expansion semantics.
      return true;
    case "AnsiCQuoted":
      // ANSI-C strings are static after escape processing, but a NUL in the
      // value cannot become an argv element.
      return !part.value.includes("\0");
    case "DoubleQuoted":
      // Quoted strings are literal only when every nested child is literal;
      // any expansion child keeps shell semantics.
      return part.parts.every((child) => child.type === "Literal");
    case "LocaleString":
      // $"..." performs a runtime localization lookup; never statically
      // literal.
      return false;
    default:
      // Expansions, substitutions, globs, and brace expansions are never
      // provably literal.
      return false;
  }
}

const script = (source: string): ShellParseResult => ({ kind: "script", language: "bash", source });

const unsupported = (range: { start: number; end: number }): ShellParseResult => ({
  kind: "unsupported",
  diagnostics: [{ message: "word construct cannot be classified as literal", range }],
});

/** Classify Bash command text; never executes anything. */
export function classifyBash(source: string): ShellParseResult {
  const parsed: ParsedScript = parseUnbash(source);

  if (parsed.errors !== undefined && parsed.errors.length > 0) {
    const diagnostics: ShellParseDiagnostic[] = parsed.errors.map((error) => ({
      message: error.message,
      range: { start: error.pos, end: error.pos },
    }));
    const allIncomplete = parsed.errors.every((error) =>
      INCOMPLETE_MESSAGE_PATTERN.test(error.message),
    );
    return { kind: allIncomplete ? "incomplete" : "invalid", diagnostics };
  }

  if (source.trim() === "") {
    return { kind: "invalid", diagnostics: [{ message: "empty input" }] };
  }
  // A shebang or a statement-free (comment-only) body is script territory:
  // even a shell no-op is shell semantics the caller must accept.
  if (parsed.shebang !== undefined || parsed.commands.length !== 1) {
    return script(source);
  }

  const statement = parsed.commands[0];
  if (
    statement === undefined ||
    statement.background ||
    statement.redirects.length > 0 ||
    statement.command.type !== "Command"
  ) {
    return script(source);
  }
  const command = statement.command;
  if (command.name === undefined || command.prefix.length > 0 || command.redirects.length > 0) {
    return script(source);
  }

  const walked = [command.name, ...command.suffix].map(literalWord);
  const firstUnprovable = walked.findIndex((outcome) => outcome.kind === "unprovable");
  if (firstUnprovable !== -1) {
    const word: Word | undefined =
      firstUnprovable === 0 ? command.name : command.suffix[firstUnprovable - 1];
    return unsupported({ start: word?.pos ?? 0, end: word?.end ?? source.length });
  }
  if (walked.some((outcome) => outcome.kind === "shell")) {
    return script(source);
  }

  const argv = [command.name, ...command.suffix].map((word) => word.value);
  return { kind: "argv", argv };
}
