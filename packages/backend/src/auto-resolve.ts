/**
> Orthogonal intents (2026-08-20): deterministic AutoResolve selection and
 * terminal selected-candidate initialization.
 *
 * Original request (2026-08-17): runtime-first acquisition. Explicit ordered
 * candidates win; unavailable configured candidates emit a structured
 * warning; fallback candidates derive from the consumer's dependency
 * declarations in deterministic sorted order and require a unique compatible
 * result; selection ends before effectful initialization, and selected
 * import/factory/readiness failures are terminal and structured.
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { throwInvalidArgument, UNIPTY_CORE_PROTOCOL_MAJOR } from "unipty";
import { evaluateBackendCompatibility, inspectUniPtyBackend } from "./inspect.ts";
import { normalizeFromBase, resolveUniPtyBackend } from "./resolve.ts";
import { analyzeRuntime } from "./runtime.ts";
import type { RuntimeEnvironment } from "./runtime.ts";
import type {
  BackendDiagnostic,
  BackendInspectReport,
  BackendModule,
  BackendResolvedReport,
  ReadyPtyBackend,
  UniPtyBackendInitializationError,
  UniPtyBackendManifest,
  UniPtyBackendManifestEntry,
  UniPtyBackendWarning,
} from "./types.ts";

/** An inspection report whose status is known to be `compatible`. */
type CompatibleInspection = BackendInspectReport & {
  readonly status: "compatible";
};

/** Options for `autoResolveUniPtyBackend()`. */
export interface AutoResolveOptions {
  /** Ordered explicit candidate preference; first compatible candidate wins. */
  readonly candidates?: readonly string[];
  /**
   * Caller-owned resolution base. When omitted, a trustworthy project base is
   * inferred only from the runtime project context (a working directory that
   * contains a package.json) — never from this package's own module location.
   */
  readonly from?: URL | string;
  /** Explicit immutable bundle manifest; replaces runtime package resolution entirely. */
  readonly manifest?: UniPtyBackendManifest;
  /** Structured warning sink; defaults to the host `console.warn`. */
  readonly onWarning?: (warning: UniPtyBackendWarning) => void;
}

/**
 * Selection-stage failure raised by AutoResolve before any Backend
 * initialization: `ambiguous` when multiple fallback candidates are
 * compatible, `no-compatible-backend` when none is.
 */
export class UniPtyBackendSelectionError extends Error {
  readonly code: "ambiguous" | "no-compatible-backend";
  readonly diagnostics: readonly BackendDiagnostic[];
  /** Compatible candidate names, populated for `ambiguous`. */
  readonly candidates: readonly string[];

  constructor(
    code: "ambiguous" | "no-compatible-backend",
    message: string,
    options: { diagnostics?: readonly BackendDiagnostic[]; candidates?: readonly string[] },
  ) {
    super(message);
    this.name = "UniPtyBackendSelectionError";
    this.code = code;
    this.diagnostics = options.diagnostics ?? [];
    this.candidates = options.candidates ?? [];
  }
}

/** Runtime-compatibility check for a ready Backend value: `spawn` + `dispose`. */
export function isBackendReady(value: unknown): value is ReadyPtyBackend {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { spawn?: unknown; dispose?: unknown };
  return typeof candidate.spawn === "function" && typeof candidate.dispose === "function";
}

