/**
 * Shared helpers for spawning fixture children directly (outside a PTY) in
 * tests — task 1.5 verification: fixtures run deterministically without a
 * PTY and report their expected markers.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { childArgv, type FixtureName } from "../../src/fixtures/fixtures.ts";

export interface ChildRunResult {
  readonly stdout: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
}

/** Run one fixture to completion under the current runtime. */
export function runFixtureToCompletion(
  fixture: FixtureName,
  args: readonly string[] = [],
  options: { timeoutMs?: number; env?: Record<string, string | undefined> } = {},
): Promise<ChildRunResult> {
  const timeoutMs = options.timeoutMs ?? 15000;
  return new Promise((resolve, reject) => {
    const argv = childArgv(fixture, args);
    const executable = argv[0];
    if (executable === undefined) throw new Error("childArgv returned an empty argv");
    const child = spawn(executable, argv.slice(1), {
      stdio: ["pipe", "pipe", "pipe"],
      ...(options.env === undefined ? {} : { env: { ...process.env, ...options.env } }),
    });
    // Byte accumulation with ONE final decode: per-chunk decoding would
    // corrupt UTF-8 sequences split across chunk boundaries.
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      const partial = Buffer.concat(chunks).toString("utf8");
      reject(
        new Error(
          `${fixture} timed out after ${timeoutMs}ms (output so far: ${JSON.stringify(partial.slice(0, 200))})`,
        ),
      );
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Uint8Array) => {
      chunks.push(Buffer.from(chunk));
    });
    child.on("error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode: number | null, signal: string | null) => {
      clearTimeout(timer);
      resolve({ stdout: Buffer.concat(chunks).toString("utf8"), exitCode, signal });
    });
  });
}

/** A started long-running fixture child with interaction helpers. */
export interface RunningChild {
  readonly child: ChildProcess;
  write(text: string): void;
  readUntil(satisfies: (text: string) => boolean, timeoutMs: number): Promise<string>;
  kill(): void;
}

/** Start one fixture for interaction; the caller must kill it. */
export function startFixture(
  fixture: FixtureName,
  args: readonly string[] = [],
  options: { env?: Record<string, string | undefined> } = {},
): RunningChild {
  const argv = childArgv(fixture, args);
  const executable = argv[0];
  if (executable === undefined) throw new Error("childArgv returned an empty argv");
  const child = spawn(executable, argv.slice(1), {
    stdio: ["pipe", "pipe", "pipe"],
    ...(options.env === undefined ? {} : { env: { ...process.env, ...options.env } }),
  });
  // Byte accumulation; text is re-decoded on demand for polling predicates
  // (ASCII markers only), so split multibyte sequences stay intact.
  const chunks: Buffer[] = [];
  child.stdout?.on("data", (chunk: Uint8Array) => {
    chunks.push(Buffer.from(chunk));
  });
  const currentText = (): string => Buffer.concat(chunks).toString("utf8");
  return {
    child,
    write(text: string): void {
      child.stdin?.write(text);
    },
    readUntil(satisfies, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      return new Promise((resolve, reject) => {
        const poll = (): void => {
          const text = currentText();
          if (satisfies(text)) {
            resolve(text);
            return;
          }
          if (Date.now() > deadline) {
            reject(
              new Error(
                `expected output not observed within ${timeoutMs}ms (got ${JSON.stringify(text)})`,
              ),
            );
            return;
          }
          setTimeout(poll, 25);
        };
        poll();
      });
    },
    kill(): void {
      child.kill("SIGKILL");
    },
  };
}
