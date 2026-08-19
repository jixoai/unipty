/**
 * Small deterministic test utilities: error-code capture, stream collection,
 * microtask flushing, and pending-promise probing.
 */

import { expect } from "vitest";
import type { UniPtyErrorCode } from "../../src/index.ts";
import type { UniPtyError } from "../../src/index.ts";

/** Run a synchronous operation and capture the thrown value (or undefined). */
export function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

function assertErrorCode(error: unknown, code: UniPtyErrorCode): void {
  expect(error).toBeInstanceOf(Error);
  expect((error as UniPtyError).code).toBe(code);
}

/** Assert a synchronous public operation fails with the stable error code. */
export function expectSyncCode(action: () => unknown, code: UniPtyErrorCode): void {
  const error = captureError(action);
  if (error === undefined) {
    throw new Error(`expected operation to throw with code "${code}", but it returned`);
  }
  assertErrorCode(error, code);
}

/** Assert a public promise rejects with the stable error code. */
export async function expectRejectCode(
  promise: Promise<unknown>,
  code: UniPtyErrorCode,
): Promise<void> {
  let caught: unknown = undefined;
  let rejected = false;
  await promise.then(
    () => {
      rejected = false;
    },
    (error: unknown) => {
      rejected = true;
      caught = error;
    },
  );
  if (!rejected) {
    throw new Error(`expected promise to reject with code "${code}", but it resolved`);
  }
  assertErrorCode(caught, code);
}

/** Drain a stream fully; rejects propagate to the caller unchanged. */
export async function collectStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const chunks: T[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

/**
 * Iterate with for-await and break after `count` chunks; the early exit
 * performs the default Terminal Stream detachment under test.
 */
export async function takeFirst<T>(stream: ReadableStream<T>, count: number): Promise<T[]> {
  // The workspace lib set omits DOM.AsyncIterable, but the runtime provides
  // the async iterator that drives default early-exit cancellation.
  const iterable = stream as unknown as AsyncIterable<T>;
  const chunks: T[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
    if (chunks.length >= count) break;
  }
  return chunks;
}

/** Advance several microtask ticks so async pumps and promise chains settle. */
export async function flushMicrotasks(ticks = 12): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
  }
}

/**
 * Determine whether a promise is still pending after a bounded microtask
 * flush. Deterministic: an already-settled promise notifies its continuation
 * within a couple of ticks.
 */
export async function isPending(promise: Promise<unknown>, ticks = 12): Promise<boolean> {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await flushMicrotasks(ticks);
  return !settled;
}
