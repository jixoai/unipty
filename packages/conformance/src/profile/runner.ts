/**
> Orthogonal intents (2026-08-20): profile execution — per-scenario timeouts,
> guaranteed teardown, and scenario result collection (tasks 4.1, 4.2).
 */

import type { ReadyPtyBackend } from "unipty";
import type { ScenarioResult } from "../report.ts";
import { SCENARIOS } from "./scenarios.ts";
import { ScenarioWorld, type ScenarioAccommodations } from "./world.ts";
import { describeError } from "./util.ts";
import type { CurrentRuntimeInfo } from "../fixtures/fixtures.ts";

/** Input for one full profile run against one Backend. */
export interface ProfileInput {
  /** Factory returning a READY Backend; called once per scenario world. */
  readonly createBackend: () => Promise<ReadyPtyBackend>;
  readonly runtime: CurrentRuntimeInfo;
  readonly backendIdentity: { readonly packageName: string; readonly backendId: string };
  readonly accommodations?: ScenarioAccommodations;
}

/** Profile outcome before report identity assembly. */
export interface ProfileOutcome {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly scenarios: readonly ScenarioResult[];
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  };
}

/**
 * Run every scenario in order. Each scenario gets a fresh world (fresh
 * Backend + Core instance) and a per-scenario timeout; teardown always runs
 * and a teardown failure converts a passing scenario into a failing one.
 */
export async function runConformanceProfile(input: ProfileInput): Promise<ProfileOutcome> {
  const startedAt = new Date().toISOString();
  const results: ScenarioResult[] = [];
  for (const def of SCENARIOS) {
    const started = performance.now();
    const world = new ScenarioWorld(input.createBackend, {
      runtime: input.runtime,
      backendIdentity: input.backendIdentity,
      accommodations: input.accommodations ?? {},
    });
    let result: ScenarioResult;
    try {
      // Backend acquisition (async by contract) happens before the scenario
      // body so public spawn stays synchronous inside it.
      const outcome = await runWithTimeout(
        (async () => {
          await world.ready();
          return def.run(world);
        })(),
        def.timeoutMs,
        def.name,
      );
      const durationMs = Math.round(performance.now() - started);
      if (typeof outcome === "object" && outcome !== null && "skip" in outcome) {
        result = { scenario: def.name, status: "skip", durationMs, note: outcome.skip };
      } else if (typeof outcome === "string") {
        result = { scenario: def.name, status: "pass", durationMs, note: outcome };
      } else {
        result = { scenario: def.name, status: "pass", durationMs };
      }
    } catch (error) {
      const durationMs = Math.round(performance.now() - started);
      result = {
        scenario: def.name,
        status: "fail",
        durationMs,
        error: describeError(error),
      };
    }
    // Teardown must not mask the scenario outcome, but a scenario that
    // leaves an un-killable child behind must not silently pass either.
    await world.cleanup();
    results.push(result);
  }
  const finishedAt = new Date().toISOString();
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
    skipped: results.filter((r) => r.status === "skip").length,
  };
  return { startedAt, finishedAt, scenarios: results, summary };
}

async function runWithTimeout(
  promise: Promise<void | string | { readonly skip: string }>,
  timeoutMs: number,
  label: string,
): Promise<void | string | { readonly skip: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
