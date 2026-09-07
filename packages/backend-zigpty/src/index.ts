/**
> Orthogonal intents (2026-09-07): @unipty/backend-zigpty public entry —
> ready Backend factory over the third-party zigpty substrate.
>
> Original request (2026-09-07): 新增 backend zigpty（pithings/zigpty），
> 测试并验证通过后发布新版本。This adapter owns acquisition (one-time
> substrate loading inside `createZigptyBackend` behind a hard native gate),
> the Core-private Endpoint (native chunk stream, boolean write readiness,
> transport-vs-termination lifecycle), and nothing else: Core owns every
 * public surface.
 */

import { UniPtyError } from "unipty";
import type { UniPtyErrorCode } from "unipty";
import type { BackendEndpoint, ReadyPtyBackend, StructuredLaunch } from "unipty";
import type { BackendExitResult, NativeChunk, NativeInput, NativeRepresentation } from "unipty";
import { constants as osConstants } from "node:os";
import { Buffer } from "node:buffer";

/**
 * Backend-owned acquisition options. They configure native output/input
 * representation for every PTY this Backend creates; launch facts (argv, cwd,
 * env, geometry) stay in `StructuredLaunch` and are never flattened here.
 */
export interface ZigptyBackendOptions {
  /**
   * Native output representation of the substrate PTY.
   *
   * - `"buffer"` (default): the substrate is created with `encoding: null`,
   *   `onData` emits `Buffer` chunks, and the Endpoint declares
   *   `{ output: "bytes" }`. Core decodes incrementally, so split multibyte
   *   sequences never depend on substrate chunking.
   * - `"utf8"`: the substrate is created with `encoding: "utf8"`, `onData`
   *   emits strings, and the Endpoint declares `{ output: "text" }`.
   *
   * Either way the substrate's `write` accepts strings only, so the
   * Endpoint's input is text-native unless `writeDecode` widens it.
   */
  readonly encoding?: "buffer" | "utf8";

  /**
   * Byte-input convenience. The zigpty substrate accepts string writes only
   * in both encoding modes, so a strict Endpoint rejects byte writes with
   * `unsupported`; `true` installs an adapter-owned stateful UTF-8
   * `TextDecoder` (non-fatal) and passing a caller-built `TextDecoder`
   * respects its own fatal/BOM policy. A fatal decode failure rejects the
   * whole value with `invalid-argument` and the original `TypeError` as
   * `cause`.
   */
  readonly writeDecode?: true | TextDecoder;

  /** Passed to the substrate as the pty name (becomes `$TERM` in the child). */
  readonly name?: string;

  /**
   * Hard bound in bytes of each Endpoint's bounded pending-write admission
   * queue (default 1 MiB; soft resume mark at three quarters). The substrate
   * accepts writes into its own internal fd queue, so this adapter-owned
   * queue is the Endpoint's whole-value backpressure boundary: a value that
   * cannot fit is rejected synchronously with `backpressure`.
   */
  readonly writeQueueBytes?: number;
}

/** Ready zigpty-route Backend produced by `createZigptyBackend()`. */
export interface ZigptyBackend extends ReadyPtyBackend {}

/**
 * Structural type of the substrate surface this adapter uses. Unlike the
 * node-pty adapter, no transport internals are touched: `pause()`/`resume()`
 * are public master-read gates, and teardown maps onto `close()`/`kill()`.
 */
interface SubstratePty {
  readonly pid: number;
  onData(listener: (data: string | Buffer) => void): { dispose(): void };
  onExit(listener: (event: { exitCode: number; signal: number }) => void): {
    dispose(): void;
  };
  write(data: string): void;
  pause(): void;
  resume(): void;
  resize(columns: number, rows: number): void;
  kill(signal?: string): void;
  close(): void;
}

interface SubstrateSpawnOptions {
  readonly name?: string;
  readonly cols?: number;
  readonly rows?: number;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly encoding?: string | null;
}

type SubstrateSpawn = (
  file: string,
  args: string[],
  options: SubstrateSpawnOptions,
) => SubstratePty;

/** What `loadSubstrate()` must observe before a Backend may be built. */
interface SubstrateSurface {
  readonly spawn: SubstrateSpawn;
  /** True only when the Zig NAPI prebuild for this tuple actually loaded. */
  readonly hasNative: boolean;
}

