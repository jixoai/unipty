/**
> Orthogonal intents (2026-08-20): typed environmental failures for the
 * PowerShell host adapter.
 *
 * Original request (2026-08-18 research judgment 6): a missing PowerShell
 * host must be an explicit capability failure; the adapter never falls back
 * to Bash-like parsing.
 */

/**
 * Typed failure codes for environmental host problems. These never appear as
 * parse classifications: a failing host is reported explicitly and never
 * degrades to a Bash-like or `script` reading.
 */
export type PowershellParseErrorCode =
  /** No usable PowerShell host executable is installed (`ENOENT`). */
  | "capability-unavailable"
  /** The host started but exited non-zero, returned an unknown result kind, or produced malformed output. */
  | "host-failure"
  /** The host exceeded the configured time budget and was terminated. */
  | "host-timeout";

/** Environmental host failure thrown by {@link parsePowershell}; inspect `code` for the stable cause. */
export class PowershellParseError extends Error {
  readonly code: PowershellParseErrorCode;

  constructor(code: PowershellParseErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PowershellParseError";
    this.code = code;
  }
}