type SelectedCandidate =
  | {
      readonly kind: "resolved";
      readonly packageName: string;
      readonly inspection: CompatibleInspection;
      readonly importUrl: string;
    }
  | {
      readonly kind: "manifest";
      readonly packageName: string;
      readonly inspection: CompatibleInspection;
      readonly loader: () => Promise<BackendModule>;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCompatibleInspection(report: BackendInspectReport): report is CompatibleInspection {
  return report.status === "compatible";
}

function rebaseDiagnostic(prefix: string, diagnostic: BackendDiagnostic): BackendDiagnostic {
  if (diagnostic.message === undefined) {
    return { code: `${prefix}.${diagnostic.code}` };
  }
  return { code: `${prefix}.${diagnostic.code}`, message: diagnostic.message };
}

function throwBackendInitialization(
  stage: UniPtyBackendInitializationError["stage"],
  selected: SelectedCandidate,
  cause: unknown,
): never {
  const stageMessage: Record<UniPtyBackendInitializationError["stage"], string> = {
    import: `Failed to import the selected Backend package "${selected.packageName}"`,
    "factory-export": `The selected Backend package "${selected.packageName}" does not export the declared factory "${selected.inspection.metadata.backend.factoryExport}" as a function`,
    "factory-call": `The factory of the selected Backend package "${selected.packageName}" failed`,
    ready: `The factory result of the selected Backend package "${selected.packageName}" is not a ready Backend (spawn and dispose functions are required)`,
  };
  const error = new Error(stageMessage[stage]) as UniPtyBackendInitializationError;
  error.name = "UniPtyBackendInitializationError";
  Object.assign(error, {
    code: "backend-initialization",
    packageName: selected.packageName,
    stage,
    inspection: selected.inspection,
  });
  if (cause !== undefined) {
    Object.assign(error, { cause });
  }
  throw error;
}

/**
 * Infer a trustworthy project base for callers that omitted `from`: only a
 * working directory that actually contains a package.json qualifies. This
 * package's own module location is never used as the caller base.
 */
function inferCallerBase(): URL {
  const proc = (globalThis as { process?: { cwd?: () => string } }).process;
  const cwd = typeof proc?.cwd === "function" ? proc.cwd() : undefined;
  if (typeof cwd === "string" && cwd.length > 0) {
    try {
      statSync(join(cwd, "package.json"));
      return normalizeFromBase(`${cwd}/`);
    } catch {
      // No package.json in the working directory: not a trustworthy base.
    }
  }
  throwInvalidArgument(
    "autoResolveUniPtyBackend requires an explicit `from` when the current working directory is not a trustworthy project context (no package.json present)",
  );
}

interface FallbackDerivation {
  readonly candidates: readonly string[];
  readonly diagnostics: readonly BackendDiagnostic[];
}

/**
 * Derive fallback candidates from the consumer's nearest package.json.
 * Every dependency key (dependencies + devDependencies) is a candidate; the
 * result is deduplicated and sorted alphabetically so package.json key order
 * never implies priority. Non-Backend dependencies simply fail resolve or
 * inspection and are skipped.
 */
function deriveFallbackCandidates(baseDirectory: string): FallbackDerivation {
  let directory = baseDirectory;
  for (let depth = 0; depth < 64; depth += 1) {
    const manifestPath = join(directory, "package.json");
    let raw: string;
    try {
      raw = readFileSync(manifestPath, "utf8");
    } catch (error) {
      if ((error as { code?: unknown }).code === "ENOENT") {
        const parent = dirname(directory);
        if (parent === directory) {
          break;
        }
        directory = parent;
        continue;
      }
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        candidates: [],
        diagnostics: [
          {
            code: "consumer-package-json-invalid",
            message: `Consumer package.json at ${manifestPath} is not valid JSON`,
            cause: error,
          },
        ],
      };
    }
    const dependencies = isPlainObject(parsed)
      ? [
          ...Object.keys((parsed.dependencies ?? {}) as Record<string, unknown>),
          ...Object.keys((parsed.devDependencies ?? {}) as Record<string, unknown>),
        ]
      : [];
    const candidates = [...new Set(dependencies)].sort();
    return {
      candidates,
      diagnostics: [
        {
          code: "fallback-derived",
          message: `Derived ${candidates.length} fallback candidate(s) from ${manifestPath}`,
        },
      ],
    };
  }
  return {
    candidates: [],
    diagnostics: [
      {
        code: "consumer-package-json-missing",
        message: `No package.json found above ${baseDirectory} for fallback candidate derivation`,
      },
    ],
  };
}

function baseDirectoryOf(base: URL): string {
  const path = fileURLToPath(base);
  return path.endsWith("/") ? path.slice(0, -1) : dirname(path);
}

function syntheticManifestResolution(packageName: string): BackendResolvedReport {
  return {
    status: "resolved",
    packageName,
    packageUrl: `manifest:${packageName}`,
    diagnostics: [
      {
        code: "manifest-entry",
        message: "Selected from an explicit bundle manifest; no filesystem resolution occurred",
      },
    ],
  };
}

