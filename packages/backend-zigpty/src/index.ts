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
import { OutputSpool, normalizeOutputSpool } from "./output-spool.ts";
import type { OutputSpoolOptions } from "./output-spool.ts";

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

  /**
   * Disk-backed output spooling for the private output source.
   *
   * The substrate's output flow control cannot reach the kernel everywhere:
   * its public `pause()`/`resume()` are no-ops on Windows (zigpty 0.2.1),
   * so a consumer that stops pulling would otherwise grow the in-memory
   * source queue without bound there (the same declared substrate
   * limitation class as the Deno route). `outputSpool` answers that gap at
   * adapter level: output records accumulate in a FIFO whose in-memory head
   * is bounded (`memoryBytes`, default 1 MiB); records beyond it spill to
   * one adapter-owned temp file under `directory` (default the OS temp
   * directory) and replay into the source only while the consumer pulls.
   * The aggregate public stream is byte-identical with and without the
   * spool — text records round-trip per complete record and chunk
   * boundaries are preserved.
   *
   * Works on every platform (on platforms where the substrate can pause,
   * a backlogged spool additionally propagates pressure into the kernel,
   * bounding disk growth too). Recommended wherever a consumer may stall
   * for unbounded time, and the memory bound on Windows. Off by default.
   * Spill IO is synchronous; disk usage while backlogged is unbounded by
   * design, bounded only by the child's own output, and the temp file is
   * deleted when the source completes, the Endpoint closes, or the source
   * is cancelled (an abruptly-killed process leaks it to OS tmp reaping).
   */
  readonly outputSpool?:
    | true
    | {
        /** In-memory head bound in bytes before records spill (default 1 MiB). */
        readonly memoryBytes?: number;
        /** Directory holding the spill file (default: the OS temp directory). */
        readonly directory?: string;
      };
}

/** Ready zigpty-route Backend produced by `createZigptyBackend()`. */
export interface ZigptyBackend extends ReadyPtyBackend {}

/**
 * The master-side stream the substrate reads through, narrowed to the
 * surface the exit-window interception needs. This transport internal is
 * load-bearing the same way the node-pty adapter's `_socket` is: the
 * substrate's fork-exit callback destroys `_readable` synchronously after
 * emitting exit (no flush), which drops fast-exit children's kernel-buffered
 * output whenever the exit callback wins the race against the first read
 * delivery (observed deterministically on linux CI, 2026-09-07). The
 * Endpoint's exit listener runs BEFORE that destroy and repossesses the
 * stream; see `interceptExitTeardown`.
 */
interface SubstrateReadable {
  on(event: "data", listener: (data: string | Buffer) => void): unknown;
  once(event: "end" | "close" | "error", listener: () => void): unknown;
  pause(): void;
  resume(): void;
}

