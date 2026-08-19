/**
> Orthogonal intents (2026-08-20): configured UniPty Core instance; public
> Pty state machine; graceful Backend disposal.
 *
 * Original request (2026-08-17): Core exclusively owns public stream views,
 * bootstrap buffering, conversion, backpressure semantics, common errors,
 * and lifecycle state. The Backend Endpoint stays Core-private; spawn is
 * synchronous because Backend acquisition already finished.
 */

import type { CapabilityToken } from "./capability.ts";
import type { BackendEndpoint, ReadyPtyBackend, StructuredLaunch } from "./backend.ts";
import type { NativeInput } from "./native.ts";
import type { ProcessExitResult, Pty, UniPtySpawnOptions } from "./pty.ts";
import { UniPtyError } from "./errors.ts";
import { resolveInitialGeometry, validateCellPair } from "./geometry.ts";
import { createOutputView, OutputPump } from "./output-pump.ts";

const encoder = new TextEncoder();

/** Core-owned public PTY implementation over one Backend Endpoint. */
class PtyImpl implements Pty {
  readonly exited: Promise<ProcessExitResult>;
  private readonly endpoint: BackendEndpoint;
  private readonly pump: OutputPump;
  private readonly closedPromise: Promise<void>;
  private readonly markClosed: () => void;
  private _closed = false;

  constructor(endpoint: BackendEndpoint) {
    this.endpoint = endpoint;
    this.exited = endpoint.exited;
    let resolveClosed!: () => void;
    this.closedPromise = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    this.markClosed = resolveClosed;
    this.pump = new OutputPump(endpoint.output);
    this.pump.start();
  }

  get closed(): boolean {
    return this._closed;
  }

  /** Resolves once `close()` has published the closed state. */
  get whenClosed(): Promise<void> {
    return this.closedPromise;
  }

  write(data: string | Uint8Array): boolean {
    this.assertOpen("write");
    const nativeInput = this.selectNativeInput(data);
    // Backend saturation rejects the whole value with a typed backpressure
    // failure; the boolean is advisory readiness only.
    return this.endpoint.write(nativeInput);
  }

  drain(): Promise<void> {
    if (this._closed) {
      return Promise.reject(
        new UniPtyError("closed", "PTY input is closed; drain() cannot recover readiness"),
      );
    }
    return this.endpoint.drain();
  }

  stream(options: { encoding: "utf8" }): ReadableStream<string>;
  stream(options: { encoding: "bytes" }): ReadableStream<Uint8Array>;
  stream(options: { encoding: "utf8" | "bytes" }): ReadableStream<string> | ReadableStream<Uint8Array> {
    this.assertOpen("stream");
    if (
      options.encoding === "bytes" &&
      this.endpoint.native.output === "text"
    ) {
      throw new UniPtyError(
        "unsupported",
        'stream({ encoding: "bytes" }) requires a Backend that exposes native Terminal Bytes; re-encoded text is never claimed as native bytes',
      );
    }
    if (this.pump.hasActiveView) {
      // One Terminal Stream per PTY: the established view must detach
      // (cancel or complete) before a new one may be created.
      throw new UniPtyError(
        "active-stream",
        "a Terminal Stream is already established for this PTY; cancel it before creating another",
      );
    }
    const stream = new ReadableStream<string | Uint8Array>({
      start: (controller) => {
        this.pump.attachView(createOutputView(options.encoding, controller));
      },
      cancel: () => {
        // Terminal Stream Detachment: only this view ends. PTY input,
        // transport, and the child process are untouched; later output is
        // drained and discarded until a future-only view subscribes.
        this.pump.detachView();
      },
    });
    return stream as ReadableStream<string> | ReadableStream<Uint8Array>;
  }

  resize(cols: number, rows: number): void {
    this.assertOpen("resize");
    validateCellPair(cols, rows);
    // The Backend executes the request or reports an explicit typed
    // `unsupported` failure; acceptance is not child observation.
    this.endpoint.resize(cols, rows);
  }

  terminate(): void {
    // Idempotent, synchronous, non-cascading request: no implicit close of
    // the PTY transport and no synthesized exit result.
    this.endpoint.terminate();
  }

  close(): void {
    if (this._closed) return;
    // Publish the public closed state before invoking physical Endpoint
    // close; later write/resize/stream calls reject with `closed`.
    this._closed = true;
    this.markClosed();
    this.pump.stop();
    this.endpoint.close();
  }

  capability<T>(token: CapabilityToken<T>): T | undefined {
    const capabilities = this.endpoint.capabilities;
    if (capabilities === undefined) return undefined;
    // Object-identity matching only; tokens from duplicate package copies
    // intentionally miss and yield undefined. No string-name fallback.
    return capabilities.has(token) ? (capabilities.get(token) as T) : undefined;
  }

