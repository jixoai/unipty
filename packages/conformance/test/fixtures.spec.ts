/**
 * Deterministic child fixture tests (task 1.5): fixtures run deterministically
 * OUTSIDE a PTY and report their expected markers under the current runtime.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildFloodExpected,
  childArgv,
  detectCurrentRuntime,
  FLOOD_TAIL,
  MARKER_TEXT,
  UTF8_SPLIT_TAIL,
  UTF8_SPLIT_TEXT,
} from "../src/fixtures/fixtures.ts";
import { runFixtureToCompletion, startFixture } from "./support/child-runner.ts";

describe("fixture registry", () => {
  it("maps every fixture name to an existing file", () => {
    for (const argv of [
      childArgv("marker"),
      childArgv("echo-stream"),
      childArgv("report-size"),
      childArgv("exit-code"),
      childArgv("sleep-forever"),
      childArgv("utf8-split"),
      childArgv("flood"),
      childArgv("args-echo"),
    ]) {
      expect(argv.length).toBeGreaterThanOrEqual(2);
      expect(existsSync(argv[argv.length - 1] as string)).toBe(true);
    }
  });

  it("appends user args after the fixture file", () => {
    const argv = childArgv("exit-code", ["7"]);
    expect(argv.slice(-2)).toEqual([
      fileURLToPath(new URL("../src/fixtures/exit-code.mjs", import.meta.url)),
      "7",
    ]);
  });

  it("detects the current runtime with a version and exec path", () => {
    const runtime = detectCurrentRuntime();
    expect(["node", "bun", "deno"]).toContain(runtime.name);
    expect(runtime.version).toMatch(/^\d+\.\d+/);
    expect(runtime.execPath.length).toBeGreaterThan(0);
  });
});

describe("fixtures run deterministically outside a PTY", () => {
  it("marker writes fixed markers and exits 0", async () => {
    const result = await runFixtureToCompletion("marker");
    expect(result.stdout).toBe(MARKER_TEXT);
    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
  });

  it("args-echo round-trips argv values verbatim", async () => {
    const args = ["a; b", "$HOME", "|pipe", "quote's", "  spaced  "];
    const result = await runFixtureToCompletion("args-echo", args);
    expect(result.stdout).toBe(args.map((arg) => `${arg}\n`).join(""));
    expect(result.exitCode).toBe(0);
  });

  it("exit-code exits with the requested code", async () => {
    expect((await runFixtureToCompletion("exit-code", ["7"])).exitCode).toBe(7);
    expect((await runFixtureToCompletion("exit-code")).exitCode).toBe(0);
  });

  it("utf8-split reconstructs its multibyte text exactly and exits 0", async () => {
    const result = await runFixtureToCompletion("utf8-split", [], { timeoutMs: 30000 });
    expect(result.stdout).toBe(UTF8_SPLIT_TEXT + UTF8_SPLIT_TAIL);
    expect(result.exitCode).toBe(0);
  });

  it("flood writes its full pattern then FLOOD-DONE", async () => {
    const result = await runFixtureToCompletion("flood", [], { timeoutMs: 60000 });
    const expected = buildFloodExpected() + FLOOD_TAIL;
    expect(result.stdout.length).toBe(expected.length);
    expect(result.stdout).toBe(expected);
    expect(result.exitCode).toBe(0);
  }, 90000);

  it("report-size reports its geometry view (env fallback outside a PTY)", async () => {
    const child = startFixture("report-size", [], { env: { COLUMNS: "33", LINES: "12" } });
    try {
      const out = await child.readUntil((text) => text.includes("SIZE 33 12\n"), 5000);
      expect(out.startsWith("SIZE 33 12\n")).toBe(true);
    } finally {
      child.kill();
    }
  });

  it("echo-stream echoes input and stays alive", async () => {
    const child = startFixture("echo-stream");
    try {
      child.write("ping\n");
      await child.readUntil((text) => text.includes("ping\n"), 5000);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(child.child.exitCode).toBeNull();
      expect(child.child.killed).toBe(false);
    } finally {
      child.kill();
    }
  });

  it("sleep-forever stays alive without output", async () => {
    const child = startFixture("sleep-forever");
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(child.child.exitCode).toBeNull();
    } finally {
      child.kill();
    }
  });
});
