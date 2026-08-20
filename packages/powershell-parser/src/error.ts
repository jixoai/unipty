/**
> Orthogonal intents (2026-08-20): typed environmental failures for the
 * PowerShell host adapter.
 *
 * Original request (2026-08-18 research judgment 6): a missing PowerShell
 * host must be an explicit capability failure; the adapter never falls back
 * to Bash-like parsing.
 */

export type PowershellParseErrorCode =
  /** No usable PowerShell host executable is installed. */
  | "capability-unavailable"
  /** The host started but failed or returned an unusable response. */
  | "host-failure"
  /** The host exceeded the configured time budget and was terminated. */
  | "host-timeout";

export class PowershellParseError extends Error {
  readonly code: PowershellParseErrorCode;

  constructor(code: PowershellParseErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PowershellParseError";
    this.code = code;
  }
}
