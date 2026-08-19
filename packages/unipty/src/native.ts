/**
> Orthogonal intents (2026-08-20): native data-plane representations.
>
> Original request (2026-08-17): Backends may expose native bytes, native
> text, or both; the representation is always an explicit tag and never
 * inferred from a JavaScript runtime type. Text re-encoded by Core never
 * becomes native bytes.
 */

/** Which native representations a Backend surface carries. */
export type NativeRepresentation = "bytes" | "text" | "both";

/**
 * One ordered fragment of native PTY output with an explicit representation
 * tag. `bytes` and `bytes+text` carry the native byte sequence; `text` and
 * `bytes+text` carry native text. A `text` chunk never becomes claimed raw
 * bytes, and Core never re-encodes text into a `bytes` chunk.
 */
export type NativeChunk =
  | { readonly kind: "bytes"; readonly bytes: Uint8Array }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "bytes+text"; readonly bytes: Uint8Array; readonly text: string };

/**
 * Explicitly native input value for an Endpoint write. Core selects the
 * representation from the public `string | Uint8Array` input and the
 * Backend's declared native input acceptance; the strict upper layer never
 * silently decodes byte input for a text-native Backend.
 */
export type NativeInput =
  | { readonly kind: "bytes"; readonly bytes: Uint8Array }
  | { readonly kind: "text"; readonly text: string };

/**
 * Backend-observed child completion. `signal` records the observed
 * termination cause only (for example `"SIGTERM"`); it is not a common
 * `kill(signal)` control vocabulary. `exitCode` is `null` when the Backend
 * could not observe a numeric code.
 */
export interface BackendExitResult {
  readonly exitCode: number | null;
  readonly signal: string | null;
}
