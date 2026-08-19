/**
 * Orthogonal intents (maintained 2026-08-19 Asia/Shanghai; original request:
 * test native PTY deployment instead of designing from package metadata):
 * node-pty externalization; package-relative asset copying; Deno FFI path.
 */

import { chmod, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type CommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

type NodePtyBundleObservation = {
  bundler: "bun" | "esbuild";
  bundledWithoutAssetsRejected: boolean;
  externalPackageRan: boolean;
  copiedOutputAssets: "ran" | "runtime-helper-path-failure";
};

const fixtureRoot = await mkdtemp(join(tmpdir(), "unipty-native-bundle-probe-"));

const runCommandResult = async (
  command: readonly string[],
  options: { env?: Record<string, string>; cwd?: string } = {},
): Promise<CommandResult> => {
  const process = Bun.spawn(command, {
    cwd: options.cwd ?? fixtureRoot,
    env: options.env,
    stderr: "pipe",
    stdout: "pipe",
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    process.kill();
  }, 30_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  clearTimeout(timeout);

  return {
    exitCode,
    stderr: timedOut ? `${stderr}\ncommand timed out after 30 seconds` : stderr,
    stdout,
  };
};

const runCommand = async (
  command: readonly string[],
  options?: { env?: Record<string, string>; cwd?: string },
) => {
  const result = await runCommandResult(command, options);
  if (result.exitCode !== 0) {
    throw new Error(
      `${command[0]} failed with exit code ${result.exitCode}: ${result.stderr.trim()}`,
    );
  }
  return result;
};

const assertPtyOutput = (result: CommandResult, expected: string) => {
  if (result.exitCode !== 0 || !result.stdout.includes(expected)) {
    throw new Error(
      `expected ${expected}, got exit ${result.exitCode}: ${result.stdout.trim()} ${result.stderr.trim()}`,
    );
  }
};

try {
  const distRoot = join(fixtureRoot, "dist-node");
  const denoRoutePackageRoot = join(fixtureRoot, "node_modules", "@probe", "deno-backend");
  await mkdir(distRoot, { recursive: true });
  await mkdir(denoRoutePackageRoot, { recursive: true });

  await Promise.all([
    Bun.write(
      join(fixtureRoot, "package.json"),
      JSON.stringify({ name: "unipty-native-bundle-probe", private: true }, null, 2),
    ),
    Bun.write(
      join(fixtureRoot, "node-pty-entry.cjs"),
      `const pty = require("node-pty");

const terminal = pty.spawn("/bin/sh", ["-c", "printf node-pty-bundle-ok"], {
  cols: 80,
  rows: 24,
});
let output = "";
const timeout = setTimeout(() => {
  console.error("node-pty probe timed out");
  process.exit(2);
}, 5000);

terminal.onData((data) => {
  output += data;
});
terminal.onExit(({ exitCode }) => {
  clearTimeout(timeout);
  console.log(JSON.stringify({ exitCode, output }));
  process.exit(exitCode === 0 ? 0 : 1);
});
`,
    ),
  ]);

  console.error("probe: installing node-pty fixture");
  await runCommand([
    "npm",
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--prefer-offline",
    "esbuild@0.28.2",
    "node-pty@1.1.0",
  ]);

  await mkdir(denoRoutePackageRoot, { recursive: true });
  await Promise.all([
    Bun.write(
      join(fixtureRoot, "package.json"),
      JSON.stringify(
        {
          name: "unipty-native-bundle-probe",
          private: true,
          dependencies: {
            "@probe/deno-backend": "0.0.0-probe",
            esbuild: "^0.28.2",
            "node-pty": "^1.1.0",
          },
        },
        null,
        2,
      ),
    ),
    Bun.write(
      join(denoRoutePackageRoot, "package.json"),
      JSON.stringify(
        {
          name: "@probe/deno-backend",
          version: "0.0.0-probe",
          type: "module",
          exports: "./index.js",
        },
        null,
        2,
      ),
    ),
    Bun.write(
      join(denoRoutePackageRoot, "index.js"),
      `export { instantiate } from "jsr:@sigma/pty-ffi@0.42.0/noinit";
`,
    ),
    Bun.write(
      join(fixtureRoot, "deno-npm-jsr-route.mjs"),
      `import { instantiate } from "npm:@probe/deno-backend@0.0.0-probe";

console.log(JSON.stringify({ instantiate: typeof instantiate }));
`,
    ),
  ]);

  if (process.platform !== "win32") {
    await chmod(
      join(
        fixtureRoot,
        "node_modules",
        "node-pty",
        "prebuilds",
        `${process.platform}-${process.arch}`,
        "spawn-helper",
      ),
      0o755,
    );
  }

  await runCommand([
    join(fixtureRoot, "node_modules", ".bin", "esbuild"),
    "node-pty-entry.cjs",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    `--outfile=${join(distRoot, "esbuild-bundled.cjs")}`,
  ]);
  await runCommand([
    join(fixtureRoot, "node_modules", ".bin", "esbuild"),
    "node-pty-entry.cjs",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--external:node-pty",
    `--outfile=${join(distRoot, "esbuild-external.cjs")}`,
  ]);
  await runCommand([
    "bun",
    "build",
    "--target=node",
    "--format=cjs",
    `--outfile=${join(distRoot, "bun-bundled.cjs")}`,
    "node-pty-entry.cjs",
  ]);
  await runCommand([
    "bun",
    "build",
    "--target=node",
    "--format=cjs",
    "--external",
    "node-pty",
    `--outfile=${join(distRoot, "bun-external.cjs")}`,
    "node-pty-entry.cjs",
  ]);

  const nodePtyObservations: NodePtyBundleObservation[] = [];
  for (const bundler of ["esbuild", "bun"] as const) {
    const bundledFile = join(distRoot, `${bundler}-bundled.cjs`);
    const externalFile = join(distRoot, `${bundler}-external.cjs`);
    const bundledWithoutAssets = await runCommandResult(["node", bundledFile]);
    const externalPackage = await runCommandResult(["node", externalFile]);

    if (
      bundledWithoutAssets.exitCode === 0 ||
      !bundledWithoutAssets.stderr.includes("Failed to load native module")
    ) {
      throw new Error(
        `${bundler} bundle unexpectedly loaded node-pty without package assets: ${bundledWithoutAssets.stdout} ${bundledWithoutAssets.stderr}`,
      );
    }
    assertPtyOutput(externalPackage, "node-pty-bundle-ok");

    nodePtyObservations.push({
      bundler,
      bundledWithoutAssetsRejected: true,
      externalPackageRan: true,
      copiedOutputAssets: "runtime-helper-path-failure",
    });
  }

  const nativeAssetDir = join(
    fixtureRoot,
    "node_modules",
    "node-pty",
    "prebuilds",
    `${process.platform}-${process.arch}`,
  );
  await cp(nativeAssetDir, join(distRoot, "prebuilds", `${process.platform}-${process.arch}`), {
    recursive: true,
  });

  for (const observation of nodePtyObservations) {
    const copiedAssetRun = await runCommandResult([
      "node",
      join(distRoot, `${observation.bundler}-bundled.cjs`),
    ]);
    if (observation.bundler === "esbuild") {
      assertPtyOutput(copiedAssetRun, "node-pty-bundle-ok");
      observation.copiedOutputAssets = "ran";
    } else if (
      copiedAssetRun.exitCode === 0 ||
      !copiedAssetRun.stderr.includes("posix_spawnp failed")
    ) {
      throw new Error(
        `expected Bun's bundled helper path to fail, got: ${copiedAssetRun.stdout} ${copiedAssetRun.stderr}`,
      );
    }
  }
  console.error("probe: node-pty bundler matrix complete");

  const denoNpmJsrRoute = await runCommandResult([
    "deno",
    "run",
    "--node-modules-dir=manual",
    "deno-npm-jsr-route.mjs",
  ]);
  if (
    denoNpmJsrRoute.exitCode === 0 ||
    !denoNpmJsrRoute.stderr.includes("ERR_UNSUPPORTED_ESM_URL_SCHEME")
  ) {
    throw new Error(
      `expected npm package native JSR dependency to fail: ${denoNpmJsrRoute.stdout} ${denoNpmJsrRoute.stderr}`,
    );
  }

  const sigmaAssetNames: Partial<Record<NodeJS.Platform, Partial<Record<string, string>>>> = {
    darwin: { arm64: "libpty_arm64.dylib", x64: "libpty_x86_64.dylib" },
    linux: { arm64: "libpty_aarch64.so", x64: "libpty_x86_64.so" },
    win32: { arm64: "pty.dll", x64: "pty.dll" },
  };
  const sigmaAssetName = sigmaAssetNames[process.platform]?.[process.arch];
  if (!sigmaAssetName) {
    throw new Error(`unsupported probe host ${process.platform}-${process.arch}`);
  }

  const sigmaAssetPath = join(fixtureRoot, sigmaAssetName);
  const sigmaAssetResponse = await fetch(
    `https://github.com/sigmaSd/deno-pty-ffi/releases/download/0.42.0/${sigmaAssetName}`,
  );
  if (!sigmaAssetResponse.ok) {
    throw new Error(`failed to download ${sigmaAssetName}: ${sigmaAssetResponse.status}`);
  }
  await Bun.write(sigmaAssetPath, sigmaAssetResponse);

  await Bun.write(
    join(fixtureRoot, "deno-ffi-entry.ts"),
    `import { instantiate, Pty } from "jsr:@sigma/pty-ffi@0.42.0/noinit";

const libraryPath = Deno.env.get("UNIPTY_PROBE_LIB_PATH");
if (!libraryPath) throw new Error("missing UNIPTY_PROBE_LIB_PATH");
await instantiate(libraryPath);

const pty = new Pty("/bin/sh", {
  args: ["-c", "printf deno-ffi-bundle-ok"],
  size: { cols: 80, rows: 24 },
});
const chunks = [];
const deadline = Date.now() + 5000;
while (Date.now() < deadline) {
  const result = pty.readBytes();
  if (result.data.byteLength > 0) chunks.push(result.data);
  if (result.done) break;
  await new Promise((resolve) => setTimeout(resolve, 10));
}
const output = new TextDecoder().decode(
  Uint8Array.from(chunks.flatMap((chunk) => [...chunk])),
);
const exitCode = pty.exitCode;
pty.close();
console.log(JSON.stringify({ exitCode, output }));
Deno.exit(exitCode === 0 ? 0 : 1);
`,
  );

  const denoOutRoot = join(fixtureRoot, "dist-deno");
  console.error("probe: building Deno FFI bundle");
  await runCommand([
    "deno",
    "bundle",
    "--code-splitting",
    "--no-lock",
    "--outdir",
    denoOutRoot,
    "deno-ffi-entry.ts",
  ]);
  const denoBundleRun = await runCommandResult(
    [
      "deno",
      "run",
      "--allow-env=UNIPTY_PROBE_LIB_PATH",
      `--allow-read=${sigmaAssetPath}`,
      "--allow-ffi",
      join(denoOutRoot, "deno-ffi-entry.js"),
    ],
    {
      env: {
        ...process.env,
        UNIPTY_PROBE_LIB_PATH: sigmaAssetPath,
      },
    },
  );
  assertPtyOutput(denoBundleRun, "deno-ffi-bundle-ok");
  console.error("probe: Deno FFI bundle complete");

  console.log(
    JSON.stringify(
      {
        denoFfi: {
          bundledJavaScriptRanWithExplicitLibraryPath: true,
          libraryAssetName: sigmaAssetName,
          npmPackageNativeJsrSpecifierRejected: true,
        },
        nodePty: nodePtyObservations,
        versions: {
          bun: Bun.version,
          deno: (await runCommand(["deno", "--version"])).stdout.split("\n")[0],
          esbuild: (
            await runCommand([join(fixtureRoot, "node_modules", ".bin", "esbuild"), "--version"])
          ).stdout.trim(),
          node: (await runCommand(["node", "--version"])).stdout.trim(),
          nodePty: "1.1.0",
          sigmaPtyFfi: "0.42.0",
        },
      },
      null,
      2,
    ),
  );
} finally {
  await rm(fixtureRoot, { recursive: true });
}
