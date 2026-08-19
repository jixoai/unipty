/**
> Orthogonal intents (2026-08-20): metadata-only inspection and
 * compatibility evaluation.
 *
 * Original request (2026-08-17): `inspectUniPtyBackend()` accepts only a
 * successful resolution, imports only the `./unipty.metadata` subpath when
 * present, validates the versioned schema, and reports protocol/target
 * compatibility without loading the Backend entry module, calling its
 * factory, or writing console output.
 */

import { throwInvalidArgument, UNIPTY_CORE_PROTOCOL_MAJOR } from "unipty";
import { validateUniPtyBackendMetadata } from "./metadata.ts";
import { analyzeRuntime } from "./runtime.ts";
import type {
  BackendDiagnostic,
  BackendInspectReport,
  BackendResolvedReport,
  UniPtyBackendMetadata,
} from "./types.ts";
import type { RuntimeEnvironment } from "./runtime.ts";

/** Options for metadata inspection. */
export interface InspectUniPtyBackendOptions {
  /** Active Core protocol major; defaults to this Core's `UNIPTY_CORE_PROTOCOL_MAJOR`. */
  readonly protocol?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isBackendResolvedReport(value: unknown): value is BackendResolvedReport {
  return (
    isPlainObject(value) &&
    value.status === "resolved" &&
    typeof value.packageName === "string" &&
    typeof value.packageUrl === "string" &&
    (value.metadataUrl === undefined || typeof value.metadataUrl === "string") &&
    Array.isArray(value.diagnostics)
  );
}

/** Result of evaluating validated metadata against one environment. */
export interface CompatibilityEvaluation {
  readonly compatible: boolean;
  readonly diagnostics: readonly BackendDiagnostic[];
}

/**
 * Evaluate validated metadata against a normalized runtime environment and
 * an active Core protocol major. A target matches when its `runtime` equals
 * the current runtime and each present `os`/`arch`/`libc` array includes the
 * current value; at least one matching target plus protocol membership is
 * required for compatibility. Shared by resolved-path inspection and
 * manifest-entry selection.
 */
export function evaluateBackendCompatibility(
  metadata: UniPtyBackendMetadata,
  environment: RuntimeEnvironment,
  coreProtocol: number,
): CompatibilityEvaluation {
  const diagnostics: BackendDiagnostic[] = [];

  if (!metadata.protocol.core.includes(coreProtocol)) {
    diagnostics.push({
      code: "protocol-core",
      message: `Metadata declares Core protocol majors [${metadata.protocol.core.join(", ")}], which do not include the active major ${coreProtocol}`,
    });
  }

  const matchingTarget = metadata.targets.find((target) => {
    if (target.runtime !== environment.runtime) {
      return false;
    }
    if (target.os !== undefined && !target.os.includes(environment.os)) {
      return false;
    }
    if (target.arch !== undefined && !target.arch.includes(environment.arch)) {
      return false;
    }
    if (target.libc !== undefined) {
      const currentLibc = environment.libc;
      if (currentLibc === undefined || !target.libc.includes(currentLibc)) {
        return false;
      }
    }
    return true;
  });

  if (matchingTarget === undefined) {
    diagnostics.push({
      code: "target-mismatch",
      message: `No declared target matches the current environment (runtime=${environment.runtime}, os=${environment.os}, arch=${environment.arch}, libc=${environment.libc ?? "unknown"})`,
    });
  }

  return { compatible: diagnostics.length === 0, diagnostics };
}

/**
 * Inspect one successful resolution: import its metadata subpath when
 * present, validate the schema, and evaluate protocol/target compatibility.
 *
 * The runtime guard throws `invalid-argument` for anything that is not a
 * `resolved` report, so an unresolved package can never be mistaken for
 * missing metadata and the resolver never runs twice. Import of the metadata
 * module is the only effect; the Backend entry module and factory stay
 * untouched and no console output is written.
 */
export async function inspectUniPtyBackend(
  resolution: BackendResolvedReport,
  options?: InspectUniPtyBackendOptions,
): Promise<BackendInspectReport> {
  if (!isBackendResolvedReport(resolution)) {
    throwInvalidArgument("inspectUniPtyBackend accepts only a resolved BackendResolveReport", {
      resolution,
    });
  }

  if (resolution.metadataUrl === undefined) {
    return {
      status: "metadata-missing",
      resolution,
      diagnostics: [
        {
          code: "metadata-missing",
          message: `Package "${resolution.packageName}" does not expose the ./unipty.metadata subpath`,
        },
      ],
    };
  }

  let metadataModule: unknown;
  try {
    metadataModule = await import(resolution.metadataUrl);
  } catch (error) {
    return {
      status: "metadata-invalid",
      resolution,
      diagnostics: [
        {
          code: "metadata-import-failed",
          message: `Failed to import metadata module ${resolution.metadataUrl}`,
          cause: error,
        },
      ],
    };
  }

  const candidate =
    isPlainObject(metadataModule) && "default" in metadataModule
      ? (metadataModule as { default?: unknown }).default
      : undefined;

  let metadata: UniPtyBackendMetadata;
  try {
    metadata = validateUniPtyBackendMetadata(candidate);
  } catch (error) {
    const diagnostics: BackendDiagnostic[] = [
      {
        code: "metadata-invalid",
        message: "Metadata module does not default-export a valid UniPtyBackendMetadata value",
      },
    ];
    if (error instanceof Error && "issues" in error) {
      const issues = (error as { issues?: unknown }).issues;
      if (Array.isArray(issues)) {
        for (const issue of issues) {
          if (isPlainObject(issue)) {
            diagnostics.push({
              code: "metadata-invalid",
              message: `${String(issue.path ?? "<root>")}: ${String(issue.message ?? "invalid")}`,
            });
          }
        }
      }
    }
    return { status: "metadata-invalid", resolution, diagnostics };
  }

  const environment = analyzeRuntime();
  const coreProtocol = options?.protocol ?? UNIPTY_CORE_PROTOCOL_MAJOR;
  const evaluation = evaluateBackendCompatibility(metadata, environment, coreProtocol);

  if (!evaluation.compatible) {
    return {
      status: "incompatible",
      resolution,
      metadata,
      diagnostics: evaluation.diagnostics,
    };
  }
  return {
    status: "compatible",
    resolution,
    metadata,
    diagnostics: [],
  };
}
