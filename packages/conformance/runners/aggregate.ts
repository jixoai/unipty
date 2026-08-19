/**
> Orthogonal intents (2026-08-20): release catalog aggregation CLI (task
> 7.2/7.4) — validates evidence records and metadata snapshots, rejects
 * duplicates/contradictions/missing routes, and writes one deterministic
 * catalog JSON artifact.
 *
 * Usage:
 *   node runners/aggregate.ts --evidence <path> [--evidence <path> ...]
 *       --metadata <path> [--metadata <path> ...]
 *       --commit <hex> --release-tag <tag> --out <path>
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { aggregateCatalog, CatalogError } from "../src/catalog.ts";

interface CliOptions {
  readonly evidence: string[];
  readonly metadata: string[];
  readonly commit: string;
  readonly releaseTag: string;
  readonly out: string;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const evidence: string[] = [];
  const metadata: string[] = [];
  let commit: string | undefined;
  let releaseTag: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      i += 1;
      return value;
    };
    if (arg === "--evidence") evidence.push(next());
    else if (arg === "--metadata") metadata.push(next());
    else if (arg === "--commit") commit = next();
    else if (arg === "--release-tag") releaseTag = next();
    else if (arg === "--out") out = next();
    else if (arg === "--") continue;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (
    commit === undefined ||
    releaseTag === undefined ||
    out === undefined ||
    evidence.length === 0 ||
    metadata.length === 0
  ) {
    throw new Error(
      "usage: aggregate.ts --evidence <path> [--evidence <path>...] --metadata <path> [--metadata <path>...] --commit <hex> --release-tag <tag> --out <path>",
    );
  }
  return { evidence, metadata, commit, releaseTag, out };
}

function main(): number {
  const options = parseArgs(process.argv.slice(2));
  try {
    const result = aggregateCatalog({
      evidenceRecords: options.evidence,
      metadataSnapshots: options.metadata,
      commit: options.commit,
      releaseTag: options.releaseTag,
    });
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, result.json, "utf8");
    process.stderr.write(
      `[@unipty/conformance] catalog written: ${options.out} (routes: node=${result.coverage.node} bun=${result.coverage.bun} deno=${result.coverage.deno})\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof CatalogError) {
      process.stderr.write(`[@unipty/conformance] ${error.message}\n`);
      return 1;
    }
    process.stderr.write(`[@unipty/conformance] aggregation crashed: ${String(error)}\n`);
    return 2;
  }
}

process.exit(main());
