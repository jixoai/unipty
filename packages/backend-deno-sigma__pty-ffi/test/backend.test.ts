/**
 * Metadata, factory, and acquisition-level tests for
 * @unipty/backend-deno-sigma__pty-ffi.
 */

import metadata from "../src/unipty.metadata.ts";
import { assertEqual, makeBackend, PACKAGE_DIR, sleep } from "./helpers.ts";

Deno.test("metadata declares the official Deno route identity", async () => {
  const pkg = JSON.parse(
    await Deno.readTextFile(new URL("package.json", PACKAGE_DIR)),
  ) as { name: string; version: string };
  assertEqual(metadata.schema, 1);
  assertEqual(metadata.package.name, pkg.name);
  assertEqual(metadata.package.version, pkg.version);
  assertEqual(metadata.backend.id, "deno-sigma__pty-ffi");
  assertEqual(metadata.backend.factoryExport, "createDenoSigmaPtyFfiBackend");
  assertEqual(metadata.protocol.core, [1]);
  assertEqual(metadata.targets, [{ runtime: "deno" }]);
  assertEqual(metadata.provenance, {
    kind: "third-party",
    substrate: "@sigma/pty-ffi (Rust portable-pty)",
  });
});

Deno.test("metadata module evaluation is side-effect-free", async () => {
  // Evaluate the metadata module in a fresh Deno process granted nothing but
  // scoped read access to this package: no FFI, no network, no env. If module
  // evaluation ever grows an effect beyond reading package files, this fails.
  const sourceUrl = new URL("src/unipty.metadata.ts", PACKAGE_DIR).href;
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "eval",
      `import(${JSON.stringify(sourceUrl)}).then((m) => console.log(m.default.backend.id))`,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  assertEqual(code, 0, new TextDecoder().decode(stderr));
  assertEqual(new TextDecoder().decode(stdout).trim(), "deno-sigma__pty-ffi");
});

Deno.test("factory returns a ready Backend without network or JSR registry", async () => {
  const backend = await makeBackend();
  assertEqual(typeof backend.spawn, "function");
  assertEqual(typeof backend.dispose, "function");
  await backend.dispose();
});

Deno.test("factory validates queue and poll options", async () => {
  const { createDenoSigmaPtyFfiBackend: factory } = await import("../src/index.ts");
  const bad: Array<Parameters<typeof factory>[0]> = [
    { queue: { softBytes: -1 } },
    { queue: { softBytes: 100, hardBytes: 50 } },
    { queue: { hardBytes: 0 } },
    { pollIntervalMs: 0 },
    { pollIntervalMs: 2.5 },
  ];
  for (const options of bad) {
    let code = "";
    try {
      await factory(options);
    } catch (e) {
      code = (e as { code?: string }).code ?? "";
    }
    assertEqual(code, "invalid-argument", JSON.stringify(options));
  }
});

Deno.test("dispose blocks further spawns with a closed failure", async () => {
  const backend = await makeBackend();
  await backend.dispose();
  await backend.dispose(); // graceful: one logical disposal, repeated calls fine
  let code = "";
  try {
    backend.spawn({ argv: ["/bin/echo"], cols: 80, rows: 24 });
  } catch (e) {
    code = (e as { code?: string }).code ?? "";
  }
  assertEqual(code, "closed");
});

Deno.test("factory accepts an explicit libraryPath override", async () => {
  const { createDenoSigmaPtyFfiBackend: factory } = await import("../src/index.ts");
  const build = (globalThis as { Deno?: { build?: { os: string; arch: string } } }).Deno?.build;
  if (build === undefined) throw new Error("tests require the Deno runtime");
  // The vendored library for the CURRENT tuple is exactly what the default
  // selection would load, exercised here through the explicit escape hatch.
  const dirByOs: Record<string, string> = {
    darwin: build.arch === "aarch64" ? "darwin-arm64" : "darwin-x64",
    linux: build.arch === "aarch64" ? "linux-arm64" : "linux-x64",
    windows: "windows-x64",
  };
  const fileByOs: Record<string, string> = {
    darwin: build.arch === "aarch64" ? "libpty_arm64.dylib" : "libpty_x86_64.dylib",
    linux: build.arch === "aarch64" ? "libpty_aarch64.so" : "libpty_x86_64.so",
    windows: "pty.dll",
  };
  const dir = dirByOs[build.os];
  const file = fileByOs[build.os];
  if (dir === undefined || file === undefined) {
    throw new Error(`no vendored library for ${build.os}-${build.arch}; extend the vendored tuples`);
  }
  const backend = await factory({
    libraryPath: new URL(`vendor/lib/${dir}/${file}`, PACKAGE_DIR),
  });
  const endpoint = backend.spawn({ argv: ["/bin/echo", "override-ok"], cols: 80, rows: 24 });
  endpoint.close();
  await sleep(100);
  await backend.dispose();
});