/**
 * Acquire a ready Backend deterministically.
 *
 * Runtime analysis happens first. With an explicit manifest, selection runs
 * over manifest entries only — ordered first-compatible across the candidate
 * filter or all entries — and then loads only the selected entry's loader.
 * Without a manifest, explicit candidates are processed in caller order;
 * unavailable configured candidates emit a structured warning and selection
 * falls back to dependency-derived candidates, which require exactly one
 * compatible result (`ambiguous` otherwise). Once a candidate is selected,
 * only its entry module is imported, only its declared factory export is
 * called, and any import/factory-export/factory-call/readiness failure
 * rejects terminally with a structured `backend-initialization` error that
 * preserves the package, stage, preceding inspection report, and cause.
 */
export async function autoResolveUniPtyBackend<TBackend = ReadyPtyBackend>(
  options?: AutoResolveOptions,
): Promise<TBackend> {
  const opts = options ?? {};
  const environment = analyzeRuntime();
  const coreProtocol = UNIPTY_CORE_PROTOCOL_MAJOR;

  const emitWarning = (warning: UniPtyBackendWarning): void => {
    if (typeof opts.onWarning === "function") {
      opts.onWarning(warning);
      return;
    }
    console.warn(
      "[@unipty/backend]",
      warning.code,
      warning.packageName,
      warning.stage,
      warning.diagnostics,
    );
  };

  if (
    opts.candidates !== undefined &&
    (!Array.isArray(opts.candidates) ||
      opts.candidates.some((name) => typeof name !== "string" || name.trim().length === 0))
  ) {
    throwInvalidArgument(
      "autoResolveUniPtyBackend candidates must be an array of non-empty package name strings",
      { candidates: opts.candidates },
    );
  }
  const explicitCandidates =
    opts.candidates === undefined ? undefined : [...new Set(opts.candidates as readonly string[])];

  if (opts.manifest !== undefined) {
    return resolveFromManifest(
      opts.manifest,
      explicitCandidates,
      environment,
      coreProtocol,
      emitWarning,
    ) as Promise<TBackend>;
  }

  const base = opts.from === undefined ? inferCallerBase() : normalizeFromBase(opts.from);

  // Stage 1: explicit ordered candidates; first compatible wins.
  let selected: SelectedCandidate | undefined;
  if (explicitCandidates !== undefined) {
    for (const packageName of explicitCandidates) {
      const resolution = await resolveUniPtyBackend(packageName, { from: base });
      if (resolution.status !== "resolved") {
        emitWarning({
          code: "candidate-unavailable",
          packageName,
          stage: "resolve",
          diagnostics: [
            {
              code: resolution.reason,
              message: `Candidate "${packageName}" could not be resolved (${resolution.reason})`,
            },
            ...resolution.diagnostics.map((diagnostic) => rebaseDiagnostic("resolve", diagnostic)),
          ],
        });
        continue;
      }
      const inspection = await inspectUniPtyBackend(resolution);
      if (!isCompatibleInspection(inspection)) {
        emitWarning({
          code: "candidate-unavailable",
          packageName,
          stage: "inspect",
          diagnostics: [
            {
              code: inspection.status,
              message: `Candidate "${packageName}" inspection reported ${inspection.status}`,
            },
            ...inspection.diagnostics.map((diagnostic) => rebaseDiagnostic("inspect", diagnostic)),
          ],
        });
        continue;
      }
      selected = {
        kind: "resolved",
        packageName,
        inspection,
        importUrl: resolution.packageUrl,
      };
      break;
    }
  }

  // Stage 2: dependency-derived fallback requires exactly one compatible.
  if (selected === undefined) {
    const derivation = deriveFallbackCandidates(baseDirectoryOf(base));
    const compatible: SelectedCandidate[] = [];
    const aggregate: BackendDiagnostic[] = [...derivation.diagnostics];
    for (const packageName of derivation.candidates) {
      const resolution = await resolveUniPtyBackend(packageName, { from: base });
      if (resolution.status !== "resolved") {
        aggregate.push({
          code: `fallback.${resolution.reason}`,
          message: `Fallback candidate "${packageName}" could not be resolved (${resolution.reason})`,
        });
        continue;
      }
      const inspection = await inspectUniPtyBackend(resolution);
      if (!isCompatibleInspection(inspection)) {
        aggregate.push({
          code: `fallback.${inspection.status}`,
          message: `Fallback candidate "${packageName}" inspection reported ${inspection.status}`,
        });
        continue;
      }
      compatible.push({
        kind: "resolved",
        packageName,
        inspection,
        importUrl: resolution.packageUrl,
      });
    }
    const [sole] = compatible;
    if (sole === undefined) {
      throw new UniPtyBackendSelectionError(
        "no-compatible-backend",
        "AutoResolve found no compatible Backend candidate",
        { diagnostics: aggregate },
      );
    }
    if (compatible.length > 1) {
      throw new UniPtyBackendSelectionError(
        "ambiguous",
        "AutoResolve found multiple compatible fallback Backend candidates; pass an explicit `candidates` order to choose one",
        {
          diagnostics: aggregate,
          candidates: compatible.map((candidate) => candidate.packageName),
        },
      );
    }
    selected = sole;
  }

  return initializeSelected(selected) as Promise<TBackend>;
}

