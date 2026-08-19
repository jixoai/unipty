/**
 * Orthogonal intents (maintained 2026-08-19 Asia/Shanghai; original request:
 * verify the UniPty metadata contract on Node, Bun, and Deno): runtime metadata
 * compatibility; deferred-loader bundling; package-scope bundling counterexample.
 */

import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type RuntimeName = "node" | "bun" | "deno";

type RuntimeObservation = {
  runtime: RuntimeName;
  packageUrl: string;
  metadataUrl: string;
  nativeResolved: string;
  selfCheckUrl: string;
  metadataPackageName: string;
  metadataEntryLoads: number;
  finalEntryLoads: number;
  backendProbe: boolean;
};

type BundleObservation = {
  bundler: "bun" | "deno";
  entryLoadsBeforeLoad: number;
  finalEntryLoads: number;
  backendProbe: boolean;
};

type PackageScopeBundleCounterexample = {
  bundler: "bun";
  buildSucceeded: true;
  runtimeRejected: true;
  diagnostic: string;
};

const fixtureRoot = await mkdtemp(join(tmpdir(), "unipty-metadata-probe-"));
const packageRoot = join(fixtureRoot, "node_modules", "@probe", "unipty-backend");

try {
  await mkdir(packageRoot, { recursive: true });

  await Promise.all([
    Bun.write(
      join(fixtureRoot, "package.json"),
      JSON.stringify(
        {
          name: "unipty-metadata-probe-host",
          private: true,
          type: "module",
          dependencies: { "@probe/unipty-backend": "0.0.0-probe" },
        },
        null,
        2,
      ),
    ),
    Bun.write(
      join(packageRoot, "package.json"),
      JSON.stringify(
        {
          name: "@probe/unipty-backend",
          version: "0.0.0-probe",
          type: "module",
          exports: {
            ".": "./index.js",
            "./probe.selfcheck": "./probe.selfcheck.js",
            "./unsafe.unipty.metadata": "./unsafe.unipty.metadata.js",
            "./unipty.metadata": "./unipty.metadata.js",
          },
          imports: {
            "#package.json": "./package.json",
            "#index": "./index.js",
          },
        },
        null,
        2,
      ),
    ),
    Bun.write(
      join(packageRoot, "index.js"),
      `const entryLoadsKey = Symbol.for("unipty.metadata-probe.entry-loads");
globalThis[entryLoadsKey] = (globalThis[entryLoadsKey] ?? 0) + 1;

export const backendProbe = true;
`,
    ),
    Bun.write(
      join(packageRoot, "probe.selfcheck.js"),
      `export default import.meta.resolve("#index");
`,
    ),
    Bun.write(
      join(packageRoot, "unipty.metadata.js"),
      `import packageJson from "#package.json" with { type: "json" };

export default Object.freeze({
  schema: 1,
  package: Object.freeze({
    name: packageJson.name,
    version: packageJson.version,
  }),
  backend: Object.freeze({
    id: "probe",
    factoryExport: "createProbeBackend",
  }),
  protocol: Object.freeze({ core: Object.freeze([1]) }),
  targets: Object.freeze([
    Object.freeze({ runtime: "node" }),
    Object.freeze({ runtime: "bun" }),
    Object.freeze({ runtime: "deno" }),
  ]),
});
`,
    ),
    Bun.write(
      join(packageRoot, "unsafe.unipty.metadata.js"),
      `import packageJson from "#package.json" with { type: "json" };

export default Object.freeze({
  packageName: packageJson.name,
  indexUrl: import.meta.resolve("#index"),
});
`,
    ),
    Bun.write(
      join(fixtureRoot, "probe.mjs"),
      `const packageName = "@probe/unipty-backend";
const metadataName = packageName + "/unipty.metadata";
const entryLoadsKey = Symbol.for("unipty.metadata-probe.entry-loads");
const runtime = globalThis.Bun
  ? "bun"
  : globalThis.Deno
    ? "deno"
    : "node";

const packageUrl = import.meta.resolve(packageName);
const metadataUrl = import.meta.resolve(metadataName);
let nativeResolved;

if (runtime === "bun") {
  nativeResolved = Bun.resolveSync(packageName, new URL(".", import.meta.url).pathname);
} else if (runtime === "node") {
  const { createRequire } = await import("node:module");
  nativeResolved = createRequire(import.meta.url).resolve(packageName);
} else {
  nativeResolved = packageUrl;
}

const metadataModule = await import(metadataName);
const selfCheckModule = await import(packageName + "/probe.selfcheck");
const selfCheckUrl = selfCheckModule.default;
if (!selfCheckUrl.endsWith("/index.js")) {
  throw new Error("#index did not resolve to the package entry");
}
const metadataEntryLoads = globalThis[entryLoadsKey] ?? 0;
const backendModule = await import(packageName);
const finalEntryLoads = globalThis[entryLoadsKey] ?? 0;

console.log(JSON.stringify({
  runtime,
  packageUrl,
  metadataUrl,
  nativeResolved,
  selfCheckUrl,
  metadataPackageName: metadataModule.default.package.name,
  metadataEntryLoads,
  finalEntryLoads,
  backendProbe: backendModule.backendProbe,
}));
`,
    ),
    Bun.write(
      join(fixtureRoot, "manifest.mjs"),
      `import metadata from "@probe/unipty-backend/unipty.metadata";

export default Object.freeze({
  entries: Object.freeze([
    Object.freeze({
      packageName: metadata.package.name,
      metadata,
      load: () => import("@probe/unipty-backend"),
    }),
  ]),
});
`,
    ),
    Bun.write(
      join(fixtureRoot, "bundle-entry.mjs"),
      `import manifest from "./manifest.mjs";

const entryLoadsKey = Symbol.for("unipty.metadata-probe.entry-loads");
const entryLoadsBeforeLoad = globalThis[entryLoadsKey] ?? 0;
const backendModule = await manifest.entries[0].load();
const finalEntryLoads = globalThis[entryLoadsKey] ?? 0;

console.log(JSON.stringify({
  entryLoadsBeforeLoad,
  finalEntryLoads,
  backendProbe: backendModule.backendProbe,
}));
`,
    ),
    Bun.write(
      join(fixtureRoot, "unsafe-bundle-entry.mjs"),
      `import metadata from "@probe/unipty-backend/unsafe.unipty.metadata";

console.log(metadata.indexUrl);
`,
    ),
  ]);

  const runCommandResult = async (command: readonly string[]) => {
    const process = Bun.spawn(command, {
      cwd: fixtureRoot,
      stderr: "pipe",
      stdout: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ]);

    return { exitCode, stderr, stdout };
  };

  const runCommand = async (command: readonly string[]) => {
    const result = await runCommandResult(command);

    if (result.exitCode !== 0) {
      throw new Error(
        `${command[0]} failed with exit code ${result.exitCode}: ${result.stderr.trim()}`,
      );
    }

    return result;
  };

  const commands: ReadonlyArray<{
    runtime: RuntimeName;
    command: readonly string[];
  }> = [
    { runtime: "node", command: ["node", "probe.mjs"] },
    { runtime: "bun", command: ["bun", "run", "probe.mjs"] },
    {
      runtime: "deno",
      command: [
        "deno",
        "run",
        `--allow-read=${fixtureRoot}`,
        "--node-modules-dir=manual",
        "probe.mjs",
      ],
    },
  ];

  const observations: RuntimeObservation[] = [];

  for (const { runtime, command } of commands) {
    const { stdout } = await runCommand(command);
    observations.push(JSON.parse(stdout.trim()) as RuntimeObservation);
  }

  const bunOutDir = join(fixtureRoot, "dist-bun");
  const denoOutDir = join(fixtureRoot, "dist-deno");
  const unsafeBunOutDir = join(fixtureRoot, "dist-bun-unsafe");

  await runCommand([
    "bun",
    "build",
    "--target=bun",
    "--format=esm",
    "--splitting",
    `--outdir=${bunOutDir}`,
    "bundle-entry.mjs",
  ]);
  await runCommand([
    "deno",
    "bundle",
    "--code-splitting",
    "--node-modules-dir=manual",
    "--no-lock",
    "--outdir",
    denoOutDir,
    "bundle-entry.mjs",
  ]);
  await runCommand([
    "bun",
    "build",
    "--target=bun",
    "--format=esm",
    "--splitting",
    `--outdir=${unsafeBunOutDir}`,
    "unsafe-bundle-entry.mjs",
  ]);

  const bundleObservations: BundleObservation[] = [];
  for (const [bundler, command] of [
    ["bun", ["bun", "run", join(bunOutDir, "bundle-entry.js")]],
    ["deno", ["deno", "run", join(denoOutDir, "bundle-entry.js")]],
  ] as const) {
    const { stdout } = await runCommand(command);
    bundleObservations.push({
      bundler,
      ...(JSON.parse(stdout.trim()) as Omit<BundleObservation, "bundler">),
    });
  }

  const unsafeBundleRun = await runCommandResult([
    "bun",
    "run",
    join(unsafeBunOutDir, "unsafe-bundle-entry.js"),
  ]);
  const unsafeDiagnostic = unsafeBundleRun.stderr.trim();
  if (
    unsafeBundleRun.exitCode === 0 ||
    !unsafeDiagnostic.includes("#index") ||
    !unsafeDiagnostic.includes("Cannot find package")
  ) {
    throw new Error(
      `expected bundled package-scope resolution to fail, got exit ${unsafeBundleRun.exitCode}: ${unsafeDiagnostic}`,
    );
  }

  const packageScopeBundleCounterexample: PackageScopeBundleCounterexample = {
    bundler: "bun",
    buildSucceeded: true,
    runtimeRejected: true,
    diagnostic: "Cannot find package '#index'",
  };

  console.log(
    JSON.stringify(
      {
        bundles: bundleObservations,
        packageScopeBundleCounterexample,
        runtimes: observations,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(fixtureRoot, { recursive: true });
}
