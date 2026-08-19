/**
> Orthogonal intents (2026-08-20): runtime-neutral host probes for default
> terminal geometry.
 *
 * Original request (2026-08-17): the public contract is runtime-neutral, so
 * Core accesses `COLUMNS`/`LINES` and the host TTY size through optional
 * global surface probes instead of Node/Bun/Deno-specific imports.
 */

interface HostProcessShape {
  env?: Record<string, string | undefined>;
  stdout?: { isTTY?: boolean; columns?: number; rows?: number };
}

function hostProcess(): HostProcessShape | undefined {
  return (globalThis as { process?: HostProcessShape }).process;
}

/** Core host environment used for default geometry resolution. */
export function hostEnvironment(): Record<string, string | undefined> {
  return hostProcess()?.env ?? {};
}

/**
 * Current host TTY size, or `undefined` when no trustworthy runtime TTY
 * probe exists (non-TTY hosts). Non-positive or fractional probe values
 * are treated as absent.
 */
export function hostTtySize(): { cols?: number; rows?: number } {
  const stdout = hostProcess()?.stdout;
  if (stdout?.isTTY !== true) return {};
  const result: { cols?: number; rows?: number } = {};
  if (isPositiveInteger(stdout.columns)) result.cols = stdout.columns;
  if (isPositiveInteger(stdout.rows)) result.rows = stdout.rows;
  return result;
}

function isPositiveInteger(value: number | undefined): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value > 0 && Number.isFinite(value)
  );
}