/**
 * Structural type of the substrate surface this adapter uses. `pause()`/
 * `resume()` are public master-read gates before child exit; `_readable` is
 * the repossessed transport after the exit window (see `SubstrateReadable`).
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
  /** Transport internal; the Endpoint nulls it inside the exit window. */
  _readable?: SubstrateReadable | undefined;
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
 * - `writeDecode`: input `"both"` — byte values are admitted raw and decoded
 *   through one stateful adapter-owned decoder at pump time, so a value
 *   rejected by saturation never advances decoder state (whole-value
 *   admission stays atomic; retrying the same bytes decodes identically).
 * - `encoding "buffer"`: output `"bytes"` — `onData` emits `Buffer`.
 * - `encoding "utf8"`: output `"text"` — `onData` emits strings.
 *
 * A fatal writeDecode failure (or a substrate write failure) at pump time
 * fails the input surface terminally: pending values are dropped, drain
 * waiters reject, and later `write()` calls rethrow the same typed failure.
 *
 * Output memory law (Owner directive 2026-09-07: adapter-level 磁盘化): the
 * substrate's output flow control cannot reach the kernel everywhere — its
 * `pause()`/`resume()` are inert on Windows, and even where they work a
 * consumer stalling between the pause taking effect keeps bursts queued.
 * With `outputSpool` enabled, `onData` admits records into a FIFO spool
 * (bounded memory head, disk tail) and a `desiredSize`-gated pump replays
 * them into the source strictly at the consumer's pace. Transport-EOF
 * triggers request completion instead of closing: completion fires only
 * after the tail drains, so the fast-exit output survives even when the
 * consumer is behind; explicit `close()` and cancellation still complete
 * synchronously and drop undelivered records. A backlogged spool also
 * propagates pressure into the kernel where the substrate can pause.
 *
 * Lifecycle mapping (verified against the substrate sources and probes):
 * - `close()` never calls the substrate `close()` while the child lives: the
 *   substrate closes the master fd and then explicitly `kill(pid, "SIGHUP")`,
 *   which would cascade transport close into child termination. The
 *   Endpoint pauses master reads and defers the substrate close until the
 *   exit observation settles (the substrate's own liveness probe then skips
 *   the signal for a dead pid).
 * - `terminate()` is the substrate's `kill()` with its default signal
 *   (`SIGHUP`) followed by a master-read resume, and never touches the
 *   transport. Both operations are idempotent and synchronous. The resume
 *   is load-bearing: the substrate defers the exit observation while
 *   undrained output sits behind paused reads (observed on darwin,
 *   2026-09-07: a killed flooded child with paused reads never settles
 *   `exited`), so termination always lets the finite backlog drain and the
 *   observation land.
 * - The substrate's fork-exit callback destroys its master-side ReadStream
 *   synchronously after emitting exit, with no flush — output still
 *   kernel-buffered when the exit callback wins the race against the first
 *   read delivery is dropped (observed for fast-exit children on linux CI).
 *   The Endpoint's exit listener runs inside that same `_handleExit` BEFORE
 *   the destroy and repossesses the stream (`_readable` is detached, the
 *   Endpoint attaches its own data listener because the substrate just
 *   cleared its forwarding chain), so late output is delivered and the
 *   stream's own `end`/`close` becomes the REAL transport-EOF signal. A
 *   quiescence window (re-armed by every late chunk) only synthesizes EOF
 *   when neither signal fires. Declared substrate limits that remain:
 *   output from descendants still holding the slave after session-leader
 *   death is bounded by that window, and a transport read error is
 *   indistinguishable from clean EOF (the substrate swallows stream
 *   errors; the self-destruct that follows is treated as completion).
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
  private readonly spool: OutputSpool | undefined;
  private streamController!: ReadableStreamDefaultController<NativeChunk>;
  private readonly dataSubscription: { dispose(): void };
  private streamFinished = false;
  private closed = false;
  private terminated = false;
  private transportReleased = false;
  /** Resolved exactly when the private output source completed. */
  private readonly streamDone: Promise<void>;
  private streamDoneResolve!: () => void;
  private outputPumpScheduled = false;
  /** Transport EOF arrived while the spool still held undelivered records. */
  private outputEofPending = false;

  private readonly hardBytes: number;
  private readonly softBytes: number;
  private pending: NativeInput[] = [];
  private pendingBytes = 0;
  private pumpScheduled = false;
  private inputFailure: UniPtyError | undefined;
  private lateReadable: SubstrateReadable | undefined;
  private eofTimer: ReturnType<typeof setTimeout> | undefined;
  private drainWaiters: Array<{
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
  }> = [];

  constructor(
    pty: SubstratePty,
    encoding: "buffer" | "utf8",
    writeDecoder: TextDecoder | undefined,
    writeQueueBytes: number,
    spoolOptions: OutputSpoolOptions | undefined,
  ) {
    this.pty = pty;
    this.encoding = encoding;
    this.writeDecoder = writeDecoder;
    this.spool = spoolOptions === undefined ? undefined : new OutputSpool(spoolOptions);
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
      // into the kernel instead of growing an adapter queue — except where
      // the substrate's pause is inert (Windows), where a spool bounds the
      // growth instead. Replays backlogged spool records on every pull.
      pull: () => {
        this.resumeReads();
        this.pumpOutputs();
      },
      // Core never cancels the private source (public views only detach); if
      // something ever does, detach the subscription and drop later chunks.
      cancel: () => {
        this.streamFinished = true;
        this.dataSubscription?.dispose();
        this.spool?.close();
      },
    });
    let resolveExit!: (result: BackendExitResult) => void;
    this.exited = new Promise<BackendExitResult>((resolve) => {
      resolveExit = resolve;
    });
    this.streamDone = new Promise<void>((resolve) => {
      this.streamDoneResolve = resolve;
    });
    this.dataSubscription = pty.onData((data) => this.onData(data));
    pty.onExit((event) => {
      // Runs synchronously inside the substrate's `_handleExit`, BEFORE the
      // fork-exit callback destroys the master-side stream: repossess the
      // readable so fast-exit output still kernel-buffered at this moment is
      // delivered instead of dropped (the substrate has no flush).
      this.interceptExitTeardown();
      resolveExit(toExitResult(event));
    });
    void this.exited.then(() => {
      // Synthesized transport EOF (see class docs) is now the FALLBACK: the
      // repossessed stream usually reports the real end first (master EOF on
      // darwin, EIO-driven close on linux). The quiescence window only
      // bounds the wait when neither signal fires, and late chunks extend
      // it so trailing output is never cut by a fixed deadline.
      this.armSynthesizedEof();
    });
  }

  /**
   * Repossess the substrate's master-side stream inside the exit window.
   * The substrate's fork-exit callback runs `_handleExit()` — which emits
   * exit listeners synchronously and CLEARS the data listeners — and then
   * destroys `_readable` with no flush. This listener therefore:
   * - detaches `_readable` from the substrate so that destroy is a no-op,
   * - attaches the Endpoint's own data listener (the substrate's forwarding
   *   chain was just cleared), and
   * - subscribes to the stream's own end/close/error, which are the real
   *   transport-EOF signals the substrate never re-exposes.
   */
  private interceptExitTeardown(): void {
    if (this.lateReadable !== undefined) return;
    const readable = this.pty._readable;
    if (readable === undefined) return;
    this.pty._readable = undefined;
    this.lateReadable = readable;
    readable.on("data", (data) => this.onData(data));
    readable.once("end", () => this.requestStreamCompletion());
    readable.once("close", () => this.requestStreamCompletion());
    // A master read error after the last slave side closes is the linux EOF
    // shape (EIO); the substrate swallows stream errors, so treat the
    // self-destruct that follows as completion rather than a lost failure.
    readable.once("error", () => this.requestStreamCompletion());
  }

  private armSynthesizedEof(): void {
    if (this.eofTimer !== undefined) clearTimeout(this.eofTimer);
    this.eofTimer = setTimeout(() => this.requestStreamCompletion(), EOF_QUIESCENCE_MS);
  }

  private onData(data: string | Buffer): void {
    if (this.streamFinished) return;
    if (this.eofTimer !== undefined) {
      // Post-exit trailing output: extend the synthesized-EOF quiescence
      // window instead of racing it.
      this.armSynthesizedEof();
    }
    const chunk: NativeChunk =
      this.encoding === "utf8"
        ? { kind: "text", text: data as string }
        : { kind: "bytes", bytes: data as Buffer };
    if (this.spool !== undefined) {
      try {
        this.spool.append(chunk);
      } catch (error) {
        // A failed spill (ENOSPC, vanished directory) must not silently
        // unbound memory: fail the source with the typed spool failure.
        this.failStream(
          error instanceof UniPtyError
            ? error
            : new UniPtyError("unsupported", "the output spool failed"),
        );
        return;
      }
      if (this.spool.isBacklogged) {
        // The memory bound is exceeded: propagate pressure into the kernel
        // where the substrate can actually pause (inert on Windows, where
        // the spool itself is the bound).
        this.pauseReads();
      }
      this.scheduleOutputPump();
      return;
    }
    this.enqueueChunk(chunk);
  }

  /**
   * Enqueue one chunk. Without a spool this pauses native reads as soon as
   * the source stops pulling (kernel-first backpressure). With a spool the
   * memory bound is deliberately the FIRST-line buffer — the spool absorbs
   * bursts up to `memoryBytes` while the child keeps running, and pressure
   * propagates into the kernel only past that bound (where the substrate
   * can actually pause; on Windows the spool itself is the bound).
   */
  private enqueueChunk(chunk: NativeChunk): void {
    try {
      this.streamController.enqueue(chunk);
      if (this.spool === undefined && (this.streamController.desiredSize ?? 1) <= 0) {
        this.pauseReads();
      }
    } catch {
      // The source was cancelled or closed between the guard and the enqueue.
      this.streamFinished = true;
      this.dataSubscription.dispose();
    }
  }

  private scheduleOutputPump(): void {
    if (this.outputPumpScheduled || this.spool === undefined || this.streamFinished) return;
    this.outputPumpScheduled = true;
    queueMicrotask(() => {
      this.outputPumpScheduled = false;
      this.pumpOutputs();
    });
  }

  /**
   * Replay spool records into the source only while the consumer pulls
   * (`desiredSize`), so at most the stream's own water-mark of records sits
   * in the controller and the spool absorbs bursts and stalls. After a
   * transport-EOF request, completion fires only once the tail has fully
   * drained — the data stays readable while the consumer catches up, never
   * cut by the EOF trigger.
   */
  private pumpOutputs(): void {
    const spool = this.spool;
    if (spool === undefined || this.streamFinished) return;
    while (!spool.isEmpty) {
      // Always honor the consumer's pace — including after a transport-EOF
      // request, where draining the whole tail into the controller would
      // reintroduce exactly the unbounded memory the spool exists to bound.
      if ((this.streamController.desiredSize ?? 0) <= 0) break;
      let chunk: NativeChunk;
      try {
        const next = spool.readNext();
        if (next === undefined) break;
        chunk = next;
      } catch (error) {
        this.failStream(
          error instanceof UniPtyError
            ? error
            : new UniPtyError("unsupported", "the output spool failed during replay"),
        );
        return;
      }
      const wasFinished = this.streamFinished;
      this.enqueueChunk(chunk);
      if (this.streamFinished && !wasFinished) return;
    }
    if (this.outputEofPending && spool.isEmpty) {
      this.finishStream();
    }
  }

  /**
   * Transport-EOF entry point. Without a spool (or once it has drained) this
   * completes the source immediately; with backlogged records it defers
   * completion behind consumer-paced replay so the tail is delivered whole.
   */
  private requestStreamCompletion(): void {
    if (this.streamFinished) return;
    if (this.spool !== undefined && !this.spool.isEmpty) {
      this.outputEofPending = true;
      this.pumpOutputs();
      return;
    }
    this.finishStream();
  }

  /** Fail the private source terminally (spool IO class), then clean up. */
  private failStream(error: UniPtyError): void {
    if (this.streamFinished) return;
    this.streamFinished = true;
    this.dataSubscription.dispose();
    this.spool?.close();
    this.streamDoneResolve();
    try {
      this.streamController.error(error);
    } catch {
      // Already closed by cancellation or a prior completion.
    }
  }

  /** Pause master reads through whichever surface currently owns them. */
  private pauseReads(): void {
    if (this.lateReadable !== undefined) this.lateReadable.pause();
    else this.pty.pause();
  }

  /** Resume master reads through whichever surface currently owns them. */
  private resumeReads(): void {
    if (this.lateReadable !== undefined) this.lateReadable.resume();
    else this.pty.resume();
  }

  private finishStream(): void {
    if (this.eofTimer !== undefined) {
      clearTimeout(this.eofTimer);
      this.eofTimer = undefined;
    }
    if (this.streamFinished) return;
    this.streamFinished = true;
    this.dataSubscription.dispose();
    // The spool is empty here on the natural path (completion waits for the
    // drain); on explicit close/cancellation this drops undelivered records
    // and deletes the spill file.
    this.spool?.close();
    this.streamDoneResolve();
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
    if (this.inputFailure !== undefined) {
      // A previously admitted value already failed the writeDecode policy at
      // pump time; the input surface stays failed rather than silently
      // resuming mid-stream.
      throw this.inputFailure;
    }
    // The substrate write is string-only in every mode; the strict upper
    // layer never decodes bytes implicitly.
    if (input.kind === "bytes" && this.writeDecoder === undefined) {
      throw new UniPtyError(
        "unsupported",
        "byte input requires writeDecode on the text-native zigpty endpoint",
      );
    }
    // Admission accounting runs BEFORE any decoder state advance: a value
    // rejected by saturation must leave the stateful writeDecode decoder
    // exactly where it was, or the retry of the same bytes would decode
    // against already-consumed state (a silent partial acceptance).
    const valueBytes = admittedBytes(input);
    if (this.pendingBytes + valueBytes > this.hardBytes) {
      // Saturation rejects the whole value: nothing of it was accepted.
      throw new UniPtyError(
        "backpressure",
        "the bounded pending-write queue is saturated; the whole value was rejected",
        { details: { pendingBytes: this.pendingBytes, hardBytes: this.hardBytes } },
      );
    }
    this.pending.push(input);
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
    if (this.inputFailure !== undefined) return Promise.reject(this.inputFailure);
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

  /** Decode one admitted byte value through the stateful pump-side decoder. */
  private decodeAdmitted(bytes: Uint8Array): string {
    if (this.writeDecoder === undefined) {
      // Unreachable: admission rejects byte values without writeDecode.
      throw new UniPtyError("unsupported", "byte input requires writeDecode");
    }
    try {
      // Streaming mode keeps partial multibyte sequences pending across
      // values; this is what makes the adapter decoder stateful. Decoding
      // happens only for values that passed admission, so a saturated
      // (rejected) value never advances decoder state.
      return this.writeDecoder.decode(bytes, { stream: true });
    } catch (cause) {
      throw new UniPtyError(
        "invalid-argument",
        "byte input failed the configured writeDecode policy",
        {
          details: { mode: "writeDecode" },
          cause,
        },
      );
    }
  }

  private pumpPending(): void {
    while (this.pending.length > 0) {
      const admitted = this.pending[0];
      if (admitted === undefined) break;
      let text: string;
      if (admitted.kind === "text") {
        text = admitted.text;
      } else {
        try {
          text = this.decodeAdmitted(admitted.bytes);
        } catch (error) {
          this.failInput(
            error instanceof UniPtyError
              ? error
              : new UniPtyError(
                  "invalid-argument",
                  "byte input failed the configured writeDecode policy",
                ),
          );
          return;
        }
      }
      try {
        this.pty.write(text);
      } catch (cause) {
        this.failInput(new UniPtyError("closed", "substrate write failed", { cause }));
        return;
      }
      this.pending.shift();
      // Symmetric with admission: the same raw metric that reserved the
      // space is what releases it, so a decoded multibyte carry can never
      // make the accounting drift below the true queue occupancy.
      this.pendingBytes -= admittedBytes(admitted);
    }
    if (this.pendingBytes <= this.softBytes) this.settleDrain();
  }

  private failInput(error: UniPtyError): void {
    this.pending = [];
    this.pendingBytes = 0;
    this.inputFailure = error;
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
    // Reads are deliberately NOT paused here: post-close chunks already
    // hit the discard path (`onData` returns once the source finished), the
    // data path's own pause keeps any queue bounded, and pausing would
    // defer the exit observation behind undrained output when the child
    // dies next (the substrate's paused-reads exit starvation, observed on
    // darwin 2026-09-07). Keeping reads flowing lets `exited` — which
    // survives close — settle as soon as the child actually dies.
    // Physical teardown is DEFERRED until BOTH the exit observation settles
    // AND the output source completed: the substrate close closes the master
    // fd and explicitly SIGHUPs a live child (close must not cascade into
    // termination), and closing the fd earlier than source completion would
    // cut late kernel-buffered output the interception preserved. The spec
    // allows physical cleanup to finish asynchronously.
    void this.exited
      .then(() => this.streamDone)
      .then(
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
    // Substrate law (observed on darwin, 2026-09-07): the exit observation
    // defers while undrained output sits behind paused master reads — a
    // killed flooded child would otherwise never settle `exited` until some
    // reader resumed. Resuming lets the now-finite kernel backlog drain
    // into the bounded queue (or the spool) and the exit observation land.
    try {
      this.resumeReads();
    } catch {
      // The substrate may already have torn its read stream down.
    }
  }
}

function isFinitePositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value > 0 && Number.isFinite(value)
  );
}

