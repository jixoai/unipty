/**
> Orthogonal intents (2026-08-20): caller-rooted pure single-package
 * resolution without imports or filesystem scanning.
 *
 * Original request (2026-08-17): `resolveUniPtyBackend(packageName, { from })`
 * processes exactly one package specifier, requires a caller-owned `from`
 * base, and reports locations plus structured diagnostics. It never imports
 * the package, writes console output, or walks `node_modules` by hand.
 */

import { createRequire } from "node:module";
import { statSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { throwInvalidArgument } from "unipty";
import type { BackendDiagnostic, BackendResolveReport } from "./types.ts";

/** Options for pure single-package resolution. */
export interface ResolveUniPtyBackendOptions {
  /** Caller-owned resolution base: a file URL, URL string, or absolute/relative path. */
  readonly from: URL | string;
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }
  return undefined;
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function parseUrlString(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

/**
 * Normalize a caller `from` value into a `file:` URL usable as a
 * `createRequire` base. Directory bases (trailing separator or an existing
 * directory) keep an explicit trailing slash so package lookup starts in that
 * directory's `node_modules`. Node, Bun, and Deno all accept this form.
 */
export function normalizeFromBase(from: URL | string): URL {
  const invalid = (): never =>
    throwInvalidArgument(
      "resolveUniPtyBackend requires a valid caller-owned `from` (file URL, URL string, or filesystem path)",
      { from: from instanceof URL ? from.href : from },
    );

  if (from instanceof URL) {
    if (from.protocol !== "file:") {
      invalid();
    }
    return from;
  }

  if (typeof from !== "string" || from.length === 0) {
    invalid();
  }

  if (from.startsWith("file:")) {
    const parsed = parseUrlString(from);
    if (parsed === undefined) {
      return invalid();
    }
    return parsed;
  }

  const absolute = resolvePath(from);
  let isDirectory = from.endsWith("/") || from.endsWith("\\");
  if (!isDirectory) {
    try {
      isDirectory = statSync(absolute).isDirectory();
    } catch {
      // A non-existent path is treated as a file base; package lookup still
      // walks upward from its directory.
    }
  }
  const url = pathToFileURL(absolute);
  if (isDirectory && !url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url;
}

/**
 * Resolve exactly one package specifier relative to a caller-owned base.
 *
 * Runtime adapter decision: all three runtimes use the Node-compat
 * `node:module` `createRequire(from).resolve()` algorithm. Deno 2.9 exposes
 * no `Deno.resolveNpmImport`, and Deno's `import.meta.resolve` takes no
 * parent parameter (it roots at this package's own module, which would
 * violate caller-rooted resolution), while `createRequire` resolves npm
 * packages from a `node_modules` layout under Node, Bun, and Deno alike.
 *
 * The report maps native resolver failures onto `unresolved` with
 * `reason: "missing"` (native `MODULE_NOT_FOUND`) or `"invalid"` (any other
 * native failure, e.g. `ERR_PACKAGE_PATH_NOT_EXPORTED`). A package that
 * resolves but does not expose `./unipty.metadata` is still `resolved`, with
 * `metadataUrl` absent and a diagnostic explaining the unavailable subpath.
 * Pure resolution never imports a module and never writes console output.
 */
export async function resolveUniPtyBackend(
  packageName: string,
  options: ResolveUniPtyBackendOptions,
): Promise<BackendResolveReport> {
  if (typeof packageName !== "string" || packageName.trim().length === 0) {
    throwInvalidArgument("resolveUniPtyBackend requires a non-empty package name string", {
      packageName,
    });
  }
  if (options === null || typeof options !== "object" || !("from" in options)) {
    throwInvalidArgument(
      "resolveUniPtyBackend requires an options object with a caller-owned `from`",
      { options },
    );
  }
  const base = normalizeFromBase(options.from);
  const requireFromCaller = createRequire(base);

  let packagePath: string;
  try {
    packagePath = requireFromCaller.resolve(packageName);
  } catch (error) {
    const nativeCode = errorCodeOf(error);
    const reason =
      nativeCode === "MODULE_NOT_FOUND" || nativeCode === "ERR_MODULE_NOT_FOUND"
        ? "missing"
        : "invalid";
    const diagnostics: BackendDiagnostic[] = [
      {
        code: nativeCode ?? "resolve-failed",
        message: errorMessageOf(error),
        cause: error,
      },
    ];
    return { status: "unresolved", packageName, reason, diagnostics };
  }

  const packageUrl = pathToFileURL(packagePath).href;
  const metadataDiagnostics: BackendDiagnostic[] = [];
  let metadataUrl: string | undefined;
  try {
    metadataUrl = pathToFileURL(requireFromCaller.resolve(`${packageName}/unipty.metadata`)).href;
  } catch (error) {
    metadataDiagnostics.push({
      code: "metadata-subpath-unavailable",
      message: `Package "${packageName}" does not expose the ./unipty.metadata subpath (${errorCodeOf(error) ?? "resolve-failed"})`,
      cause: error,
    });
  }

  if (metadataUrl === undefined) {
    return {
      status: "resolved",
      packageName,
      packageUrl,
      diagnostics: metadataDiagnostics,
    };
  }
  return {
    status: "resolved",
    packageName,
    packageUrl,
    metadataUrl,
    diagnostics: metadataDiagnostics,
  };
}
