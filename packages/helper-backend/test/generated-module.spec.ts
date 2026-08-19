/**
> Orthogonal intents (2026-08-20): generated-module conformance — the emitted
 * source evaluates into one default manifest export, imports only metadata
 * during evaluation, and defers Backend entry imports to its loaders.
 */

import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { generateUniPtyBackendManifestModule } from "../src/index.ts";
import { CONSUMER_ROOT } from "./setup.ts";

const GENERATED_PATH = join(CONSUMER_ROOT, "generated.manifest.mjs");

interface EvaluationSummary {
  readonly entryCount: number;
  readonly packageNames: string[];
  readonly importedDuringEvaluation: string[];
  readonly loadedModuleKeys: string[];
  readonly importedAfterLoad: string[];
  readonly factoryType: string;
}

/** Evaluate the generated module in a fresh plain-Node subprocess. */
function evaluateGeneratedModule(): { summary: EvaluationSummary | null; stderr: string } {
  const probe = `
const generated = await import(process.argv[1]);
const manifest = generated.default;
if (manifest === undefined) throw new Error("generated module has no default export");
const importedDuringEvaluation = [...(globalThis.__uniptyFixtureImports ?? [])];
const entry = manifest.entries[0];
const loaded = await entry.load();
const summary = {
  entryCount: manifest.entries.length,
  packageNames: manifest.entries.map((e) => e.packageName),
  importedDuringEvaluation,
  loadedModuleKeys: Object.keys(loaded),
  importedAfterLoad: [...(globalThis.__uniptyFixtureImports ?? [])],
  factoryType: typeof loaded[entry.metadata.backend.factoryExport],
};
console.log(JSON.stringify(summary));
`;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", probe, pathToFileURL(GENERATED_PATH).href],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return { summary: null, stderr: result.stderr };
  }
  return {
    summary: JSON.parse(result.stdout.trim()) as EvaluationSummary,
    stderr: result.stderr,
  };
}

describe("generated manifest module", () => {
  it("evaluates to one default manifest export and defers Backend imports to loaders", async () => {
    const source = await generateUniPtyBackendManifestModule({
      candidates: ["@fixture/good-a", "@fixture/good-b"],
      from: CONSUMER_ROOT,
    });
    writeFileSync(GENERATED_PATH, source, "utf8");
    try {
      const { summary, stderr } = evaluateGeneratedModule();
      expect(stderr).toBe("");
      expect(summary).not.toBeNull();
      if (summary === null) {
        return;
      }
      // One default export carrying both validated entries.
      expect(summary.entryCount).toBe(2);
      expect(summary.packageNames).toEqual(["@fixture/good-a", "@fixture/good-b"]);
      // Evaluation imports metadata only: no Backend entry was touched.
      expect(summary.importedDuringEvaluation).toEqual([]);
      // The deferred loader imports the Backend entry and exposes the
      // declared factory export.
      expect(summary.importedAfterLoad).toEqual(["@fixture/good-a"]);
      expect(summary.factoryType).toBe("function");
      expect(summary.loadedModuleKeys).toContain("createBackend");
    } finally {
      rmSync(GENERATED_PATH, { force: true });
    }
  }, 30000);
});
