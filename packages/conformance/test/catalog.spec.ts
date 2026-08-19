/**
 * Release catalog aggregation tests (task 7.2): ordering snapshot, duplicate
 * and contradiction rejection, wrong-commit rejection, missing-route
 * rejection, metadata snapshot validation, deterministic serialization, and
 * the three-state presentation matrix (task 7.5: no fourth failure state).
 */

import { describe, expect, it } from "vitest";
import {
  aggregateCatalog,
  CatalogError,
  derivePresentationState,
  OFFICIAL_ROUTE_PACKAGES,
  serializeDeterministicJson,
} from "../src/catalog.ts";
import type { CatalogMetadataSnapshot, PresentationState, ReleaseCatalog } from "../src/catalog.ts";
import type { VerificationEvidence } from "../src/evidence.ts";
import type { UniPtyBackendMetadata } from "@unipty/backend";
import { validateUniPtyBackendMetadataSnapshot } from "../src/metadata.ts";

type VerificationEvidenceLike = VerificationEvidence;
type MetadataInput = UniPtyBackendMetadata;

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

function rawMetadata(packageName: string, runtime: "node" | "bun" | "deno"): MetadataInput {
  const metadata: UniPtyBackendMetadata = {
    schema: 1,
    package: { name: packageName, version: "0.1.0" },
    backend: { id: `${runtime}-backend`, factoryExport: `create${runtime}Backend` },
    protocol: { core: [1] },
    targets: [{ runtime, os: ["darwin", "linux"], arch: ["arm64", "x64"] }],
    provenance: { kind: "third-party", substrate: runtime },
  };
  const validation = validateUniPtyBackendMetadataSnapshot(metadata);
  expect(validation.ok).toBe(true);
  return metadata;
}

function snapshotOf(metadata: MetadataInput): CatalogMetadataSnapshot {
  return {
    packageName: metadata.package.name,
    packageVersion: metadata.package.version,
    metadata,
  };
}

function evidenceRecord(
  packageName: string,
  runtime: "node" | "bun" | "deno",
  overrides: Partial<VerificationEvidenceLike> = {},
): VerificationEvidenceLike {
  return {
    evidenceVersion: 1,
    backend: { packageName, packageVersion: "0.1.0", backendId: `${runtime}-backend` },
    core: { packageName: "unipty", packageVersion: "0.1.0", protocolMajor: 1 },
    runtime: { name: runtime, version: "1.0.0" },
    tuple: { os: "darwin", arch: "arm64" },
    suite: { id: "@unipty/conformance", version: "0.1.0" },
    commit: COMMIT,
    verifiedAt: "2026-08-20T12:00:00.000Z",
    ...overrides,
  };
}

const THREE_SNAPSHOTS = (): MetadataInput[] => [
  rawMetadata(OFFICIAL_ROUTE_PACKAGES.node, "node"),
  rawMetadata(OFFICIAL_ROUTE_PACKAGES.bun, "bun"),
  rawMetadata(OFFICIAL_ROUTE_PACKAGES.deno, "deno"),
];

const THREE_RECORDS = (): VerificationEvidenceLike[] => [
  evidenceRecord(OFFICIAL_ROUTE_PACKAGES.node, "node"),
  evidenceRecord(OFFICIAL_ROUTE_PACKAGES.bun, "bun"),
  evidenceRecord(OFFICIAL_ROUTE_PACKAGES.deno, "deno"),
];

function aggregateOk(
  evidence: readonly VerificationEvidenceLike[] = THREE_RECORDS(),
  metadata: readonly MetadataInput[] = THREE_SNAPSHOTS(),
): ReturnType<typeof aggregateCatalog> {
  return aggregateCatalog({
    evidenceRecords: evidence,
    metadataSnapshots: metadata,
    commit: COMMIT,
    releaseTag: "v0.1.0",
  });
}

function expectCatalogError(fn: () => unknown): CatalogError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogError);
    return error as CatalogError;
  }
  throw new Error("expected aggregateCatalog to throw");
}

