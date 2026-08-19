/**
> Orthogonal intents (2026-08-20): standalone Verification Evidence emission
> CLI (task 7.1) — gates a stored conformance report into one evidence
 * record, or writes nothing.
 *
 * Usage: node runners/emit-evidence.ts --report <path> [--out <path>] [--report-ref <ref>]
 */

import { emitVerificationEvidence } from "../src/evidence.ts";
import { parseJson } from "../src/host.ts";
import { readFileSync } from "node:fs";
import type { ConformanceReport } from "../src/report.ts";
import { validateConformanceReport } from "../src/report.ts";
import { serializeDeterministicJson } from "../src/catalog.ts";

function parseArgs(argv: readonly string[]): {
  report: string;
  out: string;
  reportRef: string | undefined;
} {
  let report: string | undefined;
  let out = "evidence/evidence.json";
  let reportRef: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      i += 1;
      return value;
    };
    if (arg === "--report") report = next();
    else if (arg === "--out") out = next();
    else if (arg === "--report-ref") reportRef = next();
    else if (arg === "--") continue;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (report === undefined) {
    throw new Error("usage: emit-evidence.ts --report <path> [--out <path>] [--report-ref <ref>]");
  }
  return { report, out, reportRef };
}

function main(): number {
  const options = parseArgs(process.argv.slice(2));
  const raw: unknown = parseJson(readFileSync(options.report, "utf8"));
  const validation = validateConformanceReport(raw);
  if (!validation.ok) {
    process.stderr.write(
      `[@unipty/conformance] report ${options.report} is invalid:\n- ${validation.errors.join("\n- ")}\n`,
    );
    return 2;
  }
  const evidence = emitVerificationEvidence(validation.report as ConformanceReport, {
    outputPath: options.out,
    reportRef: options.reportRef ?? options.report,
  });
  if (evidence === null) {
    process.stderr.write(
      `[@unipty/conformance] no Verification Evidence emitted: the positive gate was not met for ${options.report}\n`,
    );
    return 2;
  }
  process.stdout.write(serializeDeterministicJson(evidence));
  process.stderr.write(`[@unipty/conformance] evidence record written: ${options.out}\n`);
  return 0;
}

process.exit(main());
