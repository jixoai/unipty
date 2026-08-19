/**
> Orthogonal intents (2026-08-20): conformance report format and identity
> validation (task 4.4).
>
> The report records suite identity/version, package identities, runtime
> version, normalized tuple, tested commit, and scenario outcomes. It NEVER
> asserts verification status itself: Verification Evidence (src/evidence.ts)
> is a separate, positively gated record.
 */

export const CONFORMANCE_REPORT_VERSION = 1;

/** Stable identity of this private conformance suite. */
export const CONFORMANCE_SUITE_ID = "@unipty/conformance";

/** The runtime names the contract distinguishes. */
export type ConformanceRuntimeName = "node" | "bun" | "deno";

/** Runtime identity recorded in reports and evidence. */
export interface ConformanceRuntimeInfo {
  readonly name: ConformanceRuntimeName;
  readonly version: string;
}

/**
 * Normalized platform tuple using Node/npm vocabulary: `os` follows
 * `process.platform`/npm `os`, `arch` follows `process.arch`/npm `cpu`, and
 * `libc` is an independent native-library dimension required for Linux
 * native evidence and omitted elsewhere unless it changes compatibility.
 */
export interface ConformanceTuple {
  readonly os: string;
  readonly arch: string;
  readonly libc?: string;
}

/** One scenario outcome. `note` records law-satisfying accommodations. */
export interface ScenarioResult {
  readonly scenario: string;
  readonly status: "pass" | "fail" | "skip";
  readonly durationMs: number;
  readonly error?: string;
  readonly note?: string;
}

/** Report summary; derived from and consistent with `scenarios`. */
export interface ConformanceReportSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

/** The conformance report emitted for one Backend on one exact tuple. */
export interface ConformanceReport {
  readonly reportVersion: 1;
  readonly suite: { readonly id: string; readonly version: string };
  readonly backend: {
    readonly packageName: string;
    readonly packageVersion: string;
    readonly backendId: string;
  };
  readonly core: {
    readonly packageName: "unipty";
    readonly packageVersion: string;
    readonly protocolMajor: number;
  };
  readonly runtime: ConformanceRuntimeInfo;
  readonly tuple: ConformanceTuple;
  readonly commit: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly scenarios: readonly ScenarioResult[];
  readonly summary: ConformanceReportSummary;
}

/** Derive the summary from scenario results. */
export function summarizeScenarios(scenarios: readonly ScenarioResult[]): ConformanceReportSummary {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const result of scenarios) {
    if (result.status === "pass") passed += 1;
    else if (result.status === "fail") failed += 1;
    else skipped += 1;
  }
  return { total: scenarios.length, passed, failed, skipped };
}

/** Input for {@link buildConformanceReport}. */
export interface ConformanceReportInput {
  readonly suite: { readonly id: string; readonly version: string };
  readonly backend: {
    readonly packageName: string;
    readonly packageVersion: string;
    readonly backendId: string;
  };
  readonly core: {
    readonly packageName: "unipty";
    readonly packageVersion: string;
    readonly protocolMajor: number;
  };
  readonly runtime: ConformanceRuntimeInfo;
  readonly tuple: ConformanceTuple;
  readonly commit: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly scenarios: readonly ScenarioResult[];
}

/** Assemble a report with its derived summary. */
export function buildConformanceReport(input: ConformanceReportInput): ConformanceReport {
  return {
    reportVersion: CONFORMANCE_REPORT_VERSION,
    ...input,
    scenarios: [...input.scenarios],
    summary: summarizeScenarios(input.scenarios),
  };
}

