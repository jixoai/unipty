/**
> Orthogonal intents (2026-08-20): official Bun Backend adapting the
> runtime-native `Bun.Terminal` substrate (Bun >= 1.3.13 POSIX, >= 1.3.14
> Windows ConPTY).
 *
 * Substrate facts confirmed against bun-types 1.3.14 and runtime probes on
 * darwin-arm64 (2026-08-20):
 * - `new Bun.Terminal(options)` allocates a bare PTY (`cols`, `rows`, and
 *   `data`/`exit`/`drain` callbacks only); the child comes from
 *   `Bun.spawn(argv, { terminal, cwd, env })`.
 * - Output arrives as `Uint8Array` through the `data` callback; chunk buffers
 *   are freshly allocated per callback and stable.
 * - The Terminal `exit` callback reports PTY transport status (0 = clean EOF,
 *   1 = read error), never the child exit code; child completion is observed
 *   through `Subprocess.exited` plus `exitCode`/`signalCode`.
 * - `Subprocess.exited` resolves `128 + signal` for signalled death while
 *   `exitCode` stays `null` and `signalCode` carries the name, so the honest
 *   `BackendExitResult` reads `exitCode`/`signalCode` after awaiting `exited`.
 * - `terminal.write()` accepted 200 MiB with a non-reading child without ever
 *   returning partial acceptance and without firing `drain`: the substrate
 *   supplies effectively no write backpressure, so this adapter's bounded
 *   pending-write queue is the only backpressure boundary.
 * - `terminal.close()` closes the transport only: it sends no signal and does
 *   not synchronously settle the child exit observation. `Subprocess.kill()`
 *   (default SIGTERM) is the termination request; repeated calls are safe.
 */

import { UniPtyError } from "unipty";
import type {
  BackendEndpoint,
  BackendExitResult,
  NativeChunk,
  NativeInput,
  ReadyPtyBackend,
  StructuredLaunch,
} from "unipty";

// ---------------------------------------------------------------------------
// Structural substrate views
// ---------------------------------------------------------------------------

/**
 * The subset of `Bun.Terminal` this adapter drives. Structural typing keeps
 * the adapter honest about exactly what it touches and lets the runtime guard
 * validate presence without importing anything at module scope.
 */
interface BunTerminalHandle {
  readonly closed: boolean;
  write(data: Uint8Array): number;
  resize(cols: number, rows: number): void;
  close(): void;
}

/** Structural constructor view of `Bun.Terminal`. */
interface BunTerminalConstructor {
  new (options: {
    readonly cols?: number;
    readonly rows?: number;
    readonly data?: (terminal: BunTerminalHandle, data: Uint8Array) => void;
    readonly exit?: (terminal: BunTerminalHandle, exitCode: number, signal: string | null) => void;
    readonly drain?: (terminal: BunTerminalHandle) => void;
  }): BunTerminalHandle;
}

/** The subset of `Bun.Subprocess` this adapter observes and controls. */
interface BunSpawnedProcess {
  readonly exited: Promise<number>;
  readonly exitCode: number | null;
  readonly signalCode: string | null;
  kill(signal?: number | string): void;
}

/** Structural view of the `Bun.spawn(argv, { terminal })` call used here. */
type BunSpawnFunction = (
  argv: readonly string[],
  options: {
    readonly terminal: BunTerminalHandle;
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string>>;
  },
) => BunSpawnedProcess;

/** Everything the ready Backend and its Endpoints need from the runtime. */
interface BunSubstrate {
  readonly Terminal: BunTerminalConstructor;
  readonly spawn: BunSpawnFunction;
  readonly version: string;
}

/**
 * Resolve the Bun substrate dynamically. Returns `null` outside Bun or on a
 * Bun build without `Bun.Terminal` (before 1.3.13); the factory turns that
 * into a typed `unsupported` failure.
 */
function resolveBunSubstrate(): BunSubstrate | null {
  const bunGlobal = (globalThis as { readonly Bun?: unknown }).Bun;
  if (bunGlobal === undefined) {
    return null;
  }
  const fields = bunGlobal as {
    readonly Terminal?: unknown;
    readonly spawn?: unknown;
    readonly version?: unknown;
  };
  if (
    typeof fields.Terminal !== "function" ||
    typeof fields.spawn !== "function" ||
    typeof fields.version !== "string"
  ) {
    return null;
  }
  return {
    Terminal: fields.Terminal as BunTerminalConstructor,
    spawn: fields.spawn as BunSpawnFunction,
    version: fields.version,
  };
}

