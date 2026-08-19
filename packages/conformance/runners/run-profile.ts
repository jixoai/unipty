/**
> Orthogonal intents (2026-08-20): installed-public-package conformance
> runner CLI (tasks 4.1, 6.1, 7.1).
>
 * Execution mechanism: Node's native type stripping (Node >= 22.18 enables
 * it by default; this host runs 22.20.0), so `node runners/run-profile.ts`
 * executes TypeScript sources directly with explicit ".ts" import
 * extensions. The harness imports Core and Backends ONLY through their
 * installed public package exports.
 *
 * Usage:
 *   node runners/run-profile.ts --backend <mock|node-pty|bun|deno-sigma__pty-ffi>
 *       [--out <report.json>]
 *       [--emit-evidence] [--evidence-out <evidence.json>] [--report-ref <url-or-path>]
 *
 * Backend acquisition for real routes: the side-effect-free
 * `<package>/unipty.metadata` export supplies the exact package identity,
 * Backend id, and the mandatory `backend.factoryExport`; only the selected
 * entry module is then imported and its factory called (no name guessing).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { UNIPTY_CORE_PROTOCOL_MAJOR, UniPtyError } from "unipty";
import type { ReadyPtyBackend } from "unipty";
import type { UniPtyBackendMetadata } from "@unipty/backend";
import { emitVerificationEvidence } from "../src/evidence.ts";
import { currentTuple, dependencyPackageVersion, gitCommit, suiteIdentity } from "../src/host.ts";
import { validateUniPtyBackendMetadataSnapshot } from "../src/metadata.ts";
import { runConformanceProfile } from "../src/profile/runner.ts";
import type { ScenarioAccommodations } from "../src/profile/world.ts";
import { buildConformanceReport, validateConformanceReport } from "../src/report.ts";
import { detectCurrentRuntime } from "../src/fixtures/fixtures.ts";
import { serializeDeterministicJson } from "../src/catalog.ts";

/** CLI-selected backend route. */
type BackendSelection =
  | { readonly kind: "mock" }
  | { readonly kind: "official"; readonly route: string; readonly packageName: string };

const ROUTE_PACKAGES: Readonly<Record<string, string>> = {
  "node-pty": "@unipty/backend-node-pty",
  bun: "@unipty/backend-bun",
  "deno-sigma__pty-ffi": "@unipty/backend-deno-sigma__pty-ffi",
};

interface CliOptions {
  readonly backend: BackendSelection;
  readonly out: string;
  readonly emitEvidence: boolean;
  readonly evidenceOut: string;
  readonly reportRef: string | undefined;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let backendId: string | undefined;
  let out: string | undefined;
  let evidenceOut: string | undefined;
  let reportRef: string | undefined;
  let emitEvidence = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      i += 1;
      return value;
    };
    if (arg === "--backend") backendId = next();
    else if (arg === "--out") out = next();
    else if (arg === "--evidence-out") evidenceOut = next();
    else if (arg === "--report-ref") reportRef = next();
    else if (arg === "--emit-evidence") emitEvidence = true;
    else if (arg === "--") continue;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (backendId === undefined) {
    throw new Error(
      "usage: run-profile.ts --backend <mock|node-pty|bun|deno-sigma__pty-ffi> [--out <path>] [--emit-evidence] [--evidence-out <path>] [--report-ref <ref>]",
    );
  }
  const packageName = ROUTE_PACKAGES[backendId];
  if (backendId !== "mock" && packageName === undefined) {
    throw new Error(
      `unknown backend "${backendId}" (expected mock, ${Object.keys(ROUTE_PACKAGES).join(", ")})`,
    );
  }
  const selection: BackendSelection =
    backendId === "mock"
      ? { kind: "mock" }
      : { kind: "official", route: backendId, packageName: packageName as string };
  return {
    backend: selection,
    out: out ?? defaultReportPath(backendId),
    emitEvidence,
    evidenceOut: evidenceOut ?? defaultEvidencePath(backendId),
    reportRef,
  };
}

function defaultReportPath(backendId: string): string {
  return `reports/${backendId}-report.json`;
}

function defaultEvidencePath(backendId: string): string {
  return `evidence/${backendId}-evidence.json`;
}

/** A Backend factory plus the identity and accommodations for the profile. */
interface LoadedBackend {
  readonly createBackend: () => Promise<ReadyPtyBackend>;
  readonly backendIdentity: { readonly packageName: string; readonly backendId: string };
  /** Installed package version; `undefined` falls back to the suite version (mock). */
  readonly packageVersion: string | undefined;
  readonly accommodations: ScenarioAccommodations;
}

/**
 * Load the mock pipe-based Backend used for harness self-verification. A
 * mock transport can never establish native PTY support; it exists to prove
 * the runner end to end.
 */
async function loadMockBackend(): Promise<LoadedBackend> {
  const module: {
    createMockBackend: () => Promise<ReadyPtyBackend>;
    MOCK_BACKEND_IDENTITY: { packageName: string; backendId: string };
  } = await import("../test/support/mock-backend.ts");
  return {
    createBackend: module.createMockBackend,
    backendIdentity: module.MOCK_BACKEND_IDENTITY,
    packageVersion: undefined,
    accommodations: { resizeUnobservable: true },
  };
}