/**
 * Queue-occupancy metric for one admitted value. Admission reservation and
 * pump release must use the SAME metric: raw UTF-8 size for text, raw byte
 * length for bytes (the decoded form is produced only at pump time).
 */
function admittedBytes(input: NativeInput): number {
  return input.kind === "text" ? Buffer.byteLength(input.text, "utf8") : input.bytes.byteLength;
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

/**
 * Ceiling of the post-exit quiescence window that synthesizes transport EOF
 * when the repossessed master stream reports neither `end` nor `close`. Late
 * chunks re-arm the window, so this never cuts trailing output; it only
 * bounds how long a silent master can hold the source open (the ordinary
 * linux/macOS EOF shapes fire the real signal far earlier).
 */
const EOF_QUIESCENCE_MS = 50;

function spawnEndpoint(
  surface: SubstrateSurface,
  launch: StructuredLaunch,
  encoding: "buffer" | "utf8",
  writeDecode: true | TextDecoder | undefined,
  name: string | undefined,
  writeQueueBytes: number,
  spoolOptions: OutputSpoolOptions | undefined,
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
  return new ZigptyEndpoint(
    pty,
    encoding,
    endpointWriteDecoder(writeDecode),
    writeQueueBytes,
    spoolOptions,
  );
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
  // Throws `invalid-argument` on malformed shapes; snapshotted once here so
  // a mutable options object cannot reconfigure later PTYs.
  const spoolOptions = normalizeOutputSpool(options?.outputSpool);
  const surface = await loadSubstrate();
  if (!surface.hasNative) {
    throw new UniPtyError(
      "unsupported",
      "zigpty native bindings are unavailable on this runtime/platform tuple; the pipe fallback is never used as a PTY substitute",
      { details: { substrate: "zigpty" } },
    );
  }
  // Snapshot the caller's option values once at readiness: a mutable options
  // object must not change the representation of PTYs spawned later by the
  // same ready Backend.
  const encoding = options?.encoding ?? "buffer";
  const writeDecode = options?.writeDecode;
  const name = options?.name;
  return {
    spawn: (launch: StructuredLaunch) =>
      spawnEndpoint(surface, launch, encoding, writeDecode, name, writeQueueBytes, spoolOptions),
    dispose: () => Promise.resolve(),
  };
}
