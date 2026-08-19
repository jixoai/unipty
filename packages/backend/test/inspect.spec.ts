/**
> Orthogonal intents (2026-08-20): inspection conformance — four report
 * statuses, protocol option, target prefilter matrix, resolved-only input
 * guard, entry-module isolation, and zero console output.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNIPTY_CORE_PROTOCOL_MAJOR } from "unipty";
import {
  inspectUniPtyBackend,
  resolveUniPtyBackend,
} from "../src/index.ts";
import {
  consumerFixtureDir,
  fixtureImports,
  resetFixtureImports,
} from "./setup.ts";

const from = consumerFixtureDir("consumer-single");

async function resolved(packageName: string) {
  const report = await resolveUniPtyBackend(packageName, { from });
  if (report.status !== "resolved") {
    throw new Error(`fixture ${packageName} failed to resolve: ${report.reason}`);
  }
  return report;
}

describe("inspectUniPtyBackend", () => {
  beforeEach(() => {
    resetFixtureImports();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports compatible with validated metadata for a matching fixture", async () => {
    const report = await inspectUniPtyBackend(await resolved("@fixture/good-a"));
    expect(report.status).toBe("compatible");
    if (report.status !== "compatible") {
      return;
    }
    expect(report.resolution.packageName).toBe("@fixture/good-a");
    expect(report.metadata.schema).toBe(1);
    expect(report.metadata.package.name).toBe("@fixture/good-a");
    expect(report.metadata.protocol.core).toContain(UNIPTY_CORE_PROTOCOL_MAJOR);
    expect(report.diagnostics).toEqual([]);
    // Inspection imports only the metadata module: the entry never evaluates.
    expect(fixtureImports()).toEqual([]);
  });

  it("reports metadata-missing for a package without the subpath", async () => {
    const report = await inspectUniPtyBackend(await resolved("@fixture/no-metadata"));
    expect(report.status).toBe("metadata-missing");
    expect(report.diagnostics[0]?.code).toBe("metadata-missing");
    expect(fixtureImports()).toEqual([]);
  });

  it("reports metadata-invalid for schema-invalid metadata with diagnostics", async () => {
    const report = await inspectUniPtyBackend(await resolved("@fixture/bad-metadata"));
    expect(report.status).toBe("metadata-invalid");
    const codes = report.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain("metadata-invalid");
    const messages = report.diagnostics.map((diagnostic) => diagnostic.message ?? "");
    expect(messages.some((message) => message.includes("schema"))).toBe(true);
    expect(messages.some((message) => message.includes("duplicate"))).toBe(true);
  });

  it("reports metadata-invalid when the metadata module fails to evaluate", async () => {
    const report = await inspectUniPtyBackend(await resolved("@fixture/metadata-throws"));
    expect(report.status).toBe("metadata-invalid");
    expect(report.diagnostics[0]?.code).toBe("metadata-import-failed");
  });

  it("reports incompatible when the protocol major is absent", async () => {
    const report = await inspectUniPtyBackend(
      await resolved("@fixture/incompatible-protocol"),
    );
    expect(report.status).toBe("incompatible");
    if (report.status !== "incompatible") {
      return;
    }
    expect(report.metadata.protocol.core).toEqual([99]);
    expect(report.diagnostics.map((d) => d.code)).toContain("protocol-core");
  });

  it("honors an explicit protocol option", async () => {
    const future = await inspectUniPtyBackend(await resolved("@fixture/good-a"), {
      protocol: 99,
    });
    expect(future.status).toBe("incompatible");
    const asDeclared = await inspectUniPtyBackend(
      await resolved("@fixture/incompatible-protocol"),
      { protocol: 99 },
    );
    expect(asDeclared.status).toBe("compatible");
  });

  it("prefilters targets by runtime", async () => {
    const bunOnly = await inspectUniPtyBackend(await resolved("@fixture/runtime-bun"));
    expect(bunOnly.status).toBe("incompatible");
    expect(bunOnly.status === "incompatible" ? bunOnly.diagnostics[0]?.code : "").toBe(
      "target-mismatch",
    );

    const multi = await inspectUniPtyBackend(await resolved("@fixture/multi-target"));
    expect(multi.status).toBe("incompatible");
  });

  it("prefilters targets by os, arch, and libc arrays", async () => {
    // Broad arrays include every current value.
    expect(
      (await inspectUniPtyBackend(await resolved("@fixture/os-broad"))).status,
    ).toBe("compatible");
    expect(
      (await inspectUniPtyBackend(await resolved("@fixture/arch-broad"))).status,
    ).toBe("compatible");

    // Never-matching arrays exclude every current value.
    expect(
      (await inspectUniPtyBackend(await resolved("@fixture/os-never"))).status,
    ).toBe("incompatible");
    expect(
      (await inspectUniPtyBackend(await resolved("@fixture/arch-never"))).status,
    ).toBe("incompatible");
    expect(
      (await inspectUniPtyBackend(await resolved("@fixture/libc-never"))).status,
    ).toBe("incompatible");

    // A libc-restricted Linux target matches only Linux+glibc hosts; the
    // expectation is derived from the actual host, never assumed.
    const libcReport = await inspectUniPtyBackend(
      await resolved("@fixture/libc-linux-glibc"),
    );
    let hostIsGlibcLinux = false;
    if (process.platform === "linux" && process.report !== undefined) {
      const header = (process.report.getReport() as { header?: Record<string, unknown> })
        .header;
      hostIsGlibcLinux = header !== undefined && "glibcVersionRuntime" in header;
    }
    expect(libcReport.status).toBe(hostIsGlibcLinux ? "compatible" : "incompatible");
  });

  it("throws invalid-argument for a non-resolved report", async () => {
    const unresolved = await resolveUniPtyBackend("@fixture/does-not-exist", { from });
    await expect(
      inspectUniPtyBackend(unresolved as never),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(inspectUniPtyBackend(null as never)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("writes no console output during inspection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await inspectUniPtyBackend(await resolved("@fixture/good-a"));
    await inspectUniPtyBackend(await resolved("@fixture/no-metadata"));
    await inspectUniPtyBackend(await resolved("@fixture/bad-metadata"));
    await inspectUniPtyBackend(await resolved("@fixture/runtime-bun"));
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
