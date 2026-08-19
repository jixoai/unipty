/**
> Orthogonal intents (2026-08-20): selected-candidate initialization
 * conformance — terminal structured failures for every stage, preserved
 * inspection and cause, and no silent candidate failover.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  autoResolveUniPtyBackend,
  type UniPtyBackendInitializationError,
  type UniPtyBackendMetadata,
} from "../src/index.ts";
import { consumerFixtureDir, fixtureImports, resetFixtureImports } from "./setup.ts";

const from = consumerFixtureDir("consumer-single");

/** Structural view of the compatible branch of `BackendInspectReport`. */
interface CompatibleInspection {
  readonly status: "compatible";
  readonly metadata: UniPtyBackendMetadata;
  readonly resolution: { readonly packageName: string; readonly packageUrl: string };
}

function asInitializationError(error: unknown): UniPtyBackendInitializationError {
  expect(error).toBeInstanceOf(Error);
  const candidate = error as UniPtyBackendInitializationError;
  expect(candidate.code).toBe("backend-initialization");
  return candidate;
}

describe("autoResolveUniPtyBackend selected-candidate failures", () => {
  afterEach(() => {
    resetFixtureImports();
  });

  it("rejects with stage import when the selected entry fails to import", async () => {
    const error = asInitializationError(
      await autoResolveUniPtyBackend({
        candidates: ["@fixture/import-fails", "@fixture/good-a"],
        from,
      }).catch((caught: unknown) => caught),
    );
    expect(error.stage).toBe("import");
    expect(error.packageName).toBe("@fixture/import-fails");
    expect((error.cause as Error).message).toContain("fixture backend entry failed to import");
    const inspection = error.inspection as unknown as CompatibleInspection;
    expect(inspection.status).toBe("compatible");
    expect(inspection.metadata.package.name).toBe("@fixture/import-fails");
    // The failure is terminal: the lower-priority candidate never imports.
    expect(fixtureImports()).not.toContain("@fixture/good-a");
  });

  it("rejects with stage factory-export when the declared export is absent", async () => {
    const error = asInitializationError(
      await autoResolveUniPtyBackend({
        candidates: ["@fixture/no-factory-export"],
        from,
      }).catch((caught: unknown) => caught),
    );
    expect(error.stage).toBe("factory-export");
    expect(error.packageName).toBe("@fixture/no-factory-export");
    const inspection = error.inspection as unknown as CompatibleInspection;
    expect(inspection.metadata.backend.factoryExport).toBe("createBackend");
    expect(fixtureImports()).toEqual(["@fixture/no-factory-export"]);
  });

  it("rejects with stage factory-call when the factory rejects", async () => {
    const error = asInitializationError(
      await autoResolveUniPtyBackend({
        candidates: ["@fixture/factory-throws", "@fixture/good-a"],
        from,
      }).catch((caught: unknown) => caught),
    );
    expect(error.stage).toBe("factory-call");
    expect((error.cause as Error).message).toContain("fixture factory exploded");
    expect(fixtureImports()).toEqual(["@fixture/factory-throws"]);
  });

  it("rejects with stage ready when the factory result is not a ready Backend", async () => {
    const error = asInitializationError(
      await autoResolveUniPtyBackend({
        candidates: ["@fixture/not-ready"],
        from,
      }).catch((caught: unknown) => caught),
    );
    expect(error.stage).toBe("ready");
    expect(error.packageName).toBe("@fixture/not-ready");
    expect(error.inspection.resolution.packageUrl).toContain("not-ready");
  });

  it("preserves the selected package identity and inspection across stages", async () => {
    for (const candidate of [
      "@fixture/import-fails",
      "@fixture/no-factory-export",
      "@fixture/factory-throws",
      "@fixture/not-ready",
    ]) {
      const error = asInitializationError(
        await autoResolveUniPtyBackend({ candidates: [candidate], from }).catch(
          (caught: unknown) => caught,
        ),
      );
      expect(error.packageName).toBe(candidate);
      expect(error.inspection.status).toBe("compatible");
      expect(error.inspection.resolution.packageName).toBe(candidate);
      expect(error.message).toContain(candidate);
    }
  });
});
