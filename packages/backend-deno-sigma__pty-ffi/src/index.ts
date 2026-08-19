/**
 * > Orthogonal intents (2026-08-20): @unipty/backend-deno-sigma__pty-ffi
 * public entry — Deno-runtime Backend over the third-party `@sigma/pty-ffi`
 * substrate (Rust `portable-pty`).
 *
 * Original request (2026-08-17): unify Deno, Node, and Bun PTY interfaces
 * through replaceable Backends. This package is the self-contained npm route
 * for Deno: it vendors the `@sigma/pty-ffi@0.42.0/noinit` JavaScript closure
 * and the native dynamic libraries under the package-private `vendor/` tree,
 * initializes them explicitly (no JSR registry and no download at runtime),
 * and adapts the substrate to the Core-private Endpoint seam.
 *
 * Substrate truths this adapter maps honestly (see README for details):
 *
 * - The substrate's only teardown primitive is `pty_close`, which first kills
 *   the child (portable-pty `ChildKiller`; SIGKILL on Unix) and then drops
 *   the transport; there is no kill-without-close. Endpoint `close()` is
 *   therefore a logical close: it publishes the closed state, completes the
 *   output stream, and keeps a discard-mode exit watcher draining the
 *   transport so the independent exit observation stays settleable; the
 *   physical `pty_close` runs only after the child exits (or on a read
 *   failure), when it can no longer kill a live child. `terminate()`
 *   signals the child by its discovered pid (`Deno.kill`) and never touches
 *   the transport; when pid discovery is impossible, or the signal cannot be
 *   delivered, it fails explicitly with `unsupported` — never a fallback to
 *   the kill-and-close primitive and never a silent acceptance.
 * - The child exit code is observable only through reads that return `done`.
 * - The substrate reports exit code `1` for signal-terminated children
 *   (SIGKILL and SIGTERM alike), so `signal` is always `null` here: this
 *   Backend never fabricates an observed signal.
 * - The substrate write path is CString/String-based: input carrying interior
 *   NUL bytes, or byte input that is not strict UTF-8, is rejected with
 *   `invalid-argument` instead of being silently truncated or corrupted.
 */

import { UniPtyError } from "unipty";
import {
  discoverSpawnedChildPidSafe as discoverSpawnedChildPid,
  listDirectChildPids,
} from "./pid-discovery.ts";
import type {
  BackendEndpoint,
  BackendExitResult,
  NativeChunk,
  NativeInput,
  ReadyPtyBackend,
  StructuredLaunch,
} from "unipty";

// ---------------------------------------------------------------------------
// Structural types for the vendored substrate closure
//
// The vendored modules under `vendor/js/` are Deno-executed TypeScript that is
// never part of this package's TypeScript program, so the closure surface this
// adapter relies on is declared structurally below. The shapes mirror
// `@sigma/pty-ffi@0.42.0` (`mod_noinit.ts`, `src/ffi.ts`, `src/mod.ts`).
// ---------------------------------------------------------------------------

/** Substrate `PtySize` (character cells plus optional pixel cell size). */
interface SubstratePtySize {
  rows: number;
  cols: number;
  pixel_width?: number;
  pixel_height?: number;
}

/** Substrate `CommandOptions` for `new Pty(command, options)`. */
interface SubstrateCommandOptions {
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  size?: SubstratePtySize;
}

/**
 * Substrate `Pty` instance. `readBytes` is non-blocking; `done: true` carries
 * the exit observation (then `exitCode` is populated). `close` kills the child
 * and drops the transport; it is idempotent.
 */
interface SubstratePty {
  readBytes(): { data: Uint8Array; done: boolean };
  write(data: string): void;
  resize(size: SubstratePtySize): void;
  close(): void;
  readonly exitCode: number | undefined;
}

/** The vendored `mod_noinit.ts` module surface. */
interface SubstrateNoinitModule {
  instantiate(libPath?: string): Promise<void>;
  Pty: new (command: string, options?: SubstrateCommandOptions) => SubstratePty;
}

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

