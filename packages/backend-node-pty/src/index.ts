/**
> Orthogonal intents (2026-08-20): @unipty/backend-node-pty public entry —
> ready Backend factory over the third-party node-pty substrate.
>
> Original request (2026-08-17): one observable PTY contract across runtimes
> through replaceable Backends. This adapter owns acquisition (one-time
> substrate loading inside `createNodePtyBackend`), the Core-private Endpoint
> (native chunk stream, boolean write readiness, transport-vs-termination
> lifecycle), and nothing else: Core owns every public surface.
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
export interface NodePtyBackendOptions {
  /**
   * Native output representation of the substrate PTY.
   *
   * - `"buffer"` (default): the substrate is created with `encoding: null`,
   *   `onData` emits `Buffer` chunks, and the Endpoint declares
   *   `{ input: "both", output: "bytes" }`. Substrate `write` accepts both
   *   strings (UTF-8 encoded by the substrate) and bytes.
   * - `"utf8"`: the substrate is created with `encoding: "utf8"`, `onData`
   *   emits strings, and the Endpoint declares `{ input: "text", output:
   *   "text" }` unless `writeDecode` widens input to `"both"`.
   */
  readonly encoding?: "buffer" | "utf8";

  /**
   * Byte-input convenience for `encoding: "utf8"` Endpoints. Absent (default)
   * keeps the Endpoint strict: byte writes fail with `unsupported`, matching
   * the strict upper layer. `true` installs an adapter-owned stateful UTF-8
   * `TextDecoder` (non-fatal); passing a caller-built `TextDecoder` respects
   * its own fatal/BOM policy. A fatal decode failure rejects the whole value
   * with `invalid-argument` and the original `TypeError` as `cause`.
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

/** Ready Node-route Backend produced by `createNodePtyBackend()`. */
export interface NodePtyBackend extends ReadyPtyBackend {}

/**
 * Structural type of the substrate surface this adapter uses. It includes the
 * two transport internals the substrate uses for its own lifecycle: `_socket`
 * (the master-side stream; `tty.ReadStream` on unix, the agent's out-socket on
 * Windows) and the unix-only custom `_writeStream`. They are load-bearing for
 * Endpoint `close()` because the substrate's public `destroy()` explicitly
 * signals the child (see `terminate()`), which the Endpoint contract forbids
 * for transport release.
 */
