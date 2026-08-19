/**
> Orthogonal intents (2026-08-20): workspace dependency-graph ownership rules.
>
> Original request: task 1.1 — "add package ownership and no-cross-dependency
> checks". Verifies the package topology fixed in the v1 design: Core has no
> Backend dependency, acquisition/helper layers stay directional, official
> Backends depend only on Core plus their substrate, and no package depends on
 * the private conformance harness or the static site.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

interface Pkg {
  name: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const packagesDir = new URL("../packages/", import.meta.url).pathname;
const entries = readdirSync(packagesDir).filter((entry) => {
  const p = join(packagesDir, entry);
  return statSync(p).isDirectory() && !entry.startsWith(".");
});

const packages = new Map<string, { dir: string; pkg: Pkg }>();
for (const entry of entries) {
  const pkgPath = join(packagesDir, entry, "package.json");
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Pkg;
    packages.set(pkg.name, { dir: entry, pkg });
  } catch {
    console.error(`[check:arch] skip ${entry}: no readable package.json`);
  }
}

const failures: string[] = [];
const rule = (condition: boolean, message: string): void => {
  if (!condition) failures.push(message);
};

const depsOf = (name: string): Set<string> => {
  const found = packages.get(name);
  if (!found) return new Set();
  return new Set([
    ...Object.keys(found.pkg.dependencies ?? {}),
    ...Object.keys(found.pkg.peerDependencies ?? {}),
  ]);
};

const core = "unipty";
const acquisition = "@unipty/backend";
const helper = "@unipty/helper-backend";
const conformance = "@unipty/conformance";
const www = "@unipty/www";

// Required packages exist.
for (const required of [
  core,
  acquisition,
  helper,
  "@unipty/backend-node-pty",
  "@unipty/backend-bun",
  "@unipty/backend-deno-sigma__pty-ffi",
  conformance,
  www,
]) {
  rule(packages.has(required), `missing required package ${required}`);
}
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

// Core has no runtime dependency on any Backend or acquisition layer.
for (const dep of depsOf(core)) {
  rule(
    !dep.startsWith("@unipty/") && dep !== core,
    `${core} must not depend on ${dep}; Core owns no Backend dependency`,
  );
}

// Acquisition depends only on Core; helper only on acquisition (+ Core types).
for (const dep of depsOf(acquisition)) {
  rule(
    dep === core,
    `${acquisition} may depend only on ${core}, found ${dep}`,
  );
}
for (const dep of depsOf(helper)) {
  rule(
    dep === core || dep === acquisition,
    `${helper} may depend only on ${core} and ${acquisition}, found ${dep}`,
  );
}

// Official Backends depend on Core plus only their own substrate.
const substrateAllowlist: Record<string, Set<string>> = {
  "@unipty/backend-node-pty": new Set(["@lydell/node-pty"]),
  "@unipty/backend-bun": new Set([]),
  "@unipty/backend-deno-sigma__pty-ffi": new Set([]),
};
for (const [name, allowlist] of Object.entries(substrateAllowlist)) {
  for (const dep of depsOf(name)) {
    rule(
      dep === core || allowlist.has(dep),
      `${name} may depend only on ${core} + [${[...allowlist].join(", ")}], found ${dep}`,
    );
  }
}

// Nobody depends on the private harness or the static site.
for (const [name, { pkg }] of packages) {
  if (name === conformance || name === www) continue;
  for (const kind of ["dependencies", "peerDependencies"] as const) {
    for (const dep of Object.keys(pkg[kind] ?? {})) {
      rule(
        dep !== conformance && dep !== www,
        `${name} must not depend on private package ${dep}`,
      );
    }
  }
}

// The site never depends on a native Backend entry or the runtime layers.
for (const dep of [...depsOf(www), ...Object.keys(packages.get(www)?.pkg.devDependencies ?? {})]) {
  rule(
    !dep.startsWith("@unipty/backend-") && dep !== core && dep !== acquisition && dep !== helper,
    `${www} must not depend on runtime package ${dep}; it consumes only release artifacts`,
  );
}

if (failures.length > 0) {
  console.error(`[check:arch] FAILED\n${failures.map((f) => `- ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `[check:arch] OK: ${packages.size} packages, Core/acquisition/helper/backend ownership rules hold`,
);
