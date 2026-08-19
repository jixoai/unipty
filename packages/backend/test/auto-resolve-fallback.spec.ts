/**
> Orthogonal intents (2026-08-20): AutoResolve fallback conformance —
 * dependency-derived candidates in deterministic order, unique-selection
 * ambiguity, zero-candidate aggregation, and trustworthy-base inference.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  autoResolveUniPtyBackend,
  isBackendReady,
  UniPtyBackendSelectionError,
} from "../src/index.ts";
import {
  consumerFixtureDir,
  fixtureImports,
  resetFixtureImports,
} from "./setup.ts";

describe("autoResolveUniPtyBackend fallback derivation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetFixtureImports();
  });

  it("derives the unique compatible candidate from consumer dependencies", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const backend = await autoResolveUniPtyBackend({
      from: consumerFixtureDir("consumer-single"),
    });
    expect(isBackendReady(backend)).toBe(true);
    expect(fixtureImports()).toEqual(["@fixture/good-a"]);
    // No configured candidates existed, so no warnings were delivered.
    expect(warn).not.toHaveBeenCalled();
  });

  it("rejects with ambiguous when multiple dependencies are compatible", async () => {
    // consumer-ambiguous lists good-b before good-a; key order must never
    // imply priority, so the sorted fallback set stays ambiguous.
    const error = await autoResolveUniPtyBackend({
      from: consumerFixtureDir("consumer-ambiguous"),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UniPtyBackendSelectionError);
    const selection = error as UniPtyBackendSelectionError;
    expect(selection.code).toBe("ambiguous");
    expect([...selection.candidates].sort()).toEqual([
      "@fixture/good-a",
      "@fixture/good-b",
    ]);
    // Nothing was initialized during ambiguity.
    expect(fixtureImports()).toEqual([]);
  });

  it("rejects with no-compatible-backend when no dependency qualifies", async () => {
    const error = await autoResolveUniPtyBackend({
      from: consumerFixtureDir("consumer-empty"),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UniPtyBackendSelectionError);
    expect((error as UniPtyBackendSelectionError).code).toBe("no-compatible-backend");
    expect(
      (error as UniPtyBackendSelectionError).diagnostics.length,
    ).toBeGreaterThan(0);
  });

  it("aggregates per-candidate diagnostics when fallback candidates all fail", async () => {
    const error = await autoResolveUniPtyBackend({
      from: consumerFixtureDir("consumer-bad"),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UniPtyBackendSelectionError);
    const selection = error as UniPtyBackendSelectionError;
    expect(selection.code).toBe("no-compatible-backend");
    const codes = selection.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain("fallback.metadata-missing");
    expect(codes).toContain("fallback.incompatible");
  });

  it("infers a trustworthy base from the working directory when from is omitted", async () => {
    const previousCwd = process.cwd();
    process.chdir(consumerFixtureDir("consumer-single"));
    try {
      const backend = await autoResolveUniPtyBackend();
      expect(isBackendReady(backend)).toBe(true);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("throws invalid-argument when from is omitted and cwd is not a project context", async () => {
    const previousCwd = process.cwd();
    process.chdir("/");
    try {
      await expect(autoResolveUniPtyBackend()).rejects.toMatchObject({
        code: "invalid-argument",
      });
    } finally {
      process.chdir(previousCwd);
    }
  });
});