interface SubstratePty {
  readonly pid: number;
  onData(listener: (data: string | Buffer) => void): { dispose(): void };
  onExit(listener: (event: { exitCode: number; signal?: number | string }) => void): {
    dispose(): void;
  };
  /** Routed by the substrate base class to its internal close emitter. */
  on(event: "close", listener: () => void): unknown;
  write(data: string | Buffer): void;
  resize(columns: number, rows: number): void;
  kill(signal?: string): void;
  readonly _socket: {
    destroy(): void;
    pause?(): void;
    resume?(): void;
    on?(event: "error", listener: (error: Error) => void): unknown;
  };
  readonly _writeStream?: { dispose(): void };
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
 * Map the substrate's exit observation onto `BackendExitResult`. The unix
 * native layer reports `signal` as a number where `0` means "no signal";
 * anything truthy is mapped to its observed string form (`"SIGTERM"` etc.).
 */
function toExitResult(event: { exitCode: number; signal?: number | string }): BackendExitResult {
  const exitCode = typeof event.exitCode === "number" ? event.exitCode : null;
  let signal: string | null = null;
  if (typeof event.signal === "number" && event.signal !== 0) {
    signal = SIGNAL_NAMES.get(event.signal) ?? `SIG${String(event.signal)}`;
  } else if (typeof event.signal === "string" && event.signal.length > 0) {
    // Defensive: the Windows substrate may report a string name.
    signal = event.signal;
  }
  return { exitCode, signal };
}

/** Zero-copy `Buffer` view over a `Uint8Array` for byte-native writes. */
function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Load and validate the substrate exactly once per `createNodePtyBackend()`
 * call. `@lydell/node-pty` is CommonJS; depending on the runtime's CJS named
 * export analysis, `spawn` may sit on the namespace or on `default`, so both
 * are narrowed structurally. Import failure (for example a missing
 * platform-specific prebuilt package) propagates as the underlying error.
 */
async function loadSubstrateSpawn(): Promise<SubstrateSpawn> {
  const namespace: unknown = await import("@lydell/node-pty");
  let candidate: unknown;
  if (
    typeof namespace === "object" &&
    namespace !== null &&
    "spawn" in namespace &&
    typeof (namespace as { spawn?: unknown }).spawn === "function"
  ) {
    candidate = (namespace as { spawn: unknown }).spawn;
  } else if (
    typeof namespace === "object" &&
    namespace !== null &&
    "default" in namespace &&
    typeof (namespace as { default?: { spawn?: unknown } }).default?.spawn === "function"
  ) {
    candidate = (namespace as { default: { spawn: unknown } }).default.spawn;
  }
  if (typeof candidate !== "function") {
    throw new UniPtyError(
      "unsupported",
      "the @lydell/node-pty substrate did not expose a spawn function",
      {
        details: { substrate: "@lydell/node-pty" },
      },
    );
  }
  return candidate as SubstrateSpawn;
}

/** Input representation the Endpoint accepts, derived from Backend options. */
function nativeInput(encoding: "buffer" | "utf8", writeDecode: boolean): NativeRepresentation {
  if (encoding === "buffer") return "both";
  return writeDecode ? "both" : "text";
}

/**
 * Core-private Endpoint over one substrate PTY.
 *
 * Representation law (declared on `native`, honored by `write`/`output`):
 * - `encoding "buffer"`: input `"both"` / output `"bytes"` — the substrate
 *   emits `Buffer` chunks and accepts both strings and bytes.
 * - `encoding "utf8"` strict: input `"text"` / output `"text"`.
 * - `encoding "utf8"` + `writeDecode`: input `"both"` / output `"text"` —
 *   bytes are decoded through one stateful adapter-owned decoder.
 *
 * Lifecycle mapping (verified against the substrate sources):
 * - `close()` releases the PTY transport — destroy the master-side socket and
 *   dispose the custom write stream — and never signals the child. The
 *   substrate's public `destroy()` is deliberately NOT used: it waits for
 *   socket close and then explicitly `kill("SIGHUP")`s the child (unix), and
 *   calls `kill()` on Windows, so it would cascade close into termination.
 * - `terminate()` is the substrate's `kill()` with its default signal
 *   (`SIGHUP` on unix, agent shutdown on Windows) and never touches the
 *   transport. Both operations are idempotent and synchronous.
 * - `exited` wraps `onExit` exactly once and remains awaitable after `close()`;
 *   the substrate emits exit only on true child death (exec failures surface
 *   as an immediate exit observation, not a spawn exception).
 */
class NodePtyEndpoint implements BackendEndpoint {
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

  private readonly hardBytes: number;
  private readonly softBytes: number;
  private pending: Uint8Array[] = [];
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
      input: nativeInput(encoding, writeDecoder !== undefined),
      output: encoding === "utf8" ? "text" : "bytes",
    };
    this.output = new ReadableStream<NativeChunk>({
      start: (controller) => {
        this.streamController = controller;
      },
      // Consumer-paced backpressure: when Core stops pulling (for example a
      // full bootstrap buffer), pausing the master socket propagates the
      // pressure into the kernel instead of growing an adapter queue.
      pull: () => {
        this.pty._socket.resume?.();
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
    pty.on("close", () => this.finishStream());
    // A master-socket read failure is a transport error, not EOF: it must
    // error the private source so Core fails the active view instead of
    // completing it cleanly.
    this.pty._socket.on?.("error", (error) => this.failStream(error));
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
        this.pty._socket.pause?.();
      }
    } catch {
      // The source was cancelled or closed between the guard and the enqueue.
      this.streamFinished = true;
      this.dataSubscription.dispose();
    }
  }

