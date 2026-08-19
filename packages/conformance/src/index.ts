/**
> Orthogonal intents (2026-08-20): @unipty/conformance private harness entry
> (tasks 4.1-4.5, 7.1, 7.2).
>
 * Public surface for CI, tests, and tooling: fixture registry, conformance
 * profile, traceability, report format, Verification Evidence writer, and
 * release catalog aggregator.
 */

// Deterministic child fixtures and runtime-detecting child argv (task 1.5).
export {
  buildFloodExpected,
  childArgv,
  detectCurrentRuntime,
  fixtureFileUrl,
  FLOOD_SPEC,
  FLOOD_TAIL,
  FIXTURES,
  floodLineLength,
  MARKER_TEXT,
  UTF8_SPLIT_TAIL,
  UTF8_SPLIT_TEXT,
} from "./fixtures/fixtures.ts";
export type {
  ConformanceRuntimeName as FixtureRuntimeName,
  CurrentRuntimeInfo,
  FixtureName,
  FixtureRecord,
  FloodSpec,
} from "./fixtures/fixtures.ts";

// Host identity: suite version, commit, normalized tuple (tasks 4.4, 7.1).
export { currentTuple, dependencyPackageVersion, gitCommit, suiteIdentity } from "./host.ts";

// Conformance report format and validation (task 4.4).
export {
  buildConformanceReport,
  CONFORMANCE_REPORT_VERSION,
  CONFORMANCE_SUITE_ID,
  summarizeScenarios,
  validateConformanceReport,
} from "./report.ts";
export type {
  ConformanceReport,
  ConformanceReportInput,
  ConformanceReportSummary,
  ConformanceRuntimeInfo,
  ConformanceRuntimeName,
  ConformanceTuple,
  ReportValidation,
  ScenarioResult,
} from "./report.ts";

// Positive Verification Evidence writer (task 7.1).
export {
  emitVerificationEvidence,
  EVIDENCE_VERSION,
  validateVerificationEvidence,
} from "./evidence.ts";
export type { EvidenceEmitOptions, EvidenceValidation, VerificationEvidence } from "./evidence.ts";

// Backend metadata snapshot validation (local mirror of the public protocol).
export { validateUniPtyBackendMetadataSnapshot } from "./metadata.ts";
export type { MetadataValidation } from "./metadata.ts";

// Deterministic release catalog aggregation and presentation states (task 7.2).
export {
  aggregateCatalog,
  canonicalize,
  CATALOG_VERSION,
  CatalogError,
  derivePresentationState,
  OFFICIAL_ROUTE_PACKAGES,
  serializeDeterministicJson,
} from "./catalog.ts";
export type {
  AggregateCatalogInput,
  AggregateCatalogResult,
  CatalogMetadataSnapshot,
  PresentationQuery,
  PresentationState,
  ReleaseCatalog,
} from "./catalog.ts";

// Backend-agnostic Core conformance profile (tasks 4.1, 4.2).
export { runConformanceProfile } from "./profile/runner.ts";
export type { ProfileInput, ProfileOutcome } from "./profile/runner.ts";
export { SCENARIOS, SCENARIO_NAMES } from "./profile/scenarios.ts";
export { ScenarioWorld } from "./profile/world.ts";
export type { ProfileContext, ScenarioAccommodations } from "./profile/world.ts";

// Requirement-to-scenario traceability (task 4.5).
export {
  PROFILE_SPEC_REQUIREMENTS,
  requirementToScenarios,
  runTraceabilityCheck,
} from "./profile/traceability.ts";
export type { TraceabilityCheck } from "./profile/traceability.ts";
