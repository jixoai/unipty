import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockBackend } from "./support/mock-backend.ts";
import { expectSyncCode } from "./support/helpers.ts";

/**
 * Geometry resolution probes the Core host through `globalThis.process`.
 * Tests either keep the real `process.env` reference (exercising real
 * COLUMNS/LINES set/delete) while forcing a non-TTY stdout, or install a
 * fully synthetic host for TTY probes. Both variants are deterministic.
 */
interface HostStub {
  readonly env?: Record<string, string | undefined>;
  readonly stdout?: { readonly isTTY?: boolean; readonly columns?: number; readonly rows?: number };
}

function stubHost(host: HostStub): void {
  vi.stubGlobal("process", { env: host.env ?? {}, stdout: host.stdout });
}

function spawnLaunch(backend: MockBackend, terminal?: { cols?: number; rows?: number }) {
  backend.createUniPty().spawn(["run"], terminal === undefined ? undefined : { terminal });
  return backend.spawnCalls[backend.spawnCalls.length - 1];
}

describe("initial terminal geometry", () => {
  const backend = new MockBackend();

  let savedColumns: string | undefined;
  let savedLines: string | undefined;

  beforeEach(() => {
    savedColumns = process.env.COLUMNS;
    savedLines = process.env.LINES;
    delete process.env.COLUMNS;
    delete process.env.LINES;
    backend.spawnCalls.length = 0;
  });

  afterEach(() => {
    if (savedColumns === undefined) delete process.env.COLUMNS;
    else process.env.COLUMNS = savedColumns;
    if (savedLines === undefined) delete process.env.LINES;
    else process.env.LINES = savedLines;
    vi.unstubAllGlobals();
  });

  describe("explicit terminal option", () => {
    beforeEach(() => {
      stubHost({ env: process.env, stdout: { isTTY: false } });
    });

    it("passes valid explicit cols/rows to the backend launch", () => {
      const launch = spawnLaunch(backend, { cols: 111, rows: 55 });
      expect(launch?.cols).toBe(111);
      expect(launch?.rows).toBe(55);
    });

    it("rejects invalid explicit cols and never reaches the backend", () => {
      for (const cols of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
        expectSyncCode(() => spawnLaunch(backend, { cols }), "invalid-argument");
      }
      expect(backend.spawnCalls.length).toBe(0);
    });

    it("rejects invalid explicit rows and never reaches the backend", () => {
      for (const rows of [0, -1, 2.5, NaN, Infinity, -Infinity]) {
        expectSyncCode(() => spawnLaunch(backend, { rows }), "invalid-argument");
      }
      expect(backend.spawnCalls.length).toBe(0);
    });

    it("fails the whole spawn when one explicit dimension is invalid", () => {
      expectSyncCode(() => spawnLaunch(backend, { cols: 100, rows: 0 }), "invalid-argument");
      expectSyncCode(() => spawnLaunch(backend, { cols: NaN, rows: 100 }), "invalid-argument");
      expect(backend.spawnCalls.length).toBe(0);
    });

    it("resolves each omitted dimension independently to the default", () => {
      const colsOnly = spawnLaunch(backend, { cols: 111 });
      expect(colsOnly?.cols).toBe(111);
      expect(colsOnly?.rows).toBe(24);
      const rowsOnly = spawnLaunch(backend, { rows: 33 });
      expect(rowsOnly?.cols).toBe(80);
      expect(rowsOnly?.rows).toBe(33);
    });
  });

  describe("host environment COLUMNS/LINES", () => {
    beforeEach(() => {
      stubHost({ env: process.env, stdout: { isTTY: false } });
    });

    it("honors valid COLUMNS and LINES values", () => {
      process.env.COLUMNS = "100";
      process.env.LINES = "30";
      const launch = spawnLaunch(backend);
      expect(launch?.cols).toBe(100);
      expect(launch?.rows).toBe(30);
    });

    it("falls back per dimension when an environment value is invalid", () => {
      process.env.COLUMNS = "-5";
      process.env.LINES = "3.5";
      const launch = spawnLaunch(backend);
      expect(launch?.cols).toBe(80);
      expect(launch?.rows).toBe(24);
    });

    it("treats non-decimal environment values as absent", () => {
      for (const value of ["abc", "", " 40", "+40", "1e2", "0"]) {
        process.env.COLUMNS = value;
        process.env.LINES = value;
        const launch = spawnLaunch(backend);
        expect(launch?.cols).toBe(80);
        expect(launch?.rows).toBe(24);
        delete process.env.COLUMNS;
        delete process.env.LINES;
      }
    });

    it("lets an explicit dimension win over the environment while the other dimension uses it", () => {
      process.env.COLUMNS = "100";
      process.env.LINES = "50";
      const launch = spawnLaunch(backend, { cols: 77 });
      expect(launch?.cols).toBe(77);
      expect(launch?.rows).toBe(50);
    });

    it("retains a valid explicit dimension while an invalid env value falls through", () => {
      process.env.LINES = "not-a-number";
      const launch = spawnLaunch(backend, { cols: 111 });
      expect(launch?.cols).toBe(111);
      expect(launch?.rows).toBe(24);
    });

    it("does not let the child launch env alter Core geometry resolution", () => {
      const instance = backend.createUniPty();
      instance.spawn(["run"], {
        env: { COLUMNS: "40", LINES: "10" },
      });
      const launch = backend.spawnCalls[0];
      expect(launch?.cols).toBe(80);
      expect(launch?.rows).toBe(24);
      expect(launch?.env).toEqual({ COLUMNS: "40", LINES: "10" });
    });
  });

  describe("host TTY probe", () => {
    it("uses a trustworthy TTY size when environment values are absent", () => {
      stubHost({ env: {}, stdout: { isTTY: true, columns: 123, rows: 45 } });
      const launch = spawnLaunch(backend);
      expect(launch?.cols).toBe(123);
      expect(launch?.rows).toBe(45);
    });

    it("lets a valid environment value precede the TTY probe", () => {
      stubHost({ env: { COLUMNS: "50" }, stdout: { isTTY: true, columns: 123, rows: 45 } });
      const launch = spawnLaunch(backend);
      expect(launch?.cols).toBe(50);
      expect(launch?.rows).toBe(45);
    });

    it("ignores non-positive or fractional TTY values per dimension", () => {
      stubHost({ env: {}, stdout: { isTTY: true, columns: -7, rows: 45 } });
      const first = spawnLaunch(backend);
      expect(first?.cols).toBe(80);
      expect(first?.rows).toBe(45);
      backend.spawnCalls.length = 0;
      stubHost({ env: {}, stdout: { isTTY: true, columns: 10.5, rows: 45 } });
      const second = spawnLaunch(backend);
      expect(second?.cols).toBe(80);
      expect(second?.rows).toBe(45);
    });

    it("falls back to 80x24 on a non-TTY host", () => {
      stubHost({ env: {}, stdout: { isTTY: false, columns: 999, rows: 999 } });
      const launch = spawnLaunch(backend);
      expect(launch?.cols).toBe(80);
      expect(launch?.rows).toBe(24);
    });

    it("falls back to 80x24 when no TTY probe exists at all", () => {
      stubHost({ env: {} });
      const launch = spawnLaunch(backend);
      expect(launch?.cols).toBe(80);
      expect(launch?.rows).toBe(24);
    });
  });
});
