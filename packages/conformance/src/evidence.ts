/**
> Orthogonal intents (2026-08-20): positive Verification Evidence schema and
> writer (task 7.1).
>
> Evidence is positive and version-exact: one record is emitted only after
> the COMPLETE public conformance suite passes on an exact package / runtime /
> platform / suite / commit identity. Failed, cancelled, skipped, partial, or
> missing jobs emit nothing and never create a permanent unsupported claim.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  validateConformanceReport,
  type ConformanceReport,
  type ConformanceRuntimeInfo,
  type ConformanceTuple,
} from "./report.ts";

export const EVIDENCE_VERSION = 1;

/** One Verification Evidence record. Key order below is the canonical order. */
export interface VerificationEvidence {
  readonly evidenceVersion: 1;
  readonly backend: {
    readonly packageName: string;
    readonly packageVersion: string;
    readonly backendId: string;
  };
  readonly core: {
    readonly packageName: string;
    readonly packageVersion: string;
    readonly protocolMajor: number;
  };
  readonly runtime: ConformanceRuntimeInfo;
  readonly tuple: ConformanceTuple;
  readonly suite: { readonly id: string; readonly version: string };
  readonly commit: string;
  readonly verifiedAt: string;
  readonly reportRef?: string;
}

/** Options for {@link emitVerificationEvidence}. */
export interface EvidenceEmitOptions {
  /** When set, the gated record is written to this path. */
  readonly outputPath?: string;
  /** Optional stable reference to the full conformance report artifact. */
  readonly reportRef?: string;
  /** Injectable clock for deterministic tests. */
  readonly now?: Date;
}

/**
 * Emit one Verification Evidence record for a conformance report, or return
 * `null` without writing anything when the positive gate is not met:
 *
 * - the report must validate completely (exact identity fields present);
 * - the suite must be complete: total > 0, passed === total, failed === 0,
 *   skipped === 0 (failed/skipped/partial suites never produce evidence);
 * - a Linux tuple must carry an explicit non-null `libc`.
 */
export function emitVerificationEvidence(
  report: ConformanceReport,
  options: EvidenceEmitOptions = {},
): VerificationEvidence | null {
  const validation = validateConformanceReport(report);
  if (!validation.ok) return null;
  const { summary } = validation.report;
  if (summary.total === 0) return null;
  if (summary.passed !== summary.total) return null;
  if (summary.failed !== 0) return null;
  if (summary.skipped !== 0) return null;
  if (validation.report.tuple.os === "linux") {
    const libc = validation.report.tuple.libc;
    if (typeof libc !== "string" || libc.length === 0) return null;
  }

  const verifiedAt = (options.now ?? new Date()).toISOString();
  const record: VerificationEvidence = {
    evidenceVersion: EVIDENCE_VERSION,
    backend: {
      packageName: validation.report.backend.packageName,
      packageVersion: validation.report.backend.packageVersion,
      backendId: validation.report.backend.backendId,
    },
    core: {
      packageName: validation.report.core.packageName,
      packageVersion: validation.report.core.packageVersion,
      protocolMajor: validation.report.core.protocolMajor,
    },
    runtime: { ...validation.report.runtime },
    tuple: { ...validation.report.tuple },
    suite: { ...validation.report.suite },
    commit: validation.report.commit,
    verifiedAt,
    ...(options.reportRef !== undefined ? { reportRef: options.reportRef } : {}),
  };
  if (options.outputPath !== undefined) {
    mkdirSync(dirname(options.outputPath), { recursive: true });
    writeFileSync(options.outputPath, JSON.stringify(record, null, 2) + "\n", "utf8");
  }
  return record;
}

/** Validate a standalone evidence value against the evidence schema. */
export type EvidenceValidation =
  | { readonly ok: true; readonly evidence: VerificationEvidence }
  | { readonly ok: false; readonly errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Structural validation of a Verification Evidence record. `expected`, when
 * provided, additionally pins the tested commit and suite identity.
 */
export function validateVerificationEvidence(
  value: unknown,
  expected?: { readonly commit?: string; readonly suiteId?: string },
): EvidenceValidation {
  const errors: string[] = [];
  if (!isPlainObject(value))
    return { ok: false, errors: ["evidence record must be a JSON object"] };
  if (value.evidenceVersion !== EVIDENCE_VERSION) {
    errors.push(`evidenceVersion must be ${EVIDENCE_VERSION}`);
  }
  const backend = value.backend;
  if (!isPlainObject(backend)) errors.push("backend must be an object");
  else {
    if (!nonEmptyString(backend.packageName))
      errors.push("backend.packageName must be a non-empty string");
    if (!nonEmptyString(backend.packageVersion))
      errors.push("backend.packageVersion must be a non-empty string");
    if (!nonEmptyString(backend.backendId))
      errors.push("backend.backendId must be a non-empty string");
  }
  const core = value.core;
  if (!isPlainObject(core)) errors.push("core must be an object");
  else {
    if (!nonEmptyString(core.packageName))
      errors.push("core.packageName must be a non-empty string");
    if (!nonEmptyString(core.packageVersion))
      errors.push("core.packageVersion must be a non-empty string");
    if (
      typeof core.protocolMajor !== "number" ||
      !Number.isInteger(core.protocolMajor) ||
      core.protocolMajor <= 0
    ) {
      errors.push("core.protocolMajor must be a positive integer");
    }
  }
  const runtime = value.runtime;
  if (!isPlainObject(runtime)) errors.push("runtime must be an object");
  else {
    if (runtime.name !== "node" && runtime.name !== "bun" && runtime.name !== "deno") {
      errors.push('runtime.name must be "node", "bun", or "deno"');
    }
    if (!nonEmptyString(runtime.version)) errors.push("runtime.version must be a non-empty string");
  }
  const tuple = value.tuple;
  if (!isPlainObject(tuple)) errors.push("tuple must be an object");
  else {
    if (!nonEmptyString(tuple.os)) errors.push("tuple.os must be a non-empty string");
    if (!nonEmptyString(tuple.arch)) errors.push("tuple.arch must be a non-empty string");
    if (tuple.os === "linux" && !nonEmptyString(tuple.libc)) {
      errors.push("tuple.libc is required and non-null for linux native evidence");
    }
    if (tuple.libc !== undefined && !nonEmptyString(tuple.libc)) {
      errors.push("tuple.libc, when present, must be a non-empty string");
    }
  }
  const suite = value.suite;
  if (!isPlainObject(suite)) errors.push("suite must be an object");
  else {
    if (!nonEmptyString(suite.id)) errors.push("suite.id must be a non-empty string");
    if (!nonEmptyString(suite.version)) errors.push("suite.version must be a non-empty string");
    if (expected?.suiteId !== undefined && suite.id !== expected.suiteId) {
      errors.push(`suite.id must equal "${expected.suiteId}"`);
    }
  }
  if (typeof value.commit !== "string" || !/^[0-9a-f]{7,40}$/.test(value.commit)) {
    errors.push("commit must be a 7-40 character lowercase hex git commit");
  } else if (expected?.commit !== undefined && value.commit !== expected.commit) {
    errors.push(`commit must equal the release commit ${expected.commit}`);
  }
  if (typeof value.verifiedAt !== "string" || Number.isNaN(Date.parse(value.verifiedAt))) {
    errors.push("verifiedAt must be an ISO-8601 timestamp");
  }
  if (value.reportRef !== undefined && !nonEmptyString(value.reportRef)) {
    errors.push("reportRef, when present, must be a non-empty string");
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, evidence: value as unknown as VerificationEvidence };
}