/**
 * Bounded write-queue policy owned by this Backend (numeric thresholds are not
 * portable UniPty options). The substrate's write channel provides no
 * completion signal, so readiness is proxy-based: accepted bytes count against
 * a window that `drain()` releases after the substrate's writer thread has had
 * an event-loop turn to consume the channel. `drain()` is not a physical
 * flush; see README.
 */
export interface DenoSigmaPtyFfiQueueOptions {
  /** Bytes above which `write()` reports `false` (pause and drain). */
  softBytes?: number;
  /** Bytes above which `write()` rejects the whole value with `backpressure`. */
  hardBytes?: number;
}

/** Acquisition options for {@linkcode createDenoSigmaPtyFfiBackend}. */
export interface DenoSigmaPtyFfiBackendOptions {
  /**
   * Explicit dynamic-library override (escape hatch). By default the factory
   * selects the vendored `vendor/lib/<os>-<arch>` library for the current
   * Deno runtime tuple. A `URL` must be a `file:` URL.
   */
  libraryPath?: string | URL;
  /** Bounded write-queue policy. */
  queue?: DenoSigmaPtyFfiQueueOptions;
  /**
   * Output poll cadence in milliseconds for the Endpoint read pump (the
   * substrate read is non-blocking). Must be a positive finite number.
   */
  pollIntervalMs?: number;
}

