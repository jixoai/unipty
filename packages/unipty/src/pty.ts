/**
> Orthogonal intents (2026-08-20): public Pty surface; public UniPty Core
> instance; spawn/geometry options ownership.
>
> Original request (2026-08-17): one observable PTY contract across Node,
> Bun, and Deno with explicit lifecycle, representation-selecting streams,
 * and no implicit shell evaluation.
 */

import type { CapabilityToken } from "./capability.ts";
import type { BackendExitResult, NativeChunk } from "./native.ts";
import type { ReadyPtyBackend } from "./backend.ts";

/**
 * Independent child-process completion observation. It is separate from
 * Terminal Stream completion (transport EOF/read error) and survives both
 * stream cancellation and PTY close.
 */
export type ProcessExitResult = BackendExitResult;

/**
 * The public PTY constructed and owned exclusively by Core. All behaviour is
 * observable contract: representation-selecting output views, boolean Write
 * Readiness input, character-cell resize, and non-cascading lifecycle.
 */
export interface Pty {
  /** `true` once `close()` has published the closed state. */
  readonly closed: boolean;

  /**
   * Repeatably awaitable child-completion observation. Independent from
   * stream completion and from `close()`/`terminate()` request acceptance;
   * an established observation settles later even after close.
   */
  readonly exited: Promise<ProcessExitResult>;

  /**
   * Accept one complete input value (`string` or `Uint8Array`). Returns
   * Write Readiness: either boolean means the entire value was accepted
   * exactly once; `false` only advises the caller to pause and await
   * `drain()` and never requests a retry. Saturation rejects the whole
   * value synchronously with a typed `backpressure` failure.
   *
   * @throws UniPtyError code `closed` after close.
   * @throws UniPtyError code `backpressure` when the next complete value cannot be admitted.
   * @throws UniPtyError code `unsupported` for byte input on a strict text-only Backend.
   */
  write(data: string | Uint8Array): boolean;

  /**
   * Wait for Write Readiness recovery. Resolves immediately while ready, or
   * after a `false` result once the Backend queue recovers; rejects if input
   * becomes unusable first. Not a physical flush or child-consumption
   * guarantee.
   */
  drain(): Promise<void>;

  /**
   * Create the Terminal Stream for this PTY in the requested representation.
   * One active stream per PTY; a concurrent second view fails with
   * `active-stream`. Cancelling the stream (directly or by leaving `for
   * await...of` early) detaches only that view.
   *
   * @throws UniPtyError code `active-stream` while a previous view is still established.
   * @throws UniPtyError code `closed` after close.
   * @throws UniPtyError code `unsupported` when `bytes` is requested but the Backend emits no native bytes.
   */
  stream(options: { encoding: "utf8" }): ReadableStream<string>;
  stream(options: { encoding: "bytes" }): ReadableStream<Uint8Array>;

  /**
   * Resize the terminal to finite positive integer character-cell
   * dimensions. A normal return means the request was accepted, not that
   * the child observed it.
   *
   * @throws UniPtyError code `invalid-argument` for non-positive, fractional, non-finite, or non-integer values.
   * @throws UniPtyError code `closed` after close.
   * @throws UniPtyError code `unsupported` when the Backend cannot resize.
   */
  resize(cols: number, rows: number): void;

  /**
   * Idempotent synchronous termination request. Acceptance does not wait
   * for, or synthesize, the independent exit observation, and does not
   * implicitly close the PTY transport.
   */
  terminate(): void;

  /**
   * Idempotent synchronous logical resource/transport close. Publishes the
   * `closed` state before returning; later `write()`, `resize()`, and new
   * `stream()` calls reject with `closed`. Completes the active Terminal
   * Stream normally. Does not implicitly request child termination;
   * physical cleanup may finish asynchronously.
   */
  close(): void;

  /**
   * Opaque Backend capability lookup by token object identity. Returns
   * `undefined` when the Backend did not register that token — including
   * equal-looking tokens from duplicate package copies. No string-name
   * fallback exists.
   */
  capability<T>(token: CapabilityToken<T>): T | undefined;
}

/** Terminal-stream encoding selector; there is no `binary` label. */
export type PtyStreamEncoding = "utf8" | "bytes";

/** Options for `unipty.spawn(argv, options)`. */
export interface UniPtySpawnOptions {
  /** Child working directory; omitted means Backend inheritance. */
  readonly cwd?: string;
  /**
   * Child launch environment. This is launch context: it does not
   * participate in Core geometry resolution.
   */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /**
   * Initial terminal geometry in character cells. Each omitted dimension
   * resolves independently: explicit value, then valid Core-host
   * `COLUMNS`/`LINES`, then a trustworthy host TTY size, then `80`/`24`.
   * Explicitly invalid values fail with `invalid-argument`.
   */
  readonly terminal?: {
    readonly cols?: number;
    readonly rows?: number;
  };
}

/** Construction options for the configured Core instance. */
export interface UniPtyOptions<TBackend extends ReadyPtyBackend> {
  /** One already-ready Backend; the same instance is exposed as `backend`. */
  readonly backend: TBackend;
}

/**
 * Terminal stream chunk types by representation, for documentation and
 * conformance tooling. `utf8` views yield `string`; `bytes` views yield
 * native `Uint8Array` chunks (native `Buffer` values may pass through, but
 * Buffer is not the public type).
 */
export type TerminalStreamChunk<TEncoding extends PtyStreamEncoding> = TEncoding extends "utf8"
  ? string
  : Uint8Array;

/** Re-exported for Backend authors implementing the output source. */
export type { NativeChunk };
