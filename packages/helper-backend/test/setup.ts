/**
> Orthogonal intents (2026-08-20): helper test environment — a fixture
 * consumer whose `node_modules` links both the acquisition package and the
 * shared fixture Backends, so generated modules resolve exactly as they
 * would in a bundled consumer project.
 */

import { mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const testRoot = fileURLToPath(new URL(".", import.meta.url));
const consumerRoot = join(testRoot, "fixtures", "consumer");
const backendFixturesRoot = join(
  testRoot,
  "..",
  "..",
  "backend",
  "test",
  "fixtures",
  "backends",
);
const backendPackageRoot = join(testRoot, "..", "..", "backend");

export const CONSUMER_ROOT = consumerRoot;

/**
 * (Re)create the consumer's `node_modules`: every fixture Backend from the
 * acquisition package's fixture set, plus `@unipty/backend` itself so
 * generated manifest modules can evaluate against the built package.
 */
export function linkConsumerNodeModules(): void {
  const nodeModulesDir = join(consumerRoot, "node_modules");
  rmSync(nodeModulesDir, { recursive: true, force: true });

  const fixtureScope = join(nodeModulesDir, "@fixture");
  mkdirSync(fixtureScope, { recursive: true });
  for (const entry of readdirSync(backendFixturesRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      symlinkSync(
        join(backendFixturesRoot, entry.name),
        join(fixtureScope, entry.name),
        "dir",
      );
    }
  }

  const acquisitionScope = join(nodeModulesDir, "@unipty");
  mkdirSync(acquisitionScope, { recursive: true });
  symlinkSync(backendPackageRoot, join(acquisitionScope, "backend"), "dir");
}
