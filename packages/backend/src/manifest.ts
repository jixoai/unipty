/**
> Orthogonal intents (2026-08-20): explicit bundle manifest constructor and
 * validator.
 *
 * Original request (2026-08-17): `defineUniPtyBackendManifest()` is the
 * canonical constructor. It validates a non-empty entry set, versioned
 * metadata, unique matching package identities, a non-empty factory export,
 * and callable loaders — without invoking any loader — and returns an
 * immutable snapshot that later input mutation cannot change.
 */

import { throwInvalidArgument } from "unipty";
import { validateUniPtyBackendMetadata } from "./metadata.ts";
import type {
  BackendModule,
  UniPtyBackendManifest,
  UniPtyBackendManifestEntry,
  UniPtyBackendMetadata,
} from "./types.ts";

/** Input entry shape accepted by `defineUniPtyBackendManifest()`. */
export interface UniPtyBackendManifestInputEntry {
  readonly packageName: string;
  readonly metadata: UniPtyBackendMetadata;
  load(): Promise<BackendModule>;
}

/** Input shape accepted by `defineUniPtyBackendManifest()`. */
export interface UniPtyBackendManifestInput {
  readonly entries: readonly UniPtyBackendManifestInputEntry[];
}

function deepFrozenClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => deepFrozenClone(entry))) as unknown as T;
  }
  if (typeof value === "object" && value !== null) {
    const source = value as Record<string, unknown>;
    const clone: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      clone[key] = deepFrozenClone(source[key]);
    }
    return Object.freeze(clone) as unknown as T;
  }
  return value;
}

/**
 * Construct a validated, immutable Backend Manifest snapshot.
 *
 * Validation rejects an empty entry set, malformed entries, metadata that
 * fails the versioned schema validator, `packageName` values that mismatch
 * `metadata.package.name`, duplicate package identities, and non-callable
 * loaders. No loader is invoked and no module is imported during
 * construction; each entry's `load` reference is preserved as supplied. The
 * returned manifest deep-freezes cloned metadata so later mutation of the
 * input cannot change the snapshot.
 */
export function defineUniPtyBackendManifest(
  input: UniPtyBackendManifestInput,
): UniPtyBackendManifest {
  if (
    typeof input !== "object" ||
    input === null ||
    !Array.isArray((input as { entries?: unknown }).entries)
  ) {
    throwInvalidArgument(
      "defineUniPtyBackendManifest requires an input object with an entries array",
      { input },
    );
  }
  const inputEntries = (input as { entries: readonly unknown[] }).entries;
  if (inputEntries.length === 0) {
    throwInvalidArgument("defineUniPtyBackendManifest requires a non-empty entries list");
  }

  const seenPackages = new Set<string>();
  const snapshot: UniPtyBackendManifestEntry[] = [];

  for (const [index, rawEntry] of inputEntries.entries()) {
    const path = `entries[${index}]`;
    if (typeof rawEntry !== "object" || rawEntry === null || Array.isArray(rawEntry)) {
      throwInvalidArgument(`${path} must be a manifest entry object`, {
        entry: rawEntry,
      });
    }
    const entry = rawEntry as Partial<UniPtyBackendManifestInputEntry>;

    if (
      typeof entry.packageName !== "string" ||
      entry.packageName.trim().length === 0 ||
      entry.packageName.trim() !== entry.packageName
    ) {
      throwInvalidArgument(
        `${path}.packageName must be a non-empty string without surrounding whitespace`,
        { packageName: entry.packageName },
      );
    }

    let metadata: UniPtyBackendMetadata;
    try {
      metadata = validateUniPtyBackendMetadata(entry.metadata);
    } catch (error) {
      throwInvalidArgument(`${path}.metadata does not satisfy the UniPty Backend Metadata schema`, {
        packageName: entry.packageName,
        cause: error,
      });
    }

    if (metadata.package.name !== entry.packageName) {
      throwInvalidArgument(
        `${path}.packageName "${entry.packageName}" must equal metadata.package.name "${metadata.package.name}"`,
        { packageName: entry.packageName, metadataPackageName: metadata.package.name },
      );
    }

    if (typeof entry.load !== "function") {
      throwInvalidArgument(`${path}.load must be a callable loader function`, {
        packageName: entry.packageName,
      });
    }

    if (seenPackages.has(entry.packageName)) {
      throwInvalidArgument(`Duplicate manifest package identity "${entry.packageName}"`, {
        packageName: entry.packageName,
      });
    }
    seenPackages.add(entry.packageName);

    snapshot.push(
      Object.freeze({
        packageName: entry.packageName,
        metadata: deepFrozenClone(metadata),
        load: entry.load,
      }),
    );
  }

  return Object.freeze({ entries: Object.freeze(snapshot) });
}