  private failStream(cause: Error): void {
    if (this.streamFinished) return;
    this.streamFinished = true;
    this.dataSubscription.dispose();
    try {
      this.streamController.error(
        new UniPtyError("unsupported", "PTY transport read failure on the master socket", {
          cause,
        }),
      );
    } catch {
      // Already closed or errored.
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
    let bytes: Uint8Array | undefined;
    if (input.kind === "text") {
      // Accepted in every mode: the substrate encodes strings for byte-native
      // PTYs itself. The encoded size participates in queue accounting so a
      // huge string cannot bypass the bound.
      bytes = Buffer.from(input.text, "utf8");
    } else if (this.encoding === "buffer") {
      bytes = toBuffer(input.bytes);
    } else if (this.writeDecoder !== undefined) {
      let text: string;
      try {
        // Streaming mode keeps partial multibyte sequences pending across
        // writes; this is what makes the adapter decoder stateful.
        text = this.writeDecoder.decode(input.bytes, { stream: true });
      } catch (cause) {
        throw new UniPtyError(
          "invalid-argument",
          "byte input failed the configured writeDecode policy",
          { details: { mode: "utf8+writeDecode" }, cause },
        );
      }
      bytes = Buffer.from(text, "utf8");
    } else {
      throw new UniPtyError(
        "unsupported",
        "byte input requires writeDecode on a utf8-native endpoint",
      );
    }
    if (this.pendingBytes + bytes.byteLength > this.hardBytes) {
      // Saturation rejects the whole value: nothing of it was accepted.
      throw new UniPtyError(
        "backpressure",
        "the bounded pending-write queue is saturated; the whole value was rejected",
        { details: { pendingBytes: this.pendingBytes, hardBytes: this.hardBytes } },
      );
    }
    this.pending.push(bytes);
    this.pendingBytes += bytes.byteLength;
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
        this.pty.write(toBuffer(segment));
      } catch (cause) {
        this.failInput(new UniPtyError("closed", "substrate write failed", { cause }));
        return;
      }
      this.pending.shift();
      this.pendingBytes -= segment.byteLength;
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
    // normally on explicit close" without waiting for socket teardown.
    this.finishStream();
    // Release the transport without signaling the child. On unix this closes
    // the master fd (verified: the child survives and `exited` stays pending
    // until true child death). `_writeStream` is unix-only; Windows declares
    // this tuple unverified but exposes the same `_socket`.
    this.pty._socket.destroy();
    this.pty._writeStream?.dispose();
    // Release decoder state; a trailing partial multibyte sequence has no
    // remaining write destination after transport close and is discarded.
    try {
      this.writeDecoder?.decode();
    } catch {
      // A caller-owned fatal decoder surfaces nothing here: flushing after
      // close has nowhere to deliver output.
    }
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    // Default signal (`SIGHUP` on unix; agent shutdown on Windows). The
    // substrate swallows ESRCH for already-dead children, keeping this
    // idempotent. Transport stays open; exit observation stays independent.
    this.pty.kill();
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
  spawn: SubstrateSpawn,
  launch: StructuredLaunch,
  encoding: "buffer" | "utf8",
  writeDecode: true | TextDecoder | undefined,
  name: string | undefined,
  writeQueueBytes: number,
): NodePtyEndpoint {
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
    pty = spawn(launch.argv[0] as string, [...launch.argv.slice(1)], options);
  } catch (cause) {
    // The substrate's own argument type checks produce "<field> must be a
    // <type>" errors; anything else (native fork failure, missing prebuilt)
    // is reported as unsupported.
    const code: UniPtyErrorCode =
      cause instanceof Error && cause.message.includes(" must be a ")
        ? "invalid-argument"
        : "unsupported";
    throw new UniPtyError(code, "the node-pty substrate rejected the launch", {
      details: { substrate: "@lydell/node-pty" },
      cause,
    });
  }
  return new NodePtyEndpoint(pty, encoding, endpointWriteDecoder(writeDecode), writeQueueBytes);
}

/**
 * Acquire a ready Node-route Backend. Performs the one-time substrate load
 * (`await import("@lydell/node-pty")` pulls the platform-specific prebuilt
 * native addon) and validates it before returning; Core construction and
 * `unipty.spawn()` remain synchronous afterwards.
 *
 * `dispose()` resolves immediately: the native addon is process-global and
 * this Backend owns no shared per-instance resources beyond the loaded module
 * itself, so there is nothing to release at Backend level. Existing PTYs are
 * caller-owned and unaffected, per the disposal contract.
 */
export async function createNodePtyBackend(
  options?: NodePtyBackendOptions,
): Promise<NodePtyBackend> {
  const encoding = options?.encoding ?? "buffer";
  const writeDecode = options?.writeDecode;
  if (writeDecode !== undefined && encoding === "buffer") {
    throw new UniPtyError(
      "invalid-argument",
      'writeDecode applies only to encoding "utf8"; byte-native input already accepts bytes',
      { details: { encoding } },
    );
  }
  const name = options?.name;
  const writeQueueBytes = options?.writeQueueBytes ?? DEFAULT_WRITE_QUEUE_BYTES;
  if (!Number.isInteger(writeQueueBytes) || writeQueueBytes <= 0) {
    throw new UniPtyError("invalid-argument", "writeQueueBytes must be a positive integer", {
      details: { writeQueueBytes },
    });
  }
  const spawn = await loadSubstrateSpawn();
  return {
    spawn: (launch: StructuredLaunch) =>
      spawnEndpoint(spawn, launch, encoding, writeDecode, name, writeQueueBytes),
    dispose: () => Promise.resolve(),
  };
}
