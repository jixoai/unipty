import { describe, expect, it } from "vitest";
import { setupPty } from "./support/mock-backend.ts";
import { expectRejectCode } from "./support/helpers.ts";

describe("drain", () => {
  it("resolves when the endpoint drain resolves", async () => {
    const { endpoint, pty } = setupPty();
    await expect(pty.drain()).resolves.toBeUndefined();
    expect(endpoint.calls).toContain("drain");
  });

  it("returns a pending promise until the endpoint drain resolves", async () => {
    const { endpoint, pty } = setupPty({ drainMode: "manual" });
    const drained = pty.drain();
    let settled = false;
    void drained.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(endpoint.drainWaiters.length).toBe(1);
    endpoint.settleNextDrain("resolve");
    await expect(drained).resolves.toBeUndefined();
  });

  it("propagates an endpoint drain rejection unchanged", async () => {
    const { endpoint, pty } = setupPty({ drainMode: "manual" });
    const failure = new Error("input pipe broken");
    const drained = pty.drain();
    endpoint.settleNextDrain({ reject: failure });
    await expect(drained).rejects.toBe(failure);
  });

  it("rejects with closed after close and never reaches the endpoint", async () => {
    const { endpoint, pty } = setupPty();
    pty.close();
    await expectRejectCode(pty.drain(), "closed");
    expect(endpoint.calls).not.toContain("drain");
  });
});
