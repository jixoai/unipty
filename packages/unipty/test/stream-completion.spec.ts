import { describe, expect, it } from "vitest";
import { setupPty, utf8Bytes } from "./support/mock-backend.ts";
import { collectStream, flushMicrotasks, isPending } from "./support/helpers.ts";

describe("transport EOF", () => {
  it("completes the active stream normally before any exit settles", async () => {
    const { endpoint, pty } = setupPty();
    endpoint.pushText("payload");
    await endpoint.waitForDelivered(1);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.endOutput();
    expect(await collected).toEqual(["payload"]);
    // EOF never synthesizes a Process Exit Result.
    expect(await isPending(pty.exited)).toBe(true);
    endpoint.settleExit({ exitCode: 0, signal: null });
    await expect(pty.exited).resolves.toEqual({ exitCode: 0, signal: null });
  });

  it("completes a stream created after EOF; never-viewed bootstrap still arrives once", async () => {
    const { endpoint, pty } = setupPty();
    endpoint.pushText("bootstrap-before-eof");
    await endpoint.waitForDelivered(1);
    endpoint.endOutput();
    await flushMicrotasks();
    // The retained pre-first-view chunk is delivered in order, then EOF.
    expect(await collectStream(pty.stream({ encoding: "utf8" }))).toEqual([
      "bootstrap-before-eof",
    ]);
    // The first view is complete; a second view gets no replay.
    expect(await collectStream(pty.stream({ encoding: "utf8" }))).toEqual([]);
  });
});

describe("transport read failure", () => {
  it("errors the active stream with the exact transport error", async () => {
    const { endpoint, pty } = setupPty();
    endpoint.pushText("before-failure");
    await endpoint.waitForDelivered(1);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    const failure = new Error("transport read failed");
    endpoint.failOutput(failure);
    await expect(collected).rejects.toBe(failure);
    // The exit observation stays independent and settleable afterwards.
    expect(await isPending(pty.exited)).toBe(true);
    endpoint.settleExit({ exitCode: 137, signal: "SIGKILL" });
    await expect(pty.exited).resolves.toEqual({ exitCode: 137, signal: "SIGKILL" });
  });

  it("errors a stream that subscribes after the transport failed", async () => {
    const { endpoint, pty } = setupPty();
    const failure = new Error("already broken");
    endpoint.failOutput(failure);
    await flushMicrotasks();
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    await expect(collected).rejects.toBe(failure);
  });
});

describe("stream and exit independence", () => {
  it("keeps the stream open and delivering after the exit result settles", async () => {
    const { endpoint, pty } = setupPty();
    const stream = pty.stream({ encoding: "utf8" });
    endpoint.settleExit({ exitCode: 1, signal: null });
    await flushMicrotasks();

    const collected = collectStream(stream);
    endpoint.pushBytes(utf8Bytes("output-after-exit"));
    await endpoint.waitForDelivered(1);
    endpoint.endOutput();
    expect(await collected).toEqual(["output-after-exit"]);
  });

  it("keeps a pending read pending after exit settles until output arrives", async () => {
    const { endpoint, pty } = setupPty();
    const stream = pty.stream({ encoding: "utf8" });
    endpoint.settleExit({ exitCode: 0, signal: null });
    const reader = stream.getReader();
    const first = reader.read();
    await flushMicrotasks();
    // Exit alone neither delivers output nor completes the stream.
    let settled = false;
    void first.then(() => {
      settled = true;
    });
    await flushMicrotasks();
    expect(settled).toBe(false);
    endpoint.pushText("late");
    const result = await first;
    expect(result.done).toBe(false);
    expect(result.value).toBe("late");
  });

  it("keeps the exited observation awaitable repeatedly with the same result", async () => {
    const { endpoint, pty } = setupPty();
    const result = { exitCode: 3, signal: null };
    endpoint.settleExit(result);
    await expect(Promise.all([pty.exited, pty.exited, pty.exited])).resolves.toEqual([
      result,
      result,
      result,
  ]);
  });
});
