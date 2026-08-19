import { describe, expect, it } from "vitest";
import { UniPtyError } from "../src/index.ts";
import { setupPty, utf8Bytes } from "./support/mock-backend.ts";
import { collectStream, expectSyncCode, flushMicrotasks, isPending } from "./support/helpers.ts";

describe("resize", () => {
  it("passes valid character-cell sizes through to the endpoint", () => {
    const { endpoint, pty } = setupPty();
    pty.resize(120, 40);
    pty.resize(1, 1);
    expect(endpoint.resizeCalls).toEqual([
      { cols: 120, rows: 40 },
      { cols: 1, rows: 1 },
    ]);
  });

  it("rejects invalid sizes without reaching the endpoint", () => {
    const { endpoint, pty } = setupPty();
    for (const cols of [0, -1, 1.5, NaN, Infinity]) {
      expectSyncCode(() => pty.resize(cols, 24), "invalid-argument");
      expectSyncCode(() => pty.resize(80, cols), "invalid-argument");
    }
    expect(endpoint.resizeCalls.length).toBe(0);
    expect(endpoint.calls).not.toContain("resize");
  });

  it("rejects resize after close with closed", () => {
    const { endpoint, pty } = setupPty();
    pty.close();
    expectSyncCode(() => pty.resize(100, 30), "closed");
    expect(endpoint.resizeCalls.length).toBe(0);
  });

  it("propagates an endpoint unsupported failure", () => {
    const { pty } = setupPty({
      resize: () => {
        throw new UniPtyError("unsupported", "mock backend cannot resize");
      },
    });
    expectSyncCode(() => pty.resize(100, 30), "unsupported");
  });
});

describe("terminate", () => {
  it("forwards each call to the endpoint exactly once", () => {
    const { endpoint, pty } = setupPty();
    pty.terminate();
    expect(endpoint.terminateCount).toBe(1);
    pty.terminate();
    expect(endpoint.terminateCount).toBe(2);
    expect(endpoint.calls.filter((op) => op === "terminate")).toHaveLength(2);
  });

  it("does not close the transport and leaves streams available", async () => {
    const { endpoint, pty } = setupPty();
    pty.terminate();
    expect(pty.closed).toBe(false);
    expect(endpoint.closeCount).toBe(0);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    endpoint.pushText("after-terminate");
    await endpoint.waitForDelivered(1);
    endpoint.endOutput();
    expect(await collected).toEqual(["after-terminate"]);
  });

  it("does not synthesize the exit result by itself", async () => {
    const { endpoint, pty } = setupPty();
    pty.terminate();
    await flushMicrotasks();
    expect(await isPending(pty.exited)).toBe(true);
    endpoint.settleExit({ exitCode: null, signal: "SIGTERM" });
    await expect(pty.exited).resolves.toEqual({ exitCode: null, signal: "SIGTERM" });
  });
});

describe("close", () => {
  it("publishes closed synchronously before invoking endpoint close", () => {
    const { endpoint, pty } = setupPty();
    let closedObservedInsideEndpointClose: boolean | undefined;
    endpoint.onClose = () => {
      closedObservedInsideEndpointClose = pty.closed;
    };
    expect(pty.closed).toBe(false);
    pty.close();
    expect(pty.closed).toBe(true);
    expect(closedObservedInsideEndpointClose).toBe(true);
    expect(endpoint.closeCount).toBe(1);
  });

  it("is idempotent: repeated public close records one endpoint close", () => {
    const { endpoint, pty } = setupPty();
    pty.close();
    pty.close();
    pty.close();
    expect(endpoint.closeCount).toBe(1);
    expect(pty.closed).toBe(true);
  });

  it("completes the active terminal stream normally", async () => {
    const { endpoint, pty } = setupPty();
    endpoint.pushBytes(utf8Bytes("seen"));
    await endpoint.waitForDelivered(1);
    const collected = collectStream(pty.stream({ encoding: "utf8" }));
    pty.close();
    expect(await collected).toEqual(["seen"]);
  });

  it("rejects write, resize, and new streams after close", () => {
    const { endpoint, pty } = setupPty();
    pty.close();
    expectSyncCode(() => pty.write("x"), "closed");
    expectSyncCode(() => pty.resize(10, 10), "closed");
    expectSyncCode(() => pty.stream({ encoding: "utf8" }), "closed");
    expectSyncCode(() => pty.stream({ encoding: "bytes" }), "closed");
    expect(endpoint.writeAttempts.length).toBe(0);
    expect(endpoint.resizeCalls.length).toBe(0);
  });

  it("does not request child termination and keeps the exit observation settleable", async () => {
    const { endpoint, pty } = setupPty();
    pty.close();
    expect(endpoint.terminateCount).toBe(0);
    expect(await isPending(pty.exited)).toBe(true);
    endpoint.settleExit({ exitCode: 0, signal: null });
    await expect(pty.exited).resolves.toEqual({ exitCode: 0, signal: null });
  });

  it("cancels the private transport source during physical teardown", () => {
    const { endpoint, pty } = setupPty();
    pty.close();
    expect(endpoint.sourceCancelled).toBe(true);
  });

  it("keeps the established exited promise identical to the endpoint observation", async () => {
    const { endpoint, pty } = setupPty();
    expect(pty.exited).toBe(endpoint.exited);
    endpoint.settleExit({ exitCode: 7, signal: null });
    const [first, second] = await Promise.all([pty.exited, pty.exited]);
    expect(first).toEqual({ exitCode: 7, signal: null });
    expect(second).toBe(first);
  });
});
