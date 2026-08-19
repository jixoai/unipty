/**
> Orthogonal intents (2026-08-20): deterministic child fixture registry and
> runtime-detecting child argv construction (task 1.5).
>
> The .mjs fixtures are runtime-neutral (only `process.*` and Web globals) so
> the same file runs as a child under Node, Bun, and Deno. Deno needs NO
> permissions for these programs (`deno run fixture.mjs` — no net/fs/env
> access), so no `--allow-*` flags are required.
 */

import { fileURLToPath } from "node:url";

/** Fixture names understood by {@link childArgv} and the conformance profile. */
export type FixtureName =
  | "marker"
  | "echo-stream"
  | "report-size"
  | "exit-code"
  | "sleep-forever"
  | "utf8-split"
  | "flood"
  | "args-echo";

/** One registry record: the fixture file next to this module plus a summary. */
export interface FixtureRecord {
  /** File name inside `src/fixtures/`. */
  readonly file: string;
  /** What the fixture observes through public PTY behaviour. */
  readonly summary: string;
}

/** The deterministic child fixture registry. */
export const FIXTURES: Readonly<Record<FixtureName, FixtureRecord>> = {
  marker: {
    file: "marker.mjs",
    summary: "writes MARKER-START/MARKER-END then exits 0",
  },
  "echo-stream": {
    file: "echo-stream.mjs",
    summary: "pipes stdin to stdout forever; never exits on EOF",
  },
  "report-size": {
    file: "report-size.mjs",
    summary: "reports child-viewed geometry as SIZE cols rows lines on change",
  },
  "exit-code": {
    file: "exit-code.mjs",
    summary: "exits with argv[2] code (default 0)",
  },
  "sleep-forever": {
    file: "sleep-forever.mjs",
    summary: "stays alive producing no output",
  },
  "utf8-split": {
    file: "utf8-split.mjs",
    summary: "writes multibyte text in 3-byte pieces every 30ms, then UTF8-DONE",
  },
  flood: {
    file: "flood.mjs",
    summary: "writes ~8.6 MiB of patterned lines, then FLOOD-DONE, exit 0",
  },
  "args-echo": {
    file: "args-echo.mjs",
    summary: "writes each argv value on its own line, then exits 0",
  },
};

/** Exact marker fixture output (harness oracle). */
export const MARKER_TEXT = "MARKER-START\nMARKER-END\n";

/** Exact utf8-split fixture text, mirrored from src/fixtures/utf8-split.mjs. */
export const UTF8_SPLIT_TEXT =
  "utf8開始🎉この行は分割される\n第二行：漢字と絵文字🚀混在\nfin🎉fin\n";

/** Final line written by the utf8-split fixture. */
export const UTF8_SPLIT_TAIL = "UTF8-DONE\n";

/** Final line written by the flood fixture. */
export const FLOOD_TAIL = "FLOOD-DONE\n";

/** Flood pattern parameters, mirrored from src/fixtures/flood.mjs. */
export interface FloodSpec {
  readonly lineCount: number;
  readonly indexWidth: number;
  readonly padWidth: number;
}

/** Exact flood pattern parameters (harness oracle). */
export const FLOOD_SPEC: FloodSpec = {
  lineCount: 120000,
  indexWidth: 8,
  padWidth: 56,
};

/** Bytes per flood line: "FLOOD-" + index + "-" + padding + "\n". */
export function floodLineLength(spec: FloodSpec = FLOOD_SPEC): number {
  return "FLOOD-".length + spec.indexWidth + 1 + spec.padWidth + 1;
}

/** Build the exact expected flood body (without the FLOOD-DONE tail). */
export function buildFloodExpected(spec: FloodSpec = FLOOD_SPEC): string {
  const parts: string[] = [];
  for (let i = 0; i < spec.lineCount; i += 1) {
    parts.push(
      "FLOOD-" + String(i).padStart(spec.indexWidth, "0") + "-" + "P".repeat(spec.padWidth) + "\n",
    );
  }
  return parts.join("");
}

/** Absolute file URL of one fixture. */
export function fixtureFileUrl(name: FixtureName): URL {
  return new URL(`./${FIXTURES[name].file}`, import.meta.url);
}

/** The runtime names the harness distinguishes. */
export type ConformanceRuntimeName = "node" | "bun" | "deno";

/** The runtime currently executing the harness (children use the same one). */
export interface CurrentRuntimeInfo {
  readonly name: ConformanceRuntimeName;
  readonly version: string;
  readonly execPath: string;
}

/** Structural Deno global lookup; keeps the module runtime-neutral. */
type DenoGlobalShape = { execPath?: () => string; version?: { deno?: string } };

function denoGlobal(): DenoGlobalShape | undefined {
  return (globalThis as { Deno?: DenoGlobalShape }).Deno;
}

/**
 * Detect the runtime executing this harness. Deno is detected through its
 * global first (Deno also exposes a Node-compat `process`), then Bun through
 * `process.versions.bun`, otherwise Node.
 */
export function detectCurrentRuntime(): CurrentRuntimeInfo {
  const deno = denoGlobal();
  if (deno !== undefined) {
    const version = deno.version?.deno;
    const execPath = deno.execPath?.();
    if (typeof version === "string" && typeof execPath === "string") {
      return { name: "deno", version, execPath };
    }
  }
  const processShape = (
    globalThis as { process?: { versions?: { bun?: string; node?: string }; execPath?: string } }
  ).process;
  if (processShape?.versions?.bun !== undefined) {
    return {
      name: "bun",
      version: processShape.versions.bun,
      execPath: processShape.execPath ?? "bun",
    };
  }
  const nodeVersion = processShape?.versions?.node;
  if (nodeVersion === undefined || processShape?.execPath === undefined) {
    throw new Error(
      "conformance harness requires Node, Bun, or Deno with a resolvable executable path",
    );
  }
  return { name: "node", version: nodeVersion, execPath: processShape.execPath };
}

/**
 * Build the executable argv that runs one fixture under the CURRENT runtime
 * with the given user args:
 * - node/bun: `[execPath, fixtureFile]`
 * - deno: `[execPath, "run", "-A", fixtureFile]` — the fixtures are
 *   first-party harness programs, and several of their probes are
 *   permission-gated APIs under Deno (`process.env` reads prompt for
 *   `--allow-env`, `node:child_process` spawns need run/read); an
 *   ungranted child would block on an interactive permission prompt
 *   inside the PTY instead of running.
 */
export function childArgv(fixture: FixtureName, args: readonly string[] = []): string[] {
  const runtime = detectCurrentRuntime();
  const file = fileURLToPath(fixtureFileUrl(fixture));
  if (runtime.name === "deno") {
    return [runtime.execPath, "run", "-A", file, ...args];
  }
  return [runtime.execPath, file, ...args];
}
