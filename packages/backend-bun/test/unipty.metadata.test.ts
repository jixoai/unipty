/**
> Orthogonal intents (2026-08-20): @unipty/backend-bun metadata conformance —
> shape, package identity, and side-effect-free evaluation.
 */

import { describe, expect, test } from "bun:test";
import pkg from "../package.json";
import metadata from "../src/unipty.metadata.ts";

describe("@unipty/backend-bun metadata", () => {
  test(
    "default-exports schema-1 metadata with the declared Backend identity",
    () => {
      expect(metadata.schema).toBe(1);
      expect(metadata.package).toEqual({ name: pkg.name, version: pkg.version });
      expect(metadata.package.name).toBe("@unipty/backend-bun");
      expect(metadata.backend).toEqual({ id: "bun", factoryExport: "createBunBackend" });
      expect(metadata.protocol.core).toEqual([1]);
      expect(metadata.targets).toEqual([{ runtime: "bun" }]);
      expect(metadata.provenance).toEqual({ kind: "runtime-native", substrate: "Bun.Terminal" });
    },
    5_000,
  );

  test(
    "declares only identity/protocol/targets/provenance fields",
    () => {
      // Metadata must carry no maturity, capability, verification, asset, or
      // official-identity claim.
      const keys = Object.keys(metadata).sort();
      expect(keys).toEqual(["backend", "package", "protocol", "provenance", "schema", "targets"]);
    },
    5_000,
  );

  test(
    "evaluation is side-effect-free: it needs no Bun.Terminal substrate",
    async () => {
      const bunGlobal = (globalThis as { Bun?: { Terminal?: unknown; version?: unknown } }).Bun;
      expect(bunGlobal).toBeDefined();
      const savedTerminal = bunGlobal?.Terminal;
      const bunRecord = bunGlobal as {
        Terminal?: unknown;
        version?: unknown;
      };
      // Stub the substrate away: metadata evaluation must still succeed and
      // must not construct a terminal (a construction would throw here).
      let constructed = 0;
      bunRecord.Terminal = function throwIfConstructed(): never {
        constructed += 1;
        throw new Error("metadata must not construct Bun.Terminal");
      };
      try {
        const module = await import(`../src/unipty.metadata.ts?side-effect-probe-${Date.now()}`);
        expect(module.default.backend.id).toBe("bun");
        expect(constructed).toBe(0);
      } finally {
        bunRecord.Terminal = savedTerminal;
      }
    },
    10_000,
  );

  test(
    "the entry module is side-effect-free too: import constructs nothing",
    async () => {
      const bunGlobal = (globalThis as { Bun?: { Terminal?: unknown } }).Bun;
      const savedTerminal = bunGlobal?.Terminal;
      const bunRecord = bunGlobal as { Terminal?: unknown };
      bunRecord.Terminal = function throwIfConstructed(): never {
        throw new Error("entry import must not construct Bun.Terminal");
      };
      try {
        const module = await import(`../src/index.ts?entry-side-effect-probe-${Date.now()}`);
        expect(typeof module.createBunBackend).toBe("function");
      } finally {
        bunRecord.Terminal = savedTerminal;
      }
    },
    10_000,
  );
});
