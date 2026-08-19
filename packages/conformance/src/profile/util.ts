/**
> Orthogonal intents (2026-08-20): small async/assert helpers shared by the
> conformance profile scenarios.
 */

import type { Pty } from "unipty";

/** Throw when an invariant the scenario asserts is violated. */
export function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Extract the stable common `error.code`, if any, from a thrown value. */
export function errorCodeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** Describe a thrown value for scenario error records. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = errorCodeOf(error);
    return code === undefined
      ? `${error.name}: ${error.message}`
      : `${error.name} [${code}]: ${error.message}`;
  }
  return String(error);
}

/**
 * Assert that `operation` throws synchronously with the exact common code.
 * Async rejections fail the assertion: the contract keeps these operations
 * synchronous.
 */
export function expectSyncErrorCode(operation: () => void, code: string): void {
  let thrown: unknown = undefined;
  let didThrow = false;
  try {
    operation();
  } catch (error) {
    thrown = error;
    didThrow = true;
  }
  if (!didThrow)
    throw new Error(`expected a synchronous throw with code "${code}", but the call returned`);
  const actual = errorCodeOf(thrown);
  if (actual !== code) {
    throw new Error(
      `expected error code "${code}" but got "${String(actual)}" (${describeError(thrown)})`,
    );
  }
}

/** Promise-based delay. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Timeout marker for {@link withTimeout}. */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/** Race a promise against a deadline. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Read chunks from an acquired reader until the stream completes. */
export async function readReaderToCompletion<T>(
  reader: ReadableStreamDefaultReader<T>,
): Promise<T[]> {
  const chunks: T[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    if (value !== undefined) chunks.push(value);
  }
}

/**
 * Normalize terminal output text for oracle comparison. Real transports add
 * noise the fixture never wrote, and the portable oracle folds all of it:
 * - ONLCR translates NL to CRLF, and kernel ONLCR expansion at output-buffer
 *   boundaries can emit a duplicated CR (observed on darwin: `0d 0d 0a`);
 * - runtime progress renderers emit ANSI CSI/OSC escape sequences (the Deno
 *   child draws loader/update spinners on a TTY).
 * Pipe-based test transports are unaffected by both.
 */
export function normalizeTtyText(text: string): string {
  return text
    .replace(/\u001b\[[0-9;?<=> #]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g, "")
    .replace(/\r+\n/g, "\n");
}

/**
 * Byte-level counterpart of {@link normalizeTtyText}: fold CR-runs before a
 * LF back to a single NL byte so native-byte fidelity compares the portable
 * fixture bytes. Multibyte UTF-8 sequences never contain 0x0D/0x0A, so this
 * cannot corrupt payload integrity checks.
 */
export function normalizeTtyBytes(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let index = 0;
  while (index < bytes.length) {
    const byte = bytes[index];
    if (byte === undefined) break;
    // Strip ANSI CSI sequences (ESC [ ... final byte in @-~): runtime
    // progress renderers draw them on a TTY transport.
    if (byte === 0x1b && bytes[index + 1] === 0x5b) {
      index += 2;
      while (index < bytes.length) {
        const c = bytes[index];
        if (c === undefined) break;
        index += 1;
        if (c >= 0x40 && c <= 0x7e) break;
      }
      continue;
    }
    const next = index + 1 < bytes.length ? bytes[index + 1] : undefined;
    // Drop CRs that belong to a CR-run terminating at an LF (ONLCR and its
    // buffer-boundary duplication); a lone CR elsewhere is preserved.
    if (byte === 0x0d && (next === 0x0a || next === 0x0d)) {
      index += 1;
      continue;
    }
    out.push(byte);
    index += 1;
  }
  return Uint8Array.from(out);
}

/**
 * Read chunks from an acquired reader until `satisfies` accepts the joined
 * text. The view stays active; the caller owns further reads or detachment.
 * Text is ONLCR-normalized before the predicate and in the return value.
 */
export async function readReaderUntil(
  reader: ReadableStreamDefaultReader<string>,
  satisfies: (text: string) => boolean,
  label: string,
  timeoutMs: number,
): Promise<string> {
  let text = "";
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new TimeoutError(label, timeoutMs);
    const chunk = await withTimeout(reader.read(), remaining, label);
    if (chunk.done) {
      throw new Error(
        `${label}: stream completed before the expected output was observed (got ${JSON.stringify(text)})`,
      );
    }
    if (chunk.value !== undefined) text += chunk.value;
    const normalized = normalizeTtyText(text);
    if (satisfies(normalized)) return normalized;
  }
}

/** Concatenate byte chunks into one array (exact-fidelity comparisons). */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Encode text as UTF-8 bytes. */
const encoder = new TextEncoder();

export function encodeUtf8(text: string): Uint8Array {
  return encoder.encode(text);
}

/** Resolve once the predicate holds; polls at `intervalMs` up to `timeoutMs`. */
export async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  label: string,
  intervalMs = 20,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() >= deadline) throw new TimeoutError(label, timeoutMs);
    await delay(intervalMs);
  }
}

/** Whether `promise` settled within `ms` (never rejects). */
export async function settledWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return await withTimeout(
    promise.then(
      () => true,
      () => true,
    ),
    ms,
    "settlement probe",
  ).then(
    () => true,
    () => false,
  );
}

/**
 * Expected per-dimension default geometry, mirroring Core's host probe: a
 * trustworthy host TTY size wins when the harness runs on a TTY; otherwise
 * the portable 80 x 24 fallback applies. Environment values are handled by
 * the dedicated env-fallback scenarios.
 */
export function expectedDefaultGeometry(): { cols: number; rows: number } {
  const stdout = process.stdout as { isTTY?: boolean; columns?: number; rows?: number };
  const cols =
    stdout.isTTY === true && Number.isInteger(stdout.columns) && (stdout.columns ?? 0) > 0
      ? (stdout.columns as number)
      : 80;
  const rows =
    stdout.isTTY === true && Number.isInteger(stdout.rows) && (stdout.rows ?? 0) > 0
      ? (stdout.rows as number)
      : 24;
  return { cols, rows };
}

/** Temporarily delete `COLUMNS`/`LINES` from the Core host environment. */
export function withoutHostGeometryEnv(): () => void {
  return withHostGeometryEnv({ COLUMNS: undefined, LINES: undefined });
}

/** Temporarily pin host `COLUMNS`/`LINES` values (undefined deletes). */
export function withHostGeometryEnv(override: {
  COLUMNS?: string | undefined;
  LINES?: string | undefined;
}): () => void {
  const saved: Record<"COLUMNS" | "LINES", string | undefined> = {
    COLUMNS: process.env.COLUMNS,
    LINES: process.env.LINES,
  };
  for (const key of ["COLUMNS", "LINES"] as const) {
    const value = override[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const key of ["COLUMNS", "LINES"] as const) {
      const restore = saved[key];
      if (restore === undefined) delete process.env[key];
      else process.env[key] = restore;
    }
  };
}

/** Ensure a pty is fully torn down for scenario cleanup (never throws). */
export async function quiescePty(pty: Pty): Promise<void> {
  try {
    pty.terminate();
  } catch {
    // idempotent operation; a prior terminate or backend failure is fine
  }
  try {
    if (!pty.closed) pty.close();
  } catch {
    // close must not throw; ignore unexpected backend teardown failures here
  }
  try {
    await pty.exited;
  } catch {
    // exit observation is backend-owned; cleanup must not fail on it
  }
}
