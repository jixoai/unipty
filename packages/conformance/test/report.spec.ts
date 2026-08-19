/**
 * Conformance report format and identity validation tests (task 4.4):
 * schema fixtures reject absent or malformed required identity fields.
 */

import { describe, expect, it } from "vitest";
import {
  buildConformanceReport,
  validateConformanceReport,
  type ConformanceReport,
  type ScenarioResult,
} from "../src/report.ts";

const BASE = {
  suite: { id: "@unipty/conformance", version: "0.1.0" },
  backend: {
    packageName: "@unipty/backend-node-pty",
    packageVersion: "0.1.0",
    backendId: "node-pty",
  },
  core: { packageName: "unipty" as const, packageVersion: "0.1.0", protocolMajor: 1 },
  runtime: { name: "node" as const, version: "22.20.0" },
  tuple: { os: "darwin", arch: "arm64" },
  commit: "0123456789abcdef0123456789abcdef01234567",
  startedAt: "2026-08-20T10:00:00.000Z",
  finishedAt: "2026-08-20T10:00:42.000Z",
};

const PASS: ScenarioResult = { scenario: "seam/synchronous-spawn", status: "pass", durationMs: 12 };
const FAIL: ScenarioResult = {
  scenario: "stream/bytes-fidelity",
  status: "fail",
  durationMs: 5,
  error: "mismatch",
};

function sampleReport(scenarios: readonly ScenarioResult[] = [PASS]): ConformanceReport {
  return buildConformanceReport({ ...BASE, scenarios });
}

function errorsOf(value: unknown): string[] {
  const validation = validateConformanceReport(value);
  expect(validation.ok).toBe(false);
  if (!validation.ok) return validation.errors;
  throw new Error("expected validation failure");
}

function mutate(
  report: ConformanceReport,
  patch: (draft: Record<string, unknown>) => void,
): unknown {
  const draft = structuredClone(report) as unknown as Record<string, unknown>;
  patch(draft);
  return draft;
}

describe("validateConformanceReport", () => {
  it("accepts a complete, consistent report", () => {
    const validation = validateConformanceReport(sampleReport());
    expect(validation.ok).toBe(true);
  });

  it("rejects non-object values", () => {
    expect(errorsOf(null)[0]).toContain("must be a JSON object");
    expect(errorsOf("nope")[0]).toContain("must be a JSON object");
  });

  it("rejects a wrong reportVersion", () => {
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.reportVersion = 2;
        }),
      )[0],
    ).toContain("reportVersion");
  });

  it("rejects a foreign suite identity", () => {
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.suite = { id: "other-suite", version: "1.0.0" };
        }),
      )[0],
    ).toContain("suite.id");
  });

  it("rejects absent suite version", () => {
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.suite = { id: "@unipty/conformance" };
        }),
      )[0],
    ).toContain("suite.version");
  });

  it("rejects missing backend identity fields", () => {
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.backend = { packageName: "", packageVersion: "0.1.0", backendId: "x" };
        }),
      )[0],
    ).toContain("backend.packageName");
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          delete d.backend;
        }),
      )[0],
    ).toContain("backend must be an object");
  });

  it("rejects a wrong core package or protocol major", () => {
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.core = { ...BASE.core, packageName: "other" };
        }),
      )[0],
    ).toContain("core.packageName");
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.core = { ...BASE.core, protocolMajor: 0 };
        }),
      )[0],
    ).toContain("protocolMajor");
  });

  it("rejects unknown runtime names and empty versions", () => {
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.runtime = { name: "quickjs", version: "1" };
        }),
      )[0],
    ).toContain("runtime.name");
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.runtime = { name: "node", version: "" };
        }),
      )[0],
    ).toContain("runtime.version");
  });

  it("rejects malformed tuples", () => {
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.tuple = { os: "", arch: "arm64" };
        }),
      )[0],
    ).toContain("tuple.os");
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.tuple = { os: "darwin", arch: "arm64", libc: "" };
        }),
      )[0],
    ).toContain("tuple.libc");
  });

  it("rejects malformed commits", () => {
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.commit = "HEAD";
        }),
      )[0],
    ).toContain("commit");
  });

  it("rejects non-ISO timestamps and reversed time bounds", () => {
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.startedAt = "yesterday";
        }),
      )[0],
    ).toContain("startedAt");
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          d.startedAt = "2026-08-20T10:00:43.000Z";
        }),
      )[0],
    ).toContain("finishedAt must not precede startedAt");
  });

  it("rejects malformed scenario entries and inconsistent summaries", () => {
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          (d.scenarios as unknown[])[0] = { scenario: "x", status: "error", durationMs: 1 };
        }),
      )[0],
    ).toContain("status");
    expect(
      errorsOf(
        mutate(sampleReport(), (d) => {
          delete d.scenarios;
        }),
      )[0],
    ).toContain("scenarios must be an array");
    const inconsistent = sampleReport([PASS, FAIL]);
    expect(
      errorsOf(
        mutate(inconsistent, (d) => {
          d.summary = { total: 2, passed: 2, failed: 0, skipped: 0 };
        }),
      )[0],
    ).toContain("summary");
  });

  it("derives a consistent summary from mixed outcomes", () => {
    const skip: ScenarioResult = {
      scenario: "resize/accepted-and-observed",
      status: "skip",
      durationMs: 3,
      note: "unsupported",
    };
    const report = sampleReport([PASS, FAIL, skip]);
    expect(report.summary).toEqual({ total: 3, passed: 1, failed: 1, skipped: 1 });
    expect(validateConformanceReport(report).ok).toBe(true);
  });
});
