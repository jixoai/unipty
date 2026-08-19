/**
> Orthogonal intents (2026-08-20): runtime analysis for AutoResolve and
 * target prefiltering.
 *
 * Original request (2026-08-17): the acquisition layer is runtime-first and
 * uses normalized Node/npm platform vocabulary (`os` follows
 * `process.platform`/npm `os`, `arch` follows `process.arch`/npm `cpu`, and
 * `libc` is a separate Linux-only native-library dimension). Adapters
 * normalize Bun and Deno values instead of inventing combined strings.
 */

import { UniPtyError } from "unipty";

/** Normalized analysis of the host running the acquisition layer. */
export interface RuntimeEnvironment {
  readonly runtime: "node" | "bun" | "deno";
  readonly version: string;
  /** Normalized `process.platform`/npm `os` token, e.g. `darwin`, `linux`, `win32`. */
  readonly os: string;
  /** Normalized `process.arch`/npm `cpu` token, e.g. `arm64`, `x64`. */
  readonly arch: string;
  /** `glibc`/`musl`; present only for Linux hosts where it could be detected. */
  readonly libc?: string;
}

interface ProcessLike {
  readonly versions?: Readonly<Record<string, unknown>>;
  readonly platform?: unknown;
  readonly arch?: unknown;
  readonly report?: {
    readonly getReport?: () => {
      readonly header?: Readonly<Record<string, unknown>>;
    };
  };
}

interface DenoLike {
  readonly version: { readonly deno: string };
  readonly build: { readonly os: string; readonly arch: string };
}

/** Deno `build.os` → normalized `process.platform` token. */
function mapDenoOs(os: string): string {
  if (os === "windows") {
    return "win32";
  }
  if (os === "solaris") {
    return "sunos";
  }
  return os;
}

/** Deno `build.arch` → normalized `process.arch` token. */
function mapDenoArch(arch: string): string {
  if (arch === "x86_64") {
    return "x64";
  }
  if (arch === "aarch64") {
    return "arm64";
  }
  return arch;
}

function isDenoLike(value: unknown): value is DenoLike {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<DenoLike>;
  return (
    typeof candidate.version === "object" &&
    candidate.version !== null &&
    typeof candidate.version.deno === "string" &&
    typeof candidate.build === "object" &&
    candidate.build !== null &&
    typeof candidate.build.os === "string" &&
    typeof candidate.build.arch === "string"
  );
}

/**
 * Detect the libc flavor for Linux hosts. Returns `glibc` when the Node
 * process report exposes `glibcVersionRuntime`; otherwise the flavor is
 * unknown and the property is omitted so that `libc`-restricted target
 * declarations simply do not match instead of matching wrongly.
 */
function detectLibc(os: string): { libc?: string } {
  if (os !== "linux") {
    return {};
  }
  const proc = (globalThis as { process?: ProcessLike }).process;
  try {
    const header = proc?.report?.getReport?.().header;
    if (header !== undefined && "glibcVersionRuntime" in header) {
      return { libc: "glibc" };
    }
  } catch {
    // A failing report probe means the flavor is unknown, not absent.
  }
  return {};
}

function platformOf(proc: ProcessLike | undefined, fallback: string): string {
  return typeof proc?.platform === "string" ? proc.platform : fallback;
}

function archOf(proc: ProcessLike | undefined, fallback: string): string {
  return typeof proc?.arch === "string" ? proc.arch : fallback;
}

/**
 * Analyze the current runtime into normalized Node/npm vocabulary.
 *
 * Detection order matters: Bun exposes `process.versions.bun`, Deno exposes
 * the `Deno` global while also implementing the Node `process` compat layer,
 * and plain Node exposes `process.versions.node`.
 */
export function analyzeRuntime(): RuntimeEnvironment {
  const proc = (globalThis as { process?: ProcessLike }).process;
  const versions = proc?.versions;
  const bunVersion = versions?.bun;
  const denoGlobal = (globalThis as { Deno?: unknown }).Deno;
  const nodeVersion = versions?.node;

  if (typeof bunVersion === "string") {
    const os = platformOf(proc, "unknown");
    return {
      runtime: "bun",
      version: bunVersion,
      os,
      arch: archOf(proc, "unknown"),
      ...detectLibc(os),
    };
  }

  if (isDenoLike(denoGlobal)) {
    const os = mapDenoOs(denoGlobal.build.os);
    return {
      runtime: "deno",
      version: denoGlobal.version.deno,
      os,
      arch: mapDenoArch(denoGlobal.build.arch),
      ...detectLibc(os),
    };
  }

  if (typeof nodeVersion === "string") {
    const os = platformOf(proc, "unknown");
    return {
      runtime: "node",
      version: nodeVersion,
      os,
      arch: archOf(proc, "unknown"),
      ...detectLibc(os),
    };
  }

  throw new UniPtyError(
    "unsupported",
    "Cannot analyze the current runtime: it exposes neither Bun, Deno, nor Node identity",
  );
}
