/**
> Orthogonal intents (2026-08-20): test-only pipe-based mock Backend used to
> prove the conformance runner end to end WITHOUT establishing native PTY
> support (mocks never establish support — that is the public contract
 * suite's job on real backends).
 *
 * It runs the SAME deterministic child fixtures through node child_process
 * pipes and honors the Endpoint contract honestly:
 * - byte-native input/output;
 * - genuinely bounded input queue (SOFT readiness cap, HARD saturation that
 *   throws a typed `backpressure` failure for one whole value);
 * - close tears down transport without killing the child; terminate kills
 *   the child without closing transport;
 * - geometry is emulated through child COLUMNS/LINES env, which the
 *   report-size fixture documents as its non-TTY fallback; resize cannot
 *   propagate to a running child over pipes, so the profile records that
 *   accommodation as a skip.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { UniPtyError } from "unipty";
import type {
  BackendEndpoint,
  BackendExitResult,
  NativeChunk,
  NativeInput,
  ReadyPtyBackend,
  StructuredLaunch,
} from "unipty";

/** Identity the conformance runner reports for the mock Backend. */
export const MOCK_BACKEND_IDENTITY = {
  packageName: "@unipty/conformance/mock-backend",
  backendId: "mock-pipe-backend",
} as const;

/** Readiness threshold: writes above this return `false` (pause + drain). */
const SOFT_QUEUE_CAP_BYTES = 1024 * 1024;
/** Saturation threshold: writes that cannot be admitted throw `backpressure`. */
const HARD_QUEUE_CAP_BYTES = 4 * 1024 * 1024;

const encoder = new TextEncoder();

class MockEndpoint implements BackendEndpoint {
  readonly native: { input: "bytes"; output: "bytes" };
  readonly output: ReadableStream<NativeChunk>;
  readonly exited: Promise<BackendExitResult>;

  private readonly child: ChildProcess;
  private closed = false;
  private terminated = false;
  private inFlightBytes = 0;
  private readonly drainWaiters: (() => void)[] = [];
  private outputCancelled = false;

  constructor(child: ChildProcess, launch: StructuredLaunch) {
    this.child = child;
    this.native = { input: "bytes", output: "bytes" };
    void launch;

    let controller!: ReadableStreamDefaultController<NativeChunk>;
    this.output = new ReadableStream<NativeChunk>({
      start: (c) => {
        controller = c;
      },
      cancel: () => {
        this.outputCancelled = true;
      },
    });
    if (child.stdout === null) throw new Error("mock backend requires piped child stdout");
    child.stdout.on("data", (chunk: Uint8Array) => {
      if (this.outputCancelled) return;
      try {
        controller.enqueue({ kind: "bytes", bytes: new Uint8Array(chunk) });
      } catch {
        // stream already closed after teardown
      }
    });
    child.stdout.on("end", () => {
      try {
        controller.close();
      } catch {
        // already closed by cancellation
      }
    });

    this.exited = new Promise<BackendExitResult>((resolve) => {
      child.on("exit", (code, signal) => {
        resolve({ exitCode: code, signal: signal ?? null });
      });
    });
  }

  write(input: NativeInput): boolean {
    if (this.closed || this.child.stdin === null || this.child.stdin.destroyed) {
      throw new UniPtyError("closed", "mock endpoint input is no longer usable");
    }
    const bytes = input.kind === "bytes" ? input.bytes : encoder.encode(input.text);
    if (this.inFlightBytes + bytes.byteLength > HARD_QUEUE_CAP_BYTES) {
      // Saturation: reject one whole value with a typed failure.
      throw new UniPtyError("backpressure", "mock input queue saturated; whole value rejected", {
        details: { inFlightBytes: this.inFlightBytes, attemptedBytes: bytes.byteLength },
      });
    }
    this.inFlightBytes += bytes.byteLength;
    this.child.stdin.write(bytes, () => {
      this.inFlightBytes -= bytes.byteLength;
      this.signalDrain();
    });
    return this.inFlightBytes <= SOFT_QUEUE_CAP_BYTES;
  }

  drain(): Promise<void> {
    if (this.closed || this.child.stdin === null || this.child.stdin.destroyed) {
      return Promise.reject(new UniPtyError("closed", "mock endpoint input is no longer usable"));
    }
    if (this.inFlightBytes <= SOFT_QUEUE_CAP_BYTES) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.drainWaiters.push(resolve);
    });
  }

  resize(cols: number, rows: number): void {
    // Recorded only: pipes cannot propagate geometry to a running child's
    // own tty view. The profile records this honestly as a skip.
    void cols;
    void rows;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    // Non-cascading: release transport WITHOUT requesting child termination.
    this.child.stdin?.destroy();
    this.child.stdout?.destroy();
    this.child.stderr?.destroy();
    for (const waiter of this.drainWaiters.splice(0)) waiter();
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.child.kill("SIGTERM");
  }

  /** Backend-disposal resource release: never leaves children behind. */
  releaseForDisposal(): void {
    if (!this.terminated && this.child.exitCode === null && !this.child.killed) {
      this.child.kill("SIGKILL");
    }
    this.close();
  }

  private signalDrain(): void {
    if (this.inFlightBytes > SOFT_QUEUE_CAP_BYTES) return;
    for (const waiter of this.drainWaiters.splice(0)) waiter();
  }
}

function childEnvironment(launch: StructuredLaunch): Record<string, string | undefined> {
  const base = launch.env === undefined ? { ...process.env } : { ...launch.env };
  // Geometry emulation for the non-TTY transport: the report-size fixture
  // documents COLUMNS/LINES as its fallback view of the terminal size.
  return { ...base, COLUMNS: String(launch.cols), LINES: String(launch.rows) };
}

/** Create the ready mock Backend (test-only; never establishes PTY support). */
export async function createMockBackend(): Promise<ReadyPtyBackend> {
  const endpoints: MockEndpoint[] = [];
  return {
    spawn: (launch: StructuredLaunch): BackendEndpoint => {
      const executable = launch.argv[0];
      if (executable === undefined) {
        throw new UniPtyError("invalid-argument", "structured launch requires a non-empty argv");
      }
      const child = spawn(executable, [...launch.argv.slice(1)], {
        stdio: ["pipe", "pipe", "pipe"],
        env: childEnvironment(launch),
        ...(launch.cwd !== undefined ? { cwd: launch.cwd } : {}),
      });
      const endpoint = new MockEndpoint(child, launch);
      endpoints.push(endpoint);
      return endpoint;
    },
    dispose: async (): Promise<void> => {
      for (const endpoint of endpoints) {
        endpoint.releaseForDisposal();
      }
      endpoints.length = 0;
    },
  };
}
