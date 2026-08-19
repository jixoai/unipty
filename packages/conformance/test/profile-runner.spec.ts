/**
 * End-to-end runner smoke test: executes the real CLI against the local
 * pipe-based mock backend and proves the harness produces a passing, valid
 * report. The mock can never establish native PTY support — real-backend
 * runs happen in CI after the official packages land.
 */

import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateConformanceReport, type ConformanceReport } from "../src/report.ts";
import { SCENARIO_NAMES } from "../src/profile/scenarios.ts";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

function runProfileCli(
  outPath: string,
  extraArgs: readonly string[] = [],
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["runners/run-profile.ts", "--backend", "mock", "--out", outPath, ...extraArgs],
      { cwd: PACKAGE_ROOT, timeout: 300000, maxBuffer: 32 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error !== null && error.code === undefined) {
          reject(error);
          return;
        }
        resolve({ code: typeof error?.code === "number" ? error.code : 0, stderr });
      },
    );
  });
}

describe("conformance runner CLI (mock backend)", () => {
  it("produces a passing, valid conformance report end to end", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "unipty-profile-"));
    const outPath = join(workDir, "mock-report.json");
    try {
      const { code, stderr } = await runProfileCli(outPath);
      expect(stderr).toContain("[@unipty/conformance]");
      expect(code).toBe(0);

      const report: unknown = JSON.parse(readFileSync(outPath, "utf8"));
      const validation = validateConformanceReport(report);
      expect(validation.ok).toBe(true);
      if (!validation.ok) throw new Error(validation.errors.join("; "));
      const typed = validation.report as ConformanceReport;
      expect(typed.summary.total).toBe(SCENARIO_NAMES.length);
      expect(typed.summary.failed).toBe(0);
      expect(typed.backend.packageName).toBe("@unipty/conformance/mock-backend");
      expect(typed.backend.backendId).toBe("mock-pipe-backend");
      expect(typed.core.packageName).toBe("unipty");
      expect(["node", "bun", "deno"]).toContain(typed.runtime.name);
      expect(typed.scenarios.map((entry) => entry.scenario)).toEqual(SCENARIO_NAMES);

      // The pipe-based mock records resize non-observability as an explicit
      // skip; everything else must pass.
      expect(typed.summary.skipped).toBe(1);
      const skipped = typed.scenarios.find((entry) => entry.status === "skip");
      expect(skipped?.scenario).toBe("resize/accepted-and-observed");
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }, 360000);

  it("refuses to emit evidence while a recorded skip keeps the gate closed", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "unipty-profile-evidence-"));
    const outPath = join(workDir, "mock-report.json");
    const evidencePath = join(workDir, "evidence.json");
    try {
      const { code, stderr } = await runProfileCli(outPath, [
        "--emit-evidence",
        "--evidence-out",
        evidencePath,
      ]);
      expect(stderr).toContain("no Verification Evidence emitted");
      expect(code).toBe(2);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }, 360000);

  it("rejects an unknown backend selection", async () => {
    const result = await new Promise<{ code: number; stderr: string }>((resolve, reject) => {
      execFile(
        process.execPath,
        ["runners/run-profile.ts", "--backend", "nope"],
        { cwd: PACKAGE_ROOT, timeout: 30000 },
        (error, _stdout, stderr) => {
          if (error !== null && error.code === undefined) {
            reject(error);
            return;
          }
          resolve({ code: typeof error?.code === "number" ? error.code : 0, stderr });
        },
      );
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown backend");
  });
});
