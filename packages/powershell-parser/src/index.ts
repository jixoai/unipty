/**
> Orthogonal intents (2026-08-20): @unipty/powershell-parser public entry —
 * the official-parser adapter API surface.
 *
> Original request (2026-08-17): an optional official ecosystem package whose
> PowerShell semantics come only from the official Parser.ParseInput API over
 * an explicit host, with typed capability failures and no execution.
 */

export { parsePowershell, isPowershellHostAvailable } from "./parse.ts";
export type { PowershellParseOptions } from "./parse.ts";
export { PowershellParseError } from "./error.ts";
export type { PowershellParseErrorCode } from "./error.ts";
export type { PowershellParseDiagnostic, PowershellParseResult } from "./result.ts";
