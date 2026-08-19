/**
> Orthogonal intents (2026-08-20): manifest conformance — constructor
 * validation matrix, loader non-invocation, snapshot immutability, and
 * manifest-only AutoResolve selection.
 */

import { describe, expect, it } from "vitest";
import {
  autoResolveUniPtyBackend,
  defineUniPtyBackendManifest,
  isBackendReady,
  UniPtyBackendSelectionError,
  validateUniPtyBackendMetadata,
  type UniPtyBackendInitializationError,
  type UniPtyBackendManifest,
  type UniPtyBackendMetadata,
  type UniPtyBackendWarning,
} from "../src/index.ts";

async function fixtureMetadata(dir: string): Promise<UniPtyBackendMetadata> {
  // Reuse the runtime evaluator instead of duplicating fixture literals: the
  // metadata modules are side-effect-free by design.
  const moduleUrl = new URL(`./fixtures/backends/${dir}/unipty.metadata.js`, import.meta.url).href;
  const imported = (await import(moduleUrl)) as { default: unknown };
  return validateUniPtyBackendMetadata(imported.default);
}

function readyFixtureModule(): Promise<{ default: Record<string, unknown> }> {
  return import(new URL("./fixtures/backends/good-a/index.js", import.meta.url).href) as Promise<{
    default: Record<string, unknown>;
  }>;
}

async function buildFixtureManifest(
  dirs: readonly string[],
  loadWrapper?: (dir: string, load: () => Promise<object>) => () => Promise<object>,
): Promise<UniPtyBackendManifest> {
  const entries: {
    packageName: string;
    metadata: UniPtyBackendMetadata;
    load: () => Promise<object>;
  }[] = [];
  for (const dir of dirs) {
    const plainLoad = (): Promise<object> =>
      import(
        new URL(`./fixtures/backends/${dir}/index.js`, import.meta.url).href
      ) as Promise<object>;
    entries.push({
      packageName: `@fixture/${dir}`,
      metadata: await fixtureMetadata(dir),
      load: loadWrapper ? loadWrapper(dir, plainLoad) : plainLoad,
    });
  }
  return defineUniPtyBackendManifest({ entries });
}

describe("defineUniPtyBackendManifest", () => {
  it("accepts a valid entry set without invoking loaders", async () => {
    let loadCalls = 0;
    const manifest = defineUniPtyBackendManifest({
      entries: [
        {
          packageName: "@fixture/good-a",
          metadata: await fixtureMetadata("good-a"),
          load: () => {
            loadCalls += 1;
            return import(new URL("./fixtures/backends/good-a/index.js", import.meta.url).href);
          },
        },
      ],
    });
    expect(manifest.entries).toHaveLength(1);
    expect(loadCalls).toBe(0);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.entries)).toBe(true);
    expect(Object.isFrozen(manifest.entries[0])).toBe(true);
  });

  it("rejects an empty or malformed entry set", () => {
    expect(() => defineUniPtyBackendManifest({ entries: [] })).toThrowError(/non-empty/);
    expect(() => defineUniPtyBackendManifest({ entries: [{}] as never })).toThrowError(
      /packageName/,
    );
    expect(() => defineUniPtyBackendManifest(undefined as never)).toThrowError(/entries/);
  });

  it("rejects invalid metadata", () => {
    expect(() =>
      defineUniPtyBackendManifest({
        entries: [
          {
            packageName: "@fixture/bad",
            metadata: {
              schema: 2,
              package: { name: "@fixture/bad", version: "1.0.0" },
              backend: { id: "bad", factoryExport: "createBackend" },
              protocol: { core: [1] },
              targets: [{ runtime: "node" }],
            } as unknown as UniPtyBackendMetadata,
            load: () => Promise.resolve({}),
          },
        ],
      }),
    ).toThrowError(/schema/);
  });

  it("rejects a packageName that mismatches metadata.package.name", async () => {
    const metadata = await fixtureMetadata("good-a");
    expect(() =>
      defineUniPtyBackendManifest({
        entries: [
          {
            packageName: "@fixture/other-name",
            metadata,
            load: () => Promise.resolve({}),
          },
        ],
      }),
    ).toThrowError(/other-name/);
  });

  it("rejects duplicate package identities", async () => {
    const metadata = await fixtureMetadata("good-a");
    expect(() =>
      defineUniPtyBackendManifest({
        entries: [
          { packageName: "@fixture/good-a", metadata, load: () => Promise.resolve({}) },
          { packageName: "@fixture/good-a", metadata, load: () => Promise.resolve({}) },
        ],
      }),
    ).toThrowError(/Duplicate/);
  });

  it("rejects a non-callable loader", async () => {
    const metadata = await fixtureMetadata("good-a");
    expect(() =>
      defineUniPtyBackendManifest({
        entries: [
          {
            packageName: "@fixture/good-a",
            metadata,
            load: "not-a-function" as unknown as () => Promise<object>,
          },
        ],
      }),
    ).toThrowError(/load/);
  });

  it("snapshots entries so later input mutation cannot change the manifest", async () => {
    const metadata = await fixtureMetadata("good-a");
    const mutableMetadata = structuredClone(metadata) as unknown as {
      targets: { runtime: string }[];
    };
    const inputEntries: {
      packageName: string;
      metadata: UniPtyBackendMetadata;
      load: () => Promise<object>;
    }[] = [
      {
        packageName: "@fixture/good-a",
        metadata: mutableMetadata as unknown as UniPtyBackendMetadata,
        load: () => readyFixtureModule(),
      },
    ];
    const manifest = defineUniPtyBackendManifest({ entries: inputEntries });

    // Mutate the original input deeply after construction.
    mutableMetadata.targets[0]!.runtime = "bun";
    inputEntries.push({
      packageName: "@fixture/injected",
      metadata: metadata,
      load: () => readyFixtureModule(),
    });

    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]?.metadata.targets[0]?.runtime).toBe("node");
    expect(manifest.entries[0]?.packageName).toBe("@fixture/good-a");
    // The manifest's frozen metadata rejects mutation attempts in strict mode.
    expect(() => {
      (manifest.entries[0] as { metadata: { schema: number } }).metadata.schema = 2;
    }).toThrowError(TypeError);
  });
});