/** A ready Backend over the vendored `@sigma/pty-ffi` substrate. */
export interface DenoSigmaPtyFfiBackend extends ReadyPtyBackend {
  /** Structured launch over the substrate; typed synchronous failure on error. */
  spawn(launch: StructuredLaunch): BackendEndpoint;
  /**
   * Logical disposal: blocks further spawns and resolves once called. The
   * substrate keeps its dlopen'd library loaded until the process exits, so
   * there is no additional shared resource this Backend can release.
   */
  dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Runtime + vendored-asset resolution
// ---------------------------------------------------------------------------

/** The subset of `Deno.build` this package needs. */
interface DenoBuildFacts {
  readonly os: string;
  readonly arch: string;
}

/** Deno global discovery without ambient Deno types (tsc has none). */
function denoBuild(): DenoBuildFacts | undefined {
  const holder = globalThis as { Deno?: { build?: DenoBuildFacts } };
  const build = holder.Deno?.build;
  if (build === undefined || typeof build.os !== "string" || typeof build.arch !== "string") {
    return undefined;
  }
  return { os: build.os, arch: build.arch };
}

/** Vendored dynamic libraries, keyed by `<os>+<arch>` (Deno.build tokens). */
const VENDORED_LIBRARIES: Readonly<Record<string, { dir: string; file: string }>> = {
  "darwin+aarch64": { dir: "darwin-arm64", file: "libpty_arm64.dylib" },
  "darwin+x86_64": { dir: "darwin-x64", file: "libpty_x86_64.dylib" },
  "linux+aarch64": { dir: "linux-arm64", file: "libpty_aarch64.so" },
  "linux+x86_64": { dir: "linux-x64", file: "libpty_x86_64.so" },
  "windows+x86_64": { dir: "windows-x64", file: "pty.dll" },
};

/**
 * Vendored closure entry (relative to this module). The build bundles the
 * mirrored TypeScript closure into ONE plain-JavaScript ESM file: Deno
 * refuses to type-strip TypeScript under `node_modules`
 * (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so a packed npm artifact
 * consumed by an isolated installer must ship precompiled JS.
 */
const VENDORED_NOINIT_URL = new URL("../vendor/js/noinit.bundle.js", import.meta.url);

function fileUrlToPath(url: URL): string {
  let path = decodeURIComponent(url.pathname);
  if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
  return path;
}

function libraryPathFor(build: DenoBuildFacts): string {
  const library = VENDORED_LIBRARIES[`${build.os}+${build.arch}`];
  if (library === undefined) {
    throw new UniPtyError(
      "unsupported",
      `no vendored @sigma/pty-ffi library for this runtime tuple (${build.os}-${build.arch}); pass an explicit libraryPath or extend the vendored tuples`,
      { details: { os: build.os, arch: build.arch } },
    );
  }
  return fileUrlToPath(new URL(`../vendor/lib/${library.dir}/${library.file}`, import.meta.url));
}

// ---------------------------------------------------------------------------
// Closure loading and one-time initialization (Backend readiness)
// ---------------------------------------------------------------------------

let closurePromise: Promise<SubstrateNoinitModule> | undefined;

/** Deno `NotCapable` detection without ambient Deno types. */
function isPermissionError(error: unknown): boolean {
  return error instanceof Error && error.name === "NotCapable";
}

function permissionFailure(scope: string, flag: string, cause: unknown): UniPtyError {
  return new UniPtyError(
    "unsupported",
    `${scope} was denied: this Backend requires the Deno ${flag} permission (typically granted with \`deno run -A\`)`,
    { cause },
  );
}

async function loadClosure(): Promise<SubstrateNoinitModule> {
  closurePromise ??= (async () => {
    let module: unknown;
    try {
      module = await import(VENDORED_NOINIT_URL.href);
    } catch (cause) {
      if (isPermissionError(cause)) {
        throw permissionFailure(
          "importing the vendored @sigma/pty-ffi closure",
          "--allow-read",
          cause,
        );
      }
      throw new UniPtyError("unsupported", "failed to import the vendored @sigma/pty-ffi closure", {
        cause,
      });
    }
    const closure = module as Partial<SubstrateNoinitModule>;
    if (typeof closure.instantiate !== "function" || typeof closure.Pty !== "function") {
      throw new UniPtyError(
        "unsupported",
        "vendored @sigma/pty-ffi closure has an unexpected shape",
      );
    }
    return closure as SubstrateNoinitModule;
  })();
  return closurePromise;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Acquire a ready Deno Backend over the vendored `@sigma/pty-ffi` substrate.
 *
 * This is the one-time Backend readiness stage: it requires the Deno runtime,
 * imports the vendored noinit closure by relative specifier (never a JSR
 * registry import), selects the vendored dynamic library for the current
 * OS/arch (or the explicit `libraryPath` override), and explicitly initializes
 * the FFI library. Nothing downloads or caches at runtime.
 *
 * @throws UniPtyError `unsupported` outside the Deno runtime, for an unknown
 * OS/arch tuple without a `libraryPath` override, or when FFI/read permission
 * is missing (run Deno with `--allow-ffi --allow-read`, or `-A`).
 */
export async function createDenoSigmaPtyFfiBackend(
  options: DenoSigmaPtyFfiBackendOptions = {},
): Promise<DenoSigmaPtyFfiBackend> {
  const build = denoBuild();
  if (build === undefined) {
    throw new UniPtyError(
      "unsupported",
      "the @unipty/backend-deno-sigma__pty-ffi factory requires the Deno runtime (globalThis.Deno is absent)",
    );
  }

  let libraryPath: string;
  if (options.libraryPath !== undefined) {
    libraryPath =
      options.libraryPath instanceof URL ? fileUrlToPath(options.libraryPath) : options.libraryPath;
  } else {
    libraryPath = libraryPathFor(build);
  }

  const softBytes = options.queue?.softBytes ?? 256 * 1024;
  const hardBytes = options.queue?.hardBytes ?? 1024 * 1024;
  if (
    !Number.isFinite(softBytes) ||
    softBytes < 0 ||
    !Number.isInteger(hardBytes) ||
    hardBytes <= 0 ||
    hardBytes < softBytes
  ) {
    throw new UniPtyError(
      "invalid-argument",
      "queue thresholds must satisfy 0 <= softBytes <= hardBytes with integer hardBytes",
    );
  }

  const pollIntervalMs = options.pollIntervalMs ?? 25;
  if (
    !Number.isFinite(pollIntervalMs) ||
    !Number.isInteger(pollIntervalMs) ||
    pollIntervalMs <= 0
  ) {
    throw new UniPtyError("invalid-argument", "pollIntervalMs must be a positive integer");
  }

  const closure = await loadClosure();
  try {
    await closure.instantiate(libraryPath);
  } catch (cause) {
    if (isPermissionError(cause)) {
      throw permissionFailure(
        "loading the vendored PTY library (Deno.dlopen)",
        "--allow-ffi",
        cause,
      );
    }
    throw new UniPtyError(
      "unsupported",
      "failed to initialize the vendored @sigma/pty-ffi library",
      {
        details: { libraryPath },
        cause,
      },
    );
  }

  return new DenoSigmaPtyFfiBackendImpl(closure, {
    softBytes,
    hardBytes,
    pollIntervalMs,
  });
}

// ---------------------------------------------------------------------------
// Ready Backend
// ---------------------------------------------------------------------------

interface BackendSettings {
  readonly softBytes: number;
  readonly hardBytes: number;
  readonly pollIntervalMs: number;
}

class DenoSigmaPtyFfiBackendImpl implements DenoSigmaPtyFfiBackend {
  readonly #closure: SubstrateNoinitModule;
  readonly #settings: BackendSettings;
  #disposed = false;

  constructor(closure: SubstrateNoinitModule, settings: BackendSettings) {
    this.#closure = closure;
    this.#settings = settings;
  }

  spawn(launch: StructuredLaunch): BackendEndpoint {
    if (this.#disposed) {
      throw new UniPtyError("closed", "Backend has been disposed and can no longer spawn");
    }
    const [executable, ...args] = launch.argv;
    if (executable === undefined) {
      throw new UniPtyError("invalid-argument", "launch argv must be non-empty");
    }
    const substrateOptions: SubstrateCommandOptions = {
      size: { rows: launch.rows, cols: launch.cols },
    };
    if (args.length > 0) substrateOptions.args = args;
    if (launch.cwd !== undefined) substrateOptions.cwd = launch.cwd;
    if (launch.env !== undefined) substrateOptions.env = { ...launch.env };

    let pty: SubstratePty;
    // The substrate forks the child internally without exposing its pid;
    // diffing this process's direct children around the synchronous spawn
    // identifies it so terminate() can signal without closing the transport.
    const childrenBefore = listDirectChildPids();
    try {
      pty = new this.#closure.Pty(executable, substrateOptions);
    } catch (cause) {
      throw new UniPtyError(
        "invalid-argument",
        "PTY launch failed on the @sigma/pty-ffi substrate",
        {
          details: { argv: [...launch.argv] },
          cause,
        },
      );
    }
    const childPid = discoverSpawnedChildPid(childrenBefore);
    return new DenoSigmaPtyEndpoint(pty, this.#settings, childPid);
  }

  async dispose(): Promise<void> {
    // Logical disposal only: the substrate's dlopen'd library stays loaded
    // until process exit (substrate limitation, documented in README).
    this.#disposed = true;
  }
}

// ---------------------------------------------------------------------------
// Endpoint
// ---------------------------------------------------------------------------

const ENCODER = new TextEncoder();
const STRICT_DECODER = new TextDecoder(undefined, { fatal: true });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class DenoSigmaPtyEndpoint implements BackendEndpoint {
  readonly native = { input: "bytes", output: "bytes" } as const;

  readonly output: ReadableStream<NativeChunk>;
  readonly #exitCodePromise: Promise<BackendExitResult>;
  readonly #pty: SubstratePty;
  readonly #softBytes: number;
  readonly #hardBytes: number;
  readonly #pollIntervalMs: number;

  #settleExit!: (result: BackendExitResult) => void;
  #exitSettled = false;
  #ioClosed = false;
  #terminated = false;
  #discardOutput = false;
  #inflightBytes = 0;

  #childPid: number | undefined;

  constructor(pty: SubstratePty, settings: BackendSettings, childPid: number | undefined) {
    this.#childPid = childPid;
    this.#pty = pty;
    this.#softBytes = settings.softBytes;
    this.#hardBytes = settings.hardBytes;
    this.#pollIntervalMs = settings.pollIntervalMs;
    this.#exitCodePromise = new Promise<BackendExitResult>((resolve) => {
      this.#settleExit = (result) => {
        if (this.#exitSettled) return;
        this.#exitSettled = true;
        resolve(result);
      };
    });
    this.output = new ReadableStream<NativeChunk>({
      start: (controller) => {
        void this.#runPump(controller);
      },
      // The substrate's internal reader thread always drains the PTY master
      // into its own unbounded channel, so consumer-paced gating here would
      // gain nothing and would starve the independent exit observation when
      // nobody is reading. The pump therefore always drains and enqueues;
      // see README for the buffering truth on this substrate.
      pull: () => {},
      cancel: () => {
        // Detachment only: keep draining the substrate so its internal
        // channel cannot grow without bound, discarding output until
        // close/terminate/exit ends the pump.
        this.#discardOutput = true;
      },
    });
  }

  get exited(): Promise<BackendExitResult> {
    return this.#exitCodePromise;
  }

  /**
   * The output pump: drains the substrate read side into the private source.
   * `done` carries the exit observation. After a logical `close()` the loop
   * switches to exit-watch mode: views are already completed, output is
   * discarded, and the independent exit observation stays settleable until
   * the child exits — only then does the physical `pty_close` run (when it
   * can no longer kill a live child). A genuine read failure errors the
   * stream (unless closed/terminated already, where it completes quietly)
   * and leaves the exit result unobserved (`{ exitCode: null, signal: null }`).
   */
  async #runPump(controller: ReadableStreamDefaultController<NativeChunk>): Promise<void> {
    for (;;) {
      if (this.#ioClosed && !this.#viewsCompleted) {
        this.#viewsCompleted = true;
        try {
          controller.close();
        } catch {
          // Already closed or cancelled.
        }
      }
      let result: { data: Uint8Array; done: boolean };
      try {
        result = this.#pty.readBytes();
      } catch (cause) {
        if (this.#ioClosed || this.#terminated) {
          // Teardown-driven read end: complete quietly.
          this.#settleUnobserved();
          this.#closePhysically();
          this.#completeViews(controller);
          return;
        }
        this.#settleUnobserved();
        this.#closePhysically();
        controller.error(new UniPtyError("unsupported", "PTY transport read failure", { cause }));
        return;
      }
      if (result.done) {
        // Signal-terminated children report exit code 1 on this substrate and
        // no signal is distinguishable, so `signal` stays null.
        this.#settleExit({ exitCode: this.#pty.exitCode ?? null, signal: null });
        this.#closePhysically();
        this.#completeViews(controller);
        return;
      }
      if (result.data.length > 0 && !this.#discardOutput && !this.#ioClosed) {
        controller.enqueue({ kind: "bytes", bytes: result.data });
        continue;
      }
      await sleep(this.#pollIntervalMs);
    }
  }

  #viewsCompleted = false;

  #completeViews(controller: ReadableStreamDefaultController<NativeChunk>): void {
    if (this.#viewsCompleted) return;
    this.#viewsCompleted = true;
    try {
      controller.close();
    } catch {
      // Already closed or cancelled.
    }
  }

  /** Physical teardown; safe only when the child is dead or must die now. */
  #closePhysically(): void {
    try {
      this.#pty.close();
    } catch {
      // The substrate logs its own close failures; idempotent by pointer.
    }
  }

