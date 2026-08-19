import { describe, expect, it } from "vitest";
import { MockBackend, setupPty } from "./support/mock-backend.ts";
import { expectSyncCode, flushMicrotasks, isPending } from "./support/helpers.ts";

describe("UniPty disposal", () => {
  it("blocks new spawns immediately on the first dispose call", () => {
    const backend = new MockBackend();
    const unipty = backend.createUniPty();
    const pty = unipty.spawn(["live"]);
    void pty.close();
    const disposal = unipty.dispose();
    expectSyncCode(() => unipty.spawn(["blocked"]), "closed");
    void disposal;
  });

  it("blocks spawns synchronously even while PTYs remain open", () => {
    const backend = new MockBackend();
    const unipty = backend.createUniPty();
    const pty = unipty.spawn(["still-open"]);
    const disposal = unipty.dispose();
    expectSyncCode(() => unipty.spawn(["nope"]), "closed");
    // Cleanup so the disposal promise can settle.
    pty.close();
    return disposal;
  });

  it("returns the same promise for repeated calls", async () => {
    const { unipty, pty } = setupPty();
    const first = unipty.dispose();
    const second = unipty.dispose();
    expect(second).toBe(first);
    pty.close();
    await first;
  });

  it("keeps existing PTYs usable and untouched by disposal", async () => {
    const { unipty, backend, endpoint, pty } = setupPty();
    const disposal = unipty.dispose();
    await flushMicrotasks();

    expect(pty.closed).toBe(false);
    expect(endpoint.closeCount).toBe(0);
    expect(endpoint.terminateCount).toBe(0);
    expect(pty.write("still-usable")).toBe(true);
    expect(endpoint.acceptedWrites.length).toBe(1);
    expect(await isPending(disposal)).toBe(true);
    expect(backend.disposeCount).toBe(0);

    pty.close();
    await disposal;
    expect(backend.disposeCount).toBe(1);
  });

  it("waits for every existing PTY before releasing the backend once", async () => {
    const backend = new MockBackend();
    const unipty = backend.createUniPty();
    const first = unipty.spawn(["one"]);
    const second = unipty.spawn(["two"]);
    const disposal = unipty.dispose();

    first.close();
    await flushMicrotasks();
    expect(await isPending(disposal)).toBe(true);
    expect(backend.disposeCount).toBe(0);

    second.close();
    await disposal;
    expect(backend.disposeCount).toBe(1);
    expect(backend.calls.filter((op) => op === "dispose")).toHaveLength(1);
  });

  it("still blocks spawns after disposal has settled", async () => {
    const { unipty, pty } = setupPty();
    const disposal = unipty.dispose();
    pty.close();
    await disposal;
    expectSyncCode(() => unipty.spawn(["late"]), "closed");
  });

  it("rejects the public promise only when backend release fails", async () => {
    const backend = new MockBackend();
    const unipty = backend.createUniPty();
    const pty = unipty.spawn(["doomed"]);
    backend.disposeError = new Error("backend release failed");
    const disposal = unipty.dispose();
    pty.close();
    await expect(disposal).rejects.toThrowError("backend release failed");
    expect(backend.disposeCount).toBe(1);
    expectSyncCode(() => unipty.spawn(["still-blocked"]), "closed");
  });
});