  private assertOpen(operation: string): void {
    if (this._closed) {
      throw new UniPtyError("closed", `cannot ${operation} on a closed PTY`);
    }
  }

  private selectNativeInput(data: string | Uint8Array): NativeInput {
    const accepted = this.endpoint.native.input;
    if (typeof data === "string") {
      if (accepted === "text" || accepted === "both") {
        return { kind: "text", text: data };
      }
      // Byte-native Backend: strings are UTF-8 encoded for delivery.
      return { kind: "bytes", bytes: encoder.encode(data) };
    }
    if (accepted === "bytes" || accepted === "both") {
      return { kind: "bytes", bytes: data };
    }
    // The strict upper layer never silently decodes byte input for a
    // text-native Backend; only an explicit Backend-owned write decoder may
    // provide that convenience, and it makes the Endpoint accept bytes.
    throw new UniPtyError(
      "unsupported",
      "this Backend accepts native text input only; byte writes require the Backend's explicit write decoder",
    );
  }
}

/**
 * Configured Core instance owning exactly one ready Backend. Constructed
 * with the already-ready object (never a name, registry entry, or factory);
 * `spawn()` is synchronous thereafter.
 */
export class UniPty<TBackend extends ReadyPtyBackend = ReadyPtyBackend> {
  private readonly _backend: TBackend;
  private readonly ptys = new Set<PtyImpl>();
  private disposal: Promise<void> | null = null;

  constructor(options: { backend: TBackend }) {
    if (
      options === null ||
      typeof options !== "object" ||
      typeof options.backend !== "object" ||
      options.backend === null ||
      typeof options.backend.spawn !== "function" ||
      typeof options.backend.dispose !== "function"
    ) {
      throw new UniPtyError(
        "invalid-argument",
        "UniPty requires one structurally ready Backend with synchronous spawn() and asynchronous dispose()",
      );
    }
    this._backend = options.backend;
  }

  /** The same ready Backend instance this Core was constructed with. */
  get backend(): TBackend {
    return this._backend;
  }

  spawn(argv: readonly string[], options?: UniPtySpawnOptions): Pty {
    if (this.disposal !== null) {
      throw new UniPtyError("closed", "this UniPty is disposed; spawn() is blocked");
    }
    if (!Array.isArray(argv) || argv.length === 0) {
      throw new UniPtyError("invalid-argument", "argv must be a non-empty executable-plus-arguments vector");
    }
    for (const element of argv) {
      if (typeof element !== "string") {
        throw new UniPtyError("invalid-argument", "every argv element must be a string", {
          details: { element },
        });
      }
    }
    const { cols, rows } = resolveInitialGeometry(options?.terminal);
    const env = normalizeEnvironment(options?.env);
    const launch: StructuredLaunch = {
      argv,
      cols,
      rows,
      ...(options?.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(env !== undefined ? { env } : {}),
    };
    // A ready Backend spawns synchronously or throws a typed synchronous
    // launch failure; Core never waits for acquisition here.
    const endpoint = this._backend.spawn(launch);
    const pty = new PtyImpl(endpoint);
    this.ptys.add(pty);
    void pty.whenClosed.then(() => {
      this.ptys.delete(pty);
    });
    return pty;
  }

  /**
   * Graceful Backend-level disposal. The first call immediately blocks new
   * spawns; repeated calls return the same Promise. Existing PTYs stay
   * caller-owned; disposal waits for all of them to close, then releases
   * shared Backend resources exactly once.
   */
  dispose(): Promise<void> {
    if (this.disposal !== null) return this.disposal;
    this.disposal = this.runDisposal();
    return this.disposal;
  }

  private async runDisposal(): Promise<void> {
    // Yield once so `this.disposal` is assigned before any code observed
    // through the Backend can re-enter: a Backend that synchronously calls
    // spawn() or dispose() from inside its own dispose() must already see
    // the blocked-spawn / repeated-disposal state.
    await Promise.resolve();
    // Wait for every existing PTY to close through its own lifecycle;
    // disposal neither closes nor terminates them.
    while (this.ptys.size > 0) {
      await Promise.all([...this.ptys].map((pty) => pty.whenClosed));
    }
    // Release shared Backend resources exactly once; only a release
    // failure rejects the public disposal Promise.
    await this._backend.dispose();
  }
}

function normalizeEnvironment(
  env?: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> | undefined {
  if (env === undefined) return undefined;
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) normalized[key] = value;
  }
  return normalized;
}
