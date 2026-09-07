/**
> Orthogonal intents (2026-08-20): deterministic release catalog aggregation
> and three-state presentation derivation (tasks 7.2, 7.5).
>
> The catalog is positive evidence only: it aggregates Verification Evidence
> records produced after complete suite passes plus validated metadata
> snapshots of the released official packages. Failures remain CI diagnostics
 * — they are never converted into permanent unsupported claims, and
 * presentation derives exactly three states.
 */

import { readFileSync } from "node:fs";
import { CONFORMANCE_SUITE_ID, type ConformanceRuntimeName } from "./report.ts";
import { validateVerificationEvidence, type VerificationEvidence } from "./evidence.ts";
import { validateUniPtyBackendMetadataSnapshot } from "./metadata.ts";
import type { UniPtyBackendMetadata } from "@unipty/backend";

export const CATALOG_VERSION = 1;

/** Official route identity: the substrate, never the runtime. */
export type OfficialRouteId = "node-pty" | "bun" | "deno-sigma__pty-ffi" | "zigpty";

/** Route-unique key order for deterministic iteration. */
export const OFFICIAL_ROUTE_KEYS: readonly OfficialRouteId[] = [
  "node-pty",
  "bun",
  "deno-sigma__pty-ffi",
  "zigpty",
];

/** One official route: the package AND the backend identity it must carry. */
export interface OfficialRoute {
  readonly packageName: string;
  readonly backendId: string;
}

/**
 * The official route registry keyed by route identity (not runtime).
 * Coverage and identity validation use BOTH fields: evidence or metadata
 * bearing a registry package name but a foreign backend id never counts as
 * that route (two node-runtime routes must not be able to stand in for
 * each other by swapping ids).
 */
export const OFFICIAL_ROUTE_PACKAGES: Readonly<Record<OfficialRouteId, OfficialRoute>> = {
  "node-pty": { packageName: "@unipty/backend-node-pty", backendId: "node-pty" },
  bun: { packageName: "@unipty/backend-bun", backendId: "bun" },
  "deno-sigma__pty-ffi": {
    packageName: "@unipty/backend-deno-sigma__pty-ffi",
    backendId: "deno-sigma__pty-ffi",
  },
  zigpty: { packageName: "@unipty/backend-zigpty", backendId: "zigpty" },
};

/** Reverse lookup: registry entry (if any) owning a package name. */
function routeForPackage(packageName: string): OfficialRoute | undefined {
  for (const route of OFFICIAL_ROUTE_KEYS) {
    const entry = OFFICIAL_ROUTE_PACKAGES[route];
    if (entry.packageName === packageName) return entry;
  }
  return undefined;
}

/** One validated metadata snapshot in the catalog. */
export interface CatalogMetadataSnapshot {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly metadata: UniPtyBackendMetadata;
}

/** The release catalog artifact (deterministic key order; see serializer). */
export interface ReleaseCatalog {
  readonly catalogVersion: 1;
  readonly release: {
    readonly tag: string;
    readonly commit: string;
    readonly suite: { readonly id: string; readonly version: string };
  };
  readonly metadata: readonly CatalogMetadataSnapshot[];
  readonly evidence: readonly VerificationEvidence[];
}

/** Aggregation failure carrying every collected validation problem. */
export class CatalogError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`release catalog aggregation failed:\n- ${problems.join("\n- ")}`);
    this.name = "CatalogError";
    this.problems = problems;
  }
}

/** Recursively copy a JSON value with plain-object keys sorted. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = canonicalize(record[key]);
    }
    return out;
  }
  return value;
}

/**
 * Serialize deterministically: every plain-object key is sorted recursively,
 * so output never depends on the input key order of arbitrary objects.
 */
export function serializeDeterministicJson(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2) + "\n";
}

