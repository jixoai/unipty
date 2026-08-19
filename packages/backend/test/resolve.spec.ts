/**
> Orthogonal intents (2026-08-20): pure resolution conformance —
 * resolved/unresolved discriminants, metadata-subpath discovery, structured
 * diagnostics, caller-rooted `from`, and zero side effects.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UniPtyError } from "unipty";
import { resolveUniPtyBackend } from "../src/index.ts";
import { consumerFixtureDir, fixtureImports, resetFixtureImports } from "./setup.ts";

const from = consumerFixtureDir("consumer-single");

describe("resolveUniPtyBackend", () => {
  beforeEach(() => {
    resetFixtureImports();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves an installed fixture package with its metadata subpath", async () => {
    const report = await resolveUniPtyBackend("@fixture/good-a", { from });
    expect(report.status).toBe("resolved");
    if (report.status !== "resolved") {
      return;
    }
    expect(report.packageName).toBe("@fixture/good-a");
    expect(report.packageUrl).toMatch(/^file:\/\//);
    expect(report.packageUrl).toContain("good-a/index.js");
    expect(report.metadataUrl).toMatch(/^file:\/\//);
    expect(report.metadataUrl).toContain("unipty.metadata.js");
    expect(report.diagnostics).toEqual([]);
    expect(fixtureImports()).toEqual([]);
  });

  it("resolves a package that lacks the metadata subpath without metadataUrl", async () => {
    const report = await resolveUniPtyBackend("@fixture/no-metadata", { from });
    expect(report.status).toBe("resolved");
    if (report.status !== "resolved") {
      return;
    }
    expect(report.metadataUrl).toBeUndefined();
    expect(report.diagnostics.length).toBe(1);
    expect(report.diagnostics[0]?.code).toBe("metadata-subpath-unavailable");
  });

  it("reports a missing package as unresolved with reason missing", async () => {
    const report = await resolveUniPtyBackend("@fixture/does-not-exist", { from });
    expect(report.status).toBe("unresolved");
    if (report.status !== "unresolved") {
      return;
    }
    expect(report.reason).toBe("missing");
    expect(report.packageName).toBe("@fixture/does-not-exist");
    expect(report.diagnostics.length).toBeGreaterThan(0);
    expect(typeof report.diagnostics[0]?.code).toBe("string");
  });

  it("reports an import-only exports package as unresolved with reason invalid", async () => {
    const report = await resolveUniPtyBackend("@fixture/esm-exports-only", { from });
    expect(report.status).toBe("unresolved");
    if (report.status !== "unresolved") {
      return;
    }
    expect(report.reason).toBe("invalid");
    expect(report.diagnostics[0]?.code).toBe("ERR_PACKAGE_PATH_NOT_EXPORTED");
  });

  it("throws invalid-argument when from is missing", async () => {
    await expect(
      resolveUniPtyBackend("@fixture/good-a", {} as { from: URL | string }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      resolveUniPtyBackend("@fixture/good-a", undefined as unknown as { from: URL | string }),
    ).rejects.toBeInstanceOf(UniPtyError);
  });

  it("throws invalid-argument for an empty package name", async () => {
    await expect(resolveUniPtyBackend("", { from })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(
      resolveUniPtyBackend("   " as string, { from }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("accepts file URL strings and URL objects as from", async () => {
    const asUrlString = `file://${from}/`;
    const report = await resolveUniPtyBackend("@fixture/good-a", {
      from: asUrlString,
    });
    expect(report.status).toBe("resolved");
    const asUrlObject = new URL(asUrlString);
    const second = await resolveUniPtyBackend("@fixture/good-a", {
      from: asUrlObject,
    });
    expect(second.status).toBe("resolved");
  });

  it("writes no console output during pure resolution", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await resolveUniPtyBackend("@fixture/good-a", { from });
    await resolveUniPtyBackend("@fixture/no-metadata", { from });
    await resolveUniPtyBackend("@fixture/does-not-exist", { from });
    await resolveUniPtyBackend("@fixture/esm-exports-only", { from });
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