describe("autoResolveUniPtyBackend manifest mode", () => {
  it("selects the first compatible entry across all entries in manifest order", async () => {
    const manifest = await buildFixtureManifest(["runtime-bun", "good-a", "good-b"]);
    const backend = await autoResolveUniPtyBackend({
      manifest,
      onWarning: () => {},
    });
    expect(isBackendReady(backend)).toBe(true);
  });

  it("loads only the selected entry's loader", async () => {
    const loadCounts = new Map<string, number>();
    const manifest = await buildFixtureManifest(["good-a", "good-b"], (dir, load) => {
      return () => {
        loadCounts.set(dir, (loadCounts.get(dir) ?? 0) + 1);
        return load();
      };
    });

    const backend = await autoResolveUniPtyBackend({
      manifest,
      candidates: ["@fixture/good-b"],
    });
    expect(isBackendReady(backend)).toBe(true);
    expect(loadCounts.get("good-b")).toBe(1);
    expect(loadCounts.get("good-a")).toBeUndefined();
  });

  it("warns for candidates missing from the manifest and continues", async () => {
    const manifest = await buildFixtureManifest(["good-a"]);
    const warnings: UniPtyBackendWarning[] = [];
    const backend = await autoResolveUniPtyBackend({
      manifest,
      candidates: ["@fixture/not-in-manifest", "@fixture/good-a"],
      onWarning: (warning) => warnings.push(warning),
    });
    expect(isBackendReady(backend)).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "candidate-unavailable",
      packageName: "@fixture/not-in-manifest",
      stage: "resolve",
    });
  });

  it("rejects when no manifest entry is compatible", async () => {
    const manifest = await buildFixtureManifest(["runtime-bun", "multi-target"]);
    const error = await autoResolveUniPtyBackend({
      manifest,
      onWarning: () => {},
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UniPtyBackendSelectionError);
    expect((error as UniPtyBackendSelectionError).code).toBe("no-compatible-backend");
  });

  it("rejects with a structured initialization error when the selected loader fails", async () => {
    const manifest = defineUniPtyBackendManifest({
      entries: [
        {
          packageName: "@fixture/good-a",
          metadata: await fixtureMetadata("good-a"),
          load: () => Promise.reject(new Error("loader exploded")),
        },
      ],
    });
    const error = (await autoResolveUniPtyBackend({ manifest }).catch(
      (caught: unknown) => caught,
    )) as UniPtyBackendInitializationError;
    expect(error.code).toBe("backend-initialization");
    expect(error.stage).toBe("import");
    expect((error.cause as Error).message).toBe("loader exploded");
    // The synthetic inspection preserves the manifest selection context.
    expect(error.inspection.resolution.packageUrl).toBe("manifest:@fixture/good-a");
  });

  it("rejects when a manifest-selected module lacks the declared factory export", async () => {
    const manifest = defineUniPtyBackendManifest({
      entries: [
        {
          packageName: "@fixture/good-a",
          metadata: await fixtureMetadata("good-a"),
          load: () => Promise.resolve({ unrelated: true }),
        },
      ],
    });
    const error = (await autoResolveUniPtyBackend({ manifest }).catch(
      (caught: unknown) => caught,
    )) as UniPtyBackendInitializationError;
    expect(error.code).toBe("backend-initialization");
    expect(error.stage).toBe("factory-export");
  });
});
