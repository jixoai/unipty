/**
 * Fully in-memory Backend used to drive the Core public contract without a
 * native PTY. It exposes programmatic, deterministically ordered NativeChunk
 * emission plus call recording and configurable write/drain/resize behaviour.
 */

import type {
  BackendEndpoint,
  BackendExitResult,
  CapabilityToken,
  NativeChunk,
  NativeInput,
  NativeRepresentation,
  ReadyPtyBackend,
  StructuredLaunch,
} from "../../src/index.ts";
import { UniPty, UniPtyError } from "../../src/index.ts";
import type { Pty } from "../../src/index.ts";

/** One queued write() outcome: a readiness boolean or saturation. */
export type MockWriteStep = boolean | "backpressure";

export interface MockEndpointOptions {
  readonly native?: {
    readonly input: NativeRepresentation;
    readonly output: NativeRepresentation;
  };
  readonly capabilities?: ReadonlyMap<CapabilityToken<unknown>, unknown>;
  /** Results consumed in order per write() call; further writes return true. */
  readonly writeSteps?: readonly MockWriteStep[];
  /** "auto" resolves drain() immediately; "manual" defers to the test. */
  readonly drainMode?: "auto" | "manual";
  /** Optional resize interceptor; throwing here simulates an `unsupported` Backend. */
  readonly resize?: (cols: number, rows: number) => void;
}

const DEFAULT_NATIVE: { input: NativeRepresentation; output: NativeRepresentation } = {
  input: "both",
  output: "both",
};

/**
 * One controllable Endpoint. Output delivery is pull-driven with an explicit
 * queue so tests can observe exactly how many chunks Core has consumed via
 * {@link MockEndpoint.waitForDelivered}.
 */
export class MockEndpoint implements BackendEndpoint {
  readonly native: { input: NativeRepresentation; output: NativeRepresentation };
  readonly output: ReadableStream<NativeChunk>;
  readonly exited: Promise<BackendExitResult>;
  readonly capabilities?: ReadonlyMap<CapabilityToken<unknown>, unknown>;

  /** Shared with the owning backend; ordered op log across the whole stack. */
  readonly calls: string[];
  readonly writeAttempts: NativeInput[] = [];
  /** Writes actually admitted by the endpoint (saturation admits nothing). */
  readonly acceptedWrites: NativeInput[] = [];
  readonly resizeCalls: Array<{ readonly cols: number; readonly rows: number }> = [];
  readonly drainWaiters: Array<{
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
  }> = [];
  closeCount = 0;
  terminateCount = 0;
  /** True once Core cancelled the private output source (physical teardown). */
  sourceCancelled = false;
  /** Hook executed inside endpoint.close(); used to observe Core's ordering. */
  onClose: (() => void) | undefined;

  private readonly writeSteps: readonly MockWriteStep[];
  private writeStepIndex = 0;
  private drainMode: "auto" | "manual";
  private resizeImpl: ((cols: number, rows: number) => void) | undefined;
  private exitResolve: ((result: BackendExitResult) => void) | null = null;
  private exitSettled = false;

  private outputController: ReadableStreamDefaultController<NativeChunk> | null = null;
  private readonly chunkQueue: NativeChunk[] = [];
  /**
   * A parked pull: resolving its promise alone never triggers a fresh pull,
   * so a later push() must deliver through the captured controller directly.
   */
  private pendingPull: {
    readonly controller: ReadableStreamDefaultController<NativeChunk>;
    readonly resolve: () => void;
  } | null = null;
  private readonly deliveryWaiters: Array<() => void> = [];
  private deliveredCount = 0;
  private outputFinished = false;

  constructor(calls: string[], options?: MockEndpointOptions) {
    this.calls = calls;
    this.native = options?.native ?? DEFAULT_NATIVE;
    if (options?.capabilities !== undefined) this.capabilities = options.capabilities;
    this.writeSteps = options?.writeSteps ?? [];
    this.drainMode = options?.drainMode ?? "auto";
    this.resizeImpl = options?.resize;
    this.exited = new Promise<BackendExitResult>((resolve) => {
      this.exitResolve = resolve;
    });
    this.output = new ReadableStream<NativeChunk>({
      start: (controller) => {
        this.outputController = controller;
      },
      pull: (controller) => {
        const chunk = this.chunkQueue.shift();
        if (chunk !== undefined) {
          this.deliveredCount++;
          controller.enqueue(chunk);
          this.flushDeliveryWaiters();
          return;
        }
        // Park this pull; push()/endOutput()/failOutput() deliver through the
        // captured controller and then release the promise. Returning the
        // pending promise avoids a busy pull loop.
        return new Promise<void>((resolve) => {
          this.pendingPull = { controller, resolve };
        });
      },
      cancel: () => {
        this.sourceCancelled = true;
        this.releasePendingPull();
      },
    });
  }

  // -- transport control -------------------------------------------------

  /** Queue one native chunk for ordered delivery to Core. */
  push(chunk: NativeChunk): void {
    if (this.outputFinished) throw new Error("mock output already ended or failed");
    const pending = this.pendingPull;
    if (pending !== null) {
      // Deliver straight into the parked pull; resolving its promise without
      // enqueuing would strand the chunk because no fresh pull is scheduled.
      this.pendingPull = null;
      this.deliveredCount++;
      pending.controller.enqueue(chunk);
      this.flushDeliveryWaiters();
      pending.resolve();
      return;
    }
    this.chunkQueue.push(chunk);
  }

  pushText(text: string): void {
    this.push({ kind: "text", text });
  }

