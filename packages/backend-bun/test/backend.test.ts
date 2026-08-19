/**
> Orthogonal intents (2026-08-20): @unipty/backend-bun adapter-level tests
> over real PTYs on the installed Bun runtime (bun:test, not vitest).
 *
 * Recorded substrate facts these tests rely on (Bun 1.3.14, darwin-arm64):
 * - `bun -e` colorizes console output in a tty, so geometry assertions strip
 *   ANSI sequences first.
 * - The PTY slave starts in canonical mode with kernel ECHO, so written lines
 *   come back (kernel echo plus the child's own copy).
 * - `Subprocess.kill()` (no argument) sends SIGTERM; the exit observation is
 *   `{ exitCode: null, signal: "SIGTERM" }`.
 * - `terminal.close()` does not synchronously kill the child (probe: the
 *   child stayed unreaped for >= 300 ms after close).
 */

import { describe, expect, test } from "bun:test";
import type { BackendEndpoint, BackendExitResult, StructuredLaunch } from "unipty";
import {
  createBunBackend,
  DEFAULT_WRITE_QUEUE_BYTES,
  isSupportedBunVersion,
} from "../src/index.ts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const ANSI_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function launch(
  argv: readonly string[],
  options: { cols?: number; rows?: number; cwd?: string } = {},
): StructuredLaunch {
  return {
    argv,
    cols: options.cols ?? 80,
    rows: options.rows ?? 24,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  };
}

/** Kill the child and close the transport so no test leaks the event loop. */
function teardown(endpoint: BackendEndpoint): void {
  try {
    endpoint.terminate();
  } catch {
    // Already terminated.
  }
  try {
    endpoint.close();
  } catch {
    // Already closed.
  }
}

/** Awaitable sleep that does not depend on the endpoint under test. */
const pause = (ms: number): Promise<number> => Bun.sleep(ms);

/**
 * Decode the endpoint's native-bytes source until `accept` is satisfied, the
 * transport completes, or the deadline passes. Returns the decoded text.
 */
async function readUntil(
  endpoint: BackendEndpoint,
  accept: (text: string) => boolean,
  timeoutMs = 8_000,
): Promise<string> {
  const reader = endpoint.output.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline && !accept(text)) {
      const result = await Promise.race<{
        readonly done: boolean;
        readonly chunk: Uint8Array | undefined;
      }>([
        reader.read().then((read) => ({ done: read.done, chunk: read.value?.kind === "bytes" ? read.value.bytes : undefined })),
        pause(100).then(() => ({ done: false, chunk: undefined })),
      ]);
      if (result.done) {
        break;
      }
      if (result.chunk !== undefined) {
        text += decoder.decode(result.chunk, { stream: true });
      }
    }
  } finally {
    reader.releaseLock();
  }
  return text;
}

/** Whether `promise` settles within `ms`; returns the settled value when it does. */
async function settlesWithin<T>(
  promise: Promise<T>,
  ms: number,
): Promise<{ settled: boolean; value?: T }> {
  const sentinel = Symbol("pending");
  const value = await Promise.race<T | typeof sentinel>([
    promise,
    pause(ms).then(() => sentinel as typeof sentinel),
  ]);
  if (value === sentinel) {
    return { settled: false };
  }
  return { settled: true, value };
}

async function rejectionCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