describe("aggregateCatalog", () => {
  it("aggregates a valid three-route release", () => {
    const result = aggregateOk();
    expect(result.coverage).toEqual({ node: 1, bun: 1, deno: 1 });
    expect(result.catalog.release).toEqual({
      tag: "v0.1.0",
      commit: COMMIT,
      suite: { id: "@unipty/conformance", version: "0.1.0" },
    });
  });

  it("orders deterministically regardless of input order (ordering snapshot)", () => {
    const forward = aggregateOk();
    const reversed = aggregateCatalog({
      evidenceRecords: [...THREE_RECORDS()].reverse(),
      metadataSnapshots: [...THREE_SNAPSHOTS()].reverse(),
      commit: COMMIT,
      releaseTag: "v0.1.0",
    });
    expect(reversed.json).toBe(forward.json);
    expect(forward.catalog.metadata.map((entry) => entry.packageName)).toEqual([
      OFFICIAL_ROUTE_PACKAGES.bun,
      OFFICIAL_ROUTE_PACKAGES.deno,
      OFFICIAL_ROUTE_PACKAGES.node,
    ]);
    expect(new Set(forward.json)).toBeTruthy();
  });

  it("serializes with canonical key order regardless of input key order", () => {
    const shuffled = THREE_RECORDS().map((record) => {
      const keys = Object.keys(record).reverse();
      const out: Record<string, unknown> = {};
      for (const key of keys) out[key] = (record as unknown as Record<string, unknown>)[key];
      return out;
    });
    const shuffledResult = aggregateCatalog({
      evidenceRecords: shuffled,
      metadataSnapshots: THREE_SNAPSHOTS(),
      commit: COMMIT,
      releaseTag: "v0.1.0",
    });
    expect(shuffledResult.json).toBe(aggregateOk().json);
    expect(shuffledResult.json.indexOf('"catalogVersion"')).toBeGreaterThan(-1);
  });

  it("rejects duplicate evidence records for the same identity", () => {
    const records = THREE_RECORDS();
    records.push(records[0] as VerificationEvidenceLike);
    const error = expectCatalogError(() => aggregateOk(records));
    expect(error.problems.join(" ")).toContain("duplicate evidence record");
  });

  it("rejects contradictory records for the same evidence identity", () => {
    const records = THREE_RECORDS();
    const original = records[0] as VerificationEvidenceLike;
    records.push({
      ...original,
      verifiedAt: "2026-08-20T13:00:00.000Z",
    });
    const error = expectCatalogError(() => aggregateOk(records));
    expect(error.problems.join(" ")).toContain("contradictory evidence records");
  });

  it("accepts distinct identities on the same package (different tuples)", () => {
    const records = THREE_RECORDS();
    const base = records[0] as VerificationEvidenceLike;
    records.push({ ...base, tuple: { os: "linux", arch: "x64", libc: "glibc" } });
    const result = aggregateOk(records);
    expect(result.coverage.node).toBe(2);
  });

  it("rejects records tested on the wrong commit", () => {
    const records = THREE_RECORDS();
    records[0] = {
      ...(records[0] as VerificationEvidenceLike),
      commit: "ffffffffffffffffffffffffffffffffffffffff",
    };
    const error = expectCatalogError(() => aggregateOk(records));
    expect(error.problems.join(" ")).toContain("commit must equal the release commit");
  });

  it("rejects a release with a missing official route", () => {
    const records = THREE_RECORDS().filter(
      (record) => record.backend.packageName !== OFFICIAL_ROUTE_PACKAGES.deno,
    );
    const error = expectCatalogError(() => aggregateOk(records));
    expect(error.problems.join(" ")).toContain("missing: deno");
  });

  it("rejects malformed evidence records", () => {
    const records = THREE_RECORDS();
    records[0] = {
      ...(records[0] as VerificationEvidenceLike),
      evidenceVersion: 2,
    } as unknown as VerificationEvidenceLike;
    const error = expectCatalogError(() => aggregateOk(records));
    expect(error.problems.join(" ")).toContain("evidenceVersion");
  });

  it("rejects Linux evidence without libc", () => {
    const records = THREE_RECORDS();
    records[0] = {
      ...(records[0] as VerificationEvidenceLike),
      tuple: { os: "linux", arch: "x64" },
    };
    const error = expectCatalogError(() => aggregateOk(records));
    expect(error.problems.join(" ")).toContain("libc");
  });

  it("rejects evidence contradicting its metadata snapshot identity", () => {
    const records = THREE_RECORDS();
    records[0] = {
      ...(records[0] as VerificationEvidenceLike),
      backend: { ...(records[0] as VerificationEvidenceLike).backend, packageVersion: "9.9.9" },
    };
    const error = expectCatalogError(() => aggregateOk(records));
    expect(error.problems.join(" ")).toContain("contradicts its metadata snapshot");
  });

  it("rejects evidence for a package without a metadata snapshot", () => {
    const records = THREE_RECORDS();
    records.push(evidenceRecord("@unipty/community-backend" as never, "node"));
    const error = expectCatalogError(() => aggregateOk(records));
    expect(error.problems.join(" ")).toContain("has no metadata snapshot");
  });

  it("rejects duplicate metadata snapshots for one package", () => {
    const snapshots = THREE_SNAPSHOTS();
    const first = snapshots[0];
    if (first === undefined) throw new Error("test fixture incomplete");
    snapshots.push(first);
    const error = expectCatalogError(() => aggregateOk(THREE_RECORDS(), snapshots));
    expect(error.problems.join(" ")).toContain("duplicate metadata identity");
  });

  it("rejects contradictory suite versions across records", () => {
    const records = THREE_RECORDS();
    records[0] = {
      ...(records[0] as VerificationEvidenceLike),
      suite: { id: "@unipty/conformance", version: "0.2.0" },
    };
    const error = expectCatalogError(() => aggregateOk(records));
    expect(error.problems.join(" ")).toContain("contradictory suite versions");
  });
});

