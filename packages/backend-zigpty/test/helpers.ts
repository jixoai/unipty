/**
> Shared real-PTY helpers for @unipty/backend-node-pty adapter tests.
>
> These tests exercise the Core-private Endpoint seam directly (NativeChunk
> stream, write readiness, exit observation); Core itself is not under test
> here and is never constructed.
 */

import type { BackendEndpoint, BackendExitResult, NativeChunk, StructuredLaunch } from "unipty";

export interface LaunchOverrides {
  readonly cols?: number;
  readonly rows?: number;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
}

/** Build a StructuredLaunch with concrete geometry (Core's job upstream). */
export function launch(argv: readonly string[], overrides: LaunchOverrides = {}): StructuredLaunch {
  const value: {
    argv: readonly string[];
    cwd?: string;
    env?: Readonly<Record<string, string>>;
    cols: number;
    rows: number;
  } = { argv, cols: overrides.cols ?? 80, rows: overrides.rows ?? 24 };
  if (overrides.cwd !== undefined) {
    value.cwd = overrides.cwd;
  }
  if (overrides.env !== undefined) {
    value.env = overrides.env;
  }
  return value;
}

/** Repeatably awaitable exit observation with a timeout guard. */
export function awaitExit(
  endpoint: BackendEndpoint,
  timeoutMs = 10_000,
): Promise<BackendExitResult> {
  return Promise.race([
    endpoint.exited,
    new Promise<BackendExitResult>((_, reject) => {
      setTimeout(
        () => reject(new Error("exit observation did not settle in time")),
        timeoutMs,
      ).unref?.();
    }),
  ]);
}

/**
 * Read the Endpoint output source, accumulating decoded text, until `match`
 * accepts the accumulated text or the source completes. Uses a streaming
 * decoder so split multibyte sequences survive regardless of chunking.
 */
export async function readOutputText(
  endpoint: BackendEndpoint,
  match: (accumulated: string) => boolean,
  timeoutMs = 10_000,
): Promise<string> {
  const reader = endpoint.output.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  const timer = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(
          new Error(
            `output did not satisfy the matcher in time; got: ${JSON.stringify(accumulated)}`,
          ),
        ),
      timeoutMs,
    ).unref?.();
  });
  try {
    await Promise.race([
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk: NativeChunk = value;
          if (chunk.kind === "text") {
            accumulated += chunk.text;
          } else if (chunk.kind === "bytes") {
            accumulated += decoder.decode(chunk.bytes, { stream: true });
          } else {
            accumulated += chunk.text;
          }
          if (match(accumulated)) break;
        }
      })(),
      timer,
    ]);
  } finally {
    reader.releaseLock();
  }
  return accumulated;
}

/** Expect the next settled value to be an exit with the exact given shape. */
export async function expectExit(
  endpoint: BackendEndpoint,
  expected: { exitCode: number; signal: string | null },
): Promise<void> {
  const result = await awaitExit(endpoint);
  if (result.exitCode !== expected.exitCode || result.signal !== expected.signal) {
    throw new Error(
      `expected exit ${JSON.stringify(expected)} but observed ${JSON.stringify(result)}`,
    );
  }
}

/** Release one endpoint: terminate first (child is caller-owned otherwise forever), then close transport. */
export function cleanupEndpoint(endpoint: BackendEndpoint): void {
  endpoint.terminate();
  endpoint.close();
}

/** Assert a UniPty-style failure code. */
export function errorCode(error: unknown): string | undefined {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}
