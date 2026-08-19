/**
> Orthogonal intents (2026-08-20): manifest-source generation for explicit
 * ordered candidates.
 *
 * Original request (2026-08-17): `generateUniPtyBackendManifestModule()`
 * resolves and imports only candidate metadata, validates it, and returns
 * generated ESM source with exactly one default export — the
 * `defineUniPtyBackendManifest()` result. It never writes files, invokes a
 * Backend loader, calls a factory, or initializes native resources.
 */

import {
  inspectUniPtyBackend,
  resolveUniPtyBackend,
  type BackendInspectReport,
  type UniPtyBackendMetadata,
} from "@unipty/backend";
import { throwInvalidArgument } from "unipty";

/** Options for manifest-module source generation. */
export interface GenerateUniPtyBackendManifestModuleOptions {
  /** Non-empty, duplicate-free, ordered candidate package specifiers. */
  readonly candidates: readonly string[];
  /** Required caller-owned resolution base for the programmatic API. */
  readonly from: URL | string;
}

/** A candidate that failed resolve or inspection during generation. */
export class UniPtyHelperCandidateError extends Error {
  readonly code: "candidate-unresolved" | "candidate-incompatible";
  readonly packageName: string;
  readonly report:
    | { readonly status: "unresolved"; readonly reason: "missing" | "invalid" }
    | Pick<BackendInspectReport, "status" | "diagnostics">;

  constructor(
    code: "candidate-unresolved" | "candidate-incompatible",
    packageName: string,
    message: string,
    report:
      | { readonly status: "unresolved"; readonly reason: "missing" | "invalid" }
      | Pick<BackendInspectReport, "status" | "diagnostics">,
  ) {
    super(message);
    this.name = "UniPtyHelperCandidateError";
    this.code = code;
    this.packageName = packageName;
    this.report = report;
  }
}

function reportDiagnostics(report: UniPtyHelperCandidateError["report"]): string {
  if (report.status === "unresolved") {
    return `unresolved (${report.reason})`;
  }
  return report.status;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

/**
 * Generate the source of one Backend manifest module for the supplied
 * ordered candidates.
 *
 * Each candidate is resolved and inspected eagerly; any failure throws a
 * structured `UniPtyHelperCandidateError` instead of being silently skipped.
 * The emitted module is hand-authorable, bundler-neutral ESM (also valid
 * TypeScript): it statically default-imports each candidate's
 * `./unipty.metadata` subpath using the original specifier verbatim, imports
 * `defineUniPtyBackendManifest` from `@unipty/backend`, and default-exports
 * the manifest built from deferred `load: () => import("<specifier>")`
 * loaders. No metadata snapshot, physical path, or runtime resolver call is
 * embedded, and evaluating the generated module imports neither a Backend
 * entry module nor a factory.
 */
export async function generateUniPtyBackendManifestModule(
  options: GenerateUniPtyBackendManifestModuleOptions,
): Promise<string> {
  if (
    typeof options !== "object" ||
    options === null ||
    !Array.isArray(options.candidates) ||
    options.candidates.length === 0
  ) {
    throwInvalidArgument(
      "generateUniPtyBackendManifestModule requires a non-empty ordered candidates array",
      { options },
    );
  }
  for (const candidate of options.candidates) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      throwInvalidArgument(
        "generateUniPtyBackendManifestModule candidates must be non-empty package specifier strings",
        { candidates: options.candidates },
      );
    }
  }
  const uniqueCandidates = new Set(options.candidates as readonly string[]);
  if (uniqueCandidates.size !== options.candidates.length) {
    throwInvalidArgument(
      "generateUniPtyBackendManifestModule candidates must not contain duplicates; the generated manifest would reject them",
      { candidates: options.candidates },
    );
  }
  if (options.from === undefined) {
    throwInvalidArgument(
      "generateUniPtyBackendManifestModule requires an explicit caller-owned `from`",
    );
  }

  const metadataByIdentifier: { packageName: string; metadata: UniPtyBackendMetadata }[] = [];
  for (const packageName of options.candidates as readonly string[]) {
    const resolution = await resolveUniPtyBackend(packageName, {
      from: options.from,
    });
    if (resolution.status !== "resolved") {
      throw new UniPtyHelperCandidateError(
        "candidate-unresolved",
        packageName,
        `Manifest candidate "${packageName}" could not be resolved (${resolution.reason})`,
        { status: "unresolved", reason: resolution.reason },
      );
    }
    const inspection = await inspectUniPtyBackend(resolution);
    if (inspection.status !== "compatible") {
      throw new UniPtyHelperCandidateError(
        "candidate-incompatible",
        packageName,
        `Manifest candidate "${packageName}" inspection reported ${reportDiagnostics(inspection)}`,
        {
          status: inspection.status,
          diagnostics: inspection.diagnostics,
        },
      );
    }
    metadataByIdentifier.push({
      packageName: inspection.metadata.package.name,
      metadata: inspection.metadata,
    });
  }

  const lines: string[] = [
    "// @generated by @unipty/helper-backend — UniPty Backend manifest module.",
    "// Hand-authorable bundler-neutral ESM (also valid TypeScript).",
    "// Evaluation validates metadata without importing Backend entries,",
    "// calling factories, or initializing native resources.",
    'import { defineUniPtyBackendManifest } from "@unipty/backend";',
  ];
  for (const [index] of metadataByIdentifier.entries()) {
    const candidate = (options.candidates as readonly string[])[index];
    if (candidate === undefined) {
      throw new Error("unreachable: candidate index mismatch");
    }
    lines.push(`import metadata${index} from ${quote(`${candidate}/unipty.metadata`)};`);
  }
  lines.push("");
  lines.push("export default defineUniPtyBackendManifest({");
  lines.push("  entries: [");
  metadataByIdentifier.forEach((entry, index) => {
    const candidate = (options.candidates as readonly string[])[index];
    if (candidate === undefined) {
      throw new Error("unreachable: candidate index mismatch");
    }
    const linesForEntry = [
      "    {",
      `      packageName: ${quote(entry.packageName)},`,
      `      metadata: metadata${index},`,
      `      load: () => import(${quote(candidate)}),`,
      "    },",
    ];
    lines.push(linesForEntry.join("\n"));
  });
  lines.push("  ],");
  lines.push("});");
  return `${lines.join("\n")}\n`;
}
