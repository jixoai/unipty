/**
> Orthogonal intents (2026-08-20): Metadata Protocol validator conformance —
 * schema matrix, required fields, target shape, and forbidden claim fields.
 */

import { describe, expect, it } from "vitest";
import { MetadataValidationError, validateUniPtyBackendMetadata } from "../src/index.ts";

function validMetadata(): Record<string, unknown> {
  return {
    schema: 1,
    package: { name: "@unipty/backend-node-pty", version: "0.1.0" },
    backend: { id: "node-pty", factoryExport: "createNodePtyBackend" },
    protocol: { core: [1] },
    targets: [{ runtime: "node" }],
  };
}

function issuesOf(value: unknown): { path: string; message: string }[] {
  try {
    validateUniPtyBackendMetadata(value);
  } catch (error) {
    if (error instanceof MetadataValidationError) {
      return [...error.issues];
    }
    throw error;
  }
  return [];
}

function pathsOf(value: unknown): string[] {
  return issuesOf(value).map((issue) => issue.path);
}

describe("validateUniPtyBackendMetadata", () => {
  it("accepts a minimal valid declaration", () => {
    const input = validMetadata();
    const result = validateUniPtyBackendMetadata(input);
    expect(result).toBe(input);
    expect(result.schema).toBe(1);
    expect(result.package.name).toBe("@unipty/backend-node-pty");
    expect(result.backend.factoryExport).toBe("createNodePtyBackend");
    expect(result.protocol.core).toEqual([1]);
    expect(result.targets).toEqual([{ runtime: "node" }]);
  });

  it("accepts optional provenance display context", () => {
    const result = validateUniPtyBackendMetadata({
      ...validMetadata(),
      provenance: { kind: "third-party", substrate: "node-pty" },
    });
    expect(result.provenance?.kind).toBe("third-party");
  });

  it("accepts multiple protocol majors and multi-target declarations", () => {
    const result = validateUniPtyBackendMetadata({
      ...validMetadata(),
      protocol: { core: [1, 2, 10] },
      targets: [
        { runtime: "node", os: ["darwin", "linux"], arch: ["arm64"], libc: ["glibc"] },
        { runtime: "deno" },
      ],
    });
    expect(result.protocol.core).toEqual([1, 2, 10]);
    expect(result.targets).toHaveLength(2);
  });

  it("rejects non-object roots", () => {
    for (const value of [null, undefined, "metadata", 1, [], () => {}]) {
      expect(pathsOf(value)).toContain("<root>");
    }
  });

  it("rejects a wrong or missing schema version", () => {
    expect(pathsOf({ ...validMetadata(), schema: 2 })).toContain("schema");
    expect(pathsOf({ ...validMetadata(), schema: "1" })).toContain("schema");
    const { schema: _schema, ...withoutSchema } = validMetadata();
    expect(pathsOf(withoutSchema)).toContain("schema");
  });

  it("rejects malformed package identity", () => {
    expect(pathsOf({ ...validMetadata(), package: {} })).toEqual(
      expect.arrayContaining(["package.name", "package.version"]),
    );
    expect(pathsOf({ ...validMetadata(), package: { name: "", version: "1.0.0" } })).toContain(
      "package.name",
    );
    expect(
      pathsOf({ ...validMetadata(), package: { name: " padded ", version: "1.0.0" } }),
    ).toContain("package.name");
    expect(pathsOf({ ...validMetadata(), package: { name: "x", version: "1.0 beta" } })).toContain(
      "package.version",
    );
    expect(pathsOf({ ...validMetadata(), package: null })).toContain("package");
  });

  it("rejects malformed backend identity and factory export", () => {
    expect(pathsOf({ ...validMetadata(), backend: { id: "", factoryExport: "x" } })).toContain(
      "backend.id",
    );
    expect(pathsOf({ ...validMetadata(), backend: { id: "x", factoryExport: "" } })).toContain(
      "backend.factoryExport",
    );
  });

  it("rejects empty, non-positive, non-integer, or duplicate protocol majors", () => {
    expect(pathsOf({ ...validMetadata(), protocol: { core: [] } })).toContain("protocol.core");
    expect(pathsOf({ ...validMetadata(), protocol: { core: [0] } })).toContain("protocol.core[0]");
    expect(pathsOf({ ...validMetadata(), protocol: { core: [-1] } })).toContain("protocol.core[0]");
    expect(pathsOf({ ...validMetadata(), protocol: { core: [1.5] } })).toContain(
      "protocol.core[0]",
    );
    expect(pathsOf({ ...validMetadata(), protocol: { core: ["1"] } })).toContain(
      "protocol.core[0]",
    );
    expect(pathsOf({ ...validMetadata(), protocol: { core: [1, 1] } })).toContain("protocol.core");
  });

  it("rejects empty or malformed targets", () => {
    expect(pathsOf({ ...validMetadata(), targets: [] })).toContain("targets");
    expect(pathsOf({ ...validMetadata(), targets: [{}] })).toContain("targets[0].runtime");
    expect(pathsOf({ ...validMetadata(), targets: [{ runtime: "browser" }] })).toContain(
      "targets[0].runtime",
    );
    expect(pathsOf({ ...validMetadata(), targets: [{ runtime: "node", os: "darwin" }] })).toContain(
      "targets[0].os",
    );
    expect(pathsOf({ ...validMetadata(), targets: [{ runtime: "node", os: [] }] })).toContain(
      "targets[0].os",
    );
    expect(pathsOf({ ...validMetadata(), targets: [{ runtime: "node", arch: [""] }] })).toContain(
      "targets[0].arch[0]",
    );
    expect(pathsOf({ ...validMetadata(), targets: [{ runtime: "node", libc: [42] }] })).toContain(
      "targets[0].libc[0]",
    );
    expect(pathsOf({ ...validMetadata(), targets: ["node"] })).toContain("targets[0]");
  });

  it("rejects malformed provenance", () => {
    expect(
      pathsOf({ ...validMetadata(), provenance: { kind: "official", substrate: "x" } }),
    ).toContain("provenance.kind");
    expect(
      pathsOf({ ...validMetadata(), provenance: { kind: "third-party", substrate: "" } }),
    ).toContain("provenance.substrate");
  });

  it("rejects unknown top-level keys", () => {
    expect(pathsOf({ ...validMetadata(), extra: true })).toContain("extra");
  });

  it("rejects forbidden claim fields anywhere in the value", () => {
    const forbiddenTopLevel = [
      "verified",
      "verifiedSupport",
      "maturity",
      "official",
      "community",
      "capabilities",
      "assets",
      "supportedTuples",
    ];
    for (const key of forbiddenTopLevel) {
      const issues = pathsOf({ ...validMetadata(), [key]: true });
      expect(issues, `key ${key}`).toContain(key);
    }

    expect(
      pathsOf({
        ...validMetadata(),
        targets: [{ runtime: "node", verified: true }],
      }),
    ).toContain("targets[0].verified");

    expect(
      pathsOf({
        ...validMetadata(),
        targets: [{ runtime: "node", maturity: "stable" }],
      }),
    ).toContain("targets[0].maturity");

    expect(
      pathsOf({
        ...validMetadata(),
        provenance: { kind: "third-party", substrate: "node-pty", assets: ["/native"] },
      }),
    ).toContain("provenance.assets");

    expect(
      pathsOf({
        ...validMetadata(),
        backend: { id: "x", factoryExport: "y", official: true },
      }),
    ).toContain("backend.official");
  });

  it("collects every issue into the structured error message", () => {
    const errorIssues = issuesOf({ schema: 2 });
    expect(errorIssues.length).toBeGreaterThan(0);
    for (const issue of errorIssues) {
      expect(typeof issue.message).toBe("string");
      expect(issue.message.length).toBeGreaterThan(0);
    }

    let message = "";
    try {
      validateUniPtyBackendMetadata({ schema: 3 });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toContain("schema:");
  });

  it("does not mutate or import anything while validating", () => {
    const input = validMetadata();
    const snapshot = JSON.stringify(input);
    expect(() => validateUniPtyBackendMetadata(input)).not.toThrow();
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
