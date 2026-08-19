import { describe, expect, it } from "vitest";
import { setupPty, MockBackend } from "./support/mock-backend.ts";
import { expectSyncCode } from "./support/helpers.ts";

describe("spawn validation", () => {
  it("rejects an empty argv vector", () => {
    const { backend } = setupPty();
    expect(backend.spawnCalls.length).toBe(1);
    expectSyncCode(() => setupPty(undefined, []), "invalid-argument");
  });

  it("rejects a non-array argv", () => {
    const backend = new MockBackend();
    const unipty = backend.createUniPty();
    expectSyncCode(() => unipty.spawn("ls -la" as unknown as string[]), "invalid-argument");
    expectSyncCode(() => unipty.spawn(undefined as unknown as string[]), "invalid-argument");
    expect(backend.spawnCalls.length).toBe(0);
  });

  it("rejects non-string argv elements", () => {
    const backend = new MockBackend();
    const unipty = backend.createUniPty();
    expectSyncCode(() => unipty.spawn(["/bin/sh", "-c", 42 as unknown as string]), "invalid-argument");
    expectSyncCode(() => unipty.spawn([null as unknown as string]), "invalid-argument");
    expectSyncCode(
      () => unipty.spawn([{ cmd: "ls" } as unknown as string]),
      "invalid-argument",
    );
    expect(backend.spawnCalls.length).toBe(0);
  });

  it("passes shell metacharacters through as ordinary argv data", () => {
    const { backend } = setupPty(undefined, [
      "/bin/sh",
      "-c",
      "; rm -rf /",
      "$HOME",
      "| grep secrets",
      "`reboot`",
    ]);
    expect(backend.spawnCalls.length).toBe(1);
    const launch = backend.spawnCalls[0];
    expect(launch).toBeDefined();
    // Verbatim, no shell splitting, quoting, or evaluation.
    expect(launch?.argv).toEqual([
      "/bin/sh",
      "-c",
      "; rm -rf /",
      "$HOME",
      "| grep secrets",
      "`reboot`",
    ]);
  });

  it("keeps argv order with the executable first", () => {
    const { backend, pty } = setupPty(undefined, ["run", "--flag", "value"]);
    expect(pty.closed).toBe(false);
    expect(backend.spawnCalls[0]?.argv).toEqual(["run", "--flag", "value"]);
    expect(backend.spawnCalls[0]?.argv[0]).toBe("run");
  });

  it("forwards cwd when supplied and omits it otherwise", () => {
    const backend = new MockBackend();
    const unipty = backend.createUniPty();
    unipty.spawn(["a"], { cwd: "/tmp/work" });
    unipty.spawn(["b"]);
    expect(backend.spawnCalls[0]?.cwd).toBe("/tmp/work");
    expect(backend.spawnCalls[1]?.cwd).toBeUndefined();
  });

  it("normalizes the child env by dropping undefined values only", () => {
    const backend = new MockBackend();
    const unipty = backend.createUniPty();
    unipty.spawn(["a"], { env: { KEEP: "1", DROP: undefined, OTHER: "" } });
    expect(backend.spawnCalls[0]?.env).toEqual({ KEEP: "1", OTHER: "" });
  });

  it("hands the backend a structured launch with concrete geometry", () => {
    const { backend } = setupPty();
    const launch = backend.spawnCalls[0];
    expect(launch).toBeDefined();
    expect(typeof launch?.cols).toBe("number");
    expect(typeof launch?.rows).toBe("number");
    expect(Number.isInteger(launch?.cols)).toBe(true);
    expect(Number.isInteger(launch?.rows)).toBe(true);
  });

  it("creates independent endpoints for multiple spawns through one backend", () => {
    const backend = new MockBackend();
    const unipty = backend.createUniPty();
    const first = unipty.spawn(["first"]);
    const second = unipty.spawn(["second"]);
    expect(backend.endpoints.length).toBe(2);
    expect(first.closed).toBe(false);
    expect(second.closed).toBe(false);
    first.close();
    expect(first.closed).toBe(true);
    expect(second.closed).toBe(false);
    expect(backend.endpoints[0]?.closeCount).toBe(1);
    expect(backend.endpoints[1]?.closeCount).toBe(0);
  });
});
