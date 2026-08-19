/**
 * Shared helpers for the @unipty/backend-deno-sigma__pty-ffi adapter tests.
 *
 * These tests run under `deno test -A test/` on a real PTY through the
 * vendored closure and the vendored native library. They never touch a JSR
 * registry at test time.
 */

import type { BackendEndpoint } from "unipty";
import {
  createDenoSigmaPtyFfiBackend,
  type DenoSigmaPtyFfiBackend,
  type DenoSigmaPtyFfiBackendOptions,
} from "../src/index.ts";

export const PACKAGE_DIR = new URL("..", import.meta.url);

export async function makeBackend(
  options: DenoSigmaPtyFfiBackendOptions = {},
): Promise<DenoSigmaPtyFfiBackend> {
  return await createDenoSigmaPtyFfiBackend(options);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strict/deep equality assertion for the plain values used in these tests. */
export function assertEqual<T>(actual: T, expected: T, note?: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(
      `assertEqual failed${note === undefined ? "" : ` (${note})`}: expected ${b}, got ${a}`,
    );
  }
}

export type EndpointReader = ReadableStreamDefaultReader<import("unipty").NativeChunk>;

export interface Collected {
  text: string;
  done: boolean;
  reader: EndpointReader;
}

/**
 * Read the private output source until `until(text)` passes or the stream
 * completes. The reader is threaded through (the stream allows one reader), so
 * multi-phase tests reuse it; tests that want an explicit detachment call
 * `reader.cancel()` themselves. Throws on `timeoutMs` without progress.
 */
export async function collectUntil(
  endpoint: BackendEndpoint,
  until: (text: string) => boolean,
  options: { timeoutMs?: number; reader?: EndpointReader } = {},
): Promise<Collected> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const reader = options.reader ?? endpoint.output.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`collectUntil timeout; got ${JSON.stringify(text)}`);
    }
    const race = await Promise.race([
      reader.read(),
      sleep(remaining).then(() => "timeout" as const),
    ]);
    if (race === "timeout") {
      throw new Error(`collectUntil timeout; got ${JSON.stringify(text)}`);
    }
    if (race.done) return { text, done: true, reader };
    const chunk = race.value;
    if (chunk === undefined) continue;
    if (chunk.kind === "bytes") text += decoder.decode(chunk.bytes, { stream: true });
    else if (chunk.kind === "text") text += chunk.text;
    else text += chunk.text;
    if (until(text)) return { text, done: false, reader };
  }
}

/**
 * Let the Endpoint's poll pump observe a teardown and finish its pending
 * timer turns so Deno test op sanitizers stay quiet.
 */
export async function settlePump(): Promise<void> {
  await sleep(150);
}
