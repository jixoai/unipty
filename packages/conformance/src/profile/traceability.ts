/**
> Orthogonal intents (2026-08-20): requirement-to-scenario traceability for
> the runtime-neutral-pty and pty-backend-seam specs (task 4.5).
>
> Requirement IDs are `<spec>::<Requirement heading>` exactly as written in
> openspec/changes/add-unipty-v1-pty-platform/specs/. Every requirement of
 * both specs must map to at least one named scenario, and every scenario
 * must be referenced by at least one requirement.
 */

import { SCENARIO_NAMES } from "./scenarios.ts";

/**
 * Requirement IDs of the two PTY contract specs that the Core conformance
 * profile automates.
 */
export const PROFILE_SPEC_REQUIREMENTS: readonly string[] = [
  "runtime-neutral-pty::Configured Core and structured launch",
  "runtime-neutral-pty::Terminal geometry resolution",
  "runtime-neutral-pty::Representation-selecting terminal stream",
  "runtime-neutral-pty::Bootstrap output and stream completion",
  "runtime-neutral-pty::Write readiness and advisory backpressure",
  "runtime-neutral-pty::Resize, exit, and non-cascading lifecycle",
  "runtime-neutral-pty::Graceful UniPty disposal",
  "pty-backend-seam::Ready Backend injection",
  "pty-backend-seam::Core-owned public PTY semantics",
  "pty-backend-seam::Ordered native output and independent exit observation",
  "pty-backend-seam::Endpoint input, geometry, and lifecycle controls",
  "pty-backend-seam::Typed Backend extension access",
  "pty-backend-seam::Backend wrapper extensibility",
];

/**
 * The traceability mapping: every requirement above to the named scenarios
 * that verify it through public-surface observations.
 */
export const requirementToScenarios: Readonly<Record<string, readonly string[]>> = {
  "runtime-neutral-pty::Configured Core and structured launch": [
    "seam/synchronous-spawn",
    "launch/structured-argv",
    "launch/empty-argv-rejected",
  ],
  "runtime-neutral-pty::Terminal geometry resolution": [
    "launch/geometry-explicit",
    "launch/geometry-env-fallback",
    "launch/geometry-default-fallback",
    "launch/geometry-partial",
    "launch/geometry-invalid-rejected",
    "errors/invalid-resize",
  ],
  "runtime-neutral-pty::Representation-selecting terminal stream": [
    "stream/utf8-native-or-decoded",
    "stream/bytes-fidelity",
    "stream/one-active",
    "stream/detach-only-view",
  ],
  "runtime-neutral-pty::Bootstrap output and stream completion": [
    "stream/bootstrap-order",
    "lifecycle/close-publishes-closed",
  ],
  "runtime-neutral-pty::Write readiness and advisory backpressure": [
    "input/write-read",
    "input/write-readiness",
    "input/backpressure-saturation",
  ],
  "runtime-neutral-pty::Resize, exit, and non-cascading lifecycle": [
    "resize/accepted-and-observed",
    "errors/invalid-resize",
    "lifecycle/close-publishes-closed",
    "lifecycle/close-no-terminate",
    "lifecycle/terminate-no-close",
    "lifecycle/terminate-idempotent",
    "lifecycle/exited-independent",
  ],
  "runtime-neutral-pty::Graceful UniPty disposal": ["disposal/graceful"],
  "pty-backend-seam::Ready Backend injection": ["seam/synchronous-spawn", "disposal/graceful"],
  "pty-backend-seam::Core-owned public PTY semantics": [
    "stream/one-active",
    "stream/detach-only-view",
    "stream/bootstrap-order",
  ],
  "pty-backend-seam::Ordered native output and independent exit observation": [
    "stream/utf8-native-or-decoded",
    "stream/bytes-fidelity",
    "stream/detach-only-view",
    "lifecycle/exited-independent",
  ],
  "pty-backend-seam::Endpoint input, geometry, and lifecycle controls": [
    "input/write-read",
    "input/write-readiness",
    "input/backpressure-saturation",
    "errors/invalid-resize",
    "resize/accepted-and-observed",
    "lifecycle/terminate-no-close",
    "lifecycle/terminate-idempotent",
    "lifecycle/close-no-terminate",
  ],
  "pty-backend-seam::Typed Backend extension access": ["capability/token-identity"],
  "pty-backend-seam::Backend wrapper extensibility": [
    "resize/accepted-and-observed",
    "capability/token-identity",
  ],
};

/** Traceability check outcome. */
export interface TraceabilityCheck {
  readonly ok: boolean;
  readonly gaps: readonly string[];
}

/**
 * Check the mapping against the implemented scenario list and the spec
 * requirement list. Optionally validate a custom mapping (used by the
 * canary test that proves deliberate gaps fail the check).
 */
export function runTraceabilityCheck(
  mapping: Readonly<Record<string, readonly string[]>> = requirementToScenarios,
  scenarioNames: readonly string[] = SCENARIO_NAMES,
  knownRequirements: readonly string[] = PROFILE_SPEC_REQUIREMENTS,
): TraceabilityCheck {
  const gaps: string[] = [];
  for (const requirement of knownRequirements) {
    const scenarios = mapping[requirement];
    if (scenarios === undefined || scenarios.length === 0) {
      gaps.push(`requirement "${requirement}" has no named conformance scenario`);
      continue;
    }
    for (const scenario of scenarios) {
      if (!scenarioNames.includes(scenario)) {
        gaps.push(`requirement "${requirement}" references unknown scenario "${scenario}"`);
      }
    }
  }
  for (const scenario of scenarioNames) {
    const referenced = Object.values(mapping).some((list) => list.includes(scenario));
    if (!referenced) gaps.push(`scenario "${scenario}" is not referenced by any requirement`);
  }
  return { ok: gaps.length === 0, gaps };
}
