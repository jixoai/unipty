import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { setupPty, utf8Bytes, bothChunk } from "./support/mock-backend.ts";
import {
  collectStream,
  expectRejectCode,
  expectSyncCode,
  flushMicrotasks,
  isPending,
  takeFirst,
} from "./support/helpers.ts";

describe("utf8 terminal stream", () => {
  it("yields native text chunks unchanged and in order", async () => {
    const { endpoint, pty } = setupPty({ native: { input: "text", output: "text" } });
    endpoint.pushText("alpha");
    endpoint.pushText("beta");
    await endpoint.waitForDelivered(2);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.endOutput();
    expect(await collected).toEqual(["alpha", "beta"]);
  });

  it("decodes native bytes into strings", async () => {
    const { endpoint, pty } = setupPty({ native: { input: "bytes", output: "bytes" } });
    endpoint.pushBytes(utf8Bytes("hello "));
    endpoint.pushBytes(utf8Bytes("world"));
    await endpoint.waitForDelivered(2);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.endOutput();
    expect((await collected).join("")).toBe("hello world");
  });

  it("decodes incrementally across a multibyte sequence split over byte chunks", async () => {
    const { endpoint, pty } = setupPty({ native: { input: "bytes", output: "bytes" } });
    // "你" is E4 BD A0; split it 2/1 and continue with ASCII in the second chunk.
    endpoint.pushBytes(new Uint8Array([0xe4, 0xbd]));
    endpoint.pushBytes(new Uint8Array([0xa0, 0x41]));
    await endpoint.waitForDelivered(2);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.endOutput();
    const chunks = await collected;
    expect(chunks.join("")).toBe("你A");
    for (const chunk of chunks) {
      expect(chunk.includes("\uFFFD")).toBe(false);
    }
  });

  it("flushes the incremental decoder tail at EOF without losing complete output", async () => {
    const { endpoint, pty } = setupPty({ native: { input: "bytes", output: "bytes" } });
    endpoint.pushBytes(utf8Bytes("ok"));
    // Truncated 4-byte emoji sequence: the tail flush reports the damage.
    endpoint.pushBytes(new Uint8Array([0xf0, 0x9f, 0x98]));
    await endpoint.waitForDelivered(2);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.endOutput();
    expect((await collected).join("")).toBe("ok\uFFFD");
  });

  it("prefers the native text half of a bytes+text chunk", async () => {
    const { endpoint, pty } = setupPty({ native: { input: "both", output: "both" } });
    endpoint.push(bothChunk(utf8Bytes("from-bytes"), "from-native-text"));
    await endpoint.waitForDelivered(1);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.endOutput();
    expect(await collected).toEqual(["from-native-text"]);
  });

  it("decodes a bytes-only chunk arriving on a both endpoint", async () => {
    const { endpoint, pty } = setupPty({ native: { input: "both", output: "both" } });
    endpoint.pushBytes(utf8Bytes("bytes-only"));
    await endpoint.waitForDelivered(1);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.endOutput();
    expect(await collected).toEqual(["bytes-only"]);
  });
});

describe("bytes terminal stream", () => {
  it("yields the exact native Uint8Array chunks by reference", async () => {
    const { endpoint, pty } = setupPty({ native: { input: "bytes", output: "bytes" } });
    const first = new Uint8Array([1, 2, 3]);
    const second = new Uint8Array([4, 5]);
    endpoint.pushBytes(first);
    endpoint.pushBytes(second);
    await endpoint.waitForDelivered(2);
    const collected = collectStream(pty.stream({ encoding: "bytes" }));
    endpoint.endOutput();
    expect(await collected).toEqual([first, second]);
    const chunks = await collected;
    expect(chunks[0]).toBe(first);
    expect(chunks[1]).toBe(second);
  });

  it("passes native Buffer chunks through as Uint8Array values", async () => {
    const { endpoint, pty } = setupPty({ native: { input: "bytes", output: "bytes" } });
    const buffer = Buffer.from("buffer-passthrough");
    endpoint.pushBytes(buffer);
    await endpoint.waitForDelivered(1);
    const collected = collectStream(pty.stream({ encoding: "bytes" }));
    endpoint.endOutput();
    const chunks = await collected;
    expect(chunks[0]).toBeInstanceOf(Uint8Array);
    expect(chunks[0]).toBe(buffer);
  });

  it("fails a bytes request synchronously on a text-output endpoint", async () => {
    const { endpoint, pty } = setupPty({ native: { input: "text", output: "text" } });
    expectSyncCode(() => pty.stream({ encoding: "bytes" }), "unsupported");
    // The transport stays untouched and a utf8 view remains usable.
    expect(endpoint.sourceCancelled).toBe(false);
    endpoint.pushText("still-readable");
    await endpoint.waitForDelivered(1);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.endOutput();
    expect(await collected).toEqual(["still-readable"]);
  });

  it("errors when a native text chunk reaches a bytes view", async () => {
    const { endpoint, pty } = setupPty({ native: { input: "both", output: "both" } });
    const stream = pty.stream({ encoding: "bytes" });
    const collected = collectStream(stream);
    endpoint.pushText("text-never-becomes-native-bytes");
    await expectRejectCode(collected, "unsupported");
  });
});

