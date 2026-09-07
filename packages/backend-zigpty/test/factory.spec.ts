/**
> Factory tests: acquisition readiness, the native gate surface, dispose
> contract, and per-mode native representation declarations.
 */

import { describe, expect, it } from "vitest";
import { createZigptyBackend } from "../src/index.ts";
import { cleanupEndpoint, errorCode, launch } from "./helpers.ts";

describe("createZigptyBackend", () => {
  it("returns a ready Backend with synchronous spawn and async dispose", async () => {
    const backend = await createZigptyBackend();
    expect(typeof backend.spawn).toBe("function");
    expect(typeof backend.dispose).toBe("function");
    await expect(backend.dispose()).resolves.toBeUndefined();
  });

  it("dispose is reusable and resolves without shared resources to release", async () => {
    const backend = await createZigptyBackend();
    await expect(Promise.all([backend.dispose(), backend.dispose()])).resolves.toEqual([
      undefined,
      undefined,
    ]);
  });

  it("declares strict text input with bytes-native output by default (encoding buffer)", async () => {
    const backend = await createZigptyBackend();
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    // The substrate write is string-only in every mode: input stays strict
    // unless writeDecode widens it (unlike the node-pty buffer route).
    expect(endpoint.native).toEqual({ input: "text", output: "bytes" });
    cleanupEndpoint(endpoint);
  });

  it('declares text-native surfaces for encoding "utf8"', async () => {
    const backend = await createZigptyBackend({ encoding: "utf8" });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    expect(endpoint.native).toEqual({ input: "text", output: "text" });
    cleanupEndpoint(endpoint);
  });

  it('widens input to "both" for encoding "utf8" with writeDecode', async () => {
    const backend = await createZigptyBackend({ encoding: "utf8", writeDecode: true });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    expect(endpoint.native).toEqual({ input: "both", output: "text" });
    cleanupEndpoint(endpoint);
  });

  it('widens input to "both" for encoding "buffer" with writeDecode', async () => {
    // writeDecode is legal in both modes on this route: byte output and a
    // decoded byte-input convenience are independent substrate facts.
    const backend = await createZigptyBackend({ encoding: "buffer", writeDecode: true });
    const endpoint = backend.spawn(launch(["/bin/cat"]));
    expect(endpoint.native).toEqual({ input: "both", output: "bytes" });
    cleanupEndpoint(endpoint);
  });

  it("translates malformed launches into typed synchronous failures", async () => {
    const backend = await createZigptyBackend();
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

  it("rejects non-positive writeQueueBytes at acquisition time", async () => {
    await expect(createZigptyBackend({ writeQueueBytes: 0 })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});