/** Reverse signal-number → signal-name map built from the Node runtime. */
const SIGNAL_NAMES: ReadonlyMap<number, string> = (() => {
  const names = new Map<number, string>();
  for (const [name, number] of Object.entries(osConstants.signals)) {
    if (typeof number === "number" && !names.has(number)) {
      names.set(number, name);
    }
  }
  return names;
})();

/**
 * Map the substrate's exit observation onto `BackendExitResult`. The native
 * layer reports `signal` as a number where `0` means "no signal"; anything
 * truthy is mapped to its observed string form (`"SIGTERM"` etc.). A
 * signalled death keeps the substrate-reported numeric `exitCode` (observed
 * as `0`) — the adapter passes the observation through and never invents a
 * `null` the substrate did not report.
 */
function toExitResult(event: { exitCode: number; signal: number }): BackendExitResult {
  const exitCode = typeof event.exitCode === "number" ? event.exitCode : null;
  const signal =
    event.signal !== 0 ? (SIGNAL_NAMES.get(event.signal) ?? `SIG${String(event.signal)}`) : null;
  return { exitCode, signal };
}

/**
 * Load and validate the substrate exactly once per `createZigptyBackend()`
 * call. `zigpty` is pure ESM, but the namespace is still narrowed
 * structurally so bundler/interop variations cannot bypass the gate.
 */
async function loadSubstrate(): Promise<SubstrateSurface> {
  const namespace: unknown = await import("zigpty");
  const candidates: unknown[] = [namespace];
  const interopDefault = (namespace as { default?: unknown } | null)?.default;
  if (interopDefault !== undefined && interopDefault !== namespace) {
    candidates.push(interopDefault);
  }
  for (const candidate of candidates) {
    if (
      typeof candidate === "object" &&
      candidate !== null &&
      typeof (candidate as { spawn?: unknown }).spawn === "function" &&
      typeof (candidate as { hasNative?: unknown }).hasNative === "boolean"
    ) {
      return candidate as SubstrateSurface;
    }
  }
  throw new UniPtyError("unsupported", "the zigpty substrate did not expose spawn/hasNative", {
    details: { substrate: "zigpty" },
  });
}

/** Input representation the Endpoint accepts, derived from Backend options. */
function nativeInput(writeDecode: boolean): NativeRepresentation {
  return writeDecode ? "both" : "text";
}

/**
 * Core-private Endpoint over one substrate PTY.
 *
 * Representation law (declared on `native`, honored by `write`/`output`):
 * - strict (any encoding without `writeDecode`): input `"text"`.
 * - `writeDecode`: input `"both"` — bytes are decoded through one stateful
 *   adapter-owned decoder before the string write.
 * - `encoding "buffer"`: output `"bytes"` — `onData` emits `Buffer`.
 * - `encoding "utf8"`: output `"text"` — `onData` emits strings.
 *
 * Lifecycle mapping (verified against the substrate sources and probes):
 * - `close()` never calls the substrate `close()` while the child lives: the
 *   substrate closes the master fd and then explicitly `kill(pid, "SIGHUP")`,
 *   which would cascade transport close into child termination. The
 *   Endpoint pauses master reads and defers the substrate close until the
 *   exit observation settles (the substrate's own liveness probe then skips
 *   the signal for a dead pid).
 * - `terminate()` is the substrate's `kill()` with its default signal
 *   (`SIGHUP`) and never touches the transport. Both operations are
 *   idempotent and synchronous.
 * - The substrate exposes no transport-EOF event (only `onData`/`onExit`):
 *   output-source completion is synthesized from `exited` settling, deferred
 *   one macrotask so trailing chunks still enqueue before EOF — the same
 *   synthesis the Bun route performs for `Bun.Terminal`.
 * - `exited` wraps `onExit` exactly once and remains awaitable after
 *   `close()`; the substrate emits exit only on true child death (exec
 *   failures surface as an immediate exit observation, not a spawn
 *   exception).
 */
class ZigptyEndpoint implements BackendEndpoint {
  readonly native: { readonly input: NativeRepresentation; readonly output: NativeRepresentation };
  readonly output: ReadableStream<NativeChunk>;
  readonly exited: Promise<BackendExitResult>;