/** Parse the leading `major.minor.patch` of a runtime version string. */
function parseVersionTriple(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null) {
    return [-1, -1, -1];
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionAtLeast(version: string, floor: readonly [number, number, number]): boolean {
  const [major, minor, patch] = parseVersionTriple(version);
  if (major !== floor[0]) {
    return major > floor[0];
  }
  if (minor !== floor[1]) {
    return minor > floor[1];
  }
  return patch >= floor[2];
}

// ---------------------------------------------------------------------------
// Factory and Backend
// ---------------------------------------------------------------------------

/**
 * Backend-owned queue tuning. `writeQueueBytes` is the hard bound of each
 * PTY's bounded pending-write queue in bytes; the soft resume mark is three
 * quarters of it. Numeric queue policy is Backend-owned, not a UniPty option.
 */
export interface BunBackendOptions {
  readonly writeQueueBytes?: number;
}

/** A ready Bun Backend: the substrate is runtime-owned, so readiness is done. */
export interface BunBackend extends ReadyPtyBackend {
  /** Stable Backend identity (`bun`), mirroring metadata `backend.id`. */
  readonly backendId: "bun";
  /** Hard bound in bytes of each spawned Endpoint's pending-write queue. */
  readonly writeQueueBytes: number;
}

/** Default pending-write queue bound: 1 MiB per PTY. */
export const DEFAULT_WRITE_QUEUE_BYTES = 1 << 20;

/** Substrate version floor: POSIX since 1.3.13, Windows ConPTY since 1.3.14. */
const VERSION_FLOOR_POSIX: readonly [number, number, number] = [1, 3, 13];
const VERSION_FLOOR_WINDOWS: readonly [number, number, number] = [1, 3, 14];

/**
 * Pure support-floor predicate for the Bun substrate: POSIX requires
 * 1.3.13 (the release that introduced `Bun.Terminal`); Windows (ConPTY)
 * requires 1.3.14. Exported side-effect-free so acquisition tooling can
 * preflight a Bun version string without initializing anything. A `true`
 * result is a version claim only — never a verified-support claim.
 */
export function isSupportedBunVersion(
  version: string,
  platform: string = process.platform,
): boolean {
  return versionAtLeast(
    version,
    platform === "win32" ? VERSION_FLOOR_WINDOWS : VERSION_FLOOR_POSIX,
  );
}

/**
 * Acquire the ready Bun Backend.
 *
 * @throws UniPtyError `unsupported` outside Bun, on a Bun without
 * `Bun.Terminal`, or below the platform's version floor (1.3.13 POSIX,
 * 1.3.14 Windows).
 * @throws UniPtyError `invalid-argument` for a malformed `writeQueueBytes`.
 */
export async function createBunBackend(options: BunBackendOptions = {}): Promise<BunBackend> {
  const writeQueueBytes = options.writeQueueBytes ?? DEFAULT_WRITE_QUEUE_BYTES;
  if (!Number.isInteger(writeQueueBytes) || writeQueueBytes <= 0) {
    throw new UniPtyError("invalid-argument", "writeQueueBytes must be a positive integer", {
      details: { writeQueueBytes },
    });
  }
  const substrate = resolveBunSubstrate();
  if (substrate === null) {
    throw new UniPtyError(
      "unsupported",
      "@unipty/backend-bun requires the Bun runtime with Bun.Terminal (Bun >= 1.3.13 on Linux/macOS, >= 1.3.14 on Windows)",
    );
  }
  const floor: [number, number, number] =
    process.platform === "win32" ? [1, 3, 14] : [1, 3, 13];
  if (!isSupportedBunVersion(substrate.version)) {
    throw new UniPtyError(
      "unsupported",
      `@unipty/backend-bun requires Bun ${floor.join(".")} or newer on this platform`,
      { details: { found: substrate.version, required: floor.join(".") } },
    );
  }
  let disposal: Promise<void> | undefined;
  return {
    backendId: "bun",
    writeQueueBytes,
    spawn: (launch: StructuredLaunch): BackendEndpoint =>
      new BunTerminalEndpoint(substrate, launch, writeQueueBytes),
    // The substrate is owned by the Bun runtime: there are no shared Backend
    // resources to release, so disposal resolves immediately and is reused.
    dispose: (): Promise<void> => (disposal ??= Promise.resolve()),
  };
}

// ---------------------------------------------------------------------------
// Endpoint adapter
// ---------------------------------------------------------------------------

/**
 * One Core-private Endpoint over `Bun.Terminal` plus a `Bun.spawn` child.
 *
 * Representation honesty: both directions are native bytes. The `data`
 * callback's `Uint8Array` chunks are passed through without copying (buffers
 * are freshly allocated per callback); `{ kind: "text" }` input is encoded
 * UTF-8 as documented defense-in-depth, because Core never sends text to a
 * declared-bytes input.
 */
class BunTerminalEndpoint implements BackendEndpoint {
  readonly native = { input: "bytes", output: "bytes" } as const;
  readonly output: ReadableStream<NativeChunk>;
  readonly exited: Promise<BackendExitResult>;

  private readonly terminal: BunTerminalHandle;
  private readonly child: BunSpawnedProcess;
  private readonly encoder = new TextEncoder();

  private readonly hardLimit: number;
  private readonly softMark: number;

  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private pumpScheduled = false;
  private substrateWritable = true;
  private inputClosed = false;
  private endpointClosed = false;
  private terminated = false;
  private drainWaiters: Array<{
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
  }> = [];

  private outputDetached = false;
  private outputController: ReadableStreamDefaultController<NativeChunk> | undefined;

  constructor(
    substrate: BunSubstrate,
    launch: StructuredLaunch,
    writeQueueBytes: number,
  ) {
    if (launch.argv.length === 0) {
      // Core validates this first; the guard keeps the Backend total.
      throw new UniPtyError("invalid-argument", "launch argv must be a non-empty vector");
    }
    this.hardLimit = writeQueueBytes;
    this.softMark = Math.max(1, Math.floor((writeQueueBytes * 3) / 4));

    this.output = new ReadableStream<NativeChunk>({
      start: (controller) => {
        this.outputController = controller;
      },
      cancel: () => {
        // Only the private view detaches (Core cancel during teardown); the
        // substrate keeps being drained and later output is discarded.
        this.outputDetached = true;
      },
    });

    let terminal: BunTerminalHandle;
    try {
      terminal = new substrate.Terminal({
        cols: launch.cols,
        rows: launch.rows,
        data: (_terminal, data) => this.onSubstrateData(data),
        exit: (_terminal, exitCode) => this.onSubstrateExit(exitCode),
        drain: () => this.onSubstrateDrain(),
      });
    } catch (cause) {
      throw new UniPtyError("unsupported", "Bun.Terminal construction failed", {
        cause,
        details: { cols: launch.cols, rows: launch.rows },
      });
    }
    this.terminal = terminal;

    const spawnOptions: {
      terminal: BunTerminalHandle;
      cwd?: string;
      env?: Readonly<Record<string, string>>;
    } = { terminal };
    if (launch.cwd !== undefined) {
      spawnOptions.cwd = launch.cwd;
    }
    if (launch.env !== undefined) {
      spawnOptions.env = launch.env;
    }
    let child: BunSpawnedProcess;
    try {
      child = substrate.spawn(launch.argv, spawnOptions);
    } catch (cause) {
      try {
        terminal.close();
      } catch {
        // The transport never carried a child; substrate idempotency guard.
      }
      throw new UniPtyError("unsupported", "Bun.spawn failed to launch the structured argv", {
        cause,
        details: { argv0: launch.argv[0] },
      });
    }
    this.child = child;

    // Independent of transport EOF, stream cancellation, and close: the
    // observation survives close() and never rejects (an observation gap is
    // reported as null/null rather than a failure).
    this.exited = child.exited.then(
      () => this.observeExit(),
      () => this.observeExit(),
    );
  }

  write(input: NativeInput): boolean {
    if (this.endpointClosed || this.inputClosed) {
      throw new UniPtyError("closed", "this PTY endpoint is closed; write() is rejected");
    }
    // Admission may be asynchronous, so the accepted value is copied into
    // queue-owned memory (TextEncoder output is already fresh); a caller
    // detaching or transferring its buffer afterwards cannot corrupt delivery.
    const bytes = input.kind === "bytes" ? input.bytes.slice() : this.encoder.encode(input.text);
    const valueBytes = bytes.byteLength;
    if (this.pendingBytes + valueBytes > this.hardLimit) {
      // Saturation rejects the whole value: nothing of it was accepted.
      throw new UniPtyError(
        "backpressure",
        "the bounded pending-write queue is saturated; the whole value was rejected",
        { details: { pendingBytes: this.pendingBytes, writeQueueBytes: this.hardLimit, valueBytes } },
      );
    }
    this.pending.push(bytes);
    this.pendingBytes += valueBytes;
    this.schedulePump();
    // Write Readiness: `false` means pause and await drain(), never retry.
    return this.pendingBytes <= this.softMark;
  }

  drain(): Promise<void> {
    if (this.endpointClosed || this.inputClosed) {
      return Promise.reject(
        new UniPtyError("closed", "PTY input is no longer writable; drain() cannot recover readiness"),
      );
    }
    if (this.pendingBytes <= this.softMark) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.drainWaiters.push({ resolve, reject });
    });
  }

  resize(cols: number, rows: number): void {
    if (this.endpointClosed) {
      throw new UniPtyError("closed", "this PTY endpoint is closed; resize() is rejected");
    }
    try {
      this.terminal.resize(cols, rows);
    } catch (cause) {
      if (cause instanceof UniPtyError) {
        throw cause;
      }
      throw new UniPtyError("unsupported", "Bun.Terminal rejected this resize request", {
        cause,
        details: { cols, rows },
      });
    }
  }

  close(): void {
    if (this.endpointClosed) {
      return;
    }
    this.endpointClosed = true;
    this.inputClosed = true;
    this.pending = [];
    this.pendingBytes = 0;
    this.settleDrain(
      new UniPtyError("closed", "this PTY endpoint was closed; drain() cannot recover readiness"),
    );
    try {
      // Transport close only: no child signal is sent. The Terminal `exit`
      // callback completes the output stream with clean EOF; the child exit
      // observation stays independent (a child that loses its controlling
      // terminal is terminated by the operating system, not by this call).
      this.terminal.close();
    } catch {
      // Substrate idempotency guard.
    }
  }

  terminate(): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    try {
      // Termination request only: default SIGTERM, no transport close.
      this.child.kill();
    } catch {
      // Idempotent request acceptance; repeated requests add no new effect.
    }
  }

  private observeExit(): BackendExitResult {
    const exitCode = this.child.exitCode;
    const signal = this.child.signalCode;
    if (exitCode !== null) {
      return { exitCode, signal };
    }
    // Signalled death keeps `exitCode` null in Bun (`exited` resolving
    // 128 + signal is a convention, not an exit code); when neither fact is
    // observable the honest report is null/null.
    return { exitCode: null, signal };
  }

  private onSubstrateData(data: Uint8Array): void {
    if (this.outputDetached) {
      return;
    }
    const controller = this.outputController;
    if (controller === undefined) {
      return;
    }
    try {
      controller.enqueue({ kind: "bytes", bytes: data });
    } catch {
      // The stream was cancelled concurrently; later output is discarded.
    }
  }

  private onSubstrateExit(exitCode: number): void {
    if (this.outputDetached) {
      return;
    }
    const controller = this.outputController;
    if (controller === undefined) {
      return;
    }
    if (exitCode === 0) {
      try {
        controller.close();
      } catch {
        // Already closed or errored.
      }
      return;
    }
    try {
      controller.error(
        new UniPtyError("closed", "Bun.Terminal PTY transport ended with a read failure", {
          details: { ptyExitStatus: exitCode },
        }),
      );
    } catch {
      // Already closed or errored.
    }
  }

  private onSubstrateDrain(): void {
    this.substrateWritable = true;
    this.schedulePump();
  }

  private schedulePump(): void {
    if (this.pumpScheduled) {
      return;
    }
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pump();
    });
  }

  private pump(): void {
    if (this.endpointClosed || this.inputClosed) {
      return;
    }
    while (this.pending.length > 0 && this.substrateWritable) {
      const segment = this.pending[0];
      if (segment === undefined) {
        break;
      }
      let accepted: number;
      try {
        accepted = this.terminal.write(segment);
      } catch (cause) {
        this.failInput(new UniPtyError("closed", "Bun.Terminal write failed", { cause }));
        return;
      }
      const written = Math.max(0, accepted);
      if (written >= segment.byteLength) {
        this.pending.shift();
        this.pendingBytes -= segment.byteLength;
        continue;
      }
      // Partial substrate acceptance (not observed on macOS 1.3.14, kept for
      // cross-platform honesty): retain the remainder at the queue head and
      // wait for the substrate drain callback before writing again.
      this.pending[0] = segment.slice(written);
      this.pendingBytes -= written;
      this.substrateWritable = false;
      break;
    }
    if (this.pendingBytes <= this.softMark) {
      this.settleDrain();
    }
  }

  private failInput(error: UniPtyError): void {
    this.inputClosed = true;
    this.pending = [];
    this.pendingBytes = 0;
    this.settleDrain(error);
  }

  private settleDrain(error?: UniPtyError): void {
    const waiters = this.drainWaiters;
    this.drainWaiters = [];
    for (const waiter of waiters) {
      if (error === undefined) {
        waiter.resolve();
      } else {
        waiter.reject(error);
      }
    }
  }
}