async function resolveFromManifest(
  manifest: UniPtyBackendManifest,
  explicitCandidates: readonly string[] | undefined,
  environment: RuntimeEnvironment,
  coreProtocol: number,
  emitWarning: (warning: UniPtyBackendWarning) => void,
): Promise<unknown> {
  const entriesByPackage = new Map<string, UniPtyBackendManifestEntry>(
    manifest.entries.map((entry) => [entry.packageName, entry]),
  );
  const orderedNames = explicitCandidates ?? manifest.entries.map((entry) => entry.packageName);

  const aggregate: BackendDiagnostic[] = [];
  for (const packageName of orderedNames) {
    const entry = entriesByPackage.get(packageName);
    if (entry === undefined) {
      emitWarning({
        code: "candidate-unavailable",
        packageName,
        stage: "resolve",
        diagnostics: [
          {
            code: "manifest-entry-missing",
            message: `The explicit manifest contains no entry for "${packageName}"`,
          },
        ],
      });
      aggregate.push({
        code: "manifest-entry-missing",
        message: `Configured candidate "${packageName}" has no manifest entry`,
      });
      continue;
    }
    const evaluation = evaluateBackendCompatibility(entry.metadata, environment, coreProtocol);
    if (!evaluation.compatible) {
      emitWarning({
        code: "candidate-unavailable",
        packageName,
        stage: "inspect",
        diagnostics: evaluation.diagnostics,
      });
      aggregate.push({
        code: "manifest-entry-incompatible",
        message: `Manifest entry "${packageName}" is not compatible with the current environment`,
      });
      continue;
    }
    const inspection: CompatibleInspection = {
      status: "compatible",
      resolution: syntheticManifestResolution(packageName),
      metadata: entry.metadata,
      diagnostics: [],
    };
    return initializeSelected({
      kind: "manifest",
      packageName,
      inspection,
      loader: entry.load,
    });
  }

  throw new UniPtyBackendSelectionError(
    "no-compatible-backend",
    "AutoResolve found no compatible Backend manifest entry",
    { diagnostics: aggregate },
  );
}

async function initializeSelected(selected: SelectedCandidate): Promise<unknown> {
  let moduleNamespace: unknown;
  try {
    moduleNamespace =
      selected.kind === "manifest" ? await selected.loader() : await import(selected.importUrl);
  } catch (error) {
    throwBackendInitialization("import", selected, error);
  }

  const factoryExport = selected.inspection.metadata.backend.factoryExport;
  const factory = isPlainObject(moduleNamespace) ? moduleNamespace[factoryExport] : undefined;
  if (typeof factory !== "function") {
    throwBackendInitialization("factory-export", selected, undefined);
  }

  let ready: unknown;
  try {
    ready = await (factory as () => Promise<unknown> | unknown)();
  } catch (error) {
    throwBackendInitialization("factory-call", selected, error);
  }

  if (!isBackendReady(ready)) {
    throwBackendInitialization("ready", selected, undefined);
  }
  return ready;
}
