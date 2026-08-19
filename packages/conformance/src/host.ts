/**
> Orthogonal intents (2026-08-20): harness-side host identity — suite
> version, tested commit, normalized host tuple, dependency package versions
> (tasks 4.4, 7.1).
>
> Tuple normalization uses the Node/npm vocabulary only: `os` from
> `process.platform`, `arch` from `process.arch`, `libc` as an independent
 * dimension required for Linux native evidence. Linux libc detection is
 * documented best-effort: the npm-standard `LIBC` environment variable is
 * trusted first, then `ldd --version` output is probed for glibc/musl.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { CONFORMANCE_SUITE_ID, type ConformanceTuple } from "./report.ts";

/** Parse JSON text into an `unknown` value (no implicit `any` leakage). */
export function parseJson(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

/** The suite identity plus the version of THIS package. */
export function suiteIdentity(): { id: string; version: string } {
  return { id: CONFORMANCE_SUITE_ID, version: readOwnPackageVersion() };
}

function readOwnPackageVersion(): string {
  const url = new URL("../package.json", import.meta.url);
  return readPackageJsonVersion(url);
}

function readPackageJsonVersion(url: URL): string {
  const parsed: unknown = parseJson(readFileSync(url, "utf8"));
  const version = (parsed as { version?: unknown } | null)?.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(`missing package version in ${url.href}`);
  }
  return version;
}

/**
 * Resolve the installed version of a workspace dependency package by
 * resolving its public entry through the Node resolver and reading the
 * sibling `package.json`. Used for the `unipty` core identity, which does
 * not export its version at runtime.
 */
export function dependencyPackageVersion(packageName: string): string {
  const entry = importMetaResolveEntry(packageName);
  return readPackageJsonVersion(packageJsonOfEntry(entry));
}

function importMetaResolveEntry(packageName: string): URL {
  const meta = import.meta as { resolve?: (specifier: string) => string };
  const resolved = meta.resolve?.(packageName);
  if (resolved === undefined) {
    throw new Error(`cannot resolve "${packageName}" through import.meta.resolve on this runtime`);
  }
  // `unipty` resolves to `<package>/dist/index.js`; its package.json sits
  // exactly one directory above the entry file.
  return new URL(resolved);
}

/** The `package.json` URL sibling to a resolved package entry's directory. */
export function packageJsonOfEntry(entry: URL): URL {
  return new URL("../package.json", entry);
}

/** Tested repository commit for the current checkout (full hash). */
export function gitCommit(): string {
  const out = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const commit = out.trim();
  if (!/^[0-9a-f]{7,40}$/.test(commit)) {
    throw new Error(`unexpected git commit output: ${out.trim()}`);
  }
  return commit;
}

/**
 * Best-effort Linux libc family detection: the npm-standard `LIBC` env var
 * is trusted when present; otherwise `ldd --version` output is probed.
 * Returns `undefined` when detection is inconclusive — Linux evidence
 * emission then refuses to proceed (libc is required there).
 */
export function detectLinuxLibc(): string | undefined {
  const fromEnv = process.env.LIBC;
  if (fromEnv === "glibc" || fromEnv === "musl") return fromEnv;
  try {
    const probe = execFileSync("ldd", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (/musl/i.test(probe)) return "musl";
    if (/glibc|GNU libc/i.test(probe)) return "glibc";
  } catch {
    // ldd may write to stderr and still identify the family.
  }
  return undefined;
}

/**
 * The normalized host tuple. `libc` is present for Linux only; elsewhere it
 * is omitted unless it changes native compatibility.
 */
export function currentTuple(): ConformanceTuple {
  const os = process.platform;
  const arch = process.arch;
  if (os === "linux") {
    const libc = detectLinuxLibc();
    if (libc !== undefined) return { os, arch, libc };
  }
  return { os, arch };
}