  private readonly pty: SubstratePty;
  private readonly encoding: "buffer" | "utf8";
  private readonly writeDecoder: TextDecoder | undefined;
  private streamController!: ReadableStreamDefaultController<NativeChunk>;
  private readonly dataSubscription: { dispose(): void };
  private streamFinished = false;
  private closed = false;
  private terminated = false;
  private transportReleased = false;

  private readonly hardBytes: number;
  private readonly softBytes: number;
  private pending: string[] = [];
  private pendingBytes = 0;
  private pumpScheduled = false;
  private drainWaiters: Array<{
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
  }> = [];

  constructor(
    pty: SubstratePty,
    encoding: "buffer" | "utf8",
    writeDecoder: TextDecoder | undefined,
    writeQueueBytes: number,
  ) {
    this.pty = pty;
    this.encoding = encoding;
    this.writeDecoder = writeDecoder;
    this.hardBytes = writeQueueBytes;
    this.softBytes = Math.max(1, Math.floor((writeQueueBytes * 3) / 4));
    this.native = {
      input: nativeInput(writeDecoder !== undefined),
      output: encoding === "utf8" ? "text" : "bytes",
    };
    this.output = new ReadableStream<NativeChunk>({
      start: (controller) => {
        this.streamController = controller;
      },
      // Consumer-paced backpressure: when Core stops pulling (for example a
      // full bootstrap buffer), pausing master reads propagates the pressure
      // into the kernel instead of growing an adapter queue.
      pull: () => {
        this.pty.resume();
      },
      // Core never cancels the private source (public views only detach); if
      // something ever does, detach the subscription and drop later chunks.
      cancel: () => {
        this.streamFinished = true;
        this.dataSubscription?.dispose();
      },
    });
    let resolveExit!: (result: BackendExitResult) => void;
    this.exited = new Promise<BackendExitResult>((resolve) => {
      resolveExit = resolve;
    });
    this.dataSubscription = pty.onData((data) => this.onData(data));
    pty.onExit((event) => resolveExit(toExitResult(event)));
    void this.exited.then(() => {
      // Synthesized transport EOF (see class docs). One macrotask of grace
      // lets data callbacks that were queued with the exit callback in the
      // same event-loop turn still enqueue before completion.
      setTimeout(() => this.finishStream(), 0);
    });
  }

  private onData(data: string | Buffer): void {
    if (this.streamFinished) return;
    const chunk: NativeChunk =
      this.encoding === "utf8"
        ? { kind: "text", text: data as string }
        : { kind: "bytes", bytes: data as Buffer };
    try {
      this.streamController.enqueue(chunk);
      if ((this.streamController.desiredSize ?? 1) <= 0) {
        this.pty.pause();
      }
    } catch {
      // The source was cancelled or closed between the guard and the enqueue.
      this.streamFinished = true;
      this.dataSubscription.dispose();
    }
  }

  private finishStream(): void {
    if (this.streamFinished) return;
    this.streamFinished = true;
    this.dataSubscription.dispose();
    try {
      this.streamController.close();
    } catch {
      // Already closed by cancellation; enqueued chunks remain readable.
    }
  }

  write(input: NativeInput): boolean {
    if (this.closed) {
      // Defense-in-depth: Core rejects writes after publishing `closed`
      // before Endpoint close is invoked.
      throw new UniPtyError("closed", "the endpoint transport is closed");
    }
    let text: string;
    if (input.kind === "text") {
      text = input.text;
    } else if (this.writeDecoder !== undefined) {
      try {
        // Streaming mode keeps partial multibyte sequences pending across
        // writes; this is what makes the adapter decoder stateful.
        text = this.writeDecoder.decode(input.bytes, { stream: true });
      } catch (cause) {
        throw new UniPtyError(
          "invalid-argument",
          "byte input failed the configured writeDecode policy",
          { details: { mode: "writeDecode" }, cause },
        );
      }
    } else {
      // The substrate write is string-only in every mode; the strict
      // upper layer never decodes bytes implicitly.
      throw new UniPtyError(
        "unsupported",
        "byte input requires writeDecode on the text-native zigpty endpoint",
      );
    }
    const valueBytes = Buffer.byteLength(text, "utf8");
    if (this.pendingBytes + valueBytes > this.hardBytes) {
      // Saturation rejects the whole value: nothing of it was accepted.
      throw new UniPtyError(
        "backpressure",
        "the bounded pending-write queue is saturated; the whole value was rejected",
        { details: { pendingBytes: this.pendingBytes, hardBytes: this.hardBytes } },
      );
    }
    this.pending.push(text);
    this.pendingBytes += valueBytes;
    this.schedulePump();
    // Write Readiness: `false` advises pause-and-drain, never a retry.
    return this.pendingBytes <= this.softBytes;
  }

