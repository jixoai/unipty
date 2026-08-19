/**
> Metadata Protocol tests: shape validity, package identity, and
> side-effect freedom (no native addon load, no pty creation).
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import metadata from "../src/unipty.metadata.ts";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string;
  version: string;
};

describe("unipty.metadata default export", () => {
  it("has the schema-1 minimum shape", () => {
    expect(metadata.schema).toBe(1);
    expect(metadata.backend).toEqual({ id: "node-pty", factoryExport: "createNodePtyBackend" });
    expect(metadata.protocol.core).toEqual([1]);
    expect(metadata.targets).toEqual([{ runtime: "node" }]);
  });

  it("identifies as third-party node-pty, never a native Node runtime API", () => {
    expect(metadata.provenance?.kind).toBe("third-party");
    expect(metadata.provenance?.substrate).toContain("node-pty");
    expect(metadata.provenance?.substrate).toContain("@lydell/node-pty");
    expect(metadata.backend.id).toBe("node-pty");
  });

  it("matches this package's identity via #package.json", () => {
    expect(metadata.package).toEqual({ name: pkg.name, version: pkg.version });
  });

  it("exposes only the default export (no factory leakage)", () => {
    // The in-process module namespace was statically imported above; assert
    // the built artifact's namespace shape in the side-effect canary below.
    expect(metadata).toHaveProperty("schema");
  });
});

describe("metadata side-effect freedom (built artifact)", () => {
  it("imports without loading a native addon or creating any pty", () => {
    // Fresh node process: count process.dlopen calls (every .node addon load
    // funnels through it) and check for live TTY resources while importing
    // ONLY the built metadata module. dist/ is produced by the build step
    // that precedes tests in the package verification flow.
    const metadataUrl = new URL("../dist/unipty.metadata.js", import.meta.url).href;
    const script = `
      const state = { dlopen: 0 };
      const original = process.dlopen;
      process.dlopen = function (...args) {
        state.dlopen += 1;
        return original.apply(process, args);
      };
      const mod = await import(${JSON.stringify(metadataUrl)});
      const ptyResources = process.getActiveResourcesInfo().filter((name) => name.includes("TTY"));
      process.stdout.write(JSON.stringify({
        dlopen: state.dlopen,
        ptyResources,
        exportNames: Object.keys(mod).sort(),
        backend: mod.default?.backend,
      }));
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      timeout: 20_000,
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      dlopen: number;
      ptyResources: string[];
      exportNames: string[];
      backend: { id: string; factoryExport: string };
    };
    expect(report.dlopen).toBe(0);
    expect(report.ptyResources).toEqual([]);
    expect(report.exportNames).toEqual(["default"]);
    expect(report.backend).toEqual({ id: "node-pty", factoryExport: "createNodePtyBackend" });
  });
});
