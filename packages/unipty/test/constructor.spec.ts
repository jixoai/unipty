import { describe, expect, it } from "vitest";
import type { UniPtyOptions } from "../src/index.ts";
import { UniPty } from "../src/index.ts";
import type { ReadyPtyBackend } from "../src/index.ts";
import { MockBackend } from "./support/mock-backend.ts";
import { expectSyncCode } from "./support/helpers.ts";

describe("UniPty constructor validation", () => {
  it("rejects null options", () => {
    expectSyncCode(() => new UniPty(null as unknown as UniPtyOptions<ReadyPtyBackend>), "invalid-argument");
  });

  it("rejects non-object options", () => {
    expectSyncCode(
      () => new UniPty("backend" as unknown as UniPtyOptions<ReadyPtyBackend>),
      "invalid-argument",
    );
    expectSyncCode(
      () => new UniPty(42 as unknown as UniPtyOptions<ReadyPtyBackend>),
      "invalid-argument",
    );
    expectSyncCode(
      () => new UniPty(undefined as unknown as UniPtyOptions<ReadyPtyBackend>),
      "invalid-argument",
    );
  });

  it("rejects missing backend", () => {
    expectSyncCode(() => new UniPty({} as UniPtyOptions<ReadyPtyBackend>), "invalid-argument");
  });

  it("rejects non-object backend", () => {
    expectSyncCode(
      () => new UniPty({ backend: 7 as unknown as ReadyPtyBackend }),
      "invalid-argument",
    );
  });

  it("rejects a backend without spawn()", () => {
    const backend = { dispose: () => Promise.resolve() } as unknown as ReadyPtyBackend;
    expectSyncCode(() => new UniPty({ backend }), "invalid-argument");
  });

  it("rejects a backend without dispose()", () => {
    const backend = { spawn: () => new MockBackend().endpoints[0] } as unknown as ReadyPtyBackend;
    expectSyncCode(() => new UniPty({ backend }), "invalid-argument");
  });

  it("accepts a structurally ready backend and exposes the same instance", () => {
    const backend = new MockBackend();
    const unipty = new UniPty({ backend });
    expect(unipty.backend).toBe(backend);
  });

  it("keeps the concrete backend type and allows synchronous spawn", () => {
    const backend = new MockBackend();
    const unipty = new UniPty({ backend });
    const pty = unipty.spawn(["/bin/echo", "hi"]);
    expect(pty.closed).toBe(false);
    expect(backend.spawnCalls.length).toBe(1);
  });
});