  /**
   * Readiness recovery over the bounded admission queue. The substrate's own
   * fd write queue has no observable completion signal, so drain resolves
   * once the adapter queue falls below the soft mark — readiness recovery,
   * not a physical flush guarantee.
   */
  drain(): Promise<void> {
    if (this.closed) {
      return Promise.reject(
        new UniPtyError("closed", "PTY input is closed; drain() cannot recover readiness"),
      );
    }
    if (this.pendingBytes <= this.softBytes) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.drainWaiters.push({ resolve, reject });
    });
  }

  private schedulePump(): void {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pumpPending();
    });
  }

  private pumpPending(): void {
    while (this.pending.length > 0) {
      const segment = this.pending[0];
      if (segment === undefined) break;
      try {
        this.pty.write(segment);
      } catch (cause) {
        this.failInput(new UniPtyError("closed", "substrate write failed", { cause }));
        return;
      }
      this.pending.shift();
      this.pendingBytes -= Buffer.byteLength(segment, "utf8");
    }
    if (this.pendingBytes <= this.softBytes) this.settleDrain();
  }

  private failInput(error: UniPtyError): void {
    this.pending = [];
    this.pendingBytes = 0;
    this.settleDrain(error);
  }

  private settleDrain(error?: UniPtyError): void {
    const waiters = this.drainWaiters;
    this.drainWaiters = [];
    for (const waiter of waiters) {
      if (error === undefined) waiter.resolve();
      else waiter.reject(error);
    }
  }

  resize(cols: number, rows: number): void {
    if (this.closed) {
      throw new UniPtyError("closed", "the endpoint transport is closed");
    }
    try {
      this.pty.resize(cols, rows);
    } catch (cause) {
      throw new UniPtyError("unsupported", "the substrate failed to resize the pty", { cause });
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.pending = [];
    this.pendingBytes = 0;
    this.settleDrain(
      new UniPtyError("closed", "this PTY endpoint was closed; drain() cannot recover readiness"),
    );
    // Complete the private source first: chunks already enqueued stay
    // readable, then the stream ends — matching "an active stream completes
    // normally on explicit close" without waiting for fd teardown.
    this.finishStream();
    // Release decoder state; a trailing partial multibyte sequence has no
    // remaining write destination after transport close and is discarded.
    try {
      this.writeDecoder?.decode();
    } catch {
      // A caller-owned fatal decoder surfaces nothing here: flushing after
      // close has nowhere to deliver output.
    }
    // Stop reading immediately, but keep the master fd open: the substrate
    // close closes the fd AND explicitly SIGHUPs a live child, so physical
    // teardown is DEFERRED until the exit observation settles. The spec
    // allows physical cleanup to finish asynchronously; the exit observation
    // (or a transport error) releases the fds.
    try {
      this.pty.pause();
    } catch {
      // The substrate may already have torn its read stream down.
    }
    void this.exited.then(
      () => this.releaseTransport(),
      () => this.releaseTransport(),
    );
  }

  private releaseTransport(): void {
    if (this.transportReleased) return;
    this.transportReleased = true;
    try {
      // The child is gone at this point, so the substrate's internal
      // liveness probe finds no pid to signal; this only frees the fd, the
      // write queue, and the exit watcher.
      this.pty.close();
    } catch {
      // Substrate idempotency guard.
    }
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    // Default signal (`SIGHUP` on unix; agent shutdown on Windows). ESRCH
    // for an already-dead child is swallowed, keeping this idempotent.
    // Transport stays open; exit observation stays independent.
    try {
      this.pty.kill();
    } catch {
      // Already-dead children raise ESRCH from process.kill.
    }
  }
}

function isFinitePositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value > 0 && Number.isFinite(value)
  );
}

/** Typed synchronous launch failure from adapter-side validation. */
function invalidLaunch(message: string): never {
  throw new UniPtyError("invalid-argument", message);
}

