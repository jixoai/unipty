/**
> Orthogonal intents (2026-08-20): acquisition test environment — links the
 * fixture Backend packages into each fixture consumer's `node_modules` so
 * runtime-native resolution behaves like a real installation, and exposes
 * the fixture import registry used to prove effect-free stages.
 */

import { mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesRoot = fileURLToPath(new URL("./fixtures", import.meta.url));
const backendsRoot = join(fixturesRoot, "backends");
const consumersRoot = join(fixturesRoot, "consumers");

/** Global registry each fixture entry module pushes its package name onto. */
const FIXTURE_IMPORTS = "__uniptyFixtureImports";

/** Directory of one fixture Backend package. */
export function backendFixtureDir(dir: string): string {
  return join(backendsRoot, dir);
}

/** Directory of one fixture consumer project. */
export function consumerFixtureDir(consumer: string): string {
  return join(consumersRoot, consumer);
}

/** Names of fixture entry modules evaluated in this test context, in order. */
export function fixtureImports(): readonly string[] {
  const registry = (globalThis as Record<string, unknown>)[FIXTURE_IMPORTS];
  return Array.isArray(registry) ? [...(registry as string[])] : [];
}

/** Reset the fixture import registry. */
export function resetFixtureImports(): void {
  (globalThis as Record<string, unknown>)[FIXTURE_IMPORTS] = [];
}

/**
 * (Re)create `<consumer>/node_modules/@fixture/<name>` symlinks for every
 * fixture Backend package, so every consumer can resolve every fixture via
 * the runtime-native resolver. Invoked once per test run from global setup,
 * before any worker starts.
 */
export function linkFixtureBackends(): void {
  const backendDirs = readdirSync(backendsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const consumerDirs = readdirSync(consumersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const consumer of consumerDirs) {
    const nodeModulesDir = join(consumersRoot, consumer, "node_modules");
    rmSync(nodeModulesDir, { recursive: true, force: true });
    const scopeDir = join(nodeModulesDir, "@fixture");
    mkdirSync(scopeDir, { recursive: true });
    for (const backend of backendDirs) {
      symlinkSync(join(backendsRoot, backend), join(scopeDir, backend), "dir");
    }
  }
}
