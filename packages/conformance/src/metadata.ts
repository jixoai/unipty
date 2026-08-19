/**
> Orthogonal intents (2026-08-20): local Backend Metadata Protocol validator
> for release catalog snapshots (task 7.2).
>
> This mirrors the versioned minimum-schema rules that `@unipty/backend`
> enforces at acquisition time, so catalog aggregation never depends on
> Backend package internals — only the public `UniPtyBackendMetadata` shape
 * (imported here as a type from the public `@unipty/backend` entry).
 */

import type { UniPtyBackendMetadata } from "@unipty/backend";

export type MetadataValidation =
  | { readonly ok: true; readonly metadata: UniPtyBackendMetadata }
  | { readonly ok: false; readonly errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort().join(",");
  return actual === [...keys].sort().join(",");
}

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => nonEmptyString(entry));
}

/**
 * Validate one `UniPtyBackendMetadata` snapshot:
 * - `schema` must be exactly 1;
 * - `package` is exactly `{ name, version }` with non-empty strings
 *   (normalized package identity);
 * - `backend` is exactly `{ id, factoryExport }` with non-empty strings —
 *   the mandatory factory export never gets guessed;
 * - `protocol.core` is a non-empty unique list of positive integers,
 *   independent from schema and semver;
 * - `targets` is a non-empty list of `{ runtime, os?, arch?, libc? }` with
 *   runtime in node|bun|deno and non-empty string arrays otherwise;
 * - optional `provenance` is exactly `{ kind, substrate }` with a kind in
 *   the declared vocabulary;
 * - no extra keys anywhere: metadata carries no maturity, verification,
 *   capability, native-asset, or official-identity claim.
 */
export function validateUniPtyBackendMetadataSnapshot(value: unknown): MetadataValidation {
  const errors: string[] = [];
  if (!isPlainObject(value)) return { ok: false, errors: ["metadata must be a JSON object"] };
  if (value.schema !== 1) errors.push("schema must be 1");
  const pkg = value.package;
  if (!isPlainObject(pkg)) {
    errors.push("package must be an object");
  } else {
    if (!hasExactKeys(pkg, ["name", "version"])) {
      errors.push("package must contain exactly the keys name, version");
    }
    if (!nonEmptyString(pkg.name)) errors.push("package.name must be a non-empty string");
    if (!nonEmptyString(pkg.version)) errors.push("package.version must be a non-empty string");
  }
  const backend = value.backend;
  if (!isPlainObject(backend)) {
    errors.push("backend must be an object");
  } else {
    if (!hasExactKeys(backend, ["id", "factoryExport"])) {
      errors.push("backend must contain exactly the keys id, factoryExport");
    }
    if (!nonEmptyString(backend.id)) errors.push("backend.id must be a non-empty string");
    if (!nonEmptyString(backend.factoryExport)) {
      errors.push("backend.factoryExport must be a non-empty string");
    }
  }
  const protocol = value.protocol;
  if (!isPlainObject(protocol)) {
    errors.push("protocol must be an object");
  } else {
    if (!hasExactKeys(protocol, ["core"]))
      errors.push("protocol must contain exactly the key core");
    const core = protocol.core;
    if (
      !Array.isArray(core) ||
      core.length === 0 ||
      !core.every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry > 0)
    ) {
      errors.push("protocol.core must be a non-empty list of positive integers");
    } else if (new Set(core).size !== core.length) {
      errors.push("protocol.core must not contain duplicates");
    }
  }
  const targets = value.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    errors.push("targets must be a non-empty array");
  } else {
    targets.forEach((target: unknown, index: number) => {
      if (!isPlainObject(target)) {
        errors.push(`targets[${index}] must be an object`);
        return;
      }
      const allowed = ["runtime", "os", "arch", "libc"];
      const keys = Object.keys(target);
      if (keys.some((key) => !allowed.includes(key))) {
        errors.push(`targets[${index}] contains keys outside runtime, os, arch, libc`);
      }
      if (target.runtime !== "node" && target.runtime !== "bun" && target.runtime !== "deno") {
        errors.push(`targets[${index}].runtime must be "node", "bun", or "deno"`);
      }
      if (target.os !== undefined && !nonEmptyStringArray(target.os)) {
        errors.push(`targets[${index}].os, when present, must be a non-empty string array`);
      }
      if (target.arch !== undefined && !nonEmptyStringArray(target.arch)) {
        errors.push(`targets[${index}].arch, when present, must be a non-empty string array`);
      }
      if (target.libc !== undefined && !nonEmptyStringArray(target.libc)) {
        errors.push(`targets[${index}].libc, when present, must be a non-empty string array`);
      }
    });
  }
  if (value.provenance !== undefined) {
    const provenance = value.provenance;
    if (!isPlainObject(provenance)) {
      errors.push("provenance, when present, must be an object");
    } else {
      if (!hasExactKeys(provenance, ["kind", "substrate"])) {
        errors.push("provenance must contain exactly the keys kind, substrate");
      }
      if (
        provenance.kind !== "runtime-native" &&
        provenance.kind !== "third-party" &&
        provenance.kind !== "external-system"
      ) {
        errors.push("provenance.kind must be runtime-native, third-party, or external-system");
      }
      if (!nonEmptyString(provenance.substrate)) {
        errors.push("provenance.substrate must be a non-empty string");
      }
    }
  }
  const allowedTopLevel = ["schema", "package", "backend", "protocol", "targets", "provenance"];
  const forbiddenClaims = [
    "official",
    "maturity",
    "capabilities",
    "capability",
    "verified",
    "assets",
    "support",
  ];
  for (const key of Object.keys(value)) {
    if (!allowedTopLevel.includes(key)) {
      errors.push(
        forbiddenClaims.includes(key)
          ? `metadata key "${key}" is a forbidden support/identity claim`
          : `metadata key "${key}" is outside the schema`,
      );
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, metadata: value as UniPtyBackendMetadata };
}
