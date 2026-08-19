/**
> Orthogonal intents (2026-08-20): child-pid discovery for terminate-
> without-close on the @sigma/pty-ffi substrate, plus a test-only seam.
 *
 * The substrate forks the child internally without exposing its pid; the
 * discovery lists this process's direct children (pgrep) around the
 * synchronous spawn and diffs. The seam module is package-internal and never
 * re-exported from the public entry.
 */

import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Child-pid discovery (terminate-without-close support)
// ---------------------------------------------------------------------------

/**
 * Pids of this process's direct children (synchronous: spawn() must stay
 * synchronous, so the OS listing runs through node:child_process, which
 * Deno provides). `undefined` means discovery is unavailable (missing
 * pgrep); an empty set means the listing worked and no children exist.
 */
export function listDirectChildPids(): Set<number> | undefined {
  const self = (globalThis as { Deno?: { pid?: number } }).Deno?.pid;
  if (self === undefined) return undefined;
  try {
    const out = execFileSync("pgrep", ["-P", String(self)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pids = new Set<number>();
    for (const line of out.split("\n")) {
      const pid = Number.parseInt(line, 10);
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
    return pids;
  } catch (cause) {
    // pgrep exits 1 for "no children" — a valid empty listing; anything
    // else (tool missing on non-POSIX hosts) disables discovery.
    if (
      cause instanceof Error &&
      "status" in cause &&
      (cause as { status?: number }).status === 1
    ) {
      return new Set<number>();
    }
    return undefined;
  }
}

/**
 * The substrate forks the child internally without exposing its pid. The
 * synchronous spawn wraps a synchronous fork, so diffing this process's
 * direct children across it identifies the new pid; ambiguity or an
 * unavailable listing yields `undefined` and terminate() falls back to the
 * substrate teardown primitive.
 */
function discoverSpawnedChildPid(before: Set<number> | undefined): number | undefined {
  if (discoveryOverride !== null) return discoveryOverride(before);
  if (before === undefined) return undefined;
  const after = listDirectChildPids();
  if (after === undefined) return undefined;
  const candidates = [...after].filter((pid) => !before.has(pid));
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Test-only discovery override (see endpoint tests); production is null. */
let discoveryOverride: ((before: Set<number> | undefined) => number | undefined) | null = null;

/** @internal Test seam: replace pid discovery to exercise degraded hosts. */
export function __setPidDiscoveryForTests(
  override: ((before: Set<number> | undefined) => number | undefined) | null,
): void {
  discoveryOverride = override;
}

export function discoverSpawnedChildPidSafe(before: Set<number> | undefined): number | undefined {
  if (discoveryOverride !== null) return discoveryOverride(before);
  return discoverSpawnedChildPid(before);
}
