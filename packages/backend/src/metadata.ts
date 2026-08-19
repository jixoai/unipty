/**
> Orthogonal intents (2026-08-20): versioned Backend Metadata Protocol
 * validation.
 *
 * Original request (2026-08-17): side-effect-free metadata declares package
 * identity, Backend identity, the mandatory factory export, Core protocol
 * majors, and target tuples. It never claims maturity, verified support,
 * capabilities, asset layout, or official/community credentials.
 */

import type { UniPtyBackendMetadata } from "./types.ts";

/** One located validation problem, addressed by a stable JSON-like path. */
export interface MetadataValidationIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * Thrown by `validateUniPtyBackendMetadata()` when the value does not satisfy
 * the versioned minimum schema or carries a forbidden claim field. The message
 * is structured (`path: reason` pairs joined by `; `); callers map `issues`
 * onto report diagnostics.
 */
export class MetadataValidationError extends Error {
  readonly issues: readonly MetadataValidationIssue[];

  constructor(issues: readonly MetadataValidationIssue[]) {
    super(
      `Invalid UniPty Backend metadata: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "MetadataValidationError";
    this.issues = issues;
  }
}

/**
 * Key substrings that identify forbidden claim vocabulary anywhere in a
 * metadata value: maturity labels, verification/support claims, capability
 * lists, asset layout, and official/community credentials. Metadata is a
 * declaration; the repository-owned release catalog owns evidence.
 */
const FORBIDDEN_KEY_SUBSTRINGS: readonly string[] = [
  "verified",
  "maturity",
  "official",
  "community",
  "support",
  "capabilit",
  "asset",
];

const TARGET_RUNTIME_TOKENS: readonly string[] = ["node", "bun", "deno"];

const PROVENANCE_KINDS: readonly string[] = ["runtime-native", "third-party", "external-system"];

const TOP_LEVEL_KEYS: readonly string[] = [
  "schema",
  "package",
  "backend",
  "protocol",
  "targets",
  "provenance",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function forbiddenKeySubstring(key: string): string | undefined {
  const lower = key.toLowerCase();
  return FORBIDDEN_KEY_SUBSTRINGS.find((token) => lower.includes(token));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isVersionString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !/\s/.test(value);
}

function checkKeySet(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  issues: MetadataValidationIssue[],
): void {
  for (const key of Object.keys(value)) {
    const forbidden = forbiddenKeySubstring(key);
    if (forbidden !== undefined) {
      issues.push({
        path: path === "" ? key : `${path}.${key}`,
        message: `forbidden metadata claim field (contains "${forbidden}")`,
      });
      continue;
    }
    if (!allowedKeys.includes(key)) {
      issues.push({
        path: path === "" ? key : `${path}.${key}`,
        message: "unknown field",
      });
    }
  }
}

function checkStringArray(value: unknown, path: string, issues: MetadataValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "must be an array of non-empty strings" });
    return;
  }
  if (value.length === 0) {
    issues.push({ path, message: "must not be empty" });
    return;
  }
  for (const [index, entry] of value.entries()) {
    if (!isNonEmptyString(entry)) {
      issues.push({
        path: `${path}[${index}]`,
        message: "must be a non-empty string without surrounding whitespace",
      });
    }
  }
}

/**
 * Validate one value against the versioned minimum Backend Metadata schema.
 *
 * Returns the same value typed as `UniPtyBackendMetadata` when every rule
 * passes; otherwise throws a `MetadataValidationError` whose `issues` list
 * every located problem. The validator never imports modules, initializes
 * native resources, or mutates the input.
 */
export function validateUniPtyBackendMetadata(value: unknown): UniPtyBackendMetadata {
  const issues: MetadataValidationIssue[] = [];

  if (!isPlainObject(value)) {
    throw new MetadataValidationError([
      { path: "<root>", message: "metadata must be a non-empty object" },
    ]);
  }

  // Top level: exact known key set plus optional provenance.
  checkKeySet(value, TOP_LEVEL_KEYS, "", issues);

  // schema: literal 1 of the versioned minimum schema.
  if (!("schema" in value)) {
    issues.push({ path: "schema", message: "required field is missing" });
  } else if (value.schema !== 1) {
    issues.push({
      path: "schema",
      message: "must be the number 1 (the only supported metadata schema)",
    });
  }

  // package: normalized package identity.
  const pkg = value.package;
  if (!isPlainObject(pkg)) {
    issues.push({ path: "package", message: "required object is missing or not an object" });
  } else {
    checkKeySet(pkg, ["name", "version"], "package", issues);
    if (!isNonEmptyString(pkg.name)) {
      issues.push({
        path: "package.name",
        message: "must be a non-empty string without surrounding whitespace",
      });
    }
    if (!isVersionString(pkg.version)) {
      issues.push({
        path: "package.version",
        message: "must be a non-empty version-like string without whitespace",
      });
    }
  }

  // backend: Backend identity plus the mandatory factory export name.
  const backend = value.backend;
  if (!isPlainObject(backend)) {
    issues.push({ path: "backend", message: "required object is missing or not an object" });
  } else {
    checkKeySet(backend, ["id", "factoryExport"], "backend", issues);
    if (!isNonEmptyString(backend.id)) {
      issues.push({
        path: "backend.id",
        message: "must be a non-empty string without surrounding whitespace",
      });
    }
    if (!isNonEmptyString(backend.factoryExport)) {
      issues.push({
        path: "backend.factoryExport",
        message: "must be a non-empty string without surrounding whitespace",
      });
    }
  }

  // protocol: non-empty unique positive integer Core protocol majors.
  const protocol = value.protocol;
  if (!isPlainObject(protocol)) {
    issues.push({ path: "protocol", message: "required object is missing or not an object" });
  } else {
    checkKeySet(protocol, ["core"], "protocol", issues);
    const core = protocol.core;
    if (!Array.isArray(core) || core.length === 0) {
      issues.push({
        path: "protocol.core",
        message: "must be a non-empty array of positive integer Core protocol majors",
      });
    } else {
      for (const [index, major] of core.entries()) {
        if (typeof major !== "number" || !Number.isInteger(major) || major <= 0) {
          issues.push({
            path: `protocol.core[${index}]`,
            message: "must be a positive integer",
          });
        }
      }
      const unique = new Set(core);
      if (unique.size !== core.length) {
        issues.push({
          path: "protocol.core",
          message: "must not contain duplicate protocol majors",
        });
      }
    }
  }

  // targets: non-empty declarations for side-effect-free prefiltering.
  const targets = value.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    issues.push({
      path: "targets",
      message: "must be a non-empty array of target declarations",
    });
  } else {
    for (const [index, target] of targets.entries()) {
      const path = `targets[${index}]`;
      if (!isPlainObject(target)) {
        issues.push({ path, message: "must be an object" });
        continue;
      }
      checkKeySet(target, ["runtime", "os", "arch", "libc"], path, issues);
      if (!("runtime" in target)) {
        issues.push({ path: `${path}.runtime`, message: "required field is missing" });
      } else if (
        !isNonEmptyString(target.runtime) ||
        !TARGET_RUNTIME_TOKENS.includes(target.runtime)
      ) {
        issues.push({
          path: `${path}.runtime`,
          message: `must be one of ${TARGET_RUNTIME_TOKENS.join(" | ")}`,
        });
      }
      for (const dimension of ["os", "arch", "libc"] as const) {
        if (Object.prototype.hasOwnProperty.call(target, dimension)) {
          checkStringArray(target[dimension], `${path}.${dimension}`, issues);
        }
      }
    }
  }

  // provenance: optional display context only, never a credential.
  if (Object.prototype.hasOwnProperty.call(value, "provenance")) {
    const provenance = value.provenance;
    if (!isPlainObject(provenance)) {
      issues.push({ path: "provenance", message: "must be an object when present" });
    } else {
      checkKeySet(provenance, ["kind", "substrate"], "provenance", issues);
      if (!isNonEmptyString(provenance.kind) || !PROVENANCE_KINDS.includes(provenance.kind)) {
        issues.push({
          path: "provenance.kind",
          message: `must be one of ${PROVENANCE_KINDS.join(" | ")}`,
        });
      }
      if (!isNonEmptyString(provenance.substrate)) {
        issues.push({
          path: "provenance.substrate",
          message: "must be a non-empty string without surrounding whitespace",
        });
      }
    }
  }

  if (issues.length > 0) {
    throw new MetadataValidationError(issues);
  }

  return value as UniPtyBackendMetadata;
}
