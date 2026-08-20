/**
> Orthogonal intents (2026-08-20): @unipty/shell-parser public entry — the
 * Bash classification API over the unbash thin wrapper.
 *
 * Original request (2026-08-17): an optional official ecosystem package that
 * lowers command text toward UniPty's structured launch without executing
 * anything or exposing the wrapped parser's AST.
 */

export { classifyBash as parse } from "./classify.ts";
export type { ShellParseDiagnostic, ShellParseResult } from "./result.ts";
