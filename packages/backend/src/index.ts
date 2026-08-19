/**
> Orthogonal intents (2026-08-20): @unipty/backend public entry — the staged
 * acquisition surface over the shared type contracts.
 *
 * Original request (2026-08-17): staged, caller-rooted Backend acquisition.
 * Stage 1 (`resolveUniPtyBackend`) resolves locations only; stage 2
 * (`inspectUniPtyBackend`) imports and validates metadata without Backend
 * effects; stage 3 (`autoResolveUniPtyBackend`) selects deterministically and
 * initializes only the selected candidate. `defineUniPtyBackendManifest`
 * constructs the explicit bundle-manifest seam, and the metadata validator
 * is the versioned schema authority shared by all stages.
 */

export { validateUniPtyBackendMetadata } from "./metadata.ts";
export { MetadataValidationError } from "./metadata.ts";
export type {
  MetadataValidationIssue,
} from "./metadata.ts";

export { analyzeRuntime } from "./runtime.ts";
export type { RuntimeEnvironment } from "./runtime.ts";

export { resolveUniPtyBackend } from "./resolve.ts";
export type {
  ResolveUniPtyBackendOptions,
} from "./resolve.ts";

export { inspectUniPtyBackend } from "./inspect.ts";
export type {
  InspectUniPtyBackendOptions,
} from "./inspect.ts";

export { autoResolveUniPtyBackend } from "./auto-resolve.ts";
export { isBackendReady, UniPtyBackendSelectionError } from "./auto-resolve.ts";
export type { AutoResolveOptions } from "./auto-resolve.ts";

export { defineUniPtyBackendManifest } from "./manifest.ts";
export type {
  UniPtyBackendManifestInput,
  UniPtyBackendManifestInputEntry,
} from "./manifest.ts";

export type {
  BackendDiagnostic,
  BackendInspectReport,
  BackendModule,
  BackendResolveReport,
  BackendResolvedReport,
  ReadyPtyBackend,
  BackendEndpoint,
  StructuredLaunch,
  UniPtyBackendInitializationError,
  UniPtyBackendManifest,
  UniPtyBackendManifestEntry,
  UniPtyBackendMetadata,
  UniPtyBackendWarning,
} from "./types.ts";
