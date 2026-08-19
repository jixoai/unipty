/**
> Orthogonal intents (2026-08-20): Backend Metadata Protocol types; resolver
> and inspection reports; AutoResolve warnings; manifest and initialization
> error shapes.
 *
 * Original request (2026-08-17): staged, caller-rooted Backend acquisition
 * with discriminated reports. The shapes are fixed by the ready-for-agent
 * living spec ("Public Contract Shapes") and are shared by official Backend
 * packages, the acquisition stages, and the manifest helper.
 */

/** Side-effect-free Backend Metadata Protocol value. */
export type UniPtyBackendMetadata = {
  readonly schema: 1;
  readonly package: { readonly name: string; readonly version: string };
  readonly backend: { readonly id: string; readonly factoryExport: string };
  readonly protocol: { readonly core: readonly number[] };
  readonly targets: readonly {
    readonly runtime: "node" | "bun" | "deno";
    readonly os?: readonly string[];
    readonly arch?: readonly string[];
    readonly libc?: readonly string[];
  }[];
  readonly provenance?: {
    readonly kind: "runtime-native" | "third-party" | "external-system";
    readonly substrate: string;
  };
};

/** Open structured diagnostic namespace; native resolver failures differ by runtime. */
export type BackendDiagnostic = {
  readonly code: string;
  readonly message?: string;
  readonly cause?: unknown;
};

/** Successful pure-resolution report. `metadataUrl` is absent for packages without the subpath. */
export type BackendResolvedReport = {
  readonly status: "resolved";
  readonly packageName: string;
  readonly packageUrl: string;
  readonly metadataUrl?: string;
  readonly diagnostics: readonly BackendDiagnostic[];
};

/** Pure-resolution report: locations only, never a loadability or readiness claim. */
export type BackendResolveReport =
  | BackendResolvedReport
  | {
      readonly status: "unresolved";
      readonly packageName: string;
      readonly reason: "missing" | "invalid";
      readonly diagnostics: readonly BackendDiagnostic[];
    };

/** Metadata-only inspection report; accepts only a successful resolution. */
export type BackendInspectReport =
  | {
      readonly status: "compatible" | "incompatible";
      readonly resolution: BackendResolvedReport;
      readonly metadata: UniPtyBackendMetadata;
      readonly diagnostics: readonly BackendDiagnostic[];
    }
  | {
      readonly status: "metadata-missing" | "metadata-invalid";
      readonly resolution: BackendResolvedReport;
      readonly diagnostics: readonly BackendDiagnostic[];
    };

/** AutoResolve structured warning for an unavailable configured candidate. */
export type UniPtyBackendWarning = {
  readonly code: "candidate-unavailable";
  readonly packageName: string;
  readonly stage: "resolve" | "inspect";
  readonly diagnostics: readonly BackendDiagnostic[];
  readonly cause?: unknown;
};

/** Opaque Backend entry module; the factory export is looked up only for the selected candidate. */
export type BackendModule = object;

/** One immutable manifest entry: static metadata plus a bundler-visible deferred loader. */
export type UniPtyBackendManifestEntry = {
  readonly packageName: string;
  readonly metadata: UniPtyBackendMetadata;
  load(): Promise<BackendModule>;
};

/** Validated explicit bundle manifest produced by `defineUniPtyBackendManifest()`. */
export type UniPtyBackendManifest = {
  readonly entries: readonly UniPtyBackendManifestEntry[];
};

/** Structured selected-candidate initialization failure raised by AutoResolve. */
export type UniPtyBackendInitializationError = Error & {
  readonly code: "backend-initialization";
  readonly packageName: string;
  readonly stage: "import" | "factory-export" | "factory-call" | "ready";
  readonly inspection: BackendInspectReport;
  readonly cause: unknown;
};

/** A ready Backend value returned by a successful acquisition. */
export type { ReadyPtyBackend, BackendEndpoint, StructuredLaunch } from "unipty";
