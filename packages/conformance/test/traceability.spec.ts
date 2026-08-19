/**
 * Traceability tests (task 4.5): every automated requirement of the two PTY
 * contract specs maps to named scenarios; deliberate gaps fail the check.
 */

import { describe, expect, it } from "vitest";
import {
  PROFILE_SPEC_REQUIREMENTS,
  requirementToScenarios,
  runTraceabilityCheck,
} from "../src/profile/traceability.ts";
import { SCENARIO_NAMES } from "../src/profile/scenarios.ts";

describe("requirement-to-scenario traceability", () => {
  it("covers every profile spec requirement", () => {
    expect(PROFILE_SPEC_REQUIREMENTS.length).toBe(13);
    const check = runTraceabilityCheck();
    expect(check.gaps).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it("references only implemented scenario names", () => {
    const known = new Set(SCENARIO_NAMES);
    for (const scenarios of Object.values(requirementToScenarios)) {
      for (const scenario of scenarios) {
        expect(known.has(scenario)).toBe(true);
      }
    }
  });

  it("references every scenario from at least one requirement", () => {
    const referenced = new Set(Object.values(requirementToScenarios).flat());
    for (const scenario of SCENARIO_NAMES) {
      expect(referenced.has(scenario)).toBe(true);
    }
  });

  it("canary: an unmapped requirement fails the check", () => {
    const mapping = { ...requirementToScenarios };
    delete mapping[PROFILE_SPEC_REQUIREMENTS[0] as string];
    const check = runTraceabilityCheck(mapping);
    expect(check.ok).toBe(false);
    expect(check.gaps.join(" ")).toContain(PROFILE_SPEC_REQUIREMENTS[0] as string);
  });

  it("canary: a mapping to an unknown scenario name fails the check", () => {
    const mapping = {
      ...requirementToScenarios,
      [PROFILE_SPEC_REQUIREMENTS[0] as string]: ["launch/does-not-exist"],
    };
    const check = runTraceabilityCheck(mapping);
    expect(check.ok).toBe(false);
    expect(check.gaps.join(" ")).toContain("unknown scenario");
  });

  it("canary: an unreferenced scenario fails the check", () => {
    const check = runTraceabilityCheck(requirementToScenarios, [
      ...SCENARIO_NAMES,
      "orphan/scenario",
    ]);
    expect(check.ok).toBe(false);
    expect(check.gaps.join(" ")).toContain("not referenced by any requirement");
  });
});