function errorCodeOf(action: () => void): string | undefined {
  try {
    action();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

describe("createBunBackend factory", () => {
  test(
    "returns a ready backend with the default queue policy",
    async () => {
      const backend = await createBunBackend();
      expect(backend.backendId).toBe("bun");
      expect(DEFAULT_WRITE_QUEUE_BYTES).toBe(1 << 20);
      expect(backend.writeQueueBytes).toBe(DEFAULT_WRITE_QUEUE_BYTES);
      expect(typeof backend.spawn).toBe("function");
      expect(typeof backend.dispose).toBe("function");
    },
    10_000,
  );

  test(
    "honors the Backend-owned writeQueueBytes tuning option",
    async () => {
      const backend = await createBunBackend({ writeQueueBytes: 4096 });
      expect(backend.writeQueueBytes).toBe(4096);
    },
    10_000,
  );

  test(
    "rejects malformed writeQueueBytes with invalid-argument",
    async () => {
      for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(await rejectionCode(createBunBackend({ writeQueueBytes: bad }))).toBe(
          "invalid-argument",
        );
      }
    },
    10_000,
  );

  test(
    "rejects a runtime without Bun.Terminal with unsupported",
    async () => {
      const bunGlobal = (globalThis as { Bun?: { Terminal?: unknown } }).Bun;
      const savedTerminal = bunGlobal?.Terminal;
      const bunRecord = bunGlobal as { Terminal?: unknown };
      bunRecord.Terminal = undefined;
      try {
        expect(await rejectionCode(createBunBackend())).toBe("unsupported");
      } finally {
        bunRecord.Terminal = savedTerminal;
      }
    },
    10_000,
  );

  test(
    "the support-floor predicate matches the substrate release history",
    () => {
      expect(isSupportedBunVersion("1.3.12", "darwin")).toBe(false);
      expect(isSupportedBunVersion("1.3.13", "darwin")).toBe(true);
      expect(isSupportedBunVersion("1.3.14", "linux")).toBe(true);
      expect(isSupportedBunVersion("1.3.13", "win32")).toBe(false);
      expect(isSupportedBunVersion("1.3.14", "win32")).toBe(true);
      expect(isSupportedBunVersion("1.4.0", "linux")).toBe(true);
      expect(isSupportedBunVersion("2.0.0", "darwin")).toBe(true);
      expect(isSupportedBunVersion("1.3.15-darwin", "darwin")).toBe(true);
      expect(isSupportedBunVersion("not-a-version", "darwin")).toBe(false);
    },
    5_000,
  );

  test(
    "dispose resolves immediately (runtime-owned substrate) and is reusable",
    async () => {
      const backend = await createBunBackend();
      await backend.dispose();
      await backend.dispose();
    },
    10_000,
  );
});

// ---------------------------------------------------------------------------
// real PTY profile
// ---------------------------------------------------------------------------

describe("Bun Backend Endpoint over a real PTY", () => {
  test(
    "spawns /bin/echo, emits native byte chunks, and observes exit code 0",
    async () => {
      const backend = await createBunBackend();
      const endpoint = backend.spawn(launch(["/bin/echo", "hello"]));
      try {
        const text = await readUntil(endpoint, (t) => t.includes("hello"));
        expect(text).toContain("hello");
        const result = await endpoint.exited;
        expect(result).toEqual({ exitCode: 0, signal: null } satisfies BackendExitResult);
        // Repeatably awaitable: the same observation survives later awaits.
        expect(await endpoint.exited).toEqual(result);
      } finally {
        teardown(endpoint);
      }
    },
    15_000,
  );

  test(
    "accepts native byte input and (defense-in-depth) encoded text input on /bin/cat",
    async () => {
      const backend = await createBunBackend();
      const endpoint = backend.spawn(launch(["/bin/cat"]));
      try {
        expect(endpoint.native).toEqual({ input: "bytes", output: "bytes" });
        // Byte-native path.
        expect(endpoint.write({ kind: "bytes", bytes: new TextEncoder().encode("unipty-ping\n") })).toBe(
          true,
        );
        expect(await readUntil(endpoint, (t) => t.includes("unipty-ping"))).toContain("unipty-ping");
        // Text kind must never arrive from Core; when it does, it is UTF-8
        // encoded here and documented as benign for a bytes-native input.
        expect(endpoint.write({ kind: "text", text: "unipty-pong\n" })).toBe(true);
        expect(await readUntil(endpoint, (t) => t.includes("unipty-pong"))).toContain("unipty-pong");
        endpoint.terminate();
        const result = await endpoint.exited;
        expect(result).toEqual({ exitCode: null, signal: "SIGTERM" } satisfies BackendExitResult);
      } finally {
        teardown(endpoint);
      }
    },
    15_000,
  );

  test(
    "initial geometry reaches the child",
    async () => {
      const backend = await createBunBackend();
      const endpoint = backend.spawn(
        launch([process.execPath, "-e", "console.log(process.stdout.columns, process.stdout.rows)"], {
          cols: 101,
          rows: 37,
        }),
      );
      try {
        const text = await readUntil(endpoint, (t) => stripAnsi(t).includes("101 37"));
        expect(stripAnsi(text)).toContain("101 37");
        const result = await endpoint.exited;
        expect(result).toEqual({ exitCode: 0, signal: null } satisfies BackendExitResult);
      } finally {
        teardown(endpoint);
      }
    },
    15_000,
  );

  test(
    "resize is accepted and the exit observation still works",
    async () => {
      const backend = await createBunBackend();
      const endpoint = backend.spawn(launch(["/bin/cat"]));
      try {
        endpoint.resize(120, 40);
        expect(endpoint.write({ kind: "bytes", bytes: new TextEncoder().encode("still-writable\n") })).toBe(
          true,
        );
        expect(await readUntil(endpoint, (t) => t.includes("still-writable"))).toContain(
          "still-writable",
        );
        endpoint.terminate();
        expect(await endpoint.exited).toEqual({
          exitCode: null,
          signal: "SIGTERM",
        } satisfies BackendExitResult);
      } finally {
        teardown(endpoint);
      }
    },
    15_000,
  );

  test(
    "observes a non-zero child exit code",
    async () => {
      const backend = await createBunBackend();
      const endpoint = backend.spawn(launch([process.execPath, "-e", "process.exit(7)"]));
      try {
        expect(await endpoint.exited).toEqual({ exitCode: 7, signal: null } satisfies BackendExitResult);
      } finally {
        teardown(endpoint);
      }
    },
    15_000,
  );

  test(
    "terminate() requests SIGTERM on a sleeping child and is idempotent",
    async () => {
      const backend = await createBunBackend();
      const endpoint = backend.spawn(launch(["/bin/sleep", "30"]));
      try {
        endpoint.terminate();
        endpoint.terminate(); // repeated request adds no effect and must not throw
        expect(await endpoint.exited).toEqual({
          exitCode: null,
          signal: "SIGTERM",
        } satisfies BackendExitResult);
      } finally {
        teardown(endpoint);
      }
    },
    15_000,
  );

  test(
    "close() closes the transport only: no child signal, I/O surfaces reject, exit observation survives",
    async () => {
      const backend = await createBunBackend();
      const endpoint = backend.spawn(launch(["/bin/sleep", "30"]));
      try {
        endpoint.close();
        endpoint.close(); // idempotent
        expect(errorCodeOf(() => endpoint.write({ kind: "bytes", bytes: new Uint8Array(1) }))).toBe(
          "closed",
        );
        expect(errorCodeOf(() => endpoint.resize(90, 30))).toBe("closed");
        // The child was not terminated by close(): the observation stays
        // pending for a moment (probe: >= 300 ms).
        const early = await settlesWithin(endpoint.exited, 50);
        expect(early.settled).toBe(false);
        // The observation still settles later, driven by an explicit request.
        endpoint.terminate();
        expect(await endpoint.exited).toEqual({
          exitCode: null,
          signal: "SIGTERM",
        } satisfies BackendExitResult);
      } finally {
        teardown(endpoint);
      }
    },
    20_000,
  );

  test(
    "close() completes the active output source cleanly",
    async () => {
      const backend = await createBunBackend();
      const endpoint = backend.spawn(launch(["/bin/cat"]));
      // One reader across the close boundary: first collect the echoed data,
      // then close and keep reading until the source completes.
      const reader = endpoint.output.getReader();
      const decoder = new TextDecoder();
      let text = "";
      try {
        endpoint.write({ kind: "bytes", bytes: new TextEncoder().encode("bye-stream\n") });
        const deadline = Date.now() + 5_000;
        while (!text.includes("bye-stream") && Date.now() < deadline) {
          const read = await reader.read();
          if (read.done) {
            break;
          }
          if (read.value?.kind === "bytes") {
            text += decoder.decode(read.value.bytes, { stream: true });
          }
        }
        expect(text).toContain("bye-stream");

        endpoint.close();
        let done = false;
        while (!done && Date.now() < deadline + 5_000) {
          const settled = await Promise.race<{ done: boolean }>([
            reader.read().then((read) => ({ done: read.done })),
            pause(100).then(() => ({ done: false })),
          ]);
          done = settled.done;
        }
        expect(done).toBe(true);
        expect(text).toContain("bye-stream");
      } finally {
        reader.releaseLock();
        teardown(endpoint);
      }
    },
    15_000,
  );

  test(
    "reports a synchronous typed failure for an unlaunchable executable",
    async () => {
      const backend = await createBunBackend();
      let failure: { code?: string; cause?: unknown; details?: { argv0?: string } } | undefined;
      try {
        backend.spawn(launch(["/definitely/not/a-real-unipty-binary"]));
      } catch (error) {
        failure = error as typeof failure;
      }
      expect(failure?.code).toBe("unsupported");
      expect(failure?.details?.argv0).toBe("/definitely/not/a-real-unipty-binary");
      expect(failure?.cause).toBeInstanceOf(Error);
    },
    15_000,
  );

  test(
    "spawn rejects an empty argv defensively",
    async () => {
      const backend = await createBunBackend();
      expect(errorCodeOf(() => backend.spawn(launch([])))).toBe("invalid-argument");
    },
    10_000,
  );
});

// ---------------------------------------------------------------------------
// bounded pending-write queue
// ---------------------------------------------------------------------------

describe("bounded pending-write queue policy", () => {
  test(
    "false at the soft mark, whole-value backpressure rejection at the hard bound, drain recovers",
    async () => {
      const backend = await createBunBackend({ writeQueueBytes: 4096 }); // soft mark 3072
      const endpoint = backend.spawn(launch(["/bin/cat"]));
      try {
        // All writes below happen in one synchronous burst, before the
        // microtask pump can hand anything to the substrate.
        const first = endpoint.write({ kind: "bytes", bytes: new Uint8Array(2048) }); // 2048 <= 3072
        const second = endpoint.write({ kind: "bytes", bytes: new Uint8Array(1024) }); // 3072 <= 3072
        // Advisory pause: still accepted while capacity remains.
        const third = endpoint.write({ kind: "bytes", bytes: new Uint8Array(512) }); // 3584 > 3072
        const fourth = endpoint.write({ kind: "bytes", bytes: new Uint8Array(512) }); // 4096 == hard bound
        expect(first).toBe(true);
        expect(second).toBe(true);
        expect(third).toBe(false);
        expect(fourth).toBe(false);

        // Saturation rejects the whole value: none of it was accepted.
        let saturated: { code?: string; details?: { pendingBytes?: number; valueBytes?: number } } | undefined;
        try {
          endpoint.write({ kind: "bytes", bytes: new Uint8Array(512) }); // 4096 + 512 > 4096
        } catch (error) {
          saturated = error as typeof saturated;
        }
        expect(saturated?.code).toBe("backpressure");
        expect(saturated?.details?.pendingBytes).toBe(4096);
        expect(saturated?.details?.valueBytes).toBe(512);

        // The queue is drained asynchronously into the substrate; drain()
        // resolves once readiness recovers below the soft mark.
        await endpoint.drain();
        const after = endpoint.write({ kind: "bytes", bytes: new Uint8Array(8) });
        expect(after).toBe(true);
        // drain() also resolves immediately while ready.
        await endpoint.drain();
      } finally {
        teardown(endpoint);
      }
    },
    15_000,
  );

  test(
    "drain() rejects with closed when the endpoint closes before readiness recovers",
    async () => {
      const backend = await createBunBackend({ writeQueueBytes: 4096 });
      const endpoint = backend.spawn(launch(["/bin/cat"]));
      try {
        endpoint.write({ kind: "bytes", bytes: new Uint8Array(4096) });
        const drainPromise = endpoint.drain(); // pending 4096 > soft 3072
        endpoint.close();
        expect(await rejectionCode(drainPromise)).toBe("closed");
        expect(await rejectionCode(endpoint.drain())).toBe("closed");
      } finally {
        teardown(endpoint);
      }
    },
    15_000,
  );
});