describe("validateUniPtyBackendMetadataSnapshot", () => {
  it("rejects forbidden support/identity claims", () => {
    const invalid = {
      ...rawMetadata(OFFICIAL_ROUTE_PACKAGES.node, "node"),
      official: true,
    } as unknown;
    const validation = validateUniPtyBackendMetadataSnapshot(invalid);
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.errors.join(" ")).toContain("forbidden");
  });

  it("rejects an empty or duplicated protocol.core", () => {
    const empty = { ...rawMetadata(OFFICIAL_ROUTE_PACKAGES.node, "node"), protocol: { core: [] } };
    expect(validateUniPtyBackendMetadataSnapshot(empty).ok).toBe(false);
    const dup = {
      ...rawMetadata(OFFICIAL_ROUTE_PACKAGES.node, "node"),
      protocol: { core: [1, 1] },
    };
    expect(validateUniPtyBackendMetadataSnapshot(dup).ok).toBe(false);
  });

  it("rejects unknown target runtimes and extra backend keys", () => {
    const badRuntime = {
      ...rawMetadata(OFFICIAL_ROUTE_PACKAGES.node, "node"),
      targets: [{ runtime: "quickjs" }],
    };
    expect(validateUniPtyBackendMetadataSnapshot(badRuntime).ok).toBe(false);
    const extraBackend = {
      ...rawMetadata(OFFICIAL_ROUTE_PACKAGES.node, "node"),
      backend: { id: "node-pty", factoryExport: "createNodePtyBackend", maturity: "stable" },
    };
    const validation = validateUniPtyBackendMetadataSnapshot(extraBackend);
    expect(validation.ok).toBe(false);
    if (!validation.ok)
      expect(validation.errors.join(" ")).toContain("backend must contain exactly");
  });
});