export type ReportValidation =
  | { readonly ok: true; readonly report: ConformanceReport }
  | { readonly ok: false; readonly errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isIsoTimestamp(value: unknown): boolean {
  if (!nonEmptyString(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/;

/**
 * Validate a conformance report value. Rejects absent or malformed identity
 * fields, inconsistent summaries, and malformed scenario entries. Unknown
 * extra keys are tolerated for forward compatibility.
 */
export function validateConformanceReport(value: unknown): ReportValidation {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, errors: ["report must be a JSON object"] };
  }
  if (value.reportVersion !== CONFORMANCE_REPORT_VERSION) {
    errors.push(`reportVersion must be ${CONFORMANCE_REPORT_VERSION}`);
  }
  const suite = value.suite;
  if (!isPlainObject(suite)) {
    errors.push("suite must be an object");
  } else {
    if (suite.id !== CONFORMANCE_SUITE_ID)
      errors.push(`suite.id must be "${CONFORMANCE_SUITE_ID}"`);
    if (!nonEmptyString(suite.version)) errors.push("suite.version must be a non-empty string");
  }
  const backend = value.backend;
  if (!isPlainObject(backend)) {
    errors.push("backend must be an object");
  } else {
    if (!nonEmptyString(backend.packageName))
      errors.push("backend.packageName must be a non-empty string");
    if (!nonEmptyString(backend.packageVersion)) {
      errors.push("backend.packageVersion must be a non-empty string");
    }
    if (!nonEmptyString(backend.backendId))
      errors.push("backend.backendId must be a non-empty string");
  }
  const core = value.core;
  if (!isPlainObject(core)) {
    errors.push("core must be an object");
  } else {
    if (core.packageName !== "unipty") errors.push('core.packageName must be "unipty"');
    if (!nonEmptyString(core.packageVersion))
      errors.push("core.packageVersion must be a non-empty string");
    const protocolMajor = core.protocolMajor;
    if (
      typeof protocolMajor !== "number" ||
      !Number.isInteger(protocolMajor) ||
      protocolMajor <= 0
    ) {
      errors.push("core.protocolMajor must be a positive integer");
    }
  }
  const runtime = value.runtime;
  if (!isPlainObject(runtime)) {
    errors.push("runtime must be an object");
  } else {
    if (runtime.name !== "node" && runtime.name !== "bun" && runtime.name !== "deno") {
      errors.push('runtime.name must be "node", "bun", or "deno"');
    }
    if (!nonEmptyString(runtime.version)) errors.push("runtime.version must be a non-empty string");
  }
  const tuple = value.tuple;
  if (!isPlainObject(tuple)) {
    errors.push("tuple must be an object");
  } else {
    if (!nonEmptyString(tuple.os)) errors.push("tuple.os must be a non-empty string");
    if (!nonEmptyString(tuple.arch)) errors.push("tuple.arch must be a non-empty string");
    if (tuple.libc !== undefined && !nonEmptyString(tuple.libc)) {
      errors.push("tuple.libc, when present, must be a non-empty string");
    }
  }
  if (typeof value.commit !== "string" || !COMMIT_PATTERN.test(value.commit)) {
    errors.push("commit must be a 7-40 character lowercase hex git commit");
  }
  if (!isIsoTimestamp(value.startedAt)) errors.push("startedAt must be an ISO-8601 timestamp");
  if (!isIsoTimestamp(value.finishedAt)) errors.push("finishedAt must be an ISO-8601 timestamp");
  if (isIsoTimestamp(value.startedAt) && isIsoTimestamp(value.finishedAt)) {
    if (Date.parse(value.finishedAt as string) < Date.parse(value.startedAt as string)) {
      errors.push("finishedAt must not precede startedAt");
    }
  }
  const scenarios = value.scenarios;
  if (!Array.isArray(scenarios)) {
    errors.push("scenarios must be an array");
  } else {
    scenarios.forEach((entry: unknown, index: number) => {
      if (!isPlainObject(entry)) {
        errors.push(`scenarios[${index}] must be an object`);
        return;
      }
      if (!nonEmptyString(entry.scenario))
        errors.push(`scenarios[${index}].scenario must be a non-empty string`);
      if (entry.status !== "pass" && entry.status !== "fail" && entry.status !== "skip") {
        errors.push(`scenarios[${index}].status must be "pass", "fail", or "skip"`);
      }
      const durationMs = entry.durationMs;
      if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
        errors.push(`scenarios[${index}].durationMs must be a non-negative finite number`);
      }
      if (entry.error !== undefined && typeof entry.error !== "string") {
        errors.push(`scenarios[${index}].error, when present, must be a string`);
      }
      if (entry.note !== undefined && typeof entry.note !== "string") {
        errors.push(`scenarios[${index}].note, when present, must be a string`);
      }
    });
  }
  const summary = value.summary;
  if (!isPlainObject(summary)) {
    errors.push("summary must be an object");
  } else if (Array.isArray(scenarios)) {
    const expected = summarizeScenarios(scenarios as ScenarioResult[]);
    for (const key of ["total", "passed", "failed", "skipped"] as const) {
      if (summary[key] !== expected[key]) {
        errors.push(`summary.${key} must be ${expected[key]} (derived from scenarios)`);
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, report: value as unknown as ConformanceReport };
}
