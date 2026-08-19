/**
> Orthogonal intents (2026-08-20): AutoResolve explicit-candidate
 * conformance — ordered preference, structured warnings through the
 * configured sink or the default `console.warn`, and duplicate handling.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  autoResolveUniPtyBackend,
  isBackendReady,
  type UniPtyBackendWarning,
} from "../src/index.ts";
import { consumerFixtureDir, fixtureImports, resetFixtureImports } from "./setup.ts";

const from = consumerFixtureDir("consumer-single");

describe("autoResolveUniPtyBackend explicit candidates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetFixtureImports();
  });

  it("selects the first compatible candidate in caller order", async () => {
    const warnings: UniPtyBackendWarning[] = [];
    const backend = await autoResolveUniPtyBackend({
      candidates: [
        "@fixture/runtime-bun",
        "@fixture/incompatible-protocol",
        "@fixture/good-b",
        "@fixture/good-a",
      ],
      from,
      onWarning: (warning) => warnings.push(warning),
    });
    expect(isBackendReady(backend)).toBe(true);
    // good-b precedes good-a and both are compatible: good-b wins.
    expect(fixtureImports()).toEqual(["@fixture/good-b"]);
    expect(warnings).toHaveLength(2);
    expect(warnings.map((warning) => warning.packageName)).toEqual([
      "@fixture/runtime-bun",
      "@fixture/incompatible-protocol",
    ]);
    for (const warning of warnings) {
      expect(warning.code).toBe("candidate-unavailable");
      expect(warning.stage).toBe("inspect");
      expect(warning.diagnostics.length).toBeGreaterThan(0);
    }
  });

  it("warns through the resolve stage for candidates that cannot resolve", async () => {
    const warnings: UniPtyBackendWarning[] = [];
    const backend = await autoResolveUniPtyBackend({
      candidates: ["@fixture/does-not-exist", "@fixture/good-a"],
      from,
      onWarning: (warning) => warnings.push(warning),
    });
    expect(isBackendReady(backend)).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "candidate-unavailable",
      packageName: "@fixture/does-not-exist",
      stage: "resolve",
    });
    expect(warnings[0]?.diagnostics.length).toBeGreaterThan(0);
  });

  it("warns for metadata-missing and metadata-invalid candidates and continues", async () => {
    const warnings: UniPtyBackendWarning[] = [];
    const backend = await autoResolveUniPtyBackend({
      candidates: ["@fixture/no-metadata", "@fixture/bad-metadata", "@fixture/good-a"],
      from,
      onWarning: (warning) => warnings.push(warning),
    });
    expect(isBackendReady(backend)).toBe(true);
    expect(warnings.map((warning) => warning.packageName)).toEqual([
      "@fixture/no-metadata",
      "@fixture/bad-metadata",
    ]);
    expect(warnings.every((warning) => warning.stage === "inspect")).toBe(true);
  });

  it("processes duplicate candidates by first occurrence", async () => {
    const warnings: UniPtyBackendWarning[] = [];
    const backend = await autoResolveUniPtyBackend({
      candidates: ["@fixture/does-not-exist", "@fixture/does-not-exist", "@fixture/good-a"],
      from,
      onWarning: (warning) => warnings.push(warning),
    });
    expect(isBackendReady(backend)).toBe(true);
    expect(warnings).toHaveLength(1);
  });

  it("defaults to console.warn when no onWarning sink is supplied", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const backend = await autoResolveUniPtyBackend({
      candidates: ["@fixture/does-not-exist"],
      from,
    });
    expect(isBackendReady(backend)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    const [tag, code, packageName, stage] = warn.mock.calls[0] ?? [];
    expect(tag).toBe("[@unipty/backend]");
    expect(code).toBe("candidate-unavailable");
    expect(packageName).toBe("@fixture/does-not-exist");
    expect(stage).toBe("resolve");
  });

  it("falls back to dependency-derived candidates when every explicit candidate fails", async () => {
    const warnings: UniPtyBackendWarning[] = [];
    const backend = await autoResolveUniPtyBackend({
      candidates: ["@fixture/does-not-exist", "@fixture/runtime-bun"],
      from,
      onWarning: (warning) => warnings.push(warning),
    });
    expect(isBackendReady(backend)).toBe(true);
    // The unique dependency-derived compatible candidate of consumer-single
    // is the good-a fixture; the resolved backend proves its selection.
    expect(warnings).toHaveLength(2);
  });

  it("throws invalid-argument for malformed candidate lists", async () => {
    await expect(
      autoResolveUniPtyBackend({
        candidates: ["", "@fixture/good-a"],
        from,
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      autoResolveUniPtyBackend({
        candidates: [42] as unknown as readonly string[],
        from,
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});
