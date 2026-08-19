/**
> Orthogonal intents (2026-08-20): ready Backend and Core-private Endpoint
> seam; structured launch facts.
>
> Original request (2026-08-17): PtyBackend supplies a Core-private Endpoint
> and never constructs the public Pty; Core alone owns public streams,
 * bootstrap buffering, conversion, backpressure, common errors, and
 * lifecycle state.
 */

import type { CapabilityToken } from "./capability.ts";
import type { BackendExitResult, NativeChunk, NativeInput, NativeRepresentation } from "./native.ts";

/**
 * Structured launch request handed to a ready Backend. Geometry is already
 * resolved by Core: `cols` and `rows` are concrete finite positive
 * character-cell dimensions. `env` values are plain strings; `cwd` is
 * omitted when the Backend should inherit its own working directory.
 */
export interface StructuredLaunch {
  /** Non-empty argv; the first element is the executable. */
  readonly argv: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly cols: number;
  readonly rows: number;
}

/**
 * Core-private transport handle for one PTY. The Endpoint supplies native
 * transport facts only; it does not construct, return, or independently own
 * the public `Pty`.
 *
 * Observable contract:
 * - `output` is one ordered source of explicitly tagged native chunks,
 *   consumed only by Core. Public stream cancellation never propagates as
 *   cancellation of this source.
 * - `exited` is repeatably awaitable and independent from transport EOF,
 *   stream cancellation, and close.
 * - `write` synchronously accepts one complete native value and returns
 *   Write Readiness (`false` = pause and await `drain()`, never retry);
 *   saturation rejects the whole value with a typed `backpressure` failure.
 * - `resize` mirrors the public operation over character cells and reports
 *   unsupported limits through an explicit typed failure.
 * - `close()` releases PTY transport without requesting child termination;
 *   `terminate()` requests child termination without closing transport. Both
 *   are idempotent, synchronous, and non-cascading.
 */
export interface BackendEndpoint {
  /** Declared native representations this Endpoint accepts and emits. */
  readonly native: {
    readonly input: NativeRepresentation;
    readonly output: NativeRepresentation;
  };

  /** One ordered private output source consumed only by Core. */
  readonly output: ReadableStream<NativeChunk>;

  /** Repeatably awaitable child-completion observation. */
  readonly exited: Promise<BackendExitResult>;

  /**
   * Backend-owned capabilities exposed to the public Pty, matched by token
   * object identity. Absent or a token not present here yields `undefined`.
   * Type agreement between a token and its registered payload is a Backend
   * responsibility; Core treats payloads as opaque and cannot verify it at
   * runtime.
   */
  readonly capabilities?: ReadonlyMap<CapabilityToken<unknown>, unknown>;

  write(input: NativeInput): boolean;
  drain(): Promise<void>;
  resize(cols: number, rows: number): void;
  close(): void;
  terminate(): void;
}

/**
 * A Backend that has finished all acquisition work (native loading,
 * connection, authentication, capability negotiation) before Core
 * construction. Core accepts the ready object itself — never a name,
 * registry entry, or factory — and never awaits it.
 */
export interface ReadyPtyBackend {
  /** Synchronously create one Core-private Endpoint for a structured launch. */
  spawn(launch: StructuredLaunch): BackendEndpoint;
  /** Release shared Backend resources; invoked by `UniPty.dispose()` after all PTYs close. */
  dispose(): Promise<void>;
}
