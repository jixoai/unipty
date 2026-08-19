/**
 * Verification Evidence gating tests (task 7.1): successful jobs emit one
 * valid record; failed/skipped/partial/malformed jobs emit none.
 */

import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emitVerificationEvidence, validateVerificationEvidence } from "../src/evidence.ts";
import {
  buildConformanceReport,
  type ConformanceReport,
  type ScenarioResult,
} from "../src/report.ts";

const PASS_A: ScenarioResult = {
  scenario: "seam/synchronous-spawn",
  status: "pass",
  durationMs: 5,
};
const PASS_B: ScenarioResult = {
  scenario: "launch/structured-argv",
  status: "pass",
  durationMs: 7,
};

function sampleReport(
  scenarios: readonly ScenarioResult[],
  tuple: { os: string; arch: string; libc?: string } = { os: "darwin", arch: "arm64" },
): ConformanceReport {
  return buildConformanceReport({
    suite: { id: "@unipty/conformance", version: "0.1.0" },
    backend: {
      packageName: "@unipty/backend-node-pty",
      packageVersion: "0.1.0",
      backendId: "node-pty",
    },
    core: { packageName: "unipty", packageVersion: "0.1.0", protocolMajor: 1 },
    runtime: { name: "node", version: "22.20.0" },
    tuple,
    commit: "0123456789abcdef0123456789abcdef01234567",
    startedAt: "2026-08-20T10:00:00.000Z",
    finishedAt: "2026-08-20T10:01:00.000Z",
    scenarios,
  });
}

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "unipty-evidence-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("emitVerificationEvidence", () => {
  it("emits one complete record for a fully passing suite", () => {
    const record = emitVerificationEvidence(sampleReport([PASS_A, PASS_B]), {
      now: new Date("2026-08-20T10:02:00.000Z"),
      reportRef: "reports/node-pty-report.json",
    });
    expect(record).not.toBeNull();
    expect(record).toMatchObject({
      evidenceVersion: 1,
      backend: {
        packageName: "@unipty/backend-node-pty",
        packageVersion: "0.1.0",
        backendId: "node-pty",
      },
      core: { packageName: "unipty", packageVersion: "0.1.0", protocolMajor: 1 },
      runtime: { name: "node", version: "22.20.0" },
      tuple: { os: "darwin", arch: "arm64" },
      suite: { id: "@unipty/conformance", version: "0.1.0" },
      commit: "0123456789abcdef0123456789abcdef01234567",
      verifiedAt: "2026-08-20T10:02:00.000Z",
      reportRef: "reports/node-pty-report.json",
    });
  });

  it("emits nothing for a failed suite", () => {
    const failed: ScenarioResult = { scenario: "x", status: "fail", durationMs: 1, error: "boom" };
    const out = join(workDir, "evidence.json");
    expect(
      emitVerificationEvidence(sampleReport([PASS_A, failed]), { outputPath: out }),
    ).toBeNull();
    expect(existsSync(out)).toBe(false);
  });

  it("emits nothing for a skipped scenario (skipped is not a complete pass)", () => {
    const skipped: ScenarioResult = {
      scenario: "resize/accepted-and-observed",
      status: "skip",
      durationMs: 1,
      note: "unsupported",
    };
    expect(emitVerificationEvidence(sampleReport([PASS_A, skipped]))).toBeNull();
  });

  it("emits nothing for an empty scenario list (partial/missing job)", () => {
    expect(emitVerificationEvidence(sampleReport([]))).toBeNull();
  });

  it("emits nothing for malformed identity (partial identity never writes)", () => {
    const report = sampleReport([PASS_A]);
    (report as unknown as Record<string, unknown>).backend = {
      packageName: "@unipty/backend-node-pty",
    };
    const out = join(workDir, "evidence.json");
    expect(emitVerificationEvidence(report, { outputPath: out })).toBeNull();
    expect(existsSync(out)).toBe(false);
  });

  it("writes the record file only when the gate is met", () => {
    const out = join(workDir, "nested", "evidence.json");
    const record = emitVerificationEvidence(sampleReport([PASS_A]), { outputPath: out });
    expect(record).not.toBeNull();
    expect(existsSync(out)).toBe(true);
    expect(validateVerificationEvidence(record).ok).toBe(true);
  });

  it("requires an explicit libc for Linux tuples", () => {
    const linux = { os: "linux", arch: "x64" };
    expect(emitVerificationEvidence(sampleReport([PASS_A], linux))).toBeNull();
    const withLibc = emitVerificationEvidence(
      sampleReport([PASS_A], { os: "linux", arch: "x64", libc: "glibc" }),
    );
    expect(withLibc?.tuple).toEqual({ os: "linux", arch: "x64", libc: "glibc" });
  });
});

describe("validateVerificationEvidence", () => {
  it("rejects wrong commits and foreign suite identities", () => {
    const record = emitVerificationEvidence(sampleReport([PASS_A]));
    expect(record).not.toBeNull();
    const wrongCommit = validateVerificationEvidence(record, {
      commit: "ffffffffffffffffffffffffffffffffffffffff",
    });
    expect(wrongCommit.ok).toBe(false);
    if (!wrongCommit.ok) expect(wrongCommit.errors.join(" ")).toContain("commit");
    const wrongSuite = validateVerificationEvidence(record, { suiteId: "another" });
    expect(wrongSuite.ok).toBe(false);
  });

  it("rejects a Linux record without libc", () => {
    const record = emitVerificationEvidence(sampleReport([PASS_A]));
    expect(record).not.toBeNull();
    const linuxish = { ...record, tuple: { os: "linux", arch: "x64" } };
    const validation = validateVerificationEvidence(linuxish);
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.errors.join(" ")).toContain("libc");
  });
});