/** Load one official Backend route through its installed public package. */
async function loadOfficialBackend(packageName: string): Promise<LoadedBackend> {
  const metadataModule: { default: unknown } = await import(`${packageName}/unipty.metadata`);
  const validation = validateUniPtyBackendMetadataSnapshot(metadataModule.default);
  if (!validation.ok) {
    throw new UniPtyError("invalid-argument", `metadata snapshot for ${packageName} is invalid`, {
      details: { errors: validation.errors },
    });
  }
  const metadata: UniPtyBackendMetadata = validation.metadata;
  const entry: Record<string, unknown> = await import(packageName);
  const factoryCandidate = entry[metadata.backend.factoryExport];
  if (typeof factoryCandidate !== "function") {
    throw new UniPtyError(
      "invalid-argument",
      `${packageName} does not export factory "${metadata.backend.factoryExport}"`,
      { details: { factoryExport: metadata.backend.factoryExport } },
    );
  }
  const factory = factoryCandidate as () => Promise<ReadyPtyBackend>;
  // The @sigma/pty-ffi substrate's pty_close kills the child and consumes
  // the transport in one primitive; an exit not yet observed at terminate()
  // is honestly unobservable ({exitCode: null, signal: null}).
  const accommodations: ScenarioAccommodations =
    metadata.backend.id === "deno-sigma__pty-ffi" ? { exitUnobservableAfterTerminate: true } : {};
  return {
    createBackend: factory,
    backendIdentity: { packageName: metadata.package.name, backendId: metadata.backend.id },
    packageVersion: metadata.package.version,
    accommodations,
  };
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  // Keep Deno fixture children from drawing loader/update progress spinners
  // on their TTY (ANSI noise the portable oracles would otherwise have to
  // tolerate); harmless no-ops on the other runtimes.
  process.env.DENO_NO_UPDATE_CHECK ??= "1";
  process.env.DENO_NO_PROGRESS ??= "1";
  const loaded =
    options.backend.kind === "mock"
      ? await loadMockBackend()
      : await loadOfficialBackend(options.backend.packageName);

  const runtime = detectCurrentRuntime();
  const tuple = currentTuple();
  const commit = gitCommit();
  const suite = suiteIdentity();

  process.stderr.write(
    `[@unipty/conformance] backend=${loaded.backendIdentity.packageName} runtime=${runtime.name} ${runtime.version} tuple=${tuple.os}/${tuple.arch}${tuple.libc === undefined ? "" : `/${tuple.libc}`} commit=${commit}\n`,
  );

  const outcome = await runConformanceProfile({
    createBackend: loaded.createBackend,
    runtime,
    backendIdentity: loaded.backendIdentity,
    accommodations: loaded.accommodations,
  });

  const report = buildConformanceReport({
    suite,
    backend: {
      packageName: loaded.backendIdentity.packageName,
      packageVersion: loaded.packageVersion ?? suite.version,
      backendId: loaded.backendIdentity.backendId,
    },
    core: {
      packageName: "unipty",
      packageVersion: dependencyPackageVersion("unipty"),
      protocolMajor: UNIPTY_CORE_PROTOCOL_MAJOR,
    },
    runtime: { name: runtime.name, version: runtime.version },
    tuple,
    commit,
    startedAt: outcome.startedAt,
    finishedAt: outcome.finishedAt,
    scenarios: outcome.scenarios,
  });

  const validation = validateConformanceReport(report);
  if (!validation.ok) {
    process.stderr.write(
      `[@unipty/conformance] produced an invalid report:\n- ${validation.errors.join("\n- ")}\n`,
    );
    return 2;
  }

  mkdirSync(dirnameOf(options.out), { recursive: true });
  writeFileSync(options.out, serializeDeterministicJson(report), "utf8");
  for (const result of report.scenarios) {
    const line = `[${result.status.toUpperCase()}] ${result.scenario} (${result.durationMs}ms)`;
    process.stderr.write(
      `${line}${result.note === undefined ? "" : ` — ${result.note}`}${result.error === undefined ? "" : ` — ${result.error}`}\n`,
    );
  }
  process.stderr.write(
    `[@unipty/conformance] ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped — report: ${options.out}\n`,
  );

  if (options.emitEvidence) {
    const evidence = emitVerificationEvidence(report, {
      outputPath: options.evidenceOut,
      reportRef: options.reportRef ?? options.out,
    });
    if (evidence === null) {
      process.stderr.write(
        `[@unipty/conformance] no Verification Evidence emitted: the positive gate was not met (failed/skipped/partial or malformed identity)\n`,
      );
      return report.summary.failed > 0 ? 1 : 2;
    }
    process.stderr.write(`[@unipty/conformance] evidence record written: ${options.evidenceOut}\n`);
  }
  return report.summary.failed > 0 ? 1 : 0;
}

function dirnameOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "." : path.slice(0, index);
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `[@unipty/conformance] runner failed: ${String(error instanceof Error ? error.stack : error)}\n`,
    );
    process.exit(2);
  });
