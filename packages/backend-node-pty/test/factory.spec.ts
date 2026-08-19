/**
> Factory tests: acquisition readiness, dispose contract, and per-mode
> native representation declarations.
 */

import { describe, expect, it } from "vitest";
import { createNodePtyBackend } from "../src/index.ts";
import { cleanupEndpoint, errorCode, launch } from "./helpers.ts";

describe("createNodePtyBackend", () => {
  it("returns a ready Backend with synchronous spawn and async dispose", async () => {
    const backend = await createNodePtyBackend();
    expect(typeof backend.spawn).toBe("function");
    expect(typeof backend.dispose).toBe("function");
    await expect(backend.dispose()).resolves.toBeUndefined();
  });

  it("dispose is reusable and resolves without shared resources to release", async () => {
    const backend = await createNodePtyBackend();
    await expect(Promise.all([backend.dispose(), backend.dispose()])).resolves.toEqual([
      undefined,
      undefined,
    ]);
  });

  it("declares bytes-native output by default (encoding buffer)", async () => {
    const backend = await createNodePtyBackend();
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    expect(endpoint.native).toEqual({ input: "both", output: "bytes" });
    cleanupEndpoint(endpoint);
  });

  it('declares text-native surfaces for encoding "utf8"', async () => {
    const backend = await createNodePtyBackend({ encoding: "utf8" });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    expect(endpoint.native).toEqual({ input: "text", output: "text" });
    cleanupEndpoint(endpoint);
  });

  it('widens input to "both" for encoding "utf8" with writeDecode', async () => {
    const backend = await createNodePtyBackend({ encoding: "utf8", writeDecode: true });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    expect(endpoint.native).toEqual({ input: "both", output: "text" });
    cleanupEndpoint(endpoint);
  });

  it('rejects writeDecode combined with encoding "buffer"', async () => {
    await expect(
      createNodePtyBackend({ encoding: "buffer", writeDecode: true }),
    ).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("translates malformed launches into typed synchronous failures", async () => {
    const backend = await createNodePtyBackend();
    let caught: unknown;
    try {
      backend.spawn(launch([], {}));
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe("invalid-argument");

    try {
      backend.spawn(launch(["/bin/cat"], { cols: 80.5, rows: 24 }));
      caught = undefined;
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe("invalid-argument");
  });
});