describe("derivePresentationState", () => {
  const catalog: ReleaseCatalog = {
    catalogVersion: 1,
    release: {
      tag: "v0.1.0",
      commit: COMMIT,
      suite: { id: "@unipty/conformance", version: "0.1.0" },
    },
    metadata: [
      snapshotOf(rawMetadata(OFFICIAL_ROUTE_PACKAGES.node, "node")),
      snapshotOf(rawMetadata(OFFICIAL_ROUTE_PACKAGES.bun, "bun")),
      snapshotOf(rawMetadata(OFFICIAL_ROUTE_PACKAGES.deno, "deno")),
    ],
    evidence: [
      evidenceRecord(OFFICIAL_ROUTE_PACKAGES.node, "node"),
      evidenceRecord(OFFICIAL_ROUTE_PACKAGES.bun, "bun", {
        runtime: { name: "bun", version: "1.3.14" },
      }),
    ],
  };

  it("derives verified for an exact evidence tuple", () => {
    expect(
      derivePresentationState(catalog, {
        runtime: { name: "node", version: "1.0.0" },
        os: "darwin",
        arch: "arm64",
      }),
    ).toBe("verified");
  });

  it("never widens an exact runtime version into a range", () => {
    expect(
      derivePresentationState(catalog, {
        runtime: { name: "node", version: "1.0.1" },
        os: "darwin",
        arch: "arm64",
      }),
    ).toBe("declared-unverified");
  });

  it("derives declared-unverified when the target matches but evidence is absent", () => {
    expect(
      derivePresentationState(catalog, {
        runtime: { name: "deno", version: "1.0.0" },
        os: "darwin",
        arch: "arm64",
      }),
    ).toBe("declared-unverified");
  });

  it("derives not-targeted when the release metadata excludes the tuple", () => {
    expect(
      derivePresentationState(catalog, {
        runtime: { name: "node", version: "1.0.0" },
        os: "win32",
        arch: "x64",
      }),
    ).toBe("not-targeted");
  });

  it("derives not-targeted when the route package is absent from the catalog", () => {
    expect(
      derivePresentationState(
        {
          ...catalog,
          metadata: catalog.metadata.filter(
            (entry) => entry.packageName !== OFFICIAL_ROUTE_PACKAGES.bun,
          ),
        },
        { runtime: { name: "bun", version: "1.3.14" }, os: "darwin", arch: "arm64" },
      ),
    ).toBe("not-targeted");
  });

  it("respects explicit libc targeting on Linux", () => {
    const linuxCatalog: ReleaseCatalog = {
      ...catalog,
      metadata: [
        {
          ...(catalog.metadata[0] as CatalogMetadataSnapshot),
          metadata: {
            ...(catalog.metadata[0] as CatalogMetadataSnapshot).metadata,
            targets: [{ runtime: "node", os: ["linux"], arch: ["x64"], libc: ["glibc"] }],
          },
        },
        catalog.metadata[1] as CatalogMetadataSnapshot,
        catalog.metadata[2] as CatalogMetadataSnapshot,
      ],
      evidence: [
        {
          ...(catalog.evidence[0] as VerificationEvidenceLike),
          tuple: { os: "linux", arch: "x64", libc: "glibc" },
        },
      ],
    };
    expect(
      derivePresentationState(linuxCatalog, {
        runtime: { name: "node", version: "1.0.0" },
        os: "linux",
        arch: "x64",
        libc: "glibc",
      }),
    ).toBe("verified");
    expect(
      derivePresentationState(linuxCatalog, {
        runtime: { name: "node", version: "1.0.0" },
        os: "linux",
        arch: "x64",
        libc: "musl",
      }),
    ).toBe("not-targeted");
  });

  it("has exactly three presentation states (no failure state)", () => {
    const observed: PresentationState[] = [
      derivePresentationState(catalog, {
        runtime: { name: "node", version: "1.0.0" },
        os: "darwin",
        arch: "arm64",
      }),
      derivePresentationState(catalog, {
        runtime: { name: "node", version: "1.0.1" },
        os: "darwin",
        arch: "arm64",
      }),
      derivePresentationState(catalog, {
        runtime: { name: "node", version: "1.0.0" },
        os: "win32",
        arch: "x64",
      }),
    ];
    expect(new Set(observed)).toEqual(new Set(["verified", "declared-unverified", "not-targeted"]));
  });

  it("serializes deterministically through serializeDeterministicJson", () => {
    expect(serializeDeterministicJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n',
    );
  });
});