  pushBytes(bytes: Uint8Array): void {
    this.push({ kind: "bytes", bytes });
  }

  /** Transport EOF: pending and future Core reads observe done. */
  endOutput(): void {
    if (this.outputFinished) return;
    this.outputFinished = true;
    this.outputController?.close();
    this.releasePendingPull();
  }

  /** Transport read failure: Core reads reject with exactly this error. */
  failOutput(error: unknown): void {
    if (this.outputFinished) return;
    this.outputFinished = true;
    this.outputController?.error(error);
    this.releasePendingPull();
  }

  /** Resolve once Core has consumed `count` chunks from the source. */
  async waitForDelivered(count: number): Promise<void> {
    while (this.deliveredCount < count) {
      await new Promise<void>((resolve) => {
        this.deliveryWaiters.push(resolve);
      });
    }
  }

  // -- exit control -------------------------------------------------------

  /** Settle the independent child-completion observation. */
  settleExit(result: BackendExitResult): void {
    if (this.exitSettled) throw new Error("mock exited already settled");
    this.exitSettled = true;
    this.exitResolve?.(result);
  }

  get exitSettledFlag(): boolean {
    return this.exitSettled;
  }

  // -- drain control ------------------------------------------------------

  /** Resolve ("resolve") or reject the oldest manual drain() promise. */
  settleNextDrain(outcome: "resolve" | { readonly reject: unknown }): void {
    const waiter = this.drainWaiters.shift();
    if (waiter === undefined) throw new Error("no pending drain() to settle");
    if (outcome === "resolve") {
      waiter.resolve();
      return;
    }
    waiter.reject(outcome.reject);
  }

  // -- BackendEndpoint ----------------------------------------------------

  write(input: NativeInput): boolean {
    this.calls.push("write");
    this.writeAttempts.push(input);
    const step = this.writeSteps[this.writeStepIndex];
    this.writeStepIndex++;
    if (step === "backpressure") {
      // Saturation: none of this value enters the input sequence.
      throw new UniPtyError("backpressure", "mock endpoint input queue is saturated");
    }
    this.acceptedWrites.push(input);
    return step === undefined ? true : step;
  }

  drain(): Promise<void> {
    this.calls.push("drain");
    if (this.drainMode === "manual") {
      return new Promise<void>((resolve, reject) => {
        this.drainWaiters.push({ resolve, reject });
      });
    }
    return Promise.resolve();
  }

  resize(cols: number, rows: number): void {
    this.calls.push("resize");
    this.resizeCalls.push({ cols, rows });
    this.resizeImpl?.(cols, rows);
  }

  close(): void {
    this.calls.push("close");
    this.closeCount++;
    this.onClose?.();
  }

  terminate(): void {
    this.calls.push("terminate");
    this.terminateCount++;
  }

  private releasePendingPull(): void {
    const pending = this.pendingPull;
    this.pendingPull = null;
    pending?.resolve();
  }

  private flushDeliveryWaiters(): void {
    while (this.deliveryWaiters.length > 0) {
      const waiter = this.deliveryWaiters.shift();
      waiter?.();
    }
  }
}

export class MockBackend implements ReadyPtyBackend {
  /** Ordered op log spanning spawn and every endpoint operation. */
  readonly calls: string[] = [];
  readonly spawnCalls: StructuredLaunch[] = [];
  readonly endpoints: MockEndpoint[] = [];
  disposeCount = 0;
  /** When set, dispose() rejects with this value. */
  disposeError: unknown = undefined;

  private readonly endpointDefaults: MockEndpointOptions | undefined;

  constructor(endpointDefaults?: MockEndpointOptions) {
    this.endpointDefaults = endpointDefaults;
  }

  spawn(launch: StructuredLaunch): MockEndpoint {
    this.calls.push("spawn");
    this.spawnCalls.push(launch);
    const endpoint = new MockEndpoint(this.calls, this.endpointDefaults);
    this.endpoints.push(endpoint);
    return endpoint;
  }

  /** Construct a Core instance over this backend through the public seam. */
  createUniPty(): UniPty<MockBackend> {
    return new UniPty({ backend: this });
  }

  dispose(): Promise<void> {
    this.calls.push("dispose");
    this.disposeCount++;
    if (this.disposeError !== undefined) return Promise.reject(this.disposeError);
    return Promise.resolve();
  }
}

/** One configured Core instance plus its first spawned PTY and endpoint. */
export interface MockPtyFixture {
  readonly unipty: UniPty<MockBackend>;
  readonly backend: MockBackend;
  readonly endpoint: MockEndpoint;
  readonly pty: Pty;
}

/** Spawn one PTY through the public seam with a default mock backend. */
export function setupPty(
  endpointOptions?: MockEndpointOptions,
  argv: readonly string[] = ["/usr/bin/env", "run"],
): MockPtyFixture {
  const backend = new MockBackend(endpointOptions);
  const unipty = new UniPty({ backend });
  const pty = unipty.spawn(argv);
  const endpoint = backend.endpoints[0];
  if (endpoint === undefined) throw new Error("setupPty: backend recorded no endpoint");
  return { unipty, backend, endpoint, pty };
}

const utf8 = new TextEncoder();

export function textChunk(text: string): NativeChunk {
  return { kind: "text", text };
}

export function bytesChunk(bytes: Uint8Array): NativeChunk {
  return { kind: "bytes", bytes };
}

export function bothChunk(bytes: Uint8Array, text: string): NativeChunk {
  return { kind: "bytes+text", bytes, text };
}

export function utf8Bytes(text: string): Uint8Array {
  return utf8.encode(text);
}
