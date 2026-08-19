/**
> Orthogonal intents (2026-08-20): runtime analysis and the ready-Backend
 * structural check.
 */

import { describe, expect, it } from "vitest";
import { analyzeRuntime, isBackendReady } from "../src/index.ts";

describe("analyzeRuntime", () => {
  it("reports the host Node runtime in normalized npm vocabulary", () => {
    const env = analyzeRuntime();
    // These tests execute under the vitest Node environment.
    expect(env.runtime).toBe("node");
    expect(env.version).toBe(process.versions.node);
    expect(env.os).toBe(process.platform);
    expect(env.arch).toBe(process.arch);
    if (env.os !== "linux") {
      expect(env.libc).toBeUndefined();
    }
  });
});

describe("isBackendReady", () => {
  it("accepts an object with spawn and dispose functions", () => {
    const backend = {
      spawn() {
        throw new Error("not spawned in tests");
      },
      async dispose() {},
    };
    expect(isBackendReady(backend)).toBe(true);
  });

  it("rejects values missing either function", () => {
    expect(isBackendReady(null)).toBe(false);
    expect(isBackendReady(undefined)).toBe(false);
    expect(isBackendReady({})).toBe(false);
    expect(isBackendReady({ spawn() {} })).toBe(false);
    expect(isBackendReady({ dispose() {} })).toBe(false);
    expect(isBackendReady({ spawn: 1, dispose() {} })).toBe(false);
    expect(isBackendReady(() => {})).toBe(false);
  });
});