/**
 * Fresh stateful decoder for one Endpoint. A caller-supplied TextDecoder
 * configures the per-endpoint copy (encoding, fatal, BOM policy) rather
 * than being shared: decoder state must never leak across PTYs.
 */
function endpointWriteDecoder(
  writeDecode: true | TextDecoder | undefined,
): TextDecoder | undefined {
  if (writeDecode === undefined) return undefined;
  if (writeDecode === true) return new TextDecoder();
  return new TextDecoder(writeDecode.encoding, {
    fatal: writeDecode.fatal,
    ignoreBOM: writeDecode.ignoreBOM,
  });
}

const DEFAULT_WRITE_QUEUE_BYTES = 1 << 20;

function spawnEndpoint(
  surface: SubstrateSurface,
  launch: StructuredLaunch,
  encoding: "buffer" | "utf8",
  writeDecode: true | TextDecoder | undefined,
  name: string | undefined,
  writeQueueBytes: number,
): ZigptyEndpoint {
  if (!Array.isArray(launch.argv) || launch.argv.length === 0) {
    invalidLaunch("launch.argv must be a non-empty array");
  }
  if (!launch.argv.every((value) => typeof value === "string")) {
    invalidLaunch("launch.argv values must all be strings");
  }
  if (!isFinitePositiveInteger(launch.cols) || !isFinitePositiveInteger(launch.rows)) {
    invalidLaunch("launch geometry must be finite positive integer character cells");
  }
  const options: {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
    encoding: string | null;
  } = {
    cols: launch.cols,
    rows: launch.rows,
    encoding: encoding === "utf8" ? "utf8" : null,
  };
  if (name !== undefined) {
    options.name = name;
  }
  if (launch.cwd !== undefined) {
    options.cwd = launch.cwd;
  }
  if (launch.env !== undefined) {
    options.env = { ...launch.env };
  }
  let pty: SubstratePty;
  try {
    pty = surface.spawn(launch.argv[0] as string, [...launch.argv.slice(1)], options);
  } catch (cause) {
    // The substrate's own argument type checks produce "<field> must be a
    // <type>" errors; anything else (native fork failure, missing prebuild)
    // is reported as unsupported.
    const code: UniPtyErrorCode =
      cause instanceof Error && cause.message.includes(" must be a ")
        ? "invalid-argument"
        : "unsupported";
    throw new UniPtyError(code, "the zigpty substrate rejected the launch", {
      details: { substrate: "zigpty" },
      cause,
    });
  }
  return new ZigptyEndpoint(pty, encoding, endpointWriteDecoder(writeDecode), writeQueueBytes);
}

/**
 * Acquire a ready zigpty-route Backend. Performs the one-time substrate load
 * (`await import("zigpty")` resolves the in-tarball NAPI prebuild) and
 * enforces the native gate: when the prebuild for the host tuple did not
 * load, readiness fails with `unsupported` and the substrate's pipe-based
 * pseudo-PTY fallback is never entered. Core construction and
 * `unipty.spawn()` remain synchronous afterwards.
 *
 * `dispose()` resolves immediately: the native addon is process-global and
 * this Backend owns no shared per-instance resources beyond the loaded
 * module itself, so there is nothing to release at Backend level. Existing
 * PTYs are caller-owned and unaffected, per the disposal contract.
 */
export async function createZigptyBackend(options?: ZigptyBackendOptions): Promise<ZigptyBackend> {
  const writeQueueBytes = options?.writeQueueBytes ?? DEFAULT_WRITE_QUEUE_BYTES;
  if (!Number.isInteger(writeQueueBytes) || writeQueueBytes <= 0) {
    throw new UniPtyError("invalid-argument", "writeQueueBytes must be a positive integer", {
      details: { writeQueueBytes },
    });
  }
  const surface = await loadSubstrate();
  if (!surface.hasNative) {
    throw new UniPtyError(
      "unsupported",
      "zigpty native bindings are unavailable on this runtime/platform tuple; the pipe fallback is never used as a PTY substitute",
      { details: { substrate: "zigpty" } },
    );
  }
  return {
    spawn: (launch: StructuredLaunch) =>
      spawnEndpoint(
        surface,
        launch,
        options?.encoding ?? "buffer",
        options?.writeDecode,
        options?.name,
        writeQueueBytes,
      ),
    dispose: () => Promise.resolve(),
  };
}