describe("one active terminal stream per PTY", () => {
  it("rejects a second concurrent stream with active-stream", async () => {
    const { endpoint, pty } = setupPty();
    const first = pty.stream({ encoding: "utf8" });
    expectSyncCode(() => pty.stream({ encoding: "utf8" }), "active-stream");
    expectSyncCode(() => pty.stream({ encoding: "bytes" }), "active-stream");
    endpoint.endOutput();
    expect(await collectStream(first)).toEqual([]);
  });

  it("allows a new stream after explicit cancel", async () => {
    const { endpoint, pty } = setupPty();
    const first = pty.stream({ encoding: "utf8" });
    endpoint.pushText("solo");
    await endpoint.waitForDelivered(1);
    await first.cancel();
    await flushMicrotasks();
    const second = pty.stream({ encoding: "utf8" });
    const collected = collectStream(second);
    endpoint.endOutput();
    expect(await collected).toEqual([]);
  });

  it("treats a teed stream as one UniPty view for fan-out", async () => {
    const { endpoint, pty } = setupPty();
    endpoint.pushText("fan");
    await endpoint.waitForDelivered(1);
    const source = pty.stream({ encoding: "utf8" });
    const [left, right] = source.tee();
    expectSyncCode(() => pty.stream({ encoding: "utf8" }), "active-stream");
    const collectedLeft = collectStream(left);
    const collectedRight = collectStream(right);
    endpoint.endOutput();
    expect(await collectedLeft).toEqual(["fan"]);
    expect(await collectedRight).toEqual(["fan"]);
  });
});

describe("terminal stream cancellation detaches only the view", () => {
  it("leaves input, transport, and process lifetime untouched", async () => {
    const { endpoint, pty } = setupPty();
    endpoint.pushText("startup");
    await endpoint.waitForDelivered(1);
    const stream = pty.stream({ encoding: "utf8" });
    expect(await takeFirst(stream, 1)).toEqual(["startup"]);
    await flushMicrotasks();

    expect(pty.closed).toBe(false);
    expect(endpoint.closeCount).toBe(0);
    expect(endpoint.terminateCount).toBe(0);
    expect(endpoint.sourceCancelled).toBe(false);
    expect(await isPending(pty.exited)).toBe(true);
    // The detached PTY still accepts input.
    expect(pty.write("still-writable")).toBe(true);
  });

  it("discards output produced while detached and serves a future-only view", async () => {
    const { endpoint, pty } = setupPty();
    endpoint.pushText("initial");
    await endpoint.waitForDelivered(1);
    const first = pty.stream({ encoding: "utf8" });
    expect(await takeFirst(first, 1)).toEqual(["initial"]);
    await flushMicrotasks();

    endpoint.pushText("discarded-1");
    endpoint.pushText("discarded-2");
    await endpoint.waitForDelivered(3);

    const second = pty.stream({ encoding: "utf8" });
    const collected = collectStream(second);
    endpoint.pushText("fresh");
    await endpoint.waitForDelivered(4);
    endpoint.endOutput();
    expect(await collected).toEqual(["fresh"]);
  });

  it("detaches through an early for-await exit and allows a future-only view", async () => {
    const { endpoint, pty } = setupPty();
    endpoint.pushText("one");
    endpoint.pushText("two");
    endpoint.pushText("three");
    await endpoint.waitForDelivered(3);
    const stream = pty.stream({ encoding: "utf8" });
    expect(await takeFirst(stream, 1)).toEqual(["one"]);
    await flushMicrotasks();

    const next = pty.stream({ encoding: "utf8" });
    const collected = collectStream(next);
    endpoint.pushText("future");
    await endpoint.waitForDelivered(4);
    endpoint.endOutput();
    expect(await collected).toEqual(["future"]);
  });
});
