/**
> Orthogonal intents (2026-08-20): common operational error discriminant.
>
> Original request (2026-08-17): runtime-neutral PTY contract. The contract
> matches failures on the stable `code` value, never on shared `Error` class
> identity; the exported class exists so Core and Backend authors construct
> failures with the same discriminant and structured details.
 */

/** Stable v1 common operational failure codes. */
export type UniPtyErrorCode =
  | "unsupported"
  | "closed"
  | "backpressure"
  | "invalid-argument"
  | "active-stream";

/**
 * Common operational failure carrying a stable discriminant `code`.
 *
 * Cross-runtime `Error` class identity is not part of the contract: consumers
 * branch on `error.code` only. Backend-specific diagnostics belong in
 * `details` and/or `cause`, never in message text.
 */
export class UniPtyError extends Error {
  readonly code: UniPtyErrorCode;
  readonly details?: unknown;

  constructor(
    code: UniPtyErrorCode,
    message: string,
    options?: { details?: unknown; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "UniPtyError";
    this.code = code;
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }
}

/** Throw an `invalid-argument` failure for a malformed public argument. */
export function throwInvalidArgument(message: string, details?: unknown): never {
  throw new UniPtyError("invalid-argument", message, { details });
}
