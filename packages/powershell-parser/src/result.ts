/**
> Orthogonal intents (2026-08-20): PowerShell classification result types —
 * the parser-package share of the shared classification contract.
 *
 * Original request (2026-08-17): PowerShell semantics come only from the
 * official Parser.ParseInput API; the stable boundary is the classification
 * result, never a PowerShell AST.
 */

/** Serializable diagnostic reported by the official PowerShell parser. */
export interface PowershellParseDiagnostic {
  readonly message: string;
  readonly errorId?: string;
  readonly incomplete?: boolean;
  readonly range?: { readonly start: number; readonly end: number };
}

/**
 * Top-level classification of PowerShell command text.
 *
 * `argv` covers only single commands whose elements are literal strings,
 * parameters, or constants after the official parser's own quote rules;
 * everything else with shell semantics is a `script` request. `unsupported`
 * is part of the shared parser contract but the official parser always
 * reaches a decision, so this adapter never returns it.
 */
export type PowershellParseResult =
  | { readonly kind: "argv"; readonly argv: readonly string[] }
  | { readonly kind: "script"; readonly language: "powershell"; readonly source: string }
  | {
      readonly kind: "incomplete" | "unsupported" | "invalid";
      readonly diagnostics: readonly PowershellParseDiagnostic[];
    };
