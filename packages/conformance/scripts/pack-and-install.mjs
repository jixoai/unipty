/**
> Orthogonal intents (2026-08-20): pack the publishable workspace packages
> and install them into an isolated consumer directory (task 6.1).
 *
 * The installed-public-package law: conformance must judge the packages a
 * consumer installs, never workspace source. This script packs unipty,
 * @unipty/backend, and the requested official Backend route into tarballs,
 * then installs them (plus the conformance suite's own runner dependencies)
 * into .conformance-install/ so run-installed-profile.mjs can execute the
 * profile with the consumer's node_modules resolution root.
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const route = process.argv[2];
const routes = {
  "node-pty": "@unipty/backend-node-pty",
  bun: "@unipty/backend-bun",
  "deno-sigma__pty-ffi": "@unipty/backend-deno-sigma__pty-ffi",
};
if (!(route in routes)) {
  console.error(`usage: node pack-and-install.mjs <node-pty|bun|deno-sigma__pty-ffi>`);
  process.exit(1);
}
const backendPackage = routes[route];

const repoRoot = resolve(new URL("../../../", import.meta.url).pathname);
const installDir = join(repoRoot, ".conformance-install");

function run(command, args, cwd = repoRoot) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

rmSync(installDir, { recursive: true, force: true });
mkdirSync(installDir, { recursive: true });

// 1. Pack every publishable package the route needs into the consumer dir.
const packTargets = ["unipty", "@unipty/backend", backendPackage];
const tarballs = {};
for (const name of packTargets) {
  const out = execFileSync(
    "corepack",
    ["pnpm", "--filter", name, "pack", "--pack-destination", installDir],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();
  // `pnpm pack --pack-destination` prints the tarball's absolute path; the
  // absolute file: specifier keeps the consumer pinned to that exact
  // artifact regardless of installer cwd normalization.
  const tarball = out.split("\n").pop();
  tarballs[name] = `file:${tarball}`;
}

// 2. Consumer manifest pinned to the exact packed artifacts.
const consumerManifest = {
  name: "unipty-conformance-consumer",
  private: true,
  type: "module",
  // The suite reads its own version for report identity; mirror the suite
  // package so reports from the installed consumer are well-formed.
  version: JSON.parse(readFileSync(join(repoRoot, "packages/conformance/package.json"), "utf8"))
    .version,
  dependencies: tarballs,
  pnpm: {
    // The packed artifacts still reference their workspace siblings by
    // version; overrides force every nested resolution onto the exact
    // local tarballs so nothing is fetched from the registry.
    overrides: tarballs,
  },
};
writeFileSync(join(installDir, "package.json"), JSON.stringify(consumerManifest, null, 2) + "\n");

// 3. Install from the tarballs only (no registry resolution of the workspace).
// --ignore-workspace keeps the consumer out of the repository workspace:
// the installed tree must contain only the packed tarballs.
run("corepack", ["pnpm", "install", "--ignore-workspace", "--no-frozen-lockfile"], installDir);

// 4. The suite's own runner sources are copied into the consumer so its
// relative imports work while package resolution roots at the consumer's
// node_modules (the packages under test are the installed tarballs).
cpSync(join(repoRoot, "packages/conformance/src"), join(installDir, "src"), {
  recursive: true,
});
cpSync(join(repoRoot, "packages/conformance/runners"), join(installDir, "runners"), {
  recursive: true,
});
console.log(`[pack-and-install] ${backendPackage} + deps installed into ${installDir}`);