/** Aggregator input: evidence records and metadata snapshots as parsed values or file paths. */
export interface AggregateCatalogInput {
  /** Evidence records: parsed values or paths to record JSON files. */
  readonly evidenceRecords: readonly (string | unknown)[];
  /** Metadata snapshots: parsed `UniPtyBackendMetadata` values or file paths. */
  readonly metadataSnapshots: readonly (string | unknown)[];
  /** The exact release commit every record must have been tested on. */
  readonly commit: string;
  /** The release tag the catalog is attached to. */
  readonly releaseTag: string;
}

export interface AggregateCatalogResult {
  readonly catalog: ReleaseCatalog;
  readonly json: string;
  /** Evidence count per official route after aggregation. */
  readonly coverage: Readonly<Record<OfficialRouteId, number>>;
}

function loadEntry(entry: string | unknown, kind: string): unknown {
  if (typeof entry !== "string") return entry;
  try {
    return JSON.parse(readFileSync(entry, "utf8")) as unknown;
  } catch (error) {
    throw new CatalogError([`cannot read ${kind} file "${entry}": ${String(error)}`]);
  }
}

function evidenceIdentityKey(evidence: VerificationEvidence): string {
  return [
    evidence.backend.packageName,
    evidence.backend.packageVersion,
    evidence.runtime.name,
    evidence.runtime.version,
    evidence.tuple.os,
    evidence.tuple.arch,
    evidence.tuple.libc ?? "",
    evidence.suite.id,
    evidence.suite.version,
    evidence.commit,
  ].join("\u0000");
}

function compareMetadata(a: CatalogMetadataSnapshot, b: CatalogMetadataSnapshot): number {
  return a.packageName < b.packageName
    ? -1
    : a.packageName > b.packageName
      ? 1
      : a.packageVersion < b.packageVersion
        ? -1
        : a.packageVersion > b.packageVersion
          ? 1
          : 0;
}

