/**
 * Vendored-output tests: the npm artifact must be self-contained. The vendored
 * JavaScript closure carries no JSR-registry specifier, the vendored libraries
 * match the manifest pins, and the same holds for the built dist when present.
 */

import { assertEqual, PACKAGE_DIR } from "./helpers.ts";

async function* walk(root: string): AsyncGenerator<string> {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of Deno.readDirSync(current)) {
      const child = `${current}/${entry.name}`;
      if (entry.isDirectory) stack.push(child);
      else if (entry.isFile) yield child;
    }
  }
}

Deno.test("vendored JS closure contains no jsr: specifier", async () => {
  const root = new URL("vendor/js", PACKAGE_DIR).pathname;
  const offenders: string[] = [];
  for await (const file of walk(root)) {
    if (!/\.(ts|js|json)$/.test(file)) continue;
    const text = await Deno.readTextFile(file);
    if (/jsr:/.test(text)) offenders.push(file);
  }
  assertEqual(offenders, []);
});

Deno.test("vendored output matches the vendor manifest", async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(new URL("vendor/vendor-manifest.json", PACKAGE_DIR)),
  ) as {
    substrate: { version: string };
    js: { count: number; files: { path: string; bytes: number }[] };
    libs: { path: string; bytes: number; os: string; arch: string }[];
  };
  assertEqual(manifest.substrate.version, "0.42.0");
  assertEqual(manifest.js.count, manifest.js.files.length);
  assertEqual(manifest.libs.length, 5);
  const tuples = manifest.libs.map((lib) => `${lib.os}-${lib.arch}`).sort();
  assertEqual(tuples, ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "windows-x64"]);
  for (const entry of [...manifest.js.files, ...manifest.libs]) {
    const stat = await Deno.stat(new URL(entry.path, PACKAGE_DIR));
    assertEqual(stat.size, entry.bytes, entry.path);
  }
});

Deno.test("built dist (when present) contains no jsr: specifier", async () => {
  const root = new URL("dist", PACKAGE_DIR).pathname;
  let present = true;
  try {
    await Deno.stat(root);
  } catch {
    present = false;
  }
  if (!present) return; // dist is produced by `build`; not required for `test`
  const offenders: string[] = [];
  for await (const file of walk(root)) {
    if (!/\.(ts|js|json)$/.test(file)) continue;
    const text = await Deno.readTextFile(file);
    if (/jsr:/.test(text)) offenders.push(file);
  }
  assertEqual(offenders, []);
});
