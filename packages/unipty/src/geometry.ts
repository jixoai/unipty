/**
> Orthogonal intents (2026-08-20): character-cell geometry validation and
> per-dimension default resolution.
 *
 * Original request (2026-08-17): omitted dimensions resolve independently as
 * explicit value, valid Core-host `COLUMNS`/`LINES`, trustworthy host TTY,
 * then `80 x 24`; explicitly invalid values fail with `invalid-argument`.
 */

import { UniPtyError } from "./errors.ts";
import { hostEnvironment, hostTtySize } from "./host.ts";

/** Portable final fallback dimensions. */
export const DEFAULT_TERMINAL_COLS = 80;
export const DEFAULT_TERMINAL_ROWS = 24;

/** A finite positive integer character-cell count. */
export function isValidCellCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  );
}

function parseEnvironmentDimension(name: "COLUMNS" | "LINES"): number | undefined {
  const raw = hostEnvironment()[name];
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw)) return undefined;
  const value = Number(raw);
  return isValidCellCount(value) ? value : undefined;
}

/**
 * Resolve one dimension independently:
 * explicit value -> valid host-environment value -> trustworthy host TTY
 * -> portable default. An explicitly supplied invalid value fails.
 */
function resolveDimension(
  dimension: "cols" | "rows",
  explicit: number | undefined,
  environmentName: "COLUMNS" | "LINES",
  ttyValue: number | undefined,
  fallback: number,
): number {
  if (explicit !== undefined) {
    if (!isValidCellCount(explicit)) {
      throw new UniPtyError("invalid-argument", `terminal.${dimension} must be a finite positive integer`, {
        details: { dimension, value: explicit },
      });
    }
    return explicit;
  }
  const fromEnvironment = parseEnvironmentDimension(environmentName);
  if (fromEnvironment !== undefined) return fromEnvironment;
  if (ttyValue !== undefined) return ttyValue;
  return fallback;
}

/** Validate an already-explicit pair (resize path). */
export function validateCellPair(cols: unknown, rows: unknown): { cols: number; rows: number } {
  if (!isValidCellCount(cols) || !isValidCellCount(rows)) {
    throw new UniPtyError("invalid-argument", "cols and rows must be finite positive integers", {
      details: { cols, rows },
    });
  }
  return { cols, rows };
}

/** Resolve the initial geometry for a structured launch. */
export function resolveInitialGeometry(terminal?: {
  cols?: number;
  rows?: number;
}): { cols: number; rows: number } {
  const tty = hostTtySize();
  const cols = resolveDimension("cols", terminal?.cols, "COLUMNS", tty.cols, DEFAULT_TERMINAL_COLS);
  const rows = resolveDimension("rows", terminal?.rows, "LINES", tty.rows, DEFAULT_TERMINAL_ROWS);
  return { cols, rows };
}