function compareEvidence(a: VerificationEvidence, b: VerificationEvidence): number {
  const fields: Array<[string, string]> = [
    [a.backend.packageName, b.backend.packageName],
    [a.backend.packageVersion, b.backend.packageVersion],
    [a.runtime.name, b.runtime.name],
    [a.runtime.version, b.runtime.version],
    [a.tuple.os, b.tuple.os],
    [a.tuple.arch, b.tuple.arch],
    [a.tuple.libc ?? "", b.tuple.libc ?? ""],
  ];
  for (const [left, right] of fields) {
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return 0;
}

/**
 * Validate, deduplicate, sort, and aggregate evidence plus metadata into one
 * deterministic release catalog. Rejects (throws {@link CatalogError}) on:
 * malformed records, wrong commit or suite identity, missing Linux libc,
 * duplicate/contradictory evidence identity, metadata/evidence identity
 * mismatch, duplicate metadata packages, and missing official-route coverage.
 */
export function aggregateCatalog(input: AggregateCatalogInput): AggregateCatalogResult {
  const problems: string[] = [];
  if (!/^[0-9a-f]{7,40}$/.test(input.commit)) {
    problems.push(`commit "${input.commit}" is not a 7-40 character lowercase hex git commit`);
  }
  if (input.releaseTag.length === 0) problems.push("releaseTag must be a non-empty string");
  if (input.metadataSnapshots.length === 0)
    problems.push("at least one metadata snapshot is required");

  const snapshotsByPackage = new Map<string, CatalogMetadataSnapshot>();
  for (const entry of input.metadataSnapshots) {
    const value = loadEntry(entry, "metadata snapshot");
    const validation = validateUniPtyBackendMetadataSnapshot(value);
    if (!validation.ok) {
      problems.push(`invalid metadata snapshot: ${validation.errors.join("; ")}`);
      continue;
    }
    const snapshot: CatalogMetadataSnapshot = {
      packageName: validation.metadata.package.name,
      packageVersion: validation.metadata.package.version,
      metadata: validation.metadata,
    };
    // Route-identity gate (package AND backend id): a snapshot wearing an
    // official package name must carry that route's exact backend identity.
    const owningRoute = routeForPackage(snapshot.packageName);
    if (owningRoute !== undefined && snapshot.metadata.backend.id !== owningRoute.backendId) {
      problems.push(
        `metadata snapshot for official package "${snapshot.packageName}" declares backend id "${snapshot.metadata.backend.id}" but the route identity is "${owningRoute.backendId}"`,
      );
      continue;
    }
    const existing = snapshotsByPackage.get(snapshot.packageName);
    if (existing !== undefined) {
      problems.push(
        `duplicate metadata identity for package "${snapshot.packageName}"` +
          (existing.packageVersion !== snapshot.packageVersion
            ? ` (contradictory versions ${existing.packageVersion} vs ${snapshot.packageVersion})`
            : ""),
      );
      continue;
    }
    snapshotsByPackage.set(snapshot.packageName, snapshot);
  }

  const evidenceRecords: VerificationEvidence[] = [];
  const seenIdentities = new Map<string, VerificationEvidence>();
  for (const entry of input.evidenceRecords) {
    const value = loadEntry(entry, "evidence record");
    const validation = validateVerificationEvidence(value, {
      commit: input.commit,
      suiteId: CONFORMANCE_SUITE_ID,
    });
    if (!validation.ok) {
      problems.push(`invalid evidence record: ${validation.errors.join("; ")}`);
      continue;
    }
    const evidence = validation.evidence;
    // Route-identity gate (package AND backend id): evidence wearing an
    // official package name must carry that route's exact backend identity,
    // or it never counts toward coverage — two node-runtime routes cannot
    // stand in for each other by swapping ids.
    const evidenceRoute = routeForPackage(evidence.backend.packageName);
    if (evidenceRoute !== undefined && evidence.backend.backendId !== evidenceRoute.backendId) {
      problems.push(
        `evidence for official package "${evidence.backend.packageName}" claims backend id "${evidence.backend.backendId}" but the route identity is "${evidenceRoute.backendId}"`,
      );
      continue;
    }
    const key = evidenceIdentityKey(evidence);
    const prior = seenIdentities.get(key);
    if (prior !== undefined) {
      const identical =
        JSON.stringify(canonicalize(prior)) === JSON.stringify(canonicalize(evidence));
      problems.push(
        identical
          ? `duplicate evidence record for identity ${key.split("\u0000").join(" | ")}`
          : `contradictory evidence records for identity ${key.split("\u0000").join(" | ")}`,
      );
      continue;
    }
    seenIdentities.set(key, evidence);
    evidenceRecords.push(evidence);
  }

  const suiteVersions = new Set(evidenceRecords.map((record) => record.suite.version));
  if (suiteVersions.size > 1) {
    problems.push(
      `contradictory suite versions across evidence records: ${[...suiteVersions].join(", ")}`,
    );
  }

  for (const evidence of evidenceRecords) {
    const snapshot = snapshotsByPackage.get(evidence.backend.packageName);
    if (snapshot === undefined) {
      problems.push(
        `evidence for "${evidence.backend.packageName}@${evidence.backend.packageVersion}" has no metadata snapshot`,
      );
      continue;
    }
    if (
      snapshot.packageVersion !== evidence.backend.packageVersion ||
      snapshot.metadata.backend.id !== evidence.backend.backendId
    ) {
      problems.push(
        `evidence identity (${evidence.backend.packageName}@${evidence.backend.packageVersion}, backend "${evidence.backend.backendId}") contradicts its metadata snapshot (${snapshot.packageName}@${snapshot.packageVersion}, backend "${snapshot.metadata.backend.id}")`,
      );
    }
  }

  const coverage: Record<OfficialRouteId, number> = {
    "node-pty": 0,
    bun: 0,
    "deno-sigma__pty-ffi": 0,
    zigpty: 0,
  };
  for (const evidence of evidenceRecords) {
    for (const route of OFFICIAL_ROUTE_KEYS) {
      const entry = OFFICIAL_ROUTE_PACKAGES[route];
      if (
        evidence.backend.packageName === entry.packageName &&
        evidence.backend.backendId === entry.backendId
      ) {
        coverage[route] += 1;
      }
    }
  }
  const missingRoutes = OFFICIAL_ROUTE_KEYS.filter((route) => coverage[route] === 0);
  if (missingRoutes.length > 0) {
    problems.push(
      `first-phase release gate requires at least one native passing tuple per official route; missing: ${missingRoutes.join(", ")}`,
    );
  }

  if (problems.length > 0) throw new CatalogError(problems);

  const suiteVersion = evidenceRecords[0]?.suite.version;
  if (suiteVersion === undefined) {
    throw new CatalogError(["no valid evidence records remain after validation"]);
  }

  const catalog: ReleaseCatalog = {
    catalogVersion: CATALOG_VERSION,
    release: {
      tag: input.releaseTag,
      commit: input.commit,
      suite: { id: CONFORMANCE_SUITE_ID, version: suiteVersion },
    },
    metadata: [...snapshotsByPackage.values()].sort(compareMetadata),
    evidence: [...evidenceRecords].sort(compareEvidence),
  };
  return { catalog, json: serializeDeterministicJson(catalog), coverage };
}

/** A tuple query for presentation derivation. */
export interface PresentationQuery {
  /** Route identity (substrate); multiple routes may share one runtime. */
  readonly route: OfficialRouteId;
  readonly runtime: { readonly name: ConformanceRuntimeName; readonly version: string };
  readonly os: string;
  readonly arch: string;
  readonly libc?: string;
}

/** The only three presentation states documentation may derive. */
export type PresentationState = "verified" | "declared-unverified" | "not-targeted";

function matchesList(list: readonly string[] | undefined, value: string): boolean {
  return list === undefined || list.includes(value);
}

function matchesLibc(list: readonly string[] | undefined, value: string | undefined): boolean {
  return list === undefined ? true : value !== undefined && list.includes(value);
}

/**
 * Derive the presentation state for one exact tuple against a release
 * catalog, using the metadata snapshot of the queried official route:
 * - `not-targeted`: no metadata snapshot for the route, or the release
 *   metadata targets exclude the tuple;
 * - `verified`: exact evidence exists for the released package version, the
 *   exact runtime version, and the exact os/arch/libc tuple;
 * - `declared-unverified`: the target matches but no exact evidence exists.
 *
 * There is deliberately no fourth state: absent or failed evidence is never
 * widened into a permanent unsupported claim or a runtime-version range.
 */
export function derivePresentationState(
  catalog: ReleaseCatalog,
  query: PresentationQuery,
): PresentationState {
  const packageName = OFFICIAL_ROUTE_PACKAGES[query.route].packageName;
  const snapshot = catalog.metadata.find((entry) => entry.packageName === packageName);
  if (snapshot === undefined) return "not-targeted";
  const targeted = snapshot.metadata.targets.some(
    (target) =>
      target.runtime === query.runtime.name &&
      matchesList(target.os, query.os) &&
      matchesList(target.arch, query.arch) &&
      matchesLibc(target.libc, query.libc),
  );
  if (!targeted) return "not-targeted";
  const verified = catalog.evidence.some(
    (evidence) =>
      evidence.backend.packageName === snapshot.packageName &&
      evidence.backend.packageVersion === snapshot.packageVersion &&
      evidence.runtime.name === query.runtime.name &&
      evidence.runtime.version === query.runtime.version &&
      evidence.tuple.os === query.os &&
      evidence.tuple.arch === query.arch &&
      (evidence.tuple.libc ?? undefined) === (query.libc ?? undefined),
  );
  return verified ? "verified" : "declared-unverified";
}