  #settleUnobserved(): void {
    this.#settleExit({ exitCode: null, signal: null });
  }

  #assertWritable(): void {
    if (this.#ioClosed) {
      throw new UniPtyError("closed", "PTY transport is closed");
    }
  }

  #mapSubstrateCall(operation: string, cause: unknown): UniPtyError {
    if (cause instanceof Error && cause.message.includes("Pty is closed.")) {
      return new UniPtyError("closed", "PTY transport is closed", { cause });
    }
    return new UniPtyError(
      "unsupported",
      `PTY ${operation} failed on the @sigma/pty-ffi substrate`,
      {
        cause,
      },
    );
  }

  write(input: NativeInput): boolean {
    this.#assertWritable();
    let text: string;
    let bytes: Uint8Array;
    if (input.kind === "text") {
      text = input.text;
      bytes = ENCODER.encode(text);
    } else {
      bytes = input.bytes;
      try {
        // The substrate write path is String-based, so byte input must be
        // strict UTF-8 to round-trip faithfully; anything else is rejected
        // rather than silently corrupted.
        text = STRICT_DECODER.decode(bytes as BufferSource);
      } catch (cause) {
        throw new UniPtyError(
          "invalid-argument",
          "byte input must be valid UTF-8 for this substrate (its write path is String/CString-based)",
          { cause },
        );
      }
    }
    if (text.includes("\0") || bytes.includes(0)) {
      throw new UniPtyError(
        "invalid-argument",
        "input containing NUL bytes cannot be delivered by the @sigma/pty-ffi substrate (CString write path)",
      );
    }
    if (this.#inflightBytes + bytes.length > this.#hardBytes) {
      throw new UniPtyError(
        "backpressure",
        "input queue saturated; await drain() before writing more",
        {
          details: { inflightBytes: this.#inflightBytes, hardBytes: this.#hardBytes },
        },
      );
    }
    try {
      this.#pty.write(text);
    } catch (cause) {
      throw this.#mapSubstrateCall("write", cause);
    }
    this.#inflightBytes += bytes.length;
    return this.#inflightBytes <= this.#softBytes;
  }

  async drain(): Promise<void> {
    this.#assertWritable();
    // Proxy acknowledgement: the substrate's writer thread consumes its
    // channel promptly; one event-loop turn is the honest readiness recovery
    // this Backend can observe. This is not a physical flush.
    await sleep(0);
    this.#inflightBytes = 0;
  }

  resize(cols: number, rows: number): void {
    this.#assertWritable();
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
      throw new UniPtyError("invalid-argument", "resize requires positive integer cols and rows");
    }
    try {
      this.#pty.resize({ rows, cols, pixel_width: 0, pixel_height: 0 });
    } catch (cause) {
      throw this.#mapSubstrateCall("resize", cause);
    }
  }

  close(): void {
    // Logical close only: the closed state is published (#ioClosed rejects
    // write/resize/drain and the pump completes active views on its next
    // turn), but the physical pty_close is deferred until the child exits —
    // it would otherwise SIGKILL a live child, and the spec allows physical
    // cleanup to finish asynchronously. The exit watcher keeps draining so
    // the independent exit observation remains settleable.
    this.#ioClosed = true;
  }

  terminate(): void {
    // Termination request that keeps the transport open: the child is a
    // direct child of this process (the substrate forks it internally
    // without exposing the pid), so it is discovered by diffing the OS
    // process table around spawn and signalled with Deno.kill. The pump
    // then observes the exit through the live transport — a real
    // observation, not a teardown artifact. When discovery was impossible,
    // there is NO kill-and-close fallback (the substrate primitive would
    // cascade termination into transport destruction); the honest outcome
    // is an explicit typed failure.
    if (this.#terminated) return;
    const pid = this.#childPid;
    if (pid === undefined) {
      throw new UniPtyError(
        "unsupported",
        "terminate() could not locate the child process on this host (pgrep-based discovery unavailable); this substrate offers no kill-without-close primitive",
      );
    }
    const kill = (globalThis as { Deno?: { kill?: (pid: number, signal: string) => void } }).Deno
      ?.kill;
    if (typeof kill !== "function") {
      throw new UniPtyError("unsupported", "Deno.kill is unavailable in this runtime");
    }
    try {
      kill(pid, "SIGTERM");
    } catch (cause) {
      // Only "process not found" means the target is already gone (the
      // production discovery yields live child pids, so this is the benign
      // already-exited case): the pump's own observation settles exited and
      // there is nothing left to signal. Any other failure — for example
      // permissions revoked at runtime — must surface, because a swallowed
      // error would masquerade as acceptance.
      const name = (cause as { name?: string }).name;
      const code = (cause as { code?: string }).code;
      if (name !== "NotFound" && code !== "NotFound") {
        throw new UniPtyError("unsupported", "terminate() failed to signal the child process", {
          cause,
        });
      }
    }
    // The request was delivered (or the child was already gone): mark only
    // now so an earlier failure leaves terminate() retryable.
    this.#terminated = true;
  }
}
