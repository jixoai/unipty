/**
> Orthogonal intents (2026-08-20): Core-private output pump; bounded
> bootstrap buffer; representation conversion for attached views.
 *
 * Original request (2026-08-17): Core exclusively owns public stream views,
 * conversion, and bootstrap buffering. One reader over the Endpoint's
 * private native source runs for the PTY's lifetime: public stream
 * cancellation only detaches a view and never cancels this source.
 */

import type { NativeChunk } from "./native.ts";
import { UniPtyError } from "./errors.ts";

/** Bound of the pre-first-view Bootstrap Output Buffer. */
const BOOTSTRAP_MAX_CHUNKS = 4096;
const BOOTSTRAP_MAX_BYTES = 4 * 1024 * 1024;

/** One attached public output view and its representation conversion. */
export interface OutputView {
  readonly encoding: "utf8" | "bytes";
  /** Convert one native chunk into this view's representation. */
  enqueue(chunk: NativeChunk): void;
  complete(): void;
  fail(error: unknown): void;
  /** Pump-managed identity hook releasing the active slot on settlement. */
  settleHook?: () => void;
}

/**
 * Build the representation-converting view used by `pty.stream()`.
 * `onSettled` runs exactly once when the view completes, fails, or hits a
 * conversion failure, releasing the pump's one-active-stream slot.
 */
function estimateChunkSize(chunk: NativeChunk): number {
  if (chunk.kind === "bytes") return chunk.bytes.byteLength;
  if (chunk.kind === "text") return chunk.text.length * 3;
  return Math.max(chunk.bytes.byteLength, chunk.text.length * 3);
}

/**
 * The single consumer of a Backend Endpoint's native output source.
 *
 * Delivery law:
 * - an attached view receives converted chunks in order;
 * - before any view ever existed, chunks are retained in a bounded bootstrap
 *   buffer (a full buffer pauses pulling, applying PTY output backpressure
 *   instead of truncating);
 * - after all established views have detached, output keeps draining and is
 *   discarded until a future-only view subscribes.
 */
export class OutputPump {
  private readonly reader: ReadableStreamDefaultReader<NativeChunk>;
  private activeView: OutputView | null = null;
  private everHadView = false;
  private readonly bootstrap: NativeChunk[] = [];
  private bootstrapBytes = 0;
  private pausedForBootstrap = false;
  private resumeWaiter: (() => void) | null = null;
  private transportEof = false;
  private transportError: unknown = null;
  private stopped = false;

  constructor(source: ReadableStream<NativeChunk>) {
    this.reader = source.getReader();
  }

  /** Begin the pump loop; must be called exactly once after construction. */
  start(): void {
    void this.run();
  }

  /** Whether a public view is currently established and not yet detached. */
  get hasActiveView(): boolean {
    return this.activeView !== null;
  }

  private async run(): Promise<void> {
    try {
      for (;;) {
        while (this.pausedForBootstrap) {
          await new Promise<void>((resolve) => {
            this.resumeWaiter = resolve;
          });
          this.resumeWaiter = null;
          if (this.stopped) return;
        }
        const { done, value } = await this.reader.read();
        if (done) {
          this.transportEof = true;
          this.activeView?.complete();
          this.activeView = null;
          return;
        }
        if (value !== undefined) this.deliver(value);
      }
    } catch (error) {
      // After an explicit PTY close the transport is being torn down by the
      // Backend; that is not an observable stream failure anymore.
      if (this.stopped) return;
      this.transportError = error;
      this.activeView?.fail(error);
      this.activeView = null;
    }
  }

  private deliver(chunk: NativeChunk): void {
    const view = this.activeView;
    if (view !== null) {
      try {
        view.enqueue(chunk);
      } catch {
        // The consumer cancelled between our check and the enqueue; the
        // cancel callback performs the real detach.
      }
      return;
    }
    if (!this.everHadView) {
      this.bootstrap.push(chunk);
      this.bootstrapBytes += estimateChunkSize(chunk);
      if (
        this.bootstrap.length >= BOOTSTRAP_MAX_CHUNKS ||
        this.bootstrapBytes >= BOOTSTRAP_MAX_BYTES
      ) {
        // Apply PTY output backpressure: stop pulling until the first view
        // drains the retained buffer, never truncate.
        this.pausedForBootstrap = true;
      }
      return;
    }
    // Views existed and detached: keep draining, discard output.
  }

  /** Attach a freshly created view; flushes retained bootstrap output. */
  attachView(view: OutputView): void {
    this.activeView = view;
    this.everHadView = true;
    view.settleHook = () => {
      if (this.activeView === view) this.activeView = null;
    };
    if (this.bootstrap.length > 0) {
      const retained = this.bootstrap.splice(0, this.bootstrap.length);
      this.bootstrapBytes = 0;
      for (const chunk of retained) {
        try {
          view.enqueue(chunk);
        } catch {
          break;
        }
      }
    }
    if (this.pausedForBootstrap) {
      this.pausedForBootstrap = false;
      this.resumeWaiter?.();
    }
    if (this.transportEof) {
      view.complete();
      this.activeView = null;
    } else if (this.transportError !== null) {
      view.fail(this.transportError);
      this.activeView = null;
    }
  }

  /** Detach the active view; output continues draining and discarding. */
  detachView(): void {
    this.activeView = null;
  }

  /** Stop the pump during explicit PTY close; pending reads settle quietly. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.activeView?.complete();
    this.activeView = null;
    this.pausedForBootstrap = false;
    this.resumeWaiter?.();
    this.reader.cancel().catch(() => {});
  }
}

/**
 * Build the representation-converting view used by `pty.stream()`.
 *
 * Settlement law: exactly once across completion, failure, or a conversion
 * failure (native text on a bytes view), the view releases the pump's
 * one-active-stream slot through its `settleHook` so the caller may
 * establish a new view afterwards.
 */
export function createOutputView(
  encoding: "utf8" | "bytes",
  controller: ReadableStreamDefaultController<string | Uint8Array>,
): OutputView {
  const decoder = encoding === "utf8" ? new TextDecoder("utf-8") : null;
  let settled = false;
  const view: OutputView = {
    encoding,
    enqueue(chunk: NativeChunk): void {
      if (settled) return;
      if (encoding === "utf8") {
        if (chunk.kind === "bytes") {
          controller.enqueue(decoder?.decode(chunk.bytes, { stream: true }));
          return;
        }
        // Native text is preferred and passed through unchanged.
        controller.enqueue(chunk.text);
        return;
      }
      if (chunk.kind === "text") {
        // Native text is never re-encoded and claimed as native bytes.
        settle();
        controller.error(
          new UniPtyError("unsupported", "native Terminal Bytes are unavailable for this PTY", {
            details: { chunkKind: chunk.kind },
          }),
        );
        return;
      }
      controller.enqueue(chunk.bytes);
    },
    complete(): void {
      settle();
      try {
        if (decoder !== null) {
          const tail = decoder.decode();
          if (tail !== "") controller.enqueue(tail);
        }
        controller.close();
      } catch {
        // Already closed or errored by the consumer side.
      }
    },
    fail(error: unknown): void {
      settle();
      try {
        controller.error(error);
      } catch {
        // Already closed or errored.
      }
    },
  };
  function settle(): void {
    if (settled) return;
    settled = true;
    view.settleHook?.();
  }
  return view;
}
