/**
> Orthogonal intents (2026-08-20): shared parser classification result
 * types — the only stable public boundary of the parser packages.
 *
 * Original request (2026-08-17): shell parsing is an optional official
 * ecosystem concern; the stable boundary is result classification, never a
 * shared cross-language AST.
 */

/** Serializable parse diagnostic with a UTF-16 half-open source range. */
export interface ShellParseDiagnostic {
  readonly message: string;
  readonly range?: { readonly start: number; readonly end: number };
}

/**
 * Top-level classification of shell command text.
 *
 * - `argv`: the text is provably one simple command of literal words and can
 *   become a structured launch without any shell.
 * - `script`: the text carries shell semantics; the caller must explicitly
 *   accept the named shell policy before launching anything.
 * - `incomplete` / `unsupported` / `invalid`: the text is not classifiable as
 *   a direct launch, with positioned diagnostics.
 */
export type ShellParseResult =
  | { readonly kind: "argv"; readonly argv: readonly string[] }
  | { readonly kind: "script"; readonly language: "bash"; readonly source: string }
  | {
      readonly kind: "incomplete" | "unsupported" | "invalid";
      readonly diagnostics: readonly ShellParseDiagnostic[];
    };
